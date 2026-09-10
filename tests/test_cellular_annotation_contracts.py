from __future__ import annotations

import unittest

from domain.geojson import sanitize_qupath_feature_collection


class CellularAnnotationPersistenceContractTests(
    unittest.TestCase
):
    def test_cellular_metadata_and_measurements_survive_sanitization(
        self,
    ) -> None:
        payload = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "id": "cell-1",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [0, 0],
                            [10, 0],
                            [10, 10],
                            [0, 10],
                            [0, 0],
                        ]],
                    },
                    "properties": {
                        "objectType": "cell",
                        "classification": {
                            "name": "Positive",
                            "color": [255, 0, 0],
                        },
                        "measurements": {
                            "Cell: Area": 100.0,
                            "Nucleus: Area": 40.0,
                        },
                        "histoannotator": {
                            "schemaVersion": 1,
                            "role": "annotation",
                            "level": "cellular",
                            "cell": {
                                "schemaVersion": 1,
                                "cellId": "cell-1",
                                "part": "cell",
                                "markerStatus": "positive",
                                "cellType": "unassigned",
                                "source": "qupath",
                            },
                        },
                    },
                }
            ],
        }

        collection, _report = (
            sanitize_qupath_feature_collection(
                payload
            )
        )

        self.assertEqual(
            len(
                collection["features"]
            ),
            1,
        )

        feature = collection[
            "features"
        ][0]

        properties = feature[
            "properties"
        ]

        histo = properties[
            "histoannotator"
        ]

        self.assertEqual(
            properties["objectType"],
            "cell",
        )

        self.assertEqual(
            properties[
                "classification"
            ]["name"],
            "Positive",
        )

        self.assertEqual(
            histo["level"],
            "cellular",
        )

        self.assertEqual(
            histo["cell"][
                "cellType"
            ],
            "unassigned",
        )

        self.assertEqual(
            histo["cell"][
                "markerStatus"
            ],
            "positive",
        )

        self.assertEqual(
            properties[
                "measurements"
            ][
                "Cell: Area"
            ],
            100.0,
        )


if __name__ == "__main__":
    unittest.main()
