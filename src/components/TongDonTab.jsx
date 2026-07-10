import { useMemo, useState, useEffect } from 'react'
import {
  RefreshCw, TrendingUp, TrendingDown, Package, Truck, Users, ClipboardList,
  Handshake, Target, AlertTriangle, Clock, ArrowRight, BarChart2,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { useSheetData } from '../useSheetData'
import { useWeeklyData } from '../useWeeklyData'
import { SHEETS } from '../config'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { getCarrierFileStats, getCarrierHistoryCompare } from './CarrierStats'

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}
function pct(part, total) { return total ? Math.round((part / total) * 100 * 10) / 10 : 0 }
function fmtPctSigned(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%` }

// ---- Field lưu theo tuần (dùng cho các số liệu không có sẵn trong Excel: chưa giao, hàng gửi, nhân sự, kết luận...) ----
function useWeekField(weekKey, field, fallback = '') {
  const lsKey = `tongdon_field_${field}_${weekKey || 'none'}`
  const [val, setVal] = useState(() => {
    const v = localStorage.getItem(lsKey)
    return v === null ? fallback : v
  })
  useEffect(() => {
    const v = localStorage.getItem(lsKey)
    setVal(v === null ? fallback : v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey, field])
  const commit = (v) => { setVal(v); localStorage.setItem(lsKey, v) }
  return [val, commit]
}

function readWeekField(weekKey, field, fallback = 0) {
  const v = localStorage.getItem(`tongdon_field_${field}_${weekKey || 'none'}`)
  return v === null ? fallback : Number(v)
}
function saveWeekField(weekKey, field, value) {
  if (!weekKey) return
  localStorage.setItem(`tongdon_field_${field}_${weekKey}`, String(value))
}

function useTypeData(type, sheetId, gid) {
  const sheet = useSheetData(sheetId, gid)
  const { weeks, activeWeek, activeId } = useWeeklyData(type)
  const rawData = activeWeek ? activeWeek.data : sheet.data

  const vcEdits = useMemo(() => readJSON(`vc_edits_${type}`, {}), [])
  const activeData = useMemo(() => rawData.map(row => {
    const key = row['Mã hóa đơn'] || ''
    return vcEdits[key] !== undefined ? { ...row, 'Đối tác vận chuyển': vcEdits[key] } : row
  }), [rawData, vcEdits])
  const validData = useMemo(() => activeData.filter(r => String(r['Mã kiện hàng'] ?? '').trim()), [activeData])

  const idx = weeks.findIndex(w => w.id === activeId)
  const prevWeek = idx > 0 ? weeks[idx - 1] : null
  const prevValidData = useMemo(() => {
    if (!prevWeek) return null
    return prevWeek.data.filter(r => String(r['Mã kiện hàng'] ?? '').trim())
  }, [prevWeek])

  return {
    loading: activeWeek ? false : sheet.loading, refresh: sheet.refresh,
    validData, prevValidData, activeId, prevWeekId: prevWeek?.id || null,
  }
}

function buildGroups(data) {
  const g = { tructiep: [], chanhxe: [], viettel: [], spx: [] }
  for (const row of data) g[partnerType(row)]?.push(row)
  return g
}

function trucTiepBuckets(rows) {
  const b = { 24: 0, 48: 0, 72: 0 }
  for (const row of rows) {
    const k = deliveryBucket(row)
    if (k === '24') b[24]++
    else if (k === '48') b[48]++
    else if (k === '72') b[72]++
  }
  return b
}

// Tổng "Chưa giao" của Giao hàng trực tiếp — lấy đúng nguồn với tab Thống kê giao hàng
// (tổng các ô Bệnh viện/Nhà thuốc/KH ONL trong "Phân loại đơn chưa giao theo khách hàng")
function readKhBreakdownSum(type) {
  const khValues = readJSON(`chuagiao_kh_${type}_tructIep`, {})
  return Object.values(khValues).reduce((s, v) => s + (Number(v) || 0), 0)
}

// Tổng hợp toàn bộ chỉ số cho 1 tuần (Đơn C + Đơn DTP), có thể là tuần hiện tại hoặc tuần trước
function computeWeekReport({ dataC, dataDTP, weekKey, tmdtTotal, viettelCompareC, spxCompareC, viettelCompareDTP, isCurrent }) {
  const groupsC = buildGroups(dataC)
  const groupsDTP = buildGroups(dataDTP)
  const bC = trucTiepBuckets(groupsC.tructiep)
  const bDTP = trucTiepBuckets(groupsDTP.tructiep)

  // "Chưa giao" không lưu theo lịch sử từng tuần — chỉ áp dụng cho tuần hiện tại, tuần trước không có số liệu này
  const chuaGiaoC = isCurrent ? readKhBreakdownSum('donC') : 0
  const chuaGiaoDTP = isCurrent ? readKhBreakdownSum('donDTP') : 0
  const hangGuiC = 0
  const hangGuiDTP = 0

  const tructiepTotalC = bC[24] + bC[48] + bC[72] + chuaGiaoC + hangGuiC
  const tructiepTotalDTP = bDTP[24] + bDTP[48] + bDTP[72] + chuaGiaoDTP + hangGuiDTP

  const chanhXeOverride = readWeekField(weekKey, 'chanhXeGui', 0)
  const chanhXeTotal = groupsC.chanhxe.length + chanhXeOverride

  const viettelTotalC = isCurrent ? (viettelCompareC?.total || 0) : (viettelCompareC?.total || 0)
  const spxTotalC = spxCompareC?.total || 0
  const viettelTotalDTP = viettelCompareDTP?.total || 0

  const codC = viettelTotalC + spxTotalC
  const codDTP = viettelTotalDTP

  const totalC = tructiepTotalC + chanhXeTotal + codC
  const totalDTP = tructiepTotalDTP + codDTP
  const grandTotal = totalC + totalDTP + tmdtTotal

  const gh24 = bC[24] + bDTP[24]
  const gh48 = bC[48] + bDTP[48]
  const gh72 = bC[72] + bDTP[72]
  const chuaGiao = chuaGiaoC + chuaGiaoDTP
  const trucTiepTong = gh24 + gh48 + gh72 + chuaGiao

  return {
    grandTotal, totalC, totalDTP, totalTMDT: tmdtTotal,
    tructiepTotalC, tructiepTotalDTP, chanhXeTotal, codC, codDTP,
    gh24, gh48, gh72, chuaGiao, chuaGiaoC, chuaGiaoDTP, trucTiepTong,
    rate24h: pct(gh24, trucTiepTong),
    viettelC: viettelCompareC, spxC: spxCompareC, viettelDTP: viettelCompareDTP,
  }
}

// ---------- UI bits ----------
function SectionHeader({ num, title, icon: Icon, color }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <span
        className="w-8 h-8 rounded-full text-white flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-md"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)`, boxShadow: `0 3px 8px ${color}55` }}
      >
        {num}
      </span>
      <h3 className="font-bold text-gray-800 tracking-wide text-[15px]">{title}</h3>
      <span className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}12` }}>
        <Icon size={16} style={{ color }} />
      </span>
    </div>
  )
}

function SectionCard({ accent, children, className = '' }) {
  return (
    <div
      className={`bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(15,23,42,0.06)] p-5 ${className}`}
      style={{ borderTop: `3px solid ${accent}` }}
    >
      {children}
    </div>
  )
}

function DeltaCell({ v1, v2 }) {
  const delta = v1 ? ((v2 - v1) / v1) * 100 : (v2 > 0 ? 100 : 0)
  const up = delta >= 0
  return (
    <span className={`inline-flex items-center gap-1 font-semibold ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {fmtPctSigned(delta)}
    </span>
  )
}

function OverviewTable({ rows }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200">
          <th className="text-left py-2 text-xs font-semibold text-gray-400"></th>
          <th className="text-center py-2 text-xs font-semibold text-gray-400 w-20">Tuần 1</th>
          <th className="text-center py-2 text-xs font-semibold text-gray-400 w-20">Tuần 2</th>
          <th className="text-center py-2 text-xs font-semibold text-gray-400 w-24">Thay đổi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-b border-gray-50">
            <td className="py-2.5 flex items-center gap-2 text-gray-700 font-medium">
              <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `${r.color}18` }}>
                <r.icon size={13} style={{ color: r.color }} />
              </span>
              {r.label}
            </td>
            <td className="py-2.5 text-center text-gray-600">{r.v1.toLocaleString('vi-VN')}</td>
            <td className="py-2.5 text-center font-bold text-gray-800">{r.v2.toLocaleString('vi-VN')}</td>
            <td className="py-2.5 text-center"><DeltaCell v1={r.v1} v2={r.v2} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function InsightCard({ icon: Icon, color, title, text, onTextChange, editable, placeholder }) {
  return (
    <div className="flex gap-3 bg-gray-50/70 rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm" style={{ background: `${color}18` }}>
        <Icon size={17} style={{ color }} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-sm" style={{ color }}>{title}</div>
        {editable ? (
          <textarea
            value={text}
            onChange={e => onTextChange(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full text-xs text-gray-500 mt-0.5 resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded bg-transparent"
          />
        ) : (
          <p className="text-xs text-gray-500 mt-0.5">{text}</p>
        )}
      </div>
    </div>
  )
}


function PartnerCompareRow({ label, v1, v2 }) {
  return (
    <tr className="border-b border-gray-50">
      <td className="py-1.5 text-gray-500">{label}</td>
      <td className="py-1.5 text-center text-gray-500">{v1.toLocaleString('vi-VN')}</td>
      <td className="py-1.5 text-center"><ArrowRight size={11} className="inline text-gray-300" /></td>
      <td className={`py-1.5 text-center font-bold ${v2 >= v1 ? 'text-green-600' : 'text-red-500'}`}>{v2.toLocaleString('vi-VN')}</td>
    </tr>
  )
}

function SolutionCard({ num, text, onChange }) {
  return (
    <div className="bg-gray-50/70 rounded-xl border border-gray-100 p-3 flex gap-2 flex-1 min-w-[180px] hover:bg-gray-50 transition-colors">
      <span className="w-6 h-6 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">{num}</span>
      <textarea
        value={text}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full text-xs text-gray-600 resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded bg-transparent"
      />
    </div>
  )
}

export default function TongDonTab() {
  const donC = useTypeData('donC', SHEETS.donC.id, SHEETS.donC.gid)
  const donDTP = useTypeData('donDTP', SHEETS.donDTP.id, SHEETS.donDTP.gid)

  const tmdtReports = useMemo(() => readJSON('tmdt_reports', []), [])
  const tmdtCurrent = tmdtReports[0]?.total || 0
  const tmdtPrev = tmdtReports[1]?.total || 0

  const loading = donC.loading || donDTP.loading
  const refresh = () => { donC.refresh(); donDTP.refresh() }

  // Khóa "tuần" dùng để lưu các trường nhập tay (chưa giao, hàng gửi, nhân sự, kết luận, giải pháp...)
  const weekKey = `${donC.activeId || 'x'}_${donDTP.activeId || 'x'}`
  const prevWeekKey = donC.prevWeekId || donDTP.prevWeekId ? `${donC.prevWeekId || 'x'}_${donDTP.prevWeekId || 'x'}` : null

  const viettelCompareC = getCarrierHistoryCompare('donC_viettel', 'viettel', donC.validData)
  const spxCompareC = getCarrierHistoryCompare('donC_spx', 'spx', donC.validData)
  const viettelCompareDTP = getCarrierHistoryCompare('donDTP_viettel', 'viettel', donDTP.validData)

  const viettelCurrentC = getCarrierFileStats('donC_viettel', 'viettel', donC.validData) || viettelCompareC.current
  const spxCurrentC = getCarrierFileStats('donC_spx', 'spx', donC.validData) || spxCompareC.current
  const viettelCurrentDTP = getCarrierFileStats('donDTP_viettel', 'viettel', donDTP.validData) || viettelCompareDTP.current

  const current = useMemo(() => computeWeekReport({
    dataC: donC.validData, dataDTP: donDTP.validData, weekKey, tmdtTotal: tmdtCurrent,
    viettelCompareC: viettelCurrentC, spxCompareC: spxCurrentC, viettelCompareDTP: viettelCurrentDTP, isCurrent: true,
  }), [donC.validData, donDTP.validData, weekKey, tmdtCurrent, viettelCurrentC, spxCurrentC, viettelCurrentDTP])

  const previous = useMemo(() => computeWeekReport({
    dataC: donC.prevValidData || [], dataDTP: donDTP.prevValidData || [], weekKey: prevWeekKey, tmdtTotal: tmdtPrev,
    viettelCompareC: viettelCompareC.previous, spxCompareC: spxCompareC.previous, viettelCompareDTP: viettelCompareDTP.previous, isCurrent: false,
  }), [donC.prevValidData, donDTP.prevValidData, prevWeekKey, tmdtPrev, viettelCompareC, spxCompareC, viettelCompareDTP])

  // Trường nhập tay theo tuần hiện tại
  const [chuaGiaoC, setChuaGiaoC] = useWeekField(weekKey, 'chuaGiaoC', '0')
  const [chuaGiaoDTP, setChuaGiaoDTP] = useWeekField(weekKey, 'chuaGiaoDTP', '0')
  const [hangGuiC, setHangGuiC] = useWeekField(weekKey, 'hangGuiC', '0')
  const [hangGuiDTP, setHangGuiDTP] = useWeekField(weekKey, 'hangGuiDTP', '0')
  useEffect(() => { saveWeekField(weekKey, 'chuaGiaoC', chuaGiaoC) }, [weekKey, chuaGiaoC])
  useEffect(() => { saveWeekField(weekKey, 'chuaGiaoDTP', chuaGiaoDTP) }, [weekKey, chuaGiaoDTP])
  useEffect(() => { saveWeekField(weekKey, 'hangGuiC', hangGuiC) }, [weekKey, hangGuiC])
  useEffect(() => { saveWeekField(weekKey, 'hangGuiDTP', hangGuiDTP) }, [weekKey, hangGuiDTP])

  const [reportTitle, setReportTitle] = useWeekField(weekKey, 'title', 'Báo cáo giao hàng - CN HCM')

  // ---- Tự động sinh nhận định dựa trên số liệu Tuần 1 vs Tuần 2 ----
  const deltaPctOf = (v1, v2) => v1 ? ((v2 - v1) / v1) * 100 : (v2 > 0 ? 100 : 0)
  const totalDeltaPct = deltaPctOf(previous.grandTotal, current.grandTotal)
  const groupDeltas = [
    { name: 'Đơn C', pct: deltaPctOf(previous.totalC, current.totalC), abs: current.totalC - previous.totalC },
    { name: 'Đơn DTP', pct: deltaPctOf(previous.totalDTP, current.totalDTP), abs: current.totalDTP - previous.totalDTP },
    { name: 'Sàn TMĐT (SO3+SO6)', pct: deltaPctOf(previous.totalTMDT, current.totalTMDT), abs: current.totalTMDT - previous.totalTMDT },
  ]
  const topGroup = [...groupDeltas].sort((a, b) => Math.abs(b.abs) - Math.abs(a.abs))[0]
  const rate24hDrop = current.rate24h < previous.rate24h
  const chuaGiaoUp = current.chuaGiao > previous.chuaGiao

  const autoInsight1 = totalDeltaPct >= 0
    ? `Tổng đơn tăng ${totalDeltaPct.toFixed(1)}%, chủ yếu đến từ nhóm ${topGroup.name} (${topGroup.pct >= 0 ? '+' : ''}${topGroup.pct.toFixed(1)}%).`
    : `Tổng đơn giảm ${Math.abs(totalDeltaPct).toFixed(1)}%, chủ yếu do nhóm ${topGroup.name} (${topGroup.pct >= 0 ? '+' : ''}${topGroup.pct.toFixed(1)}%).`

  const autoInsight2 = (() => {
    const parts = []
    if (rate24hDrop) parts.push(`Tỷ lệ giao trực tiếp 24h giảm từ ${previous.rate24h.toFixed(1)}% xuống ${current.rate24h.toFixed(1)}%`)
    else parts.push(`Tỷ lệ giao trực tiếp 24h ổn định/cải thiện, đạt ${current.rate24h.toFixed(1)}%`)
    if (chuaGiaoUp) parts.push(`đơn chưa giao tăng từ ${previous.chuaGiao} lên ${current.chuaGiao} đơn`)
    else if (current.chuaGiao > 0) parts.push(`đơn chưa giao ở mức ${current.chuaGiao} đơn`)
    return parts.join('; ') + '.'
  })()

  const autoInsight3 = chuaGiaoUp && totalDeltaPct > 0
    ? `Sản lượng đơn tăng mạnh (${totalDeltaPct >= 0 ? '+' : ''}${totalDeltaPct.toFixed(1)}%) trong khi năng lực xử lý giao hàng trực tiếp chưa theo kịp, khiến số đơn chưa giao tăng.`
    : rate24hDrop
      ? `Tỷ lệ giao 24h giảm dù sản lượng ${totalDeltaPct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(totalDeltaPct).toFixed(1)}% — cần rà soát nguyên nhân chậm giao.`
      : `Không phát sinh vấn đề đáng chú ý; các chỉ số giao hàng trong tuần ổn định.`

  const [insight1, setInsight1] = useWeekField(weekKey, 'insight1', autoInsight1)
  const [insight2, setInsight2] = useWeekField(weekKey, 'insight2', autoInsight2)
  const [insight3, setInsight3] = useWeekField(weekKey, 'insight3', autoInsight3)

  const autoSol1 = chuaGiaoUp
    ? `Ưu tiên xử lý ${current.chuaGiao} đơn chưa giao ngay đầu tuần tới, đặc biệt nhóm phát sinh nhiều nhất.`
    : `Duy trì tiến độ xử lý đơn chưa giao như tuần này.`
  const autoSol2 = rate24hDrop
    ? `Rà soát SLA giao 24h, ưu tiên các đơn đã quá hạn và gom tuyến theo khu vực.`
    : `Tiếp tục duy trì tỷ lệ giao 24h hiện tại (${current.rate24h.toFixed(1)}%).`
  const autoSol3 = `Đối soát hàng ngày với Viettel Post và SPX cho các đơn đang vận chuyển kéo dài.`
  const autoSol4 = totalDeltaPct > 15
    ? `Chuẩn bị thêm nhân sự/năng lực xử lý do sản lượng nhóm ${topGroup.name} tăng cao.`
    : `Theo dõi sát biến động sản lượng để chủ động bố trí nguồn lực.`
  const autoSol5 = `Thiết lập KPI tuần tới: Giao 24h ≥ 80% | Chưa giao < 10% tổng đơn trực tiếp.`

  const [sol1, setSol1] = useWeekField(weekKey, 'sol1', autoSol1)
  const [sol2, setSol2] = useWeekField(weekKey, 'sol2', autoSol2)
  const [sol3, setSol3] = useWeekField(weekKey, 'sol3', autoSol3)
  const [sol4, setSol4] = useWeekField(weekKey, 'sol4', autoSol4)
  const [sol5, setSol5] = useWeekField(weekKey, 'sol5', autoSol5)

  if (loading) {
    return (
      <div className="text-center py-24 text-gray-400">
        <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
        <p>Đang tải dữ liệu...</p>
      </div>
    )
  }

  const overviewRows = [
    { label: 'Tổng đơn kho HCM', v1: previous.grandTotal, v2: current.grandTotal, icon: Package, color: '#1e3a5f' },
    { label: 'Đơn C', v1: previous.totalC, v2: current.totalC, icon: Truck, color: '#3b82f6' },
    { label: 'Đơn DTP', v1: previous.totalDTP, v2: current.totalDTP, icon: Package, color: '#14b8a6' },
    { label: 'Đơn SO3 + SO6', v1: previous.totalTMDT, v2: current.totalTMDT, icon: BarChart2, color: '#f97316' },
    { label: 'Giao hàng trực tiếp', v1: previous.tructiepTotalC + previous.tructiepTotalDTP, v2: current.tructiepTotalC + current.tructiepTotalDTP, icon: Truck, color: '#22c55e' },
    { label: 'COD Viettelpost', v1: (previous.viettelC?.total || 0) + (previous.viettelDTP?.total || 0), v2: (current.viettelC?.total || 0) + (current.viettelDTP?.total || 0), icon: Handshake, color: '#f59e0b' },
    { label: 'COD SPX', v1: previous.spxC?.total || 0, v2: current.spxC?.total || 0, icon: Handshake, color: '#ef4444' },
  ]

  const chartData = overviewRows.map(r => ({ name: r.label, 'Tuần 1': r.v1, 'Tuần 2': r.v2 }))

  return (
    <div className="-m-5 p-5" style={{ background: 'radial-gradient(circle at 15% 0%, #eff6ff 0%, #f8fafc 45%, #f1f5f9 100%)' }}>
      <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-[0_2px_16px_rgba(15,23,42,0.06)] px-6 py-5 mb-5">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(#1e3a5f 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
        <div className="relative flex items-center justify-between gap-3 mb-1">
          <input
            value={reportTitle}
            onChange={e => setReportTitle(e.target.value)}
            className="text-2xl font-extrabold text-[#0f2744] border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded px-1 bg-transparent w-full tracking-tight"
          />
          <button onClick={refresh} className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:bg-gray-50 flex-shrink-0 bg-white">
            <RefreshCw size={13} /> Làm mới
          </button>
        </div>
        <p className="relative text-sm text-gray-400">Đánh giá tổng quan · Kết luận · Giải pháp cho tuần tiếp theo</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* 1. Tổng quan sản lượng */}
        <SectionCard accent="#3b82f6">
          <SectionHeader num={1} title="TỔNG QUAN SẢN LƯỢNG" icon={BarChart2} color="#3b82f6" />
          <OverviewTable rows={overviewRows} />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={110} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Tuần 1" fill="#93c5fd" radius={[0, 3, 3, 0]} />
              <Bar dataKey="Tuần 2" fill="#1e3a5f" radius={[0, 3, 3, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </SectionCard>

        {/* 2. Hiệu suất giao hàng trực tiếp */}
        <SectionCard accent="#22c55e">
          <SectionHeader num={2} title="HIỆU SUẤT GIAO HÀNG TRỰC TIẾP" icon={Truck} color="#22c55e" />
          <table className="w-full text-sm mb-3">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 text-xs font-semibold text-gray-400">Chỉ số</th>
                <th className="text-center py-2 text-xs font-semibold text-gray-400">Tuần 1</th>
                <th className="text-center py-2 text-xs font-semibold text-gray-400">Tuần 2</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><Clock size={13} className="text-green-500" />Giao 24h</td>
                <td className="py-2 text-center text-gray-500">{previous.gh24} đơn ({previous.rate24h.toFixed(1)}%)</td>
                <td className={`py-2 text-center font-bold ${rate24hDrop ? 'text-red-500' : 'text-green-600'}`}>{current.gh24} đơn ({current.rate24h.toFixed(1)}%)</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><Clock size={13} className="text-teal-500" />Giao 48h</td>
                <td className="py-2 text-center text-gray-500">{previous.gh48}</td>
                <td className="py-2 text-center font-bold text-gray-800">{current.gh48}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><Clock size={13} className="text-blue-500" />Giao 72h</td>
                <td className="py-2 text-center text-gray-500">{previous.gh72}</td>
                <td className="py-2 text-center font-bold text-gray-800">{current.gh72}</td>
              </tr>
              <tr>
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><AlertTriangle size={13} className="text-yellow-500" />Chưa giao</td>
                <td className="py-2 text-center text-gray-500">{previous.chuaGiao}</td>
                <td className={`py-2 text-center font-bold ${chuaGiaoUp ? 'text-red-500' : 'text-gray-800'}`}>{current.chuaGiao}</td>
              </tr>
            </tbody>
          </table>

          <div className="space-y-2">
            {rate24hDrop && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5 shadow-sm">
                <span className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={16} className="text-red-500" />
                </span>
                <span className="text-xs font-semibold text-red-700">Tỷ lệ giao 24h giảm ({previous.rate24h.toFixed(1)}% → {current.rate24h.toFixed(1)}%)</span>
              </div>
            )}
            {chuaGiaoUp && (
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 shadow-sm">
                <span className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle size={16} className="text-amber-500" />
                </span>
                <span className="text-xs font-semibold text-amber-700">Chưa giao tăng từ {previous.chuaGiao} lên {current.chuaGiao} đơn</span>
              </div>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* 4. Đánh giá & kết luận */}
        <SectionCard accent="#6366f1">
          <SectionHeader num={4} title="ĐÁNH GIÁ & KẾT LUẬN" icon={ClipboardList} color="#6366f1" />
          <div className="space-y-2">
            <InsightCard icon={TrendingUp} color="#22c55e" title="Tăng trưởng" text={insight1} onTextChange={setInsight1} editable
              placeholder="VD: Tổng đơn tăng X%, chủ yếu từ nhóm..." />
            <InsightCard icon={TrendingDown} color="#ef4444" title="Chất lượng giao hàng" text={insight2} onTextChange={setInsight2} editable />
            <InsightCard icon={Users} color="#a855f7" title="Nguyên nhân chính" text={insight3} onTextChange={setInsight3} editable />
          </div>
        </SectionCard>

        {/* Đối tác vận chuyển */}
        <SectionCard accent="#1e3a5f">
          <div className="flex items-center gap-2.5 mb-4">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#1e3a5f12' }}>
              <Handshake size={16} className="text-[#1e3a5f]" />
            </span>
            <h3 className="font-bold text-gray-800 tracking-wide text-[15px]">ĐỐI TÁC VẬN CHUYỂN</h3>
          </div>

          <div className="mb-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center text-[8px] font-bold shadow-sm">VTP</span>
              <span className="text-sm font-semibold text-gray-700">Viettel Post</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr><th></th><th className="text-center text-gray-400 font-medium">Tuần 1</th><th></th><th className="text-center text-gray-400 font-medium">Tuần 2</th></tr>
              </thead>
              <tbody>
                <PartnerCompareRow label="Tổng đơn" v1={(previous.viettelC?.total || 0) + (previous.viettelDTP?.total || 0)} v2={(current.viettelC?.total || 0) + (current.viettelDTP?.total || 0)} />
                <PartnerCompareRow label="Giao 24h" v1={(previous.viettelC?.stats['24h'] || 0) + (previous.viettelDTP?.stats['24h'] || 0)} v2={(current.viettelC?.stats['24h'] || 0) + (current.viettelDTP?.stats['24h'] || 0)} />
                <PartnerCompareRow label="Đang vận chuyển" v1={(previous.viettelC?.stats.dangVanChuyen || 0) + (previous.viettelDTP?.stats.dangVanChuyen || 0)} v2={(current.viettelC?.stats.dangVanChuyen || 0) + (current.viettelDTP?.stats.dangVanChuyen || 0)} />
              </tbody>
            </table>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-7 h-7 rounded-full bg-orange-500 text-white flex items-center justify-center text-[8px] font-bold shadow-sm">SPX</span>
              <span className="text-sm font-semibold text-gray-700">SPX Express</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr><th></th><th className="text-center text-gray-400 font-medium">Tuần 1</th><th></th><th className="text-center text-gray-400 font-medium">Tuần 2</th></tr>
              </thead>
              <tbody>
                <PartnerCompareRow label="Tổng đơn" v1={previous.spxC?.total || 0} v2={current.spxC?.total || 0} />
                <PartnerCompareRow label="Giao 24h" v1={previous.spxC?.stats['24h'] || 0} v2={current.spxC?.stats['24h'] || 0} />
                <PartnerCompareRow label="Giao 72h" v1={previous.spxC?.stats['72h'] || 0} v2={current.spxC?.stats['72h'] || 0} />
                <PartnerCompareRow label="Đang vận chuyển" v1={previous.spxC?.stats.dangVanChuyen || 0} v2={current.spxC?.stats.dangVanChuyen || 0} />
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* 5. Giải pháp tuần tiếp theo */}
      <SectionCard accent="#1e3a5f">
        <SectionHeader num={5} title="GIẢI PHÁP TUẦN TIẾP THEO" icon={Target} color="#1e3a5f" />
        <div className="flex flex-wrap gap-3">
          <SolutionCard num={1} text={sol1} onChange={setSol1} />
          <SolutionCard num={2} text={sol2} onChange={setSol2} />
          <SolutionCard num={3} text={sol3} onChange={setSol3} />
          <SolutionCard num={4} text={sol4} onChange={setSol4} />
          <SolutionCard num={5} text={sol5} onChange={setSol5} />
        </div>
      </SectionCard>
    </div>
  )
}
