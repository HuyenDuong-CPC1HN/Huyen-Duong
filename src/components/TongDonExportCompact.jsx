import { forwardRef, useMemo } from 'react'
import { fmtInt, fmtPctSigned, pctOf, timingSegments, directDeliverySegments, PRIORITY_LABEL } from '../utils/tongDonReportFormat'
import { analyzeLateDeliveries } from '../utils/lateDeliveryAnalysis'

// Bản báo cáo GỌN chỉ dùng để xuất ảnh PNG (tab Tổng Đơn): cùng số liệu với 2 báo cáo trên màn hình
// (TongDonReportDonSan / TongDonReportDonTruyenThong) nhưng dồn lại ~1/2 chiều dài — màn hình web vẫn giữ
// bản đầy đủ. Chỉ được dựng tạm (ngoài khung nhìn) lúc bấm "Xuất ảnh PNG" rồi bỏ đi (xem TongDonTab.jsx).

const sign = (v) => (v >= 0 ? '▲' : '▼')
const deltaLine = (cur, prev, pct) => `${sign(pct)} ${fmtInt(Math.abs(cur - prev))} đơn (${fmtPctSigned(pct)})`

function Header({ badge, badgeCls, title, sub, isReadOnly, savedAtLabel, currentPeriodLabel, previousPeriodLabel }) {
  return (
    <div className="tdx-hd">
      <span className={`tdx-pill ${badgeCls}`}>{badge}</span>
      <h2>{title}</h2>
      <span className="tdx-sub">{sub}</span>
      <span className="tdx-saved">
        <span className="tdx-dot" />
        {isReadOnly ? `Báo cáo đã lưu · ${savedAtLabel}` : `Tuần ${currentPeriodLabel || 'mới nhất'} · so với tuần ${previousPeriodLabel || 'trước'}`}
      </span>
    </div>
  )
}

function Kpi({ label, value, prev, delta, good }) {
  return (
    <div className="tdx-kpi">
      <span className="tdx-l">{label}</span>
      <span className="tdx-v">{value} <small>/ {prev}</small></span>
      <span className={good === null ? 'tdx-flat' : good ? 'tdx-up' : 'tdx-dn'}>{delta}</span>
    </div>
  )
}

function Bar({ segments }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  return (
    <span className="tdx-bar">
      {total > 0 && segments.map(s => s.value > 0 && <i key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />)}
    </span>
  )
}

function Legend({ segments }) {
  return <div className="tdx-legend">{segments.map(s => <span key={s.label}><b style={{ background: s.color }} />{s.label}</span>)}</div>
}

const Chip = ({ n, tone }) => <span className={`tdx-chip ${n > 0 ? tone : 'z'}`}>{fmtInt(n)}</span>

function Verdict({ insights, verdict, plans }) {
  return (
    <div className="tdx-verdict">
      <div>
        <h3>Nhận định &amp; kết luận</h3>
        <ul>{insights.map(x => <li key={x.tag}><b>{x.tag}:</b> {x.title}</li>)}</ul>
        {verdict && <p>{verdict}</p>}
      </div>
      <div>
        <h3>Giải pháp tuần tới</h3>
        <ol>{plans.filter(p => p.text).map((p, i) => <li key={i}>{p.text} <span className={`tdx-tag ${p.priority}`}>{PRIORITY_LABEL[p.priority] || PRIORITY_LABEL.low}</span></li>)}</ol>
      </div>
    </div>
  )
}

export const TongDonExportDonSan = forwardRef(function TongDonExportDonSan({
  isReadOnly, currentPeriodLabel, previousPeriodLabel, savedAtLabel, current, previous, ngoaiSan, narrative: n, fields,
}, ref) {
  const recon = ngoaiSan?.data?.stats
  const late = useMemo(() => (ngoaiSan?.spxRows && ngoaiSan?.data?.rows ? analyzeLateDeliveries(ngoaiSan.data.rows, ngoaiSan.spxRows) : null), [ngoaiSan])
  const segCur = timingSegments(current.spxC?.stats)
  const segPrev = timingSegments(previous.spxC?.stats)
  const callout = fields.ngoaiSanCallout ?? n.ngoaiSanBody
  return (
    <div ref={ref} className="tdx">
      <Header badge="Đơn sàn" badgeCls="g" title="Sàn TMĐT & Ngoại sàn — Kho HCM" sub="Shopee/TikTok (SO3+SO6) · Website — COD SPX"
        isReadOnly={isReadOnly} savedAtLabel={savedAtLabel} currentPeriodLabel={currentPeriodLabel} previousPeriodLabel={previousPeriodLabel} />
      <div className="tdx-kpis">
        <Kpi label="Tổng đơn sàn" value={fmtInt(n.donSanTotalCur)} prev={fmtInt(n.donSanTotalPrev)} good={n.donSanDeltaPct >= 0} delta={deltaLine(n.donSanTotalCur, n.donSanTotalPrev, n.donSanDeltaPct)} />
        <Kpi label="Đơn TMĐT (Shopee, TikTok)" value={fmtInt(current.totalTMDT)} prev={fmtInt(previous.totalTMDT)} good={n.tmdtDeltaPct >= 0} delta={deltaLine(current.totalTMDT, previous.totalTMDT, n.tmdtDeltaPct)} />
        <Kpi label="Đơn ngoại sàn (Website)" value={fmtInt(n.ngoaiSanCurTotal)} prev={fmtInt(n.ngoaiSanPrevTotal)} good={n.ngoaiSanDeltaPct >= 0} delta={deltaLine(n.ngoaiSanCurTotal, n.ngoaiSanPrevTotal, n.ngoaiSanDeltaPct)} />
        <Kpi label='Tỷ lệ "đang vận chuyển" ngoại sàn' value={n.dvcCurPct === null ? '—' : `${n.dvcCurPct}%`} prev={n.dvcPrevPct === null ? '—' : `${n.dvcPrevPct}%`}
          good={n.dvcComparable ? n.dvcImproved : null}
          delta={n.dvcComparable ? `${n.dvcImproved ? '▼' : '▲'} ${Math.abs(n.dvcCurPct - n.dvcPrevPct).toFixed(1)} điểm${n.dvcImproved ? ' — cải thiện' : ''}` : 'Chưa đủ file SPX để so'} />
      </div>
      <div className="tdx-grid2">
        <div className="tdx-card">
          <div className="tdx-ct">Trạng thái đơn ngoại sàn (SPX)<span>tuần này / tuần trước</span></div>
          <div className="tdx-sbar"><span>Tuần này</span><Bar segments={segCur} /><span className="tdx-n">{fmtInt(n.ngoaiSanCurTotal)} đơn</span></div>
          <div className="tdx-sbar"><span>Tuần trước</span><Bar segments={segPrev} /><span className="tdx-n">{fmtInt(n.ngoaiSanPrevTotal)} đơn</span></div>
          <Legend segments={segCur.length ? segCur : segPrev} />
          {n.ngoaiSanCurTotal > 0 && callout && <div className="tdx-note">{callout}</div>}
        </div>
        <div className="tdx-card">
          <div className="tdx-ct">Đối soát ngoại sàn theo mã đơn<span>mốc 1 → 4</span></div>
          {recon ? (
            <>
              <table className="tdx-table">
                <thead><tr><th>Khâu</th><th>Đúng hạn</th><th>Trễ</th><th>Chưa xong</th></tr></thead>
                <tbody>
                  <tr><td>A · Đóng kiện (≤24h)</td><td><Chip n={recon.dungHanDongKien} tone="ok" /></td><td><Chip n={recon.treDongKien} tone="warn" /></td><td><Chip n={recon.quaHanChuaDongKien} tone="bad" /></td></tr>
                  <tr><td>B · SPX lấy hàng (≤24h)</td><td><Chip n={recon.layTrong24h} tone="ok" /></td><td><Chip n={(recon.layTrong48h || 0) + (recon.layTrong72h || 0) + (recon.layQua72h || 0)} tone="warn" /></td><td><Chip n={recon.layChuaLay} tone="bad" /></td></tr>
                  <tr><td>C · Giao thành công (≤48h)</td><td><Chip n={recon.dungHanGiao} tone="ok" /></td><td><Chip n={recon.treHanGiao} tone="warn" /></td><td><Chip n={recon.chuaGiaoQuaHan} tone="bad" /></td></tr>
                </tbody>
              </table>
              {recon.khongCoDuLieuDongKien > 0 && <div className="tdx-mute">{fmtInt(recon.khongCoDuLieuDongKien)} đơn chưa có dữ liệu đóng kiện.</div>}
              {late && late.total > 0 && (
                <>
                  <div className="tdx-split" aria-label={`${late.total} đơn giao quá 48h`}>
                    {late.late > 0 && <i style={{ flex: late.late, background: 'var(--x-bad)' }}>{late.late} trễ</i>}
                    {late.ok > 0 && <i style={{ flex: late.ok, background: 'var(--x-ok)' }}>{late.ok} vẫn đạt SLA vùng</i>}
                    {late.unknown > 0 && <i style={{ flex: late.unknown, background: 'var(--x-mute)' }}>{late.unknown} chưa rõ</i>}
                  </div>
                  <div className="tdx-late">
                    <div><h4>{late.late} đơn trễ</h4><ul>
                      <li>SPX vận chuyển<b>{late.byStage.spx}</b></li>
                      <li>Kho bàn giao (&gt;8h)<b>{late.byStage.banGiao}</b></li>
                      <li>Đóng kiện trễ<b>{late.byStage.dongKien}</b></li>
                      <li>Nội tỉnh · Nội miền · Liên miền<b>{late.lateByZone.noiTinh} · {late.lateByZone.noiMien} · {late.lateByZone.lienMien}</b></li>
                    </ul></div>
                    <div><h4>{late.ok} đơn đạt SLA vùng</h4><ul>
                      <li>Nội miền, giao trong 72h<b>{late.okByZone.noiMien}</b></li>
                      <li>Liên miền, giao trong 96h<b>{late.okByZone.lienMien}</b></li>
                    </ul></div>
                  </div>
                </>
              )}
              {fields.reconNote && <div className="tdx-note"><b>Nhận xét:</b> {fields.reconNote}</div>}
            </>
          ) : <div className="tdx-mute">Chưa có dữ liệu đối soát ngoại sàn cho tuần này.</div>}
        </div>
      </div>
      <Verdict
        insights={[{ tag: 'Đơn sàn TMĐT', title: n.tmdtTitle }, { tag: 'Ngoại sàn (SPX)', title: n.ngoaiSanTitle }]}
        verdict={fields.verdict}
        plans={[{ text: fields.sol1, priority: n.priority1 }, { text: fields.sol2, priority: 'mid' }, { text: fields.sol3, priority: 'low' }, { text: fields.sol4, priority: 'low' }]} />
    </div>
  )
})

// SLA 24h 1 dòng kênh: giao trực tiếp = đơn 24h / tổng đơn trực tiếp (cùng công thức nhận định), Viettel Post = 24h / tổng đơn VTP.
const slaTone = (v) => (v >= 80 ? 'ok' : v >= 50 ? 'warn' : 'bad')

export const TongDonExportDonTruyenThong = forwardRef(function TongDonExportDonTruyenThong({
  isReadOnly, currentPeriodLabel, previousPeriodLabel, savedAtLabel, current: R, previous: P, narrative: n, fields,
}, ref) {
  const direct = (X, side) => directDeliverySegments(side === 'C'
    ? { b24: X.bC?.[24], b48: X.bC?.[48], b72: X.bC?.[72], chuaGiao: X.chuaGiaoC }
    : { b24: X.bDTP?.[24], b48: X.bDTP?.[48], b72: X.bDTP?.[72], chuaGiao: X.chuaGiaoDTP })
  const rows = [
    { k: 'Giao trực tiếp · Đơn C', seg: direct(R, 'C'), cur: R.tructiepTotalC, prev: P.tructiepTotalC, sla: pctOf(R.bC?.[24], R.tructiepTotalC), slaPrev: pctOf(P.bC?.[24], P.tructiepTotalC) },
    { k: 'Giao trực tiếp · Đơn DTP', seg: direct(R, 'DTP'), cur: R.tructiepTotalDTP, prev: P.tructiepTotalDTP, sla: pctOf(R.bDTP?.[24], R.tructiepTotalDTP), slaPrev: pctOf(P.bDTP?.[24], P.tructiepTotalDTP) },
    { k: 'Chành xe · Đơn C', seg: null, cur: R.chanhXeTotal, prev: P.chanhXeTotal, sla: null, slaPrev: null },
    { k: 'Viettel Post · Đơn C', seg: timingSegments(R.viettelC?.stats), cur: R.viettelC?.total || 0, prev: P.viettelC?.total || 0, sla: pctOf(R.viettelC?.stats?.['24h'], R.viettelC?.total), slaPrev: pctOf(P.viettelC?.stats?.['24h'], P.viettelC?.total) },
    { k: 'Viettel Post · Đơn DTP', seg: timingSegments(R.viettelDTP?.stats), cur: R.viettelDTP?.total || 0, prev: P.viettelDTP?.total || 0, sla: pctOf(R.viettelDTP?.stats?.['24h'], R.viettelDTP?.total), slaPrev: pctOf(P.viettelDTP?.stats?.['24h'], P.viettelDTP?.total) },
  ]
  const legend = [...directDeliverySegments({}), ...timingSegments({}).slice(3)]
  const chuaGiao = (R.chuaGiaoC || 0) + (R.chuaGiaoDTP || 0)
  return (
    <div ref={ref} className="tdx">
      <Header badge="Đơn truyền thống" badgeCls="n" title="Đơn C & Đơn DTP — Kho HCM" sub="Giao trực tiếp · Chành xe · Viettel Post"
        isReadOnly={isReadOnly} savedAtLabel={savedAtLabel} currentPeriodLabel={currentPeriodLabel} previousPeriodLabel={previousPeriodLabel} />
      <div className="tdx-kpis">
        <Kpi label="Tổng đơn truyền thống" value={fmtInt(n.totalTTCur)} prev={fmtInt(n.totalTTPrev)} good={n.ttDeltaPct >= 0} delta={deltaLine(n.totalTTCur, n.totalTTPrev, n.ttDeltaPct)} />
        <Kpi label="Đơn C" value={fmtInt(R.totalC)} prev={fmtInt(P.totalC)} good={n.cDeltaPct >= 0} delta={deltaLine(R.totalC, P.totalC, n.cDeltaPct)} />
        <Kpi label="Đơn DTP" value={fmtInt(R.totalDTP)} prev={fmtInt(P.totalDTP)} good={n.dtpDeltaPct >= 0} delta={deltaLine(R.totalDTP, P.totalDTP, n.dtpDeltaPct)} />
        <Kpi label="SLA 24h Đơn DTP" value={`${n.slaDTP_cur}%`} prev={`${n.slaDTP_prev}%`} good={n.slaDTP_cur >= n.slaDTP_prev}
          delta={`${n.slaDTP_cur >= n.slaDTP_prev ? '▲' : '▼'} ${Math.abs(n.slaDTP_cur - n.slaDTP_prev).toFixed(1)} điểm`} />
      </div>
      <div className="tdx-card">
        <div className="tdx-ct">Theo kênh vận chuyển<span>tuần này · SLA 24h so với tuần trước{chuaGiao > 0 ? ` · ${fmtInt(chuaGiao)} đơn trực tiếp chưa giao` : ''}</span></div>
        <table className="tdx-table tdx-chan">
          <thead><tr><th>Kênh · loại đơn</th><th>Trạng thái giao (tuần này)</th><th>Đơn</th><th>±</th><th>SLA 24h</th><th>Tuần trước</th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.k}>
              <td>{r.k}</td>
              <td>{r.seg && <Bar segments={r.seg} />}</td>
              <td>{fmtInt(r.cur)}</td>
              <td className={r.cur - r.prev >= 0 ? 'tdx-up' : 'tdx-dn'}>{r.cur - r.prev >= 0 ? '+' : '−'}{fmtInt(Math.abs(r.cur - r.prev))}</td>
              <td>{r.sla === null || !r.cur ? <span className="tdx-mute">—</span> : <span className={`tdx-chip ${slaTone(r.sla)}`}>{r.sla.toLocaleString('vi-VN')}%</span>}</td>
              <td className="tdx-mute">{r.slaPrev === null || !r.prev ? '—' : `${r.slaPrev.toLocaleString('vi-VN')}%`}</td>
            </tr>
          ))}</tbody>
        </table>
        <Legend segments={legend} />
      </div>
      <Verdict
        insights={[{ tag: 'Cơ cấu chung', title: n.cocauTitle }, { tag: 'Đơn DTP', title: n.dtpTitle }, { tag: 'Đơn C', title: n.cTitle }, { tag: 'Viettel Post', title: n.vtpTitle }]}
        verdict={fields.verdict}
        plans={[{ text: fields.sol1, priority: n.priority1 }, { text: fields.sol2, priority: n.priority2 }, { text: fields.sol3, priority: 'mid' }, { text: fields.sol4, priority: 'low' }]} />
    </div>
  )
})
