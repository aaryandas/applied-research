"""Independent container boundary. No input is ever Python, markup or a path."""
import json
import math
import re

UUID = re.compile(r"[a-fA-F0-9]{8}-(?:[a-fA-F0-9]{4}-){3}[a-fA-F0-9]{12}")
LABEL = re.compile(r"[A-Za-z0-9][A-Za-z0-9 .,()'-]*")


def exact(value, keys):
    return isinstance(value, dict) and set(value) == set(keys)


def label(value, limit):
    return isinstance(value, str) and len(value) <= limit and LABEL.fullmatch(value) and value.strip() == value


def number(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high and value == round(value * 1000) / 1000


def pair(value, low=-3, high=3):
    return isinstance(value, list) and len(value) == 2 and all(number(n, low, high) for n in value)


def matrix(value):
    return isinstance(value, list) and len(value) == 2 and all(pair(row) for row in value)


def origin(value):
    if value is None:
        return True
    return exact(value, ['projectId', 'sourceVersionId', 'questionId', 'lessonId']) and isinstance(value['projectId'], str) and UUID.fullmatch(value['projectId']) and all(value[key] is None or isinstance(value[key], str) and UUID.fullmatch(value[key]) for key in ['sourceVersionId', 'questionId', 'lessonId'])


def decode(raw):
    if len(raw) > 4096:
        raise ValueError('invalid recipe')
    recipe = json.loads(raw)
    if not exact(recipe, ['id', 'version', 'assetVersion', 'origin', 'title', 'recipe', 'parameters']):
        raise ValueError('invalid recipe')
    if not (isinstance(recipe['id'], str) and UUID.fullmatch(recipe['id']) and type(recipe['version']) is int and recipe['version'] == 1 and recipe['assetVersion'] == 'original-manim-1' and origin(recipe['origin']) and label(recipe['title'], 48)):
        raise ValueError('invalid identity')
    p = recipe['parameters']
    if recipe['recipe'] == 'linear-transform':
        valid = exact(p, ['matrix', 'vector']) and matrix(p['matrix']) and pair(p['vector'])
    elif recipe['recipe'] == 'weighted-combination':
        valid = exact(p, ['vectors', 'weights', 'labels']) and matrix(p['vectors']) and pair(p['weights'], 0, 100) and sum(p['weights']) > 0 and isinstance(p['labels'], list) and len(p['labels']) == 2 and all(label(item, 18) for item in p['labels'])
    else:
        valid = False
    if not valid:
        raise ValueError('invalid parameters')
    return recipe
