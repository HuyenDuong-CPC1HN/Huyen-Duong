import { useMemo, useState } from 'react'
import { History, Search } from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import { KhoTag } from './HangHuyBadges'

// Tab con "Tra cứu lịch sử nhập hàng" (menu Nhập hàng) — tìm theo Mã hàng / Tên hàng trong các chuyến nhập đã
// lưu (tìm ngay trên dữ liệu đã tải), bấm "Tìm trên Supabase" để tìm trên toàn bộ lịch sử ở máy chủ.
const STORAGE_KEY = 'goods_receipt_batches'

const MAX_HISTORY_QUERY_LENGTH = 100

function normalizeHistoryQuery(value) {
  return String(value).trim().toLocaleLowerCase().slice(0, MAX_HISTORY_QUERY_LENGTH)
}

function matchesHistoryRow(row, query) {
  return String(row.maHang ?? '').toLocaleLowerCase().includes(query) ||
    String(row.tenHang ?? '').toLocaleLowerCase().includes(query)
}

function toHistoryHit(row, batch, warehouse) {
  return {
    ma_hang: row.maHang,
    ten_hang: row.tenHang,
    so_lo: row.soLo,
    sl_hoa_don: row.slHoaDon,
    han_dung: row.hanDung,
    warehouse,
    goods_receipt_batches: { processed_at: batch.processedAt },
  }
}

function collectLocalHistoryMatches(batches, query) {
  const q = normalizeHistoryQuery(query)
  if (!q) return []
  const hits = []
  for (const batch of batches) {
    for (const row of (batch.khoC || [])) {
      if (matchesHistoryRow(row, q)) hits.push(toHistoryHit(row, batch, 'C'))
    }
    for (const row of (batch.khoLgt || [])) {
      if (matchesHistoryRow(row, q)) hits.push(toHistoryHit(row, batch, 'LGT'))
    }
  }
  return hits
}
function readBatches() {
  try {
    const batches = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(batches) ? batches : []
  } catch { return [] }
}

function formatDateVi(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function NhapHangHistoryTab() {
  const [historyQuery, setHistoryQuery] = useState('')
  const [historyRows, setHistoryRows] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [error, setError] = useState('')
  const [batches] = useState(() => readBatches())

  const searchHistory = async () => {
    const q = normalizeHistoryQuery(historyQuery)
    if (!q) { setHistoryRows([]); return }
    setHistoryLoading(true)
    setError('')
    try {
      const { createGoodsReceiptBatchesRepository } = await import('../data/goodsReceiptBatches')
      const { supabase } = await import('../supabase')
      const repo = createGoodsReceiptBatchesRepository(supabase)
      setHistoryRows(await repo.searchByMaHangOrTenHang(q))
    } catch (err) {
      setError(err.message || 'Không tra cứu được lịch sử.')
      setHistoryRows([])
    } finally {
      setHistoryLoading(false)
    }
  }

  const localHistoryMatches = useMemo(
    () => collectLocalHistoryMatches(batches, historyQuery),
    [batches, historyQuery],
  )
  const displayHistory = historyRows.length > 0 ? historyRows : localHistoryMatches

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-2 mb-3">
          <History size={16} className="text-gray-500" />
          <h3 className="font-semibold text-sm">Tra cứu lịch sử theo Mã hàng / Tên hàng</h3>
        </div>
        <div className="flex gap-2 mb-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={historyQuery}
              maxLength={MAX_HISTORY_QUERY_LENGTH}
              onChange={(e) => { setHistoryQuery(e.target.value); setHistoryRows([]) }}
              onKeyDown={(e) => e.key === 'Enter' && void searchHistory()}
              placeholder="Nhập mã hàng hoặc tên hàng..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg"
            />
          </div>
          <button type="button" onClick={() => void searchHistory()} disabled={historyLoading} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:border-blue-300">
            {historyLoading ? 'Đang tìm...' : 'Tìm trên Supabase'}
          </button>
        </div>
        {displayHistory.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  {['Ngày', 'Kho', 'Mã hàng', 'Tên hàng', 'Số lô', 'Hạn dùng', 'SL HĐ'].map(h => (
                    <th key={h} className="px-2 py-2 text-left font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayHistory.map((row, i) => (
                  <tr key={`${row.ma_hang}-${row.so_lo}-${i}`} className="border-t border-gray-50">
                    <td className="px-2 py-1.5">{formatDateVi(row.goods_receipt_batches?.processed_at?.slice(0, 10))}</td>
                    <td className="px-2 py-1.5"><KhoTag kho={row.warehouse === 'C' ? 'C' : 'DTP'} /></td>
                    <td className="px-2 py-1.5 font-medium">{row.ma_hang}</td>
                    <td className="px-2 py-1.5">{row.ten_hang}</td>
                    <td className="px-2 py-1.5">{row.so_lo}</td>
                    <td className="px-2 py-1.5">{formatDateVi(row.han_dung)}</td>
                    <td className="px-2 py-1.5 text-right">{row.sl_hoa_don}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {historyQuery.trim() && displayHistory.length === 0 && !historyLoading && (
        <p className="text-sm text-gray-400">Không tìm thấy mặt hàng nào khớp.</p>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
