import { useMemo, useState, useRef } from 'react'
import { opsStore as localStorage, refreshReportingCycles } from '../data/workspace'
import { supabase } from '../supabase'
import { createAnalyticsPackagesRepository } from '../data/analyticsPackages'
import { evaluateCompletion } from '../analytics/completionGate'
import { buildWeekKpiPackage } from '../analytics/buildWeekKpiPackage'
import { RefreshCw, ClipboardList, ChevronDown, ChevronUp, Download, Printer, Upload, RotateCcw } from 'lucide-react'
import { toPng } from 'html-to-image'
import { useWeeklyData } from '../useWeeklyData'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { readSheetReports } from '../utils/sheetReports'
import {
  getCarrierFileStats, pickCarrierWeekIdByDate, carrierWeekHasRows, computeFrozenNgoaiSan, getCarrierWeekRows,
} from './carrierUtils'
import { pct, buildDonSanNarrative, buildDonTruyenThongNarrative } from './tongDonNarrative'
import TongDonReportDonSan from './TongDonReportDonSan'
import TongDonReportDonTruyenThong from './TongDonReportDonTruyenThong'

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback }
}

// ---- Field lưu theo tuần (dùng cho các số liệu không có sẵn trong Excel: chưa giao, hàng gửi, nhân sự, kết luận...) ----
function useWeekField(weekKey, field, fallback = '') {
  const lsKey = `tongdon_field_${field}_${weekKey || 'none'}`
  const readValue = () => {
    const v = localStorage.getItem(lsKey)
    return v === null ? fallback : v
  }
  const [state, setState] = useState(() => ({ key: lsKey, value: readValue() }))
  const value = state.key === lsKey ? state.value : readValue()
  const commit = (nextValue) => {
    setState({ key: lsKey, value: nextValue })
    localStorage.setItem(lsKey, nextValue)
  }
  return [value, commit]
}

// Gộp các tuần Excel còn sống (chưa lưu/xoá) với các tuần đã "Lưu số liệu tuần này" (Excel gốc đã bị xoá,
// chỉ còn số liệu đóng băng) thành 1 dòng thời gian chung, mới nhất lên đầu — "current"/"previous" luôn lấy
// đúng 2 mục gần nhất bất kể nó còn Excel sống hay đã chốt số liệu.
function useTypeData(type) {
  const { weeks, pruneToIds } = useWeeklyData(type)
  const savedReports = useMemo(() => readSheetReports(type), [type])

  const vcEdits = useMemo(() => readJSON(`vc_edits_${type}`, {}), [type])

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
  const dateStr = Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('vi-VN')
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
  const [currentId, setCurrentId] = useState(() => localStorage.getItem(`tongdon_pick_${storageKey}_current`) || '')
  const [previousId, setPreviousId] = useState(() => localStorage.getItem(`tongdon_pick_${storageKey}_previous`) || '')

  const updateCurrentId = (id) => {
    setCurrentId(id)
    if (id) localStorage.setItem(`tongdon_pick_${storageKey}_current`, id)
    else localStorage.removeItem(`tongdon_pick_${storageKey}_current`)
  }
  const updatePreviousId = (id) => {
    setPreviousId(id)
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

  return { options, currentId: effectiveCurrentId, previousId: effectivePreviousId, setCurrentId: updateCurrentId, setPreviousId: updatePreviousId }
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

function findFrozenCarrierStats(weekId) {
  const reports = ['donC', 'donDTP'].flatMap((type) => readSheetReports(type))
  const frozenReport = reports.find((report) => (
    (report.viettelWeekId === weekId && report.viettelFrozen)
    || (report.spxWeekId === weekId && report.spxFrozen)
  ))
  if (!frozenReport) return null
  return frozenReport.viettelWeekId === weekId ? frozenReport.viettelFrozen : frozenReport.spxFrozen
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
  return findFrozenCarrierStats(weekId)
}

// Đối soát Đơn ngoại sàn (SPX COD) theo Mã đơn, mốc 1..4 — chỉ tính cho ĐÚNG 1 tuần (không so sánh 2 tuần,
// khác với mọi số liệu khác trong tab này), vì đây là bảng "sức khoẻ vận hành" của tuần hiện tại chứ không
// phải chỉ số so sánh. Ưu tiên dữ liệu SPX còn sống (tính trực tiếp, luôn mới nhất); nếu rows đã bị xoá
// (Excel gốc đã dọn sau khi "Lưu số liệu tuần này") thì lấy đúng bản đã đóng băng trong báo cáo Đơn C đã lưu.
function ngoaiSanForWeekId(spxWeekId) {
  if (!spxWeekId) return null
  if (carrierWeekHasRows('donC_spx', spxWeekId)) {
    return { data: computeFrozenNgoaiSan('donC_spx', getCarrierWeekRows('donC_spx', spxWeekId)), frozen: false }
  }
  const report = readSheetReports('donC').find(r => r.spxWeekId === spxWeekId && r.ngoaiSanFrozen)
  return report ? { data: report.ngoaiSanFrozen, frozen: true } : null
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

// Tổng hợp toàn bộ chỉ số cho 1 tuần (Đơn C + Đơn DTP), có thể là tuần hiện tại hoặc tuần trước — dùng
// nguyên vẹn cho cả 2 báo cáo (Đơn sàn đọc totalTMDT/spxC, Đơn truyền thống đọc phần còn lại)
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
    <div className="tdr-source-picker rounded-xl p-4" style={{ background: 'var(--bg-card, #ffffff)', boxShadow: 'var(--shadow-card, 0 4px 12px rgba(0,0,0,0.15))' }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1a1d23)' }}>Chọn tuần so sánh — Viettel Post/SPX tự khớp theo tuần Đơn C/DTP</span>
        {open ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
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

function LoadingState() {
  return (
    <div className="text-center py-24 text-gray-400">
      <RefreshCw size={28} className="animate-spin mx-auto mb-3" />
      <p>Đang tải dữ liệu...</p>
    </div>
  )
}

function pngExportFilename(suffix, date = new Date()) {
  return `${suffix}_${date.toLocaleDateString('vi-VN').replaceAll('/', '_')}.png`
}

function missingCompletionLabel(item) {
  if (item === 'sheet_report_donC') return 'thiếu báo cáo Đơn C đã lưu'
  if (item === 'sheet_report_donDTP') return 'thiếu báo cáo Đơn DTP đã lưu'
  return 'thiếu khóa tuần của Tổng đơn'
}

function publishButtonText(isPublished, publishing) {
  if (isPublished) return 'Đã công bố cho phân tích'
  if (publishing) return 'Đang công bố...'
  return 'Công bố cho phân tích'
}

function publishButtonTitle(isPublished, completion) {
  if (isPublished) return 'Chu kỳ này đã được công bố cho phân tích.'
  if (!completion.ok) {
    return `Chưa thể công bố: ${completion.missing.map(missingCompletionLabel).join(', ')}.`
  }
  return 'Công bố KPI đã đóng băng cho phân tích.'
}

function TongDonToolbar({
  isReadOnly, completion, publishing, isPublished, publishTitle, publishBtnText,
  onPublish, onDelete, onNavigate, onSave, savingReport, onExport, exporting,
}) {
  return (
    <div className="tdr-toolbar">
      {isReadOnly ? (
        <>
          <button
            onClick={onPublish}
            type="button"
            disabled={!completion.ok || publishing || isPublished}
            title={publishTitle}
            className="tdr-btn is-publish"
          >
            <ClipboardList size={13} /> {publishBtnText}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="tdr-btn is-reselect"
            title="Xoá báo cáo đã lưu để chọn lại tuần so sánh và làm lại (dùng khi lỡ chọn nhầm tuần)"
          >
            <RotateCcw size={13} /> Chọn lại &amp; làm lại
          </button>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('donC')} className="tdr-btn is-primary">
              <Upload size={13} /> Upload tuần mới
            </button>
          )}
        </>
      ) : (
        <button type="button" onClick={onSave} disabled={savingReport} className="tdr-btn is-primary">
          <ClipboardList size={13} /> {savingReport ? 'Đang lưu...' : 'Lưu báo cáo tuần này'}
        </button>
      )}
      <button type="button" onClick={onExport} disabled={exporting} className="tdr-btn">
        <Download size={13} /> {exporting ? 'Đang xuất...' : 'Xuất ảnh PNG'}
      </button>
      <button type="button" onClick={() => window.print()} className="tdr-btn">
        <Printer size={13} /> In / Xuất PDF
      </button>
    </div>
  )
}


export default function TongDonTab({ onNavigate }) {
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

  const ngoaiSanCurrent = useMemo(() => ngoaiSanForWeekId(spxCWeekIdCurrent), [spxCWeekIdCurrent])

  const liveCurrent = useMemo(() => computeWeekReport({
    entryC: donCCurrentEntry, entryDTP: donDTPCurrentEntry, tmdtTotal: tmdtCurrent,
    viettelCompareC: viettelC_current.stats, spxCompareC: spxC_current.stats, viettelCompareDTP: viettelDTP_current.stats,
  }), [donCCurrentEntry, donDTPCurrentEntry, tmdtCurrent, viettelC_current.stats, spxC_current.stats, viettelDTP_current.stats])

  const livePrevious = useMemo(() => computeWeekReport({
    entryC: donCPreviousEntry, entryDTP: donDTPPreviousEntry, tmdtTotal: tmdtPrev,
    viettelCompareC: viettelC_previous.stats, spxCompareC: spxC_previous.stats, viettelCompareDTP: viettelDTP_previous.stats,
  }), [donCPreviousEntry, donDTPPreviousEntry, tmdtPrev, viettelC_previous.stats, spxC_previous.stats, viettelDTP_previous.stats])

  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('donsan')

  // ---- Báo cáo đã lưu: chỉ giữ ĐÚNG 1 bản (tuần mới nhất đã lưu), không lưu thành danh sách lịch sử.
  // Mỗi tuần chỉ lưu 1 lần — hễ đúng weekKey đã lưu thì tự động khoá lại (read-only), không có nút quay lại
  // sửa tiếp; muốn làm báo cáo mới thì phải chuyển sang tuần khác (Upload tuần mới → Đơn C/DTP có tuần mới). ----
  const [reports, setReports] = useState(() => readJSON('tongdon_reports', []))
  const [savingReport, setSavingReport] = useState(false)
  const [reportingCycles, setReportingCycles] = useState(() => readJSON('reporting_cycles', []))
  const savedReport = reports[0] || null
  const isReadOnly = savedReport?.weekKey === weekKey
  const snapshot = isReadOnly ? savedReport : null
  const completion = useMemo(() => evaluateCompletion({
    tongdonReport: savedReport,
    sheetReportsDonC: readSheetReports('donC'),
    sheetReportsDonDTP: readSheetReports('donDTP'),
  }), [savedReport])
  const isPublished = reportingCycles.some((cycle) => (
    cycle.cycle_key === savedReport?.weekKey && cycle.status === 'ready_for_analytics'
  ))
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const current = snapshot ? snapshot.current : liveCurrent
  const previous = snapshot ? snapshot.previous : livePrevious
  const ngoaiSan = snapshot ? snapshot.donSan?.ngoaiSan : ngoaiSanCurrent

  const donSanAuto = useMemo(() => buildDonSanNarrative(current, previous, ngoaiSan), [current, previous, ngoaiSan])
  const truyenThongAuto = useMemo(() => buildDonTruyenThongNarrative(current, previous), [current, previous])

  // Mỗi trường chữ (nhận định/kết luận/giải pháp) của 2 báo cáo đều sửa tay được và lưu riêng theo tuần —
  // liệt kê tường minh từng useWeekField (không gọi trong vòng lặp) để đúng luật Rules of Hooks.
  const [donSan_tmdtBodyLive, setDonSanTmdtBody] = useWeekField(weekKey, 'donsan_tmdtBody', donSanAuto.tmdtBody)
  const [donSan_ngoaiSanBodyLive, setDonSanNgoaiSanBody] = useWeekField(weekKey, 'donsan_ngoaiSanBody', donSanAuto.ngoaiSanBody)
  const [donSan_reconNoteLive, setDonSanReconNote] = useWeekField(weekKey, 'donsan_reconNote', donSanAuto.reconNote)
  const [donSan_verdictLive, setDonSanVerdict] = useWeekField(weekKey, 'donsan_verdict', donSanAuto.verdict)
  const [donSan_sol1Live, setDonSanSol1] = useWeekField(weekKey, 'donsan_sol1', donSanAuto.sol1)
  const [donSan_sol2Live, setDonSanSol2] = useWeekField(weekKey, 'donsan_sol2', donSanAuto.sol2)
  const [donSan_sol3Live, setDonSanSol3] = useWeekField(weekKey, 'donsan_sol3', donSanAuto.sol3)
  const [donSan_sol4Live, setDonSanSol4] = useWeekField(weekKey, 'donsan_sol4', donSanAuto.sol4)

  const [tt_cocauBodyLive, setTtCocauBody] = useWeekField(weekKey, 'truyenthong_cocauBody', truyenThongAuto.cocauBody)
  const [tt_dtpBodyLive, setTtDtpBody] = useWeekField(weekKey, 'truyenthong_dtpBody', truyenThongAuto.dtpBody)
  const [tt_cBodyLive, setTtCBody] = useWeekField(weekKey, 'truyenthong_cBody', truyenThongAuto.cBody)
  const [tt_vtpBodyLive, setTtVtpBody] = useWeekField(weekKey, 'truyenthong_vtpBody', truyenThongAuto.vtpBody)
  const [tt_verdictLive, setTtVerdict] = useWeekField(weekKey, 'truyenthong_verdict', truyenThongAuto.verdict)
  const [tt_sol1Live, setTtSol1] = useWeekField(weekKey, 'truyenthong_sol1', truyenThongAuto.sol1)
  const [tt_sol2Live, setTtSol2] = useWeekField(weekKey, 'truyenthong_sol2', truyenThongAuto.sol2)
  const [tt_sol3Live, setTtSol3] = useWeekField(weekKey, 'truyenthong_sol3', truyenThongAuto.sol3)
  const [tt_sol4Live, setTtSol4] = useWeekField(weekKey, 'truyenthong_sol4', truyenThongAuto.sol4)

  const donSanFieldsLive = {
    tmdtBody: donSan_tmdtBodyLive, ngoaiSanBody: donSan_ngoaiSanBodyLive, reconNote: donSan_reconNoteLive, verdict: donSan_verdictLive,
    sol1: donSan_sol1Live, sol2: donSan_sol2Live, sol3: donSan_sol3Live, sol4: donSan_sol4Live,
  }
  const donSanSetters = {
    tmdtBody: setDonSanTmdtBody, ngoaiSanBody: setDonSanNgoaiSanBody, reconNote: setDonSanReconNote, verdict: setDonSanVerdict,
    sol1: setDonSanSol1, sol2: setDonSanSol2, sol3: setDonSanSol3, sol4: setDonSanSol4,
  }
  const truyenThongFieldsLive = {
    cocauBody: tt_cocauBodyLive, dtpBody: tt_dtpBodyLive, cBody: tt_cBodyLive, vtpBody: tt_vtpBodyLive, verdict: tt_verdictLive,
    sol1: tt_sol1Live, sol2: tt_sol2Live, sol3: tt_sol3Live, sol4: tt_sol4Live,
  }
  const truyenThongSetters = {
    cocauBody: setTtCocauBody, dtpBody: setTtDtpBody, cBody: setTtCBody, vtpBody: setTtVtpBody, verdict: setTtVerdict,
    sol1: setTtSol1, sol2: setTtSol2, sol3: setTtSol3, sol4: setTtSol4,
  }

  const donSanFields = snapshot ? snapshot.donSan : donSanFieldsLive
  const truyenThongFields = snapshot ? snapshot.truyenThong : truyenThongFieldsLive

  const handleDonSanFieldChange = (key, value) => { donSanSetters[key]?.(value) }
  const handleTruyenThongFieldChange = (key, value) => { truyenThongSetters[key]?.(value) }

  // Xuất báo cáo đang mở (Đơn sàn/Đơn truyền thống) thành 1 ảnh PNG để đính kèm/gửi báo cáo
  const exportRefDonSan = useRef(null)
  const exportRefTruyenThong = useRef(null)
  const [exporting, setExporting] = useState(false)
  const handleExportImage = async () => {
    const node = activeTab === 'donsan' ? exportRefDonSan.current : exportRefTruyenThong.current
    if (!node) return
    setExporting(true)
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const dataUrl = await toPng(node, { backgroundColor: '#ffffff', pixelRatio: 2 })
      const a = document.createElement('a')
      const suffix = activeTab === 'donsan' ? 'DonSan' : 'DonTruyenThong'
      a.href = dataUrl
      a.download = pngExportFilename(suffix)
      a.click()
    } catch {
      window.alert('Không xuất được ảnh, vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  const saveReport = async () => {
    const id = String(Date.now())
    const label = `Báo cáo giao hàng - CN HCM · ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`
    const entry = {
      id, weekKey, createdAt: new Date().toISOString(), label,
      current: liveCurrent, previous: livePrevious,
      title: 'Báo cáo giao hàng - CN HCM',
      donSan: { ngoaiSan: ngoaiSanCurrent, ...donSanFieldsLive },
      truyenThong: { ...truyenThongFieldsLive },
    }
    const next = [entry]
    setSavingReport(true)
    try {
      await localStorage.setItem('tongdon_reports', JSON.stringify(next))
      setReports(next)
    } finally {
      setSavingReport(false)
    }
    // KHÔNG tự dọn bớt Excel các tuần cũ ở đây nữa — trước đây tự xoá ngay khi lưu (không hỏi, không ân hạn)
    // từng làm mất luôn cả những tuần đã "Lưu số liệu tuần này" riêng ở tab Đơn C/DTP khỏi "Lịch sử upload".
    // Muốn giảm dung lượng thì dùng đúng nút "Lưu số liệu tuần này" ở từng tab — có ân hạn 3 phút + Hoàn tác.
  }

  // Lối thoát khi lỡ chọn nhầm tuần so sánh rồi mới lưu — xoá báo cáo đã lưu để quay lại chỉnh sửa trực tiếp
  // (khác với việc cho sửa tự do sau khi lưu: phải xoá hẳn rồi làm lại, có xác nhận trước để tránh xoá nhầm)
  const deleteReport = () => {
    if (!window.confirm('Xoá báo cáo đã lưu để chọn lại tuần so sánh và làm lại?\n\nSố liệu/nhận định đã lưu sẽ mất, cần lưu lại từ đầu.')) return
    const remove = async () => {
      try {
        if (isPublished) {
          await createAnalyticsPackagesRepository(supabase).markStale(savedReport.weekKey)
          setReportingCycles(await refreshReportingCycles())
        }
        setReports([])
        await localStorage.removeItem('tongdon_reports')
      } catch (error) {
        setPublishError(error.message || 'Không thể chuyển chu kỳ về bản nháp. Báo cáo đã lưu chưa bị xóa.')
      }
    }
    void remove()
  }

  const publishForAnalytics = async () => {
    if (!savedReport || !completion.ok || publishing || isPublished) return
    setPublishing(true)
    setPublishError('')
    try {
      const { kpi_json, source_refs } = buildWeekKpiPackage({ tongdonReport: savedReport, sources: completion.sources })
      await createAnalyticsPackagesRepository(supabase).publish({
        cycleKey: completion.cycleKey,
        tongdonReportId: savedReport.id,
        kpiJson: kpi_json,
        sourceRefs: source_refs,
      })
      setReportingCycles(await refreshReportingCycles())
    } catch (error) {
      setPublishError(error.message || 'Không thể công bố chu kỳ cho phân tích.')
    } finally {
      setPublishing(false)
    }
  }

  if (loading) return <LoadingState />

  const fmtDate = (at) => (at && !Number.isNaN(new Date(at).getTime()) ? new Date(at).toLocaleDateString('vi-VN') : null)
  const currentPeriodLabel = !isReadOnly ? fmtDate(donCCurrentEntry?.at) : null
  const previousPeriodLabel = !isReadOnly ? fmtDate(donCPreviousEntry?.at) : null
  const savedAtLabel = isReadOnly ? new Date(snapshot.createdAt).toLocaleString('vi-VN') : null
  const publishBtnText = publishButtonText(isPublished, publishing)
  const publishTitle = publishButtonTitle(isPublished, completion)

  return (
    <div className="tdr-tab">
      <div className="tdr-controls">
        <div className="tdr-tabswitch">
          <button type="button" className={activeTab === 'donsan' ? 'active' : ''} onClick={() => setActiveTab('donsan')}>Đơn sàn</button>
          <button type="button" className={activeTab === 'truyenthong' ? 'active' : ''} onClick={() => setActiveTab('truyenthong')}>Đơn truyền thống</button>
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
        <TongDonToolbar
          isReadOnly={isReadOnly}
          completion={completion}
          publishing={publishing}
          isPublished={isPublished}
          publishTitle={publishTitle}
          publishBtnText={publishBtnText}
          onPublish={publishForAnalytics}
          onDelete={deleteReport}
          onNavigate={onNavigate}
          onSave={() => { void saveReport() }}
          savingReport={savingReport}
          onExport={handleExportImage}
          exporting={exporting}
        />
      </div>
      {publishError && <p role="alert" className="tdr-error">{publishError}</p>}

      <div className="tdr-page-wrap">
        <TongDonReportDonSan
          ref={exportRefDonSan}
          active={activeTab === 'donsan'}
          isReadOnly={isReadOnly}
          currentPeriodLabel={currentPeriodLabel}
          previousPeriodLabel={previousPeriodLabel}
          savedAtLabel={savedAtLabel}
          current={current}
          previous={previous}
          ngoaiSan={ngoaiSan}
          narrative={donSanAuto}
          fields={donSanFields}
          onFieldChange={isReadOnly ? undefined : handleDonSanFieldChange}
        />
        <TongDonReportDonTruyenThong
          ref={exportRefTruyenThong}
          active={activeTab === 'truyenthong'}
          isReadOnly={isReadOnly}
          currentPeriodLabel={currentPeriodLabel}
          previousPeriodLabel={previousPeriodLabel}
          savedAtLabel={savedAtLabel}
          current={current}
          previous={previous}
          narrative={truyenThongAuto}
          fields={truyenThongFields}
          onFieldChange={isReadOnly ? undefined : handleTruyenThongFieldChange}
        />
      </div>
    </div>
  )
}
