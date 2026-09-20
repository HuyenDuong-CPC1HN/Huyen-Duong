import { useMemo, useState } from 'react'
import { CheckCircle, Clock, AlertCircle, Package, TrendingUp, Truck, Users } from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import { partnerType } from '../utils/partnerType'
import { computeChannelSnapshot } from '../utils/unifiedTrialChannelStats'
import { CarrierPanel } from './CarrierStats'
import { DetailTable } from './ThongKeDoiTac'
import { StatCard, SectionCard, KpiTile } from './ReportCards'

// Hiển thị chi tiết 1 kênh (Đơn C hoặc Đơn DTP) trong tab "Gộp kênh (Thử nghiệm)".
// Viết riêng, KHÔNG tái sử dụng ThongKeGiaoHang.jsx — file đó hard-code nhóm đối tác
// vận chuyển cố định theo type ('donC' luôn có SPX, 'donDTP' luôn KHÔNG có SPX), trong
// khi 2 kênh ở đây cần cấu hình khác nhau và có thể đổi theo thời gian (vd DTP sắp có
// thêm SPX-U) — dùng prop showChanhXe/showSpx để cấu hình theo từng kênh, không phải sửa
// code cũ mỗi khi nghiệp vụ đổi.
//
// Đối tác vận chuyển nào KHÔNG được bật (showChanhXe/showSpx = false) thì bị loại hẳn
// khỏi Tổng đơn của kênh đó (không đếm, không hiển thị) — ví dụ SPX bị loại khỏi Đơn C vì
// theo nghiệp vụ SPX COD thuộc kênh Ngoại sàn, không phải Đơn C.
//
// 3 ô nhập tay (giống ThongKeGiaoHang.jsx bản cũ, cổng nguyên công thức, chỉ đổi tiền tố
// storage key thành "unifiedTrial_" để không đụng số liệu 2 tab cũ):
//  - Phân loại "chưa giao" theo loại khách hàng -> tổng các ô này CHÍNH LÀ số "Chưa giao"
//    hiển thị (thay hẳn số đếm theo ngày tháng, vì "chưa giao" ở đây là đơn thật ngoài đời
//    nhưng có thể chưa/đã có trong Excel, nhân viên biết rõ hơn máy).
//  - "Số đơn chưa gửi chành" (chỉ Đơn C) — đơn thật nhưng chưa kịp gửi chành nên chưa có
//    trong Excel.

const STAT_COLS = [
  { key: '24h', label: '≤ 24 giờ', icon: CheckCircle, cls: 'text-green-600' },
  { key: '48h', label: '≤ 48 giờ', icon: CheckCircle, cls: 'text-teal-600' },
  { key: '72h', label: '≤ 72 giờ', icon: Clock, cls: 'text-blue-600' },
]

const KH_TYPES = {
  donC: [
    { key: 'bv', label: 'Bệnh viện', border: 'border-blue-200', text: 'text-blue-700' },
    { key: 'nt', label: 'Nhà thuốc', border: 'border-green-200', text: 'text-green-700' },
    { key: 'onl', label: 'KH ONL / Khách lẻ', border: 'border-gray-200', text: 'text-gray-600' },
  ],
  donDTP: [
    { key: 'nt', label: 'Nhà thuốc', border: 'border-green-200', text: 'text-green-700' },
    { key: 'pk', label: 'Phòng khám', border: 'border-purple-200', text: 'text-purple-700' },
    { key: 'onl', label: 'KH ONL / Khách lẻ', border: 'border-gray-200', text: 'text-gray-600' },
  ],
}

function useStoredValue(storageKey, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw === null ? fallback : JSON.parse(raw)
    } catch {
      return fallback
    }
  })
  const commit = (v) => {
    setValue(v)
    localStorage.setItem(storageKey, JSON.stringify(v))
  }
  return [value, commit]
}

function ChuaGiaoBreakdown({ channelKey, values, onChange, readOnly = false }) {
  const khTypes = KH_TYPES[channelKey] || []
  return (
    <div className="mt-3 pt-3 border-t border-yellow-100">
      <div className="flex items-center gap-1.5 mb-2">
        <Users size={13} className="text-yellow-600" />
        <span className="text-xs font-medium text-yellow-700">Phân loại đơn chưa giao theo khách hàng</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {khTypes.map(t => (
          <div key={t.key} className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg border ${t.border}`}>
            <span className={`text-xs font-medium ${t.text}`}>{t.label}</span>
            {readOnly ? (
              <span className="w-16 text-center text-lg font-bold text-gray-800">{values[t.key] || 0}</span>
            ) : (
              <input
                type="number"
                min="0"
                value={values[t.key] ?? ''}
                onChange={e => onChange(t.key, e.target.value)}
                className={`w-16 text-center text-lg font-bold bg-transparent border-b-2 ${t.border} focus:outline-none focus:border-blue-400`}
                placeholder="0"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ExpandableList({ rows, label }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <button type="button" onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 hover:underline">
        {open ? 'Ẩn chi tiết' : `Xem ${rows.length} đơn — ${label}`}
      </button>
      {open && <DetailTable rows={rows} />}
    </div>
  )
}

// readOnly=true + frozenSnapshot: hiển thị lại đúng số đã "Lưu số liệu tuần này" (xem
// unifiedTrialChannelStats.js), GIỮ NGUYÊN y hệt giao diện lúc xem trực tiếp — chỉ khác 2 chỗ
// bắt buộc phải khác: ô nhập tay hiện số tĩnh (không sửa được số của tuần đã lưu), và không có
// "Xem N đơn" (rows thô không được lưu lại, chỉ đóng băng số đã tính). Panel Viettel/SPX vẫn dùng
// đúng CarrierPanel như hàng ngày, chỉ ghim đúng tuần (weekId) + bảng đối chiếu (frozenLookup) tại
// thời điểm lưu, nên vẫn đầy đủ StatCard/bảng chi tiết y hệt bản sống.
export default function UnifiedTrialChannelDetail({
  data, channelKey, referenceDate = null, showChanhXe = false, showSpx = false,
  readOnly = false, frozenSnapshot = null,
}) {
  const validData = useMemo(() => data.filter(row => String(row['Mã kiện hàng'] ?? '').trim()), [data])

  const { tructiepRows, chanhxeRows } = useMemo(() => {
    const tructiepRows = []
    const chanhxeRows = []
    for (const row of validData) {
      const t = partnerType(row)
      if (t === 'tructiep') tructiepRows.push(row)
      else if (t !== 'viettel' && t !== 'spx') chanhxeRows.push(row)
    }
    return { tructiepRows, chanhxeRows }
  }, [validData])

  const viettelKey = `unifiedTrial_${channelKey}_viettel`
  const spxKey = `unifiedTrial_${channelKey}_spx`

  // Ô nhập tay: phân loại "chưa giao" theo khách hàng — tổng các ô này CHÍNH LÀ số "Chưa giao"
  const khStorageKey = `unifiedTrial_chuagiao_kh_${channelKey}`
  const [liveKhValues, commitKhValues] = useStoredValue(khStorageKey, {})
  const onKhChange = (key, val) => commitKhValues({ ...liveKhValues, [key]: val })

  // Ô nhập tay: "Số đơn chưa gửi chành" (chỉ khi có nhóm Chành xe)
  const chuaGuiKey = `unifiedTrial_chuagiao_chuagui_${channelKey}`
  const [liveChuaGuiChanh, commitChuaGuiChanh] = useStoredValue(chuaGuiKey, '')

  // Số liệu tổng hợp — dùng chung với lúc "Lưu số liệu tuần này" để không lệch số giữa hiển thị
  // trực tiếp và bản đóng băng (xem unifiedTrialChannelStats.js).
  const liveSnapshot = useMemo(
    () => computeChannelSnapshot({ data, channelKey, khValues: liveKhValues, chuaGuiChanh: liveChuaGuiChanh, showChanhXe, showSpx, referenceDate }),
    [data, channelKey, liveKhValues, liveChuaGuiChanh, showChanhXe, showSpx, referenceDate],
  )

  const snapshot = readOnly ? frozenSnapshot : liveSnapshot
  const khValues = readOnly ? frozenSnapshot.khValues : liveKhValues
  const chuaGuiChanh = readOnly ? frozenSnapshot.chuaGuiChanh : liveChuaGuiChanh
  const {
    total, trucTiepBadge, trucTiepStats, trucTiepDelivered, khBreakdownSum,
    chanhXeBadge, chanhXeCount, viettelCount, spxCount, doitacTotal,
    viettelWeekId, spxWeekId, carrierLookup,
  } = snapshot
  const trucTiepTotal = trucTiepDelivered + khBreakdownSum
  const trucTiepPct = trucTiepTotal > 0 ? Math.round((trucTiepDelivered / trucTiepTotal) * 100) : 0
  const trucTiepChuaGiaoPct = trucTiepTotal > 0 ? Math.round((khBreakdownSum / trucTiepTotal) * 100) : 0
  const pct = (part) => total ? Math.round((part / total) * 100) : 0

  const viettelPanelProps = readOnly
    ? { carrierKey: viettelKey, label: 'Viettel Post', carrierType: 'viettel', internalData: [], weekId: viettelWeekId, frozenLookup: carrierLookup }
    : { carrierKey: viettelKey, label: 'Viettel Post', carrierType: 'viettel', internalData: validData, referenceDate }
  const spxPanelProps = readOnly
    ? { carrierKey: spxKey, label: 'SPX Express', carrierType: 'spx', internalData: [], weekId: spxWeekId, frozenLookup: carrierLookup }
    : { carrierKey: spxKey, label: 'SPX Express', carrierType: 'spx', internalData: validData, referenceDate }

  const kpiCols = 3 + (showChanhXe ? 1 : 0)

  return (
    <div>
      <div className={`report-kpi-grid ${kpiCols === 4 ? 'is-four-column' : 'is-three-column'}`}>
        <KpiTile icon={Package} value={total} label="Tổng đơn" cls="text-[#1e3a5f]" />
        <KpiTile icon={CheckCircle} value={trucTiepBadge} label="Giao hàng trực tiếp" pctOfTotal={pct(trucTiepBadge)} cls="text-green-700" />
        {showChanhXe && (
          <KpiTile icon={TrendingUp} value={chanhXeBadge} label="Chành xe" pctOfTotal={pct(chanhXeBadge)} cls="text-orange-700" />
        )}
        <KpiTile
          icon={Truck} value={doitacTotal} label="Đối tác VC" pctOfTotal={pct(doitacTotal)} cls="text-teal-700"
          sub={showSpx ? [
            { label: 'VTP', value: viettelCount, pct: doitacTotal ? Math.round((viettelCount / doitacTotal) * 100) : 0 },
            { label: 'SPX', value: spxCount, pct: doitacTotal ? Math.round((spxCount / doitacTotal) * 100) : 0 },
          ] : undefined}
        />
      </div>

      <div className="space-y-4">
        <SectionCard title="Giao hàng trực tiếp" total={trucTiepBadge} icon={CheckCircle} defaultOpen={readOnly}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {STAT_COLS.map(col => (
              <StatCard key={col.key} icon={col.icon} value={trucTiepStats[col.key]} label={col.label} cls={col.cls} />
            ))}
            <StatCard icon={AlertCircle} value={khBreakdownSum} label="Chưa giao" cls="text-yellow-600" />
          </div>

          <ChuaGiaoBreakdown channelKey={channelKey} values={khValues} onChange={onKhChange} readOnly={readOnly} />

          {trucTiepTotal > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center justify-between mb-1.5 text-xs">
                <span className="flex items-center gap-1.5 text-green-700 font-medium">
                  <span className="w-2 h-2 rounded-full bg-green-500" /> Đã giao: {trucTiepDelivered} đơn ({trucTiepPct}%)
                </span>
                <span className="flex items-center gap-1.5 text-yellow-700 font-medium">
                  Chưa giao: {khBreakdownSum} đơn ({trucTiepChuaGiaoPct}%) <span className="w-2 h-2 rounded-full bg-yellow-400" />
                </span>
              </div>
              <div className="flex bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${trucTiepPct}%` }} />
                <div className="h-full bg-yellow-400" style={{ width: `${trucTiepChuaGiaoPct}%` }} />
              </div>
            </div>
          )}

          {!readOnly && <ExpandableList rows={tructiepRows} label="giao hàng trực tiếp" />}
        </SectionCard>

        {showChanhXe && (
          <SectionCard title="Giao qua Chành xe" total={chanhXeBadge} icon={Truck} defaultOpen={readOnly}>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Package size={15} className="text-gray-400" />
              Tổng số đơn đã gửi qua chành: <strong className="text-gray-800 ml-1">{chanhXeCount} đơn</strong>
            </div>
            <div className="pt-3 flex items-center gap-2">
              <label className="text-sm text-gray-500 flex items-center gap-2">
                <span>Số đơn chưa gửi chành:</span>
                {readOnly ? (
                  <strong className="w-20 text-center font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1">{chuaGuiChanh}</strong>
                ) : (
                  <input
                    type="number"
                    min="0"
                    value={chuaGuiChanh}
                    onChange={e => commitChuaGuiChanh(e.target.value)}
                    placeholder="0"
                    className="w-20 text-center font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-yellow-300"
                  />
                )}
                <span>đơn</span>
              </label>
            </div>
            {!readOnly && <ExpandableList rows={chanhxeRows} label="chành xe" />}
          </SectionCard>
        )}

        <SectionCard title="Giao qua đối tác vận chuyển" total={doitacTotal} icon={Truck}>
          <div className="space-y-3">
            <SectionCard title="Viettel Post" total={viettelCount} icon={Truck} defaultOpen={readOnly}>
              <CarrierPanel {...viettelPanelProps} />
            </SectionCard>
            {showSpx && (
              <SectionCard title="SPX Express" total={spxCount} icon={Truck} defaultOpen={readOnly}>
                <CarrierPanel {...spxPanelProps} />
              </SectionCard>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
