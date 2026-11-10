import hashlib
import json
from prepare_routes import ROOT, BARS, fetch, shortest_open_path, reverse_if_not_longer, make_route

indices=[i for i,b in enumerate(BARS) if ', DC,' in b['matched_address']]
assert len(indices)==15
original=json.loads((ROOT/'work/routing/walking-matrix.json').read_text())['distances']
matrix=[[original[i][j] for j in indices] for i in indices]
shortest,cost=shortest_open_path(matrix)
if BARS[indices[shortest[0]]]['lat']<BARS[indices[shortest[-1]]]['lat']:
    shortest,cost=reverse_if_not_longer(shortest,matrix)
latitudes=[round(BARS[i]['lat'],5) for i in indices]
ranks=[sorted(set(latitudes),reverse=True).index(lat) for lat in latitudes]
north,north_cost=shortest_open_path(matrix,ranks)
routes=[]
for key,title,local_order,distance in [('shortest','Shortest route',shortest,cost),('north-south','North to south',north,north_cost)]:
    order=[indices[i] for i in local_order]
    signature=hashlib.sha256(json.dumps(order).encode()).hexdigest()[:10]
    raw=fetch('dc-'+key+'-'+signature,'route',order,steps='true',geometries='geojson',overview='full',continue_straight='false',generate_hints='false')
    route=make_route(key,title,order,distance,raw)
    routes.append(route)
    print(title,round(distance/1609.344,2),'miles; 15 DC bars; 14 walking legs',flush=True)
payload={'ids':[BARS[i]['id'] for i in indices],'routes':routes}
(ROOT/'work/routes-dc.json').write_text(json.dumps(payload,ensure_ascii=False),encoding='utf-8')
