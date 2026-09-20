import { describe, expect, it } from 'vitest'
import { createGoodsReceiptBatchesRepository } from '../goodsReceiptBatches'

// Fake Supabase client tối giản — đủ để save()/loadBatch() chạy thật (không đụng mạng), giả lập bảng SQL
// (goods_receipt_batches) bằng Map và Storage (blob JSON) bằng Map thứ 2.
function makeFakeClient() {
  const storage = new Map()
  const batchRows = new Map()
  function fakeQuery() {
    const self = {
      upsert: async (record) => { batchRows.set(record.id, record); return { error: null } },
      select: () => self,
      order: () => Promise.resolve({ data: [...batchRows.values()], error: null }),
      delete: () => self,
      eq: async () => ({ error: null }),
      insert: async () => ({ error: null }),
    }
    return self
  }
  return {
    from: () => fakeQuery(),
    storage: {
      from: () => ({
        upload: async (path, body) => { storage.set(path, body); return { error: null } },
        download: async (path) => {
          const body = storage.get(path)
          return body ? { data: body, error: null } : { data: null, error: { message: 'not found' } }
        },
        remove: async () => ({ error: null }),
      }),
    },
  }
}

describe('goodsReceiptBatches', () => {
  // checkedRowIds ("đã dò biên bản giao nhận" — đánh dấu riêng trên màn hình) từng bị save() bỏ qua vì
  // đây là danh sách field cố định (không spread nguyên object batch), khiến đánh dấu mất ngay sau khi
  // tải lại trang dù đã gọi save() thành công. Test tái hiện đúng round-trip save() -> loadBatch() để
  // chặn regression nếu sau này có field mới nào bị quên thêm vào danh sách tương tự.
  it('checkedRowIds round-trip đúng qua save() -> loadBatch(), không bị bỏ sót như các field khác', async () => {
    const repo = createGoodsReceiptBatchesRepository(makeFakeClient())
    const record = await repo.save({
      id: 'batch1',
      processedAt: '2026-09-20T00:00:00.000Z',
      khoCFileNames: ['a.xlsx'],
      khoLgtFileNames: [],
      khoC: [{ rowId: 'r1', maHang: 'A01338', slHoaDon: 25200 }],
      khoLgt: [],
      checkedRowIds: ['r1', 'r3'],
    })
    const loaded = await repo.loadBatch(record)
    expect(loaded.checkedRowIds).toEqual(['r1', 'r3'])
    expect(loaded.khoC).toMatchObject([{ maHang: 'A01338' }])
  })

  it('checkedRowIds mặc định rỗng khi không truyền (batch cũ tạo trước khi có tính năng này)', async () => {
    const repo = createGoodsReceiptBatchesRepository(makeFakeClient())
    const record = await repo.save({
      id: 'batch2',
      processedAt: '2026-09-20T00:00:00.000Z',
      khoC: [],
      khoLgt: [],
    })
    const loaded = await repo.loadBatch(record)
    expect(loaded.checkedRowIds).toEqual([])
  })
})
