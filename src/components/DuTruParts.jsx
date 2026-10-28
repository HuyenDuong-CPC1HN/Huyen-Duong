import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { analyseItem, fmt1, fmt2, fmtDmy, fmtN, groupOn, groupOrder, groupsOf, isJW } from '../utils/duTru'

// Các phần của tab "Dự trù hàng": ô tải file, chọn kho, mã cùng sản phẩm, chi tiết 1 mã.
const fmtHd = s => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '')

const LV_CLS = {
  crit: 'bg-red-50 text-red-700 border-red-200', warn: 'bg-amber-50 text-amber-800 border-amber-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200', season: 'bg-teal-50 text-teal-700 border-teal-200',
}
export const AlertTag = ({ a }) => <span className={`inline-block px-2 py-0.5 rounded-full border text-[11px] font-semibold ${LV_CLS[a.lv]}`}>{a.t}</span>

// Ô số: gõ thoải mái, lưu khi rời ô hoặc Enter (không ghi máy chủ theo từng phím).
export function NumInput({ value, onCommit, label }) {
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft === null) return
    const n = Number(String(draft).replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n) && n >= 0) onCommit(Math.round(n))
    setDraft(null)
  }
  return (
    <input value={draft ?? String(value)} onChange={e => setDraft(e.target.value)} onBlur={commit} onClick={e => e.stopPropagation()}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }} inputMode="numeric" aria-label={label}
      className="w-20 border border-gray-200 rounded px-1.5 py-1 text-right tabular-nums text-sm" />
  )
}

const SLOTS = [
  { k: 'f3', t: '3 tháng gần nhất → hôm nay', need: 'Bắt buộc', ex: 'vd 01/08 – 28/10', ok: d => d >= 80 && d <= 100, okTxt: 'khoảng 3 tháng' },
  { k: 'f4', t: '4 tuần gần nhất → hôm nay', need: 'Nên có', ex: 'vd 01/10 – 28/10', ok: d => d >= 21 && d <= 35, okTxt: '3 – 5 tuần' },
  { k: 'fw', t: 'Tuần này: thứ 2 → hôm nay', need: 'Sáng thứ 6', ex: 'vd 26/10 – 29/10', ok: d => d <= 7, okTxt: 'tối đa 7 ngày' },
  { k: 'ly3', t: 'Năm trước: cùng 3 tháng', need: 'Tuỳ chọn', ex: 'vd 01/08 – 28/10/2025', ok: d => d >= 80 && d <= 100, okTxt: 'khoảng 3 tháng' },
  { k: 'lyn', t: 'Năm trước: tháng tới', need: 'Tuỳ chọn', ex: 'vd 01/11 – 30/11/2025', ok: d => d >= 28 && d <= 31, okTxt: '1 tháng' },
]

export function FileSlots({ files, slotMsg, onPick, onClear }) {
  return (
    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
      {SLOTS.map(s => {
        const f = files[s.k]
        const m = slotMsg[s.k] || {}
        const warn = f && !s.ok(f.days) ? `Kỳ ${f.days} ngày, ô này cần ${s.okTxt}; app vẫn tính theo đúng số ngày trong file.` : ''
        return (
          <div key={s.k} className={`rounded-xl border p-3 flex flex-col gap-1.5 text-sm ${f ? 'border-green-300 bg-white' : 'border-dashed border-gray-300 bg-slate-50'}`}>
            <div className="flex flex-wrap items-center gap-1.5 font-semibold">{s.t}
              <span className={`px-1.5 py-0.5 rounded-full text-[11px] border ${s.need === 'Bắt buộc' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-white text-gray-500 border-gray-200'}`}>{s.need}</span>
              {f && <span className="px-1.5 py-0.5 rounded-full text-[11px] bg-green-50 text-green-700 border border-green-200">Đã tải</span>}
            </div>
            <div className="text-xs text-gray-500 break-all">
              {m.busy || (f ? <><b className="text-gray-700">{f.name}</b><br />Kỳ {fmtDmy(f.from)} – {fmtDmy(f.to)} · {f.days} ngày · {fmtN(f.nMa)} mã · {fmtN(f.data.length)} dòng</> : `Chưa tải · ${s.ex}`)}
            </div>
            {warn && <div className="text-xs text-amber-700">⚠ {warn}</div>}
            {m.err && <div className="text-xs text-red-600">{m.err}</div>}
            <div className="flex gap-1.5">
              <label className="sheet-tab-action cursor-pointer">{f ? 'Đổi file' : 'Chọn file'}
                <input type="file" accept=".xml,.xls" hidden aria-label={`Tải file ${s.t}`} onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) onPick(s.k, file) }} />
              </label>
              {f && <button type="button" onClick={() => onClear(s.k)} className="sheet-tab-action">Bỏ file</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function KhoPicker({ model, settings, onToggle, onName }) {
  const sel = model.khoCodes.filter(c => settings.kho.includes(c))
  return (
    <div className="flex flex-col gap-2">
      <div className="text-xs text-gray-500">Chỉ các kho được tick mới tính, và <b>cộng chung thành Kho C</b> (tồn cộng tồn, xuất cộng xuất). Kho không tick thì bỏ qua. Lựa chọn và tên gọi được lưu lại.</div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
            <th className="px-2 py-2 text-left">Tính</th><th className="px-2 py-2 text-left">Mã kho</th><th className="px-2 py-2 text-left">Tên gọi (anh tự đặt)</th>
            <th className="px-2 py-2 text-right">Số mã hàng</th><th className="px-2 py-2 text-right">Tồn cuối</th><th className="px-2 py-2 text-right">Sl xuất {model.D3} ngày</th>
          </tr></thead>
          <tbody>{model.khoCodes.map(c => {
            const st = model.khoStats[c]
            return (
              <tr key={c} className="border-t border-gray-100">
                <td className="px-2 py-1.5"><input type="checkbox" checked={settings.kho.includes(c)} onChange={e => onToggle(c, e.target.checked)} aria-label={`Tính kho ${c}`} /></td>
                <td className="px-2 py-1.5 font-mono">{c}</td>
                <td className="px-2 py-1.5"><input defaultValue={settings.khoName[c] || ''} key={settings.khoName[c] || ''} onBlur={e => { if (e.target.value.trim() !== (settings.khoName[c] || '')) onName(c, e.target.value.trim()) }}
                  placeholder="đặt tên gọi" aria-label={`Tên gọi kho ${c}`} className="w-full min-w-36 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtN(st.nMa)}</td><td className="px-2 py-1.5 text-right tabular-nums">{fmtN(st.tc)}</td><td className="px-2 py-1.5 text-right tabular-nums">{fmtN(st.x)}</td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      {!sel.length && <div className="text-xs text-red-600">Chưa chọn kho nào có trong file.</div>}
    </div>
  )
}

export function MergeGroups({ model, settings, P, onSetMerge, onAddManual, onDelManual }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')
  const groups = groupsOf(model, settings)
  const one = (ma, codes) => analyseItem(model, settings, { id: ma, order: ma, codes }, P)
  const add = () => {
    const codes = [...new Set(text.toUpperCase().split(/[\s,;]+/).filter(Boolean))].sort()
    const bad = codes.filter(c => !model.prod[c])
    if (codes.length < 2) { setMsg('Nhập ít nhất 2 mã vật tư.'); return }
    if (bad.length) { setMsg(`Không thấy mã ${bad.join(', ')} trong file.`); return }
    if (new Set(codes.map(c => (model.prod[c].dvt || '').toLowerCase())).size > 1) { setMsg(`Không gộp được: khác đơn vị tính (${codes.map(c => model.prod[c].dvt).join(' / ')}), cộng số lượng sẽ sai.`); return }
    const taken = codes.filter(c => groups.some(g => groupOn(settings, g) && g.codes.includes(c)))
    if (taken.length) { setMsg(`Mã ${taken.join(', ')} đã nằm trong nhóm khác; bỏ gộp nhóm đó trước.`); return }
    onAddManual(codes); setText(''); setMsg(`Đã gộp ${codes.join(', ')}.`)
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className="text-xs text-gray-500">Một sản phẩm có 2 – 3 mã vật tư (quy định nội bộ). App tự tìm các mã <b>trùng tên + ĐVT</b> ở các kho đang chọn và gộp: cộng tồn, cộng xuất rồi mới dự trù, để không đặt gấp đôi. <b>Mã đặt hàng</b> mặc định là mã không bắt đầu bằng J / W; anh đổi được. Không phải cùng sản phẩm thì bấm Không gộp.</div>
      <div className="flex flex-col gap-2.5 max-h-[560px] overflow-y-auto pr-1">
        {groups.map(g => {
          const on = groupOn(settings, g)
          const order = groupOrder(model, settings, g)
          const sep = g.codes.map(c => one(c, [c]))
          const merged = one(order, g.codes)
          const p = model.prod[g.codes[0]]
          return (
            <div key={g.key} className={`rounded-xl border border-gray-200 p-3 flex flex-col gap-2 ${on ? 'bg-white' : 'bg-gray-50 opacity-70'}`} aria-label={`Nhóm ${p.ten}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>{p.ten}</b><span className="text-xs text-gray-500">{p.dvt}</span>
                <span className={`px-1.5 py-0.5 rounded-full text-[11px] border ${g.auto ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{g.auto ? 'app tự tìm: trùng tên + ĐVT' : 'anh gộp tay'}</span>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" onClick={() => onSetMerge(g.key, { on: !on })} className={`sheet-tab-action ${on ? '' : 'is-primary'}`}>{on ? 'Không gộp' : 'Gộp lại'}</button>
                  {!g.auto && <button type="button" onClick={() => onDelManual(g.codes)} className="sheet-tab-action">Xoá nhóm</button>}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[520px]">
                  <thead className="text-gray-500"><tr><th className="px-1.5 py-1 text-left">Mã đặt hàng</th><th className="px-1.5 py-1 text-left">Mã vật tư</th><th className="px-1.5 py-1 text-left">Tên trên file</th><th className="px-1.5 py-1 text-right">Tồn</th><th className="px-1.5 py-1 text-right">Xuất trong kỳ</th><th className="px-1.5 py-1 text-right">Nếu tính riêng: đề xuất</th></tr></thead>
                  <tbody>{sep.map(s => (
                    <tr key={s.order} className="border-t border-gray-100">
                      <td className="px-1.5 py-1"><input type="radio" name={`ord-${g.key}`} checked={s.order === order} disabled={!on} onChange={() => onSetMerge(g.key, { order: s.order })} aria-label={`Đặt bằng mã ${s.order}`} /></td>
                      <td className="px-1.5 py-1 font-mono">{s.order}{isJW(s.order) && <span className="ml-1 text-[10px] text-gray-400">J / W</span>}</td>
                      <td className="px-1.5 py-1">{s.p0.ten}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(s.TON)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(s.X3)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(s.de)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <div className="text-xs flex flex-wrap gap-x-4 gap-y-1">
                <span>Tính riêng từng mã: đặt tổng <b>{fmtN(sep.reduce((a, s) => a + s.de, 0))}</b></span>
                <span>Gộp: đặt <b>{fmtN(merged.de)}</b> bằng mã <b className="font-mono">{order}</b></span>
                <span className="text-gray-500">Tồn gộp {fmtN(merged.TON)} · bán {fmt1(merged.rd * 7)}/tuần</span>
              </div>
            </div>
          )
        })}
        {!groups.length && <div className="text-xs text-gray-500">Không có mã nào trùng tên + ĐVT ở các kho đang chọn.</div>}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500 flex-1 min-w-60">Gộp thêm (tên khác nhau nhưng cùng sản phẩm) — nhập các mã, cách nhau dấu phẩy
          <input value={text} onChange={e => setText(e.target.value)} placeholder="VD: B00456, J00630" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" /></label>
        <button type="button" onClick={add} className="sheet-tab-action">Gộp</button>
      </div>
      {msg && <div className="text-xs text-gray-600" role="status">{msg}</div>}
    </div>
  )
}

// Thanh so tốc độ bán (đơn vị / tuần)
function RateBars({ r, model }) {
  const bars = [[`Bình quân ${model.D3} ngày`, r.rate * 7, 'bg-slate-400']]
  if (r.r4 != null) bars.push([`${model.D4} ngày gần nhất`, r.r4 * 7, 'bg-[#1e3a5f]'])
  if (model.hasW) bars.push([`Tuần này (${model.DW} ngày, quy ra tuần)`, r.XW / model.DW * 7, 'bg-amber-600'])
  if (r.sea !== 1) bars.push(['Dùng để dự trù (× mùa vụ)', r.rd * 7, 'bg-teal-600'])
  const max = Math.max(1, ...bars.map(b => b[1]))
  return (
    <div className="flex flex-col gap-1.5" aria-label="So tốc độ bán theo tuần">
      {bars.map(([l, v, c]) => (
        <div key={l} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: '190px 1fr' }}>
          <span className="text-gray-500">{l}</span>
          <span className="flex items-center gap-1.5"><span className={`h-3.5 rounded ${c}`} style={{ width: `${Math.max(1, v / max * 85)}%` }} /><b className="tabular-nums">{fmt1(v)}</b></span>
        </div>
      ))}
    </div>
  )
}

// Khung bật lên trên bảng (bảng dài vài trăm dòng): bấm nền mờ hoặc Esc để đóng.
export function DetailPanel({ r, model, settings, onClose }) {
  const lots = r.rows.flatMap(x => x.lots.map(l => ({ ...l, ma: x.ma, kho: x.kho }))).sort((a, b) => String(a.hd).localeCompare(String(b.hd)))
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-30 bg-slate-900/35 flex items-start justify-center p-3 sm:p-6 overflow-y-auto" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <section role="dialog" aria-label="Chi tiết mã hàng" className="bg-white rounded-2xl border border-gray-200 shadow-xl p-4 flex flex-col gap-3 w-full max-w-5xl">
      <div className="flex flex-wrap items-start gap-2">
        <div><div className="text-xs text-gray-500">Chi tiết mã hàng</div>
          <h3 className="m-0 text-base font-semibold"><span className="font-mono">{r.order}</span> · {r.p0.ten}{r.codes.length > 1 && <span className="ml-2 text-xs font-normal text-slate-600">gộp {r.codes.join(', ')}</span>}</h3></div>
        <button type="button" onClick={onClose} className="sheet-tab-action ml-auto" aria-label="Đóng chi tiết"><X size={14} /> Đóng</button>
      </div>
      <div className="flex flex-wrap gap-1">{r.alerts.length ? r.alerts.map(a => <AlertTag key={a.k} a={a} />) : <span className="text-xs text-green-700">Ổn định, không có cảnh báo</span>}</div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="flex flex-col gap-3 min-w-0">
          <RateBars r={r} model={model} />
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-1.5 py-1 text-left">Mã vật tư</th><th className="px-1.5 py-1 text-left">Mã kho</th><th className="px-1.5 py-1 text-right">Tồn đầu</th><th className="px-1.5 py-1 text-right">Sl nhập</th><th className="px-1.5 py-1 text-right">Sl xuất</th><th className="px-1.5 py-1 text-right">Tồn cuối</th></tr></thead>
            <tbody>{r.rows.map(x => (
              <tr key={`${x.ma}|${x.kho}`} className="border-t border-gray-100"><td className="px-1.5 py-1 font-mono">{x.ma}</td><td className="px-1.5 py-1 font-mono">{x.kho}{settings.khoName[x.kho] ? <span className="ml-1 font-sans text-gray-500">{settings.khoName[x.kho]}</span> : null}</td>
                <td className="px-1.5 py-1 text-right tabular-nums">{fmtN(x.td)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(x.nh)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(x.x)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(x.tc)}</td></tr>
            ))}</tbody>
          </table></div>
          {r.alerts.length > 0 && <div className="flex flex-col gap-1 text-sm">{r.alerts.map(a => <div key={a.k}><b>{a.t}:</b> {a.d} <span className="text-gray-500">{a.a}</span></div>)}</div>}
        </div>
        <div className="flex flex-col gap-3 min-w-0">
          <div className="grid gap-x-3 gap-y-1 text-sm" style={{ gridTemplateColumns: '1fr auto' }} aria-label="Cách tính">
            <span className="text-gray-500">Sl xuất {model.D3} ngày (các kho đang chọn{r.codes.length > 1 ? ', đã gộp mã' : ''})</span><b className="text-right tabular-nums">{fmtN(r.X3)}</b>
            <span className="text-gray-500">÷ {model.D3} ngày = bán/ngày</span><b className="text-right tabular-nums">{fmt2(r.rate)}</b>
            {r.sea !== 1 && <><span className="text-gray-500">× hệ số mùa vụ</span><b className="text-right tabular-nums">{fmt2(r.sea)}</b></>}
            <span className="text-gray-500 border-t border-gray-100 pt-1">× {r.coverDays} ngày cần đủ hàng</span><b className="text-right tabular-nums border-t border-gray-100 pt-1">{fmtN(r.rd * r.coverDays)}</b>
            <span className="text-gray-500">− Tồn hiện có (các kho đang chọn)</span><b className="text-right tabular-nums">{fmtN(r.TON)}</b>
            <span className="border-t border-gray-100 pt-1"><b>Đề xuất</b></span><b className="text-right tabular-nums border-t border-gray-100 pt-1">{fmtN(r.de)}</b>
            <span className="text-gray-500">Cách đang làm: xuất 1 tháng {fmtN(r.month1)}{model.has4 ? '' : ' (≈ từ file 3 tháng)'} − tồn {fmtN(r.TON)}</span><span className="text-right tabular-nums text-gray-500">{fmtN(r.old)}</span>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead className="bg-gray-50 text-gray-500"><tr><th className="px-1.5 py-1 text-left">Lô</th><th className="px-1.5 py-1 text-left">Mã vật tư</th><th className="px-1.5 py-1 text-left">Kho</th><th className="px-1.5 py-1 text-left">Hạn dùng</th><th className="px-1.5 py-1 text-right">Tồn</th></tr></thead>
            <tbody>{lots.length ? lots.map((l, i) => (
              <tr key={i} className="border-t border-gray-100"><td className="px-1.5 py-1 font-mono">{l.lo}</td><td className="px-1.5 py-1 font-mono">{l.ma}</td><td className="px-1.5 py-1 font-mono">{l.kho}</td><td className="px-1.5 py-1">{fmtHd(l.hd)}</td><td className="px-1.5 py-1 text-right tabular-nums">{fmtN(l.q)}</td></tr>
            )) : <tr><td colSpan={5} className="px-1.5 py-2 text-gray-400">Hết hàng</td></tr>}</tbody>
          </table></div>
          <div className="text-xs text-gray-400">Tồn theo lô chỉ để xem; không trừ hàng theo hạn dùng.</div>
        </div>
      </div>
    </section>
    </div>
  )
}
