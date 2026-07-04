import { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Upload, FileUp, FileSpreadsheet, X, CheckCircle, Clock, RotateCcw, XCircle, Truck, Search, List, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { parseCarrierFile, computeCarrierStats, getCarrierColumns, buildInternalOrderLookup, reconcileViettelOrders } from '../utils/parseCarrierExport'
import { ColumnFilter, ResizeHandle } from './DataTable'

const STAT_CARDS = [
  { key: '24h',          label: '≤ 24 giờ',        icon: CheckCircle, cls: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  { key: '48h',          label: '≤ 48 giờ',        icon: CheckCircle, cls: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200' },
  { key: '72h',          label: '≤ 72 giờ',        icon: Clock,       cls: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'dangVanChuyen',label: 'Đang vận chuyển', icon: Truck,       cls: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200', editable: true },
  { key: 'giaoLai',      label: 'Giao lại lần 2',  icon: RotateCcw,   cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200', editable: true },
  { key: 'hoanHang',     label: 'Hoàn hàng',       icon: XCircle,     cls: 'text-red-600',    bg: 'bg-red-50 border-red-200', editable: true },
]

// Đọc nhanh tổng đơn theo file đã upload cho 1 carrier (dùng để hiển thị khung tổng quan so sánh)
export function getCarrierFileTotal(carrierKey, carrierType, internalData) {
  try {
    const state = JSON.parse(localStorage.getItem(`carrier_data_${carrierKey}`) || 'null')
    if (!state) return null

    const lookupMap = carrierType === 'viettel' ? buildInternalOrderLookup(internalData) : null
    const stats = computeCarrierStats(state.rows, carrierType, lookupMap)

    const readOverride = (key) => {
      const v = localStorage.getItem(`carrier_statoverride_${carrierKey}_${key}`)
      return v ? Number(v) : null
    }
    const dangVanChuyen = readOverride('dangVanChuyen') ?? stats.dangVanChuyen
    const giaoLai = readOverride('giaoLai') ?? stats.giaoLai
    const hoanHang = readOverride('hoanHang') ?? stats.hoanHang

    return {
      fileName: state.fileName,
      total: stats['24h'] + stats['48h'] + stats['72h'] + dangVanChuyen + giaoLai + hoanHang,
    }
  } catch {
    return null
  }
}

function useStatOverride(storageKey, statKey) {
  const lsKey = `carrier_statoverride_${storageKey}_${statKey}`
  const [override, setOverride] = useState(() => localStorage.getItem(lsKey) ?? '')
  const commit = (v) => {
    setOverride(v)
    if (v === '') localStorage.removeItem(lsKey)
    else localStorage.setItem(lsKey, v)
  }
  return [override, commit]
}

function EditableCarrierStatCard({ col, value, override, onCommit }) {
  const Icon = col.icon
  const [editing, setEditing] = useState(false)
  const inputRef = useRef()

  const displayVal = override !== '' ? override : value

  const startEdit = () => {
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div className={`rounded-xl border p-3 ${col.bg} text-center relative`}>
      <Icon size={16} className={`${col.cls} mx-auto mb-1`} />
      {editing ? (
        <input
          ref={inputRef}
          type="number"
          min="0"
          defaultValue={displayVal}
          onBlur={e => { onCommit(e.target.value); setEditing(false) }}
          onKeyDown={e => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false) }}
          className={`text-xl font-bold ${col.cls} bg-transparent border-b-2 border-current w-16 text-center focus:outline-none`}
        />
      ) : (
        <div onDoubleClick={startEdit} className={`text-xl font-bold ${col.cls} cursor-pointer`} title="Bấm đúp để nhập tay">
          {displayVal}
        </div>
      )}
      <div className="text-xs text-gray-500 mt-0.5 leading-tight">{col.label}</div>
      {override !== '' && (
        <button
          onClick={() => onCommit('')}
          className="absolute top-1 right-1 text-[9px] text-gray-400 hover:text-red-500"
          title="Khôi phục số tự động"
        >
          ↺
        </button>
      )}
    </div>
  )
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
  'ĐT Nhận': 140, 'Trạng Thái': 130, 'Lý do': 200, 'Đơn chuyển hoàn': 110, 'Ngày chuyển trạng thái': 150,
  'Mã vận đơn': 150, 'Thời gian tạo đơn': 140, 'Thời gian giao hàng': 140, 'Trạng thái hiện tại': 150,
  'Tên người nhận': 160, 'Số điện thoại người nhận': 140, 'Mã khách hàng': 140,
  'Thu COD (Có/Không)': 130, 'Số tiền COD': 120, 'Giá trị đơn hàng': 130,
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
  const lookupMap = useMemo(
    () => carrierType === 'viettel' ? buildInternalOrderLookup(internalData) : null,
    [internalData, carrierType]
  )
  const lsKey = `carrier_data_${carrierKey}`
  const inputRef = useRef()
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [state, setState] = useState(() => {
    try { return JSON.parse(localStorage.getItem(lsKey) || 'null') } catch { return null }
  })
  const [colFilters, setColFilters] = useState({})
  const [pageSize, setPageSize] = useState(50)
  const [tableExpanded, setTableExpanded] = useState(false)
  const [colWidths, setColWidth] = useColWidths(carrierKey, TABLE_COLUMNS)
  const [dangVanChuyenOv, setDangVanChuyenOv] = useStatOverride(carrierKey, 'dangVanChuyen')
  const [giaoLaiOv, setGiaoLaiOv] = useStatOverride(carrierKey, 'giaoLai')
  const [hoanHangOv, setHoanHangOv] = useStatOverride(carrierKey, 'hoanHang')
  const statOverrides = { dangVanChuyen: [dangVanChuyenOv, setDangVanChuyenOv], giaoLai: [giaoLaiOv, setGiaoLaiOv], hoanHang: [hoanHangOv, setHoanHangOv] }
  const minTableWidthRef = useRef(0)

  const totalTableWidth = Object.values(colWidths).reduce((a, b) => a + b, 0)
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

  const parseFile = (file) => {
    setError('')
    if (!file) return
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const rows = parseCarrierFile(e.target.result, carrierType)
        if (rows.length === 0) { setError('Không tìm thấy dữ liệu đơn hàng trong file.'); return }
        const next = { fileName: file.name, uploadedAt: new Date().toISOString(), rows }
        setState(next)
        localStorage.setItem(lsKey, JSON.stringify(next))
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

  const clear = () => {
    setState(null)
    localStorage.removeItem(lsKey)
  }

  const stats = useMemo(() => state ? computeCarrierStats(state.rows, carrierType, lookupMap) : null, [state, carrierType, lookupMap])

  const activeFilters = Object.entries(colFilters).filter(([, v]) => v?.length > 0)

  const filteredRows = useMemo(() => {
    if (!state) return []
    const q = search.toLowerCase()
    return state.rows.filter(row => {
      for (const [key, vals] of activeFilters) {
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [state, search, activeFilters])

  // Dữ liệu dùng để tính option cho từng cột: áp dụng mọi filter khác, trừ filter của chính cột đó (lọc liên động)
  const dataForColumn = useCallback((excludeKey) => {
    if (!state) return []
    const q = search.toLowerCase()
    return state.rows.filter(row => {
      for (const [key, vals] of activeFilters) {
        if (key === excludeKey) continue
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [state, search, activeFilters])

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

  const effectiveTotal = stats['24h'] + stats['48h'] + stats['72h']
    + Number(dangVanChuyenOv !== '' ? dangVanChuyenOv : stats.dangVanChuyen)
    + Number(giaoLaiOv !== '' ? giaoLaiOv : stats.giaoLai)
    + Number(hoanHangOv !== '' ? hoanHangOv : stats.hoanHang)

  return (
    <div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-4">
        {STAT_CARDS.map(c => {
          if (c.editable) {
            const [ov, setOv] = statOverrides[c.key]
            return <EditableCarrierStatCard key={c.key} col={c} value={stats[c.key]} override={ov} onCommit={setOv} />
          }
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
          <button onClick={clear} className="ml-1 p-0.5 rounded hover:bg-green-100 text-green-400 hover:text-green-700" title="Xóa file">
            <X size={14} />
          </button>
        </div>
        <button
          onClick={() => inputRef.current.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-blue-400 hover:text-blue-600 text-gray-600 transition-colors"
        >
          <Upload size={14} />
          Upload file mới
        </button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={e => parseFile(e.target.files[0])} />
        <span className="text-xs text-gray-400">Cập nhật: {new Date(state.uploadedAt).toLocaleString('vi-VN')}</span>
      </div>

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
              {activeFilters.length > 0 || search ? `${filteredRows.length}/${state.rows.length} dòng (đã lọc)` : `${state.rows.length} dòng`}
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
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr><td colSpan={TABLE_COLUMNS.length} className="text-center py-10 text-gray-400">Không có dữ liệu</td></tr>
                ) : (pageSize === 'all' ? filteredRows : filteredRows.slice(0, pageSize)).map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/40 text-[12px]">
                    {TABLE_COLUMNS.map(c => (
                      <td key={c} className="px-3 py-2 border border-gray-200" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row[c] || '—'}</td>
                    ))}
                  </tr>
                ))}
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
