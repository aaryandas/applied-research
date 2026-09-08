"""Run with Python stdlib; the real image render separately proves Manim execution."""
import copy
import json
import unittest
from validation import decode

LINEAR = {'id': '00000000-0000-4000-8000-000000000001', 'version': 1, 'assetVersion': 'original-manim-1', 'origin': None, 'title': 'Original example', 'recipe': 'linear-transform', 'parameters': {'matrix': [[1, 1], [0, 1]], 'vector': [1, 1]}}
WEIGHTED = {**LINEAR, 'recipe': 'weighted-combination', 'parameters': {'vectors': [[2, 1], [-1, 2]], 'weights': [3, 1], 'labels': ['A', 'B']}}


class BoundaryTests(unittest.TestCase):
    def test_supported(self):
        for recipe in [LINEAR, WEIGHTED]:
            self.assertEqual(decode(json.dumps(recipe)), recipe)

    def test_invalid_json_shapes(self):
        for raw in ['{', 'null', '[]', '{}', '0', ' ' * 4097]:
            with self.subTest(raw=raw[:10]), self.assertRaises((ValueError, TypeError)):
                decode(raw)

    def test_labels_identity_versions_and_bounds(self):
        for changes in [{'extra': 1}, {'version': True}, {'version': 2}, {'assetVersion': 'url'}, {'id': 'bad'}, {'origin': {}}, {'title': '<script>'}, {'title': '\\LaTex'}, {'title': 'line\nbreak'}, {'title': 'a' * 49}, {'title': '\u202ehidden'}, {'recipe': 'python'}, {'parameters': {'matrix': [[1, 0], [0, 1]], 'vector': [4, 0]}}]:
            raw = json.dumps({**LINEAR, **changes})
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                decode(raw)

    def test_weight_edges(self):
        for weights in [[0, 0], [-1, 1], [101, 1], [float('nan'), 1], [float('inf'), 1], [True, 1], [0.000000000001, 1]]:
            recipe = copy.deepcopy(WEIGHTED)
            recipe['parameters']['weights'] = weights
            raw = json.dumps(recipe)
            with self.subTest(weights=weights), self.assertRaises(ValueError):
                decode(raw)
        for weights in [[0, 1], [0.001, 100], [100, 100]]:
            recipe = copy.deepcopy(WEIGHTED)
            recipe['parameters']['weights'] = weights
            self.assertEqual(decode(json.dumps(recipe)), recipe)


if __name__ == '__main__':
    unittest.main()
