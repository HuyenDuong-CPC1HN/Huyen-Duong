import { useState } from 'react'
import { ArrowLeft, FileDown, Undo2 } from 'lucide-react'
import { KE_TOAN_LIST } from '../utils/returnSlips'
import { BATCH_STEPS, batchAsHuyPhieu, daysSince, fmtDateTimeVi, fmtDateVi } from '../utils/flowV2'
import { exportHangHuyPhieu } from '../utils/exportDamagedGoods'
import { uploadFlowFiles, getFlowFileUrl } from '../data/flowV2Files'
import { KhoTag } from './HangHuyBadges'
import { XuLyPaper, XacMinhPaper } from './HangHuyPapers'
import PreviewPrintPanel from './PreviewPrintPanel'
import { Field } from './WorkspaceParts'
import { handCls, presetCls, grid } from './workspaceStyles'
import { ItemsEditor, KindTag, PhotoBox, StepList } from './FlowV2Parts'

// Màn làm việc của 1 đợt huỷ: gồm các mục đã gom (hàng lỗi khách trả + hàng phát sinh), điền 1 lần cho cả BB xác
// minh huỷ + BB xử lý (dùng đúng mẫu biên bản của tab Theo dõi hàng huỷ), xem trước + in, xuất file khi cần.
export default function FlowV2BatchWorkspace({ b, onSave, onAdvance, onBackStep, onDissolve, onClose, onOpenCase }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const s = BATCH_STEPS[b.step]
  const set = patch => onSave({ ...b, ...patch })
  const setForm = (k, v) => set({ form: { ...b.form, [k]: v }, ...(k === 'keToan' ? { keToan: v } : {}) })
  const phieu = batchAsHuyPhieu(b)

  const exportFiles = async () => {
    setError(''); setBusy('export')
    try { await exportHangHuyPhieu(phieu) } catch (err) { setError(err.message || 'Xuất file thất bại.') } finally { setBusy('') }
  }
  const upload = async (files) => {
    setError(''); setBusy('signed')
    try { set({ signedHuy: [...(b.signedHuy || []), ...await uploadFlowFiles(files)] }) } catch (err) { setError(err.message || 'Không tải được ảnh / file lên.') } finally { setBusy('') }
  }
  const back = b.step > 0 && <button type="button" onClick={onBackStep} className="sheet-tab-action"><Undo2 size={13} /> Lùi 1 bước</button>

  const entries = (
    <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-1.5">
      <div className="font-semibold text-sm text-gray-800">Gồm {b.entries.length} mục</div>
      {b.entries.map(e => (
        <div key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
          <KindTag kind={e.src === 'loi' ? 'loi' : 'ps'} /><b>{e.who}</b>
          <span className="text-xs text-gray-400">{e.items.length} dòng · vào {fmtDateVi(e.addedAt)}</span>
          {e.caseId && <button type="button" className="text-xs underline text-[#1e3a5f]" onClick={() => onOpenCase(e.caseId)}>mở hồ sơ</button>}
          {e.pxk && <span className="text-xs text-gray-500">PXK: {e.pxk.name}</span>}
        </div>
      ))}
    </div>
  )

  let work
  if (s.k === 'bb') {
    work = (
      <>
        {entries}
        <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-3">
          <div className="font-semibold text-sm text-gray-800">Điền 1 lần — dùng cho cả 2 biên bản</div>
          <div style={grid(160)}>
            <Field label="Số biên bản" kind="preset"><input value={b.form.soBB} onChange={e => setForm('soBB', e.target.value)} className={presetCls} aria-label="Số biên bản" /></Field>
            <Field label="Ngày lập BB xử lý" kind="hand"><input type="date" value={b.form.ngayLap} onChange={e => setForm('ngayLap', e.target.value)} className={handCls} /></Field>
            <Field label="Ngày xử lý" kind="hand"><input type="date" value={b.form.xlNgay} onChange={e => setForm('xlNgay', e.target.value)} className={handCls} /></Field>
            <Field label="Giờ xử lý" kind="hand"><input type="time" value={b.form.xlGio} onChange={e => setForm('xlGio', e.target.value)} className={handCls} /></Field>
            <Field label="Ngày xác minh" kind="hand"><input type="date" value={b.form.xmNgay} onChange={e => setForm('xmNgay', e.target.value)} className={handCls} /></Field>
            <Field label="Giờ xác minh" kind="hand"><input type="time" value={b.form.xmGio} onChange={e => setForm('xmGio', e.target.value)} className={handCls} /></Field>
            <Field label="Kế toán tham gia" kind="hand"><select value={b.form.keToan} onChange={e => setForm('keToan', e.target.value)} className={handCls} aria-label="Kế toán tham gia">{KE_TOAN_LIST.map(n => <option key={n}>{n}</option>)}</select></Field>
            <Field label="Kho xuất" kind="preset"><input value={b.khoXuat} onChange={e => set({ khoXuat: e.target.value })} className={presetCls} aria-label="Kho xuất" /></Field>
          </div>
          <ItemsEditor items={b.items} onChange={items => set({ items })} cols={['maHang', 'tenHang', 'soLo', 'hanDung', 'soLuong', 'quyCach', 'tinhTrang']} readOnlyCols={['maHang', 'soLuong']} />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onAdvance()} className="sheet-tab-action is-primary">In xong → Chờ ký</button>
          <button type="button" onClick={() => void exportFiles()} disabled={busy === 'export'} className="sheet-tab-action"><FileDown size={13} /> {busy === 'export' ? 'Đang tạo file…' : 'Xuất Excel + Word (khi cần)'}</button>
          <button type="button" onClick={onDissolve} className="sheet-tab-action">Huỷ đợt (trả các mục về Chờ huỷ)</button>
        </div>
      </>
    )
  } else if (s.k === 'ky') {
    work = (
      <>
        {entries}
        <PhotoBox title="Biên bản huỷ đã ký — không bắt buộc" hint='Ký xong muốn lưu bản mềm thì chụp từng trang, hoặc tải file scan lên. Không có vẫn bấm "Đã ký đủ" được.'
          files={b.signedHuy || []} onUpload={upload} onRemove={i => set({ signedHuy: b.signedHuy.filter((_, idx) => idx !== i) })} getUrl={getFlowFileUrl} busy={busy === 'signed'} />
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onAdvance()} className="sheet-tab-action is-primary">Đã ký đủ → kế toán xuất huỷ</button>{back}</div>
      </>
    )
  } else if (s.k === 'kt') {
    work = (
      <>
        {entries}
        <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
          <div className="text-sm text-gray-700">⏳ Đang chờ kế toán <b>{b.keToan}</b> xuất huỷ khỏi phần mềm{daysSince(b.stepAt) ? ` — ${daysSince(b.stepAt)} ngày` : ''}.</div>
          <div style={grid(220)}>
            <Field label="Kế toán phụ trách" kind="preset"><select value={b.keToan} onChange={e => set({ keToan: e.target.value })} className={presetCls} aria-label="Kế toán phụ trách">{KE_TOAN_LIST.map(n => <option key={n}>{n}</option>)}</select></Field>
          </div>
          <div className="text-[11px] text-gray-400">Link riêng cho kế toán tự bấm "Đã xong" sẽ làm ở bước sau; tạm thời kho bấm xác nhận khi kế toán báo.</div>
        </div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => onAdvance({ ktBy: `Kho xác nhận (${b.keToan} báo)` })} className="sheet-tab-action is-primary">Kế toán đã xong → Huỷ xong</button>{back}</div>
      </>
    )
  } else {
    work = (
      <>
        <div className="rounded-lg bg-green-50 text-green-800 px-3 py-2 text-sm">✓ Huỷ xong{b.ktDone ? ` — ${b.ktDone.by} lúc ${fmtDateTimeVi(b.ktDone.at)}` : ''}</div>
        {entries}
        {(b.signedHuy || []).length > 0 && <PhotoBox title="Biên bản huỷ đã ký" files={b.signedHuy} getUrl={getFlowFileUrl} readOnly />}
        <div className="flex flex-wrap gap-2">{back}</div>
      </>
    )
  }

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onClose} className="sheet-tab-action"><ArrowLeft size={13} /> Huỷ hàng</button>
          <KindTag kind="batch" /><KhoTag kho={b.kho} /><span className="font-mono font-semibold">{b.no}</span>
          <span className="text-xs text-gray-500">tạo {fmtDateVi(b.createdAt)} · {b.items.length} dòng hàng</span>
        </header>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)' }}>
          <div className="rounded-xl border border-gray-200 bg-white p-3"><StepList steps={BATCH_STEPS} current={b.step} title="Đợt huỷ" /></div>
          <div className="grid gap-4 items-start min-w-0" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
            <div className="flex flex-col gap-3 min-w-0"><div className="font-semibold text-gray-800">{s.t}</div>{work}</div>
            <PreviewPrintPanel docs={[
              { key: 'xm', label: 'BB xác minh huỷ', landscape: true, node: <XacMinhPaper phieu={phieu} keToan={b.form.keToan} /> },
              { key: 'xl', label: 'BB xử lý', landscape: false, node: <XuLyPaper phieu={phieu} keToan={b.form.keToan} /> },
            ]} />
          </div>
        </div>
      </div>
    </div>
  )
}
