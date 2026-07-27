import { useState, useEffect } from 'react'
import { Plus, Trash2, BarChart2, X, Save } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const STORES = [
  'Zentokid Vietnam Shopee',
  'Zentokid Vietnam',
  'Dược Phẩm CPC1HN',
  'DTP Sức Khỏe',
]

const STORE_COLORS = ['#3b82f6', '#f97316', '#10b981', '#a855f7']

const STORE_CLS = {
  'Zentokid Vietnam Shopee': 'bg-blue-50 border-blue-200 text-blue-700',
  'Zentokid Vietnam':        'bg-orange-50 border-orange-200 text-orange-700',
  'Dược Phẩm CPC1HN':       'bg-emerald-50 border-emerald-200 text-emerald-700',
  'DTP Sức Khỏe':            'bg-purple-50 border-purple-200 text-purple-700',
}

function toInputDate(d) {
  return d.toISOString().slice(0, 10)
}

function getWeekRange() {
  const now = new Date()
  const day = now.getDay() || 7
  const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
  return { from: toInputDate(mon), to: toInputDate(sun) }
}

function fmtDate(iso) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

function rangeLabel(from, to) {
  return `${fmtDate(from)} – ${fmtDate(to)}`
}

export default function TmdtTab() {
  const [reports, setReports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('tmdt_reports') || '[]') } catch { return [] }
  })
  const [showForm, setShowForm] = useState(false)
  const [dateFrom, setDateFrom] = useState(getWeekRange().from)
  const [dateTo, setDateTo] = useState(getWeekRange().to)
  const [counts, setCounts] = useState(Object.fromEntries(STORES.map(s => [s, ''])))
  const [deleteId, setDeleteId] = useState(null)

  useEffect(() => {
    localStorage.setItem('tmdt_reports', JSON.stringify(reports))
  }, [reports])

  const handleSubmit = e => {
    e.preventDefault()
    const key = `${dateFrom}_${dateTo}`
    const existing = reports.findIndex(r => r.key === key)
    const entry = {
      id: existing >= 0 ? reports[existing].id : Date.now(),
      key,
      dateFrom,
      dateTo,
      label: rangeLabel(dateFrom, dateTo),
      counts: Object.fromEntries(STORES.map(s => [s, parseInt(counts[s]) || 0])),
      total: STORES.reduce((sum, s) => sum + (parseInt(counts[s]) || 0), 0),
    }
    if (existing >= 0) {
      setReports(prev => prev.map((r, i) => i === existing ? entry : r))
    } else {
      setReports(prev => [entry, ...prev].sort((a, b) => b.dateFrom.localeCompare(a.dateFrom)))
    }
    setShowForm(false)
    setCounts(Object.fromEntries(STORES.map(s => [s, ''])))
  }

  const handleEdit = (report) => {
    setDateFrom(report.dateFrom)
    setDateTo(report.dateTo)
    setCounts(Object.fromEntries(STORES.map(s => [s, report.counts[s] || ''])))
    setShowForm(true)
  }

  // Tổng theo store — chỉ tuần mới nhất (reports đã sắp xếp mới nhất lên đầu), không cộng dồn các tuần cũ
  const latestReport = reports[0] || null
  const storeTotals = STORES.map(s => ({
    store: s,
    total: latestReport?.counts[s] || 0,
  }))

  // Chart data (8 tuần gần nhất)
  const chartData = [...reports].slice(0, 8).reverse().map(r => ({
    name: fmtDate(r.dateFrom).slice(0, 5),
    ...Object.fromEntries(STORES.map(s => [s, r.counts[s] || 0])),
  }))

  return (
    <div>
      {/* Tổng theo store — tuần mới nhất */}
      {latestReport && (
        <p className="text-xs text-gray-400 mb-2">Tuần mới nhất: {latestReport.label}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        {storeTotals.map((s, i) => (
          <div key={s.store} className={`rounded-xl border-2 p-4 ${STORE_CLS[s.store]}`}>
            <div className="text-xs font-semibold mb-2 leading-tight">{s.store}</div>
            <div className="text-3xl font-bold">{s.total}</div>
            <div className="text-xs opacity-60 mt-1">tổng đơn tuần này</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 size={16} className="text-gray-500" />
            <span className="text-sm font-semibold text-gray-700">Biểu đồ theo tuần</span>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {STORES.map((s, i) => (
                <Line key={s} type="monotone" dataKey={s} stroke={STORE_COLORS[i]} strokeWidth={2} dot={{ r: 3 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{reports.length} tuần đã nhập</span>
        <button
          onClick={() => { const r = getWeekRange(); setDateFrom(r.from); setDateTo(r.to); setCounts(Object.fromEntries(STORES.map(s => [s, '']))); setShowForm(true) }}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm hover:bg-[#16304f] font-medium"
        >
          <Plus size={15} /> Nhập báo cáo tuần
        </button>
      </div>

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800">Nhập báo cáo tuần</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="mb-5">
                <label className="block text-xs font-medium text-gray-600 mb-2">Thời gian báo cáo</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">Từ ngày</div>
                    <input
                      type="date"
                      required
                      value={dateFrom}
                      max={dateTo}
                      onChange={e => setDateFrom(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                  <span className="text-gray-400 mt-4">→</span>
                  <div className="flex-1">
                    <div className="text-xs text-gray-400 mb-1">Đến ngày</div>
                    <input
                      type="date"
                      required
                      value={dateTo}
                      min={dateFrom}
                      onChange={e => setDateTo(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                </div>
                {dateFrom && dateTo && (
                  <div className="mt-2 text-xs text-blue-600 font-medium">
                    📅 {rangeLabel(dateFrom, dateTo)}
                  </div>
                )}
              </div>
              <div className="space-y-3 mb-6">
                <div className="text-xs font-medium text-gray-600 mb-2">Tổng đơn hàng mỗi cửa hàng</div>
                {STORES.map((s, i) => (
                  <div key={s} className="flex items-center gap-3">
                    <div className={`flex-1 text-sm px-3 py-2 rounded-lg border ${STORE_CLS[s]} font-medium`}>
                      {s}
                    </div>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={counts[s]}
                      onChange={e => setCounts(p => ({ ...p, [s]: e.target.value }))}
                      className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-300"
                    />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                <span className="text-sm text-gray-500">
                  Tổng: <strong className="text-gray-800">
                    {STORES.reduce((sum, s) => sum + (parseInt(counts[s]) || 0), 0)} đơn
                  </strong>
                </span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Huỷ</button>
                  <button type="submit" className="flex items-center gap-1.5 px-4 py-2 bg-[#1e3a5f] text-white rounded-lg text-sm hover:bg-[#16304f]">
                    <Save size={14} /> Lưu
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full">
            <p className="text-gray-700 mb-4 font-medium">Xoá báo cáo tuần này?</p>
            <div className="flex gap-2">
              <button onClick={() => { setReports(p => p.filter(r => r.id !== deleteId)); setDeleteId(null) }} className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600">Xoá</button>
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm hover:bg-gray-50">Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500">Tuần</th>
              {STORES.map(s => (
                <th key={s} className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500 whitespace-nowrap">{s}</th>
              ))}
              <th className="px-4 py-2.5 text-center text-xs font-semibold text-gray-500">Tổng</th>
              <th className="px-4 py-2.5 text-xs font-semibold text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={STORES.length + 3} className="text-center py-16 text-gray-400 text-sm">
                  Chưa có dữ liệu. Nhấn <strong>"Nhập báo cáo tuần"</strong> để bắt đầu.
                </td>
              </tr>
            ) : reports.map(r => (
              <tr key={r.id} className="border-b border-gray-100 hover:bg-blue-50/30 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">{r.label}</td>
                {STORES.map(s => (
                  <td key={s} className="px-4 py-3 text-center font-bold text-gray-800">{r.counts[s] || 0}</td>
                ))}
                <td className="px-4 py-3 text-center">
                  <span className="inline-block bg-[#1e3a5f] text-white text-sm font-bold px-4 py-1.5 rounded min-w-16">{r.total}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => handleEdit(r)} className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg text-xs">Sửa</button>
                    <button onClick={() => setDeleteId(r.id)} className="p-1.5 text-gray-300 hover:text-red-400 hover:bg-red-50 rounded-lg"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {reports.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200">
                <td className="px-4 py-2.5 text-xs font-bold text-gray-600">Tổng cộng</td>
                {STORES.map(s => (
                  <td key={s} className="px-4 py-2.5 text-center text-xs font-bold text-gray-700">
                    {reports.reduce((sum, r) => sum + (r.counts[s] || 0), 0)}
                  </td>
                ))}
                <td className="px-4 py-2.5 text-center text-xs font-bold text-[#1e3a5f]">
                  {reports.reduce((sum, r) => sum + r.total, 0)}
                </td>
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
