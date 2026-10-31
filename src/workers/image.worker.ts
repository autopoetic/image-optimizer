import type { JobRequest, JobResponse } from '../types'

const send = (msg: JobResponse) => (self as unknown as Worker).postMessage(msg)

const MAX_SIDE = 12000
const MAX_PIXELS = 40_000_000 // pagar pengaman memori browser

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

self.onmessage = async (e: MessageEvent<JobRequest>) => {
  const {
    id, file, format, quality,
    width, height, lockRatio, allowUpscale,
    cropW, cropH, cropX, cropY,
  } = e.data
  try {
    // 'from-image' menerapkan rotasi EXIF sebelum metadata terbuang
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const ow = bitmap.width
    const oh = bitmap.height

    // 1) CROP: tentukan area sumber (sx, sy, sw, sh)
    let sx = 0
    let sy = 0
    let sw = ow
    let sh = oh
    if (cropW > 0 && cropH > 0) {
      const r = cropW / cropH
      if (ow / oh > r) {
        sh = oh
        sw = Math.round(oh * r)
      } else {
        sw = ow
        sh = Math.round(ow / r)
      }
      sw = clamp(sw, 1, ow)
      sh = clamp(sh, 1, oh)
      sx = Math.round(((ow - sw) * clamp(cropX, 0, 100)) / 100)
      sy = Math.round(((oh - sh) * clamp(cropY, 0, 100)) / 100)
    }

    // 2) RESIZE: dihitung dari ukuran SETELAH crop
    const tw = width > 0 ? width : 0
    const th = height > 0 ? height : 0
    let w = sw
    let h = sh

    if (tw || th) {
      if (lockRatio || !(tw && th)) {
        let scale: number
        if (tw && th) scale = Math.min(tw / sw, th / sh)
        else if (tw) scale = tw / sw
        else scale = th / sh
        if (!allowUpscale) scale = Math.min(scale, 1)
        w = Math.round(sw * scale)
        h = Math.round(sh * scale)
      } else {
        w = tw
        h = th
        if (!allowUpscale) {
          w = Math.min(w, sw)
          h = Math.min(h, sh)
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
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h)
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
