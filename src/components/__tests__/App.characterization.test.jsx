import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'

vi.mock('../../firebase', () => ({ auth: {} }))

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, callback) => {
    callback({ email: 'operations@cpc1hn.com' })
    return () => {}
  },
  signOut: vi.fn(),
}))

vi.mock('../../cloudSync', () => ({
  hydrateLocalStorageFromCloud: vi.fn().mockResolvedValue(undefined),
  startCloudSync: vi.fn(),
  pushAllLocalStorageToCloud: vi.fn().mockResolvedValue(0),
}))

describe('authenticated application shell', () => {
  afterEach(() => {
    cleanup()
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 })
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
