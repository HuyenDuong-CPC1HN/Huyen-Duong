import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import UnifiedTrialChannelDetail from '../UnifiedTrialChannelDetail'

const store = vi.hoisted(() => {
  const values = new Map()
  return {
    values,
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: (key) => values.delete(key),
    },
  }
})

vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

afterEach(() => {
  cleanup()
  store.values.clear()
  vi.restoreAllMocks()
})

const bvInput = () => screen.getByText('Bệnh viện').closest('div').querySelector('input')
const openTrucTiep = () => fireEvent.click(screen.getByRole('button', { name: /Giao hàng trực tiếp/ }))

// Ô nhập tay "Phân loại đơn chưa giao theo khách hàng" lưu theo key CỐ ĐỊNH mỗi kênh (không tách
// theo tuần) — bug thật đã gặp: upload file tuần MỚI (referenceDate đổi) nhưng component KHÔNG
// remount (UnifiedTrialTab.jsx không truyền key theo referenceDate), nên số đã nhập của tuần TRƯỚC
// vẫn tự hiện ra dù người dùng chưa điền gì cho tuần mới.
describe('UnifiedTrialChannelDetail — ô "chưa giao theo khách hàng" phải trống lại khi sang tuần mới', () => {
  it('đã nhập ở tuần A -> chuyển referenceDate sang tuần B (không remount) -> ô phải trống, không tự hiện số tuần A', () => {
    const { rerender } = render(
      <UnifiedTrialChannelDetail data={[]} channelKey="donC" referenceDate="2026-09-01T00:00:00.000Z" showChanhXe showSpx={false} />
    )
    openTrucTiep()
    fireEvent.change(bvInput(), { target: { value: '15' } })
    expect(bvInput().value).toBe('15')

    // Re-render với referenceDate MỚI (mô phỏng đúng cách UnifiedTrialTab.jsx gọi lại khi upload file
    // tuần mới — prop đổi nhưng component không bị unmount/remount).
    rerender(
      <UnifiedTrialChannelDetail data={[]} channelKey="donC" referenceDate="2026-09-08T00:00:00.000Z" showChanhXe showSpx={false} />
    )
    expect(bvInput().value).toBe('')
  })

  it('nhập lại ở tuần B rồi reload (remount) với cùng referenceDate B -> vẫn giữ đúng số đã nhập', () => {
    const { unmount } = render(
      <UnifiedTrialChannelDetail data={[]} channelKey="donC" referenceDate="2026-09-08T00:00:00.000Z" showChanhXe showSpx={false} />
    )
    openTrucTiep()
    fireEvent.change(bvInput(), { target: { value: '7' } })
    unmount()

    render(<UnifiedTrialChannelDetail data={[]} channelKey="donC" referenceDate="2026-09-08T00:00:00.000Z" showChanhXe showSpx={false} />)
    openTrucTiep()
    expect(bvInput().value).toBe('7')
  })
})
