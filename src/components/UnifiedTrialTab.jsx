import { useEffect, useMemo, useState } from 'react'
import { Package, ShoppingBag, Globe, RefreshCw, Users, AlertTriangle } from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import ExcelUpload from './ExcelUpload'
import UnifiedTrialChannelDetail from './UnifiedTrialChannelDetail'
import { CarrierPanel } from './CarrierStats'
import { KpiTile, SectionCard } from './ReportCards'
import { splitDonSO, splitDonTruyenThong, splitTmdtByShop } from '../utils/unifiedTrialSplit'
import { parseStaffRoster, splitByWarehouseStaff } from '../utils/warehouseStaffFilter'

// "Đối soát ngoại sàn (SPX COD)" (NgoaiSanPanel, lồng trong CarrierPanel khi carrierType="spx")
// cần 2 nguồn: "Danh sách thống kê" (Mốc 1, người dùng upload tay qua đúng nút có sẵn trong
// NgoaiSanPanel) và "file bốc đóng" (Mốc 2). Mốc 2 với kênh Ngoại sàn thực ra đã có sẵn trong
// chính file Đơn SO (cột "TG Đóng hàng" + "Mã vận đơn") — nên ở đây tự ghi thẳng vào đúng ô nhớ
// NgoaiSanPanel đọc (`carrier_packingweeks_<carrierKey>`) mỗi khi có file Đơn SO mới, khỏi phải
// upload thêm 1 file "bốc đóng" riêng. Không sửa CarrierStats.jsx — chỉ ghi vào đúng key nó đã
// đọc sẵn, đúng format {id, fileName, uploadedAt, rows} như addPackingWeek() nội bộ vẫn ghi.
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

function DonSanView({ rosterSet }) {
  const [meta, setMeta] = useState(() => readJSON(SO_META_KEY, null))
  const [rows, setRows] = useState(() => readJSON(SO_ROWS_KEY, null))
  const [replacing, setReplacing] = useState(false)

  const onData = (data, fileName) => {
    const m = { fileName, uploadedAt: new Date().toISOString() }
    localStorage.setItem(SO_ROWS_KEY, JSON.stringify(data))
    localStorage.setItem(SO_META_KEY, JSON.stringify(m))
    setRows(data)
    setMeta(m)
    setReplacing(false)
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

  const uploadNode = (
    <ExcelUpload onData={onData} fileName="" onClear={() => {}} />
  )

  if (!rows || replacing) {
    return <div>{uploadNode}</div>
  }

  return (
    <div>
      <FileSlot meta={meta} onReplace={() => setReplacing(true)} uploadNode={uploadNode} />
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
                  <div key={shop.code} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-100 bg-white">
                    <div className="flex items-center gap-2 text-sm text-gray-700 min-w-0">
                      <span className="font-medium truncate">{shop.label}</span>
                      <span className="text-xs text-gray-400 font-mono shrink-0">{shop.code}</span>
                    </div>
                    <span className="text-sm font-semibold text-gray-800 shrink-0">{shop.count.toLocaleString('vi-VN')}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="ĐỐI SOÁT ĐƠN WEBSITE" total={ngoaiSan.length}>
          <p className="text-xs text-gray-400 mb-3">
            Mốc "Đóng kiện" tự động lấy từ cột "TG Đóng hàng" trong file Đơn SO vừa upload — chỉ cần
            upload thêm "Danh sách thống kê" (Mốc 1) và file SPX xuất (Mốc 3/4) ở khung bên dưới.
          </p>
          <CarrierPanel
            key={meta?.uploadedAt}
            carrierKey={ngoaiSanCarrierKey}
            label="SPX Express — Ngoại sàn"
            carrierType="spx"
            internalData={ngoaiSan}
            referenceDate={meta?.uploadedAt}
          />
        </SectionCard>
      </div>
    </div>
  )
}

function DonTruyenThongView({ rosterSet }) {
  const [meta, setMeta] = useState(() => readJSON(TT_META_KEY, null))
  const [rows, setRows] = useState(() => readJSON(TT_ROWS_KEY, null))
  const [replacing, setReplacing] = useState(false)
  const [channel, setChannel] = useState('donC')

  const onData = (data, fileName) => {
    const m = { fileName, uploadedAt: new Date().toISOString() }
    localStorage.setItem(TT_ROWS_KEY, JSON.stringify(data))
    localStorage.setItem(TT_META_KEY, JSON.stringify(m))
    setRows(data)
    setMeta(m)
    setReplacing(false)
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

  return (
    <div>
      <FileSlot meta={meta} onReplace={() => setReplacing(true)} uploadNode={uploadNode} />
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
