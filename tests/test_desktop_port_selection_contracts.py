from __future__ import annotations

import socket
import unittest
from pathlib import Path

from desktop.server_control import ServerController


ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "desktop" / "desktop_app.py").read_text(encoding="utf-8")
CONTROL = (ROOT / "desktop" / "server_control.py").read_text(encoding="utf-8")
ENTRYPOINT = (ROOT / "desktop" / "entrypoint.py").read_text(encoding="utf-8")
GRADLE = (
    ROOT
    / "android-app"
    / "android"
    / "app"
    / "build.gradle"
).read_text(encoding="utf-8")
WORKFLOW = (
    ROOT
    / ".github"
    / "workflows"
    / "desktop-multiplatform-dev.yml"
).read_text(encoding="utf-8")


class DesktopPortSelectionContracts(unittest.TestCase):
    def test_server_panel_has_explicit_port_selector(self) -> None:
        self.assertIn("QSpinBox", APP)
        self.assertIn('"Server port"', APP)
        self.assertIn("self.port_spin.setRange(", APP)
        self.assertIn('"Apply port"', APP)

    def test_port_change_is_persisted_and_reloads_desktop_view(self) -> None:
        self.assertIn("def apply_server_port(", APP)
        self.assertIn("self.config.port = new_port", APP)
        self.assertIn("save_config(", APP)
        self.assertIn("self.load_desktop_view()", APP)

    def test_port_change_does_not_stop_foreign_server(self) -> None:
        self.assertIn("owned_old_server", APP)
        self.assertIn("owns_running_server(", APP)
        self.assertIn("if owned_old_server:", APP)

    def test_pairing_url_uses_selected_port(self) -> None:
        self.assertIn('f"{self.config.port}"', APP)
        self.assertIn("self.render_qr(", APP)
        self.assertIn("network_url_value()", APP)

    def test_server_controller_rejects_occupied_or_foreign_ports(self) -> None:
        self.assertIn("def port_available(", CONTROL)
        self.assertIn("def owns_running_server(", CONTROL)
        self.assertIn("already used by another", CONTROL)
        self.assertIn("already in use", CONTROL)

    def test_port_available_detects_bound_local_socket(self) -> None:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            sock.bind(("127.0.0.1", 0))
            port = int(sock.getsockname()[1])
            self.assertFalse(
                ServerController.port_available(
                    port,
                    share_lan=False,
                )
            )
        finally:
            sock.close()

    def test_desktop_and_android_versions_are_aligned(self) -> None:
        self.assertIn('DESKTOP_VERSION = "1.2.4"', APP)
        self.assertIn('DESKTOP_VERSION = "1.2.4"', ENTRYPOINT)
        self.assertIn("versionCode 10295", GRADLE)
        self.assertIn('versionName "1.2.4"', GRADLE)
        self.assertEqual(WORKFLOW.count("v1.2.4-rc1"), 4)


if __name__ == "__main__":
    unittest.main()
