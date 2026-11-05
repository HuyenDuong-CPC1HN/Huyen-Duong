import { useState } from 'react'
import * as XLSX from 'xlsx'
import { Copy, Search } from 'lucide-react'
import { fmtN, isJW, normText } from '../utils/duTru'
import { parseMaGocRows } from '../utils/duTruDtp'
import { linkMaGoc, readMaGoc, readMaGocNames, writeMaGoc } from '../data/duTruStore'
import { readQuyCach } from '../data/quyCachStore'

// Bảng mã quy đổi Kho C: cùng 1 mặt hàng nhưng nhiều mã → quy mã phụ về mã gốc (mã gốc thường là mã A–Z, không
// bắt đầu J / W). Dùng chung: Kho C gộp mã khi dự trù, Kho SO gom mã trước khi so tồn sổ sách / thực tế.
// Nguồn: anh tải file (.xlsx 2 cột Mã gốc · Mã phụ), thêm tay, hoặc bấm Gộp ở gợi ý của Kho C / Kho SO.
const up = v => String(v ?? '').trim().toUpperCase()
const readSheet = async file => {
  const buf = await (file.arrayBuffer ? file.arrayBuffer() : new Promise((ok, fail) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = () => fail(fr.error); fr.readAsArrayBuffer(file) }))
  const wb = XLSX.read(buf, { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' })
}

export default function DuTruMaGoc() {
  const [map, setMap] = useState(() => readMaGoc())
  const [names] = useState(() => readQuyCach())
  const [q, setQ] = useState('')
  const [add, setAdd] = useState({ goc: '', phu: '' })
  const [msg, setMsg] = useState('')
  const save = next => setMap(writeMaGoc(next))
  const [saved] = useState(() => readMaGocNames())
  const ten = c => saved[c] || names[c]?.ten || ''

  const groups = {}
  for (const [phu, goc] of Object.entries(map)) (groups[goc] ||= []).push(phu)
  const collator = new Intl.Collator('vi', { sensitivity: 'base', numeric: true })
  const list = Object.entries(groups).map(([goc, phus]) => ({ goc, phus: phus.sort() }))
    .sort((a, b) => collator.compare(ten(a.goc) || a.goc, ten(b.goc) || b.goc) || a.goc.localeCompare(b.goc))
  const nq = normText(q)
  const shown = list.filter(g => !nq || normText(`${g.goc} ${g.phus.join(' ')} ${ten(g.goc)} ${g.phus.map(ten).join(' ')}`).includes(nq))

  const pick = async file => {
    try {
      const pairs = parseMaGocRows(await readSheet(file))
      if (!pairs.length) { setMsg(`Không thấy cặp mã nào trong ${file.name}. Cần 2 cột "Mã gốc" và "Mã phụ".`); return }
      let next = map
      for (const [phu, goc] of pairs) next = linkMaGoc(next, phu, goc)
      save(next)
      setMsg(`Đã thêm / cập nhật ${pairs.length} cặp mã từ ${file.name}.`)
    } catch (err) { setMsg(`Không đọc được ${file.name}: ${err.message}`) }
  }
  const addOne = () => {
    const goc = up(add.goc)
    const phus = add.phu.split(/[\s,;]+/).map(up).filter(Boolean)
    if (!goc || !phus.length) { setMsg('Nhập mã gốc và ít nhất 1 mã phụ.'); return }
    let next = map
    for (const p of phus) next = linkMaGoc(next, p, goc)
    save(next)
    setAdd({ goc: '', phu: '' })
    setMsg(`Đã quy ${phus.join(', ')} về ${next[phus[0]] || goc}.`)
  }
  const removePhu = phu => { const next = { ...map }; delete next[phu]; save(next) }
  const copy = () => {
    const text = [['Mã gốc', 'Tên mã gốc', 'Mã phụ', 'Tên mã phụ'].join('\t'), ...list.flatMap(g => g.phus.map(p => [g.goc, ten(g.goc), p, ten(p)].join('\t')))].join('\n')
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(() => setMsg(`Đã chép ${Object.keys(map).length} cặp mã, dán vào Excel.`), () => setMsg('Trình duyệt chặn chép tự động.'))
  }

  return (
    <section className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-col gap-3" aria-label="Bảng mã quy đổi Kho C">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-base font-semibold">Bảng mã quy đổi Kho C</h3>
        <span className="text-xs text-gray-500">{fmtN(list.length)} mặt hàng · {fmtN(Object.keys(map).length)} mã phụ</span>
      </div>
      <div className="text-xs text-gray-500">Cùng 1 mặt hàng nhưng nhiều mã: quy <b>mã phụ</b> về <b>mã gốc</b> (thường là mã A–Z, không bắt đầu J / W). Dùng chung cho <b>Kho C</b> (gộp tồn + xuất trước khi dự trù) và <b>Kho SO</b> (gom mã trước khi so tồn sổ sách / thực tế). Bấm "Gộp" ở gợi ý của Kho C / Kho SO cũng tự ghi vào đây. Mã trùng tên + ĐVT thì app tự gom, không cần nhập.</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="sheet-tab-action cursor-pointer">Tải file (.xlsx: Mã gốc · Mã phụ)
          <input type="file" accept=".xlsx,.xls" hidden aria-label="Tải file mã quy đổi" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void pick(f) }} />
        </label>
        <button type="button" className="sheet-tab-action" onClick={copy}><Copy size={13} /> Chép bảng (dán vào Excel)</button>
      </div>
      <div className="flex flex-wrap items-end gap-2 text-xs text-gray-500">
        <label className="flex flex-col gap-1">Mã gốc<input value={add.goc} onChange={e => setAdd(a => ({ ...a, goc: e.target.value }))} placeholder="VD: Z00314" aria-label="Mã gốc" className="w-32 border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" /></label>
        <label className="flex flex-col gap-1 flex-1 min-w-48">Mã phụ (nhiều mã cách nhau dấu phẩy)<input value={add.phu} onChange={e => setAdd(a => ({ ...a, phu: e.target.value }))} placeholder="VD: J00690" aria-label="Mã phụ" className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono" /></label>
        <button type="button" className="sheet-tab-action is-primary" onClick={addOne}>Thêm</button>
      </div>
      {msg && <div className="text-xs text-gray-700" role="status">{msg}</div>}
      <div className="relative w-full sm:w-80">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Tìm mã, tên hàng…" aria-label="Tìm mã quy đổi" className="w-full pl-8 pr-2 py-1.5 border border-gray-200 rounded-lg text-sm" />
      </div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm border-collapse" style={{ minWidth: 640 }}>
          <thead className="bg-gray-50 text-gray-500 text-xs"><tr><th className="px-2 py-2 text-left">Mã gốc</th><th className="px-2 py-2 text-left">Tên hàng</th><th className="px-2 py-2 text-left">Mã phụ quy về mã gốc</th></tr></thead>
          <tbody>{shown.map(g => (
            <tr key={g.goc} className="border-t border-gray-100 align-top">
              <td className="px-2 py-1.5 font-mono">{g.goc}{isJW(g.goc) && <div className="text-[11px] font-sans text-amber-700">mã gốc là J / W — kiểm tra lại</div>}</td>
              <td className="px-2 py-1.5">{ten(g.goc) || <span className="text-gray-400">—</span>}</td>
              <td className="px-2 py-1.5"><div className="flex flex-wrap gap-1.5">{g.phus.map(p => (
                <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-gray-200 bg-white text-xs" title={ten(p)}>
                  <span className="font-mono">{p}</span>
                  <button type="button" onClick={() => removePhu(p)} aria-label={`Bỏ quy đổi ${p}`} className="text-gray-400 hover:text-red-600">×</button>
                </span>
              ))}</div></td>
            </tr>
          ))}{!shown.length && <tr><td colSpan={3} className="px-3 py-4 text-gray-400">{list.length ? 'Không có mã nào khớp.' : 'Chưa có cặp mã nào. Tải file hoặc thêm tay ở trên.'}</td></tr>}</tbody>
        </table>
      </div>
    </section>
  )
}
