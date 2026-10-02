import { ArrowLeft, FileDown, Pencil } from 'lucide-react'
import { LoaiTag } from './ReturnSlipBadges'
import { XacMinhPaper as NhapLaiPaper } from './ReturnSlipWorkspace'
import { XuLyPaper, XacMinhPaper as HuyXacMinhPaper } from './HangHuyPapers'
import PreviewPrintPanel from './PreviewPrintPanel'
import { Field, Step } from './WorkspaceParts'
import { handCls, presetCls, grid } from './workspaceStyles'
import { SWAP_RETURN_ACCOUNTANTS, batchLabel, formatDmy } from '../utils/swapReturnBatch'
import { huyPhieu, newBatchForm, nhapLaiSlip, swapLoai } from '../utils/swapPaperData'

const checkCls = 'w-5 h-5 accent-green-600 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 shrink-0'
const stamp = iso => { const d = new Date(iso); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}` }
const KIND = { donC: 'Đơn C', donDTP: 'Đơn DTP' }

function Tick({ label, doneLabel, checked, disabled, title, onChange }) {
  return (
    <label className={`flex items-center gap-3 rounded-lg px-4 py-3 border ${checked ? 'border-green-500 bg-green-50' : 'border-gray-200'} ${disabled ? 'opacity-60' : 'cursor-pointer'}`} title={title}>
      <input type="checkbox" className={checkCls} checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} aria-label={label} />
      <span className="text-sm font-semibold text-gray-900">{checked ? doneLabel : label}</span>
    </label>
  )
}

// Màn làm việc của 1 đợt hàng lỗi khách trả về: xem trước + in BB xác minh nhập lại kho ngay trên app; xuất Word chỉ khi cần.
export function SwapRecordWorkspace({ record, onChange, onBack, onEdit, onExport, busy }) {
  const locked = Boolean(record.huyBatchId)
  const docs = [{ key: 'nl', label: 'BB xác minh nhập lại kho', landscape: true, node: <NhapLaiPaper slip={nhapLaiSlip(record)} /> }]
  const items = record.items || []
  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onBack} className="sheet-tab-action"><ArrowLeft size={13} /> Danh sách</button>
          <span className="font-semibold">{record.customerName}</span>
          <LoaiTag loai={swapLoai(record.entity)} />
          <span className="text-xs text-gray-500">{formatDmy(record.date)}</span>
        </header>
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Step n={1} title="Hàng lỗi khách trả về">
              <ul className="text-sm flex flex-col gap-1.5">
                {items.map((it, i) => (
                  <li key={i} className="rounded border border-gray-100 px-2 py-1.5">
                    <span className="font-mono text-gray-500">{it.maHang}</span> {it.tenHang} <span className="text-gray-400">× {it.soLuong} {it.dvt}</span>
                    <div className="text-xs text-gray-500">Lô {it.loLoi || '—'} · HD {it.hanDungLoi || '—'}{it.lyDo ? ` · ${it.lyDo}` : ''}</div>
                  </li>
                ))}
              </ul>
              <div style={grid(220)}>
                <Field label="Kế toán — BB xác minh nhập lại kho" kind="preset">
                  <select value={record.accountantNhapLai || ''} onChange={e => onChange({ accountantNhapLai: e.target.value })} disabled={locked} className={presetCls}>
                    <option value="">— Chọn kế toán —</option>
                    {SWAP_RETURN_ACCOUNTANTS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={onEdit} disabled={locked} className="sheet-tab-action"><Pencil size={13} /> Sửa đợt</button>
                <button type="button" onClick={onExport} disabled={busy} className="sheet-tab-action" title="Chỉ cần xuất khi muốn lấy file Word; in thì dùng nút In bên phải">
                  <FileDown size={13} /> {busy ? 'Đang tạo file…' : 'Xuất Word (khi cần)'}
                </button>
              </div>
            </Step>
            <Step n={2} title="Trình ký và hoàn thành">
              <Tick label="Đã trình ký" doneLabel={`Đã trình ký ${record.nhapLaiSignedAt ? stamp(record.nhapLaiSignedAt) : ''}`} checked={Boolean(record.nhapLaiSignedAt)} disabled={locked}
                onChange={on => onChange({ nhapLaiSignedAt: on ? new Date().toISOString() : null, ...(on ? {} : { nhapLaiDoneAt: null }) })} />
              <Tick label="Kế toán đã nhập hàng lỗi + xuất hàng mới" doneLabel={`Hoàn thành ${record.nhapLaiDoneAt ? stamp(record.nhapLaiDoneAt) : ''}`} checked={Boolean(record.nhapLaiDoneAt)} disabled={!record.nhapLaiSignedAt || locked}
                title={record.nhapLaiSignedAt ? undefined : 'Trình ký xong rồi mới tick'} onChange={on => onChange({ nhapLaiDoneAt: on ? new Date().toISOString() : null })} />
              {locked && <span className="text-xs text-purple-700">Đợt đã gom vào bộ huỷ nên không sửa được.</span>}
            </Step>
          </div>
          <PreviewPrintPanel docs={docs} />
        </div>
      </div>
    </div>
  )
}

// Màn làm việc của 1 bộ huỷ: BB xác minh huỷ (ngang) + BB xử lý huỷ (dọc), xem trước và in trực tiếp.
export function SwapBatchWorkspace({ batch, records, onChange, onBack, onExport, busy }) {
  const form = { ...newBatchForm(), ...(batch.form || {}) }
  const phieu = huyPhieu({ ...batch, form }, records)
  const setForm = (k, v) => onChange({ form: { ...form, [k]: v } })
  const docs = [
    { key: 'xm', label: 'BB xác minh huỷ', landscape: true, node: <HuyXacMinhPaper phieu={phieu} keToan={batch.accountant} /> },
    { key: 'xl', label: 'BB xử lý huỷ', landscape: false, node: <XuLyPaper phieu={phieu} keToan={batch.accountant} /> },
  ]
  const frozen = Boolean(batch.signedAt)
  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onBack} className="sheet-tab-action"><ArrowLeft size={13} /> Danh sách</button>
          <span className="font-semibold">{batchLabel(batch.no)} huỷ</span>
          <LoaiTag loai={swapLoai(batch.entity)} />
          <span className="text-xs text-gray-500">{KIND[batch.entity]} · {phieu.items.length} mặt hàng · {records.length} đợt</span>
        </header>
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Step n={1} title="Thông tin bộ huỷ">
              <div style={grid(170)}>
                <Field label="Kế toán ký bộ huỷ" kind="preset" full>
                  <select value={batch.accountant} onChange={e => onChange({ accountant: e.target.value })} disabled={frozen} className={presetCls}>
                    {SWAP_RETURN_ACCOUNTANTS.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </Field>
                <Field label="Số biên bản xử lý (…../năm/BC-CPC1HN)" kind="hand"><input value={form.soBB} onChange={e => setForm('soBB', e.target.value)} disabled={frozen} className={handCls} /></Field>
                <Field label="Ngày lập BB xử lý" kind="hand"><input type="date" value={form.ngayLap} onChange={e => setForm('ngayLap', e.target.value)} disabled={frozen} className={handCls} /></Field>
                <Field label="Ngày xử lý" kind="hand"><input type="date" value={form.xlNgay} onChange={e => setForm('xlNgay', e.target.value)} disabled={frozen} className={handCls} /></Field>
                <Field label="Giờ xử lý" kind="hand"><input type="time" value={form.xlGio} onChange={e => setForm('xlGio', e.target.value)} disabled={frozen} className={handCls} /></Field>
                <Field label="Địa điểm xử lý" kind="preset"><input value={form.diaDiem} onChange={e => setForm('diaDiem', e.target.value)} disabled={frozen} className={presetCls} /></Field>
                <Field label="Phương pháp xử lý" kind="preset"><input value={form.phuongPhap} onChange={e => setForm('phuongPhap', e.target.value)} disabled={frozen} className={presetCls} /></Field>
                <Field label="Ngày xác minh" kind="hand"><input type="date" value={form.xmNgay} onChange={e => setForm('xmNgay', e.target.value)} disabled={frozen} className={handCls} /></Field>
                <Field label="Giờ xác minh" kind="hand"><input type="time" value={form.xmGio} onChange={e => setForm('xmGio', e.target.value)} disabled={frozen} className={handCls} /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onExport('xuatKho')} disabled={busy} className="sheet-tab-action"><FileDown size={13} /> Xuất Word xác minh (khi cần)</button>
                <button type="button" onClick={() => onExport('xuLy')} disabled={busy} className="sheet-tab-action"><FileDown size={13} /> Xuất Excel xử lý (khi cần)</button>
              </div>
            </Step>
            <Step n={2} title="Trình ký và hoàn thành">
              <Tick label="Đã trình ký" doneLabel={`Đã trình ký ${batch.signedAt ? stamp(batch.signedAt) : ''}`} checked={frozen} disabled={Boolean(batch.accountedAt)}
                onChange={on => onChange({ signedAt: on ? new Date().toISOString() : null })} />
              <Tick label="Hoàn thành" doneLabel={`Hoàn thành ${batch.accountedAt ? stamp(batch.accountedAt) : ''}`} checked={Boolean(batch.accountedAt)} disabled={!frozen}
                title={frozen ? undefined : 'Trình ký xong rồi mới tick'} onChange={on => onChange({ accountedAt: on ? new Date().toISOString() : null })} />
            </Step>
          </div>
          <PreviewPrintPanel docs={docs} />
        </div>
      </div>
    </div>
  )
}
