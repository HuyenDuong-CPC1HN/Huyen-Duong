import { useEffect, useRef, useState } from 'react'
import { Truck, ShoppingBag, Package, Home, Menu, X, ChevronRight, ChevronDown, FileBarChart2, LayoutGrid, Send, RefreshCw, LogOut, PanelLeftClose } from 'lucide-react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { hydrateLocalStorageFromCloud, startCloudSync, pushAllLocalStorageToCloud } from './cloudSync'
import SheetTab from './components/SheetTab'
import TmdtTab from './components/TmdtTab'
import TongDonTab from './components/TongDonTab'
import N8nWebhookForm from './components/N8nWebhookForm'
import Login from './components/Login'
import cpcLogo from './assets/cpc1hn_logo.png'

const NAV = [
  { id: 'home', label: 'Trang chủ', icon: Home },
  {
    id: 'baocao',
    label: 'Báo cáo giao hàng',
    icon: FileBarChart2,
    children: [
      { id: 'tongdon', label: 'Tổng đơn',           icon: LayoutGrid },
      { id: 'donC',    label: 'Giao hàng Đơn C',    icon: Truck },
      { id: 'donDTP',  label: 'Giao hàng Đơn DTP',  icon: Package },
      { id: 'tmdt',    label: 'Đơn hàng Sàn TMĐT',  icon: ShoppingBag },
    ],
  },
  { id: 'guilen8n', label: 'Gửi lên n8n', icon: Send },
]

const BREADCRUMB = {
  home:     ['Trang chủ'],
  tongdon:  ['Trang chủ', 'Báo cáo giao hàng', 'Tổng đơn'],
  donC:     ['Trang chủ', 'Báo cáo giao hàng', 'Giao hàng Đơn C'],
  donDTP:   ['Trang chủ', 'Báo cáo giao hàng', 'Giao hàng Đơn DTP'],
  tmdt:     ['Trang chủ', 'Báo cáo giao hàng', 'Đơn hàng Sàn TMĐT'],
  guilen8n: ['Trang chủ', 'Gửi lên n8n'],
}

export default function App() {
  const [authState, setAuthState] = useState('checking') // checking | loggedOut | syncing | ready
  const [user, setUser] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null)
        setAuthState('loggedOut')
        return
      }
      setUser(u)
      setAuthState('syncing')
      await hydrateLocalStorageFromCloud()
      startCloudSync()
      setAuthState('ready')
    })
    return unsub
  }, [])

  if (authState === 'checking') {
    return (
      <div className="app-loading-state" role="status" aria-live="polite">
        <img src={cpcLogo} alt="CPC1HN" width="78" height="81" />
        <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
        <span>Đang khởi tạo ứng dụng...</span>
      </div>
    )
  }

  if (authState === 'loggedOut') {
    return <Login />
  }

  if (authState === 'syncing') {
    return (
      <div className="app-loading-state" role="status" aria-live="polite">
        <img src={cpcLogo} alt="CPC1HN" width="78" height="81" />
        <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
        <span>Đang đồng bộ dữ liệu...</span>
      </div>
    )
  }

  return <AppContent user={user} />
}

function AppContent({ user }) {
  const [active, setActive] = useState('donC')
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 900,
  )
  const [expanded, setExpanded] = useState({ baocao: true })
  const [pushStatus, setPushStatus] = useState('idle') // idle | pushing | done
  const menuTriggerRef = useRef(null)

  const closeSidebar = () => {
    setSidebarOpen(false)
    requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }

  const handlePushAll = async () => {
    setPushStatus('pushing')
    const count = await pushAllLocalStorageToCloud()
    setPushStatus('done')
    alert(`Đã đẩy ${count} mục dữ liệu lên đám mây.`)
    setTimeout(() => setPushStatus('idle'), 2000)
  }

  const crumbs = BREADCRUMB[active] || []
  const pageTitle = crumbs.at(-1) || 'CPC1HN'

  const handleNav = (id, hasChildren) => {
    if (hasChildren) {
      setExpanded(e => ({ ...e, [id]: !e[id] }))
    } else {
      setActive(id)
    }
  }

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#main-content">Bỏ qua điều hướng</a>

      {sidebarOpen && (
        <button
          type="button"
          className="dashboard-sidebar-scrim is-visible"
          onClick={closeSidebar}
          aria-label="Đóng menu"
        />
      )}

      {/* Sidebar */}
      <aside
        id="primary-sidebar"
        className={`dashboard-sidebar ${sidebarOpen ? 'is-open' : 'is-closed'}`}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        {/* Logo */}
        <div className="dashboard-brand">
          <img src={cpcLogo} alt="CPC1HN" width="104" height="108" />
          <button type="button" className="dashboard-sidebar-close" onClick={closeSidebar} aria-label="Đóng menu">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="dashboard-nav" aria-label="Điều hướng chính">
          {NAV.map(item => {
            const Icon = item.icon
            const hasChildren = !!item.children
            const isExpanded = expanded[item.id]
            const isActive = active === item.id
            const isSectionActive = isActive || item.children?.some(child => child.id === active)

            return (
              <div key={item.id} className="dashboard-nav-group">
                {/* Parent item */}
                <button
                  type="button"
                  onClick={() => handleNav(item.id, hasChildren)}
                  className={`dashboard-nav-item ${isSectionActive ? 'is-active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  aria-controls={hasChildren ? `nav-group-${item.id}` : undefined}
                >
                  <Icon size={18} className="shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                  {hasChildren && (
                    <ChevronDown
                      size={15}
                      className={`dashboard-nav-chevron ${isExpanded ? 'is-expanded' : ''}`}
                      aria-hidden="true"
                    />
                  )}
                </button>

                {/* Children */}
                {hasChildren && isExpanded && (
                  <div id={`nav-group-${item.id}`} className="dashboard-nav-children">
                    {item.children.map(child => {
                      const ChildIcon = child.icon
                      const isChildActive = active === child.id
                      return (
                        <button
                          type="button"
                          key={child.id}
                          onClick={() => { setActive(child.id); if (window.innerWidth < 900) closeSidebar() }}
                          className={`dashboard-nav-child ${isChildActive ? 'is-active' : ''}`}
                          aria-current={isChildActive ? 'page' : undefined}
                        >
                          <ChildIcon size={16} aria-hidden="true" />
                          <span>{child.label}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="dashboard-account">
          <div className="dashboard-account-label">Đang đăng nhập</div>
          <div className="dashboard-account-email">{user?.email}</div>
          <button
            type="button"
            onClick={handlePushAll}
            disabled={pushStatus === 'pushing'}
            className="dashboard-account-action"
            title="Đẩy toàn bộ dữ liệu trên máy này lên đám mây (dùng khi máy này có dữ liệu cũ chưa đồng bộ)"
          >
            <RefreshCw size={16} className={pushStatus === 'pushing' ? 'animate-spin' : ''} aria-hidden="true" />
            {pushStatus === 'pushing' ? 'Đang đồng bộ...' : 'Đồng bộ toàn bộ dữ liệu'}
          </button>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="dashboard-account-action is-logout"
          >
            <LogOut size={16} aria-hidden="true" /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="dashboard-workspace">
        {/* Header */}
        <header className="dashboard-header">
          <div className="dashboard-header-inner">
            <button
              ref={menuTriggerRef}
              type="button"
              onClick={() => setSidebarOpen(o => !o)}
              className="dashboard-menu-trigger"
              aria-controls="primary-sidebar"
              aria-expanded={sidebarOpen}
              aria-label={sidebarOpen ? 'Thu gọn menu' : 'Mở menu'}
            >
              {sidebarOpen ? <PanelLeftClose size={20} /> : <Menu size={20} />}
            </button>
            <div className="dashboard-page-context">
              <nav className="dashboard-breadcrumb" aria-label="Đường dẫn trang">
                {crumbs.map((c, i) => (
                  <span key={c} className="dashboard-breadcrumb-item">
                    {i > 0 && <ChevronRight size={13} aria-hidden="true" />}
                    <span aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c}</span>
                  </span>
                ))}
              </nav>
              <h1>{pageTitle}</h1>
            </div>
          </div>
        </header>

        {/* Content */}
        <main id="main-content" className="dashboard-main" tabIndex="-1">
          {active === 'home' && (
            <div className="dashboard-home-grid">
              {NAV.find(n => n.id === 'baocao').children.map(item => {
                const Icon = item.icon
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => { setActive(item.id); setExpanded(e => ({ ...e, baocao: true })) }}
                    className="dashboard-home-card"
                  >
                    <div className="dashboard-home-icon">
                      <Icon size={22} aria-hidden="true" />
                    </div>
                    <div className="dashboard-home-title">{item.label}</div>
                    <div className="dashboard-home-copy">Xem báo cáo và danh sách đơn hàng</div>
                  </button>
                )
              })}
            </div>
          )}
          {active === 'tongdon'  && <TongDonTab onNavigate={setActive} />}
          {active === 'donC'    && <SheetTab type="donC" />}
          {active === 'donDTP'  && <SheetTab type="donDTP" />}
          {active === 'tmdt'    && <TmdtTab />}
          {active === 'guilen8n' && <N8nWebhookForm />}
        </main>
      </div>
    </div>
  )
}
