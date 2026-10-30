import type { JobRequest, JobResponse } from '../types'

const send = (msg: JobResponse) => (self as unknown as Worker).postMessage(msg)

self.onmessage = async (e: MessageEvent<JobRequest>) => {
  const { id, file, format, quality, maxWidth } = e.data
  try {
    // 'from-image' menerapkan rotasi EXIF sebelum metadata terbuang
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    let w = bitmap.width
    let h = bitmap.height
    if (maxWidth > 0 && w > maxWidth) {
      h = Math.round((h * maxWidth) / w)
      w = maxWidth
    }
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas tidak didukung browser ini')
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
    }
    ctx.drawImage(bitmap, 0, 0, w, h)
    bitmap.close()

    const blob = await canvas.convertToBlob({ type: format, quality: quality / 100 })
    if (blob.type !== format) {
      throw new Error(`Browser ini tidak bisa menghasilkan ${format}. Coba format lain.`)
    }
    send({ id, ok: true, blob, width: w, height: h })
  } catch (err) {
    send({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
