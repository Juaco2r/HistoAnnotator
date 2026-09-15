from __future__ import annotations

import json
import os
import platform
from dataclasses import asdict, dataclass
from pathlib import Path

APP_DIR_NAME = "HistoAnnotator"
CONFIG_FILE_NAME = "desktop.json"
RUNTIME_FILE_NAME = "server-runtime.json"
PID_FILE_NAME = "server.pid"


def user_config_dir() -> Path:
    system = platform.system().lower()

    if system == "windows":
        root = Path(
            os.environ.get(
                "APPDATA",
                str(Path.home() / "AppData" / "Roaming"),
            )
        )
        return root / APP_DIR_NAME

    if system == "darwin":
        return (
            Path.home()
            / "Library"
            / "Application Support"
            / APP_DIR_NAME
        )

    root = Path(
        os.environ.get(
            "XDG_CONFIG_HOME",
            str(Path.home() / ".config"),
        )
    )
    return root / APP_DIR_NAME


def default_data_root() -> Path:
    return Path.home() / "HistoAnnotatorData"


@dataclass
class DesktopConfig:
    image_root: str = ""
    data_root: str = str(default_data_root())
    port: int = 8765
    share_lan: bool = False
    keep_server_running: bool = True
    advertised_host: str = ""

    @property
    def annotations_root(self) -> Path:
        return Path(self.data_root) / "annotations"

    @property
    def tile_cache_root(self) -> Path:
        return Path(self.data_root) / "cache"

    @property
    def prepared_root(self) -> Path:
        return Path(self.data_root) / "prepared"

    @property
    def upload_root(self) -> Path:
        return Path(self.data_root) / "uploads"


def config_path() -> Path:
    directory = user_config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    return directory / CONFIG_FILE_NAME


def runtime_path() -> Path:
    directory = user_config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    return directory / RUNTIME_FILE_NAME


def pid_path() -> Path:
    directory = user_config_dir()
    directory.mkdir(parents=True, exist_ok=True)
    return directory / PID_FILE_NAME


def load_config() -> DesktopConfig:
    path = config_path()

    if not path.exists():
        return DesktopConfig()

    try:
        payload = json.loads(
            path.read_text(encoding="utf-8")
        )
    except (OSError, json.JSONDecodeError):
        return DesktopConfig()

    config = DesktopConfig()

    for key in asdict(config):
        if key in payload:
            setattr(config, key, payload[key])

    try:
        config.port = int(config.port)
    except (TypeError, ValueError):
        config.port = 8765

    if not 1024 <= config.port <= 65535:
        config.port = 8765

    config.share_lan = bool(config.share_lan)
    config.keep_server_running = bool(
        config.keep_server_running
    )

    return config


def save_config(config: DesktopConfig) -> None:
    path = config_path()
    temporary = path.with_suffix(
        path.suffix + ".tmp"
    )

    temporary.write_text(
        json.dumps(
            asdict(config),
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )

    os.replace(temporary, path)


def ensure_data_directories(
    config: DesktopConfig,
) -> None:
    Path(config.data_root).expanduser().mkdir(
        parents=True,
        exist_ok=True,
    )

    for directory in (
        config.annotations_root,
        config.tile_cache_root,
        config.prepared_root,
        config.upload_root,
    ):
        directory.expanduser().mkdir(
            parents=True,
            exist_ok=True,
        )

# === HistoAnnotator Desktop workspace profiles v1 ===
#
# These functions intentionally override the legacy single-session paths.
# Existing load_config()/save_config() resolve config_path() at call time,
# so each Desktop instance automatically uses the selected workspace.

ACTIVE_WORKSPACE_ENV = "HISTOANNOTATOR_DESKTOP_WORKSPACE"
DESKTOP_CONFIG_ROOT_OVERRIDE_ENV = "HISTOANNOTATOR_DESKTOP_CONFIG_DIR"


def _workspace_safe_id(value: str) -> str:
    import re as _workspace_re

    cleaned = str(value or "").strip().lower()
    if not _workspace_re.fullmatch(
        r"[a-z0-9][a-z0-9_-]{0,63}",
        cleaned,
    ):
        return ""
    return cleaned


def _workspace_config_root() -> Path:
    override = str(
        os.environ.get(
            DESKTOP_CONFIG_ROOT_OVERRIDE_ENV,
            "",
        )
    ).strip()

    if override:
        root = Path(override).expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
        return root

    return user_config_dir()


def _active_workspace_state_dir() -> Path:
    root = _workspace_config_root()
    workspace_id = _workspace_safe_id(
        os.environ.get(ACTIVE_WORKSPACE_ENV, "")
    )

    if not workspace_id:
        root.mkdir(parents=True, exist_ok=True)
        return root

    directory = root / "workspaces" / workspace_id
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def config_path() -> Path:
    return _active_workspace_state_dir() / CONFIG_FILE_NAME


def runtime_path() -> Path:
    return _active_workspace_state_dir() / RUNTIME_FILE_NAME


def pid_path() -> Path:
    return _active_workspace_state_dir() / PID_FILE_NAME


def ensure_data_directories(config: DesktopConfig) -> None:
    data_root = Path(config.data_root).expanduser()
    data_root.mkdir(parents=True, exist_ok=True)

    for name in (
        "annotations",
        "cache",
        "prepared",
        "uploads",
        "reports",
        "trash",
    ):
        (data_root / name).mkdir(parents=True, exist_ok=True)


# === End HistoAnnotator Desktop workspace profiles v1 ===
