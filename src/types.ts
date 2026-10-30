export type OutFormat = 'image/webp' | 'image/jpeg'

export interface JobRequest {
  id: string
  file: File
  format: OutFormat
  quality: number
  maxWidth: number
}

export type JobResponse =
  | { id: string; ok: true; blob: Blob; width: number; height: number }
  | { id: string; ok: false; error: string }

export interface Item {
  id: string
  file: File
  previewUrl: string
  status: 'queued' | 'working' | 'done' | 'error'
  blob?: Blob
  url?: string
  outName?: string
  error?: string
}
