import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { resetActiveTabCache } from '../../utils/activeTabCache'
import { loadWorkspace } from '../../data/workspace'

const sessionStorageMock = (() => {
  const store = new Map()
  return {
    clear: () => store.clear(),
    getItem: key => store.get(key) ?? null,
    setItem: (key, value) => { store.set(key, String(value)) },
    removeItem: key => store.delete(key),
  }
})()
vi.stubGlobal('sessionStorage', sessionStorageMock)

const authMocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }))
vi.mock('../../supabase', () => ({
  supabaseConfigReady: true,
  supabaseMissingEnv: [],
  assertCloudAvailable: vi.fn().mockResolvedValue(undefined),
  supabase: { auth: { getSession: authMocks.getSession, onAuthStateChange: authMocks.onAuthStateChange, signOut: vi.fn() } },
}))
const workspaceMocks = vi.hoisted(() => {
  const values = new Map()
  return {
    clear: () => values.clear(),
    opsStore: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)); return Promise.resolve() },
      removeItem: key => { values.delete(key); return Promise.resolve() },
    },
  }
})
vi.mock('../../data/workspace', () => ({
  loadWorkspace: vi.fn().mockResolvedValue(undefined),
  clearWorkspaceCache: workspaceMocks.clear,
  opsStore: workspaceMocks.opsStore,
}))

describe('authenticated application shell', () => {
  const stubAuthListener = () => {
    const auth = { fire: undefined }
    authMocks.onAuthStateChange.mockImplementation((callback) => {
      auth.fire = callback
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    })
    return auth
  }

  beforeEach(() => {
    authMocks.getSession.mockResolvedValue({ data: { session: { user: { email: 'operations@cpc1hn.com' } } }, error: null })
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  })
  afterEach(() => {
    cleanup()
    workspaceMocks.clear()
    sessionStorageMock.clear()
    resetActiveTabCache()
    loadWorkspace.mockReset()
    loadWorkspace.mockResolvedValue(undefined)
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
  })

  it('opens on a calm operations brief with status, exceptions, then actions', async () => {
    workspaceMocks.opsStore.setItem('weeks_donC', '{malformed')
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Tình trạng tuần hiện tại',
      'Ngoại lệ cần xử lý',
      'Hành động tiếp theo',
    ])

    for (const channel of ['Tổng đơn', 'Đơn C', 'Đơn DTP', 'TMĐT']) {
      expect(screen.getByRole('button', { name: `Mở ${channel}: Chưa có dữ liệu tuần` })).toBeInTheDocument()
    }
    expect(screen.queryByText(/^0 đơn$/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Chưa có dữ liệu tuần')).toHaveLength(4)
    expect(screen.getByRole('button', { name: 'Bổ sung dữ liệu Đơn C' })).toBeInTheDocument()
  })

  it('shows only saved values and flags an active week that has not been saved', async () => {
    workspaceMocks.opsStore.setItem(
      'weeks_donC',
      JSON.stringify([{ id: 'c-1', label: 'Tuần 32 · Đơn C', data: [{ id: 1 }] }]),
    )
    workspaceMocks.opsStore.setItem('activeWeek_donC', 'c-1')
    workspaceMocks.opsStore.setItem(
      'sheet_reports_donC',
      JSON.stringify([{ id: 'c-1', label: 'Tuần 32 · Đơn C', b24: 316 }]),
    )
    workspaceMocks.opsStore.setItem(
      'weeks_donDTP',
      JSON.stringify([{ id: 'd-1', label: 'Tuần 32 · Đơn DTP', data: [{ id: 2 }] }]),
    )
    workspaceMocks.opsStore.setItem('activeWeek_donDTP', 'd-1')
    workspaceMocks.opsStore.setItem(
      'tmdt_reports',
      JSON.stringify([{ id: 't-1', label: '04/08 – 10/08', total: 92 }]),
    )
    workspaceMocks.opsStore.setItem(
      'tongdon_reports',
      JSON.stringify([
        { id: 'all-1', label: 'Tuần 32', current: { grandTotal: 1450 } },
      ]),
    )

    render(<App />)

    expect(await screen.findByText('316 đơn')).toBeInTheDocument()
    expect(screen.getByText('92 đơn')).toBeInTheDocument()
    expect(screen.getByText('1.450 đơn')).toBeInTheDocument()
    expect(screen.getByText('Chưa lưu số liệu tuần')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: 'Đơn DTP' })).toBeInTheDocument()
    const exceptions = screen.getByRole('region', { name: 'Ngoại lệ cần xử lý' })
    expect(within(exceptions).getAllByRole('listitem')).toHaveLength(1)
  })

  it('shows a clear week and offers n8n only when every channel has saved data', async () => {
    workspaceMocks.opsStore.setItem('sheet_reports_donC', JSON.stringify([{ id: 'c-1', b24: 316 }]))
    workspaceMocks.opsStore.setItem('sheet_reports_donDTP', JSON.stringify([{ id: 'd-1', b24: 144 }]))
    workspaceMocks.opsStore.setItem('tmdt_reports', JSON.stringify([{ id: 't-1', total: 92 }]))
    workspaceMocks.opsStore.setItem(
      'tongdon_reports',
      JSON.stringify([{ id: 'all-1', current: { grandTotal: 1450 } }]),
    )

    render(<App />)

    expect(
      await screen.findByText('Không có ngoại lệ từ trạng thái dữ liệu hiện có.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo lên n8n' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Gửi lên n8n' })).toBeInTheDocument()
  })

  it('shows analytics readiness only for an explicitly published current cycle', async () => {
    workspaceMocks.opsStore.setItem('sheet_reports_donC', JSON.stringify([{ id: 'c-1', b24: 316 }]))
    workspaceMocks.opsStore.setItem('sheet_reports_donDTP', JSON.stringify([{ id: 'd-1', b24: 144 }]))
    workspaceMocks.opsStore.setItem(
      'tongdon_reports',
      JSON.stringify([{ id: 'all-1', weekKey: 'c-1_d-1', current: { grandTotal: 1450 } }]),
    )
    workspaceMocks.opsStore.setItem(
      'reporting_cycles',
      JSON.stringify([{ cycle_key: 'c-1_d-1', status: 'ready_for_analytics' }]),
    )

    render(<App />)

    expect(await screen.findByText('Chu kỳ hiện tại: sẵn sàng phân tích')).toBeInTheDocument()
  })

  it('treats invalid storage entries as missing instead of crashing the brief', async () => {
    workspaceMocks.opsStore.setItem('weeks_donC', JSON.stringify([null]))
    workspaceMocks.opsStore.setItem('sheet_reports_donC', JSON.stringify([null]))

    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })).toBeInTheDocument()
    expect(screen.getAllByText('Chưa có dữ liệu tuần')).toHaveLength(4)
  })

  it.each([
    ['Tổng đơn', 'Tổng đơn'],
    ['Đơn C', 'Giao hàng Đơn C'],
    ['Đơn DTP', 'Giao hàng Đơn DTP'],
    ['TMĐT', 'Đơn hàng Sàn TMĐT'],
  ])('opens the existing %s tab from its status card', async (channel, pageTitle) => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: `Mở ${channel}: Chưa có dữ liệu tuần` }))

    expect(screen.getByRole('heading', { level: 1, name: pageTitle })).toBeInTheDocument()
  })

  it('keeps the current tab when Supabase refreshes the token on tab focus', async () => {
    const auth = stubAuthListener()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Đơn hàng Sàn TMĐT' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Đơn hàng Sàn TMĐT' })).toBeInTheDocument()

    // Giữ loadWorkspace pending để trạng thái 'syncing' commit thật (giống mạng chậm ngoài thực tế)
    let releaseWorkspace
    loadWorkspace.mockImplementationOnce(() => new Promise((resolve) => { releaseWorkspace = resolve }))

    // Supabase bắn TOKEN_REFRESHED khi tab trình duyệt được focus lại
    act(() => { auth.fire('TOKEN_REFRESHED', { user: { email: 'operations@cpc1hn.com' } }) })
    await act(async () => { releaseWorkspace?.() })

    expect(screen.queryByText('Đang tải không gian làm việc trên đám mây...')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Đơn hàng Sàn TMĐT' })).toBeInTheDocument()
  })

  it('returns to the login screen when the session signs out', async () => {
    const auth = stubAuthListener()

    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })

    await act(async () => {
      auth.fire('SIGNED_OUT', null)
    })

    expect(await screen.findByRole('heading', { level: 1, name: 'Chào mừng quay trở lại' })).toBeInTheDocument()
  })

  it('uses official CPC1HN branding and exposes semantic navigation landmarks', async () => {
    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Điều hướng chính' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'CPC1HN' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content')
  })

  it('starts with the navigation drawer closed on a mobile viewport', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })

    render(<App />)

    expect(await screen.findByRole('button', { name: 'Mở menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    const sidebar = document.getElementById('primary-sidebar')
    expect(sidebar).toHaveAttribute('aria-hidden', 'true')
    expect(sidebar).toHaveAttribute('inert')
  })
})
