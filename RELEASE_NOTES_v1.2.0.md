# HistoAnnotator v1.2.0

HistoAnnotator v1.2.0 expands the project from a Web + Android annotator into a
cross-platform research annotation environment with standalone Desktop builds,
Android local-image support and explicit Desktop-to-Android pairing.

## Highlights

- Standalone HistoAnnotator Desktop for Windows, Linux and macOS.
- Independent Desktop image, annotation, cache, prepared-image and upload data.
- Desktop **Start Server** mode with explicit LAN URL and QR code.
- Android **Scan QR** pairing from Connection settings.
- Android runtime server switching with no deployment-specific IP embedded in
  the public APK.
- Native Android HTTP transport for API calls and image tiles.
- Android local TIFF/image workflow with persistent local-image access.
- Bundled pyvips/libvips preparation for large generic TIFF files.
- OpenSlide / Deep Zoom / OpenSeadragon image viewing.
- QuPath-compatible GeoJSON import/export and sharing.
- Review mode, annotation statistics and calibration.
- H&E, H-DAB and supported multichannel fluorescence display controls.

## Downloads

- **Windows x64:** `HistoAnnotator-v1.2.0-Windows-x64.zip`
- **Linux x64:** `HistoAnnotator-v1.2.0-Linux-x64.tar.gz`
- **macOS Apple Silicon:** `HistoAnnotator-v1.2.0-macOS-AppleSilicon.tar.gz`
- **macOS Intel:** `HistoAnnotator-v1.2.0-macOS-Intel.tar.gz`
- **Android:** `HistoAnnotator-v1.2.0-Android.apk`
- **Checksums:** `SHA256SUMS.txt`

Extract the complete Desktop archive before starting HistoAnnotator. Do not
move only the executable from its packaged directory.

## Desktop and pairing

Desktop runs an independent local backend. Select an image folder, work
locally, or press **Start Server** to make the session reachable on a trusted
LAN/VPN.

On Android use:

`File → Connection settings → Scan QR`

Large generic TIFF files that need preparation are converted into a tiled
pyramidal TIFF in the writable HistoAnnotator data directory. The source image
is not modified.

## Android

The public APK is generic. Select a server at runtime by entering an HTTP/HTTPS
URL or scanning the Desktop QR. Deployment-specific institutional CA files are
not included in the public APK.

Android also supports supported local TIFF/images independently from a remote
server.

## Validation

The v1.2.0 release candidate was manually tested on Windows x64, Linux x64 and
Android. macOS Intel and Apple Silicon artifacts are built and package-tested
in GitHub Actions but are currently unsigned.

The release workflow validates OpenSlide and pyvips/libvips, extracts each
Desktop archive and runs the packaged self-test before publication.

## Research software

HistoAnnotator is research software. It is not clinically validated medical
software and does not currently provide individual user authentication, a
complete audit trail or regulatory controls.

Desktop server mode should be used only on a trusted LAN/VPN unless additional
security controls are deployed.
