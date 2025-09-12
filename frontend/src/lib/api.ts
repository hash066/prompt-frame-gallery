const API_URL = '/api'

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


