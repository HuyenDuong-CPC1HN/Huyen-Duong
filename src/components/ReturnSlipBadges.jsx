import { SLIP_STAGES } from '../utils/returnSlips'

const STAGE_PILL = {
  wait: 'bg-gray-100 text-gray-600',
  todo: 'bg-amber-50 text-amber-700',
  doing: 'bg-blue-50 text-blue-700',
  done: 'bg-green-50 text-green-700',
}
// Nhãn loại đơn: đỏ = Đơn C, xanh dương = Đơn DTP.
export function LoaiTag({ loai }) {
  if (!loai) return <span className="text-xs text-gray-400">Chưa tải file</span>
  return loai === 'C'
    ? <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-red-200 bg-red-50 text-red-700">Đơn C</span>
    : <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700">Đơn DTP</span>
}
export function StagePill({ stage }) {
  const st = SLIP_STAGES[stage] || SLIP_STAGES.wait
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${STAGE_PILL[st.tone]}`}>{st.label}</span>
}
