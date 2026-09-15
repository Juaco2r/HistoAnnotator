from __future__ import annotations

import importlib
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class DesktopWorkspaceProfilesContracts(unittest.TestCase):
    def test_workspace_module_exists(self):
        path = ROOT / "desktop/workspace_profiles.py"
        self.assertTrue(path.is_file())
        source = path.read_text(encoding="utf-8")
        self.assertIn("choose_workspace_profile", source)
        self.assertIn("create_empty_workspace", source)
        self.assertIn("WorkspaceBusyError", source)

    def test_desktop_launch_chooses_workspace_before_window(self):
        source = (
            ROOT / "desktop/desktop_app.py"
        ).read_text(encoding="utf-8")
        chooser = source.index("choose_workspace_profile")
        window = source.rindex("window = DesktopWindow()")
        self.assertLess(chooser, window)

    def test_config_runtime_and_pid_are_workspace_scoped(self):
        source = (
            ROOT / "desktop/config.py"
        ).read_text(encoding="utf-8")
        self.assertIn("HISTOANNOTATOR_DESKTOP_WORKSPACE", source)
        self.assertIn("def _active_workspace_state_dir", source)
        self.assertIn('"workspaces"', source)

    def test_workspace_data_contract_includes_report_and_trash(self):
        config_source = (
            ROOT / "desktop/config.py"
        ).read_text(encoding="utf-8")
        runner_source = (
            ROOT / "desktop/server_runner.py"
        ).read_text(encoding="utf-8")
        self.assertIn('"reports"', config_source)
        self.assertIn('"trash"', config_source)
        self.assertIn('storage["REPORT_ROOT"]', runner_source)
        self.assertIn('storage["TRASH_ROOT"]', runner_source)

    def test_desktop_backend_has_current_image_manager_key(self):
        source = (
            ROOT / "desktop/server_runner.py"
        ).read_text(encoding="utf-8")
        self.assertIn('"HISTO_ADMIN_KEY"', source)
        self.assertIn('"12345"', source)

    def test_pyinstaller_includes_workspace_module(self):
        source = (
            ROOT / "HistoAnnotatorDesktop.spec"
        ).read_text(encoding="utf-8")
        self.assertIn('"desktop.workspace_profiles"', source)

    def test_two_profiles_get_separate_state_paths(self):
        import desktop.config as config

        with tempfile.TemporaryDirectory() as tmp:
            with patch.dict(
                os.environ,
                {
                    "HISTOANNOTATOR_DESKTOP_CONFIG_DIR": tmp,
                    "HISTOANNOTATOR_DESKTOP_WORKSPACE": "alpha",
                },
                clear=False,
            ):
                importlib.reload(config)

                alpha = (
                    config.config_path(),
                    config.runtime_path(),
                    config.pid_path(),
                )

                os.environ[
                    "HISTOANNOTATOR_DESKTOP_WORKSPACE"
                ] = "beta"

                beta = (
                    config.config_path(),
                    config.runtime_path(),
                    config.pid_path(),
                )

                self.assertNotEqual(alpha, beta)
                self.assertIn("alpha", str(alpha[0]))
                self.assertIn("beta", str(beta[0]))

        importlib.reload(config)

    def test_create_empty_workspace_builds_isolated_tree(self):
        import desktop.config as config
        import desktop.workspace_profiles as workspaces

        with tempfile.TemporaryDirectory() as tmp:
            state = Path(tmp) / "state"
            content = Path(tmp) / "content"

            with patch.dict(
                os.environ,
                {
                    "HISTOANNOTATOR_DESKTOP_CONFIG_DIR": str(state),
                },
                clear=False,
            ):
                os.environ.pop(
                    "HISTOANNOTATOR_DESKTOP_WORKSPACE",
                    None,
                )

                importlib.reload(config)
                importlib.reload(workspaces)

                workspaces.ensure_initial_workspace()

                profile = workspaces.create_empty_workspace(
                    "LUSC Study",
                    8021,
                    content,
                )

                saved = workspaces.read_workspace_config(profile.id)
                image_root = Path(saved.image_root)
                data_root = Path(saved.data_root)

                self.assertTrue(image_root.is_dir())

                for name in (
                    "annotations",
                    "cache",
                    "prepared",
                    "uploads",
                    "reports",
                    "trash",
                ):
                    self.assertTrue((data_root / name).is_dir())

                self.assertEqual(saved.port, 8021)

                registry = json.loads(
                    workspaces.registry_path().read_text(
                        encoding="utf-8"
                    )
                )
                self.assertGreaterEqual(
                    len(registry["workspaces"]),
                    2,
                )

        importlib.reload(config)
        importlib.reload(workspaces)


if __name__ == "__main__":
    unittest.main()
