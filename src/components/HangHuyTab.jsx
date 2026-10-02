import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, FileUp, Search, ChevronDown, ChevronRight, Eye, FileDown, Trash2, Check } from 'lucide-react'
import { readHuyPhieus, writeHuyPhieus } from '../data/hangHuyStore'
import { opsStore } from '../data/workspace'
import { HUY_REMINDER_RULES, HUY_KHO, huyReminders, newHuyPhieu } from '../utils/hangHuy'
import { parsePhieuXuatKhoHuyPdf } from '../utils/parsePhieuXuatKhoHangHuy'
import { extractPdfText } from '../utils/parseGoodsReceipt'
import { exportDamagedGoodsXuLy, exportDamagedGoodsXacMinh } from '../utils/exportDamagedGoods'
import HangHuyWorkspace from './HangHuyWorkspace'
import { KhoTag, HuyStagePill } from './HangHuyBadges'
import DamagedGoodsRecordView from './DamagedGoodsRecordView'

// Theo dõi hàng huỷ Kho C + Kho DTP — 1 danh sách chung (lọc theo kho) theo quy trình: kho tải PDF phiếu xuất
// kho → app điền bộ biên bản (1 phiếu = 1 bộ) → xuất Excel/Word, in → ký đủ, huỷ xong. Kho A làm ở tab riêng.
// Biên bản nhập tay theo mẫu cũ của 2 kho này (khoá damaged_goods_records) vẫn xem/xuất được ở mục riêng.

const LEGACY_KEY = 'damaged_goods_records'
const LEGACY_ENTITIES = ['khoC', 'khoDTP']
function readLegacy() {
  try {
    const list = JSON.parse(opsStore.getItem(LEGACY_KEY) || '[]')
    return Array.isArray(list) ? list.filter(r => LEGACY_ENTITIES.includes(r?.entity)) : []
  } catch { return [] }
}

const FILTER_PREF_KEY = 'hangHuy.khoFilter'
function readPref() { try { return window.localStorage.getItem(FILTER_PREF_KEY) || 'all' } catch { return 'all' } }
function writePref(v) { try { window.localStorage.setItem(FILTER_PREF_KEY, v) } catch { /* bỏ qua */ } }

function fmtDateTime(iso) {
  const d = new Date(iso)
  if (!iso || Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
const fmtDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : '—' }
const monthKey = iso => { const d = new Date(iso || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = key => { const [y, m] = key.split('-'); return `${m}/${y}` }

function ReminderPanel({ reminders, onOpen, onSigned, onWaitSign }) {
  if (reminders.length === 0) {
    return <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Không có việc tồn về hàng huỷ.</div>
  }
  return (
    <section aria-label="Nhắc việc" className="rounded-xl border border-amber-300 bg-white p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bell size={16} className="text-amber-600" />
        <h2 className="font-semibold text-sm text-gray-800">Việc cần làm hôm nay ({reminders.length})</h2>
        <span className="text-xs text-gray-400">Nhắc lại mỗi lần mở app đến khi xử lý xong.</span>
      </div>
      {HUY_REMINDER_RULES.map(rule => {
        const items = reminders.filter(r => r.kind === rule.kind)
        if (items.length === 0) return null
        return (
          <div key={rule.kind} className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{rule.title} ({items.length})</h3>
            {items.map(({ slip, days, since }) => (
              <div key={slip.id} className={`flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 border-l-4 ${days >= 3 ? 'border-red-500' : 'border-amber-400'}`}>
                <div className="flex-1 min-w-60 text-sm">
                  <KhoTag kho={slip.kho} /> <span className="font-mono text-xs">{slip.soPhieu}</span> · {slip.items.length} mặt hàng
                  <div className="text-xs text-gray-500">
                    {rule.kind === 'todo' ? `Tải lúc ${fmtDateTime(since)}${slip.stage === 'doing' ? ', đang điền dở' : ', chưa làm'}` : `Xuất lúc ${fmtDateTime(since)}, chưa ký đủ`}
                    {' · '}<b className="text-red-600">{days} ngày</b>
                  </div>
                </div>
                {rule.kind === 'todo'
                  ? (
                    <div className="flex flex-wrap gap-1">
                      <button type="button" onClick={() => onWaitSign(slip.id)} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 10px', fontSize: 12 }} title="Đã làm biên bản xong, đang chờ ký">Đã làm xong, chờ ký</button>
                      <button type="button" onClick={() => onOpen(slip.id)} className="sheet-tab-action is-primary" style={{ minHeight: 26, padding: '0 10px', fontSize: 12 }}>Làm biên bản</button>
                    </div>
                  )
                  : <button type="button" onClick={() => onSigned(slip.id)} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 10px', fontSize: 12 }}><Check size={12} /> Đã ký đủ, huỷ xong</button>}
              </div>
            ))}
          </div>
        )
      })}
    </section>
  )
}

function LegacySection() {
  const [records, setRecords] = useState(() => readLegacy())
  const [open, setOpen] = useState(false)
  const [viewingId, setViewingId] = useState(null)
  const [exportingId, setExportingId] = useState(null)
  if (records.length === 0) return null

  const handleExport = async (record, kind) => {
    setExportingId(`${record.id}_${kind}`)
    try {
      if (kind === 'xuLy') await exportDamagedGoodsXuLy(record)
      else await exportDamagedGoodsXacMinh(record)
    } catch (error) {
      window.alert(error.message || 'Xuất file thất bại.')
    } finally {
      setExportingId(null)
    }
  }
  const viewing = viewingId ? records.find(r => r.id === viewingId) : null
  if (viewing) return <DamagedGoodsRecordView record={viewing} onClose={() => setViewingId(null)} onExport={handleExport} exportingId={exportingId} />

  const remove = (id) => {
    if (!window.confirm('Xoá biên bản cũ này? Không thể hoàn tác.')) return
    try {
      const all = JSON.parse(opsStore.getItem(LEGACY_KEY) || '[]')
      opsStore.setItem(LEGACY_KEY, JSON.stringify(all.filter(r => r.id !== id)))
    } catch { return }
    setRecords(records.filter(r => r.id !== id))
  }
  const sorted = [...records].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return (
    <div className="report-section">
      <button type="button" onClick={() => setOpen(o => !o)} className="report-section-trigger w-full text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="report-section-title">Biên bản nhập tay theo mẫu cũ</span>
        <span className="report-section-count">{records.length} biên bản</span>
      </button>
      {open && (
        <div className="report-section-content" style={{ overflowX: 'auto' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Ngày lập', 'Kho', 'Số mặt hàng', 'Thao tác'].map(h => <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-700">{r.processedAt ? new Date(r.processedAt).toLocaleDateString('vi-VN') : '—'}</td>
                  <td className="px-2 py-2"><KhoTag kho={r.entity === 'khoC' ? 'C' : 'DTP'} /></td>
                  <td className="px-2 py-2 text-gray-600">{(r.items || []).length}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => setViewingId(r.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Xem"><Eye size={13} /></button>
                      <button type="button" onClick={() => handleExport(r, 'xuLy')} disabled={exportingId === `${r.id}_xuLy`} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}><FileDown size={12} /> Xử lý</button>
                      <button type="button" onClick={() => handleExport(r, 'xacMinh')} disabled={exportingId === `${r.id}_xacMinh`} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}><FileDown size={12} /> Xác minh</button>
                      <button type="button" onClick={() => remove(r.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default function HangHuyTab() {
  const [phieus, setPhieus] = useState(() => readHuyPhieus())
  const [now, setNow] = useState(() => new Date())
  const [openId, setOpenId] = useState(null)
  const [khoFilter, setKhoFilter] = useState(() => readPref())
  const [stageFilter, setStageFilter] = useState('all')
  const [month, setMonth] = useState(() => monthKey(new Date().toISOString()))
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const pdfInputRef = useRef()

  // Thời gian trôi khi để app mở lâu: tính lại nhắc việc mỗi 10 phút.
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [])

  const save = (next) => { writeHuyPhieus(next); setPhieus(next) }
  const reminders = useMemo(() => huyReminders(phieus, now), [phieus, now])

  const monthOptions = useMemo(() => {
    const set = new Set(phieus.map(p => monthKey(p.importedAt)))
    set.add(monthKey(new Date().toISOString()))
    return [...set].sort().reverse()
  }, [phieus])
  const monthPhieus = useMemo(() => (month === 'all' ? phieus : phieus.filter(p => monthKey(p.importedAt) === month)), [phieus, month])
  const khoCounts = {
    all: monthPhieus.length,
    C: monthPhieus.filter(p => p.kho === 'C').length,
    DTP: monthPhieus.filter(p => p.kho === 'DTP').length,
  }
  const khoPhieus = khoFilter === 'all' ? monthPhieus : monthPhieus.filter(p => p.kho === khoFilter)
  const stageCounts = {
    todo: khoPhieus.filter(p => p.stage === 'todo').length,
    doing: khoPhieus.filter(p => p.stage === 'doing' || p.stage === 'exported').length,
    done: khoPhieus.filter(p => p.stage === 'done').length,
  }
  const visible = khoPhieus
    .filter(p => stageFilter === 'all' || p.stage === stageFilter || (stageFilter === 'doing' && p.stage === 'exported'))
    .filter(p => {
      const q = search.trim().toLowerCase()
      return !q || [p.soPhieu, p.lyDo, ...p.items.map(i => `${i.maHang} ${i.tenHang}`)].some(v => String(v || '').toLowerCase().includes(q))
    })
    .sort((a, b) => new Date(b.importedAt || 0) - new Date(a.importedAt || 0))

  const selectKho = (v) => { setKhoFilter(v); writePref(v) }
  const update = (next) => save(phieus.map(p => (p.id === next.id ? next : p)))
  const markWaitSign = (id) => save(phieus.map(p => (p.id === id ? { ...p, stage: 'exported', exportedAt: new Date().toISOString() } : p)))
  const markSigned = (id) => save(phieus.map(p => (p.id === id ? { ...p, stage: 'done', doneAt: new Date().toISOString() } : p)))
  const removePhieu = (id) => {
    if (!window.confirm('Xoá phiếu này khỏi app? Không thể hoàn tác.')) return
    save(phieus.filter(p => p.id !== id))
  }
  const openPhieu = (id) => {
    setOpenId(id)
    save(phieus.map(p => (p.id === id && p.stage === 'todo' ? { ...p, stage: 'doing' } : p)))
  }

  const createFromPdf = async (file) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const parsed = parsePhieuXuatKhoHuyPdf(await extractPdfText(await file.arrayBuffer()))
      if (!parsed.kho || parsed.items.length === 0) {
        throw new Error('Không đọc được phiếu xuất kho. Chỉ nhận file "Phiếu xuất kho" của Kho C (CPC1HN) hoặc Kho DTP (UPHARMA).')
      }
      if (phieus.some(p => p.soPhieu && p.soPhieu === parsed.soPhieu)) {
        throw new Error(`Phiếu ${parsed.soPhieu} đã có trong danh sách.`)
      }
      const phieu = newHuyPhieu(parsed, file.name, phieus, new Date())
      save([phieu, ...phieus])
      setMonth(monthKey(phieu.importedAt))
      setOpenId(phieu.id)
    } catch (err) {
      setError(err.message || 'Không đọc được file PDF.')
    } finally {
      setUploading(false)
    }
  }

  const openPhieuObj = phieus.find(p => p.id === openId)
  if (openPhieuObj) return <HangHuyWorkspace phieu={openPhieuObj} onChange={update} onBack={() => setOpenId(null)} />

  const tiles = [['todo', 'Chưa làm biên bản'], ['doing', 'Đang điền / chờ ký'], ['done', 'Đã ký, huỷ xong']]

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-4">
        <ReminderPanel reminders={reminders} onOpen={openPhieu} onSigned={markSigned} onWaitSign={markWaitSign} />

        <div className="report-section">
          <div className="report-section-trigger flex-wrap gap-2" style={{ cursor: 'default' }}>
            <select value={month} onChange={e => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white" aria-label="Tháng">
              {monthOptions.map(k => <option key={k} value={k}>Tháng {monthLabel(k)}</option>)}
              <option value="all">Tất cả các tháng</option>
            </select>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label="Kho">
              {[['all', 'Tất cả'], ['C', HUY_KHO.C.label], ['DTP', HUY_KHO.DTP.label]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => selectKho(k)} aria-pressed={khoFilter === k}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${khoFilter === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label} ({khoCounts[k]})
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm số phiếu, lý do, mã hàng…" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <button type="button" onClick={() => pdfInputRef.current.click()} disabled={uploading} className="sheet-tab-action is-primary">
                <FileUp size={13} /> {uploading ? 'Đang đọc file…' : 'Tải phiếu xuất kho (PDF)'}
              </button>
              <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { void createFromPdf(e.target.files[0]); e.target.value = '' }} />
            </div>
          </div>
          <div className="report-section-content flex flex-col gap-3">
            {error && <p className="text-sm text-red-500">{error}</p>}

            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {tiles.map(([k, label]) => (
                <button key={k} type="button" onClick={() => setStageFilter(f => (f === k ? 'all' : k))} aria-pressed={stageFilter === k}
                  className={`text-left rounded-lg border px-3 py-2 bg-white ${stageFilter === k ? 'border-[#1e3a5f] ring-1 ring-[#1e3a5f]' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="text-xl font-bold tabular-nums text-gray-800">{stageCounts[k]}</div>
                  <div className="text-xs text-gray-500">{label}</div>
                </button>
              ))}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    {['Số phiếu', 'Ngày phiếu', 'Kho', 'Lý do xuất kho', 'Số mặt hàng', 'Bộ biên bản', ''].map((h, i) => <th key={i} className="px-2 py-2 text-left text-gray-500 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">Chưa có phiếu xuất kho hàng huỷ phù hợp</td></tr>
                  ) : visible.map(p => (
                    <tr key={p.id} onClick={() => openPhieu(p.id)} className="border-b border-gray-50 align-top cursor-pointer hover:bg-blue-50/40">
                      <td className="px-2 py-2 font-mono">{p.soPhieu}</td>
                      <td className="px-2 py-2 text-gray-600">{fmtDate(p.ngayPhieu)}</td>
                      <td className="px-2 py-2"><KhoTag kho={p.kho} /><div className="text-[11px] text-gray-400 mt-1">kho {p.khoXuat}</div></td>
                      <td className="px-2 py-2 text-gray-500 max-w-72"><div className="line-clamp-2" title={p.lyDo}>{p.lyDo || '—'}</div></td>
                      <td className="px-2 py-2 text-gray-600">{p.items.length}</td>
                      <td className="px-2 py-2"><HuyStagePill stage={p.stage} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {(p.stage === 'doing' || p.stage === 'exported') && (
                            <button type="button" onClick={e => { e.stopPropagation(); markSigned(p.id) }} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }} title="Đánh dấu đã ký đủ, huỷ xong" aria-label={`Đánh dấu đã ký ${p.soPhieu}`}>
                              <Check size={12} /> Đã ký
                            </button>
                          )}
                        <button type="button" onClick={e => { e.stopPropagation(); removePhieu(p.id) }} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá phiếu" aria-label={`Xoá phiếu ${p.soPhieu}`}>
                          <Trash2 size={13} />
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <LegacySection />
      </div>
    </div>
  )
}
