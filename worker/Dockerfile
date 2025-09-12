FROM python:3.11-slim

WORKDIR /app

COPY worker/requirements.txt ./requirements.txt
# Speed up and harden pip installs (long downloads like torch)
ENV PIP_DEFAULT_TIMEOUT=180 PIP_RETRIES=5 PIP_NO_CACHE_DIR=1
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

COPY fastapi ./fastapi

CMD ["celery", "-A", "fastapi.app.celery_app", "worker", "--loglevel=INFO"]


