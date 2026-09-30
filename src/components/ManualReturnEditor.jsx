import { effectiveLyDo, recalcManualPdf, switchManualMau, TEMPLATE_LABEL } from '../utils/returnSlips'
import { Field, Step } from './WorkspaceParts'
import ReturnItemsEditor from './ReturnItemsEditor'
import { handCls, presetCls, grid, wrapStyle } from './workspaceStyles'

// Phần nhập tay của đơn không có PDF website: bên mua, bên bán, lý do và các dòng hàng. Mỗi lần sửa dựng lại
// thành tiền / tổng tiền / số tiền bằng chữ (recalcManualPdf) và giữ form.items (số lô, hạn dùng, quy cách) khớp
// số dòng hàng.
export default function ManualReturnEditor({ n, slip, onChange }) {
  const { pdf, form: f } = slip
  const noiBo = pdf.mau === 'NOIBO'

  const commit = (nextPdf, formItems = f.items) => {
    const recalced = recalcManualPdf(nextPdf)
    onChange({ ...slip, pdf: recalced, form: { ...f, items: formItems } })
  }
  const setMau = (mau) => commit(switchManualMau(pdf, mau))
  const setParty = (who, k, v) => commit({ ...pdf, [who]: { ...pdf[who], [k]: v } })

  return (
    <Step n={n} title="Thông tin đơn nhập tay">
      <span className="text-xs text-gray-400">Đơn không có file PDF từ website: anh chọn mẫu, nhập bên mua và hàng hoá, app tính thành tiền, tổng tiền và số tiền bằng chữ.</span>
      <div style={grid(190)}>
        <Field label="Mẫu biên bản trả lại hàng" kind="hand">
          <select value={pdf.mau} onChange={e => setMau(e.target.value)} className={handCls} aria-label="Mẫu biên bản">
            {['NOIBO', 'CPC1HN', 'UPHARMA'].map(m => <option key={m} value={m}>{TEMPLATE_LABEL[m]}{m === 'NOIBO' ? ' (khách chưa nhận)' : m === 'CPC1HN' ? ' (Đơn C, khách đã nhận)' : ' (Đơn DTP, khách đã nhận)'}</option>)}
          </select>
        </Field>
      </div>
      {noiBo ? (
        <div style={grid(170)}>
          <Field label="Bên C · Kinh doanh — đại diện" kind="hand"><input value={pdf.benC?.daiDien || ''} onChange={e => setParty('benC', 'daiDien', e.target.value)} className={handCls} /></Field>
          <Field label="Bên C · Chức vụ" kind="preset"><input value={pdf.benC?.chucVu || ''} onChange={e => setParty('benC', 'chucVu', e.target.value)} className={presetCls} /></Field>
        </div>
      ) : (
        <>
          <div style={grid(190)}>
            <Field label="Bên mua" kind="hand" full><input value={pdf.benMua.ten} onChange={e => setParty('benMua', 'ten', e.target.value)} className={handCls} /></Field>
            <Field label="Địa chỉ bên mua" kind="hand" full><input value={pdf.benMua.diaChi} onChange={e => setParty('benMua', 'diaChi', e.target.value)} className={handCls} /></Field>
            <Field label="Đại diện bên mua" kind="hand"><input value={pdf.benMua.daiDien} onChange={e => setParty('benMua', 'daiDien', e.target.value)} className={handCls} /></Field>
            <Field label="Chức vụ bên mua" kind="hand"><input value={pdf.benMua.chucVu} onChange={e => setParty('benMua', 'chucVu', e.target.value)} className={handCls} /></Field>
          </div>
          <div style={grid(190)}>
            <Field label="Bên bán" kind="preset" full><input value={pdf.benBan.ten} onChange={e => setParty('benBan', 'ten', e.target.value)} className={presetCls} /></Field>
            <Field label="Địa chỉ bên bán" kind="preset" full><input value={pdf.benBan.diaChi} onChange={e => setParty('benBan', 'diaChi', e.target.value)} className={presetCls} /></Field>
            <Field label="MST bên bán" kind="preset"><input value={pdf.benBan.mst} onChange={e => setParty('benBan', 'mst', e.target.value)} className={presetCls} /></Field>
            <Field label="Đại diện bên bán" kind="preset"><input value={pdf.benBan.daiDien} onChange={e => setParty('benBan', 'daiDien', e.target.value)} className={presetCls} /></Field>
            <Field label="Chức vụ bên bán" kind="preset"><input value={pdf.benBan.chucVu} onChange={e => setParty('benBan', 'chucVu', e.target.value)} className={presetCls} /></Field>
          </div>
        </>
      )}
      <Field label="Lý do xuất trả" kind={noiBo ? 'preset' : 'hand'} full><textarea rows={2} value={effectiveLyDo(pdf)} onChange={e => commit({ ...pdf, lyDo: e.target.value })} className={noiBo ? presetCls : handCls} style={wrapStyle} /></Field>
      <ReturnItemsEditor slip={slip} onChange={onChange} />
    </Step>
  )
}
