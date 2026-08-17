# Installation

## Standalone Desktop release

For most local research use, HistoAnnotator Desktop v1.2.0 is the simplest
installation. It includes the HistoAnnotator backend, OpenSlide, pyvips/libvips
and the web interface.

Choose the asset for your platform:

| Platform | Asset |
| --- | --- |
| Windows x64 | `HistoAnnotator-v1.2.0-Windows-x64.zip` |
| Linux x64 | `HistoAnnotator-v1.2.0-Linux-x64.tar.gz` |
| macOS Apple Silicon | `HistoAnnotator-v1.2.0-macOS-AppleSilicon.tar.gz` |
| macOS Intel | `HistoAnnotator-v1.2.0-macOS-Intel.tar.gz` |

Extract the complete archive. Do not move only the executable: Qt, OpenSlide,
libvips and the Python runtime use accompanying files.

On first start, choose the image folder. HistoAnnotator keeps annotations,
cache, prepared TIFFs and uploads in its writable data directory. Large generic
TIFF files may be converted on first open to a tiled pyramidal TIFF; the source
file is not modified.

Windows x64 and Linux x64 were manually tested during the v1.2.0 release
candidate. macOS artifacts are built and packaged-self-tested in CI but are
currently unsigned.

See [HistoAnnotator Desktop](DESKTOP.md).

## Android release

Install `HistoAnnotator-v1.2.0-Android.apk`.

Open **File → Connection settings** and either enter a server URL or scan the QR
shown by HistoAnnotator Desktop. The public APK contains no private deployment
address or institutional CA.

See [Android](ANDROID.md).

## Docker / browser deployment

### Requirements

- Git
- Docker Engine
- Docker Compose v2
- Approximately 2 GB of free disk space in addition to image data

The image uses Python 3.12 and installs OpenSlide, libvips and the required
Python dependencies.

### Clone

```bash
git clone https://github.com/Juaco2r/HistoAnnotator.git
cd HistoAnnotator
```

### Create data directories

```bash
mkdir -p   data/images   data/annotations   data/cache   data/prepared   data/uploads
```

Copy test images into `data/images/`. Do not place confidential research data
inside the Git repository.

### Start

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

### Verify

```bash
docker compose -f docker-compose.standalone.yml ps
curl http://127.0.0.1:8020/health/live
```

Open `http://127.0.0.1:8020/`.

### Configuration

```dotenv
IMAGE_ROOT=/path/to/images
ANNOTATION_ROOT=/path/to/annotations
TILE_CACHE_ROOT=/path/to/cache
PREPARED_ROOT=/path/to/prepared
UPLOAD_ROOT=/path/to/uploads
HOST_PORT=8020
HOST_BIND=127.0.0.1
```

Example:

```bash
IMAGE_ROOT=/mnt/pathology/images docker compose -f docker-compose.standalone.yml up -d --build
```

### Network access

By default HistoAnnotator listens only on localhost.

For a trusted LAN test:

```bash
HOST_BIND=0.0.0.0 docker compose -f docker-compose.standalone.yml up -d
```

HistoAnnotator v1.2.0 does not provide individual user authentication or a
complete audit trail. Do not expose an unauthenticated instance directly to the
public Internet without appropriate TLS, authentication and institutional
security controls.

### Logs

```bash
docker compose -f docker-compose.standalone.yml logs -f --tail=100 histoannotator
```

### Stop

```bash
docker compose -f docker-compose.standalone.yml down
```
