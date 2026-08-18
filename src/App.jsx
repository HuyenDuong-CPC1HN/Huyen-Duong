import { useEffect, useRef, useState } from 'react'
import { Truck, ShoppingBag, Package, Home, Menu, X, ChevronRight, ChevronDown, FileBarChart2, LayoutGrid, Send, RefreshCw, LogOut, PanelLeftClose } from 'lucide-react'
import { assertCloudAvailable, supabase, supabaseConfigReady, supabaseMissingEnv } from './supabase'
import { loadWorkspace } from './data/workspace'
import SheetTab from './components/SheetTab'
import TmdtTab from './components/TmdtTab'
import TongDonTab from './components/TongDonTab'
import N8nWebhookForm from './components/N8nWebhookForm'
import Login from './components/Login'
import HomeBrief from './components/HomeBrief'
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
  const [authState, setAuthState] = useState('checking') // checking | loggedOut | syncing | ready | blocked
  const [user, setUser] = useState(null)
  const [blockingError, setBlockingError] = useState('')

  useEffect(() => {
    const block = (event) => {
      setBlockingError(event.detail || 'Không thể ghi dữ liệu lên Supabase.')
      setAuthState('blocked')
    }
    window.addEventListener('ops-store-error', block)
    return () => window.removeEventListener('ops-store-error', block)
  }, [])

  useEffect(() => {
    if (!supabaseConfigReady || !supabase) return undefined
    let active = true
    const openWorkspace = async (session) => {
      if (!session) {
        if (active) { setUser(null); setAuthState('loggedOut') }
        return
      }
      if (active) { setUser(session.user); setAuthState('syncing') }
      try {
        await assertCloudAvailable(supabase)
        await loadWorkspace(supabase)
        if (active) setAuthState('ready')
      } catch (error) {
        if (active) {
          setBlockingError(error.message || 'Không thể kết nối dữ liệu đám mây.')
          setAuthState('blocked')
        }
      }
    }
    const boot = async () => {
      try {
        await assertCloudAvailable(supabase)
        const { data, error } = await supabase.auth.getSession()
        if (error) throw error
        await openWorkspace(data.session)
      } catch (error) {
        if (active) {
          setBlockingError(error.message || 'Ứng dụng chỉ hoạt động khi có Internet.')
          setAuthState('blocked')
        }
      }
    }
    void boot()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Refresh token khi tab được focus lại chỉ cập nhật user, không tải lại workspace
      // để tránh unmount màn hình hiện tại (mất tab đang mở).
      if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (active && session) setUser(session.user)
        return
      }
      void openWorkspace(session)
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  if (!supabaseConfigReady) {
    return (
      <div className="app-loading-state" role="alert">
        <img src={cpcLogo} alt="CPC1HN" width="78" height="81" />
        <strong>Thiếu cấu hình Supabase</strong>
        <span>
          Local: thêm các key sau vào <code>.env.local</code> (xem <code>.env.example</code>) rồi chạy lại{' '}
          <code>npm run dev</code>. Production: thêm cùng key trên Vercel (Production) rồi Redeploy:
        </span>
        <ul style={{ textAlign: 'left', margin: 0, paddingLeft: 18, color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
          {supabaseMissingEnv.map((key) => (
            <li key={key}><code>{key}</code></li>
          ))}
        </ul>
      </div>
    )
  }

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

  if (authState === 'blocked') {
    return (
      <div className="app-loading-state" role="alert">
        <img src={cpcLogo} alt="CPC1HN" width="78" height="81" />
        <strong>Ứng dụng chỉ hoạt động khi có Internet</strong>
        <span>{blockingError}</span>
        {/reporting_cycles|schema cache/i.test(blockingError || '') ? (
          <span>
            Chưa chạy migration analytics trên Supabase. Mở SQL Editor, chạy toàn bộ file
            {' '}<code>supabase/migrations/20260809_analytics_foundation.sql</code>, rồi tải lại trang.
          </span>
        ) : (
          <span>Kiểm tra kết nối mạng và trạng thái Supabase, sau đó tải lại trang.</span>
        )}
      </div>
    )
  }

  if (authState === 'syncing') {
    return (
      <div className="app-loading-state" role="status" aria-live="polite">
        <img src={cpcLogo} alt="CPC1HN" width="78" height="81" />
        <RefreshCw size={22} className="animate-spin" aria-hidden="true" />
        <span>Đang tải không gian làm việc trên đám mây...</span>
      </div>
    )
  }

  return <AppContent user={user} />
}

function AppContent({ user }) {
  const [active, setActive] = useState(() => {
    try {
      return sessionStorage.getItem('appActiveTab') || 'home'
    } catch {
      return 'home'
    }
  })
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 900,
  )
  const [expanded, setExpanded] = useState({ baocao: true })
  const menuTriggerRef = useRef(null)

  const closeSidebar = () => {
    setSidebarOpen(false)
    requestAnimationFrame(() => menuTriggerRef.current?.focus())
  }

  // Persist active tab to sessionStorage so it survives tab visibility changes
  useEffect(() => {
    try {
      sessionStorage.setItem('appActiveTab', active)
    } catch {
      // sessionStorage unavailable (private mode, quota exceeded, etc.)
    }
  }, [active])

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
            onClick={() => supabase.auth.signOut()}
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
            <HomeBrief
              onNavigate={(id) => {
                setActive(id)
                if (['tongdon', 'donC', 'donDTP', 'tmdt'].includes(id)) {
                  setExpanded((current) => ({ ...current, baocao: true }))
                }
              }}
            />
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
