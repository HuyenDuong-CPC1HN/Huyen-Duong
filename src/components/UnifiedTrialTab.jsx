import { useEffect, useMemo, useState } from 'react'
import { Package, ShoppingBag, Globe, RefreshCw } from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import ExcelUpload from './ExcelUpload'
import UnifiedTrialChannelDetail from './UnifiedTrialChannelDetail'
import { CarrierPanel } from './CarrierStats'
import { KpiTile, SectionCard } from './ReportCards'
import { splitDonSO, splitDonTruyenThong } from '../utils/unifiedTrialSplit'

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

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
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

function DonSanView() {
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

  const { tmdt, ngoaiSan } = useMemo(() => rows ? splitDonSO(rows) : { tmdt: [], ngoaiSan: [] }, [rows])
  const total = tmdt.length + ngoaiSan.length

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
      <div className="report-kpi-grid is-three-column">
        <KpiTile icon={Package} value={total} label="Tổng Đơn sàn" cls="text-[#1e3a5f]" />
        <KpiTile icon={ShoppingBag} value={tmdt.length} label="Đơn sàn TMĐT (Shopee, TikTok)" pctOfTotal={total ? Math.round((tmdt.length / total) * 100) : 0} cls="text-blue-700" />
        <KpiTile icon={Globe} value={ngoaiSan.length} label="Đơn ngoại sàn (Website)" pctOfTotal={total ? Math.round((ngoaiSan.length / total) * 100) : 0} cls="text-purple-700" />
      </div>

      <div className="space-y-4 mt-4">
        <SectionCard title="Đối soát ngoại sàn (SPX COD)" total={ngoaiSan.length}>
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

function DonTruyenThongView() {
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

  const { donC, donDTP } = useMemo(() => rows ? splitDonTruyenThong(rows) : { donC: [], donDTP: [] }, [rows])

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

  return (
    <div className="sheet-tab donc-v2">
      <div className="sheet-tab-shell">
        <header className="sheet-tab-context">
          <span>Gộp kênh (Thử nghiệm) — chạy song song, chưa thay thế 3 tab cũ</span>
        </header>

        <div className="tdr-tabswitch">
          <button type="button" className={activeTab === 'donsan' ? 'active' : ''} onClick={() => setActiveTab('donsan')}>Đơn SO</button>
          <button type="button" className={activeTab === 'truyenthong' ? 'active' : ''} onClick={() => setActiveTab('truyenthong')}>Đơn truyền thống</button>
        </div>

        <div className="sheet-tab-report">
          {activeTab === 'donsan' && <DonSanView />}
          {activeTab === 'truyenthong' && <DonTruyenThongView />}
        </div>
      </div>
    </div>
  )
}
