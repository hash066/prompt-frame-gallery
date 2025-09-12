FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt ./
# Speed up and harden pip installs (long downloads like torch)
ENV PIP_DEFAULT_TIMEOUT=180 PIP_RETRIES=5 PIP_NO_CACHE_DIR=1
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]




