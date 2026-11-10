"""Snapshot the current rail shapes used by WMATA Rider Tools."""
import concurrent.futures
import json
import re
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from prepare_metro import Links, fetch

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.wmata.com/ridertools/lines'


def payload_from(html):
    chunks = []
    for script in re.findall(r'<script[^>]*>(.*?)</script>', html, re.S):
        script = script.strip().rstrip(';')
        if script.startswith('self.__next_f.push('):
            try:
                value = json.loads(script[len('self.__next_f.push('):-1])
                if len(value) > 1 and isinstance(value[1], str):
                    chunks.append(value[1])
            except ValueError:
                pass
    return ''.join(chunks)


def text_value(payload, value):
    if not value.startswith('$'):
        return value
    match = re.search(re.escape(value[1:]) + r':T([0-9a-f]+),', payload)
    assert match, value
    text = payload[match.end():match.end() + int(match[1], 16)]
    assert all(63 <= ord(c) <= 126 for c in text), value
    return text


def decode_polyline(text):
    coordinates = []
    lat = lon = index = 0
    while index < len(text):
        delta = []
        for _ in range(2):
            result = shift = 0
            while True:
                value = ord(text[index]) - 63
                index += 1
                result |= (value & 31) << shift
                shift += 5
                if value < 32:
                    break
            delta.append(~(result >> 1) if result & 1 else result >> 1)
        lat += delta[0]
        lon += delta[1]
        coordinates.append([lon / 100000, lat / 100000])
    return coordinates


def route(url):
    html, final_url = fetch(url)
    payload = payload_from(html)
    needle = '"lineInfo":'
    start = payload.find(needle)
    assert start >= 0, url
    info, _ = json.JSONDecoder().raw_decode(payload[start + len(needle):])
    details = info['lineInfo']
    paths = []
    for geometry in info['mergedPattern']['patternGeometries']:
        assert geometry['code'].split(':')[-2] == '0', geometry['code']
        coordinates = decode_polyline(text_value(payload, geometry['points']))
        assert len(coordinates) > 2
        assert all(-77.7 < x < -76.6 and 38.6 < y < 39.4 for x, y in coordinates)
        if not any(p['coordinates'] == coordinates for p in paths):
            paths.append({'pattern': geometry['code'], 'coordinates': coordinates})
    assert paths
    return {'id': details['longName'].lower(), 'name': details['longName'],
        'color': '#' + details['color'], 'url': final_url, 'paths': paths}


if __name__ == '__main__':
    links = Links()
    links.feed(fetch(SOURCE)[0])
    urls = sorted({urllib.parse.urljoin('https://www.wmata.com', url) for _, url in links.links if '/ridertools/line/' in url and 'WMATA_RAIL' in url})
    assert len(urls) == 6
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        routes = list(pool.map(route, urls))
    assert {r['id'] for r in routes} == {'red', 'orange', 'silver', 'blue', 'yellow', 'green'}
    result = {'source': SOURCE, 'retrieved_at': datetime.now(timezone.utc).isoformat(), 'routes': routes}
    (ROOT / 'work/metro-routes.json').write_text(json.dumps(result, ensure_ascii=False), encoding='utf-8', newline='\n')
    print(json.dumps([{'line': r['id'], 'paths': len(r['paths']), 'points': sum(len(p['coordinates']) for p in r['paths'])} for r in routes]))
