"""Cache directed station/bar walking costs, not station-pair itineraries."""
import hashlib
import json
import math
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'work/routing'
BASE = 'https://routing.openstreetmap.de/routed-foot'
bars = json.loads((ROOT / 'work/bars.json').read_text(encoding='utf-8'))
stations = json.loads((ROOT / 'work/metro-stations.json').read_text(encoding='utf-8'))['stations']
last_request = 0.0
requests = 0


def table(points, sources, destinations):
    global last_request, requests
    coords = ';'.join(f"{p['lon']:.7f},{p['lat']:.7f}" for p in points)
    options = urllib.parse.urlencode({'sources': ';'.join(map(str, sources)),
                                     'destinations': ';'.join(map(str, destinations)),
                                     'annotations': 'distance', 'generate_hints': 'false'})
    url = f'{BASE}/table/v1/foot/{coords}?{options}'
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    path = CACHE / ('metro-walking-' + key + '.json')
    if path.exists():
        return json.loads(path.read_text(encoding='utf-8'))
    time.sleep(max(0, 1.1 - (time.monotonic() - last_request)))
    request = urllib.request.Request(url, headers={'User-Agent': 'DC-Speakeasies-Map/0.1 (local distance preparation)', 'Accept': 'application/json'})
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            data = json.load(response)
    finally:
        last_request = time.monotonic()
    requests += 1
    if data.get('code') != 'Ok':
        raise ValueError(data.get('message', data.get('code')))
    for row in data['distances']:
        assert all(d is None or (math.isfinite(d) and d >= 0) for d in row)
    path.write_text(json.dumps(data), encoding='utf-8')
    print(f'Cached walking table {requests}: {len(sources)} x {len(destinations)}', flush=True)
    return data


if __name__ == '__main__':
    CACHE.mkdir(exist_ok=True)
    to_bars, from_bars, snaps = [], [[] for _ in bars], []
    for offset in range(0, len(stations), 40):
        batch = stations[offset:offset + 40]
        points = bars + batch
        bi, si = list(range(len(bars))), list(range(len(bars), len(points)))
        inbound = table(points, si, bi)
        outbound = table(points, bi, si)
        to_bars.extend(inbound['distances'])
        for row, extra in zip(from_bars, outbound['distances']):
            row.extend(extra)
        snaps.extend({'station_id': station['id'], 'distance_m': waypoint['distance'],
                      'location': waypoint['location']}
                     for station, waypoint in zip(batch, inbound['sources']))
    assert len(to_bars) == 98 and all(len(row) == len(bars) for row in to_bars)
    assert all(len(row) == 98 for row in from_bars)
    result = {'provider': 'FOSSGIS OSRM foot', 'provider_url': 'https://map.project-osrm.org/about.html',
              'retrieved_at': datetime.now(timezone.utc).isoformat(),
              'bar_ids': [b['id'] for b in bars], 'station_ids': [s['id'] for s in stations],
              'to_bars': to_bars, 'from_bars': from_bars, 'station_snaps': snaps,
              'note': 'Directed walking-engine distances between approximate station centers and bar pins. Null means unavailable. No itineraries are stored.'}
    (ROOT / 'work/metro-walking.json').write_text(json.dumps(result), encoding='utf-8', newline='\n')
    print(f'Wrote {len(stations)} x {len(bars)} costs each direction; {requests} new requests; max station snap {max(s["distance_m"] for s in snaps):.1f}m')
