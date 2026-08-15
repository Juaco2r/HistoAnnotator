# Architecture

```text
                    HistoAnnotator
                          |
             +------------+------------+
             |                         |
       Brightfield / WSI          Scientific IF
             |                         |
         OpenSlide                  tifffile
             |                         |
         Deep Zoom               raw channels
             |                         |
             |               display composition
             +------------+------------+
                          |
                     FastAPI
                          |
                    OpenSeadragon
                          |
                   Annotation layer
                          |
                  QuPath GeoJSON
```

## Backend

The FastAPI backend handles image discovery, metadata, preparation, Deep
Zoom tile generation, display transforms, scientific multichannel TIFF
reading, annotation persistence, GeoJSON operations, upload and download.

## Brightfield and WSI

Compatible whole-slide images use OpenSlide and OpenSlide Deep Zoom.
Regular raster images can be handled through Pillow or prepared into a
tiled representation when required.

## Scientific fluorescence

Scientific TIFF data is read using tifffile. Raw channels remain in their
source numerical representation. Only display tiles are converted to an
8-bit RGB composite.

Display parameters include channel visibility, Min/Max, gamma, brightness
and false color.

## Frontend

The frontend is a lightweight JavaScript application built around
OpenSeadragon. Annotation geometry is represented in image level-0 pixel
coordinates.

## Android

The same frontend is packaged using Capacitor. Android adds local
application storage, network-state awareness, local-first tile access,
file sharing and offline geometry operations.

## Storage

```text
images       source image directory
annotations  GeoJSON annotation data
cache        generated display tiles
prepared     locally prepared image pyramids
uploads      chunked upload workspace
```
