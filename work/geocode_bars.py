import concurrent.futures
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'outputs/dc-speakeasies.md'

def plain(value):
    value = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', value)
    return value.replace('**', '').replace('*', '').strip()

rows = []
for line in SOURCE.read_text(encoding='utf-8').splitlines():
    if not line.startswith('| ['):
        continue
    cells = [cell.strip() for cell in line.strip('|').split('|')]
    if len(cells) != 6:
        raise ValueError(line)
    match = re.match(r'\[([^\]]+)\]\(([^)]+)\)', cells[0])
    name, website = match.groups()
    address = re.search(r'\*\*([^*]+)\*\*', cells[5]).group(1)
    query_address = address if 'Alexandria' in address else address + ', Washington, DC'
    score = int(re.search(r'\*\*(\d+)', cells[1]).group(1))
    rating_match = re.search(r'\*\*([\d.]+)', cells[3])
    rows.append(dict(id=len(rows)+1, name=name, website=website, neighborhood=plain(cells[0][match.end():]).strip(' ·'),
                     secrecy=score, entry=plain(re.sub(r'^\*\*\d+\*\*\s*—\s*', '', cells[1])),
                     popularity=plain(cells[2]), rating=float(rating_match.group(1)), rating_text=plain(cells[3]),
                     rating_source=re.search(r'\]\(([^)]+)\)', cells[3]).group(1),
                     description=plain(cells[4]), address=plain(cells[5]), geocode_address=query_address))
assert len(rows) == 16

def geocode(bar):
    endpoint = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'
    url = endpoint + urllib.parse.urlencode(dict(address=bar['geocode_address'], benchmark='Public_AR_Current', format='json'))
    request = urllib.request.Request(url, headers={'User-Agent':'DC-Speakeasy-Map/1.0'})
    with urllib.request.urlopen(request, timeout=45) as response:
        result = json.load(response)
    matches = result['result']['addressMatches']
    if not matches:
        raise ValueError('No match for ' + bar['geocode_address'])
    match = matches[0]
    bar.update(lat=match['coordinates']['y'], lon=match['coordinates']['x'], matched_address=match['matchedAddress'], geocode_source=url)
    assert 38.75 < bar['lat'] < 39.0 and -77.2 < bar['lon'] < -76.9
    return bar

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    bars = list(pool.map(geocode, rows))
(ROOT / 'work/bars.json').write_text(json.dumps(bars, ensure_ascii=False, indent=2), encoding='utf-8')
for bar in bars:
    print(bar['name'], bar['lat'], bar['lon'], bar['matched_address'])

for filename in ['leaflet.js', 'leaflet.css']:
    url = 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/' + filename
    with urllib.request.urlopen(url, timeout=30) as response:
        (ROOT / 'work' / filename).write_bytes(response.read())
