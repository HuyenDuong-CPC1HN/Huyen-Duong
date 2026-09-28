import { useRef, useState } from 'react'
import { ArrowLeft, FileUp, FileDown, Check, AlertTriangle, CheckCircle } from 'lucide-react'
import {
  KE_TOAN_LIST, TEMPLATE_LABEL, slipLoai, missingSlipFields, newSlipForm, parseReturnSlipLines, sameCustomer,
} from '../utils/returnSlips'
import { extractPdfLines } from '../utils/returnSlipPdf'
import { exportReturnSlipDocs } from '../utils/exportReturnSlip'
import { LoaiTag, StagePill } from './ReturnSlipBadges'

const inputBase = 'w-full px-2.5 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-200'
const handCls = `${inputBase} bg-yellow-50 border-yellow-400 text-gray-900`
const presetCls = `${inputBase} bg-white border-gray-200`

// kind: 'hand' = chỗ website để "……", kho điền · 'preset' = giá trị mặc định, sửa nếu cần · 'plain'
function Field({ label, kind = 'plain', full = false, children }) {
  return (
    <label className="flex flex-col gap-1" style={full ? { gridColumn: '1 / -1' } : undefined}>
      <span className="text-xs font-medium text-gray-500">
        {label}
        {kind === 'hand' && <span className="text-amber-600 font-semibold"> · điền tay</span>}
        {kind === 'preset' && <span className="text-gray-400"> · mặc định</span>}
      </span>
      {children}
    </label>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 first:border-t-0">
      <div className="flex items-center gap-2 font-semibold text-sm text-gray-800">
        <span className="w-6 h-6 rounded-md bg-[#1e3a5f] text-white text-xs grid place-items-center">{n}</span>
        {title}
      </div>
      {children}
    </div>
  )
}

const grid = cols => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${cols}px, 1fr))`, gap: 10 })

// ---------- Xem trước biên bản ----------
const money = n => (Number(n) || 0).toLocaleString('en-US')
function dmy(iso) { if (!iso) return [null, null, null]; const [y, m, d] = iso.split('-'); return [d, m, y] }
// Ô kho điền: tô vàng; còn trống: báo đỏ "……"
function V({ v }) {
  return v
    ? <span className="bg-yellow-100 border-b-2 border-yellow-500 px-0.5">{v}</span>
    : <span className="bg-red-50 text-red-700 px-1 rounded text-[11px] font-semibold font-sans">……</span>
}
// Ô mặc định: chữ thường, chỉ báo thiếu khi bị xoá trắng
function P({ v }) { return v ? <>{v}</> : <V v="" /> }

const paperCls = 'bg-[#fffdf8] text-[#16181c] shadow-md mx-auto px-8 py-7 text-[12.5px] leading-relaxed'
const paperStyle = { fontFamily: '"Times New Roman", Times, serif', minWidth: 540, maxWidth: 780 }
const td = 'border border-gray-600 px-1.5 py-0.5'

function ItemsTable({ slip, dvtLabel }) {
  const { pdf, form } = slip
  return (
    <table className="w-full border-collapse my-1.5 text-[11.5px]">
      <thead>
        <tr>{['STT', 'Tên hàng hóa, dịch vụ', dvtLabel, 'Số lượng', 'Số lô', 'Đơn giá (gồm VAT)', 'Thành tiền'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {pdf.items.map((it, i) => (
          <tr key={i}>
            <td className={`${td} text-center`}>{it.stt || i + 1}</td>
            <td className={td}>{it.ten}</td>
            <td className={`${td} text-center`}>{it.dvt}</td>
            <td className={`${td} text-right`}>{money(it.soLuong)}</td>
            <td className={`${td} text-center`}><V v={form.items?.[i]?.soLo || it.soLo} /></td>
            <td className={`${td} text-right`}>{money(it.donGia)}</td>
            <td className={`${td} text-right`}>{money(it.thanhTien)}</td>
          </tr>
        ))}
        <tr><td className={td} colSpan={6}><b>Tổng cộng tiền thanh toán</b></td><td className={`${td} text-right`}><b>{money(pdf.tongTien)} đ</b></td></tr>
      </tbody>
    </table>
  )
}

function TraHangPaper({ slip }) {
  const { pdf, form: f } = slip
  const [d, m, y] = dmy(f.ngayLap)
  const [hd, hm, hy] = dmy(f.ngayHD)
  const noiBo = pdf.mau === 'NOIBO'
  return (
    <div className={paperCls} style={paperStyle}>
      <p className="text-center"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br /><b>Độc lập - Tự do - Hạnh phúc</b><br />---oOo---</p>
      <p className="text-center text-base font-bold my-2">BIÊN BẢN TRẢ LẠI HÀNG{noiBo ? ' (NỘI BỘ)' : ''}</p>
      <p>- Căn cứ vào Nghị định 70/2025/NĐ-CP ngày 20/03/2025 của Chính phủ quy định về hóa đơn, chứng từ</p>
      <p>- Căn cứ vào thỏa thuận giữa các bên</p>
      <p>Hôm nay, ngày <V v={d} /> tháng <V v={m} /> năm <V v={y} /> đại diện {noiBo ? 'ba' : 'hai'} bên chúng tôi gồm có:</p>
      {noiBo ? (
        <>
          <p><b>BÊN A: Bộ phận kế toán</b></p><p>Đại Diện: <V v={f.benA} /></p><p>Chức vụ: <V v={f.benAChucVu} /></p>
          <p><b>BÊN B: Bộ phận Kho vận</b></p><p>Đại Diện: <V v={f.benB} /></p><p>Chức vụ: <V v={f.benBChucVu} /></p>
          <p><b>BÊN C: Bộ phận Kinh Doanh</b></p><p>Đại Diện: {pdf.benC?.daiDien}</p><p>Chức vụ: {pdf.benC?.chucVu}</p>
          <p>- Ba bên thống nhất lập biên bản trả lại hàng theo Hóa đơn số <V v={f.soHD} /> đã lập, có ký hiệu: <V v={f.kyHieu} /> ngày <V v={hd} /> tháng <V v={hm} /> năm <V v={hy} /></p>
        </>
      ) : (
        <>
          <p><b>BÊN MUA: {pdf.benMua?.ten}</b></p>
          <p>Địa chỉ: {pdf.benMua?.diaChi}</p>
          <p>Mã số thuế: <V v={f.mst || pdf.benMua?.mst} /></p>
          <p>Đại diện: {pdf.benMua?.daiDien} &nbsp;&nbsp; Chức vụ: {pdf.benMua?.chucVu}</p>
          <p><b>BÊN BÁN: {pdf.benBan?.ten}</b></p>
          <p>Địa chỉ: {pdf.benBan?.diaChi}</p>
          <p>Mã số thuế: {pdf.benBan?.mst}</p>
          <p>Đại diện: {pdf.benBan?.daiDien} &nbsp;&nbsp; Chức vụ: {pdf.benBan?.chucVu}</p>
          <p>- Hai bên thống nhất lập biên bản trả lại hàng theo Hóa đơn <V v={f.soHD} /></p>
          <p>đã lập, có ký hiệu: <V v={f.kyHieu} /> ngày <V v={hd} /> tháng <V v={hm} /> năm <V v={hy} /></p>
        </>
      )}
      <p><b>1. Lý do xuất trả:</b> {pdf.lyDo}</p>
      <p><b>2. Chi tiết về hàng hóa xuất trả:</b></p>
      <ItemsTable slip={slip} dvtLabel={noiBo ? 'Đơn vị tính' : 'ĐVT'} />
      {!noiBo && <p>Số tiền bằng chữ: <i>{pdf.bangChu}</i></p>}
      {pdf.mau === 'CPC1HN' && <p>Trị giá hàng nhập lại trên sẽ được Công ty bù trừ công nợ, chuyển khoản hoặc trả lại tiền mặt cho bên mua.</p>}
      {!noiBo && <p>Biên bản này lập thành 02 bản, Bên A giữ 01 bản, Bên B giữ 01 bản.</p>}
      <div className="grid text-center font-bold mt-4 gap-2" style={{ gridTemplateColumns: `repeat(${noiBo ? 3 : 2}, 1fr)` }}>
        {noiBo
          ? [['Xác nhận của đại diện bên A', f.benA], ['Xác nhận của đại diện bên B', f.benB], ['Xác nhận của đại diện bên C', pdf.benC?.daiDien]]
            .map(([t, n]) => <span key={t}>{t}<br /><br /><br />{n}</span>)
          : <><span>ĐẠI DIỆN BÊN MUA</span><span>ĐẠI DIỆN BÊN BÁN</span></>}
      </div>
    </div>
  )
}

function XacMinhPaper({ slip }) {
  const { pdf, form: f } = slip
  const isC = slipLoai(slip) === 'C'
  const [d, m, y] = dmy(f.xmNgay)
  const gio = f.xmGio ? `${f.xmGio.replace(':', 'h')}’` : ''
  return (
    <div className={paperCls} style={paperStyle}>
      <div className="grid gap-2 text-center" style={{ gridTemplateColumns: '45% 1fr' }}>
        <b>{isC ? 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI' : 'CÔNG TY CỔ PHẦN UPHARMA'}</b>
        <span><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br /><b>Độc lập - Tự do - Hạnh phúc</b><br />************</span>
      </div>
      <p className="text-center text-base font-bold my-2">BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ</p>
      <p>1. Căn cứ tiến hành xác minh: Hàng trả về của <V v={slip.khachHang || pdf.benMua?.ten} /></p>
      <p>2. Thời gian: Vào lúc <V v={gio} />, ngày <V v={d} /> tháng <V v={m} /> năm <V v={y} /></p>
      <p>3. Địa điểm: {isC ? 'Tại ' : ''}<P v={f.xmDiaDiem} /></p>
      <p>4. Thành phần:</p>
      <table className="w-full border-collapse my-1.5 text-[11.5px]">
        <thead><tr>{['STT', 'Họ và tên', 'Chức vụ/Bộ phận'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr></thead>
        <tbody>
          <tr><td className={`${td} text-center`}>1</td><td className={td}>Phương Thu</td><td className={td}>{isC ? 'Giám Đốc Chi Nhánh' : 'Tổng Giám Đốc'}</td></tr>
          <tr><td className={`${td} text-center`}>2</td><td className={td}><V v={f.xmKeToan} /></td><td className={td}>{isC ? 'Kế Toán Đơn Hàng' : 'Kế Toán'}</td></tr>
          <tr><td className={`${td} text-center`}>3</td><td className={td}>Dương Thị Ngọc Huyền</td><td className={td}>Thủ Kho</td></tr>
        </tbody>
      </table>
      <p>5. Xác minh tình trạng hàng hóa</p>
      <table className="w-full border-collapse my-1.5 text-[11.5px]">
        <thead><tr>{['STT', 'Tên hàng hoá', 'Số lô', 'Hạn dùng', 'ĐVT', 'Số lượng', 'Quy cách', 'Tình trạng'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr></thead>
        <tbody>
          {pdf.items.map((it, i) => {
            const extra = f.items?.[i] || {}
            const [hd, hm, hy] = dmy(extra.hanDung)
            return (
              <tr key={i}>
                <td className={`${td} text-center`}>{i + 1}</td>
                <td className={td}>{it.ten}</td>
                <td className={`${td} text-center`}><V v={extra.soLo || it.soLo} /></td>
                <td className={`${td} text-center`}><V v={extra.hanDung ? `${hd}/${hm}/${hy}` : ''} /></td>
                <td className={`${td} text-center`}>{it.dvt}</td>
                <td className={`${td} text-right`}>{money(it.soLuong)}</td>
                <td className={td}><V v={extra.quyCach} /></td>
                <td className={td}><P v={f.xmTinhTrang} /></td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p>6. Kết quả xác minh: <P v={f.xmKetQua} /></p>
      <p>Kết quả + Số phiếu KN (nếu có): ……………………………………</p>
    </div>
  )
}

// ---------- Màn làm bộ biên bản ----------
export default function ReturnSlipWorkspace({ slip, onChange, onBack }) {
  const inputRef = useRef()
  const [doc, setDoc] = useState('traHang')
  const [reading, setReading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const f = slip.form || newSlipForm(slip.pdf?.items?.length || 0)
  const pdf = slip.pdf

  const setInfo = (k, v) => onChange({ ...slip, [k]: v })
  const setForm = (k, v) => onChange({ ...slip, form: { ...f, [k]: v } })
  const setItem = (i, k, v) => {
    const items = [...(f.items || [])]
    items[i] = { ...(items[i] || { soLo: '', hanDung: '', quyCach: '' }), [k]: v }
    onChange({ ...slip, form: { ...f, items } })
  }

  const readFile = async (file) => {
    if (!file) return
    setError('')
    setReading(true)
    try {
      const parsed = parseReturnSlipLines(await extractPdfLines(await file.arrayBuffer()))
      const items = parsed.items.map((it, i) => ({ soLo: it.soLo || f.items?.[i]?.soLo || '', hanDung: f.items?.[i]?.hanDung || '', quyCach: f.items?.[i]?.quyCach || '' }))
      onChange({
        ...slip,
        khachHang: slip.khachHang || parsed.benMua?.ten || '',
        nhanVien: slip.nhanVien || parsed.benC?.daiDien || '',
        stage: slip.stage === 'todo' || slip.stage === 'wait' ? 'doing' : slip.stage,
        approvedAt: slip.approvedAt || new Date().toISOString(),
        pdf: { ...parsed, fileName: file.name },
        form: { ...f, items, mst: f.mst || parsed.benMua?.mst || '' },
      })
    } catch (err) {
      setError(err.message || 'Không đọc được file PDF.')
    } finally {
      setReading(false)
    }
  }

  const exportDocs = async () => {
    setError('')
    setExporting(true)
    try {
      await exportReturnSlipDocs(slip)
      if (slip.stage !== 'done') onChange({ ...slip, stage: 'exported', exportedAt: new Date().toISOString() })
    } catch (err) {
      setError(err.message || 'Xuất file thất bại.')
    } finally {
      setExporting(false)
    }
  }

  const mismatch = pdf && pdf.mau !== 'NOIBO' && !sameCustomer(slip.khachHang, pdf.benMua?.ten)
  const missing = pdf ? missingSlipFields({ ...slip, form: f }) : []

  return (
    <div className="sheet-tab">
      <div className="sheet-tab-shell flex flex-col gap-3">
        <header className="sheet-tab-context flex-wrap gap-2">
          <button type="button" onClick={onBack} className="sheet-tab-action"><ArrowLeft size={13} /> Danh sách phiếu</button>
          <span className="font-mono text-xs">{slip.maPhieu}</span>
          <StagePill stage={slip.stage} />
          <LoaiTag loai={slipLoai(slip)} />
        </header>
        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="grid gap-4 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          <div className="rounded-xl border border-gray-200 bg-white">
            <Step n={1} title="Thông tin phiếu & file biên bản từ website">
              <div style={grid(170)}>
                <Field label="Mã phiếu"><input value={slip.maPhieu || ''} onChange={e => setInfo('maPhieu', e.target.value)} className={presetCls} /></Field>
                <Field label="Đơn hàng"><input value={slip.donHang || ''} onChange={e => setInfo('donHang', e.target.value)} className={presetCls} /></Field>
                <Field label="Khách hàng"><input value={slip.khachHang || ''} onChange={e => setInfo('khachHang', e.target.value)} className={presetCls} /></Field>
                <Field label="Nhân viên"><input value={slip.nhanVien || ''} onChange={e => setInfo('nhanVien', e.target.value)} className={presetCls} /></Field>
              </div>
              <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
                <span className="text-xs text-gray-500">
                  Trên website bấm nút in ở phiếu đã duyệt, chọn <b>Mẫu CPC1HN</b>, <b>Mẫu UPHARMA</b> hoặc <b>Mẫu nội bộ</b>, lưu PDF rồi tải lên đây. App tự nhận biết trường hợp theo mẫu.
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => inputRef.current.click()} disabled={reading} className="sheet-tab-action is-primary">
                    <FileUp size={13} /> {reading ? 'Đang đọc file…' : pdf ? 'Tải lại file khác' : 'Tải file PDF biên bản'}
                  </button>
                  <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={e => { void readFile(e.target.files[0]); e.target.value = '' }} />
                  {pdf?.fileName && <span className="text-xs text-gray-500">📄 {pdf.fileName}</span>}
                </div>
              </div>
              {pdf && (
                <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${mismatch ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'}`}>
                  {mismatch ? <AlertTriangle size={16} className="shrink-0 mt-0.5" /> : <CheckCircle size={16} className="shrink-0 mt-0.5" />}
                  <span>
                    {mismatch
                      ? <>Khách hàng trong file (<b>{pdf.benMua?.ten}</b>) khác phiếu đang chọn. Kiểm tra lại đúng file của phiếu này.</>
                      : <><b>{TEMPLATE_LABEL[pdf.mau]}</b> → {pdf.mau === 'NOIBO' ? <>khách <b>chưa nhận</b> hàng</> : <>khách <b>đã nhận</b> hàng · <b>{pdf.mau === 'CPC1HN' ? 'Đơn C' : 'Đơn DTP'}</b></>} · {pdf.items.length} mặt hàng · {money(pdf.tongTien)} đ</>}
                  </span>
                </div>
              )}
            </Step>

            {pdf && (
              <>
                <Step n={2} title="Điền phần website để trống">
                  <span className="text-xs text-gray-400">Các ô vàng là chỗ trên file website đang để "……". Điền 1 lần, app điền vào cả 2 biên bản.</span>
                  <div style={grid(170)}>
                    <Field label="Ngày lập biên bản" kind="hand"><input type="date" value={f.ngayLap} onChange={e => setForm('ngayLap', e.target.value)} className={handCls} /></Field>
                    {pdf.mau !== 'NOIBO' && <Field label="Mã số thuế bên mua" kind="hand"><input value={f.mst} onChange={e => setForm('mst', e.target.value)} className={handCls} /></Field>}
                    <Field label="Hoá đơn số" kind="hand"><input value={f.soHD} onChange={e => setForm('soHD', e.target.value)} className={handCls} /></Field>
                    <Field label="Ký hiệu hoá đơn" kind="hand"><input value={f.kyHieu} onChange={e => setForm('kyHieu', e.target.value)} className={handCls} /></Field>
                    <Field label="Ngày hoá đơn" kind="hand"><input type="date" value={f.ngayHD} onChange={e => setForm('ngayHD', e.target.value)} className={handCls} /></Field>
                  </div>
                  {pdf.mau === 'NOIBO' && (
                    <div style={grid(170)}>
                      <Field label="Bên A · Kế toán — đại diện" kind="hand">
                        <select value={f.benA} onChange={e => setForm('benA', e.target.value)} className={handCls}>{KE_TOAN_LIST.map(n => <option key={n}>{n}</option>)}</select>
                      </Field>
                      <Field label="Bên A · Chức vụ" kind="hand"><input value={f.benAChucVu} onChange={e => setForm('benAChucVu', e.target.value)} className={handCls} /></Field>
                      <Field label="Bên B · Kho vận — đại diện" kind="preset"><input value={f.benB} onChange={e => setForm('benB', e.target.value)} className={presetCls} /></Field>
                      <Field label="Bên B · Chức vụ" kind="preset"><input value={f.benBChucVu} onChange={e => setForm('benBChucVu', e.target.value)} className={presetCls} /></Field>
                    </div>
                  )}
                  <div style={{ overflowX: 'auto' }}>
                    <table className="w-full text-xs">
                      <thead><tr className="text-gray-500">{['Hàng hoá', 'SL', 'Số lô', 'Hạn dùng', 'Quy cách'].map(h => <th key={h} className="px-1.5 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                      <tbody>
                        {pdf.items.map((it, i) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-1.5 py-1.5">{it.ten}</td>
                            <td className="px-1.5 py-1.5 whitespace-nowrap">{money(it.soLuong)} {it.dvt}</td>
                            <td className="px-1.5 py-1.5"><input value={f.items?.[i]?.soLo || ''} onChange={e => setItem(i, 'soLo', e.target.value)} className={handCls} aria-label={`Số lô ${it.ten}`} /></td>
                            <td className="px-1.5 py-1.5"><input type="date" value={f.items?.[i]?.hanDung || ''} onChange={e => setItem(i, 'hanDung', e.target.value)} className={handCls} aria-label={`Hạn dùng ${it.ten}`} /></td>
                            <td className="px-1.5 py-1.5"><input value={f.items?.[i]?.quyCach || ''} onChange={e => setItem(i, 'quyCach', e.target.value)} className={handCls} placeholder="VD: Hộp 20 gói" aria-label={`Quy cách ${it.ten}`} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <span className="text-xs text-gray-400">Số lô vào cả biên bản trả hàng và biên bản xác minh. Hạn dùng, quy cách chỉ vào biên bản xác minh.</span>
                </Step>

                <Step n={3} title="Biên bản xác minh tình trạng hàng hoá">
                  <div style={grid(170)}>
                    {pdf.mau === 'NOIBO' && (
                      <Field label="Mẫu xác minh (tuỳ đơn)" kind="hand">
                        <select value={f.xmMau} onChange={e => setForm('xmMau', e.target.value)} className={handCls}>
                          <option value="C">C — CPC1HN (Đơn C)</option>
                          <option value="U">U — UPHARMA (Đơn DTP)</option>
                        </select>
                      </Field>
                    )}
                    <Field label="Ngày xác minh" kind="hand"><input type="date" value={f.xmNgay} onChange={e => setForm('xmNgay', e.target.value)} className={handCls} /></Field>
                    <Field label="Giờ" kind="hand"><input type="time" value={f.xmGio} onChange={e => setForm('xmGio', e.target.value)} className={handCls} /></Field>
                    <Field label="Kế toán xác minh" kind="hand">
                      <select value={f.xmKeToan} onChange={e => setForm('xmKeToan', e.target.value)} className={handCls}>{KE_TOAN_LIST.map(n => <option key={n}>{n}</option>)}</select>
                    </Field>
                    <Field label="Địa điểm" kind="preset"><input value={f.xmDiaDiem} onChange={e => setForm('xmDiaDiem', e.target.value)} className={presetCls} /></Field>
                    <Field label="Tình trạng hàng" kind="preset"><input value={f.xmTinhTrang} onChange={e => setForm('xmTinhTrang', e.target.value)} className={presetCls} /></Field>
                    <Field label="Kết quả xác minh" kind="preset" full><input value={f.xmKetQua} onChange={e => setForm('xmKetQua', e.target.value)} className={presetCls} /></Field>
                  </div>
                </Step>

                <Step n={4} title="Xuất bộ file Word">
                  {missing.length > 0
                    ? <div className="rounded-lg bg-amber-50 text-amber-800 px-3 py-2 text-sm">Còn thiếu: {missing.join(', ')}. Vẫn xuất được, chỗ thiếu giữ "……" để anh sửa trong Word.</div>
                    : <div className="rounded-lg bg-green-50 text-green-800 px-3 py-2 text-sm">Đã điền đủ các chỗ trống.</div>}
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => void exportDocs()} disabled={exporting} className="sheet-tab-action is-primary">
                      <FileDown size={13} /> {exporting ? 'Đang tạo file…' : `Xuất ${pdf.mau === 'NOIBO' ? 'BB trả hàng nội bộ' : 'BB trả lại hàng'} + BB xác minh (Word)`}
                    </button>
                    <button type="button" onClick={() => onChange({ ...slip, stage: 'done', doneAt: new Date().toISOString() })}
                      disabled={!(slip.stage === 'exported' || slip.stage === 'done')} className="sheet-tab-action">
                      <Check size={13} /> Đã ký đủ, nhập kho
                    </button>
                  </div>
                </Step>
              </>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white sticky top-3">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-gray-100">
              <span className="font-semibold text-sm text-gray-800">Xem trước</span>
              {[['traHang', 'Biên bản trả lại hàng'], ['xacMinh', 'Biên bản xác minh']].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setDoc(k)} aria-pressed={doc === k}
                  className={`px-2.5 py-1 rounded-md text-xs border ${doc === k ? 'border-[#1e3a5f] text-[#1e3a5f] font-semibold' : 'border-gray-200 text-gray-500'}`}>{label}</button>
              ))}
              <span className="w-full text-[11px] text-gray-400">
                <span className="bg-yellow-100 border-b-2 border-yellow-500 px-1">vàng</span> kho điền trên app ·{' '}
                <span className="bg-red-50 text-red-700 px-1">đỏ</span> còn thiếu · chữ thường lấy từ file website hoặc giá trị mặc định
              </span>
            </div>
            <div className="bg-gray-100 p-4 rounded-b-xl" style={{ overflowX: 'auto' }}>
              {pdf
                ? (doc === 'traHang' ? <TraHangPaper slip={{ ...slip, form: f }} /> : <XacMinhPaper slip={{ ...slip, form: f }} />)
                : <p className="text-center text-sm text-gray-400 py-10">Tải file biên bản từ website ở bước 1 để xem trước.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
