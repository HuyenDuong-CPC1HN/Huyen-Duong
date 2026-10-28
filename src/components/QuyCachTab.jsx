import { useState } from 'react'
import { Copy, Search } from 'lucide-react'
import { fmtN, normText, parseNxtXml } from '../utils/duTru'
import { readDuTruSettings } from '../data/duTruStore'
import { addQuyCachProducts, readQuyCach, writeQuyCach } from '../data/quyCachStore'

// Tab "Quy cách hàng hoá": nhập số lượng (theo ĐVT) trong 1 kiện cho từng mã. Danh sách mã lấy từ file nhập – xuất – tồn
// (các kho đang tính ở Dự trù hàng); tab Dự trù hàng dùng số này để gợi ý đặt tròn kiện.
const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })
const FILTERS = [['all', 'Tất cả'], ['todo', 'Chưa nhập'], ['done', 'Đã nhập']]
const readText = file => (file.text ? file.text() : new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsText(file) }))
const parseNum = s => { const n = Number(String(s).trim().replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null }
const now = () => new Date().toISOString()

function KienInput({ ma, value, onCommit }) {
  const [draft, setDraft] = useState(null)
  const commit = () => {
    if (draft === null) return
    const t = draft.trim()
    if (!t) onCommit(null)
    else { const n = parseNum(t); if (n) onCommit(n) }
    setDraft(null)
  }
  return (
    <input value={draft ?? (value ? String(value) : '')} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      inputMode="decimal" placeholder="—" aria-label={`Số lượng 1 kiện ${ma}`} className="w-24 border border-gray-200 rounded px-1.5 py-1 text-right tabular-nums text-sm" />
  )
}

export default function QuyCachTab() {
  const [all, setAll] = useState(() => readQuyCach())
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [msg, setMsg] = useState('')
  const [paste, setPaste] = useState(null)
  const [add, setAdd] = useState({ ma: '', ten: '', dvt: '', kien: '' })

  const save = next => { setAll(next); writeQuyCach(next) }
  const patch = (ma, p) => save({ ...all, [ma]: { ...all[ma], ...p, at: now() } })
  const list = Object.entries(all).map(([ma, v]) => ({ ma, ...v })).sort((a, b) => collator.compare(a.ten, b.ten) || a.ma.localeCompare(b.ma))
  const nq = normText(q)
  const shown = list.filter(r => (filter === 'all' || (filter === 'done') === !!r.kien) && (!nq || normText(`${r.ma} ${r.ten}`).includes(nq)))
  const nDone = list.filter(r => r.kien).length

  const pick = async file => {
    setMsg(`Đang đọc ${file.name}…`)
    try {
      const f = parseNxtXml(await readText(file))
      const kho = new Set(readDuTruSettings('C').kho)
      const seen = new Map()
      for (const d of f.data) if (kho.has(d.kho) && !seen.has(d.ma)) seen.set(d.ma, { ma: d.ma, ten: d.ten, dvt: d.dvt })
      const { all: next, added } = addQuyCachProducts([...seen.values()], all)
      setAll(next)
      setMsg(`Đã đọc ${file.name}: ${fmtN(seen.size)} mã ở các kho đang dự trù, thêm ${fmtN(added)} mã mới. Số đã nhập giữ nguyên.`)
    } catch (err) { setMsg(`Không đọc được ${file.name}: ${err.message}`) }
  }

  // Dán từ Excel: mỗi dòng "Mã <tab> Số lượng 1 kiện [<tab> Ghi chú]"
  const applyPaste = () => {
    const next = { ...all }
    let ok = 0
    const bad = []
    for (const line of String(paste || '').split(/\r?\n/)) {
      const cells = line.split('\t').map(s => s.trim())
      if (!cells[0]) continue
      const ma = cells[0].toUpperCase()
      const n = parseNum(cells[1] ?? '')
      if (!next[ma] || !n) { bad.push(cells[0]); continue }
      next[ma] = { ...next[ma], kien: n, ...(cells[2] ? { note: cells[2] } : {}), at: now() }
      ok++
    }
    save(next)
    setPaste(null)
    setMsg(`Đã cập nhật ${ok} mã.${bad.length ? ` Bỏ qua ${bad.length} dòng (không có mã trong danh sách hoặc số không hợp lệ): ${bad.slice(0, 8).join(', ')}${bad.length > 8 ? '…' : ''}` : ''}`)
  }

  const addOne = () => {
    const ma = add.ma.trim().toUpperCase()
    if (!ma || !add.ten.trim() || !add.dvt.trim()) { setMsg('Nhập đủ mã, tên hàng và ĐVT.'); return }
    if (all[ma]) { setMsg(`Mã ${ma} đã có trong danh sách.`); return }
    save({ ...all, [ma]: { ten: add.ten.trim(), dvt: add.dvt.trim(), kien: parseNum(add.kien), note: '', at: now() } })
    setAdd({ ma: '', ten: '', dvt: '', kien: '' })
    setMsg(`Đã thêm mã ${ma}.`)
  }
  const remove = ma => { if (!window.confirm(`Xoá mã ${ma} khỏi danh sách quy cách?`)) return; const next = { ...all }; delete next[ma]; save(next) }
  const copy = () => {
    const text = [['Mã vật tư', 'Tên hàng', 'ĐVT', 'Số lượng 1 kiện', 'Ghi chú'].join('\t'), ...shown.map(r => [r.ma, r.ten, r.dvt, r.kien || '', r.note || ''].join('\t'))].join('\n')
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => setMsg(`Đã chép ${shown.length} dòng, dán vào Excel.`), () => setPaste(text))
    else setPaste(text)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2.5" aria-label="Lấy danh sách hàng">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-base font-semibold">Quy cách 1 kiện</h3>
          <span className="text-xs text-gray-500">Đã nhập <b>{fmtN(nDone)}</b>/{fmtN(list.length)} mã</span>
        </div>
        <div className="text-xs text-gray-500">Nhập <b>số lượng theo ĐVT trong 1 kiện</b> (VD: 1 kiện = 200 hộp). Danh sách mã lấy từ file <b>"Báo cáo tổng hợp nhập xuất tồn theo kho"</b> — các kho đang tính ở tab Dự trù hàng; tải file ở tab Dự trù hàng cũng tự thêm mã mới vào đây. Mã mới thêm vào, số đã nhập giữ nguyên. Tab Dự trù hàng dùng số này để gợi ý đặt <b>tròn kiện</b>.</div>
        <div className="flex flex-wrap gap-1.5">
          <label className="sheet-tab-action cursor-pointer">Tải file để lấy danh sách hàng
            <input type="file" accept=".xml,.xls" hidden aria-label="Tải file lấy danh sách hàng" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) pick(f) }} />
          </label>
          <button type="button" className="sheet-tab-action" onClick={() => setPaste(paste === null ? '' : null)}>Dán từ Excel</button>
          <button type="button" className="sheet-tab-action" onClick={copy}><Copy size={13} /> Chép bảng (dán vào Excel)</button>
        </div>
        {paste !== null && (
          <div className="flex flex-col gap-1.5">
            <div className="text-xs text-gray-500">Dán 2 – 3 cột từ Excel: <b>Mã vật tư · Số lượng 1 kiện · Ghi chú (tuỳ chọn)</b>, mỗi mã 1 dòng.</div>
            <textarea value={paste} onChange={e => setPaste(e.target.value)} aria-label="Nội dung dán từ Excel" className="w-full min-h-32 border border-gray-200 rounded-lg p-2 font-mono text-xs" />
            <div className="flex gap-1.5"><button type="button" className="sheet-tab-action is-primary" onClick={applyPaste}>Cập nhật</button><button type="button" className="sheet-tab-action" onClick={() => setPaste(null)}>Đóng</button></div>
          </div>
        )}
        {msg && <div className="text-xs text-gray-700" role="status">{msg}</div>}
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-2" aria-label="Danh sách quy cách">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-80">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã, tên hàng…" aria-label="Tìm mã, tên hàng" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
          </div>
          <div className="flex gap-1" role="group" aria-label="Lọc">
            {FILTERS.map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={`sheet-tab-action ${filter === k ? 'is-primary' : ''}`}>
                {l} ({fmtN(k === 'all' ? list.length : k === 'done' ? nDone : list.length - nDone)})
              </button>
            ))}
          </div>
        </div>
        {!list.length ? (
          <div className="text-sm text-gray-500 py-4 text-center">Chưa có mã nào. Bấm <b>Tải file để lấy danh sách hàng</b> (hoặc tải file ở tab Dự trù hàng).</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-xl">
            <table className="w-full text-sm border-collapse" style={{ minWidth: 760 }}>
              <thead className="bg-gray-50 text-gray-500 text-xs"><tr>
                <th className="px-2 py-2 text-left">Mã vật tư</th><th className="px-2 py-2 text-left">Tên hàng</th><th className="px-2 py-2 text-left">ĐVT</th>
                <th className="px-2 py-2 text-right">Số lượng 1 kiện</th><th className="px-2 py-2 text-left">Ghi chú</th><th className="px-2 py-2 text-left">Sửa lúc</th><th className="px-2 py-2" />
              </tr></thead>
              <tbody>{shown.map(r => (
                <tr key={r.ma} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 font-mono">{r.ma}</td><td className="px-2 py-1.5">{r.ten}</td><td className="px-2 py-1.5">{r.dvt}</td>
                  <td className="px-2 py-1.5 text-right whitespace-nowrap"><KienInput ma={r.ma} value={r.kien} onCommit={v => patch(r.ma, { kien: v })} /> <span className="text-xs text-gray-500">{r.dvt}/kiện</span></td>
                  <td className="px-2 py-1.5"><input defaultValue={r.note || ''} key={r.note || ''} onBlur={e => { if (e.target.value.trim() !== (r.note || '')) patch(r.ma, { note: e.target.value.trim() }) }}
                    placeholder="VD: thùng 40 hộp x 5" aria-label={`Ghi chú ${r.ma}`} className="w-full min-w-40 border border-gray-200 rounded px-2 py-1 text-sm" /></td>
                  <td className="px-2 py-1.5 text-xs text-gray-500 whitespace-nowrap">{r.at ? new Date(r.at).toLocaleDateString('vi-VN') : ''}</td>
                  <td className="px-2 py-1.5"><button type="button" onClick={() => remove(r.ma)} className="text-xs text-gray-400 hover:text-red-600" aria-label={`Xoá ${r.ma}`}>Xoá</button></td>
                </tr>
              ))}{!shown.length && <tr><td colSpan={7} className="px-3 py-4 text-gray-400">Không có mã nào khớp.</td></tr>}</tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2 text-xs text-gray-500 pt-1">
          <span className="w-full">Thêm hàng chưa có trong file:</span>
          <input value={add.ma} onChange={e => setAdd(a => ({ ...a, ma: e.target.value }))} placeholder="Mã vật tư" aria-label="Mã mới" className="w-28 border border-gray-200 rounded px-2 py-1 text-sm font-mono" />
          <input value={add.ten} onChange={e => setAdd(a => ({ ...a, ten: e.target.value }))} placeholder="Tên hàng" aria-label="Tên hàng mới" className="flex-1 min-w-48 border border-gray-200 rounded px-2 py-1 text-sm" />
          <input value={add.dvt} onChange={e => setAdd(a => ({ ...a, dvt: e.target.value }))} placeholder="ĐVT" aria-label="ĐVT mới" className="w-20 border border-gray-200 rounded px-2 py-1 text-sm" />
          <input value={add.kien} onChange={e => setAdd(a => ({ ...a, kien: e.target.value }))} placeholder="SL 1 kiện" aria-label="Số lượng 1 kiện mới" className="w-24 border border-gray-200 rounded px-2 py-1 text-sm text-right" />
          <button type="button" className="sheet-tab-action" onClick={addOne}>Thêm</button>
        </div>
        <div className="text-[11px] text-gray-400">Số lẻ dùng dấu phẩy (VD: 0,5); dấu chấm là phân cách hàng nghìn (1.000 = một nghìn).</div>
      </section>
    </div>
  )
}
