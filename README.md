# HistoAnnotator

[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.21941344.svg)](https://doi.org/10.5281/zenodo.21941344)

HistoAnnotator is a web, Android and desktop application for interactive annotation
of histology and microscopy images.

It is designed for research workflows involving whole-slide images,
standard raster images, scientific multichannel fluorescence TIFF files,
and QuPath-compatible GeoJSON annotations.

> **Research software**
>
> HistoAnnotator v1.2.0 is a public research-software release intended for research and testing.
> It is not clinically validated medical software and currently does not
> provide individual authentication, audit trails, or regulatory controls.

## Main features

- OpenSlide-based whole-slide image viewing
- Deep Zoom / OpenSeadragon navigation
- Freehand, Brush, Polygon, Rectangle, Circle and Wand tools
- Multi-object selection
- Merge, intersection and subtraction operations
- Annotation classes and colors
- Undo / redo
- QuPath-compatible GeoJSON import and export
- GeoJSON sharing from Android
- Local-first annotation storage
- Downloaded image viewing without a continuous server connection
- Android tablet support through Capacitor
- H&E and H-DAB display visualization
- Scientific multichannel fluorescence TIFF visualization
- Per-channel false color, Min/Max, gamma and brightness controls

## Multichannel fluorescence

HistoAnnotator preserves supported scientific fluorescence channels instead
of converting the source image to RGB before visualization.

For supported TIFF files it provides:

- independent channel visibility;
- false-color assignment;
- automatic display range estimation;
- per-channel minimum and maximum display values;
- gamma adjustment;
- per-channel brightness;
- persistent display settings per image.

Display operations are non-destructive. Raw scientific pixel values are
not modified.

OME metadata and channel names are used when available.

The current multichannel implementation primarily supports three-dimensional
multichannel TIFF datasets with spatial Y/X axes and 2-16 channels.

Some non-OME TIFF files may expose a small leading dimension as Z even when
the planes represent fluorescence channels. HistoAnnotator can interpret
that leading axis as channels when the image is explicitly configured as
**Fluorescence**.

See [Multichannel fluorescence](docs/MULTICHANNEL_IF.md).

## Download v1.2.0

The GitHub v1.2.0 release provides:

- `HistoAnnotator-v1.2.0-Windows-x64.zip`
- `HistoAnnotator-v1.2.0-Linux-x64.tar.gz`
- `HistoAnnotator-v1.2.0-macOS-AppleSilicon.tar.gz`
- `HistoAnnotator-v1.2.0-macOS-Intel.tar.gz`
- `HistoAnnotator-v1.2.0-Android.apk`
- `SHA256SUMS.txt`

Windows and Linux Desktop builds were manually tested in the v1.2.0 release
candidate. macOS builds are produced and packaged-self-tested in CI but remain
unsigned. The Android APK is a debug-signed research/testing build.

For local standalone use, Desktop is the simplest option. Docker remains
available for server/browser deployments.

## Quick start with Docker

### Requirements

- Git
- Docker Engine
- Docker Compose v2

Clone the repository:

```bash
git clone https://github.com/Juaco2r/HistoAnnotator.git
cd HistoAnnotator
```

Create local storage directories:

```bash
mkdir -p \
  data/images \
  data/annotations \
  data/cache \
  data/prepared \
  data/uploads
```

Place one or more test images in:

```text
data/images/
```

Start HistoAnnotator:

```bash
docker compose \
  -f docker-compose.standalone.yml \
  up -d --build
```

Check the service:

```bash
docker compose \
  -f docker-compose.standalone.yml \
  ps

curl http://127.0.0.1:8020/health/live
```

Open HistoAnnotator in a browser:

```text
http://127.0.0.1:8020/
```

Stop the application:

```bash
docker compose \
  -f docker-compose.standalone.yml \
  down
```

Images, annotations and cache data remain in the local `data/` directory.

For detailed configuration see
[Installation](docs/INSTALLATION.md).

## Desktop

HistoAnnotator v1.2.0 provides standalone Desktop builds for Windows, Linux,
and macOS.

Desktop mode runs its own local HistoAnnotator backend. Choose an image folder,
then optionally press **Start Server** to share that session over a trusted
LAN/VPN. The panel shows the LAN URL and a QR code.

On Android use:

```text
File → Connection settings → Scan QR
```

Large generic TIFF files are prepared with the bundled pyvips/libvips runtime
before Deep Zoom viewing.

Release assets:

- `HistoAnnotator-v1.2.0-Windows-x64.zip`
- `HistoAnnotator-v1.2.0-Linux-x64.tar.gz`
- `HistoAnnotator-v1.2.0-macOS-AppleSilicon.tar.gz`
- `HistoAnnotator-v1.2.0-macOS-Intel.tar.gz`

See [Desktop](docs/DESKTOP.md).

## Android

HistoAnnotator v1.2.0 uses a generic Android APK: no private server address is
embedded in the public build.

After installing the APK, open:

```text
File → Connection settings
```

Enter an `http://` or `https://` server URL manually, or use **Scan QR** with a
HistoAnnotator Desktop server.

The generic APK supports trusted-LAN HTTP for Desktop server mode and trusts
Android system/user certificate authorities. Institutional/private CA files are
never committed to the public repository.

Release asset:

```text
HistoAnnotator-v1.2.0-Android.apk
```

For local development and optional institutional CA configuration see
[Android build](docs/ANDROID.md).

## QuPath interoperability

Annotations are represented as GeoJSON features using level-0 image pixel
coordinates.

HistoAnnotator supports importing and exporting QuPath-compatible GeoJSON,
including annotation classification information.

## Offline mode

Downloaded images can be opened using locally cached tiles and annotations.
Local changes can later synchronize with the server.

The current multichannel fluorescence implementation caches rendered
display variants. It does not yet download every raw scientific channel
for unrestricted offline recomposition.

See [Offline mode](docs/OFFLINE_MODE.md).

## Documentation

- [Installation](docs/INSTALLATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Android](docs/ANDROID.md)
- [Desktop](docs/DESKTOP.md)
- [Offline mode](docs/OFFLINE_MODE.md)
- [Multichannel fluorescence](docs/MULTICHANNEL_IF.md)
- [Annotation tools](docs/ANNOTATION_TOOLS.md)

## Data privacy

Do not commit research or patient data to this repository.

In particular, do not commit:

- whole-slide images;
- microscopy datasets;
- patient-identifiable files;
- annotations containing sensitive information;
- `.env` files;
- passwords or API tokens;
- private TLS keys;
- Android signing keystores.

HistoAnnotator should be deployed according to the data-governance,
security and ethics requirements of the institution using it.

## Current limitations

HistoAnnotator v1.2.0 is research software.

Current limitations include:

- no individual user authentication;
- no complete audit trail;
- no clinical validation;
- debug-signed Android APK;
- offline IF stores rendered variants rather than all raw channels;
- some image-aware operations may still require the backend;
- complex T/Z/C scientific datasets are not fully supported yet.

## Project status

**v1.2.0** adds Android local-image mode, runtime server pairing, QR pairing, and standalone Desktop builds.

The Android APK distributed with this release is provided for research,
development and testing purposes.
