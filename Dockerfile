FROM python:3.12-slim

ENV TORCH_HOME=/opt/histoannotator/torch-cache

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       libopenslide0 \
       libvips-tools \
       ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt /app/requirements.txt
RUN pip install --upgrade pip \
    && pip install -r /app/requirements.txt

RUN mkdir -p "$TORCH_HOME" \
    && python -c "from torchvision.models import resnet18, ResNet18_Weights; resnet18(weights=ResNet18_Weights.DEFAULT); print('HistoAnnotator: ResNet18 ImageNet weights cached')"

COPY app /app

RUN python -c "from pathlib import Path; from urllib.request import urlretrieve; base='https://cdn.jsdelivr.net/npm/openseadragon@6.0.2'; d=Path('/app/static/vendor/openseadragon'); d.mkdir(parents=True, exist_ok=True); urlretrieve(base + '/build/openseadragon/openseadragon.min.js', d / 'openseadragon.min.js'); urlretrieve(base + '/LICENSE.txt', d / 'LICENSE.txt')"

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health/live', timeout=3)" || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
