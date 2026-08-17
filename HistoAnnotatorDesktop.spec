# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

from PyInstaller.utils.hooks import (
    collect_all,
)

ROOT = Path(SPECPATH).resolve()

datas = [
    (
        str(ROOT / "app" / "static"),
        "app/static",
    ),
]

binaries = []

hiddenimports = [
    "app.main",
    "desktop.config",
    "desktop.network",
    "desktop.server_control",
    "desktop.server_runner",
    "desktop.desktop_app",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

for package_name in (
    "openslide_bin",
):
    package_datas, package_binaries, package_hidden = (
        collect_all(
            package_name
        )
    )

    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

analysis = Analysis(
    [
        str(
            ROOT
            / "desktop"
            / "entrypoint.py"
        )
    ],
    pathex=[
        str(ROOT),
    ],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tkinter",
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(
    analysis.pure
)

exe = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="HistoAnnotatorDesktop",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

collection = COLLECT(
    exe,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="HistoAnnotatorDesktop",
)
