import { useEffect, useRef, useState } from 'react'
import { Camera, Check, Copy, FileSpreadsheet, FileText, Image as ImageIcon, Plus, Trash2, X } from 'lucide-react'
import {
  PXK_KHO, PXK_TAGS, buildNguonReport, fmtHanDung, isNguonRow, newPxkPhieu, newPxkRow, normHanDung, parseQty,
  alignOcrRows, groupScanPages, mergeAiChunks, ocrRowNeedsCheck, pxkDuplicateGroups, pxkRowKey, parseOcrPxkText, readPxkPdfRows, readSoPhieu, receivedRowsOf, reconcilePxk,
} from '../utils/pxkReconcile'
import { emptyPxkSession, readGoodsBatches, readPxkStore, writePxkSession } from '../data/pxkStore'
import { downloadPxkFile, getPxkFileUrl, uploadPxkFile } from '../data/pxkFiles'
import { readPdfChunksWithAi, readPxkWithAi } from '../data/pxkAi'
import { ocrImage, ocrPdfPages, splitScanPdf, warmUpOcr } from '../utils/pxkOcr'
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

function PdfLink({ file }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    let alive = true
    getPxkFileUrl(file.storagePath).then(u => { if (alive) setUrl(u) }).catch(() => {})
    return () => { alive = false }
  }, [file.storagePath])
  return (
    <a href={url || undefined} target="_blank" rel="noreferrer" className="self-start inline-flex items-center gap-1.5 text-xs font-semibold text-[#1e3a5f] underline">
      <FileText size={13} /> Mở file {file.name} để so
    </a>
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

const FIX_LABEL = { maHang: 'mã', soLo: 'lô', hanDung: 'hạn dùng' }

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
        <span className="font-semibold text-sm">{phieu.kind === 'pdf' ? 'Dòng đọc từ PDF (sửa được nếu cần)' : (fromOcr ? (phieu.rows.some(r => r.ai) ? 'Phiếu AI đọc' : phieu.kind === 'scan' ? 'Phiếu đọc từ PDF scan' : 'Phiếu đọc từ ảnh') : 'Nhập tay phiếu theo ảnh')}</span>
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
            {phieu.files.map(f => <PdfLink key={f.storagePath} file={f} />)}
            {phieu.images.length > 0 && <div className="text-xs text-gray-500">{phieu.images.length} ảnh · bấm vào ảnh để mở cỡ lớn</div>}
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
                {phieu.rows.map((r, i) => [
                  <tr key={r.rowId} className={`border-t border-gray-100 ${pending(r) ? 'bg-amber-50' : ''}`}>
                    {ROW_COLS.map(([k, l]) => (
                      <td key={k} className="px-1 py-1">
                        <input value={shown(r, k)} onChange={e => setRow(i, k, e.target.value)} onBlur={() => fixRow(i, k)} aria-label={`${l} dòng ${i + 1}`}
                          className={`w-full border rounded px-1.5 py-1 ${pending(r) && k !== 'tenHang' && k !== 'dvt' && (r[k] === '' || r[k] === null || r[k] === undefined) ? 'border-amber-400 bg-white' : 'border-gray-200'} ${k === 'soLuong' ? 'text-right tabular-nums' : ''} ${['maHang', 'soLo'].includes(k) ? 'font-mono' : ''}`} />
                      </td>
                    ))}
                    <td className="px-1"><button type="button" onClick={() => onChange({ ...phieu, rows: phieu.rows.filter((_, idx) => idx !== i) })} aria-label={`Xoá dòng ${i + 1}`} className="text-gray-400 hover:text-red-600"><Trash2 size={13} /></button></td>
                  </tr>,
                  r.ocrFixed && (
                    <tr key={`${r.rowId}-fix`} className={pending(r) ? 'bg-amber-50' : ''}>
                      <td colSpan={ROW_COLS.length + 1} className="px-2 pb-1 text-[11px] text-gray-500">
                        App sửa theo thực nhận — {Object.entries(r.ocrFixed).map(([k, v]) => `${FIX_LABEL[k] || k} ${v ? `đọc được "${k === 'hanDung' ? fmtHanDung(v) : v}"` : 'không đọc được'}`).join(', ')}
                      </td>
                    </tr>
                  ),
                ])}
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
// Ảnh: AI đọc trước (nếu đã bật), không được thì bộ đọc chữ thường. file = ảnh đã lưu ({ storagePath, type }).
async function readImage(blob, file) {
  const ai = file ? await readAi(file, file.type || blob.type || 'image/jpeg') : { error: '' }
  if (ai.phieus) return { soPhieu: ai.phieus[0].soPhieu, rows: ai.phieus.flatMap(x => x.rows), problem: '' }
  const read = await ocrRows(blob)
  return ai.error ? { ...read, problem: [`AI chưa đọc được (${ai.error})`, read.problem].filter(Boolean).join('; ') } : read
}

async function ocrRows(blob) {
  try {
    const text = await ocrImage(blob, t => parseOcrPxkText(t).length > 0)
    const rows = parseOcrPxkText(text).map(it => newPxkRow({ ...it, soLuong: it.soLuong ?? '', ocr: true }))
    return { soPhieu: readSoPhieu(text), rows, problem: rows.length ? '' : 'đọc được chữ nhưng không thấy dòng hàng nào (không thấy mã vật tư dạng A12345) — ảnh có thể mờ, lóa hoặc bị cắt mất cột Mã vật tư' }
  } catch (err) {
    return { soPhieu: '', rows: [], problem: `không đọc được chữ trong ảnh (${err?.message || err})` }
  }
}

const fmtMb = n => `${((n || 0) / 1048576).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} MB`

const pdfOf = ph => (ph.files || []).find(f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf')

// Gemini (qua Edge Function pxk-ocr) đọc phiếu scan / ảnh: hiểu bảng nên ít lệch cột hơn hẳn bộ đọc chữ thường. Dòng
// vẫn đánh dấu ocr để tự đối chiếu thực nhận (dòng lệch mới cần soát). Lỗi thì trả { error } để quay về cách thường.
const mapAiPhieus = list => list.map(x => ({
  kind: 'ai', soPhieu: String(x.soPhieu || '').trim(), pages: Array.isArray(x.trang) ? x.trang : [],
  rows: (x.rows || []).filter(it => it.maHang).map(it => newPxkRow({
    maHang: String(it.maHang).trim().toUpperCase(), tenHang: it.tenHang || '', dvt: String(it.dvt || '').toUpperCase(),
    soLuong: it.soLuong ?? '', soLo: String(it.soLo || '').trim().toUpperCase(), hanDung: normHanDung(it.hanDung), ocr: true, ai: true,
  })),
})).filter(x => x.rows.length)

async function readAi(stored, mimeType) {
  try {
    const phieus = mapAiPhieus(await readPxkWithAi(stored.storagePath, mimeType))
    return phieus.length ? { phieus } : { error: 'AI không thấy dòng hàng nào' }
  } catch (err) { return { error: err?.message || String(err) } }
}

// PDF scan nhiều hơn chừng này trang thì chia phần gửi AI (gửi nguyên file lớn làm hàm Supabase quá giới hạn — lỗi 546).
const AI_PAGES = 4

// Đọc 1 file PDF phiếu. PDF có chữ (PDF gốc, hoặc scan bật "PDF có thể tìm kiếm") đọc thẳng — chính xác, tức thì.
// PDF scan: AI đọc trước (file nhiều trang chia phần, phần nào AI lỗi thì riêng các trang đó đọc bằng bộ đọc chữ
// thường); không có AI thì vẽ từng trang ra ảnh rồi đọc chữ (dòng đánh dấu ocr để tự đối chiếu thực nhận). File nhiều
// trang tách thành nhiều phiếu theo số phiếu. onProgress(đã xong, tổng trang) hoặc onProgress('lời báo').
// Trả về { kind, phieus: [{ kind?, soPhieu, pages, rows }], aiNote, problem }.
async function readPdfPhieu(buffer, onProgress = () => {}, aiFile = null, onNote = () => {}) {
  const text = await extractPdfText(buffer.slice ? buffer.slice(0) : buffer)
  const items = readPxkPdfRows(text, parsePdfItems)
  if (items.length) {
    return { kind: 'pdf', problem: '', phieus: [{ soPhieu: readSoPhieu(text), pages: [], rows: items.map(it => newPxkRow({ maHang: it.maHang, tenHang: it.tenHang, dvt: it.dvt, soLuong: it.soLuong, soLo: it.soLo, hanDung: it.hanDung || '' })) }] }
  }
  let aiNote = ''
  let aiPhieus = []
  let ocrOnly = null // chỉ đọc thường các trang này (null = cả file)
  if (aiFile) {
    onProgress('Đang chuẩn bị file cho AI đọc…')
    let split = { numPages: 0, chunks: [] }
    try { split = await splitScanPdf(buffer, AI_PAGES) } catch { /* không chia được — gửi nguyên file */ }
    if (split.chunks.length) {
      const results = await readPdfChunksWithAi(split.chunks, (d, t) => onProgress(`AI đang đọc phiếu scan ${split.numPages} trang: xong ${d}/${t} phần… (mỗi phần khoảng 20–40 giây)`))
      const merged = mergeAiChunks(split.chunks, results)
      aiPhieus = mapAiPhieus(merged.phieus)
      const err = merged.errors.join('; ')
      if (aiPhieus.length && !merged.failedPages.length) return { kind: 'ai', phieus: aiPhieus, problem: '' }
      if (aiPhieus.length) {
        ocrOnly = merged.failedPages
        aiNote = `AI chưa đọc được trang ${ocrOnly.join(', ')} (${err}) — các trang này đã đọc bằng bộ đọc chữ thường`
        onNote(`AI chưa đọc được trang ${ocrOnly.join(', ')} (${err}) — đang đọc các trang này bằng bộ đọc chữ thường`)
      } else {
        aiNote = `AI chưa đọc được (${err || 'AI không thấy dòng hàng nào'}) — đã đọc bằng bộ đọc chữ thường`
        onNote(`AI chưa đọc được (${err || 'AI không thấy dòng hàng nào'}) — đang chuyển sang bộ đọc chữ thường`)
      }
    } else {
      onProgress(-1, 0)
      const ai = await readAi(aiFile, 'application/pdf')
      if (ai.phieus) return { kind: 'ai', phieus: ai.phieus, problem: '' }
      aiNote = `AI chưa đọc được (${ai.error}) — đã đọc bằng bộ đọc chữ thường`
      onNote(`AI chưa đọc được (${ai.error}) — đang chuyển sang bộ đọc chữ thường`)
    }
  }
  try {
    const pageTexts = await ocrPdfPages(buffer, t => parseOcrPxkText(t).length > 0, onProgress, ocrOnly)
    const read = ocrOnly || pageTexts.map((_, i) => i + 1)
    const { groups } = groupScanPages(read.map(n => pageTexts[n - 1]))
    const scanPhieus = groups.filter(g => g.rows.length).map(g => ({ kind: 'scan', soPhieu: g.soPhieu, pages: g.pages.map(i => read[i - 1]), rows: g.rows.map(it => newPxkRow({ ...it, soLuong: it.soLuong ?? '', ocr: true })) }))
    const phieus = [...aiPhieus, ...scanPhieus].sort((a, b) => (a.pages[0] || 0) - (b.pages[0] || 0))
    return { kind: aiPhieus.length ? 'ai' : 'scan', phieus, aiNote, problem: phieus.length ? '' : 'PDF scan: đọc được chữ nhưng không thấy dòng hàng nào (không thấy mã vật tư) — bản scan có thể mờ hoặc nghiêng' }
  } catch (err) {
    if (aiPhieus.length) return { kind: 'ai', phieus: aiPhieus, aiNote: `${aiNote}; bộ đọc chữ thường cũng lỗi (${err?.message || err})`, problem: '' }
    return { kind: 'scan', phieus: [], aiNote, problem: `PDF scan: không đọc được chữ (${err?.message || err})` }
  }
}

// Đọc lại PDF đã lưu của 1 phiếu (phiếu tải lên trước khi app đọc được mẫu CPC1 / PDF scan) — gộp mọi trang vào phiếu đó.
async function rereadStoredPdf(ph) {
  const pdf = pdfOf(ph)
  if (!pdf) return { ...ph, autoRead: true }
  const read = await readPdfPhieu(await downloadPxkFile(pdf.storagePath), () => {}, pdf)
  const rows = read.phieus.flatMap(x => x.rows)
  if (!rows.length) return { ...ph, autoRead: true, ocrNote: read.problem }
  return { ...ph, kind: read.kind, autoRead: true, ocrNote: '', soPhieu: ph.soPhieu || read.phieus[0].soPhieu, rows }
}

// Khung so sánh các phiếu trùng số phiếu: từng dòng hàng (Mã + Lô) của mỗi bản đặt cạnh nhau, ô khác nhau tô đỏ —
// kho xem rồi chọn giữ bản nào (bản nhà máy sửa lại có thể khác số lượng / lô), hoặc giữ tất cả nếu là phiếu khác nhau.
function DuplicatePhieus({ groups, onKeep, onKeepAll }) {
  return (
    <div className="rounded-xl border-2 border-red-300 bg-red-50/60 p-3 flex flex-col gap-3" role="alert" aria-label="Phiếu trùng số">
      <div className="text-sm text-red-800"><b>⚠ {groups.length} số phiếu bị trùng</b> — app không tự bỏ bản nào. Anh so các bản bên dưới (ô tô đỏ là chỗ khác nhau) rồi chọn <b>giữ bản đúng</b>; bản còn lại không tính vào đối chiếu (khôi phục lại được). Trong lúc chưa chọn, các phiếu này chưa tính vào đối chiếu.</div>
      {groups.map(group => {
        const keys = []
        const cell = new Map()
        group.forEach(p => p.rows.filter(x => x.maHang).forEach(x => {
          const k = pxkRowKey(x.maHang, x.soLo)
          if (!keys.includes(k)) keys.push(k)
          cell.set(`${p.id}|${k}`, x)
        }))
        const show = x => (x ? `${vn(parseQty(x.soLuong))} · ${fmtHanDung(normHanDung(x.hanDung)) || '—'}` : 'không có')
        return (
          <div key={group[0].id} className="bg-white rounded-lg border border-red-200 p-2 flex flex-col gap-2">
            <div className="text-sm font-semibold font-mono">{group[0].soPhieu}</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 520 }}>
                <thead>
                  <tr className="bg-gray-50 text-gray-600">
                    <th className="px-2 py-1.5 text-left">Mã · Lô</th>
                    {group.map((p, i) => (
                      <th key={p.id} className="px-2 py-1.5 text-left align-top">
                        <div>Bản {i + 1} · <KhoChip kho={p.kho} /></div>
                        <div className="font-normal text-gray-500 break-all">{p.name}</div>
                        <button type="button" onClick={() => onKeep(group, p.id)} className="sheet-tab-action is-primary mt-1">Giữ bản {i + 1}</button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => {
                    const vals = group.map(p => show(cell.get(`${p.id}|${k}`)))
                    const diff = new Set(vals).size > 1
                    const [ma, lo] = k.split('::')
                    return (
                      <tr key={k} className="border-t border-gray-100">
                        <td className="px-2 py-1 font-mono">{ma} · {lo || '—'}</td>
                        {vals.map((v, i) => <td key={i} className={`px-2 py-1 tabular-nums ${diff ? 'bg-red-100 text-red-800 font-semibold' : ''}`}>{v}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <button type="button" onClick={() => onKeepAll(group)} className="sheet-tab-action self-start">Giữ tất cả (là các phiếu khác nhau)</button>
          </div>
        )
      })}
    </div>
  )
}

// Ghi dữ liệu 1 chuyến từ bản mới nhất đang lưu (không dùng bản đang hiển thị) — các phiếu đọc ngầm xong lúc nào
// thì ghi lúc đó, không ghi đè lên nhau.
function updateSessionOf(batchId, fn) {
  const cur = { ...emptyPxkSession(), ...(readPxkStore()[batchId] || {}) }
  return writePxkSession(batchId, fn(cur))
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
  const upd = (fn, bid = batchId) => { if (bid) setStore(updateSessionOf(bid, fn)) }
  const patch = p => upd(cur => ({ ...cur, ...p }))
  const setPhieu = ph => upd(cur => ({ ...cur, phieus: cur.phieus.map(x => (x.id === ph.id ? ph : x)) }))
  const align = (k, rows) => alignOcrRows(rows, receivedRowsOf(batch, k))
  const [zoneNote, setZoneNote] = useState({})
  const inFlight = useRef(new Set())

  // Nạp sẵn bộ đọc chữ ngay khi mở trang (chạy ngầm) — thả phiếu vào là đọc luôn, không chờ tải lần đầu.
  useEffect(() => { const t = setTimeout(warmUpOcr, 800); return () => clearTimeout(t) }, [])

  // Phiếu trùng số chưa chọn bản giữ + phiếu đã bỏ: không tính vào đối chiếu (tránh cộng sổ sách 2 lần).
  const dupGroups = pxkDuplicateGroups(session.phieus)
  const blocked = new Set(dupGroups.flat().map(p => p.id))
  const counted = p => !p.excluded && !blocked.has(p.id)
  const results = Object.fromEntries(PXK_KHO.map(({ key }) => [key, reconcilePxk({
    received: receivedRowsOf(batch, key), scanned: session.scan[key]?.rows || null, phieus: session.phieus.filter(p => p.kho === key && counted(p)),
  })]))
  const keepOne = (group, keepId) => upd(cur => ({ ...cur, phieus: cur.phieus.map(p => (group.some(g => g.id === p.id)
    ? (p.id === keepId ? { ...p, excluded: false, keepDup: false, excludedNote: '' } : { ...p, excluded: true, excludedNote: `trùng số phiếu ${p.soPhieu} — anh đã chọn giữ bản khác` })
    : p)) }))
  const keepAll = group => upd(cur => ({ ...cur, phieus: cur.phieus.map(p => (group.some(g => g.id === p.id) ? { ...p, keepDup: true } : p)) }))
  const report = buildNguonReport(results, batch?.pdfMetadata?.ngayNhap ? `chuyến nhập ${batch.pdfMetadata.ngayNhap}` : '')

  // Thả / chụp phiếu: thẻ phiếu hiện ngay ("đang đọc…"), tải lên + đọc chạy ngầm — thả tiếp phiếu khác, xem bảng
  // thoải mái; đọc xong dòng hàng tự điền vào. Ảnh / trang scan đọc song song theo nhóm bộ đọc chữ.
  const addPxkFiles = (k, files) => {
    setError('')
    const bid = batchId
    const rec = receivedRowsOf(batch, k)
    const bad = files.filter(f => !isPdf(f) && !isImage(f))
    const jobs = files.filter(f => isPdf(f) || isImage(f)).map(f => ({ f, ph: { ...newPxkPhieu({ kho: k, kind: 'dang', name: f.name }), reading: `Đang tải lên… (${fmtMb(f.size)})` } }))
    setZoneNote(n => ({ ...n, [k]: bad.length ? `Bỏ qua ${bad.map(f => f.name).join(', ')}: chỉ nhận PDF hoặc ảnh.` : '' }))
    if (!jobs.length) return
    jobs.forEach(j => inFlight.current.add(j.ph.id))
    upd(cur => ({ ...cur, phieus: [...cur.phieus, ...jobs.map(j => j.ph)] }), bid)
    jobs.forEach(j => { void processFile(j.f, j.ph, k, rec, bid).finally(() => inFlight.current.delete(j.ph.id)) })
  }

  const processFile = async (f, ph, k, rec, bid) => {
    const setPh = fn => upd(cur => ({ ...cur, phieus: cur.phieus.map(p => (p.id === ph.id ? fn(p) : p)) }), bid)
    const replace = make => upd(cur => {
      const i = cur.phieus.findIndex(p => p.id === ph.id)
      if (i < 0) return cur // đã bị xoá trong lúc đọc
      const list = [...cur.phieus]
      list.splice(i, 1, ...make(cur.phieus.filter(p => p.id !== ph.id)))
      return { ...cur, phieus: list }
    }, bid)
    const pdf = isPdf(f)
    try {
      // Mạng chập chờn có thể làm việc tải lên treo mãi — quá 5 phút thì báo lỗi để kho thả lại.
      const stored = await Promise.race([
        uploadPxkFile(f),
        new Promise((_, reject) => setTimeout(() => reject(new Error(`tải lên quá 5 phút — file ${fmtMb(f.size)}, mạng có thể chậm; thử lại hoặc scan nhẹ hơn`)), 300000)),
      ])
      setPh(p => ({ ...p, [pdf ? 'files' : 'images']: [stored], reading: pdf ? 'Đang đọc PDF…' : 'Đang đọc chữ trong ảnh… (vài giây)' }))
      if (!pdf) {
        setPh(p => ({ ...p, reading: 'AI đang đọc ảnh phiếu…' }))
        const ai = await readAi(stored, f.type || 'image/jpeg')
        if (ai.phieus) {
          const rows = ai.phieus.flatMap(x => x.rows)
          replace(() => [{ ...ph, kind: 'anh', reading: '', images: [stored], soPhieu: ai.phieus[0].soPhieu, rows: alignOcrRows(rows, rec), ocrNote: '' }])
          return
        }
        setPh(p => ({ ...p, reading: 'Đang đọc chữ trong ảnh… (vài giây)' }))
        const read = await ocrRows(f)
        const note = [`AI chưa đọc được (${ai.error}) — đã đọc bằng bộ đọc chữ thường`, read.problem && `${read.problem}. Đã lưu ảnh để nhập tay.`].filter(Boolean).join('. ')
        replace(() => [{ ...ph, kind: 'anh', reading: '', images: [stored], soPhieu: read.soPhieu, rows: read.rows.length ? alignOcrRows(read.rows, rec) : [newPxkRow()], ocrNote: note }])
        return
      }
      const read = await readPdfPhieu(await f.arrayBuffer(), (d, t) => setPh(p => ({ ...p, reading: typeof d === 'string' ? d : d < 0 ? 'AI đang đọc phiếu scan… (khoảng 10–40 giây)' : t > 1 ? `Đang đọc chữ bản scan: xong ${d}/${t} trang…` : 'Đang đọc chữ bản scan…' })), stored, note => setPh(p => ({ ...p, ocrNote: note })))
      if (!read.phieus.length) {
        replace(() => [{ ...ph, kind: 'tay', reading: '', files: [stored], rows: [newPxkRow()], autoRead: true, ocrNote: [read.aiNote, `${read.problem}. Đã lưu file để nhập tay.`].filter(Boolean).join('. ') }])
        return
      }
      // Phiếu trùng số (trong file hoặc với phiếu đã có) vẫn thêm đủ — app không tự bỏ, kho chọn bản giữ ở khung đỏ.
      replace(() => read.phieus.map((x, i) => ({
          ...newPxkPhieu({ kho: k, kind: x.kind || read.kind, name: read.phieus.length > 1 ? `${f.name} · trang ${x.pages.join(', ') || i + 1}` : f.name, soPhieu: x.soPhieu, files: [stored], rows: read.kind === 'pdf' ? x.rows : alignOcrRows(x.rows, rec) }),
          ...(i === 0 ? { id: ph.id } : {}), autoRead: true, ocrNote: i === 0 ? (read.aiNote || '') : '',
        })))
    } catch (err) {
      replace(() => [{ ...ph, kind: pdf ? 'tay' : 'anh', reading: '', rows: [newPxkRow()], autoRead: true, ocrNote: `không tải lên / đọc được (${err?.message || err})` }])
    }
  }

  // Thẻ "đang đọc" còn sót do tải lại trang giữa chừng: chuyển sang chờ đọc lại / nhập tay.
  useEffect(() => {
    const stale = (store[batchId]?.phieus || []).filter(p => p.kind === 'dang' && !inFlight.current.has(p.id))
    if (!stale.length) return
    upd(cur => ({
      ...cur,
      phieus: cur.phieus.filter(p => !(stale.some(x => x.id === p.id) && !p.files.length && !p.images.length)).map(p => (stale.some(x => x.id === p.id)
        ? { ...p, kind: p.files.length ? 'tay' : 'anh', reading: '', autoRead: true, rows: [newPxkRow()], ocrNote: 'đọc bị gián đoạn (trang được tải lại khi đang đọc) — bấm đọc lại' }
        : p)),
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchId])

  // Phiếu PDF tải lên trước khi app đọc được mẫu CPC1 Hà Nội (đang ở dạng nhập tay): đọc lại từ file đã lưu.
  const rereadPdf = async ph => {
    setError(''); setBusy(`reread-${ph.id}`)
    try {
      const raw = await rereadStoredPdf(ph)
      const next = { ...raw, rows: align(ph.kho, raw.rows) }
      setPhieu(next)
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
        try { const raw = await rereadStoredPdf(ph); updated.set(ph.id, { ...raw, rows: alignOcrRows(raw.rows, receivedRowsOf(batch, ph.kho)) }) } catch { updated.set(ph.id, { ...ph, autoRead: true }) }
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
        const stored = await uploadPxkFile(f)
        const read = await readImage(f, stored)
        imgs.push(stored)
        rows.push(...read.rows)
        soPhieu = soPhieu || read.soPhieu
      }
      const kept = ph.rows.filter(x => x.maHang || x.tenHang)
      setPhieu({ ...ph, soPhieu, images: [...ph.images, ...imgs], rows: rows.length ? [...kept, ...align(ph.kho, rows)] : ph.rows })
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
        const read = await readImage(new Blob([await downloadPxkFile(img.storagePath)], { type: img.type || 'image/jpeg' }), img)
        rows.push(...read.rows)
        if (read.problem) problems.push(read.problem)
        soPhieu = soPhieu || read.soPhieu
      }
      if (!rows.length) { setPhieu({ ...ph, ocrNote: `${problems[0] || 'không đọc được dòng hàng nào'}. Anh nhập tay, hoặc chụp lại thẳng, đủ sáng.` }); return }
      setPhieu({ ...ph, soPhieu, rows: align(ph.kho, rows), ocrNote: '' })
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
          <div className="text-xs text-gray-500">Thả phiếu vào đúng vùng kho. <b>PDF gốc</b> app đọc tức thì; <b>PDF scan / ảnh chụp</b> app đọc chữ (chạy ngầm), dòng lệch thực nhận mới cần soát. Không giới hạn số phiếu, số ảnh.</div>
        </div>
        {dupGroups.length > 0 && <DuplicatePhieus groups={dupGroups} onKeep={keepOne} onKeepAll={keepAll} />}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          {PXK_KHO.map(({ key, label }) => {
            const list = session.phieus.filter(p => p.kho === key)
            return (
              <DropZone key={key} onFiles={fs => addPxkFiles(key, fs)}>
                <div className="flex items-center justify-between"><KhoChip kho={key} /><span className="text-[11px] text-gray-400">{list.length} phiếu</span></div>
                {list.map(p => {
                  const n = p.rows.filter(r => r.maHang).length
                  if (p.kind === 'dang') {
                    return (
                      <div key={p.id} className="bg-white border border-dashed border-[#1e3a5f]/40 rounded-lg px-2 py-1.5 text-xs flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-gray-400 shrink-0" /><span className="font-mono font-semibold truncate" title={p.name}>{p.name}</span></div>
                        <div className="text-[#1e3a5f] animate-pulse">⏳ {p.reading || 'Đang đọc…'}</div>
                        {p.ocrNote && <div className="text-[11px] text-amber-700">⚠ {p.ocrNote}</div>}
                      </div>
                    )
                  }
                  if (p.excluded) {
                    return (
                      <div key={p.id} className="bg-gray-50 border border-gray-200 rounded-lg px-2 py-1.5 text-xs flex flex-col gap-0.5 opacity-70">
                        <div className="flex items-center gap-1.5 min-w-0"><FileText size={13} className="text-gray-400 shrink-0" /><span className="font-mono line-through truncate" title={p.name}>{p.soPhieu || p.name}</span>
                          <button type="button" onClick={() => upd(cur => ({ ...cur, phieus: cur.phieus.map(x => (x.id === p.id ? { ...x, excluded: false, keepDup: false, excludedNote: '' } : x)) }))} className="ml-auto underline text-[#1e3a5f] font-semibold">Khôi phục</button></div>
                        <div className="text-gray-500">Đã bỏ, không tính đối chiếu — {p.excludedNote || 'anh đã bỏ phiếu này'} · {p.name}</div>
                      </div>
                    )
                  }
                  return (
                    <div key={p.id} className={`bg-white border rounded-lg px-2 py-1.5 text-xs flex flex-col gap-0.5 ${blocked.has(p.id) ? 'border-red-400 bg-red-50/40' : openId === p.id ? 'border-[#1e3a5f]' : 'border-gray-200'}`}>
                      {blocked.has(p.id) && <div className="text-red-700 font-semibold">⚠ Trùng số phiếu — chờ anh chọn bản giữ (chưa tính đối chiếu)</div>}
                      <div className="flex items-center gap-1.5 min-w-0">
                        {p.kind === 'pdf' || p.files.length ? <FileText size={13} className="text-gray-400 shrink-0" /> : <ImageIcon size={13} className="text-gray-400 shrink-0" />}
                        <span className="font-mono font-semibold truncate" title={p.name}>{p.soPhieu || p.name || 'Phiếu chưa ghi số'}</span>
                        <button type="button" onClick={() => { if (openId === p.id) setOpenId(null); upd(cur => ({ ...cur, phieus: cur.phieus.filter(x => x.id !== p.id) })) }} aria-label={`Xoá phiếu ${p.soPhieu || p.name}`} className="ml-auto text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-gray-500">
                        {(() => {
                          const ocrN = p.rows.filter(r => r.ocr && r.maHang).length
                          const pend = p.rows.filter(r => ocrRowNeedsCheck(r, results[p.kho] || [])).length
                          const text = p.kind === 'pdf' ? `PDF gốc · tự đọc ${n} dòng`
                            : `${p.kind === 'scan' || p.kind === 'ai' ? 'PDF scan · ' : p.files.length ? 'PDF · ' : ''}${p.images.length ? `${p.images.length} ảnh · ` : ''}${!n ? 'chưa nhập dòng nào' : ocrN ? `${p.rows.some(r => r.ai) ? 'AI đọc' : p.kind === 'scan' ? 'đọc' : 'đọc từ ảnh'} ${n} dòng${pend ? ` — ${pend} dòng cần soát` : (p.rows.some(r => r.ocr && r.checked) ? ' · đã soát' : ' · khớp thực nhận')}` : `đã nhập ${n} dòng`}`
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
                      {p.ocrNote && busy !== `ocr-${p.id}` && <div className={`text-[11px] ${p.rows.some(x => x.maHang) ? 'text-amber-700' : 'text-red-700'}`}>⚠ {p.ocrNote}</div>}
                    </div>
                  )
                })}
                <PickButtons kho={label} onFiles={fs => addPxkFiles(key, fs)} busy={false} />
                {zoneNote[key] && <div className="text-[11px] text-amber-800">{zoneNote[key]}</div>}
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
        {dupGroups.length > 0 && <div className="rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs px-3 py-2">⚠ Còn {dupGroups.length} số phiếu trùng chưa chọn bản giữ — các phiếu đó chưa tính vào bảng dưới. Chọn ở mục 1 phía trên.</div>}
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
