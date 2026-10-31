import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, CSSProperties, DragEvent } from 'react'
import type { Item, JobRequest, JobResponse, OutFormat } from './types'

const MAX_FILES = 30
const MAX_BYTES = 30 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

const CROPS = [
  { key: 'none', label: 'Tanpa crop', w: 0, h: 0 },
  { key: '1:1', label: '1:1', w: 1, h: 1 },
  { key: '4:3', label: '4:3', w: 4, h: 3 },
  { key: '3:4', label: '3:4', w: 3, h: 4 },
  { key: '3:2', label: '3:2', w: 3, h: 2 },
  { key: '16:9', label: '16:9', w: 16, h: 9 },
  { key: '9:16', label: '9:16', w: 9, h: 16 },
  { key: 'custom', label: 'Kustom', w: 0, h: 0 },
]

const fmtSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`

function runJob(worker: Worker, req: JobRequest): Promise<JobResponse> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent<JobResponse>) => resolve(e.data)
    worker.onerror = () => resolve({ id: req.id, ok: false, error: 'Worker gagal' })
    worker.postMessage(req)
  })
}

const toNum = (v: string) => Math.max(0, Math.min(12000, Math.floor(Number(v) || 0)))

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [format, setFormat] = useState<OutFormat>('image/jpeg')
  const [quality, setQuality] = useState(80)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [lockRatio, setLockRatio] = useState(true)
  const [allowUpscale, setAllowUpscale] = useState(false)
  const [cropKey, setCropKey] = useState('none')
  const [customW, setCustomW] = useState(1)
  const [customH, setCustomH] = useState(1)
  const [cropX, setCropX] = useState(50)
  const [cropY, setCropY] = useState(50)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  // Rasio crop yang aktif (0 = tanpa crop)
  const preset = CROPS.find((c) => c.key === cropKey)
  const rw = cropKey === 'custom' ? customW : (preset?.w ?? 0)
  const rh = cropKey === 'custom' ? customH : (preset?.h ?? 0)
  const cropActive = rw > 0 && rh > 0

  function cropPreviewStyle(): CSSProperties {
    const box = 72
    const w = rw >= rh ? box : Math.max(20, Math.round((box * rw) / rh))
    const h = rw >= rh ? Math.max(20, Math.round((box * rh) / rw)) : box
    return {
      width: w,
      height: h,
      objectFit: 'cover',
      objectPosition: `${cropX}% ${cropY}%`,
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return
    const room = MAX_FILES - items.length
    if (room <= 0) return
    const accepted = Array.from(list)
      .filter((f) => ALLOWED.includes(f.type) && f.size <= MAX_BYTES)
      .slice(0, room)
    const added: Item[] = accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file)
      urlsRef.current.push(previewUrl)
      return {
        id: crypto.randomUUID(),
        file,
        previewUrl,
        status: 'queued' as const,
      }
    })
    setItems((prev) => [...prev, ...added])
  }

  function clearAll() {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
    setItems([])
  }

  function setPreset(w: number, h: number) {
    setWidth(w)
    setHeight(h)
  }

  async function compressAll() {
    // Semua gambar diproses ulang agar pengaturan terbaru dipakai
    const todo = items
    if (todo.length === 0) return
    setBusy(true)
    const worker = new Worker(new URL('./workers/image.worker.ts', import.meta.url), {
      type: 'module',
    })
    const ext = format === 'image/webp' ? '.webp' : '.jpg'
    for (const it of todo) {
      setItems((p) => p.map((x) => (x.id === it.id ? { ...x, status: 'working' } : x)))
      const res = await runJob(worker, {
        id: it.id,
        file: it.file,
        format,
        quality,
        width,
        height,
        lockRatio,
        allowUpscale,
        cropW: cropActive ? rw : 0,
        cropH: cropActive ? rh : 0,
        cropX,
        cropY,
      })
      if (res.ok) {
        const url = URL.createObjectURL(res.blob)
        urlsRef.current.push(url)
        const outName = it.file.name.replace(/\.[^.]+$/, '') + ext
        setItems((p) =>
          p.map((x) =>
            x.id === it.id
              ? {
                  ...x,
                  status: 'done',
                  blob: res.blob,
                  url,
                  outName,
                  origW: res.origWidth,
                  origH: res.origHeight,
                  outW: res.width,
                  outH: res.height,
                }
              : x,
          ),
        )
      } else {
        setItems((p) =>
          p.map((x) => (x.id === it.id ? { ...x, status: 'error', error: res.error } : x)),
        )
      }
    }
    worker.terminate()
    setBusy(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDrag(false)
    addFiles(e.dataTransfer.files)
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files)
    e.target.value = ''
  }

  const bothSet = width > 0 && height > 0

  return (
    <main className="wrap">
      <header className="brand">
        <a
          href="https://kabarviral.online"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Kunjungi Kabar Viral Online"
        >
          <img
            className="logo"
            src="/KabarViralOnline.jpeg"
            alt="Kabar Viral Online"
            height={48}
          />
        </a>
      </header>
      <h1>Image Optimizer</h1>
      <p>Kompres, potong, dan ubah ukuran gambar langsung di browser. Gambar tidak dikirim ke server mana pun.</p>

      <div
        className={`drop ${drag ? 'drag' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDrag(true)
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        <strong>Tarik gambar ke sini</strong> atau klik untuk memilih
        <div className="muted">
          JPG, PNG, WebP · maks {MAX_FILES} file · maks 30 MB per file
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={onPick}
        />
      </div>

      <fieldset className="panel">
        <legend>Potong (Crop)</legend>
        <div className="row">
          {CROPS.map((c) => (
            <button
              key={c.key}
              className={`ghost ${cropKey === c.key ? 'active' : ''}`}
              onClick={() => setCropKey(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
        {cropKey === 'custom' && (
          <div className="row">
            <label>
              Rasio lebar{' '}
              <input
                type="number"
                min={1}
                max={100}
                value={customW || ''}
                onChange={(e) => setCustomW(Math.min(100, toNum(e.target.value)))}
              />
            </label>
            <span className="times">:</span>
            <label>
              tinggi{' '}
              <input
                type="number"
                min={1}
                max={100}
                value={customH || ''}
                onChange={(e) => setCustomH(Math.min(100, toNum(e.target.value)))}
              />
            </label>
          </div>
        )}
        {cropActive && (
          <>
            <div className="row">
              <label className="slider">
                Posisi horizontal {cropX}%{' '}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cropX}
                  onChange={(e) => setCropX(Number(e.target.value))}
                />
              </label>
              <label className="slider">
                Posisi vertikal {cropY}%{' '}
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={cropY}
                  onChange={(e) => setCropY(Number(e.target.value))}
                />
              </label>
              <button
                className="ghost"
                onClick={() => {
                  setCropX(50)
                  setCropY(50)
                }}
              >
                Tengah
              </button>
            </div>
            <div className="muted">
              Gambar dipotong ke rasio {rw}:{rh}. Geser slider untuk memilih bagian yang
              dipertahankan (kiri/kanan atau atas/bawah). Hanya sisi yang dipotong yang
              berpengaruh. Lihat pratinjau &quot;Potong&quot; pada tabel.
            </div>
          </>
        )}
        {!cropActive && (
          <div className="muted">Pilih rasio untuk memotong. &quot;Tanpa crop&quot; = gambar utuh.</div>
        )}
      </fieldset>

      <fieldset className="panel">
        <legend>Ukuran (piksel)</legend>
        <div className="row">
          <label>
            Lebar{' '}
            <input
              type="number"
              min={0}
              max={12000}
              placeholder="otomatis"
              value={width || ''}
              onChange={(e) => setWidth(toNum(e.target.value))}
            />
          </label>
          <span className="times">×</span>
          <label>
            Tinggi{' '}
            <input
              type="number"
              min={0}
              max={12000}
              placeholder="otomatis"
              value={height || ''}
              onChange={(e) => setHeight(toNum(e.target.value))}
            />
          </label>
        </div>
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={lockRatio}
              onChange={(e) => setLockRatio(e.target.checked)}
            />
            Kunci rasio (tidak melar)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={allowUpscale}
              onChange={(e) => setAllowUpscale(e.target.checked)}
            />
            Boleh memperbesar
          </label>
        </div>
        <div className="row">
          <span className="muted">Cepat:</span>
          <button className="ghost" onClick={() => setPreset(0, 0)}>Asli</button>
          <button className="ghost" onClick={() => setPreset(1920, 0)}>Lebar 1920</button>
          <button className="ghost" onClick={() => setPreset(1280, 0)}>Lebar 1280</button>
          <button className="ghost" onClick={() => setPreset(800, 0)}>Lebar 800</button>
          <button className="ghost" onClick={() => setPreset(1080, 1080)}>1080 × 1080</button>
        </div>
        <div className="muted">
          {width === 0 && height === 0
            ? 'Kosong = ukuran asli dipertahankan (setelah crop, jika dipakai).'
            : bothSet && lockRatio
              ? 'Gambar dimuat di dalam kotak ini, rasio tetap.'
              : bothSet && !lockRatio
                ? 'Ukuran dipaksa persis, gambar bisa tampak melar.'
                : 'Sisi yang kosong dihitung otomatis mengikuti rasio.'}
        </div>
      </fieldset>

      <div className="controls">
        <label>
          Format{' '}
          <select value={format} onChange={(e) => setFormat(e.target.value as OutFormat)}>
            <option value="image/jpeg">JPEG</option>
            <option value="image/webp">WebP</option>
          </select>
        </label>
        <label>
          Kualitas {quality}{' '}
          <input
            type="range"
            min={30}
            max={95}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
          />
        </label>
        <button onClick={compressAll} disabled={busy || items.length === 0}>
          {busy ? 'Memproses…' : 'Proses'}
        </button>
        <button onClick={clearAll} disabled={busy || items.length === 0}>
          Bersihkan
        </button>
      </div>

      {items.length > 0 && (
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Pratinjau</th>
                <th>File</th>
                <th>Dimensi</th>
                <th>Asli</th>
                <th>Hasil</th>
                <th>Hemat</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="thumbs">
                      <figure>
                        <img src={it.previewUrl} alt={`Asli: ${it.file.name}`} />
                        <figcaption>Asli</figcaption>
                      </figure>
                      {cropActive && (
                        <figure>
                          <img
                            src={it.previewUrl}
                            alt={`Area potong: ${it.file.name}`}
                            style={cropPreviewStyle()}
                          />
                          <figcaption>Potong</figcaption>
                        </figure>
                      )}
                      {it.status === 'done' && it.url && (
                        <figure>
                          <img src={it.url} alt={`Hasil: ${it.outName ?? it.file.name}`} />
                          <figcaption>Hasil</figcaption>
                        </figure>
                      )}
                    </div>
                  </td>
                  <td>{it.file.name}</td>
                  <td>
                    {it.status === 'done' && it.outW
                      ? `${it.origW}×${it.origH} → ${it.outW}×${it.outH}`
                      : ''}
                  </td>
                  <td>{fmtSize(it.file.size)}</td>
                  <td>
                    {it.status === 'done' && it.blob ? fmtSize(it.blob.size) : it.status}
                  </td>
                  <td>
                    {it.status === 'done' && it.blob
                      ? `${((1 - it.blob.size / it.file.size) * 100).toFixed(1)}%`
                      : ''}
                  </td>
                  <td>
                    {it.status === 'done' && it.url && (
                      <a href={it.url} download={it.outName}>
                        Unduh
                      </a>
                    )}
                    {it.status === 'error' && <span className="err">{it.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted">Metadata EXIF (GPS, kamera, tanggal) otomatis terbuang pada hasil.</p>
    </main>
  )
}
