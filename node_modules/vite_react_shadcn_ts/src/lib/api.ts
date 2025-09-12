const API_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:3001"
const SIM_API_URL = (import.meta as any).env?.VITE_SIM_API_URL || "http://localhost:8000"

export type ImageItem = {
  id: string
  filename: string
  uploadedAt: string
}

export async function listImages(params: Record<string, string> = {}): Promise<ImageItem[]> {
  const usp = new URLSearchParams(params)
  const res = await fetch(`${API_URL}/api/images?${usp.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch images')
  return res.json()
}

export async function listMyImages(username: string): Promise<ImageItem[]> {
  const usp = new URLSearchParams({ owner: username })
  const res = await fetch(`${API_URL}/api/images?${usp.toString()}`)
  if (!res.ok) throw new Error('Failed to fetch my images')
  return res.json()
}

export async function bulkDelete(imageIds: string[]): Promise<void> {
  const res = await fetch(`${API_URL}/api/images/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds, operation: 'delete' })
  })
  if (!res.ok) throw new Error('Bulk delete failed')
}

export function getThumbnailUrl(id: string): string {
  return `${API_URL}/api/images/${id}/download?variant=thumbnail`
}

export async function moveToAlbum(imageId: string, album: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/images/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageIds: [imageId], operation: 'move', data: { album } })
  })
  if (!res.ok) throw new Error('Move to album failed')
}

export async function seedAdmin(): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/seed-admin`, { method: 'POST' })
  if (!res.ok) throw new Error('Failed to seed admin')
}

export async function register(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) throw new Error('Registration failed')
}

export async function login(username: string, password: string): Promise<{ role: 'admin' | 'creator' }>{
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (!res.ok) throw new Error('Login failed')
  return res.json()
}

export type UserSummary = { id: string; username: string; role: string; created_at?: string; created_at_datetime?: string }

export async function listUsers(adminUser: string, adminPass: string): Promise<UserSummary[]> {
  const usp = new URLSearchParams({ username: adminUser, password: adminPass })
  const res = await fetch(`${API_URL}/api/admin/users?${usp.toString()}`)
  if (!res.ok) throw new Error('Failed to list users')
  return res.json()
}

export async function deleteUser(username: string, adminUser: string, adminPass: string): Promise<void> {
  const usp = new URLSearchParams({ adminUser, adminPass })
  const res = await fetch(`${API_URL}/api/admin/users/${encodeURIComponent(username)}?${usp.toString()}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete user')
}

// --- Similarity service (FastAPI) ---
export type Classification = { label: string; score: number }
export async function classifyImage(file: File, topK: number = 5): Promise<Classification[]> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('top_k', String(topK))
  const res = await fetch(`${SIM_API_URL}/api/classify`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('Classification failed')
  const data = await res.json()
  return data.labels as Classification[]
}

export type VectorSearchItem = {
  image_id: string
  score: number
  title?: string
  url?: string
  tags?: string[]
}

export async function searchVectorByText(query: string, topK: number = 10): Promise<VectorSearchItem[]> {
  const fd = new FormData()
  fd.append('query_text', query)
  fd.append('top_k', String(topK))
  const res = await fetch(`${SIM_API_URL}/api/search/vector`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('Vector search failed')
  const data = await res.json()
  return (data.results || []) as VectorSearchItem[]
}

export async function searchVectorByImage(file: File, topK: number = 10): Promise<VectorSearchItem[]> {
  const fd = new FormData()
  fd.append('query_image', file)
  fd.append('top_k', String(topK))
  const res = await fetch(`${SIM_API_URL}/api/search/vector`, { method: 'POST', body: fd })
  if (!res.ok) throw new Error('Vector search failed')
  const data = await res.json()
  return (data.results || []) as VectorSearchItem[]
}


