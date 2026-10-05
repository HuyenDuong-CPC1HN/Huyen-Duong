import { useMemo, useRef, useState } from 'react'
import { Upload, FileUp, FileSpreadsheet, X, AlertTriangle, Clock, CircleAlert, Search, PackageSearch, Download, FileWarning, Hourglass, TriangleAlert, CalendarRange, FileDown, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { opsStore as localStorage } from '../data/workspace'
import { ResizeHandle } from './DataTable'
import { parseExpiryStockWorkbook, parseReportDateRange, detectExpiryEntity, filterByExpiryEntity, EXPIRY_ENTITIES, isSlowMoving, classifyExpiry, daysUntil, drugAgeMonths, CAN_DATE_BUCKETS } from '../utils/parseExpiryStock'
import { exportExpiryDisposal } from '../utils/exportExpiryDisposal'
import { exportStockReport } from '../utils/exportStockReport'

// Menu "Quản lý tồn kho" có 2 tab con dùng chung component này và chung dữ liệu (1 file "Báo cáo tổng hợp
// nhập xuất tồn theo kho" mỗi tháng, tải ở tab nào cũng được):
//  - mode="canDate": "Hàng cận date" — hết hạn / dưới 3 tháng / dưới 6 tháng + nhóm cận hạn 6–12 tháng.
//  - mode="clc": "Hàng chậm luân chuyển" — còn tồn, không nhập không xuất trong kỳ báo cáo.
// Mỗi tab xuất file báo cáo riêng chỉ gồm sheet tương ứng của mẫu (sheet "Cận date" hoặc "CLC").

// Ngưỡng "hàng còn hạn dùng dưới 1 tháng" dùng riêng cho Biên bản Xử lý/Xác minh — hẹp hơn bucket
// "near3" (dưới 3 tháng) đã có, và không gồm hàng đã hết hạn (daysLeft âm, thuộc bucket "expired" riêng,
// khác quy trình với "hàng cận date" mà 2 mẫu biên bản này dùng).
const DISPOSAL_DAYS_THRESHOLD = 30

// "Chậm luân chuyển" = không phát sinh Sl nhập lẫn Sl xuất trong SUỐT khoảng thời gian file báo cáo bao
// phủ ("Từ ngày ... đến ngày ..." ở đầu file) — khoảng này nên từ MIN_SLOW_DAYS ngày trở lên.
const MIN_SLOW_DAYS = 90

// ---- Lưu trữ dữ liệu upload: mỗi file là 1 mục {id, fileName, uploadedAt, rows, dateRange, entity} ----
// Mỗi tháng có tối đa 1 file Kho C và 1 file Kho DTP (tải lại cùng loại trong tháng thì thay file cũ). Dữ liệu cũ
// chưa ghi loại là Kho C. Dấu tích và "Hướng xử lý" lưu theo THÁNG (yyyy-mm) + từng dòng (đã gắn loại kho).
const STORAGE_KEY = 'expiry_stock_months'
const ACTIVE_KEY = 'expiry_stock_active'
const ENTITY_KEYS = Object.keys(EXPIRY_ENTITIES)
const entityOf = m => m.entity || 'donC'
const MAX_MONTHS = 24 // tối đa số file giữ lại
const NEW_MONTH = '__new__'

// Tháng của file = tháng của ngày cuối kỳ báo cáo trong file ("đến ngày ..."), KHÔNG theo ngày tải lên — trước đây
// tính theo ngày tải nên tải file nhiều tháng trong cùng 1 ngày thì các file đè lên nhau. File không đọc được kỳ
// báo cáo thì mới dùng ngày tải lên.
function periodOf(m) {
  const end = m.dateRange?.denNgay
  if (/^\d{4}-\d{2}/.test(end || '')) return end.slice(0, 7)
  const d = new Date(m.uploadedAt)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function periodLabel(p) { const [y, mo] = p.split('-'); return `${mo}/${y}` }

// File lưu trước khi ghi loại kho (hoặc nạp lại từ máy chủ bản cũ không có loại kho) thì tự nhận lại theo mã
// vật tư — trước đây coi hết là Kho C nên file Kho DTP bị xếp nhầm và đè lên file Kho C cùng tháng.
function readMonths() {
  try {
    const months = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(months)
      ? months.map(m => (m.entity ? m : { ...m, entity: detectExpiryEntity(m.rows || []) }))
      : []
  } catch { return [] }
}
function writeMonths(months) { localStorage.setItem(STORAGE_KEY, JSON.stringify(months)) }

function addMonth(entry) {
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  const period = periodOf(withId)
  const kept = readMonths().filter(m => !(periodOf(m) === period && entityOf(m) === entityOf(withId)))
  writeMonths([withId, ...kept].slice(0, MAX_MONTHS))
  localStorage.setItem(ACTIVE_KEY, period)
  return withId
}
// Check list "đưa vào báo cáo" — lưu theo từng tháng và từng tab con (ops_settings, dùng chung mọi máy).
// Mặc định chưa tích hàng nào; chỉ hàng đủ tiêu chí của báo cáo mới tích được.
function checkedKey(mode, period) { return `expiry_report_checked_${mode}_${period}` }
function readChecked(mode, period) {
  if (!period) return []
  try {
    const list = JSON.parse(localStorage.getItem(checkedKey(mode, period)) || '[]')
    return Array.isArray(list) ? list : []
  } catch { return [] }
}
// Cột "Hướng xử lý" do người dùng tự điền tay — lưu theo từng tháng, dùng chung cho cả 2 tab con.
function noteKey(period) { return `expiry_huong_xu_ly_${period}` }
function readNotes(period) {
  if (!period) return {}
  try {
    const obj = JSON.parse(localStorage.getItem(noteKey(period)) || '{}')
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {}
  } catch { return {} }
}

function withRowKeys(rows, entity) {
  const seen = new Map()
  return rows.map(r => {
    const base = [entity, r.maVatTu, r.maLo, r.maKho, r.hanDung || ''].join('|')
    const n = seen.get(base) || 0
    seen.set(base, n + 1)
    return { ...r, entity, rowKey: n ? `${base}#${n}` : base }
  })
}

function removeMonthEntry(id) {
  const target = readMonths().find(m => m.id === id)
  const months = readMonths().filter(m => m.id !== id)
  writeMonths(months)
  if (target && !months.some(m => periodOf(m) === periodOf(target))) {
    for (const mode of ['canDate', 'clc']) localStorage.removeItem(checkedKey(mode, periodOf(target)))
    localStorage.removeItem(noteKey(periodOf(target)))
  }
  return months
}

const CAN_DATE_CARDS = [
  { key: 'expired', label: 'Hết hạn', icon: CircleAlert, cls: 'text-red-600', bg: 'bg-red-50 border-red-200', bgActive: 'bg-red-100 border-red-400' },
  { key: 'near3', label: 'Cận dưới 3 tháng', icon: AlertTriangle, cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', bgActive: 'bg-orange-100 border-orange-400' },
  { key: 'near6', label: 'Cận dưới 6 tháng', icon: Clock, cls: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', bgActive: 'bg-amber-100 border-amber-400' },
  { key: 'near12', label: 'Cận hạn 6–12 tháng (cảnh báo luân chuyển)', icon: CalendarRange, cls: 'text-sky-700', bg: 'bg-sky-50 border-sky-200', bgActive: 'bg-sky-100 border-sky-400' },
]

const CAN_DATE_VIEWS = [
  { key: 'canDate', label: 'Cận date' },
  { key: 'near12', label: 'Cận hạn 6–12 tháng' },
  { key: 'all', label: 'Tất cả tồn kho' },
]

// Cột bảng đúng theo 2 sheet của file báo cáo mẫu: "Cận date" (9 cột) và "CLC" (13 cột).
const CAN_DATE_COLUMNS = ['Stt', 'Loại', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn cuối', 'Hướng xử lý']
const CLC_COLUMNS = ['Stt', 'Loại', 'Mã vật tư', 'Tên vật tư', 'Mã kho', 'Đvt', 'Mã lô', 'Tên lô', 'Hạn dùng', 'Tuổi thuốc (Tháng)', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối', 'Hướng xử lý']
const NUMERIC_COLUMNS = new Set(['Stt', 'Tuổi thuốc (Tháng)', 'Tồn đầu', 'Sl nhập', 'Sl xuất', 'Tồn cuối'])
const DEFAULT_COL_WIDTH = {
  'Stt': 56, 'Loại': 90, 'Mã vật tư': 100, 'Tên vật tư': 280, 'Mã kho': 84, 'Đvt': 70, 'Mã lô': 100, 'Tên lô': 100,
  'Hạn dùng': 100, 'Tuổi thuốc (Tháng)': 120, 'Tồn đầu': 90, 'Sl nhập': 84, 'Sl xuất': 84, 'Tồn cuối': 90, 'Hướng xử lý': 220,
}
const COLWIDTHS_KEY = 'expiry_stock_colwidths'
const CHECK_COL_WIDTH = 44

// Độ rộng cột do người dùng tự kéo chỉnh (kéo mép phải mỗi cột) — lưu lại để lần sau mở vẫn giữ nguyên.
function useColWidths() {
  const init = () => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLWIDTHS_KEY) || '{}')
      return { ...DEFAULT_COL_WIDTH, ...saved }
    } catch { return { ...DEFAULT_COL_WIDTH } }
  }
  const [widths, setWidths] = useState(init)
  const setWidth = (key, w) => setWidths(prev => {
    const next = { ...prev, [key]: Math.max(50, w) }
    localStorage.setItem(COLWIDTHS_KEY, JSON.stringify(next))
    return next
  })
  const resetWidths = () => {
    localStorage.removeItem(COLWIDTHS_KEY)
    setWidths({ ...DEFAULT_COL_WIDTH })
  }
  return [widths, setWidth, resetWidths]
}

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function byExpiry(a, b) {
  if (!a.hanDung && !b.hanDung) return 0
  if (!a.hanDung) return 1
  if (!b.hanDung) return -1
  return a.hanDung.localeCompare(b.hanDung)
}

const AGE_CLASS = {
  expired: 'text-red-600 font-semibold',
  near3: 'text-orange-600 font-semibold',
  near6: 'text-amber-600 font-semibold',
  near12: 'text-sky-700 font-medium',
}

function ageTitle(daysLeft) {
  if (daysLeft === null) return 'Không rõ hạn dùng'
  return daysLeft < 0 ? `Quá hạn ${Math.abs(daysLeft)} ngày` : `Còn ${daysLeft} ngày`
}

function cellValue(col, r, i) {
  switch (col) {
    case 'Stt': return i + 1
    case 'Loại': return EXPIRY_ENTITIES[r.entity]?.label || ''
    case 'Mã vật tư': return r.maVatTu
    case 'Tên vật tư': return r.tenVatTu || '—'
    case 'Mã kho': return r.maKho || '—'
    case 'Đvt': return r.dvt || '—'
    case 'Mã lô': return r.maLo || '—'
    case 'Tên lô': return r.tenLo || r.maLo || '—'
    case 'Hạn dùng': return formatDateVi(r.hanDung)
    case 'Tuổi thuốc (Tháng)': return r.tuoiThuoc ?? '—'
    case 'Tồn đầu': return (r.tonDau ?? 0).toLocaleString('vi-VN')
    case 'Sl nhập': return (r.slNhap ?? 0).toLocaleString('vi-VN')
    case 'Sl xuất': return (r.slXuat ?? 0).toLocaleString('vi-VN')
    case 'Tồn cuối': return (r.tonCuoi ?? 0).toLocaleString('vi-VN')
    default: return ''
  }
}

const VIEW_FILE_LABEL = { canDate: 'CanDate', expired: 'HetHan', near3: 'Duoi3Thang', near6: 'Duoi6Thang', near12: 'CanHan6-12Thang', clc: 'CLC', all: 'TatCa' }

// Xuất nhanh đúng danh sách đang xem trên màn hình (theo bộ lọc) — khác với "Xuất báo cáo" đúng mẫu 2 sheet.
function exportRowsToExcel(rows, period, view) {
  const data = rows.map((r, i) => ({
    'Stt': i + 1,
    'Mã vật tư': r.maVatTu,
    'Tên vật tư': r.tenVatTu,
    'Mã kho': r.maKho,
    'Đvt': r.dvt,
    'Mã lô': r.maLo,
    'Tên lô': r.tenLo || r.maLo,
    'Hạn dùng': formatDateVi(r.hanDung),
    'Tuổi thuốc (Tháng)': r.tuoiThuoc,
    'Tồn đầu': r.tonDau,
    'Sl nhập': r.slNhap,
    'Sl xuất': r.slXuat,
    'Tồn cuối': r.tonCuoi,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  // json_to_sheet không tự đặt độ rộng cột — mặc định quá hẹp khiến 2 cột liền nhau bị dính chữ vào nhau
  // khi mở bằng Excel/LibreOffice, nên tự tính theo nội dung dài nhất của từng cột (kể cả tiêu đề).
  const headers = Object.keys(data[0] || {})
  ws['!cols'] = headers.map(h => {
    const maxLen = data.reduce((max, row) => Math.max(max, String(row[h] ?? '').length), h.length)
    return { wch: Math.min(Math.max(maxLen + 2, 8), 40) }
  })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Ton kho can date')
  const monthLabel = periodLabel(period).replace('/', '-')
  XLSX.writeFile(wb, `TonKhoCanDate_${VIEW_FILE_LABEL[view] || 'CanDate'}_${monthLabel}.xlsx`)
}

const ENTITY_BADGE = {
  donC: 'bg-red-100 text-red-700 border-red-200',
  donDTP: 'bg-blue-100 text-blue-700 border-blue-200',
}

export default function ExpiryStockTab({ mode = 'canDate' }) {
  const isClc = mode === 'clc'
  const inputRefs = useRef({})
  const [dragging, setDragging] = useState('')
  const [error, setError] = useState('')
  const [months, setMonths] = useState(() => readMonths())
  const periods = useMemo(() => [...new Set(months.map(periodOf))].sort().reverse(), [months])
  const [periodSel, setPeriodSel] = useState(() => localStorage.getItem(ACTIVE_KEY))
  // "Xử lý tháng mới": màn hình trống để tải 2 file của tháng mới, không hiện dữ liệu tháng cũ (tháng cũ vẫn
  // giữ nguyên, bấm nút tháng để xem lại). Tải file xong tự chuyển sang đúng tháng của file.
  const isNewMonth = periodSel === NEW_MONTH
  const period = isNewMonth ? null : (periods.includes(periodSel) ? periodSel : (periods[0] || null))
  const [entSel, setEntSel] = useState('all') // all | donC | donDTP
  const entries = useMemo(() => {
    const out = {}
    for (const k of ENTITY_KEYS) out[k] = months.find(m => periodOf(m) === period && entityOf(m) === k) || null
    return out
  }, [months, period])
  const [view, setView] = useState(isClc ? 'clc' : 'canDate') // canDate | expired | near3 | near6 | near12 | all (tab Hàng cận date); clc (tab Hàng chậm luân chuyển)
  const [search, setSearch] = useState('')
  const [khoFilter, setKhoFilter] = useState('all')
  const [exportingDisposal, setExportingDisposal] = useState(false)
  const [exportingReport, setExportingReport] = useState('')
  const [colWidths, setColWidth, resetColWidths] = useColWidths()

  const [checkedState, setCheckedState] = useState(() => ({ period, keys: readChecked(mode, period) }))
  // Đổi tháng thì nạp lại dấu tích đã lưu của tháng đó.
  const checkedKeys = useMemo(
    () => new Set(checkedState.period === period ? checkedState.keys : readChecked(mode, period)),
    [checkedState, period, mode],
  )
  const saveChecked = (nextSet) => {
    const keys = [...nextSet]
    setCheckedState({ period, keys })
    if (period) localStorage.setItem(checkedKey(mode, period), JSON.stringify(keys))
  }
  const [notesState, setNotesState] = useState(() => ({ period, notes: readNotes(period) }))
  const notes = notesState.period === period ? notesState.notes : readNotes(period)
  const setNote = (rowKey, text) => {
    if (!period) return
    const next = { ...notes }
    if (text) next[rowKey] = text
    else delete next[rowKey]
    setNotesState({ period, notes: next })
    localStorage.setItem(noteKey(period), JSON.stringify(next))
  }

  const parseFile = async (file, expected) => {
    setError('')
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!['xlsx', 'xls', 'xml'].includes(ext)) { setError('Chỉ hỗ trợ file .xlsx, .xls hoặc .xml (Excel XML xuất từ phần mềm kho)'); return }
    try {
      const buffer = await file.arrayBuffer()
      const rows = parseExpiryStockWorkbook(buffer)
      if (rows.length === 0) { setError('Không tìm thấy dữ liệu vật tư trong file.'); return }
      const dateRange = parseReportDateRange(buffer)
      const fileEntity = detectExpiryEntity(rows)
      if (expected && fileEntity !== expected) {
        setError(`File "${file.name}" là của ${EXPIRY_ENTITIES[fileEntity].label}, anh tải vào ô ${EXPIRY_ENTITIES[fileEntity].label} giúp em.`)
        return
      }
      if (filterByExpiryEntity(rows, fileEntity).length === 0) { setError(`File không có dữ liệu của các kho ${EXPIRY_ENTITIES[fileEntity].kho.join(', ')} (${EXPIRY_ENTITIES[fileEntity].label}).`); return }
      const draft = { fileName: file.name, uploadedAt: new Date().toISOString(), rows, dateRange, entity: fileEntity }
      // Mỗi tháng xử lý riêng: tháng lấy theo kỳ báo cáo trong file. Tháng đó đã có file cùng kho thì hỏi lại,
      // không tự thay.
      const existing = readMonths().find(m => periodOf(m) === periodOf(draft) && entityOf(m) === fileEntity)
      if (existing && !window.confirm(`Tháng ${periodLabel(periodOf(draft))} đã có file ${EXPIRY_ENTITIES[fileEntity].label} "${existing.fileName}". Thay bằng file "${file.name}"?`)) return
      const entry = addMonth(draft)
      setMonths(readMonths())
      setPeriodSel(periodOf(entry))
      setKhoFilter('all')
    } catch (err) {
      setError(err.message || 'Không đọc được file. Vui lòng kiểm tra lại.')
    }
  }

  const handleDrop = (e, ent) => { e.preventDefault(); setDragging(''); void parseFile(e.dataTransfer.files[0], ent) }

  const removeEntry = (entry) => {
    if (!window.confirm(`Xoá dữ liệu "${entry.fileName}" (${EXPIRY_ENTITIES[entityOf(entry)].label})? Dữ liệu loại kho còn lại vẫn được giữ nguyên.`)) return
    setMonths(removeMonthEntry(entry.id))
  }

  const selectPeriod = (p) => {
    localStorage.setItem(ACTIVE_KEY, p)
    setPeriodSel(p)
  }

  const rowsC = entries.donC?.rows
  const rowsD = entries.donDTP?.rows
  const inStock = useMemo(() => {
    const today = new Date()
    const out = []
    for (const [ent, rows] of [['donC', rowsC], ['donDTP', rowsD]]) {
      if (!rows) continue
      for (const r of withRowKeys(filterByExpiryEntity(rows, ent), ent)) {
        if (!(r.tonCuoi > 0)) continue
        out.push({
          ...r,
          bucket: classifyExpiry(r.hanDung, today),
          daysLeft: daysUntil(r.hanDung, today),
          tuoiThuoc: drugAgeMonths(r.hanDung, today),
          slow: isSlowMoving(r),
        })
      }
    }
    return out
  }, [rowsC, rowsD])
  // Phạm vi đang xem: Tất cả hoặc riêng 1 loại kho — thẻ đếm, số hàng đủ tiêu chí và danh sách đều theo phạm vi này.
  const scoped = useMemo(() => (entSel === 'all' ? inStock : inStock.filter(r => r.entity === entSel)), [inStock, entSel])
  const shownEntries = ENTITY_KEYS.filter(k => (entSel === 'all' || entSel === k) && entries[k]).map(k => entries[k])

  const counts = useMemo(() => ({
    expired: scoped.filter(r => r.bucket === 'expired').length,
    near3: scoped.filter(r => r.bucket === 'near3').length,
    near6: scoped.filter(r => r.bucket === 'near6').length,
    near12: scoped.filter(r => r.bucket === 'near12').length,
    clc: scoped.filter(r => r.slow).length,
  }), [scoped])

  // Hàng đủ tiêu chí báo cáo của tab này (mới được tích); báo cáo chỉ lấy hàng đủ tiêu chí ĐÃ tích —
  // trong toàn bộ tháng đang chọn, không phụ thuộc tìm kiếm/lọc kho đang xem.
  const isEligible = (r) => (isClc ? r.slow : CAN_DATE_BUCKETS.includes(r.bucket))
  const eligibleRows = useMemo(
    () => scoped.filter(r => (isClc ? r.slow : CAN_DATE_BUCKETS.includes(r.bucket))).sort(byExpiry),
    [scoped, isClc],
  )
  const reportRows = useMemo(() => eligibleRows.filter(r => checkedKeys.has(r.rowKey)), [eligibleRows, checkedKeys])

  const toggleRow = (rowKey) => {
    const next = new Set(checkedKeys)
    if (next.has(rowKey)) next.delete(rowKey)
    else next.add(rowKey)
    saveChecked(next)
  }

  const khoOptions = useMemo(() => [...new Set(scoped.map(r => r.maKho).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [scoped])

  const filteredRows = useMemo(() => {
    let rows = scoped
    if (view === 'canDate') rows = rows.filter(r => CAN_DATE_BUCKETS.includes(r.bucket))
    else if (view === 'clc') rows = rows.filter(r => r.slow)
    else if (view !== 'all') rows = rows.filter(r => r.bucket === view)
    if (khoFilter !== 'all') rows = rows.filter(r => r.maKho === khoFilter)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => r.maVatTu.toLowerCase().includes(q) || r.tenVatTu.toLowerCase().includes(q) || r.maLo.toLowerCase().includes(q))
    }
    return [...rows].sort(byExpiry)
  }, [scoped, view, khoFilter, search])

  const columns = view === 'clc' ? CLC_COLUMNS : CAN_DATE_COLUMNS
  // Ô tích ở tiêu đề: tích/bỏ tích toàn bộ hàng đủ tiêu chí đang hiện trên bảng (theo tìm kiếm, lọc kho).
  const visibleEligible = filteredRows.filter(isEligible)
  const allVisibleChecked = visibleEligible.length > 0 && visibleEligible.every(r => checkedKeys.has(r.rowKey))
  const someVisibleChecked = visibleEligible.some(r => checkedKeys.has(r.rowKey))
  const toggleAllVisible = () => {
    const next = new Set(checkedKeys)
    for (const r of visibleEligible) {
      if (allVisibleChecked) next.delete(r.rowKey)
      else next.add(r.rowKey)
    }
    saveChecked(next)
  }
  const activeView = ['expired', 'near3', 'near6'].includes(view) ? 'canDate' : view

  // Hàng còn hạn dùng dưới 1 tháng (chưa hết hạn) — nguồn cho Biên bản Xử lý + Xác minh, tính từ toàn bộ file
  // Kho C (không phụ thuộc tab/tìm kiếm/lọc kho đang chọn trên bảng), vì biên bản hủy cần đủ toàn bộ hàng cận date
  // trong tháng. Biên bản hàng cận date là của Kho A (mã kho 020110, nằm ngoài các kho theo dõi) nên lấy từ TOÀN BỘ
  // file Kho C, không bị lọc theo kho theo dõi; Kho DTP không có biên bản này.
  const disposalRows = useMemo(() => {
    if (!rowsC) return []
    const today = new Date()
    return rowsC
      .filter(r => r.tonCuoi > 0)
      .map(r => ({ ...r, daysLeft: daysUntil(r.hanDung, today) }))
      .filter(r => r.daysLeft !== null && r.daysLeft >= 0 && r.daysLeft < DISPOSAL_DAYS_THRESHOLD)
  }, [rowsC])

  const handleExportDisposal = async () => {
    if (disposalRows.length === 0) return
    setExportingDisposal(true)
    setError('')
    try {
      await exportExpiryDisposal(disposalRows.map(r => ({
        maHang: r.maVatTu,
        tenHang: r.tenVatTu,
        soLo: r.maLo,
        hanDung: r.hanDung,
        dvt: r.dvt,
        soLuong: r.tonCuoi,
        maKho: r.maKho,
      })))
    } catch (err) {
      setError(err.message || 'Không xuất được biên bản hàng cận date.')
    } finally {
      setExportingDisposal(false)
    }
  }

  // Báo cáo xuất riêng từng loại kho (file Kho C, file Kho DTP), kèm cột "Hướng xử lý" đã điền.
  const handleExportReport = async (ent) => {
    setExportingReport(ent)
    setError('')
    try {
      const rows = reportRows.filter(r => r.entity === ent).map(r => ({ ...r, huongXuLy: notes[r.rowKey] || '' }))
      await exportStockReport({
        kind: isClc ? 'clc' : 'canDate',
        rows,
        dateRange: entries[ent]?.dateRange || null,
        suffix: ent === 'donDTP' ? 'KhoDTP' : 'KhoC',
      })
    } catch (err) {
      setError(err.message || 'Không xuất được báo cáo.')
    } finally {
      setExportingReport('')
    }
  }

  const slotInfo = {
    donC: 'Giữ kho 020101, 020102, 020105 (online miền Nam), 020106; các kho khác bị loại.',
    donDTP: 'Giữ kho 020105 (phần mềm riêng của Kho DTP, không liên quan kho 020105 của Kho C).',
  }
  const slots = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
      {ENTITY_KEYS.map(k => {
        const entry = entries[k]
        const label = EXPIRY_ENTITIES[k].label
        const kept = entry ? filterByExpiryEntity(entry.rows, k).filter(r => r.tonCuoi > 0).length : 0
        return (
          <div
            key={k}
            onDragOver={(e) => { e.preventDefault(); setDragging(k) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging('') }}
            onDrop={(e) => handleDrop(e, k)}
            className={`rounded-xl border p-3 flex flex-col gap-1.5 ${entry ? 'border-green-300 bg-green-50' : 'border-2 border-dashed border-gray-300 bg-gray-50'} ${dragging === k ? 'ring-2 ring-blue-400' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${ENTITY_BADGE[k]}`}>{label}</span>
              {entry ? (
                <>
                  <FileSpreadsheet size={14} className="text-green-600 shrink-0" />
                  <span className="text-sm text-green-700 font-medium truncate" title={entry.fileName}>{entry.fileName}</span>
                  <button onClick={() => removeEntry(entry)} className="ml-auto p-0.5 rounded hover:bg-green-100 text-green-500 hover:text-green-700" title={`Xoá dữ liệu ${label} của tháng này`}>
                    <X size={14} />
                  </button>
                </>
              ) : (
                <span className="text-sm text-gray-500">Chưa có file {label}</span>
              )}
            </div>
            {entry && (
              <div className="text-xs text-green-700">
                ✓ Đã nhận đúng {label} · {kept} mặt hàng còn tồn
                {entry.dateRange && <> · Kỳ báo cáo: {formatDateVi(entry.dateRange.tuNgay)} → {formatDateVi(entry.dateRange.denNgay)} ({entry.dateRange.soNgay} ngày)</>}
              </div>
            )}
            <div className="text-xs text-gray-400">{slotInfo[k]}</div>
            <div>
              <button
                type="button"
                onClick={() => inputRefs.current[k]?.click()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${entry ? 'bg-white border border-gray-200 text-gray-600 hover:border-blue-400 hover:text-blue-600' : 'bg-[#1e3a5f] text-white hover:bg-[#2a4d7a]'}`}
              >
                {dragging === k ? <FileUp size={14} /> : <Upload size={14} />}
                {entry ? 'Tải lại file' : `Tải file ${label}`}
              </button>
              <input
                ref={el => { inputRefs.current[k] = el }}
                type="file"
                accept=".xlsx,.xls,.xml"
                aria-label={`Tải file ${label}`}
                className="sr-only"
                onChange={e => { void parseFile(e.target.files[0], k); e.target.value = '' }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )

  const hint = (
    <p className="text-xs text-gray-400 mb-3">
      Mỗi tháng tải 2 file "Báo cáo tổng hợp nhập xuất tồn theo kho" (.xlsx / .xml): 1 file Kho C, 1 file Kho DTP. Mỗi tháng lưu riêng, tháng lấy theo ngày cuối kỳ báo cáo trong file ("đến ngày ..."), file tháng khác không đè lên nhau. App tự nhận file của kho nào và tự tìm hàng cận date lẫn hàng chậm luân chuyển, dùng chung cho cả 2 tab; nên xuất báo cáo với khoảng thời gian từ {MIN_SLOW_DAYS} ngày trở lên để lọc đúng hàng chậm luân chuyển.
    </p>
  )

  const monthBar = (
    <div className="flex flex-wrap items-center gap-1.5 mb-3">
      {periods.length > 0 && <span className="text-xs text-gray-500 mr-1">Tháng:</span>}
      {periods.map(p => (
        <button
          key={p}
          onClick={() => selectPeriod(p)}
          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
            p === period ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
          }`}
        >
          Tháng {periodLabel(p)}
        </button>
      ))}
      {periods.length > 0 && (
        <button
          type="button"
          onClick={() => { setPeriodSel(NEW_MONTH); setError(''); setKhoFilter('all') }}
          aria-pressed={isNewMonth}
          className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            isNewMonth ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          <Plus size={13} /> Xử lý tháng mới
        </button>
      )}
    </div>
  )

  if (periods.length === 0 || isNewMonth) {
    return (
      <div>
        {periods.length > 0 && monthBar}
        {isNewMonth && (
          <p className="mb-3 text-sm text-emerald-700">
            Đang xử lý tháng mới — tải file Kho C và Kho DTP của tháng này. Dữ liệu các tháng trước vẫn giữ nguyên, bấm nút tháng ở trên để xem lại.
          </p>
        )}
        {slots}
        {hint}
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
      </div>
    )
  }

  // Kỳ báo cáo dùng cho phần CLC: lấy kỳ ngắn nhất trong các file đang xem (thiếu kỳ ở file nào thì coi là chưa rõ).
  const ranges = shownEntries.map(e => e.dateRange || null)
  const dateRange = ranges.length > 0 && ranges.every(Boolean) ? ranges.reduce((a, b) => (b.soNgay < a.soNgay ? b : a)) : null
  const rangeTooShort = dateRange && dateRange.soNgay < MIN_SLOW_DAYS
  const exportEntities = ENTITY_KEYS.filter(k => entries[k] && (entSel === 'all' || entSel === k))

  return (
    <div>
      {monthBar}
      {slots}
      {hint}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label="Loại kho">
          {[['all', 'Tất cả'], ...ENTITY_KEYS.filter(k => entries[k]).map(k => [k, EXPIRY_ENTITIES[k].label])].map(([k, l]) => (
            <button key={k} type="button" onClick={() => { setEntSel(k); setKhoFilter('all') }} aria-pressed={entSel === k}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${entSel === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2 flex-wrap">
          {exportEntities.map(k => {
            const n = reportRows.filter(r => r.entity === k).length
            const total = eligibleRows.filter(r => r.entity === k).length
            const label = EXPIRY_ENTITIES[k].label
            return (
              <button
                key={k}
                onClick={() => void handleExportReport(k)}
                disabled={Boolean(exportingReport) || n === 0}
                title={n === 0
                  ? 'Tích chọn ở cột đầu bảng những hàng cần đưa vào báo cáo'
                  : `Xuất file báo cáo ${label} đúng mẫu ${isClc ? 'sheet CLC' : 'sheet Cận date'}, gồm các hàng đã tích và cột Hướng xử lý`}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm font-medium hover:bg-[#2a4d7a] transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <FileDown size={15} />
                {exportingReport === k ? 'Đang tạo báo cáo...' : `${isClc ? 'Xuất báo cáo hàng CLC' : 'Xuất báo cáo hàng cận date'} · ${label} (${n}/${total})`}
              </button>
            )
          })}
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {!isClc && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {CAN_DATE_CARDS.map(b => {
          const Icon = b.icon
          const isActive = view === b.key
          return (
            <button
              key={b.key}
              onClick={() => setView(isActive ? 'canDate' : b.key)}
              className={`flex items-center gap-3 rounded-xl border p-3.5 text-left transition-colors ${isActive ? b.bgActive : b.bg} hover:brightness-95`}
            >
              <Icon size={20} className={`${b.cls} shrink-0`} />
              <div>
                <div className={`text-xl font-bold ${b.cls}`}>{counts[b.key].toLocaleString('vi-VN')}</div>
                <div className="text-xs text-gray-600">{b.label}</div>
              </div>
            </button>
          )
        })}
      </div>}

      {isClc && (
        <div className={`flex items-start gap-2.5 mb-4 px-3.5 py-3 rounded-xl border text-sm ${!dateRange || rangeTooShort ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-indigo-50 border-indigo-200 text-indigo-800'}`}>
          {!dateRange || rangeTooShort ? <TriangleAlert size={17} className="shrink-0 mt-0.5" /> : <Hourglass size={17} className="shrink-0 mt-0.5" />}
          {dateRange ? (
            <p>
              <span className="font-semibold">{counts.clc.toLocaleString('vi-VN')} mặt hàng chậm luân chuyển.</span>{' '}
              File báo cáo khoảng <span className="font-semibold">{formatDateVi(dateRange.tuNgay)} → {formatDateVi(dateRange.denNgay)}</span> ({dateRange.soNgay} ngày)
              {rangeTooShort ? (
                <> — <span className="font-semibold">chưa đủ {MIN_SLOW_DAYS} ngày</span>, danh sách bên dưới có thể chưa phản ánh đúng "chậm luân chuyển". Nên xuất lại báo cáo với khoảng thời gian dài hơn.</>
              ) : (
                <> — hàng bên dưới còn tồn kho và không có phát sinh nhập/xuất trong suốt khoảng này.</>
              )}
            </p>
          ) : (
            <p><span className="font-semibold">{counts.clc.toLocaleString('vi-VN')} mặt hàng chậm luân chuyển.</span> Không có khoảng thời gian báo cáo (dòng "Từ ngày ... đến ngày ...") cho tháng này — file tải lên trước đây chưa lưu thông tin này. Tải lại file để có kỳ báo cáo cho phần CLC và dòng 2 của báo cáo xuất ra.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3 items-center">
        {!isClc && <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1">
          {CAN_DATE_VIEWS.map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${activeView === v.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {v.label}
            </button>
          ))}
        </div>}
        <div className="relative flex-1 min-w-48 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Tìm mã hàng, tên hàng, mã lô..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {khoOptions.length > 1 && (
          <select
            value={khoFilter}
            onChange={e => setKhoFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            <option value="all">Tất cả kho</option>
            {khoOptions.map(k => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <span className="text-xs text-gray-400 whitespace-nowrap">{filteredRows.length} dòng</span>
        <span className="text-xs font-medium text-[#1e3a5f] whitespace-nowrap">Đã tích {reportRows.length}/{eligibleRows.length} hàng đưa vào báo cáo</span>
        <button
          onClick={resetColWidths}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors ml-auto"
          title="Đặt lại độ rộng cột về mặc định"
        >
          Đặt lại độ rộng cột
        </button>
        <button
          onClick={() => exportRowsToExcel(filteredRows, period, view)}
          disabled={filteredRows.length === 0}
          title="Xuất nhanh danh sách đang xem trên màn hình"
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-green-400 hover:text-green-600 text-gray-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <Download size={14} />
          Xuất Excel
        </button>
        {!isClc && entries.donC && <button
          onClick={() => void handleExportDisposal()}
          disabled={disposalRows.length === 0 || exportingDisposal}
          title="Xuất Biên bản Xử lý (Excel) + Biên bản Xác minh (Word) cho hàng còn hạn dùng dưới 1 tháng"
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-red-400 hover:text-red-600 text-gray-600 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <FileWarning size={14} />
          {exportingDisposal ? 'Đang tạo biên bản...' : `Xuất biên bản hàng cận date (${disposalRows.length})`}
        </button>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: CHECK_COL_WIDTH + columns.reduce((sum, c) => sum + colWidths[c], 0), minWidth: '100%' }}>
          <thead>
            <tr className="bg-[#1e3a5f] text-white text-xs">
              <th className="px-2 py-2.5 text-center" style={{ width: CHECK_COL_WIDTH }}>
                <input
                  type="checkbox"
                  aria-label="Tích tất cả hàng đang hiện để đưa vào báo cáo"
                  title="Tích / bỏ tích tất cả hàng đủ tiêu chí đang hiện trên bảng"
                  className="w-4 h-4 cursor-pointer accent-emerald-500 align-middle"
                  checked={allVisibleChecked}
                  ref={el => { if (el) el.indeterminate = !allVisibleChecked && someVisibleChecked }}
                  disabled={visibleEligible.length === 0}
                  onChange={toggleAllVisible}
                />
              </th>
              {columns.map(c => (
                <th
                  key={c}
                  className={`px-3 py-2.5 font-semibold whitespace-nowrap relative ${NUMERIC_COLUMNS.has(c) || c === 'Đvt' ? 'text-center' : 'text-left'}`}
                  style={{ width: colWidths[c] }}
                >
                  {c}
                  <ResizeHandle colKey={c} setWidth={setColWidth} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="text-center py-10 text-gray-400">
                  <div className="flex flex-col items-center gap-2">
                    <PackageSearch size={24} className="text-gray-300" />
                    Không có dữ liệu phù hợp
                  </div>
                </td>
              </tr>
            ) : filteredRows.map((r, i) => (
              <tr key={r.rowKey} className={`border-b border-gray-100 text-[12px] hover:bg-blue-50/40 ${checkedKeys.has(r.rowKey) && isEligible(r) ? 'bg-emerald-50/60' : ''}`}>
                <td className="px-2 py-2 text-center">
                  {isEligible(r) && (
                    <input
                      type="checkbox"
                      aria-label={`Đưa ${r.maVatTu} lô ${r.maLo || '—'} vào báo cáo`}
                      className="w-4 h-4 cursor-pointer accent-emerald-500 align-middle"
                      checked={checkedKeys.has(r.rowKey)}
                      onChange={() => toggleRow(r.rowKey)}
                    />
                  )}
                </td>
                {columns.map(c => {
                  if (c === 'Loại') {
                    return (
                      <td key={c} className="px-2 py-2">
                        <span className={`px-2 py-0.5 rounded border text-[11px] font-semibold ${ENTITY_BADGE[r.entity]}`}>{EXPIRY_ENTITIES[r.entity]?.label}</span>
                      </td>
                    )
                  }
                  if (c === 'Hướng xử lý') {
                    return (
                      <td key={c} className="px-1.5 py-1" style={{ maxWidth: 0 }}>
                        <input
                          type="text"
                          aria-label={`Hướng xử lý ${r.maVatTu} lô ${r.maLo || '—'}`}
                          className="w-full px-2 py-1 border border-amber-200 bg-amber-50 rounded text-[12px] focus:outline-none focus:ring-2 focus:ring-amber-300"
                          placeholder="Nhập hướng xử lý..."
                          value={notes[r.rowKey] || ''}
                          onChange={e => setNote(r.rowKey, e.target.value)}
                        />
                      </td>
                    )
                  }
                  const isAge = c === 'Tuổi thuốc (Tháng)'
                  const align = NUMERIC_COLUMNS.has(c) || c === 'Đvt' ? 'text-center' : ''
                  const mono = c === 'Mã vật tư' || c === 'Mã lô' || c === 'Tên lô' ? 'font-mono' : ''
                  const emphasis = c === 'Tồn cuối' ? 'font-medium' : isAge ? AGE_CLASS[r.bucket] || 'text-gray-600' : ''
                  return (
                    <td
                      key={c}
                      className={`px-3 py-2 ${align} ${mono} ${emphasis}`}
                      style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={isAge ? ageTitle(r.daysLeft) : undefined}
                    >
                      {cellValue(c, r, i)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
