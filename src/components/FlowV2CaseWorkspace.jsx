import { useState } from 'react'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { KE_TOAN_LIST } from '../utils/returnSlips'
import { CASE_FLOWS, BATCH_STEPS, caseAsReturnSlip, daysSince, fmtDateTimeVi, newItem, stepOfCase } from '../utils/flowV2'
import { uploadFlowFiles, getFlowFileUrl } from '../data/flowV2Files'
import { KhoTag } from './HangHuyBadges'
import { XacMinhPaper } from './ReturnSlipWorkspace'
import PreviewPrintPanel from './PreviewPrintPanel'
import { Field } from './WorkspaceParts'
import { handCls, presetCls, grid } from './workspaceStyles'
import { ItemsEditor, KindTag, PhotoBox, StepList } from './FlowV2Parts'

const subLabel = c => (c.kind !== 'tra' ? '' : c.sub === 'tuChoi' ? 'Khách từ chối nhận — BB trả hàng nội bộ' : 'Khách đã nhận rồi trả — BB trả hàng có chữ ký khách')

// Màn làm việc của 1 hồ sơ khách trả: trái là các bước, giữa là việc của bước hiện tại, biên bản xác minh xem trước + in.
// onSave(c) lưu hồ sơ · onAdvance(opts) sang bước kế · onBackStep() lùi 1 bước · onClose() về bảng việc.
export default function FlowV2CaseWorkspace({ c, batch, onSave, onAdvance, onBackStep, onClose, onOpenBatch, onGoHuy, onDelete }) {
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const flow = CASE_FLOWS[c.kind]
  const s = stepOfCase(c)
  const set = patch => onSave({ ...c, ...patch })
  const setForm = (k, v) => set({ form: { ...c.form, [k]: v } })
  const hasItems = c.items.some(it => it.maHang || it.tenHang)

  const upload = key => async (files) => {
    setError(''); setBusy(key)
    try { set({ [key]: [...(c[key] || []), ...await uploadFlowFiles(files)] }) } catch (err) { setError(err.message || 'Không tải được ảnh / file lên.') } finally { setBusy('') }
  }
  const removeFile = key => i => set({ [key]: (c[key] || []).filter((_, idx) => idx !== i) })
  const photoProps = key => ({ files: c[key] || [], onUpload: upload(key), onRemove: removeFile(key), getUrl: getFlowFileUrl, busy: busy === key })

  const next = (label, opts = {}, disabled = false) => (
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => onAdvance(opts)} disabled={disabled} className="sheet-tab-action is-primary">{label}</button>
      {c.step > 0 && <button type="button" onClick={onBackStep} className="sheet-tab-action"><Undo2 size={13} /> Lùi 1 bước</button>}
    </div>
  )
  const showPaper = ['xmNhap', 'kyNhap', 'ktNhap', 'phieuNhap', 'doiHang'].includes(s.k) || s.col === 4

  let work
  switch (s.k) {
    case 'tiepNhan':
      work = (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-3">
            <div style={grid(200)}>
              <Field label="Khách hàng" kind="hand"><input value={c.khachHang} onChange={e => set({ khachHang: e.target.value })} className={handCls} aria-label="Khách hàng" /></Field>
              <Field label="Số đơn / số phiếu" kind="hand"><input value={c.soDon} onChange={e => set({ soDon: e.target.value })} className={handCls} aria-label="Số đơn" /></Field>
              {c.kind === 'loi' && <Field label="Lý do lỗi" kind="hand"><input value={c.loiLyDo} onChange={e => set({ loiLyDo: e.target.value, items: c.items.map(it => (!it.tinhTrang || it.tinhTrang === c.loiLyDo || it.tinhTrang === 'Hàng lỗi' ? { ...it, tinhTrang: e.target.value } : it)) })} className={handCls} placeholder="VD: Gãy, vỡ ống" aria-label="Lý do lỗi" /></Field>}
            </div>
            {(c.files || []).length > 0 && <div className="text-xs text-gray-500">File đã tải khi tạo hồ sơ: {c.files.map(f => f.name).join(', ')}</div>}
          </div>
          {c.kind === 'tra' && c.sub === 'daNhan' && (
            <PhotoBox title="BB trả hàng có chữ ký khách — không bắt buộc" hint="Bản cứng gửi về công ty. Muốn lưu bản mềm thì chụp ảnh hoặc tải file lên, không có cũng làm tiếp được." {...photoProps('photos')} />
          )}
          {c.kind === 'loi' && <PhotoBox title="Ảnh hàng lỗi — không bắt buộc" hint="Chụp hàng lỗi để lưu kèm hồ sơ." {...photoProps('photos')} />}
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
            <div className="font-semibold text-sm text-gray-800">{c.kind === 'loi' ? 'Hàng lỗi' : 'Hàng trả về'}</div>
            <ItemsEditor items={c.items} onChange={items => set({ items })}
              onAdd={() => set({ items: [...c.items, newItem({ tinhTrang: c.kind === 'tra' ? 'Hàng nguyên vẹn' : (c.loiLyDo || 'Hàng lỗi') })] })}
              onRemove={i => set({ items: c.items.length > 1 ? c.items.filter((_, idx) => idx !== i) : [newItem()] })} />
          </div>
          {!hasItems && <div className="text-xs text-amber-700">Gõ ít nhất 1 dòng hàng (mã hoặc tên) để làm biên bản.</div>}
          {next('Đã nhận hàng → Lập BB xác minh', {}, !hasItems)}
        </>
      )
      break
    case 'xmNhap':
      work = (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-3">
            <div className="font-semibold text-sm text-gray-800">BB xác minh tình trạng hàng hoá (nhập lại)</div>
            <div style={grid(160)}>
              <Field label="Ngày xác minh" kind="hand"><input type="date" value={c.form.xmNgay} onChange={e => setForm('xmNgay', e.target.value)} className={handCls} /></Field>
              <Field label="Giờ" kind="hand"><input type="time" value={c.form.xmGio} onChange={e => setForm('xmGio', e.target.value)} className={handCls} /></Field>
              <Field label="Kế toán tham gia" kind="hand">
                <select value={c.form.keToan} onChange={e => set({ form: { ...c.form, keToan: e.target.value }, keToan: e.target.value })} className={handCls} aria-label="Kế toán tham gia">{KE_TOAN_LIST.map(n => <option key={n}>{n}</option>)}</select>
              </Field>
            </div>
            <ItemsEditor items={c.items} onChange={items => set({ items })} cols={['maHang', 'tenHang', 'soLo', 'hanDung', 'soLuong', 'quyCach', 'tinhTrang']} readOnlyCols={['maHang', 'soLuong']} />
          </div>
          {next('In xong → Chờ ký')}
        </>
      )
      break
    case 'kyNhap':
      work = (
        <>
          <div className="text-sm text-gray-600">Chờ ký đủ biên bản xác minh. App nhắc nếu quá 3 ngày chưa ký.</div>
          <PhotoBox title="Biên bản đã ký — không bắt buộc" hint='Ký xong muốn lưu bản mềm thì chụp từng trang biên bản đã ký, hoặc tải file scan lên. Không có vẫn bấm "Đã ký đủ" được.' {...photoProps('signedNhap')} />
          {next(c.kind === 'tra' ? 'Đã ký đủ → chuyển kế toán' : 'Đã ký đủ → nhập lại kho')}
        </>
      )
      break
    case 'ktNhap':
      work = (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
            <div className="text-sm text-gray-700">⏳ Đang chờ kế toán <b>{c.keToan}</b> nhập trả lại (phiếu nhập + hoá đơn){daysSince(c.stepAt) ? ` — ${daysSince(c.stepAt)} ngày` : ''}. Phần này là quy trình của kế toán, kho không làm giấy tờ.</div>
            <div style={grid(220)}>
              <Field label="Kế toán phụ trách" kind="preset">
                <select value={c.keToan} onChange={e => set({ keToan: e.target.value })} className={presetCls} aria-label="Kế toán phụ trách">{KE_TOAN_LIST.map(n => <option key={n}>{n}</option>)}</select>
              </Field>
            </div>
            <div className="text-[11px] text-gray-400">Link riêng cho kế toán tự bấm "Đã xong" sẽ làm ở bước sau; tạm thời kho bấm xác nhận khi kế toán báo.</div>
          </div>
          {next('Kế toán đã xong → Hoàn thành', { ktBy: `Kho xác nhận (${c.keToan} báo)` })}
        </>
      )
      break
    case 'phieuNhap':
      work = (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
            <div className="text-sm text-gray-700">Hàng lỗi nhập lại kho bằng <b>phiếu nhập lại</b> (không có hoá đơn).</div>
            <div style={grid(220)}>
              <Field label="Số phiếu nhập lại" kind="hand"><input value={c.phieuNhapLai} onChange={e => set({ phieuNhapLai: e.target.value })} className={handCls} placeholder="VD: NL2621/00041" aria-label="Số phiếu nhập lại" /></Field>
            </div>
          </div>
          {next('Đã nhập lại → Xuất lô khác đổi khách')}
        </>
      )
      break
    case 'doiHang':
      work = (
        <>
          <div className="rounded-xl border border-gray-200 bg-white p-3 flex flex-col gap-2">
            <div className="font-semibold text-sm text-gray-800">Xuất lô khác đổi cho khách</div>
            <ItemsEditor items={c.items} onChange={items => set({ items })} cols={['maHang', 'tenHang', 'soLo', 'soLuong', 'loDoi']} readOnlyCols={['maHang', 'tenHang', 'soLo', 'soLuong']} />
            <div className="text-xs text-gray-500">Ghi lô mới đã xuất cho khách. Xong bước này, hàng lỗi tự vào <b>Huỷ hàng → Kho {c.kho} → Chờ huỷ</b>.</div>
          </div>
          {next('Đã đổi hàng → Đưa hàng lỗi vào Chờ huỷ')}
        </>
      )
      break
    case 'choHuy':
      work = (
        <>
          <div className="text-sm text-gray-700">Hàng lỗi của hồ sơ này đang ở <b>Huỷ hàng → Kho {c.kho} → Chờ huỷ</b>. Khi tạo đợt huỷ có chọn hồ sơ này, nó tự chuyển theo đợt.</div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={onGoHuy} className="sheet-tab-action is-primary">Mở khu Huỷ hàng</button><button type="button" onClick={onBackStep} className="sheet-tab-action"><Undo2 size={13} /> Lùi 1 bước</button></div>
        </>
      )
      break
    case 'dangHuy':
      work = (
        <>
          <div className="text-sm text-gray-700">Đang huỷ trong đợt <b>{batch?.no}</b>{batch ? <> — đợt đang ở bước <b>{BATCH_STEPS[batch.step].t}</b></> : ''}. Đợt huỷ xong thì hồ sơ này tự sang Hoàn thành.</div>
          {batch && <button type="button" onClick={() => onOpenBatch(batch.id)} className="sheet-tab-action is-primary self-start">Mở đợt huỷ</button>}
        </>
      )
      break
    default:
      work = (
        <>
          <div className="rounded-lg bg-green-50 text-green-800 px-3 py-2 text-sm">✓ {s.t}</div>
          {c.ktDone && <div className="text-sm text-gray-600">Kế toán: {c.ktDone.by} lúc {fmtDateTimeVi(c.ktDone.at)}</div>}
          {batch && <div className="text-sm text-gray-600">Đã huỷ trong đợt <button type="button" className="underline text-[#1e3a5f]" onClick={() => onOpenBatch(batch.id)}>{batch.no}</button>{batch.ktDone ? ` · ${batch.ktDone.by} xác nhận lúc ${fmtDateTimeVi(batch.ktDone.at)}` : ''}</div>}
          {c.kind === 'tra' && <button type="button" onClick={onBackStep} className="sheet-tab-action self-start"><Undo2 size={13} /> Lùi 1 bước</button>}
        </>
      )
  }

  const readOnlyPhotos = [['photos', c.kind === 'tra' ? 'BB trả hàng có chữ ký khách' : 'Ảnh hàng lỗi'], ['signedNhap', 'BB xác minh đã ký']]
    .filter(([k]) => (c[k] || []).length && !(s.k === 'tiepNhan' && k === 'photos') && !(s.k === 'kyNhap' && k === 'signedNhap'))

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onClose} className="sheet-tab-action"><ArrowLeft size={13} /> Bảng việc</button>
          <KindTag kind={c.kind} /><KhoTag kho={c.kho} />
          <span className="font-semibold">{c.khachHang || 'Khách hàng chưa ghi'}</span>
          {c.soDon && <span className="font-mono text-xs text-gray-500">{c.soDon}</span>}
          {c.kind === 'tra' && <span className="text-xs text-gray-500">{subLabel(c)}</span>}
          {c.step === 0 && onDelete && <button type="button" onClick={onDelete} className="sheet-tab-action ml-auto">Xoá hồ sơ</button>}
        </header>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'minmax(200px, 240px) minmax(0, 1fr)' }}>
          <div className="rounded-xl border border-gray-200 bg-white p-3"><StepList steps={flow.steps} current={c.step} /></div>
          <div className="grid gap-4 items-start min-w-0" style={{ gridTemplateColumns: showPaper ? 'repeat(auto-fit, minmax(380px, 1fr))' : '1fr' }}>
            <div className="flex flex-col gap-3 min-w-0">
              <div className="font-semibold text-gray-800">{s.t}</div>
              {work}
              {readOnlyPhotos.map(([k, label]) => <PhotoBox key={k} title={label} files={c[k]} getUrl={getFlowFileUrl} readOnly />)}
            </div>
            {showPaper && <PreviewPrintPanel docs={[{ key: 'xm', label: 'BB xác minh (nhập lại)', landscape: true, node: <XacMinhPaper slip={caseAsReturnSlip(c)} /> }]} />}
          </div>
        </div>
      </div>
    </div>
  )
}
