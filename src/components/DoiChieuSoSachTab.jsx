import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, FileSpreadsheet, FileText, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react'
import {
  PXK_KHO, PXK_TAGS, buildNguonReport, fmtHanDung, isNguonRow, newPxkPhieu, newPxkRow, normHanDung, parseQty,
  ocrRowNeedsCheck, parseOcrPxkText, readPxkPdfRows, readSoPhieu, receivedRowsOf, reconcilePxk,
} from '../utils/pxkReconcile'
import { emptyPxkSession, readGoodsBatches, readPxkStore, writePxkSession } from '../data/pxkStore'
import { downloadPxkFile, getPxkFileUrl, uploadPxkFile } from '../data/pxkFiles'
import { ocrImage } from '../utils/pxkOcr'
import { extractPdfText, findDuplicateTems, mergeActualScanRows, parsePdfItems, readActualScanRows } from '../utils/parseGoodsReceipt'

// Mục "Đối chiếu sổ sách": Phiếu xuất kho nhà máy (sổ sách) ↔ BB thực nhận (chuyến đã lưu ở tab Nhập hàng) ↔ file
// quét nhập web nội bộ. Chỉ đọc chuyến nhập hàng, không sửa gì ở tab Nhập hàng / Đối soát.

const TONE = {
  ok: 'bg-green-50 text-green-700 border-green-200',
  bad: 'bg-red-50 text-red-700 border-red-200',
  lot: 'bg-violet-50 text-violet-700 border-violet-200',
  warn: 'bg-amber-50 text-amber-700 border-amber-200',
}
const FILTERS = [
  ['all', 'Tất cả'], ['nguon', 'Báo đầu nguồn'], ['lot', 'Lệch lô / HD'], ['quet', 'Quét chưa khớp'], ['ok', 'Khớp'],
]
const KHO_CHIP = { C: 'border-red-200 bg-red-50 text-red-700', DTP: 'border-blue-200 bg-blue-50 text-blue-700', SO: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
const vn = n => (n === null || n === undefined ? '—' : Number(n).toLocaleString('vi-VN'))
const isPdf = f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
const isImage = f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)
const isExcel = f => /\.xlsx?$/i.test(f.name)
const batchLabel = b => {
  const d = new Date(b.processedAt)
  const t = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `${b.pdfMetadata?.ngayNhap ? `Ngày nhập ${b.pdfMetadata.ngayNhap} · ` : ''}xử lý ${t}`
}
const matchFilter = (row, f) => f === 'all' || (f === 'nguon' ? isNguonRow(row) : row.tags.includes(f))

function KhoChip({ kho }) {
  const label = PXK_KHO.find(k => k.key === kho)?.label || kho
  return <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${KHO_CHIP[kho] || ''}`}>{label}</span>
}

function Thumb({ file, onRemove }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    getPxkFileUrl(file.storagePath).then(u => { if (alive) setUrl(u) }).catch(() => {})
    return () => { alive = false }
  }, [file.storagePath])
  return (
    <div className="relative">
      <a href={url || undefined} target="_blank" rel="noreferrer" title="Mở ảnh cỡ lớn" className="block border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        {url ? <img src={url} alt={file.name} className="block w-full h-auto" /> : <div className="h-40 flex items-center justify-center text-xs text-gray-400">Đang tải ảnh…</div>}
      </a>
      {onRemove && <button type="button" onClick={onRemove} aria-label={`Xoá ảnh ${file.name}`} className="absolute top-1 right-1 bg-white/90 rounded-full p-1 text-gray-500 hover:text-red-600"><X size={13} /></button>}
    </div>
  )
}

function PickButtons({ kho, onFiles, busy, camLabel = 'Chụp ảnh phiếu', fileLabel = '+ Thêm file', accept = '.pdf,image/*' }) {
  return (
    <div className="flex flex-wrap gap-2">
      <label className={`sheet-tab-action is-primary cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        <Camera size={13} /> {camLabel}
        <input type="file" accept="image/*" capture="environment" hidden aria-label={`${camLabel} ${kho}`} onChange={e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) onFiles(fs) }} />
      </label>
      <label className={`sheet-tab-action cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
        {fileLabel}
        <input type="file" accept={accept} multiple hidden aria-label={`${fileLabel} ${kho}`} onChange={e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) onFiles(fs) }} />
      </label>
    </div>
  )
}

function DropZone({ onFiles, children, className = '' }) {
  const [drag, setDrag] = useState(false)
  return (
    <div
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDrag(false) }}
      onDrop={e => { e.preventDefault(); setDrag(false); const fs = [...e.dataTransfer.files]; if (fs.length) onFiles(fs) }}
      className={`rounded-xl border-2 border-dashed p-3 flex flex-col gap-2 min-w-0 ${drag ? 'border-[#1e3a5f] bg-slate-100' : 'border-gray-200 bg-gray-50/60'} ${className}`}
    >{children}</div>
  )
}

const ROW_COLS = [
  ['maHang', 'Mã VT', 90], ['tenHang', 'Tên vật tư', 240], ['dvt', 'ĐVT', 60], ['soLuong', 'Số lượng', 90], ['soLo', 'Lô', 100], ['hanDung', 'Hạn dùng', 105],
]

// Nhập tay / sửa các dòng của 1 phiếu: ảnh phiếu bên trái, bảng gõ bên phải.
function PhieuEditor({ phieu, results, onChange, onAddImages, busy, onClose }) {
  const pending = r => ocrRowNeedsCheck(r, results)
  const anyPending = phieu.rows.some(pending)
  const fromOcr = phieu.rows.some(r => r.ocr)
  const setRow = (i, k, v) => onChange({ ...phieu, rows: phieu.rows.map((r, idx) => (idx === i ? { ...r, [k]: v, checked: false } : r)) })
  const fixRow = (i, k) => {
    const r = phieu.rows[i]
    if (k === 'soLuong') setRow(i, k, parseQty(r.soLuong))
    if (k === 'hanDung') setRow(i, k, normHanDung(r.hanDung))
    if (k === 'maHang') setRow(i, k, String(r.maHang || '').trim().toUpperCase())
  }
  const shown = (r, k) => (k === 'hanDung' ? fmtHanDung(r.hanDung) : (r[k] ?? ''))
  return (
    <section className="rounded-2xl border border-[#1e3a5f]/30 bg-white p-3 flex flex-col gap-3" aria-label="Nhập tay phiếu">
      <div className="flex flex-wrap items-center gap-2">
        <KhoChip kho={phieu.kho} />
        <span className="font-semibold text-sm">{phieu.kind === 'pdf' ? 'Dòng đọc từ PDF (sửa được nếu cần)' : (fromOcr ? 'Phiếu đọc từ ảnh' : 'Nhập tay phiếu theo ảnh')}</span>
        <button type="button" onClick={onClose} className="sheet-tab-action ml-auto"><Check size={13} /> Xong</button>
      </div>
      {fromOcr && (
        <div className={`rounded-lg border text-xs px-3 py-2 flex flex-wrap items-center gap-2 ${anyPending ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
          {anyPending
            ? <span>App đã <b>đọc chữ từ ảnh</b>. Dòng <b>khớp thực nhận</b> app tự xác nhận; dòng <b>tô vàng</b> lệch thực nhận — có thể đọc nhầm hoặc lệch thật, anh so với ảnh bên trái rồi sửa. Đúng là lệch thật thì bấm “Đã soát, lệch thật”.</span>
            : <span>{phieu.rows.some(r => r.ocr && r.checked) ? '✓ Đã soát xong — dòng lệch thật được giữ để báo đầu nguồn.' : '✓ Mọi dòng đọc từ ảnh đều khớp thực nhận, không cần soát.'}</span>}
          {anyPending && <button type="button" onClick={() => onChange({ ...phieu, rows: phieu.rows.map(r => (pending(r) ? { ...r, checked: true } : r)) })} className="sheet-tab-action ml-auto">Đã soát, lệch thật</button>}
        </div>
      )}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        {(phieu.kind !== 'pdf' || phieu.images.length > 0) && (
          <div className="flex flex-col gap-2 min-w-0">
            <div className="text-xs text-gray-500">{phieu.images.length} ảnh · bấm vào ảnh để mở cỡ lớn</div>
            <div className="flex flex-col gap-2 max-h-[70vh] overflow-y-auto pr-1">
              {phieu.images.map((f, i) => <Thumb key={f.storagePath} file={f} onRemove={() => onChange({ ...phieu, images: phieu.images.filter((_, idx) => idx !== i) })} />)}
            </div>
            <PickButtons kho={phieu.kho} onFiles={onAddImages} busy={busy} camLabel="Chụp thêm trang" fileLabel="+ Thêm ảnh trang" accept="image/*" />
          </div>
        )}
        <div className="flex flex-col gap-2 min-w-0">
          <label className="flex flex-col gap-1 text-xs text-gray-500 max-w-xs">Số phiếu
            <input value={phieu.soPhieu} onChange={e => onChange({ ...phieu, soPhieu: e.target.value })} placeholder="VD: XD2611/04592" aria-label="Số phiếu" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-900" />
          </label>
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs border-collapse" style={{ minWidth: 700 }}>
              <thead className="bg-gray-50"><tr>{ROW_COLS.map(([k, l, w]) => <th key={k} className="px-1.5 py-1.5 text-left font-semibold text-gray-500" style={{ width: w }}>{l}</th>)}<th /></tr></thead>
              <tbody>
                {phieu.rows.map((r, i) => (
                  <tr key={r.rowId} className={`border-t border-gray-100 ${pending(r) ? 'bg-amber-50' : ''}`}>
                    {ROW_COLS.map(([k, l]) => (
                      <td key={k} className="px-1 py-1">
                        <input value={shown(r, k)} onChange={e => setRow(i, k, e.target.value)} onBlur={() => fixRow(i, k)} aria-label={`${l} dòng ${i + 1}`}
                          className={`w-full border rounded px-1.5 py-1 ${pending(r) && k !== 'tenHang' && k !== 'dvt' && (r[k] === '' || r[k] === null || r[k] === undefined) ? 'border-amber-400 bg-white' : 'border-gray-200'} ${k === 'soLuong' ? 'text-right tabular-nums' : ''} ${['maHang', 'soLo'].includes(k) ? 'font-mono' : ''}`} />
                      </td>
                    ))}
                    <td className="px-1"><button type="button" onClick={() => onChange({ ...phieu, rows: phieu.rows.filter((_, idx) => idx !== i) })} aria-label={`Xoá dòng ${i + 1}`} className="text-gray-400 hover:text-red-600"><Trash2 size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => onChange({ ...phieu, rows: [...phieu.rows, newPxkRow()] })} className="sheet-tab-action"><Plus size={13} /> Thêm dòng</button>
            <span className="text-[11px] text-gray-400">Số lượng gõ như trên phiếu cũng được (3.380,000 → 3.380). Hạn dùng gõ dd/mm/yyyy.</span>
          </div>
        </div>
      </div>
    </section>
  )
}

// Bản đầu lưu files là danh sách tên (không có dòng theo file) — đọc được cả 2 dạng.
const scanFilesOf = sc => (sc?.files || []).map(f => (typeof f === 'string' ? { name: f, rows: [] } : f))

function DuplicateTems({ list }) {
  if (!list.length) return null
  const extra = list.reduce((s, e) => s + (Number(e.soLuong) || 0) * (e.hits.length - 1), 0)
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 flex flex-col gap-2" role="alert" aria-label="Mã tem trùng">
      <div className="text-sm text-red-800"><b>⚠ {list.length} mã tem bị quét trùng</b> giữa các file quét — số lượng đang bị cộng trùng khoảng <b>{extra.toLocaleString('vi-VN')}</b>. Kiểm tra thực tế mã tem thuộc kho nào rồi huỷ nhập ở chỗ còn lại.</div>
      <div className="overflow-x-auto bg-white rounded-lg border border-red-100">
        <table className="w-full text-xs" style={{ minWidth: 640 }}>
          <thead className="bg-red-50/60 text-gray-600"><tr>{['Mã tem', 'Mã hàng', 'Tên hàng', 'Số lô', 'SL / tem', 'Xuất hiện ở'].map(h => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {list.map(e => (
              <tr key={e.maTem} className="border-t border-red-50 align-top">
                <td className="px-2 py-1.5 font-mono font-semibold text-red-700">{e.maTem}</td>
                <td className="px-2 py-1.5 font-mono">{e.maHang}</td>
                <td className="px-2 py-1.5">{e.tenHang}</td>
                <td className="px-2 py-1.5 font-mono">{e.soLo}</td>
                <td className="px-2 py-1.5 tabular-nums">{vn(e.soLuong)}</td>
                <td className="px-2 py-1.5">{e.hits.map((h, i) => <div key={i} className="whitespace-nowrap"><b>{PXK_KHO.find(k => k.key === h.zone)?.label}</b>{h.kho && <span className="text-gray-500"> (kho {h.kho})</span>} · {h.fileName}{h.stt && <> · STT {h.stt}</>}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Đọc chữ từ 1 ảnh → dòng hàng + số phiếu. Lỗi đọc (mất mạng lần đầu tải bộ đọc chữ…) thì trả rỗng, kho nhập tay.
async function ocrRows(blob) {
  try {
    const text = await ocrImage(blob, t => parseOcrPxkText(t).length > 0)
    const rows = parseOcrPxkText(text).map(it => newPxkRow({ ...it, soLuong: it.soLuong ?? '', ocr: true }))
    return { soPhieu: readSoPhieu(text), rows, problem: rows.length ? '' : 'đọc được chữ nhưng không thấy dòng hàng nào (không thấy mã vật tư dạng A12345) — ảnh có thể mờ, lóa hoặc bị cắt mất cột Mã vật tư' }
  } catch (err) {
    return { soPhieu: '', rows: [], problem: `không đọc được chữ trong ảnh (${err?.message || err})` }
  }
}

const pdfOf = ph => (ph.files || []).find(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')

// Đọc lại PDF đã lưu của 1 phiếu. Đọc được dòng hàng → phiếu PDF tự đọc; không được → giữ nhập tay (đánh dấu đã thử).
async function rereadStoredPdf(ph) {
  const pdf = pdfOf(ph)
  if (!pdf) return { ...ph, autoRead: true }
  const text = await extractPdfText(await downloadPxkFile(pdf.storagePath))
  const items = readPxkPdfRows(text, parsePdfItems)
  if (!items.length) return { ...ph, autoRead: true }
  return {
    ...ph, kind: 'pdf', autoRead: true, soPhieu: ph.soPhieu || readSoPhieu(text),
    rows: items.map(it => newPxkRow({ maHang: it.maHang, tenHang: it.tenHang, dvt: it.dvt, soLuong: it.soLuong, soLo: it.soLo, hanDung: it.hanDung || '' })),
  }
}

export default function DoiChieuSoSachTab() {
  const [batches] = useState(() => readGoodsBatches().sort((a, b) => String(b.processedAt).localeCompare(String(a.processedAt))))
  const [batchId, setBatchId] = useState(() => batches[0]?.id || '')
  const [store, setStore] = useState(() => readPxkStore())
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [kho, setKho] = useState('C')
  const [filter, setFilter] = useState('all')
  const [copyMsg, setCopyMsg] = useState('')
  const reportRef = useRef(null)

  const batch = batches.find(b => b.id === batchId) || null
  const session = { ...emptyPxkSession(), ...(store[batchId] || {}) }
  const save = next => { if (!batchId) return; setStore(writePxkSession(batchId, next)) }
  const patch = p => save({ ...session, ...p })
  const setPhieu = ph => patch({ phieus: session.phieus.map(x => (x.id === ph.id ? ph : x)) })

  const results = Object.fromEntries(PXK_KHO.map(({ key }) => [key, reconcilePxk({
    received: receivedRowsOf(batch, key), scanned: session.scan[key]?.rows || null, phieus: session.phieus.filter(p => p.kho === key),
  })]))
  const report = buildNguonReport(results, batch?.pdfMetadata?.ngayNhap ? `chuyến nhập ${batch.pdfMetadata.ngayNhap}` : '')

  const addPxkFiles = async (k, files) => {
    setError(''); setBusy(`pxk-${k}`)
    const added = []
    const errs = []
    for (const f of files) {
      try {
        if (isPdf(f)) {
          const stored = await uploadPxkFile(f)
          const text = await extractPdfText(await f.arrayBuffer())
          const items = readPxkPdfRows(text, parsePdfItems)
          added.push(newPxkPhieu(items.length
            ? { kho: k, kind: 'pdf', name: f.name, soPhieu: readSoPhieu(text), files: [stored], rows: items.map(it => newPxkRow({ maHang: it.maHang, tenHang: it.tenHang, dvt: it.dvt, soLuong: it.soLuong, soLo: it.soLo, hanDung: it.hanDung || '' })) }
            : { kho: k, kind: 'tay', name: f.name, soPhieu: readSoPhieu(text), files: [stored], rows: [newPxkRow()] }))
          if (!items.length) errs.push(`${f.name}: PDF không đọc được dòng hàng (có thể là bản scan / ảnh) — đã thêm để nhập tay`)
        } else if (isImage(f)) {
          const [stored, read] = await Promise.all([uploadPxkFile(f), ocrRows(f)])
          added.push({ ...newPxkPhieu({ kho: k, kind: 'anh', name: f.name, soPhieu: read.soPhieu, images: [stored], rows: read.rows.length ? read.rows : [newPxkRow()] }), ocrNote: read.problem ? `${read.problem}. Đã lưu ảnh để nhập tay.` : '' })
        } else errs.push(`${f.name}: chỉ nhận PDF hoặc ảnh`)
      } catch (err) { errs.push(`${f.name}: ${err.message || 'không tải lên được'}`) }
    }
    if (added.length) {
      patch({ phieus: [...session.phieus, ...added] })
      const firstManual = added.find(p => p.kind !== 'pdf' && !p.rows.some(x => x.maHang)) // ảnh đọc được dòng thì không mở, chỉ dòng lệch mới cần soát
      if (firstManual) setOpenId(firstManual.id)
    }
    if (errs.length) setError(errs.join(' · '))
    setBusy('')
  }

  // Phiếu PDF tải lên trước khi app đọc được mẫu CPC1 Hà Nội (đang ở dạng nhập tay): đọc lại từ file đã lưu.
  const rereadPdf = async ph => {
    setError(''); setBusy(`reread-${ph.id}`)
    try {
      const next = await rereadStoredPdf(ph)
      if (next.kind === 'pdf') setPhieu(next)
      else setError(`${ph.name}: vẫn không đọc được dòng hàng (có thể là bản scan) — anh nhập tay giúp em.`)
    } catch (err) { setError(err.message || 'Không đọc lại được PDF.') } finally { setBusy('') }
  }

  // Mở trang: phiếu PDF chưa có dòng nào (tải lên từ trước) thì tự đọc lại 1 lần, không cần bấm nút.
  const autoReadDone = useRef(new Set())
  useEffect(() => {
    if (!batchId || autoReadDone.current.has(batchId)) return
    autoReadDone.current.add(batchId)
    const todo = (store[batchId]?.phieus || []).filter(p => p.kind === 'tay' && !p.autoRead && pdfOf(p) && !p.rows.some(r => r.maHang))
    if (!todo.length) return
    void (async () => {
      const updated = new Map()
      for (const ph of todo) {
        try { updated.set(ph.id, await rereadStoredPdf(ph)) } catch { updated.set(ph.id, { ...ph, autoRead: true }) }
      }
      const cur = { ...emptyPxkSession(), ...(readPxkStore()[batchId] || {}) }
      setStore(writePxkSession(batchId, { ...cur, phieus: cur.phieus.map(p => updated.get(p.id) || p) }))
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId])

  const addImagesTo = async (ph, files) => {
    setError(''); setBusy(`img-${ph.id}`)
    try {
      const imgs = []
      const rows = []
      let soPhieu = ph.soPhieu
      for (const f of files.filter(isImage)) {
        const [stored, read] = await Promise.all([uploadPxkFile(f), ocrRows(f)])
        imgs.push(stored)
        rows.push(...read.rows)
        soPhieu = soPhieu || read.soPhieu
      }
      const kept = ph.rows.filter(x => x.maHang || x.tenHang)
      setPhieu({ ...ph, soPhieu, images: [...ph.images, ...imgs], rows: rows.length ? [...kept, ...rows] : ph.rows })
    } catch (err) { setError(err.message || 'Không tải ảnh lên được.') } finally { setBusy('') }
  }

  // Ảnh đã tải từ trước khi có đọc chữ: đọc lại từ ảnh đã lưu.
  const ocrStored = async ph => {
    setError(''); setBusy(`ocr-${ph.id}`)
    try {
      const rows = []
      const problems = []
      let soPhieu = ph.soPhieu
      for (const img of ph.images) {
        const read = await ocrRows(new Blob([await downloadPxkFile(img.storagePath)], { type: img.type || 'image/jpeg' }))
        rows.push(...read.rows)
        if (read.problem) problems.push(read.problem)
        soPhieu = soPhieu || read.soPhieu
      }
      if (!rows.length) { setPhieu({ ...ph, ocrNote: `${problems[0] || 'không đọc được dòng hàng nào'}. Anh nhập tay, hoặc chụp lại thẳng, đủ sáng.` }); return }
      setPhieu({ ...ph, soPhieu, rows, ocrNote: '' })
      setOpenId(ph.id)
    } catch (err) { setPhieu({ ...ph, ocrNote: `không đọc được ảnh (${err.message || err})` }) } finally { setBusy('') }
  }

  const addScanFiles = async (k, files) => {
    setError(''); setBusy(`scan-${k}`)
    try {
      const valid = files.filter(isExcel)
      // Giữ dòng theo từng file (kèm mã tem, STT, kho trên file) để cảnh báo mã tem trùng giữa các file / các kho.
      const list = scanFilesOf(session.scan[k])
      const errs = []
      for (const f of valid) {
        try {
          const rows = readActualScanRows(await f.arrayBuffer()).map(r => ({ maHang: r.maHang, tenHang: r.tenHang || '', soLo: r.soLo || '', soLuong: r.soLuong ?? 0, maTem: r.maTem || '', stt: r.stt || '', kho: r.kho || '' }))
          list.push({ name: f.name, rows })
        } catch (err) { errs.push(`${f.name}: ${err.message}`) }
      }
      if (valid.length < files.length) errs.push('Chỉ nhận file .xlsx / .xls')
      patch({ scan: { ...session.scan, [k]: { files: list, rows: mergeActualScanRows(list.flatMap(x => x.rows)) } } })
      if (errs.length) setError(errs.join(' · '))
    } catch (err) { setError(err.message || 'Không đọc được file quét.') } finally { setBusy('') }
  }

  const removeScanFile = (k, i) => {
    const list = scanFilesOf(session.scan[k]).filter((_, idx) => idx !== i)
    if (!list.length) { patch({ scan: { ...session.scan, [k]: null } }); return }
    patch({ scan: { ...session.scan, [k]: { files: list, rows: mergeActualScanRows(list.flatMap(x => x.rows)) } } })
  }

  const toggleChecked = key => {
    const set = new Set(session.checked)
    if (set.has(key)) set.delete(key)
    else set.add(key)
    patch({ checked: [...set] })
  }
  const copyReport = () => {
    navigator.clipboard?.writeText(report).then(() => setCopyMsg('Đã sao chép, anh dán vào Zalo để gửi.'))
      .catch(() => { reportRef.current?.select(); setCopyMsg('Đã chọn sẵn nội dung, bấm Ctrl+C để sao chép.') })
  }

  if (!batches.length) {
    return <div className="bg-white rounded-2xl border border-gray-200 p-8 text-sm text-gray-600 text-center">Chưa có chuyến nhập hàng nào đã lưu. Xử lý ở mục "Nhập hàng" trước, rồi quay lại đây để đối chiếu sổ sách.</div>
  }

  const openPhieu = session.phieus.find(p => p.id === openId)
  const dupTems = findDuplicateTems(PXK_KHO.flatMap(({ key }) => scanFilesOf(session.scan[key]).map(f => ({ zone: key, fileName: f.name, rows: f.rows }))))
  const rows = results[kho] || []
  const visible = rows.filter(r => matchFilter(r, filter))
  const countOf = (k, f) => (results[k] || []).filter(r => matchFilter(r, f)).length

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-sm text-gray-700">
        So <b>Phiếu xuất kho nhà máy</b> (sổ sách) với <b>BB thực nhận</b> của chuyến đã lưu và <b>file quét nhập</b> trên web nội bộ, theo Mã hàng + Số lô.
        Lệch giữa thực nhận và sổ sách gom vào phần <b>Báo đầu nguồn</b> để gửi Zalo.
      </div>

      <label className="flex flex-col gap-1 text-xs text-gray-500 max-w-md">Chuyến nhập hàng
        <select value={batchId} onChange={e => { setBatchId(e.target.value); setOpenId(null) }} aria-label="Chuyến nhập hàng" className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-900 bg-white">
          {batches.map(b => <option key={b.id} value={b.id}>{batchLabel(b)}</option>)}
        </select>
      </label>

      {error && <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 text-xs px-3 py-2">{error}</div>}

      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3" aria-label="Phiếu xuất kho nhà máy">
        <div>
          <h2 className="m-0 text-base font-semibold">1 · Phiếu xuất kho nhà máy</h2>
          <div className="text-xs text-gray-500">Thả phiếu vào đúng vùng kho. <b>PDF gốc</b> (mẫu DTP) app tự đọc; <b>ảnh chụp</b> (mẫu CPC1 Hà Nội) lưu kèm, bấm <b>Nhập tay</b> gõ các dòng theo ảnh. Không giới hạn số phiếu, số ảnh.</div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {PXK_KHO.map(({ key, label }) => {
            const list = session.phieus.filter(p => p.kho === key)
            return (
              <DropZone key={key} onFiles={fs => void addPxkFiles(key, fs)}>
                <div className="flex items-center justify-between"><KhoChip kho={key} /><span className="text-[11px] text-gray-400">{list.length} phiếu</span></div>
                {list.map(p => {
                  const n = p.rows.filter(r => r.maHang).length
                  return (
                    <div key={p.id} className={`bg-white border rounded-lg px-2 py-1.5 text-xs flex flex-col gap-0.5 ${openId === p.id ? 'border-[#1e3a5f]' : 'border-gray-200'}`}>
                      <div className="flex items-center gap-1.5 min-w-0">
                        {p.kind === 'pdf' || p.files.length ? <FileText size={13} className="text-gray-400 shrink-0" /> : <ImageIcon size={13} className="text-gray-400 shrink-0" />}
                        <span className="font-mono font-semibold truncate" title={p.name}>{p.soPhieu || p.name || 'Phiếu chưa ghi số'}</span>
                        <button type="button" onClick={() => { if (openId === p.id) setOpenId(null); patch({ phieus: session.phieus.filter(x => x.id !== p.id) }) }} aria-label={`Xoá phiếu ${p.soPhieu || p.name}`} className="ml-auto text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-gray-500">
                        {(() => {
                          const ocrN = p.rows.filter(r => r.ocr && r.maHang).length
                          const pend = p.rows.filter(r => ocrRowNeedsCheck(r, results[p.kho] || [])).length
                          const text = p.kind === 'pdf' ? `PDF gốc · tự đọc ${n} dòng`
                            : `${p.images.length ? `${p.images.length} ảnh · ` : ''}${!n ? 'chưa nhập dòng nào' : ocrN ? `đọc từ ảnh ${n} dòng${pend ? ` — ${pend} dòng cần soát` : (p.rows.some(r => r.ocr && r.checked) ? ' · đã soát' : ' · khớp thực nhận')}` : `đã nhập ${n} dòng`}`
                          return <span className={!n || pend ? 'text-amber-700' : (ocrN && !pend ? 'text-green-700' : '')}>{text}</span>
                        })()}
                        <button type="button" onClick={() => setOpenId(openId === p.id ? null : p.id)} className="underline text-[#1e3a5f] font-semibold">{p.kind === 'pdf' ? 'Xem / sửa' : 'Nhập tay'}</button>
                        {p.kind === 'anh' && p.images.length > 0 && !n && (
                          <button type="button" onClick={() => void ocrStored(p)} disabled={busy === `ocr-${p.id}`} className="underline text-[#1e3a5f] font-semibold">{busy === `ocr-${p.id}` ? 'Đang đọc chữ…' : 'Đọc chữ từ ảnh'}</button>
                        )}
                        {p.kind === 'tay' && p.files.length > 0 && !n && (
                          <button type="button" onClick={() => void rereadPdf(p)} disabled={busy === `reread-${p.id}`} className="underline text-[#1e3a5f] font-semibold">{busy === `reread-${p.id}` ? 'Đang đọc…' : 'Đọc lại PDF'}</button>
                        )}
                      </div>
                      {busy === `ocr-${p.id}` && <div className="text-[11px] text-gray-500">Đang đọc chữ trong ảnh… thường 5–20 giây; lần đầu phải tải bộ đọc chữ nên có thể lâu hơn.</div>}
                      {p.ocrNote && busy !== `ocr-${p.id}` && !p.rows.some(x => x.maHang) && <div className="text-[11px] text-red-700">⚠ {p.ocrNote}</div>}
                    </div>
                  )
                })}
                <PickButtons kho={label} onFiles={fs => void addPxkFiles(key, fs)} busy={busy === `pxk-${key}`} />
                {busy === `pxk-${key}` && <div className="text-[11px] text-gray-500">Đang tải lên và đọc phiếu… (ảnh mất vài giây; lần đầu tải bộ đọc chữ có thể lâu hơn)</div>}
              </DropZone>
            )
          })}
        </div>
        {openPhieu && <PhieuEditor phieu={openPhieu} results={results[openPhieu.kho] || []} onChange={setPhieu} onAddImages={fs => void addImagesTo(openPhieu, fs)} busy={busy === `img-${openPhieu.id}`} onClose={() => setOpenId(null)} />}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3" aria-label="File quét nhập">
        <div>
          <h2 className="m-0 text-base font-semibold">2 · File quét nhập web nội bộ</h2>
          <div className="text-xs text-gray-500">Xuất file .xls trên web nội bộ rồi thả vào đúng kho (cùng file như trang Đối soát). Kho nào chưa thả file thì cột “Đã quét” để trống, không báo lệch quét. App tự cảnh báo mã tem bị quét trùng giữa các file.</div>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          {PXK_KHO.map(({ key, label }) => {
            const sc = session.scan[key]
            return (
              <DropZone key={key} onFiles={fs => void addScanFiles(key, fs)}>
                <div className="flex items-center justify-between gap-2"><KhoChip kho={key} />
                  {sc && <button type="button" onClick={() => patch({ scan: { ...session.scan, [key]: null } })} className="text-[11px] text-gray-400 hover:text-red-600">Bỏ file</button>}</div>
                {sc ? scanFilesOf(sc).map((f, i) => (
                  <div key={i} className="text-[11px] text-teal-700 flex items-center gap-1 min-w-0"><FileSpreadsheet size={12} className="shrink-0" /><span className="truncate" title={f.name}>{f.name}</span>
                    <button type="button" onClick={() => removeScanFile(key, i)} aria-label={`Bỏ file ${f.name}`} className="ml-auto text-gray-400 hover:text-red-600 shrink-0"><X size={12} /></button></div>
                ))
                  : <div className="text-[11px] text-gray-400">Chưa có file quét {label}</div>}
                <label className={`sheet-tab-action cursor-pointer self-start ${busy === `scan-${key}` ? 'opacity-60 pointer-events-none' : ''}`}>+ Thêm file .xls
                  <input type="file" accept=".xlsx,.xls" multiple hidden aria-label={`File quét ${label}`} onChange={e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) void addScanFiles(key, fs) }} />
                </label>
              </DropZone>
            )
          })}
        </div>
        <DuplicateTems list={dupTems} />
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3" aria-label="Kết quả đối chiếu">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-base font-semibold mr-2">3 · Đối chiếu</h2>
          {PXK_KHO.map(({ key, label }) => {
            const bad = countOf(key, 'nguon')
            return (
              <button key={key} type="button" onClick={() => setKho(key)} aria-pressed={kho === key}
                className={`px-3 py-1.5 rounded-lg text-sm border ${kho === key ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200'}`}>
                {label}{bad ? <span className="ml-1.5 px-1.5 rounded-full bg-red-500 text-white text-[11px]">{bad}</span> : null}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Lọc kết luận">
          {FILTERS.map(([f, l]) => (
            <button key={f} type="button" onClick={() => setFilter(f)} aria-pressed={filter === f}
              className={`px-2.5 py-1 rounded-full text-xs border ${filter === f ? 'border-[#1e3a5f] bg-slate-100 font-semibold' : 'border-gray-200 bg-white text-gray-600'}`}>
              {l} <span className="tabular-nums">{countOf(kho, f)}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-xs border-collapse" style={{ minWidth: 980 }}>
            <thead className="bg-gray-50 text-gray-500">
              <tr>
                {['Mã VT', 'Tên vật tư', 'ĐVT', 'Lô', 'Hạn dùng'].map(h => <th key={h} className="px-2 py-2 text-left font-semibold">{h}</th>)}
                <th className="px-2 py-2 text-right font-semibold border-l border-gray-200">Thực nhận</th>
                <th className="px-2 py-2 text-right font-semibold border-l border-gray-200">Đã quét</th>
                <th className="px-2 py-2 text-left font-semibold border-l border-gray-200">Số phiếu</th>
                <th className="px-2 py-2 text-left font-semibold">Lô · HD trên phiếu</th>
                <th className="px-2 py-2 text-right font-semibold">SL sổ sách</th>
                <th className="px-2 py-2 text-left font-semibold border-l border-gray-200">Kết luận</th>
                <th className="px-2 py-2 text-center font-semibold">Đã kiểm</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={12} className="px-3 py-4 text-gray-400">{rows.length ? 'Không có dòng nào ở mục này.' : 'Chưa có dữ liệu cho kho này.'}</td></tr>}
              {visible.map(r => {
                const ck = `${kho}:${r.key}`
                const done = session.checked.includes(ck)
                const lotBad = r.c !== null && r.pLo !== '' && r.pLo !== undefined && String(r.pLo).toUpperCase() !== String(r.soLo).toUpperCase()
                const hdBad = r.c !== null && r.pHd && r.hanDung && r.pHd !== r.hanDung
                return (
                  <tr key={r.key} className={`border-t border-gray-100 align-top ${done ? 'opacity-50' : ''}`}>
                    <td className="px-2 py-1.5 font-mono">{r.maHang}</td>
                    <td className="px-2 py-1.5">{r.tenHang}</td>
                    <td className="px-2 py-1.5">{r.dvt}</td>
                    <td className="px-2 py-1.5 font-mono">{r.soLo || '—'}</td>
                    <td className="px-2 py-1.5 font-mono">{fmtHanDung(r.hanDung) || '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-gray-100">{vn(r.a)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums border-l border-gray-100">{vn(r.b)}{r.b !== null && r.b !== r.a && <div className="text-amber-700 font-semibold">{r.b - r.a > 0 ? '+' : ''}{vn(r.b - r.a)}</div>}</td>
                    <td className="px-2 py-1.5 font-mono border-l border-gray-100">{r.phieus.join(', ') || '—'}</td>
                    <td className="px-2 py-1.5 font-mono">{r.c === null ? <span className="text-gray-400 font-sans">không có dòng nào</span>
                      : <><span className={lotBad ? 'text-violet-700 font-bold' : ''}>{r.pLo || '—'}</span> · <span className={hdBad ? 'text-violet-700 font-bold' : ''}>{fmtHanDung(r.pHd) || '—'}</span></>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{vn(r.c)}{r.c !== null && r.a !== r.c && <div className="text-red-700 font-semibold">{r.a > r.c ? 'thiếu' : 'thừa'} {vn(Math.abs(r.a - r.c))}</div>}</td>
                    <td className="px-2 py-1.5 border-l border-gray-100"><div className="flex flex-col items-start gap-1">{r.tags.map(t => <span key={t} className={`px-1.5 py-0.5 rounded border text-[11px] font-semibold whitespace-nowrap ${TONE[PXK_TAGS[t].tone]}`}>{PXK_TAGS[t].label}</span>)}</div></td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={done} onChange={() => toggleChecked(ck)} aria-label={`Đã kiểm ${r.maHang} lô ${r.soLo}`} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-gray-400">Thực nhận = SL thực tế đã sửa khi kiểm ở tab Nhập hàng (chưa sửa thì lấy SL trên biên bản). Tick “Đã kiểm” để đánh dấu dòng đã soát.</div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Báo đầu nguồn">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="m-0 text-base font-semibold">Báo đầu nguồn</h2>
          <button type="button" onClick={copyReport} disabled={!report} className="sheet-tab-action is-primary ml-auto"><Copy size={13} /> Sao chép để gửi Zalo</button>
        </div>
        <div className="text-xs text-gray-500">Chỉ gồm lệch giữa thực nhận và sổ sách, gom theo kho và số phiếu. Lệch do quét là việc của kho, không đưa vào đây.</div>
        <textarea ref={reportRef} readOnly value={report || 'Chưa có chênh lệch nào cần báo nhà máy.'} aria-label="Nội dung báo đầu nguồn" rows={Math.min(14, Math.max(4, report.split('\n').length + 1))}
          className="w-full font-mono text-xs border border-gray-200 rounded-lg p-2 bg-gray-50" />
        {copyMsg && <div className="text-xs text-green-700">{copyMsg}</div>}
      </section>
    </div>
  )
}
