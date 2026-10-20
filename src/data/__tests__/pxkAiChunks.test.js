import { describe, expect, it, vi } from 'vitest'
import { readPdfChunksWithAi } from '../pxkAi'

const invoke = vi.fn()
vi.mock('../../supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))
const removed = []
vi.mock('../pxkFiles', () => ({
  getPxkFileUrl: async p => `https://x.supabase.co/storage/v1/${p}`,
  uploadPxkFile: async f => ({ name: f.name, storagePath: `pxk/tmp/${f.name}` }),
  removePxkFile: async p => { removed.push(p) },
}))

const ok = { data: { phieus: [{ soPhieu: 'XD1', rows: [] }] }, error: null }
const httpError = (status, error) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => ({ error }) } } })
describe('readPdfChunksWithAi', () => {
  it('PDF chia phần: mỗi phần tải lên file tạm, AI đọc, đọc xong xoá; phần lỗi trả { error }', async () => {
    invoke.mockImplementation(async (_name, { body }) => (body.url.includes('ai-phan-2') ? httpError(413, 'File lớn hơn 18 MB') : ok))
    removed.length = 0
    const progress = []
    const chunks = [1, 2, 3].map(i => ({ pages: [i], blob: new Blob(['%PDF'], { type: 'application/pdf' }) }))
    const r = await readPdfChunksWithAi(chunks, (d, t) => progress.push(`${d}/${t}`))
    expect(r[0].phieus).toHaveLength(1)
    expect(r[1].error).toMatch(/413: File lớn hơn 18 MB/)
    expect(r[2].phieus).toHaveLength(1)
    expect(progress).toEqual(['0/3', '1/3', '2/3', '3/3'])
    await Promise.resolve()
    expect(removed.sort()).toEqual(['pxk/tmp/ai-phan-1.pdf', 'pxk/tmp/ai-phan-2.pdf', 'pxk/tmp/ai-phan-3.pdf'])
  })
})
