# Multichannel fluorescence

HistoAnnotator v1.0.0 introduces scientific multichannel fluorescence
visualization.

## Scientific reader

A multichannel microscopy image should not be converted to RGB before the
individual channels are available to the viewer. HistoAnnotator therefore
uses tifffile for supported scientific TIFF input.

```text
raw uint16 channels
       |
       +-- Channel 1
       +-- Channel 2
       +-- Channel 3
       +-- Channel 4
       |
       v
display windows
       |
false-color composition
       |
8-bit RGB display tile
```

The RGB result exists only for display. Raw image data is not modified.

## Channel controls

Each scientific channel can have visibility, name, false color, Min, Max,
gamma, brightness, Auto and Reset settings. Settings are stored per image.

## Automatic ranges

Display ranges are estimated from representative image samples. This avoids
using the entire 0-65535 range when biologically useful signal occupies a
smaller range. These ranges affect visualization only.

## OME-TIFF

When OME channel metadata is available, HistoAnnotator can use the channel
names provided by the file.

## Non-OME TIFF

Some scientific TIFF files may contain:

```text
shape = (4, Y, X)
axes  = ZYX
```

even when the four planes are fluorescence channels rather than a true
Z-stack. HistoAnnotator may treat the small leading dimension as channels
when the image is explicitly configured as `Fluorescence`.

This behavior is intentionally not applied to every Z-stack.

## Current v1.0 scope

The initial implementation is intended primarily for TIFF/OME-TIFF,
three-dimensional channel + Y + X datasets, 2-16 scientific channels, and
datasets that support efficient local array access.

More complex T/Z/C combinations and arbitrary compressed scientific TIFF
layouts may require additional reader support.

## Offline limitation

Offline downloads currently cache rendered display tiles. Changing to a
channel combination that was not downloaded may require reconnecting to the
server. A future implementation can store channel-specific tiles or raw
multichannel packages for arbitrary offline recomposition.
