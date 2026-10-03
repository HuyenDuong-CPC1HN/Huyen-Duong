import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import NhapHangHistoryTab from '../NhapHangHistoryTab'

const store = vi.hoisted(() => new Map())
vi.mock('../../data/workspace', () => ({ opsStore: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } }))

describe('NhapHangHistoryTab — tab con tra cứu lịch sử nhập hàng', () => {
  it('tìm theo mã hàng trong các chuyến đã lưu, hiện đủ Kho C và Kho LGT', () => {
    store.set('goods_receipt_batches', JSON.stringify([{
      id: 'b1', processedAt: '2026-10-02T03:00:00.000Z',
      khoC: [{ maHang: 'T02722', tenHang: 'Tranfast - Hộp 10 gói', soLo: '080826', hanDung: '2029-08-09', slHoaDon: 2860 }],
      khoLgt: [{ maHang: 'T02722', tenHang: 'Tranfast - Hộp 10 gói', soLo: '160826', hanDung: '2029-08-09', slHoaDon: 60 }, { maHang: 'A00001', tenHang: 'Khác', soLo: 'X', slHoaDon: 1 }],
    }]))
    render(<NhapHangHistoryTab />)
    fireEvent.change(screen.getByPlaceholderText('Nhập mã hàng hoặc tên hàng...'), { target: { value: 't02722' } })
    expect(screen.getByText('080826')).toBeInTheDocument()
    expect(screen.getByText('160826')).toBeInTheDocument()
    expect(screen.queryByText('Khác')).not.toBeInTheDocument()
  })
})
