# HistoAnnotator MVP v0.1

Visor web/PWA local para navegar imágenes histológicas y crear anotaciones GeoJSON compatibles con QuPath. Diseñado para la Lenovo M11:

- dedos: mover y ampliar;
- lápiz: trazo libre, polígono y rectángulo;
- guardado local-first con sincronización automática;
- imágenes pequeñas mediante Pillow;
- WSI compatibles mediante OpenSlide + Deep Zoom;
- originales del NAS montados como solo lectura;
- anotaciones y caché en el SSD de Krypton.

> Es un MVP de prueba. Todavía no incluye autenticación individual, auditoría ni edición de vértices. No uses datos clínicos identificables hasta añadir esos controles y obtener aprobación institucional.

## 1. Copiar y configurar

```bash
cd ~
unzip HistoAnnotator-v0.1.0-MVP.zip
mv histoannotator_mvp histoannotator
cd ~/histoannotator

cp .env.example .env
nano .env
```

La ruta ya propuesta es:

```dotenv
IMAGE_ROOT=/home/jrod/jalcaraz/Images_Datasets/HistoAnnotator
ANNOTATION_ROOT=/srv/histoannotator/annotations
TILE_CACHE_ROOT=/srv/histoannotator/cache
```

Comprueba que el montaje es legible:

```bash
findmnt -T /home/jrod/jalcaraz/Images_Datasets/HistoAnnotator
find /home/jrod/jalcaraz/Images_Datasets/HistoAnnotator -maxdepth 2 -type f | head
```

## 2. Crear las carpetas de escritura locales

```bash
sudo mkdir -p /srv/histoannotator/annotations /srv/histoannotator/cache
sudo chown -R jrod:jrod /srv/histoannotator
```

## 3. Construir e iniciar el MVP

La red `cytomine_host_network` ya existe porque la creó el stack de Cytomine.

```bash
cd ~/histoannotator
sudo docker compose up -d --build
```

Prueba el backend local:

```bash
curl -s http://127.0.0.1:8020/health | python3 -m json.tool
curl -s http://127.0.0.1:8020/api/images | python3 -m json.tool | head -60
```

## 4. Añadir la ruta a Caddy

El script hace copia de seguridad e inserta la ruta al comienzo de `route {`:

```bash
cd ~/histoannotator
python3 scripts/patch_caddy.py ~/cytomine/Caddyfile
```

Puedes confirmar el bloque:

```bash
grep -A5 -B2 'BEGIN HISTOANNOTATOR' ~/cytomine/Caddyfile
```

Valida y recrea únicamente Caddy:

```bash
cd ~/cytomine

sudo docker compose \
  -f compose.yaml \
  -f compose.https.yaml \
  exec -T caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

sudo docker compose \
  -f compose.yaml \
  -f compose.https.yaml \
  up -d --force-recreate caddy
```

## 5. Abrirlo

En Krypton, PC o tablet con la CA ya instalada:

```text
https://161.116.13.132/annotator/
```

No uses `/annotator` sin la barra final en este MVP.

## 6. Primera prueba

1. Coloca un JPG/PNG pequeño en el directorio del NAS.
2. Pulsa **Actualizar** en HistoAnnotator.
3. Selecciona la imagen.
4. En tablet: usa dedos para navegar y el lápiz para dibujar.
5. Comprueba el archivo guardado en Krypton:

```bash
find /srv/histoannotator/annotations -type f -name '*.geojson' -printf '%p\n'
```

Si el archivo se llama `prueba.jpg`, la anotación se guarda como:

```text
/srv/histoannotator/annotations/prueba.jpg.geojson
```

## 7. Probar en QuPath

En QuPath, abre la misma imagen y arrastra el `.geojson` sobre el visor, o usa el flujo de importación de objetos. Las coordenadas se almacenan en píxeles del nivel original y cada Feature incluye:

```json
{
  "properties": {
    "objectType": "annotation",
    "classification": {"name": "Tumor"}
  }
}
```

## 8. Diagnóstico

```bash
cd ~/histoannotator
./scripts/check_setup.sh
sudo docker compose logs -f --tail=100 histoannotator
```

Desde Caddy:

```bash
cd ~/cytomine
sudo docker compose -f compose.yaml -f compose.https.yaml logs --tail=100 caddy
```

### No aparecen imágenes

Comprueba el montaje dentro del contenedor:

```bash
cd ~/histoannotator
sudo docker compose exec histoannotator sh -lc 'find /data/images -maxdepth 2 -type f | head -30'
```

Si el host ve los archivos pero el contenedor no, el montaje SSHFS necesita `allow_other` y debe estar activo antes de arrancar Docker.

### Una WSI es lenta

El MVP lee la WSI directamente desde el montaje SFTP y guarda los tiles generados en `/srv/histoannotator/cache`. La primera visita a una zona puede ser lenta; las siguientes deberían mejorar. La siguiente versión puede copiar bajo demanda la diapositiva activa al SSD local.

### Formato no compatible

OpenSlide admite formatos WSI y TIFF genérico tiled; las imágenes normales se abren con Pillow. Convierte TIFF no compatible a TIFF piramidal o prueba primero JPG/PNG.

## 9. Detener sin borrar datos

```bash
cd ~/histoannotator
sudo docker compose down
```

No borra `/srv/histoannotator` ni los originales del NAS.

## Próxima iteración recomendada

- editar vértices;
- ocultar/mostrar clases;
- copiar WSI activa del NAS al SSD de forma asíncrona;
- autenticación y permisos;
- historial de versiones por usuario;
- importación/exportación QuPath más completa, incluidos MultiPolygon y huecos;
- integración con HistoAnalyzer.
