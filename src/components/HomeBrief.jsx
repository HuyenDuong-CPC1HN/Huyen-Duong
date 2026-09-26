import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  LayoutGrid,
  Send,
} from 'lucide-react'
import { opsStore as localStorage } from '../data/workspace'
import { readTrialReports } from '../utils/unifiedTrialReports'

const STATUS = {
  ready: {
    statusLabel: 'Đã có số liệu',
    cardCopy: 'Số liệu đã lưu, sẵn sàng để xem lại.',
    tone: 'ready',
  },
  needsSave: {
    statusLabel: 'Chưa lưu số liệu tuần',
    cardCopy: 'Dữ liệu tuần đã có nhưng chưa được lưu thành báo cáo.',
    tone: 'attention',
  },
  missing: {
    statusLabel: 'Chưa có dữ liệu tuần',
    cardCopy: 'Mở kênh để tải dữ liệu và hoàn tất báo cáo tuần.',
    tone: 'missing',
  },
}

const CHANNEL_META = {
  tongdon: { label: 'Tổng đơn', icon: LayoutGrid, headlineLabel: 'Tổng đơn đã lưu' },
}

function readList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]')
    return Array.isArray(value)
      ? value.filter((item) => item && typeof item === 'object')
      : []
  } catch {
    return []
  }
}

function formatOrders(value) {
  return Number.isFinite(value) ? `${value.toLocaleString('vi-VN')} đơn` : null
}

function deriveChannels() {
  const tongdonReport = readList('tongdon_reports')[0]
  // Dữ liệu nguồn của Tổng đơn = số liệu tuần đã lưu ở tab Gộp kênh (chỉ đọc).
  const hasSourceData = readTrialReports('donSO').length > 0 || readTrialReports('donTruyenThong').length > 0

  return [
    {
      id: 'tongdon',
      ...(tongdonReport
        ? {
            state: 'ready',
            context: tongdonReport.label || tongdonReport.title || 'Báo cáo đã lưu',
            headline: formatOrders(tongdonReport.current?.grandTotal),
          }
        : {
            state: hasSourceData ? 'needsSave' : 'missing',
            context: hasSourceData ? 'Chưa có bản tổng hợp đã lưu' : 'Chưa có dữ liệu nguồn',
          }),
    },
  ].map((channel) => ({ ...CHANNEL_META[channel.id], ...STATUS[channel.state], ...channel }))
}

function getExceptionCopy(channel) {
  if (channel.state === 'needsSave') {
    return `${channel.label}: dữ liệu đang hoạt động chưa có bản báo cáo đã lưu.`
  }
  return `${channel.label}: cần bổ sung dữ liệu để theo dõi tuần này.`
}

function getActionCopy(channel) {
  if (channel.state === 'needsSave') return `Lưu số liệu ${channel.label}`
  return `Bổ sung dữ liệu ${channel.label}`
}

function getHeroContent(channels, nextAction) {
  if (nextAction) {
    return {
      eyebrow: nextAction.state === 'needsSave' ? 'Báo cáo tuần cần lưu' : 'Dữ liệu tuần cần bổ sung',
      title: getActionCopy(nextAction),
      description: nextAction.cardCopy,
      actionLabel: getActionCopy(nextAction),
      target: nextAction.id,
      icon: ClipboardList,
    }
  }

  const metricChannel = channels.find((channel) => channel.headline)
  return {
    eyebrow: 'Trạng thái tuần hiện tại',
    title: 'Dữ liệu tuần đã sẵn sàng',
    description: metricChannel
      ? `${metricChannel.headlineLabel}: ${metricChannel.headline}. Không có ngoại lệ từ trạng thái dữ liệu hiện có.`
      : 'Không có ngoại lệ từ trạng thái dữ liệu hiện có.',
    actionLabel: 'Xem báo cáo Tổng đơn',
    target: 'tongdon',
    icon: LayoutGrid,
  }
}
export default function HomeBrief({ onNavigate }) {
  const channels = deriveChannels()
  const exceptions = channels.filter((channel) => channel.state !== 'ready')
  const nextAction = exceptions.find((channel) => channel.id !== 'tongdon') || exceptions[0]
  const totalReady = channels[0].state === 'ready'
  const hero = getHeroContent(channels, nextAction)
  const HeroIcon = hero.icon

  return (
    <div className="home-brief">
      <section className="home-brief-intro" aria-labelledby="home-hero-title">
        <p className="home-brief-eyebrow">{hero.eyebrow}</p>
        <h2 id="home-hero-title">{hero.title}</h2>
        <p className="home-hero-copy">{hero.description}</p>
        <button type="button" className="home-action-primary home-hero-action" onClick={() => onNavigate(hero.target)}>
          <HeroIcon size={18} aria-hidden="true" />
          {hero.actionLabel}
          <ArrowRight size={17} aria-hidden="true" />
        </button>
      </section>

      <section className="home-brief-section" aria-labelledby="home-status-title">
        <div className="home-brief-section-heading">
          <div>
            <p className="home-brief-step">01</p>
            <h2 id="home-status-title">Tình trạng tuần hiện tại</h2>
          </div>
          <p>Mỗi kênh giữ nguyên nhãn tuần hoặc kỳ báo cáo riêng.</p>
        </div>

        <div className="home-channel-grid">
          {channels.map((channel) => {
            const Icon = channel.icon
            return (
              <button
                type="button"
                key={channel.id}
                className="home-channel-card"
                aria-label={`Mở ${channel.label}: ${channel.statusLabel}`}
                onClick={() => onNavigate(channel.id)}
              >
                <span className="home-channel-card-topline">
                  <span className="home-channel-icon"><Icon size={20} aria-hidden="true" /></span>
                  <span className={`home-status-pill is-${channel.tone}`}>
                    {channel.state === 'ready'
                      ? <CircleCheck size={14} aria-hidden="true" />
                      : <CircleAlert size={14} aria-hidden="true" />}
                    {channel.statusLabel}
                  </span>
                </span>
                <span className="home-channel-title-row">
                  <h3 className="home-channel-title">{channel.label}</h3>
                  <ArrowRight size={18} aria-hidden="true" />
                </span>
                <span className="home-channel-context">{channel.context}</span>
                {channel.headline ? (
                  <span className="home-channel-headline">
                    <span>{channel.headlineLabel}</span>
                    <strong>{channel.headline}</strong>
                  </span>
                ) : (
                  <span className="home-channel-guidance">{channel.cardCopy}</span>
                )}
                <span className="home-channel-cta">
                  {channel.state === 'ready' ? 'Mở báo cáo' : getActionCopy(channel)}
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="home-brief-section" aria-labelledby="home-exceptions-title">
        <div className="home-brief-section-heading">
          <div>
            <p className="home-brief-step">02</p>
            <h2 id="home-exceptions-title">Ngoại lệ cần xử lý</h2>
          </div>
          <p>Chỉ phản ánh dữ liệu còn thiếu hoặc chưa được lưu.</p>
        </div>

        {exceptions.length > 0 ? (
          <ul className="home-exception-list">
            {exceptions.map((channel) => (
              <li key={channel.id}>
                <span className="home-exception-icon"><CircleAlert size={17} aria-hidden="true" /></span>
                <span>{getExceptionCopy(channel)}</span>
                <button type="button" onClick={() => onNavigate(channel.id)}>Mở kênh</button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="home-brief-clear-state">
            <CircleCheck size={19} aria-hidden="true" />
            <span>Không có ngoại lệ từ trạng thái dữ liệu hiện có.</span>
          </div>
        )}
      </section>

      <section className="home-brief-section" aria-labelledby="home-actions-title">
        <div className="home-brief-section-heading">
          <div>
            <p className="home-brief-step">03</p>
            <h2 id="home-actions-title">Hành động tiếp theo</h2>
          </div>
          <p>Đi thẳng đến báo cáo cần hoàn tất, không chỉnh sửa dữ liệu tại Trang chủ.</p>
        </div>

        <div className="home-action-bar">
          {nextAction ? (
            <button type="button" className="home-action-primary" onClick={() => onNavigate(nextAction.id)}>
              <ClipboardList size={18} aria-hidden="true" />
              {getActionCopy(nextAction)}
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="home-action-primary" onClick={() => onNavigate('tongdon')}>
              <LayoutGrid size={18} aria-hidden="true" />
              Xem báo cáo Tổng đơn
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          )}
          {totalReady && (
            <button type="button" className="home-action-secondary" onClick={() => onNavigate('guilen8n')}>
              <Send size={17} aria-hidden="true" />
              Gửi báo cáo lên n8n
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
