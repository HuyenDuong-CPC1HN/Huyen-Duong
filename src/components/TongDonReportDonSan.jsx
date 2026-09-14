import { forwardRef } from 'react'
import { fmtInt, fmtPctSigned, timingSegments, PRIORITY_LABEL } from '../utils/tongDonReportFormat'
import {
  TdrStack, TdrLegend, EditableText, KpiCard, InsightCard, VerdictBox, PlanItem,
} from './tongDonReportUi'

const RECON_TILE_TONE = { ok: '✓', warn: '◔', bad: '⚠', neutral: '▣' }

function ReconTile({ tone, value, label }) {
  return (
    <div className="tdr-tile">
      <span className={`tdr-tile-icon ${tone}`}>{RECON_TILE_TONE[tone]}</span>
      <div className={`tdr-tile-value ${tone === 'bad' || tone === 'warn' ? tone : ''}`}>{fmtInt(value)}</div>
      <div className="tdr-tile-label">{label}</div>
    </div>
  )
}

// Báo cáo "Đơn sàn": Sàn TMĐT (Shopee/TikTok) + Đơn ngoại sàn (Website, COD qua SPX Express).
// current/previous = kết quả computeWeekReport() của TongDonTab.jsx (giữ nguyên, không đổi cấu trúc).
// ngoaiSan = { data: {rows, stats}, frozen } | null — đối soát Mã đơn 3 mốc, chỉ tính cho tuần hiện tại.
const TongDonReportDonSan = forwardRef(function TongDonReportDonSan({
  active, isReadOnly, currentPeriodLabel, previousPeriodLabel, savedAtLabel,
  current, previous, ngoaiSan, narrative,
  fields, onFieldChange,
}, ref) {
  const ngoaiSanCurStats = current.spxC?.stats
  const ngoaiSanPrevStats = previous.spxC?.stats
  const reconStats = ngoaiSan?.data?.stats

  return (
    <div ref={ref} className={`tdr ${active ? 'is-active' : ''}`}>
      <div className="tdr-eyebrow">Kho vận HCM · Báo cáo giao hàng theo tuần</div>
      <div className="tdr-header">
        <div>
          <span className="tdr-badge donsan">ĐƠN SÀN</span>
          <div className="tdr-title">Sàn TMĐT &amp; Ngoại sàn — Kho HCM</div>
          <p className="tdr-subtitle">Shopee/TikTok (SO3+SO6) · Website — COD SPX</p>
        </div>
        <div className="tdr-period">
          <span><span className="tdr-dot cur" />{isReadOnly ? `Báo cáo đã lưu · ${savedAtLabel}` : `Tuần mới nhất${currentPeriodLabel ? ` · ${currentPeriodLabel}` : ''}`}</span>
          {!isReadOnly && <span><span className="tdr-dot prev" />Tuần trước{previousPeriodLabel ? ` · ${previousPeriodLabel}` : ''}</span>}
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Tổng quan Đơn sàn</div>
        <div className="tdr-kpi-grid">
          <KpiCard label="Tổng Đơn sàn" cur={narrative.donSanTotalCur} prev={narrative.donSanTotalPrev} good={narrative.donSanDeltaPct >= 0}
            deltaText={`${narrative.donSanDeltaPct >= 0 ? '▲' : '▼'} ${fmtInt(Math.abs(narrative.donSanTotalCur - narrative.donSanTotalPrev))} đơn (${fmtPctSigned(narrative.donSanDeltaPct)})`} />
          <KpiCard label="Đơn sàn TMĐT (Shopee, TikTok)" cur={current.totalTMDT} prev={previous.totalTMDT} good={narrative.tmdtDeltaPct >= 0}
            deltaText={`${narrative.tmdtDeltaPct >= 0 ? '▲' : '▼'} ${fmtInt(Math.abs(current.totalTMDT - previous.totalTMDT))} đơn (${fmtPctSigned(narrative.tmdtDeltaPct)})`} />
          <KpiCard label="Đơn ngoại sàn (Website)" cur={narrative.ngoaiSanCurTotal} prev={narrative.ngoaiSanPrevTotal} good={narrative.ngoaiSanDeltaPct >= 0}
            deltaText={`${narrative.ngoaiSanDeltaPct >= 0 ? '▲' : '▼'} ${fmtInt(Math.abs(narrative.ngoaiSanCurTotal - narrative.ngoaiSanPrevTotal))} đơn (${fmtPctSigned(narrative.ngoaiSanDeltaPct)})`} />
          <KpiCard label='Tỷ lệ "Đang vận chuyển" (Ngoại sàn)' curFmt={`${narrative.dvcCurPct}%`} prevFmt={`${narrative.dvcPrevPct}%`} good={narrative.dvcImproved}
            deltaText={`${narrative.dvcImproved ? '▼' : '▲'} ${Math.abs(narrative.dvcCurPct - narrative.dvcPrevPct).toFixed(1)} điểm %${narrative.dvcImproved ? ' — cải thiện rõ rệt' : ''}`} />
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Tổng quan Đơn sàn TMĐT và Đơn ngoại sàn</div>
        <div className="tdr-two-grid">
          <div className="tdr-overview-card">
            <h4>Đơn sàn TMĐT (Shopee, TikTok)</h4>
            <p>Tổng đơn — chưa có breakdown trạng thái giao trong nguồn dữ liệu hiện tại.</p>
            <div className="tdr-overview-big">{fmtInt(current.totalTMDT)} <span className="tdr-overview-vs">/ {fmtInt(previous.totalTMDT)} tuần trước</span></div>
            <div className="tdr-overview-delta">{narrative.tmdtDeltaPct >= 0 ? '▲' : '▼'} {fmtInt(Math.abs(current.totalTMDT - previous.totalTMDT))} đơn ({fmtPctSigned(narrative.tmdtDeltaPct)})</div>
          </div>
          <div className="tdr-overview-card">
            <h4>Đơn ngoại sàn (Website — COD SPX)</h4>
            <p>Đơn từ website công ty, giao 100% qua SPX Express dạng COD.</p>
            <div className="tdr-overview-big">{fmtInt(narrative.ngoaiSanCurTotal)} <span className="tdr-overview-vs">/ {fmtInt(narrative.ngoaiSanPrevTotal)} tuần trước</span></div>
            <div className="tdr-overview-delta">{narrative.ngoaiSanDeltaPct >= 0 ? '▲' : '▼'} {fmtInt(Math.abs(narrative.ngoaiSanCurTotal - narrative.ngoaiSanPrevTotal))} đơn ({fmtPctSigned(narrative.ngoaiSanDeltaPct)})</div>
          </div>
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Chi tiết Đơn ngoại sàn (SPX Express)</div>
        <div className="tdr-carrier-grid">
          <div className="tdr-carrier-card">
            <div className="tdr-carrier-card-top">
              <span className="tdr-carrier-card-name"><span className="tdr-dot cur" />Ngoại sàn{currentPeriodLabel ? ` — Tuần ${currentPeriodLabel}` : ' — Tuần này'}</span>
              <span className="tdr-carrier-card-total">{fmtInt(narrative.ngoaiSanCurTotal)} đơn</span>
            </div>
            <div className="tdr-carrier-sub">Trạng thái giao hàng</div>
            <TdrStack segments={timingSegments(ngoaiSanCurStats)} />
            <TdrLegend segments={timingSegments(ngoaiSanCurStats)} total={narrative.ngoaiSanCurTotal} />
          </div>
          <div className="tdr-carrier-card">
            <div className="tdr-carrier-card-top">
              <span className="tdr-carrier-card-name"><span className="tdr-dot prev" />Ngoại sàn{previousPeriodLabel ? ` — Tuần trước ${previousPeriodLabel}` : ' — Tuần trước'}</span>
              <span className="tdr-carrier-card-total">{fmtInt(narrative.ngoaiSanPrevTotal)} đơn</span>
            </div>
            <div className="tdr-carrier-sub">Trạng thái giao hàng</div>
            <TdrStack segments={timingSegments(ngoaiSanPrevStats)} />
            <TdrLegend segments={timingSegments(ngoaiSanPrevStats)} total={narrative.ngoaiSanPrevTotal} />
          </div>
        </div>
        {narrative.ngoaiSanCurTotal > 0 && (
          <div className="tdr-callout-good">✓&nbsp;<span>{narrative.ngoaiSanBody}</span></div>
        )}
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Đối soát Đơn ngoại sàn theo Mã đơn — Mốc 1..4</div>
        <div className="tdr-recon-box">
          <div className="tdr-recon-title-row">
            <span className="tdr-recon-icon">📦</span>
            <span className="tdr-recon-title">Đối soát đơn ngoại sàn (SPX COD){ngoaiSan?.frozen ? ' — đã đóng băng khi lưu báo cáo' : ''}</span>
          </div>
          <p className="tdr-recon-desc">Theo dõi 3 mốc thời gian: từ lúc đóng kiện tại kho, đến khi SPX lấy hàng, và cuối cùng đến khi giao hàng thành công.</p>
          <div className="tdr-recon-pills">
            <span className="tdr-recon-pill">🗓 Dữ liệu đối soát{currentPeriodLabel ? `: tuần ${currentPeriodLabel}` : ''}</span>
            <span className="tdr-recon-pill">◈ Trạng thái: {ngoaiSan?.frozen ? 'đã đóng băng khi lưu báo cáo' : 'dữ liệu trực tiếp'}</span>
          </div>

          {reconStats ? (
            <>
              <div className="tdr-recon-section-title">A) Đóng kiện (kho) <span className="tdr-moc">Mốc 1 .. 2</span></div>
              <div className="tdr-tile-grid">
                <ReconTile tone="ok" value={reconStats.dungHanDongKien} label="Đóng kiện đúng hạn (≤24h)" />
                <ReconTile tone={reconStats.treDongKien > 0 ? 'warn' : 'neutral'} value={reconStats.treDongKien} label="Trễ đóng kiện (>24h)" />
                <ReconTile tone={reconStats.quaHanChuaDongKien > 0 ? 'bad' : 'neutral'} value={reconStats.quaHanChuaDongKien} label="Chưa đóng kiện — quá 24h" />
              </div>

              <div className="tdr-recon-section-title">B) SPX lấy hàng <span className="tdr-moc">Mốc 2 .. 3</span></div>
              <div className="tdr-tile-grid">
                <ReconTile tone="ok" value={reconStats.layTrong24h} label="SPX lấy trong 24h (sau đóng kiện)" />
                <ReconTile tone="neutral" value={reconStats.layTrong48h} label="SPX lấy trong 48h" />
                <ReconTile tone="neutral" value={reconStats.layTrong72h} label="SPX lấy trong 72h" />
                <ReconTile tone={reconStats.layQua72h > 0 ? 'bad' : 'neutral'} value={reconStats.layQua72h} label="SPX lấy sau >72h" />
                <ReconTile tone={reconStats.layChuaLay > 0 ? 'bad' : 'neutral'} value={reconStats.layChuaLay} label="Chưa lấy hàng" />
                <ReconTile tone="neutral" value={reconStats.khongCoDuLieuDongKien} label="Chưa có dữ liệu đóng kiện" />
              </div>

              <div className="tdr-recon-section-title">C) Giao hàng thành công <span className="tdr-moc">Mốc 1 .. 4</span></div>
              <div className="tdr-tile-grid" style={{ marginBottom: 18 }}>
                <ReconTile tone="ok" value={reconStats.dungHanGiao} label="Giao đúng hạn (≤48h)" />
                <ReconTile tone={reconStats.treHanGiao > 0 ? 'warn' : 'neutral'} value={reconStats.treHanGiao} label="Giao trễ hạn (>48h)" />
                <ReconTile tone={reconStats.chuaGiaoQuaHan > 0 ? 'bad' : 'neutral'} value={reconStats.chuaGiaoQuaHan} label="Chưa giao — quá 48h" />
              </div>

              <div className="tdr-recon-note"><b>Nhận xét:</b> <EditableText value={fields.reconNote} onChange={onFieldChange && ((v) => onFieldChange('reconNote', v))} className="tdr-recon-note-text" rows={4} /></div>
            </>
          ) : (
            <p className="tdr-recon-desc">Chưa có dữ liệu đối soát Ngoại sàn cho tuần này.</p>
          )}
        </div>
      </div>

      <div className="tdr-section">
        <div className="tdr-eyebrow2">Nhận định vận hành — Đơn sàn</div>
        <div className="tdr-h2">Phân tích &amp; đánh giá tổng quan</div>
        <div className="tdr-insight-grid">
          <InsightCard tone={narrative.tmdtTone} tag="Đơn sàn TMĐT" title={narrative.tmdtTitle}
            body={fields.tmdtBody} onBodyChange={onFieldChange && ((v) => onFieldChange('tmdtBody', v))} />
          <InsightCard tone={narrative.ngoaiSanTone} tag="Ngoại sàn (SPX)" title={narrative.ngoaiSanTitle}
            body={fields.ngoaiSanBody} onBodyChange={onFieldChange && ((v) => onFieldChange('ngoaiSanBody', v))} />
        </div>
        <VerdictBox text={fields.verdict} onChange={onFieldChange && ((v) => onFieldChange('verdict', v))} />
      </div>

      <div className="tdr-section" style={{ marginBottom: 0 }}>
        <div className="tdr-eyebrow2">Giải pháp cho tuần tiếp theo</div>
        <div className="tdr-plan-list">
          <PlanItem num={1} text={fields.sol1} onChange={onFieldChange && ((v) => onFieldChange('sol1', v))} priority={narrative.priority1} priorityLabel={PRIORITY_LABEL[narrative.priority1] || PRIORITY_LABEL.low} />
          <PlanItem num={2} text={fields.sol2} onChange={onFieldChange && ((v) => onFieldChange('sol2', v))} priority="mid" priorityLabel={PRIORITY_LABEL.mid} />
          <PlanItem num={3} text={fields.sol3} onChange={onFieldChange && ((v) => onFieldChange('sol3', v))} priority="low" priorityLabel={PRIORITY_LABEL.low} />
          <PlanItem num={4} text={fields.sol4} onChange={onFieldChange && ((v) => onFieldChange('sol4', v))} priority="low" priorityLabel={PRIORITY_LABEL.low} />
        </div>
      </div>
    </div>
  )
})

export default TongDonReportDonSan
