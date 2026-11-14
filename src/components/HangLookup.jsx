import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Search, FileDown, X } from 'lucide-react'
import { opsStore } from '../data/workspace'
import { readSlips } from '../data/returnSlipsStore'
import { readHuyPhieus } from '../data/hangHuyStore'
import { readFlowV2 } from '../data/flowV2Store'
import { HUONG, LOAI, NGUON, STAGE_FILTER, filterLookup, groupLookup, keToanShortener, lookupRows, sameLot, stageLabel, summarizeLookup } from '../utils/hangLookup'

const fmtDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : '—' }
const readStored = (key) => {
  try { const v = JSON.parse(opsStore.getItem(key) || '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}
const NGUON_CLS = { tra: 'bg-green-50 text-green-700', doitra: 'bg-amber-50 text-amber-700', kho: 'bg-purple-50 text-purple-700' }
const STAGE_CLS = { doing: 'bg-blue-50 text-blue-700', nhap: 'bg-purple-50 text-purple-700', gom: 'bg-purple-50 text-purple-700', xuat: 'bg-purple-50 text-purple-700', done: 'bg-green-50 text-green-700' }
const khoTag = k => (k === 'C'
  ? <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700">Kho C</span>
  : <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">Kho DTP</span>)
const loaiTag = n => <span className={`inline-block px-2 py-0.5 rounded-md text-[11.5px] font-semibold whitespace-nowrap ${NGUON_CLS[n]}`}>{LOAI[n]}</span>
const stagePill = r => <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_CLS[r.stage]}`}>{stageLabel(r)}</span>
const PAGE_SIZES = [10, 20, 50]

function Chips({ label, value, options, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}
          className={`px-3 py-1 rounded-full border text-[12.5px] ${value === k ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white font-semibold' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'}`}>{l}</button>
      ))}
    </div>
  )
}

// Các số trang hiện: 1, trang cuối, trang hiện tại ± 1; 0 = dấu "…"
function pageNums(cur, last) {
  const set = [...new Set([1, last, cur - 1, cur, cur + 1])].filter(p => p >= 1 && p <= last).sort((a, b) => a - b)
  return set.flatMap((p, i) => (i && p - set[i - 1] > 1 ? [0, p] : [p]))
}
function Pager({ total, unit, page, size, onPage, onSize }) {
  if (total <= PAGE_SIZES[0]) return null
  const last = Math.max(1, Math.ceil(total / size))
  const btn = 'min-w-8 px-2 py-1 rounded-lg border text-[12.5px] tabular-nums'
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 border-t border-gray-200 bg-gray-50 text-[13px] text-gray-500">
      <span>{(page - 1) * size + 1}–{Math.min(total, page * size)} / {total} {unit} · <label>Mỗi trang{' '}
        <select value={size} onChange={e => onSize(Number(e.target.value))} aria-label={`Số ${unit} mỗi trang`} className="border border-gray-200 rounded-lg px-2 py-1 text-[13px] bg-white">
          {PAGE_SIZES.map(v => <option key={v} value={v}>{v} {unit}</option>)}
        </select></label></span>
      <nav className="flex flex-wrap items-center gap-1" aria-label="Chuyển trang">
        <button type="button" className={`${btn} bg-white border-gray-200 disabled:opacity-40`} disabled={page === 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">‹</button>
        {pageNums(page, last).map((p, i) => (p ? (
          <button key={p} type="button" aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}
            className={`${btn} ${p === page ? 'bg-[#1e3a5f] border-[#1e3a5f] text-white font-bold' : 'bg-white border-gray-200 text-gray-700'}`}>{p}</button>
        ) : <span key={`g${i}`} className="px-0.5 text-gray-400">…</span>))}
        <button type="button" className={`${btn} bg-white border-gray-200 disabled:opacity-40`} disabled={page === last} onClick={() => onPage(page + 1)} aria-label="Trang sau">›</button>
      </nav>
    </div>
  )
}

// Tra cứu hàng đã xuất khỏi kho (nhập trả lại, đổi trả, hàng huỷ). Xem theo phiếu (đầu phiếu 1 dòng, hàng bên dưới)
// hoặc theo hàng + lô; chia trang. onOpen(row) mở lại phiếu ở đúng tab.
export default function HangLookup({ onOpen, swapRecords: recordsProp, swapBatches: batchesProp, flowV2: flowV2Prop }) {
  const [kho, setKho] = useState('all')
  const [nguon, setNguon] = useState('all')
  const [month, setMonth] = useState('all')
  const [stage, setStage] = useState('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState('slip')
  const [page, setPage] = useState(1)
  const [size, setSize] = useState(PAGE_SIZES[0])
  const [picked, setPicked] = useState(null)
  // Đổi lọc / tìm / kiểu xem thì về trang 1
  const reset = set => v => { set(v); setPage(1) }

  const all = useMemo(() => lookupRows({
    slips: readSlips(), phieus: readHuyPhieus(), swapRecords: recordsProp ?? readStored('swap_return_records'), swapBatches: batchesProp ?? readStored('swap_huy_batches'),
    flowV2: flowV2Prop ?? readFlowV2(),
  }), [recordsProp, batchesProp, flowV2Prop])
  const months = useMemo(() => [...new Set(all.map(r => r.date.slice(0, 7)).filter(Boolean))].sort().reverse(), [all])
  const rows = useMemo(() => filterLookup(all, { kho, nguon, month, stage, q }), [all, kho, nguon, month, stage, q])
  const groups = useMemo(() => groupLookup(rows), [rows])
  const summary = useMemo(() => summarizeLookup(rows), [rows])
  const shortKeToan = useMemo(() => keToanShortener(all.map(r => r.keToan)), [all])
  const total = rows.reduce((s, r) => s + r.soLuong, 0)
  const pickedRow = picked ? all.find(r => r.id === picked) : null
  const lot = pickedRow ? sameLot(all, pickedRow) : []
  const count = view === 'slip' ? groups.length : summary.length
  const last = Math.max(1, Math.ceil(count / size))
  const cur = Math.min(page, last)
  const from = (cur - 1) * size

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
        <section className="bg-white border border-gray-200 rounded-2xl flex flex-col min-w-0" aria-label="Tra cứu hàng">
          <div className="p-3.5 flex flex-col gap-2.5 border-b border-gray-200">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-56">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input value={q} onChange={e => reset(setQ)(e.target.value)} aria-label="Tìm kiếm" placeholder="Tìm tên hàng, mã hàng, số lô, khách hàng, số phiếu…" className="w-full pl-8 pr-2 py-2 border border-gray-200 rounded-lg text-sm" />
              </div>
              <select value={month} onChange={e => reset(setMonth)(e.target.value)} aria-label="Tháng" className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                <option value="all">Tất cả thời gian</option>
                {months.map(m => <option key={m} value={m}>Tháng {m.slice(5)}/{m.slice(0, 4)}</option>)}
              </select>
              <select value={stage} onChange={e => reset(setStage)(e.target.value)} aria-label="Trạng thái" className="border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white">
                <option value="all">Mọi trạng thái</option>
                {Object.entries(STAGE_FILTER).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" onClick={exportExcel} disabled={rows.length === 0} className="sheet-tab-action"><FileDown size={13} /> Xuất Excel</button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Chips label="Kho" value={kho} onChange={reset(setKho)} options={[['all', 'Tất cả kho'], ['C', 'Kho C'], ['DTP', 'Kho DTP']]} />
              <span className="w-px h-5 bg-gray-200" aria-hidden="true" />
              <Chips label="Loại" value={nguon} onChange={reset(setNguon)} options={[['all', 'Tất cả loại'], ...Object.entries(LOAI)]} />
              <div className="ml-auto inline-flex border border-gray-200 rounded-lg p-0.5 bg-gray-50" role="group" aria-label="Kiểu xem">
                {[['slip', 'Theo phiếu'], ['sum', 'Theo hàng + lô']].map(([k, l]) => (
                  <button key={k} type="button" aria-pressed={view === k} onClick={() => reset(setView)(k)}
                    className={`px-2.5 py-1 rounded-md text-[12.5px] ${view === k ? 'bg-white shadow-sm text-gray-800 font-semibold' : 'text-gray-500'}`}>{l}</button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-3.5 py-2.5 text-[13px] text-gray-500 border-b border-gray-200 bg-gray-50">
            {[[groups.length, 'phiếu / đợt'], [rows.length, 'dòng hàng'], [summary.length, 'hàng + lô'], [total.toLocaleString('vi-VN'), 'tổng số lượng']].map(([n, l]) => (
              <span key={l}><b className="text-[15px] text-gray-800 tabular-nums mr-1">{n}</b>{l}</span>
            ))}
          </div>
          {count === 0 ? <div className="py-8 text-center text-gray-400 text-sm">Không có hàng phù hợp. Thử bỏ bớt bộ lọc.</div> : view === 'slip' ? (
            <div className="flex flex-col">
              {groups.slice(from, from + size).map(g => {
                const h = g.head
                return (
                  <article key={g.key} className="border-b border-gray-200 last:border-b-0">
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[92px_minmax(0,1fr)_auto] gap-x-3 gap-y-1 items-center px-3.5 pt-2.5 pb-1.5">
                      <div className="col-span-2 sm:col-span-1 flex sm:flex-col gap-2 sm:gap-0.5 text-[12.5px] text-gray-500 tabular-nums">{fmtDate(h.date)}
                        <span className={`text-[11px] font-bold tracking-wide ${h.kho === 'C' ? 'text-red-700' : 'text-blue-700'}`}>KHO {h.kho}</span></div>
                      <div className="min-w-0 flex flex-col">
                        <span className="font-mono font-bold text-[13.5px]">{h.so || (h.v2 === 'pool' ? 'Chờ huỷ' : <span className="font-sans font-normal text-gray-400">chưa có số phiếu</span>)}</span>
                        <span className="text-[12.5px] text-gray-500 truncate" title={h.who}>{h.who}</span>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {loaiTag(h.nguon)}
                        {h.keToan && <span className="text-xs text-gray-400" title={h.keToan}>{shortKeToan(h.keToan)}</span>}
                        {stagePill(h)}
                      </div>
                    </div>
                    <div className="mx-3.5 mb-2.5 sm:ml-[118px] border border-gray-200 rounded-lg overflow-hidden">
                      {g.rows.map(r => (
                        <button key={r.id} type="button" onClick={() => setPicked(r.id)} aria-label={`Xem chi tiết ${r.ten}`}
                          className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_120px_100px_minmax(0,160px)] gap-x-2.5 gap-y-0.5 items-baseline px-2.5 py-1.5 border-t border-gray-200 first:border-t-0 text-[13px] bg-white hover:bg-blue-50/40">
                          <span>{r.ma && <span className="font-mono text-[11.5px] text-gray-400 mr-1.5">{r.ma}</span>}{r.ten}</span>
                          <span className="font-mono text-xs text-gray-500 row-start-2 sm:row-start-auto">Lô {r.soLo || '—'}</span>
                          <span className="text-right tabular-nums font-bold sm:col-start-3 row-start-1 col-start-2">{r.soLuong.toLocaleString('vi-VN')}<small className="font-normal text-gray-500 text-[11.5px] ml-1">{r.dvt}</small></span>
                          <span className="text-xs text-gray-500 truncate col-span-2 sm:col-span-1" title={r.extra}>{r.extra || <span className="text-gray-400">chưa ghi</span>}</span>
                        </button>
                      ))}
                    </div>
                  </article>
                )
              })}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="w-full text-[13px] border-collapse">
                <thead><tr className="bg-gray-50 border-b border-gray-200 text-[11.5px] text-gray-500">
                  <th className="px-3.5 py-2 text-left font-semibold">Hàng</th><th className="px-3.5 py-2 text-left font-semibold">Số lô</th><th className="px-3.5 py-2 text-right font-semibold">Tổng SL</th><th className="px-3.5 py-2 text-left font-semibold">Đã đi đâu</th>
                </tr></thead>
                <tbody>{summary.slice(from, from + size).map(e => (
                  <tr key={`${e.ten}|${e.soLo}`} className="border-b border-gray-100 align-top">
                    <td className="px-3.5 py-2">{e.ma && <span className="font-mono text-[11.5px] text-gray-400 mr-1.5">{e.ma}</span>}{e.ten}</td>
                    <td className="px-3.5 py-2 font-mono text-xs">{e.soLo || '—'}</td>
                    <td className="px-3.5 py-2 text-right tabular-nums font-bold whitespace-nowrap">{e.soLuong.toLocaleString('vi-VN')} <small className="font-normal text-gray-500">{e.dvt}</small></td>
                    <td className="px-3.5 py-2 text-xs text-gray-500">{[...e.rows].sort((a, b) => a.date.localeCompare(b.date)).map(r => (
                      <button key={r.id} type="button" onClick={() => setPicked(r.id)} className="block text-left hover:text-gray-800">{fmtDate(r.date)} · {LOAI[r.nguon]} · {r.soLuong.toLocaleString('vi-VN')}{r.so ? <span className="font-mono"> · {r.so}</span> : null}</button>
                    ))}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <Pager total={count} unit={view === 'slip' ? 'phiếu' : 'dòng'} page={cur} size={size} onPage={setPage} onSize={reset(setSize)} />
        </section>
      </div>

      {pickedRow && (
        <aside aria-label="Chi tiết" className="fixed top-0 right-0 bottom-0 w-[min(460px,100%)] bg-white border-l border-gray-200 shadow-xl p-4 flex flex-col gap-3 overflow-auto z-20">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-sm">{pickedRow.so || pickedRow.who}</h2>
            <button type="button" onClick={() => setPicked(null)} className="p-1.5 rounded hover:bg-gray-100" aria-label="Đóng"><X size={14} /></button>
          </div>
          <div className="flex flex-wrap gap-1">{loaiTag(pickedRow.nguon)} {khoTag(pickedRow.kho)} {stagePill(pickedRow)}</div>
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
