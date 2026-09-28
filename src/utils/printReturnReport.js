// Gọi khi bấm nút "In" — đánh dấu ĐÚNG loại biên bản cần in vào document.body (data-rrp-print) rồi mở hộp
// thoại in ngay. Đánh dấu bằng thao tác DOM trực tiếp (không qua state/re-render của React) để chắc chắn
// không bị lệch nhịp: setState rồi window.print() ngay sau đó có thể chạy trước khi React kịp render lại,
// khiến bản in vẫn còn nội dung loại biên bản trước đó. Xem ReturnReportPrintView.jsx (2 khung ẩn sẵn,
// chọn đúng khung nào hiện ra khi in qua data-rrp-print) và index.css (@media print).
export function printReturnReport(kind) {
  document.body.setAttribute('data-rrp-print', kind)
  window.print()
}
