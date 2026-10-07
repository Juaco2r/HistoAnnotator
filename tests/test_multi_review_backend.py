import importlib.util
from pathlib import Path

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
        box(0,0,10,10),
        box(5,0,15,10),
        box(7,0,12,10),
    ])
    assert round(three.area, 6) == 70.0, three.area

    groups = mr._build_groups([
        [feature(0,0,10,10)],
        [feature(0,0,5,10), feature(5,0,10,10)],
        [feature(1,1,9,9)],
    ], 'tumor')
    assert len(groups) == 1, len(groups)
    assert len(groups[0]) == 4, len(groups[0])

    order1, colors1 = mr._blind_permutation('seed', 'item-000001', 3)
    order2, colors2 = mr._blind_permutation('seed', 'item-000001', 3)
    assert order1 == order2
    assert colors1 == colors2

    print('multi-review backend helper tests: PASS')


if __name__ == '__main__':
    main()
