# HistoAnnotator Desktop v1.2.0

HistoAnnotator Desktop is a standalone host for the HistoAnnotator backend and
web interface.

## Platforms

Release builds are provided for:

- Windows x64
- Linux x64
- macOS Apple Silicon
- macOS Intel

macOS builds are currently unsigned research builds.

## First start

1. Extract the entire archive.
2. Start `HistoAnnotatorDesktop`.
3. Choose the folder containing your images.
4. Choose the writable data folder if you do not want the default.
5. HistoAnnotator starts a private local backend on `127.0.0.1`.

Do not move only the executable out of the extracted directory. Qt, OpenSlide,
libvips and the Python runtime use accompanying files.

## Large TIFF preparation

Large generic TIFF files may need preparation before Deep Zoom viewing.

v1.2.0 bundles `pyvips/libvips` inside Desktop builds. Generic TIFF images that
OpenSlide identifies only as `generic-tiff` are converted to a tiled pyramidal
TIFF in the Desktop data directory before viewing. The source file is never
modified.

The first preparation can take several minutes for multi-gigabyte images.
Prepared files are reused on later openings.

## Data directory

The Desktop data directory contains:

```text
annotations/
cache/
prepared/
uploads/
```

Source images stay in the image folder you selected.

## Share with Android/browser

Press **Start Server**.

Desktop binds the backend to the LAN and displays an explicit URL plus QR code.

On Android:

```text
File → Connection settings → Scan QR
```

The Android app validates `/api/images`, saves the server URL and loads the
image catalog.

If Windows Firewall asks, allow HistoAnnotator on **Private networks** only
when using a trusted LAN.

## Multiple network adapters

The advertised address is editable. This is useful when the computer has
Wi-Fi, Ethernet, VPN or virtual adapters. The QR uses the address shown in the
Desktop panel.

## Security

HistoAnnotator v1.2.0 is research software and currently has no individual
authentication or complete audit trail. Use Desktop server mode only on a
trusted LAN/VPN.

## Troubleshooting

If an image cannot be prepared, confirm you are using the complete extracted
release archive. v1.2.0 includes its own pyvips/libvips runtime.

If tile requests fail, restart HistoAnnotator Desktop and retry the image after
preparation completes.


## Release validation

For v1.2.0:

- Windows x64: manually tested;
- Linux x64: manually tested;
- macOS Apple Silicon: CI build + packaged self-test;
- macOS Intel: CI build + packaged self-test;
- OpenSlide and pyvips/libvips are checked by the packaged Desktop self-test.

The release workflow extracts each archive and runs the packaged self-test again
before publication.
