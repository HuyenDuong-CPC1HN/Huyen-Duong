import { useMemo, useState } from 'react'
import { CheckCircle, Clock, AlertCircle, Package, TrendingUp, Truck } from 'lucide-react'
import { partnerType } from '../utils/partnerType'
import { deliveryBucket } from '../utils/deliveryDays'
import { getCarrierFileTotal } from './carrierUtils'
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

const STAT_COLS = [
  { key: '24h', label: '≤ 24 giờ', icon: CheckCircle, cls: 'text-green-600' },
  { key: '48h', label: '≤ 48 giờ', icon: CheckCircle, cls: 'text-teal-600' },
  { key: '72h', label: '≤ 72 giờ', icon: Clock, cls: 'text-blue-600' },
  { key: 'chuaGiao', label: 'Chưa xác định', icon: AlertCircle, cls: 'text-yellow-600' },
]

function calcTrucTiepStats(rows) {
  const result = { '24h': 0, '48h': 0, '72h': 0, chuaGiao: 0 }
  for (const row of rows) {
    const bucket = deliveryBucket(row)
    if (bucket === '24') result['24h']++
    else if (bucket === '48') result['48h']++
    else if (bucket === '72') result['72h']++
    else result.chuaGiao++
  }
  return result
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

export default function UnifiedTrialChannelDetail({ data, channelKey, referenceDate = null, showChanhXe = false, showSpx = false }) {
  const validData = useMemo(() => data.filter(row => String(row['Mã kiện hàng'] ?? '').trim()), [data])

  const { tructiepRows, chanhxeRows, viettelRows, spxRows } = useMemo(() => {
    const tructiepRows = []
    const chanhxeRows = []
    const viettelRows = []
    const spxRows = []
    for (const row of validData) {
      const t = partnerType(row)
      if (t === 'tructiep') tructiepRows.push(row)
      else if (t === 'viettel') viettelRows.push(row)
      else if (t === 'spx') spxRows.push(row)
      else chanhxeRows.push(row)
    }
    return { tructiepRows, chanhxeRows, viettelRows, spxRows }
  }, [validData])

  const trackedChanhXeRows = showChanhXe ? chanhxeRows : []
  const trackedSpxRows = showSpx ? spxRows : []

  const viettelKey = `unifiedTrial_${channelKey}_viettel`
  const spxKey = `unifiedTrial_${channelKey}_spx`
  const viettelFile = getCarrierFileTotal(viettelKey, 'viettel', validData, referenceDate)
  const viettelCount = viettelFile ? viettelFile.total : viettelRows.length
  const spxFile = showSpx ? getCarrierFileTotal(spxKey, 'spx', validData, referenceDate) : null
  const spxCount = showSpx ? (spxFile ? spxFile.total : trackedSpxRows.length) : 0

  const doitacTotal = viettelCount + spxCount
  const total = tructiepRows.length + trackedChanhXeRows.length + doitacTotal
  const pct = (part) => total ? Math.round((part / total) * 100) : 0

  const trucTiepStats = calcTrucTiepStats(tructiepRows)

  const kpiCols = 3 + (showChanhXe ? 1 : 0)

  return (
    <div>
      <div className={`report-kpi-grid ${kpiCols === 4 ? 'is-four-column' : 'is-three-column'}`}>
        <KpiTile icon={Package} value={total} label="Tổng đơn" cls="text-[#1e3a5f]" />
        <KpiTile icon={CheckCircle} value={tructiepRows.length} label="Giao hàng trực tiếp" pctOfTotal={pct(tructiepRows.length)} cls="text-green-700" />
        {showChanhXe && (
          <KpiTile icon={TrendingUp} value={trackedChanhXeRows.length} label="Chành xe" pctOfTotal={pct(trackedChanhXeRows.length)} cls="text-orange-700" />
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
        <SectionCard title="Giao hàng trực tiếp" total={tructiepRows.length} icon={CheckCircle} defaultOpen={false}>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
            {STAT_COLS.map(col => (
              <StatCard key={col.key} icon={col.icon} value={trucTiepStats[col.key]} label={col.label} cls={col.cls} />
            ))}
          </div>
          <ExpandableList rows={tructiepRows} label="giao hàng trực tiếp" />
        </SectionCard>

        {showChanhXe && (
          <SectionCard title="Giao qua Chành xe" total={trackedChanhXeRows.length} icon={Truck} defaultOpen={false}>
            <div className="text-sm text-gray-500 flex items-center gap-2">
              <Package size={15} className="text-gray-400" />
              Tổng số đơn đã gửi qua chành: <strong className="text-gray-800 ml-1">{trackedChanhXeRows.length} đơn</strong>
            </div>
            <ExpandableList rows={trackedChanhXeRows} label="chành xe" />
          </SectionCard>
        )}

        <SectionCard title="Giao qua đối tác vận chuyển" total={doitacTotal} icon={Truck}>
          <div className="space-y-3">
            <SectionCard title="Viettel Post" total={viettelCount} icon={Truck} defaultOpen={false}>
              <CarrierPanel carrierKey={viettelKey} label="Viettel Post" carrierType="viettel" internalData={validData} referenceDate={referenceDate} />
            </SectionCard>
            {showSpx && (
              <SectionCard title="SPX Express" total={spxCount} icon={Truck} defaultOpen={false}>
                <CarrierPanel carrierKey={spxKey} label="SPX Express" carrierType="spx" internalData={validData} referenceDate={referenceDate} />
              </SectionCard>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}
