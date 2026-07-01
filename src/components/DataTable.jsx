import { useState, useMemo, useRef, useEffect, useCallback, useReducer } from 'react'
import { Search, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, X } from 'lucide-react'
import { COLUMNS } from '../config'
import StatusBadge from './StatusBadge'
import SummaryCards from './SummaryCards'

const PAGE_SIZE_OPTIONS = [20, 50, 100, 200, 'all']

function ColumnFilter({ colKey, data, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  const options = useMemo(() =>
    [...new Set(data.map(r => r[colKey]).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [data, colKey]
  )

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (opt) => {
    if (selected.includes(opt)) onChange(selected.filter(v => v !== opt))
    else onChange([...selected, opt])
  }

  if (options.length === 0) return null

  const hasFilter = selected.length > 0

  return (
    <div ref={ref} className="relative inline-block ml-1" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`p-0.5 rounded transition-colors ${hasFilter ? 'text-blue-500' : 'text-gray-300 hover:text-gray-500'}`}
        title={hasFilter ? `Đang lọc: ${selected.join(', ')}` : 'Lọc'}
      >
        <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg min-w-44 max-h-64 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
            <span className="text-xs text-gray-400">{selected.length > 0 ? `${selected.length} đã chọn` : 'Chọn giá trị'}</span>
            {selected.length > 0 && (
              <button onClick={() => onChange([])} className="text-xs text-blue-500 hover:text-blue-700">Bỏ tất cả</button>
            )}
          </div>
          {/* Options */}
          <div className="overflow-y-auto">
            {options.map(opt => {
              const checked = selected.includes(opt)
              return (
                <label
                  key={opt}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${checked ? 'bg-blue-50/60 text-blue-700 font-medium' : 'text-gray-700'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt)}
                    className="accent-blue-500 flex-shrink-0"
                  />
                  <span className="truncate max-w-48">{opt}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function useColWidths() {
  const init = () => Object.fromEntries(COLUMNS.map(c => [c.key, c.width ?? 120]))
  const [widths, setWidths] = useState(init)
  const setWidth = (key, w) => setWidths(prev => ({ ...prev, [key]: Math.max(60, w) }))
  return [widths, setWidth]
}

function ResizeHandle({ colKey, setWidth }) {
  const startX = useRef(null)
  const startW = useRef(null)

  const onMouseDown = (e) => {
    e.preventDefault()
    startX.current = e.clientX
    startW.current = e.target.closest('th').offsetWidth

    const onMove = (ev) => {
      const delta = ev.clientX - startX.current
      setWidth(colKey, startW.current + delta)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <span
      onMouseDown={onMouseDown}
      className="absolute right-0 top-0 h-full w-2 cursor-col-resize select-none z-10 flex items-center justify-center group"
    >
      <span className="w-px h-4 bg-gray-300 group-hover:bg-blue-400 transition-colors" />
    </span>
  )
}

const VC_KEY = 'Đối tác vận chuyển'

function EditableVCCell({ value, rowIndex, onSave }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const inputRef = useRef()

  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => { onSave(rowIndex, val); setEditing(false) }
  const cancel = () => { setVal(value); setEditing(false) }

  if (editing) return (
    <input
      ref={inputRef}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
      className="w-full px-1 py-0.5 text-[12px] border border-blue-400 rounded outline-none bg-blue-50"
      style={{ minWidth: 80 }}
    />
  )

  return (
    <span
      onDoubleClick={() => { setVal(value); setEditing(true) }}
      className="block cursor-pointer hover:bg-blue-50 rounded px-1 -mx-1"
      title="Bấm đúp để sửa"
    >
      {value || <span className="text-gray-300">—</span>}
    </span>
  )
}

export default function DataTable({ data, loading, error, refresh, lastRefresh, storageKey = 'vc_edits' }) {
  const [search, setSearch] = useState('')
  const [colFilters, setColFilters] = useState({})
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [colWidths, setColWidth] = useColWidths()
  const [edits, setEdits] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '{}') } catch { return {} }
  })

  const saveEdit = (key, newVal) => {
    const next = { ...edits, [key]: newVal }
    setEdits(next)
    localStorage.setItem(storageKey, JSON.stringify(next))
  }

  const getVC = (row) => {
    const key = row['Mã hóa đơn'] || ''
    return edits[key] !== undefined ? edits[key] : row[VC_KEY]
  }
  const topScrollRef = useRef()
  const tableScrollRef = useRef()
  const minTableWidthRef = useRef(0)

  const totalTableWidth = 36 + Object.values(colWidths).reduce((a, b) => a + b, 0)
  // Chỉ tăng, không bao giờ giảm
  minTableWidthRef.current = Math.max(minTableWidthRef.current, totalTableWidth)
  const stableWidth = minTableWidthRef.current

  const syncFromTop = useCallback(() => {
    if (tableScrollRef.current) tableScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft
  }, [])
  const syncFromTable = useCallback(() => {
    if (topScrollRef.current) topScrollRef.current.scrollLeft = tableScrollRef.current.scrollLeft
  }, [])

  const setColFilter = (key, vals) => {
    setColFilters(f => ({ ...f, [key]: vals }))
    setPage(1)
  }

  const activeFilters = Object.entries(colFilters).filter(([, v]) => v?.length > 0)

  const clearAll = () => { setColFilters({}); setSearch(''); setPage(1) }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return data.filter(row => {
      for (const [key, vals] of activeFilters) {
        if (!vals.includes(row[key])) return false
      }
      if (q) return Object.values(row).some(v => v.toLowerCase().includes(q))
      return true
    })
  }, [data, search, activeFilters])

  const totalPages = pageSize === 'all' ? 1 : Math.ceil(filtered.length / pageSize)
  const pageData = pageSize === 'all' ? filtered : filtered.slice((page - 1) * pageSize, page * pageSize)

  if (error) return (
    <div className="text-center py-20 text-red-500">
      <p className="mb-2">Lỗi tải dữ liệu: {error}</p>
      <button onClick={refresh} className="text-blue-600 underline text-sm">Thử lại</button>
    </div>
  )

  return (
    <div>
      <SummaryCards data={filtered} />

      {/* Toolbar */}
      <div className="flex flex-wrap gap-2 mb-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
            placeholder="Tìm kiếm mã đơn, tên khách hàng..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span>Hiển thị</span>
          <select
            value={pageSize}
            onChange={e => { setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value)); setPage(1) }}
            className="border border-gray-200 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n === 'all' ? 'Tất cả' : `${n} dòng`}</option>)}
          </select>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
        {lastRefresh && (
          <span className="text-xs text-gray-400">
            Cập nhật: {lastRefresh.toLocaleTimeString('vi-VN')}
          </span>
        )}
      </div>

      {/* Active filter chips */}
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {activeFilters.map(([key, vals]) => {
            const col = COLUMNS.find(c => c.key === key)
            return (
              <span key={key} className="flex items-center gap-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded-full text-xs text-blue-700">
                <span className="font-medium">{col?.label ?? key}:</span>
                <span className="truncate max-w-40">{vals.join(', ')}</span>
                <button onClick={() => setColFilter(key, [])} className="hover:text-blue-900 ml-0.5">
                  <X size={11} />
                </button>
              </span>
            )
          })}
          <button onClick={clearAll} className="px-2 py-1 text-xs text-gray-400 hover:text-gray-600 underline">
            Xóa tất cả
          </button>
        </div>
      )}

      {/* Thanh scroll trên đầu */}
      <div
        ref={topScrollRef}
        onScroll={syncFromTop}
        style={{ overflowX: 'scroll', overflowY: 'hidden', height: 16, marginBottom: 4 }}
      >
        <div style={{ height: 1, width: stableWidth }} />
      </div>

      {/* Table */}
      <div ref={tableScrollRef} onScroll={syncFromTable} className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <div style={{ minWidth: stableWidth }}>
        {loading ? (
          <div className="text-center py-20 text-gray-400">
            <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : (
          <>
            <table className="text-sm border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#1e3a5f] text-white">
                  <th className="px-4 py-3.5 text-left text-xs font-semibold whitespace-nowrap relative border border-white/20 align-middle" style={{ width: 36, minWidth: 36 }}>#</th>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      className="px-4 py-3.5 text-left text-xs font-semibold whitespace-nowrap relative border border-white/20 align-middle"
                      style={{ width: colWidths[col.key], minWidth: 60 }}
                    >
                      <span className={colFilters[col.key]?.length > 0 ? 'text-yellow-300' : 'text-white'}>{col.label}</span>
                      <ColumnFilter
                        colKey={col.key}
                        data={data}
                        selected={colFilters[col.key] || []}
                        onChange={vals => setColFilter(col.key, vals)}
                      />
                      <ResizeHandle colKey={col.key} setWidth={setColWidth} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageData.length === 0 ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1} className="text-center py-16 text-gray-400">
                      Không có dữ liệu
                    </td>
                  </tr>
                ) : pageData.map((row, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-blue-50/40 transition-colors bg-white">
                    <td className="px-4 py-3.5 text-gray-400 text-[12px] font-medium border border-gray-200 align-middle" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pageSize === 'all' ? i + 1 : (page - 1) * pageSize + i + 1}</td>
                    {COLUMNS.map(col => (
                      <td key={col.key} className="px-4 py-3.5 text-gray-700 text-[12px] border border-gray-200 align-middle" style={{ maxWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col.key === 'Trạng thái'
                          ? <StatusBadge status={row[col.key]} />
                          : col.key === VC_KEY
                            ? <EditableVCCell value={getVC(row)} rowIndex={i} onSave={(_, v) => saveEdit(row['Mã hóa đơn'] || String(i), v)} />
                          : col.key === 'Thu hộ' || col.key === 'TT Thu hộ' || col.key === 'Phí Ship/kiện'
                            ? <span className="font-semibold text-gray-800">{row[col.key] || '—'}</span>
                            : row[col.key] || <span className="text-gray-300">—</span>
                        }
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            {/* End minWidth wrapper */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                <span className="text-xs text-gray-500">
                  {filtered.length} đơn · trang {page}/{totalPages}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-7 h-7 rounded text-xs ${p === page ? 'bg-blue-600 text-white' : 'hover:bg-gray-100'}`}
                      >
                        {p}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
        </div>
      </div>
    </div>
  )
}
