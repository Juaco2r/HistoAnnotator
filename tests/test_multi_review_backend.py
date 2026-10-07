import importlib.util
import json
import os
import tempfile
from pathlib import Path

# Set a disposable annotation root before importing the module.
_tmp = tempfile.TemporaryDirectory()
os.environ['ANNOTATION_ROOT'] = _tmp.name

MODULE = Path('app/imaging/multi_review.py')
spec = importlib.util.spec_from_file_location('histo_multi_review_test', MODULE)
mr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mr)

from shapely.geometry import box


def feature(x1, y1, x2, y2, class_name='tumor'):
    return {
        'type': 'Feature',
        'geometry': {
            'type': 'Polygon',
            'coordinates': [[[x1,y1],[x2,y1],[x2,y2],[x1,y2],[x1,y1]]],
        },
        'properties': {'classification': {'name': class_name}},
    }


def main():
    two = mr._consensus_geometry([box(0,0,10,10), box(5,0,15,10)])
    assert round(two.area, 6) == 50.0, two.area

    three = mr._consensus_geometry([
        box(0,0,10,10), box(5,0,15,10), box(7,0,12,10),
    ])
    assert round(three.area, 6) == 70.0, three.area

    groups = mr._build_groups([
        [feature(0,0,10,10)],
        [feature(0,0,5,10), feature(5,0,10,10)],
        [feature(1,1,9,9)],
    ], 'tumor')
    assert len(groups) == 1, len(groups)

    order1, colors1 = mr._blind_permutation('seed', 'item-000001', 3)
    order2, colors2 = mr._blind_permutation('seed', 'item-000001', 3)
    assert order1 == order2 and colors1 == colors2

    root = Path(_tmp.name)
    stored = root / 'Case_01' / 'annotator_A.geojson'
    stored.parent.mkdir(parents=True)
    stored.write_text(json.dumps({
        'type': 'FeatureCollection',
        'properties': {'imageId': 'Case_01.tif'},
        'features': [feature(0,0,10,10, 'Tumor')],
    }))
    other = root / 'Case_02' / 'annotator_B.geojson'
    other.parent.mkdir(parents=True)
    other.write_text(json.dumps({
        'type': 'FeatureCollection',
        'properties': {'imageId': 'Case_02.tif'},
        'features': [feature(0,0,10,10, 'Tumor')],
    }))

    available = mr._available_annotations('Case_01.tif')
    assert len(available) == 1, available
    assert available[0]['name'] == 'annotator_A.geojson'
    assert available[0]['classes'] == ['Tumor']

    path, doc = mr._stored_annotation_document(available[0]['path'])
    assert path.name == 'annotator_A.geojson'
    assert len(mr._features(doc)) == 1

    print('multi-review v1.1 backend helper tests: PASS')


if __name__ == '__main__':
    main()
