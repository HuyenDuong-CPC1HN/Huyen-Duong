import { HUY_STAGES } from '../utils/hangHuy'

const STAGE_PILL = {
  todo: 'bg-amber-50 text-amber-700',
  doing: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
}
// Nhãn kho: đỏ = Kho C, xanh dương = Kho DTP (cùng quy ước màu với Đơn C / Đơn DTP ở nhập trả lại).
export function KhoTag({ kho }) {
  return kho === 'C'
    ? <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700">Kho C</span>
    : <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">Kho DTP</span>
}
export function HuyStagePill({ stage }) {
  const st = HUY_STAGES[stage] || HUY_STAGES.todo
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_PILL[st.tone]}`}>{st.label}</span>
}
