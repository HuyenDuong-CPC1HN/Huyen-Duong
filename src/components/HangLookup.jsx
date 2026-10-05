import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Search, FileDown, X } from 'lucide-react'
import { opsStore } from '../data/workspace'
import { readSlips } from '../data/returnSlipsStore'
import { readHuyPhieus } from '../data/hangHuyStore'
import { HUONG, NGUON, NGUON_FILTER, STAGE_FILTER, filterLookup, keToanShortener, lookupRows, sameLot, stageLabel, summarizeLookup } from '../utils/hangLookup'

const fmtDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : '—' }
const readStored = (key) => {
  try { const v = JSON.parse(opsStore.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const NGUON_CLS = { tra: 'bg-green-50 text-green-700', doitra: 'bg-amber-50 text-amber-700', kho: 'bg-purple-50 text-purple-700' }
const STAGE_CLS = { doing: 'bg-blue-50 text-blue-700', nhap: 'bg-purple-50 text-purple-700', gom: 'bg-purple-50 text-purple-700', xuat: 'bg-purple-50 text-purple-700', done: 'bg-green-50 text-green-700' }
const khoTag = k => (k === 'C'
  ? <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700">Kho C</span>
  : <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">Kho DTP</span>)
const nguonTag = n => <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${NGUON_CLS[n]}`}>{NGUON[n].label}</span>
const stagePill = r => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_CLS[r.stage]}`}>{stageLabel(r)}</span>

function Seg({ label, value, options, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
      <div className="flex flex-wrap gap-1 bg-gray-50 border border-gray-200 rounded-lg p-1" role="group" aria-label={label}>
        {options.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
            className={`px-2.5 py-1 rounded text-xs font-medium ${value === k ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
        ))}
      </div>
    </div>
  )
}

// Tra cứu hàng đã xuất khỏi kho (nhập trả lại, đổi trả, hàng huỷ). onOpen(row) mở lại phiếu ở đúng tab.
export default function HangLookup({ onOpen, swapRecords: recordsProp, swapBatches: batchesProp }) {
  const [kho, setKho] = useState('all')
  const [nguon, setNguon] = useState('all')
  const [huong, setHuong] = useState('all')
  const [month, setMonth] = useState('all')
  const [stage, setStage] = useState('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState('rows')
  const [picked, setPicked] = useState(null)

  const all = useMemo(() => lookupRows({
    slips: readSlips(), phieus: readHuyPhieus(), swapRecords: recordsProp ?? readStored('swap_return_records'), swapBatches: batchesProp ?? readStored('swap_huy_batches'),
  }), [recordsProp, batchesProp])
  const months = useMemo(() => [...new Set(all.map(r => r.date.slice(0, 7)).filter(Boolean))].sort().reverse(), [all])
  const rows = useMemo(() => filterLookup(all, { kho, nguon, huong, month, stage, q }), [all, kho, nguon, huong, month, stage, q])
  const summary = useMemo(() => summarizeLookup(rows), [rows])
  const shortKeToan = useMemo(() => keToanShortener(all.map(r => r.keToan)), [all])
  const total = rows.reduce((s, r) => s + r.soLuong, 0)
  const pickedRow = picked ? all.find(r => r.id === picked) : null
  const lot = pickedRow ? sameLot(all, pickedRow) : []

  const exportExcel = () => {
    const aoa = view === 'sum'
      ? [['Tên hàng', 'Số lô', 'ĐVT', 'Tổng số lượng', 'Số phiếu', 'Nguồn'], ...summary.map(e => [e.ten, e.soLo, e.dvt, e.soLuong, e.phieu.size, [...e.nguon].map(n => NGUON[n].label).join(', ')])]
      : [['Mã hàng', 'Tên hàng', 'Số lô', 'Số lượng', 'ĐVT', 'Nguồn', 'Hướng xử lý', 'Tình trạng', 'Số phiếu xuất huỷ', 'Khách hàng / lý do', 'Ngày', 'Kho', 'Kế toán', 'Trạng thái'],
        ...rows.map(r => [r.ma, r.ten, r.soLo, r.soLuong, r.dvt, NGUON[r.nguon].label, HUONG[r.huong], r.extra, r.so, r.who, fmtDate(r.date), r.kho === 'C' ? 'Kho C' : 'Kho DTP', r.keToan, stageLabel(r)])]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'TraCuu')
    XLSX.writeFile(wb, `TraCuuHang_${view === 'sum' ? 'TongHop' : 'ChiTiet'}.xlsx`)
  }

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context"><span className="font-semibold">Tra cứu hàng đã xuất khỏi kho</span></header>
        <div className="report-section">
          <div className="report-section-trigger flex-col items-stretch gap-2" style={{ cursor: 'default', alignItems: 'stretch' }}>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-56 max-w-md">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => setQ(e.target.value)} aria-label="Tìm kiếm" placeholder="Tìm tên hàng, mã hàng, số lô, khách hàng, số phiếu…" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
              </div>
              <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Tháng" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="all">Tất cả thời gian</option>
                {months.map(m => <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>)}
              </select>
              <select value={stage} onChange={e => setStage(e.target.value)} aria-label="Trạng thái" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white">
                <option value="all">Mọi trạng thái</option>
                {Object.entries(STAGE_FILTER).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <Seg label="Kiểu xem" value={view} onChange={setView} options={[['rows', 'Từng dòng'], ['sum', 'Tổng hợp theo hàng']]} />
              <button type="button" onClick={exportExcel} disabled={rows.length === 0} className="sheet-tab-action ml-auto"><FileDown size={13} /> Xuất Excel</button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Seg label="Kho" value={kho} onChange={setKho} options={[['all', 'Tất cả'], ['C', 'Kho C'], ['DTP', 'Kho DTP']]} />
              <Seg label="Nguồn" value={nguon} onChange={setNguon} options={[['all', 'Tất cả'], ...NGUON_FILTER]} />
              <Seg label="Hướng xử lý" value={huong} onChange={setHuong} options={[['all', 'Tất cả'], ...Object.entries(HUONG)]} />
            </div>
          </div>
          <div className="report-section-content flex flex-col gap-3">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {[[rows.length, 'dòng hàng'], [new Set(rows.map(r => `${r.nguon}:${r.ref}`)).size, 'phiếu / đợt'], [summary.length, 'hàng + lô khác nhau'], [total.toLocaleString('vi-VN'), 'tổng số lượng']].map(([n, l]) => (
                <div key={l} className="rounded-lg border border-gray-200 bg-white px-3 py-2"><div className="text-xl font-bold tabular-nums text-gray-800">{n}</div><div className="text-xs text-gray-500">{l}</div></div>
              ))}
            </div>
            <div style={{ overflowX: 'auto' }}>
              {view === 'sum' ? (
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">{['Tên hàng', 'Số lô', 'ĐVT', 'Tổng số lượng', 'Số phiếu', 'Nguồn', 'Kho'].map(h => <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {summary.length === 0 ? <tr><td colSpan={7} className="text-center py-10 text-gray-400 text-sm">Không có hàng phù hợp</td></tr> : summary.map(e => (
                      <tr key={`${e.ten}|${e.soLo}`} className="border-b border-gray-50 align-top">
                        <td className="px-2 py-2">{e.ma && <span className="font-mono text-gray-500">{e.ma} · </span>}{e.ten}</td>
                        <td className="px-2 py-2 font-mono">{e.soLo || '—'}</td><td className="px-2 py-2">{e.dvt}</td>
                        <td className="px-2 py-2 font-bold tabular-nums">{e.soLuong.toLocaleString('vi-VN')}</td><td className="px-2 py-2">{e.phieu.size}</td>
                        <td className="px-2 py-2"><div className="flex flex-wrap gap-1">{[...e.nguon].map(n => <span key={n}>{nguonTag(n)}</span>)}</div></td>
                        <td className="px-2 py-2"><div className="flex gap-1">{[...e.kho].map(k => <span key={k}>{khoTag(k)}</span>)}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead><tr className="bg-gray-50 border-b border-gray-100">{['Tên hàng', 'Số lô', 'Số lượng', 'Nguồn', 'Hướng xử lý', 'Tình trạng', 'Số phiếu / khách', 'Ngày', 'Kho', 'Kế toán', 'Trạng thái'].map(h => <th key={h} className="px-2 py-2 text-left text-gray-500 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.length === 0 ? <tr><td colSpan={11} className="text-center py-10 text-gray-400 text-sm">Không có hàng phù hợp. Thử bỏ bớt bộ lọc.</td></tr> : rows.map(r => (
                      <tr key={r.id} onClick={() => setPicked(r.id)} className="border-b border-gray-50 align-top cursor-pointer hover:bg-blue-50/40">
                        <td className="px-2 py-2">{r.ma && <span className="font-mono text-gray-500">{r.ma} · </span>}{r.ten}</td>
                        <td className="px-2 py-2 font-mono">{r.soLo || '—'}</td>
                        <td className="px-2 py-2 whitespace-nowrap tabular-nums">{r.soLuong.toLocaleString('vi-VN')} {r.dvt}</td>
                        <td className="px-2 py-2">{nguonTag(r.nguon)}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-600">{HUONG[r.huong]}</td>
                        <td className="px-2 py-2 max-w-56">{r.extra || <span className="text-gray-400">chưa ghi</span>}</td>
                        <td className="px-2 py-2 max-w-64"><div className="font-mono">{r.so || '—'}</div><div className="text-gray-400 line-clamp-2" title={r.who}>{r.who}</div></td>
                        <td className="px-2 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
                        <td className="px-2 py-2">{khoTag(r.kho)}</td>
                        <td className="px-2 py-2 whitespace-nowrap text-gray-600" title={r.keToan}>{shortKeToan(r.keToan) || <span className="text-gray-400">—</span>}</td>
                        <td className="px-2 py-2">{stagePill(r)}</td>
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
        <aside aria-label="Chi tiết" className="fixed top-0 right-0 bottom-0 w-[min(460px,100%)] bg-white border-l border-gray-200 shadow-xl p-4 flex flex-col gap-3 overflow-auto z-20">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{pickedRow.so || pickedRow.who}</h2>
            <button type="button" onClick={() => setPicked(null)} className="p-1.5 rounded hover:bg-gray-100" aria-label="Đóng"><X size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-1">{nguonTag(pickedRow.nguon)} {khoTag(pickedRow.kho)} {stagePill(pickedRow)}</div>
          <dl className="grid gap-x-3 gap-y-1.5 text-sm" style={{ gridTemplateColumns: '110px 1fr' }}>
            <dt className="text-gray-400">Hướng xử lý</dt><dd>{HUONG[pickedRow.huong]}</dd>
            <dt className="text-gray-400">Ngày</dt><dd>{fmtDate(pickedRow.date)}</dd>
            {pickedRow.huyPhieu && <><dt className="text-gray-400">Phiếu xuất huỷ</dt><dd className="font-mono">{pickedRow.huyPhieu}<div className="text-xs text-gray-400 font-sans">cùng dòng này, không hiện dòng riêng</div></dd></>}
            <dt className="text-gray-400">Kế toán</dt><dd>{pickedRow.keToan || '—'}</dd>
            <dt className="text-gray-400">Khách / lý do</dt><dd>{pickedRow.who || '—'}</dd>
            <dt className="text-gray-400">Hàng</dt><dd>{pickedRow.ten}<div className="text-xs text-gray-400">Lô {pickedRow.soLo || '—'} · {pickedRow.soLuong} {pickedRow.dvt}</div></dd>
          </dl>
          <b className="text-sm">Các phiếu cùng hàng và số lô{pickedRow.soLo ? '' : ' (chưa có số lô nên không nối được)'}</b>
          <ul className="text-sm flex flex-col gap-1.5 border-l-2 border-gray-200 pl-3">
            {lot.length === 0 ? <li className="text-gray-400">Không có phiếu nào khác.</li> : lot.map(x => (
              <li key={x.id}><b>{fmtDate(x.date)}</b> · {NGUON[x.nguon].label} {x.so && <span className="font-mono">{x.so}</span>} · {x.soLuong} {x.dvt}
                <div className="text-xs text-gray-400">{HUONG[x.huong]} · {stageLabel(x)}</div></li>
            ))}
          </ul>
          <button type="button" onClick={() => onOpen(pickedRow)} className="sheet-tab-action is-primary self-start">Mở phiếu / in lại biên bản</button>
        </aside>
      )}
    </div>
  )
}
