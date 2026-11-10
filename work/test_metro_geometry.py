import json
import unittest
from pathlib import Path
from metro_geometry import clean_rail_path


class MetroGeometryTests(unittest.TestCase):
    def test_dupont_spur_is_removed(self):
        before = [-77.04558, 38.91331]
        junction = [-77.0444, 38.91128]
        tip = [-77.04487, 38.91111]
        after = [-77.0436, 38.9099]
        self.assertEqual(clean_rail_path([before, junction, tip, junction, after]), [before, junction, after])

    def test_nested_backtracks_and_duplicates(self):
        points = [[0, 0], [.0001, 0], [.0002, 0], [.0001, 0], [0, 0], [0, 0], [0, .001]]
        self.assertEqual(clean_rail_path(points), [[0, 0], [0, .001]])

    def test_small_rounded_return_is_removed(self):
        self.assertEqual(clean_rail_path([[0, 0], [.0003, 0], [.00005, .000001], [.00005, .001]]), [[0, 0], [.00005, .000001], [.00005, .001]])

    def test_curves_and_long_out_and_back_are_preserved(self):
        curve = [[0, 0], [.0003, 0], [.0003, .0003], [0, .0003]]
        long_return = [[0, 0], [.01, 0], [0, 0], [0, .01]]
        self.assertEqual(clean_rail_path(curve), curve)
        self.assertEqual(clean_rail_path(long_return), long_return)

    def test_real_paths_keep_endpoints_and_are_stable(self):
        data = json.loads((Path(__file__).parent / 'metro-routes.json').read_text())
        removed = 0
        for route in data['routes']:
            for path in route['paths']:
                original = path['coordinates']
                cleaned = clean_rail_path(original)
                self.assertEqual([cleaned[0], cleaned[-1]], [original[0], original[-1]])
                self.assertGreater(len(cleaned), 2)
                self.assertEqual(clean_rail_path(cleaned), cleaned)
                removed += len(original) - len(cleaned)
        self.assertGreater(removed, 0)


if __name__ == '__main__':
    unittest.main()
