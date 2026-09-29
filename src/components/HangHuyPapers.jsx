import { huyDateVi, huyDmy, huyGioVi } from '../utils/hangHuy'

// Bản xem trước / bản in 2 biên bản hàng huỷ, dựng đúng nội dung file mẫu (Excel xử lý, Word xác minh) của từng kho.
// Lớp rsw-* là móc cho CSS in (index.css, khối "@media print" của .rsw-print-root).

// Ô kho điền: tô vàng; còn trống: báo đỏ "……" (khi in: chữ thường / dấu chấm như file gốc)
function V({ v }) {
  return v !== null && v !== undefined && v !== ''
    ? <span className="rsw-fill bg-yellow-100 border-b-2 border-yellow-500 px-0.5">{v}</span>
    : <span className="rsw-blank bg-red-50 text-red-700 px-1 rounded text-[11px] font-semibold font-sans">……</span>
}
// Chữ lấy từ phiếu / mặc định: chữ thường, chỉ báo thiếu khi bị xoá trắng
function P({ v }) { return v ? <>{v}</> : <V v="" /> }

const paperCls = 'rsw-paper bg-[#fffdf8] text-[#16181c] shadow-md mx-auto px-8 py-7 text-[12.5px] leading-relaxed'
const paperStyle = { fontFamily: '"Times New Roman", Times, serif', minWidth: 540, maxWidth: 780 }
const td = 'border border-gray-600 px-1.5 py-0.5'

export function XuLyPaper({ phieu }) {
  const f = phieu.form || {}
  const isC = phieu.kho === 'C'
  const [d, m, y] = huyDmy(f.ngayLap)
  const [qd, qm, qy] = huyDmy(f.ngayQD)
  const [xd, xm, xy] = huyDmy(f.xlNgay)
  const items = phieu.items || []
  const cols = ['5%', '9%', '20%', '9%', '9%', '8%', '6%', '8%', '8%', '9%', '9%']
  return (
    <div className={`${paperCls} rsw-xl-doc`} style={{ ...paperStyle, minWidth: 600 }}>
      <div className="grid grid-cols-2 gap-2 text-center font-bold rsw-head">
        <span>{isC ? <>CÔNG TY CỔ PHẦN DƯỢC PHẨM<br />CPC1 HÀ NỘI</> : 'CÔNG TY CỔ PHẦN UPHARMA'}</span>
        <span>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM<br />Độc lập - Tự do - Hạnh phúc<br />---------o0o----------</span>
      </div>
      <div className="flex flex-wrap justify-between gap-2 mt-1">
        <span>Số: <V v={f.soBB} />/{y || '2026'}/BC-CPC1HN</span>
        <i>TP.Hồ Chí Minh, Ngày <V v={d} /> tháng <V v={m} /> năm <V v={y} /></i>
      </div>
      <p className="rsw-title text-center text-base font-bold my-2">BIÊN BẢN XỬ LÝ SẢN PHẨM</p>
      <p>- Căn cứ : Quyết định số : <V v={f.soQD} />, ngày <V v={qd} /> tháng <V v={qm} /> năm <V v={qy} /> của Giám đốc Công ty về việc hủy sản phẩm</p>
      <p className="rsw-gap"><b>1. Thành phần:</b></p>
      <table className="rsw-table w-full border-collapse my-1.5 text-[11.5px]">
        <thead><tr>{['TT', 'Họ và tên', 'Chức vụ', 'Phòng/ Bộ phận'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr></thead>
        <tbody>
          <tr><td className={`${td} text-center`}>1</td><td className={td}>Phương Thu</td><td className={td}>{isC ? 'Giám Đốc Chi Nhánh' : 'Tổng Giám Đốc'}</td><td className={td}>{isC ? 'Giám Đốc Chi Nhánh' : 'Tổng Giám Đốc'}</td></tr>
          <tr><td className={`${td} text-center`}>2</td><td className={td}>Dương Thị Ngọc Huyền</td><td className={td}>Thủ kho</td><td className={td}>{isC ? 'Kho CN Hồ Chí Minh' : 'Kho Vận'}</td></tr>
          <tr><td className={`${td} text-center`}>3</td><td className={td}>Lưu Thị Thùy</td><td className={td}>Kế toán đơn hàng</td><td className={td}>Kế toán</td></tr>
        </tbody>
      </table>
      <p>2. Thời gian xử lý: Vào lúc <V v={huyGioVi(f.xlGio)} />, ngày <V v={xd} /> tháng <V v={xm} /> năm <V v={xy} /></p>
      <p>3. Địa điểm xử lý: <P v={f.diaDiem} /></p>
      <p>4. Sản phẩm xử lý: Đã chứng kiến và tiến hành hủy các sản phẩm sau :</p>
      <table className="rsw-table w-full border-collapse my-1.5 text-[10.5px]" style={{ tableLayout: 'fixed' }}>
        <colgroup>{cols.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
        <thead>
          <tr>
            {['STT', 'Mã sản phẩm', 'Tên sp, nồng độ hàm lượng', 'Số lô', 'Hạn dùng', 'Kho', 'Đơn vị tính'].map(h => <th key={h} className={`${td} font-bold`} rowSpan={2}>{h}</th>)}
            <th className={`${td} font-bold`} colSpan={2}>Số lượng</th>
            <th className={`${td} font-bold`} rowSpan={2}>Quy cách</th>
            <th className={`${td} font-bold`} rowSpan={2}>Ghi chú</th>
          </tr>
          <tr><th className={`${td} font-bold`}>Theo chứng từ</th><th className={`${td} font-bold`}>Thực hủy</th></tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className={`${td} text-center`}>{i + 1}</td>
              <td className={`${td} text-center`}>{it.maHang}</td>
              <td className={td}>{it.tenHang}</td>
              <td className={`${td} text-center`}>{it.soLo}</td>
              <td className={`${td} text-center`}>{huyDateVi(it.hanDung)}</td>
              <td className={`${td} text-center`}>{phieu.khoXuat}</td>
              <td className={`${td} text-center`}>{it.dvt}</td>
              <td className={`${td} text-center`}>{it.soLuong ?? ''}</td>
              <td className={`${td} text-center`}><V v={it.thucHuy} /></td>
              <td className={`${td} text-center`}><V v={it.quyCach} /></td>
              <td className={td}><V v={it.tinhTrang} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>5. Phương pháp xử lý: - <P v={f.phuongPhap} /></p>
      <p>6. Biên bản này được lập thành 02 bản. Các bộ phận có liên quan, mỗi bên giữ 01 bản</p>
      <p>7. Các thành phần tham gia hủy (Ký và ghi rõ họ tên)</p>
      <div className="rsw-sign grid grid-cols-3 text-center font-bold mt-3 gap-2">
        <div>Thủ Kho<div className="rsw-sign-gap" /></div><div>Kế Toán Đơn Hàng</div><div>Giám đốc chi nhánh</div>
      </div>
    </div>
  )
}

export function XacMinhPaper({ phieu }) {
  const f = phieu.form || {}
  const isC = phieu.kho === 'C'
  const [d, m, y] = huyDmy(f.xmNgay)
  const items = phieu.items || []
  return (
    <div className={`${paperCls} rsw-xm-doc`} style={paperStyle}>
      <div className="rsw-xm-head grid items-center gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="flex items-center gap-2">
          <img src={isC ? '/templates/logo_cpc1hn.png' : '/templates/logo_upharma.png'} alt={isC ? 'Logo CPC1HN' : 'Logo UPHARMA'} className="rsw-logo shrink-0" style={{ width: isC ? 50 : 54, height: 'auto' }} />
          <b className="text-left">{isC ? 'CÔNG TY CỔ PHẦN DƯỢC PHẨM CPC1 HÀ NỘI' : 'CÔNG TY CỔ PHẦN UPHARMA'}</b>
        </div>
        <span className="text-center"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br /><b>Độc lập - Tự do - Hạnh phúc</b><br />************</span>
      </div>
      <p className="rsw-title text-center text-base font-bold my-2">BIÊN BẢN XÁC MINH TÌNH TRẠNG HÀNG HOÁ</p>
      <p>1. Căn cứ tiến hành xác minh: Hàng lỗi</p>
      <p>2. Thời gian: Vào lúc <V v={huyGioVi(f.xmGio)} />, ngày <V v={d} /> tháng <V v={m} /> năm <V v={y} /></p>
      <p>3. Địa điểm: {isC ? 'Tại CN.Hồ Chí Minh' : ''}</p>
      <p>4. Thành phần:</p>
      <table className="rsw-table w-full border-collapse my-1.5 text-[11.5px]" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '8%' }} /><col style={{ width: '46%' }} /><col style={{ width: '46%' }} /></colgroup>
        <thead><tr>{['STT', 'Họ và tên', 'Chức vụ/Bộ phận'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr></thead>
        <tbody>
          <tr><td className={`${td} text-center`}>1</td><td className={td}>Phương Thu</td><td className={td}>Giám Đốc Chi Nhánh</td></tr>
          <tr><td className={`${td} text-center`}>2</td><td className={td}>Lưu Thị Thuỳ</td><td className={td}>Kế Toán Đơn Hàng</td></tr>
          <tr><td className={`${td} text-center`}>3</td><td className={td}>Dương Thị Ngọc Huyền</td><td className={td}>Thủ Kho</td></tr>
        </tbody>
      </table>
      <p>5. Xác minh tình trạng hàng hóa</p>
      <table className="rsw-table w-full border-collapse my-1.5 text-[11.5px]">
        <thead><tr>{['STT', 'Mã sản phẩm', 'Tên hàng hoá (dạng bào chế, nồng độ- hàm lượng)', 'Số lô', 'Hạn dùng', 'Kho', 'Đơn vị tính', 'Số lượng', 'Quy cách', 'Tình trạng'].map(h => <th key={h} className={`${td} font-bold`}>{h}</th>)}</tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className={`${td} text-center`}>{i + 1}</td>
              <td className={`${td} text-center`}>{it.maHang}</td>
              <td className={td}>{it.tenHang}</td>
              <td className={`${td} text-center`}>{it.soLo}</td>
              <td className={`${td} text-center`}>{huyDateVi(it.hanDung)}</td>
              <td className={`${td} text-center`}>{phieu.khoXuat}</td>
              <td className={`${td} text-center`}>{it.dvt}</td>
              <td className={`${td} text-center`}><V v={it.thucHuy} /></td>
              <td className={`${td} text-center`}><V v={it.quyCach} /></td>
              <td className={`${td} text-center`}><V v={it.tinhTrang} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>6. Kết quả xác minh: Kiểm tra hàng đúng lô, đúng hạn dùng, đúng số lượng.</p>
      <p>Kết quả + Số phiếu KN (nếu có): ……………………………………</p>
      <table className="rsw-table rsw-xm-sign w-full border-collapse my-1.5 text-[11.5px]" style={{ tableLayout: 'fixed' }}>
        <colgroup><col style={{ width: '37%' }} /><col style={{ width: '32%' }} /><col style={{ width: '31%' }} /></colgroup>
        <thead>
          <tr>
            <th className={`${td} font-bold`} rowSpan={2}>Đề xuất giải quyết của Dược sĩ phụ trách chuyên môn</th>
            <th className={`${td} font-bold`} colSpan={2}>Xác nhận của các bộ phận</th>
          </tr>
          <tr><th className={`${td} font-bold`}>Kế toán</th><th className={`${td} font-bold`}>Kho vận</th></tr>
        </thead>
        <tbody>
          <tr>
            {[0, 1, 2].map(i => (
              <td key={i} className={`${td} text-left align-top`}>
                <div>Ý kiến: Xuất xử lý</div><div>Chữ ký:</div><div className="rsw-sign-gap" /><div>Ngày: ……………………</div>
              </td>
            ))}
          </tr>
          <tr className="rsw-mgr-row">
            <td className={`${td} text-center align-top`}><b>Xác nhận của Quản lý chi nhánh/ văn phòng</b></td>
            <td className={td} colSpan={2} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
