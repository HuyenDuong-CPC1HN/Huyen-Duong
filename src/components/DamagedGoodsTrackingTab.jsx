import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { ChevronDown, ChevronRight, Plus, Trash2, FolderOpen, Eye } from 'lucide-react'
import KhoAHuyWorkspace from './KhoAHuyWorkspace'
import { KHO_A_STATUS, withKhoAForm } from './khoAHuyStatus'

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

const ENTITY = 'khoA'
const MONTH_LABELS = ['', 'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']

function formatDateVi(iso) {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-')
  return d ? `${d}/${m}/${y}` : '—'
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

// Tab Kho A (hàng huỷ tạo từ phiếu xuất kho PDF): danh sách theo Năm > Tháng; bấm 1 hồ sơ để mở màn làm biên bản
// (điền, xem trước, in; xuất file Excel/Word khi cần). Kho C / Kho DTP đã chuyển sang HangHuyTab.jsx.
export default function DamagedGoodsTrackingTab() {
  const [allRecords, setAllRecords] = useState(() => readAllRecords())
  const [now] = useState(() => new Date())
  const [openYears, setOpenYears] = useState(() => new Set([now.getFullYear()]))
  const [selected, setSelected] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [openId, setOpenId] = useState(null)

  const entityRecords = useMemo(() => allRecords.filter(r => r.entity === ENTITY), [allRecords])
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

  // Mở / tạo hồ sơ: làm trực tiếp trên màn biên bản (xem trước + in), lưu ngay mỗi lần sửa.
  const createRecord = () => {
    const today = new Date().toISOString().slice(0, 10)
    const record = withKhoAForm({
      id: `damaged_khoA_${Date.now()}`, entity: ENTITY, year: selected.year, month: selected.month,
      processedAt: new Date().toISOString(), sourceFileName: '', status: 'draft', createdAt: new Date().toISOString(), items: [],
    })
    record.form = { ...record.form, ngayLap: today, xlNgay: today, xmNgay: today }
    persist([...allRecords, record])
    setOpenId(record.id)
  }

  // Ngày lập quyết định tháng của hồ sơ trong cây Năm > Tháng.
  const updateRecord = (record) => {
    const ngayLap = record.form?.ngayLap
    const [y, m] = String(ngayLap || '').split('-').map(Number)
    const next = y && m ? { ...record, year: y, month: m, processedAt: new Date(`${ngayLap}T08:00:00`).toISOString() } : record
    persist(allRecords.map(r => (r.id === next.id ? next : r)))
  }

  const closeRecord = () => {
    const rec = allRecords.find(r => r.id === openId)
    // Hồ sơ mới mở ra rồi đóng mà chưa có hàng nào thì bỏ luôn, không để lại hồ sơ rỗng.
    if (rec && (rec.items || []).length === 0 && !rec.sourceFileName) persist(allRecords.filter(r => r.id !== rec.id))
    else if (rec) { setSelected({ year: rec.year, month: rec.month }); setOpenYears(prev => new Set(prev).add(rec.year)) }
    setOpenId(null)
  }

  const handleRemove = (id) => {
    if (!window.confirm('Xoá hồ sơ hàng huỷ này? Không thể hoàn tác.')) return
    persist(allRecords.filter(r => r.id !== id))
  }

  const openRecord = openId ? allRecords.find(r => r.id === openId) : null
  if (openRecord) {
    return <KhoAHuyWorkspace record={withKhoAForm(openRecord)} onChange={updateRecord} onBack={closeRecord} />
  }

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Hồ sơ huỷ Kho A cho kế toán</span>
          <div className="flex items-center gap-2 ml-auto">
            <button type="button" onClick={createRecord} className="sheet-tab-action is-primary">
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
                      {monthRecords.map(r => {
                        const st = KHO_A_STATUS[r.status] || KHO_A_STATUS.draft
                        const ngayLap = r.form?.ngayLap || String(r.processedAt || '').slice(0, 10)
                        return (
                          <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/30 cursor-pointer" onClick={() => setOpenId(r.id)}>
                            <td className="px-2 py-2 font-medium text-gray-800">{formatDateVi(ngayLap)}</td>
                            <td className="px-2 py-2 text-gray-600">{(r.items || []).length}</td>
                            <td className="px-2 py-2">
                              <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                                <button type="button" onClick={() => setOpenId(r.id)} className="sheet-tab-action" style={{ minHeight: 26, padding: '0 8px', fontSize: 11 }} title="Mở để sửa, xem trước và in">
                                  <Eye size={12} /> Mở / In
                                </button>
                                <button type="button" onClick={() => handleRemove(r.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" title="Xoá">
                                  <Trash2 size={13} />
                                </button>
                              </div>
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
    </div>
  )
}
