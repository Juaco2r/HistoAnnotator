# Installation

## Recommended method: Docker Compose

The simplest reproducible installation uses Docker.

### Requirements

- Git
- Docker Engine
- Docker Compose v2
- Approximately 2 GB of free disk space in addition to image data

The application image is based on Python 3.12 and installs OpenSlide,
libvips and the required Python dependencies automatically.

## Clone

```bash
git clone https://github.com/Juaco2r/HistoAnnotator.git
cd HistoAnnotator
```

## Create data directories

```bash
mkdir -p \
  data/images \
  data/annotations \
  data/cache \
  data/prepared \
  data/uploads
```

Copy test images into `data/images/`.

Do not place confidential research data inside the Git repository.

## Start

```bash
docker compose -f docker-compose.standalone.yml up -d --build
```

## Verify

```bash
docker compose -f docker-compose.standalone.yml ps
curl http://127.0.0.1:8020/health/live
```

The container should become `healthy`.

Open the application at `http://127.0.0.1:8020/`.

## Configuration

The default standalone paths are relative to the repository. They may be
overridden using environment variables:

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
IMAGE_ROOT=/mnt/pathology/images \
docker compose -f docker-compose.standalone.yml up -d --build
```

## Network access

By default HistoAnnotator listens only on localhost.

For a trusted LAN test environment:

```bash
HOST_BIND=0.0.0.0 \
docker compose -f docker-compose.standalone.yml up -d
```

Do not expose this pre-release directly to the public Internet without an
appropriate reverse proxy, TLS, authentication and institutional security
controls.

## Logs

```bash
docker compose -f docker-compose.standalone.yml logs -f --tail=100 histoannotator
```

## Stop

```bash
docker compose -f docker-compose.standalone.yml down
```
