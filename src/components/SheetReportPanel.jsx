import { useState, useEffect, useRef } from 'react'
import { toPng } from 'html-to-image'
import { ClipboardList, ArrowRight, CheckCircle, Clock, AlertCircle, Package, TrendingUp, Truck, ChevronDown, ChevronUp, RefreshCw, RotateCcw, XCircle, Download, Printer } from 'lucide-react'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { readSheetReports, saveSheetReport, removeSheetReport, relinkSheetReportCarrier } from '../utils/sheetReports'
import {
  pickCarrierWeekIdByDate, snapshotCarrierLookup, getCarrierFileStats, CarrierPanel,
  carrierWeekHasRows, useCarrierRowsPendingClear,
} from './CarrierStats'

const CARRIER_STAT_CARDS = [
  { key: '24h',           label: '≤ 24 giờ',        icon: CheckCircle, cls: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  { key: '48h',           label: '≤ 48 giờ',        icon: CheckCircle, cls: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200' },
  { key: '72h',           label: '≤ 72 giờ',        icon: Clock,       cls: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  { key: 'dangVanChuyen', label: 'Đang vận chuyển', icon: Truck,       cls: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
  { key: 'choLay',        label: 'Chờ lấy',         icon: Package,     cls: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  { key: 'giaoLai',       label: 'Đang giao hàng',  icon: RotateCcw,   cls: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  { key: 'hoanHang',      label: 'Hoàn hàng',       icon: XCircle,     cls: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
]

// Hiển thị khi dòng dữ liệu gốc của file VTP/SPX đã bị xoá (đóng băng) — số liệu tĩnh, không tương tác được nữa
function FrozenCarrierCards({ label, frozen }) {
  if (!frozen) return null
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="bg-teal-600 px-3 py-1 rounded text-sm font-bold text-white">{frozen.total.toLocaleString('vi-VN')} đơn</span>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
        {CARRIER_STAT_CARDS.map(c => (
          <StatCard key={c.key} icon={c.icon} value={frozen.stats[c.key] || 0} label={c.label} cls={c.cls} bg={c.bg} pctOfTotal={pct(frozen.stats[c.key] || 0, frozen.total)} />
        ))}
      </div>
    </div>
  )
}

const KH_TYPES = {
  donC: [
    { key: 'bv', label: 'Bệnh viện' },
    { key: 'nt', label: 'Nhà thuốc' },
    { key: 'onl', label: 'KH ONL / Khách lẻ' },
  ],
  donDTP: [
    { key: 'nt', label: 'Nhà thuốc' },
    { key: 'pk', label: 'Phòng khám' },
    { key: 'onl', label: 'KH ONL / Khách lẻ' },
  ],
}

function computeBuckets(data) {
  const validData = data.filter(r => String(r['Mã kiện hàng'] ?? '').trim())
  let b24 = 0, b48 = 0, b72 = 0, chanhXeCount = 0
  for (const row of validData) {
    const t = partnerType(row)
    if (t === 'tructiep') {
      const bucket = deliveryBucket(row)
      if (bucket === '24') b24++
      else if (bucket === '48') b48++
      else if (bucket === '72') b72++
    } else if (t === 'chanhxe') {
      chanhXeCount++
    }
  }
  return { b24, b48, b72, chanhXeCount }
}

// "Phân loại đơn chưa giao theo khách hàng" và "chưa gửi chành" là số nhập tay lưu riêng theo weekId
// (không nằm trong file Excel) — vẫn còn nguyên sau khi Excel gốc bị xoá nên đọc thẳng từ đây.
function readKhBreakdown(type, weekId) {
  try { return JSON.parse(localStorage.getItem(`chuagiao_kh_${type}_tructIep_${weekId}`) || '{}') } catch { return {} }
}
function readChanhXeChuaGui(weekId) {
  const v = localStorage.getItem(`chuagiao_override_donC_chanhXe_${weekId}_chuagui`)
  return v === null ? 0 : Number(v)
}

function pct(part, total) { return total ? Math.round((part / total) * 100) : 0 }

function KpiTile({ icon: Icon, value, label, sub, pctOfTotal, cls, bg }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${bg} flex flex-col gap-2`}>
      <div className="flex items-center gap-3">
        <Icon size={18} className={cls} />
        <div>
          <div className={`text-lg font-bold ${cls} flex items-baseline gap-1.5`}>
            {value.toLocaleString('vi-VN')}
            {pctOfTotal !== undefined && <span className="text-xs font-medium text-gray-400">({pctOfTotal}%)</span>}
          </div>
          <div className="text-xs text-gray-500">{label}</div>
        </div>
      </div>
      {sub && (
        <div className="pt-2 border-t border-current/10 space-y-1">
          {sub.map(s => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <span className="text-gray-500">{s.label}</span>
              <span className={`font-semibold ${cls}`}>{s.value.toLocaleString('vi-VN')} <span className="text-gray-400 font-normal">({s.pct}%)</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ icon: Icon, value, label, cls, bg, pctOfTotal }) {
  return (
    <div className={`rounded-xl border p-3 ${bg} text-center`}>
      <Icon size={16} className={`${cls} mx-auto mb-1`} />
      <div className={`text-xl font-bold ${cls}`}>
        {value.toLocaleString('vi-VN')}
        {pctOfTotal !== undefined && <span className="text-xs font-medium text-gray-400 ml-1">({pctOfTotal}%)</span>}
      </div>
      <div className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</div>
    </div>
  )
}

function OrderBadge({ value }) {
  return (
    <span className="ml-auto bg-teal-600 px-3 py-1 rounded text-sm font-bold text-white">
      {value.toLocaleString('vi-VN')} đơn
    </span>
  )
}

function SectionCard({ title, total, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4 last:mb-0">
      <div
        className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer"
        onClick={() => setOpen(o => !o)}
      >
        <Truck size={16} className="text-gray-500" />
        <span className="font-semibold text-gray-700">{title}</span>
        <OrderBadge value={total} />
        {open ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
      </div>
      {open && <div className="p-4">{children}</div>}
    </div>
  )
}

// Số liệu "đã lưu" cho 1 tuần Đơn C/DTP — dựng lại đúng bố cục của khung Thống kê & Danh sách trực tiếp,
// nhưng lấy từ số đã đóng băng (b24/b48/b72/chanhXeCount) + các số nhập tay lưu riêng theo weekId
// (chưa giao theo khách hàng, chưa gửi chành) + dữ liệu VTP/SPX thật (không phụ thuộc Excel Đơn C/DTP).
function SnapshotView({ type, snapshot, onClearCarrierNow }) {
  const khValues = readKhBreakdown(type, snapshot.id)
  const chuaGiao = Object.values(khValues).reduce((s, v) => s + (Number(v) || 0), 0)
  const delivered = snapshot.b24 + snapshot.b48 + snapshot.b72
  const tructiepTotal = delivered + chuaGiao

  const chanhXeChuaGui = type === 'donC' ? readChanhXeChuaGui(snapshot.id) : 0
  const chanhXeTotal = snapshot.chanhXeCount + chanhXeChuaGui

  // Dòng dữ liệu gốc VTP/SPX còn thì tính trực tiếp (luôn mới nhất); đã xoá rồi thì dùng đúng số đã đóng băng —
  // KHÔNG được gọi getCarrierFileStats khi rows đã rỗng, vì sẽ tính ra 0 (không phải số liệu thật).
  const viettelStats = snapshot.viettelWeekId
    ? (carrierWeekHasRows(`${type}_viettel`, snapshot.viettelWeekId)
        ? getCarrierFileStats(`${type}_viettel`, 'viettel', [], snapshot.viettelWeekId, snapshot.carrierLookup)
        : snapshot.viettelFrozen)
    : null
  const spxStats = type === 'donC' && snapshot.spxWeekId
    ? (carrierWeekHasRows('donC_spx', snapshot.spxWeekId)
        ? getCarrierFileStats('donC_spx', 'spx', [], snapshot.spxWeekId, snapshot.carrierLookup)
        : snapshot.spxFrozen)
    : null
  const doitacTotal = (viettelStats?.total || 0) + (spxStats?.total || 0)

  const grandTotal = tructiepTotal + (type === 'donC' ? chanhXeTotal : 0) + doitacTotal
  const deliveredPct = pct(delivered, tructiepTotal)
  const chuaGiaoPct = pct(chuaGiao, tructiepTotal)

  return (
    <div>
      {/* KPI strip */}
      <div className={`grid gap-3 mb-4 ${type === 'donC' ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-3'}`}>
        <KpiTile icon={Package} value={grandTotal} label="Tổng đơn" cls="text-[#1e3a5f]" bg="bg-blue-50 border-blue-200" />
        <KpiTile icon={CheckCircle} value={tructiepTotal} label="Giao hàng trực tiếp" pctOfTotal={pct(tructiepTotal, grandTotal)} cls="text-green-700" bg="bg-green-50 border-green-200" />
        {type === 'donC' && (
          <KpiTile icon={TrendingUp} value={chanhXeTotal} label="Giao qua Chành xe" pctOfTotal={pct(chanhXeTotal, grandTotal)} cls="text-orange-700" bg="bg-orange-50 border-orange-200" />
        )}
        <KpiTile
          icon={TrendingUp} value={doitacTotal} label="Giao qua đối tác vận chuyển" pctOfTotal={pct(doitacTotal, grandTotal)}
          cls="text-teal-700" bg="bg-teal-50 border-teal-200"
          sub={[
            { label: 'Viettel Post', value: viettelStats?.total || 0, pct: pct(viettelStats?.total || 0, doitacTotal) },
            ...(type === 'donC' ? [{ label: 'SPX Express', value: spxStats?.total || 0, pct: pct(spxStats?.total || 0, doitacTotal) }] : []),
          ]}
        />
      </div>

      {/* Giao hàng trực tiếp */}
      <SectionCard title="Giao hàng trực tiếp" total={tructiepTotal}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <StatCard icon={CheckCircle} value={snapshot.b24} label="≤ 24 giờ" cls="text-green-600" bg="bg-green-50 border-green-200" pctOfTotal={pct(snapshot.b24, tructiepTotal)} />
          <StatCard icon={CheckCircle} value={snapshot.b48} label="≤ 48 giờ" cls="text-teal-600" bg="bg-teal-50 border-teal-200" pctOfTotal={pct(snapshot.b48, tructiepTotal)} />
          <StatCard icon={Clock} value={snapshot.b72} label="≤ 72 giờ" cls="text-blue-600" bg="bg-blue-50 border-blue-200" pctOfTotal={pct(snapshot.b72, tructiepTotal)} />
          <StatCard icon={AlertCircle} value={chuaGiao} label="Chưa giao" cls="text-yellow-600" bg="bg-yellow-50 border-yellow-200" pctOfTotal={pct(chuaGiao, tructiepTotal)} />
        </div>

        {chuaGiao > 0 && (
          <div className="mb-3 pt-3 border-t border-gray-100">
            <div className="text-xs font-medium text-yellow-700 mb-2">Phân loại đơn chưa giao theo khách hàng</div>
            <div className="flex flex-wrap gap-2">
              {(KH_TYPES[type] || []).filter(t => khValues[t.key]).map(t => (
                <div key={t.key} className="px-3 py-2 rounded-lg border border-yellow-200 bg-yellow-50 text-center">
                  <div className="text-xs text-yellow-700">{t.label}</div>
                  <div className="text-lg font-bold text-yellow-700">{khValues[t.key]}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tructiepTotal > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between mb-1.5 text-xs">
              <span className="text-green-700 font-medium">Đã giao: {delivered.toLocaleString('vi-VN')} đơn ({deliveredPct}%)</span>
              <span className="text-yellow-700 font-medium">Chưa giao: {chuaGiao.toLocaleString('vi-VN')} đơn ({chuaGiaoPct}%)</span>
            </div>
            <div className="flex bg-gray-100 rounded-full h-2.5 overflow-hidden">
              <div className="h-full bg-green-500" style={{ width: `${deliveredPct}%` }} />
              <div className="h-full bg-yellow-400" style={{ width: `${chuaGiaoPct}%` }} />
            </div>
          </div>
        )}
      </SectionCard>

      {/* Giao qua Chành xe (chỉ Đơn C) */}
      {type === 'donC' && (
        <SectionCard title="Giao qua Chành xe" total={chanhXeTotal}>
          <div className="text-sm text-gray-500 flex items-center gap-2 mb-2">
            <Package size={15} className="text-gray-400" />
            Tổng số đơn đã gửi qua chành: <strong className="text-gray-800">{snapshot.chanhXeCount.toLocaleString('vi-VN')} đơn</strong>
          </div>
          <div className="text-sm text-gray-500">
            Số đơn chưa gửi chành: <strong className="text-gray-800">{chanhXeChuaGui.toLocaleString('vi-VN')} đơn</strong>
          </div>
        </SectionCard>
      )}

      {/* Giao qua đối tác vận chuyển — VTP/SPX vẫn còn dữ liệu thật vì lưu riêng, không phụ thuộc Excel Đơn C/DTP,
          trừ khi dòng dữ liệu gốc của chính file VTP/SPX đó cũng đã được xoá (thì hiện số liệu tĩnh đã đóng băng) */}
      <SectionCard title="Giao qua đối tác vận chuyển" total={doitacTotal}>
        {snapshot.viettelWeekId ? (
          <div className="mb-4">
            {carrierWeekHasRows(`${type}_viettel`, snapshot.viettelWeekId) ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-700 text-sm">Viettel Post</span>
                  <button
                    onClick={() => onClearCarrierNow('viettel')}
                    className="text-xs text-gray-400 hover:text-red-500 underline"
                    title="Đóng băng số liệu và xoá dòng dữ liệu gốc của file này ngay (báo cáo này được lưu trước khi có tính năng tự xoá VTP/SPX)"
                  >
                    Xoá dòng dữ liệu gốc
                  </button>
                </div>
                <CarrierPanel carrierKey={`${type}_viettel`} label="Viettel Post" carrierType="viettel" weekId={snapshot.viettelWeekId} frozenLookup={snapshot.carrierLookup} />
              </>
            ) : (
              <FrozenCarrierCards label="Viettel Post" frozen={snapshot.viettelFrozen} />
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4">Chưa có file Viettel Post tương ứng với tuần này.</p>
        )}
        {type === 'donC' && (
          snapshot.spxWeekId ? (
            <div>
              {carrierWeekHasRows('donC_spx', snapshot.spxWeekId) ? (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-700 text-sm">SPX Express</span>
                    <button
                      onClick={() => onClearCarrierNow('spx')}
                      className="text-xs text-gray-400 hover:text-red-500 underline"
                      title="Đóng băng số liệu và xoá dòng dữ liệu gốc của file này ngay (báo cáo này được lưu trước khi có tính năng tự xoá VTP/SPX)"
                    >
                      Xoá dòng dữ liệu gốc
                    </button>
                  </div>
                  <CarrierPanel carrierKey="donC_spx" label="SPX Express" carrierType="spx" weekId={snapshot.spxWeekId} frozenLookup={snapshot.carrierLookup} />
                </>
              ) : (
                <FrozenCarrierCards label="SPX Express" frozen={snapshot.spxFrozen} />
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Chưa có file SPX Express tương ứng với tuần này.</p>
          )
        )}
      </SectionCard>
    </div>
  )
}

// Nút "Lưu số liệu tuần này" + lịch sử các tuần đã lưu cho tab Đơn C / Đơn DTP.
// Khi lưu: đóng băng mốc giao 24h/48h/72h (Giao trực tiếp) + số đơn Chành xe + tuần VTP/SPX đang khớp,
// rồi xoá file Excel gốc của tuần đó (VTP/SPX không bị xoá, vẫn hiển thị đầy đủ trong bản đã lưu).
export default function SheetReportPanel({ type, data, weekId, weekLabel, referenceDate = null, pendingClear = null, onSaved, onUndoClear, children }) {
  const [reports, setReports] = useState(() => readSheetReports(type))
  const viettelPending = useCarrierRowsPendingClear(`${type}_viettel`)
  const spxPending = useCarrierRowsPendingClear(type === 'donC' ? 'donC_spx' : null)
  const exportRef = useRef(null)
  const [exporting, setExporting] = useState(false)

  // Xuất báo cáo đã lưu thành 1 ảnh PNG để đính kèm/gửi báo cáo, không cần chụp màn hình tay
  const handleExportImage = async () => {
    if (!exportRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(exportRef.current, { backgroundColor: '#ffffff', pixelRatio: 2 })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${type === 'donC' ? 'DonC' : 'DonDTP'}_${weekLabel || weekId}.png`
      a.click()
    } catch {
      window.alert('Không xuất được ảnh, vui lòng thử lại.')
    } finally {
      setExporting(false)
    }
  }

  // Tuần đang chọn (ở ô chọn tuần trên cùng) đã bấm "Lưu" (Excel gốc rỗng) thì tự động hiện báo cáo đã lưu —
  // chọn tuần khác nào đã có tag "Đã lưu" trong ô chọn tuần cũng sẽ tự hiện báo cáo tương ứng, không cần thanh riêng nữa
  const snapshot = (!data || data.length === 0) ? reports.find(r => r.id === weekId) : null

  // Đang trong thời gian ân hạn — có thể là Excel gốc, hoặc dòng dữ liệu VTP/SPX (bấm "Xoá dòng dữ liệu gốc"
  // riêng cho báo cáo cũ) — vẫn còn cơ hội Hoàn tác. Hiện đồng hồ đếm ngược của mốc xoá muộn nhất trong 3 cái.
  const excelPending = pendingClear && pendingClear.weekId === weekId ? pendingClear : null
  const viettelCarrierPending = snapshot && viettelPending.pendingClear?.weekId === snapshot.viettelWeekId ? viettelPending.pendingClear : null
  const spxCarrierPending = snapshot && spxPending.pendingClear?.weekId === snapshot.spxWeekId ? spxPending.pendingClear : null
  const activePendings = [excelPending, viettelCarrierPending, spxCarrierPending].filter(Boolean)
  const isPendingClear = activePendings.length > 0
  const latestClearAt = isPendingClear ? Math.max(...activePendings.map(p => p.clearAt)) : null

  // Tự làm mới để đồng hồ đếm ngược trong banner không bị đứng yên
  const [, forceTick] = useState(0)
  useEffect(() => {
    if (!isPendingClear) return
    const timer = setInterval(() => forceTick(t => t + 1), 5000)
    return () => clearInterval(timer)
  }, [isPendingClear])

  const handleSave = () => {
    if (!weekId) return
    const buckets = computeBuckets(data)
    const viettelWeekId = pickCarrierWeekIdByDate(`${type}_viettel`, referenceDate)
    const spxWeekId = type === 'donC' ? pickCarrierWeekIdByDate('donC_spx', referenceDate) : null
    // Đóng băng bảng đối chiếu "Mã vận đơn" + toàn bộ 7 số liệu VTP/SPX lúc Excel/file gốc còn sống —
    // để sau khi xoá cả 2, số liệu vẫn đếm đúng như lúc đang xem trực tiếp, không bị lệch.
    const carrierLookup = snapshotCarrierLookup(data)
    const viettelFrozen = viettelWeekId ? getCarrierFileStats(`${type}_viettel`, 'viettel', data, viettelWeekId) : null
    const spxFrozen = spxWeekId ? getCarrierFileStats('donC_spx', 'spx', data, spxWeekId) : null
    const label = weekLabel || new Date().toLocaleDateString('vi-VN')
    const next = saveSheetReport(type, weekId, label, { ...buckets, viettelWeekId, spxWeekId, carrierLookup, viettelFrozen, spxFrozen })
    setReports(next)
    onSaved?.(weekId)
    // Dòng dữ liệu gốc của file VTP/SPX cũng sẽ tự xoá sau thời gian ân hạn, giống Excel gốc
    if (viettelWeekId) viettelPending.scheduleClear(viettelWeekId)
    if (spxWeekId) spxPending.scheduleClear(spxWeekId)
  }

  // Hoàn tác trong thời gian ân hạn.
  // - Nếu vừa bấm "Lưu số liệu tuần này": huỷ hết (Excel + VTP/SPX) và xoá luôn bản đã lưu, coi như chưa bấm Lưu.
  // - Nếu chỉ đang chờ xoá VTP/SPX của báo cáo cũ (bấm nút "Xoá dòng dữ liệu gốc" riêng): chỉ huỷ đúng phần đó,
  //   giữ nguyên báo cáo đã lưu (vì Excel gốc đã mất từ trước, xoá cả báo cáo sẽ mất trắng, không đúng ý).
  const handleUndo = () => {
    if (excelPending) {
      onUndoClear?.()
      viettelPending.cancelClear()
      spxPending.cancelClear()
      const next = removeSheetReport(type, weekId)
      setReports(next)
    } else {
      if (viettelCarrierPending) viettelPending.cancelClear()
      if (spxCarrierPending) spxPending.cancelClear()
    }
  }

  // Nối lại đúng file VTP/SPX theo ngày (dùng khi bản đã lưu trước đó bị lệch file vì lý do khác) —
  // không cần Excel gốc vì chỉ cập nhật tham chiếu, giữ nguyên b24/b48/b72 đã đóng băng
  const handleRelink = () => {
    if (!weekId) return
    const viettelWeekId = pickCarrierWeekIdByDate(`${type}_viettel`, referenceDate)
    const spxWeekId = type === 'donC' ? pickCarrierWeekIdByDate('donC_spx', referenceDate) : null
    const next = relinkSheetReportCarrier(type, weekId, { viettelWeekId, spxWeekId })
    setReports(next)
  }

  // Dành cho báo cáo đã lưu TRƯỚC KHI có tính năng tự xoá VTP/SPX (nên chưa từng được lên lịch xoá) —
  // đóng băng đủ 7 số liệu ngay bây giờ rồi lên lịch xoá dòng dữ liệu gốc như bình thường (có ân hạn + Hoàn tác)
  const handleClearCarrierNow = (which) => {
    const snap = reports.find(r => r.id === weekId)
    if (!snap) return
    if (which === 'viettel' && snap.viettelWeekId) {
      const viettelFrozen = getCarrierFileStats(`${type}_viettel`, 'viettel', [], snap.viettelWeekId, snap.carrierLookup)
      const next = relinkSheetReportCarrier(type, weekId, { viettelWeekId: snap.viettelWeekId, spxWeekId: snap.spxWeekId, viettelFrozen })
      setReports(next)
      viettelPending.scheduleClear(snap.viettelWeekId)
    } else if (which === 'spx' && snap.spxWeekId) {
      const spxFrozen = getCarrierFileStats('donC_spx', 'spx', [], snap.spxWeekId, snap.carrierLookup)
      const next = relinkSheetReportCarrier(type, weekId, { viettelWeekId: snap.viettelWeekId, spxWeekId: snap.spxWeekId, spxFrozen })
      setReports(next)
      spxPending.scheduleClear(snap.spxWeekId)
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-end gap-2 mb-3">
        {!snapshot && !isPendingClear && weekId && (
          <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a5f] text-white rounded-lg text-sm hover:bg-[#16304f] flex-shrink-0">
            <ClipboardList size={13} /> Lưu số liệu tuần này
          </button>
        )}
        {snapshot && (
          <>
            <button
              onClick={handleRelink}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 bg-white flex-shrink-0"
              title="Nối lại đúng file Viettel Post/SPX theo ngày, dùng khi khung Giao qua đối tác vận chuyển hiện sai/0"
            >
              <RefreshCw size={13} /> Đối chiếu lại VTP/SPX
            </button>
            <button
              onClick={handleExportImage}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 bg-white flex-shrink-0 disabled:opacity-50"
            >
              <Download size={13} /> {exporting ? 'Đang xuất...' : 'Xuất ảnh'}
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 bg-white flex-shrink-0"
            >
              <Printer size={13} /> In / Xuất PDF
            </button>
          </>
        )}
      </div>

      {isPendingClear && (
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-sm">
          <span className="text-amber-800">
            {excelPending
              ? 'Đã lưu số liệu — Excel gốc và dòng dữ liệu chi tiết Viettel Post/SPX Express sẽ tự xoá sau '
              : 'Dòng dữ liệu gốc VTP/SPX sẽ tự xoá sau '}
            <strong>{formatRemaining(latestClearAt)}</strong> nữa. Kiểm tra lại số liệu nếu cần.
          </span>
          <button onClick={handleUndo} className="flex items-center gap-1.5 px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700 flex-shrink-0">
            <ArrowRight size={12} className="rotate-180" /> Hoàn tác
          </button>
        </div>
      )}

      {snapshot ? (
        <div ref={exportRef} className="bg-[#f8fafc] p-2">
          <SnapshotView type={type} snapshot={snapshot} onClearCarrierNow={handleClearCarrierNow} />
        </div>
      ) : children}
    </div>
  )
}

function formatRemaining(clearAt) {
  const ms = Math.max(0, clearAt - Date.now())
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return min > 0 ? `${min} phút ${sec} giây` : `${sec} giây`
}
