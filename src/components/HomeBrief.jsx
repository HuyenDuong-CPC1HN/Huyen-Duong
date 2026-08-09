import {
  ArrowRight,
  CircleAlert,
  CircleCheck,
  ClipboardList,
  LayoutGrid,
  Package,
  Send,
  ShoppingBag,
  Truck,
} from 'lucide-react'

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
  donC: { label: 'Đơn C', icon: Truck, headlineLabel: 'Giao ≤24h đã lưu' },
  donDTP: { label: 'Đơn DTP', icon: Package, headlineLabel: 'Giao ≤24h đã lưu' },
  tmdt: { label: 'TMĐT', icon: ShoppingBag, headlineLabel: 'Tổng đơn đã lưu' },
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

function deriveSheetChannel(type) {
  const weeks = readList(`weeks_${type}`)
  const reports = readList(`sheet_reports_${type}`)
  const activeId = localStorage.getItem(`activeWeek_${type}`)
  const activeWeek = weeks.find((week) => week.id === activeId) || weeks.at(-1)
  const activeReport = reports.find((report) => report.id === (activeWeek?.id || activeId))
    || (!activeWeek ? reports[0] : null)

  if (activeReport) {
    return {
      state: 'ready',
      context: activeReport.label || activeWeek?.label || 'Báo cáo đã lưu',
      headline: formatOrders(activeReport.b24),
    }
  }

  if (activeWeek && Array.isArray(activeWeek.data) && activeWeek.data.length > 0) {
    return { state: 'needsSave', context: activeWeek.label || 'Tuần đang hoạt động' }
  }

  return { state: 'missing', context: activeWeek?.label || 'Chưa chọn tuần dữ liệu' }
}

function deriveChannels() {
  const donC = deriveSheetChannel('donC')
  const donDTP = deriveSheetChannel('donDTP')
  const tmdtReports = readList('tmdt_reports')
  const tongdonReports = readList('tongdon_reports')
  const tmdtReport = tmdtReports[0]
  const tongdonReport = tongdonReports[0]
  const hasSourceData = [
    donC.state !== 'missing',
    donDTP.state !== 'missing',
    tmdtReports.length > 0,
    readList('sheet_reports_donC').length > 0,
    readList('sheet_reports_donDTP').length > 0,
  ].some(Boolean)

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
    { id: 'donC', ...donC },
    { id: 'donDTP', ...donDTP },
    {
      id: 'tmdt',
      ...(tmdtReport
        ? {
            state: 'ready',
            context: tmdtReport.label || 'Báo cáo đã lưu',
            headline: formatOrders(tmdtReport.total),
          }
        : { state: 'missing', context: 'Chưa có báo cáo TMĐT đã lưu' }),
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

export default function HomeBrief({ onNavigate }) {
  const channels = deriveChannels()
  const exceptions = channels.filter((channel) => channel.state !== 'ready')
  const nextAction = exceptions.find((channel) => channel.id !== 'tongdon') || exceptions[0]
  const totalReady = channels[0].state === 'ready'

  return (
    <div className="home-brief">
      <div className="home-brief-intro">
        <p className="home-brief-eyebrow">Tóm tắt vận hành</p>
        <p>
          Theo dõi nhanh dữ liệu đang hoạt động hoặc báo cáo gần nhất đã lưu của từng kênh.
        </p>
      </div>

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
