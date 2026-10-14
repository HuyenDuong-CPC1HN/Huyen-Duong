import { useEffect, useState } from 'react'
import { Camera, Check, FileUp, Loader2, Trash2 } from 'lucide-react'
import { fmtDateVi, parseDateText } from '../utils/flowV2'
import { handCls, wrapStyle } from './workspaceStyles'

// Các mảnh giao diện dùng chung của tab "Hàng trả & huỷ (Demo)".

export function StepList({ steps, current, title }) {
  return (
    <div className="flex flex-col">
      {title && <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-1">{title}</div>}
      {steps.map((st, i) => (
        <div key={st.k}>
          {st.phase && <div className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mt-3 mb-1">{st.phase}</div>}
          <div className="flex gap-2 py-1.5 text-sm">
            <span className={`w-6 h-6 shrink-0 rounded-full grid place-items-center text-[11px] font-bold border-2 ${i < current ? 'bg-green-600 border-green-600 text-white' : i === current ? 'border-[#1e3a5f] text-[#1e3a5f]' : 'border-gray-300 text-gray-400'}`}>
              {i < current ? <Check size={12} /> : i + 1}
            </span>
            <span className={`${i === current ? 'font-semibold text-gray-900' : st.kt ? 'text-gray-400' : 'text-gray-700'}`}>
              {st.t}
              {st.who && <span className="block text-[11px] font-normal text-gray-400">{st.who}</span>}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}

// Ô ngày dạng chữ dd/mm/yyyy — gõ hoặc dán được; đọc được ngày hợp lệ mới lưu (ISO), sai thì viền đỏ.
export function DateTextInput({ value, onChange, className = handCls, ...rest }) {
  const [text, setText] = useState(() => fmtDateVi(value))
  const [last, setLast] = useState(value)
  if (value !== last) {
    setLast(value)
    if (parseDateText(text) !== value) setText(fmtDateVi(value))
  }
  const invalid = text.trim() !== '' && !parseDateText(text)
  return (
    <input
      {...rest}
      value={text}
      placeholder="dd/mm/yyyy"
      onChange={e => {
        const t = e.target.value
        setText(t)
        if (t.trim() === '') onChange('')
        else { const iso = parseDateText(t); if (iso) onChange(iso) }
      }}
      onBlur={() => { const iso = parseDateText(text); if (iso) setText(fmtDateVi(iso)) }}
      className={invalid ? `${className} !border-red-400 !bg-red-50` : className}
    />
  )
}

// Ảnh / file đính kèm (BB trả hàng có chữ ký khách, biên bản đã ký…): nút Chụp ảnh mở thẳng camera sau trên điện
// thoại (capture="environment"), nút Tải file cho ảnh / PDF có sẵn. files: [{ name, storagePath, type }].
// onUpload(fileList) → Promise; onRemove(index). getUrl(path) → Promise<url> để xem ảnh.
export function PhotoBox({ title, hint, files = [], onUpload, onRemove, getUrl, busy = false, readOnly = false }) {
  const [urls, setUrls] = useState({})
  useEffect(() => {
    let alive = true
    for (const f of files) {
      if (!f.storagePath || urls[f.storagePath] || !(f.type || '').startsWith('image/') || !getUrl) continue
      getUrl(f.storagePath).then(u => { if (alive) setUrls(prev => ({ ...prev, [f.storagePath]: u })) }).catch(() => {})
    }
    return () => { alive = false }
  }, [files, getUrl, urls])
  const open = async (f) => {
    if (!f.storagePath || !getUrl) return
    try { window.open(urls[f.storagePath] || await getUrl(f.storagePath), '_blank', 'noopener') } catch { /* bỏ qua */ }
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
      <div className="font-semibold text-sm text-gray-800">{title}</div>
      {hint && <div className="text-xs text-gray-500">{hint}</div>}
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <label className={`sheet-tab-action is-primary cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
            {busy ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Chụp ảnh
            <input type="file" accept="image/*" capture="environment" multiple hidden aria-label={`Chụp ảnh — ${title}`}
              onChange={e => { const l = [...e.target.files]; e.target.value = ''; if (l.length) void onUpload(l) }} />
          </label>
          <label className={`sheet-tab-action cursor-pointer ${busy ? 'opacity-60 pointer-events-none' : ''}`}>
            <FileUp size={13} /> Tải file (ảnh / PDF)
            <input type="file" accept="image/*,.pdf" multiple hidden aria-label={`Tải file — ${title}`}
              onChange={e => { const l = [...e.target.files]; e.target.value = ''; if (l.length) void onUpload(l) }} />
          </label>
        </div>
      )}
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={`${f.storagePath || f.name}-${i}`} className="relative">
              {urls[f.storagePath]
                ? <button type="button" onClick={() => open(f)} title={f.name}><img src={urls[f.storagePath]} alt={f.name} className="h-20 rounded-lg border border-gray-200 object-cover" /></button>
                : <button type="button" onClick={() => open(f)} className="px-2.5 py-2 rounded-lg border border-green-200 bg-green-50 text-xs text-green-800 max-w-56 truncate" title={f.name}>✓ {f.name}</button>}
              {!readOnly && onRemove && (
                <button type="button" onClick={() => onRemove(i)} className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-gray-300 text-gray-500 hover:text-red-600 grid place-items-center" aria-label={`Bỏ ${f.name}`}>
                  <Trash2 size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : readOnly ? <div className="text-xs text-gray-400">Chưa có.</div> : null}
      {!readOnly && <div className="text-[11px] text-gray-400">Mở app trên điện thoại: bấm "Chụp ảnh" là bật camera sau, chụp được nhiều tấm (mỗi trang 1 tấm). Trên máy tính nút này mở chọn file.</div>}
    </div>
  )
}

export function KindTag({ kind }) {
  const m = {
    tra: ['Trả nguyên vẹn', 'bg-green-50 text-green-700'],
    loi: ['Trả lỗi · đổi hàng', 'bg-orange-50 text-orange-700'],
    ps: ['Phát sinh trong kho', 'bg-purple-50 text-purple-700'],
    batch: ['Đợt huỷ', 'bg-orange-50 text-orange-700'],
  }[kind]
  return <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap ${m[1]}`}>{m[0]}</span>
}

export function Dots({ total, current, color }) {
  return (
    <div className="flex gap-0.5 mt-1.5" style={{ color }}>
      {Array.from({ length: total }, (_, i) => <i key={i} className="h-1 flex-1 rounded" style={{ background: i <= current ? 'currentColor' : '#e3e7ee' }} />)}
    </div>
  )
}

// Bảng dòng hàng sửa trực tiếp. cols: các cột hiện ra (mặc định đủ thông tin hàng). rowId cố định làm key → gõ
// liên tục không mất con trỏ.
const COL_DEF = {
  maHang: ['Mã hàng', 84], tenHang: ['Tên hàng', 180], soLo: ['Số lô', 90], hanDung: ['Hạn dùng', 100],
  soLuong: ['SL', 64], dvt: ['ĐVT', 60], donGia: ['Đơn giá (gồm VAT)', 110], quyCach: ['Quy cách', 110], tinhTrang: ['Tình trạng', 130], loDoi: ['Lô xuất đổi', 100],
}
export function ItemsEditor({ items, onChange, cols = ['maHang', 'tenHang', 'soLo', 'hanDung', 'soLuong', 'dvt'], onAdd, onRemove, readOnlyCols = [] }) {
  const setCell = (i, k, v) => onChange(items.map((it, idx) => (idx === i ? { ...it, [k]: k === 'soLuong' || k === 'donGia' ? (v === '' ? null : Number(v)) : v } : it)))
  return (
    <div className="flex flex-col gap-2">
      <div style={{ overflowX: 'auto' }}>
        <table className="w-full text-xs">
          <thead><tr className="text-gray-500">{cols.map(k => <th key={k} className="px-1 py-1.5 text-left font-semibold whitespace-nowrap">{COL_DEF[k][0]}</th>)}{onRemove && <th />}</tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={it.rowId || i} className="border-t border-gray-100 align-top">
                {cols.map(k => (
                  <td key={k} className="px-1 py-1" style={{ minWidth: COL_DEF[k][1] }}>
                    {readOnlyCols.includes(k)
                      ? <span className="block py-1.5">{k === 'hanDung' ? fmtDateVi(it[k]) : (it[k] ?? '')}</span>
                      : k === 'hanDung'
                        ? <DateTextInput value={it.hanDung} onChange={v => setCell(i, 'hanDung', v)} aria-label={`Hạn dùng dòng ${i + 1}`} />
                        : k === 'tenHang'
                          ? <textarea rows={2} value={it.tenHang ?? ''} onChange={e => setCell(i, k, e.target.value)} className={handCls} style={wrapStyle} aria-label={`${COL_DEF[k][0]} dòng ${i + 1}`} />
                          : <input value={it[k] ?? ''} type={k === 'soLuong' || k === 'donGia' ? 'number' : 'text'} min={k === 'soLuong' || k === 'donGia' ? 0 : undefined}
                              onChange={e => setCell(i, k, e.target.value)} className={handCls} aria-label={`${COL_DEF[k][0]} dòng ${i + 1}`} />}
                  </td>
                ))}
                {onRemove && (
                  <td className="px-1 py-1">
                    <button type="button" onClick={() => onRemove(i)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500" aria-label={`Xoá dòng ${i + 1}`}><Trash2 size={13} /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onAdd && <button type="button" onClick={onAdd} className="sheet-tab-action self-start">+ Thêm dòng</button>}
    </div>
  )
}
