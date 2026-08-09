import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const authMocks = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }))

vi.mock('./supabase', () => ({
  supabaseConfigReady: true,
  supabaseMissingEnv: [],
  supabase: { auth: { getSession: authMocks.getSession, onAuthStateChange: authMocks.onAuthStateChange, signOut: vi.fn() } },
  assertCloudAvailable: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./data/workspace', () => ({
  loadWorkspace: vi.fn().mockResolvedValue(undefined),
}))

describe('Supabase application gate', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows a Vietnamese configuration screen when Supabase env is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')
    vi.doUnmock('./supabase')
    vi.resetModules()
    const { default: ConfiguredApp } = await import('./App')

    render(<ConfiguredApp />)

    expect(screen.getByRole('alert')).toHaveTextContent('Thiếu cấu hình Supabase')
    expect(screen.getByText('VITE_SUPABASE_URL')).toBeInTheDocument()
    expect(screen.getByText('VITE_SUPABASE_ANON_KEY')).toBeInTheDocument()
    vi.unstubAllEnvs()
  })

  it('shows Login when the Supabase session is absent', async () => {
    authMocks.getSession.mockResolvedValue({ data: { session: null }, error: null })
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })

    render(<App />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Chào mừng quay trở lại' })).toBeInTheDocument()
  })

  it('blocks the workspace with a Vietnamese online-only message when cloud health fails', async () => {
    authMocks.getSession.mockRejectedValue(new Error('network'))
    authMocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Ứng dụng chỉ hoạt động khi có Internet')
  })
})
