import { useRef, useState } from "react"

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001"

export default function Upload() {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [files, setFiles] = useState<File[]>([])
  const [results, setResults] = useState<Array<{ imageId: string; filename: string }>>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!files || files.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      files.forEach(f => form.append("images", f))
      const res = await fetch(`${API_URL}/api/images`, { method: "POST", body: form })
      const data = await res.json()
      const ok = (data as any[]).filter(r => r.success)
      setResults(ok.map(r => ({ imageId: r.imageId, filename: r.filename })))
    } catch (err: any) {
      setError(err?.message || "Upload failed")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold gradient-text">Upload Images</h1>
      <form onSubmit={onSubmit} className="space-y-4">
        <div
          className="border-2 border-dashed border-border rounded-lg p-8 text-center bg-card hover:border-primary transition-smooth"
          onDragOver={e => { e.preventDefault() }}
          onDrop={e => {
            e.preventDefault()
            const dropped = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
            setFiles(prev => [...(prev || []), ...dropped])
          }}
        >
          <p className="text-muted-foreground mb-2">Drag & drop images here</p>
          <button type="button" className="px-3 py-2 rounded bg-secondary text-secondary-foreground" onClick={() => inputRef.current?.click()}>
            Browse Files
          </button>
          <input ref={inputRef} type="file" multiple accept="image/*" className="hidden" onChange={e => setFiles([...(files || []), ...(Array.from(e.target.files || []))])} />
        </div>
        {files.length > 0 && (
          <div className="text-sm text-muted-foreground">{files.length} file(s) selected. You can remove by clicking.</div>
        )}
        <div className="flex flex-wrap gap-2">
          {files.map((f, idx) => (
            <button key={idx} type="button" className="px-2 py-1 rounded bg-muted" onClick={() => setFiles(files.filter((_, i) => i !== idx))}>
              ✖ {f.name}
            </button>
          ))}
        </div>
        <button disabled={loading} className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50">
          {loading ? "Uploading..." : "Upload"}
        </button>
      </form>
      {error && <div className="text-red-400">{error}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {results.map(r => (
          <div key={r.imageId} className="rounded border border-border p-3 bg-card">
            <img
              className="w-full h-48 object-cover rounded"
              src={`${API_URL}/api/images/${r.imageId}/download?variant=thumbnail`}
              alt={r.filename}
            />
            <div className="mt-2 text-sm text-muted-foreground">{r.filename}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


