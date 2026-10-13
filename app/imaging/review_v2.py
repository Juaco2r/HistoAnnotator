from __future__ import annotations

import copy
import hashlib
import json
import secrets
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import Body, HTTPException
from fastapi.responses import FileResponse
from shapely.geometry import mapping, shape
from shapely.ops import unary_union


_REVIEW_V2_LOCK = threading.RLock()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_key(value: str) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()[:32]


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not read Review v2 data: {exc}",
        ) from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=500, detail="Review v2 data is not an object")
    return payload


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False),
        encoding="utf-8",
    )
    temporary.replace(path)


def _geometry_or_none(value: Any) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    try:
        geometry = shape(value)
    except Exception:
        return None
    if geometry.is_empty:
        return None
    try:
        if not geometry.is_valid:
            geometry = geometry.buffer(0)
    except Exception:
        pass
    if geometry.is_empty:
        return None
    return mapping(geometry)


def _union_geometry(values: list[Any]) -> dict[str, Any] | None:
    geometries = []
    for value in values:
        normalized = _geometry_or_none(value)
        if normalized is None:
            continue
        try:
            geometries.append(shape(normalized))
        except Exception:
            continue
    if not geometries:
        return None
    try:
        merged = unary_union(geometries)
        if not merged.is_valid:
            merged = merged.buffer(0)
    except Exception:
        return None
    if merged.is_empty:
        return None
    return mapping(merged)


def _geometry_bbox(value: Any) -> list[float] | None:
    normalized = _geometry_or_none(value)
    if normalized is None:
        return None
    try:
        bounds = shape(normalized).bounds
    except Exception:
        return None
    if len(bounds) != 4:
        return None
    return [float(number) for number in bounds]


def _combined_bbox(candidates: list[dict[str, Any]]) -> list[float] | None:
    boxes = [
        _geometry_bbox(candidate.get("geometry"))
        for candidate in candidates
        if isinstance(candidate, dict)
    ]
    boxes = [box for box in boxes if box is not None]
    if not boxes:
        return None
    return [
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    ]


def _sanitize_session_id(value: Any) -> str:
    text = str(value or "").strip()
    if not text or len(text) > 256:
        raise HTTPException(status_code=422, detail="Invalid source session id")
    return text


def _sanitize_token(value: Any) -> str:
    text = str(value or "").strip()
    if len(text) < 16 or len(text) > 256:
        raise HTTPException(status_code=404, detail="Reviewer link not found")
    return text


def _source_review_root(annotation_root: Path) -> Path:
    return annotation_root / "_reviews"


def _v2_root(annotation_root: Path) -> Path:
    return annotation_root / "_reviews_v2"


def _prep_path(annotation_root: Path, session_id: str) -> Path:
    return _v2_root(annotation_root) / f"{_safe_key(session_id)}.json"


def _load_v18_source_session(
    path: Path,
) -> dict[str, Any]:
    manifest_path = (
        path / "manifest.json"
    )

    items_path = (
        path / "items.json"
    )

    if (
        not manifest_path.is_file()
        or not items_path.is_file()
    ):
        raise ValueError(
            "Not a Multi Review v1.8 session"
        )

    # manifest.json is an object, so the normal
    # Review v2 object reader is appropriate.
    manifest = _read_json(
        manifest_path
    )

    # items.json in Multi Review v1.8 is deliberately
    # a top-level JSON ARRAY, not an object.
    try:
        items = json.loads(
            items_path.read_text(
                encoding="utf-8"
            )
        )
    except (
        OSError,
        json.JSONDecodeError,
    ) as exc:
        raise ValueError(
            "Could not read Multi Review "
            "v1.8 items.json"
        ) from exc

    if not isinstance(items, list):
        raise ValueError(
            "Multi Review v1.8 "
            "items.json is not a list"
        )

    payload = copy.deepcopy(
        manifest
    )

    payload["items"] = copy.deepcopy(
        items
    )

    return payload



def _looks_like_source_session(
    payload: Any,
) -> bool:
    return (
        isinstance(payload, dict)
        and bool(
            str(
                payload.get("id")
                or ""
            ).strip()
        )
        and bool(
            str(
                payload.get("imageId")
                or ""
            ).strip()
        )
        and isinstance(
            payload.get("items"),
            list,
        )
        and isinstance(
            payload.get("sources"),
            list,
        )
    )



def _session_id(payload: dict[str, Any], path: Path) -> str:
    return str(
        payload.get("id")
        or payload.get("sessionId")
        or payload.get("reviewSessionId")
        or path.stem
    )


def _iter_source_sessions(
    annotation_root: Path,
):
    root = _source_review_root(
        annotation_root
    )

    if not root.exists():
        return

    for path in sorted(
        root.iterdir(),
        reverse=True,
    ):
        if not path.is_dir():
            continue

        try:
            payload = (
                _load_v18_source_session(
                    path
                )
            )
        except Exception:
            continue

        if _looks_like_source_session(
            payload
        ):
            yield path, payload



def _find_source_session(
    annotation_root: Path,
    session_id: str,
) -> dict[str, Any]:
    session_id = (
        _sanitize_session_id(
            session_id
        )
    )

    path = (
        _source_review_root(annotation_root)
        / session_id
    )

    if not path.is_dir():
        raise HTTPException(
            status_code=404,
            detail=(
                "Multi Review source "
                "session not found"
            ),
        )

    try:
        payload = (
            _load_v18_source_session(
                path
            )
        )
    except Exception as exc:
        raise HTTPException(
            status_code=404,
            detail=(
                "Multi Review source "
                "session is incomplete"
            ),
        ) from exc

    if not _looks_like_source_session(
        payload
    ):
        raise HTTPException(
            status_code=404,
            detail=(
                "Invalid Multi Review "
                "source session"
            ),
        )

    return payload



def _session_summary(
    path: Path,
    payload: dict[str, Any],
) -> dict[str, Any]:
    items = (
        payload.get("items")
        if isinstance(
            payload.get("items"),
            list,
        )
        else []
    )

    return {
        "id": str(
            payload.get("id")
            or path.name
        ),
        "imageId": str(
            payload.get("imageId")
            or ""
        ),
        "selectedClass": (
            payload.get("selectedClass")
        ),
        "status": (
            payload.get("status")
        ),
        "sourceCount": int(
            payload.get("sourceCount")
            or len(
                payload.get("sources")
                or []
            )
        ),
        "itemCount": len(items),
        "createdAt": (
            payload.get("createdAt")
        ),
        "updatedAt": (
            payload.get("updatedAt")
        ),
        "closedAt": (
            payload.get("closedAt")
        ),
        "finalizedAt": (
            payload.get("finalizedAt")
        ),
    }



def _normalize_preparation(
    incoming: dict[str, Any],
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    session_id = _sanitize_session_id(incoming.get("sessionId"))
    image_id = str(incoming.get("imageId") or "").strip()
    selected_class = str(incoming.get("selectedClass") or "").strip()

    if not image_id:
        raise HTTPException(status_code=422, detail="imageId is required")
    if not selected_class:
        raise HTTPException(status_code=422, detail="selectedClass is required")

    source_files = incoming.get("sourceFiles")
    if not isinstance(source_files, list) or not (2 <= len(source_files) <= 3):
        raise HTTPException(
            status_code=422,
            detail="Preparation requires 2 or 3 annotation sources",
        )
    source_files = [str(item or "").strip() for item in source_files]
    if any(not item for item in source_files):
        raise HTTPException(status_code=422, detail="Every source needs an annotation file")

    raw_groups = incoming.get("groups")
    if not isinstance(raw_groups, list) or not raw_groups:
        raise HTTPException(status_code=422, detail="At least one review group is required")

    groups: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    for index, raw in enumerate(raw_groups):
        if not isinstance(raw, dict):
            raise HTTPException(status_code=422, detail=f"Group {index + 1} is invalid")

        group_id = str(raw.get("id") or f"group-{index + 1}").strip()
        if not group_id:
            group_id = f"group-{index + 1}"
        if group_id in seen_ids:
            group_id = f"{group_id}-{index + 1}"
        seen_ids.add(group_id)

        raw_candidates = raw.get("candidates") or []
        candidates_by_source: dict[int, dict[str, Any]] = {}
        for candidate in raw_candidates:
            if not isinstance(candidate, dict):
                continue
            try:
                source_index = int(candidate.get("sourceIndex"))
            except (TypeError, ValueError):
                continue
            if 0 <= source_index < len(source_files):
                candidates_by_source[source_index] = {
                    "sourceIndex": source_index,
                    "geometry": _geometry_or_none(candidate.get("geometry")),
                    "autoGeometry": _geometry_or_none(
                        candidate.get("autoGeometry")
                        if "autoGeometry" in candidate
                        else candidate.get("geometry")
                    ),
                }

        raw_members = raw.get("members") or []
        members_by_source: dict[int, dict[str, Any]] = {}
        for member in raw_members:
            if not isinstance(member, dict):
                continue
            try:
                source_index = int(member.get("sourceIndex"))
            except (TypeError, ValueError):
                continue
            if not (0 <= source_index < len(source_files)):
                continue

            feature_indexes: list[int] = []
            for value in member.get("featureIndexes") or []:
                try:
                    number = int(value)
                except (TypeError, ValueError):
                    continue
                if number >= 0 and number not in feature_indexes:
                    feature_indexes.append(number)

            edited = bool(member.get("edited"))
            members_by_source[source_index] = {
                "sourceIndex": source_index,
                "featureIndexes": feature_indexes,
                "edited": edited,
            }

            if edited:
                candidate = candidates_by_source.setdefault(
                    source_index,
                    {
                        "sourceIndex": source_index,
                        "geometry": None,
                        "autoGeometry": None,
                    },
                )
                # Raw member geometries are accepted only to build the curated
                # candidate. They are not persisted separately.
                candidate["geometry"] = _union_geometry(member.get("geometries") or [])

        candidates = []
        members = []
        for source_index in range(len(source_files)):
            candidates.append(
                candidates_by_source.get(
                    source_index,
                    {
                        "sourceIndex": source_index,
                        "geometry": None,
                        "autoGeometry": None,
                    },
                )
            )
            members.append(
                members_by_source.get(
                    source_index,
                    {
                        "sourceIndex": source_index,
                        "featureIndexes": [],
                        "edited": False,
                    },
                )
            )

        bbox = _combined_bbox(candidates)
        if bbox is None:
            supplied_bbox = raw.get("bbox")
            if isinstance(supplied_bbox, list) and len(supplied_bbox) == 4:
                try:
                    bbox = [float(value) for value in supplied_bbox]
                except (TypeError, ValueError):
                    bbox = None

        groups.append(
            {
                "id": group_id,
                "sourceItemId": raw.get("sourceItemId"),
                "prepared": bool(raw.get("prepared")),
                "bbox": bbox,
                "candidates": candidates,
                "members": members,
                "note": str(raw.get("note") or "")[:4000],
            }
        )

    now = _now_iso()
    previous = previous or {}
    return {
        "schemaVersion": 2,
        "sessionId": session_id,
        "imageId": image_id,
        "selectedClass": selected_class,
        "sourceFiles": source_files,
        "groups": groups,
        "outputAnnotationFile": str(
            incoming.get("outputAnnotationFile")
            or previous.get("outputAnnotationFile")
            or f"Reviewed {selected_class} v2"
        ).strip()[:120],
        "status": "preparation",
        "reviewerToken": None,
        "reviewerCreatedAt": None,
        "decisions": {},
        "generalComment": str(previous.get("generalComment") or "")[:12000],
        "createdAt": previous.get("createdAt") or now,
        "updatedAt": now,
        "publishedAt": None,
        "completedAt": None,
        "finalAnnotationFile": previous.get("finalAnnotationFile"),
    }


def _find_by_token(annotation_root: Path, token: str) -> tuple[Path, dict[str, Any]]:
    token = _sanitize_token(token)
    root = _v2_root(annotation_root)
    if not root.exists():
        raise HTTPException(status_code=404, detail="Reviewer link not found")
    for path in root.glob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if (
            isinstance(payload, dict)
            and payload.get("reviewerToken") == token
            and payload.get("status") in {"ready", "reviewing", "completed"}
        ):
            return path, payload
    raise HTTPException(status_code=404, detail="Reviewer link not found")



# REVIEW_V2_FULL_REVIEW_RESTORE_V1
_REVIEW_V2_CANDIDATE_COLORS = [
    "#ff6b6b",
    "#4dabf7",
    "#69db7c",
    "#7C3AED",
]


def _review_polygonal_shape(value):
    geometry = _geometry_or_none(value)
    if geometry is None:
        return None

    try:
        geom = shape(geometry)
    except Exception:
        return None

    if geom.is_empty:
        return None

    if not geom.is_valid:
        try:
            geom = geom.buffer(0)
        except Exception:
            return None

    if geom.is_empty:
        return None

    if geom.geom_type not in ("Polygon", "MultiPolygon"):
        parts = [
            part
            for part in getattr(geom, "geoms", [])
            if (
                part is not None
                and not part.is_empty
                and part.geom_type in ("Polygon", "MultiPolygon")
            )
        ]

        if not parts:
            return None

        geom = unary_union(parts)

    if geom is None or geom.is_empty:
        return None

    if not geom.is_valid:
        geom = geom.buffer(0)

    if geom.is_empty:
        return None

    return geom


def _review_geom_json(geom):
    if geom is None or geom.is_empty:
        return None

    if not geom.is_valid:
        geom = geom.buffer(0)

    if geom.is_empty:
        return None

    return _geometry_or_none(
        mapping(geom)
    )


def _review_consensus_json(
    source_candidates: list[dict[str, Any]],
):
    geometries = [
        _review_polygonal_shape(
            candidate.get("geometry")
        )
        for candidate in source_candidates
    ]

    # Two annotators:
    # agreement/intersection only.
    if len(geometries) == 2:
        if any(
            geom is None
            for geom in geometries
        ):
            return None

        result = geometries[0].intersection(
            geometries[1]
        )

        return _review_geom_json(result)

    # Three annotators:
    # all pixels supported by at least 2 / 3.
    if len(geometries) == 3:
        pair_votes = []

        for i in range(3):
            for j in range(
                i + 1,
                3,
            ):
                a = geometries[i]
                b = geometries[j]

                if a is None or b is None:
                    continue

                intersection = a.intersection(b)

                if not intersection.is_empty:
                    pair_votes.append(
                        intersection
                    )

        if not pair_votes:
            return None

        return _review_geom_json(
            unary_union(pair_votes)
        )

    return None


def _build_blinded_review_candidates(
    group: dict[str, Any],
    *,
    shuffle: bool,
) -> list[dict[str, Any]]:
    source_candidates = list(
        group.get("candidates") or []
    )

    candidates: list[dict[str, Any]] = []

    for source_index, candidate in enumerate(
        source_candidates
    ):
        candidates.append(
            {
                # Internal mapping only.
                # Never emitted by _reviewer_payload().
                "kind": "source",
                "sourceCandidateIndex": source_index,
                "geometry": _geometry_or_none(
                    candidate.get("geometry")
                ),
            }
        )

    # Consensus is recalculated from the PREPARED geometries,
    # not copied from the original v1.8 session.
    candidates.append(
        {
            "kind": "consensus",
            "sourceCandidateIndex": None,
            "geometry": _review_consensus_json(
                source_candidates
            ),
        }
    )

    if shuffle:
        secrets.SystemRandom().shuffle(
            candidates
        )

    return candidates


def _review_candidates(
    group: dict[str, Any],
) -> list[dict[str, Any]]:
    derived = group.get(
        "reviewCandidates"
    )

    if isinstance(derived, list) and derived:
        return derived

    # Backward-compatible fallback for an old link created
    # before the full-review restoration. Such a link will
    # not gain a new shuffled consensus automatically because
    # that could invalidate existing candidate indexes.
    return list(
        group.get("candidates") or []
    )


def _decision_status(
    decision: dict[str, Any],
) -> str:
    status = str(
        decision.get("status") or ""
    ).strip().lower()

    if status in {
        "pending",
        "accepted",
        "deferred",
    }:
        return status

    # Compatibility with the first Review v2 format.
    if decision.get("deferred"):
        return "deferred"

    if isinstance(
        decision.get("decisionCandidate"),
        int,
    ):
        return "accepted"

    return "pending"


def _reviewer_payload(
    payload: dict[str, Any],
) -> dict[str, Any]:
    decisions = payload.get(
        "decisions"
    ) or {}

    redacted_groups = []

    accepted = 0
    deferred = 0
    pending = 0

    for group_index, group in enumerate(
        payload.get("groups") or []
    ):
        redacted_candidates = []

        for candidate_index, candidate in enumerate(
            _review_candidates(group)
        ):
            geometry = _geometry_or_none(
                candidate.get("geometry")
            )

            # CRITICAL:
            # no kind/source index/source filename/source name
            # is emitted to the reviewer.
            redacted_candidates.append(
                {
                    "index": candidate_index,
                    "label": (
                        f"Candidate "
                        f"{candidate_index + 1}"
                    ),
                    "color": (
                        _REVIEW_V2_CANDIDATE_COLORS[
                            candidate_index
                            % len(
                                _REVIEW_V2_CANDIDATE_COLORS
                            )
                        ]
                    ),
                    "geometry": geometry,
                    "empty": geometry is None,
                }
            )

        group_id = str(
            group.get("id")
        )

        decision = copy.deepcopy(
            decisions.get(group_id) or {}
        )

        status = _decision_status(
            decision
        )

        decision["status"] = status
        decision["deferred"] = (
            status == "deferred"
        )

        if status == "accepted":
            accepted += 1
        elif status == "deferred":
            deferred += 1
        else:
            pending += 1

        redacted_groups.append(
            {
                "id": group_id,
                "index": group_index,
                "bbox": group.get("bbox"),
                "candidates": redacted_candidates,
                "decision": decision,
            }
        )

    return {
        "schemaVersion": 3,
        "imageId": payload.get("imageId"),
        "selectedClass": payload.get(
            "selectedClass"
        ),
        "status": payload.get("status"),
        "groups": redacted_groups,
        "generalComment": (
            payload.get("generalComment") or ""
        ),
        "progress": {
            "total": len(redacted_groups),
            "accepted": accepted,
            "pending": pending,
            "deferred": deferred,
            "remaining": pending + deferred,
        },
        "completedAt": payload.get(
            "completedAt"
        ),
        "finalAnnotationFile": payload.get(
            "finalAnnotationFile"
        ),
    }


def install_review_v2(
    router,
    *,
    annotation_root: Path,
    put_annotations: Callable[..., Any],
    static_root: Path,
) -> None:
    """Install preparation and blinded reviewer-only routes."""

    annotation_root = Path(annotation_root)
    static_root = Path(static_root)
    _v2_root(annotation_root).mkdir(parents=True, exist_ok=True)

    @router.get("/api/review-v2/source-sessions")
    def review_v2_source_sessions() -> dict[str, Any]:
        sessions = [
            _session_summary(path, payload)
            for path, payload in (_iter_source_sessions(annotation_root) or [])
        ]
        sessions.sort(
            key=lambda item: (
                bool(item.get("closedAt")),
                str(item.get("imageId") or ""),
                str(item.get("id") or ""),
            )
        )
        return {"sessions": sessions}

    @router.get("/api/review-v2/source-sessions/{session_id}")
    def review_v2_source_session(session_id: str) -> dict[str, Any]:
        return _find_source_session(annotation_root, session_id)


    @router.get(
        "/api/review-v2/source-sessions/"
        "{session_id}/sources/{source_index}"
    )
    def review_v2_source_document(
        session_id: str,
        source_index: int,
    ) -> dict[str, Any]:
        session_id = (
            _sanitize_session_id(
                session_id
            )
        )

        payload = (
            _find_source_session(
                annotation_root,
                session_id,
            )
        )

        sources = (
            payload.get("sources")
            or []
        )

        source = None

        for candidate in sources:
            try:
                candidate_index = int(
                    candidate.get("index")
                )
            except (
                TypeError,
                ValueError,
                AttributeError,
            ):
                continue

            if (
                candidate_index
                == int(source_index)
            ):
                source = candidate
                break

        if source is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    "Source annotation "
                    "not found"
                ),
            )

        filename = str(
            source.get("file")
            or ""
        ).strip()

        if (
            not filename
            or Path(filename).name
            != filename
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Invalid source "
                    "annotation path"
                ),
            )

        session_path = (
            _source_review_root(
                annotation_root
            )
            / session_id
        ).resolve()

        source_path = (
            session_path
            / filename
        ).resolve()

        if (
            source_path.parent
            != session_path
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Invalid source "
                    "annotation path"
                ),
            )

        if not source_path.is_file():
            raise HTTPException(
                status_code=404,
                detail=(
                    "Source GeoJSON "
                    "not found"
                ),
            )

        document = _read_json(
            source_path
        )

        if (
            not isinstance(
                document,
                dict,
            )
            or not isinstance(
                document.get("features"),
                list,
            )
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "Invalid source "
                    "GeoJSON"
                ),
            )

        return copy.deepcopy(
            document
        )


    @router.get("/api/review-v2/preparations/{session_id}")
    def review_v2_get_preparation(session_id: str) -> dict[str, Any]:
        path = _prep_path(annotation_root, _sanitize_session_id(session_id))
        if not path.exists():
            raise HTTPException(status_code=404, detail="Preparation not created yet")
        return _read_json(path)

    @router.put("/api/review-v2/preparations/{session_id}")
    def review_v2_put_preparation(
        session_id: str,
        payload: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        session_id = _sanitize_session_id(session_id)
        if str(payload.get("sessionId") or session_id) != session_id:
            raise HTTPException(status_code=422, detail="sessionId mismatch")

        _find_source_session(annotation_root, session_id)
        path = _prep_path(annotation_root, session_id)

        with _REVIEW_V2_LOCK:
            previous = _read_json(path) if path.exists() else None
            normalized = _normalize_preparation(
                {**payload, "sessionId": session_id},
                previous,
            )
            _atomic_json(path, normalized)
        return normalized

    @router.post("/api/review-v2/preparations/{session_id}/publish")
    def review_v2_publish(session_id: str) -> dict[str, Any]:
        session_id = _sanitize_session_id(session_id)
        path = _prep_path(annotation_root, session_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Preparation not created yet")

        with _REVIEW_V2_LOCK:
            payload = _read_json(path)
            groups = payload.get("groups") or []
            unprepared = [group.get("id") for group in groups if not group.get("prepared")]
            if unprepared:
                raise HTTPException(
                    status_code=409,
                    detail=f"{len(unprepared)} group(s) are not marked prepared",
                )

            for group in groups:
                group["reviewCandidates"] = (
                    _build_blinded_review_candidates(
                        group,
                        shuffle=True,
                    )
                )

            payload["reviewSchemaVersion"] = 3

            token = secrets.token_urlsafe(24)
            payload["reviewerToken"] = token
            payload["reviewerCreatedAt"] = _now_iso()
            payload["publishedAt"] = _now_iso()
            payload["updatedAt"] = _now_iso()
            payload["status"] = "ready"
            payload["decisions"] = {}
            payload["generalComment"] = ""
            payload["completedAt"] = None
            payload["finalAnnotationFile"] = None
            _atomic_json(path, payload)

        return {
            "published": True,
            "token": token,
            "reviewerPath": f"/review-v2/{token}",
        }

    @router.post("/api/review-v2/preparations/{session_id}/reopen")
    def review_v2_reopen(session_id: str) -> dict[str, Any]:
        session_id = _sanitize_session_id(session_id)
        path = _prep_path(annotation_root, session_id)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Preparation not created yet")

        with _REVIEW_V2_LOCK:
            payload = _read_json(path)

            for group in payload.get("groups") or []:
                group.pop(
                    "reviewCandidates",
                    None,
                )

            payload.pop(
                "reviewSchemaVersion",
                None,
            )
            payload["status"] = "preparation"
            payload["reviewerToken"] = None
            payload["reviewerCreatedAt"] = None
            payload["publishedAt"] = None
            payload["decisions"] = {}
            payload["generalComment"] = ""
            payload["completedAt"] = None
            payload["finalAnnotationFile"] = None
            payload["updatedAt"] = _now_iso()
            _atomic_json(path, payload)
        return payload

    @router.get("/api/review-v2/share/{token}")
    def review_v2_share(token: str) -> dict[str, Any]:
        _path, payload = _find_by_token(annotation_root, token)
        return _reviewer_payload(payload)

    @router.put("/api/review-v2/share/{token}/groups/{group_id}")
    def review_v2_decision(
        token: str,
        group_id: str,
        incoming: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        path, _existing = _find_by_token(
            annotation_root,
            token,
        )

        with _REVIEW_V2_LOCK:
            payload = _read_json(path)

            group = next(
                (
                    item
                    for item in (
                        payload.get("groups") or []
                    )
                    if str(item.get("id"))
                    == str(group_id)
                ),
                None,
            )

            if group is None:
                raise HTTPException(
                    status_code=404,
                    detail="Review group not found",
                )

            candidates = _review_candidates(
                group
            )

            previous = copy.deepcopy(
                (
                    payload.get("decisions")
                    or {}
                ).get(
                    str(group_id)
                )
                or {}
            )

            previous_status = (
                _decision_status(previous)
            )

            candidate_was_supplied = (
                "decisionCandidate"
                in incoming
            )

            if candidate_was_supplied:
                decision_candidate = (
                    incoming.get(
                        "decisionCandidate"
                    )
                )

                if decision_candidate is not None:
                    try:
                        decision_candidate = int(
                            decision_candidate
                        )
                    except (
                        TypeError,
                        ValueError,
                    ) as exc:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Invalid candidate"
                            ),
                        ) from exc

                    if not (
                        0
                        <= decision_candidate
                        < len(candidates)
                    ):
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Invalid candidate"
                            ),
                        )
            else:
                decision_candidate = (
                    previous.get(
                        "decisionCandidate"
                    )
                )

            if "status" in incoming:
                status = str(
                    incoming.get("status")
                    or ""
                ).strip().lower()

                if status not in {
                    "pending",
                    "accepted",
                    "deferred",
                }:
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "Invalid review status"
                        ),
                    )

            elif "deferred" in incoming:
                # Compatibility with original Review v2.
                if bool(
                    incoming.get("deferred")
                ):
                    status = "deferred"
                elif isinstance(
                    decision_candidate,
                    int,
                ):
                    status = "accepted"
                else:
                    status = "pending"

            else:
                status = previous_status

            geometry_supplied = (
                "decisionGeometry"
                in incoming
                or "geometry" in incoming
            )

            if geometry_supplied:
                raw_geometry = (
                    incoming.get(
                        "decisionGeometry"
                    )
                    if "decisionGeometry"
                    in incoming
                    else incoming.get(
                        "geometry"
                    )
                )

                if raw_geometry is None:
                    decision_geometry = None
                else:
                    decision_geometry = (
                        _geometry_or_none(
                            raw_geometry
                        )
                    )

                    if decision_geometry is None:
                        raise HTTPException(
                            status_code=422,
                            detail=(
                                "Invalid edited "
                                "geometry"
                            ),
                        )

            elif (
                candidate_was_supplied
                and isinstance(
                    decision_candidate,
                    int,
                )
            ):
                decision_geometry = (
                    copy.deepcopy(
                        candidates[
                            decision_candidate
                        ].get("geometry")
                    )
                )

            elif candidate_was_supplied:
                decision_geometry = None

            else:
                decision_geometry = (
                    copy.deepcopy(
                        previous.get(
                            "decisionGeometry"
                        )
                    )
                )

            if (
                status == "accepted"
                and not isinstance(
                    decision_candidate,
                    int,
                )
            ):
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Choose a candidate "
                        "before accepting"
                    ),
                )

            if "edited" in incoming:
                edited = bool(
                    incoming.get("edited")
                )
            elif candidate_was_supplied:
                edited = False
            else:
                edited = bool(
                    previous.get("edited")
                )

            now = _now_iso()

            decision = {
                "status": status,
                "decisionCandidate": (
                    decision_candidate
                ),
                "decisionGeometry": (
                    decision_geometry
                ),
                "edited": edited,
                "challenging": bool(
                    incoming.get(
                        "challenging",
                        previous.get(
                            "challenging",
                            False,
                        ),
                    )
                ),
                "deferred": (
                    status == "deferred"
                ),
                "comment": str(
                    incoming.get(
                        "comment",
                        previous.get(
                            "comment",
                            "",
                        ),
                    )
                    or ""
                )[:12000],
                "updatedAt": now,
                "reviewedAt": (
                    now
                    if status
                    in {
                        "accepted",
                        "deferred",
                    }
                    else None
                ),
            }

            payload.setdefault(
                "decisions",
                {},
            )[str(group_id)] = decision

            if payload.get(
                "status"
            ) == "ready":
                payload["status"] = (
                    "reviewing"
                )

            payload["updatedAt"] = now

            _atomic_json(
                path,
                payload,
            )

            progress = _reviewer_payload(
                payload
            )["progress"]

        return {
            "saved": True,
            "decision": decision,
            "progress": progress,
        }


    @router.post("/api/review-v2/share/{token}/geometry/freehand")
    def review_v2_freehand_geometry(
        token: str,
        incoming: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        # Token validation only. The geometry operation itself
        # never exposes source metadata.
        _find_by_token(
            annotation_root,
            token,
        )

        operation = str(
            incoming.get("operation")
            or ""
        ).strip().lower()

        if operation not in {
            "add",
            "subtract",
        }:
            raise HTTPException(
                status_code=422,
                detail=(
                    "operation must be "
                    "add or subtract"
                ),
            )

        base = _review_polygonal_shape(
            incoming.get("geometry")
        )

        stroke = _review_polygonal_shape(
            incoming.get("stroke")
        )

        if base is None or stroke is None:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Freehand edit geometry "
                    "is invalid"
                ),
            )

        result = (
            base.union(stroke)
            if operation == "add"
            else base.difference(stroke)
        )

        result_json = _review_geom_json(
            result
        )

        if result_json is None:
            if operation == "subtract":
                detail = (
                    "This edit would remove "
                    "the entire selected mask"
                )
            else:
                detail = (
                    "Freehand edit did not "
                    "produce a polygonal mask"
                )

            raise HTTPException(
                status_code=422,
                detail=detail,
            )

        return {
            "geometry": result_json,
            "operation": operation,
        }


    @router.post("/api/review-v2/share/{token}/undo-last")
    def review_v2_undo_last(
        token: str,
    ) -> dict[str, Any]:
        path, _existing = _find_by_token(
            annotation_root,
            token,
        )

        with _REVIEW_V2_LOCK:
            payload = _read_json(path)

            decisions = payload.setdefault(
                "decisions",
                {},
            )

            completed = []

            for group in (
                payload.get("groups")
                or []
            ):
                group_id = str(
                    group.get("id")
                )

                decision = decisions.get(
                    group_id
                ) or {}

                if _decision_status(
                    decision
                ) not in {
                    "accepted",
                    "deferred",
                }:
                    continue

                stamp = str(
                    decision.get(
                        "reviewedAt"
                    )
                    or decision.get(
                        "updatedAt"
                    )
                    or ""
                )

                completed.append(
                    (
                        stamp,
                        group_id,
                        decision,
                    )
                )

            if not completed:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "There is no completed "
                        "review decision to undo"
                    ),
                )

            _stamp, group_id, decision = max(
                completed,
                key=lambda item: item[0],
            )

            reopened = copy.deepcopy(
                decision
            )

            reopened["status"] = "pending"
            reopened["deferred"] = False
            reopened["reviewedAt"] = None
            reopened["updatedAt"] = (
                _now_iso()
            )

            decisions[group_id] = reopened

            payload["status"] = "reviewing"
            payload["completedAt"] = None
            payload["finalAnnotationFile"] = None
            payload["updatedAt"] = (
                _now_iso()
            )

            _atomic_json(
                path,
                payload,
            )

            progress = _reviewer_payload(
                payload
            )["progress"]

        return {
            "ok": True,
            "groupId": group_id,
            "decision": reopened,
            "progress": progress,
        }


    @router.put("/api/review-v2/share/{token}/general-comment")
    def review_v2_general_comment(
        token: str,
        incoming: dict[str, Any] = Body(...),
    ) -> dict[str, Any]:
        path, _payload = _find_by_token(annotation_root, token)
        comment = str(incoming.get("comment") or "")[:12000]
        with _REVIEW_V2_LOCK:
            payload = _read_json(path)
            payload["generalComment"] = comment
            payload["updatedAt"] = _now_iso()
            _atomic_json(path, payload)
        return {"saved": True, "comment": comment}

    @router.post("/api/review-v2/share/{token}/complete")
    def review_v2_complete(
        token: str,
    ) -> dict[str, Any]:
        path, payload = _find_by_token(
            annotation_root,
            token,
        )

        groups = payload.get("groups") or []
        decisions = (
            payload.get("decisions") or {}
        )

        unresolved: list[str] = []
        features: list[dict[str, Any]] = []

        for group in groups:
            group_id = str(
                group.get("id")
            )

            decision = decisions.get(
                group_id
            ) or {}

            if _decision_status(
                decision
            ) != "accepted":
                unresolved.append(
                    group_id
                )
                continue

            selected = decision.get(
                "decisionCandidate"
            )

            candidates = _review_candidates(
                group
            )

            if (
                not isinstance(selected, int)
                or not (
                    0
                    <= selected
                    < len(candidates)
                )
            ):
                unresolved.append(
                    group_id
                )
                continue

            if "decisionGeometry" in decision:
                geometry = _geometry_or_none(
                    decision.get(
                        "decisionGeometry"
                    )
                )
            else:
                geometry = _geometry_or_none(
                    candidates[
                        selected
                    ].get("geometry")
                )

            # No annotation is a valid accepted candidate
            # and contributes no feature.
            if geometry is None:
                continue

            internal_candidate = (
                candidates[selected]
            )

            features.append(
                {
                    "type": "Feature",
                    "geometry": geometry,
                    "properties": {
                        "classification": {
                            "name": (
                                payload.get(
                                    "selectedClass"
                                )
                                or "Reviewed"
                            ),
                        },
                        "histoannotator": {
                            "role": "annotation",
                            "reviewV2": {
                                "groupId": group_id,
                                "chosenCandidate": (
                                    selected + 1
                                ),
                                "edited": bool(
                                    decision.get(
                                        "edited"
                                    )
                                ),
                                "consensusUsed": (
                                    internal_candidate.get(
                                        "kind"
                                    )
                                    == "consensus"
                                ),
                                "challenging": bool(
                                    decision.get(
                                        "challenging"
                                    )
                                ),
                                "comment": str(
                                    decision.get(
                                        "comment"
                                    )
                                    or ""
                                ),
                                "reviewedAt": (
                                    decision.get(
                                        "reviewedAt"
                                    )
                                    or decision.get(
                                        "updatedAt"
                                    )
                                ),
                            },
                        },
                    },
                }
            )

        if unresolved:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"{len(unresolved)} "
                    "group(s) are still "
                    "unresolved or deferred"
                ),
            )

        output_name = str(
            payload.get(
                "outputAnnotationFile"
            )
            or (
                "Reviewed "
                f"{payload.get('selectedClass') or 'Annotations'} "
                "v2"
            )
        ).strip()

        feature_collection = {
            "type": "FeatureCollection",
            "features": features,
            "properties": {
                "histoannotator": {
                    "reviewV2": {
                        "sourceSessionId": (
                            payload.get(
                                "sessionId"
                            )
                        ),
                        "selectedClass": (
                            payload.get(
                                "selectedClass"
                            )
                        ),
                        "generalComment": (
                            payload.get(
                                "generalComment"
                            )
                            or ""
                        ),
                        "completedAt": (
                            _now_iso()
                        ),
                    }
                }
            },
        }

        saved = put_annotations(
            str(
                payload.get("imageId")
            ),
            feature_collection,
            file=output_name,
        )

        with _REVIEW_V2_LOCK:
            payload = _read_json(path)

            payload["status"] = "completed"
            payload["completedAt"] = (
                _now_iso()
            )
            payload["updatedAt"] = (
                _now_iso()
            )
            payload["finalAnnotationFile"] = (
                saved.get(
                    "annotationFile"
                )
                or output_name
            )

            _atomic_json(
                path,
                payload,
            )

        return {
            "completed": True,
            "features": len(features),
            "annotationFile": (
                payload[
                    "finalAnnotationFile"
                ]
            ),
        }


    @router.get("/review-preparation-v2")
    def review_v2_preparation_page() -> FileResponse:
        path = static_root / "review_prepare_v2.html"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Review preparation UI not installed")
        return FileResponse(path, media_type="text/html")

    @router.get("/review-v2/{token}")
    def review_v2_reviewer_page(token: str) -> FileResponse:
        _find_by_token(annotation_root, token)
        path = static_root / "reviewer_v2.html"
        if not path.exists():
            raise HTTPException(status_code=404, detail="Reviewer UI not installed")
        return FileResponse(path, media_type="text/html")
