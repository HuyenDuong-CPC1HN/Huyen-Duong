import { buildTraHangData, buildXacMinhData } from '../utils/exportReturnReport'

// Dựng lại ĐÚNG nội dung 2 mẫu .docx (public/templates/BIEN_BAN_*.docx) bằng HTML để in trực tiếp từ trình
// duyệt (Ctrl+P / nút "In") — không cần tải file rồi mở Word. Chữ/label lấy nguyên văn từ chính file mẫu,
// chỉ khác theo entity (donC = CPC1HN, donDTP = UPHARMA), giữ nguyên số liệu qua buildTraHangData/
// buildXacMinhData (dùng chung với exportReturnReport.js) để không lệch với file .docx xuất ra.
const ENTITY_INFO = {
  donC: {
    xacMinhHeader: 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI',
    xacMinhDiaDiemPrefix: 'Tại ',
    xacMinhChucVu1: 'Giám Đốc Chi Nhánh',
    xacMinhChucVu2: 'Kế Toán Đơn Hàng',
    xacMinhFooterQuanLy: 'Xác nhận của Quản lý chi nhánh/ văn phòng',
    traHangCanCu: 'Công ty Cổ phần Dược phẩm CPC1 Hà Nôi – Chi nhánh Hà Nội',
    traHangDiaDiem: 'Công ty CP Dược phẩm CPC1 Hà Nội – Chi nhánh Thành phố Hồ Chí Minh – địa chỉ: Số 26-28 Hàn Mạc Tử, Phường Phú Thọ Hòa, Thành phố Hồ Chí Minh',
  },
  donDTP: {
    xacMinhHeader: 'CÔNG TY CỔ PHẦN UPHARMA',
    xacMinhDiaDiemPrefix: '',
    xacMinhChucVu1: 'Tổng Giám Đốc',
    xacMinhChucVu2: 'Kế Toán',
    xacMinhFooterQuanLy: 'Xác nhận của Quản lý',
    traHangCanCu: 'Công ty Cổ phần UPHARMA',
    traHangDiaDiem: 'Công ty CP UPHARMA – địa chỉ: Toà nhà Vinh Quang, Lô DX, KĐT Tây Nam hồ Linh Đàm, Phường Hoàng Liệt, Thành phố Hà Nội',
  },
}

function Cell({ children, w, b, ...rest }) {
  return <td className="rrp-td" style={{ width: w, fontWeight: b ? 600 : 400 }} {...rest}>{children ?? ''}</td>
}
function Th({ children, w, ...rest }) {
  return <th className="rrp-th" style={{ width: w }} {...rest}>{children}</th>
}

function XacMinhSheet({ record, info }) {
  const d = buildXacMinhData(record)
  return (
    <div className="rrp-sheet">
      <div className="rrp-head-row">
        <div className="rrp-head-col rrp-head-bold">{info.xacMinhHeader}</div>
        <div className="rrp-head-col" style={{ textAlign: 'center' }}>
          <div className="rrp-head-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
          <div className="rrp-underline-bold">Độc lập - Tự do - Hạnh phúc</div>
          <div>************</div>
        </div>
      </div>

      <h1 className="rrp-title">BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ</h1>

      <p>1. Căn cứ tiến hành xác minh: Hàng trả về của <b>{d.khachHangXacMinh}</b></p>
      <p>2. Thời gian: Vào lúc 08h30&rsquo;, ngày <b>{d.ngayXM}</b> tháng <b>{d.thangXM}</b> năm <b>{d.namXM}</b></p>
      <p>3. Địa điểm: {info.xacMinhDiaDiemPrefix}<b>{d.diaDiem}</b></p>
      <p>4. Thành phần:</p>
      <table className="rrp-table">
        <thead>
          <tr><Th w="8%">STT</Th><Th>Họ và tên</Th><Th w="30%">Chức vụ/Bộ phận</Th></tr>
        </thead>
        <tbody>
          <tr><Cell>1</Cell><Cell>Phương Thu</Cell><Cell>{info.xacMinhChucVu1}</Cell></tr>
          <tr><Cell>2</Cell><Cell b>{d.keToanVienXacMinh}</Cell><Cell>{info.xacMinhChucVu2}</Cell></tr>
          <tr><Cell>3</Cell><Cell>Dương Thị Ngọc Huyền</Cell><Cell>Thủ Kho</Cell></tr>
        </tbody>
      </table>

      <p>5. Xác minh tình trạng hàng hóa</p>
      <table className="rrp-table">
        <thead>
          <tr>
            <Th w="5%">STT</Th><Th>Tên hàng hoá</Th><Th w="10%">Số lô</Th><Th w="10%">Hạn dùng</Th>
            <Th w="7%">ĐVT</Th><Th w="8%">Số lượng</Th><Th w="10%">Quy cách</Th><Th w="12%">Tình trạng</Th>
          </tr>
        </thead>
        <tbody>
          {d.products.length === 0 ? (
            <tr><Cell>—</Cell><Cell /><Cell /><Cell /><Cell /><Cell /><Cell /><Cell /></tr>
          ) : d.products.map((p, i) => (
            <tr key={i}>
              <Cell>{p.stt}</Cell><Cell>{p.tenHang}</Cell><Cell b>{p.soLo}</Cell><Cell b>{p.hanDung}</Cell>
              <Cell>{p.donViTinh}</Cell><Cell>{p.soLuongXM}</Cell><Cell b>{p.quyCach}</Cell><Cell>{p.tinhTrang}</Cell>
            </tr>
          ))}
        </tbody>
      </table>

      <p>6. Kết quả xác minh: <b>{d.ketQuaXacMinh}</b></p>
      <p>Kết quả + Số phiếu KN (nếu có): {'…'.repeat(20)}</p>
      <p>Đề xuất giải quyết của Dược sĩ phụ trách chuyên môn</p>

      <table className="rrp-table">
        <thead>
          <tr><Th colSpan={2}>Xác nhận của các bộ phận</Th></tr>
          <tr><Th w="50%">Kế toán</Th><Th w="50%">Kho vận</Th></tr>
        </thead>
        <tbody>
          <tr>
            <Cell>Ý kiến: Nhập lại vào kho<br />Chữ ký: {'…'.repeat(18)}<br />Ngày: {'…'.repeat(18)}</Cell>
            <Cell>Ý kiến: Nhập lại vào kho<br />Chữ ký: {'…'.repeat(18)}<br />Ngày: {'…'.repeat(18)}</Cell>
          </tr>
        </tbody>
      </table>

      <p style={{ marginTop: 24, fontWeight: 600 }}>{info.xacMinhFooterQuanLy}</p>
    </div>
  )
}

function TraHangSheet({ record, info }) {
  const d = buildTraHangData(record)
  return (
    <div className="rrp-sheet">
      <div style={{ textAlign: 'center' }}>
        <div className="rrp-head-bold">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
        <div className="rrp-underline-bold">Độc lập – Tự do – Hạnh phúc</div>
        <div>---------***---------</div>
      </div>

      <h1 className="rrp-title">BIÊN BẢN TRẢ HÀNG</h1>
      <p style={{ textAlign: 'center', marginTop: -8 }}>(Nội bộ)</p>

      <p>- Căn cứ Nghị định 51/2010/NĐCP ngày 14/05/2010 của Chính phủ về việc in, phát hành, sử dụng, quản lý hóa đơn.</p>
      <p>- Căn cứ vào điều 18 thông tư số 64/2010/TT-BTC ngày 15/05/2013 của Bộ Tài Chính hướng dẫn thi hành số 51/2010/NĐ-CP ngày 14 tháng 05 năm 2010 của Chính phủ về hóa đơn bán hàng hóa, cung ứng dịch vụ.</p>
      <p>- Căn cứ Thông tư 32/2011/TT-BTC ngày 14/03/2011 của Bộ Tài chính Hướng dẫn về khởi tạo, phát hành và sử dụng hoá đơn điện tử bán hàng hóa, cung ứng dịch vụ.</p>
      <p>- Căn cứ vào tình trạng thực tế việc xuất hóa đơn, giao bán hàng hóa của {info.traHangCanCu}</p>

      <p>
        Hôm nay, ngày <b>{d.ngay}</b> tháng <b>{d.thang}</b> năm <b>{d.nam}</b>, tại {info.traHangDiaDiem}, chúng tôi gồm có
      </p>

      <p>Bên A: Bộ phận kế toán&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Đại diện : Bà <b>{d.daiDienKeToan}</b></p>
      <p>Chức vụ : Kế toán đơn hàng</p>
      <p>Bên B: Bộ phận Kho vận</p>
      <p>Đại diện : Bà Dương Thị Ngọc Huyền</p>
      <p>Chức vụ : Thủ Kho</p>
      <p>Bên C: Bộ phận Kinh doanh</p>
      <p>Đại diện : Ông/Bà <b>{d.daiDienKinhDoanh}</b></p>
      <p>Chức vụ : Nhân viên kinh doanh</p>

      <p>Cùng nhau thống nhất lập biên bản này để trả lại hàng trong hoá đơn GTGT đã phát hành với nội dung sau:</p>

      <table className="rrp-table rrp-table--small">
        <thead>
          <tr>
            <Th>Mẫu số</Th><Th>Ký hiệu</Th><Th>Số hóa đơn</Th><Th>Ngày lập</Th><Th>Khách hàng mua</Th>
            <Th>Địa chỉ</Th><Th>MST</Th><Th>Tên hàng hóa</Th><Th>Số lượng</Th><Th>Giá trị hóa đơn (VN đồng)</Th>
          </tr>
        </thead>
        <tbody>
          {d.invoices.length === 0 ? (
            <tr><Cell>—</Cell><Cell /><Cell /><Cell /><Cell /><Cell /><Cell /><Cell /><Cell /><Cell /></tr>
          ) : d.invoices.map((inv, i) => (
            <tr key={i}>
              <Cell>{inv.mauSo}</Cell><Cell>{inv.kyHieu}</Cell><Cell>{inv.soHoaDon}</Cell><Cell>{inv.ngayLapHD}</Cell>
              <Cell>{inv.khachHangMua}</Cell><Cell>{inv.diaChi}</Cell><Cell>{inv.mst}</Cell>
              <Cell>{inv.tenHangHoa}</Cell><Cell>{inv.soLuong}</Cell><Cell>{inv.giaTri}</Cell>
            </tr>
          ))}
        </tbody>
      </table>

      <p>Giá trị hóa đơn bằng chữ: <b>{d.giaTriBangChu}</b></p>
      <p>Lý do huỷ hoá đơn: <b>{d.lyDoTraHang}</b></p>
      <p>Chúng tôi xin cam đoan các thông tin khai ở trên là hoàn toàn chính xác. Nếu có bất kỳ sai sót nào chúng tôi xin chịu trách nhiệm trước pháp luật.</p>
      <p>Biên bản này được lập thành 02 bản, Bộ phận kế toán giữ 01 bản, bộ phận kho vận giữ 01 bản để thực hiện, cam kết không sử dụng kê khai hóa đơn đã hủy trên.</p>

      <div className="rrp-head-row" style={{ marginTop: 32 }}>
        <div className="rrp-head-col rrp-head-bold" style={{ textAlign: 'center' }}>Xác nhận của đại diện bên B</div>
        <div className="rrp-head-col rrp-head-bold" style={{ textAlign: 'center' }}>Xác nhận đại diện bên A</div>
      </div>
    </div>
  )
}

// Luôn render CẢ 2 loại biên bản (Trả hàng + Xác minh) cùng lúc, ẩn qua CSS (.rrp-print-root { display:
// none }) — printReturnReport() (utils/printReturnReport.js) quyết định đúng 1 trong 2 được hiện ra khi
// in, xem @media print trong index.css. Nhờ vậy nút "In" không phải chờ React render lại mới gọi
// window.print() được.
export default function ReturnReportPrintView({ record }) {
  if (!record) return null
  const info = ENTITY_INFO[record.entity] || ENTITY_INFO.donC
  return (
    <>
      <div className="rrp-print-root rrp-print-root--xacMinh">
        <XacMinhSheet record={record} info={info} />
      </div>
      <div className="rrp-print-root rrp-print-root--traHang">
        <TraHangSheet record={record} info={info} />
      </div>
    </>
  )
}
