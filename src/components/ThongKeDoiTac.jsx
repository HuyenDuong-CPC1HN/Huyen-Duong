import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Package, CheckCircle, TrendingUp } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'

function buildGroups(data) {
  const groups = {
    tructiep: { label: 'Giao hàng trực tiếp', rows: [], sub: { 24: [], 48: [], 72: [], khac: [] } },
    chanhxe:  { label: 'Giao qua Chành xe',   rows: [] },
    doitac:   {
      label: 'Giao qua đối tác vận chuyển', rows: [],
      sub: { viettel: { label: 'Viettel Post', rows: [] }, spx: { label: 'SPX Express', rows: [] } }
    },
  }

  for (const row of data) {
    if (!String(row['Mã kiện hàng'] ?? '').trim()) continue

    const type = partnerType(row)
    if (type === 'tructiep') {
      groups.tructiep.rows.push(row)
      const bucket = deliveryBucket(row)
      groups.tructiep.sub[bucket === '24' ? 24 : bucket === '48' ? 48 : bucket === '72' ? 72 : 'khac'].push(row)
    } else if (type === 'viettel') {
      groups.doitac.rows.push(row)
      groups.doitac.sub.viettel.rows.push(row)
    } else if (type === 'spx') {
      groups.doitac.rows.push(row)
      groups.doitac.sub.spx.rows.push(row)
    } else {
      groups.chanhxe.rows.push(row)
    }
  }
  return groups
}

function DetailTable({ rows }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 mt-2">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-100">
            {['Mã kiện hàng', 'Ngày tạo kiện', 'Ngày giao hàng', 'Tên khách hàng', 'Thành phố', 'Đối tác VC', 'Trạng thái', 'Thu hộ'].map(h => (
              <th key={h} className="px-3 py-2 text-left text-gray-500 font-semibold whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-50 hover:bg-blue-50/30">
              <td className="px-3 py-1.5 whitespace-nowrap">{row['Mã kiện hàng'] || '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{row['Ngày tạo kiện'] || '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{row['Ngày giao hàng'] || '—'}</td>
              <td className="px-3 py-1.5 max-w-48 truncate">{row['Tên khách hàng'] || '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{row['Thành phố'] || '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap">{row['Đối tác vận chuyển'] || '—'}</td>
              <td className="px-3 py-1.5 whitespace-nowrap"><StatusBadge status={row['Trạng thái']} /></td>
              <td className="px-3 py-1.5 whitespace-nowrap font-medium">{row['Thu hộ'] || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SubRow({ label, rows, depth = 1 }) {
  const [open, setOpen] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  if (rows.length === 0) return null
  const daGiao = rows.filter(r => r['Trạng thái'] === 'Đã giao').length
  const tyLe = Math.round((daGiao / rows.length) * 100)

  return (
    <>
      <tr
        className="border-b border-gray-100 hover:bg-blue-50/20 cursor-pointer transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="py-2.5 text-gray-700 text-sm" style={{ paddingLeft: depth * 28 }}>
          <span className="flex items-center gap-1.5">
            {open ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
            {label}
          </span>
        </td>
        <td className="px-4 py-2.5 text-center font-bold text-[#1e3a5f] text-sm">{rows.length}</td>
        <td className="px-4 py-2.5 text-center text-xs text-green-700">{daGiao}</td>
        <td className="px-4 py-2.5 text-center text-xs text-gray-500">{tyLe}%</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={4} className="px-4 pb-3 bg-gray-50/50">
            <button
              onClick={e => { e.stopPropagation(); setShowDetail(v => !v) }}
              className="text-xs text-blue-600 hover:underline mt-1"
            >
              {showDetail ? 'Ẩn chi tiết' : `Xem ${rows.length} đơn`}
            </button>
            {showDetail && <DetailTable rows={rows} />}
          </td>
        </tr>
      )}
    </>
  )
}

function GroupRow({ label, rows, children, depth = 0 }) {
  const [open, setOpen] = useState(true)
  const [showDetail, setShowDetail] = useState(false)
  if (rows.length === 0) return null
  const daGiao = rows.filter(r => r['Trạng thái'] === 'Đã giao').length
  const tyLe = Math.round((daGiao / rows.length) * 100)

  return (
    <>
      <tr
        className="border-b border-gray-200 bg-blue-50/40 cursor-pointer hover:bg-blue-50/60 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <td className="py-3 font-semibold text-[#1e3a5f] text-sm" style={{ paddingLeft: depth * 28 + 16 }}>
          <span className="flex items-center gap-1.5">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {label}
          </span>
        </td>
        <td className="px-4 py-3 text-center font-bold text-[#1e3a5f]">{rows.length}</td>
        <td className="px-4 py-3 text-center text-sm text-green-700 font-medium">{daGiao}</td>
        <td className="px-4 py-3 text-center text-sm text-gray-600 font-medium">{tyLe}%</td>
      </tr>
      {open && (
        <>
          {children}
          {!children && (
            <tr>
              <td colSpan={4} className="px-4 pb-3 bg-gray-50/50" style={{ paddingLeft: depth * 28 + 16 }}>
                <button
                  onClick={e => { e.stopPropagation(); setShowDetail(v => !v) }}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  {showDetail ? 'Ẩn chi tiết' : `Xem ${rows.length} đơn`}
                </button>
                {showDetail && <DetailTable rows={rows} />}
              </td>
            </tr>
          )}
        </>
      )}
    </>
  )
}

function SummaryBar({ data }) {
  const total = data.length
  const daGiao = data.filter(r => r['Trạng thái'] === 'Đã giao').length
  const tyLe = total ? Math.round((daGiao / total) * 100) : 0
  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      {[
        { label: 'Tổng đơn',   value: total.toLocaleString('vi-VN'),  icon: Package,     cls: 'text-[#1e3a5f]', bg: 'bg-blue-50 border-blue-200' },
        { label: 'Đã giao',    value: daGiao.toLocaleString('vi-VN'), icon: CheckCircle, cls: 'text-green-700',  bg: 'bg-green-50 border-green-200' },
        { label: 'Tỷ lệ giao', value: `${tyLe}%`,                    icon: TrendingUp,  cls: 'text-teal-700',   bg: 'bg-teal-50 border-teal-200' },
      ].map(c => {
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

export default function ThongKeDoiTac({ data }) {
  const groups = useMemo(() => buildGroups(data), [data])
  if (!data.length) return <div className="text-center py-20 text-gray-400">Không có dữ liệu</div>

  const { tructiep, chanhxe, doitac } = groups
  const total = data.length
  const totalDaGiao = data.filter(r => r['Trạng thái'] === 'Đã giao').length

  return (
    <div>
      <SummaryBar data={data} />

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#1e3a5f] text-white text-xs font-semibold">
              <th className="px-4 py-3 text-left">Phương thức giao hàng</th>
              <th className="px-4 py-3 text-center w-24">Số đơn</th>
              <th className="px-4 py-3 text-center w-24">Đã giao</th>
              <th className="px-4 py-3 text-center w-24">Tỷ lệ</th>
            </tr>
          </thead>
          <tbody>
            {/* Giao hàng trực tiếp */}
            <GroupRow label="Giao hàng trực tiếp" rows={tructiep.rows}>
              <SubRow label="Giao 24 giờ" rows={tructiep.sub[24]} depth={2} />
              <SubRow label="Giao 48 giờ" rows={tructiep.sub[48]} depth={2} />
              <SubRow label="Giao 72 giờ" rows={tructiep.sub[72]} depth={2} />
              {tructiep.sub.khac.length > 0 && <SubRow label="Khác / Chưa xác định" rows={tructiep.sub.khac} depth={2} />}
            </GroupRow>

            {/* Chành xe */}
            <GroupRow label="Giao qua Chành xe" rows={chanhxe.rows} />

            {/* Đối tác vận chuyển */}
            <GroupRow label="Giao qua đối tác vận chuyển" rows={doitac.rows}>
              <SubRow label="Viettel Post" rows={doitac.sub.viettel.rows} depth={2} />
              <SubRow label="SPX Express"  rows={doitac.sub.spx.rows}     depth={2} />
            </GroupRow>
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-gray-700">
              <td className="px-4 py-3">Tổng cộng</td>
              <td className="px-4 py-3 text-center text-[#1e3a5f]">{total}</td>
              <td className="px-4 py-3 text-center text-green-700">{totalDaGiao}</td>
              <td className="px-4 py-3 text-center text-gray-600">{total ? Math.round(totalDaGiao/total*100) : 0}%</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
