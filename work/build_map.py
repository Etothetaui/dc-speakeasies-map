import json
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
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
for placeholder, filename in [('LEAFLET_CSS','leaflet.css'),('LEAFLET_JS','leaflet.js'),('CLUSTER_CSS','cluster.css'),('CLUSTER_JS','cluster.js')]:
    template = template.replace('__' + placeholder + '__', (ROOT / 'work' / filename).read_text(encoding='utf-8'))
template = template.replace('__BAR_DATA__', json.dumps(bars, ensure_ascii=False).replace('</', '<\\/'))
routes = json.loads((ROOT / 'work/routes.json').read_text(encoding='utf-8'))
routes['scopes']={'all':{'ids':[b['id'] for b in bars],'routes':routes['routes']},'dc':json.loads((ROOT/'work/routes-dc.json').read_text(encoding='utf-8'))}
routes['walking']={'ids':[b['id'] for b in bars],'distances':json.loads((ROOT/'work/routing/walking-matrix.json').read_text())['distances']}
template = template.replace('__ROUTE_DATA__', json.dumps(routes, ensure_ascii=False).replace('</', '<\\/'))
template = template.replace('__LIST_ORDER_JS__', (ROOT / 'work/list-order.js').read_text(encoding='utf-8'))
template = template.replace('__SORT_ROUTE_JS__', (ROOT / 'work/sort-route.js').read_text(encoding='utf-8'))
template = template.replace('__ROUTE_PLANNER_JS__', (ROOT / 'work/route-planner.js').read_text(encoding='utf-8'))
template = template.replace('__PLANNER_WORKER_JS__', (ROOT / 'work/planner-worker.js').read_text(encoding='utf-8'))
template = template.replace('__PLANNER_UI_JS__', (ROOT / 'work/planner-ui.js').read_text(encoding='utf-8'))
assert '__BAR_DATA__' not in template
assert '__ROUTE_DATA__' not in template
output = ROOT / 'outputs/dc-speakeasies-map.html'
output.write_text(template, encoding='utf-8', newline='\n')
published = ROOT / 'docs/index.html'
published.parent.mkdir(exist_ok=True)
published.write_text(template, encoding='utf-8', newline='\n')
print(str(output), output.stat().st_size, 'bytes; 16 available pins')
print(str(published), 'ready for GitHub Pages')
