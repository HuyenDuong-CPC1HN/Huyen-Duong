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
    workspaceMocks.opsStore.setItem('tongdon_reports', '{malformed')
    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Bổ sung dữ liệu Tổng đơn',
      'Tình trạng tuần hiện tại',
      'Ngoại lệ cần xử lý',
      'Hành động tiếp theo',
    ])

    const hero = screen.getByRole('region', { name: 'Bổ sung dữ liệu Tổng đơn' })
    expect(within(hero).getByText('Dữ liệu tuần cần bổ sung')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mở Tổng đơn: Chưa có dữ liệu tuần' })).toBeInTheDocument()
    expect(screen.queryByText(/^0 đơn$/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Chưa có dữ liệu tuần')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Bổ sung dữ liệu Tổng đơn' })).toHaveLength(2)
  })

  it('chỉ còn thẻ Tổng đơn: không còn thẻ Đơn C, Đơn DTP, TMĐT và không còn dòng chu kỳ phân tích', async () => {
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })

    for (const channel of ['Đơn C', 'Đơn DTP', 'TMĐT']) {
      expect(screen.queryByRole('heading', { level: 3, name: channel })).not.toBeInTheDocument()
    }
    expect(screen.queryByText(/Chu kỳ hiện tại/)).not.toBeInTheDocument()
  })

  it('Gộp kênh đã lưu số liệu tuần nhưng Tổng đơn chưa lưu thì nhắc lưu Tổng đơn', async () => {
    workspaceMocks.opsStore.setItem('unified_trial_reports_donSO', JSON.stringify([{ id: '2026-09-21T00:00:00.000Z', label: 'Đơn SO tuần 39' }]))

    render(<App />)

    expect(await screen.findByText('Chưa lưu số liệu tuần')).toBeInTheDocument()
    const hero = screen.getByRole('region', { name: 'Lưu số liệu Tổng đơn' })
    expect(within(hero).getByText('Báo cáo tuần cần lưu')).toBeInTheDocument()
  })

  it('shows a clear week and offers n8n once Tổng đơn has a saved report', async () => {
    workspaceMocks.opsStore.setItem(
      'tongdon_reports',
      JSON.stringify([{ id: 'all-1', label: 'Tuần 32', current: { grandTotal: 1450 } }]),
    )

    render(<App />)

    expect(await screen.findByText('1.450 đơn')).toBeInTheDocument()
    expect(screen.getByText('Không có ngoại lệ từ trạng thái dữ liệu hiện có.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Gửi báo cáo lên n8n' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Gửi lên n8n' })).toBeInTheDocument()
  })

  it('uses the existing next-action destination from the hero CTA', async () => {
    render(<App />)

    const hero = await screen.findByRole('region', { name: 'Bổ sung dữ liệu Tổng đơn' })
    fireEvent.click(within(hero).getByRole('button', { name: 'Bổ sung dữ liệu Tổng đơn' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Tổng đơn' })).toBeInTheDocument()
  })

  it('keeps a valid zero metric in the ready hero', async () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([{ id: 'all-1', current: { grandTotal: 0 } }]))
    render(<App />)

    const hero = await screen.findByRole('region', { name: 'Dữ liệu tuần đã sẵn sàng' })
    expect(
      within(hero).getByText('Tổng đơn đã lưu: 0 đơn. Không có ngoại lệ từ trạng thái dữ liệu hiện có.'),
    ).toBeInTheDocument()
  })

  it('omits an invalid metric from the ready hero', async () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([{ id: 'all-1', current: { grandTotal: 'invalid' } }]))
    render(<App />)

    const hero = await screen.findByRole('region', { name: 'Dữ liệu tuần đã sẵn sàng' })
    expect(within(hero).getByText('Không có ngoại lệ từ trạng thái dữ liệu hiện có.')).toBeInTheDocument()
  })

  it('treats invalid storage entries as missing instead of crashing the brief', async () => {
    workspaceMocks.opsStore.setItem('tongdon_reports', JSON.stringify([null]))

    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })).toBeInTheDocument()
    expect(screen.getAllByText('Chưa có dữ liệu tuần')).toHaveLength(1)
  })

  it('opens the Tổng đơn tab from its status card', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Mở Tổng đơn: Chưa có dữ liệu tuần' }))

    expect(screen.getByRole('heading', { level: 1, name: 'Tổng đơn' })).toBeInTheDocument()
  })

  it('menu không còn 3 tab Giao hàng Đơn C/DTP, Sàn TMĐT; Gộp kênh bỏ chữ (Thử nghiệm)', async () => {
    render(<App />)
    await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })

    for (const label of ['Giao hàng Đơn C', 'Giao hàng Đơn DTP', 'Đơn hàng Sàn TMĐT', 'Gộp kênh (Thử nghiệm)']) {
      expect(screen.queryByRole('button', { name: label })).not.toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Gộp kênh' })).toBeInTheDocument()
  })

  it('tab đã nhớ là tab đã gỡ (Giao hàng Đơn C) thì mở Trang chủ thay vì màn hình trống', async () => {
    sessionStorageMock.setItem('appActiveTab', 'donC')

    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Trang chủ' })).toBeInTheDocument()
  })

  it('keeps the current tab when Supabase refreshes the token on tab focus', async () => {
    const auth = stubAuthListener()

    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: 'Hàng chậm luân chuyển' }))
    expect(screen.getByRole('heading', { level: 1, name: 'Hàng chậm luân chuyển' })).toBeInTheDocument()

    // Giữ loadWorkspace pending để trạng thái 'syncing' commit thật (giống mạng chậm ngoài thực tế)
    let releaseWorkspace
    loadWorkspace.mockImplementationOnce(() => new Promise((resolve) => { releaseWorkspace = resolve }))

    // Supabase bắn TOKEN_REFRESHED khi tab trình duyệt được focus lại
    act(() => { auth.fire('TOKEN_REFRESHED', { user: { email: 'operations@cpc1hn.com' } }) })
    await act(async () => { releaseWorkspace?.() })

    expect(screen.queryByText('Đang tải không gian làm việc trên đám mây...')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Hàng chậm luân chuyển' })).toBeInTheDocument()
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
