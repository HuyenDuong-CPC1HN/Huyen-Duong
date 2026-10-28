import { useCallback, useMemo, useState } from 'react'
import { Copy, Search } from 'lucide-react'
import { buildDuTruModel, computePlan, fmt1, fmtDmy, fmtN, fmtW, groupOn, groupOrder, groupsOf, normText, parseNxtXml, weekKey } from '../utils/duTru'
import { readDuTruOrder, readDuTruSettings, writeDuTruOrder, writeDuTruSettings } from '../data/duTruStore'
import { AlertTag, DetailPanel, FileSlots, KhoPicker, MergeGroups, NumInput } from './DuTruParts'

// Tab "Dự trù hàng": mỗi kho (C / DTP / SO) dự trù riêng, quy tắc riêng. Hiện làm Kho C: tải file nhập – xuất – tồn
// (đọc ngay trên trình duyệt), cộng chung các mã kho được chọn, gộp mã cùng sản phẩm, đề xuất đơn chính thứ 4–5, đơn bổ
// sung thứ 6, cảnh báo biến động, danh sách nhập lên web công ty. Chỉ lưu lựa chọn và số chốt, không lưu file.
const BRANCHES = [['C', 'Kho C', 'Đang dùng'], ['DTP', 'Kho DTP', 'Chưa thiết kế'], ['SO', 'Kho SO', 'Chưa thiết kế']]
const LV_ORDER = { crit: 0, warn: 1, season: 2, info: 3 }
const CHIPS = [
  { k: 'order', l: 'Mã cần đặt tuần này', cls: 'border-l-[#1e3a5f]', f: r => r.de > 0 },
  { k: 'risk', l: 'Hết hàng, dưới điểm đặt', cls: 'border-l-red-600', f: r => r.alerts.some(a => ['out', 'risk', 'low'].includes(a.k)) },
  { k: 'spike', l: 'Bán tăng / giảm mạnh', cls: 'border-l-amber-600', f: r => r.alerts.some(a => a.k === 'up' || a.k === 'down') },
  { k: 'slow', l: 'Tồn cao, không bán', cls: 'border-l-amber-600', f: r => r.alerts.some(a => a.k === 'high' || a.k === 'stop') },
  { k: 'season', l: 'Sắp vào mùa', cls: 'border-l-teal-600', f: r => r.alerts.some(a => a.k === 'season') },
]
const VIEWS = [['plan', 'Đơn chính (thứ 4–5)'], ['add', 'Đơn bổ sung (thứ 6)'], ['alert', 'Cảnh báo biến động'], ['web', 'Nhập lên web công ty'], ['data', 'Dữ liệu & cách tính']]
const STEPS = [['Thứ 4 – Thứ 5', 'Đặt đơn chính'], ['Thứ 6 sáng', 'Đơn bổ sung'], ['Chiều thứ 6', 'Nhà máy đi hàng'], ['Tối Chủ nhật', 'Hàng đến kho'], ['Sáng thứ 2', 'Kiểm đếm, nhập hàng']]
const EMPTY_ORDER = { chot: {}, add: {}, done: {} }
const median = a => { const b = [...a].sort((x, y) => x - y); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : NaN }
const readText = file => (file.text ? file.text() : new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsText(file) }))
const Box = ({ title, sub, open = true, children }) => (
  <details open={open} className="bg-white rounded-2xl border border-gray-200 group">
    <summary className="cursor-pointer px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1"><span className="font-semibold">{title}</span>{sub && <span className="text-xs text-gray-500">{sub}</span>}</summary>
    <div className="px-4 pb-4">{children}</div>
  </details>
)

function KhoC() {
  const [files, setFiles] = useState({})
  const [slotMsg, setSlotMsg] = useState({})
  const [settings, setSettings] = useState(() => readDuTruSettings('C'))
  const [orders, setOrders] = useState({})
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [view, setView] = useState('plan')
  const [sel, setSel] = useState(null)
  const closeDetail = useCallback(() => setSel(null), [])
  const [copyMsg, setCopyMsg] = useState('')
  const [copyText, setCopyText] = useState('')

  const model = useMemo(() => buildDuTruModel(files), [files])
  const P = useMemo(() => ({ Ld: settings.Ld, ss: settings.ss, useSea: settings.useSea && !!model?.hasLY }), [settings.Ld, settings.ss, settings.useSea, model])
  const week = model ? weekKey(model.to) : ''
  const order = useMemo(() => orders[week] || (week ? readDuTruOrder(week, 'C') : EMPTY_ORDER), [orders, week])
  const rows = useMemo(() => (model ? computePlan(model, settings, P, order.chot) : []), [model, settings, P, order.chot])

  const save = patch => { const next = { ...settings, ...patch }; setSettings(next); writeDuTruSettings(next, 'C') }
  const saveOrder = patch => { const next = { ...order, ...patch }; setOrders(o => ({ ...o, [week]: next })); writeDuTruOrder(week, next, 'C') }
  // Quy mã J / W về mã nhận điều: gộp tay [mã nhận điều (+ các mã đang gộp cùng nó), mã J / W], đặt bằng mã nhận điều
  const linkJw = (jw, target) => {
    const g = groupsOf(model, settings).find(x => groupOn(settings, x) && x.codes.includes(target))
    const codes = [...new Set([...(g ? g.codes : [target]), jw])].sort()
    const ord = g ? groupOrder(model, settings, g) : target
    save({
      manual: [...settings.manual.filter(c => !g || `manual:${c.join(',')}` !== g.key), codes],
      merge: { ...settings.merge, [`manual:${codes.join(',')}`]: { on: true, order: ord } },
    })
    if (sel) setSel(ord)
  }
  const setAlone = (ma, on) => save({ jwAlone: on ? [...new Set([...settings.jwAlone, ma])] : settings.jwAlone.filter(c => c !== ma) })
  const chotOf = r => order.chot[r.id] ?? r.de
  const addOf = r => order.add[r.id] ?? r.addDe

  const pick = async (k, file) => {
    setSlotMsg(m => ({ ...m, [k]: { busy: `Đang đọc ${file.name} (${fmt1(file.size / 1048576)} MB)…` } }))
    await new Promise(r => setTimeout(r, 30)) // cho giao diện hiện "Đang đọc" trước khi đọc file lớn
    try {
      const parsed = parseNxtXml(await readText(file))
      setFiles(f => ({ ...f, [k]: { ...parsed, name: file.name } }))
      setSlotMsg(m => ({ ...m, [k]: {} }))
      setSel(null)
    } catch (err) {
      setSlotMsg(m => ({ ...m, [k]: { err: `Không đọc được ${file.name}: ${err.message}` } }))
    }
  }
  const clear = k => { setFiles(f => { const n = { ...f }; delete n[k]; return n }); setSlotMsg(m => ({ ...m, [k]: {} })); setSel(null) }
  const copy = (text, label) => {
    setCopyText('')
    const fallback = () => { setCopyText(text); setCopyMsg('Trình duyệt chặn chép tự động — bôi đen nội dung bên dưới để chép.') }
    if (!navigator.clipboard?.writeText) { fallback(); return }
    navigator.clipboard.writeText(text).then(() => setCopyMsg(label), fallback)
  }

  const chip = CHIPS.find(c => c.k === filter)
  const nq = normText(q)
  const shown = rows.filter(r => (!chip || chip.f(r)) && (!nq || normText(`${r.codes.join(' ')} ${r.p0.ten}`).includes(nq)))
  const web = rows.map(r => ({ r, q: chotOf(r) + (addOf(r) || 0) })).filter(x => x.q > 0)
  const selRow = rows.find(r => r.id === sel)
  const jwRows = rows.filter(r => r.cands?.length)
  const allAlerts = rows.flatMap(r => r.alerts.filter(a => a.k !== 'merge').map(a => ({ ...a, r }))).sort((a, b) => LV_ORDER[a.lv] - LV_ORDER[b.lv])

  const act = rows.filter(r => r.rd > 0)
  const wkAfter = (r, qty) => (r.TON + qty) / (r.rd * 7)
  const short = qty => act.filter(r => r.TON + qty(r) < r.rd * (7 + P.Ld)).length
  const high = qty => act.filter(r => wkAfter(r, qty(r)) > 8).length

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-0 border border-gray-200 rounded-xl overflow-hidden bg-white text-sm" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }} aria-label="Lịch đặt hàng trong tuần">
        {STEPS.map(([when, what], i) => (
          <div key={what} className={`px-3 py-2 border-r border-gray-100 last:border-r-0 ${i < 2 ? 'bg-slate-50' : ''}`}>
            <div className="text-[11px] text-gray-500">{when}</div><div className="font-semibold">{what}{i < 2 && <span className="ml-1 text-[11px] font-normal text-[#1e3a5f]">· có trong app</span>}</div>
          </div>
        ))}
      </div>

      <Box title="1 · Tải file nhập – xuất – tồn" sub={model ? `Kỳ chính ${fmtDmy(model.from)} – ${fmtDmy(model.to)} (${model.D3} ngày)` : 'Chưa tải file 3 tháng'}>
        <div className="flex flex-col gap-2.5">
          <div className="text-xs text-gray-500">Xuất từ phần mềm mẫu <b>"Báo cáo tổng hợp nhập xuất tồn theo kho"</b> (file Excel dạng XML), chọn đúng khoảng ngày rồi tải vào ô tương ứng. App tự đọc kỳ báo cáo ở dòng "Từ ngày … đến ngày …". <b>File chỉ đọc trên trình duyệt, không lưu lên máy chủ</b>; mỗi lần dự trù tải file mới. Lựa chọn kho, gộp mã và số chốt thì được lưu.</div>
          <FileSlots files={files} slotMsg={slotMsg} onPick={pick} onClear={clear} />
        </div>
      </Box>

      {!model ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-gray-600 text-center">Tải file <b>3 tháng gần nhất → hôm nay</b> ở mục 1 để bắt đầu dự trù.</div>
      ) : (
        <>
          <Box open={false} title="2 · Kho tính dự trù" sub={`Kho C = ${model.khoCodes.filter(c => settings.kho.includes(c)).map(c => (settings.khoName[c] ? `${c} (${settings.khoName[c]})` : c)).join(' + ') || 'chưa chọn kho'}`}>
            <KhoPicker model={model} settings={settings}
              onToggle={(c, on) => save({ kho: on ? [...new Set([...settings.kho, c])] : settings.kho.filter(x => x !== c) })}
              onName={(c, name) => save({ khoName: { ...settings.khoName, [c]: name } })} />
          </Box>
          <Box open={false} title="3 · Mã cùng sản phẩm" sub={<>{rows.filter(r => r.codes.length > 1).length} nhóm đang gộp{jwRows.length > 0 && <b className="ml-2 text-amber-700">· {jwRows.length} mã J / W chưa quy về mã nhận điều</b>}</>}>
            <MergeGroups model={model} settings={settings} P={P} jwRows={jwRows} onLinkJw={linkJw} onAlone={setAlone}
              onSetMerge={(key, patch) => save({ merge: { ...settings.merge, [key]: { ...(settings.merge[key] || {}), ...patch } } })}
              onAddManual={codes => save({ manual: [...settings.manual, codes] })}
              onDelManual={codes => save({ manual: settings.manual.filter(c => c.join(',') !== codes.join(',')) })} />
          </Box>

          <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Thông số dự trù">
            <div className="flex flex-wrap items-end gap-3 text-sm">
              <label className="flex flex-col gap-1 text-xs text-gray-500">Chu kỳ đặt hàng<span className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-gray-700 bg-gray-50">1 tuần</span></label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">Từ lúc đặt đến khi nhập (ngày)
                <input type="number" min="1" value={settings.Ld} onChange={e => save({ Ld: Math.max(1, Math.round(+e.target.value || 1)) })} className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
              <label className="flex flex-col gap-1 text-xs text-gray-500">Tồn an toàn (ngày bán)
                <input type="number" min="0" value={settings.ss} onChange={e => save({ ss: Math.max(0, Math.round(+e.target.value || 0)) })} className="w-24 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
              <label className="flex items-center gap-1.5 pb-1.5"><input type="checkbox" checked={settings.useSea} disabled={!model.hasLY} onChange={e => save({ useSea: e.target.checked })} />
                {model.hasLY ? 'Nhân hệ số mùa vụ (từ 2 file năm trước)' : 'Nhân hệ số mùa vụ — cần tải 2 file năm trước'}</label>
            </div>
            <div className="text-xs text-gray-500">Bình quân: <b>Sl xuất ÷ {model.D3} ngày</b>{P.useSea ? ' × hệ số mùa vụ' : ''} · Cần đủ hàng <b>{7 + P.Ld + P.ss} ngày</b> (7 ngày chu kỳ + {P.Ld} ngày chờ hàng + {P.ss} ngày tồn an toàn) · Số chốt lưu theo tuần {week}</div>
          </section>

          <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="So với cách đang làm">
            <h3 className="m-0 text-base font-semibold">So với cách đang làm (xuất 1 tháng − tồn)</h3>
            <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              {[
                ['Tồn sau khi hàng về (trung vị các mã)', `≈ ${fmtW(median(act.map(r => wkAfter(r, chotOf(r)))))} bán`, `≈ ${fmtW(median(act.map(r => wkAfter(r, r.old))))} bán`, 'Cách đang làm luôn bù đủ 1 tháng hàng, dù tuần nào cũng có chuyến về'],
                ['Tổng số lượng đặt tuần này (mọi ĐVT cộng lại)', fmtN(act.reduce((s, r) => s + chotOf(r), 0)), fmtN(act.reduce((s, r) => s + r.old, 0)), 'Chỉ để so 2 cách; tuần đầu áp dụng thường đặt ít hơn vì tồn đang có được dùng dần'],
                ['Mã không đủ bán tới chuyến sau', `${short(chotOf)} mã`, `${short(r => r.old)} mã`, `${high(chotOf)} mã tồn quá 8 tuần sau khi hàng về (cách đang làm: ${high(r => r.old)} mã)`],
              ].map(([k, a, b, note]) => (
                <div key={k} className="rounded-xl border border-gray-200 bg-slate-50 px-3 py-2 flex flex-col gap-1">
                  <span className="text-xs text-gray-500">{k}</span>
                  <span className="flex flex-wrap items-baseline gap-2 tabular-nums"><b className="text-lg">{a}</b><s className="text-gray-400">{b}</s></span>
                  <span className="text-xs text-gray-500">{note}</span>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }} role="group" aria-label="Lọc theo tình trạng">
            {CHIPS.map(c => (
              <button key={c.k} type="button" aria-pressed={filter === c.k} onClick={() => { setFilter(filter === c.k ? 'all' : c.k); setView('plan') }}
                className={`text-left bg-white rounded-xl border border-gray-200 border-l-4 ${c.cls} px-3 py-2 ${filter === c.k ? 'ring-1 ring-[#1e3a5f] bg-slate-50' : ''}`}>
                <div className="text-xl font-bold tabular-nums">{fmtN(rows.filter(c.f).length)}</div><div className="text-xs text-gray-500">{c.l}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1 border-b border-gray-200" role="tablist">
            {VIEWS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)}
                className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${view === k ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-transparent text-gray-500'}`}>
                {l}{k === 'add' && model.hasW ? ` (${rows.filter(r => r.addDe > 0).length})` : ''}{k === 'alert' ? ` (${allAlerts.length})` : ''}
              </button>
            ))}
          </div>

          {view === 'plan' && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Đơn chính">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-full sm:w-80">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã, tên hàng…" aria-label="Tìm mã, tên hàng" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
                </div>
                <button type="button" className="sheet-tab-action" onClick={() => copy([
                  ['Mã đặt hàng', 'Các mã gộp', 'Tên hàng', 'ĐVT', 'Bán/tuần', '4 tuần gần nhất/tuần', 'Tồn hiện có', 'Đủ bán (tuần)', 'Cách đang làm', 'Đề xuất', 'Chốt đặt', 'Lưu ý'].join('\t'),
                  ...shown.map(r => [r.order, r.codes.join(', '), r.p0.ten, r.p0.dvt, fmt1(r.rd * 7), r.r4 == null ? '' : fmt1(r.r4 * 7), Math.round(r.TON), Number.isFinite(r.weeks) ? fmt1(r.weeks) : '', r.old, r.de, chotOf(r), r.alerts.map(a => a.t).join('; ')].join('\t')),
                ].join('\n'), `Đã chép ${shown.length} dòng, dán vào Excel.`)}><Copy size={13} /> Chép bảng (dán vào Excel)</button>
                {copyMsg && <span className="text-xs text-green-700" role="status">{copyMsg}</span>}
              </div>
              <div className="text-xs text-gray-500">{chip ? `Đang lọc: ${chip.l}. ` : ''}Hiện {fmtN(shown.length)}/{fmtN(rows.length)} mã, xếp theo tên vật tư A → Z. Bấm vào dòng để xem tồn theo kho, theo lô và cách tính. Cột "Cách đang làm" để so sánh, không dùng để đặt.</div>
              <div className="overflow-x-auto border border-gray-200 rounded-xl">
                <table className="w-full text-sm border-collapse" style={{ minWidth: 1000 }}>
                  <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                    <th className="px-2 py-2 text-left">Mã đặt hàng</th><th className="px-2 py-2 text-left">Tên hàng</th><th className="px-2 py-2 text-right">Bán/tuần</th><th className="px-2 py-2 text-right">4 tuần gần nhất</th>
                    <th className="px-2 py-2 text-right">Tồn hiện có</th><th className="px-2 py-2 text-right">Đủ bán</th><th className="px-2 py-2 text-right">Cách đang làm</th><th className="px-2 py-2 text-right">Đề xuất</th><th className="px-2 py-2 text-right">Chốt đặt</th><th className="px-2 py-2 text-left">Lưu ý</th>
                  </tr></thead>
                  <tbody>{shown.map(r => {
                    const diff = r.de - r.old
                    const cover = r.weeks < P.Ld / 7 ? 'text-red-600 font-semibold' : r.weeks > 8 ? 'text-amber-700 font-semibold' : ''
                    const r4cls = r.r4 == null ? '' : r.X3 >= 10 && r.r4 >= 1.5 * r.rate ? 'text-amber-700 font-semibold' : r.X3 >= 10 && r.r4 <= 0.5 * r.rate ? 'text-red-600 font-semibold' : ''
                    return (
                      <tr key={r.id} onClick={() => setSel(sel === r.id ? null : r.id)} className={`border-t border-gray-100 cursor-pointer align-top ${sel === r.id ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                        <td className="px-2 py-1.5 font-mono">{r.order}{r.codes.length > 1 && <div className="text-[11px] font-sans text-slate-600">gộp {r.codes.length} mã</div>}{r.cands?.length > 0 && <div className="text-[11px] font-sans text-amber-700">mã J / W · có thể là {r.cands[0].ma}</div>}</td>
                        <td className="px-2 py-1.5">{r.p0.ten}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmt1(r.rd * 7)}{r.sea !== 1 && <div className="text-[11px] text-gray-500">mùa vụ ×{fmt1(r.sea)}</div>}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${r4cls}`}>{r.r4 == null ? <span className="text-gray-300">—</span> : fmt1(r.r4 * 7)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.TON)}</td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${cover}`}>{fmtW(r.weeks)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">{fmtN(r.old)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums"><b>{fmtN(r.de)}</b>{diff !== 0 && <div className={`text-[11px] ${diff > 0 ? 'text-amber-700' : 'text-green-700'}`}>{diff > 0 ? '+' : '−'}{fmtN(Math.abs(diff))}</div>}</td>
                        <td className="px-2 py-1.5 text-right"><NumInput value={chotOf(r)} label={`Chốt đặt ${r.order}`} onCommit={v => saveOrder({ chot: { ...order.chot, [r.id]: v } })} /></td>
                        <td className="px-2 py-1.5"><div className="flex flex-wrap gap-1 min-w-44">{r.alerts.length ? [...r.alerts].sort((a, b) => LV_ORDER[a.lv] - LV_ORDER[b.lv]).slice(0, 3).map(a => <AlertTag key={a.k} a={a} />) : <span className="text-xs text-green-700">Ổn định</span>}</div></td>
                      </tr>
                    )
                  })}{!shown.length && <tr><td colSpan={10} className="px-3 py-4 text-gray-400">Không có mã nào khớp. Kiểm tra kho đang chọn ở mục 2, bộ lọc hoặc từ khoá.</td></tr>}</tbody>
                </table>
              </div>
            </section>
          )}

          {view === 'add' && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Đơn bổ sung thứ 6">
              <div className="text-xs text-gray-500">Sáng thứ 6 tải file <b>thứ 2 → hôm nay</b> (ô "Tuần này" ở mục 1). App so lượng xuất trong tuần với dự kiến; mã bán nhanh hơn 30% thì tính lại theo tốc độ thực tế, đủ bán tới chuyến hàng sau; trừ tồn hiện có (Tồn cuối của file tuần này) và đơn chính đã chốt.</div>
              {!model.hasW ? <div className="text-sm text-gray-500">Chưa có file tuần này.</div> : (
                <div className="overflow-x-auto border border-gray-200 rounded-xl">
                  <table className="w-full text-sm border-collapse" style={{ minWidth: 900 }}>
                    <thead className="bg-gray-50 text-gray-500 text-xs"><tr><th className="px-2 py-2 text-left">Mã đặt hàng</th><th className="px-2 py-2 text-left">Tên hàng</th><th className="px-2 py-2 text-right">Dự kiến trong kỳ</th><th className="px-2 py-2 text-right">Thực xuất</th><th className="px-2 py-2 text-right">So dự kiến</th><th className="px-2 py-2 text-right">Tồn hiện có</th><th className="px-2 py-2 text-right">Đơn chính đã chốt</th><th className="px-2 py-2 text-right">Đề xuất bổ sung</th><th className="px-2 py-2 text-right">Chốt bổ sung</th></tr></thead>
                    <tbody>{rows.filter(r => r.fast).map(r => (
                      <tr key={r.id} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 font-mono">{r.order}</td><td className="px-2 py-1.5">{r.p0.ten}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.expW)}</td><td className="px-2 py-1.5 text-right tabular-nums"><b>{fmtN(r.XW)}</b></td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-amber-700 font-semibold">+{Math.round((r.XW / r.expW - 1) * 100)}%</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(r.tonNow)}</td><td className="px-2 py-1.5 text-right tabular-nums">{fmtN(chotOf(r))}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums"><b>{fmtN(r.addDe)}</b></td>
                        <td className="px-2 py-1.5 text-right"><NumInput value={addOf(r)} label={`Chốt bổ sung ${r.order}`} onCommit={v => saveOrder({ add: { ...order.add, [r.id]: v } })} /></td>
                      </tr>
                    ))}{!rows.some(r => r.fast) && <tr><td colSpan={9} className="px-3 py-4 text-gray-400">Tuần này không có mã nào bán nhanh bất thường.</td></tr>}</tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {view === 'alert' && (
            <section className="flex flex-col gap-2" aria-label="Cảnh báo biến động">
              <div className="text-xs text-gray-500">Xếp theo mức độ: đỏ cần xử lý ngay, cam cần theo dõi, xanh để chuẩn bị. Bấm vào cảnh báo để mở chi tiết mã hàng.</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
                {allAlerts.slice(0, 300).map(a => (
                  <button key={`${a.r.id}-${a.k}`} type="button" onClick={() => setSel(a.r.id)} className="text-left bg-white rounded-xl border border-gray-200 px-3 py-2 flex flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-1.5 text-sm"><AlertTag a={a} /><span className="font-mono">{a.r.order}</span> {a.r.p0.ten.split(' - ')[0]}</span>
                    <span className="text-xs text-gray-600">{a.d}</span><span className="text-xs"><b>Việc nên làm:</b> {a.a}</span>
                  </button>
                ))}
              </div>
              {allAlerts.length > 300 && <div className="text-xs text-gray-500">Còn {allAlerts.length - 300} cảnh báo — lọc ở bảng Đơn chính để xem.</div>}
            </section>
          )}

          {view === 'web' && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Nhập lên web công ty">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="m-0 text-base font-semibold">Danh sách nhập lên web công ty</h3>
                <span className="text-xs text-gray-500">Đã nhập {web.filter(x => order.done[x.r.id]).length}/{web.length} mã · xếp theo tên vật tư</span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  <button type="button" className="sheet-tab-action" onClick={() => copy(web.map(({ r, q: n }) => `${r.order}\t${r.p0.ten}\t${n}`).join('\n'), 'Đã chép danh sách.')}><Copy size={13} /> Chép danh sách</button>
                  <button type="button" className="sheet-tab-action" onClick={() => copy([`ĐẶT HÀNG KHO C – số liệu đến ${fmtDmy(model.to)}`, ...web.map(({ r, q: n }, i) => `${i + 1}. ${r.order} ${r.p0.ten}: ${fmtN(n)} ${r.p0.dvt}`)].join('\n'), 'Đã chép, dán vào Zalo.')}><Copy size={13} /> Chép nội dung gửi Zalo</button>
                </span>
              </div>
              {copyMsg && <span className="text-xs text-green-700" role="status">{copyMsg}</span>}
              <ul className="m-0 p-0 list-none">{web.map(({ r, q: n }) => (
                <li key={r.id} className={`flex items-center gap-2 py-1.5 border-b border-gray-100 text-sm ${order.done[r.id] ? 'text-gray-400' : ''}`}>
                  <input type="checkbox" checked={!!order.done[r.id]} onChange={e => saveOrder({ done: { ...order.done, [r.id]: e.target.checked } })} aria-label={`Đã nhập ${r.order}`} />
                  <span className="font-mono">{r.order}</span><span>{r.p0.ten}</span>
                  <b className={`ml-auto tabular-nums whitespace-nowrap ${order.done[r.id] ? 'line-through' : ''}`}>{fmtN(n)} {r.p0.dvt}</b>
                </li>
              ))}{!web.length && <li className="text-sm text-gray-400">Chưa có mã nào cần đặt.</li>}</ul>
            </section>
          )}

          {view === 'data' && (
            <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2 text-sm leading-relaxed" aria-label="Dữ liệu và cách tính">
              <h3 className="m-0 text-base font-semibold">Cách tính</h3>
              <ol className="m-0 pl-5 flex flex-col gap-1">
                <li><b>Chỉ cộng các kho được chọn</b> (mục 2) và <b>gộp mã cùng sản phẩm</b> (mục 3).</li>
                <li><b>Bán/ngày</b> = Sl xuất của file 3 tháng ÷ số ngày của kỳ{model.hasLY ? ' × hệ số mùa vụ (tốc độ bán tháng tới năm ngoái ÷ tốc độ 3 tháng năm ngoái, giới hạn 0,7 – 1,5; mã năm ngoái bán dưới 10 thì không tính)' : ''}.</li>
                <li><b>Số ngày cần đủ hàng</b> = 7 (chu kỳ đặt) + số ngày từ lúc đặt đến khi nhập + số ngày tồn an toàn.</li>
                <li><b>Đề xuất</b> = bán/ngày × số ngày cần đủ hàng − tồn hiện có (Tồn cuối), không âm, làm tròn lên.</li>
                <li><b>Đơn bổ sung thứ 6</b>: trong tuần bán nhanh hơn dự kiến từ 30% trở lên thì tính lại bằng tốc độ tuần này, đủ bán {7 + P.Ld - 2} ngày tới chuyến sau, trừ tồn hiện có và đơn chính đã chốt.</li>
                <li><b>4 tuần gần nhất</b> chỉ dùng để cảnh báo bán tăng / giảm mạnh và tính cột "Cách đang làm" (xuất 1 tháng − tồn).</li>
              </ol>
              <h3 className="m-0 text-base font-semibold">Lưu ý</h3>
              <ul className="m-0 pl-5 flex flex-col gap-1">
                <li>App lấy đúng số trong file, không tự trừ hay ước tính gì. "Sl xuất" của file gồm cả trả nhà máy, huỷ, điều chuyển; hiện tạm tính là xuất bán.</li>
                <li>Hết hàng giữa kỳ hoặc mới về giữa kỳ thì bình quân thấp hơn nhu cầu thật; app gắn cảnh báo để anh chốt tay.</li>
                <li>Cột Đơn giá trong file trống nên chưa quy ra tiền.</li>
              </ul>
            </section>
          )}

          {copyText && <textarea readOnly value={copyText} onFocus={e => e.target.select()} aria-label="Nội dung để chép" className="w-full min-h-40 border border-gray-200 rounded-lg p-2 font-mono text-xs" />}
          {selRow && <DetailPanel r={selRow} model={model} settings={settings} onClose={closeDetail} onLinkJw={linkJw} onAlone={setAlone} />}
        </>
      )}
    </div>
  )
}

export default function DuTruHangTab() {
  const [branch, setBranch] = useState('C')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Kho dự trù">
        {BRANCHES.map(([k, l, s]) => (
          <button key={k} type="button" role="tab" aria-selected={branch === k} onClick={() => setBranch(k)}
            className={`text-left rounded-xl border px-4 py-2 min-w-36 ${branch === k ? 'border-[#1e3a5f] bg-slate-50 ring-1 ring-[#1e3a5f]' : 'border-gray-200 bg-white'}`}>
            <div className="font-bold">{l}</div><div className="text-[11px] text-gray-500">{s}</div>
          </button>
        ))}
      </div>
      {branch === 'C' ? <KhoC /> : (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 text-sm text-gray-600 flex flex-col gap-2">
          <b>{BRANCHES.find(b => b[0] === branch)[1]}: chưa thiết kế.</b>
          <div>Mỗi kho dự trù riêng, quy tắc riêng. Để làm kho này, anh gửi em file mẫu nhập – xuất – tồn của kho, lịch đặt hàng và quy tắc riêng của kho.</div>
        </div>
      )}
    </div>
  )
}
