import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Upload, FileUp, FileSpreadsheet, X, CheckCircle, Clock, RotateCcw, XCircle, Truck, Search, List, ChevronDown, ChevronUp, AlertTriangle, Package } from 'lucide-react'
import { parseCarrierFile, computeCarrierStats, getCarrierColumns, buildInternalOrderLookup, buildTrackingSet, reconcileViettelOrders, isHoldStatusRow, getTrackingCode } from '../utils/parseCarrierExport'
import * as XLSX from 'xlsx'
import { ColumnFilter, ResizeHandle } from './DataTable'

const STAT_CARDS = [
  { key: '24h',          label: '≤ 24 giờ',        icon: CheckCircle, cls: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  { key: '48h',          label: '≤ 48 giờ',        icon: CheckCircle, cls: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200' },
  { key: '72h',          label: '≤ 72 giờ',        icon: Clock,       cls: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'dangVanChuyen',label: 'Đang vận chuyển', icon: Truck,       cls: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  { key: 'choLay',       label: 'Chờ lấy',         icon: Package,     cls: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  { key: 'giaoLai',      label: 'Giao lại lần 2',  icon: RotateCcw,   cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  { key: 'hoanHang',     label: 'Hoàn hàng',       icon: XCircle,     cls: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
]

// ---- Lưu trữ dữ liệu upload theo TỪNG TUẦN, cố định/không bị ghi đè khi upload file mới ----
// carrier_weeks_${carrierKey} = [{ id, fileName, uploadedAt, rows }, ...] (mới nhất ở đầu)

function readCarrierWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_weeks_${carrierKey}`) || 'null')
    if (Array.isArray(weeks)) return weeks
    // Di chuyển dữ liệu cũ (định dạng 1 file duy nhất) sang định dạng nhiều tuần, giữ nguyên số liệu cũ
    const legacy = JSON.parse(localStorage.getItem(`carrier_data_${carrierKey}`) || 'null')
    if (legacy) {
      const migrated = [{ id: legacy.uploadedAt || String(Date.now()), fileName: legacy.fileName, uploadedAt: legacy.uploadedAt, rows: legacy.rows }]
      localStorage.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify(migrated))
      return migrated
    }
    return []
  } catch {
    return []
  }
}

function writeCarrierWeeks(carrierKey, weeks) {
  localStorage.setItem(`carrier_weeks_${carrierKey}`, JSON.stringify(weeks))
}

// Thêm 1 tuần upload mới — KHÔNG ghi đè các tuần cũ
export function addCarrierWeek(carrierKey, entry) {
  const weeks = readCarrierWeeks(carrierKey)
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  const next = [withId, ...weeks]
  writeCarrierWeeks(carrierKey, next)
  localStorage.setItem(`carrier_active_${carrierKey}`, withId.id)
  return withId
}

// Xoá 1 tuần cụ thể (không ảnh hưởng các tuần khác)
export function removeCarrierWeek(carrierKey, weekId) {
  const weeks = readCarrierWeeks(carrierKey).filter(w => w.id !== weekId)
  writeCarrierWeeks(carrierKey, weeks)
  const activeId = localStorage.getItem(`carrier_active_${carrierKey}`)
  if (activeId === weekId) {
    if (weeks[0]) localStorage.setItem(`carrier_active_${carrierKey}`, weeks[0].id)
    else localStorage.removeItem(`carrier_active_${carrierKey}`)
  }
}

// ---- Loại trừ theo "Tên hàng" — áp dụng chung cho carrier (không riêng theo tuần), vì đây là quy tắc
// phân loại sản phẩm (vd voucher, quà tặng...) chứ không phải số liệu upload ----
export function readExcludedTenHang(carrierKey) {
  try { return JSON.parse(localStorage.getItem(`carrier_exclude_tenhang_${carrierKey}`) || '[]') } catch { return [] }
}
export function writeExcludedTenHang(carrierKey, list) {
  localStorage.setItem(`carrier_exclude_tenhang_${carrierKey}`, JSON.stringify(list))
}
function filterExcludedRows(rows, carrierKey) {
  const excluded = readExcludedTenHang(carrierKey)
  if (excluded.length === 0) return rows
  const excludedSet = new Set(excluded)
  return rows.filter(r => !excludedSet.has((r['Tên hàng'] || '').trim()))
}

// ---- File đối chiếu "Chờ giao Logistics" — dùng để xác nhận đơn "Đang lấy hàng" có thật đang xử lý không.
// Mỗi lần upload là 1 tuần độc lập, KHÔNG ghi đè tuần cũ (giống dữ liệu carrier chính) ----
export function readHoldWeeks(carrierKey) {
  try {
    const weeks = JSON.parse(localStorage.getItem(`carrier_holdweeks_${carrierKey}`) || '[]')
    return Array.isArray(weeks) ? weeks : []
  } catch {
    return []
  }
}
export function addHoldWeek(carrierKey, entry) {
  const weeks = readHoldWeeks(carrierKey)
  const withId = { id: entry.uploadedAt || String(Date.now()), ...entry }
  const next = [withId, ...weeks]
  localStorage.setItem(`carrier_holdweeks_${carrierKey}`, JSON.stringify(next))
  return withId
}
export function removeHoldWeek(carrierKey, weekId) {
  const next = readHoldWeeks(carrierKey).filter(w => w.id !== weekId)
  localStorage.setItem(`carrier_holdweeks_${carrierKey}`, JSON.stringify(next))
}
// Gộp mã tracking từ TOÀN BỘ các tuần đã upload (tích luỹ dần) để đối chiếu
function getHoldLookupSet(carrierKey) {
  const weeks = readHoldWeeks(carrierKey)
  if (weeks.length === 0) return null
  const set = new Set()
  for (const w of weeks) for (const code of buildTrackingSet(w.rows, 'Mã vận đơn VT')) set.add(code)
  return set
}

function buildStatsForWeek(entry, carrierKey, carrierType, internalData) {
  if (!entry) return null
  const lookupMap = buildInternalOrderLookup(internalData)
  const holdLookupSet = getHoldLookupSet(carrierKey)
  const effectiveRows = filterExcludedRows(entry.rows, carrierKey)
  const stats = computeCarrierStats(effectiveRows, carrierType, lookupMap, holdLookupSet)

  return {
    weekId: entry.id,
    fileName: entry.fileName,
    uploadedAt: entry.uploadedAt,
    stats,
    total: stats['24h'] + stats['48h'] + stats['72h'] + stats.dangVanChuyen + stats.giaoLai + stats.hoanHang + stats.choLay,
  }
}

// Đọc nhanh toàn bộ thống kê (24h/48h/72h/đang vận chuyển/giao lại/hoàn hàng) theo tuần đang chọn (mặc định: tuần mới nhất)
export function getCarrierFileStats(carrierKey, carrierType, internalData, weekId) {
  try {
    const weeks = readCarrierWeeks(carrierKey)
    if (weeks.length === 0) return null
    const entry = weekId ? weeks.find(w => w.id === weekId) : weeks[0]
    return buildStatsForWeek(entry, carrierKey, carrierType, internalData)
  } catch {
    return null
  }
}

// Giữ tương thích ngược — chỉ lấy tổng đơn (tuần mới nhất)
export function getCarrierFileTotal(carrierKey, carrierType, internalData) {
  return getCarrierFileStats(carrierKey, carrierType, internalData)
}

// Danh sách rút gọn các tuần đã upload (không kèm rows) — dùng cho UI chọn tuần thủ công ở nơi khác (vd Tổng đơn)
export function getCarrierWeeksList(carrierKey) {
  return readCarrierWeeks(carrierKey).map(w => ({ id: w.id, fileName: w.fileName, uploadedAt: w.uploadedAt }))
}

// So sánh tuần mới nhất vs tuần trước đó cho 1 carrier
export function getCarrierHistoryCompare(carrierKey, carrierType, internalData) {
  try {
    const weeks = readCarrierWeeks(carrierKey)
    return {
      current: buildStatsForWeek(weeks[0], carrierKey, carrierType, internalData),
      previous: buildStatsForWeek(weeks[1], carrierKey, carrierType, internalData),
    }
  } catch {
    return { current: null, previous: null }
  }
}

function ReconcilePanel({ vtpRows, internalData }) {
  const [open, setOpen] = useState(false)
  const result = useMemo(() => reconcileViettelOrders(vtpRows, internalData), [vtpRows, internalData])

  if (internalData.length === 0) return null
  const isMatched = result.missingInVtp.length === 0 && result.extraInVtp.length === 0

  return (
    <div className={`rounded-xl border p-3 mb-4 ${isMatched ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 text-left">
        {isMatched
          ? <CheckCircle size={16} className="text-green-600 flex-shrink-0" />
          : <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />}
        <span className={`text-sm font-medium ${isMatched ? 'text-green-800' : 'text-amber-800'}`}>
          {isMatched
            ? `Khớp hoàn toàn: ${result.internalTotal} đơn nội bộ ↔ ${result.vtpUniqueCodes} mã trong file VTP`
            : `Lệch dữ liệu: ${result.internalTotal} đơn nội bộ, ${result.vtpUniqueCodes} mã VTP — ${result.missingInVtp.length} đơn chưa thấy trong VTP, ${result.extraInVtp.length} mã VTP không khớp nội bộ`}
        </span>
        {(open ? <ChevronUp size={15} className="ml-auto text-gray-400" /> : <ChevronDown size={15} className="ml-auto text-gray-400" />)}
      </button>

      {open && !isMatched && (
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {result.missingInVtp.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">
                Đơn nội bộ chưa thấy trong file VTP ({result.missingInVtp.length})
              </p>
              <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-amber-100 p-2">
                {result.missingInVtp.map(({ code, row }) => (
                  <div key={code} className="text-xs text-gray-600 py-0.5 border-b border-gray-50 last:border-0">
                    <span className="font-mono text-gray-800">{code}</span>
                    {row['Tên khách hàng'] && <span className="text-gray-400"> — {row['Tên khách hàng']}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {result.extraInVtp.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-amber-700 mb-1">
                Mã VTP không khớp đơn nội bộ ({result.extraInVtp.length})
              </p>
              <div className="max-h-40 overflow-y-auto bg-white rounded-lg border border-amber-100 p-2">
                {result.extraInVtp.map(code => (
                  <div key={code} className="text-xs font-mono text-gray-600 py-0.5 border-b border-gray-50 last:border-0">{code}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 'all']
const DEFAULT_COL_WIDTH = {
  'Mã Vận Đơn': 130, 'Mã đơn hàng': 130, 'Ngày tạo': 140, 'Người nhận': 200, 'Địa chỉ nhận': 260,
  'ĐT Nhận': 140, 'Tên hàng': 180, 'Trạng Thái': 130, 'Lý do': 200, 'Đơn chuyển hoàn': 110, 'Ngày chuyển trạng thái': 150,
  'Mã vận đơn': 150, 'Thời gian tạo đơn': 140, 'Thời gian giao hàng': 140, 'Trạng thái hiện tại': 150,
  'Tên người nhận': 160, 'Số điện thoại người nhận': 140, 'Mã khách hàng': 140,
  'Thu COD (Có/Không)': 130, 'Số tiền COD': 120, 'Giá trị đơn hàng': 130,
}

// Ghi chú tay theo từng mã vận đơn (dùng để theo dõi các đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics)
function useHoldNotes(carrierKey) {
  const lsKey = `carrier_hold_notes_${carrierKey}`
  const [notes, setNotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || '{}') } catch { return {} }
  })
  const setNote = (code, text) => {
    const next = { ...notes, [code]: text }
    if (!text) delete next[code]
    setNotes(next)
    localStorage.setItem(lsKey, JSON.stringify(next))
  }
  return [notes, setNote]
}

function useColWidths(storageKey, columns) {
  const lsKey = `carrier_colwidths_${storageKey}`
  const init = () => {
    const defaults = Object.fromEntries(columns.map(c => [c, DEFAULT_COL_WIDTH[c] ?? 120]))
    try {
      const saved = JSON.parse(localStorage.getItem(lsKey) || '{}')
      return { ...defaults, ...saved }
    } catch {
      return defaults
    }
  }
  const [widths, setWidths] = useState(init)
  const setWidth = (key, w) => setWidths(prev => {
    const next = { ...prev, [key]: Math.max(60, w) }
    localStorage.setItem(lsKey, JSON.stringify(next))
    return next
  })
  return [widths, setWidth]
}

export function CarrierPanel({ carrierKey, label, carrierType = 'viettel', internalData = [] }) {
  const TABLE_COLUMNS = getCarrierColumns(carrierType)
  const lookupMap = useMemo(() => buildInternalOrderLookup(internalData), [internalData])
  const inputRef = useRef()
  const holdInputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [holdNotes, setHoldNote] = useHoldNotes(carrierKey)

  // File đối chiếu "Chờ giao Logistics" — xác nhận đơn "Đang lấy hàng" có đang thực sự xử lý không.
  // Mỗi lần upload là 1 tuần độc lập, không ghi đè — mã tracking được gộp từ TẤT CẢ các tuần đã upload để đối chiếu.
  const [holdWeeks, setHoldWeeks] = useState(() => readHoldWeeks(carrierKey))
  const holdLookupSet = useMemo(() => {
    if (holdWeeks.length === 0) return null
    const set = new Set()
    for (const w of holdWeeks) for (const code of buildTrackingSet(w.rows, 'Mã vận đơn VT')) set.add(code)
    return set
  }, [holdWeeks])

  const parseHoldFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false })
        addHoldWeek(carrierKey, { fileName: file.name, uploadedAt: new Date().toISOString(), rows })
        setHoldWeeks(readHoldWeeks(carrierKey))
      } catch {
        setError('Không đọc được file Chờ giao Logistics. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const removeHoldWeekEntry = (weekId) => {
    removeHoldWeek(carrierKey, weekId)
    setHoldWeeks(readHoldWeeks(carrierKey))
  }

  const [weeks, setWeeks] = useState(() => readCarrierWeeks(carrierKey))
  const [activeWeekId, setActiveWeekId] = useState(() => {
    const saved = localStorage.getItem(`carrier_active_${carrierKey}`)
    const list = readCarrierWeeks(carrierKey)
    return (saved && list.some(w => w.id === saved)) ? saved : (list[0]?.id || null)
  })
  const state = weeks.find(w => w.id === activeWeekId) || null

  const selectWeek = (id) => {
    setActiveWeekId(id)
    localStorage.setItem(`carrier_active_${carrierKey}`, id)
  }

  const [colFilters, setColFilters] = useState({})
  const [pageSize, setPageSize] = useState(50)
  const [tableExpanded, setTableExpanded] = useState(false)
  const [colWidths, setColWidth] = useColWidths(carrierKey, TABLE_COLUMNS)
  const minTableWidthRef = useRef(0)

  const NOTE_COL_WIDTH = 220
  // Đối chiếu "Chờ giao Logistics" chỉ áp dụng cho Đơn DTP — Đơn C không cần kiểm tra mục này
  const showNoteCol = carrierType === 'viettel' && carrierKey.startsWith('donDTP')
  const totalTableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0) + (showNoteCol ? NOTE_COL_WIDTH : 0)
  minTableWidthRef.current = Math.max(minTableWidthRef.current, totalTableWidth)
  const stableWidth = minTableWidthRef.current

  const topScrollRef = useRef()
  const tableScrollRef = useRef()
  const bottomScrollRef = useRef()
  const [showBottomScroll, setShowBottomScroll] = useState(false)

  const syncScrollLeft = useCallback((sourceRef, ...targetRefs) => {
    for (const ref of targetRefs) {
      if (ref.current && ref.current.scrollLeft !== sourceRef.current.scrollLeft) {
        ref.current.scrollLeft = sourceRef.current.scrollLeft
      }
    }
  }, [])
  const syncFromTop = useCallback(() => syncScrollLeft(topScrollRef, tableScrollRef, bottomScrollRef), [syncScrollLeft])
  const syncFromTable = useCallback(() => syncScrollLeft(tableScrollRef, topScrollRef, bottomScrollRef), [syncScrollLeft])
  const syncFromBottom = useCallback(() => syncScrollLeft(bottomScrollRef, topScrollRef, tableScrollRef), [syncScrollLeft])

  useEffect(() => {
    const el = tableScrollRef.current
    if (!el || !tableExpanded) { setShowBottomScroll(false); return }
    const update = () => setShowBottomScroll(el.scrollWidth > el.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [tableExpanded, stableWidth])

  const setColFilter = (key, vals) => setColFilters(f => ({ ...f, [key]: vals }))

  // Mỗi lần upload tạo 1 tuần dữ liệu MỚI, độc lập — không ghi đè tuần đã có trước đó
  const parseFile = (file) => {
    setError('')
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const rows = parseCarrierFile(e.target.result, carrierType)
        if (rows.length === 0) { setError('Không tìm thấy dữ liệu đơn hàng trong file.'); return }
        const entry = addCarrierWeek(carrierKey, { fileName: file.name, uploadedAt: new Date().toISOString(), rows })
        setWeeks(readCarrierWeeks(carrierKey))
        setActiveWeekId(entry.id)
      } catch (err) {
        setError(err.message || 'Không đọc được file. Vui lòng kiểm tra lại.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    parseFile(e.dataTransfer.files[0])
  }

  // Xoá HẲN tuần đang xem — các tuần khác không bị ảnh hưởng
  const removeActiveWeek = () => {
    if (!state) return
    if (!window.confirm(`Xoá dữ liệu tuần "${state.fileName}"? Các tuần khác vẫn được giữ nguyên.`)) return
    removeCarrierWeek(carrierKey, state.id)
    const next = readCarrierWeeks(carrierKey)
    setWeeks(next)
    setActiveWeekId(next[0]?.id || null)
  }

  // Loại trừ theo "Tên hàng" (vd voucher, quà tặng...) khỏi thống kê — áp dụng chung cho carrier này
  const [excludedNames, setExcludedNames] = useState(() => readExcludedTenHang(carrierKey))
  const hasTenHang = TABLE_COLUMNS.includes('Tên hàng')

  const toggleExclude = (name) => {
    const next = excludedNames.includes(name) ? excludedNames.filter(n => n !== name) : [...excludedNames, name]
    setExcludedNames(next)
    writeExcludedTenHang(carrierKey, next)
  }

  const effectiveRows = useMemo(() => {
    if (!state) return []
    if (!hasTenHang || excludedNames.length === 0) return state.rows
    const excludedSet = new Set(excludedNames)
    return state.rows.filter(r => !excludedSet.has((r['Tên hàng'] || '').trim()))
  }, [state, excludedNames, hasTenHang])

  const stats = useMemo(() => state ? computeCarrierStats(effectiveRows, carrierType, lookupMap, holdLookupSet) : null, [state, effectiveRows, carrierType, lookupMap, holdLookupSet])

  // Đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics — cần kiểm tra tay
  const [onlyUnmatched, setOnlyUnmatched] = useState(false)
  const unmatchedRows = useMemo(() => {
    if (!state || !showNoteCol) return []
    return state.rows.filter(row => isHoldStatusRow(row, carrierType) && !holdLookupSet?.has(getTrackingCode(row, carrierType)))
  }, [state, carrierType, holdLookupSet, showNoteCol])

  const activeFilters = Object.entries(colFilters).filter(([, v]) => v?.length > 0)

  const filteredRows = useMemo(() => {
    if (!state) return []
    const q = search.toLowerCase()
    const base = onlyUnmatched ? unmatchedRows : state.rows
    return base.filter(row => {
      for (const [key, vals] of activeFilters) {
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [state, search, activeFilters, onlyUnmatched, unmatchedRows])

  // Dữ liệu dùng để tính option cho từng cột: áp dụng mọi filter khác, trừ filter của chính cột đó (lọc liên động)
  const dataForColumn = useCallback((excludeKey) => {
    if (!state) return []
    const q = search.toLowerCase()
    return (onlyUnmatched ? unmatchedRows : state.rows).filter(row => {
      for (const [key, vals] of activeFilters) {
        if (key === excludeKey) continue
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [state, search, activeFilters, onlyUnmatched, unmatchedRows])

  if (!state) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false) }}
          onDrop={handleDrop}
          onClick={() => inputRef.current.click()}
          className={`flex flex-col items-center justify-center gap-3 w-full h-48 rounded-2xl border-2 border-dashed cursor-pointer transition-all select-none
            ${dragging ? 'border-blue-500 bg-blue-50 scale-[1.01]' : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50/30'}`}
        >
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${dragging ? 'bg-blue-100' : 'bg-gray-100'}`}>
            {dragging ? <FileUp size={24} className="text-blue-500" /> : <Upload size={24} className="text-gray-400" />}
          </div>
          <div className="text-center">
            <p className="text-gray-700 font-semibold text-sm">Kéo & thả file xuất {label} vào đây</p>
            <p className="text-gray-400 text-xs mt-1">hoặc <span className="text-blue-600 underline font-medium">click để chọn file .xlsx</span></p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
      </div>
    )
  }

  const effectiveTotal = stats['24h'] + stats['48h'] + stats['72h'] + stats.dangVanChuyen + stats.giaoLai + stats.hoanHang + stats.choLay

  return (
    <div>
      {weeks.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-xs text-gray-400 mr-1">Tuần dữ liệu:</span>
          {weeks.map((w, i) => (
            <button
              key={w.id}
              onClick={() => selectWeek(w.id)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                w.id === activeWeekId
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
              title={w.fileName}
            >
              {i === 0 ? 'Mới nhất' : `Tuần trước ×${i}`} · {new Date(w.uploadedAt).toLocaleDateString('vi-VN')}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        {STAT_CARDS.map(c => {
          const Icon = c.icon
          return (
            <div key={c.key} className={`rounded-xl border p-3 ${c.bg} text-center`}>
              <Icon size={16} className={`${c.cls} mx-auto mb-1`} />
              <div className={`text-xl font-bold ${c.cls}`}>{stats[c.key]}</div>
              <div className="text-xs text-gray-500 mt-0.5 leading-tight">{c.label}</div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
          <FileSpreadsheet size={15} className="text-green-600 flex-shrink-0" />
          <span className="text-green-700 font-medium truncate max-w-72">{state.fileName}</span>
          <span className="text-green-500 text-xs">({effectiveTotal} đơn, {state.rows.length} dòng)</span>
          <button onClick={removeActiveWeek} className="ml-1 p-0.5 rounded hover:bg-green-100 text-green-400 hover:text-green-700" title="Xoá hẳn dữ liệu tuần này (các tuần khác không bị ảnh hưởng)">
            <X size={14} />
          </button>
        </div>
        <button
          onClick={() => inputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload tuần mới
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
        <span className="text-xs text-gray-400">Cập nhật: {new Date(state.uploadedAt).toLocaleString('vi-VN')}</span>
      </div>

      {showNoteCol && (
        <div className="mb-5">
          <div className="flex items-center gap-2 flex-wrap">
            {holdWeeks.length === 0 && (
              <span className="text-xs text-gray-400">Chưa có file "Chờ giao Logistics" để đối chiếu đơn "Đang lấy hàng"</span>
            )}
            <button
              onClick={() => holdInputRef.current.click()}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
            >
              <Upload size={14} />
              Upload tuần Chờ giao Logistics
            </button>
            <input ref={holdInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseHoldFile(e.target.files[0])} />
            {holdWeeks.length > 0 && (
              <span className="text-xs text-gray-400">Tổng {holdLookupSet.size} mã đối chiếu từ {holdWeeks.length} tuần đã upload</span>
            )}
            {holdWeeks.length > 0 && (
              unmatchedRows.length > 0 ? (
                <button
                  onClick={() => { setOnlyUnmatched(true); setTableExpanded(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600 hover:bg-red-100 transition-colors"
                >
                  <AlertTriangle size={14} />
                  Xem {unmatchedRows.length} đơn chưa khớp
                </button>
              ) : (
                <span className="flex items-center gap-1.5 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm text-green-600">
                  <CheckCircle size={14} />
                  0 đơn chưa khớp
                </span>
              )
            )}
          </div>
          {holdWeeks.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {holdWeeks.map(w => (
                <span key={w.id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                  <FileSpreadsheet size={12} />
                  <span className="max-w-48 truncate" title={w.fileName}>{w.fileName}</span>
                  <span className="text-blue-400">· {new Date(w.uploadedAt).toLocaleDateString('vi-VN')}</span>
                  <button onClick={() => removeHoldWeekEntry(w.id)} className="ml-0.5 text-blue-400 hover:text-red-500" title="Xoá tuần này">
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => setTableExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors text-left"
      >
        <List size={15} className="text-gray-500" />
        <span className="font-medium text-gray-700 text-sm">Danh sách chi tiết</span>
        {tableExpanded ? <ChevronUp size={15} className="text-gray-400 ml-auto" /> : <ChevronDown size={15} className="text-gray-400 ml-auto" />}
      </button>

      {tableExpanded && (
        <div className="mt-3">
          {onlyUnmatched && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              <AlertTriangle size={14} />
              Đang chỉ hiện {unmatchedRows.length} đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics
              <button onClick={() => setOnlyUnmatched(false)} className="ml-auto flex items-center gap-1 text-red-500 hover:text-red-700 font-medium">
                <X size={13} /> Bỏ lọc
              </button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 mb-3 items-center">
            <div className="relative flex-1 min-w-48 max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="Tìm mã vận đơn, người nhận..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">
              {activeFilters.length > 0 || search || onlyUnmatched ? `${filteredRows.length}/${state.rows.length} dòng (đã lọc)` : `${state.rows.length} dòng`}
            </span>
            <div className="flex items-center gap-1.5 text-sm text-gray-500">
              <span>Hiển thị</span>
              <select
                value={pageSize}
                onChange={e => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n === 'all' ? 'Tất cả' : `${n} dòng`}</option>)}
              </select>
            </div>
          </div>

          {/* Thanh scroll trên đầu */}
          <div
            ref={topScrollRef}
            onScroll={syncFromTop}
            style={{ overflowX: 'scroll', overflowY: 'hidden', height: 16, marginBottom: 4 }}
          >
            <div style={{ height: 1, width: stableWidth }} />
          </div>

          <div ref={tableScrollRef} onScroll={syncFromTable} className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
            <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: stableWidth, minWidth: '100%' }}>
              <thead>
                <tr className="bg-[#1e3a5f] text-white text-xs">
                  {TABLE_COLUMNS.map(c => (
                    <th key={c} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border border-white/20 relative" style={{ width: colWidths[c] }}>
                      <span className={colFilters[c]?.length > 0 ? 'text-yellow-300' : 'text-white'}>{c}</span>
                      <ColumnFilter
                        colKey={c}
                        data={dataForColumn(c)}
                        selected={colFilters[c] || []}
                        onChange={vals => setColFilter(c, vals)}
                      />
                      <ResizeHandle colKey={c} setWidth={setColWidth} />
                    </th>
                  ))}
                  {showNoteCol && (
                    <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap border border-white/20" style={{ width: NOTE_COL_WIDTH }}>
                      Ghi chú
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={TABLE_COLUMNS.length + (showNoteCol ? 1 : 0)} className="text-center py-10 text-gray-400">Không có dữ liệu</td></tr>
                ) : (pageSize === 'all' ? filteredRows : filteredRows.slice(0, pageSize)).map((row, i) => {
                  const tenHang = (row['Tên hàng'] || '').trim()
                  const isExcludedRow = hasTenHang && excludedNames.includes(tenHang)
                  const code = showNoteCol ? getTrackingCode(row, carrierType) : null
                  const isUnmatchedHold = showNoteCol && isHoldStatusRow(row, carrierType) && !holdLookupSet?.has(code)
                  return (
                    <tr
                      key={i}
                      className={`border-b border-gray-100 text-[12px] ${
                        isExcludedRow ? 'opacity-40 hover:bg-blue-50/40'
                        : isUnmatchedHold ? 'bg-red-50 hover:bg-red-100'
                        : 'hover:bg-blue-50/40'
                      }`}
                      title={isUnmatchedHold ? 'Đơn "Đang lấy hàng" chưa khớp file Chờ giao Logistics — cần kiểm tra' : undefined}
                    >
                      {TABLE_COLUMNS.map(c => {
                        const isTenHangCol = c === 'Tên hàng'
                        return (
                          <td
                            key={c}
                            onClick={isTenHangCol && tenHang ? () => toggleExclude(tenHang) : undefined}
                            className={`px-3 py-2 border border-gray-200 ${isTenHangCol && tenHang ? 'cursor-pointer hover:bg-red-50' : ''}`}
                            style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={isTenHangCol && tenHang ? 'Bấm để loại trừ/khôi phục các đơn cùng "Tên hàng" khỏi thống kê' : undefined}
                          >
                            {row[c] || '—'}
                          </td>
                        )
                      })}
                      {showNoteCol && (
                        <td className="px-2 py-1 border border-gray-200">
                          <input
                            type="text"
                            value={holdNotes[code] || ''}
                            onChange={e => setHoldNote(code, e.target.value)}
                            placeholder={isUnmatchedHold ? 'Ghi chú theo dõi...' : ''}
                            className="w-full text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1 py-0.5"
                          />
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {pageSize !== 'all' && filteredRows.length > pageSize && (
              <div className="text-center py-2 text-xs text-gray-400">Hiển thị {pageSize}/{filteredRows.length} dòng</div>
            )}
          </div>
        </div>
      )}

      {/* Thanh scroll cố định dưới cùng màn hình — luôn thấy được dù cuộn tới đâu */}
      {showBottomScroll && (
        <div
          ref={bottomScrollRef}
          onScroll={syncFromBottom}
          style={{ position: 'fixed', left: 0, right: 0, bottom: 0, overflowX: 'scroll', overflowY: 'hidden', height: 16, zIndex: 40, background: 'white', borderTop: '1px solid #e5e7eb' }}
        >
          <div style={{ height: 1, width: stableWidth }} />
        </div>
      )}
    </div>
  )
}

// type: 'donC' | 'donDTP' — SPX Express chỉ áp dụng cho Đơn C
export default function CarrierStats({ type }) {
  const showSpx = type === 'donC'
  const [tab, setTab] = useState('viettel')

  return (
    <div>
      <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 mb-4 w-fit">
        <button
          onClick={() => setTab('viettel')}
          className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${tab === 'viettel' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
        >
          Viettel Post
        </button>
        {showSpx && (
          <button
            onClick={() => setTab('spx')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${tab === 'spx' ? 'bg-[#1e3a5f] text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            SPX Express
          </button>
        )}
      </div>

      {tab === 'viettel' && <CarrierPanel carrierKey={`${type}_viettel`} label="Viettel Post" carrierType="viettel" />}
      {tab === 'spx' && showSpx && <CarrierPanel carrierKey={`${type}_spx`} label="SPX Express" carrierType="spx" />}
    </div>
  )
}
