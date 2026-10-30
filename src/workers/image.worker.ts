import type { JobRequest, JobResponse } from '../types'

const send = (msg: JobResponse) => (self as unknown as Worker).postMessage(msg)

const MAX_SIDE = 12000
const MAX_PIXELS = 40_000_000 // pagar pengaman memori browser

self.onmessage = async (e: MessageEvent<JobRequest>) => {
  const { id, file, format, quality, width, height, lockRatio, allowUpscale } = e.data
  try {
    // 'from-image' menerapkan rotasi EXIF sebelum metadata terbuang
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const ow = bitmap.width
    const oh = bitmap.height

    const tw = width > 0 ? width : 0
    const th = height > 0 ? height : 0
    let w = ow
    let h = oh

    if (tw || th) {
      if (lockRatio || !(tw && th)) {
        // Rasio asli dipertahankan
        let scale: number
        if (tw && th) scale = Math.min(tw / ow, th / oh) // muat di dalam kotak
        else if (tw) scale = tw / ow
        else scale = th / oh
        if (!allowUpscale) scale = Math.min(scale, 1)
        w = Math.round(ow * scale)
        h = Math.round(oh * scale)
      } else {
        // Rasio bebas: pakai ukuran persis (gambar bisa terlihat melar)
        w = tw
        h = th
        if (!allowUpscale) {
          w = Math.min(w, ow)
          h = Math.min(h, oh)
        }
      }
    }

    w = Math.max(1, w)
    h = Math.max(1, h)
    if (w > MAX_SIDE || h > MAX_SIDE || w * h > MAX_PIXELS) {
      bitmap.close()
      throw new Error('Ukuran hasil terlalu besar untuk browser. Kecilkan lebar/tinggi.')
    }

    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas tidak didukung browser ini')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
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
    send({ id, ok: true, blob, width: w, height: h, origWidth: ow, origHeight: oh })
  } catch (err) {
    send({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
