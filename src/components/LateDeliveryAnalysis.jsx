import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { analyzeLateDeliveries, normalizeProvince, STAGES, ZONES } from '../utils/lateDeliveryAnalysis'

// Mục "D) Phân tích đơn giao trễ hạn 48h" trong khung Đối soát đơn website: chỉ hiện số tổng hợp, bấm vào
// từng ô số mới mở danh sách đơn chi tiết của nhóm đó.
const STAGE_COLOR = { spx: 'bg-red-500', banGiao: 'bg-orange-500', dongKien: 'bg-amber-500' }
const STAGE_PILL = { spx: 'bg-red-50 text-red-700', banGiao: 'bg-orange-50 text-orange-700', dongKien: 'bg-amber-50 text-amber-700' }
const fmt = n => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 1 })

function Line({ label, value, total, color, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full grid grid-cols-[minmax(0,1fr)_90px_36px] items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm transition-colors ${active ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
    >
      <span className="text-gray-700">{label}</span>
      <span className="h-2 rounded bg-gray-100 overflow-hidden"><span className={`block h-full ${color}`} style={{ width: `${total ? (value / total) * 100 : 0}%` }} /></span>
      <span className="text-right font-semibold tabular-nums text-gray-800">{value}</span>
    </button>
  )
}

export default function LateDeliveryAnalysis({ rows, spxRows }) {
  const [open, setOpen] = useState(true)
  const [filter, setFilter] = useState(null)
  const a = useMemo(() => analyzeLateDeliveries(rows, spxRows), [rows, spxRows])
  const khoName = useMemo(() => {
    const counts = new Map()
    for (const s of spxRows || []) {
      const name = normalizeProvince(s['Tỉnh gửi'])?.name
      if (name) counts.set(name, (counts.get(name) || 0) + 1)
    }
    const top = [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]
    return top === 'TP.HCM' ? 'HCM' : top || ''
  }, [spxRows])

  if (a.total === 0) return null

  const pick = (key) => setFilter(cur => (cur === key ? null : key))
  const lateZoneLabel = {
    noiTinh: khoName ? `Nội tỉnh (đơn nội thành ${khoName})` : 'Nội tỉnh',
    noiMien: 'Nội miền (>72 giờ)',
    lienMien: 'Liên miền (>96 giờ)',
  }
  const okZoneLabel = { noiMien: 'Nội miền, giao trong 72h', lienMien: 'Liên miền, giao trong 96h' }

  const FILTERS = {
    late: { title: `${a.late} đơn trễ`, test: i => i.late === true },
    ok: { title: `${a.ok} đơn đạt SLA vùng`, test: i => i.late === false },
    unknown: { title: `${a.unknown} đơn chưa xác định vùng`, test: i => i.late === null },
    ...Object.fromEntries(Object.keys(STAGES).map(k => [`stage:${k}`, { title: STAGES[k], test: i => i.late === true && i.stage === k }])),
    ...Object.fromEntries(Object.keys(ZONES).map(k => [`late:${k}`, { title: lateZoneLabel[k], test: i => i.late === true && i.zone === k }])),
    ...Object.fromEntries(Object.keys(okZoneLabel).map(k => [`ok:${k}`, { title: okZoneLabel[k], test: i => i.late === false && i.zone === k }])),
  }
  const active = filter && FILTERS[filter]
  const list = active
    ? a.items.filter(active.test).sort((x, y) => (y.overHours ?? -1e9) - (x.overHours ?? -1e9))
    : []

  return (
    <div className="mb-4 rounded-xl border-2 border-[#1e3a5f] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 flex-wrap px-4 py-2.5 bg-[#e8eef6] text-left"
      >
        <span className="text-sm font-bold text-[#1e3a5f]">D) Phân tích đơn giao trễ hạn 48h</span>
        <span className="text-xs text-gray-600">{a.total} đơn &gt;48h · {a.late} đơn trễ · {a.ok} đạt SLA vùng</span>
        {open ? <ChevronUp size={15} className="ml-auto text-[#1e3a5f]" /> : <ChevronDown size={15} className="ml-auto text-[#1e3a5f]" />}
      </button>

      {open && (
        <div className="p-4 space-y-4">
          <p className="text-base font-semibold text-gray-800">
            {a.total} đơn giao quá 48h. Trong đó có <span className="text-red-600">{a.late} đơn trễ</span> và{' '}
            <span className="text-green-700">{a.ok} đơn vẫn đạt SLA vùng</span>.
          </p>

          <div className="flex h-8 rounded-lg overflow-hidden text-xs font-semibold text-white">
            {a.late > 0 && (
              <button type="button" onClick={() => pick('late')} aria-pressed={filter === 'late'} style={{ flex: a.late }}
                className={`bg-red-600 min-w-0 ${filter === 'late' ? 'ring-4 ring-inset ring-gray-900/60' : ''}`}>{a.late} đơn trễ</button>
            )}
            {a.ok > 0 && (
              <button type="button" onClick={() => pick('ok')} aria-pressed={filter === 'ok'} style={{ flex: a.ok }}
                className={`bg-green-600 min-w-0 ${filter === 'ok' ? 'ring-4 ring-inset ring-gray-900/60' : ''}`}>{a.ok} đạt SLA vùng</button>
            )}
            {a.unknown > 0 && (
              <button type="button" onClick={() => pick('unknown')} aria-pressed={filter === 'unknown'} style={{ flex: a.unknown }}
                className={`bg-gray-400 min-w-0 ${filter === 'unknown' ? 'ring-4 ring-inset ring-gray-900/60' : ''}`}>{a.unknown} chưa rõ</button>
            )}
          </div>
          {a.unknown > 0 && (
            <p className="text-xs text-amber-700">
              {a.unknown} đơn chưa xác định được vùng giao vì file SPX thiếu cột tỉnh gửi/nhận. Tải lại file SPX xuất mới để app đọc đủ cột.
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-gray-200 p-3 space-y-1">
              <p className="text-sm font-semibold text-red-600">{a.late} đơn trễ</p>
              <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Theo chặng</p>
              {Object.keys(STAGES).map(k => (
                <Line key={k} label={STAGES[k]} value={a.byStage[k]} total={a.late} color={STAGE_COLOR[k]}
                  active={filter === `stage:${k}`} onClick={() => pick(`stage:${k}`)} />
              ))}
              <p className="pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Theo vùng</p>
              {Object.keys(ZONES).map(k => (
                <Line key={k} label={lateZoneLabel[k]} value={a.lateByZone[k]} total={a.late} color="bg-red-500"
                  active={filter === `late:${k}`} onClick={() => pick(`late:${k}`)} />
              ))}
            </div>
            <div className="rounded-lg border border-gray-200 p-3 space-y-1">
              <p className="text-sm font-semibold text-green-700">{a.ok} đơn vẫn đạt SLA vùng</p>
              <p className="text-xs text-gray-500">Quá 48h nhưng chưa quá hạn của vùng nên không tính là trễ.</p>
              {Object.keys(okZoneLabel).map(k => (
                <Line key={k} label={okZoneLabel[k]} value={a.okByZone[k]} total={a.ok} color="bg-green-500"
                  active={filter === `ok:${k}`} onClick={() => pick(`ok:${k}`)} />
              ))}
            </div>
          </div>

          {active ? (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-800">{active.title} · {list.length} đơn</span>
                <button type="button" onClick={() => setFilter(null)}
                  className="ml-auto px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-blue-400 hover:text-blue-600">Thu gọn</button>
              </div>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-[#1e3a5f] text-white">
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mã đơn</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Mã vận đơn SPX</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Tỉnh nhận</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Vùng giao</th>
                      <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Hạn</th>
                      <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Giờ giao</th>
                      <th className="px-3 py-2 text-right font-semibold whitespace-nowrap">Vượt hạn</th>
                      <th className="px-3 py-2 text-left font-semibold whitespace-nowrap">Kết luận</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map(i => (
                      <tr key={i.maVanDon || i.maDon} className="border-t border-gray-100">
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{i.maDon}</td>
                        <td className="px-3 py-2 font-mono whitespace-nowrap">{i.maVanDon}</td>
                        <td className="px-3 py-2">{i.tinhNhan || '—'}{i.phuongXa && <div className="text-gray-400">{i.phuongXa}</div>}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{i.zone ? ZONES[i.zone].label : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{i.sla ? `${i.sla}h` : '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{fmt(i.hours)}h</td>
                        <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${i.late ? 'text-red-600 font-semibold' : 'text-gray-400'}`}>
                          {i.overHours === null ? '—' : i.overHours > 0 ? `+${fmt(i.overHours)}h` : `còn ${fmt(-i.overHours)}h`}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {i.late === true && <span className={`px-2 py-0.5 rounded-full font-semibold ${STAGE_PILL[i.stage]}`}>{STAGES[i.stage]}</span>}
                          {i.late === false && <span className="px-2 py-0.5 rounded-full font-semibold bg-green-50 text-green-700">Đạt SLA vùng</span>}
                          {i.late === null && <span className="px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-500">Chưa rõ vùng</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Bấm vào từng ô số ở trên để xem danh sách đơn chi tiết.</p>
          )}
        </div>
      )}
    </div>
  )
}
