export type OutFormat = 'image/webp' | 'image/jpeg'

export interface JobRequest {
  id: string
  file: File
  format: OutFormat
  quality: number
  width: number // 0 = otomatis
  height: number // 0 = otomatis
  lockRatio: boolean
  allowUpscale: boolean
}

export type JobResponse =
  | {
      id: string
      ok: true
      blob: Blob
      width: number
      height: number
      origWidth: number
      origHeight: number
    }
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
  origW?: number
  origH?: number
  outW?: number
  outH?: number
}
