# HistoAnnotator v0.4.0

Actualización sobre v0.3.1.

## Cambios

- Menú **Archivo** con carga, descarga del original, importar/exportar GeoJSON, guardado e información.
- Carga de imágenes por bloques de 8 MB; al seleccionar de nuevo el mismo archivo se retoma desde el último bloque recibido.
- Herramienta **Brocha** con diámetro constante en pantalla. Al hacer zoom in trabaja sobre un área menor de la imagen; al hacer zoom out cubre más área.
- Botones **Cerrar/Cancelar polígono** contextuales; solo aparecen al comenzar un polígono. También se puede tocar el primer vértice para cerrar.
- Tiles de 512 px, más solicitudes concurrentes, caché HTTP persistente y codificación JPEG más rápida.
- Lectores OpenSlide independientes por hilo para evitar que todas las solicitudes de tiles se serialicen.
- Preparación local mediante hardlink cuando original y caché están en el mismo disco, evitando copiar varios GB innecesariamente.
- `/health/live` independiente del NAS para que Docker no marque la aplicación como unhealthy por un montaje de red caído.

## Nota sobre la brocha

Cada trazo se guarda como una anotación poligonal independiente. En esta versión la brocha no suma ni resta directamente sobre una anotación existente.
