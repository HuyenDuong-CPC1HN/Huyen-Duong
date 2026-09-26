import { useState } from 'react'
import { Trash2, Search, RefreshCw } from 'lucide-react'
import { supabase } from '../supabase'
import { deleteLegacyData, scanLegacyData, storagePathsOf } from '../utils/legacyDataCleanup'

// TẠM THỜI — dọn 1 lần dữ liệu Supabase của 3 tab đã gỡ, xong sẽ gỡ component này.
export default function LegacyDataCleanup() {
  const [scan, setScan] = useState(null)
  const [status, setStatus] = useState('idle') // idle | scanning | ready | deleting | done
  const [error, setError] = useState('')

  const runScan = async () => {
    setStatus('scanning')
    setError('')
    try {
      setScan(await scanLegacyData(supabase))
      setStatus('ready')
    } catch (e) {
      setError(e.message || 'Không quét được dữ liệu.')
      setStatus('idle')
    }
  }

  const rows = scan ? [
    ['Tuần Excel đã upload — Giao hàng Đơn C, Đơn DTP', scan.reportWeeks.length],
    ['Báo cáo "Lưu số liệu tuần này" — Đơn C, Đơn DTP', scan.sheetReports.length],
    ['Báo cáo Sàn TMĐT', scan.tmdtReports.length],
    ['File Viettel Post / SPX của 3 tab cũ', scan.carriers.carrier_weeks.length],
    ['File Chờ giao Logistics của 3 tab cũ', scan.carriers.carrier_hold_weeks.length],
    ['File Sales Order (Mốc 1) của 3 tab cũ', scan.carriers.carrier_sales_order_weeks.length],
    ['File bốc đóng của 3 tab cũ', scan.carriers.carrier_packing_weeks.length],
    ['Số nhập tay & lựa chọn tuần cũ', scan.settingKeys.length],
    ['Tệp dữ liệu trên kho tệp (Storage)', storagePathsOf(scan).length],
  ] : []
  const total = rows.reduce((sum, [, n]) => sum + n, 0)

  const runDelete = async () => {
    if (!window.confirm(`Xoá VĨNH VIỄN ${total} mục dữ liệu cũ của 3 tab đã gỡ?\n\nKhông khôi phục được. Dữ liệu Gộp kênh, Tổng đơn và các tab khác không bị đụng tới.`)) return
    setStatus('deleting')
    setError('')
    try {
      await deleteLegacyData(supabase, scan)
      setStatus('done')
    } catch (e) {
      setError(`${e.message || 'Xoá chưa xong.'} — bấm "Quét lại" để xem phần còn lại rồi xoá tiếp.`)
      setStatus('ready')
    }
  }

  return (
    <div className="report-section" style={{ marginBottom: 16, border: '1.5px dashed #e0a458' }}>
      <div className="report-section-trigger" style={{ cursor: 'default', flexWrap: 'wrap', gap: 8 }}>
        <span className="report-section-title">Dọn dữ liệu 3 tab cũ (tạm thời)</span>
        <span className="text-xs text-gray-500">Giao hàng Đơn C · Giao hàng Đơn DTP · Đơn hàng Sàn TMĐT</span>
      </div>
      <div className="report-section-content flex flex-col gap-3">
        {status === 'done' ? (
          <>
            <p className="text-sm font-semibold text-green-700">Đã xoá xong dữ liệu cũ của 3 tab.</p>
            <div>
              <button type="button" className="sheet-tab-action is-primary" onClick={() => window.location.reload()}>
                <RefreshCw size={13} /> Tải lại trang
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-gray-600">
              Bấm "Quét" để xem chính xác những gì sẽ bị xoá. Chưa xoá gì cho tới khi anh bấm "Xoá vĩnh viễn" và xác nhận.
              Dữ liệu Gộp kênh, Tổng đơn và các tab khác không bị đụng tới.
            </p>
            {scan && (
              total === 0 ? (
                <p className="text-sm text-gray-600">Không còn dữ liệu cũ nào của 3 tab.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="w-full text-xs">
                    <tbody>
                      {rows.map(([label, n]) => (
                        <tr key={label} className="border-b border-gray-50">
                          <td className="px-2 py-1.5 text-gray-700">{label}</td>
                          <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {scan.settingKeys.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-gray-600">Xem {scan.settingKeys.length} mục số nhập tay & lựa chọn cũ</summary>
                      <ul className="mt-1 text-[11px] text-gray-500 font-mono" style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {scan.settingKeys.map(k => <li key={k}>{k}</li>)}
                      </ul>
                    </details>
                  )}
                </div>
              )
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2 flex-wrap">
              <button type="button" className="sheet-tab-action" onClick={runScan} disabled={status === 'scanning' || status === 'deleting'}>
                <Search size={13} /> {status === 'scanning' ? 'Đang quét…' : scan ? 'Quét lại' : 'Quét dữ liệu cũ'}
              </button>
              {scan && total > 0 && (
                <button type="button" className="sheet-tab-action" style={{ borderColor: '#dc2626', color: '#dc2626' }} onClick={runDelete} disabled={status === 'deleting'}>
                  <Trash2 size={13} /> {status === 'deleting' ? 'Đang xoá…' : `Xoá vĩnh viễn ${total} mục`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
