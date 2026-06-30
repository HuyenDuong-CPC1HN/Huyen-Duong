import { useState } from 'react'
import { Truck, ShoppingBag, Package, Home, Menu, X, ChevronRight, ChevronDown, FileBarChart2, LayoutGrid, Send } from 'lucide-react'
import { SHEETS } from './config'
import SheetTab from './components/SheetTab'
import TmdtTab from './components/TmdtTab'
import TongDonTab from './components/TongDonTab'
import N8nWebhookForm from './components/N8nWebhookForm'

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
  const [active, setActive] = useState('donC')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [expanded, setExpanded] = useState({ baocao: true })

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
      <aside className={`flex-shrink-0 flex flex-col bg-[#1e3a5f] text-white transition-all duration-300 ${sidebarOpen ? 'w-56' : 'w-0 overflow-hidden'}`}>
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
          <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center flex-shrink-0">
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
                  onClick={() => handleNav(item.id, hasChildren)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-white/15 text-white font-medium border-l-4 border-teal-400'
                      : 'text-white/70 hover:bg-white/10 hover:text-white border-l-4 border-transparent'
                  }`}
                >
                  <Icon size={16} className="flex-shrink-0" />
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
                          key={child.id}
                          onClick={() => setActive(child.id)}
                          className={`w-full flex items-center gap-3 pr-4 py-2 text-sm transition-colors whitespace-nowrap ${
                            isChildActive
                              ? 'bg-white/15 text-white font-medium border-l-4 border-teal-400'
                              : 'text-white/60 hover:bg-white/10 hover:text-white border-l-4 border-transparent'
                          }`}
                        >
                          <span style={{ width: 28, flexShrink: 0 }} />
                          <ChildIcon size={14} className="flex-shrink-0" />
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

        <div className="px-4 py-3 border-t border-white/10 text-xs text-white/40">
          Báo cáo giao hàng v1.0
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex-shrink-0 bg-white border-b border-gray-200 shadow-sm">
          <div className="flex items-center gap-3 px-4 h-12">
            <button onClick={() => setSidebarOpen(o => !o)} className="p-1.5 rounded hover:bg-gray-100 text-gray-500">
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <nav className="flex items-center gap-1 text-sm text-gray-500">
              {crumbs.map((c, i) => (
                <span key={i} className="flex items-center gap-1">
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
          {active === 'tongdon'  && <TongDonTab />}
          {active === 'donC'    && <SheetTab sheetId={SHEETS.donC.id}   gid={SHEETS.donC.gid}   type="donC" />}
          {active === 'donDTP'  && <SheetTab sheetId={SHEETS.donDTP.id} gid={SHEETS.donDTP.gid} type="donDTP" />}
          {active === 'tmdt'    && <TmdtTab />}
          {active === 'guilen8n' && <N8nWebhookForm />}
        </main>
      </div>
    </div>
  )
}
