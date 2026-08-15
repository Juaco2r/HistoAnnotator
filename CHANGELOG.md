# Changelog

## [1.0.0] - Pre-release

First public HistoAnnotator pre-release.

### Added

- Capacitor Android application
- Tablet-oriented annotation interface
- Local-first offline image viewing
- Offline annotation persistence and synchronization
- Local geometry operations using polygon-clipping
- GeoJSON sharing on Android
- Improved QuPath GeoJSON import/export
- Multi-object selection
- Merge, intersection and subtraction
- Circle annotation tool
- Unified Brush behavior
- Shift-assisted additive drawing and multi-selection
- Portrait tablet layout improvements
- Increased high-resolution zoom capability
- Scientific multichannel TIFF fluorescence support
- Per-channel visibility, false colors, Min/Max, gamma and brightness
- Automatic fluorescence display ranges
- OME channel-name support when metadata is available

### Changed

- Application version standardized as 1.0.0
- Android web assets are generated from the main frontend source
- Display settings can persist per image

### Known limitations

- Research/testing pre-release; not clinically validated
- No individual authentication or audit trail
- Offline IF currently caches rendered display variants rather than raw channels
- Some image-aware tools may require the backend while offline
- Complex T/Z/C scientific datasets are not fully supported yet
- Development APK is debug-signed
