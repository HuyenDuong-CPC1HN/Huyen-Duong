import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { ArrowLeft, Search, FileDown, X } from 'lucide-react'
import { readSlips } from '../data/returnSlipsStore'
import { readHuyPhieus } from '../data/hangHuyStore'
import { LOOKUP_STAGE, filterLookup, lookupRows, summarizeLookup } from '../utils/hangLookup'
import { KhoTag } from './HangHuyBadges'
import { LoaiTag } from './ReturnSlipBadges'

const fmtDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : '—' }
const STAGE_LABEL = { todo: 'Đang làm / chờ ký', doing: 'Đang làm / chờ ký', exported: 'Đang làm / chờ ký', acct: 'Đã ký, chờ kế toán nhập', done: 'Hoàn thành' }
const STAGE_CLS = { todo: 'bg-blue-50 text-blue-700', doing: 'bg-blue-50 text-blue-700', exported: 'bg-blue-50 text-blue-700', acct: 'bg-purple-50 text-purple-700', done: 'bg-green-50 text-green-700' }

// Màn tra cứu hàng đã nhập trả lại / đã huỷ theo từng kho. loai: 'tra' | 'huy'. onOpen(phieuId) mở lại phiếu.
export default function HangLookup({ loai: initial, onBack, onOpen }) {
  const [loai, setLoai] = useState(initial)
  const [kho, setKho] = useState('all')
  const [month, setMonth] = useState('all')
  const [stage, setStage] = useState('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState('rows')
  const [picked, setPicked] = useState(null)
  const huy = loai === 'huy'

  const all = useMemo(() => lookupRows(loai, { slips: readSlips(), phieus: readHuyPhieus() }), [loai])
  const months = useMemo(() => [...new Set(all.map(r => r.date.slice(0, 7)).filter(Boolean))].sort().reverse(), [all])
  const rows = useMemo(() => filterLookup(all, { kho, month, stage, q }), [all, kho, month, stage, q])
  const summary = useMemo(() => summarizeLookup(rows), [rows])
  const total = rows.reduce((s, r) => s + r.soLuong, 0)
  const phieuCount = new Set(rows.map(r => r.phieuId)).size
  const khoLabel = k => (huy ? (k === 'C' ? 'Kho C' : 'Kho DTP') : (k === 'C' ? 'Đơn C' : 'Đơn DTP'))

  const exportExcel = () => {
    const aoa = view === 'sum'
      ? [['Tên hàng', 'Số lô', 'ĐVT', 'Tổng số lượng', 'Số phiếu'], ...summary.map(e => [e.ten, e.soLo, e.dvt, e.soLuong, e.phieu.size])]
      : [['Mã hàng', 'Tên hàng', 'Số lô', 'Số lượng', 'ĐVT', huy ? 'Tình trạng' : 'Thành tiền', huy ? 'Số phiếu' : 'Mã phiếu', huy ? 'Lý do' : 'Khách hàng', 'Ngày', 'Kho', 'Trạng thái'],
        ...rows.map(r => [r.ma, r.ten, r.soLo, r.soLuong, r.dvt, r.extra, r.so, r.who, fmtDate(r.date), khoLabel(r.kho), STAGE_LABEL[r.stage] || ''])]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'TraCuu')
    XLSX.writeFile(wb, `TraCuu_${huy ? 'HangHuy' : 'NhapTraLai'}_${view === 'sum' ? 'TongHop' : 'ChiTiet'}.xlsx`)
  }

  const pickedRow = picked ? all.find(r => r.id === picked) : null
  const pickedLines = pickedRow ? all.filter(r => r.phieuId === pickedRow.phieuId) : []
  const seg = (active) => `px-2.5 py-1 rounded text-xs font-medium ${active ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onBack} className="sheet-tab-action"><ArrowLeft size={13} /> Quay lại</button>
          <span className="font-semibold">Tra cứu hàng {huy ? 'đã huỷ' : 'đã nhập trả lại'}</span>
          <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1 ml-auto" role="group" aria-label="Loại">
            {[['tra', 'Nhập trả lại'], ['huy', 'Hàng huỷ']].map(([k, l]) => (
              <button key={k} type="button" aria-pressed={loai === k} className={seg(loai === k)} onClick={() => { setLoai(k); setKho('all'); setQ(''); setPicked(null) }}>{l}</button>
            ))}
          </div>
        </header>

        <div className="report-section">
          <div className="report-section-trigger flex-wrap gap-2" style={{ cursor: 'default' }}>
            <div className="relative flex-1 min-w-56 max-w-md">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} aria-label="Tìm kiếm" placeholder="Tìm tên hàng, mã hàng, số lô, khách hàng, số phiếu…" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label="Kho">
              {[['all', 'Tất cả'], ['C', khoLabel('C')], ['DTP', khoLabel('DTP')]].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={kho === k} className={seg(kho === k)} onClick={() => setKho(k)}>{l}</button>
              ))}
            </div>
            <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Tháng" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="all">Tất cả thời gian</option>
              {months.map(m => <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>)}
            </select>
            <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Trạng thái" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
              <option value="all">Mọi trạng thái</option>
              {Object.entries(LOOKUP_STAGE).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <div className="flex gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label="Kiểu xem">
              {[['rows', 'Từng dòng'], ['sum', 'Tổng hợp theo hàng']].map(([k, l]) => (
                <button key={k} type="button" aria-pressed={view === k} className={seg(view === k)} onClick={() => setView(k)}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={exportExcel} disabled={rows.length === 0} className="sheet-tab-action ml-auto"><FileDown size={13} /> Xuất Excel</button>
          </div>
          <div className="report-section-content flex flex-col gap-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {[[rows.length, 'dòng hàng'], [phieuCount, 'phiếu'], [summary.length, 'hàng + lô khác nhau'], [total.toLocaleString('vi-VN'), 'tổng số lượng']].map(([n, l]) => (
                <div key={l} className="rounded-lg border border-gray-200 bg-white px-3 py-2"><div className="text-xl font-bold tabular-nums text-gray-800">{n}</div><div className="text-xs text-gray-500">{l}</div></div>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              {view === 'sum' ? (
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">{['Tên hàng', 'Số lô', 'ĐVT', 'Tổng số lượng', 'Số phiếu', 'Kho'].map(h => <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {summary.length === 0 ? <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">Không có hàng phù hợp</td></tr>
                      : summary.map(e => (
                        <tr key={`${e.ten}|${e.soLo}`} className="border-b border-gray-50 align-top">
                          <td className="px-2 py-2">{huy && e.ma && <span className="font-mono text-gray-500">{e.ma} · </span>}{e.ten}</td>
                          <td className="px-2 py-2 font-mono">{e.soLo || '—'}</td><td className="px-2 py-2">{e.dvt}</td>
                          <td className="px-2 py-2 font-bold tabular-nums">{e.soLuong.toLocaleString('vi-VN')}</td><td className="px-2 py-2">{e.phieu.size}</td>
                          <td className="px-2 py-2">{[...e.kho].map(k => <span key={k} className="mr-1">{huy ? <KhoTag kho={k} /> : <LoaiTag loai={k} />}</span>)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">{['Tên hàng', 'Số lô', 'Số lượng', huy ? 'Tình trạng' : 'Thành tiền', huy ? 'Số phiếu' : 'Mã phiếu', huy ? 'Lý do' : 'Khách hàng', 'Ngày', 'Kho', 'Trạng thái'].map(h => <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={9} className="text-center py-10 text-gray-400 text-sm">Không có hàng phù hợp. Thử bỏ bớt bộ lọc.</td></tr>
                      : rows.map(r => (
                        <tr key={r.id} onClick={() => setPicked(r.id)} className="border-b border-gray-50 align-top cursor-pointer hover:bg-blue-50/40">
                          <td className="px-2 py-2">{r.ma && <span className="font-mono text-gray-500">{r.ma} · </span>}{r.ten}</td>
                          <td className="px-2 py-2 font-mono">{r.soLo || '—'}</td>
                          <td className="px-2 py-2 whitespace-nowrap tabular-nums">{r.soLuong.toLocaleString('vi-VN')} {r.dvt}</td>
                          <td className="px-2 py-2">{r.extra || '—'}</td>
                          <td className="px-2 py-2 font-mono">{r.so || '—'}</td>
                          <td className="px-2 py-2 max-w-64"><div className="line-clamp-2" title={r.who}>{r.who || '—'}</div></td>
                          <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                          <td className="px-2 py-2">{huy ? <KhoTag kho={r.kho} /> : <LoaiTag loai={r.kho} />}</td>
                          <td className="px-2 py-2"><span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_CLS[r.stage] || ''}`}>{STAGE_LABEL[r.stage] || r.stage}</span></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>

      {pickedRow && (
        <aside aria-label="Chi tiết phiếu" className="fixed top-0 right-0 bottom-0 w-[min(420px,100%)] bg-white border-l border-gray-200 shadow-xl p-4 flex flex-col gap-3 overflow-auto z-20">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{huy ? 'Phiếu xuất kho' : 'Phiếu nhập trả lại'} {pickedRow.so}</h2>
            <button type="button" onClick={() => setPicked(null)} className="p-1.5 rounded hover:bg-gray-100" aria-label="Đóng"><X size={14} /></button>
          </div>
          <div className="text-sm text-gray-600">{fmtDate(pickedRow.date)} · {pickedRow.who}</div>
          <b className="text-sm">Các dòng hàng trong phiếu ({pickedLines.length})</b>
          <ul className="text-sm flex flex-col gap-1.5">
            {pickedLines.map(l => <li key={l.id} className={`rounded border px-2 py-1.5 ${l.id === pickedRow.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100'}`}>{l.ma && <span className="font-mono text-gray-500">{l.ma} · </span>}{l.ten}<div className="text-xs text-gray-500">Lô {l.soLo || '—'} · {l.soLuong.toLocaleString('vi-VN')} {l.dvt}</div></li>)}
          </ul>
          {loai === initial
            ? <button type="button" onClick={() => onOpen(pickedRow.phieuId, loai)} className="sheet-tab-action is-primary self-start">Mở phiếu / in lại biên bản</button>
            : <span className="text-xs text-gray-400">Muốn mở phiếu, vào tab {huy ? 'Theo dõi hàng huỷ' : 'Theo dõi nhập trả lại'} rồi bấm Tra cứu hàng.</span>}
        </aside>
      )}
    </div>
  )
}
