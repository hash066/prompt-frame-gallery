export default function SimilaritySearchSpec() {
  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white/70 dark:bg-gray-900/50 backdrop-blur rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-200 dark:border-gray-800">
            <h1 className="text-2xl font-bold">Deployable Image Similarity Search System</h1>
            <p className="text-sm text-gray-500 mt-1">High-level architecture and requirements</p>
          </div>
          <div className="p-6 space-y-6 text-sm leading-6">
            <div>
              <h2 className="text-lg font-semibold mb-2">Components</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li><strong>Backend</strong>: FastAPI (Python)</li>
                <li><strong>Worker</strong>: Celery with Redis (for background embedding jobs)</li>
                <li><strong>Vector Store</strong>: FAISS (local index for now)</li>
                <li><strong>Embeddings Model</strong>: sentence-transformers CLIP (e.g., clip-ViT-B-32)</li>
                <li><strong>Metadata DB</strong>: PostgreSQL (store image_id, title, tags, album, upload_date, privacy, etc.)</li>
                <li><strong>Storage</strong>: MinIO (S3-compatible) for image files</li>
                <li><strong>Frontend</strong>: React (Vite + Tailwind) to support text-to-image and image-to-image search with filters</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold mb-2">Requirements</h2>
              <ol className="list-decimal pl-6 space-y-4">
                <li>
                  <strong>Upload Endpoint</strong> (<code>POST /api/upload</code>)
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    <li>Accepts an image file, stores it in MinIO.</li>
                    <li>Inserts a row into PostgreSQL with metadata (image_id, title, tags, url, status=pending).</li>
                    <li>Enqueues a Celery job to compute embedding.</li>
                  </ul>
                </li>
                <li>
                  <strong>Worker Job</strong>
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    <li>Downloads the image from MinIO.</li>
                    <li>Computes embedding with CLIP model (sentence-transformers).</li>
                    <li>Upserts embedding into FAISS vector index.</li>
                    <li>Updates PostgreSQL row status → indexed.</li>
                  </ul>
                </li>
                <li>
                  <strong>Search Endpoint</strong> (<code>POST /api/search/vector</code>)
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    <li>Accepts either text or an image.</li>
                    <li>If text → compute text embedding.</li>
                    <li>If image → compute image embedding.</li>
                    <li>Query FAISS for top-k nearest embeddings.</li>
                    <li>Return ranked list of image_ids + similarity scores.</li>
                    <li>Fetch metadata from PostgreSQL and include in response.</li>
                  </ul>
                </li>
                <li>
                  <strong>Frontend (React)</strong>
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    <li>Search bar for text queries.</li>
                    <li>Upload box for image queries.</li>
                    <li>Display search results with Thumbnail, Title/caption/tags, Similarity score.</li>
                    <li>Filters: by album, date, tags.</li>
                  </ul>
                </li>
                <li>
                  <strong>Persistence</strong>
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    <li>FAISS index should be persisted (reload on startup).</li>
                    <li>Metadata always comes from PostgreSQL.</li>
                  </ul>
                </li>
                <li>
                  <strong>Deployment</strong>
                  <ul className="list-disc pl-6 mt-1 space-y-1">
                    <li>Code structured into backend (<code>fastapi/</code>), worker (<code>worker/</code>), and frontend (<code>frontend/</code>).</li>
                    <li>Provide <code>docker-compose.yml</code> that runs FastAPI, Celery worker, Redis, PostgreSQL, MinIO, Frontend.</li>
                  </ul>
                </li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


