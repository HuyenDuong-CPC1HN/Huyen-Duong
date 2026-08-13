import { useMemo, useState } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { ChevronDown, ChevronUp, Package, CheckCircle, TrendingUp, Truck, AlertTriangle } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { getCarrierFileTotal, getCarrierFileStats, readHoldWeeks } from './CarrierStats'

function trucTiepSubKey(bucket) {
  if (bucket === '24') return '24'
  if (bucket === '48') return '48'
  if (bucket === '72') return '72'
  return 'khac'
}

function pushPartnerRow(groups, row) {
  const type = partnerType(row)
  if (type === 'tructiep') {
    groups.tructiep.rows.push(row)
    groups.tructiep.sub[trucTiepSubKey(deliveryBucket(row))].push(row)
    return
  }
  if (type === 'viettel') {
    groups.doitac.rows.push(row)
    groups.doitac.sub.viettel.rows.push(row)
    return
  }
  if (type === 'spx') {
    groups.doitac.rows.push(row)
    groups.doitac.sub.spx.rows.push(row)
    return
  }
  groups.chanhxe.rows.push(row)
}

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
    pushPartnerRow(groups, row)
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
          {rows.map((row) => (
            <tr key={`${row['Mã kiện hàng']}-${row['Mã hóa đơn']}-${row['Ngày tạo kiện']}`} className="border-b border-gray-50 hover:bg-blue-50/30">
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

/**
 * SummaryBar — compact summary for ThongKeDoiTac.
 * Renders neutral stat rows (not pastel cards) with eyebrow + total badge.
 * Progressive disclosure via GroupBreakdownSection.
 *
 * Counting logic is PRESERVED verbatim (R26) — only the CSS classes change.
 */
function SummaryBar({ data, groups, showChanhXe, type, weekKey, referenceDate = null }) {
  // Ưu tiên lấy theo file VTP/SPX đã upload (khớp theo ngày tuần Đơn C/DTP đang chọn); chưa có file thì tạm dùng số đếm từ Excel nội bộ
  const viettelFile = getCarrierFileTotal(`${type}_viettel`, 'viettel', data, referenceDate)
  const spxFile = getCarrierFileTotal(`${type}_spx`, 'spx', data, referenceDate)
  const viettelCount = viettelFile ? viettelFile.total : groups.doitac.sub.viettel.rows.length
  const spxCount = spxFile ? spxFile.total : groups.doitac.sub.spx.rows.length
  const doitacTotal = viettelCount + spxCount

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

  // Compact neutral stat rows — no pastel backgrounds (R18/R21)
  const rows = [
    { label: 'Tổng đơn',                  value: total,             icon: Package,    colorCls: 'text-[#1e3a5f]' },
    { label: 'Giao hàng trực tiếp',        value: trucTiepTotal,    icon: CheckCircle, colorCls: 'text-green-700' },
    ...(showChanhXe ? [{ label: 'Chành xe', value: chanhXeTotal, icon: TrendingUp, colorCls: 'text-orange-700' }] : []),
    { label: 'Đối tác VC',                value: doitacTotal,       icon: TrendingUp, colorCls: 'text-teal-700', viettelCount, spxCount },
  ]

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {rows.map(r => {
        const Icon = r.icon
        const pct = total ? Math.round((r.value / total) * 100) : 0
        const isDoiTac = r.label === 'Đối tác VC'
        return (
          <div
            key={r.label}
            className="sheet-tab-section flex items-center gap-2.5 px-3 py-2.5"
          >
            <div className={`flex items-center gap-1.5 ${r.colorCls}`}>
              <Icon size={14} />
              <span className="text-xs font-medium text-gray-500">{r.label}</span>
            </div>
            <div className="flex items-baseline gap-1.5 ml-auto">
              <span className={`text-base font-bold ${r.colorCls}`}>
                {r.value.toLocaleString('vi-VN')}
              </span>
              <span className="text-[10px] text-gray-400">({pct}%)</span>
            </div>
            {isDoiTac && r.viettelCount !== undefined && (
              <div className="ml-3 pl-3 border-l border-gray-200 space-y-0.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-400">VTP</span>
                  <span className="font-semibold text-teal-700">{r.viettelCount.toLocaleString('vi-VN')}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-gray-400">SPX</span>
                  <span className="font-semibold text-teal-700">{r.spxCount.toLocaleString('vi-VN')}</span>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * GroupBreakdownSection — compact group rows with "Chi tiết" disclosure (R14/R15).
 * Renders for each carrier group: eyebrow label, total badge, expandable detail table.
 * Groups are open by default for convenience but section title is collapsed.
 */
function GroupBreakdownSection({ groups, type, referenceDate, data }) {
  const [openGroups, setOpenGroups] = useState({})

  const toggle = (key) => setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }))

  const viettelRows = groups.doitac.sub.viettel.rows
  const spxRows = groups.doitac.sub.spx.rows
  const chanhxeRows = groups.chanhxe.rows

  // VTP file stats
  const viettelFileStats = getCarrierFileStats(`${type}_viettel`, 'viettel', data, referenceDate)
  const spxFileStats = getCarrierFileStats(`${type}_spx`, 'spx', data, referenceDate)

  const groupItems = [
    {
      key: 'tructiep',
      label: 'Giao hàng trực tiếp',
      icon: CheckCircle,
      colorCls: 'text-green-700',
      count: groups.tructiep.rows.length,
      rows: groups.tructiep.rows,
      show: true,
    },
    {
      key: 'chanhxe',
      label: 'Giao qua Chành xe',
      icon: Truck,
      colorCls: 'text-orange-700',
      count: chanhxeRows.length,
      rows: chanhxeRows,
      show: type !== 'donDTP',
    },
    {
      key: 'viettel',
      label: 'Viettel Post',
      icon: Truck,
      colorCls: 'text-teal-700',
      count: viettelFileStats?.total ?? viettelRows.length,
      rows: viettelRows,
      show: true,
    },
    {
      key: 'spx',
      label: 'SPX Express',
      icon: Truck,
      colorCls: 'text-blue-700',
      count: spxFileStats?.total ?? spxRows.length,
      rows: spxRows,
      show: type === 'donC',
    },
  ].filter(g => g.show)

  return (
    <div className="space-y-2">
      {groupItems.map(({ key, label, icon: Icon, colorCls, count, rows }) => {
        const open = openGroups[key]
        return (
          <div key={key} className="sheet-tab-section">
            {/* Header row — always visible */}
            <button
              type="button"
              className="w-full flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
              onClick={() => toggle(key)}
              aria-expanded={open}
            >
              <Icon size={13} className={`${colorCls} shrink-0`} />
              <span className="text-xs font-medium text-gray-600">{label}</span>
              <span className={`ml-auto text-sm font-bold ${colorCls}`}>
                {count.toLocaleString('vi-VN')}
              </span>
              {open
                ? <ChevronUp size={13} className="text-gray-400 shrink-0" />
                : <ChevronDown size={13} className="text-gray-400 shrink-0" />
              }
            </button>
            {/* Detail table */}
            {open && rows.length > 0 && (
              <div className="px-3 pb-3">
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); toggle(key) }}
                  className="text-xs text-blue-600 hover:underline mb-2"
                >
                  Ẩn chi tiết
                </button>
                <DetailTable rows={rows} />
              </div>
            )}
            {open && rows.length === 0 && (
              <div className="px-3 pb-3 text-xs text-gray-400">Không có đơn</div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * DTP Hold Block — shown immediately after Viettel Post for donDTP only (R15).
 * Counts "Đang lấy hàng" VTP rows, shows missing-file hint.
 */
function DtpHoldBlock({ viettelRows }) {
  const [open, setOpen] = useState(false)

  const holdRows = viettelRows.filter(r => (r['Trạng thái'] || '').includes('Đang lấy'))
  const holdWeeks = readHoldWeeks('donDTP_viettel')
  const hasHoldFile = holdWeeks.length > 0

  if (holdRows.length === 0) return null

  return (
    <div className="sheet-tab-section">
      <button
        type="button"
        className="w-full flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-purple-50 transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        <AlertTriangle size={13} className="text-purple-600 shrink-0" />
        <span className="text-xs font-medium text-purple-700">Chờ lấy (DTP)</span>
        <span className="ml-auto text-sm font-bold text-purple-700">
          {holdRows.length.toLocaleString('vi-VN')}
        </span>
        {!hasHoldFile && (
          <span className="text-[10px] text-purple-400 italic ml-1">— chưa upload file đối chiếu</span>
        )}
        {open
          ? <ChevronUp size={13} className="text-purple-400 shrink-0" />
          : <ChevronDown size={13} className="text-purple-400 shrink-0" />
        }
      </button>
      {open && (
        <div className="px-3 pb-3">
          <DetailTable rows={holdRows} />
        </div>
      )}
    </div>
  )
}

export default function ThongKeDoiTac({ data, type, weekKey = 'live', referenceDate = null }) {
  const groups = useMemo(() => buildGroups(data), [data])
  if (!data.length) return <div className="text-center py-20 text-gray-400">Không có dữ liệu</div>

  return (
    <div>
      <SummaryBar data={data} groups={groups} showChanhXe={type !== 'donDTP'} type={type} weekKey={weekKey} referenceDate={referenceDate} />
      <GroupBreakdownSection
        groups={groups}
        type={type}
        referenceDate={referenceDate}
        data={data}
      />
      {type === 'donDTP' && (
        <DtpHoldBlock viettelRows={groups.doitac.sub.viettel.rows} />
      )}
    </div>
  )
}
