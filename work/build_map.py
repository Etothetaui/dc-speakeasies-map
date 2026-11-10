import json
import re
import urllib.request
from pathlib import Path
from metro_geometry import clean_rail_path

ROOT = Path(__file__).resolve().parents[1]
version = (ROOT / 'VERSION').read_text(encoding='utf-8').strip()
assert re.fullmatch(r'\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?', version), 'Invalid project version'
assets = {
    'cluster.js': 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    'cluster.css': 'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
}
for name, url in assets.items():
    path = ROOT / 'work' / name
    if not path.exists():
        with urllib.request.urlopen(url, timeout=30) as response:
            path.write_bytes(response.read())

bars = json.loads((ROOT / 'work/bars.json').read_text(encoding='utf-8'))
for bar in bars:
    bar['jurisdiction']='DC' if ', DC,' in bar['matched_address'] else 'VA'
template = (ROOT / 'work/map-template.html').read_text(encoding='utf-8')
template = template.replace('__APP_VERSION__', version)
for placeholder, filename in [('LEAFLET_CSS','leaflet.css'),('LEAFLET_JS','leaflet.js'),('CLUSTER_CSS','cluster.css'),('CLUSTER_JS','cluster.js')]:
    template = template.replace('__' + placeholder + '__', (ROOT / 'work' / filename).read_text(encoding='utf-8'))
template = template.replace('__BAR_DATA__', json.dumps(bars, ensure_ascii=False).replace('</', '<\\/'))
routes = json.loads((ROOT / 'work/routes.json').read_text(encoding='utf-8'))
routes['scopes']={'all':{'ids':[b['id'] for b in bars],'routes':routes['routes']},'dc':json.loads((ROOT/'work/routes-dc.json').read_text(encoding='utf-8'))}
routes['walking']={'ids':[b['id'] for b in bars],'distances':json.loads((ROOT/'work/routing/walking-matrix.json').read_text())['distances']}
template = template.replace('__ROUTE_DATA__', json.dumps(routes, ensure_ascii=False).replace('</', '<\\/'))
metro = json.loads((ROOT / 'work/metro-stations.json').read_text(encoding='utf-8'))
metro['rail'] = json.loads((ROOT / 'work/metro-routes.json').read_text(encoding='utf-8'))
metro['walking'] = json.loads((ROOT / 'work/metro-walking.json').read_text(encoding='utf-8'))
for route in metro['rail']['routes']:
    for path in route['paths']:
        path['coordinates'] = clean_rail_path(path['coordinates'])
template = template.replace('__METRO_DATA__', json.dumps(metro, ensure_ascii=False).replace('</', '<\\/'))
template = template.replace('__METRO_LAYER_JS__', (ROOT / 'work/metro-layer.js').read_text(encoding='utf-8'))
template = template.replace('__LIST_ORDER_JS__', (ROOT / 'work/list-order.js').read_text(encoding='utf-8'))
template = template.replace('__SORT_ROUTE_JS__', (ROOT / 'work/sort-route.js').read_text(encoding='utf-8'))
template = template.replace('__ROUTE_COSTS_JS__', (ROOT / 'work/route-costs.js').read_text(encoding='utf-8'))
template = template.replace('__ROUTE_PLANNER_JS__', (ROOT / 'work/route-planner.js').read_text(encoding='utf-8'))
template = template.replace('__PLANNER_WORKER_JS__', (ROOT / 'work/planner-worker.js').read_text(encoding='utf-8'))
template = template.replace('__PLANNER_UI_JS__', (ROOT / 'work/planner-ui.js').read_text(encoding='utf-8'))
assert '__BAR_DATA__' not in template
assert '__ROUTE_DATA__' not in template
assert '__METRO_DATA__' not in template and '__METRO_LAYER_JS__' not in template
assert '__APP_VERSION__' not in template
output = ROOT / 'outputs/dc-speakeasies-map.html'
output.write_text(template, encoding='utf-8', newline='\n')
published = ROOT / 'docs/index.html'
published.parent.mkdir(exist_ok=True)
published.write_text(template, encoding='utf-8', newline='\n')
print(str(output), output.stat().st_size, 'bytes; 16 available pins')
print(str(published), 'ready for GitHub Pages')
