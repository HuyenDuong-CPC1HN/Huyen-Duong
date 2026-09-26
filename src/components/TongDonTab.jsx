import { useMemo, useState, useRef } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { ClipboardList, ChevronDown, ChevronUp, Download, Printer, Upload, RotateCcw } from 'lucide-react'
import { toPng } from 'html-to-image'
import { readTrialReports } from '../utils/unifiedTrialReports'
import { computeWeekReportFromUnifiedTrial, ngoaiSanForWeekIdUnifiedTrial } from './tongDonUnifiedTrialAdapter'
import { buildDonSanNarrative, buildDonTruyenThongNarrative } from './tongDonNarrative'
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

// Bộ chọn tay "Tuần này"/"Tuần trước" cho 1 nguồn dữ liệu — mặc định dùng defaultCurrentId/defaultPreviousId,
// nhưng lưu lại lựa chọn tay riêng nếu người dùng tự chọn lại để tránh nhầm lẫn khi so sánh báo cáo.
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

  // localStorage/<select> luôn lưu id dạng chuỗi, nhưng id gốc trong options có thể là số — so sánh dạng chuỗi
  // để không bị lệch kiểu, rồi trả về đúng o.id gốc để các chỗ .find(e => e.id === pick.xxxId) vẫn khớp.
  const matchedCurrent = currentId ? options.find(o => String(o.id) === String(currentId)) : null
  const matchedPrevious = previousId ? options.find(o => String(o.id) === String(previousId)) : null
  const effectiveCurrentId = matchedCurrent ? matchedCurrent.id : (defaultCurrentId || options[0]?.id || null)
  const effectivePreviousId = matchedPrevious ? matchedPrevious.id : (defaultPreviousId || options[1]?.id || null)

  return { options, currentId: effectiveCurrentId, previousId: effectivePreviousId, setCurrentId: updateCurrentId, setPreviousId: updatePreviousId }
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

// Chọn 2 cặp Tuần này/Tuần trước (Đơn SO, Đơn truyền thống), lấy thẳng từ lịch sử "Lưu số liệu tuần này" ở
// tab Gộp kênh — Viettel Post/SPX tự khớp theo weekId đã ghim sẵn trong từng entry, không cần chọn thêm.
function SourcePicker({ open, onToggle, donSOPick, donTTPick }) {
  return (
    <div className="tdr-source-picker rounded-xl p-4" style={{ background: 'var(--bg-card, #ffffff)', boxShadow: 'var(--shadow-card, 0 4px 12px rgba(0,0,0,0.15))' }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between text-left">
        <span className="text-sm font-semibold" style={{ color: 'var(--text-primary, #1a1d23)' }}>Chọn tuần so sánh — Chi tiết giao hàng theo kênh</span>
        {open ? <ChevronUp size={15} className="text-gray-400 shrink-0" /> : <ChevronDown size={15} className="text-gray-400 shrink-0" />}
      </button>
      {open && (
        <div className="mt-3">
          <div className="grid grid-cols-[110px_1fr_1fr] gap-2 mb-1 text-[10px] uppercase tracking-wide text-gray-400 font-semibold">
            <span />
            <span>Tuần này</span>
            <span>Tuần trước</span>
          </div>
          <SourceRow label="Đơn SO" pick={donSOPick} />
          <SourceRow label="Đơn truyền thống" pick={donTTPick} />
        </div>
      )}
    </div>
  )
}

function pngExportFilename(suffix, date = new Date()) {
  return `${suffix}_${date.toLocaleDateString('vi-VN').replaceAll('/', '_')}.png`
}

function TongDonToolbar({ isReadOnly, onDelete, onNavigate, onSave, savingReport, onExport, exporting }) {
  return (
    <div className="tdr-toolbar">
      {isReadOnly ? (
        <>
          <button
            type="button"
            onClick={onDelete}
            className="tdr-btn is-reselect"
            title="Xoá báo cáo đã lưu để chọn lại tuần so sánh và làm lại (dùng khi lỡ chọn nhầm tuần)"
          >
            <RotateCcw size={13} /> Chọn lại &amp; làm lại
          </button>
          {onNavigate && (
            <button type="button" onClick={onNavigate} className="tdr-btn is-primary">
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
  // Số liệu lấy từ lịch sử "Lưu số liệu tuần này" của tab Gộp kênh (2 cặp Tuần này/Tuần trước: Đơn SO,
  // Đơn truyền thống) — xem tongDonUnifiedTrialAdapter.js.
  const donSOReports = useMemo(() => readTrialReports('donSO'), [])
  const donTTReports = useMemo(() => readTrialReports('donTruyenThong'), [])
  const donSOOptions = donSOReports.map(r => ({ id: r.id, label: r.label }))
  const donSOPick = usePickedPair('unifiedDonSO', donSOOptions, donSOOptions[0]?.id, donSOOptions[1]?.id)
  const donSOEntryCurrent = donSOReports.find(r => r.id === donSOPick.currentId) || null
  const donSOEntryPrevious = donSOReports.find(r => r.id === donSOPick.previousId) || null
  const donTTOptions = donTTReports.map(r => ({ id: r.id, label: r.label }))
  const donTTPick = usePickedPair('unifiedDonTT', donTTOptions, donTTOptions[0]?.id, donTTOptions[1]?.id)
  const donTTEntryCurrent = donTTReports.find(r => r.id === donTTPick.currentId) || null
  const donTTEntryPrevious = donTTReports.find(r => r.id === donTTPick.previousId) || null
  const liveCurrent = useMemo(() => computeWeekReportFromUnifiedTrial({
    donSOEntry: donSOEntryCurrent, donTTEntry: donTTEntryCurrent,
  }), [donSOEntryCurrent, donTTEntryCurrent])
  const livePrevious = useMemo(() => computeWeekReportFromUnifiedTrial({
    donSOEntry: donSOEntryPrevious, donTTEntry: donTTEntryPrevious,
  }), [donSOEntryPrevious, donTTEntryPrevious])
  const ngoaiSanCurrent = useMemo(() => ngoaiSanForWeekIdUnifiedTrial(donSOEntryCurrent?.spxWeekId), [donSOEntryCurrent])

  // Khóa "tuần" dùng để lưu các trường nhập tay (chưa giao, hàng gửi, nhân sự, kết luận, giải pháp...) —
  // giữ tiền tố "ut_" như trước để các nhận định đã sửa tay trước đây vẫn khớp đúng tuần.
  const weekKey = `ut_${donSOEntryCurrent?.id || 'x'}_${donTTEntryCurrent?.id || 'x'}`

  const [sourcePickerOpen, setSourcePickerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('donsan')

  // ---- Báo cáo đã lưu: chỉ giữ ĐÚNG 1 bản (tuần mới nhất đã lưu), không lưu thành danh sách lịch sử.
  // Mỗi tuần chỉ lưu 1 lần — hễ đúng weekKey đã lưu thì tự động khoá lại (read-only), không có nút quay lại
  // sửa tiếp; muốn làm báo cáo mới thì phải chuyển sang tuần khác (Upload tuần mới ở tab Gộp kênh). ----
  const [reports, setReports] = useState(() => readJSON('tongdon_reports', []))
  const [savingReport, setSavingReport] = useState(false)
  const savedReport = reports[0] || null
  const isReadOnly = savedReport?.weekKey === weekKey
  const snapshot = isReadOnly ? savedReport : null

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
    // Bật tạm biến thể "kem" (nền/viền/chữ + khổ 1180px) đúng mẫu người dùng cung cấp — chỉ trong lúc chụp
    // ảnh, không đổi màn hình đang xem; toPng chụp DOM tại đúng thời điểm gọi nên phải add class TRƯỚC,
    // remove SAU khi đã lấy xong dataUrl (kể cả khi lỗi, để không bị kẹt lại kiểu kem trên màn hình).
    node.classList.add('tdr-export-cream')
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const dataUrl = await toPng(node, { backgroundColor: '#f5f4f0', pixelRatio: 1 })
      const a = document.createElement('a')
      const suffix = activeTab === 'donsan' ? 'DonSan' : 'DonTruyenThong'
      a.href = dataUrl
      a.download = pngExportFilename(suffix)
      a.click()
    } catch {
      window.alert('Không xuất được ảnh, vui lòng thử lại.')
    } finally {
      node.classList.remove('tdr-export-cream')
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
  }

  // Lối thoát khi lỡ chọn nhầm tuần so sánh rồi mới lưu — xoá báo cáo đã lưu để quay lại chỉnh sửa trực tiếp
  // (khác với việc cho sửa tự do sau khi lưu: phải xoá hẳn rồi làm lại, có xác nhận trước để tránh xoá nhầm)
  const deleteReport = () => {
    if (!window.confirm('Xoá báo cáo đã lưu để chọn lại tuần so sánh và làm lại?\n\nSố liệu/nhận định đã lưu sẽ mất, cần lưu lại từ đầu.')) return
    setReports([])
    void localStorage.removeItem('tongdon_reports')
  }

  const fmtDate = (at) => (at && !Number.isNaN(new Date(at).getTime()) ? new Date(at).toLocaleDateString('vi-VN') : null)
  const currentPeriodLabel = !isReadOnly ? fmtDate(donTTEntryCurrent?.id || donSOEntryCurrent?.id) : null
  const previousPeriodLabel = !isReadOnly ? fmtDate(donTTEntryPrevious?.id || donSOEntryPrevious?.id) : null
  const savedAtLabel = isReadOnly ? new Date(snapshot.createdAt).toLocaleString('vi-VN') : null

  return (
    <div className="tdr-tab">
      <div className="tdr-controls">
        <div className="tdr-tabswitch">
          <button type="button" className={activeTab === 'donsan' ? 'active' : ''} onClick={() => setActiveTab('donsan')}>Đơn sàn</button>
          <button type="button" className={activeTab === 'truyenthong' ? 'active' : ''} onClick={() => setActiveTab('truyenthong')}>Đơn truyền thống</button>
        </div>
        {!isReadOnly && (
          <SourcePicker
            open={sourcePickerOpen}
            onToggle={() => setSourcePickerOpen(o => !o)}
            donSOPick={donSOPick}
            donTTPick={donTTPick}
          />
        )}
        <TongDonToolbar
          isReadOnly={isReadOnly}
          onDelete={deleteReport}
          onNavigate={onNavigate ? () => onNavigate('gopKenh') : undefined}
          onSave={() => { void saveReport() }}
          savingReport={savingReport}
          onExport={handleExportImage}
          exporting={exporting}
        />
      </div>

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
