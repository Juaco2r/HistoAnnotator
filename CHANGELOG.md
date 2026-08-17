# Changelog

## 1.2.0 - 2026-08-18

### Added

- Standalone HistoAnnotator Desktop for Windows, Linux and macOS.
- Desktop local backend with independent image, annotation, cache and prepared
  data directories.
- Desktop LAN server mode with explicit address and QR code.
- Android QR pairing from Connection settings.
- Android runtime server selection without a private server IP embedded in the
  public APK.
- Android native HTTP transport for reliable remote API and tile requests.
- Android local TIFF/image workflow with persistent local-image access.
- Multi-platform Desktop GitHub Actions builds.
- Bundled pyvips/libvips runtime for Desktop large-image preparation.

### Improved

- Large generic TIFF files are converted to a known tiled pyramidal TIFF before
  Deep Zoom viewing.
- Windows/Linux/macOS artifacts are archived before upload and validated after
  extraction.
- Generic Android APK supports trusted-LAN HTTP and Android user-installed CAs.
- QuPath-compatible GeoJSON workflows, review mode, statistics, calibration and
  image display controls remain available.

### Security / scope

- No deployment-specific server IP is committed to the public repository.
- No institutional/private CA is included in the public release APK.
- HistoAnnotator remains research software without individual authentication,
  complete audit trails or clinical validation.
