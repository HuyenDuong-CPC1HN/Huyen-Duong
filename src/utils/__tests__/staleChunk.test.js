import { describe, expect, it, vi } from 'vitest'
import { importFresh, isStaleChunkError, STALE_CHUNK_MESSAGE } from '../staleChunk'

describe('Lỗi file JS cũ sau khi app cập nhật', () => {
  it('nhận đúng lỗi tải module động của trình duyệt', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/pdf-BBrgSFQ4.js'))).toBe(true)
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true)
    expect(isStaleChunkError(new Error('Invalid PDF structure'))).toBe(false)
  })

  it('importFresh: lỗi bản cũ thì tự tải lại trang và báo lỗi dễ hiểu; lỗi khác giữ nguyên', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, configurable: true })
    window.sessionStorage.clear()
    await expect(importFresh(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: a.js')))).rejects.toThrow(STALE_CHUNK_MESSAGE)
    expect(reload).toHaveBeenCalledTimes(1)
    // lần thứ 2 ngay sau đó không tải lại nữa (tránh lặp)
    await expect(importFresh(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: a.js')))).rejects.toThrow(STALE_CHUNK_MESSAGE)
    expect(reload).toHaveBeenCalledTimes(1)
    await expect(importFresh(() => Promise.reject(new Error('khác')))).rejects.toThrow('khác')
    await expect(importFresh(() => Promise.resolve(42))).resolves.toBe(42)
  })
})
