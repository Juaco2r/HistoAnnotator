# HistoAnnotator Desktop

HistoAnnotator Desktop is an experimental desktop host for the existing
HistoAnnotator backend and web interface.

## Desktop dev1b scope

The first packaged target is Windows x64.

The Windows build is designed to be an independent HistoAnnotator session:

- images are selected from a folder on the Windows computer;
- annotations/cache/prepared data are stored on that Windows computer;
- the embedded HistoAnnotator UI connects to `127.0.0.1`;
- **Start Server** changes the backend binding to all network interfaces;
- the panel displays an explicit LAN URL and a QR code;
- Android or another browser can use that URL;
- no automatic LAN discovery is implemented;
- if **Keep server running...** is enabled, closing the Desktop window does
  not stop the detached backend process;
- reopening Desktop reconnects to the running backend.

The current dev1b does **not** automatically start the backend after a Windows
reboot. Boot persistence is a later milestone.

## Windows data

Default writable data directory:

```text
%USERPROFILE%\HistoAnnotatorData\
├── annotations\
├── cache\
├── prepared\
└── uploads\
```

The source image directory is chosen independently.

## Windows firewall

When Server mode first binds to the network, Windows may ask whether
HistoAnnotator may communicate through the firewall. For a trusted local
network test, allow it on **Private networks**.

## Multiple adapters / VPN

The app detects a likely local IPv4 address, but a Windows computer can have
Wi-Fi, Ethernet, VPN and virtual adapters simultaneously. The address shown
in the QR is therefore editable. Server mode still binds to all interfaces;
the editable address only determines what is advertised/coded in the QR.

## Build

The workflow:

```text
.github/workflows/desktop-windows-dev.yml
```

builds a portable Windows x64 folder with PyInstaller and uploads it as a
GitHub Actions artifact.

The workflow runs automatically when `v1.2.0-local-mode` is pushed and
Desktop/backend build inputs changed.

The artifact is:

```text
HistoAnnotator-Desktop-Windows-x64-dev1b.zip
```

Extract the whole ZIP before running:

```text
HistoAnnotatorDesktop.exe
```

Do not move the EXE out of its extracted folder; Qt WebEngine and the Python
runtime use the accompanying files.

## First Windows test

1. Extract the artifact.
2. Run `HistoAnnotatorDesktop.exe`.
3. Choose a Windows image folder.
4. Confirm HistoAnnotator loads in the Desktop window.
5. Open an image.
6. Click **Start Server**.
7. If Windows Firewall asks, allow **Private networks**.
8. Confirm the LAN URL and QR are shown.
9. Open the URL in a browser on the same reachable network.
10. In Android HistoAnnotator, enter that URL manually in Connection settings.
11. Confirm Android sees the Windows-hosted image list.
12. Enable **Keep server running when HistoAnnotator Desktop closes**.
13. Close the Desktop window.
14. Verify the browser/Android connection still works.
15. Reopen Desktop and confirm it reconnects.

## Security

The current HistoAnnotator research pre-release has no individual user
authentication. Server mode should therefore be used only on a trusted
LAN/VPN during development.
