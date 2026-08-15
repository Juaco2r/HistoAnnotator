# Offline mode

HistoAnnotator uses a local-first workflow for downloaded images.

## Downloaded images

The application can cache image tiles for later viewing. Once downloaded,
compatible cached views can be opened after the server or VPN connection
becomes unavailable.

## Annotations

Annotations are stored locally first and can later synchronize with the
server. This allows annotation work to survive temporary network loss,
application restart and tablet restart.

## Display variants

The cache distinguishes different image-display queries. Stain views or
fluorescence channel combinations may therefore produce different tile
variants.

## Scientific fluorescence

In v1.0, offline fluorescence uses cached rendered composites. An arbitrary
new Min/Max, gamma, color or channel combination may not be available
offline unless that display variant was previously downloaded.

Raw per-channel offline recomposition is planned for a later version.

## Wand

Some image-aware operations require image-region data from the backend and
may therefore have reduced functionality without a server connection.

## Synchronization

After reconnecting, use the synchronization controls to upload pending
annotation changes.
