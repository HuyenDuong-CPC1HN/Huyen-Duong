import { useEffect, useMemo, useState } from 'react'
import {
  Package, ShoppingBag, Globe, RefreshCw, Users, AlertTriangle,
  CheckCircle, Clock, AlertCircle, TrendingUp, Truck, Save,
} from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import ExcelUpload from './ExcelUpload'
import UnifiedTrialChannelDetail from './UnifiedTrialChannelDetail'
import { CarrierPanel } from './CarrierStats'
import { KpiTile, SectionCard, StatCard } from './ReportCards'
import { splitDonSO, splitDonTruyenThong, splitTmdtByShop } from '../utils/unifiedTrialSplit'
import { parseStaffRoster, splitByWarehouseStaff } from '../utils/warehouseStaffFilter'
import { computeChannelSnapshot } from '../utils/unifiedTrialChannelStats'
import { readTrialReports, saveTrialReport, computeNgoaiSanReportStats } from '../utils/unifiedTrialReports'

// Màu nền theo shop — khớp bảng màu STORE_CLS đang dùng ở TmdtTab.jsx (không import chung,
// tab thử nghiệm này vẫn giữ biến riêng để độc lập).
const SHOP_CLS = {
  L00702: 'bg-blue-50 border-blue-200 text-blue-700',
  L00671: 'bg-orange-50 border-orange-200 text-orange-700',
  L00703: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  L00704: 'bg-purple-50 border-purple-200 text-purple-700',
}

// Note rút gọn cho panel Đối soát đơn ngoại sàn — bỏ nhắc "file bốc đóng" vì tab này đã tự động lấy
// Mốc 2 từ file Đơn SO (không còn nút upload tay), khác với Đơn C production vẫn cần upload tay.
const NGOAI_SAN_NOTE = (
  <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
    <div className="space-y-0.5">
      <div>Mốc 1: Sales order</div>
      <div>Mốc 2: Kho đóng kiện</div>
      <div>Mốc 3: SPX lấy hàng</div>
      <div>Mốc 4: SPX giao hàng thành công.</div>
    </div>
    <div className="space-y-0.5">
      <div>A) Đóng kiện (M1→M2) đạt khi ≤24h.</div>
      <div>B) SPX lấy hàng (M2→M3) tính theo nhóm 24h/48h/72h kể từ lúc đóng kiện xong.</div>
      <div>C) Giao hàng (M1→M4) đạt khi ≤48h.</div>
    </div>
  </div>
)

// "Đối soát ngoại sàn (SPX COD)" (NgoaiSanPanel, lồng trong CarrierPanel khi carrierType="spx")
// cần 2 nguồn: "Sales Order" (Mốc 1, người dùng upload tay qua đúng nút có sẵn trong
// NgoaiSanPanel) và "file bốc đóng" (Mốc 2). Mốc 2 với kênh Ngoại sàn thực ra đã có sẵn trong
// chính file Đơn SO (cột "TG Đóng hàng" + "Mã vận đơn") — nên ở đây tự ghi thẳng vào đúng ô nhớ
// NgoaiSanPanel đọc (`carrier_packingweeks_<carrierKey>`) mỗi khi có file Đơn SO mới, khỏi phải
// upload thêm 1 file "bốc đóng" riêng. Nút "Upload File bốc đóng" bị dư nên đã ẩn qua prop
// `hidePackingUpload` (thêm trong CarrierStats.jsx, mặc định tắt — Đơn C/DTP không bị ảnh hưởng).
function seedNgoaiSanPackingWeek(carrierKey, ngoaiSanRows, uploadedAt) {
  const entry = { id: uploadedAt, fileName: 'Tự động lấy từ file Đơn SO (cột TG Đóng hàng)', uploadedAt, rows: ngoaiSanRows }
  localStorage.setItem(`carrier_packingweeks_${carrierKey}`, JSON.stringify([entry]))
}

// Tab "Gộp kênh (Thử nghiệm)" — chạy song song, ĐỘC LẬP hoàn toàn với 3 tab sản xuất
// (Giao hàng Đơn C / Giao hàng Đơn DTP / Đơn hàng Sàn TMĐT):
//  - Storage riêng (khoá "unified_trial_*"), không đụng "sheet_reports_*" / "tmdt_reports".
//  - Không import/sửa SheetTab.jsx / TmdtTab.jsx.
// Mục đích: upload 2 file gộp sẵn (Đơn SO, Đơn truyền thống) rồi tự tách theo kênh,
// để đối chiếu song song với cách làm thủ công hiện tại trước khi quyết định thay thế.

const SO_ROWS_KEY = 'unified_trial_donSO_rows'
const SO_META_KEY = 'unified_trial_donSO_meta'
const TT_ROWS_KEY = 'unified_trial_donTT_rows'
const TT_META_KEY = 'unified_trial_donTT_meta'
const STAFF_ROSTER_KEY = 'unified_trial_hcm_staff_roster'

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Danh sách nhân sự kho HCM dùng chung cho cả 2 pill (Đơn SO / Đơn truyền thống) — mỗi dòng 1
// người, dán y hệt định dạng "Tên (SĐT)" trong cột "Bốc hàng"/"Đóng hàng" của Excel. Một đơn chỉ
// tính là của kho HCM khi CẢ 2 (Bốc hàng và Đóng hàng) đều là người trong danh sách này.
// Danh sách này cố định, ít khi sửa — đặt gọn thành 1 nút nhỏ + popover ở góc phải header, không
// chiếm chỗ cố định ở đầu trang như trước.
function StaffRosterEditor({ rosterText, onChange }) {
  const [open, setOpen] = useState(false)
  const count = rosterText.split('\n').map(s => s.trim()).filter(Boolean).length

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} className="sheet-tab-action">
        <Users size={13} />
        Nhân sự kho HCM ({count})
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 w-96 bg-white border border-gray-200 rounded-xl shadow-lg p-3">
            <p className="text-xs text-gray-400 mb-2">
              Dán danh sách nhân sự kho HCM, mỗi dòng 1 người, đúng định dạng "Tên (SĐT)" như trong
              cột "Bốc hàng"/"Đóng hàng" của Excel. Đơn chỉ tính của kho HCM khi cả Bốc hàng lẫn Đóng
              hàng đều là người trong danh sách — lệch nhau (1 trong 2) sẽ bị cảnh báo riêng, không
              tính vào tổng.
            </p>
            <textarea
              value={rosterText}
              onChange={e => onChange(e.target.value)}
              placeholder={'Phạm Thị Kiều Mi (0941512763)\nBùi Thị Diễm Duy (0354240857)\n...'}
              rows={8}
              className="w-full text-sm font-mono border border-gray-200 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <p className="text-xs text-gray-400 mt-2">
              {count === 0
                ? 'Chưa nhập danh sách — mọi đơn tạm tính là kho HCM, chưa lọc gì.'
                : `Đang lọc theo ${count} nhân sự.`}
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function MismatchWarning({ mismatchRows, otherCount }) {
  const [open, setOpen] = useState(false)
  if (mismatchRows.length === 0 && otherCount === 0) return null
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4 text-sm">
      <div className="flex items-center gap-2 text-amber-800">
        <AlertTriangle size={15} className="shrink-0" />
        <span>
          {otherCount > 0 && `${otherCount} đơn không thuộc kho HCM đã loại khỏi thống kê. `}
          {mismatchRows.length > 0 && `${mismatchRows.length} đơn bốc/đóng LỆCH kho (1 trong 2 không khớp danh sách) — cần kiểm tra lại.`}
        </span>
      </div>
      {mismatchRows.length > 0 && (
        <>
          <button type="button" onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 hover:underline mt-1">
            {open ? 'Ẩn danh sách' : `Xem ${mismatchRows.length} đơn lệch kho`}
          </button>
          {open && (
            <div className="mt-2 overflow-x-auto rounded-lg border border-amber-100 bg-white">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-amber-100/50 border-b border-amber-100">
                    <th className="px-3 py-2 text-left font-semibold">Mã kiện hàng</th>
                    <th className="px-3 py-2 text-left font-semibold">Bốc hàng</th>
                    <th className="px-3 py-2 text-left font-semibold">Đóng hàng</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatchRows.map((row, i) => (
                    <tr key={`${row['Mã kiện hàng']}-${i}`} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5">{row['Mã kiện hàng'] || '—'}</td>
                      <td className="px-3 py-1.5">{row['Bốc hàng'] || '—'}</td>
                      <td className="px-3 py-1.5">{row['Đóng hàng'] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FileSlot({ meta, onReplace, uploadNode }) {
  if (!meta) return uploadNode
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl mb-4">
      <div className="text-sm text-gray-600">
        <span className="font-medium text-gray-800">{meta.fileName}</span>
        <span className="text-gray-400"> — upload lúc {new Date(meta.uploadedAt).toLocaleString('vi-VN')}</span>
      </div>
      <button
        type="button"
        onClick={onReplace}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs hover:border-blue-400 hover:text-blue-600 text-gray-600"
      >
        <RefreshCw size={12} />
        Upload lại
      </button>
    </div>
  )
}

// "Lưu số liệu tuần này" — đóng băng số đã tính, KHÔNG tự xoá rows thô như 3 tab sản xuất (tab này
// chỉ giữ 1 slot rows/kênh nên không cần cơ chế dọn bớt; upload tuần mới vẫn ghi đè rows thô như cũ,
// không ảnh hưởng các bản đã lưu). Xem chi tiết thiết kế: unifiedTrialReports.js.
function SaveWeekButton({ onSave, alreadySaved }) {
  return (
    <button
      type="button"
      onClick={onSave}
      className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs hover:border-green-400 hover:text-green-700 text-gray-600"
    >
      <Save size={12} />
      {alreadySaved ? 'Lưu lại số liệu tuần này' : 'Lưu số liệu tuần này'}
    </button>
  )
}

function SavedWeekPicker({ reports, viewingId, onChange }) {
  return (
    <select
      value={viewingId || ''}
      onChange={e => onChange(e.target.value || null)}
      className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
    >
      <option value="">— Xem trực tiếp (tuần hiện tại) —</option>
      {reports.map(r => (
        <option key={r.id} value={r.id}>{r.label}</option>
      ))}
    </select>
  )
}

const NGOAI_SAN_SNAPSHOT_CARDS = {
  dongKien: [
    { key: 'dungHanDongKien', label: 'Đóng kiện đúng hạn (≤24h)' },
    { key: 'treDongKien', label: 'Trễ đóng kiện (>24h)' },
    { key: 'quaHanChuaDongKien', label: 'Chưa đóng kiện — quá 24h' },
  ],
  layHang: [
    { key: 'layTrong24h', label: 'SPX lấy trong 24h' },
    { key: 'layTrong48h', label: 'SPX lấy trong 48h' },
    { key: 'layTrong72h', label: 'SPX lấy trong 72h' },
    { key: 'layQua72h', label: 'SPX lấy sau >72h' },
    { key: 'layChuaLay', label: 'Chưa lấy hàng' },
  ],
  giao: [
    { key: 'dungHanGiao', label: 'Giao đúng hạn (≤48h)' },
    { key: 'treHanGiao', label: 'Giao trễ hạn (>48h)' },
    { key: 'chuaGiaoQuaHan', label: 'Chưa giao — quá 48h' },
  ],
}

function NgoaiSanStatRows({ stats, cards }) {
  return (
    <>
      {cards.map(c => (
        <div key={c.key} className="flex items-center justify-between text-sm text-gray-600 py-0.5">
          <span>{c.label}</span>
          <strong className="text-gray-800">{(stats[c.key] ?? 0).toLocaleString('vi-VN')}</strong>
        </div>
      ))}
    </>
  )
}

function DonSanSnapshotView({ entry }) {
  const shopCol1 = entry.shops.slice(0, 2)
  const shopCol2 = entry.shops.slice(2, 4)
  return (
    <div>
      <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-4 text-sm text-gray-600">
        <span className="font-medium text-gray-800">{entry.fileName}</span>
        <span className="text-gray-400"> — đã lưu lúc {new Date(entry.createdAt).toLocaleString('vi-VN')}</span>
        {(entry.otherCount > 0 || entry.mismatchCount > 0) && (
          <div className="text-amber-700 text-xs mt-1">
            {entry.otherCount > 0 && `${entry.otherCount} đơn không thuộc kho HCM đã loại khỏi thống kê. `}
            {entry.mismatchCount > 0 && `${entry.mismatchCount} đơn lệch kho.`}
          </div>
        )}
      </div>
      <div className="report-kpi-grid is-three-column">
        <KpiTile icon={Package} value={entry.total} label="Tổng Đơn sàn" cls="text-[#1e3a5f]" />
        <KpiTile icon={ShoppingBag} value={entry.tmdtCount} label="Đơn sàn TMĐT (Shopee, TikTok)" pctOfTotal={entry.total ? Math.round((entry.tmdtCount / entry.total) * 100) : 0} cls="text-blue-700" />
        <KpiTile icon={Globe} value={entry.ngoaiSanCount} label="Đơn ngoại sàn (Website)" pctOfTotal={entry.total ? Math.round((entry.ngoaiSanCount / entry.total) * 100) : 0} cls="text-purple-700" />
      </div>

      <div className="space-y-4 mt-4">
        <SectionCard title="ĐƠN SÀN TMĐT CHI TIẾT THEO SHOP" total={entry.tmdtCount}>
          <div className="grid grid-cols-2 gap-3">
            {[shopCol1, shopCol2].map((col, i) => (
              <div key={i} className="space-y-2">
                {col.map(shop => (
                  <div key={shop.code} className={`flex items-center justify-between px-3 py-3 rounded-xl border-2 ${SHOP_CLS[shop.code]}`}>
                    <div className="flex items-center gap-2 text-sm min-w-0">
                      <span className="font-semibold truncate">{shop.label}</span>
                      <span className="text-xs font-mono shrink-0 opacity-60">{shop.code}</span>
                    </div>
                    <span className="text-lg font-bold shrink-0">{shop.count.toLocaleString('vi-VN')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="ĐỐI SOÁT ĐƠN WEBSITE" total={entry.ngoaiSanCount}>
          {entry.ngoaiSanStats ? (
            <div className="grid grid-cols-2 gap-x-6">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">A) Đóng kiện (M1→M2)</div>
                <NgoaiSanStatRows stats={entry.ngoaiSanStats} cards={NGOAI_SAN_SNAPSHOT_CARDS.dongKien} />
                <div className="text-xs font-semibold text-gray-500 mb-1 mt-3">C) Giao hàng (M1→M4)</div>
                <NgoaiSanStatRows stats={entry.ngoaiSanStats} cards={NGOAI_SAN_SNAPSHOT_CARDS.giao} />
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">B) SPX lấy hàng (M2→M3)</div>
                <NgoaiSanStatRows stats={entry.ngoaiSanStats} cards={NGOAI_SAN_SNAPSHOT_CARDS.layHang} />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Chưa có dữ liệu đối soát ngoại sàn tại thời điểm lưu (thiếu file SPX xuất).</p>
          )}
        </SectionCard>
      </div>
    </div>
  )
}

function ChannelSnapshotSummary({ snap, showChanhXe, showSpx }) {
  const kpiCols = 3 + (showChanhXe ? 1 : 0)
  return (
    <div>
      <div className={`report-kpi-grid ${kpiCols === 4 ? 'is-four-column' : 'is-three-column'}`}>
        <KpiTile icon={Package} value={snap.total} label="Tổng đơn" cls="text-[#1e3a5f]" />
        <KpiTile icon={CheckCircle} value={snap.trucTiepBadge} label="Giao hàng trực tiếp" pctOfTotal={snap.total ? Math.round((snap.trucTiepBadge / snap.total) * 100) : 0} cls="text-green-700" />
        {showChanhXe && (
          <KpiTile icon={TrendingUp} value={snap.chanhXeBadge} label="Chành xe" pctOfTotal={snap.total ? Math.round((snap.chanhXeBadge / snap.total) * 100) : 0} cls="text-orange-700" />
        )}
        <KpiTile
          icon={Truck} value={snap.doitacTotal} label="Đối tác VC" pctOfTotal={snap.total ? Math.round((snap.doitacTotal / snap.total) * 100) : 0} cls="text-teal-700"
          sub={showSpx ? [
            { label: 'VTP', value: snap.viettelCount, pct: snap.doitacTotal ? Math.round((snap.viettelCount / snap.doitacTotal) * 100) : 0 },
            { label: 'SPX', value: snap.spxCount, pct: snap.doitacTotal ? Math.round((snap.spxCount / snap.doitacTotal) * 100) : 0 },
          ] : undefined}
        />
      </div>
      <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', marginTop: 16 }}>
        <StatCard icon={CheckCircle} value={snap.trucTiepStats['24h']} label="≤ 24 giờ" cls="text-green-600" />
        <StatCard icon={CheckCircle} value={snap.trucTiepStats['48h']} label="≤ 48 giờ" cls="text-teal-600" />
        <StatCard icon={Clock} value={snap.trucTiepStats['72h']} label="≤ 72 giờ" cls="text-blue-600" />
        <StatCard icon={AlertCircle} value={snap.khBreakdownSum} label="Chưa giao" cls="text-yellow-600" />
      </div>
      {showChanhXe && (
        <p className="text-xs text-gray-400 mt-3">Trong đó chưa gửi chành: {snap.chuaGuiChanh.toLocaleString('vi-VN')} đơn.</p>
      )}
    </div>
  )
}

function DonTruyenThongSnapshotView({ entry }) {
  const [channel, setChannel] = useState('donC')
  return (
    <div>
      <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-4 text-sm text-gray-600">
        <span className="font-medium text-gray-800">{entry.fileName}</span>
        <span className="text-gray-400"> — đã lưu lúc {new Date(entry.createdAt).toLocaleString('vi-VN')}</span>
        {(entry.otherCount > 0 || entry.mismatchCount > 0) && (
          <div className="text-amber-700 text-xs mt-1">
            {entry.otherCount > 0 && `${entry.otherCount} đơn không thuộc kho HCM đã loại khỏi thống kê. `}
            {entry.mismatchCount > 0 && `${entry.mismatchCount} đơn lệch kho.`}
          </div>
        )}
      </div>

      <div className="tdr-tabswitch" style={{ marginBottom: 16 }}>
        <button type="button" className={channel === 'donC' ? 'active' : ''} onClick={() => setChannel('donC')}>
          Đơn C ({entry.donC.total})
        </button>
        <button type="button" className={channel === 'donDTP' ? 'active' : ''} onClick={() => setChannel('donDTP')}>
          Đơn DTP ({entry.donDTP.total})
        </button>
      </div>

      {channel === 'donC' && <ChannelSnapshotSummary snap={entry.donC} showChanhXe showSpx={false} />}
      {channel === 'donDTP' && <ChannelSnapshotSummary snap={entry.donDTP} showChanhXe={false} showSpx />}
    </div>
  )
}

function DonSanView({ rosterSet }) {
  const [meta, setMeta] = useState(() => readJSON(SO_META_KEY, null))
  const [rows, setRows] = useState(() => readJSON(SO_ROWS_KEY, null))
  const [replacing, setReplacing] = useState(false)
  const [reports, setReports] = useState(() => readTrialReports('donSO'))
  const [viewingId, setViewingId] = useState(null)

  const onData = (data, fileName) => {
    const m = { fileName, uploadedAt: new Date().toISOString() }
    localStorage.setItem(SO_ROWS_KEY, JSON.stringify(data))
    localStorage.setItem(SO_META_KEY, JSON.stringify(m))
    setRows(data)
    setMeta(m)
    setReplacing(false)
    setViewingId(null)
  }

  const { hcmRows, otherRows, mismatchRows } = useMemo(
    () => splitByWarehouseStaff(rows || [], rosterSet),
    [rows, rosterSet],
  )
  const { tmdt, ngoaiSan } = useMemo(() => splitDonSO(hcmRows), [hcmRows])
  const total = tmdt.length + ngoaiSan.length
  const { shops } = useMemo(() => splitTmdtByShop(tmdt), [tmdt])
  const shopCol1 = shops.slice(0, 2)
  const shopCol2 = shops.slice(2, 4)

  const ngoaiSanCarrierKey = 'unifiedTrial_donSO_spx'
  useEffect(() => {
    if (!meta || ngoaiSan.length === 0) return
    seedNgoaiSanPackingWeek(ngoaiSanCarrierKey, ngoaiSan, meta.uploadedAt)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.uploadedAt, ngoaiSan])

  const handleSave = () => {
    if (!meta) return
    const entry = {
      id: meta.uploadedAt,
      fileName: meta.fileName,
      label: `${meta.fileName} · ${new Date(meta.uploadedAt).toLocaleDateString('vi-VN')}`,
      total, tmdtCount: tmdt.length, ngoaiSanCount: ngoaiSan.length,
      otherCount: otherRows.length, mismatchCount: mismatchRows.length,
      shops: shops.map(s => ({ code: s.code, label: s.label, count: s.count })),
      ngoaiSanStats: computeNgoaiSanReportStats(ngoaiSanCarrierKey, meta.uploadedAt),
    }
    setReports(saveTrialReport('donSO', entry))
  }

  const uploadNode = (
    <ExcelUpload onData={onData} fileName="" onClear={() => {}} />
  )

  if (!rows || replacing) {
    return <div>{uploadNode}</div>
  }

  const viewingEntry = viewingId ? reports.find(r => r.id === viewingId) : null
  const alreadySaved = meta && reports.some(r => r.id === meta.uploadedAt)

  return (
    <div>
      <FileSlot meta={meta} onReplace={() => setReplacing(true)} uploadNode={uploadNode} />
      <div className="flex items-center justify-between gap-2 mb-4">
        <SavedWeekPicker reports={reports} viewingId={viewingId} onChange={setViewingId} />
        {!viewingId && <SaveWeekButton onSave={handleSave} alreadySaved={alreadySaved} />}
      </div>

      {viewingEntry ? (
        <DonSanSnapshotView entry={viewingEntry} />
      ) : (
        <>
          <MismatchWarning mismatchRows={mismatchRows} otherCount={otherRows.length} />
          <div className="report-kpi-grid is-three-column">
            <KpiTile icon={Package} value={total} label="Tổng Đơn sàn" cls="text-[#1e3a5f]" />
            <KpiTile icon={ShoppingBag} value={tmdt.length} label="Đơn sàn TMĐT (Shopee, TikTok)" pctOfTotal={total ? Math.round((tmdt.length / total) * 100) : 0} cls="text-blue-700" />
            <KpiTile icon={Globe} value={ngoaiSan.length} label="Đơn ngoại sàn (Website)" pctOfTotal={total ? Math.round((ngoaiSan.length / total) * 100) : 0} cls="text-purple-700" />
          </div>

          <div className="space-y-4 mt-4">
            <SectionCard title="ĐƠN SÀN TMĐT CHI TIẾT THEO SHOP" total={tmdt.length}>
              <div className="grid grid-cols-2 gap-3">
                {[shopCol1, shopCol2].map((col, i) => (
                  <div key={i} className="space-y-2">
                    {col.map(shop => (
                      <div key={shop.code} className={`flex items-center justify-between px-3 py-3 rounded-xl border-2 ${SHOP_CLS[shop.code]}`}>
                        <div className="flex items-center gap-2 text-sm min-w-0">
                          <span className="font-semibold truncate">{shop.label}</span>
                          <span className="text-xs font-mono shrink-0 opacity-60">{shop.code}</span>
                        </div>
                        <span className="text-lg font-bold shrink-0">{shop.count.toLocaleString('vi-VN')}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="ĐỐI SOÁT ĐƠN WEBSITE" total={ngoaiSan.length}>
              <p className="text-xs text-gray-400 mb-3">
                Mốc "Đóng kiện" tự động lấy từ cột "TG Đóng hàng" trong file Đơn SO vừa upload — chỉ cần
                upload thêm "Sales Order" (Mốc 1) và file SPX xuất (Mốc 3/4) ở khung bên dưới.
              </p>
              <CarrierPanel
                key={meta?.uploadedAt}
                carrierKey={ngoaiSanCarrierKey}
                label="SPX Express — Ngoại sàn"
                carrierType="spx"
                internalData={ngoaiSan}
                referenceDate={meta?.uploadedAt}
                hidePackingUpload
                salesFileNoun="Sales Order"
                ngoaiSanNote={NGOAI_SAN_NOTE}
              />
            </SectionCard>
          </div>
        </>
      )}
    </div>
  )
}

function DonTruyenThongView({ rosterSet }) {
  const [meta, setMeta] = useState(() => readJSON(TT_META_KEY, null))
  const [rows, setRows] = useState(() => readJSON(TT_ROWS_KEY, null))
  const [replacing, setReplacing] = useState(false)
  const [channel, setChannel] = useState('donC')
  const [reports, setReports] = useState(() => readTrialReports('donTruyenThong'))
  const [viewingId, setViewingId] = useState(null)

  const onData = (data, fileName) => {
    const m = { fileName, uploadedAt: new Date().toISOString() }
    localStorage.setItem(TT_ROWS_KEY, JSON.stringify(data))
    localStorage.setItem(TT_META_KEY, JSON.stringify(m))
    setRows(data)
    setMeta(m)
    setReplacing(false)
    setViewingId(null)
  }

  const { hcmRows, otherRows, mismatchRows } = useMemo(
    () => splitByWarehouseStaff(rows || [], rosterSet),
    [rows, rosterSet],
  )
  const { donC, donDTP } = useMemo(() => splitDonTruyenThong(hcmRows), [hcmRows])

  const uploadNode = (
    <ExcelUpload onData={onData} fileName="" onClear={() => {}} />
  )

  if (!rows || replacing) {
    return <div>{uploadNode}</div>
  }

  const referenceDate = meta?.uploadedAt || null

  const handleSave = () => {
    if (!meta) return
    const donCSnapshot = computeChannelSnapshot({
      data: donC, channelKey: 'donC',
      khValues: readJSON('unifiedTrial_chuagiao_kh_donC', {}),
      chuaGuiChanh: readJSON('unifiedTrial_chuagiao_chuagui_donC', ''),
      showChanhXe: true, showSpx: false, referenceDate,
    })
    const donDTPSnapshot = computeChannelSnapshot({
      data: donDTP, channelKey: 'donDTP',
      khValues: readJSON('unifiedTrial_chuagiao_kh_donDTP', {}),
      chuaGuiChanh: readJSON('unifiedTrial_chuagiao_chuagui_donDTP', ''),
      showChanhXe: false, showSpx: true, referenceDate,
    })
    const entry = {
      id: meta.uploadedAt,
      fileName: meta.fileName,
      label: `${meta.fileName} · ${new Date(meta.uploadedAt).toLocaleDateString('vi-VN')}`,
      otherCount: otherRows.length, mismatchCount: mismatchRows.length,
      donC: donCSnapshot, donDTP: donDTPSnapshot,
    }
    setReports(saveTrialReport('donTruyenThong', entry))
  }

  const viewingEntry = viewingId ? reports.find(r => r.id === viewingId) : null
  const alreadySaved = meta && reports.some(r => r.id === meta.uploadedAt)

  return (
    <div>
      <FileSlot meta={meta} onReplace={() => setReplacing(true)} uploadNode={uploadNode} />
      <div className="flex items-center justify-between gap-2 mb-4">
        <SavedWeekPicker reports={reports} viewingId={viewingId} onChange={setViewingId} />
        {!viewingId && <SaveWeekButton onSave={handleSave} alreadySaved={alreadySaved} />}
      </div>

      {viewingEntry ? (
        <DonTruyenThongSnapshotView entry={viewingEntry} />
      ) : (
        <>
          <MismatchWarning mismatchRows={mismatchRows} otherCount={otherRows.length} />

          <div className="tdr-tabswitch" style={{ marginBottom: 16 }}>
            <button type="button" className={channel === 'donC' ? 'active' : ''} onClick={() => setChannel('donC')}>
              Đơn C ({donC.length})
            </button>
            <button type="button" className={channel === 'donDTP' ? 'active' : ''} onClick={() => setChannel('donDTP')}>
              Đơn DTP ({donDTP.length})
            </button>
          </div>

          {channel === 'donC' && (
            <UnifiedTrialChannelDetail data={donC} channelKey="donC" referenceDate={referenceDate} showChanhXe showSpx={false} />
          )}

          {channel === 'donDTP' && (
            <UnifiedTrialChannelDetail data={donDTP} channelKey="donDTP" referenceDate={referenceDate} showChanhXe={false} showSpx />
          )}
        </>
      )}
    </div>
  )
}

export default function UnifiedTrialTab() {
  const [activeTab, setActiveTab] = useState('donsan')
  const [rosterText, setRosterText] = useState(() => readJSON(STAFF_ROSTER_KEY, ''))

  const onRosterChange = (text) => {
    setRosterText(text)
    localStorage.setItem(STAFF_ROSTER_KEY, JSON.stringify(text))
  }
  const rosterSet = useMemo(() => parseStaffRoster(rosterText), [rosterText])

  return (
    <div className="sheet-tab donc-v2">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Gộp kênh (Thử nghiệm) — chạy song song, chưa thay thế 3 tab cũ</span>
          <StaffRosterEditor rosterText={rosterText} onChange={onRosterChange} />
        </header>

        <div className="tdr-tabswitch" style={{ marginTop: 16 }}>
          <button type="button" className={activeTab === 'donsan' ? 'active' : ''} onClick={() => setActiveTab('donsan')}>Đơn SO</button>
          <button type="button" className={activeTab === 'truyenthong' ? 'active' : ''} onClick={() => setActiveTab('truyenthong')}>Đơn truyền thống</button>
        </div>

        <div className="sheet-tab-report">
          {activeTab === 'donsan' && <DonSanView rosterSet={rosterSet} />}
          {activeTab === 'truyenthong' && <DonTruyenThongView rosterSet={rosterSet} />}
        </div>
      </div>
    </div>
  )
}
