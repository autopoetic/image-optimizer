import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import type { Item, JobRequest, JobResponse, OutFormat } from './types'

const MAX_FILES = 30
const MAX_BYTES = 30 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

const fmtSize = (n: number) =>
  n >= 1048576 ? `${(n / 1048576).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`

function runJob(worker: Worker, req: JobRequest): Promise<JobResponse> {
  return new Promise((resolve) => {
    worker.onmessage = (e: MessageEvent<JobResponse>) => resolve(e.data)
    worker.onerror = () => resolve({ id: req.id, ok: false, error: 'Worker gagal' })
    worker.postMessage(req)
  })
}

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [format, setFormat] = useState<OutFormat>('image/webp')
  const [quality, setQuality] = useState(80)
  const [maxWidth, setMaxWidth] = useState(0)
  const [busy, setBusy] = useState(false)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlsRef = useRef<string[]>([])

  useEffect(() => {
    return () => urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
  }, [])

  function addFiles(list: FileList | null) {
    if (!list) return
    const accepted = Array.from(list).filter(
      (f) => ALLOWED.includes(f.type) && f.size <= MAX_BYTES,
    )
    setItems((prev) =>
      [
        ...prev,
        ...accepted.map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: 'queued' as const,
        })),
      ].slice(0, MAX_FILES),
    )
  }

  function clearAll() {
    urlsRef.current.forEach((u) => URL.revokeObjectURL(u))
    urlsRef.current = []
    setItems([])
  }

  async function compressAll() {
    const todo = items.filter((i) => i.status === 'queued' || i.status === 'error')
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
        maxWidth,
      })
      if (res.ok) {
        const url = URL.createObjectURL(res.blob)
        urlsRef.current.push(url)
        const outName = it.file.name.replace(/\.[^.]+$/, '') + ext
        setItems((p) =>
          p.map((x) =>
            x.id === it.id ? { ...x, status: 'done', blob: res.blob, url, outName } : x,
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

  return (
    <main className="wrap">
      <h1>Image Optimizer</h1>
      <p>Kompres gambar langsung di browser. Gambar tidak dikirim ke server mana pun.</p>

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

      <div className="controls">
        <label>
          Format{' '}
          <select value={format} onChange={(e) => setFormat(e.target.value as OutFormat)}>
            <option value="image/webp">WebP</option>
            <option value="image/jpeg">JPEG</option>
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
        <label>
          Lebar maks (px, 0 = asli){' '}
          <input
            type="number"
            min={0}
            max={8000}
            value={maxWidth}
            onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <button onClick={compressAll} disabled={busy || items.length === 0}>
          {busy ? 'Memproses…' : 'Kompres'}
        </button>
        <button onClick={clearAll} disabled={busy || items.length === 0}>
          Bersihkan
        </button>
      </div>

      {items.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Asli</th>
              <th>Hasil</th>
              <th>Hemat</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id}>
                <td>{it.file.name}</td>
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
      )}
      <p className="muted">Metadata EXIF (GPS, kamera, tanggal) otomatis terbuang pada hasil.</p>
    </main>
  )
}
