import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { Copy, Search } from 'lucide-react'
import { buildDuTruModel, computePlan, fmt1, fmtDmy, fmtN, fmtW, normText, parseNxtXml, weekKey } from '../utils/duTru'
import { buildDtpCompare, parseMapCU, parseWebTon, ttByU } from '../utils/duTruDtp'
import { readDuTruOrder, readDuTruSettings, readMapCU, writeDuTruOrder, writeDuTruSettings, writeMapCU } from '../data/duTruStore'
import { loadDuTruFiles, readDuTruFilesMeta, removeDuTruFile, saveDuTruFile } from '../data/duTruFiles'
import { readQuyCach } from '../data/quyCachStore'
import { AlertTag, NumInput } from './DuTruParts'

// Kho DTP (tab Dự trù hàng): hàng thực tế như Kho C nhưng sổ sách trên Fast U (mã U), tồn thực tế trên Web (mã C).
// Quy đổi mã C ↔ U bằng bảng anh tải lên (lưu lại). So tồn sổ sách / tồn thực tế theo mã U (cột Chênh lệch); dự trù
// lấy tốc độ bán từ "Sl xuất" file Fast U, tồn hiện có là tồn thực tế Web (sổ sách cuối ngày mới trừ phần đã xuất).
const BR = 'DTP'
const readText = file => (file.text ? file.text() : new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsText(file) }))
const readSheet = async file => {
  const buf = await (file.arrayBuffer ? file.arrayBuffer() : new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsArrayBuffer(file) }))
  const wb = XLSX.read(buf, { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
}
const EMPTY_ORDER = { chot: {}, add: {}, done: {} }
const LV_ORDER = { crit: 0, warn: 1, season: 2, info: 3 }
const DIFF_FILTERS = [
  ['all', 'Tất cả', () => true],
  ['lech', 'Có chênh lệch', r => Math.abs(r.diff) > 1e-9],
  ['thieu', 'Thực tế ít hơn sổ sách', r => r.diff < -1e-9],
  ['thua', 'Thực tế nhiều hơn sổ sách', r => r.diff > 1e-9],
]
const SLOTS = [
  { k: 'fast', t: 'Tồn sổ sách Fast U', need: 'Bắt buộc', hint: 'Báo cáo tổng hợp nhập xuất tồn theo kho (.xml) — nên lấy 3 tháng gần nhất → hôm nay để tính tốc độ bán', accept: '.xml,.xls' },
  { k: 'web', t: 'Tồn thực tế Web', need: 'Nên có', hint: 'File xuất tồn kho Web (.xlsx, cột Mã BFO / Số lô / Lượng tồn)', accept: '.xlsx,.xls' },
  { k: 'map', t: 'Bảng quy đổi mã C ↔ U', need: 'Tải 1 lần', hint: 'Mã SP C · Mã SP U · Quy đổi U (.xlsx) — lưu lại, có mã mới thì tải bản mới', accept: '.xlsx,.xls' },
]
const tone = d => (d < -1e-9 ? 'text-red-600 font-semibold' : d > 1e-9 ? 'text-amber-700 font-semibold' : 'text-gray-400')
const signN = d => (Math.abs(d) < 1e-9 ? '0' : `${d > 0 ? '+' : '−'}${fmtN(Math.abs(d))}`)

export default function KhoDTP() {
  const [files, setFiles] = useState({})
  const [msg, setMsg] = useState(() => Object.fromEntries(Object.keys(readDuTruFilesMeta(BR)).map(k => [k, { busy: 'Đang mở số liệu đã lưu…' }])))
  const [map, setMap] = useState(() => readMapCU())
  const [settings, setSettings] = useState(() => readDuTruSettings(BR))
  const [orders, setOrders] = useState({})
  const [view, setView] = useState('diff')
  const [filter, setFilter] = useState('lech')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [copyMsg, setCopyMsg] = useState('')
  const [quyCach] = useState(() => readQuyCach())

  useEffect(() => {
    let live = true
    loadDuTruFiles(BR).then(({ files: saved, errors }) => {
      if (!live) return
      setFiles(f => ({ ...saved, ...f }))
      setMsg(m => Object.fromEntries(Object.keys(m).map(k => [k, m[k].busy ? (errors[k] ? { err: `Không mở được số liệu đã lưu: ${errors[k]}. Anh tải lại file.` } : {}) : m[k]])))
    }, err => { if (live) setMsg(m => Object.fromEntries(Object.keys(m).map(k => [k, m[k].busy ? { err: `Không mở được số liệu đã lưu: ${err.message}` } : m[k]]))) })
    return () => { live = false }
  }, [])

  const pick = async (k, file) => {
    setMsg(m => ({ ...m, [k]: { busy: `Đang đọc ${file.name}…` } }))
    await new Promise(r => setTimeout(r, 30))
    try {
      if (k === 'map') {
        const rows = parseMapCU(await readSheet(file))
        setMap(writeMapCU(file.name, rows))
        setMsg(m => ({ ...m, map: {} }))
        return
      }
      const parsed = k === 'fast' ? parseNxtXml(await readText(file)) : parseWebTon(await readSheet(file))
      const f1 = { ...parsed, name: file.name }
      setFiles(f => ({ ...f, [k]: f1 }))
      setMsg(m => ({ ...m, [k]: {} }))
      setOpen(null)
      saveDuTruFile(k, f1, BR).then(at => setFiles(f => (f[k] === f1 ? { ...f, [k]: { ...f1, savedAt: at } } : f)),
        err => setMsg(m => ({ ...m, [k]: { err: `Đã đọc nhưng chưa lưu được lên máy chủ (${err.message}); mở lại tab sẽ phải tải lại.` } })))
    } catch (err) {
      setMsg(m => ({ ...m, [k]: { err: `Không đọc được ${file.name}: ${err.message}` } }))
    }
  }
  const clear = k => { setFiles(f => { const n = { ...f }; delete n[k]; return n }); setMsg(m => ({ ...m, [k]: {} })); removeDuTruFile(k, BR).catch(() => {}) }

  const cmp = useMemo(() => (files.fast && map ? buildDtpCompare(files.fast, files.web, map.rows) : null), [files.fast, files.web, map])
  const model = useMemo(() => {
    if (!files.fast) return null
    const m = buildDuTruModel({ f3: files.fast })
    if (files.web && cmp) m.tonOverride = ttByU(cmp)
    return m
  }, [files.fast, files.web, cmp])
  const P = useMemo(() => ({ Ld: settings.Ld, ss: settings.ss, useSea: false }), [settings.Ld, settings.ss])
  const week = model ? weekKey(model.to) : ''
  const order = useMemo(() => orders[week] || (week ? readDuTruOrder(week, BR) : EMPTY_ORDER), [orders, week])
  // Quy cách kiện lưu theo mã C (tab Quy cách hàng hoá) → quy về mã U qua bảng quy đổi
  const kienU = useMemo(() => {
    const out = {}
    for (const m of map?.rows || []) { const k = quyCach[m.c]?.kien; if (k > 0 && !out[m.u]) out[m.u] = k / (m.k || 1) }
    return out
  }, [map, quyCach])
  const plan = useMemo(() => (model ? computePlan(model, { ...settings, kho: model.khoCodes }, P, order.chot, kienU) : []), [model, settings, P, order.chot, kienU])
  const cmpBy = useMemo(() => new Map((cmp?.rows || []).map(r => [r.u, r])), [cmp])

  const save = patch => { const next = { ...settings, ...patch }; setSettings(next); writeDuTruSettings(next, BR) }
  const saveOrder = patch => { const next = { ...order, ...patch }; setOrders(o => ({ ...o, [week]: next })); writeDuTruOrder(week, next, BR) }
  const chotOf = r => order.chot[r.id] ?? r.deK
  const copy = (text, label) => {
    if (!navigator.clipboard?.writeText) { setCopyMsg('Trình duyệt không cho chép tự động.'); return }
    navigator.clipboard.writeText(text).then(() => setCopyMsg(label), () => setCopyMsg('Trình duyệt chặn chép tự động.'))
  }

  const nq = normText(q)
  const hitQ = (u, ten, codes) => !nq || normText(`${u} ${codes.join(' ')} ${ten}`).includes(nq)
  const flt = DIFF_FILTERS.find(f => f[0] === filter)
  const diffRows = (cmp?.rows || []).filter(r => flt[2](r) && hitQ(r.u, r.ten, r.codesC))
  const planRows = plan.filter(r => hitQ(r.order, r.p0.ten, r.codes.flatMap(c => cmpBy.get(c)?.codesC || [])))
  const sumDiff = (cmp?.rows || []).reduce((s, r) => s + r.diff, 0)

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2.5" aria-label="Tải file Kho DTP">
        <h3 className="m-0 text-base font-semibold">1 · Tải file Kho DTP</h3>
        <div className="text-xs text-gray-500">Hàng Kho DTP như Kho C nhưng quản lý 2 hệ thống: <b>Fast U</b> (mã U, tồn sổ sách — hàng xuất kho cuối ngày mới trừ) và <b>Web</b> (mã C, tồn thực tế — cập nhật tức thời). App quy đổi mã bằng bảng C ↔ U, so 2 tồn và <b>dự trù trên tồn thực tế</b>. Số liệu file đã tải được lưu lại.</div>
        <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {SLOTS.map(s => {
            const f = s.k === 'map' ? map : files[s.k]
            const m = msg[s.k] || {}
            return (
              <div key={s.k} className={`rounded-xl border p-3 flex flex-col gap-1.5 text-sm ${f ? 'border-green-300 bg-white' : 'border-dashed border-gray-300 bg-slate-50'}`}>
                <div className="flex flex-wrap items-center gap-1.5 font-semibold">{s.t}
                  <span className={`px-1.5 py-0.5 rounded-full text-[11px] border ${s.need === 'Bắt buộc' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-white text-gray-500 border-gray-200'}`}>{s.need}</span>
                  {f && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-green-50 text-green-700 border border-green-200">Đã tải</span>}
                </div>
                <div className="text-xs text-gray-500 break-all">
                  {m.busy || (!f ? s.hint
                    : s.k === 'map' ? <><b className="text-gray-700">{f.name}</b><br />{fmtN(f.rows.length)} mã C · {fmtN(new Set(f.rows.map(x => x.u)).size)} mã U{f.at ? ` · lưu ${new Date(f.at).toLocaleDateString('vi-VN')}` : ''}</>
                      : <><b className="text-gray-700">{f.name}</b><br />{s.k === 'fast' ? `Kỳ ${fmtDmy(f.from)} – ${fmtDmy(f.to)} · ${f.days} ngày · ` : ''}{fmtN(f.nMa)} mã · {fmtN(f.savedRows ?? f.data.length)} dòng{f.savedAt && <><br /><span className="text-green-700">Đã lưu lúc {new Date(f.savedAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' })}</span></>}</>)}
                </div>
                {s.k === 'fast' && f && f.days < 80 && <div className="text-xs text-amber-700">⚠ Kỳ {f.days} ngày: tốc độ bán tính theo {f.days} ngày. Nên lấy 3 tháng gần nhất để dự trù ổn định hơn.</div>}
                {m.err && <div className="text-xs text-red-600">{m.err}</div>}
                <div className="flex gap-1.5">
                  <label className="sheet-tab-action cursor-pointer">{f ? 'Đổi file' : 'Chọn file'}
                    <input type="file" accept={s.accept} hidden aria-label={`Tải file ${s.t}`} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void pick(s.k, file) }} />
                  </label>
                  {f && s.k !== 'map' && <button type="button" onClick={() => clear(s.k)} className="sheet-tab-action">Bỏ file</button>}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {!files.fast || !map ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-gray-600 text-center">Tải <b>Tồn sổ sách Fast U</b> và <b>Bảng quy đổi mã C ↔ U</b> để bắt đầu. Thêm <b>Tồn thực tế Web</b> để có cột chênh lệch và dự trù trên tồn thực tế.</div>
      ) : (
        <>
          <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap items-end gap-3 text-sm" aria-label="Thông số dự trù Kho DTP">
            <label className="flex flex-col gap-1 text-xs text-gray-500">Từ lúc đặt đến khi nhập (ngày)
              <input type="number" min="1" value={settings.Ld} onChange={e => save({ Ld: Math.max(1, Math.round(+e.target.value || 1)) })} className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">Tồn an toàn (ngày bán)
              <input type="number" min="0" value={settings.ss} onChange={e => save({ ss: Math.max(0, Math.round(+e.target.value || 0)) })} className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
            <div className="text-xs text-gray-500 flex-1 min-w-60">Bán/ngày = Sl xuất Fast U ÷ {model.D3} ngày · cần đủ hàng {7 + settings.Ld + settings.ss} ngày · tồn hiện có = <b>{files.web ? 'tồn thực tế Web' : 'tồn sổ sách (chưa có file Web)'}</b> · số chốt lưu theo tuần {week}</div>
          </section>

          <div className="flex flex-wrap gap-1 border-b border-gray-200" role="tablist">
            {[['diff', `Chênh lệch tồn (${fmtN((cmp?.rows || []).filter(r => Math.abs(r.diff) > 1e-9).length)})`], ['plan', 'Dự trù đặt hàng']].map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${view === k ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500'}`}>{l}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-80">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã U, mã C, tên hàng…" aria-label="Tìm mã, tên hàng Kho DTP" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
            </div>
            {copyMsg && <span className="text-xs text-green-700" role="status">{copyMsg}</span>}
          </div>

          {view === 'diff' && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Chênh lệch tồn Kho DTP">
              {!files.web ? <div className="text-sm text-gray-500">Tải file <b>Tồn thực tế Web</b> ở mục 1 để so với tồn sổ sách.</div> : (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {DIFF_FILTERS.map(([k, l, f]) => (
                      <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`sheet-tab-action ${filter === k ? 'is-primary' : ''}`}>{l} ({fmtN((cmp?.rows || []).filter(f).length)})</button>
                    ))}
                    <button type="button" className="sheet-tab-action ml-auto" onClick={() => copy([['Mã U', 'Mã C', 'Tên hàng', 'ĐVT', 'Tồn sổ sách (Fast U)', 'Tồn thực tế (Web)', 'Chênh lệch (TT − SS)'].join('\t'),
                      ...diffRows.map(r => [r.u, r.codesC.join(', '), r.ten, r.dvt, r.ss, r.tt, r.diff].join('\t'))].join('\n'), `Đã chép ${diffRows.length} dòng, dán vào Excel.`)}><Copy size={13} /> Chép bảng</button>
                  </div>
                  <div className="text-xs text-gray-500">Chênh lệch = tồn thực tế Web − tồn sổ sách Fast U, theo mã U (cộng các mã C cùng quy về 1 mã U). <span className="text-red-600 font-semibold">Âm</span>: thực tế ít hơn sổ sách — thường là hàng đã xuất kho, sổ sách cuối ngày mới trừ. Tổng chênh lệch {signN(sumDiff)}. Bấm vào dòng để xem theo lô.</div>
                  {cmp.webUnmapped.length > 0 && <div className="text-xs text-amber-700">⚠ {cmp.webUnmapped.length} mã trên Web chưa có trong bảng quy đổi (chưa tính): {cmp.webUnmapped.slice(0, 8).map(w => w.ma).join(', ')}{cmp.webUnmapped.length > 8 ? '…' : ''}. Bổ sung vào bảng quy đổi rồi tải lại.</div>}
                  <div className="overflow-x-auto border border-gray-200 rounded-xl">
                    <table className="w-full text-sm border-collapse" style={{ minWidth: 820 }}>
                      <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                        <th className="px-2 py-2 text-left">Mã U</th><th className="px-2 py-2 text-left">Mã C</th><th className="px-2 py-2 text-left">Tên hàng</th>
                        <th className="px-2 py-2 text-right">Tồn sổ sách (Fast U)</th><th className="px-2 py-2 text-right">Tồn thực tế (Web)</th><th className="px-2 py-2 text-right">Chênh lệch</th>
                      </tr></thead>
                      <tbody>{diffRows.map(r => (
                        <FragmentRows key={r.u} r={r} open={open === r.u} onToggle={() => setOpen(open === r.u ? null : r.u)} />
                      ))}{!diffRows.length && <tr><td colSpan={6} className="px-3 py-4 text-gray-400">Không có mã nào khớp bộ lọc.</td></tr>}</tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}

          {view === 'plan' && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Dự trù Kho DTP">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-xs text-gray-500 flex-1">Xếp theo tên A → Z. Đề xuất = bán/ngày × {7 + settings.Ld + settings.ss} ngày − tồn {files.web ? 'thực tế' : 'sổ sách'}, làm tròn lên đủ kiện (quy cách theo mã C ở tab Quy cách hàng hoá).</div>
                <button type="button" className="sheet-tab-action" onClick={() => copy([['Mã U', 'Mã C', 'Tên hàng', 'ĐVT', 'Bán/tuần', 'Tồn sổ sách', 'Tồn thực tế', 'Chênh lệch', 'Đủ bán (tuần)', 'Đề xuất', 'Chốt đặt'].join('\t'),
                  ...planRows.map(r => { const c = cmpBy.get(r.order); return [r.order, (c?.codesC || []).join(', '), r.p0.ten, r.p0.dvt, fmt1(r.rd * 7), c ? c.ss : '', c && files.web ? c.tt : '', c && files.web ? c.diff : '', Number.isFinite(r.weeks) ? fmt1(r.weeks) : '', r.deK, chotOf(r)].join('\t') })].join('\n'), `Đã chép ${planRows.length} dòng, dán vào Excel.`)}><Copy size={13} /> Chép bảng</button>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-sm border-collapse" style={{ minWidth: 1050 }}>
                  <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                    <th className="px-2 py-2 text-left">Mã U · Mã C</th><th className="px-2 py-2 text-left">Tên hàng</th><th className="px-2 py-2 text-right">Bán/tuần</th>
                    <th className="px-2 py-2 text-right">Tồn sổ sách</th><th className="px-2 py-2 text-right">Tồn thực tế</th><th className="px-2 py-2 text-right">Chênh lệch</th>
                    <th className="px-2 py-2 text-right">Đủ bán</th><th className="px-2 py-2 text-right">Đề xuất</th><th className="px-2 py-2 text-right">Chốt đặt</th><th className="px-2 py-2 text-left">Lưu ý</th>
                  </tr></thead>
                  <tbody>{planRows.map(r => {
                    const c = r.codes.map(x => cmpBy.get(x)).filter(Boolean)
                    const ss = c.reduce((s, x) => s + x.ss, 0), tt = c.reduce((s, x) => s + x.tt, 0)
                    return (
                      <tr key={r.id} className="border-t border-gray-100 align-top">
                        <td className="px-2 py-1.5 font-mono">{r.order}<div className="text-[11px] text-gray-500">{c.flatMap(x => x.codesC).join(', ') || 'chưa có mã C'}</div></td>
                        <td className="px-2 py-1.5">{r.p0.ten}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt1(r.rd * 7)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{fmtN(ss)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{files.web ? fmtN(tt) : <span className="text-gray-300">—</span>}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${files.web ? tone(tt - ss) : ''}`}>{files.web ? signN(tt - ss) : <span className="text-gray-300">—</span>}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${r.weeks < settings.Ld / 7 ? 'text-red-600 font-semibold' : r.weeks > 8 ? 'text-amber-700 font-semibold' : ''}`}>{fmtW(r.weeks)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums"><b>{fmtN(r.deK)}</b>{r.kien && r.deK > 0 ? <div className="text-[11px] text-slate-600">{fmtN(r.deK / r.kien)} kiện</div> : null}</td>
                        <td className="px-2 py-1.5 text-right"><NumInput value={chotOf(r)} label={`Chốt đặt ${r.order}`} onCommit={v => saveOrder({ chot: { ...order.chot, [r.id]: v } })} /></td>
                        <td className="px-2 py-1.5"><div className="flex flex-wrap gap-1 min-w-40">{r.alerts.length ? [...r.alerts].sort((a, b) => LV_ORDER[a.lv] - LV_ORDER[b.lv]).slice(0, 3).map(a => <AlertTag key={a.k} a={a} />) : <span className="text-xs text-green-700">Ổn định</span>}</div></td>
                      </tr>
                    )
                  })}{!planRows.length && <tr><td colSpan={10} className="px-3 py-4 text-gray-400">Không có mã nào khớp.</td></tr>}</tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function FragmentRows({ r, open, onToggle }) {
  return (
    <>
      <tr onClick={onToggle} className={`border-t border-gray-100 cursor-pointer ${open ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
        <td className="px-2 py-1.5 font-mono">{r.u}</td>
        <td className="px-2 py-1.5 font-mono text-xs">{r.codesC.join(', ') || <span className="text-gray-400 font-sans">chưa có</span>}</td>
        <td className="px-2 py-1.5">{r.ten}<span className="ml-1 text-xs text-gray-400">{r.dvt}</span>{!r.inWeb && <span className="ml-1 text-[11px] text-amber-700">không có trên Web</span>}{!r.inFast && <span className="ml-1 text-[11px] text-amber-700">không có trên Fast U</span>}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.ss)}</td>
        <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.tt)}</td>
        <td className={`px-2 py-1.5 text-right tabular-nums ${tone(r.diff)}`}>{signN(r.diff)}</td>
      </tr>
      {open && (
        <tr className="bg-slate-50"><td colSpan={6} className="px-3 py-2">
          <table className="w-full text-xs border-collapse">
            <thead className="text-gray-500"><tr><th className="px-1.5 py-1 text-left">Lô</th><th className="px-1.5 py-1 text-left">Hạn dùng</th><th className="px-1.5 py-1 text-right">Sổ sách</th><th className="px-1.5 py-1 text-right">Thực tế</th><th className="px-1.5 py-1 text-right">Chênh lệch</th></tr></thead>
            <tbody>{r.lots.map(l => (
              <tr key={l.lo} className="border-t border-gray-200"><td className="px-1.5 py-1 font-mono">{l.lo || '—'}</td><td className="px-1.5 py-1">{l.hd ? String(l.hd).slice(0, 10).split('-').reverse().join('/') : ''}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmtN(l.ss)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(l.tt)}</td><td className={`px-1.5 py-1 text-right tabular-nums ${tone(l.tt - l.ss)}`}>{signN(l.tt - l.ss)}</td></tr>
            ))}{!r.lots.length && <tr><td colSpan={5} className="px-1.5 py-1 text-gray-400">Hết hàng cả 2 bên.</td></tr>}</tbody>
          </table>
        </td></tr>
      )}
    </>
  )
}
