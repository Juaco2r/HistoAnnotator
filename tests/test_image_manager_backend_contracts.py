from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SERVICE = (ROOT / "app/imaging/service.py").read_text(encoding="utf-8")
COMPOSE = (ROOT / "docker-compose.instance.yml").read_text(encoding="utf-8")


class ImageManagerBackendContracts(unittest.TestCase):
    def test_admin_key_is_server_environment_configuration(self):
        self.assertIn('HISTO_ADMIN_KEY', SERVICE)
        self.assertIn('_image_manager_hmac.compare_digest', SERVICE)
        self.assertIn('HISTO_ADMIN_KEY: ${HISTO_ADMIN_KEY:-}', COMPOSE)

    def test_dev_instance_image_root_is_writable(self):
        self.assertIn('${HISTO_IMAGE_ROOT}:/data/images', COMPOSE)
        self.assertNotIn('${HISTO_IMAGE_ROOT}:/data/images:ro', COMPOSE)

    def test_manager_routes_exist(self):
        for route in (
            '/api/image-manager/unlock',
            '/api/image-manager/catalog',
            '/api/image-manager/rename',
            '/api/image-manager/delete',
            '/api/image-manager/export',
        ):
            self.assertIn(route, SERVICE)

    def test_delete_is_recoverable_soft_delete(self):
        self.assertIn('_IMAGE_MANAGER_TRASH_ROOT', SERVICE)
        self.assertIn('_image_manager_shutil.move', SERVICE)
        self.assertIn('"softDelete": True', SERVICE)

    def test_export_includes_source_data_and_excludes_derived_cache(self):
        self.assertIn('"images"', SERVICE)
        self.assertIn('"annotations"', SERVICE)
        self.assertIn('"reports"', SERVICE)
        self.assertIn('"excludedDerivedData"', SERVICE)
        self.assertIn('"prepared"', SERVICE)
        self.assertIn('"cache"', SERVICE)

    def test_report_server_storage_is_available(self):
        self.assertIn('/api/reports/{image_id}', SERVICE)
        self.assertIn('REPORT_ROOT', COMPOSE)
        self.assertIn('${HISTO_DATA_ROOT}/reports:/data/reports', COMPOSE)

    def test_rename_preserves_physical_image_identity(self):
        self.assertIn('"physicalFileRenamed": False', SERVICE)
        self.assertIn('display-name alias', SERVICE)


if __name__ == "__main__":
    unittest.main()
