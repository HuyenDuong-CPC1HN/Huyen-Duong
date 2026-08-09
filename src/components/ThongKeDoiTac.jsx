import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { ChevronDown, ChevronUp, Package, CheckCircle, TrendingUp } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { getCarrierFileTotal } from './CarrierStats'

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

export function DetailTable({ rows }) {
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

function GroupRow({ label, rows, children, depth = 0, hideDetail = false }) {
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
          {!children && !hideDetail && (
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

function SummaryBar({ data, groups, showChanhXe, type, weekKey, referenceDate = null }) {
  // Ưu tiên lấy theo file VTP/SPX đã upload (khớp theo ngày tuần Đơn C/DTP đang chọn); chưa có file thì tạm dùng số đếm từ Excel nội bộ
  const viettelFile = getCarrierFileTotal(`${type}_viettel`, 'viettel', data, referenceDate)
  const spxFile = getCarrierFileTotal(`${type}_spx`, 'spx', data, referenceDate)
  const viettelCount = viettelFile ? viettelFile.total : groups.doitac.sub.viettel.rows.length
  const spxCount = spxFile ? spxFile.total : groups.doitac.sub.spx.rows.length
  const doitacTotal = viettelCount + spxCount
  const viettelPct = doitacTotal ? Math.round((viettelCount / doitacTotal) * 100) : 0
  const spxPct = doitacTotal ? Math.round((spxCount / doitacTotal) * 100) : 0

  // Kế thừa đúng số từ khung "Giao hàng trực tiếp" chi tiết (24h+48h+72h + Chưa giao nhập tay theo khách hàng), đúng theo tuần đang xem
  const trucTiepDelivered = groups.tructiep.sub[24].length + groups.tructiep.sub[48].length + groups.tructiep.sub[72].length
  let khSum = 0
  try {
    const khValues = JSON.parse(localStorage.getItem(`chuagiao_kh_${type}_tructIep_${weekKey}`) || '{}')
    khSum = Object.values(khValues).reduce((s, v) => s + (Number(v) || 0), 0)
  } catch { /* ignore */ }
  const trucTiepTotal = trucTiepDelivered + khSum

  // Số đơn chành xe "chưa gửi" nhập tay ở khung Thống kê giao hàng — cùng nguồn, đúng theo tuần
  const chuaGuiChanh = Number(localStorage.getItem(`chuagiao_override_${type}_chanhXe_${weekKey}_chuagui`) || 0)
  const chanhXeTotal = groups.chanhxe.rows.length + chuaGuiChanh

  const total = trucTiepTotal + (showChanhXe ? chanhXeTotal : 0) + doitacTotal

  const cards = [
    { label: 'Tổng đơn',                     value: total,                          icon: Package, cls: 'text-[#1e3a5f]', bg: 'bg-blue-50 border-blue-200' },
    { label: 'Giao hàng trực tiếp',           value: trucTiepTotal,                 icon: CheckCircle, cls: 'text-green-700', bg: 'bg-green-50 border-green-200' },
    ...(showChanhXe ? [{ label: 'Giao qua Chành xe', value: chanhXeTotal, icon: TrendingUp, cls: 'text-orange-700', bg: 'bg-orange-50 border-orange-200' }] : []),
    { label: 'Giao qua đối tác vận chuyển',   value: doitacTotal,                   icon: TrendingUp, cls: 'text-teal-700', bg: 'bg-teal-50 border-teal-200' },
  ]

  return (
    <div className={`grid gap-3 mb-5 ${showChanhXe ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {cards.map((c, i) => {
        const Icon = c.icon
        const pct = total ? Math.round((c.value / total) * 100) : 0
        const isDoiTac = c.label === 'Giao qua đối tác vận chuyển'
        return (
          <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.bg} flex flex-col gap-2`}>
            <div className="flex items-center gap-3">
              <Icon size={18} className={c.cls} />
              <div>
                <div className={`text-lg font-bold ${c.cls} flex items-baseline gap-1.5`}>
                  {c.value.toLocaleString('vi-VN')}
                  {i > 0 && <span className="text-xs font-medium text-gray-400">({pct}%)</span>}
                </div>
                <div className="text-xs text-gray-500">{c.label}</div>
              </div>
            </div>
            {isDoiTac && (
              <div className="pt-2 border-t border-teal-100 space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Viettel Post</span>
                  <span className="font-semibold text-teal-700">{viettelCount.toLocaleString('vi-VN')} <span className="text-gray-400 font-normal">({viettelPct}%)</span></span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">SPX Express</span>
                  <span className="font-semibold text-teal-700">{spxCount.toLocaleString('vi-VN')} <span className="text-gray-400 font-normal">({spxPct}%)</span></span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function ThongKeDoiTac({ data, type, weekKey = 'live', referenceDate = null }) {
  const groups = useMemo(() => buildGroups(data), [data])
  if (!data.length) return <div className="text-center py-20 text-gray-400">Không có dữ liệu</div>

  return (
    <div>
      <SummaryBar data={data} groups={groups} showChanhXe={type !== 'donDTP'} type={type} weekKey={weekKey} referenceDate={referenceDate} />
    </div>
  )
}
