import { afterEach, describe, expect, it, vi } from 'vitest'
import { printWithOrientation } from '../printOrientation'

afterEach(() => { vi.restoreAllMocks(); document.head.querySelectorAll('style[data-print-orientation]').forEach(e => e.remove()) })

describe('printWithOrientation', () => {
  it('in dọc (mặc định): chỉ gọi print, không chèn rule @page', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    printWithOrientation('portrait')
    expect(print).toHaveBeenCalledTimes(1)
    expect(document.querySelector('style[data-print-orientation]')).toBeNull()
  })

  it('in ngang: chèn rule @page landscape trong lúc in, gỡ khi in xong (afterprint)', () => {
    let during = null
    vi.spyOn(window, 'print').mockImplementation(() => { during = document.querySelector('style[data-print-orientation]')?.textContent })
    printWithOrientation('landscape')
    expect(during).toContain('size: A4 landscape')
    expect(document.querySelector('style[data-print-orientation]')).not.toBeNull()
    window.dispatchEvent(new Event('afterprint'))
    expect(document.querySelector('style[data-print-orientation]')).toBeNull()
  })
})
