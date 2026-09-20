import { useEffect, useMemo, useState } from 'react'
import { Package, ShoppingBag, Globe, Users, AlertTriangle, Save, Pencil, Check, X } from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import ExcelUpload from './ExcelUpload'
import UnifiedTrialChannelDetail from './UnifiedTrialChannelDetail'
import { CarrierPanel } from './CarrierStats'
import { pickCarrierWeekIdByDate, snapshotCarrierLookup } from './carrierUtils'
import { KpiTile, SectionCard } from './ReportCards'
import { splitDonSO, splitDonTruyenThong, splitTmdtByShop } from '../utils/unifiedTrialSplit'
import { parseStaffRoster, splitByWarehouseStaff } from '../utils/warehouseStaffFilter'
import { computeChannelSnapshot } from '../utils/unifiedTrialChannelStats'
import { readTrialReports, saveTrialReport, renameTrialReport } from '../utils/unifiedTrialReports'

const NGOAI_SAN_CARRIER_KEY = 'unifiedTrial_donSO_spx'

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

// Đổi tên tuần đã lưu — mặc định label là "<tên file> · <ngày upload>", bấm bút chì để sửa lại
// thành tên tuần báo cáo thật (vd "Tuần 12.09 - 18.09.2026") cho dễ nhận ra khi chọn lại sau này.
function SavedWeekPicker({ reports, viewingId, onChange, onRename, hasLiveData }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')
  const viewingEntry = viewingId ? reports.find(r => r.id === viewingId) : null

  const startEdit = () => {
    setLabel(viewingEntry?.label || '')
    setEditing(true)
  }
  const confirmEdit = () => {
    if (label.trim() && viewingId) onRename(viewingId, label.trim())
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') confirmEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          placeholder="vd: Tuần 12.09 - 18.09.2026"
          className="text-xs border border-blue-300 rounded-lg px-2 py-1.5 w-64 focus:outline-none"
        />
        <button type="button" onClick={confirmEdit} className="p-1.5 rounded hover:bg-green-100 text-green-600"><Check size={13} /></button>
        <button type="button" onClick={() => setEditing(false)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><X size={13} /></button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <select
        value={viewingId || ''}
        onChange={e => onChange(e.target.value || null)}
        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        <option value="">{hasLiveData ? '— Xem trực tiếp (tuần hiện tại) —' : 'Upload tuần tiếp theo'}</option>
        {reports.map(r => (
          <option key={r.id} value={r.id}>{r.label}</option>
        ))}
      </select>
      {viewingEntry && (
        <button type="button" onClick={startEdit} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Sửa tên tuần">
          <Pencil size={13} />
        </button>
      )}
    </div>
  )
}

// Khối "đã lưu lúc..." + cảnh báo loại trừ (mismatch/other) hiện tĩnh — dùng chung cho cả 2 bản
// snapshot (Đơn SO / Đơn truyền thống). Không có nút "Xem chi tiết" như MismatchWarning bản sống vì
// rows thô của các đơn bị loại không được lưu lại, chỉ giữ đúng số đếm.
function SnapshotHeader({ fileName, createdAt, otherCount, mismatchCount }) {
  return (
    <>
      <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl mb-4 text-sm text-gray-600">
        <span className="font-medium text-gray-800">{fileName}</span>
        <span className="text-gray-400"> — đã lưu lúc {new Date(createdAt).toLocaleString('vi-VN')}</span>
      </div>
      {(otherCount > 0 || mismatchCount > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 mb-4 text-sm text-amber-800">
          {otherCount > 0 && `${otherCount} đơn không thuộc kho HCM đã loại khỏi thống kê. `}
          {mismatchCount > 0 && `${mismatchCount} đơn lệch kho.`}
        </div>
      )}
    </>
  )
}

// Phần thân "Đơn SO" (KPI + shop + đối soát ngoại sàn) — dùng CHUNG cho cả xem trực tiếp lẫn xem
// tuần đã lưu, chỉ khác đúng 1 chỗ: carrierPanelProps (trực tiếp dùng referenceDate+internalData,
// đã lưu thì ghim đúng weekId+frozenLookup) — nhờ vậy 2 bản LUÔN giống hệt giao diện nhau.
function DonSanReportBody({ total, tmdtCount, ngoaiSanCount, shops, carrierPanelKey, carrierPanelProps }) {
  const shopCol1 = shops.slice(0, 2)
  const shopCol2 = shops.slice(2, 4)
  return (
    <>
      <div className="report-kpi-grid is-three-column">
        <KpiTile icon={Package} value={total} label="Tổng Đơn sàn" cls="text-[#1e3a5f]" />
        <KpiTile icon={ShoppingBag} value={tmdtCount} label="Đơn sàn TMĐT (Shopee, TikTok)" pctOfTotal={total ? Math.round((tmdtCount / total) * 100) : 0} cls="text-blue-700" />
        <KpiTile icon={Globe} value={ngoaiSanCount} label="Đơn ngoại sàn (Website)" pctOfTotal={total ? Math.round((ngoaiSanCount / total) * 100) : 0} cls="text-purple-700" />
      </div>

      <div className="space-y-4 mt-4">
        <SectionCard title="ĐƠN SÀN TMĐT CHI TIẾT THEO SHOP" total={tmdtCount}>
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

        <SectionCard title="ĐỐI SOÁT ĐƠN WEBSITE" total={ngoaiSanCount}>
          <p className="text-xs text-gray-400 mb-3">
            Mốc "Đóng kiện" tự động lấy từ cột "TG Đóng hàng" trong file Đơn SO vừa upload — chỉ cần
            upload thêm "Sales Order" (Mốc 1) và file SPX xuất (Mốc 3/4) ở khung bên dưới.
          </p>
          <CarrierPanel key={carrierPanelKey} {...carrierPanelProps} />
        </SectionCard>
      </div>
    </>
  )
}

function DonSanSnapshotView({ entry }) {
  return (
    <div>
      <SnapshotHeader fileName={entry.fileName} createdAt={entry.createdAt} otherCount={entry.otherCount} mismatchCount={entry.mismatchCount} />
      <DonSanReportBody
        total={entry.total} tmdtCount={entry.tmdtCount} ngoaiSanCount={entry.ngoaiSanCount} shops={entry.shops}
        carrierPanelKey={entry.id}
        carrierPanelProps={{
          carrierKey: NGOAI_SAN_CARRIER_KEY,
          label: 'SPX Express — Ngoại sàn',
          carrierType: 'spx',
          internalData: [],
          weekId: entry.spxWeekId,
          frozenLookup: entry.carrierLookup,
          hidePackingUpload: true,
          salesFileNoun: 'Sales Order',
          ngoaiSanNote: NGOAI_SAN_NOTE,
        }}
      />
    </div>
  )
}

function DonTruyenThongSnapshotView({ entry }) {
  const [channel, setChannel] = useState('donC')
  return (
    <div>
      <SnapshotHeader fileName={entry.fileName} createdAt={entry.createdAt} otherCount={entry.otherCount} mismatchCount={entry.mismatchCount} />

      <div className="tdr-tabswitch" style={{ marginBottom: 16 }}>
        <button type="button" className={channel === 'donC' ? 'active' : ''} onClick={() => setChannel('donC')}>
          Đơn C ({entry.donC.total})
        </button>
        <button type="button" className={channel === 'donDTP' ? 'active' : ''} onClick={() => setChannel('donDTP')}>
          Đơn DTP ({entry.donDTP.total})
        </button>
      </div>

      {channel === 'donC' && (
        <UnifiedTrialChannelDetail data={[]} channelKey="donC" showChanhXe showSpx={false} readOnly frozenSnapshot={entry.donC} />
      )}
      {channel === 'donDTP' && (
        <UnifiedTrialChannelDetail data={[]} channelKey="donDTP" showChanhXe={false} showSpx readOnly frozenSnapshot={entry.donDTP} />
      )}
    </div>
  )
}

function DonSanView({ rosterSet, viewingId, setViewingId }) {
  const [meta, setMeta] = useState(() => readJSON(SO_META_KEY, null))
  const [rows, setRows] = useState(() => readJSON(SO_ROWS_KEY, null))
  const [reports, setReports] = useState(() => readTrialReports('donSO'))

  const onData = (data, fileName) => {
    const m = { fileName, uploadedAt: new Date().toISOString() }
    localStorage.setItem(SO_ROWS_KEY, JSON.stringify(data))
    localStorage.setItem(SO_META_KEY, JSON.stringify(m))
    setRows(data)
    setMeta(m)
    setViewingId(null)
  }

  const { hcmRows, otherRows, mismatchRows } = useMemo(
    () => splitByWarehouseStaff(rows || [], rosterSet),
    [rows, rosterSet],
  )
  const { tmdt, ngoaiSan } = useMemo(() => splitDonSO(hcmRows), [hcmRows])
  const total = tmdt.length + ngoaiSan.length
  const { shops } = useMemo(() => splitTmdtByShop(tmdt), [tmdt])

  useEffect(() => {
    if (!meta || ngoaiSan.length === 0) return
    seedNgoaiSanPackingWeek(NGOAI_SAN_CARRIER_KEY, ngoaiSan, meta.uploadedAt)
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
      spxWeekId: pickCarrierWeekIdByDate(NGOAI_SAN_CARRIER_KEY, meta.uploadedAt),
      carrierLookup: snapshotCarrierLookup(ngoaiSan),
    }
    setReports(saveTrialReport('donSO', entry))
  }

  const uploadNode = (
    <ExcelUpload onData={onData} fileName="" onClear={() => {}} />
  )

  const viewingEntry = viewingId ? reports.find(r => r.id === viewingId) : null
  const alreadySaved = meta && reports.some(r => r.id === meta.uploadedAt)
  // Tuần hiện tại đã "Lưu số liệu tuần này" rồi — coi như đã xong việc, không còn gì để tính tiếp
  // với rows thô cũ nữa, tự chuyển về khung upload chờ file tuần mới (khỏi phải bấm "Upload lại"
  // thêm 1 bước). NHƯNG dropdown chọn tuần đã lưu vẫn phải luôn thấy được (không ẩn theo) — đây là
  // 2 việc riêng: "màn hình làm việc" (upload/số liệu) và "điều hướng xem tuần cũ" (dropdown).
  const showLive = Boolean(rows) && !viewingEntry && !(alreadySaved && !viewingId)
  const hasAnyState = rows !== null || reports.length > 0

  return (
    <div>
      {hasAnyState && (
        <div className="flex items-center justify-between gap-2 mb-4">
          <SavedWeekPicker
            reports={reports} viewingId={viewingId} onChange={setViewingId}
            onRename={(id, label) => setReports(renameTrialReport('donSO', id, label))}
            hasLiveData={Boolean(rows) && !alreadySaved}
          />
          {showLive && <SaveWeekButton onSave={handleSave} alreadySaved={alreadySaved} />}
        </div>
      )}

      {viewingEntry ? (
        <DonSanSnapshotView entry={viewingEntry} />
      ) : !showLive ? (
        <div>{uploadNode}</div>
      ) : (
        <>
          <MismatchWarning mismatchRows={mismatchRows} otherCount={otherRows.length} />
          <DonSanReportBody
            total={total} tmdtCount={tmdt.length} ngoaiSanCount={ngoaiSan.length} shops={shops}
            carrierPanelKey={meta?.uploadedAt}
            carrierPanelProps={{
              carrierKey: NGOAI_SAN_CARRIER_KEY,
              label: 'SPX Express — Ngoại sàn',
              carrierType: 'spx',
              internalData: ngoaiSan,
              referenceDate: meta?.uploadedAt,
              hidePackingUpload: true,
              salesFileNoun: 'Sales Order',
              ngoaiSanNote: NGOAI_SAN_NOTE,
            }}
          />
        </>
      )}
    </div>
  )
}

function DonTruyenThongView({ rosterSet, viewingId, setViewingId, channel, setChannel }) {
  const [meta, setMeta] = useState(() => readJSON(TT_META_KEY, null))
  const [rows, setRows] = useState(() => readJSON(TT_ROWS_KEY, null))
  const [reports, setReports] = useState(() => readTrialReports('donTruyenThong'))

  const onData = (data, fileName) => {
    const m = { fileName, uploadedAt: new Date().toISOString() }
    localStorage.setItem(TT_ROWS_KEY, JSON.stringify(data))
    localStorage.setItem(TT_META_KEY, JSON.stringify(m))
    setRows(data)
    setMeta(m)
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
  // Giống DonSanView: tuần đã lưu rồi thì màn hình làm việc tự chuyển về khung upload chờ file
  // tuần mới, nhưng dropdown chọn tuần đã lưu vẫn phải luôn thấy được, không ẩn theo.
  const showLive = Boolean(rows) && !viewingEntry && !(alreadySaved && !viewingId)
  const hasAnyState = rows !== null || reports.length > 0

  return (
    <div>
      {hasAnyState && (
        <div className="flex items-center justify-between gap-2 mb-4">
          <SavedWeekPicker
            reports={reports} viewingId={viewingId} onChange={setViewingId}
            onRename={(id, label) => setReports(renameTrialReport('donTruyenThong', id, label))}
            hasLiveData={Boolean(rows) && !alreadySaved}
          />
          {showLive && <SaveWeekButton onSave={handleSave} alreadySaved={alreadySaved} />}
        </div>
      )}

      {viewingEntry ? (
        <DonTruyenThongSnapshotView entry={viewingEntry} />
      ) : !showLive ? (
        <div>{uploadNode}</div>
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
  // Nâng lên đây (thay vì giữ trong DonSanView/DonTruyenThongView) để không bị reset về "Upload
  // tuần tiếp theo" mỗi khi chuyển qua lại 2 pill — 2 view bị unmount/remount theo activeTab.
  const [donSoViewingId, setDonSoViewingId] = useState(null)
  const [donTTViewingId, setDonTTViewingId] = useState(null)
  const [donTTChannel, setDonTTChannel] = useState('donC')

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
        </header>

        <div className="flex items-center justify-between" style={{ marginTop: 16 }}>
          <div className="tdr-tabswitch">
            <button type="button" className={activeTab === 'donsan' ? 'active' : ''} onClick={() => setActiveTab('donsan')}>Đơn SO</button>
            <button type="button" className={activeTab === 'truyenthong' ? 'active' : ''} onClick={() => setActiveTab('truyenthong')}>Đơn truyền thống</button>
          </div>
          <StaffRosterEditor rosterText={rosterText} onChange={onRosterChange} />
        </div>

        <div className="sheet-tab-report">
          {activeTab === 'donsan' && (
            <DonSanView rosterSet={rosterSet} viewingId={donSoViewingId} setViewingId={setDonSoViewingId} />
          )}
          {activeTab === 'truyenthong' && (
            <DonTruyenThongView
              rosterSet={rosterSet}
              viewingId={donTTViewingId} setViewingId={setDonTTViewingId}
              channel={donTTChannel} setChannel={setDonTTChannel}
            />
          )}
        </div>
      </div>
    </div>
  )
}
