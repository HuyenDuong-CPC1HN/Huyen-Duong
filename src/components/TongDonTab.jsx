import { useMemo, useState, useEffect } from 'react'
import {
  RefreshCw, TrendingUp, TrendingDown, Package, Truck, Users, ClipboardList,
  Handshake, Target, AlertTriangle, Clock, ArrowRight, BarChart2,
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from 'recharts'
import { useWeeklyData } from '../useWeeklyData'
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

function saveWeekField(weekKey, field, value) {
  if (!weekKey) return
  localStorage.setItem(`tongdon_field_${field}_${weekKey}`, String(value))
}

function useTypeData(type) {
  const { weeks, activeWeek, activeId } = useWeeklyData(type)
  const rawData = activeWeek ? activeWeek.data : []

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
    loading: false,
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

// Tổng "Chưa giao" của Giao hàng trực tiếp — lấy đúng nguồn với tab Thống kê giao hàng, theo đúng tuần đang xem
// (tổng các ô Bệnh viện/Nhà thuốc/KH ONL trong "Phân loại đơn chưa giao theo khách hàng")
function readKhBreakdownSum(type, weekId) {
  const khValues = readJSON(`chuagiao_kh_${type}_tructIep_${weekId || 'live'}`, {})
  return Object.values(khValues).reduce((s, v) => s + (Number(v) || 0), 0)
}

// Số đơn chành xe "chưa gửi" / "chưa giao" nhập tay theo đúng tuần — lấy cùng nguồn với tab Thống kê giao hàng
function readChanhXeOverride(weekId, field) {
  const v = localStorage.getItem(`chuagiao_override_donC_chanhXe_${weekId || 'live'}_${field}`)
  return v === null ? 0 : Number(v)
}

// Tổng hợp toàn bộ chỉ số cho 1 tuần (Đơn C + Đơn DTP), có thể là tuần hiện tại hoặc tuần trước
function computeWeekReport({ dataC, dataDTP, weekIdC, weekIdDTP, tmdtTotal, viettelCompareC, spxCompareC, viettelCompareDTP }) {
  const groupsC = buildGroups(dataC)
  const groupsDTP = buildGroups(dataDTP)
  const bC = trucTiepBuckets(groupsC.tructiep)
  const bDTP = trucTiepBuckets(groupsDTP.tructiep)

  const chuaGiaoC = readKhBreakdownSum('donC', weekIdC)
  const chuaGiaoDTP = readKhBreakdownSum('donDTP', weekIdDTP)
  const hangGuiC = 0
  const hangGuiDTP = 0

  const tructiepTotalC = bC[24] + bC[48] + bC[72] + chuaGiaoC + hangGuiC
  const tructiepTotalDTP = bDTP[24] + bDTP[48] + bDTP[72] + chuaGiaoDTP + hangGuiDTP

  const chanhXeChuaGui = readChanhXeOverride(weekIdC, 'chuagui')
  const chanhXeChuaGiao = readChanhXeOverride(weekIdC, 'chuagiao')
  const chanhXeTotal = groupsC.chanhxe.length + chanhXeChuaGui

  // Nếu không có dữ liệu file VTP/SPX đã upload cho đúng tuần này (vd chưa từng upload tuần trước đó),
  // lùi về đếm theo phân loại "Đối tác vận chuyển" trong file Excel nội bộ — giống cách các khung khác trong app làm.
  const viettelTotalC = viettelCompareC ? viettelCompareC.total : groupsC.viettel.length
  const spxTotalC = spxCompareC ? spxCompareC.total : groupsC.spx.length
  const viettelTotalDTP = viettelCompareDTP ? viettelCompareDTP.total : groupsDTP.viettel.length

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
    tructiepTotalC, tructiepTotalDTP, chanhXeTotal, chanhXeChuaGiao, codC, codDTP,
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
          <th className="text-center py-2 text-xs font-semibold text-gray-400 w-20">Tuần này</th>
          <th className="text-center py-2 text-xs font-semibold text-gray-400 w-20">Tuần trước</th>
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
            <td className="py-2.5 text-center font-bold text-gray-800">{r.v1.toLocaleString('vi-VN')}</td>
            <td className="py-2.5 text-center text-gray-600">{r.v2.toLocaleString('vi-VN')}</td>
            <td className="py-2.5 text-center"><DeltaCell v1={r.v2} v2={r.v1} /></td>
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
        {editable && onTextChange ? (
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


// cur = tuần này (Tuần này), prev = tuần trước (Tuần trước)
function PartnerCompareRow({ label, cur, prev }) {
  return (
    <tr className="border-b border-gray-50">
      <td className="py-1.5 text-gray-500">{label}</td>
      <td className={`py-1.5 text-center font-bold ${cur >= prev ? 'text-green-600' : 'text-red-500'}`}>{cur.toLocaleString('vi-VN')}</td>
      <td className="py-1.5 text-center"><ArrowRight size={11} className="inline text-gray-300 rotate-180" /></td>
      <td className="py-1.5 text-center text-gray-500">{prev.toLocaleString('vi-VN')}</td>
    </tr>
  )
}

function SolutionCard({ num, text, onChange }) {
  return (
    <div className="bg-gray-50/70 rounded-xl border border-gray-100 p-3 flex gap-2 flex-1 min-w-[180px] hover:bg-gray-50 transition-colors">
      <span className="w-6 h-6 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">{num}</span>
      {onChange ? (
        <textarea
          value={text}
          onChange={e => onChange(e.target.value)}
          rows={3}
          className="w-full text-xs text-gray-600 resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded bg-transparent"
        />
      ) : (
        <p className="w-full text-xs text-gray-600">{text}</p>
      )}
    </div>
  )
}

export default function TongDonTab() {
  const donC = useTypeData('donC')
  const donDTP = useTypeData('donDTP')

  const tmdtReports = useMemo(() => readJSON('tmdt_reports', []), [])
  const tmdtCurrent = tmdtReports[0]?.total || 0
  const tmdtPrev = tmdtReports[1]?.total || 0

  const loading = donC.loading || donDTP.loading

  // Khóa "tuần" dùng để lưu các trường nhập tay (chưa giao, hàng gửi, nhân sự, kết luận, giải pháp...)
  const weekKey = `${donC.activeId || 'x'}_${donDTP.activeId || 'x'}`
  const prevWeekKey = donC.prevWeekId || donDTP.prevWeekId ? `${donC.prevWeekId || 'x'}_${donDTP.prevWeekId || 'x'}` : null

  const viettelCompareC = getCarrierHistoryCompare('donC_viettel', 'viettel', donC.validData)
  const spxCompareC = getCarrierHistoryCompare('donC_spx', 'spx', donC.validData)
  const viettelCompareDTP = getCarrierHistoryCompare('donDTP_viettel', 'viettel', donDTP.validData)

  const viettelCurrentC = getCarrierFileStats('donC_viettel', 'viettel', donC.validData) || viettelCompareC.current
  const spxCurrentC = getCarrierFileStats('donC_spx', 'spx', donC.validData) || spxCompareC.current
  const viettelCurrentDTP = getCarrierFileStats('donDTP_viettel', 'viettel', donDTP.validData) || viettelCompareDTP.current

  const liveCurrent = useMemo(() => computeWeekReport({
    dataC: donC.validData, dataDTP: donDTP.validData,
    weekIdC: donC.activeId || 'live', weekIdDTP: donDTP.activeId || 'live', tmdtTotal: tmdtCurrent,
    viettelCompareC: viettelCurrentC, spxCompareC: spxCurrentC, viettelCompareDTP: viettelCurrentDTP,
  }), [donC.validData, donDTP.validData, donC.activeId, donDTP.activeId, tmdtCurrent, viettelCurrentC, spxCurrentC, viettelCurrentDTP])

  const livePrevious = useMemo(() => computeWeekReport({
    dataC: donC.prevValidData || [], dataDTP: donDTP.prevValidData || [],
    weekIdC: donC.prevWeekId, weekIdDTP: donDTP.prevWeekId, tmdtTotal: tmdtPrev,
    viettelCompareC: viettelCompareC.previous, spxCompareC: spxCompareC.previous, viettelCompareDTP: viettelCompareDTP.previous,
  }), [donC.prevValidData, donDTP.prevValidData, donC.prevWeekId, donDTP.prevWeekId, tmdtPrev, viettelCompareC, spxCompareC, viettelCompareDTP])

  // ---- Lịch sử báo cáo: mỗi lần bấm "Lưu báo cáo" sẽ đóng băng toàn bộ số liệu hiện tại thành 1 bản ghi cố định ----
  const [reports, setReports] = useState(() => readJSON('tongdon_reports', []))
  const [viewingId, setViewingId] = useState(null) // null = đang xem trực tiếp (live)
  const snapshot = viewingId ? reports.find(r => r.id === viewingId) : null
  const isReadOnly = !!snapshot

  const current = snapshot ? snapshot.current : liveCurrent
  const previous = snapshot ? snapshot.previous : livePrevious

  // Trường nhập tay theo tuần hiện tại
  const [chuaGiaoC, setChuaGiaoC] = useWeekField(weekKey, 'chuaGiaoC', '0')
  const [chuaGiaoDTP, setChuaGiaoDTP] = useWeekField(weekKey, 'chuaGiaoDTP', '0')
  const [hangGuiC, setHangGuiC] = useWeekField(weekKey, 'hangGuiC', '0')
  const [hangGuiDTP, setHangGuiDTP] = useWeekField(weekKey, 'hangGuiDTP', '0')
  useEffect(() => { saveWeekField(weekKey, 'chuaGiaoC', chuaGiaoC) }, [weekKey, chuaGiaoC])
  useEffect(() => { saveWeekField(weekKey, 'chuaGiaoDTP', chuaGiaoDTP) }, [weekKey, chuaGiaoDTP])
  useEffect(() => { saveWeekField(weekKey, 'hangGuiC', hangGuiC) }, [weekKey, hangGuiC])
  useEffect(() => { saveWeekField(weekKey, 'hangGuiDTP', hangGuiDTP) }, [weekKey, hangGuiDTP])

  const [reportTitleLive, setReportTitle] = useWeekField(weekKey, 'title', 'Báo cáo giao hàng - CN HCM')
  const reportTitle = snapshot ? snapshot.title : reportTitleLive

  // ---- Tự động sinh nhận định dựa trên số liệu Tuần này vs Tuần trước ----
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

  const [insight1Live, setInsight1] = useWeekField(weekKey, 'insight1', autoInsight1)
  const [insight2Live, setInsight2] = useWeekField(weekKey, 'insight2', autoInsight2)
  const [insight3Live, setInsight3] = useWeekField(weekKey, 'insight3', autoInsight3)
  const insight1 = snapshot ? snapshot.insight1 : insight1Live
  const insight2 = snapshot ? snapshot.insight2 : insight2Live
  const insight3 = snapshot ? snapshot.insight3 : insight3Live

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

  const [sol1Live, setSol1] = useWeekField(weekKey, 'sol1', autoSol1)
  const [sol2Live, setSol2] = useWeekField(weekKey, 'sol2', autoSol2)
  const [sol3Live, setSol3] = useWeekField(weekKey, 'sol3', autoSol3)
  const [sol4Live, setSol4] = useWeekField(weekKey, 'sol4', autoSol4)
  const [sol5Live, setSol5] = useWeekField(weekKey, 'sol5', autoSol5)
  const sol1 = snapshot ? snapshot.sol1 : sol1Live
  const sol2 = snapshot ? snapshot.sol2 : sol2Live
  const sol3 = snapshot ? snapshot.sol3 : sol3Live
  const sol4 = snapshot ? snapshot.sol4 : sol4Live
  const sol5 = snapshot ? snapshot.sol5 : sol5Live

  // Lưu toàn bộ số liệu + nhận định đang xem (live) thành 1 báo cáo cố định, không đổi khi dữ liệu sau này thay đổi
  const saveReport = () => {
    const id = String(Date.now())
    const label = `${reportTitleLive || 'Báo cáo'} · ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    const entry = {
      id, createdAt: new Date().toISOString(), label,
      current: liveCurrent, previous: livePrevious,
      title: reportTitleLive,
      insight1: insight1Live, insight2: insight2Live, insight3: insight3Live,
      sol1: sol1Live, sol2: sol2Live, sol3: sol3Live, sol4: sol4Live, sol5: sol5Live,
    }
    const next = [entry, ...reports].slice(0, 52)
    setReports(next)
    localStorage.setItem('tongdon_reports', JSON.stringify(next))
    setViewingId(id)
  }

  const removeReport = (id) => {
    const next = reports.filter(r => r.id !== id)
    setReports(next)
    localStorage.setItem('tongdon_reports', JSON.stringify(next))
    if (viewingId === id) setViewingId(null)
  }

  if (loading) {
    return (
      <div className="text-center py-24 text-gray-400">
        <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
        <p>Đang tải dữ liệu...</p>
      </div>
    )
  }

  const overviewRows = [
    { label: 'Tổng đơn kho HCM', v1: current.grandTotal, v2: previous.grandTotal, icon: Package, color: '#1e3a5f' },
    { label: 'Đơn C', v1: current.totalC, v2: previous.totalC, icon: Truck, color: '#3b82f6' },
    { label: 'Đơn DTP', v1: current.totalDTP, v2: previous.totalDTP, icon: Package, color: '#14b8a6' },
    { label: 'Đơn SO3 + SO6', v1: current.totalTMDT, v2: previous.totalTMDT, icon: BarChart2, color: '#f97316' },
    { label: 'Giao hàng trực tiếp', v1: current.tructiepTotalC + current.tructiepTotalDTP, v2: previous.tructiepTotalC + previous.tructiepTotalDTP, icon: Truck, color: '#22c55e' },
    { label: 'COD Viettelpost', v1: (current.viettelC?.total || 0) + (current.viettelDTP?.total || 0), v2: (previous.viettelC?.total || 0) + (previous.viettelDTP?.total || 0), icon: Handshake, color: '#f59e0b' },
    { label: 'COD SPX', v1: current.spxC?.total || 0, v2: previous.spxC?.total || 0, icon: Handshake, color: '#ef4444' },
  ]

  const chartData = overviewRows.map(r => ({ name: r.label, 'Tuần này': r.v1, 'Tuần trước': r.v2 }))

  return (
    <div className="-m-5 p-5" style={{ background: 'radial-gradient(circle at 15% 0%, #eff6ff 0%, #f8fafc 45%, #f1f5f9 100%)' }}>
      <div className="relative overflow-hidden rounded-2xl bg-white border border-gray-100 shadow-[0_2px_16px_rgba(15,23,42,0.06)] px-6 py-5 mb-5">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'radial-gradient(#1e3a5f 1px, transparent 1px)', backgroundSize: '14px 14px' }} />
        <div className="relative flex items-center justify-between gap-3 mb-1">
          {isReadOnly ? (
            <h2 className="text-2xl font-extrabold text-[#0f2744] tracking-tight">{reportTitle}</h2>
          ) : (
            <input
              value={reportTitle}
              onChange={e => setReportTitle(e.target.value)}
              className="text-2xl font-extrabold text-[#0f2744] border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded px-1 bg-transparent w-full tracking-tight"
            />
          )}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isReadOnly ? (
              <button onClick={() => setViewingId(null)} className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 text-blue-600 rounded-lg text-sm hover:bg-blue-50 bg-white">
                <ArrowRight size={13} className="rotate-180" /> Quay lại xem trực tiếp
              </button>
            ) : (
              <button onClick={saveReport} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-sm hover:bg-[#16304f]">
                <ClipboardList size={13} /> Lưu báo cáo tuần này
              </button>
            )}
          </div>
        </div>
        <p className="relative text-sm text-gray-400 mb-3">
          {isReadOnly
            ? `Báo cáo đã lưu · ${new Date(snapshot.createdAt).toLocaleString('vi-VN')}`
            : 'Đánh giá tổng quan · Kết luận · Giải pháp cho tuần tiếp theo'}
        </p>

        {reports.length > 0 && (
          <div className="relative flex flex-wrap items-center gap-1.5 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400 mr-1">Lịch sử báo cáo:</span>
            <button
              onClick={() => setViewingId(null)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors ${
                !viewingId ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
              }`}
            >
              Trực tiếp (live)
            </button>
            {reports.map(r => (
              <span key={r.id} className="inline-flex items-center">
                <button
                  onClick={() => setViewingId(r.id)}
                  className={`px-2.5 py-1 rounded-l-lg text-xs font-medium border transition-colors ${
                    viewingId === r.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300 hover:text-blue-600'
                  }`}
                >
                  {r.label}
                </button>
                <button
                  onClick={() => removeReport(r.id)}
                  className={`px-1.5 py-1 rounded-r-lg text-xs border border-l-0 ${
                    viewingId === r.id ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' : 'bg-white text-gray-400 border-gray-200 hover:text-red-500'
                  }`}
                  title="Xoá báo cáo này"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* 1. Tổng quan sản lượng */}
        <SectionCard accent="#3b82f6">
          <SectionHeader num={1} title="TỔNG QUAN SẢN LƯỢNG" icon={BarChart2} color="#3b82f6" />
          <OverviewTable rows={overviewRows} />
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 35, left: 10, bottom: 5 }} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Tuần trước" fill="#93c5fd" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="Tuần trước" position="right" fontSize={11} fill="#3b82f6" formatter={v => v.toLocaleString('vi-VN')} />
              </Bar>
              <Bar dataKey="Tuần này" fill="#1e3a5f" radius={[0, 3, 3, 0]}>
                <LabelList dataKey="Tuần này" position="right" fontSize={11} fill="#1e3a5f" fontWeight={600} formatter={v => v.toLocaleString('vi-VN')} />
              </Bar>
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
                <th className="text-center py-2 text-xs font-semibold text-gray-400">Tuần này</th>
                <th className="text-center py-2 text-xs font-semibold text-gray-400">Tuần trước</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50">
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><Clock size={13} className="text-green-500" />Giao 24h</td>
                <td className={`py-2 text-center font-bold ${rate24hDrop ? 'text-red-500' : 'text-green-600'}`}>{current.gh24} đơn ({current.rate24h.toFixed(1)}%)</td>
                <td className="py-2 text-center text-gray-500">{previous.gh24} đơn ({previous.rate24h.toFixed(1)}%)</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><Clock size={13} className="text-teal-500" />Giao 48h</td>
                <td className="py-2 text-center font-bold text-gray-800">{current.gh48}</td>
                <td className="py-2 text-center text-gray-500">{previous.gh48}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><Clock size={13} className="text-blue-500" />Giao 72h</td>
                <td className="py-2 text-center font-bold text-gray-800">{current.gh72}</td>
                <td className="py-2 text-center text-gray-500">{previous.gh72}</td>
              </tr>
              <tr>
                <td className="py-2 flex items-center gap-1.5 text-gray-600"><AlertTriangle size={13} className="text-yellow-500" />Chưa giao</td>
                <td className={`py-2 text-center font-bold ${chuaGiaoUp ? 'text-red-500' : 'text-gray-800'}`}>{current.chuaGiao}</td>
                <td className="py-2 text-center text-gray-500">{previous.chuaGiao}</td>
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
            <InsightCard icon={TrendingUp} color="#22c55e" title="Tăng trưởng" text={insight1} onTextChange={isReadOnly ? undefined : setInsight1} editable
              placeholder="VD: Tổng đơn tăng X%, chủ yếu từ nhóm..." />
            <InsightCard icon={TrendingDown} color="#ef4444" title="Chất lượng giao hàng" text={insight2} onTextChange={isReadOnly ? undefined : setInsight2} editable />
            <InsightCard icon={Users} color="#a855f7" title="Nguyên nhân chính" text={insight3} onTextChange={isReadOnly ? undefined : setInsight3} editable />
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
                <tr><th></th><th className="text-center text-gray-400 font-medium">Tuần này</th><th></th><th className="text-center text-gray-400 font-medium">Tuần trước</th></tr>
              </thead>
              <tbody>
                <PartnerCompareRow label="Tổng đơn" cur={(current.viettelC?.total || 0) + (current.viettelDTP?.total || 0)} prev={(previous.viettelC?.total || 0) + (previous.viettelDTP?.total || 0)} />
                <PartnerCompareRow label="Giao 24h" cur={(current.viettelC?.stats['24h'] || 0) + (current.viettelDTP?.stats['24h'] || 0)} prev={(previous.viettelC?.stats['24h'] || 0) + (previous.viettelDTP?.stats['24h'] || 0)} />
                <PartnerCompareRow label="Đang vận chuyển" cur={(current.viettelC?.stats.dangVanChuyen || 0) + (current.viettelDTP?.stats.dangVanChuyen || 0)} prev={(previous.viettelC?.stats.dangVanChuyen || 0) + (previous.viettelDTP?.stats.dangVanChuyen || 0)} />
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
                <tr><th></th><th className="text-center text-gray-400 font-medium">Tuần này</th><th></th><th className="text-center text-gray-400 font-medium">Tuần trước</th></tr>
              </thead>
              <tbody>
                <PartnerCompareRow label="Tổng đơn" cur={current.spxC?.total || 0} prev={previous.spxC?.total || 0} />
                <PartnerCompareRow label="Giao 24h" cur={current.spxC?.stats['24h'] || 0} prev={previous.spxC?.stats['24h'] || 0} />
                <PartnerCompareRow label="Giao 72h" cur={current.spxC?.stats['72h'] || 0} prev={previous.spxC?.stats['72h'] || 0} />
                <PartnerCompareRow label="Đang vận chuyển" cur={current.spxC?.stats.dangVanChuyen || 0} prev={previous.spxC?.stats.dangVanChuyen || 0} />
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* 5. Giải pháp tuần tiếp theo */}
      <SectionCard accent="#1e3a5f">
        <SectionHeader num={5} title="GIẢI PHÁP TUẦN TIẾP THEO" icon={Target} color="#1e3a5f" />
        <div className="flex flex-wrap gap-3">
          <SolutionCard num={1} text={sol1} onChange={isReadOnly ? undefined : setSol1} />
          <SolutionCard num={2} text={sol2} onChange={isReadOnly ? undefined : setSol2} />
          <SolutionCard num={3} text={sol3} onChange={isReadOnly ? undefined : setSol3} />
          <SolutionCard num={4} text={sol4} onChange={isReadOnly ? undefined : setSol4} />
          <SolutionCard num={5} text={sol5} onChange={isReadOnly ? undefined : setSol5} />
        </div>
      </SectionCard>
    </div>
  )
}
