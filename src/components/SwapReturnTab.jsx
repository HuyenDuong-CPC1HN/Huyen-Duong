import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { Plus, Trash2, FileDown, Pencil } from 'lucide-react'
import SwapReturnRecordForm from './SwapReturnRecordForm'
import LotBadge from './SwapReturnLotBadge'
import {
  SWAP_RETURN_ACCOUNTANTS, batchItems, batchLabel, exportState, formatDmy, itemsSignature, lotStatus, nhapLaiItems,
  resolveBatches, toIsoDate,
} from '../utils/swapReturnBatch'
import { exportSwapBatchXuatKho, exportSwapBatchXuLy, exportSwapNhapLai } from '../utils/exportSwapReturn'

const RECORDS_KEY = 'swap_return_records'
const BATCHES_KEY = 'swap_return_batches'

function readArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

function formatStamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const formatDay = iso => formatStamp(iso).slice(0, 5)

function rangeOf(records) {
  if (!records.length) return ''
  const first = formatDmy(records[0].date).slice(0, 5)
  const last = formatDmy(records.at(-1).date).slice(0, 5)
  return first === last ? first : `${first} – ${last}`
}

const FILES = [
  { key: 'xuLy', ext: 'XLSX', title: 'BB Xử lý', cls: 'bg-green-50 text-green-700', run: exportSwapBatchXuLy },
  { key: 'xuatKho', ext: 'DOCX', title: 'BB xác minh xuất kho', cls: 'bg-blue-50 text-blue-700', run: exportSwapBatchXuatKho },
]

const thCls = 'px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap'
const checkCls = 'w-5 h-5 accent-green-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 shrink-0'
const smallBtnStyle = { minHeight: 28, padding: '0 10px', fontSize: 12 }

export default function SwapReturnTab({ type }) {
  const [allRecords, setAllRecords] = useState(() => readArray(RECORDS_KEY))
  const [allBatches, setAllBatches] = useState(() => readArray(BATCHES_KEY))
  const [formState, setFormState] = useState(null) // null | 'new' | record đang sửa
  const [busy, setBusy] = useState(null)

  const { openBatch, signedBatches, recordsOf } = useMemo(() => resolveBatches(type, allBatches, allRecords), [type, allBatches, allRecords])
  const openRecords = recordsOf(openBatch.no)
  const openItems = batchItems(openRecords)
  const kindLabel = type === 'donC' ? 'Đơn C' : 'Đơn DTP'
  const openName = batchLabel(openBatch.no)
  const states = Object.fromEntries(FILES.map(f => [f.key, exportState(openBatch, f.key, openItems)]))
  const canSign = openItems.length > 0 && FILES.every(f => states[f.key] === 'ok')
  const anyExported = FILES.some(f => states[f.key] !== 'none')

  const nhapLaiRecords = allRecords
    .filter(r => r.entity === type && nhapLaiItems(r).length > 0)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
  const nhapLaiPending = nhapLaiRecords.filter(r => !r.nhapLaiSignedAt)
  const nhapLaiDone = nhapLaiRecords.filter(r => r.nhapLaiSignedAt)

  const persistRecords = (records) => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
    setAllRecords(records)
  }
  const persistBatches = (batches) => {
    localStorage.setItem(BATCHES_KEY, JSON.stringify(batches))
    setAllBatches(batches)
  }
  const upsertBatch = (batch, batches = allBatches) => [...batches.filter(b => b.id !== batch.id), batch]

  const handleSave = (saved) => {
    const existing = allRecords.find(r => r.id === saved.id)
    const record = {
      ...saved,
      batchNo: existing ? existing.batchNo : openBatch.no,
      nhapLaiSignedAt: existing?.nhapLaiSignedAt || null,
    }
    persistRecords([...allRecords.filter(r => r.id !== record.id), record])
    setFormState(null)
  }
  const handleRemove = (record) => {
    if (!window.confirm(`Xoá đợt đổi trả của ${record.customerName}? Không thể hoàn tác.`)) return
    persistRecords(allRecords.filter(r => r.id !== record.id))
  }

  const run = async (key, task) => {
    setBusy(key)
    try {
      await task()
      return true
    } catch (error) {
      window.alert(error.message || 'Xuất file thất bại.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const exportOpenFile = async (file) => {
    const at = new Date()
    const ok = await run(`open_${file.key}`, () => file.run({ entity: type, batchNo: openBatch.no, items: openItems, accountant: openBatch.accountant, date: at }))
    if (!ok) return
    const exported = { ...openBatch.exported, [file.key]: { at: at.toISOString(), signature: itemsSignature(openItems) } }
    persistBatches(upsertBatch({ ...openBatch, exported }))
  }

  const exportSignedFile = (batch, file) => {
    const items = batchItems(recordsOf(batch.no))
    const at = batch.exported?.[file.key]?.at
    run(`signed_${batch.no}_${file.key}`, () => file.run({ entity: type, batchNo: batch.no, items, accountant: batch.accountant, date: at ? new Date(at) : new Date() }))
  }

  const setOpenAccountant = (accountant) => persistBatches(upsertBatch({ ...openBatch, accountant }))

  const signOpen = (e) => {
    e.target.checked = false
    if (!window.confirm(`Đánh dấu ${openName} đã trình ký?\n\n${openName} sẽ khoá lại, không thêm/sửa/xoá được. Đợt đổi trả mới sẽ vào ${batchLabel(openBatch.no + 1)}.`)) return
    // Đợt tạo trước khi có tính năng bộ chưa có batchNo — ghi rõ số bộ lúc khoá để không trôi sang bộ mới.
    const openIds = new Set(openRecords.map(r => r.id))
    persistRecords(allRecords.map(r => (openIds.has(r.id) ? { ...r, batchNo: openBatch.no } : r)))
    persistBatches(upsertBatch({ ...openBatch, signedAt: new Date().toISOString() }))
  }

  const unsign = (batch) => {
    if (!window.confirm(`Bỏ đánh dấu trình ký ${batchLabel(batch.no)}? Bộ sẽ mở lại để thêm/sửa, và đợt mới sẽ vào lại ${batchLabel(batch.no)}.`)) return
    const rest = allBatches.filter(b => !(b.entity === type && b.no === batch.no + 1))
    persistBatches(upsertBatch({ ...batch, signedAt: null }, rest))
  }

  const exportNhapLai = async (record) => {
    const ok = await run(`nhapLai_${record.id}`, () => exportSwapNhapLai(record))
    if (ok) persistRecords(allRecords.map(r => (r.id === record.id ? { ...r, nhapLaiExportedAt: new Date().toISOString() } : r)))
  }
  const toggleNhapLaiSigned = (record, checked) => {
    persistRecords(allRecords.map(r => (r.id === record.id ? { ...r, nhapLaiSignedAt: checked ? new Date().toISOString() : null } : r)))
  }

  const latestSigned = signedBatches[0]
  const canUnsign = openRecords.length === 0

  const nhapLaiTable = (records) => (
    <div style={{ overflowX: 'auto' }}>
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            <th className={thCls}>Ngày</th><th className={thCls}>Khách hàng / hàng khác lô</th><th className={thCls}>Kế toán</th>
            <th className={thCls}>File</th><th className={thCls}>Trình ký</th>
          </tr>
        </thead>
        <tbody>
          {records.map(r => (
            <tr key={r.id} className="border-b border-gray-50">
              <td className="px-2 py-2 whitespace-nowrap">{formatDmy(r.date).slice(0, 5)}</td>
              <td className="px-2 py-2" style={{ minWidth: 200 }}>
                <div className="font-semibold text-gray-800">{r.customerName}</div>
                <div className="text-gray-400">{nhapLaiItems(r).map(it => it.tenHang || it.maHang).join(', ')}</div>
              </td>
              <td className="px-2 py-2 whitespace-nowrap text-gray-500">{r.accountantNhapLai}</td>
              <td className="px-2 py-2 whitespace-nowrap">
                <div className="flex items-center gap-2">
                  {r.nhapLaiExportedAt && <span className="text-gray-400">Đã xuất {formatDay(r.nhapLaiExportedAt)}</span>}
                  <button type="button" onClick={() => exportNhapLai(r)} disabled={busy === `nhapLai_${r.id}`}
                    className={`sheet-tab-action ${r.nhapLaiExportedAt ? '' : 'is-primary'}`} style={smallBtnStyle}>
                    <FileDown size={12} /> {r.nhapLaiExportedAt ? 'Xuất lại' : 'Xuất'}
                  </button>
                </div>
              </td>
              <td className="px-2 py-2 whitespace-nowrap">
                <label className="flex items-center gap-2 font-medium text-gray-700" title={r.nhapLaiExportedAt ? undefined : 'Xuất file trước rồi mới tick'}>
                  <input type="checkbox" className={checkCls} checked={Boolean(r.nhapLaiSignedAt)} disabled={!r.nhapLaiExportedAt}
                    onChange={e => toggleNhapLaiSigned(r, e.target.checked)} aria-label={`Đã trình ký BB nhập lại kho ${r.customerName}`} />
                  {r.nhapLaiSignedAt ? `Đã trình ký ${formatDay(r.nhapLaiSignedAt)}` : 'Đã trình ký'}
                </label>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Đổi trả hàng — {kindLabel}</span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={() => setFormState('new')} className="sheet-tab-action is-primary">
              <Plus size={13} /> Thêm đợt đổi trả
            </button>
          </div>
        </header>

        <div className="flex flex-col gap-3" style={{ paddingTop: 12 }}>
          {/* 1. Bộ xuất huỷ đang gom */}
          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
              <span className="report-section-title">{openName} — bộ xuất huỷ đang gom</span>
              <span className="report-section-count">{openItems.length} mặt hàng{openRecords.length ? ` · ${rangeOf(openRecords)}` : ''}</span>
            </div>
            <div className="report-section-content flex flex-col gap-3">
              <div className="flex items-end justify-between gap-4 flex-wrap">
                <p className="text-xs text-gray-500">Đợt đổi trả mới nào cũng tự vào bộ này, cho tới khi tick "Đã trình ký".</p>
                <label className="flex flex-col gap-1 text-sm" style={{ minWidth: 240 }}>
                  <span className="text-xs font-medium text-gray-500">Kế toán ký bộ này</span>
                  <select value={openBatch.accountant} onChange={e => setOpenAccountant(e.target.value)}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
                    {SWAP_RETURN_ACCOUNTANTS.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>

              <div style={{ overflowX: 'auto' }}>
                {openRecords.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">{openName} chưa có mặt hàng nào — bấm "Thêm đợt đổi trả".</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className={thCls}>Ngày</th><th className={thCls}>Khách hàng</th><th className={thCls}>Mặt hàng</th>
                        <th className={thCls}>Lô</th><th className={thCls} />
                      </tr>
                    </thead>
                    <tbody>
                      {openRecords.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                          <td className="px-2 py-2 whitespace-nowrap">{formatDmy(r.date).slice(0, 5)}</td>
                          <td className="px-2 py-2 font-semibold text-gray-800" style={{ minWidth: 160 }}>{r.customerName}</td>
                          <td className="px-2 py-2" style={{ minWidth: 220 }}>
                            {(r.items || []).map((it, i) => (
                              <div key={i}>{it.tenHang || it.maHang} <span className="text-gray-400">× {it.soLuong} {it.dvt}</span></div>
                            ))}
                          </td>
                          <td className="px-2 py-2"><div className="flex gap-1 flex-wrap">{[...new Set((r.items || []).map(lotStatus))].map(s => <LotBadge key={s} status={s} />)}</div></td>
                          <td className="px-2 py-2 whitespace-nowrap text-right">
                            <button type="button" onClick={() => setFormState(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Sửa" aria-label={`Sửa đợt ${r.customerName}`}>
                              <Pencil size={13} />
                            </button>
                            <button type="button" onClick={() => handleRemove(r)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá" aria-label={`Xoá đợt ${r.customerName}`}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                {FILES.map(f => {
                  const st = states[f.key]
                  const at = openBatch.exported?.[f.key]?.at
                  return (
                    <div key={f.key} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5">
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${f.cls}`}>{f.ext}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-gray-800">{f.title}</div>
                        {st === 'ok' && <div className="text-xs font-medium text-green-700">✓ Đã xuất {formatStamp(at)}</div>}
                        {st === 'stale' && <div className="text-xs font-medium text-amber-700">Bộ đã thay đổi sau lần xuất {formatStamp(at)} — cần xuất lại</div>}
                        {st === 'none' && <div className="text-xs text-gray-500">Chưa xuất</div>}
                      </div>
                      <button type="button" onClick={() => exportOpenFile(f)} disabled={!openItems.length || busy === `open_${f.key}`}
                        className={`sheet-tab-action ml-auto ${st === 'ok' ? '' : 'is-primary'}`} style={smallBtnStyle}>
                        <FileDown size={12} /> {busy === `open_${f.key}` ? 'Đang xuất…' : st === 'none' ? 'Xuất' : 'Xuất lại'}
                      </button>
                    </div>
                  )
                })}
              </div>

              <label className={`flex items-center gap-3 rounded-lg px-4 py-3 border-2 ${canSign ? 'border-green-500 bg-green-50 cursor-pointer' : 'border-dashed border-gray-200 bg-gray-50'}`}>
                <input type="checkbox" className={checkCls} checked={false} disabled={!canSign} onChange={signOpen} aria-label={`Đã trình ký ${openName}`} />
                <span>
                  <span className="block text-sm font-bold text-gray-900">Đã trình ký {openName}</span>
                  <span className="block text-xs text-gray-500">
                    {!openItems.length ? 'Chưa có mặt hàng nào.'
                      : !canSign ? 'Xuất đủ 2 file ở trên (bản mới nhất) thì mới tick được.'
                        : `Tick khi đã ký xong. ${openName} sẽ khoá lại, đợt đổi trả mới vào ${batchLabel(openBatch.no + 1)}.`}
                  </span>
                </span>
              </label>
            </div>
          </div>

          {/* 2. BB xác minh nhập lại kho */}
          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
              <span className="report-section-title">BB xác minh nhập lại kho</span>
              {nhapLaiPending.length > 0
                ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">{nhapLaiPending.length} chưa ký</span>
                : <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Đã ký hết</span>}
            </div>
            <div className="report-section-content flex flex-col gap-3">
              <p className="text-xs text-gray-500">Mỗi khách có hàng khác lô 1 biên bản. Xuất file, ký xong thì tick.</p>
              {nhapLaiPending.length > 0
                ? nhapLaiTable(nhapLaiPending)
                : <div className="text-center py-6 text-gray-400 text-sm">Không còn biên bản nào chờ ký.</div>}
              {nhapLaiDone.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-gray-700 py-1">Đã trình ký ({nhapLaiDone.length})</summary>
                  <div className="pt-2">{nhapLaiTable(nhapLaiDone)}</div>
                </details>
              )}
            </div>
          </div>

          {/* 3. Bộ đã trình ký */}
          <details className="report-section">
            <summary className="report-section-trigger" style={{ cursor: 'pointer' }}>
              <span className="report-section-title">Bộ đã trình ký</span>
              <span className="report-section-count">{signedBatches.length} bộ</span>
            </summary>
            <div className="report-section-content flex flex-col gap-2">
              {signedBatches.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">Chưa có bộ nào trình ký.</div>
              ) : (
                <>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-100">
                          <th className={thCls}>Bộ</th><th className={thCls}>Mặt hàng</th><th className={thCls}>Kế toán</th>
                          <th className={thCls}>Tải lại file</th><th className={thCls}>Trình ký</th>
                        </tr>
                      </thead>
                      <tbody>
                        {signedBatches.map(b => {
                          const records = recordsOf(b.no)
                          const undoable = b === latestSigned && canUnsign
                          const title = b !== latestSigned ? 'Chỉ bỏ tick được bộ ký gần nhất'
                            : !canUnsign ? `${openName} đã có hàng nên không bỏ tick được` : 'Bỏ tick để mở lại bộ này'
                          return (
                            <tr key={b.id} className="border-b border-gray-50">
                              <td className="px-2 py-2 whitespace-nowrap font-semibold text-gray-800">{batchLabel(b.no)}</td>
                              <td className="px-2 py-2 whitespace-nowrap">{batchItems(records).length} mặt hàng <span className="text-gray-400">· {rangeOf(records)}</span></td>
                              <td className="px-2 py-2 whitespace-nowrap text-gray-500">{b.accountant}</td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                <div className="flex gap-1">
                                  {FILES.map(f => (
                                    <button key={f.key} type="button" onClick={() => exportSignedFile(b, f)} disabled={busy === `signed_${b.no}_${f.key}`}
                                      className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}>
                                      <FileDown size={12} /> {f.title}
                                    </button>
                                  ))}
                                </div>
                              </td>
                              <td className="px-2 py-2 whitespace-nowrap">
                                <label className="flex items-center gap-2 font-medium text-gray-700" title={title}>
                                  <input type="checkbox" className={checkCls} checked disabled={!undoable} onChange={() => unsign(b)}
                                    aria-label={`Bỏ đánh dấu trình ký ${batchLabel(b.no)}`} />
                                  Đã ký {formatDay(b.signedAt)}
                                </label>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-gray-500">Bộ đã ký bị khoá: không thêm, sửa, xoá đợt được. Chỉ bỏ tick được bộ ký gần nhất, khi bộ đang gom chưa có hàng.</p>
                </>
              )}
            </div>
          </details>
        </div>
      </div>

      {formState && (
        <SwapReturnRecordForm
          key={formState === 'new' ? 'new' : formState.id}
          entity={type}
          defaultDate={toIsoDate(new Date())}
          record={formState === 'new' ? null : formState}
          batchName={openName}
          batchExported={anyExported}
          onSave={handleSave}
          onCancel={() => setFormState(null)}
        />
      )}
    </div>
  )
}
