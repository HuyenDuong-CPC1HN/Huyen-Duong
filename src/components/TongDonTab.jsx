import { useMemo, useState, useEffect } from 'react'
import { RefreshCw, ClipboardList, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useWeeklyData } from '../useWeeklyData'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { readSheetReports } from '../utils/sheetReports'
import {
  getCarrierFileStats, pickCarrierWeekIdByDate, pruneCarrierWeeksToIds, carrierWeekHasRows,
} from './CarrierStats'

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

// Gộp các tuần Excel còn sống (chưa lưu/xoá) với các tuần đã "Lưu số liệu tuần này" (Excel gốc đã bị xoá,
// chỉ còn số liệu đóng băng) thành 1 dòng thời gian chung, mới nhất lên đầu — "current"/"previous" luôn lấy
// đúng 2 mục gần nhất bất kể nó còn Excel sống hay đã chốt số liệu.
function useTypeData(type) {
  const { weeks, pruneToIds } = useWeeklyData(type)
  const savedReports = useMemo(() => readSheetReports(type), [type])

  const vcEdits = useMemo(() => readJSON(`vc_edits_${type}`, {}), [])

  const timeline = useMemo(() => {
    const live = weeks.map(w => ({
      id: w.id,
      kind: 'live',
      at: w.uploadedAt,
      label: w.label,
      data: w.data
        .map(row => {
          const key = row['Mã hóa đơn'] || ''
          return vcEdits[key] !== undefined ? { ...row, 'Đối tác vận chuyển': vcEdits[key] } : row
        })
        .filter(r => String(r['Mã kiện hàng'] ?? '').trim()),
    }))
    const saved = savedReports.map(r => ({ id: r.id, kind: 'saved', at: r.createdAt, snapshot: r }))
    return [...live, ...saved].sort((a, b) => new Date(b.at) - new Date(a.at))
  }, [weeks, savedReports, vcEdits])

  return {
    loading: false,
    timeline,
    current: timeline[0] || null,
    previous: timeline[1] || null,
    pruneToIds,
  }
}

// Dùng đúng tên tuần như hiển thị ở "Lịch sử upload" của tab Đơn C/DTP (vd "Đơn C - Tuần 4.7"), không hiện
// nhãn chung chung "Đã lưu"/"Excel sống" nữa — chỉ thêm hậu tố (Đã lưu) nếu Excel gốc đã bị xoá.
function formatEntryOption(e) {
  const label = (e.kind === 'saved' ? e.snapshot.label : e.label) || 'Tuần'
  const d = new Date(e.at)
  const dateStr = isNaN(d) ? '' : d.toLocaleDateString('vi-VN')
  return `${label}${e.kind === 'saved' ? ' (Đã lưu)' : ''} · ${dateStr}`
}

// Tìm mục có "at" (ngày) gần nhất với referenceDate trong 1 timeline (Đơn C/DTP) — dùng để tự khớp Đơn DTP
// theo đúng tuần Đơn C đã chọn, không cần chọn tay riêng từng nguồn.
function closestTimelineEntry(timeline, referenceDate) {
  if (timeline.length === 0) return null
  if (!referenceDate) return timeline[0]
  const refTime = new Date(referenceDate).getTime()
  let best = timeline[0]
  let bestDiff = Math.abs(new Date(best.at).getTime() - refTime)
  for (const e of timeline) {
    const diff = Math.abs(new Date(e.at).getTime() - refTime)
    if (diff < bestDiff) { best = e; bestDiff = diff }
  }
  return best
}

// Tương tự nhưng cho báo cáo TMĐT (dùng "dateFrom" làm mốc ngày, không có "at")
function closestTmdtReport(reports, referenceDate) {
  if (reports.length === 0) return null
  if (!referenceDate) return reports[0]
  const refTime = new Date(referenceDate).getTime()
  let best = reports[0]
  let bestDiff = Math.abs(new Date(best.dateFrom).getTime() - refTime)
  for (const r of reports) {
    const diff = Math.abs(new Date(r.dateFrom).getTime() - refTime)
    if (diff < bestDiff) { best = r; bestDiff = diff }
  }
  return best
}

// Bộ chọn tay "Tuần này"/"Tuần trước" cho 1 nguồn dữ liệu bất kỳ (Đơn C, Đơn DTP, Viettel Post, SPX, TMĐT) —
// mặc định dùng defaultCurrentId/defaultPreviousId (cách khớp tự động, thông minh), nhưng lưu lại lựa chọn tay
// riêng nếu người dùng tự chọn lại (vd khi hệ thống khớp sai tuần) để tránh nhầm lẫn khi so sánh báo cáo.
function usePickedPair(storageKey, options, defaultCurrentId, defaultPreviousId) {
  const [currentId, setCurrentIdRaw] = useState(() => localStorage.getItem(`tongdon_pick_${storageKey}_current`) || '')
  const [previousId, setPreviousIdRaw] = useState(() => localStorage.getItem(`tongdon_pick_${storageKey}_previous`) || '')

  const setCurrentId = (id) => {
    setCurrentIdRaw(id)
    if (id) localStorage.setItem(`tongdon_pick_${storageKey}_current`, id)
    else localStorage.removeItem(`tongdon_pick_${storageKey}_current`)
  }
  const setPreviousId = (id) => {
    setPreviousIdRaw(id)
    if (id) localStorage.setItem(`tongdon_pick_${storageKey}_previous`, id)
    else localStorage.removeItem(`tongdon_pick_${storageKey}_previous`)
  }

  // localStorage/<select> luôn lưu id dạng chuỗi, nhưng id gốc trong options có thể là số (vd TMĐT dùng
  // Date.now()) — so sánh dạng chuỗi để không bị lệch kiểu, rồi trả về đúng o.id gốc (giữ nguyên kiểu số/chuỗi)
  // để các chỗ dùng .find(e => e.id === pick.xxxId) ở nơi khác vẫn khớp được đúng lựa chọn tay của người dùng.
  const matchedCurrent = currentId ? options.find(o => String(o.id) === String(currentId)) : null
  const matchedPrevious = previousId ? options.find(o => String(o.id) === String(previousId)) : null
  const effectiveCurrentId = matchedCurrent ? matchedCurrent.id : (defaultCurrentId || options[0]?.id || null)
  const effectivePreviousId = matchedPrevious ? matchedPrevious.id : (defaultPreviousId || options[1]?.id || null)

  return { options, currentId: effectiveCurrentId, previousId: effectivePreviousId, setCurrentId, setPreviousId }
}

// Tuần VTP/SPX tương ứng 1 mục Đơn C/DTP (entry): nếu entry là báo cáo ĐÃ LƯU và có tham chiếu weekId đã
// đóng băng lúc lưu (viettelWeekId/spxWeekId) thì dùng ĐÚNG weekId đó — khớp chính xác với số "Tổng đơn" đã
// hiện ở tab Đơn C/DTP lúc lưu, không bị lệch nếu sau đó có upload thêm file VTP/SPX mới (date-matching sẽ
// đổi kết quả theo thời gian). Chỉ khi chưa có tham chiếu (báo cáo cũ trước khi có tính năng này, hoặc entry
// đang là Excel sống) mới tự khớp theo ngày gần nhất như cũ.
function resolveCarrierWeekId(entry, carrierKey, frozenField) {
  if (entry?.kind === 'saved' && entry.snapshot[frozenField]) return entry.snapshot[frozenField]
  return pickCarrierWeekIdByDate(carrierKey, entry?.at)
}

// Số liệu VTP/SPX ứng với 1 weekId cụ thể (đã chọn tay hoặc tự động khớp) — còn dòng dữ liệu gốc thì tính
// trực tiếp (luôn mới nhất), đã xoá rồi thì tìm đúng số đã đóng băng trong báo cáo Đơn C/DTP có tham chiếu
// weekId này. contextEntry (tuần Đơn C/DTP tương ứng) chỉ dùng để lấy internalData/carrierLookup cho chính xác
// hơn (đơn CB gộp) — không dùng contextEntry để suy ra weekId nữa vì đã có picker chọn tay riêng.
function statsForCarrierWeekId(carrierKey, carrierType, weekId, contextEntry) {
  if (!weekId) return null
  if (carrierWeekHasRows(carrierKey, weekId)) {
    const internalData = contextEntry?.kind === 'live' ? contextEntry.data : []
    const frozenLookup = contextEntry?.kind === 'saved' ? contextEntry.snapshot.carrierLookup : null
    return getCarrierFileStats(carrierKey, carrierType, internalData, weekId, frozenLookup)
  }
  // Rows đã xoá — tìm bản đã lưu (Đơn C hoặc Đơn DTP) có tham chiếu đúng weekId này để lấy số đã đóng băng
  for (const t of ['donC', 'donDTP']) {
    for (const r of readSheetReports(t)) {
      if (r.viettelWeekId === weekId && r.viettelFrozen) return r.viettelFrozen
      if (r.spxWeekId === weekId && r.spxFrozen) return r.spxFrozen
    }
  }
  return null
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

// Số liệu "Giao hàng trực tiếp" (mốc 24h/48h/72h) + số đơn Chành xe cho 1 bên (Đơn C hoặc Đơn DTP) —
// ưu tiên đọc bản đã "Lưu số liệu tuần này" (Excel gốc đã xoá), nếu chưa lưu thì tính trực tiếp từ Excel gốc.
function trucTiepStatsFor(entry) {
  if (!entry) return { b: { 24: 0, 48: 0, 72: 0 }, chanhXeCount: 0 }
  if (entry.kind === 'saved') {
    const s = entry.snapshot
    return { b: { 24: s.b24 || 0, 48: s.b48 || 0, 72: s.b72 || 0 }, chanhXeCount: s.chanhXeCount || 0 }
  }
  const groups = buildGroups(entry.data)
  return { b: trucTiepBuckets(groups.tructiep), chanhXeCount: groups.chanhxe.length }
}

// Tổng hợp toàn bộ chỉ số cho 1 tuần (Đơn C + Đơn DTP), có thể là tuần hiện tại hoặc tuần trước
function computeWeekReport({ entryC, entryDTP, tmdtTotal, viettelCompareC, spxCompareC, viettelCompareDTP }) {
  const weekIdC = entryC?.id || 'live'
  const weekIdDTP = entryDTP?.id || 'live'
  const { b: bC, chanhXeCount: chanhXeRowCountC } = trucTiepStatsFor(entryC)
  const { b: bDTP } = trucTiepStatsFor(entryDTP)

  const chuaGiaoC = readKhBreakdownSum('donC', weekIdC)
  const chuaGiaoDTP = readKhBreakdownSum('donDTP', weekIdDTP)
  const hangGuiC = 0
  const hangGuiDTP = 0

  const tructiepTotalC = bC[24] + bC[48] + bC[72] + chuaGiaoC + hangGuiC
  const tructiepTotalDTP = bDTP[24] + bDTP[48] + bDTP[72] + chuaGiaoDTP + hangGuiDTP

  const chanhXeChuaGui = readChanhXeOverride(weekIdC, 'chuagui')
  const chanhXeChuaGiao = readChanhXeOverride(weekIdC, 'chuagiao')
  const chanhXeTotal = chanhXeRowCountC + chanhXeChuaGui

  const viettelTotalC = viettelCompareC?.total || 0
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
    tructiepTotalC, tructiepTotalDTP, chanhXeTotal, chanhXeChuaGiao, codC, codDTP,
    gh24, gh48, gh72, chuaGiao, chuaGiaoC, chuaGiaoDTP, trucTiepTong,
    bC, bDTP, // mốc 24/48/72h riêng theo Đơn C và Đơn DTP — dùng cho biểu đồ chi tiết theo kênh
    rate24h: pct(gh24, trucTiepTong),
    viettelC: viettelCompareC, spxC: spxCompareC, viettelDTP: viettelCompareDTP,
  }
}

// ---------- UI bits (thiết kế báo cáo 2 cột so sánh tuần, theo mẫu dashboard) ----------
const TONE = {
  '24h': '#0E9A7D', '48h': '#D9A441', '72h': '#CC3F55', dangVanChuyen: '#59708F',
  chuaGiao: '#59708F', giaoLai: '#7C5CD9', hoanHang: '#B23A4A', choLay: '#2A6FB0',
}

function KpiCard({ label, cur, prev }) {
  const delta = prev ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0)
  const up = delta >= 0
  return (
    <div className="bg-white p-4">
      <div className="text-xs text-gray-500 mb-3">{label}</div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-extrabold text-[28px] leading-none text-[#0E9A7D]">{cur.toLocaleString('vi-VN')}</span>
        <span className="text-xs text-gray-300">/</span>
        <span className="font-mono text-sm text-[#B9720C]">{prev.toLocaleString('vi-VN')}</span>
      </div>
      <span className={`inline-flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded ${up ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(cur - prev).toLocaleString('vi-VN')} đơn ({fmtPctSigned(delta)})
      </span>
    </div>
  )
}

function BreakdownRow({ name, sub, value, pctOfTotal, color, chips }) {
  return (
    <div className="mb-3 last:mb-0">
      <div className="grid grid-cols-[110px_1fr_66px] items-center gap-3">
        <div className="text-[13px] text-gray-700 font-medium leading-tight">
          {name}<span className="block text-[10px] text-gray-400 font-normal mt-0.5">{sub}</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${Math.min(pctOfTotal, 100)}%`, background: color }} />
        </div>
        <div className="text-[13px] font-mono text-right text-gray-700">{value.toLocaleString('vi-VN')}</div>
      </div>
      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1.5 pl-[122px]">
          {chips.map((c, i) => (
            <span key={i} className="text-[10px] font-mono text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">{c}</span>
          ))}
        </div>
      )}
    </div>
  )
}

function StackBar({ segments }) {
  const total = segments.reduce((s, x) => s + (x.value || 0), 0)
  return (
    <div className="flex h-4 rounded overflow-hidden bg-gray-100">
      {total > 0 && segments.map((s, i) => s.value > 0 && (
        <div key={i} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} title={`${s.label || ''}: ${s.value}`} />
      ))}
    </div>
  )
}

function CarrierBlock({ color, name, total, groups, legend }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[13px] font-semibold text-gray-700 flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-sm inline-block" style={{ background: color }} />{name}
        </span>
        <span className="text-xs font-mono text-gray-400">{total.toLocaleString('vi-VN')} đơn</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {groups.map((g, i) => (
          <div key={i}>
            <div className="flex justify-between text-[10.5px] font-mono text-gray-400 mb-1">
              <span>{g.label} — {g.value.toLocaleString('vi-VN')} ({g.pctOfTotal}%)</span>
            </div>
            <StackBar segments={g.segments} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {legend.map((l, i) => (
          <span key={i} className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-sm inline-block flex-shrink-0" style={{ background: l.color }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// R = kết quả computeWeekReport cho 1 tuần (current hoặc previous)
function WeekColumn({ label, tag, color, bg, R }) {
  const tructiepTotal = R.tructiepTotalC + R.tructiepTotalDTP
  const vtpTotal = (R.viettelC?.total || 0) + (R.viettelDTP?.total || 0)
  const spxTotal = R.spxC?.total || 0

  const vtpSegments = (stats) => stats ? [
    { value: stats['24h'], color: TONE['24h'], label: '24h' },
    { value: stats['48h'], color: TONE['48h'], label: '48h' },
    { value: stats['72h'], color: TONE['72h'], label: '72h' },
    { value: stats.dangVanChuyen, color: TONE.dangVanChuyen, label: 'Đang vận chuyển' },
    { value: stats.choLay || 0, color: TONE.choLay, label: 'Chờ lấy' },
    { value: stats.giaoLai, color: TONE.giaoLai, label: 'Đang giao hàng' },
    { value: stats.hoanHang, color: TONE.hoanHang, label: 'Hoàn hàng' },
  ] : []

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-2.5 rounded-t-lg border" style={{ background: bg, borderColor: color }}>
        <span className="font-bold text-lg" style={{ color }}>{label}</span>
        <span className="text-[11px] font-mono text-gray-500 tracking-wide">{tag}</span>
      </div>

      <div className="bg-white border border-t-0 p-4" style={{ borderColor: color }}>
        <div className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold mb-3">Tổng quan đơn hàng</div>
        <div className="flex items-baseline gap-2 pb-3 mb-3 border-b border-gray-100">
          <span className="font-extrabold text-4xl" style={{ color }}>{R.grandTotal.toLocaleString('vi-VN')}</span>
          <span className="text-xs text-gray-400">đơn kho HCM</span>
        </div>
        <BreakdownRow name="Đơn C" sub={`${pct(R.totalC, R.grandTotal)}% tổng đơn kho`} value={R.totalC} pctOfTotal={pct(R.totalC, R.grandTotal)} color="#2A6FB0"
          chips={[`Trực tiếp ${R.tructiepTotalC.toLocaleString('vi-VN')}`, `Chành xe ${R.chanhXeTotal.toLocaleString('vi-VN')}`, `COD (VTP,SPX) ${R.codC.toLocaleString('vi-VN')}`]} />
        <BreakdownRow name="Đơn DTP" sub={`${pct(R.totalDTP, R.grandTotal)}% tổng đơn kho`} value={R.totalDTP} pctOfTotal={pct(R.totalDTP, R.grandTotal)} color="#6E4FC9"
          chips={[`Trực tiếp ${R.tructiepTotalDTP.toLocaleString('vi-VN')}`, `COD Viettelpost ${R.codDTP.toLocaleString('vi-VN')}`]} />
        <BreakdownRow name="SO3 + SO6" sub="Shopee, TikTok" value={R.totalTMDT} pctOfTotal={pct(R.totalTMDT, R.grandTotal)} color={color} />
      </div>

      <div className="bg-white border border-t-0 rounded-b-lg p-4 space-y-4" style={{ borderColor: color }}>
        <div className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Chi tiết giao hàng theo kênh</div>

        <CarrierBlock color={TONE['24h']} name="Giao hàng trực tiếp" total={tructiepTotal}
          groups={[
            { label: 'Đơn C', value: R.tructiepTotalC, pctOfTotal: pct(R.tructiepTotalC, tructiepTotal),
              segments: [
                { value: R.bC[24], color: TONE['24h'], label: '24h' },
                { value: R.bC[48], color: TONE['48h'], label: '48h' },
                { value: R.bC[72], color: TONE['72h'], label: '72h' },
                { value: R.chuaGiaoC, color: TONE.chuaGiao, label: 'Chưa giao' },
              ] },
            { label: 'Đơn DTP', value: R.tructiepTotalDTP, pctOfTotal: pct(R.tructiepTotalDTP, tructiepTotal),
              segments: [
                { value: R.bDTP[24], color: TONE['24h'], label: '24h' },
                { value: R.bDTP[48], color: TONE['48h'], label: '48h' },
                { value: R.bDTP[72], color: TONE['72h'], label: '72h' },
                { value: R.chuaGiaoDTP, color: TONE.chuaGiao, label: 'Chưa giao' },
              ] },
          ]}
          legend={[
            { label: 'Giao 24h', color: TONE['24h'] }, { label: 'Giao 48h', color: TONE['48h'] },
            { label: 'Giao 72h', color: TONE['72h'] }, { label: `Chưa giao (${R.chuaGiao} đơn)`, color: TONE.chuaGiao },
          ]}
        />

        <div className="h-px bg-gray-100" />

        <CarrierBlock color={TONE.giaoLai} name="Viettel Post" total={vtpTotal}
          groups={[
            R.viettelC && { label: 'Đơn C', value: R.viettelC.total, pctOfTotal: pct(R.viettelC.total, vtpTotal), segments: vtpSegments(R.viettelC.stats) },
            R.viettelDTP && { label: 'Đơn DTP', value: R.viettelDTP.total, pctOfTotal: pct(R.viettelDTP.total, vtpTotal), segments: vtpSegments(R.viettelDTP.stats) },
          ].filter(Boolean)}
          legend={[
            { label: '24h', color: TONE['24h'] }, { label: '48h', color: TONE['48h'] }, { label: '72h', color: TONE['72h'] },
            { label: 'Đang vận chuyển', color: TONE.dangVanChuyen }, { label: 'Chờ lấy', color: TONE.choLay },
            { label: 'Đang giao hàng', color: TONE.giaoLai }, { label: 'Hoàn hàng', color: TONE.hoanHang },
          ]}
        />

        {R.spxC && (
          <>
            <div className="h-px bg-gray-100" />
            <CarrierBlock color="#B9720C" name="SPX Express" total={spxTotal}
              groups={[{ label: 'Đơn C', value: R.spxC.total, pctOfTotal: 100, segments: vtpSegments(R.spxC.stats) }]}
              legend={[
                { label: '24h', color: TONE['24h'] }, { label: '48h', color: TONE['48h'] }, { label: '72h', color: TONE['72h'] },
                { label: 'Đang vận chuyển', color: TONE.dangVanChuyen }, { label: 'Đang giao hàng', color: TONE.giaoLai },
              ]}
            />
          </>
        )}
      </div>
    </div>
  )
}

const INSIGHT_TONE = { pos: '#1E9E5A', neg: '#CC3F55', warn: '#B9720C', neutral: '#59708F' }

function InsightCardV2({ tag, tone, title, body, onBodyChange, placeholder }) {
  const c = INSIGHT_TONE[tone] || INSIGHT_TONE.neutral
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3.5" style={{ borderLeft: `3px solid ${c}` }}>
      <span className="block text-[10px] font-mono uppercase tracking-wider mb-1.5" style={{ color: c }}>{tag}</span>
      <div className="text-[13.5px] font-semibold text-gray-800 mb-1.5 leading-snug">{title}</div>
      {onBodyChange ? (
        <textarea
          value={body} onChange={e => onBodyChange(e.target.value)} placeholder={placeholder} rows={3}
          className="w-full text-xs text-gray-500 leading-relaxed resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded bg-transparent"
        />
      ) : (
        <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
      )}
    </div>
  )
}

function VerdictBox({ text, onChange }) {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex gap-4 items-start">
      <span className="font-bold text-sm text-[#0E9A7D] bg-[#E4F5F0] border border-[#0B7A63] px-3 py-1.5 rounded flex-shrink-0 whitespace-nowrap">KẾT LUẬN</span>
      {onChange ? (
        <textarea
          value={text} onChange={e => onChange(e.target.value)} rows={3}
          className="w-full text-[13px] text-gray-600 leading-relaxed resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded bg-transparent"
        />
      ) : (
        <p className="text-[13px] text-gray-600 leading-relaxed">{text}</p>
      )}
    </div>
  )
}

const PRIORITY = {
  high: { label: 'Ưu tiên cao', cls: 'bg-red-50 text-red-500' },
  mid: { label: 'Ưu tiên vừa', cls: 'bg-amber-50 text-amber-600' },
  low: { label: 'Theo dõi', cls: 'bg-slate-100 text-slate-500' },
}

function PlanItem({ num, text, onChange, priority }) {
  const pr = PRIORITY[priority] || PRIORITY.low
  return (
    <div className="bg-white p-3.5 grid grid-cols-[28px_1fr_92px] gap-4 items-start border-b border-gray-100 last:border-b-0">
      <span className="font-extrabold text-lg text-gray-300 leading-none">{String(num).padStart(2, '0')}</span>
      {onChange ? (
        <textarea
          value={text} onChange={e => onChange(e.target.value)} rows={2}
          className="w-full text-xs text-gray-500 leading-relaxed resize-none border-0 focus:outline-none focus:ring-1 focus:ring-blue-200 rounded bg-transparent"
        />
      ) : (
        <p className="text-xs text-gray-500 leading-relaxed">{text}</p>
      )}
      <span className={`text-[10px] font-mono text-center px-2 py-1.5 rounded h-fit ${pr.cls}`}>{pr.label}</span>
    </div>
  )
}

function SourceRow({ label, pick }) {
  if (pick.options.length === 0) {
    return (
      <div className="grid grid-cols-[110px_1fr_1fr] items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <span className="text-xs text-gray-300 col-span-2">Chưa có dữ liệu</span>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-[110px_1fr_1fr] items-center gap-2 py-1.5 border-b border-gray-50 last:border-b-0">
      <span className="text-xs font-medium text-gray-600">{label}</span>
      <select
        value={pick.currentId || ''}
        onChange={e => pick.setCurrentId(e.target.value)}
        className="min-w-0 border border-gray-200 rounded px-1.5 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
      >
        {pick.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      <select
        value={pick.previousId || ''}
        onChange={e => pick.setPreviousId(e.target.value)}
        className="min-w-0 border border-gray-200 rounded px-1.5 py-1 text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-blue-300"
      >
        <option value="">— Không có —</option>
        {pick.options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

// Chọn tay 3 nguồn chính: Đơn C, Đơn DTP, TMĐT. Viettel Post/SPX (không có tuần riêng, chỉ là file upload)
// tự khớp theo ngày của Đơn C/DTP tương ứng — xem chi tiết thì qua đúng tab tương ứng, không lặp lại ở đây.
function DataSourcePicker({ open, onToggle, donCPick, donDTPPick, tmdtPick }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(15,23,42,0.06)] p-4 mb-4">
      <button onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold text-gray-700">Chọn tuần so sánh — Viettel Post/SPX tự khớp theo tuần Đơn C/DTP</span>
        {open ? <ChevronUp size={15} className="text-gray-400 flex-shrink-0" /> : <ChevronDown size={15} className="text-gray-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="mt-3">
          <div className="grid grid-cols-[110px_1fr_1fr] gap-2 mb-1 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            <span />
            <span>Tuần này</span>
            <span>Tuần trước</span>
          </div>
          <SourceRow label="Đơn C" pick={donCPick} />
          <SourceRow label="Đơn DTP" pick={donDTPPick} />
          <SourceRow label="TMĐT (SO3+SO6)" pick={tmdtPick} />
        </div>
      )}
    </div>
  )
}

export default function TongDonTab() {
  const donC = useTypeData('donC')
  const donDTP = useTypeData('donDTP')

  const tmdtReports = useMemo(() => readJSON('tmdt_reports', []), [])

  const loading = donC.loading || donDTP.loading

  // ---- Chọn tay 3 nguồn chính: Đơn C, Đơn DTP, TMĐT — Viettel Post/SPX (không có tuần riêng, chỉ là file
  // upload) tự khớp theo đúng ngày của Đơn C/DTP tương ứng, không cần chọn tay riêng (tránh rối/nhầm lẫn). ----
  const donCOptions = donC.timeline.map(e => ({ id: e.id, label: formatEntryOption(e) }))
  const donCPick = usePickedPair('donC', donCOptions, donC.timeline[0]?.id, donC.timeline[1]?.id)
  const donCCurrentEntry = donC.timeline.find(e => e.id === donCPick.currentId) || null
  const donCPreviousEntry = donC.timeline.find(e => e.id === donCPick.previousId) || null

  const donDTPOptions = donDTP.timeline.map(e => ({ id: e.id, label: formatEntryOption(e) }))
  const donDTPPick = usePickedPair('donDTP', donDTPOptions,
    closestTimelineEntry(donDTP.timeline, donCCurrentEntry?.at)?.id, closestTimelineEntry(donDTP.timeline, donCPreviousEntry?.at)?.id)
  const donDTPCurrentEntry = donDTP.timeline.find(e => e.id === donDTPPick.currentId) || null
  const donDTPPreviousEntry = donDTP.timeline.find(e => e.id === donDTPPick.previousId) || null

  const tmdtOptions = tmdtReports.map(r => ({ id: r.id, label: r.label }))
  const tmdtPick = usePickedPair('tmdt', tmdtOptions,
    closestTmdtReport(tmdtReports, donCCurrentEntry?.at)?.id, closestTmdtReport(tmdtReports, donCPreviousEntry?.at)?.id)
  const tmdtCurrentReport = tmdtReports.find(r => r.id === tmdtPick.currentId) || null
  const tmdtPreviousReport = tmdtReports.find(r => r.id === tmdtPick.previousId) || null
  const tmdtCurrent = tmdtCurrentReport?.total || 0
  const tmdtPrev = tmdtPreviousReport?.total || 0

  // Viettel Post/SPX: nếu tuần Đơn C/DTP là báo cáo đã lưu, dùng đúng weekId đã đóng băng lúc lưu (khớp
  // chính xác với số ở tab Đơn C/DTP); chưa lưu (Excel sống) hoặc báo cáo cũ chưa có tham chiếu thì mới
  // tự tìm file có ngày upload gần nhất.
  const viettelCWeekIdCurrent = resolveCarrierWeekId(donCCurrentEntry, 'donC_viettel', 'viettelWeekId')
  const viettelCWeekIdPrevious = resolveCarrierWeekId(donCPreviousEntry, 'donC_viettel', 'viettelWeekId')
  const spxCWeekIdCurrent = resolveCarrierWeekId(donCCurrentEntry, 'donC_spx', 'spxWeekId')
  const spxCWeekIdPrevious = resolveCarrierWeekId(donCPreviousEntry, 'donC_spx', 'spxWeekId')
  const viettelDTPWeekIdCurrent = resolveCarrierWeekId(donDTPCurrentEntry, 'donDTP_viettel', 'viettelWeekId')
  const viettelDTPWeekIdPrevious = resolveCarrierWeekId(donDTPPreviousEntry, 'donDTP_viettel', 'viettelWeekId')

  // Khóa "tuần" dùng để lưu các trường nhập tay (chưa giao, hàng gửi, nhân sự, kết luận, giải pháp...)
  const weekKey = `${donCCurrentEntry?.id || 'x'}_${donDTPCurrentEntry?.id || 'x'}`

  const viettelC_current = useMemo(() => ({ weekId: viettelCWeekIdCurrent, stats: statsForCarrierWeekId('donC_viettel', 'viettel', viettelCWeekIdCurrent, donCCurrentEntry) }), [viettelCWeekIdCurrent, donCCurrentEntry])
  const viettelC_previous = useMemo(() => ({ weekId: viettelCWeekIdPrevious, stats: statsForCarrierWeekId('donC_viettel', 'viettel', viettelCWeekIdPrevious, donCPreviousEntry) }), [viettelCWeekIdPrevious, donCPreviousEntry])
  const spxC_current = useMemo(() => ({ weekId: spxCWeekIdCurrent, stats: statsForCarrierWeekId('donC_spx', 'spx', spxCWeekIdCurrent, donCCurrentEntry) }), [spxCWeekIdCurrent, donCCurrentEntry])
  const spxC_previous = useMemo(() => ({ weekId: spxCWeekIdPrevious, stats: statsForCarrierWeekId('donC_spx', 'spx', spxCWeekIdPrevious, donCPreviousEntry) }), [spxCWeekIdPrevious, donCPreviousEntry])
  const viettelDTP_current = useMemo(() => ({ weekId: viettelDTPWeekIdCurrent, stats: statsForCarrierWeekId('donDTP_viettel', 'viettel', viettelDTPWeekIdCurrent, donDTPCurrentEntry) }), [viettelDTPWeekIdCurrent, donDTPCurrentEntry])
  const viettelDTP_previous = useMemo(() => ({ weekId: viettelDTPWeekIdPrevious, stats: statsForCarrierWeekId('donDTP_viettel', 'viettel', viettelDTPWeekIdPrevious, donDTPPreviousEntry) }), [viettelDTPWeekIdPrevious, donDTPPreviousEntry])

  const liveCurrent = useMemo(() => computeWeekReport({
    entryC: donCCurrentEntry, entryDTP: donDTPCurrentEntry, tmdtTotal: tmdtCurrent,
    viettelCompareC: viettelC_current.stats, spxCompareC: spxC_current.stats, viettelCompareDTP: viettelDTP_current.stats,
  }), [donCCurrentEntry, donDTPCurrentEntry, tmdtCurrent, viettelC_current.stats, spxC_current.stats, viettelDTP_current.stats])

  const livePrevious = useMemo(() => computeWeekReport({
    entryC: donCPreviousEntry, entryDTP: donDTPPreviousEntry, tmdtTotal: tmdtPrev,
    viettelCompareC: viettelC_previous.stats, spxCompareC: spxC_previous.stats, viettelCompareDTP: viettelDTP_previous.stats,
  }), [donCPreviousEntry, donDTPPreviousEntry, tmdtPrev, viettelC_previous.stats, spxC_previous.stats, viettelDTP_previous.stats])

  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)

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

  const autoVerdict = `Tuần này ${totalDeltaPct >= 0 ? 'tăng' : 'giảm'} ${Math.abs(totalDeltaPct).toFixed(1)}% so với tuần trước (${current.grandTotal.toLocaleString('vi-VN')} đơn). `
    + (rate24hDrop ? `Tốc độ giao 24h giảm còn ${current.rate24h.toFixed(1)}%, cần rà soát nguyên nhân chậm giao. ` : `Tốc độ giao 24h duy trì/cải thiện, đạt ${current.rate24h.toFixed(1)}%. `)
    + (chuaGiaoUp ? `Tồn "chưa giao" tăng lên ${current.chuaGiao} đơn — cần ưu tiên xử lý ngay đầu tuần tới.` : `Tồn "chưa giao" đang ở mức kiểm soát được (${current.chuaGiao} đơn).`)

  const [verdictLive, setVerdict] = useWeekField(weekKey, 'verdict', autoVerdict)
  const verdict = snapshot ? snapshot.verdict : verdictLive

  const priority1 = chuaGiaoUp ? 'high' : 'low'
  const priority2 = rate24hDrop ? 'high' : 'low'
  const priority4 = totalDeltaPct > 15 ? 'high' : 'low'

  // Lưu toàn bộ số liệu + nhận định đang xem (live) thành 1 báo cáo cố định, không đổi khi dữ liệu sau này thay đổi
  const saveReport = () => {
    const id = String(Date.now())
    const label = `${reportTitleLive || 'Báo cáo'} · ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    const entry = {
      id, createdAt: new Date().toISOString(), label,
      current: liveCurrent, previous: livePrevious,
      title: reportTitleLive,
      insight1: insight1Live, insight2: insight2Live, insight3: insight3Live,
      verdict: verdictLive,
      sol1: sol1Live, sol2: sol2Live, sol3: sol3Live, sol4: sol4Live, sol5: sol5Live,
    }
    const next = [entry, ...reports].slice(0, 52)
    setReports(next)
    localStorage.setItem('tongdon_reports', JSON.stringify(next))
    setViewingId(id)

    // Số liệu đã đóng băng vào báo cáo — không cần giữ file gốc của các tuần cũ hơn nữa, đỡ tốn bộ nhớ trình duyệt/cloud
    donC.pruneToIds([donCCurrentEntry?.id, donCPreviousEntry?.id].filter(Boolean))
    donDTP.pruneToIds([donDTPCurrentEntry?.id, donDTPPreviousEntry?.id].filter(Boolean))
    pruneCarrierWeeksToIds('donC_viettel', [viettelC_current.weekId, viettelC_previous.weekId].filter(Boolean))
    pruneCarrierWeeksToIds('donC_spx', [spxC_current.weekId, spxC_previous.weekId].filter(Boolean))
    pruneCarrierWeeksToIds('donDTP_viettel', [viettelDTP_current.weekId, viettelDTP_previous.weekId].filter(Boolean))
  }

  if (loading) {
    return (
      <div className="text-center py-24 text-gray-400">
        <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
        <p>Đang tải dữ liệu...</p>
      </div>
    )
  }

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
      </div>

      {!isReadOnly && (
        <DataSourcePicker
          open={sourcePickerOpen}
          onToggle={() => setSourcePickerOpen(o => !o)}
          donCPick={donCPick}
          donDTPPick={donDTPPick}
          tmdtPick={tmdtPick}
        />
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-gray-200 border border-gray-200 rounded-xl overflow-hidden mb-5">
        <KpiCard label="Tổng đơn kho HCM" cur={current.grandTotal} prev={previous.grandTotal} />
        <KpiCard label="Đơn C" cur={current.totalC} prev={previous.totalC} />
        <KpiCard label="Đơn DTP" cur={current.totalDTP} prev={previous.totalDTP} />
        <KpiCard label="SO3 + SO6 (Shopee, TikTok)" cur={current.totalTMDT} prev={previous.totalTMDT} />
      </div>

      {/* 2 cột so sánh Tuần này / Tuần trước */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <WeekColumn label="TUẦN NÀY" tag="MỚI NHẤT" color="#0E9A7D" bg="#E4F5F0" R={current} />
        <WeekColumn label="TUẦN TRƯỚC" tag="LIỀN KỀ" color="#B9720C" bg="#FBEEDC" R={previous} />
      </div>

      {/* Phân tích & đánh giá tổng quan */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_2px_12px_rgba(15,23,42,0.06)] p-5">
        <h3 className="font-bold text-gray-800 tracking-wide text-lg mb-4">PHÂN TÍCH &amp; ĐÁNH GIÁ TỔNG QUAN</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <InsightCardV2 tag="Sản lượng" tone={totalDeltaPct >= 0 ? 'pos' : 'neg'} title={topGroup.name + (topGroup.pct >= 0 ? ' tăng' : ' giảm') + ' chi phối biến động tổng đơn'}
            body={insight1} onBodyChange={isReadOnly ? undefined : setInsight1} placeholder="VD: Tổng đơn tăng X%, chủ yếu từ nhóm..." />
          <InsightCardV2 tag="Tốc độ giao" tone={rate24hDrop ? 'neg' : 'pos'} title="Hiệu suất giao hàng trực tiếp"
            body={insight2} onBodyChange={isReadOnly ? undefined : setInsight2} />
          <InsightCardV2 tag="Nguyên nhân" tone={chuaGiaoUp && totalDeltaPct > 0 ? 'warn' : 'neutral'} title="Nguyên nhân chính cần lưu ý"
            body={insight3} onBodyChange={isReadOnly ? undefined : setInsight3} />
        </div>

        <VerdictBox text={verdict} onChange={isReadOnly ? undefined : setVerdict} />

        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-5">Giải pháp cho tuần tiếp theo</div>
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <PlanItem num={1} text={sol1} onChange={isReadOnly ? undefined : setSol1} priority={priority1} />
          <PlanItem num={2} text={sol2} onChange={isReadOnly ? undefined : setSol2} priority={priority2} />
          <PlanItem num={3} text={sol3} onChange={isReadOnly ? undefined : setSol3} priority="mid" />
          <PlanItem num={4} text={sol4} onChange={isReadOnly ? undefined : setSol4} priority={priority4} />
          <PlanItem num={5} text={sol5} onChange={isReadOnly ? undefined : setSol5} priority="low" />
        </div>
      </div>
    </div>
  )
}
