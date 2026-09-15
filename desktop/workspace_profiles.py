from __future__ import annotations

import atexit
import json
import os
import platform
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from .config import (
    CONFIG_FILE_NAME,
    DesktopConfig,
    user_config_dir,
)


ACTIVE_WORKSPACE_ENV = "HISTOANNOTATOR_DESKTOP_WORKSPACE"
CONFIG_ROOT_OVERRIDE_ENV = "HISTOANNOTATOR_DESKTOP_CONFIG_DIR"
REGISTRY_FILE_NAME = "workspaces.json"
WORKSPACES_DIR_NAME = "workspaces"
DEFAULT_CONTENT_ROOT_NAME = "HistoAnnotatorWorkspaces"

_WORKSPACE_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
_ACTIVE_LOCK_PATH: Path | None = None


class WorkspaceBusyError(RuntimeError):
    pass


@dataclass(frozen=True)
class WorkspaceProfile:
    id: str
    name: str


def desktop_state_root() -> Path:
    override = str(
        os.environ.get(CONFIG_ROOT_OVERRIDE_ENV, "")
    ).strip()
    if override:
        root = Path(override).expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root
    return user_config_dir()


def registry_path() -> Path:
    return desktop_state_root() / REGISTRY_FILE_NAME


def normalize_workspace_id(value: str) -> str:
    normalized = str(value or "").strip().lower()
    if not _WORKSPACE_ID_RE.fullmatch(normalized):
        raise ValueError("Invalid workspace identifier")
    return normalized


def workspace_state_dir(workspace_id: str) -> Path:
    normalized = normalize_workspace_id(workspace_id)
    root = desktop_state_root() / WORKSPACES_DIR_NAME / normalized
    root.mkdir(parents=True, exist_ok=True)
    return root


def workspace_config_path(workspace_id: str) -> Path:
    return workspace_state_dir(workspace_id) / CONFIG_FILE_NAME


def slugify_workspace_name(value: str) -> str:
    cleaned = re.sub(
        r"[^a-z0-9]+",
        "-",
        str(value or "").strip().lower(),
    ).strip("-")
    return cleaned[:48] or "workspace"


def _atomic_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def _read_registry() -> dict[str, Any]:
    path = registry_path()
    if not path.is_file():
        return {"schemaVersion": 1, "workspaces": []}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"schemaVersion": 1, "workspaces": []}

    rows = payload.get("workspaces", []) if isinstance(payload, dict) else []
    if not isinstance(rows, list):
        rows = []
    return {"schemaVersion": 1, "workspaces": rows}


def _write_registry(profiles: list[WorkspaceProfile]) -> None:
    _atomic_json(
        registry_path(),
        {
            "schemaVersion": 1,
            "workspaces": [asdict(profile) for profile in profiles],
        },
    )


def list_workspaces() -> list[WorkspaceProfile]:
    payload = _read_registry()
    result: list[WorkspaceProfile] = []
    seen: set[str] = set()

    for item in payload.get("workspaces", []):
        if not isinstance(item, dict):
            continue
        try:
            workspace_id = normalize_workspace_id(str(item.get("id", "")))
        except ValueError:
            continue
        name = str(item.get("name", "")).strip()
        if not name or workspace_id in seen:
            continue
        seen.add(workspace_id)
        result.append(WorkspaceProfile(id=workspace_id, name=name))

    return result


def find_workspace(workspace_id: str) -> WorkspaceProfile | None:
    normalized = normalize_workspace_id(workspace_id)
    for profile in list_workspaces():
        if profile.id == normalized:
            return profile
    return None


def read_workspace_config(workspace_id: str) -> DesktopConfig:
    path = workspace_config_path(workspace_id)
    config = DesktopConfig()
    if not path.is_file():
        return config

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return config

    if not isinstance(payload, dict):
        return config

    for key in asdict(config):
        if key in payload:
            setattr(config, key, payload[key])

    try:
        config.port = int(config.port)
    except (TypeError, ValueError):
        config.port = 8020

    if not 1024 <= config.port <= 65535:
        config.port = 8020

    return config


def write_workspace_config(workspace_id: str, config: DesktopConfig) -> None:
    _atomic_json(workspace_config_path(workspace_id), asdict(config))


def _legacy_config_path() -> Path:
    return desktop_state_root() / CONFIG_FILE_NAME


def ensure_initial_workspace() -> list[WorkspaceProfile]:
    profiles = list_workspaces()
    if profiles:
        return profiles

    profile = WorkspaceProfile(id="default", name="Default")
    target = workspace_config_path(profile.id)
    legacy = _legacy_config_path()

    if legacy.is_file() and legacy.resolve() != target.resolve():
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(legacy, target)
    else:
        write_workspace_config(profile.id, DesktopConfig())

    _write_registry([profile])
    return [profile]


def _config_paths(config: DesktopConfig) -> tuple[str, str]:
    image_root = (
        str(Path(config.image_root).expanduser().resolve())
        if config.image_root
        else ""
    )
    data_root = (
        str(Path(config.data_root).expanduser().resolve())
        if config.data_root
        else ""
    )
    return image_root, data_root


def _assert_unique_paths(image_root: Path, data_root: Path) -> None:
    requested_image = str(image_root.expanduser().resolve())
    requested_data = str(data_root.expanduser().resolve())

    for profile in list_workspaces():
        existing = read_workspace_config(profile.id)
        existing_image, existing_data = _config_paths(existing)

        if existing_data and existing_data == requested_data:
            raise ValueError(
                "Another workspace already uses this data folder."
            )
        if existing_image and existing_image == requested_image:
            raise ValueError(
                "Another workspace already uses this image folder."
            )


def _unique_workspace_id(name: str) -> str:
    base = slugify_workspace_name(name)
    existing = {item.id for item in list_workspaces()}

    if base not in existing:
        return base

    for index in range(2, 10000):
        candidate = f"{base}-{index}"
        if candidate not in existing:
            return candidate

    raise RuntimeError("Could not allocate workspace identifier")


def next_suggested_port() -> int:
    ports: list[int] = []
    for profile in list_workspaces():
        try:
            port = int(read_workspace_config(profile.id).port)
        except (TypeError, ValueError):
            continue
        if 1024 <= port <= 65535:
            ports.append(port)

    if not ports:
        return 8020

    return min(max(8020, max(ports) + 1), 65535)


def create_empty_workspace(
    name: str,
    port: int,
    parent_directory: str | Path,
) -> WorkspaceProfile:
    clean_name = str(name or "").strip()
    if not clean_name:
        raise ValueError("Workspace name is required.")
    if len(clean_name) > 100:
        raise ValueError("Workspace name is too long.")

    port = int(port)
    if not 1024 <= port <= 65535:
        raise ValueError("Port must be between 1024 and 65535.")

    for profile in list_workspaces():
        if int(read_workspace_config(profile.id).port) == port:
            raise ValueError(
                f"Port {port} is already assigned to workspace "
                f"'{profile.name}'."
            )

    workspace_id = _unique_workspace_id(clean_name)
    parent = Path(parent_directory).expanduser().resolve()
    workspace_root = parent / workspace_id
    image_root = workspace_root / "images"
    data_root = workspace_root / "data"

    _assert_unique_paths(image_root, data_root)

    image_root.mkdir(parents=True, exist_ok=False)

    for name_part in (
        "annotations",
        "cache",
        "prepared",
        "uploads",
        "reports",
        "trash",
    ):
        (data_root / name_part).mkdir(parents=True, exist_ok=True)

    profile = WorkspaceProfile(id=workspace_id, name=clean_name)
    config = DesktopConfig(
        image_root=str(image_root),
        data_root=str(data_root),
        port=port,
        share_lan=False,
        keep_server_running=True,
        advertised_host="",
    )

    write_workspace_config(profile.id, config)
    profiles = list_workspaces()
    profiles.append(profile)
    _write_registry(profiles)
    return profile


def _pid_exists(pid: int) -> bool:
    if pid <= 0:
        return False

    if platform.system() == "Windows":
        try:
            result = subprocess.run(
                ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
                capture_output=True,
                text=True,
                creationflags=getattr(
                    subprocess,
                    "CREATE_NO_WINDOW",
                    0,
                ),
                timeout=3,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        return str(pid) in (result.stdout or "")

    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    except OSError:
        return False
    return True


def _workspace_lock_path(workspace_id: str) -> Path:
    return workspace_state_dir(workspace_id) / "desktop.lock"


def release_workspace_lock() -> None:
    global _ACTIVE_LOCK_PATH
    path = _ACTIVE_LOCK_PATH
    if path is None:
        return

    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        owner_pid = int(payload.get("pid", -1))
        if owner_pid == os.getpid():
            path.unlink(missing_ok=True)
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass

    _ACTIVE_LOCK_PATH = None


def claim_workspace(workspace_id: str) -> Path:
    global _ACTIVE_LOCK_PATH
    normalized = normalize_workspace_id(workspace_id)
    path = _workspace_lock_path(normalized)

    if path.is_file():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            owner_pid = int(payload.get("pid", -1))
        except (OSError, ValueError, TypeError, json.JSONDecodeError):
            owner_pid = -1

        if (
            owner_pid > 0
            and owner_pid != os.getpid()
            and _pid_exists(owner_pid)
        ):
            raise WorkspaceBusyError(
                "This workspace is already open in another "
                "HistoAnnotator Desktop instance."
            )

        try:
            path.unlink()
        except OSError:
            pass

    payload = json.dumps(
        {"workspaceId": normalized, "pid": os.getpid()},
        ensure_ascii=False,
        indent=2,
    ) + "\n"

    try:
        descriptor = os.open(
            path,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY,
        )
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(payload)
    except FileExistsError as exc:
        raise WorkspaceBusyError(
            "This workspace was opened by another Desktop instance."
        ) from exc

    _ACTIVE_LOCK_PATH = path
    return path


def activate_workspace(workspace_id: str) -> WorkspaceProfile:
    profile = find_workspace(workspace_id)
    if profile is None:
        raise ValueError("Workspace does not exist.")

    claim_workspace(profile.id)
    os.environ[ACTIVE_WORKSPACE_ENV] = profile.id
    return profile


def _profile_summary(profile: WorkspaceProfile) -> str:
    config = read_workspace_config(profile.id)
    return f"{profile.name}  ·  :{config.port}"


def choose_workspace_profile(parent=None) -> WorkspaceProfile | None:
    from PySide6.QtCore import Qt
    from PySide6.QtWidgets import (
        QDialog,
        QDialogButtonBox,
        QFileDialog,
        QFormLayout,
        QHBoxLayout,
        QLabel,
        QLineEdit,
        QListWidget,
        QListWidgetItem,
        QMessageBox,
        QPushButton,
        QSpinBox,
        QVBoxLayout,
        QWidget,
    )

    ensure_initial_workspace()

    dialog = QDialog(parent)
    dialog.setWindowTitle("Choose HistoAnnotator workspace")
    dialog.resize(640, 440)

    layout = QVBoxLayout(dialog)

    heading = QLabel("<b>Choose a workspace</b>")
    layout.addWidget(heading)

    note = QLabel(
        "Each workspace has its own port, images, annotations, reports, "
        "cache, prepared data and uploads. One workspace is active in "
        "this Desktop window."
    )
    note.setWordWrap(True)
    layout.addWidget(note)

    list_widget = QListWidget()
    layout.addWidget(list_widget, 1)

    def refresh_list(preferred_id: str = "") -> None:
        list_widget.clear()
        profiles = ensure_initial_workspace()
        selected_row = 0

        for index, profile in enumerate(profiles):
            item = QListWidgetItem(_profile_summary(profile))
            item.setData(Qt.UserRole, profile.id)
            config = read_workspace_config(profile.id)
            item.setToolTip(
                f"Images: {config.image_root}\n"
                f"Data: {config.data_root}\n"
                f"Port: {config.port}"
            )
            list_widget.addItem(item)
            if profile.id == preferred_id:
                selected_row = index

        if list_widget.count():
            list_widget.setCurrentRow(selected_row)

    refresh_list()

    action_row = QHBoxLayout()
    new_button = QPushButton("+ New workspace")
    action_row.addWidget(new_button)
    action_row.addStretch(1)
    layout.addLayout(action_row)

    buttons = QDialogButtonBox(
        QDialogButtonBox.Open | QDialogButtonBox.Cancel
    )
    layout.addWidget(buttons)

    selected_profile: dict[str, Any] = {"value": None}

    def create_new() -> None:
        create_dialog = QDialog(dialog)
        create_dialog.setWindowTitle("Create HistoAnnotator workspace")
        create_layout = QVBoxLayout(create_dialog)

        form = QFormLayout()
        create_layout.addLayout(form)

        name_input = QLineEdit()
        name_input.setPlaceholderText("Example: LUSC Study")
        form.addRow("Workspace name", name_input)

        port_input = QSpinBox()
        port_input.setRange(1024, 65535)
        port_input.setValue(next_suggested_port())
        form.addRow("Server port", port_input)

        location_widget = QWidget()
        location_row = QHBoxLayout(location_widget)
        location_row.setContentsMargins(0, 0, 0, 0)

        location_input = QLineEdit(
            str(Path.home() / DEFAULT_CONTENT_ROOT_NAME)
        )
        location_row.addWidget(location_input, 1)

        browse = QPushButton("Browse…")
        location_row.addWidget(browse)
        form.addRow("Parent folder", location_widget)

        location_note = QLabel(
            "A new folder will be created here with images/ and data/. "
            "Existing workspace content is not reused."
        )
        location_note.setWordWrap(True)
        create_layout.addWidget(location_note)

        create_buttons = QDialogButtonBox(
            QDialogButtonBox.Save | QDialogButtonBox.Cancel
        )
        create_layout.addWidget(create_buttons)

        def browse_parent() -> None:
            selected = QFileDialog.getExistingDirectory(
                create_dialog,
                "Choose parent folder",
                location_input.text() or str(Path.home()),
            )
            if selected:
                location_input.setText(selected)

        browse.clicked.connect(browse_parent)

        def save_new() -> None:
            try:
                profile = create_empty_workspace(
                    name_input.text(),
                    port_input.value(),
                    location_input.text(),
                )
            except Exception as error:
                QMessageBox.critical(
                    create_dialog,
                    "Could not create workspace",
                    str(error),
                )
                return

            create_dialog.setProperty(
                "createdWorkspaceId",
                profile.id,
            )
            create_dialog.accept()

        create_buttons.accepted.connect(save_new)
        create_buttons.rejected.connect(create_dialog.reject)

        if create_dialog.exec() == QDialog.Accepted:
            created_id = str(
                create_dialog.property("createdWorkspaceId") or ""
            )
            refresh_list(created_id)

    new_button.clicked.connect(create_new)

    def open_selected() -> None:
        item = list_widget.currentItem()
        if item is None:
            QMessageBox.information(
                dialog,
                "Choose workspace",
                "Select a workspace first.",
            )
            return

        workspace_id = str(item.data(Qt.UserRole) or "")

        try:
            profile = activate_workspace(workspace_id)
        except WorkspaceBusyError as error:
            QMessageBox.warning(
                dialog,
                "Workspace already open",
                str(error),
            )
            return
        except Exception as error:
            QMessageBox.critical(
                dialog,
                "Could not open workspace",
                str(error),
            )
            return

        selected_profile["value"] = profile
        dialog.accept()

    buttons.accepted.connect(open_selected)
    buttons.rejected.connect(dialog.reject)
    list_widget.itemDoubleClicked.connect(lambda _item: open_selected())

    if dialog.exec() != QDialog.Accepted:
        return None

    return selected_profile["value"]


atexit.register(release_workspace_lock)
