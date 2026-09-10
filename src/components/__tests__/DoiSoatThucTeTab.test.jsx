import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import DoiSoatThucTeTab from '../DoiSoatThucTeTab'

const store = vi.hoisted(() => {
  const values = new Map()
  return {
    opsStore: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, String(value)) },
      removeItem: (key) => values.delete(key),
    },
  }
})

vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))

afterEach(cleanup)

function seedBatch() {
  const batch = {
    id: 'batch1',
    processedAt: new Date().toISOString(),
    khoC: [
      { maHang: 'A00001', tenHang: 'Hàng khớp', soLo: 'L1', slHoaDon: 10 },
      { maHang: 'A00002', tenHang: 'Hàng thiếu', soLo: 'L2', slHoaDon: 10 },
      { maHang: 'A00003', tenHang: 'Hàng chưa quét', soLo: 'L3', slHoaDon: 5 },
    ],
    khoLgt: [],
  }
  store.opsStore.setItem('goods_receipt_batches', JSON.stringify([batch]))
}

function buildActualScanFile(rows, name = 'quet-thuc-te.xlsx') {
  const aoa = [
    ['Mã SP', 'Sản phẩm', 'Số lô', 'Số lượng', 'Kho'],
    ...rows.map(r => [r.maHang, r.tenHang, r.soLo, r.soLuong, '020101']),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  return new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

describe('DoiSoatThucTeTab — bấm vào thẻ tổng hợp để lọc bảng theo trạng thái', () => {
  it('bấm 1 thẻ chỉ còn đúng trạng thái đó ở mọi bảng, bấm lại để bỏ lọc', async () => {
    seedBatch()
    // Kho C thực tế: A00001 khớp đủ (10), A00002 quét thiếu (5/10), A00003 không quét, A00004 quét lạ
    // (không có trong hoá đơn) — đủ 4 trạng thái thật trong cùng 1 bảng để kiểm tra lọc.
    const file = buildActualScanFile([
      { maHang: 'A00001', tenHang: 'Hàng khớp', soLo: 'L1', soLuong: 10 },
      { maHang: 'A00002', tenHang: 'Hàng thiếu', soLo: 'L2', soLuong: 5 },
      { maHang: 'A00004', tenHang: 'Hàng quét lạ', soLo: 'L4', soLuong: 3 },
    ])

    render(<DoiSoatThucTeTab />)

    const fileInputs = document.querySelectorAll('input[type="file"]')
    fireEvent.change(fileInputs[0], { target: { files: [file] } }) // khung Kho C là khung đầu tiên

    const runButton = await screen.findByRole('button', { name: /chạy đối soát/i })
    fireEvent.click(runButton)

    await waitFor(() => expect(screen.getByText('4 dòng')).toBeInTheDocument()) // bảng Kho C: 4 dòng thật

    const khopTile = screen.getAllByText('Khớp').map(el => el.closest('button')).find(Boolean)
    const lechTile = screen.getByText('Thiếu / Thừa').closest('button')

    // Chưa lọc gì: cả 4 mã hàng đều hiện trên bảng Kho C.
    // "Kho C" xuất hiện 2 lần (nhãn khung upload + tiêu đề bảng kết quả) — lấy lần cuối (bảng kết quả,
    // render sau khung upload trong DOM).
    const khoCTitles = screen.getAllByText('Kho C')
    const khoCSection = khoCTitles[khoCTitles.length - 1].closest('div').parentElement
    expect(within(khoCSection).getByText('A00001')).toBeInTheDocument()
    expect(within(khoCSection).getByText('A00002')).toBeInTheDocument()
    expect(within(khoCSection).getByText('A00003')).toBeInTheDocument()
    expect(within(khoCSection).getByText('A00004')).toBeInTheDocument()

    // Bấm thẻ "Khớp": chỉ còn A00001 (trạng thái khớp) trên cả 3 bảng.
    fireEvent.click(khopTile)
    await waitFor(() => expect(within(khoCSection).getByText('A00001')).toBeInTheDocument())
    expect(within(khoCSection).queryByText('A00002')).not.toBeInTheDocument()
    expect(within(khoCSection).queryByText('A00003')).not.toBeInTheDocument()
    expect(within(khoCSection).queryByText('A00004')).not.toBeInTheDocument()
    expect(screen.getByText(/Đang lọc theo trạng thái/)).toBeInTheDocument()

    // Bấm lại đúng thẻ đang chọn -> bỏ lọc, cả 4 dòng hiện lại.
    fireEvent.click(khopTile)
    await waitFor(() => expect(within(khoCSection).getByText('A00002')).toBeInTheDocument())
    expect(within(khoCSection).getByText('A00003')).toBeInTheDocument()
    expect(within(khoCSection).getByText('A00004')).toBeInTheDocument()

    // Bấm thẻ "Thiếu / Thừa": chỉ còn A00002 (trạng thái "thiếu") — thẻ này gộp 2 trạng thái thật.
    fireEvent.click(lechTile)
    await waitFor(() => expect(within(khoCSection).getByText('A00002')).toBeInTheDocument())
    expect(within(khoCSection).queryByText('A00001')).not.toBeInTheDocument()
    expect(within(khoCSection).queryByText('A00003')).not.toBeInTheDocument()
    expect(within(khoCSection).queryByText('A00004')).not.toBeInTheDocument()
  })
})
