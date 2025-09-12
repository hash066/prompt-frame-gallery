import os
import io
import uuid
import json
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import psycopg2
from psycopg2.extras import RealDictCursor
from minio import Minio
import redis
from redis.commands.search.field import TextField, TagField, VectorField
from redis.commands.search.indexDefinition import IndexDefinition
import numpy as np
from PIL import Image

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Environment / connections ---
PG_CONN = {
    "host": os.getenv("POSTGRES_HOST", "postgres"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
    "user": os.getenv("POSTGRES_USER", "image_user"),
    "password": os.getenv("POSTGRES_PASSWORD", "image_pass"),
    "database": os.getenv("POSTGRES_DB", "image_gallery"),
}

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "images")
MINIO_SECURE = os.getenv("MINIO_USE_SSL", "false").lower() == "true"

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
EMBED_DIM = int(os.getenv("EMBED_DIM", "512"))

# --- Simple DB helpers ---
def pg_conn():
    return psycopg2.connect(cursor_factory=RealDictCursor, **PG_CONN)

def ensure_tables():
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS sim_images (
                  image_id TEXT PRIMARY KEY,
                  title TEXT,
                  tags TEXT[],
                  url TEXT,
                  status TEXT DEFAULT 'pending',
                  uploaded_at TIMESTAMP DEFAULT NOW()
                );
                """
            )
            conn.commit()

ensure_tables()

# --- MinIO client ---
def minio_client():
    host, port = MINIO_ENDPOINT.split(":") if ":" in MINIO_ENDPOINT else (MINIO_ENDPOINT, "9000")
    endpoint = f"{host}:{port}"
    return Minio(endpoint, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=MINIO_SECURE)

def ensure_bucket():
    mc = minio_client()
    found = mc.bucket_exists(MINIO_BUCKET)
    if not found:
        mc.make_bucket(MINIO_BUCKET)

ensure_bucket()

# --- Redis client ---
def redis_client():
    return redis.from_url(REDIS_URL, decode_responses=True)

def ensure_redis_index():
    r = redis_client()
    try:
        # Check if index exists
        r.ft("image_vectors").info()
    except:
        # Create index for vector search (prefix matches keys we add: img:<id>)
        schema = [
            TextField("image_id"),
            TextField("title"),
            TagField("tags"),
            TextField("url"),
            VectorField("embedding", "HNSW", {
                "TYPE": "FLOAT32",
                "DIM": EMBED_DIM,
                "DISTANCE_METRIC": "COSINE"
            }),
        ]
        r.ft("image_vectors").create_index(schema, definition=IndexDefinition(prefix=["img:"]))

ensure_redis_index()

# --- Models ---
class SearchResponseItem(BaseModel):
    image_id: str
    score: float
    title: Optional[str] = None
    url: Optional[str] = None
    tags: Optional[List[str]] = None

class SearchResponse(BaseModel):
    results: List[SearchResponseItem]


# --- Optional image classification (labels) ---
_classifier = None

def get_image_classifier():
    global _classifier
    if _classifier is None:
        from transformers import pipeline
        # Lightweight, CPU-friendly ViT classifier
        _classifier = pipeline("image-classification", model="google/vit-base-patch16-224")
    return _classifier


# --- Celery (deferred import) ---
from celery import Celery

celery_app = Celery(
    "sim_worker",
    broker=REDIS_URL,
    backend=REDIS_URL,
)

# Embedding model is heavy; worker will import on demand.

@celery_app.task
def compute_and_index(image_id: str, object_key: str, title: str = "", tags: List[str] = None):
    from sentence_transformers import SentenceTransformer
    import tempfile
    mc = minio_client()
    r = redis_client()
    
    # download image to temp
    with tempfile.NamedTemporaryFile(suffix=".img", delete=False) as tmp:
        mc.fget_object(MINIO_BUCKET, object_key, tmp.name)
        tmp_path = tmp.name
    
    # compute embedding (use CLIP image encoding via sentence-transformers)
    model = SentenceTransformer(os.getenv("EMBED_MODEL", "clip-ViT-B-32"))
    emb = model.encode([tmp_path], convert_to_numpy=True, batch_size=1)
    
    # normalize for cosine similarity
    x = emb.astype("float32")
    x = x / np.linalg.norm(x, axis=1, keepdims=True)
    
    # store in Redis
    r.ft("image_vectors").add_document(
        f"img:{image_id}",
        image_id=image_id,
        title=title or "",
        tags=" ".join(tags or []),
        url=object_key,
        embedding=x[0].tolist()
    )
    
    # mark indexed
    with pg_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE sim_images SET status='indexed' WHERE image_id=%s", (image_id,))
            conn.commit()
    return True


@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), title: str = Form(""), tags: str = Form("")):
    try:
        image_id = str(uuid.uuid4())
        ext = os.path.splitext(file.filename)[1] or ".jpg"
        object_key = f"similarity/{image_id}{ext}"
        data = await file.read()
        mc = minio_client()
        mc.put_object(MINIO_BUCKET, object_key, io.BytesIO(data), length=len(data), content_type=file.content_type or "application/octet-stream")

        url = f"/minio/{MINIO_BUCKET}/{object_key}"
        tag_list = [t.strip() for t in (tags or "").split(",") if t.strip()]

        with pg_conn() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO sim_images (image_id, title, tags, url, status) VALUES (%s,%s,%s,%s,%s) ON CONFLICT (image_id) DO NOTHING",
                    (image_id, title, tag_list if tag_list else None, object_key, "pending"),
                )
                conn.commit()

        compute_and_index.delay(image_id, object_key, title, tag_list)
        return {"image_id": image_id, "status": "queued"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/search/vector", response_model=SearchResponse)
async def search_vector(query_text: Optional[str] = Form(None), query_image: Optional[UploadFile] = File(None), top_k: int = Form(10)):
    try:
        # compute query embedding
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(os.getenv("EMBED_MODEL", "clip-ViT-B-32"))
        if query_text:
            q = model.encode([query_text], convert_to_numpy=True)
        elif query_image is not None:
            data = await query_image.read()
            with open("/tmp/query.img", "wb") as f:
                f.write(data)
            q = model.encode(["/tmp/query.img"], convert_to_numpy=True)
        else:
            raise HTTPException(status_code=400, detail="Provide query_text or query_image")

        # normalize for cosine similarity
        q = q.astype("float32")
        q = q / np.linalg.norm(q, axis=1, keepdims=True)

        # search Redis vector index
        r = redis_client()
        try:
            search_results = r.ft("image_vectors").search(
                f"*=>[KNN {top_k} @embedding $query_vector]",
                {"query_vector": q[0].tolist()}
            )
            
            results = []
            for doc in search_results.docs:
                results.append({
                    "image_id": doc.image_id,
                    "score": float(doc.__dict__.get('__score', 0)),
                    "title": doc.title or "",
                    "url": doc.url or "",
                    "tags": doc.tags.split() if doc.tags else [],
                })
            return {"results": results}
        except Exception as e:
            # Fallback to empty results if Redis search fails
            return {"results": []}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/classify")
async def classify_image(file: UploadFile = File(...), top_k: int = Form(5)):
    try:
        data = await file.read()
        image = Image.open(io.BytesIO(data)).convert("RGB")
        clf = get_image_classifier()
        preds = clf(image, top_k=top_k)
        return {"labels": [{"label": p["label"], "score": float(p["score"])} for p in preds]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
def health():
    return {"status": "ok"}



