import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { ChevronLeft, ChevronRight, Plus, Trash2, FileDown, Pencil, AlertTriangle } from 'lucide-react'
import SwapReturnRecordForm from './SwapReturnRecordForm'
import LotBadge from './SwapReturnLotBadge'
import {
  SWAP_RETURN_ACCOUNTANTS, DEFAULT_WEEKLY_ACCOUNTANT,
  addDays, formatDmy, isoWeekNumber, lotStatus, mondayOf, nhapLaiItems, recordsOfWeek, toIsoDate, weeklyItems,
} from '../utils/swapReturnWeek'
import { exportSwapNhapLai, exportSwapWeeklyXuLy, exportSwapWeeklyXuatKho } from '../utils/exportSwapReturn'

const RECORDS_KEY = 'swap_return_records'
const WEEKLY_KEY = 'swap_return_weekly' // { "donC|2026-09-21": { accountant, exportedAt } }

function readJson(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null')
    return value ?? fallback
  } catch {
    return fallback
  }
}

function formatStamp(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const thCls = 'px-2 py-2 text-left text-gray-500 font-semibold whitespace-nowrap'
const tdCls = 'px-2 py-2 whitespace-nowrap'

export default function SwapReturnTab({ type }) {
  const [allRecords, setAllRecords] = useState(() => {
    const records = readJson(RECORDS_KEY, [])
    return Array.isArray(records) ? records : []
  })
  const [weeklyMeta, setWeeklyMeta] = useState(() => readJson(WEEKLY_KEY, {}))
  const [today] = useState(() => toIsoDate(new Date()))
  const [weekStart, setWeekStart] = useState(() => mondayOf(toIsoDate(new Date())))
  const [formState, setFormState] = useState(null) // null | 'new' | record đang sửa
  const [busy, setBusy] = useState(null)

  const entityRecords = useMemo(() => allRecords.filter(r => r.entity === type), [allRecords, type])
  const weekRecords = useMemo(() => recordsOfWeek(entityRecords, weekStart), [entityRecords, weekStart])
  const items = useMemo(() => weeklyItems(entityRecords, weekStart), [entityRecords, weekStart])
  const counts = useMemo(() => {
    const c = { same: 0, diff: 0, empty: 0 }
    for (const it of items) c[lotStatus(it)] += 1
    return c
  }, [items])

  const metaKey = `${type}|${weekStart}`
  const meta = weeklyMeta[metaKey] || {}
  const weeklyAccountant = meta.accountant || DEFAULT_WEEKLY_ACCOUNTANT
  const isCurrentWeek = weekStart === mondayOf(today)
  const kindLabel = type === 'donC' ? 'Đơn C' : 'Đơn DTP'

  const persistRecords = (records) => {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records))
    setAllRecords(records)
  }
  const persistMeta = (patch) => {
    const next = { ...weeklyMeta, [metaKey]: { ...meta, accountant: weeklyAccountant, ...patch } }
    localStorage.setItem(WEEKLY_KEY, JSON.stringify(next))
    setWeeklyMeta(next)
  }

  const handleSave = (record) => {
    persistRecords([...allRecords.filter(r => r.id !== record.id), record])
    setWeekStart(mondayOf(record.date))
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

  const exportWeekly = async (which) => {
    const args = { entity: type, weekStart, items, accountant: weeklyAccountant }
    const ok = await run(`weekly_${which}`, async () => {
      if (which !== 'xuatKho') await exportSwapWeeklyXuLy(args)
      if (which !== 'xuLy') await exportSwapWeeklyXuatKho(args)
    })
    if (ok && which === 'all') persistMeta({ exportedAt: new Date().toISOString() })
  }

  const exportNhapLai = async (record) => {
    const ok = await run(`nhapLai_${record.id}`, () => exportSwapNhapLai(record))
    if (ok) persistRecords(allRecords.map(r => (r.id === record.id ? { ...r, nhapLaiExportedAt: new Date().toISOString() } : r)))
  }

  const weekEnd = addDays(weekStart, 6)
  const hasItems = items.length > 0

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

        <div className="flex items-center gap-2 flex-wrap" style={{ padding: '12px 0' }}>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="sheet-tab-action" style={{ padding: '0 8px' }} aria-label="Tuần trước">
            <ChevronLeft size={14} />
          </button>
          <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} disabled={isCurrentWeek} className="sheet-tab-action" style={{ padding: '0 8px' }} aria-label="Tuần sau">
            <ChevronRight size={14} />
          </button>
          <span className="text-base font-bold text-gray-900">Tuần {isoWeekNumber(weekStart)}</span>
          <span className="text-sm text-gray-500">{formatDmy(weekStart)} – {formatDmy(weekEnd)}</span>
          {isCurrentWeek
            ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">Tuần này</span>
            : <button type="button" onClick={() => setWeekStart(mondayOf(today))} className="text-xs text-blue-600 hover:underline">Về tuần này</button>}
        </div>

        <div className="flex flex-col gap-3">
          {/* Bộ xuất huỷ cuối tuần */}
          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
              <span className="report-section-title">Bộ xuất huỷ cuối tuần</span>
              {meta.exportedAt && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Đã xuất {formatStamp(meta.exportedAt)}</span>}
              <button type="button" onClick={() => exportWeekly('all')} disabled={!hasItems || busy === 'weekly_all'} className="sheet-tab-action is-primary ml-auto">
                <FileDown size={13} /> {busy === 'weekly_all' ? 'Đang xuất…' : 'Xuất cả bộ (2 file)'}
              </button>
            </div>
            <div className="report-section-content flex flex-col gap-3">
              <p className="text-xs text-gray-500">Gộp tất cả hàng lỗi khách trả trong tuần — cả cùng lô lẫn khác lô — vào 1 bộ. Cuối tuần xuất 1 lần.</p>

              <div className="flex items-end justify-between gap-4 flex-wrap">
                <div className="flex gap-6 flex-wrap">
                  {[[items.length, 'mặt hàng'], [weekRecords.length, 'đợt đổi trả'], [counts.same, 'cùng lô'], [counts.diff, 'khác lô']].map(([n, label]) => (
                    <div key={label}>
                      <div className="text-xl font-bold text-gray-900 tabular-nums">{n}</div>
                      <div className="text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
                    </div>
                  ))}
                </div>
                <label className="flex flex-col gap-1 text-sm" style={{ minWidth: 240 }}>
                  <span className="text-xs font-medium text-gray-500">Kế toán ký bộ cuối tuần</span>
                  <select value={weeklyAccountant} onChange={e => persistMeta({ accountant: e.target.value })}
                    className="px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400">
                    {SWAP_RETURN_ACCOUNTANTS.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                {[
                  { key: 'xuLy', ext: 'XLSX', title: 'BB Xử lý (xuất huỷ)', sub: `${items.length} dòng · Excel`, cls: 'bg-green-50 text-green-700' },
                  { key: 'xuatKho', ext: 'DOCX', title: 'BB xác minh xuất kho', sub: `${items.length} dòng · Ý kiến "Xuất xử lý"`, cls: 'bg-blue-50 text-blue-700' },
                ].map(f => (
                  <div key={f.key} className="flex items-center gap-3 border border-gray-100 rounded-lg px-3 py-2.5">
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center text-[10px] font-bold ${f.cls}`}>{f.ext}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-gray-800">{f.title}</div>
                      <div className="text-xs text-gray-500">{f.sub} · Kế toán: {weeklyAccountant}</div>
                    </div>
                    <button type="button" onClick={() => exportWeekly(f.key)} disabled={!hasItems || busy === `weekly_${f.key}`}
                      className="sheet-tab-action ml-auto" style={{ minHeight: 28, padding: '0 10px', fontSize: 12 }}>
                      <FileDown size={12} /> Xuất
                    </button>
                  </div>
                ))}
              </div>

              {counts.empty > 0 && (
                <div className="flex gap-2 items-start text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                  <span>{counts.empty} mặt hàng chưa nhập đủ 2 số lô nên chưa biết cùng lô hay khác lô — vẫn nằm trong bộ xuất huỷ, nhưng nếu là khác lô thì khách đó còn thiếu BB nhập lại kho.</span>
                </div>
              )}

              <div style={{ overflowX: 'auto' }}>
                {hasItems ? (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className={thCls}>Mã hàng</th><th className={thCls}>Tên hàng</th><th className={thCls}>Số lô (hàng lỗi)</th>
                        <th className={thCls}>Hạn dùng</th><th className={thCls}>ĐVT</th><th className={`${thCls} text-right`}>SL</th>
                        <th className={thCls}>Quy cách</th><th className={thCls}>Lô</th><th className={thCls}>Từ đợt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className={tdCls}>{it.maHang}</td>
                          <td className="px-2 py-2 font-medium text-gray-800" style={{ minWidth: 180 }}>{it.tenHang}</td>
                          <td className={tdCls}>{it.loLoi}</td>
                          <td className={tdCls}>{it.hanDungLoi}</td>
                          <td className={tdCls}>{it.dvt}</td>
                          <td className={`${tdCls} text-right tabular-nums`}>{it.soLuong}</td>
                          <td className={tdCls}>{it.quyCach}</td>
                          <td className={tdCls}><LotBadge status={lotStatus(it)} /></td>
                          <td className={tdCls}>{it.customerName} <span className="text-gray-400">· {formatDmy(it.date).slice(0, 5)}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8 text-gray-400 text-sm">Tuần này chưa có đợt đổi trả nào.</div>
                )}
              </div>
            </div>
          </div>

          {/* Các đợt đổi trả trong tuần */}
          <div className="report-section">
            <div className="report-section-trigger" style={{ cursor: 'default' }}>
              <span className="report-section-title">Đợt đổi trả trong tuần</span>
              <span className="report-section-count">{weekRecords.length} đợt</span>
            </div>
            <div className="report-section-content flex flex-col gap-2">
              <p className="text-xs text-gray-500">Khách có hàng <b>khác lô</b> cần 1 BB xác minh nhập lại kho riêng — xuất ngay tại dòng của khách đó. Hàng cùng lô không cần.</p>
              <div style={{ overflowX: 'auto' }}>
                {weekRecords.length === 0 ? (
                  <div className="text-center py-8 text-gray-400 text-sm">Chưa có đợt nào trong tuần này — bấm "Thêm đợt đổi trả".</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className={thCls}>Ngày</th><th className={thCls}>Khách hàng</th><th className={thCls}>Mặt hàng</th>
                        <th className={thCls}>Lô</th><th className={thCls}>BB xác minh nhập lại kho</th><th className={thCls} />
                      </tr>
                    </thead>
                    <tbody>
                      {weekRecords.map(r => {
                        const diffCount = nhapLaiItems(r).length
                        const statuses = [...new Set((r.items || []).map(lotStatus))]
                        return (
                          <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                            <td className={tdCls}>{formatDmy(r.date).slice(0, 5)}</td>
                            <td className="px-2 py-2 font-medium text-gray-800" style={{ minWidth: 160 }}>{r.customerName}</td>
                            <td className="px-2 py-2" style={{ minWidth: 200 }}>
                              {(r.items || []).map((it, i) => (
                                <div key={i}>{it.tenHang || it.maHang} <span className="text-gray-400">× {it.soLuong} {it.dvt}</span></div>
                              ))}
                            </td>
                            <td className="px-2 py-2"><div className="flex gap-1 flex-wrap">{statuses.map(s => <LotBadge key={s} status={s} />)}</div></td>
                            <td className={tdCls}>
                              {diffCount > 0 ? (
                                <div className="flex items-center gap-2">
                                  <button type="button" onClick={() => exportNhapLai(r)} disabled={busy === `nhapLai_${r.id}`}
                                    className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}>
                                    <FileDown size={12} /> Xuất ({diffCount} dòng)
                                  </button>
                                  {r.nhapLaiExportedAt
                                    ? <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">Đã xuất {formatStamp(r.nhapLaiExportedAt).slice(0, 5)}</span>
                                    : <span className="text-gray-500">Kế toán: {r.accountantNhapLai}</span>}
                                </div>
                              ) : (
                                <span className="text-gray-400">Không cần — cùng lô</span>
                              )}
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <button type="button" onClick={() => setFormState(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Sửa" aria-label="Sửa">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => handleRemove(r)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá" aria-label="Xoá">
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {formState && (
        <SwapReturnRecordForm
          key={formState === 'new' ? 'new' : formState.id}
          entity={type}
          defaultDate={isCurrentWeek ? today : weekStart}
          record={formState === 'new' ? null : formState}
          onSave={handleSave}
          onCancel={() => setFormState(null)}
        />
      )}
    </div>
  )
}
