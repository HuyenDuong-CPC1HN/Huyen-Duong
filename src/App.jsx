import { useState, useEffect } from 'react'
import { Truck, ShoppingBag, Package, Home, Menu, X, ChevronRight, ChevronDown, FileBarChart2, LayoutGrid, Send, RefreshCw, LogOut } from 'lucide-react'
import { onAuthStateChanged, signOut } from 'firebase/auth'
import { auth } from './firebase'
import { hydrateLocalStorageFromCloud, startCloudSync, pushAllLocalStorageToCloud } from './cloudSync'
import SheetTab from './components/SheetTab'
import TmdtTab from './components/TmdtTab'
import TongDonTab from './components/TongDonTab'
import N8nWebhookForm from './components/N8nWebhookForm'
import Login from './components/Login'

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
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <RefreshCw size={28} className="animate-spin text-gray-400" />
      </div>
    )
  }

  if (authState === 'loggedOut') {
    return <Login />
  }

  if (authState === 'syncing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 gap-3">
        <RefreshCw size={28} className="animate-spin text-[#1e3a5f]" />
        <p className="text-sm text-gray-500">Đang đồng bộ dữ liệu...</p>
      </div>
    )
  }

  return <AppContent user={user} />
}

function AppContent({ user }) {
  const [active, setActive] = useState('donC')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expanded, setExpanded] = useState({ baocao: true })
  const [pushStatus, setPushStatus] = useState('idle') // idle | pushing | done

  const handlePushAll = async () => {
    setPushStatus('pushing')
    const count = await pushAllLocalStorageToCloud()
    setPushStatus('done')
    alert(`Đã đẩy ${count} mục dữ liệu lên đám mây.`)
    setTimeout(() => setPushStatus('idle'), 2000)
  }

  const crumbs = BREADCRUMB[active] || []

  const handleNav = (id, hasChildren) => {
    if (hasChildren) {
      setExpanded(e => ({ ...e, [id]: !e[id] }))
    } else {
      setActive(id)
    }
  }

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">

      {/* Sidebar */}
      <aside className={`shrink-0 flex flex-col bg-[#1e3a5f] text-white transition-all duration-300 ${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0">
            <span className="text-[#1e3a5f] font-bold text-xs">CPC</span>
          </div>
          <span className="font-bold text-base tracking-wide whitespace-nowrap">CPC1HN</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 overflow-y-auto">
          {NAV.map(item => {
            const Icon = item.icon
            const hasChildren = !!item.children
            const isExpanded = expanded[item.id]
            const isActive = active === item.id

            return (
              <div key={item.id}>
                {/* Parent item */}
                <button
                  type="button"
                  onClick={() => handleNav(item.id, hasChildren)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-white/15 text-white font-medium border-l-4 border-teal-400'
                      : 'text-white/70 hover:bg-white/10 hover:text-white border-l-4 border-transparent'
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="flex-1 text-left">{item.label}</span>
                  {hasChildren && (
                    <ChevronDown
                      size={14}
                      className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>

                {/* Children */}
                {hasChildren && isExpanded && (
                  <div className="bg-black/20">
                    {item.children.map(child => {
                      const ChildIcon = child.icon
                      const isChildActive = active === child.id
                      return (
                        <button
                          type="button"
                          key={child.id}
                          onClick={() => setActive(child.id)}
                          className={`w-full flex items-center gap-3 pr-4 py-2 text-sm transition-colors whitespace-nowrap ${
                            isChildActive
                              ? 'bg-white/15 text-white font-medium border-l-4 border-teal-400'
                              : 'text-white/60 hover:bg-white/10 hover:text-white border-l-4 border-transparent'
                          }`}
                        >
                          <span style={{ width: 28, flexShrink: 0 }} />
                          <ChildIcon size={14} className="shrink-0" />
                          {child.label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="px-4 py-3 border-t border-white/10">
          <div className="text-xs text-white/40 truncate mb-2">{user?.email}</div>
          <button
            type="button"
            onClick={handlePushAll}
            disabled={pushStatus === 'pushing'}
            className="w-full flex items-center gap-2 text-xs text-white/50 hover:text-white/90 transition-colors mb-2 disabled:opacity-50"
            title="Đẩy toàn bộ dữ liệu trên máy này lên đám mây (dùng khi máy này có dữ liệu cũ chưa đồng bộ)"
          >
            <RefreshCw size={13} className={pushStatus === 'pushing' ? 'animate-spin' : ''} />
            {pushStatus === 'pushing' ? 'Đang đồng bộ...' : 'Đồng bộ toàn bộ dữ liệu'}
          </button>
          <button
            type="button"
            onClick={() => signOut(auth)}
            className="w-full flex items-center gap-2 text-xs text-white/50 hover:text-white/90 transition-colors"
          >
            <LogOut size={13} /> Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="shrink-0 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 px-4 h-12">
            <button type="button" onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <nav className="flex items-center gap-1 text-sm text-gray-500">
              {crumbs.map((c, i) => (
                <span key={c} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={13} className="text-gray-300" />}
                  <span className={i === crumbs.length - 1 ? 'text-gray-800 font-medium' : ''}>{c}</span>
                </span>
              ))}
            </nav>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-5">
          {active === 'home' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {NAV.find(n => n.id === 'baocao').children.map(item => {
                const Icon = item.icon
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => { setActive(item.id); setExpanded(e => ({ ...e, baocao: true })) }}
                    className="bg-white rounded-xl border border-gray-200 p-6 text-left hover:shadow-md hover:border-blue-300 transition-all group"
                  >
                    <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100">
                      <Icon size={22} className="text-blue-600" />
                    </div>
                    <div className="font-semibold text-gray-800">{item.label}</div>
                    <div className="text-sm text-gray-400 mt-1">Xem danh sách đơn hàng →</div>
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
