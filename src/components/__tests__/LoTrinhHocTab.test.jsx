import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LoTrinhHocTab from '../LoTrinhHocTab'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
const saved = () => JSON.parse(store.values.get('hoc_tap_lo_trinh'))

beforeEach(() => store.values.clear())
afterEach(() => cleanup())

describe('Tab Lộ trình học', () => {
  it('tích đã học / đã nộp, nhập điểm, lưu lại và tự tính điểm học phần', () => {
    render(<LoTrinhHocTab />)
    // học phần đang học (PDA101) mở sẵn
    for (const code of ['BT-101.1', 'BT-101.2', 'BT-101.3', 'BT-101.4']) {
      fireEvent.click(screen.getByLabelText(`Đã học ${code}`))
      fireEvent.click(screen.getByLabelText(`Đã nộp ${code}`))
      const score = screen.getByLabelText(`Điểm ${code}`)
      fireEvent.change(score, { target: { value: '8,5' } })
      fireEvent.blur(score)
    }
    expect(saved().tasks['BT-101.1']).toEqual({ hoc: true, nop: true, diem: 8.5 })
    expect(screen.getByText(/chưa đủ điểm \(điểm kiểm tra, điểm dự án\)/)).toBeInTheDocument()
    const kt = screen.getByLabelText('Điểm kiểm tra PDA101')
    fireEvent.change(kt, { target: { value: '9' } }); fireEvent.blur(kt)
    const da = screen.getByLabelText('Điểm dự án PDA101')
    fireEvent.change(da, { target: { value: '8' } }); fireEvent.blur(da)
    expect(screen.getByText('8,4 · Giỏi')).toBeInTheDocument() // 0,4×8,5 + 0,2×9 + 0,4×8
    expect(screen.getByText('4/58 bài đã học + đã nộp')).toBeInTheDocument()
    expect(screen.getByText('BT-102.1')).toBeInTheDocument() // bài tiếp theo
  })

  it('điểm ngoài 0–10 không lưu; mở lại trang giữ nguyên dữ liệu', () => {
    store.values.set('hoc_tap_lo_trinh', JSON.stringify({ startDate: '2026-10-26', tasks: { 'BT-101.1': { hoc: true, nop: true, diem: 7 } } }))
    render(<LoTrinhHocTab />)
    const score = screen.getByLabelText('Điểm BT-101.1')
    expect(score).toHaveValue('7')
    fireEvent.change(score, { target: { value: '12' } }); fireEvent.blur(score)
    expect(saved().tasks['BT-101.1'].diem).toBe(7)
    expect(screen.getByLabelText('Ngày nhập học')).toHaveValue('2026-10-26')
  })

  it('chuyển sang giai đoạn 2 và mở học phần', () => {
    render(<LoTrinhHocTab />)
    fireEvent.click(screen.getByRole('button', { name: /Giai đoạn 2/ }))
    fireEvent.click(screen.getByRole('button', { name: /PDS203/ }))
    expect(screen.getByLabelText('Đã học BT-203.1')).toBeInTheDocument()
  })

  it('vào học: mở giáo án, có nguồn chính thống, file bài tập, tích đã học ngay trong bài', () => {
    render(<LoTrinhHocTab />)
    fireEvent.click(screen.getAllByRole('button', { name: /Vào học/ })[1]) // BT-101.2
    expect(screen.getByRole('heading', { name: /Tra cứu và đối chiếu chứng từ/ })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /SUMIFS function/ })).toHaveAttribute('href', 'https://support.microsoft.com/en-us/excel/functions/sumifs-function')
    expect(screen.getByRole('link', { name: /Tải file dữ liệu/ })).toHaveAttribute('href', '/hoc-tap/PDA101/BT-101.2_DoiChieu_PXK_ThucNhan.xlsx')
    expect(screen.getByText(/NỘP BÀI – BT-101.2 – \[Họ tên\]/)).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Đã học xong bài giảng'))
    expect(saved().tasks['BT-101.2']).toEqual({ hoc: true })
    fireEvent.click(screen.getByRole('button', { name: /Quay lại lộ trình/ }))
    expect(screen.getByLabelText('Đã học BT-101.2')).toBeChecked()
  })
})
