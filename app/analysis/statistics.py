from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException
from shapely.geometry import GeometryCollection, Polygon, box, mapping
from shapely.ops import unary_union
from shapely.validation import make_valid

from .common import _f1_annotation_class_union, _polygonal_geometry, _stats_exclude_external_border

if __package__ and __package__.startswith("app."):
    from ..domain.geojson import _polygonal_only, sanitize_qupath_feature_collection
else:
    from domain.geojson import _polygonal_only, sanitize_qupath_feature_collection

router = APIRouter()

@router.post("/api/geojson/statistics")
def geojson_statistics(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    if payload.get("type") == "FeatureCollection":
        collection_payload = payload
        image_width = 0.0
        image_height = 0.0
    else:
        collection_payload = payload.get("featureCollection")

        if not isinstance(collection_payload, dict):
            raise HTTPException(
                status_code=422,
                detail="featureCollection is required",
            )

        image_width = max(
            0.0,
            float(payload.get("imageWidth", 0) or 0),
        )
        image_height = max(
            0.0,
            float(payload.get("imageHeight", 0) or 0),
        )

    collection, report = sanitize_qupath_feature_collection(
        collection_payload
    )

    image_region = GeometryCollection()
    if image_width > 0 and image_height > 0:
        image_region = Polygon([
            (0.0, 0.0),
            (image_width, 0.0),
            (image_width, image_height),
            (0.0, image_height),
        ])

    tissue_geometries: list[Any] = []
    artifact_geometries: list[Any] = []
    artifact_count = 0

    border_enabled = False
    border_percent = 0.0

    annotation_records: list[tuple[str, Any]] = []

    for feature in collection.get("features", []):
        properties = feature.get("properties", {})
        histo = properties.get("histoannotator", {})

        role = str(
            histo.get("role", "annotation")
        ).strip().lower()

        classification_name = str(
            properties
            .get("classification", {})
            .get("name")
            or "Unclassified"
        ).strip()

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue

        try:
            geometry = _polygonal_geometry(geometry_payload)
        except HTTPException:
            continue

        if geometry.is_empty:
            continue

        roi_meta = histo.get("roi", {})
        roi_kind = (
            str(roi_meta.get("kind", "tissue")).strip().lower()
            if isinstance(roi_meta, dict)
            else "tissue"
        )

        if role == "roi" and roi_kind == "tissue":
            tissue_geometries.append(geometry)

            if isinstance(roi_meta, dict):
                border_meta = roi_meta.get(
                    "externalBorderExclusion"
                )

                if isinstance(border_meta, dict):
                    border_enabled = bool(
                        border_meta.get("enabled", False)
                    )
                    try:
                        border_percent = max(
                            0.0,
                            min(
                                50.0,
                                float(
                                    border_meta.get(
                                        "percent",
                                        0,
                                    )
                                    or 0
                                ),
                            ),
                        )
                    except (TypeError, ValueError):
                        border_percent = 0.0

            continue

        is_artifact = (
            role == "artifact"
            or classification_name.casefold()
            == "artifact"
        )

        if is_artifact:
            artifact_count += 1
            artifact_geometries.append(geometry)
            continue

        if role != "annotation":
            continue

        annotation_records.append(
            (classification_name or "Unclassified", geometry)
        )

    tissue_roi = (
        unary_union(tissue_geometries)
        if tissue_geometries
        else GeometryCollection()
    )

    if not tissue_roi.is_empty and not tissue_roi.is_valid:
        tissue_roi = make_valid(tissue_roi)

    tissue_roi = (
        _polygonal_only(tissue_roi)
        if not tissue_roi.is_empty
        else None
    )

    has_tissue_roi = (
        tissue_roi is not None
        and not tissue_roi.is_empty
    )

    if has_tissue_roi:
        analysis_base = tissue_roi

        if not image_region.is_empty:
            clipped = analysis_base.intersection(
                image_region
            )
            analysis_base = (
                _polygonal_only(clipped)
                or GeometryCollection()
            )

        analysis_source = "tissue-roi"
    else:
        analysis_base = image_region
        analysis_source = "full-image"

    if analysis_base.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Statistics require either a valid Tissue ROI "
                "or valid image dimensions"
            ),
        )

    base_area = float(analysis_base.area)

    requested_border = (
        border_percent
        if has_tissue_roi and border_enabled
        else 0.0
    )

    post_border_region, actual_border, border_width = (
        _stats_exclude_external_border(
            analysis_base,
            requested_border,
        )
    )

    if post_border_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "The Tissue ROI external-border exclusion removed "
                "the complete analysis region"
            ),
        )

    post_border_area = float(
        post_border_region.area
    )

    artifact_union = GeometryCollection()

    if artifact_geometries:
        artifact_union = unary_union(
            artifact_geometries
        )

        if (
            not artifact_union.is_empty
            and not artifact_union.is_valid
        ):
            artifact_union = make_valid(
                artifact_union
            )

        artifact_union = (
            _polygonal_only(artifact_union)
            or GeometryCollection()
        )

        if not artifact_union.is_empty:
            artifact_union = artifact_union.intersection(
                post_border_region
            )
            artifact_union = (
                _polygonal_only(artifact_union)
                or GeometryCollection()
            )

    artifact_area = (
        float(artifact_union.area)
        if not artifact_union.is_empty
        else 0.0
    )

    valid_region = (
        post_border_region.difference(
            artifact_union
        )
        if not artifact_union.is_empty
        else post_border_region
    )

    if not valid_region.is_valid:
        valid_region = make_valid(valid_region)

    valid_region = (
        _polygonal_only(valid_region)
        or GeometryCollection()
    )

    if valid_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Artifact exclusion removed the complete "
                "analysis region"
            ),
        )

    valid_area = float(valid_region.area)

    grouped_valid: dict[str, list[Any]] = {}
    grouped_counts: dict[str, int] = {}
    class_names: set[str] = set()
    all_valid: list[Any] = []

    anthracosis_union = _f1_annotation_class_union(
        collection,
        "anthracosis",
    )

    if not anthracosis_union.is_empty:
        anthracosis_union = anthracosis_union.intersection(
            valid_region
        )
        anthracosis_union = (
            _polygonal_only(anthracosis_union)
            or GeometryCollection()
        )

    for class_name, geometry in annotation_records:
        class_names.add(class_name)

        effective = geometry.intersection(
            valid_region
        )

        if (
            class_name.casefold() != "anthracosis"
            and not anthracosis_union.is_empty
        ):
            effective = effective.difference(
                anthracosis_union
            )

        effective = _polygonal_only(
            effective
        )

        if (
            effective is None
            or effective.is_empty
        ):
            continue

        grouped_valid.setdefault(
            class_name,
            [],
        ).append(effective)

        grouped_counts[class_name] = (
            grouped_counts.get(class_name, 0)
            + 1
        )

        all_valid.append(effective)

    rows = []

    for class_name in sorted(
        class_names,
        key=str.casefold,
    ):
        items = grouped_valid.get(
            class_name,
            [],
        )

        merged = (
            unary_union(items)
            if items
            else GeometryCollection()
        )

        area = (
            float(merged.area)
            if not merged.is_empty
            else 0.0
        )

        rows.append({
            "className": class_name,
            "count": int(
                grouped_counts.get(
                    class_name,
                    0,
                )
            ),
            "areaPx2": area,
            "percentValid": (
                100.0 * area / valid_area
                if valid_area > 0
                else 0.0
            ),
        })

    # --------------------------------------------------------
    # Phase F2.3 — Positive by class
    #
    # Use the same grouped_valid geometries as standard Annotation
    # statistics so exclusions are exactly identical.
    # --------------------------------------------------------
    positive_class_present = any(
        class_name.casefold() == "positive"
        for class_name in class_names
    )

    positive_items: list[Any] = []

    for class_name, items in grouped_valid.items():
        if class_name.casefold() == "positive":
            positive_items.extend(items)

    positive_union = (
        unary_union(positive_items)
        if positive_items
        else GeometryCollection()
    )

    if (
        not positive_union.is_empty
        and not positive_union.is_valid
    ):
        positive_union = make_valid(
            positive_union
        )

    positive_union = (
        _polygonal_only(positive_union)
        or GeometryCollection()
    )

    positive_effective_area = (
        float(positive_union.area)
        if not positive_union.is_empty
        else 0.0
    )

    positive_by_class_rows: list[dict[str, Any]] = []

    special_positive_analysis_classes = {
        "positive",
        "anthracosis",
        "artifact",
    }

    for class_name in sorted(
        class_names,
        key=str.casefold,
    ):
        folded_name = class_name.casefold()

        if folded_name in special_positive_analysis_classes:
            continue

        items = grouped_valid.get(
            class_name,
            [],
        )

        if not items:
            continue

        class_union = (
            unary_union(items)
            if len(items) > 1
            else items[0]
        )

        if (
            not class_union.is_empty
            and not class_union.is_valid
        ):
            class_union = make_valid(
                class_union
            )

        class_union = (
            _polygonal_only(class_union)
            or GeometryCollection()
        )

        if class_union.is_empty:
            continue

        class_area = float(
            class_union.area
        )

        if class_area <= 0:
            continue

        positive_intersection = GeometryCollection()

        if not positive_union.is_empty:
            try:
                positive_intersection = (
                    class_union.intersection(
                        positive_union
                    )
                )
            except Exception:
                repaired_class = make_valid(
                    class_union
                )
                repaired_positive = make_valid(
                    positive_union
                )
                positive_intersection = (
                    repaired_class.intersection(
                        repaired_positive
                    )
                )

            if (
                not positive_intersection.is_empty
                and not positive_intersection.is_valid
            ):
                positive_intersection = make_valid(
                    positive_intersection
                )

            positive_intersection = (
                _polygonal_only(
                    positive_intersection
                )
                or GeometryCollection()
            )

        intersection_area = (
            float(
                positive_intersection.area
            )
            if not positive_intersection.is_empty
            else 0.0
        )

        intersection_area = max(
            0.0,
            min(
                class_area,
                intersection_area,
            ),
        )

        positive_by_class_rows.append({
            "className":
                class_name,
            "classAreaPx2":
                class_area,
            "positiveAreaPx2":
                intersection_area,
            "positivePercentOfClass": (
                100.0
                * intersection_area
                / class_area
                if class_area > 0
                else 0.0
            ),
        })

    positive_by_class = {
        "available":
            bool(positive_class_present),
        "positiveEffectiveAreaPx2":
            float(
                positive_effective_area
            ),
        "rows":
            positive_by_class_rows,
        "denominator":
            "effective-class-area",
        "numerator":
            "positive-effective-intersection-class-effective",
        "exclusions": [
            "external-border",
            "artifact",
            "anthracosis",
        ],
    }

    all_union = (
        unary_union(all_valid)
        if all_valid
        else GeometryCollection()
    )

    total_area = (
        float(all_union.area)
        if not all_union.is_empty
        else 0.0
    )

    artifact_percent = (
        100.0
        * artifact_area
        / post_border_area
        if post_border_area > 0
        else 0.0
    )

    return {
        "rows": rows,
        "positiveByClass":
            positive_by_class,
        "totalAnnotations": int(
            sum(grouped_counts.values())
        ),
        "totalUnionAreaPx2": total_area,
        "totalPercentValid": (
            100.0 * total_area / valid_area
            if valid_area > 0
            else 0.0
        ),
        "analysis": {
            "source": analysis_source,
            "roiPresent": bool(
                has_tissue_roi
            ),
            "imageAreaPx2": (
                float(image_region.area)
                if not image_region.is_empty
                else 0.0
            ),
            "baseAreaPx2": base_area,
            "postBorderAreaPx2": post_border_area,
            "externalBorderEnabled": bool(
                has_tissue_roi
                and border_enabled
            ),
            "externalBorderRequestedPct": float(
                requested_border
            ),
            "externalBorderActualPct": float(
                actual_border
            ),
            "externalBorderWidthPx": float(
                border_width
            ),
            "artifactCount": int(
                artifact_count
            ),
            "artifactAreaPx2": artifact_area,
            "artifactPercentPostBorder": float(
                artifact_percent
            ),
            "validAreaPx2": valid_area,
        },
        "report": report,
    }



def _review_tiles_valid_region(
    collection_payload: dict[str, Any],
    image_width: float,
    image_height: float,
) -> tuple[
    dict[str, Any],
    Any,
    dict[str, Any],
    list[tuple[str, str, Any]],
]:
    collection, report = sanitize_qupath_feature_collection(
        collection_payload
    )

    image_region = GeometryCollection()

    if image_width > 0 and image_height > 0:
        image_region = Polygon(
            [
                (0.0, 0.0),
                (image_width, 0.0),
                (image_width, image_height),
                (0.0, image_height),
            ]
        )

    tissue_geometries: list[Any] = []
    artifact_geometries: list[Any] = []
    annotation_records: list[tuple[str, str, Any]] = []

    border_enabled = False
    border_percent = 0.0

    for feature in collection.get("features", []):
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties", {})

        if not isinstance(properties, dict):
            properties = {}

        histo = properties.get("histoannotator", {})

        if not isinstance(histo, dict):
            histo = {}

        role = str(
            histo.get("role", "annotation")
            or "annotation"
        ).strip().lower()

        class_name = str(
            properties
            .get("classification", {})
            .get("name")
            or "Unclassified"
        ).strip()

        geometry_payload = feature.get("geometry")

        if not isinstance(geometry_payload, dict):
            continue

        try:
            geometry = _polygonal_geometry(
                geometry_payload
            )
        except HTTPException:
            continue

        if geometry.is_empty:
            continue

        roi_meta = histo.get("roi", {})

        roi_kind = (
            str(
                roi_meta.get("kind", "tissue")
            ).strip().lower()
            if isinstance(roi_meta, dict)
            else "tissue"
        )

        if (
            role == "roi"
            and roi_kind == "tissue"
        ):
            tissue_geometries.append(
                geometry
            )

            if isinstance(roi_meta, dict):
                border_meta = roi_meta.get(
                    "externalBorderExclusion"
                )

                if isinstance(border_meta, dict):
                    border_enabled = bool(
                        border_meta.get(
                            "enabled",
                            False,
                        )
                    )

                    try:
                        border_percent = max(
                            0.0,
                            min(
                                50.0,
                                float(
                                    border_meta.get(
                                        "percent",
                                        0,
                                    )
                                    or 0
                                ),
                            ),
                        )
                    except (TypeError, ValueError):
                        border_percent = 0.0

            continue

        if (
            role == "artifact"
            or class_name.casefold()
                == "artifact"
        ):
            artifact_geometries.append(
                geometry
            )
            continue

        if role != "annotation":
            continue

        feature_id = str(
            feature.get("id")
            or properties.get("id")
            or ""
        ).strip()

        annotation_records.append(
            (
                feature_id,
                class_name or "Unclassified",
                geometry,
            )
        )

    tissue_roi = (
        unary_union(
            tissue_geometries
        )
        if tissue_geometries
        else GeometryCollection()
    )

    if (
        not tissue_roi.is_empty
        and not tissue_roi.is_valid
    ):
        tissue_roi = make_valid(
            tissue_roi
        )

    tissue_roi = (
        _polygonal_only(
            tissue_roi
        )
        or GeometryCollection()
    )

    has_tissue_roi = (
        not tissue_roi.is_empty
    )

    if has_tissue_roi:
        analysis_base = tissue_roi

        if not image_region.is_empty:
            analysis_base = (
                _polygonal_only(
                    analysis_base.intersection(
                        image_region
                    )
                )
                or GeometryCollection()
            )

        analysis_source = "tissue-roi"

    else:
        analysis_base = image_region
        analysis_source = "full-image"

    if analysis_base.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Tile review requires either a valid Tissue ROI "
                "or valid image dimensions"
            ),
        )

    requested_border = (
        border_percent
        if (
            has_tissue_roi
            and border_enabled
        )
        else 0.0
    )

    (
        post_border_region,
        actual_border,
        border_width,
    ) = _stats_exclude_external_border(
        analysis_base,
        requested_border,
    )

    if post_border_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "The Tissue ROI external-border exclusion "
                "removed the complete review region"
            ),
        )

    artifact_union = GeometryCollection()

    if artifact_geometries:
        artifact_union = unary_union(
            artifact_geometries
        )

        if (
            not artifact_union.is_empty
            and not artifact_union.is_valid
        ):
            artifact_union = make_valid(
                artifact_union
            )

        artifact_union = (
            _polygonal_only(
                artifact_union
            )
            or GeometryCollection()
        )

        if not artifact_union.is_empty:
            artifact_union = (
                _polygonal_only(
                    artifact_union.intersection(
                        post_border_region
                    )
                )
                or GeometryCollection()
            )

    valid_region = (
        post_border_region.difference(
            artifact_union
        )
        if not artifact_union.is_empty
        else post_border_region
    )

    if (
        not valid_region.is_empty
        and not valid_region.is_valid
    ):
        valid_region = make_valid(
            valid_region
        )

    valid_region = (
        _polygonal_only(
            valid_region
        )
        or GeometryCollection()
    )

    if valid_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail=(
                "Artifact exclusion removed the complete "
                "tile-review region"
            ),
        )

    return (
        collection,
        valid_region,
        {
            "source": analysis_source,
            "roiPresent": bool(
                has_tissue_roi
            ),
            "externalBorderEnabled": bool(
                has_tissue_roi
                and border_enabled
            ),
            "externalBorderRequestedPct": float(
                requested_border
            ),
            "externalBorderActualPct": float(
                actual_border
            ),
            "externalBorderWidthPx": float(
                border_width
            ),
            "artifactAreaPx2": (
                float(
                    artifact_union.area
                )
                if not artifact_union.is_empty
                else 0.0
            ),
            "validAreaPx2": float(
                valid_region.area
            ),
            "report": report,
        },
        annotation_records,
    )


@router.post("/api/geojson/review-tiles")
def geojson_review_tiles(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    collection_payload = payload.get(
        "featureCollection"
    )

    if not isinstance(
        collection_payload,
        dict,
    ):
        raise HTTPException(
            status_code=422,
            detail="featureCollection is required",
        )

    image_width = max(
        0.0,
        float(
            payload.get(
                "imageWidth",
                0,
            )
            or 0
        ),
    )

    image_height = max(
        0.0,
        float(
            payload.get(
                "imageHeight",
                0,
            )
            or 0
        ),
    )

    tile_size = float(
        payload.get(
            "tileSizePx",
            0,
        )
        or 0
    )

    if (
        not tile_size
        or tile_size < 128
        or tile_size > 50000
    ):
        raise HTTPException(
            status_code=422,
            detail=(
                "tileSizePx must be between 128 and 50000"
            ),
        )

    (
        _collection,
        valid_region,
        analysis,
        annotation_records,
    ) = _review_tiles_valid_region(
        collection_payload,
        image_width,
        image_height,
    )

    min_x, min_y, max_x, max_y = (
        valid_region.bounds
    )

    start_x = (
        float(
            int(
                min_x // tile_size
            )
        )
        * tile_size
    )

    start_y = (
        float(
            int(
                min_y // tile_size
            )
        )
        * tile_size
    )

    columns = max(
        1,
        int(
            (
                max_x - start_x
                + tile_size - 1
            )
            // tile_size
        ),
    )

    rows = max(
        1,
        int(
            (
                max_y - start_y
                + tile_size - 1
            )
            // tile_size
        ),
    )

    possible_tiles = (
        rows
        * columns
    )

    if possible_tiles > 5000:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Tile size would create {possible_tiles} grid cells. "
                "Choose a larger tile size (maximum 5000 cells)."
            ),
        )

    annotation_bounds = [
        (
            feature_id,
            class_name,
            geometry,
            geometry.bounds,
        )
        for (
            feature_id,
            class_name,
            geometry,
        )
        in annotation_records
    ]

    tiles: list[dict[str, Any]] = []

    tile_number = 0

    for row in range(rows):
        y = (
            start_y
            + row * tile_size
        )

        for column in range(columns):
            x = (
                start_x
                + column * tile_size
            )

            tile_rect = box(
                x,
                y,
                x + tile_size,
                y + tile_size,
            )

            try:
                effective = tile_rect.intersection(
                    valid_region
                )
            except Exception:
                effective = make_valid(
                    tile_rect
                ).intersection(
                    make_valid(
                        valid_region
                    )
                )

            effective = (
                _polygonal_only(
                    effective
                )
                or GeometryCollection()
            )

            if (
                effective.is_empty
                or float(
                    effective.area
                ) <= 1.0
            ):
                continue

            effective_bounds = (
                effective.bounds
            )

            annotation_ids: list[str] = []
            class_counts: dict[str, int] = {}

            for (
                feature_id,
                class_name,
                geometry,
                bounds,
            ) in annotation_bounds:
                (
                    feature_min_x,
                    feature_min_y,
                    feature_max_x,
                    feature_max_y,
                ) = bounds

                (
                    effective_min_x,
                    effective_min_y,
                    effective_max_x,
                    effective_max_y,
                ) = effective_bounds

                if (
                    feature_max_x
                        < effective_min_x
                    or feature_min_x
                        > effective_max_x
                    or feature_max_y
                        < effective_min_y
                    or feature_min_y
                        > effective_max_y
                ):
                    continue

                try:
                    intersects = geometry.intersects(
                        effective
                    )
                except Exception:
                    intersects = make_valid(
                        geometry
                    ).intersects(
                        make_valid(
                            effective
                        )
                    )

                if not intersects:
                    continue

                if feature_id:
                    annotation_ids.append(
                        feature_id
                    )

                class_counts[
                    class_name
                ] = (
                    class_counts.get(
                        class_name,
                        0,
                    )
                    + 1
                )

            tile_number += 1

            tiles.append(
                {
                    "id": (
                        f"tile-{row}-{column}"
                    ),
                    "number": tile_number,
                    "row": row,
                    "column": column,
                    "x": float(x),
                    "y": float(y),
                    "width": float(
                        tile_size
                    ),
                    "height": float(
                        tile_size
                    ),
                    "validAreaPx2": float(
                        effective.area
                    ),
                    "validFraction": float(
                        effective.area
                        / (
                            tile_size
                            * tile_size
                        )
                    ),
                    "annotationIds": (
                        annotation_ids
                    ),
                    "annotationCount": len(
                        annotation_ids
                    ),
                    "classCounts": (
                        class_counts
                    ),
                }
            )

    return {
        "schemaVersion": 1,
        "method": (
            "valid-tissue-review-grid"
        ),
        "tileSizePx": float(
            tile_size
        ),
        "tiles": tiles,
        "tileCount": len(
            tiles
        ),
        "analysis": analysis,
        "validRegionBounds": [
            float(min_x),
            float(min_y),
            float(max_x),
            float(max_y),
        ],
    }




@router.post("/api/geojson/fill-unannotated")
def geojson_fill_unannotated(
    payload: dict[str, Any] = Body(...),
) -> dict[str, Any]:
    collection_payload = payload.get("featureCollection")
    if not isinstance(collection_payload, dict):
        raise HTTPException(status_code=422, detail="featureCollection is required")

    image_width = max(0.0, float(payload.get("imageWidth", 0) or 0))
    image_height = max(0.0, float(payload.get("imageHeight", 0) or 0))
    collection, report = sanitize_qupath_feature_collection(collection_payload)

    image_region = GeometryCollection()
    if image_width > 0 and image_height > 0:
        image_region = Polygon([
            (0.0, 0.0),
            (image_width, 0.0),
            (image_width, image_height),
            (0.0, image_height),
        ])

    tissue_geometries: list[Any] = []
    artifact_geometries: list[Any] = []
    annotation_geometries: list[Any] = []
    border_enabled = False
    border_percent = 0.0

    for feature in collection.get("features", []):
        properties = feature.get("properties", {})
        histo = properties.get("histoannotator", {})
        role = str(histo.get("role", "annotation")).strip().lower()
        class_name = str(
            properties.get("classification", {}).get("name") or "Unclassified"
        ).strip()

        geometry_payload = feature.get("geometry")
        if not isinstance(geometry_payload, dict):
            continue
        try:
            geometry = _polygonal_geometry(geometry_payload)
        except HTTPException:
            continue
        if geometry.is_empty:
            continue

        roi_meta = histo.get("roi", {})
        roi_kind = (
            str(roi_meta.get("kind", "tissue")).strip().lower()
            if isinstance(roi_meta, dict)
            else "tissue"
        )

        if role == "roi" and roi_kind == "tissue":
            tissue_geometries.append(geometry)
            if isinstance(roi_meta, dict):
                border_meta = roi_meta.get("externalBorderExclusion")
                if isinstance(border_meta, dict):
                    border_enabled = bool(border_meta.get("enabled", False))
                    try:
                        border_percent = max(
                            0.0,
                            min(50.0, float(border_meta.get("percent", 0) or 0)),
                        )
                    except (TypeError, ValueError):
                        border_percent = 0.0
            continue

        if role == "artifact" or class_name.casefold() == "artifact":
            artifact_geometries.append(geometry)
            continue

        if role == "annotation":
            annotation_geometries.append(geometry)

    tissue_roi = unary_union(tissue_geometries) if tissue_geometries else GeometryCollection()
    if not tissue_roi.is_empty and not tissue_roi.is_valid:
        tissue_roi = make_valid(tissue_roi)
    tissue_polygonal = _polygonal_only(tissue_roi) if not tissue_roi.is_empty else None
    has_tissue_roi = tissue_polygonal is not None and not tissue_polygonal.is_empty

    if has_tissue_roi:
        analysis_base = tissue_polygonal
        if not image_region.is_empty:
            clipped = analysis_base.intersection(image_region)
            clipped_polygonal = _polygonal_only(clipped)
            analysis_base = clipped_polygonal if clipped_polygonal is not None else GeometryCollection()
        analysis_source = "tissue-roi"
    else:
        analysis_base = image_region
        analysis_source = "full-image"

    if analysis_base.is_empty:
        raise HTTPException(
            status_code=422,
            detail="Fill unannotated tissue requires a valid Tissue ROI or valid image dimensions",
        )

    requested_border = border_percent if has_tissue_roi and border_enabled else 0.0
    post_border_region, actual_border, border_width = _stats_exclude_external_border(
        analysis_base,
        requested_border,
    )
    if post_border_region.is_empty:
        raise HTTPException(
            status_code=422,
            detail="The external-border exclusion removed the complete analysis region",
        )

    artifact_union = GeometryCollection()
    if artifact_geometries:
        artifact_union = unary_union(artifact_geometries)
        if not artifact_union.is_empty and not artifact_union.is_valid:
            artifact_union = make_valid(artifact_union)
        artifact_polygonal = _polygonal_only(artifact_union)
        artifact_union = artifact_polygonal if artifact_polygonal is not None else GeometryCollection()
        if not artifact_union.is_empty:
            artifact_union = artifact_union.intersection(post_border_region)
            artifact_polygonal = _polygonal_only(artifact_union)
            artifact_union = artifact_polygonal if artifact_polygonal is not None else GeometryCollection()

    valid_region = (
        post_border_region.difference(artifact_union)
        if not artifact_union.is_empty
        else post_border_region
    )
    if not valid_region.is_empty and not valid_region.is_valid:
        valid_region = make_valid(valid_region)
    valid_polygonal = _polygonal_only(valid_region)
    valid_region = valid_polygonal if valid_polygonal is not None else GeometryCollection()
    if valid_region.is_empty:
        raise HTTPException(status_code=422, detail="Artifact exclusion removed the complete valid tissue region")

    annotated_union = GeometryCollection()
    if annotation_geometries:
        annotated_union = unary_union(annotation_geometries)
        if not annotated_union.is_empty and not annotated_union.is_valid:
            annotated_union = make_valid(annotated_union)
        annotated_polygonal = _polygonal_only(annotated_union)
        annotated_union = annotated_polygonal if annotated_polygonal is not None else GeometryCollection()
        if not annotated_union.is_empty:
            annotated_union = annotated_union.intersection(valid_region)
            annotated_polygonal = _polygonal_only(annotated_union)
            annotated_union = annotated_polygonal if annotated_polygonal is not None else GeometryCollection()

    remaining = (
        valid_region.difference(annotated_union)
        if not annotated_union.is_empty
        else valid_region
    )
    if not remaining.is_empty and not remaining.is_valid:
        remaining = make_valid(remaining)
    remaining_polygonal = _polygonal_only(remaining)
    remaining = remaining_polygonal if remaining_polygonal is not None else GeometryCollection()

    valid_area = float(valid_region.area)
    annotated_area = float(annotated_union.area) if not annotated_union.is_empty else 0.0
    remaining_area = float(remaining.area) if not remaining.is_empty else 0.0
    artifact_area = float(artifact_union.area) if not artifact_union.is_empty else 0.0

    return {
        "geometry": mapping(remaining) if not remaining.is_empty else None,
        "validAreaPx2": valid_area,
        "annotatedAreaPx2": annotated_area,
        "remainingAreaPx2": remaining_area,
        "remainingPercentValid": 100.0 * remaining_area / valid_area if valid_area > 0 else 0.0,
        "annotationCount": len(annotation_geometries),
        "analysis": {
            "source": analysis_source,
            "roiPresent": bool(has_tissue_roi),
            "externalBorderEnabled": bool(has_tissue_roi and border_enabled),
            "externalBorderRequestedPct": float(requested_border),
            "externalBorderActualPct": float(actual_border),
            "externalBorderWidthPx": float(border_width),
            "artifactAreaPx2": artifact_area,
        },
        "report": report,
    }


@router.post("/api/geojson/qupath-export")
def qupath_export(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
    collection, report = sanitize_qupath_feature_collection(payload)
    return {"featureCollection": collection, "report": report}


__all__ = ['geojson_statistics', 'geojson_fill_unannotated', 'qupath_export']
