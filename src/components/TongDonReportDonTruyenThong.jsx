import { forwardRef } from 'react'
import { fmtInt, fmtPctSigned, pctOf, timingSegments, directDeliverySegments, PRIORITY_LABEL } from '../utils/tongDonReportFormat'
import {
  TdrStack, KpiCard, InsightCard, VerdictBox, PlanItem,
} from './tongDonReportUi'

function WeekCard({ dateLabel, tagLabel, tagCls, R, totalTT }) {
  const totalC = R.totalC
  const totalDTP = R.totalDTP
  const pctC = pctOf(totalC, totalTT)
  const pctDTP = pctOf(totalDTP, totalTT)
  const barColor = tagCls === 'cur' ? 'var(--color-current)' : 'var(--color-previous)'
  return (
    <div className="tdr-week-card">
      <div className="tdr-week-card-top">
        <span className="tdr-week-card-date">{dateLabel}</span>
        <span className={`tdr-week-card-tag ${tagCls}`}>{tagLabel}</span>
      </div>
      <div className="tdr-wc-row">
        <div className="tdr-wc-row-top"><span className="tdr-wc-row-name">Đơn C (truyền thống) — {fmtInt(totalC)} đơn</span><span className="tdr-wc-row-pct">{pctC}%</span></div>
        <div className="tdr-wc-bar-track"><div className="tdr-wc-bar-fill" style={{ width: `${pctC}%`, background: barColor }} /></div>
        <div className="tdr-wc-row-detail">Giao trực tiếp {fmtInt(R.tructiepTotalC)} &nbsp;|&nbsp; Chành xe {fmtInt(R.chanhXeTotal)} &nbsp;|&nbsp; VTP - C {fmtInt(R.viettelC?.total)}</div>
      </div>
      <div className="tdr-wc-row">
        <div className="tdr-wc-row-top"><span className="tdr-wc-row-name">Đơn DTP — {fmtInt(totalDTP)} đơn</span><span className="tdr-wc-row-pct">{pctDTP}%</span></div>
        <div className="tdr-wc-bar-track"><div className="tdr-wc-bar-fill" style={{ width: `${pctDTP}%`, background: barColor }} /></div>
        <div className="tdr-wc-row-detail">Giao trực tiếp {fmtInt(R.tructiepTotalDTP)} &nbsp;|&nbsp; VTP - DTP {fmtInt(R.viettelDTP?.total)}</div>
      </div>
      <div className="tdr-wc-total">Tổng Đơn truyền thống: {fmtInt(totalTT)} đơn</div>
    </div>
  )
}

function DirectDeliveryCard({ dotColor, R }) {
  const total = R.tructiepTotalC + R.tructiepTotalDTP
  const segC = directDeliverySegments({ b24: R.bC?.[24], b48: R.bC?.[48], b72: R.bC?.[72], chuaGiao: R.chuaGiaoC })
  const segDTP = directDeliverySegments({ b24: R.bDTP?.[24], b48: R.bDTP?.[48], b72: R.bDTP?.[72], chuaGiao: R.chuaGiaoDTP })
  return (
    <div className="tdr-carrier-card">
      <div className="tdr-carrier-card-top">
        <span className="tdr-carrier-card-name"><span className="tdr-sq" style={{ background: dotColor }} />Giao hàng trực tiếp</span>
        <span className="tdr-carrier-card-total">{fmtInt(total)} đơn</span>
      </div>
      <div className="tdr-carrier-sub">Đơn C — {fmtInt(R.tructiepTotalC)} ({pctOf(R.tructiepTotalC, total)}%)</div>
      <TdrStack segments={segC} />
      <div className="tdr-carrier-sub">Đơn DTP — {fmtInt(R.tructiepTotalDTP)} ({pctOf(R.tructiepTotalDTP, total)}%)</div>
      <TdrStack segments={segDTP} />
      <div className="tdr-legend">
        <span><span className="tdr-sq" style={{ background: 'var(--color-current)' }} />24h</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-previous)' }} />48h</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-pink)' }} />72h</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-navy)' }} />Chưa giao ({fmtInt((R.chuaGiaoC || 0) + (R.chuaGiaoDTP || 0))} đơn)</span>
      </div>
    </div>
  )
}

function ViettelPostCard({ dotColor, R }) {
  const total = (R.viettelC?.total || 0) + (R.viettelDTP?.total || 0)
  return (
    <div className="tdr-carrier-card">
      <div className="tdr-carrier-card-top">
        <span className="tdr-carrier-card-name"><span className="tdr-sq" style={{ background: dotColor }} />Viettel Post</span>
        <span className="tdr-carrier-card-total">{fmtInt(total)} đơn</span>
      </div>
      <div className="tdr-carrier-sub">Đơn C — {fmtInt(R.viettelC?.total)} ({pctOf(R.viettelC?.total, total)}%)</div>
      <TdrStack segments={timingSegments(R.viettelC?.stats)} />
      <div className="tdr-carrier-sub">Đơn DTP — {fmtInt(R.viettelDTP?.total)} ({pctOf(R.viettelDTP?.total, total)}%)</div>
      <TdrStack segments={timingSegments(R.viettelDTP?.stats)} />
      <div className="tdr-legend">
        <span><span className="tdr-sq" style={{ background: 'var(--color-current)' }} />24h</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-previous)' }} />48h</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-pink)' }} />72h</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-purple)' }} />Chờ lấy</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-blue)' }} />Đang vận chuyển</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-orange-2)' }} />Đang giao hàng</span>
        <span><span className="tdr-sq" style={{ background: 'var(--color-red)' }} />Hoàn hàng</span>
      </div>
    </div>
  )
}

// Báo cáo "Đơn truyền thống": Đơn C + Đơn DTP (Giao trực tiếp / Chành xe / Viettel Post).
// current/previous = kết quả computeWeekReport() của TongDonTab.jsx (giữ nguyên, không đổi cấu trúc).
const TongDonReportDonTruyenThong = forwardRef(function TongDonReportDonTruyenThong({
  active, isReadOnly, currentPeriodLabel, previousPeriodLabel, savedAtLabel,
  current, previous, narrative,
  fields, onFieldChange,
}, ref) {
  return (
    <div ref={ref} className={`tdr ${active ? 'is-active' : ''}`}>
      <div className="tdr-eyebrow">Kho vận HCM · Báo cáo giao hàng theo tuần</div>
      <div className="tdr-header">
        <div>
          <span className="tdr-badge truyenthong">ĐƠN TRUYỀN THỐNG</span>
          <div className="tdr-title">Đơn C &amp; Đơn DTP — Kho HCM</div>
          <p className="tdr-subtitle">Giao trực tiếp · Chành xe · Viettel Post</p>
        </div>
        <div className="tdr-period">
          <span><span className="tdr-dot cur" />{isReadOnly ? `Báo cáo đã lưu · ${savedAtLabel}` : `Tuần mới nhất${currentPeriodLabel ? ` · ${currentPeriodLabel}` : ''}`}</span>
          {!isReadOnly && <span><span className="tdr-dot prev" />Tuần trước{previousPeriodLabel ? ` · ${previousPeriodLabel}` : ''}</span>}
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Tổng quan Đơn truyền thống</div>
        <div className="tdr-kpi-grid">
          <KpiCard label="Tổng Đơn truyền thống" cur={narrative.totalTTCur} prev={narrative.totalTTPrev} good={narrative.ttDeltaPct >= 0}
            deltaText={`${narrative.ttDeltaPct >= 0 ? '▲' : '▼'} ${fmtInt(Math.abs(narrative.totalTTCur - narrative.totalTTPrev))} đơn (${fmtPctSigned(narrative.ttDeltaPct)})`} />
          <KpiCard label="Đơn C (truyền thống)" cur={current.totalC} prev={previous.totalC} good={narrative.cDeltaPct >= 0}
            deltaText={`${narrative.cDeltaPct >= 0 ? '▲' : '▼'} ${fmtInt(Math.abs(current.totalC - previous.totalC))} đơn (${fmtPctSigned(narrative.cDeltaPct)})`} />
          <KpiCard label="Đơn DTP" cur={current.totalDTP} prev={previous.totalDTP} good={narrative.dtpDeltaPct >= 0}
            deltaText={`${narrative.dtpDeltaPct >= 0 ? '▲' : '▼'} ${fmtInt(Math.abs(current.totalDTP - previous.totalDTP))} đơn (${fmtPctSigned(narrative.dtpDeltaPct)})`} />
          <KpiCard label="SLA 24h Đơn DTP" curFmt={`${narrative.slaDTP_cur}%`} prevFmt={`${narrative.slaDTP_prev}%`} good={narrative.slaDTP_cur >= narrative.slaDTP_prev}
            deltaText={`${narrative.slaDTP_cur >= narrative.slaDTP_prev ? '▲' : '▼'} ${Math.abs(narrative.slaDTP_cur - narrative.slaDTP_prev).toFixed(1)} điểm %${narrative.slaDTP_cur >= narrative.slaDTP_prev ? ' — cải thiện tốt' : ''}`} />
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Tổng quan theo tuần</div>
        <div className="tdr-two-grid">
          <WeekCard dateLabel={currentPeriodLabel || 'Tuần này'} tagLabel="TUẦN MỚI NHẤT" tagCls="cur" R={current} totalTT={narrative.totalTTCur} />
          <WeekCard dateLabel={previousPeriodLabel || 'Tuần trước'} tagLabel="TUẦN TRƯỚC" tagCls="prev" R={previous} totalTT={narrative.totalTTPrev} />
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Chi tiết theo kênh vận chuyển</div>
        <div className="tdr-carrier-grid">
          <DirectDeliveryCard dotColor="var(--color-current)" R={current} />
          <DirectDeliveryCard dotColor="var(--color-previous)" R={previous} />
          <ViettelPostCard dotColor="var(--color-purple)" R={current} />
          <ViettelPostCard dotColor="var(--color-previous)" R={previous} />
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Nhận định vận hành — Đơn truyền thống</div>
        <div className="tdr-h2">Phân tích &amp; đánh giá tổng quan</div>
        <div className="tdr-insight-grid">
          <InsightCard tone={narrative.cocauTone || 'pos'} tag="Cơ cấu chung" title={narrative.cocauTitle}
            body={fields.cocauBody} onBodyChange={onFieldChange && ((v) => onFieldChange('cocauBody', v))} />
          <InsightCard tone={narrative.dtpTone} tag="Đơn DTP" title={narrative.dtpTitle}
            body={fields.dtpBody} onBodyChange={onFieldChange && ((v) => onFieldChange('dtpBody', v))} />
          <InsightCard tone={narrative.cTone} tag="Đơn C truyền thống" title={narrative.cTitle}
            body={fields.cBody} onBodyChange={onFieldChange && ((v) => onFieldChange('cBody', v))} />
          <InsightCard tone={narrative.vtpTone} tag="Viettel Post" title={narrative.vtpTitle}
            body={fields.vtpBody} onBodyChange={onFieldChange && ((v) => onFieldChange('vtpBody', v))} />
        </div>
        <VerdictBox text={fields.verdict} onChange={onFieldChange && ((v) => onFieldChange('verdict', v))} />
      </div>

      <div className="tdr-section" style={{ marginBottom: 0 }}>
        <div className="tdr-eyebrow2">Giải pháp cho tuần tiếp theo</div>
        <div className="tdr-plan-list">
          <PlanItem num={1} text={fields.sol1} onChange={onFieldChange && ((v) => onFieldChange('sol1', v))} priority={narrative.priority1} priorityLabel={PRIORITY_LABEL[narrative.priority1] || PRIORITY_LABEL.low} />
          <PlanItem num={2} text={fields.sol2} onChange={onFieldChange && ((v) => onFieldChange('sol2', v))} priority={narrative.priority2} priorityLabel={PRIORITY_LABEL[narrative.priority2] || PRIORITY_LABEL.low} />
          <PlanItem num={3} text={fields.sol3} onChange={onFieldChange && ((v) => onFieldChange('sol3', v))} priority="mid" priorityLabel={PRIORITY_LABEL.mid} />
          <PlanItem num={4} text={fields.sol4} onChange={onFieldChange && ((v) => onFieldChange('sol4', v))} priority="low" priorityLabel={PRIORITY_LABEL.low} />
        </div>
      </div>
    </div>
  )
})

export default TongDonReportDonTruyenThong
