import { XacMinhPaper } from './ReturnSlipWorkspace'
import FlowV2TraHangPaper from './FlowV2TraHangPaper'
import { XacMinhPaper as HuyXacMinhPaper, XuLyPaper } from './HangHuyPapers'
import PreviewPrintPanel from './PreviewPrintPanel'

// Biên bản kho đã lập trong app cho 1 việc của kế toán (trang #ketoan=…), cùng mẫu / cùng nút In với màn của kho.
// Tách file riêng để trang kế toán chỉ tải phần biên bản khi bấm "Xem biên bản".
export default function KeToanPapers({ it }) {
  const p = it.papers || {}
  const docs = it.kind === 'batch'
    ? (p.huy ? [
        { key: 'xm', label: 'BB xác minh huỷ', landscape: true, node: <div className="flowv2-paper"><HuyXacMinhPaper phieu={p.huy} keToan={p.keToan} /></div> },
        { key: 'xl', label: 'BB xử lý', landscape: false, node: <XuLyPaper phieu={p.huy} keToan={p.keToan} /> },
      ] : [])
    : [
        ...(p.th ? [{ key: 'th', label: p.th.pdf?.mau === 'NOIBO' ? 'BB trả hàng nội bộ' : 'BB trả lại hàng', landscape: false, node: <FlowV2TraHangPaper slip={p.th} /> }] : []),
        ...(p.xm ? [{ key: 'xm', label: 'BB xác minh (nhập lại)', landscape: true, node: <div className="flowv2-paper"><XacMinhPaper slip={p.xm} /></div> }] : []),
      ]
  if (!docs.length) return <div className="text-sm text-gray-500">Chưa có biên bản — nhờ kho mở tab Hàng trả &amp; huỷ để cập nhật.</div>
  return <PreviewPrintPanel docs={docs} />
}
