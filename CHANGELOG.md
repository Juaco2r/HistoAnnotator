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

### Fixed

- Windows Desktop artifacts preserve the PySide6/Shiboken runtime layout after
  extraction.
- Windows post-archive validation checks the packaged process exit code
  directly.
- Android server and tile requests use the native transport when required,
  avoiding WebView-only fetch failures.
- Trusted-LAN HTTP remains enabled in the packaged generic Android APK.
- Desktop large generic TIFF preparation uses the bundled pyvips/libvips
  runtime rather than requiring a separate system installation.

### Security / scope

- No deployment-specific server IP is committed to the public repository.
- No institutional/private CA is included in the public release APK.
- HistoAnnotator remains research software without individual authentication,
  complete audit trails or clinical validation.
