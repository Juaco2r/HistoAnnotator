from __future__ import annotations

import hashlib
import json
import os
import random
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

try:
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union
except Exception as exc:  # pragma: no cover - explicit startup error in deployed app
    raise RuntimeError(
        "Multi-annotator review requires Shapely. Install shapely>=2.0,<3."
    ) from exc


router = APIRouter(prefix="/api/multi-review", tags=["multi-review"])
ANNOTATION_ROOT = Path(os.getenv("ANNOTATION_ROOT", "/data/annotations"))
REVIEW_ROOT = ANNOTATION_ROOT / "_reviews"
REVIEW_ROOT.mkdir(parents=True, exist_ok=True)

_SOURCE_COLORS = ["#00B8D9", "#FF4D8D", "#F4C430"]
_CONSENSUS_COLOR = "#7C3AED"
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]+$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=f"Missing review file: {path.name}") from exc


def _session_dir(session_id: str) -> Path:
    if not _SAFE_ID.match(session_id):
        raise HTTPException(status_code=400, detail="Invalid session id")
    path = REVIEW_ROOT / session_id
    if not path.exists():
        raise HTTPException(status_code=404, detail="Review session not found")
    return path


def _classification_name(feature: dict[str, Any]) -> str | None:
    props = feature.get("properties") or {}
    classification = props.get("classification")
    if isinstance(classification, dict):
        name = classification.get("name")
        if name is not None and str(name).strip():
            return str(name).strip()
    elif isinstance(classification, str) and classification.strip():
        return classification.strip()

    for key in ("className", "class", "label", "name"):
        value = props.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _features(geojson: dict[str, Any]) -> list[dict[str, Any]]:
    if geojson.get("type") == "FeatureCollection":
        values = geojson.get("features") or []
        return [x for x in values if isinstance(x, dict) and x.get("geometry")]
    if geojson.get("type") == "Feature" and geojson.get("geometry"):
        return [geojson]
    raise HTTPException(status_code=400, detail="Each annotation must be a GeoJSON FeatureCollection or Feature")


def _embedded_image_id(geojson: dict[str, Any]) -> str | None:
    for container in (geojson, geojson.get("properties") or {}):
        if not isinstance(container, dict):
            continue
        for key in ("imageId", "image_id", "image", "imageName"):
            value = container.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return None



def _normalize_image_token(value: str) -> str:
    text = str(value or "").strip().lower()
    for suffix in (".ome.tiff", ".ome.tif", ".tiff", ".tif", ".svs", ".ndpi", ".mrxs", ".png", ".jpg", ".jpeg"):
        if text.endswith(suffix):
            text = text[: -len(suffix)]
            break
    return re.sub(r"[^a-z0-9]+", "", text)


def _annotation_matches_image(path: Path, document: dict[str, Any], image_id: str) -> tuple[bool, str]:
    target = _normalize_image_token(image_id)
    embedded = _embedded_image_id(document)
    if embedded:
        return (_normalize_image_token(embedded) == target, "declared")

    try:
        relative = path.relative_to(ANNOTATION_ROOT)
    except ValueError:
        relative = path
    tokens = [_normalize_image_token(part) for part in relative.parts]
    stem_token = _normalize_image_token(path.stem)
    if target and (target in tokens or stem_token.startswith(target) or target in stem_token):
        return True, "path"
    return False, "unverified"


def _stored_annotation_path(reference: str) -> Path:
    if not reference or Path(reference).is_absolute():
        raise HTTPException(status_code=400, detail="Invalid stored annotation reference")
    root = ANNOTATION_ROOT.resolve()
    candidate = (root / reference).resolve()
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=400, detail="Stored annotation is outside the annotation root")
    review_root = REVIEW_ROOT.resolve()
    if candidate == review_root or review_root in candidate.parents:
        raise HTTPException(status_code=400, detail="Review output cannot be reused as a source from this selector")
    if candidate.suffix.lower() not in {".geojson", ".json"}:
        raise HTTPException(status_code=400, detail="Stored annotation must be a GeoJSON or JSON file")
    if not candidate.is_file():
        raise HTTPException(status_code=404, detail="Stored annotation file was not found")
    return candidate


def _stored_annotation_document(reference: str) -> tuple[Path, dict[str, Any]]:
    path = _stored_annotation_path(reference)
    try:
        document = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read stored annotation: {path.name}") from exc
    _features(document)
    return path, document


def _available_annotations(image_id: str) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if not ANNOTATION_ROOT.exists():
        return results
    scanned = 0
    for path in sorted(ANNOTATION_ROOT.rglob("*"), key=lambda p: str(p).casefold()):
        if scanned >= 10000:
            break
        if not path.is_file() or path.suffix.lower() not in {".geojson", ".json"}:
            continue
        try:
            relative = path.relative_to(ANNOTATION_ROOT)
        except ValueError:
            continue
        if any(part.startswith("_") for part in relative.parts[:-1]):
            continue
        scanned += 1
        try:
            document = json.loads(path.read_text(encoding="utf-8"))
            feats = _features(document)
        except Exception:
            continue
        matches, match_type = _annotation_matches_image(path, document, image_id)
        if not matches:
            continue
        classes = sorted({name for feature in feats if (name := _classification_name(feature))}, key=str.casefold)
        results.append({
            "id": relative.as_posix(),
            "name": path.name,
            "path": relative.as_posix(),
            "featureCount": len(feats),
            "classes": classes,
            "matchType": match_type,
        })
    return results

def _safe_shape(geometry: dict[str, Any]):
    try:
        geom = shape(geometry)
        if geom.is_empty:
            return None
        if not geom.is_valid:
            geom = geom.buffer(0)
        if geom.is_empty:
            return None
        return geom
    except Exception:
        return None


def _geom_json(geom) -> dict[str, Any] | None:
    if geom is None or geom.is_empty:
        return None
    if not geom.is_valid:
        geom = geom.buffer(0)
    if geom.is_empty:
        return None
    return mapping(geom)


def _bbox_intersects(a, b) -> bool:
    aminx, aminy, amaxx, amaxy = a.bounds
    bminx, bminy, bmaxx, bmaxy = b.bounds
    return not (amaxx < bminx or bmaxx < aminx or amaxy < bminy or bmaxy < aminy)


def _same_object(a, b) -> bool:
    if not _bbox_intersects(a, b):
        return False
    try:
        inter = a.intersection(b).area
        if inter <= 0:
            return False
        union = a.union(b).area
        iou = inter / union if union > 0 else 0.0
        min_area = min(a.area, b.area)
        overlap_small = inter / min_area if min_area > 0 else 0.0
        return iou >= 0.02 or overlap_small >= 0.15
    except Exception:
        return False


def _consensus_geometry(candidates: list[Any | None]):
    present = [g for g in candidates if g is not None and not g.is_empty]
    if len(candidates) == 2:
        if len(present) < 2:
            return None
        return present[0].intersection(present[1])
    if len(candidates) == 3:
        pair_votes = []
        for i in range(3):
            for j in range(i + 1, 3):
                a, b = candidates[i], candidates[j]
                if a is None or b is None:
                    continue
                inter = a.intersection(b)
                if not inter.is_empty:
                    pair_votes.append(inter)
        if not pair_votes:
            return None
        return unary_union(pair_votes)
    return None


def _union_or_none(geoms: list[Any]):
    usable = [g for g in geoms if g is not None and not g.is_empty]
    if not usable:
        return None
    return unary_union(usable)


def _build_groups(source_features: list[list[dict[str, Any]]], class_name: str) -> list[list[dict[str, Any]]]:
    records: list[dict[str, Any]] = []
    for source_index, features in enumerate(source_features):
        for feature_index, feature in enumerate(features):
            if _classification_name(feature) != class_name:
                continue
            geom = _safe_shape(feature.get("geometry") or {})
            if geom is None:
                continue
            records.append(
                {
                    "sourceIndex": source_index,
                    "featureIndex": feature_index,
                    "feature": feature,
                    "geom": geom,
                }
            )

    parent = list(range(len(records)))

    def find(x: int) -> int:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[rb] = ra

    for i in range(len(records)):
        for j in range(i + 1, len(records)):
            if records[i]["sourceIndex"] == records[j]["sourceIndex"]:
                continue
            if _same_object(records[i]["geom"], records[j]["geom"]):
                union(i, j)

    grouped: dict[int, list[dict[str, Any]]] = {}
    for index, record in enumerate(records):
        grouped.setdefault(find(index), []).append(record)

    groups = list(grouped.values())

    def group_order(group: list[dict[str, Any]]):
        geom = _union_or_none([r["geom"] for r in group])
        if geom is None:
            return (0.0, 0.0)
        c = geom.centroid
        return (float(c.y), float(c.x))

    groups.sort(key=group_order)
    return groups


def _blind_permutation(seed: str, item_id: str, source_count: int) -> tuple[list[int], list[str]]:
    digest = hashlib.sha256(f"{seed}:{item_id}".encode("utf-8")).hexdigest()
    rnd = random.Random(int(digest[:16], 16))
    order = list(range(source_count))
    colors = list(_SOURCE_COLORS[:source_count])
    rnd.shuffle(order)
    rnd.shuffle(colors)
    return order, colors


def _public_manifest(manifest: dict[str, Any]) -> dict[str, Any]:
    out = dict(manifest)
    if out.get("reviewMode") == "blind":
        out["sources"] = [
            {"index": index, "name": f"Hidden source {index + 1}"}
            for index in range(int(out.get("sourceCount", 0)))
        ]
    return out


def _load_manifest(path: Path) -> dict[str, Any]:
    return _read_json(path / "manifest.json")


def _load_items(path: Path) -> list[dict[str, Any]]:
    items_path = path / "items.json"
    return _read_json(items_path) if items_path.exists() else []


def _progress(items: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"total": len(items), "pending": 0, "accepted": 0, "deferred": 0}
    for item in items:
        status = item.get("status", "pending")
        if status in counts:
            counts[status] += 1
    return counts


def _candidate_for_key(item: dict[str, Any], key: str | None) -> dict[str, Any] | None:
    if not key:
        return None
    for candidate in item.get("candidates", []):
        if candidate.get("key") == key:
            return candidate
    consensus = item.get("consensus")
    if isinstance(consensus, dict) and consensus.get("key") == key:
        return consensus
    return None


def _public_item(item: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in item.items() if k != "auditMapping"}
    if manifest.get("reviewMode") == "blind":
        sanitized = []
        for candidate in out.get("candidates", []):
            c = dict(candidate)
            c.pop("sourceIndex", None)
            c.pop("sourceName", None)
            sanitized.append(c)
        out["candidates"] = sanitized
    return out


def _item_summaries(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "id": item["id"],
            "status": item.get("status", "pending"),
            "challenging": bool(item.get("challenging")),
            "selectedCandidate": item.get("selectedCandidate"),
            "edited": bool(item.get("edited")),
            "bbox": item.get("bbox"),
        }
        for item in items
    ]


def _write_working_final(path: Path, manifest: dict[str, Any], items: list[dict[str, Any]]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    audit_items: list[dict[str, Any]] = []

    for item in items:
        if item.get("status") != "accepted":
            continue
        selected_key = item.get("selectedCandidate")
        candidate = _candidate_for_key(item, selected_key)
        geometry = item.get("decisionGeometry")

        audit_entry = {
            "reviewItemId": item["id"],
            "selectedCandidate": selected_key,
            "edited": bool(item.get("edited")),
            "challenging": bool(item.get("challenging")),
            "candidateSourceIndex": candidate.get("sourceIndex") if candidate else None,
            "candidateSourceName": candidate.get("sourceName") if candidate else None,
            "blindMapping": item.get("auditMapping"),
        }
        audit_items.append(audit_entry)

        if not geometry:
            continue

        review_properties = {
            "reviewItemId": item["id"],
            "selectedCandidate": selected_key,
            "edited": bool(item.get("edited")),
            "challenging": bool(item.get("challenging")),
            "consensusUsed": selected_key == "CONSENSUS",
        }
        features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    "objectType": "annotation",
                    "classification": {"name": manifest.get("selectedClass")},
                    "review": review_properties,
                },
            }
        )

    collection = {
        "type": "FeatureCollection",
        "features": features,
        "properties": {
            "reviewSessionId": manifest["id"],
            "imageId": manifest["imageId"],
            "reviewClass": manifest.get("selectedClass"),
            "reviewMode": manifest.get("reviewMode"),
            "consensusEnabled": bool(manifest.get("consensusEnabled")),
        },
    }
    _atomic_json(path / "working_final.geojson", collection)
    _atomic_json(
        path / "audit.json",
        {
            "session": manifest,
            "items": audit_items,
        },
    )
    return collection


class SourcePayload(BaseModel):
    name: str | None = None
    geojson: dict[str, Any] | None = None
    storedPath: str | None = None


class CreateSessionRequest(BaseModel):
    imageId: str
    reviewMode: str = "labelled"
    consensusEnabled: bool = False
    sources: list[SourcePayload]


class SelectClassRequest(BaseModel):
    className: str


class ItemDecisionRequest(BaseModel):
    status: str | None = None
    selectedCandidate: str | None = None
    geometry: dict[str, Any] | None = None
    challenging: bool | None = None
    edited: bool | None = None


@router.get("/available-annotations")
def available_annotations(imageId: str):
    image_id = imageId.strip()
    if not image_id:
        raise HTTPException(status_code=400, detail="imageId is required")
    annotations = _available_annotations(image_id)
    return {"imageId": image_id, "annotations": annotations, "count": len(annotations)}


@router.get("/sessions")
def list_sessions():
    sessions = []
    if not REVIEW_ROOT.exists():
        return {"sessions": []}
    for path in sorted(REVIEW_ROOT.iterdir(), reverse=True):
        manifest_path = path / "manifest.json"
        if not path.is_dir() or not manifest_path.exists():
            continue
        try:
            manifest = _read_json(manifest_path)
            items = _load_items(path)
            public = _public_manifest(manifest)
            public["progress"] = _progress(items)
            sessions.append(public)
        except Exception:
            continue
    return {"sessions": sessions}


@router.post("/sessions")
def create_session(req: CreateSessionRequest):
    if len(req.sources) not in (2, 3):
        raise HTTPException(status_code=400, detail="Select exactly 2 or 3 GeoJSON annotation files")
    if req.reviewMode not in ("blind", "labelled"):
        raise HTTPException(status_code=400, detail="reviewMode must be blind or labelled")
    if not req.imageId.strip():
        raise HTTPException(status_code=400, detail="imageId is required")

    all_classes: set[str] = set()
    embedded_ids: set[str] = set()
    source_documents: list[dict[str, Any]] = []
    source_names: list[str] = []
    source_origins: list[dict[str, Any]] = []
    for source in req.sources:
        has_stored = bool(source.storedPath)
        has_upload = source.geojson is not None
        if has_stored == has_upload:
            raise HTTPException(status_code=400, detail="Each source must use either storedPath or uploaded GeoJSON")
        if has_stored:
            stored_path, document = _stored_annotation_document(str(source.storedPath))
            matches, _ = _annotation_matches_image(stored_path, document, req.imageId)
            if not matches:
                raise HTTPException(status_code=400, detail=f"Stored annotation does not match the selected image: {stored_path.name}")
            name = (source.name or stored_path.name).strip()
            source_origins.append({"type": "stored", "path": str(source.storedPath)})
        else:
            document = source.geojson or {}
            _features(document)
            name = (source.name or "Uploaded annotation").strip()
            source_origins.append({"type": "upload"})
        source_documents.append(document)
        source_names.append(name)
        for feature in _features(document):
            class_name = _classification_name(feature)
            if class_name:
                all_classes.add(class_name)
        embedded = _embedded_image_id(document)
        if embedded:
            embedded_ids.add(embedded)

    if len(embedded_ids) > 1:
        raise HTTPException(status_code=400, detail="The GeoJSON files declare different image identifiers")
    if embedded_ids and req.imageId not in embedded_ids:
        raise HTTPException(status_code=400, detail="GeoJSON image identifier does not match the selected image")
    if not all_classes:
        raise HTTPException(status_code=400, detail="No annotation classes were found in the selected GeoJSON files")

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    session_id = f"review-{stamp}-{uuid.uuid4().hex[:8]}"
    path = REVIEW_ROOT / session_id
    path.mkdir(parents=True, exist_ok=False)

    sources_meta = []
    for index, (name, document, origin) in enumerate(zip(source_names, source_documents, source_origins, strict=True), start=1):
        filename = f"source_{index}.geojson"
        _atomic_json(path / filename, document)
        sources_meta.append({"index": index - 1, "name": name, "file": filename, "origin": origin})

    manifest = {
        "id": session_id,
        "createdAt": _now(),
        "updatedAt": _now(),
        "status": "setup",
        "imageId": req.imageId.strip(),
        "reviewMode": req.reviewMode,
        "consensusEnabled": bool(req.consensusEnabled),
        "sourceCount": len(req.sources),
        "sources": sources_meta,
        "classes": sorted(all_classes, key=str.casefold),
        "selectedClass": None,
        "seed": uuid.uuid4().hex,
    }
    _atomic_json(path / "manifest.json", manifest)
    _atomic_json(path / "items.json", [])
    _write_working_final(path, manifest, [])
    return _public_manifest(manifest)


@router.get("/sessions/{session_id}")
def get_session(session_id: str):
    path = _session_dir(session_id)
    manifest = _load_manifest(path)
    items = _load_items(path)
    out = _public_manifest(manifest)
    out["progress"] = _progress(items)
    out["items"] = _item_summaries(items)
    return out


@router.post("/sessions/{session_id}/class")
def select_class(session_id: str, req: SelectClassRequest):
    path = _session_dir(session_id)
    manifest = _load_manifest(path)
    class_name = req.className.strip()
    if class_name not in manifest.get("classes", []):
        raise HTTPException(status_code=400, detail="Unknown annotation class")

    source_docs = [_read_json(path / source["file"]) for source in manifest["sources"]]
    source_features = [_features(doc) for doc in source_docs]
    groups = _build_groups(source_features, class_name)
    if not groups:
        raise HTTPException(status_code=400, detail="No valid geometries were found for this class")

    items: list[dict[str, Any]] = []
    source_count = int(manifest["sourceCount"])

    for item_index, group in enumerate(groups, start=1):
        item_id = f"item-{item_index:06d}"
        by_source: list[list[Any]] = [[] for _ in range(source_count)]
        for record in group:
            by_source[record["sourceIndex"]].append(record["geom"])
        source_geoms = [_union_or_none(values) for values in by_source]
        all_geom = _union_or_none([g for g in source_geoms if g is not None])
        bbox = [float(x) for x in all_geom.bounds] if all_geom is not None else None

        candidates = []
        audit_mapping: dict[str, Any] = {}
        if manifest["reviewMode"] == "blind":
            order, colors = _blind_permutation(manifest["seed"], item_id, source_count)
            for slot, source_index in enumerate(order):
                key = chr(ord("A") + slot)
                candidate = {
                    "key": key,
                    "label": f"Candidate {key}",
                    "color": colors[slot],
                    "sourceIndex": source_index,
                    "sourceName": manifest["sources"][source_index]["name"],
                    "geometry": _geom_json(source_geoms[source_index]),
                    "featureCount": len(by_source[source_index]),
                }
                candidates.append(candidate)
                audit_mapping[key] = {
                    "sourceIndex": source_index,
                    "sourceName": manifest["sources"][source_index]["name"],
                }
        else:
            for source_index in range(source_count):
                key = f"S{source_index + 1}"
                source_name = manifest["sources"][source_index]["name"]
                candidate = {
                    "key": key,
                    "label": source_name,
                    "color": _SOURCE_COLORS[source_index],
                    "sourceIndex": source_index,
                    "sourceName": source_name,
                    "geometry": _geom_json(source_geoms[source_index]),
                    "featureCount": len(by_source[source_index]),
                }
                candidates.append(candidate)
                audit_mapping[key] = {
                    "sourceIndex": source_index,
                    "sourceName": source_name,
                }

        consensus = None
        if manifest.get("consensusEnabled"):
            consensus_geom = _consensus_geometry(source_geoms)
            consensus = {
                "key": "CONSENSUS",
                "label": "Consensus",
                "color": _CONSENSUS_COLOR,
                "sourceIndex": None,
                "sourceName": None,
                "geometry": _geom_json(consensus_geom),
                "featureCount": None,
            }

        items.append(
            {
                "id": item_id,
                "status": "pending",
                "challenging": False,
                "selectedCandidate": None,
                "edited": False,
                "decisionGeometry": None,
                "bbox": bbox,
                "candidates": candidates,
                "consensus": consensus,
                "auditMapping": audit_mapping,
            }
        )

    manifest["selectedClass"] = class_name
    manifest["status"] = "reviewing"
    manifest["updatedAt"] = _now()
    manifest.pop("finalizedAt", None)
    _atomic_json(path / "manifest.json", manifest)
    _atomic_json(path / "items.json", items)
    _write_working_final(path, manifest, items)

    out = _public_manifest(manifest)
    out["progress"] = _progress(items)
    out["items"] = _item_summaries(items)
    return out


@router.get("/sessions/{session_id}/items/{item_id}")
def get_item(session_id: str, item_id: str):
    path = _session_dir(session_id)
    manifest = _load_manifest(path)
    for item in _load_items(path):
        if item.get("id") == item_id:
            return _public_item(item, manifest)
    raise HTTPException(status_code=404, detail="Review item not found")


@router.patch("/sessions/{session_id}/items/{item_id}")
def update_item(session_id: str, item_id: str, req: ItemDecisionRequest):
    path = _session_dir(session_id)
    manifest = _load_manifest(path)
    items = _load_items(path)
    target = next((item for item in items if item.get("id") == item_id), None)
    if target is None:
        raise HTTPException(status_code=404, detail="Review item not found")

    if req.status is not None:
        if req.status not in ("pending", "accepted", "deferred"):
            raise HTTPException(status_code=400, detail="Invalid review status")
        target["status"] = req.status

    if req.selectedCandidate is not None:
        valid_keys = {candidate["key"] for candidate in target.get("candidates", [])}
        if target.get("consensus"):
            valid_keys.add("CONSENSUS")
        if req.selectedCandidate not in valid_keys:
            raise HTTPException(status_code=400, detail="Unknown candidate")
        target["selectedCandidate"] = req.selectedCandidate

    if req.geometry is not None:
        geom = _safe_shape(req.geometry)
        if geom is None:
            raise HTTPException(status_code=400, detail="Edited geometry is invalid")
        target["decisionGeometry"] = _geom_json(geom)
    elif req.selectedCandidate is not None:
        candidate = _candidate_for_key(target, req.selectedCandidate)
        target["decisionGeometry"] = candidate.get("geometry") if candidate else None

    if req.challenging is not None:
        target["challenging"] = bool(req.challenging)
    if req.edited is not None:
        target["edited"] = bool(req.edited)

    if target.get("status") == "accepted" and not target.get("selectedCandidate"):
        raise HTTPException(status_code=400, detail="Select a preferred candidate before accepting")

    manifest["updatedAt"] = _now()
    manifest["status"] = "reviewing"
    _atomic_json(path / "manifest.json", manifest)
    _atomic_json(path / "items.json", items)
    _write_working_final(path, manifest, items)

    result = _public_item(target, manifest)
    result["progress"] = _progress(items)
    return result


@router.get("/sessions/{session_id}/working-final.geojson")
def working_final(session_id: str):
    path = _session_dir(session_id)
    return JSONResponse(_read_json(path / "working_final.geojson"))


@router.post("/sessions/{session_id}/finalize")
def finalize(session_id: str):
    path = _session_dir(session_id)
    manifest = _load_manifest(path)
    items = _load_items(path)
    progress = _progress(items)
    if progress["pending"] or progress["deferred"]:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Review is incomplete: {progress['pending']} pending and "
                f"{progress['deferred']} deferred item(s) remain"
            ),
        )
    collection = _write_working_final(path, manifest, items)
    _atomic_json(path / "final.geojson", collection)
    manifest["status"] = "finalized"
    manifest["finalizedAt"] = _now()
    manifest["updatedAt"] = _now()
    _atomic_json(path / "manifest.json", manifest)
    return {"ok": True, "session": _public_manifest(manifest), "progress": progress}


@router.get("/sessions/{session_id}/final.geojson")
def final_geojson(session_id: str):
    path = _session_dir(session_id)
    final_path = path / "final.geojson"
    if not final_path.exists():
        raise HTTPException(status_code=404, detail="This review has not been finalized")
    return JSONResponse(_read_json(final_path))
