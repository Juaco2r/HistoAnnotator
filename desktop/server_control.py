from __future__ import annotations

import json
import os
import platform
import signal
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from .config import (
    DesktopConfig,
    ensure_data_directories,
    pid_path,
    runtime_path,
)


class ServerController:
    def __init__(
        self,
        project_root: Path,
    ) -> None:
        self.project_root = (
            project_root
            .expanduser()
            .resolve()
        )

    @staticmethod
    def local_url(port: int) -> str:
        return (
            f"http://127.0.0.1:"
            f"{int(port)}"
        )

    def health(
        self,
        port: int,
        timeout: float = 0.8,
    ) -> dict[str, Any] | None:
        url = (
            self.local_url(port)
            + "/health/live"
        )

        try:
            with urllib.request.urlopen(
                url,
                timeout=timeout,
            ) as response:
                payload = json.loads(
                    response.read()
                )
        except (
            OSError,
            ValueError,
            json.JSONDecodeError,
            urllib.error.URLError,
        ):
            return None

        if (
            isinstance(payload, dict)
            and payload.get("status") == "ok"
        ):
            return payload

        return None

    def wait_until_ready(
        self,
        port: int,
        timeout: float = 20.0,
    ) -> dict[str, Any] | None:
        deadline = (
            time.monotonic()
            + timeout
        )

        while time.monotonic() < deadline:
            result = self.health(
                port,
                timeout=0.6,
            )

            if result:
                return result

            time.sleep(0.2)

        return None

    def read_runtime(
        self,
    ) -> dict[str, Any]:
        path = runtime_path()

        if not path.exists():
            return {}

        try:
            payload = json.loads(
                path.read_text(
                    encoding="utf-8"
                )
            )
        except (
            OSError,
            json.JSONDecodeError,
        ):
            return {}

        return (
            payload
            if isinstance(payload, dict)
            else {}
        )

    def owns_running_server(
        self,
        port: int,
    ) -> bool:
        pid = self.read_pid()

        if (
            pid is None
            or not self._pid_exists(pid)
        ):
            return False

        runtime = self.read_runtime()

        if runtime.get("started_by") != (
            "HistoAnnotator Desktop"
        ):
            return False

        try:
            runtime_port = int(
                runtime.get("port")
            )
        except (TypeError, ValueError):
            return False

        return runtime_port == int(port)

    @staticmethod
    def port_available(
        port: int,
        *,
        share_lan: bool = False,
    ) -> bool:
        host = (
            "0.0.0.0"
            if share_lan
            else "127.0.0.1"
        )

        sock = socket.socket(
            socket.AF_INET,
            socket.SOCK_STREAM,
        )

        try:
            sock.bind(
                (
                    host,
                    int(port),
                )
            )
        except OSError:
            return False
        finally:
            sock.close()

        return True

    def _write_runtime(
        self,
        config: DesktopConfig,
    ) -> Path:
        ensure_data_directories(
            config
        )

        image_root = (
            Path(config.image_root)
            .expanduser()
            .resolve()
        )

        data_root = (
            Path(config.data_root)
            .expanduser()
            .resolve()
        )

        payload = {
            "project_root":
                str(self.project_root),
            "image_root":
                str(image_root),
            "data_root":
                str(data_root),
            "host":
                (
                    "0.0.0.0"
                    if config.share_lan
                    else "127.0.0.1"
                ),
            "port":
                int(config.port),
            "share_lan":
                bool(config.share_lan),
            "started_by":
                "HistoAnnotator Desktop",
        }

        path = runtime_path()

        temporary = path.with_suffix(
            path.suffix + ".tmp"
        )

        temporary.write_text(
            json.dumps(
                payload,
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )

        os.replace(
            temporary,
            path,
        )

        return path

    @staticmethod
    def _pid_exists(pid: int) -> bool:
        if pid <= 0:
            return False

        if platform.system() == "Windows":
            result = subprocess.run(
                [
                    "tasklist",
                    "/FI",
                    f"PID eq {pid}",
                    "/NH",
                ],
                capture_output=True,
                text=True,
                creationflags=getattr(
                    subprocess,
                    "CREATE_NO_WINDOW",
                    0,
                ),
            )
            return str(pid) in result.stdout

        try:
            os.kill(pid, 0)
            return True
        except OSError:
            return False

    @staticmethod
    def read_pid() -> int | None:
        try:
            return int(
                pid_path()
                .read_text(
                    encoding="utf-8"
                )
                .strip()
            )
        except (
            OSError,
            ValueError,
        ):
            return None

    @staticmethod
    def _write_pid(pid: int) -> None:
        pid_path().write_text(
            f"{int(pid)}\n",
            encoding="utf-8",
        )

    @staticmethod
    def _clear_pid() -> None:
        try:
            pid_path().unlink()
        except FileNotFoundError:
            pass

    def _server_command(
        self,
        runtime_file: Path,
    ) -> list[str]:
        if getattr(
            sys,
            "frozen",
            False,
        ):
            return [
                sys.executable,
                "--server-runtime",
                str(runtime_file),
            ]

        return [
            sys.executable,
            "-m",
            "desktop.entrypoint",
            "--server-runtime",
            str(runtime_file),
        ]

    def start(
        self,
        config: DesktopConfig,
    ) -> dict[str, Any]:
        image_root = (
            Path(config.image_root)
            .expanduser()
            .resolve()
        )

        if (
            not config.image_root
            or not image_root.is_dir()
        ):
            raise RuntimeError(
                "Choose a valid image folder first."
            )

        existing = self.health(
            config.port
        )

        if existing:
            if self.owns_running_server(
                config.port
            ):
                return existing

            raise RuntimeError(
                f"Port {int(config.port)} is "
                "already used by another "
                "HistoAnnotator server. "
                "Choose another port."
            )

        if not self.port_available(
            config.port,
            share_lan=config.share_lan,
        ):
            raise RuntimeError(
                f"Port {int(config.port)} is "
                "already in use. "
                "Choose another port."
            )

        runtime_file = (
            self._write_runtime(
                config
            )
        )

        command = (
            self._server_command(
                runtime_file
            )
        )

        kwargs: dict[str, Any] = {
            "cwd":
                str(self.project_root),
            "stdin":
                subprocess.DEVNULL,
            "stdout":
                subprocess.DEVNULL,
            "stderr":
                subprocess.DEVNULL,
            "close_fds":
                True,
        }

        if platform.system() == "Windows":
            kwargs["creationflags"] = (
                getattr(
                    subprocess,
                    "CREATE_NEW_PROCESS_GROUP",
                    0,
                )
                | getattr(
                    subprocess,
                    "DETACHED_PROCESS",
                    0,
                )
                | getattr(
                    subprocess,
                    "CREATE_NO_WINDOW",
                    0,
                )
            )
        else:
            kwargs[
                "start_new_session"
            ] = True

        process = subprocess.Popen(
            command,
            **kwargs,
        )

        self._write_pid(
            process.pid
        )

        ready = self.wait_until_ready(
            config.port
        )

        if ready:
            return ready

        if process.poll() is not None:
            self._clear_pid()

        raise RuntimeError(
            "HistoAnnotator Server did not "
            "become ready."
        )

    def stop(
        self,
        port: int,
    ) -> None:
        pid = self.read_pid()

        if (
            pid is not None
            and not self._pid_exists(pid)
        ):
            self._clear_pid()
            pid = None

        if not self.owns_running_server(
            port
        ):
            if self.health(port):
                raise RuntimeError(
                    "A HistoAnnotator server is "
                    "using this port, but this "
                    "Desktop session did not "
                    "start it."
                )
            return

        if pid is None:
            return

        if platform.system() == "Windows":
            subprocess.run(
                [
                    "taskkill",
                    "/PID",
                    str(pid),
                    "/T",
                ],
                capture_output=True,
                creationflags=getattr(
                    subprocess,
                    "CREATE_NO_WINDOW",
                    0,
                ),
            )
        else:
            try:
                os.kill(
                    pid,
                    signal.SIGTERM,
                )
            except ProcessLookupError:
                pass

        deadline = (
            time.monotonic()
            + 5.0
        )

        while (
            time.monotonic() < deadline
            and self._pid_exists(pid)
        ):
            time.sleep(0.1)

        if self._pid_exists(pid):
            if platform.system() == "Windows":
                subprocess.run(
                    [
                        "taskkill",
                        "/PID",
                        str(pid),
                        "/T",
                        "/F",
                    ],
                    capture_output=True,
                    creationflags=getattr(
                        subprocess,
                        "CREATE_NO_WINDOW",
                        0,
                    ),
                )
            else:
                try:
                    os.kill(
                        pid,
                        signal.SIGKILL,
                    )
                except ProcessLookupError:
                    pass

        self._clear_pid()

    def restart(
        self,
        config: DesktopConfig,
    ) -> dict[str, Any]:
        if self.owns_running_server(
            config.port
        ):
            self.stop(
                config.port
            )
        elif self.health(config.port):
            raise RuntimeError(
                f"Port {int(config.port)} is "
                "already used by another "
                "HistoAnnotator server. "
                "Choose another port."
            )

        return self.start(
            config
        )
