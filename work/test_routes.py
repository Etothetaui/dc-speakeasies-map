import itertools
import json
import math
import random
import unittest
from pathlib import Path
from prepare_routes import shortest_open_path, reverse_if_not_longer

class RouteTests(unittest.TestCase):
    def test_reverse_only_when_no_longer(self):
        symmetric=[[0,4,8],[4,0,3],[8,3,0]]
        self.assertEqual(reverse_if_not_longer([0,1,2],symmetric),([2,1,0],7))
        asymmetric=[[0,1,8],[9,0,1],[8,9,0]]
        self.assertEqual(reverse_if_not_longer([0,1,2],asymmetric),([0,1,2],2))
    def test_exact_free_endpoints_against_brute_force(self):
        rng = random.Random(341)
        m = [[0 if i==j else rng.randrange(1,500) for j in range(8)] for i in range(8)]
        _, score = shortest_open_path(m)
        brute = min(sum(m[a][b] for a,b in zip(p,p[1:])) for p in itertools.permutations(range(8)))
        self.assertEqual(score,brute)

    def test_north_south_ties_optimize_with_adjacent_groups(self):
        m = [[0 if i==j else (i*19+j*11+i*j*7)%67+1 for j in range(6)] for i in range(6)]
        ranks = [0,1,1,2,2,3]
        order,score = shortest_open_path(m,ranks)
        legal = [p for p in itertools.permutations(range(6)) if all(ranks[a]<=ranks[b] for a,b in zip(p,p[1:]))]
        self.assertEqual(score,min(sum(m[a][b] for a,b in zip(p,p[1:])) for p in legal))
        self.assertIn(tuple(order),legal)

    def test_stored_routes_cover_every_pin_and_have_real_legs(self):
        root=Path(__file__).resolve().parent
        bars={b['id']:b for b in json.loads((root/'bars.json').read_text(encoding='utf-8'))}
        all_routes=json.loads((root/'routes.json').read_text(encoding='utf-8'))['routes']
        dc=json.loads((root/'routes-dc.json').read_text(encoding='utf-8'))
        dc_ids=[i for i,b in bars.items() if ', DC,' in b['matched_address']]
        self.assertEqual(dc['ids'],dc_ids)
        for route in all_routes+dc['routes']:
            expected=dc_ids if len(route['order'])==15 else list(range(1,17))
            self.assertEqual(sorted(route['order']),expected)
            self.assertEqual(len(route['legs']),len(expected)-1)
            self.assertAlmostEqual(sum(l['distance_m'] for l in route['legs']),route['distance_m'],delta=2)
            self.assertAlmostEqual(route['matrix_distance_m'],route['distance_m'],delta=5)
            for i,leg in enumerate(route['legs']):
                self.assertEqual([leg['from'],leg['to']],route['order'][i:i+2])
                self.assertGreater(len(leg['coordinates']),1)
                self.assertGreater(len(leg['steps']),0)
                for key,point in [('from',leg['coordinates'][0]),('to',leg['coordinates'][-1])]:
                    b=bars[leg[key]]
                    distance=111195*math.hypot(point[1]-b['lat'],(point[0]-b['lon'])*math.cos(math.radians(b['lat'])))
                    self.assertLess(distance,150)
        for routes in [all_routes,dc['routes']]:
            north=next(r for r in routes if r['key']=='north-south')
            lat=[round(bars[i]['lat'],5) for i in north['order']]
            self.assertEqual(lat,sorted(lat,reverse=True))

    def test_dc_shortest_is_reoptimized_on_dc_walking_distances(self):
        root=Path(__file__).resolve().parent
        dc=json.loads((root/'routes-dc.json').read_text(encoding='utf-8'))
        raw=json.loads((root/'routing/walking-matrix.json').read_text())['distances']
        matrix=[[raw[i-1][j-1] for j in dc['ids']] for i in dc['ids']]
        _,optimal=shortest_open_path(matrix)
        shortest=next(r for r in dc['routes'] if r['key']=='shortest')
        self.assertAlmostEqual(shortest['matrix_distance_m'],optimal,delta=1e-6)

if __name__=='__main__':
    unittest.main()
