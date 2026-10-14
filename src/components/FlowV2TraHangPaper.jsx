import { effectiveLyDo } from '../utils/returnSlips'

// Bản xem trước / bản in "Biên bản trả lại hàng" (mẫu nội bộ hoặc mẫu CPC1HN / UPHARMA) cho tab Hàng trả & huỷ (Demo).
// Chép nguyên khối dựng biên bản của tab Theo dõi nhập trả lại (ReturnSlipWorkspace.jsx) để không phải sửa file cũ;
// slip đúng dạng phiếu của tab cũ (xem caseReturnSlip ở utils/flowV2.js).
// ---------- Xem trước biên bản ----------
const money = n => (Number(n) || 0).toLocaleString('en-US')
function dmy(iso) { if (!iso) return [null, null, null]; const [y, m, d] = iso.split('-'); return [d, m, y] }
// Ô kho điền: tô vàng; còn trống: báo đỏ "……"
function V({ v }) {
  return v
    ? <span className="rsw-fill bg-yellow-100 border-b-2 border-yellow-500 px-0.5">{v}</span>
    : <span className="rsw-blank bg-red-50 text-red-700 px-1 rounded text-[11px] font-semibold font-sans">……</span>
}

// Lớp rsw-* là móc cho CSS in (index.css, khối "@media print" của .rsw-print-root): khi in bản dựng phải giống
// bản in gốc của website (Times New Roman 10.5pt, tràn khổ A4, ô đã điền là chữ thường không tô/gạch chân).
const paperCls = 'rsw-paper bg-[#fffdf8] text-[#16181c] shadow-md mx-auto px-8 py-7 text-[12.5px] leading-relaxed'
const paperStyle = { fontFamily: '"Times New Roman", Times, serif', minWidth: 540, maxWidth: 780 }
const td = 'border border-gray-600 px-1.5 py-0.5'

// Độ rộng cột theo bản in gốc của website (STT · Tên hàng · ĐVT · Số lượng · Số lô · Đơn giá · Thành tiền)
const ITEM_COLS = ['7%', '26%', '14%', '11%', '10%', '14%', '18%']

function ItemsTable({ slip, dvtLabel, bangChu }) {
  const { pdf, form } = slip
  return (
    <table className="rsw-table w-full border-collapse my-1.5 text-[11.5px]" style={{ tableLayout: 'fixed' }}>
      <colgroup>{ITEM_COLS.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <thead>
        <tr>{['STT', 'Tên hàng hóa, dịch vụ', dvtLabel, 'Số lượng', 'Số lô', 'Đơn giá (gồm VAT)', 'Thành tiền'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {pdf.items.map((it, i) => (
          <tr key={i}>
            <td className={`${td} text-center`}>{it.stt || i + 1}</td>
            <td className={td}>{it.ten}</td>
            <td className={`${td} text-center`}>{it.dvt}</td>
            <td className={`${td} text-center`}>{money(it.soLuong)}</td>
            <td className={`${td} text-center`}><V v={form.items?.[i]?.soLo || it.soLo} /></td>
            <td className={`${td} text-right`}>{money(it.donGia)}</td>
            <td className={`${td} text-right`}>{money(it.thanhTien)}</td>
          </tr>
        ))}
        <tr><td className={td} colSpan={6}>Tổng cộng tiền thanh toán</td><td className={`${td} text-right`}><b>{money(pdf.tongTien)} đ</b></td></tr>
        {bangChu ? <tr><td className={td} colSpan={7}><i>Số tiền bằng chữ: <b>{bangChu}</b></i></td></tr> : null}
      </tbody>
    </table>
  )
}

function Rep({ name, role }) {
  return <p className="rsw-rep"><span className="rsw-rep-name">Đại diện: {name}</span><span>Chức vụ: {role}</span></p>
}

export default function FlowV2TraHangPaper({ slip }) {
  const { pdf, form: f } = slip
  const [d, m, y] = dmy(f.ngayLap)
  const [hd, hm, hy] = dmy(f.ngayHD)
  const noiBo = pdf.mau === 'NOIBO'
  return (
    <div className={paperCls} style={paperStyle}>
      <p className="rsw-head text-center"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br /><b>Độc lập - Tự do - Hạnh phúc</b><br /><b>---oOo---</b></p>
      <p className="rsw-title rsw-head text-center text-base font-bold my-2">BIÊN BẢN TRẢ LẠI HÀNG{noiBo ? ' (NỘI BỘ)' : ''}</p>
      <p className="rsw-i10 rsw-it"><i>- Căn cứ vào Nghị định 70/2025/NĐ-CP ngày 20/03/2025 của Chính phủ quy định về hóa đơn, chứng từ</i></p>
      <p className="rsw-i10 rsw-it"><i>- Căn cứ vào thỏa thuận giữa các bên</i></p>
      <p className="rsw-gap">Hôm nay, ngày <V v={d} /> tháng <V v={m} /> năm <V v={y} /> đại diện {noiBo ? 'ba' : 'hai'} bên chúng tôi gồm có:</p>
      {noiBo ? (
        <>
          <p className="rsw-gap"><b>BÊN A: Bộ phận kế toán</b></p><p className="rsw-i12">Đại Diện: <V v={f.benA} /></p><p className="rsw-i12">Chức vụ: <V v={f.benAChucVu} /></p>
          <p className="rsw-gap"><b>BÊN B: Bộ phận Kho vận</b></p><p className="rsw-i12">Đại Diện: <V v={f.benB} /></p><p className="rsw-i12">Chức vụ: <V v={f.benBChucVu} /></p>
          <p className="rsw-gap"><b>BÊN C: Bộ phận Kinh Doanh</b></p><p className="rsw-i12">Đại Diện: {pdf.benC?.daiDien}</p><p className="rsw-i12">Chức vụ: {pdf.benC?.chucVu}</p>
          <p className="rsw-i12 rsw-gap">- Ba bên thống nhất lập biên bản trả lại hàng theo Hóa đơn số <V v={f.soHD} /> đã lập, có ký hiệu: <V v={f.kyHieu} /> ngày <V v={hd} /> tháng <V v={hm} /> năm <V v={hy} /></p>
        </>
      ) : (
        <>
          <p className="rsw-gap"><b>BÊN MUA: {pdf.benMua?.ten}</b></p>
          <p>Địa chỉ: {pdf.benMua?.diaChi}</p>
          <p>Mã số thuế: <V v={f.mst || pdf.benMua?.mst} /></p>
          <Rep name={pdf.benMua?.daiDien} role={pdf.benMua?.chucVu} />
          <p className="rsw-gap"><b>BÊN BÁN: {pdf.benBan?.ten}</b></p>
          <p>Địa chỉ: {pdf.benBan?.diaChi}</p>
          <p>Mã số thuế: {pdf.benBan?.mst}</p>
          <Rep name={pdf.benBan?.daiDien} role={pdf.benBan?.chucVu} />
          <p>- Hai bên thống nhất lập biên bản trả lại hàng theo Hóa đơn <V v={f.soHD} /></p>
          <p>đã lập, có ký hiệu: <V v={f.kyHieu} /> ngày <V v={hd} /> tháng <V v={hm} /> năm <V v={hy} /></p>
        </>
      )}
      <p className="rsw-i10 rsw-gap">1. Lý do xuất trả: {effectiveLyDo(pdf)}</p>
      <p className="rsw-i10">2. Chi tiết về hàng hóa xuất trả:</p>
      <ItemsTable slip={slip} dvtLabel={noiBo ? 'Đơn vị tính' : 'ĐVT'} bangChu={noiBo ? '' : pdf.bangChu} />
      {pdf.mau === 'CPC1HN' && <p className="rsw-i10">Trị giá hàng nhập lại trên sẽ được Công ty bù trừ công nợ, chuyển khoản hoặc trả lại tiền mặt cho bên mua.</p>}
      {!noiBo && <p className="rsw-i10">Biên bản này lập thành 02 bản, Bên A giữ 01 bản, Bên B giữ 01 bản.</p>}
      <div className="rsw-sign grid text-center font-bold mt-4 gap-2" style={{ gridTemplateColumns: `repeat(${noiBo ? 3 : 2}, 1fr)` }}>
        {noiBo
          ? [['Xác nhận của đại diện bên A', f.benA], ['Xác nhận của đại diện bên B', f.benB], ['Xác nhận của đại diện bên C', pdf.benC?.daiDien]]
            .map(([t, n]) => <div key={t}><div>{t}</div><div className="rsw-sign-gap" /><div>{n}</div></div>)
          : <><span>ĐẠI DIỆN BÊN MUA</span><span>ĐẠI DIỆN BÊN BÁN</span></>}
      </div>
    </div>
  )
}

