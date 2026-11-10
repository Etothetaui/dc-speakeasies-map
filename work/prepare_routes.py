"""Build two open walking routes from a cached OSM street-distance matrix."""
import json
import hashlib
import math
import time
import urllib.parse
import urllib.request
from array import array
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'work/routing'
CACHE.mkdir(exist_ok=True)
BARS = json.loads((ROOT / 'work/bars.json').read_text(encoding='utf-8'))
BASE = 'https://routing.openstreetmap.de/routed-foot'
LAST_REQUEST = 0.0

def fetch(name, service, indices, **options):
    global LAST_REQUEST
    path = CACHE / (name + '.json')
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    coordinates = ';'.join(f"{BARS[i]['lon']:.7f},{BARS[i]['lat']:.7f}" for i in indices)
    url = f'{BASE}/{service}/v1/foot/{coordinates}?' + urllib.parse.urlencode(options)
    time.sleep(max(0, 1.1 - (time.monotonic() - LAST_REQUEST)))
    request = urllib.request.Request(url, headers={'User-Agent': 'DC-Speakeasy-Route-Planner/1.0', 'Accept': 'application/json'})
    with urllib.request.urlopen(request, timeout=60) as response:
        result = json.load(response)
    LAST_REQUEST = time.monotonic()
    if result.get('code') != 'Ok':
        raise ValueError(result)
    path.write_text(json.dumps(result), encoding='utf-8')
    return result

def shortest_open_path(matrix, ranks=None):
    """Exact Held-Karp; free endpoints, optional ordered latitude groups."""
    n = len(matrix)
    full = (1 << n) - 1
    dp = array('d', [math.inf]) * ((full + 1) * n)
    parent = array('b', [-1]) * ((full + 1) * n)
    for j in range(n):
        if ranks is None or ranks[j] == min(ranks):
            dp[(1 << j) * n + j] = 0.0
    for mask in range(1, full + 1):
        remaining = full ^ mask
        if not remaining:
            continue
        allowed = remaining
        if ranks is not None:
            lowest = min(ranks[j] for j in range(n) if remaining & (1 << j))
            allowed = sum(1 << j for j in range(n) if remaining & (1 << j) and ranks[j] == lowest)
        endpoints = mask
        while endpoints:
            bit = endpoints & -endpoints
            i = bit.bit_length() - 1
            endpoints ^= bit
            cost = dp[mask * n + i]
            if not math.isfinite(cost):
                continue
            next_bits = allowed
            while next_bits:
                nxt = next_bits & -next_bits
                j = nxt.bit_length() - 1
                next_bits ^= nxt
                offset = (mask | nxt) * n + j
                new_cost = cost + matrix[i][j]
                if new_cost < dp[offset]:
                    dp[offset] = new_cost
                    parent[offset] = i
    end = min(range(n), key=lambda j: dp[full * n + j])
    total = dp[full * n + end]
    order = []
    mask = full
    while end >= 0:
        order.append(end)
        previous = parent[mask * n + end]
        mask ^= 1 << end
        end = previous
    order.reverse()
    assert len(order) == n and len(set(order)) == n
    assert abs(sum(matrix[a][b] for a,b in zip(order, order[1:])) - total) < 1e-6
    return order, total

def instruction(step):
    m = step['maneuver']
    kind, modifier, road = m['type'], m.get('modifier', ''), step.get('name', '')
    if kind == 'depart':
        compass = ['north','northeast','east','southeast','south','southwest','west','northwest']
        text = 'Head ' + compass[int((m.get('bearing_after',0)+22.5)//45)%8]
    elif kind == 'arrive':
        return 'Arrive at the next stop'
    elif kind in ('roundabout', 'rotary'):
        text = 'Take the roundabout'
        if m.get('exit'):
            text += ' to exit ' + str(m['exit'])
    elif kind == 'continue':
        text = ('Continue ' + modifier).strip()
    elif kind == 'new name':
        text = 'Continue'
    elif kind in ('turn', 'end of road', 'fork'):
        text = ('Turn ' + modifier).strip()
    elif kind in ('merge', 'on ramp', 'off ramp'):
        text = ('Continue ' + modifier).strip()
    else:
        text = ('Continue ' + modifier).strip()
    if road:
        text += ' onto ' + road
    return text

def reverse_if_not_longer(order, matrix):
    original = sum(matrix[a][b] for a,b in zip(order, order[1:]))
    reverse = list(reversed(order))
    reverse_cost = sum(matrix[a][b] for a,b in zip(reverse, reverse[1:]))
    return (reverse,reverse_cost) if reverse_cost <= original + 1e-7 else (order,original)

def make_route(key, title, order, distance, response):
    result = response['routes'][0]
    assert len(result['legs']) == len(order)-1
    assert abs(result['distance'] - distance) < max(5, distance * .001), (key, distance, result['distance'])
    legs = []
    for i, raw in enumerate(result['legs']):
        coordinates = []
        steps = []
        for step in raw['steps']:
            coordinates.extend(step['geometry']['coordinates'])
            if step['distance'] > 1 or step['maneuver']['type'] == 'arrive':
                steps.append({'text': instruction(step), 'distance_m': step['distance'], 'location': step['maneuver']['location']})
        legs.append({'from': BARS[order[i]]['id'], 'to': BARS[order[i+1]]['id'],
                     'distance_m': raw['distance'], 'duration_s': raw['duration'],
                     'coordinates': coordinates, 'steps': steps})
    return {'key': key, 'title': title, 'order': [BARS[i]['id'] for i in order],
            'distance_m': result['distance'], 'matrix_distance_m': distance,
            'duration_s': result['duration'], 'coordinates': result['geometry']['coordinates'], 'legs': legs}

if __name__ == '__main__':
    table = fetch('walking-matrix', 'table', range(16), annotations='distance,duration', generate_hints='false')
    matrix = table['distances']
    assert len(matrix) == 16 and all(len(row) == 16 for row in matrix)
    assert all(value is not None and math.isfinite(value) for row in matrix for value in row)
    assert max(p['distance'] for p in table['sources']) < 150
    tsp, tsp_cost = shortest_open_path(matrix)
    if BARS[tsp[0]]['lat'] < BARS[tsp[-1]]['lat']:
        tsp,tsp_cost = reverse_if_not_longer(tsp,matrix)
    # Pins within their ~1 metre latitude precision are treated as level.
    latitudes = [round(b['lat'], 5) for b in BARS]
    ranks = [sorted(set(latitudes), reverse=True).index(lat) for lat in latitudes]
    north, north_cost = shortest_open_path(matrix, ranks)
    assert all(ranks[a] <= ranks[b] for a,b in zip(north,north[1:]))
    assert tsp_cost <= north_cost + 1e-6
    routes = []
    for key,title,order,cost in [('shortest','Shortest route',tsp,tsp_cost),('north-south','North to south',north,north_cost)]:
        signature = hashlib.sha256(json.dumps(order).encode()).hexdigest()[:10]
        # Keep existing cached north-to-south directions; cache other orders separately.
        request_name = key if key=='north-south' else key+'-'+signature
        response = fetch(request_name, 'route', order, steps='true', geometries='geojson', overview='full', continue_straight='false', generate_hints='false')
        routes.append(make_route(key,title,order,cost,response))
        print(title, round(cost/1609.344,2), 'miles', ' -> '.join(BARS[i]['name'] for i in order), flush=True)
    payload = {'mode': 'walking', 'open_path': True, 'computed_at': datetime.now(timezone.utc).isoformat(),
               'provider': 'FOSSGIS OSRM walking', 'provider_url': 'https://map.project-osrm.org/about.html',
               'optimization': 'Exact Held-Karp stop order over the walking route distance matrix; free start and finish, no return leg.',
               'distance_caveat': 'Distances follow the walking engine’s preferred paths, not a guarantee of the globally shortest physical sidewalk route.',
               'latitude_tie_precision': 5, 'latitude_tie_groups': [[b['id'] for b in BARS if round(b['lat'],5)==lat] for lat in sorted(set(latitudes),reverse=True)],
               'routes': routes}
    (ROOT / 'work/routes.json').write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
    print('Wrote both routes with 15 walking legs each.', flush=True)
