import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Plus, FileUp, Search, ChevronDown, ChevronRight, Eye, FileDown, Pencil, Trash2, Check, Clock } from 'lucide-react'
import { opsStore } from '../data/workspace'
import { readSlips, writeSlips } from '../data/returnSlipsStore'
import {
  REMINDER_RULES,
  slipLoai, slipReminders, nextMorning, newSlipForm, toIsoDate, parseReturnSlipLines,
} from '../utils/returnSlips'
import { extractPdfLines } from '../utils/returnSlipPdf'
import ReturnSlipWorkspace from './ReturnSlipWorkspace'
import { LoaiTag, StagePill } from './ReturnSlipBadges'
import ReturnRecordForm from './ReturnRecordForm'
import ReturnRecordView from './ReturnRecordView'
import { exportTraHang, exportXacMinh } from '../utils/exportReturnReport'

// Theo dõi nhập trả lại — 1 danh sách chung cho Đơn C và Đơn DTP (lọc được), theo quy trình: sales tạo phiếu
// trên website → duyệt → kho làm bộ biên bản trên app → ký đủ, nhập kho. Phiếu lưu ở ops_settings
// (khoá "return_slips"); đơn nhập theo mẫu cũ (bảng return_records) vẫn xem/xuất được ở mục riêng bên dưới.

const LEGACY_KEY = 'return_records'
function readLegacy() {
  try {
    const list = JSON.parse(opsStore.getItem(LEGACY_KEY) || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}

const FILTER_PREF_KEY = 'returnSlips.typeFilter'
function readPref() { try { return window.localStorage.getItem(FILTER_PREF_KEY) || 'all' } catch { return 'all' } }
function writePref(v) { try { window.localStorage.setItem(FILTER_PREF_KEY, v) } catch { /* bỏ qua */ } }

function fmtDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })
}
const monthKey = iso => { const d = new Date(iso || Date.now()); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = key => { const [y, m] = key.split('-'); return `${m}/${y}` }
const daysSince = (iso, now) => Math.max(0, Math.floor((now - new Date(iso)) / 86400000))

const inputCls = 'w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white'

const EMPTY_NEW = { maPhieu: '', donHang: '', khachHang: '', nhanVien: '', ngayTao: '', stage: 'wait', lyDo: '' }

function AddSlipForm({ onAdd, onCancel }) {
  const [form, setForm] = useState(() => ({ ...EMPTY_NEW, ngayTao: toIsoDate(new Date()) }))
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const submit = (e) => {
    e.preventDefault()
    if (!form.maPhieu.trim() || !form.khachHang.trim()) return
    onAdd(form)
  }
  return (
    <form onSubmit={submit} className="rounded-xl border border-gray-200 bg-gray-50 p-4 flex flex-col gap-3">
      <div className="font-semibold text-sm text-gray-800">Thêm phiếu trả hàng (ngay khi sales tạo trên website)</div>
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Mã phiếu *<input required value={form.maPhieu} onChange={e => set('maPhieu', e.target.value)} className={inputCls} placeholder="DHC…" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Đơn hàng<input value={form.donHang} onChange={e => set('donHang', e.target.value)} className={inputCls} placeholder="DH…" /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Khách hàng *<input required value={form.khachHang} onChange={e => set('khachHang', e.target.value)} className={inputCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Nhân viên<input value={form.nhanVien} onChange={e => set('nhanVien', e.target.value)} className={inputCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Ngày tạo phiếu<input type="date" value={form.ngayTao} onChange={e => set('ngayTao', e.target.value)} className={inputCls} /></label>
        <label className="flex flex-col gap-1 text-xs text-gray-500">Trạng thái trên website
          <select value={form.stage} onChange={e => set('stage', e.target.value)} className={inputCls}>
            <option value="wait">Mới tạo (chờ duyệt)</option>
            <option value="todo">Đã duyệt</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-500" style={{ gridColumn: '1 / -1' }}>Lý do<input value={form.lyDo} onChange={e => set('lyDo', e.target.value)} className={inputCls} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className="sheet-tab-action is-primary">Lưu phiếu</button>
        <button type="button" onClick={onCancel} className="sheet-tab-action">Huỷ</button>
        <span className="text-xs text-gray-400">Phiếu chờ duyệt quá 1 ngày sẽ hiện trong Nhắc việc để anh vào website nội bộ kiểm tra.</span>
      </div>
    </form>
  )
}

function WaitActions({ slip, onApprove, onSnooze }) {
  return (
    <div className="flex flex-wrap gap-1">
      <button type="button" onClick={e => { e.stopPropagation(); onApprove(slip.id) }} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}>
        <Check size={12} /> Đã duyệt
      </button>
      <button type="button" onClick={e => { e.stopPropagation(); onSnooze(slip.id) }} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}>
        <Clock size={12} /> Chưa duyệt, nhắc lại mai
      </button>
    </div>
  )
}

function ReminderPanel({ reminders, onApprove, onSnooze, onOpen, onSigned }) {
  if (reminders.length === 0) {
    return <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">Không có việc tồn về nhập trả lại.</div>
  }
  return (
    <section aria-label="Nhắc việc" className="rounded-xl border border-amber-300 bg-white p-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Bell size={16} className="text-amber-600" />
        <h2 className="font-semibold text-sm text-gray-800">Việc cần làm hôm nay ({reminders.length})</h2>
        <span className="text-xs text-gray-400">Nhắc lại mỗi lần mở app đến khi xử lý xong.</span>
      </div>
      {REMINDER_RULES.map(rule => {
        const items = reminders.filter(r => r.kind === rule.kind)
        if (items.length === 0) return null
        return (
          <div key={rule.kind} className="flex flex-col gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{rule.title} ({items.length})</h3>
            {items.map(({ slip, days, since }) => (
              <div key={slip.id} className={`flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 border-l-4 ${days >= 3 ? 'border-red-500' : 'border-amber-400'}`}>
                <div className="flex-1 min-w-60 text-sm">
                  <span className="font-mono text-xs">{slip.maPhieu || '(chưa có mã phiếu)'}</span> · <b>{slip.khachHang || '—'}</b>
                  <div className="text-xs text-gray-500">
                    {rule.kind === 'wait' && `Tạo lúc ${fmtDateTime(since)}, chưa duyệt`}
                    {rule.kind === 'todo' && `Duyệt lúc ${fmtDateTime(since)}${slip.stage === 'doing' ? ', đang điền dở' : ', chưa làm'}`}
                    {rule.kind === 'sign' && `Xuất lúc ${fmtDateTime(since)}, chưa ký đủ`}
                    {' · '}<b className="text-red-600">{days} ngày</b>
                  </div>
                </div>
                {rule.kind === 'wait' && <WaitActions slip={slip} onApprove={onApprove} onSnooze={onSnooze} />}
                {rule.kind === 'todo' && <button type="button" onClick={() => onOpen(slip.id)} className="sheet-tab-action is-primary" style={{ minHeight: 26, padding: '0 10px', fontSize: 12 }}>Làm biên bản</button>}
                {rule.kind === 'sign' && <button type="button" onClick={() => onSigned(slip.id)} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 10px', fontSize: 12 }}><Check size={12} /> Đã ký đủ, nhập kho</button>}
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
  const [editing, setEditing] = useState(null)
  const [exportingId, setExportingId] = useState(null)
  if (records.length === 0) return null

  const persist = (next) => { opsStore.setItem(LEGACY_KEY, JSON.stringify(next)); setRecords(next) }
  const handleExport = async (record, kind) => {
    setExportingId(`${record.id}_${kind}`)
    try {
      if (kind === 'traHang') await exportTraHang(record)
      else await exportXacMinh(record)
      if (record.status !== 'exported') persist(records.map(r => (r.id === record.id ? { ...r, status: 'exported' } : r)))
    } catch (error) {
      window.alert(error.message || 'Xuất file thất bại.')
    } finally {
      setExportingId(null)
    }
  }

  if (editing) {
    return (
      <ReturnRecordForm
        type={editing.entity} year={editing.year} month={editing.month} record={editing}
        onSave={(rec) => { persist([...records.filter(r => r.id !== rec.id), rec]); setEditing(null) }}
        onCancel={() => setEditing(null)}
      />
    )
  }
  const viewing = viewingId ? records.find(r => r.id === viewingId) : null
  if (viewing) {
    return (
      <ReturnRecordView
        record={viewing}
        onClose={() => setViewingId(null)}
        onEdit={() => { setViewingId(null); setEditing(viewing) }}
        onExport={handleExport}
        exportingId={exportingId}
      />
    )
  }

  const sorted = [...records].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
  return (
    <div className="report-section">
      <button type="button" onClick={() => setOpen(o => !o)} className="report-section-trigger w-full text-left">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="report-section-title">Đơn nhập theo mẫu cũ</span>
        <span className="report-section-count">{records.length} đơn</span>
      </button>
      {open && (
        <div className="report-section-content" style={{ overflowX: 'auto' }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-2 py-2 text-left text-gray-500 font-semibold">Tháng</th>
                <th className="px-2 py-2 text-left text-gray-500 font-semibold">Loại</th>
                <th className="px-2 py-2 text-left text-gray-500 font-semibold">Khách hàng</th>
                <th className="px-2 py-2 text-left text-gray-500 font-semibold">Trạng thái</th>
                <th className="px-2 py-2 text-left text-gray-500 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.id} className="border-b border-gray-50">
                  <td className="px-2 py-2 text-gray-600">{String(r.month).padStart(2, '0')}/{r.year}</td>
                  <td className="px-2 py-2"><LoaiTag loai={r.entity === 'donC' ? 'C' : 'DTP'} /></td>
                  <td className="px-2 py-2 font-medium text-gray-800">{r.customerName}</td>
                  <td className="px-2 py-2 text-gray-500">{r.status === 'exported' ? 'Đã xuất' : 'Nháp'}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap items-center gap-1">
                      <button type="button" onClick={() => setViewingId(r.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Xem"><Eye size={13} /></button>
                      <button type="button" onClick={() => handleExport(r, 'traHang')} disabled={exportingId === `${r.id}_traHang`} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}><FileDown size={12} /> Trả hàng</button>
                      <button type="button" onClick={() => handleExport(r, 'xacMinh')} disabled={exportingId === `${r.id}_xacMinh`} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }}><FileDown size={12} /> Xác minh</button>
                      <button type="button" onClick={() => setEditing(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Sửa"><Pencil size={13} /></button>
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

export default function ReturnSlipsTab() {
  const [slips, setSlips] = useState(() => readSlips())
  const [now, setNow] = useState(() => new Date())
  const [openId, setOpenId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [typeFilter, setTypeFilter] = useState(() => readPref())
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

  const save = (next) => { writeSlips(next); setSlips(next) }
  const updateSlip = (id, patch) => save(slips.map(s => (s.id === id ? { ...s, ...patch } : s)))

  const reminders = useMemo(() => slipReminders(slips, now), [slips, now])

  const monthOptions = useMemo(() => {
    const set = new Set(slips.map(s => monthKey(s.createdAt)))
    set.add(monthKey(new Date().toISOString()))
    return [...set].sort().reverse()
  }, [slips])

  const monthSlips = useMemo(
    () => (month === 'all' ? slips : slips.filter(s => monthKey(s.createdAt) === month)),
    [slips, month],
  )
  const typeCounts = useMemo(() => ({
    all: monthSlips.length,
    C: monthSlips.filter(s => slipLoai(s) === 'C').length,
    DTP: monthSlips.filter(s => slipLoai(s) === 'DTP').length,
  }), [monthSlips])
  const typeSlips = useMemo(
    () => (typeFilter === 'all' ? monthSlips : monthSlips.filter(s => slipLoai(s) === typeFilter)),
    [monthSlips, typeFilter],
  )
  const stageCounts = {
    wait: typeSlips.filter(s => s.stage === 'wait').length,
    todo: typeSlips.filter(s => s.stage === 'todo').length,
    doing: typeSlips.filter(s => s.stage === 'doing' || s.stage === 'exported').length,
    done: typeSlips.filter(s => s.stage === 'done').length,
  }
  const visible = typeSlips
    .filter(s => stageFilter === 'all' || s.stage === stageFilter || (stageFilter === 'doing' && s.stage === 'exported'))
    .filter(s => {
      const q = search.trim().toLowerCase()
      return !q || [s.khachHang, s.maPhieu, s.donHang, s.nhanVien].some(v => String(v || '').toLowerCase().includes(q))
    })
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

  const selectType = (v) => { setTypeFilter(v); writePref(v) }

  const addSlip = (form) => {
    const createdAt = form.ngayTao ? new Date(`${form.ngayTao}T08:00`).toISOString() : new Date().toISOString()
    const slip = {
      id: `slip_${Date.now()}`,
      maPhieu: form.maPhieu.trim(), donHang: form.donHang.trim(), khachHang: form.khachHang.trim(),
      nhanVien: form.nhanVien.trim(), lyDo: form.lyDo.trim(),
      createdAt, stage: form.stage,
      approvedAt: form.stage === 'todo' ? new Date().toISOString() : null,
      form: newSlipForm(0),
      pdf: null,
    }
    save([slip, ...slips])
    setAdding(false)
    setMonth(monthKey(createdAt))
  }

  const approve = (id) => updateSlip(id, { stage: 'todo', approvedAt: new Date().toISOString(), snoozeUntil: null })
  const snooze = (id) => updateSlip(id, { snoozeUntil: nextMorning(new Date()) })
  const markSigned = (id) => updateSlip(id, { stage: 'done', doneAt: new Date().toISOString() })
  const removeSlip = (id) => {
    if (!window.confirm('Xoá phiếu trả hàng này khỏi app? Không thể hoàn tác.')) return
    save(slips.filter(s => s.id !== id))
  }

  // Kho chưa thêm phiếu trước: tải thẳng PDF phiếu đã duyệt để tạo phiếu mới.
  const createFromPdf = async (file) => {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const pdf = parseReturnSlipLines(await extractPdfLines(await file.arrayBuffer()))
      const nowIso = new Date().toISOString()
      const form = newSlipForm(pdf.items.length)
      if (pdf.benMua?.mst) form.mst = pdf.benMua.mst
      const slip = {
        id: `slip_${Date.now()}`,
        maPhieu: '', donHang: '',
        khachHang: pdf.benMua?.ten || '', nhanVien: pdf.benC?.daiDien || '', lyDo: pdf.lyDo,
        createdAt: nowIso, approvedAt: nowIso, stage: 'doing',
        form, pdf: { ...pdf, fileName: file.name },
      }
      save([slip, ...slips])
      setMonth(monthKey(nowIso))
      setOpenId(slip.id)
    } catch (err) {
      setError(err.message || 'Không đọc được file PDF.')
    } finally {
      setUploading(false)
    }
  }

  // Đơn không có phiếu/PDF từ website: tạo phiếu trống rồi mở thẳng màn làm biên bản, nơi có nút "Nhập tay" và
  // "Đọc từ hoá đơn (PDF)" (xem ReturnSlipWorkspace).
  const createManual = () => {
    const nowIso = new Date().toISOString()
    const slip = {
      id: `slip_${Date.now()}`, maPhieu: '', donHang: '', khachHang: '', nhanVien: '', lyDo: '',
      createdAt: nowIso, approvedAt: nowIso, stage: 'doing', form: newSlipForm(0), pdf: null,
    }
    save([slip, ...slips])
    setMonth(monthKey(nowIso))
    setOpenId(slip.id)
  }

  const openSlip = slips.find(s => s.id === openId)
  if (openSlip) {
    return (
      <ReturnSlipWorkspace
        slip={openSlip}
        onChange={(next) => save(slips.map(s => (s.id === next.id ? next : s)))}
        onBack={() => setOpenId(null)}
      />
    )
  }

  const tiles = [
    ['wait', 'Chờ duyệt trên website'],
    ['todo', 'Đã duyệt, chưa làm biên bản'],
    ['doing', 'Đang điền / chờ ký'],
    ['done', 'Đã ký, nhập kho'],
  ]

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-4">
        <header className="sheet-tab-context">
          <span>Sales tạo phiếu → GĐ chi nhánh / ASM / SS duyệt trên website → kho làm bộ biên bản trên app → ký đủ, nhập kho</span>
        </header>

        <ReminderPanel reminders={reminders} onApprove={approve} onSnooze={snooze} onOpen={setOpenId} onSigned={markSigned} />

        <div className="report-section">
          <div className="report-section-trigger flex-wrap gap-2" style={{ cursor: 'default' }}>
            <select value={month} onChange={e => setMonth(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white" aria-label="Tháng">
              {monthOptions.map(k => <option key={k} value={k}>Tháng {monthLabel(k)}</option>)}
              <option value="all">Tất cả các tháng</option>
            </select>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label="Loại đơn">
              {[['all', 'Tất cả'], ['C', 'Đơn C'], ['DTP', 'Đơn DTP']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => selectType(k)} aria-pressed={typeFilter === k}
                  className={`px-2.5 py-1 rounded text-xs font-medium ${typeFilter === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label} ({typeCounts[k]})
                </button>
              ))}
            </div>
            <div className="relative flex-1 min-w-48 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm khách hàng, mã phiếu, đơn hàng…" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex flex-wrap gap-2 ml-auto">
              <button type="button" onClick={() => pdfInputRef.current.click()} disabled={uploading} className="sheet-tab-action">
                <FileUp size={13} /> {uploading ? 'Đang đọc file…' : 'Tải PDF phiếu đã duyệt'}
              </button>
              <input ref={pdfInputRef} type="file" accept=".pdf" className="hidden" onChange={e => { void createFromPdf(e.target.files[0]); e.target.value = '' }} />
              <button type="button" onClick={createManual} className="sheet-tab-action" title="Đơn không có phiếu/PDF từ website: nhập tay hoặc đọc từ hoá đơn">
                <Plus size={13} /> Tạo đơn thủ công
              </button>
              <button type="button" onClick={() => setAdding(a => !a)} className="sheet-tab-action is-primary" aria-expanded={adding}>
                <Plus size={13} /> Thêm phiếu
              </button>
            </div>
          </div>
          <div className="report-section-content flex flex-col gap-3">
            {error && <p className="text-sm text-red-500">{error}</p>}
            {adding && <AddSlipForm onAdd={addSlip} onCancel={() => setAdding(false)} />}

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
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Mã phiếu / Đơn hàng</th>
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Khách hàng</th>
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Nhân viên</th>
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Duyệt</th>
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Loại đơn</th>
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Lý do</th>
                    <th className="px-2 py-2 text-left text-gray-500 font-semibold">Bộ biên bản</th>
                    <th className="px-2 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-10 text-gray-400 text-sm">Chưa có phiếu trả hàng phù hợp</td></tr>
                  ) : visible.map(s => (
                    <tr key={s.id} onClick={() => { if (s.stage !== 'wait') setOpenId(s.id) }}
                      className={`border-b border-gray-50 align-top ${s.stage === 'wait' ? '' : 'cursor-pointer hover:bg-blue-50/40'}`}>
                      <td className="px-2 py-2 font-mono">{s.maPhieu || '—'}<div className="text-gray-400">{s.donHang}</div></td>
                      <td className="px-2 py-2 font-medium text-gray-800">{s.khachHang || '—'}</td>
                      <td className="px-2 py-2 text-gray-600">{s.nhanVien || '—'}</td>
                      <td className="px-2 py-2 text-gray-600">
                        {s.stage === 'wait' ? (
                          <div className="flex flex-col gap-1">
                            <span className="text-gray-400">Chưa duyệt · tạo {daysSince(s.createdAt, now)} ngày</span>
                            <WaitActions slip={s} onApprove={approve} onSnooze={snooze} />
                          </div>
                        ) : (s.approvedAt ? fmtDateTime(s.approvedAt) : '—')}
                      </td>
                      <td className="px-2 py-2">
                        <LoaiTag loai={slipLoai(s)} />
                        {s.pdf && <div className="text-[11px] text-gray-400 mt-1">{s.pdf.mau === 'NOIBO' ? 'Khách chưa nhận · Nội bộ' : `Khách đã nhận · ${s.pdf.mau}`}</div>}
                      </td>
                      <td className="px-2 py-2 text-gray-500 max-w-64"><div className="line-clamp-2" title={s.lyDo || s.pdf?.lyDo}>{s.lyDo || s.pdf?.lyDo || '—'}</div></td>
                      <td className="px-2 py-2"><StagePill stage={s.stage} /></td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          {(s.stage === 'doing' || s.stage === 'exported') && (
                            <button type="button" onClick={e => { e.stopPropagation(); markSigned(s.id) }} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }} title="Đánh dấu đã ký đủ, nhập kho" aria-label={`Đánh dấu đã ký ${s.maPhieu || s.khachHang}`}>
                              <Check size={12} /> Đã ký
                            </button>
                          )}
                        <button type="button" onClick={e => { e.stopPropagation(); removeSlip(s.id) }} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá phiếu">
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
