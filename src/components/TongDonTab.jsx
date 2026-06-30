import { useMemo } from 'react'
import { useSheetData } from '../useSheetData'
import { SHEETS } from '../config'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { RefreshCw, TrendingUp, Package, Truck, ShoppingBag, LayoutGrid } from 'lucide-react'

const STATUS_COLORS_MAP = {
  'Đang chuyển': '#3b82f6',
  'Đã giao':     '#10b981',
  'Hoàn hàng':   '#ef4444',
  'Chờ xử lý':   '#f59e0b',
  'Đã huỷ':      '#9ca3af',
}
const FALLBACK_COLORS = ['#6366f1','#ec4899','#14b8a6','#f97316','#84cc16']

const TMDT_STORES = ['Zentokid Vietnam Shopee','Zentokid Vietnam','Dược Phẩm CPC1HN','DTP Sức Khỏe']
const STORE_COLORS = ['#3b82f6','#f97316','#10b981','#a855f7']

function StatCard({ label, value, sub, icon: Icon, color }) {
  return (
    <div className={`bg-white rounded-xl border-l-4 ${color} p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-gray-500 mb-1">{label}</div>
          <div className="text-2xl font-bold text-gray-800">{value}</div>
          {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
        </div>
        <div className="p-2 rounded-lg bg-gray-50">
          <Icon size={20} className="text-gray-400" />
        </div>
      </div>
    </div>
  )
}

export default function TongDonTab() {
  const donC   = useSheetData(SHEETS.donC.id,   SHEETS.donC.gid)
  const donDTP = useSheetData(SHEETS.donDTP.id, SHEETS.donDTP.gid)

  // TMĐT từ localStorage
  const tmdtReports = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('tmdt_reports') || '[]') } catch { return [] }
  }, [])

  const loading = donC.loading || donDTP.loading
  const refresh = () => { donC.refresh(); donDTP.refresh() }

  // Tổng đơn
  const totalC   = donC.data.length
  const totalDTP = donDTP.data.length
  const totalTMDT = tmdtReports.reduce((sum, r) => sum + (r.total || 0), 0)
  const grandTotal = totalC + totalDTP + totalTMDT

  // Tổng COD (Đơn C + DTP)
  const calcCOD = data => data.reduce((sum, row) => {
    return sum + (parseInt((row['Thu hộ'] || '0').replace(/[^0-9]/g, '')) || 0)
  }, 0)
  const totalCOD = calcCOD(donC.data) + calcCOD(donDTP.data)

  // Thống kê trạng thái (Đơn C + DTP gộp)
  const allRows = [...donC.data, ...donDTP.data]
  const byStatus = allRows.reduce((acc, row) => {
    const s = row['Trạng thái'] || 'Không rõ'
    acc[s] = (acc[s] || 0) + 1
    return acc
  }, {})
  const statusData = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value], i) => ({
      name, value,
      color: STATUS_COLORS_MAP[name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]
    }))

  // Pie chart nguồn đơn
  const sourceData = [
    { name: 'Đơn C',       value: totalC,    color: '#3b82f6' },
    { name: 'Đơn DTP',     value: totalDTP,  color: '#6366f1' },
    { name: 'Sàn TMĐT',   value: totalTMDT, color: '#f97316' },
  ].filter(d => d.value > 0)

  // Bar chart TMĐT theo tuần (8 tuần gần nhất)
  const tmdtChart = [...tmdtReports].slice(0, 8).reverse().map(r => ({
    name: r.label?.slice(0, 10) || '',
    ...Object.fromEntries(TMDT_STORES.map(s => [s, r.counts?.[s] || 0])),
  }))

  // Thành phố top 5 (Đơn C + DTP)
  const byCity = allRows.reduce((acc, row) => {
    const c = row['Thành phố'] || 'Không rõ'
    acc[c] = (acc[c] || 0) + 1
    return acc
  }, {})
  const topCities = Object.entries(byCity).sort((a,b) => b[1]-a[1]).slice(0,5)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LayoutGrid size={18} className="text-gray-500" />
          <h2 className="text-base font-semibold text-gray-700">Tổng hợp tất cả đơn hàng</h2>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Làm mới
        </button>
      </div>

      {loading ? (
        <div className="text-center py-24 text-gray-400">
          <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
          <p>Đang tải dữ liệu...</p>
        </div>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Tổng tất cả đơn"  value={grandTotal} icon={LayoutGrid} color="border-blue-500"   sub="Đơn C + DTP + TMĐT" />
            <StatCard label="Giao hàng Đơn C"  value={totalC}     icon={Truck}      color="border-indigo-400" sub={`${donC.data.filter(r=>r['Trạng thái']==='Đã giao').length} đã giao`} />
            <StatCard label="Giao hàng Đơn DTP" value={totalDTP}  icon={Package}    color="border-purple-400" sub={`${donDTP.data.filter(r=>r['Trạng thái']==='Đã giao').length} đã giao`} />
            <StatCard label="Đơn Sàn TMĐT"     value={totalTMDT}  icon={ShoppingBag} color="border-orange-400" sub={`${tmdtReports.length} tuần`} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Pie: nguồn đơn */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={15} className="text-gray-500" />
                <span className="text-sm font-semibold text-gray-700">Tỷ lệ theo nguồn</span>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={sourceData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                    {sourceData.map((d,i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v,n) => [v+' đơn', n]} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Trạng thái (Đơn C + DTP) */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">Trạng thái giao hàng (Đơn C + DTP)</div>
              <div className="space-y-2">
                {statusData.map(s => (
                  <div key={s.name} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: s.color }} />
                    <span className="text-sm text-gray-600 flex-1">{s.name}</span>
                    <span className="text-sm font-bold text-gray-800">{s.value}</span>
                    <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(s.value/(totalC+totalDTP))*100}%`, background: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top thành phố */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="text-sm font-semibold text-gray-700 mb-3">Top thành phố (Đơn C + DTP)</div>
              <div className="space-y-2">
                {topCities.map(([city, count], i) => (
                  <div key={city} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-4">{i+1}</span>
                    <span className="text-sm text-gray-600 flex-1">{city}</span>
                    <span className="text-sm font-bold text-gray-800">{count}</span>
                    <div className="w-24 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-blue-400 rounded-full" style={{ width: `${(count/topCities[0][1])*100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* TMĐT chart */}
            {tmdtChart.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-700 mb-3">Đơn TMĐT theo tuần</div>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={tmdtChart} margin={{ top:0, right:10, left:-10, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    {TMDT_STORES.map((s,i) => (
                      <Bar key={s} dataKey={s} fill={STORE_COLORS[i]} radius={[2,2,0,0]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* COD tổng */}
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div>
              <div className="text-xs text-gray-500">Tổng tiền COD (Đơn C + DTP)</div>
              <div className="text-xl font-bold text-green-700">{totalCOD.toLocaleString('vi-VN')} đ</div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
