import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FlowV2Tab from '../FlowV2Tab'

const store = vi.hoisted(() => {
  const values = new Map()
  return { values, opsStore: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) } }
})
vi.mock('../../data/workspace', () => ({ opsStore: store.opsStore }))
vi.mock('../../data/flowV2Files', () => ({
  uploadFlowFiles: vi.fn(async files => files.map(f => ({ name: f.name, storagePath: `flowv2/test/${f.name}`, type: f.type }))),
  getFlowFileUrl: vi.fn(async () => 'blob:test'),
  downloadFlowFile: vi.fn(async () => new ArrayBuffer(0)),
}))
vi.mock('../../utils/flowV2Pdf', async () => {
  const { newItem, newTraHang } = await import('../../utils/flowV2')
  return {
    readReturnPdf: vi.fn(async () => ({
      khachHang: '',
      traHang: newTraHang({ pdf: { mau: 'NOIBO', lyDo: 'Khách từ chối nhận', benC: { daiDien: 'Nguyễn Hồng Nhung', chucVu: 'Nhân viên kinh doanh ETC' }, items: [] } }),
      items: [newItem({ tenHang: 'Zencombi - Hộp 2 vỉ x 5 ống 2.5ml', soLuong: 100, dvt: 'ONG', donGia: 12600 })],
    })),
  }
})
afterEach(() => { cleanup(); store.values.clear() })

describe('Hàng trả & huỷ (Demo) — tạo hồ sơ từ file biên bản', () => {
  it('đọc được hàng từ file thì vào thẳng bước 2 (BB xác minh), sửa khách hàng / đơn giá ngay ở đó, Bên C có sẵn', async () => {
    render(<FlowV2Tab />)
    fireEvent.click(screen.getByRole('button', { name: /Tạo hồ sơ khách trả/ }))
    const dlg = screen.getByRole('dialog', { name: 'Tạo hồ sơ khách trả' })
    fireEvent.click(within(dlg).getByRole('button', { name: /hàng nguyên vẹn/ }))
    fireEvent.change(within(dlg).getByLabelText('Chọn file'), { target: { files: [new File(['%PDF'], 'Nhóm - CPC1HN.pdf', { type: 'application/pdf' })] } })
    fireEvent.click(within(dlg).getByRole('button', { name: 'Tạo hồ sơ' }))

    expect(await screen.findByRole('button', { name: /In xong → Chờ ký/ })).toBeInTheDocument()
    expect(screen.getByLabelText('Bên C').value).toBe('Nguyễn Hồng Nhung')
    expect(screen.getByLabelText('Đơn giá (gồm VAT) dòng 1').value).toBe('12600')
    fireEvent.change(screen.getByLabelText('Khách hàng'), { target: { value: 'Công ty CP Bệnh viện Vạn Phúc City' } })
    const c = JSON.parse(store.values.get('flowv2_cases'))[0]
    expect(c.step).toBe(1)
    expect(c.khachHang).toBe('Công ty CP Bệnh viện Vạn Phúc City')
    expect(c.files[0].name).toBe('Nhóm - CPC1HN.pdf')
  })
})
