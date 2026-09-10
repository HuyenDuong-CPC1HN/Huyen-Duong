import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { ChevronDown, ChevronRight, Plus, Trash2, FileDown, Pencil, FolderOpen, Eye } from 'lucide-react'
import DamagedGoodsRecordForm from './DamagedGoodsRecordForm'
import DamagedGoodsKhoAForm from './DamagedGoodsKhoAForm'
import DamagedGoodsRecordView from './DamagedGoodsRecordView'
import { exportDamagedGoodsXuLy, exportDamagedGoodsXacMinh, exportDamagedGoodsKhoAXuLy, exportDamagedGoodsKhoAXacMinh } from '../utils/exportDamagedGoods'

const STORAGE_KEY = 'damaged_goods_records'

function readAllRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(records) ? records : []
  } catch {
    return []
  }
}
function writeAllRecords(records) { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)) }

const TYPE_LABEL = type => ({ khoC: 'Kho C', khoDTP: 'Kho DTP', khoA: 'Kho A' })[type] || type
const MONTH_LABELS = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

function formatDateVi(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN')
}

function groupByYearMonth(records) {
  const byYear = new Map()
  for (const r of records) {
    const yearGroup = byYear.get(r.year) || new Map()
    const monthList = yearGroup.get(r.month) || []
    monthList.push(r)
    yearGroup.set(r.month, monthList)
    byYear.set(r.year, yearGroup)
  }
  return byYear
}

export default function DamagedGoodsTrackingTab({ type }) {
  const [allRecords, setAllRecords] = useState(() => readAllRecords())
  const [now] = useState(() => new Date())
  const [openYears, setOpenYears] = useState(() => new Set([now.getFullYear()]))
  const [selected, setSelected] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [formState, setFormState] = useState(null) // null | 'new' | record object (editing)
  const [viewingId, setViewingId] = useState(null)
  const [exportingId, setExportingId] = useState(null)

  const entityRecords = useMemo(() => allRecords.filter(r => r.entity === type), [allRecords, type])
  const byYearMonth = useMemo(() => groupByYearMonth(entityRecords), [entityRecords])
  const years = useMemo(() => {
    const set = new Set(byYearMonth.keys())
    set.add(now.getFullYear())
    return [...set].sort((a, b) => b - a)
  }, [byYearMonth, now])

  const monthRecords = (byYearMonth.get(selected.year)?.get(selected.month) || [])
    .slice()
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))

  const toggleYear = (year) => {
    setOpenYears(prev => {
      const next = new Set(prev)
      if (next.has(year)) next.delete(year); else next.add(year)
      return next
    })
  }

  const persist = (records) => {
    writeAllRecords(records)
    setAllRecords(records)
  }

  const handleSave = (record) => {
    const others = allRecords.filter(r => r.id !== record.id)
    persist([...others, record])
    setSelected({ year: record.year, month: record.month })
    setOpenYears(prev => new Set(prev).add(record.year))
    setFormState(null)
  }

  const handleRemove = (id) => {
    if (!window.confirm('Xoá biên bản hàng huỷ này? Không thể hoàn tác.')) return
    persist(allRecords.filter(r => r.id !== id))
  }

  const handleExport = async (record, kind) => {
    setExportingId(`${record.id}_${kind}`)
    try {
      if (kind === 'xuLy') await (record.entity === 'khoA' ? exportDamagedGoodsKhoAXuLy(record) : exportDamagedGoodsXuLy(record))
      else await (record.entity === 'khoA' ? exportDamagedGoodsKhoAXacMinh(record) : exportDamagedGoodsXacMinh(record))
      if (record.status !== 'exported') {
        persist(allRecords.map(r => (r.id === record.id ? { ...r, status: 'exported' } : r)))
      }
    } catch (error) {
      window.alert(error.message || 'Xuất file thất bại.')
    } finally {
      setExportingId(null)
    }
  }

  const viewingRecord = viewingId ? allRecords.find(r => r.id === viewingId) : null

  if (formState) {
    const record = formState === 'new' ? null : formState
    return (
      <div className="sheet-tab">
        {type === 'khoA' ? (
          <DamagedGoodsKhoAForm
            year={selected.year}
            month={selected.month}
            record={record}
            onSave={handleSave}
            onCancel={() => setFormState(null)}
          />
        ) : (
          <DamagedGoodsRecordForm
            type={type}
            year={selected.year}
            month={selected.month}
            record={record}
            onSave={handleSave}
            onCancel={() => setFormState(null)}
          />
        )}
      </div>
    )
  }

  if (viewingRecord) {
    return (
      <DamagedGoodsRecordView
        record={viewingRecord}
        onClose={() => setViewingId(null)}
        onEdit={() => { setViewingId(null); setFormState(viewingRecord) }}
        onExport={handleExport}
        exportingId={exportingId}
      />
    )
  }

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Theo dõi hàng huỷ — {TYPE_LABEL(type)}</span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={() => setFormState('new')} className="sheet-tab-action is-primary">
              <Plus size={13} /> Thêm biên bản hàng huỷ
            </button>
          </div>
        </header>

        <div className="sheet-tab-split sheet-tab-split--30-70">
          {/* Left: Năm > Tháng */}
          <div className="sheet-tab-col sheet-tab-col--left">
            <div className="report-section">
              <div className="report-section-content" style={{ padding: 8 }}>
                {years.map(year => {
                  const isOpen = openYears.has(year)
                  const yearGroup = byYearMonth.get(year)
                  const monthsWithData = yearGroup ? [...yearGroup.keys()].sort((a, b) => b - a) : []
                  return (
                    <div key={year} style={{ marginBottom: 4 }}>
                      <button
                        type="button"
                        onClick={() => toggleYear(year)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-sm font-semibold text-gray-700"
                      >
                        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        <FolderOpen size={14} className="text-gray-400" />
                        Năm {year}
                      </button>
                      {isOpen && (
                        <div style={{ paddingLeft: 24, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {Array.from({ length: 12 }, (_, i) => i + 1)
                            .filter(m => monthsWithData.includes(m) || (year === now.getFullYear() && m === now.getMonth() + 1))
                            .map(m => {
                              const isSelected = selected.year === year && selected.month === m
                              const count = yearGroup?.get(m)?.length || 0
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => setSelected({ year, month: m })}
                                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm ${isSelected ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}`}
                                >
                                  <span>{MONTH_LABELS[m]}</span>
                                  {count > 0 && <span className="report-section-count" style={{ fontSize: 11, padding: '2px 7px' }}>{count}</span>}
                                </button>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Right: bảng biên bản hàng huỷ trong tháng đang chọn */}
          <div className="sheet-tab-col sheet-tab-col--right">
            <div className="report-section">
              <div className="report-section-trigger" style={{ cursor: 'default' }}>
                <span className="report-section-title">{MONTH_LABELS[selected.month]}/{selected.year}</span>
                <span className="report-section-count">{monthRecords.length} biên bản</span>
              </div>
              <div className="report-section-content" style={{ overflowX: 'auto' }}>
                {monthRecords.length === 0 ? (
                  <div className="text-center py-10 text-gray-400 text-sm">Chưa có biên bản hàng huỷ nào trong tháng này</div>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-2 py-2 text-left text-gray-500 font-semibold">Ngày lập</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-semibold">Số mặt hàng</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-semibold">Trạng thái</th>
                        <th className="px-2 py-2 text-left text-gray-500 font-semibold">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthRecords.map(r => (
                        <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30">
                          <td className="px-2 py-2 font-medium text-gray-800">{formatDateVi(r.processedAt)}</td>
                          <td className="px-2 py-2 text-gray-600">{(r.items || []).length}</td>
                          <td className="px-2 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${r.status === 'exported' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                              {r.status === 'exported' ? 'Đã xuất' : 'Nháp'}
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center gap-1 flex-wrap">
                              <button type="button" onClick={() => setViewingId(r.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Xem">
                                <Eye size={13} />
                              </button>
                              <button type="button" onClick={() => handleExport(r, 'xuLy')} disabled={exportingId === `${r.id}_xuLy`}
                                className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }} title="Xuất Biên bản Xử lý">
                                <FileDown size={12} /> Xử lý
                              </button>
                              <button type="button" onClick={() => handleExport(r, 'xacMinh')} disabled={exportingId === `${r.id}_xacMinh`}
                                className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }} title="Xuất Biên bản Xác minh">
                                <FileDown size={12} /> Xác minh
                              </button>
                              <button type="button" onClick={() => setFormState(r)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700" title="Sửa">
                                <Pencil size={13} />
                              </button>
                              <button type="button" onClick={() => handleRemove(r.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
