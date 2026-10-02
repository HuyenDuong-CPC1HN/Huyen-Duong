import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { Plus, Trash2, FileDown, Pencil, Eye, X } from 'lucide-react'
import SwapReturnRecordForm from './SwapReturnRecordForm'
import SwapReturnTab from './SwapReturnTab'
import { SwapRecordWorkspace, SwapBatchWorkspace } from './SwapWorkspaces'
import { newBatchForm } from '../utils/swapPaperData'
import { LoaiTag } from './ReturnSlipBadges'
import {
  SWAP_RETURN_ACCOUNTANTS, batchItems, batchLabel, formatDmy, isV2, itemsSignature, newHuyBatch,
  nhapLaiItems, pendingHuyRecords, toIsoDate,
} from '../utils/swapReturnBatch'
import { exportSwapBatchXuatKho, exportSwapBatchXuLy, exportSwapNhapLai } from '../utils/exportSwapReturn'

// Đổi trả hàng (gộp Đơn C và Đơn DTP) theo quy trình: hàng lỗi khách trả về → BB xác minh nhập lại kho → trình ký →
// kế toán nhập hàng lỗi + xuất hàng mới (tick hoàn thành) → gom các đợt đã hoàn thành thành bộ huỷ (BB xác minh huỷ
// + BB xử lý huỷ) → trình ký → hoàn thành. Dữ liệu theo quy trình cũ (cùng lô / khác lô) ở mục riêng cuối trang.
const RECORDS_KEY = 'swap_return_records'
const BATCHES_KEY = 'swap_huy_batches'
const FILTER_KEY = 'swapReturn.kindFilter'

const readArray = (key) => {
  try { const v = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const readPref = () => { try { return window.localStorage.getItem(FILTER_KEY) || 'all' } catch { return 'all' } }
const writePref = (v) => { try { window.localStorage.setItem(FILTER_KEY, v) } catch { /* bỏ qua */ } }

const stamp = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
const loai = (entity) => (entity === 'donC' ? 'C' : 'DTP')
const KIND_LABEL = { donC: 'Đơn C', donDTP: 'Đơn DTP' }

const HUY_FILES = [
  { key: 'xuatKho', ext: 'DOCX', title: 'BB xác minh huỷ', cls: 'bg-blue-50 text-blue-700', run: exportSwapBatchXuatKho },
  { key: 'xuLy', ext: 'XLSX', title: 'BB xử lý huỷ', cls: 'bg-green-50 text-green-700', run: exportSwapBatchXuLy },
]

const thCls = 'px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap'
const checkCls = 'w-5 h-5 accent-green-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 shrink-0'
const smallBtn = { minHeight: 26, padding: '0 8px', fontSize: 11 }

export default function SwapReturnHub() {
  const [allRecords, setAllRecords] = useState(() => readArray(RECORDS_KEY))
  const [batches, setBatches] = useState(() => readArray(BATCHES_KEY))
  const [kind, setKind] = useState(() => readPref())
  const [formState, setFormState] = useState(null) // { entity, record }
  const [picked, setPicked] = useState([])
  const [accountant, setAccountant] = useState(SWAP_RETURN_ACCOUNTANTS[2])
  const [busy, setBusy] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [legacy, setLegacy] = useState(false)
  const [open, setOpen] = useState(null) // { kind: 'record' | 'batch', id } — màn xem trước / in

  const records = useMemo(() => allRecords.filter(isV2), [allRecords])
  const inKind = (x) => kind === 'all' || x.entity === kind
  const visible = records.filter(inKind).sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const pending = pendingHuyRecords(records).filter(inKind)
  const visibleBatches = batches.filter(inKind).sort((a, b) => b.no - a.no)
  const recordsOfBatch = (b) => records.filter(r => r.huyBatchId === b.id)
  const pickedEntity = picked.length ? records.find(r => r.id === picked[0])?.entity : null

  const persistRecords = (next) => {
    const merged = [...allRecords.filter(r => !isV2(r)), ...next]
    localStorage.setItem(RECORDS_KEY, JSON.stringify(merged))
    setAllRecords(merged)
  }
  const persistBatches = (next) => { localStorage.setItem(BATCHES_KEY, JSON.stringify(next)); setBatches(next) }
  const patchRecord = (id, patch) => persistRecords(records.map(r => (r.id === id ? { ...r, ...patch } : r)))
  const patchBatch = (id, patch) => persistBatches(batches.map(b => (b.id === id ? { ...b, ...patch } : b)))
  const now = () => new Date().toISOString()

  const selectKind = (k) => { setKind(k); writePref(k); setPicked([]) }

  const run = async (key, task) => {
    setBusy(key)
    try { await task(); return true } catch (error) { window.alert(error.message || 'Xuất file thất bại.'); return false } finally { setBusy(null) }
  }

  // ----- đợt đổi trả -----
  const handleSave = (saved) => {
    persistRecords([...records.filter(r => r.id !== saved.id), saved])
    setFormState(null)
  }
  const removeRecord = (r) => {
    if (!window.confirm(`Xoá đợt đổi trả của ${r.customerName}? Không thể hoàn tác.`)) return
    persistRecords(records.filter(x => x.id !== r.id))
  }
  const exportNhapLai = async (r) => {
    if (await run(`nl_${r.id}`, () => exportSwapNhapLai(r))) patchRecord(r.id, { nhapLaiExportedAt: now() })
  }
  const toggleSigned = (r, on) => patchRecord(r.id, { nhapLaiSignedAt: on ? now() : null, ...(on ? {} : { nhapLaiDoneAt: null }) })
  const toggleDone = (r, on) => patchRecord(r.id, { nhapLaiDoneAt: on ? now() : null })

  // ----- bộ huỷ -----
  const togglePick = (r) => setPicked(p => (p.includes(r.id) ? p.filter(id => id !== r.id) : [...p, r.id]))
  const createBatch = () => {
    if (!picked.length) return
    const batch = newHuyBatch(batches, pickedEntity, picked, accountant)
    persistBatches([...batches, batch])
    persistRecords(records.map(r => (picked.includes(r.id) ? { ...r, huyBatchId: batch.id } : r)))
    setPicked([])
  }
  const removeBatch = (b) => {
    if (!window.confirm(`Xoá ${batchLabel(b.no)} (${KIND_LABEL[b.entity]})? Các đợt trong bộ quay về danh sách chờ gom huỷ.`)) return
    persistRecords(records.map(r => (r.huyBatchId === b.id ? { ...r, huyBatchId: null } : r)))
    persistBatches(batches.filter(x => x.id !== b.id))
  }
  const exportHuy = async (b, file) => {
    const items = batchItems(recordsOfBatch(b))
    const at = new Date()
    const form = { ...newBatchForm(), ...(b.form || {}) }
    const day = (iso) => (iso ? new Date(`${iso}T08:00:00`) : at)
    const ok = await run(`huy_${b.id}_${file.key}`, () => file.run({
      entity: b.entity, batchNo: b.no, items, accountant: b.accountant, soBB: form.soBB,
      date: file.key === 'xuLy' ? day(form.ngayLap) : day(form.xmNgay),
    }))
    if (ok) patchBatch(b.id, { exported: { ...b.exported, [file.key]: { at: at.toISOString(), signature: itemsSignature(items) } } })
  }

  const doneCount = visible.filter(r => r.nhapLaiDoneAt).length

  const openRecord = open?.kind === 'record' ? records.find(r => r.id === open.id) : null
  const openBatch = open?.kind === 'batch' ? batches.find(b => b.id === open.id) : null
  if (openRecord && !formState) {
    return (
      <SwapRecordWorkspace record={openRecord} busy={busy === `nl_${openRecord.id}`} onBack={() => setOpen(null)}
        onChange={patch => patchRecord(openRecord.id, patch)} onEdit={() => setFormState({ entity: openRecord.entity, record: openRecord })} onExport={() => exportNhapLai(openRecord)} />
    )
  }
  if (openBatch) {
    const file = key => HUY_FILES.find(f => f.key === key)
    return (
      <SwapBatchWorkspace batch={openBatch} records={recordsOfBatch(openBatch)} busy={String(busy).startsWith(`huy_${openBatch.id}`)} onBack={() => setOpen(null)}
        onChange={patch => patchBatch(openBatch.id, patch)} onExport={key => exportHuy(openBatch, file(key))} />
    )
  }

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-4">
        <header className="sheet-tab-context flex-wrap gap-2">
          <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label="Loại đơn">
            {[['all', 'Tất cả'], ['donC', 'Đơn C'], ['donDTP', 'Đơn DTP']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => selectKind(k)} aria-pressed={kind === k}
                className={`px-2.5 py-1 rounded text-xs font-medium ${kind === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={() => setFormState({ entity: 'donC', record: null })} className="sheet-tab-action is-primary"><Plus size={13} /> Thêm đợt · Đơn C</button>
            <button type="button" onClick={() => setFormState({ entity: 'donDTP', record: null })} className="sheet-tab-action is-primary"><Plus size={13} /> Thêm đợt · Đơn DTP</button>
          </div>
        </header>

        {/* 1. Đợt hàng lỗi khách trả về */}
        <div className="report-section">
          <div className="report-section-trigger" style={{ cursor: 'default' }}>
            <span className="report-section-title">Hàng lỗi khách trả về — nhập lại kho</span>
            <span className="report-section-count">{visible.length} đợt · {doneCount} hoàn thành</span>
          </div>
          <div className="report-section-content flex flex-col gap-2">
            <p className="text-xs text-gray-500">Xuất BB xác minh nhập lại kho → trình ký → kế toán nhập hàng lỗi và xuất hàng mới → tick hoàn thành.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b border-gray-100">
                  <th className={thCls}>Ngày</th><th className={thCls}>Loại</th><th className={thCls}>Khách hàng / hàng</th><th className={thCls}>Kế toán</th>
                  <th className={thCls}>BB xác minh nhập lại kho</th><th className={thCls}>Trình ký</th><th className={thCls}>Kế toán nhập lỗi + xuất hàng mới</th><th className={thCls} />
                </tr></thead>
                <tbody>
                  {visible.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">Chưa có đợt đổi trả nào — bấm "Thêm đợt".</td></tr> : visible.map(r => {
                    const locked = Boolean(r.huyBatchId)
                    return (
                      <tr key={r.id} className="border-b border-gray-50 align-top">
                        <td className="px-2 py-2 whitespace-nowrap">{formatDmy(r.date).slice(0, 5)}</td>
                        <td className="px-2 py-2"><LoaiTag loai={loai(r.entity)} /></td>
                        <td className="px-2 py-2" style={{ minWidth: 220 }}>
                          <div className="font-semibold text-gray-800">{r.customerName}</div>
                          <div className="text-gray-400">{nhapLaiItems(r).map(it => `${it.tenHang || it.maHang} × ${it.soLuong}`).join(', ')}</div>
                          {locked && <div className="text-purple-700">Đã gom vào {batchLabel(batches.find(b => b.id === r.huyBatchId)?.no || 0)} huỷ</div>}
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-500">{r.accountantNhapLai}</td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setOpen({ kind: 'record', id: r.id })} className="sheet-tab-action is-primary" style={smallBtn} aria-label={`Xem và in ${r.customerName}`}>
                              <Eye size={12} /> Xem / in
                            </button>
                            <button type="button" onClick={() => exportNhapLai(r)} disabled={busy === `nl_${r.id}`} className="sheet-tab-action" style={smallBtn} title="Chỉ khi cần lấy file Word">
                              <FileDown size={12} /> Word
                            </button>
                            {r.nhapLaiExportedAt && <span className="text-gray-400">Đã xuất {stamp(r.nhapLaiExportedAt)}</span>}
                          </div>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <label className="flex items-center gap-2 font-medium text-gray-700">
                            <input type="checkbox" className={checkCls} checked={Boolean(r.nhapLaiSignedAt)} disabled={locked}
                              onChange={e => toggleSigned(r, e.target.checked)} aria-label={`Đã trình ký ${r.customerName}`} />
                            {r.nhapLaiSignedAt ? `Đã ký ${stamp(r.nhapLaiSignedAt)}` : 'Đã trình ký'}
                          </label>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap">
                          <label className="flex items-center gap-2 font-medium text-gray-700" title={r.nhapLaiSignedAt ? undefined : 'Trình ký xong rồi mới tick'}>
                            <input type="checkbox" className={checkCls} checked={Boolean(r.nhapLaiDoneAt)} disabled={!r.nhapLaiSignedAt || locked}
                              onChange={e => toggleDone(r, e.target.checked)} aria-label={`Hoàn thành ${r.customerName}`} />
                            {r.nhapLaiDoneAt ? `Hoàn thành ${stamp(r.nhapLaiDoneAt)}` : 'Chờ kế toán'}
                          </label>
                        </td>
                        <td className="px-2 py-2 whitespace-nowrap text-right">
                          <button type="button" onClick={() => setFormState({ entity: r.entity, record: r })} disabled={locked} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700 disabled:opacity-30" title="Sửa" aria-label={`Sửa đợt ${r.customerName}`}><Pencil size={13} /></button>
                          <button type="button" onClick={() => removeRecord(r)} disabled={locked} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30" title="Xoá" aria-label={`Xoá đợt ${r.customerName}`}><Trash2 size={13} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* 2. Chờ gom huỷ */}
        <div className="report-section">
          <div className="report-section-trigger" style={{ cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
            <span className="report-section-title">Chờ gom huỷ</span>
            <span className="report-section-count">{pending.length} đợt</span>
          </div>
          <div className="report-section-content flex flex-col gap-2">
            <p className="text-xs text-gray-500">Các đợt đã hoàn thành nhập lại kho. Tick chọn các đợt cùng loại đơn để gom thành 1 bộ huỷ (BB xác minh huỷ + BB xử lý huỷ).</p>
            {pending.length === 0 ? <div className="text-center py-5 text-gray-400 text-sm">Chưa có đợt nào chờ gom huỷ.</div> : (
              <>
                <div className="flex flex-col gap-1">
                  {pending.map(r => {
                    const disabled = Boolean(pickedEntity) && pickedEntity !== r.entity
                    return (
                      <label key={r.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${picked.includes(r.id) ? 'border-green-500 bg-green-50' : 'border-gray-100'} ${disabled ? 'opacity-40' : 'cursor-pointer'}`}>
                        <input type="checkbox" className={checkCls} checked={picked.includes(r.id)} disabled={disabled} onChange={() => togglePick(r)} aria-label={`Chọn gom huỷ ${r.customerName}`} />
                        <LoaiTag loai={loai(r.entity)} />
                        <span className="font-semibold text-gray-800">{r.customerName}</span>
                        <span className="text-xs text-gray-400">{formatDmy(r.date).slice(0, 5)} · {(r.items || []).map(it => `${it.tenHang || it.maHang} × ${it.soLuong}`).join(', ')}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1 text-sm" style={{ minWidth: 240 }}>
                    <span className="text-xs font-medium text-gray-500">Kế toán ký bộ huỷ</span>
                    <select value={accountant} onChange={e => setAccountant(e.target.value)} className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm">
                      {SWAP_RETURN_ACCOUNTANTS.map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={createBatch} disabled={!picked.length} className="sheet-tab-action is-primary">Tạo bộ huỷ ({picked.length} đợt)</button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 3. Bộ huỷ */}
        <div className="report-section">
          <div className="report-section-trigger" style={{ cursor: 'default' }}>
            <span className="report-section-title">Bộ huỷ</span>
            <span className="report-section-count">{visibleBatches.length} bộ · {visibleBatches.filter(b => b.accountedAt).length} hoàn thành</span>
          </div>
          <div className="report-section-content" style={{ overflowX: 'auto' }}>
            <table className="w-full text-xs">
              <thead><tr className="bg-gray-50 border-b border-gray-100">
                <th className={thCls}>Bộ</th><th className={thCls}>Loại</th><th className={thCls}>Mặt hàng</th><th className={thCls}>Kế toán</th>
                <th className={thCls}>File</th><th className={thCls}>Trình ký</th><th className={thCls}>Hoàn thành</th><th className={thCls} />
              </tr></thead>
              <tbody>
                {visibleBatches.length === 0 ? <tr><td colSpan={8} className="text-center py-8 text-gray-400 text-sm">Chưa có bộ huỷ nào.</td></tr> : visibleBatches.map(b => {
                  const items = batchItems(recordsOfBatch(b))
                  return (
                    <tr key={b.id} className="border-b border-gray-50 align-top">
                      <td className="px-2 py-2 whitespace-nowrap font-semibold text-gray-800">{batchLabel(b.no)}</td>
                      <td className="px-2 py-2"><LoaiTag loai={loai(b.entity)} /></td>
                      <td className="px-2 py-2 whitespace-nowrap">{items.length} mặt hàng · {recordsOfBatch(b).length} đợt</td>
                      <td className="px-2 py-2 whitespace-nowrap text-gray-500">{b.accountant}</td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <button type="button" onClick={() => setOpen({ kind: 'batch', id: b.id })} className="sheet-tab-action is-primary" style={smallBtn} aria-label={`Xem và in ${batchLabel(b.no)} ${KIND_LABEL[b.entity]}`}>
                            <Eye size={12} /> Xem / in
                          </button>
                          {HUY_FILES.map(f => (
                            <button key={f.key} type="button" onClick={() => exportHuy(b, f)} disabled={busy === `huy_${b.id}_${f.key}`} className="sheet-tab-action" style={smallBtn} title="Chỉ khi cần lấy file">
                              <FileDown size={12} /> {f.ext === 'DOCX' ? 'Word' : 'Excel'}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <label className="flex items-center gap-2 font-medium text-gray-700">
                          <input type="checkbox" className={checkCls} checked={Boolean(b.signedAt)} disabled={Boolean(b.accountedAt)}
                            onChange={e => patchBatch(b.id, { signedAt: e.target.checked ? now() : null })} aria-label={`Đã trình ký ${batchLabel(b.no)} ${KIND_LABEL[b.entity]}`} />
                          {b.signedAt ? `Đã ký ${stamp(b.signedAt)}` : 'Đã trình ký'}
                        </label>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        <label className="flex items-center gap-2 font-medium text-gray-700">
                          <input type="checkbox" className={checkCls} checked={Boolean(b.accountedAt)} disabled={!b.signedAt}
                            onChange={e => patchBatch(b.id, { accountedAt: e.target.checked ? now() : null })} aria-label={`Hoàn thành ${batchLabel(b.no)} ${KIND_LABEL[b.entity]}`} />
                          {b.accountedAt ? `Hoàn thành ${stamp(b.accountedAt)}` : 'Chờ hoàn thành'}
                        </label>
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap text-right">
                        <button type="button" onClick={() => setViewing(b)} className="sheet-tab-action" style={smallBtn} aria-label={`Xem ${batchLabel(b.no)} ${KIND_LABEL[b.entity]}`}><Eye size={12} /> Xem</button>
                        <button type="button" onClick={() => removeBatch(b)} disabled={Boolean(b.signedAt)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-30" title="Xoá bộ (chỉ khi chưa trình ký)" aria-label={`Xoá ${batchLabel(b.no)} ${KIND_LABEL[b.entity]}`}><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Dữ liệu theo quy trình cũ */}
        <div className="report-section">
          <button type="button" onClick={() => setLegacy(o => !o)} className="report-section-trigger w-full text-left" aria-expanded={legacy}>
            <span className="report-section-title">Đổi trả theo quy trình cũ (cùng lô / khác lô)</span>
          </button>
          {legacy && (
            <div className="report-section-content flex flex-col gap-3">
              {['donC', 'donDTP'].filter(k => kind === 'all' || kind === k).map(k => (
                <div key={k}><div className="text-sm font-semibold text-gray-700 mb-1">{KIND_LABEL[k]}</div><SwapReturnTab type={k} legacy /></div>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewing && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center overflow-y-auto p-4 sm:p-10" onMouseDown={e => { if (e.target === e.currentTarget) setViewing(null) }}>
          <div role="dialog" aria-modal="true" aria-label={`Xem ${batchLabel(viewing.no)} ${KIND_LABEL[viewing.entity]}`} className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl flex flex-col">
            <div className="px-5 pt-5 flex items-start gap-3">
              <h2 className="text-base font-bold text-gray-900">{batchLabel(viewing.no)} huỷ — {KIND_LABEL[viewing.entity]} · chỉ xem</h2>
              <button type="button" onClick={() => setViewing(null)} className="ml-auto p-1.5 rounded hover:bg-gray-100" aria-label="Đóng"><X size={16} /></button>
            </div>
            <div className="p-5" style={{ overflowX: 'auto' }}>
              <table className="w-full text-xs">
                <thead><tr className="bg-gray-50 border-b border-gray-100">{['STT', 'Khách hàng', 'Mã hàng', 'Tên hàng', 'Lô lỗi', 'HD lô lỗi', 'ĐVT', 'SL', 'Quy cách', 'Lý do'].map(h => <th key={h} className={thCls}>{h}</th>)}</tr></thead>
                <tbody>
                  {batchItems(recordsOfBatch(viewing)).map((it, i) => (
                    <tr key={i} className="border-b border-gray-50 align-top">
                      <td className="px-2 py-2">{i + 1}</td><td className="px-2 py-2">{it.customerName}</td><td className="px-2 py-2 font-mono">{it.maHang}</td>
                      <td className="px-2 py-2" style={{ minWidth: 180 }}>{it.tenHang}</td><td className="px-2 py-2 font-mono">{it.loLoi}</td><td className="px-2 py-2 whitespace-nowrap">{it.hanDungLoi}</td>
                      <td className="px-2 py-2">{it.dvt}</td><td className="px-2 py-2">{it.soLuong}</td><td className="px-2 py-2">{it.quyCach}</td><td className="px-2 py-2" style={{ minWidth: 160 }}>{it.lyDo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {formState && (
        <SwapReturnRecordForm
          key={formState.record?.id || `new-${formState.entity}`}
          entity={formState.entity}
          defaultDate={toIsoDate(new Date())}
          record={formState.record}
          v2
          onSave={handleSave}
          onCancel={() => setFormState(null)}
        />
      )}
    </div>
  )
}
