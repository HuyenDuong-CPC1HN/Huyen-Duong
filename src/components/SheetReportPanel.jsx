import { useRef } from 'react'
import { opsStore as localStorage } from '../data/workspace'
import { CheckCircle, Clock, AlertCircle, Package, TrendingUp, Truck, RotateCcw, XCircle } from 'lucide-react'
import {
  getCarrierFileStats, CarrierPanel, carrierWeekHasRows,
} from './CarrierStats'
import { KpiTile, StatCard, SectionCard } from './ReportCards'

const CARRIER_STAT_CARDS = [
  { key: '24h',           label: '≤ 24 giờ',        icon: CheckCircle, cls: 'text-green-600' },
  { key: '48h',           label: '≤ 48 giờ',        icon: CheckCircle, cls: 'text-teal-600' },
  { key: '72h',           label: '≤ 72 giờ',        icon: Clock,       cls: 'text-blue-600' },
  { key: 'choLay',        label: 'Chờ lấy',         icon: Package,     cls: 'text-purple-600' },
  { key: 'dangVanChuyen', label: 'Đang vận chuyển', icon: Truck,       cls: 'text-yellow-600' },
  { key: 'giaoLai',       label: 'Đang giao hàng',  icon: RotateCcw,   cls: 'text-orange-600' },
  { key: 'hoanHang',      label: 'Hoàn hàng',       icon: XCircle,     cls: 'text-red-600' },
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
          <StatCard key={c.key} icon={c.icon} value={frozen.stats[c.key] || 0} label={c.label} cls={c.cls} pctOfTotal={pct(frozen.stats[c.key] || 0, frozen.total)} />
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

// "Phân loại đơn chưa giao theo khách hàng" và "chưa gửi chành" là số nhập tay lưu riêng theo weekId
// (không nằm trong file Excel) — vẫn còn nguyên sau khi Excel gốc bị xoá nên đọc thẳng từ đây.
function readKhBreakdown(type, weekId) {
  try { return JSON.parse(localStorage.getItem(`chuagiao_kh_${type}_tructIep_${weekId}`) || '{}') } catch { return {} }
}
function readChanhXeChuaGui(weekId) {
  const v = localStorage.getItem(`chuagiao_override_donC_chanhXe_${weekId}_chuagui`)
  return v === null ? 0 : Number(v)
}

const pct = (part, total) => total ? Math.round((part / total) * 100) : 0

/** Live file rows if still present; otherwise the frozen snapshot. No week → null. */
function resolveCarrierStats(weekId, hasLiveRows, liveStats, frozen) {
  if (!weekId) return null
  if (hasLiveRows) return liveStats
  return frozen
}

function SnapshotCarrierBlock({
  label, weekId, hasLiveRows, frozen, onClear, livePanel, missingClassName = 'text-sm text-gray-400 mb-4',
}) {
  if (!weekId) {
    return <p className={missingClassName}>Chưa có file {label} tương ứng với tuần này.</p>
  }
  if (!hasLiveRows) {
    return (
      <div className="mb-4">
        <FrozenCarrierCards label={label} frozen={frozen} />
      </div>
    )
  }
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-gray-700 text-sm">{label}</span>
        <button
          type="button"
          onClick={onClear}
          className="text-xs text-gray-400 hover:text-red-500 underline"
          title="Đóng băng số liệu và xoá dòng dữ liệu gốc của file này ngay (báo cáo này được lưu trước khi có tính năng tự xoá VTP/SPX)"
        >
          Xoá dòng dữ liệu gốc
        </button>
      </div>
      {livePanel}
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

  // Dòng dữ liệu gốc VTP/SPX còn thì tính trực tiếp (luôn mới nhất); đã xoá rồi thì dùng đúng số đã đóng băng
  const viettelHasRows = Boolean(
    snapshot.viettelWeekId && carrierWeekHasRows(`${type}_viettel`, snapshot.viettelWeekId),
  )
  const viettelStats = resolveCarrierStats(
    snapshot.viettelWeekId,
    viettelHasRows,
    viettelHasRows
      ? getCarrierFileStats(`${type}_viettel`, 'viettel', [], snapshot.viettelWeekId, snapshot.carrierLookup)
      : null,
    snapshot.viettelFrozen,
  )
  const spxHasRows = Boolean(
    type === 'donC' && snapshot.spxWeekId && carrierWeekHasRows('donC_spx', snapshot.spxWeekId),
  )
  const spxStats = resolveCarrierStats(
    type === 'donC' ? snapshot.spxWeekId : null,
    spxHasRows,
    spxHasRows
      ? getCarrierFileStats('donC_spx', 'spx', [], snapshot.spxWeekId, snapshot.carrierLookup)
      : null,
    snapshot.spxFrozen,
  )
  const doitacTotal = (viettelStats?.total || 0) + (spxStats?.total || 0)
  const grandTotal = tructiepTotal + (type === 'donC' ? chanhXeTotal : 0) + doitacTotal
  const deliveredPct = pct(delivered, tructiepTotal)
  const chuaGiaoPct = pct(chuaGiao, tructiepTotal)

  return (
    <div className="saved-report sheet-tab-is-saved-report">
      {/* Eyebrow */}
      <div className="saved-report-eyebrow">
        <span className="saved-report-eyebrow-dot" aria-hidden="true" />
        <span>Bản đã lưu</span>
      </div>
      {/* KPI strip */}
      <div className={`report-kpi-grid ${type === 'donC' ? 'is-four-column' : 'is-three-column'}`}>
        <KpiTile icon={Package} value={grandTotal} label="Tổng đơn" cls="text-[#1e3a5f]" />
        <KpiTile icon={CheckCircle} value={tructiepTotal} label="Giao hàng trực tiếp" pctOfTotal={pct(tructiepTotal, grandTotal)} cls="text-green-700" />
        {type === 'donC' && (
          <KpiTile icon={TrendingUp} value={chanhXeTotal} label="Giao qua Chành xe" pctOfTotal={pct(chanhXeTotal, grandTotal)} cls="text-orange-700" />
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
          <StatCard icon={CheckCircle} value={snapshot.b24} label="≤ 24 giờ" cls="text-green-600" pctOfTotal={pct(snapshot.b24, tructiepTotal)} />
          <StatCard icon={CheckCircle} value={snapshot.b48} label="≤ 48 giờ" cls="text-teal-600" pctOfTotal={pct(snapshot.b48, tructiepTotal)} />
          <StatCard icon={Clock} value={snapshot.b72} label="≤ 72 giờ" cls="text-blue-600" pctOfTotal={pct(snapshot.b72, tructiepTotal)} />
          <StatCard icon={AlertCircle} value={chuaGiao} label="Chưa giao" cls="text-yellow-600" pctOfTotal={pct(chuaGiao, tructiepTotal)} />
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
        <SnapshotCarrierBlock
          label="Viettel Post"
          weekId={snapshot.viettelWeekId}
          hasLiveRows={viettelHasRows}
          frozen={snapshot.viettelFrozen}
          onClear={() => onClearCarrierNow('viettel')}
          livePanel={(
            <CarrierPanel
              carrierKey={`${type}_viettel`}
              label="Viettel Post"
              carrierType="viettel"
              weekId={snapshot.viettelWeekId}
              frozenLookup={snapshot.carrierLookup}
            />
          )}
        />
        {type === 'donC' && (
          <SnapshotCarrierBlock
            label="SPX Express"
            weekId={snapshot.spxWeekId}
            hasLiveRows={spxHasRows}
            frozen={snapshot.spxFrozen}
            onClear={() => onClearCarrierNow('spx')}
            missingClassName="text-sm text-gray-400"
            livePanel={(
              <CarrierPanel
                carrierKey="donC_spx"
                label="SPX Express"
                carrierType="spx"
                weekId={snapshot.spxWeekId}
                frozenLookup={snapshot.carrierLookup}
              />
            )}
          />
        )}
      </SectionCard>
    </div>
  )
}

// SheetReportPanel — layout wrapper for the Đơn C / Đơn DTP merged view.
// SnapshotView + onClearCarrierNow are rendered here; actions live in useSheetReportActions (SheetTab).
// accept exportRef as prop from SheetTab (not local ref).
export default function SheetReportPanel({
  type,
  reportSnapshot,
  onClearCarrierNow,
  exportRef: externalExportRef,
  children,
}) {
  // Use external exportRef from SheetTab; fallback to a local ref if not provided (backward compat)
  const localExportRef = useRef(null)
  const exportRef = externalExportRef ?? localExportRef

  return (
    <div>
      {reportSnapshot ? (
        <div ref={exportRef} className="report-export-surface">
          <SnapshotView type={type} snapshot={reportSnapshot} onClearCarrierNow={onClearCarrierNow} />
        </div>
      ) : children}
    </div>
  )
}
