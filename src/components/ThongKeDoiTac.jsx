import { useMemo, useState, useRef } from 'react'
import { ChevronDown, ChevronUp, TrendingUp, Package, Truck, CheckCircle, RotateCcw, Clock, X } from 'lucide-react'
import StatusBadge from './StatusBadge'

const STATUS_GROUPS = {
  daGiao:      { label: 'Đã giao',       statuses: ['Đã giao'],                         cls: 'text-green-700',  bg: 'bg-green-50' },
  dangChuyen:  { label: 'Đang chuyển',   statuses: ['Đang chuyển'],                     cls: 'text-blue-700',   bg: 'bg-blue-50' },
  hoanHang:    { label: 'Hoàn hàng',     statuses: ['Hoàn hàng'],                       cls: 'text-red-700',    bg: 'bg-red-50' },
  choXuLy:     { label: 'Chờ / Huỷ',     statuses: ['Chờ xử lý', 'Đã huỷ'],            cls: 'text-gray-600',   bg: 'bg-gray-50' },
}

function parseNum(v) {
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''))
  return isNaN(n) ? 0 : n
}

function fmt(n) {
  return n.toLocaleString('vi-VN')
}

function groupByPartner(data) {
  const map = {}
  for (const row of data) {
    const partner = (row['Đối tác vận chuyển'] || '').trim() || '(Chưa có đối tác)'
    if (!map[partner]) {
      map[partner] = { name: partner, rows: [], soDon: 0, soKien: 0, daGiao: 0, dangChuyen: 0, hoanHang: 0, choXuLy: 0, tongCOD: 0, tongPhiShip: 0 }
    }
    const g = map[partner]
    g.rows.push(row)
    g.soDon++
    g.soKien += parseNum(row['Tổng số kiện'])
    g.tongCOD += parseNum(row['Thu hộ'])
    g.tongPhiShip += parseNum(row['Phí Ship/kiện'])
    const st = (row['Trạng thái'] || '').trim()
    if (STATUS_GROUPS.daGiao.statuses.includes(st))     g.daGiao++
    else if (STATUS_GROUPS.dangChuyen.statuses.includes(st)) g.dangChuyen++
    else if (STATUS_GROUPS.hoanHang.statuses.includes(st))   g.hoanHang++
    else g.choXuLy++
  }
  return Object.values(map).sort((a, b) => b.soDon - a.soDon)
}

function SummaryBar({ data }) {
  const totalDon   = data.length
  const totalKien  = data.reduce((s, r) => s + parseNum(r['Tổng số kiện']), 0)
  const totalCOD   = data.reduce((s, r) => s + parseNum(r['Thu hộ']), 0)
  const daGiao     = data.filter(r => r['Trạng thái'] === 'Đã giao').length
  const tyLe       = totalDon ? Math.round((daGiao / totalDon) * 100) : 0

  const cards = [
    { label: 'Tổng đơn',   value: fmt(totalDon),  icon: Package,     cls: 'text-[#1e3a5f]', bg: 'bg-blue-50 border-blue-200' },
    { label: 'Đã giao',    value: fmt(daGiao),    icon: CheckCircle, cls: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
    { label: 'Tỷ lệ giao', value: `${tyLe}%`,    icon: TrendingUp,  cls: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
      {cards.map(c => {
        const Icon = c.icon
        return (
          <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.bg} flex items-center gap-3`}>
            <Icon size={18} className={c.cls} />
            <div>
              <div className={`text-lg font-bold ${c.cls}`}>{c.value}</div>
              <div className="text-xs text-gray-500">{c.label}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PartnerDetail({ partner, onClose }) {
  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-600">Chi tiết đơn — {partner.name}</span>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 underline">Thu gọn</button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {['Mã kiện hàng', 'Ngày tạo kiện', 'Tên khách hàng', 'Thành phố', 'Mã vận đơn', 'Ngày giao hàng', 'Trạng thái', 'Thu hộ', 'Người tạo kiện', 'Người tạo lệnh'].map(h => (
                <th key={h} className="px-2 py-1.5 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {partner.rows.map((row, i) => (
              <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/30">
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Mã kiện hàng'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Ngày tạo kiện'] || '—'}</td>
                <td className="px-2 py-1.5 max-w-48 truncate">{row['Tên khách hàng'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Thành phố'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Mã vận đơn'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Ngày giao hàng'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap"><StatusBadge status={row['Trạng thái']} /></td>
                <td className="px-2 py-1.5 whitespace-nowrap font-medium">{row['Thu hộ'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Người tạo kiện'] || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{row['Người tạo lệnh'] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function ThongKeDoiTac({ data }) {
  const [expanded, setExpanded] = useState(null)
  const [selected, setSelected] = useState([])
  const [open, setOpen] = useState(false)
  const filterRef = useRef()

  const allPartners = useMemo(() => groupByPartner(data), [data])
  const partners = useMemo(() =>
    selected.length ? allPartners.filter(p => selected.includes(p.name)) : allPartners,
    [allPartners, selected]
  )

  const toggle = (name) => {
    setSelected(s => s.includes(name) ? s.filter(v => v !== name) : [...s, name])
  }

  const toggleExpand = (name) => setExpanded(e => e === name ? null : name)

  if (!data.length) return <div className="text-center py-20 text-gray-400">Không có dữ liệu</div>

  return (
    <div>
      <SummaryBar data={data} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500">
                <th className="px-4 py-3 text-left w-1/2">
                  <div className="flex items-center gap-1.5">
                    <span>Đối tác vận chuyển</span>
                    <div className="relative font-normal">
                      <button
                        onClick={() => setOpen(o => !o)}
                        className={`p-0.5 rounded transition-colors ${selected.length ? 'text-blue-500' : 'text-gray-300 hover:text-gray-500'}`}
                      >
                        <ChevronDown size={11} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
                      </button>
                      {open && (
                        <div className="absolute z-50 top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-56 flex flex-col" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-100">
                            <span className="text-xs text-gray-400">{selected.length > 0 ? `${selected.length} đã chọn` : 'Chọn đối tác'}</span>
                            <div className="flex items-center gap-2">
                              {selected.length > 0 && <button onClick={() => setSelected([])} className="text-xs text-blue-500 hover:text-blue-700">Bỏ tất cả</button>}
                              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600"><X size={13} /></button>
                            </div>
                          </div>
                          <div className="overflow-y-auto max-h-60">
                            {allPartners.map(p => (
                              <div
                                key={p.name}
                                onClick={() => toggle(p.name)}
                                className={`flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${selected.includes(p.name) ? 'bg-blue-50/60 text-blue-700 font-medium' : 'text-gray-700'}`}
                              >
                                <input type="checkbox" readOnly checked={selected.includes(p.name)} className="accent-blue-500 flex-shrink-0 pointer-events-none" />
                                <span className="truncate">{p.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {selected.length > 0 && (
                      <button onClick={() => setSelected([])} className="text-gray-400 hover:text-gray-600"><X size={11} /></button>
                    )}
                  </div>
                </th>
                <th className="px-4 py-3 text-center">Số đơn</th>
                <th className="w-1/2 px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {partners.map(p => {
                const isOpen = expanded === p.name
                return (
                  <>
                    <tr
                      key={p.name}
                      onClick={() => toggleExpand(p.name)}
                      className="border-b border-gray-100 hover:bg-blue-50/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-medium text-gray-800 w-1/2">{p.name}</td>
                      <td className="px-4 py-3 text-center font-bold text-[#1e3a5f] text-base">{p.soDon}</td>
                      <td className="w-1/2 px-3 py-3 text-gray-400">
                        {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${p.name}-detail`} className="bg-gray-50/50">
                        <td colSpan={3} className="px-4 pb-4">
                          <PartnerDetail partner={p} onClose={() => setExpanded(null)} />

                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>

            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 text-sm font-bold text-gray-700">
                <td className="px-4 py-3 w-1/2">Tổng cộng</td>
                <td className="px-4 py-3 text-center text-[#1e3a5f]">{partners.reduce((s, p) => s + p.soDon, 0)}</td>
                <td className="w-1/2" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
