# HistoAnnotator v0.3.0

- Clases configurables desde la interfaz y sincronizadas con el servidor.
- Borradores de anotaciones en IndexedDB para conservar cambios si se corta la VPN o Internet.
- Reintento automático al recuperar la conexión.
- Preparación en segundo plano de imágenes grandes: copia desde el NAS al SSD local y conversión a TIFF piramidal con libvips cuando OpenSlide no reconoce el original.
- Progreso visible durante copia/conversión.
- Tiles JPEG de calidad 94 y caché local persistente.
