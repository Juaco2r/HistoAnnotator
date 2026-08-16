# Changelog

## [1.1.0] - 2026-08-17

### Added
- Review Mode with per-class/all-annotation review queues, progress tracking, class reassignment, and geometry editing during review.
- Review decisions: Correct, Maybe, Review Later, and Delete.
- Resume behavior for partial reviews and an optional full re-review when a scope is already complete.
- Automatic Review Mode exit 30 seconds after a completed review session.
- Review-specific framing that shows only the current annotation and keeps at least a 1024 × 1024 level-0 pixel field of view for small annotations.
- Annotation Statistics with per-class annotation count, geometric union area in px², and percentage of full image area.
- Automatic physical calibration reading from OpenSlide, OME-TIFF, and TIFF resolution metadata.
- On-screen physical scale bar and approximate digital magnification display.
- Manual per-image calibration override for µm/px and source magnification.

### Changed
- Image Information now presents one symmetric resolution value in µm/px and separates source magnification from current approximate display magnification.
- Scale-bar placement was adjusted to avoid overlap with synchronization/status information.

### Notes
- Manual calibration is stored locally per image/device and does not modify the source image.
- The Android APK remains a debug-signed research/testing build and is not clinically validated.

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
