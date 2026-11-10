"""Snapshot official DC GIS station points and WMATA's current line assignments."""
import concurrent.futures
import json
import re
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from html.parser import HTMLParser

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/Transportation_Rail_Bus_WebMercator/MapServer/51'
LINE_ORDER = ['red', 'orange', 'silver', 'blue', 'yellow', 'green']
OFFICIAL_LINKS = {}


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.url = None
        self.text = []
        self.links = []

    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.url = dict(attrs).get('href')
            self.text = []

    def handle_data(self, text):
        if self.url:
            self.text.append(text)

    def handle_endtag(self, tag):
        if tag == 'a' and self.url:
            self.links.append((''.join(self.text).strip(), self.url))
            self.url = None


def normalized(name):
    name = re.sub(r'\b(road|square|heights|street|east|west|place)\b',
        lambda m: {'road': 'rd', 'square': 'sq', 'heights': 'hts', 'street': 'st', 'east': 'e', 'west': 'w', 'place': 'pl'}[m[0]], name.lower())
    return re.sub('[^a-z0-9]', '', name)


def current_station_links():
    cache = ROOT / 'work/.local-metro-links.json'
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    parser = Links()
    parser.feed(fetch('https://www.wmata.com/ridertools/lines')[0])
    line_urls = sorted({urllib.parse.urljoin('https://www.wmata.com', url) for _, url in parser.links if '/ridertools/line/' in url and 'WMATA_RAIL' in url})
    assert len(line_urls) == 6, line_urls
    links = {}
    for url in line_urls:
        parser = Links()
        parser.feed(fetch(url)[0])
        for name, href in parser.links:
            if '/ridertools/station/' in href:
                links[normalized(name)] = urllib.parse.urljoin('https://www.wmata.com', href)
    cache.write_text(json.dumps(links), encoding='utf-8', newline='\n')
    return links


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'DC-Speakeasies-Metro-Layer/1.0'})
    with urllib.request.urlopen(request, timeout=40) as response:
        return response.read().decode('utf-8'), response.url


def station_info(html):
    chunks = []
    for script in re.findall(r'<script[^>]*>(.*?)</script>', html, re.S):
        script = script.strip().rstrip(';')
        if script.startswith('self.__next_f.push('):
            try:
                value = json.loads(script[len('self.__next_f.push('):-1])
                if len(value) > 1 and isinstance(value[1], str):
                    chunks.append(value[1])
            except ValueError:
                continue
    payload = ''.join(chunks)
    needle = '"stationInfo":'
    start = payload.find(needle)
    if start < 0:
        raise ValueError('WMATA station details missing')
    info, _ = json.JSONDecoder().raw_decode(payload[start + len(needle):])
    return info


def prepare(feature):
    props = feature['properties']
    key = normalized(props['NAME'])
    matches = [url for name, url in OFFICIAL_LINKS.items() if name == key or key.startswith(name) or name.startswith(key)]
    html, url = fetch(matches[0] if len(matches) == 1 else props['WEB_URL'])
    info = station_info(html)
    lines = {route['longName'].lower(): route for route in info['allRoutes']}
    assert lines and set(lines).issubset(LINE_ORDER), (props['NAME'], list(lines))
    lon, lat = feature['geometry']['coordinates']
    assert abs(lat - info['lat']) < .02 and abs(lon - info['lon']) < .02, props['NAME']
    return {
        'id': props['GIS_ID'], 'name': props['NAME'], 'address': props['ADDRESS'].strip(),
        'lat': lat, 'lon': lon, 'lines': [line for line in LINE_ORDER if line in lines],
        'url': url, 'wmata_name': info['name'],
        'colors': {line: '#' + lines[line]['color'] for line in lines},
        'gis_lines': [line.strip() for line in props['LINE'].split(',')],
    }


def checked_prepare(feature):
    try:
        return prepare(feature)
    except Exception as error:
        return {'error': str(error), 'name': feature['properties']['NAME'], 'url': feature['properties']['WEB_URL']}


if __name__ == '__main__':
    OFFICIAL_LINKS = current_station_links()
    source_file = ROOT / 'work/metro-stations-source.json'
    if not source_file.exists():
        query = urllib.parse.urlencode({'where': '1=1', 'outFields': 'NAME,ADDRESS,LINE,WEB_URL,GIS_ID', 'outSR': '4326', 'f': 'geojson'})
        raw, _ = fetch(SOURCE + '/query?' + query)
        source_file.write_text(raw, encoding='utf-8', newline='\n')
    source = json.loads(source_file.read_text(encoding='utf-8'))
    cache_file = ROOT / 'work/.local-metro-cache.json'
    cache = json.loads(cache_file.read_text(encoding='utf-8')) if cache_file.exists() else {}
    stations = list(cache.values())
    pending = [f for f in source['features'] if f['properties']['GIS_ID'] not in cache]
    errors = []
    # Two concurrent public page requests keep the one-time refresh modest.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for station in pool.map(checked_prepare, pending):
            if 'error' in station:
                errors.append(station)
                continue
            stations.append(station)
            cache[station['id']] = station
            cache_file.write_text(json.dumps(cache, ensure_ascii=False), encoding='utf-8', newline='\n')
            if len(stations) % 20 == 0:
                print(f'Checked {len(stations)} / {len(source["features"])} stations against WMATA.', flush=True)
    if errors:
        raise SystemExit(json.dumps({'verified': len(stations), 'unresolved': errors}))
    palette = {}
    for station in stations:
        for line, color in station.pop('colors').items():
            assert line not in palette or palette[line] == color, (line, color)
            palette[line] = color
    assert set(palette) == set(LINE_ORDER)
    corrections = [{'name': s['name'], 'gis_lines': s['gis_lines'], 'current_lines': s['lines']} for s in stations if set(s['gis_lines']) != set(s['lines'])]
    for station in stations:
        del station['gis_lines']
    result = {'source': SOURCE, 'line_source': 'WMATA Rider Tools station pages',
        'retrieved_at': datetime.now(timezone.utc).isoformat(),
        'lines': [{'id': line, 'name': line.title(), 'color': palette[line]} for line in LINE_ORDER],
        'stations': sorted(stations, key=lambda s: s['name']), 'line_corrections': corrections}
    (ROOT / 'work/metro-stations.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8', newline='\n')
    print(json.dumps({'stations': len(stations), 'colors': palette, 'updated_line_assignments': corrections}), flush=True)
