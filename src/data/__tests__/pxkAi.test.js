import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('../../supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))
vi.mock('../pxkFiles', () => ({ getPxkFileUrl: async p => `https://x.supabase.co/storage/v1/${p}` }))

const httpError = (status, error) => ({ data: null, error: { message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => ({ error }) } } })
const fetchError = { data: null, error: { message: 'Failed to send a request to the Edge Function', context: {} } }
const ok = { data: { phieus: [{ soPhieu: 'XD1', rows: [] }] }, error: null }

describe('readPxkWithAi', () => {
  beforeEach(() => { vi.resetModules(); invoke.mockReset(); vi.useFakeTimers() })
  afterEach(() => vi.useRealTimers())

  it('gọi sai tên (lỗi mạng) thì thử tên viết hoa PXK-OCR, lần sau gọi thẳng tên đó', async () => {
    const { readPxkWithAi } = await import('../pxkAi')
    invoke.mockResolvedValueOnce(fetchError).mockResolvedValue(ok)
    await expect(readPxkWithAi('a.pdf', 'application/pdf')).resolves.toHaveLength(1)
    await readPxkWithAi('b.pdf', 'application/pdf')
    expect(invoke.mock.calls.map(c => c[0])).toEqual(['pxk-ocr', 'PXK-OCR', 'PXK-OCR'])
  })

  it('Gemini báo bận thì chờ rồi gọi lại', async () => {
    const { readPxkWithAi } = await import('../pxkAi')
    invoke.mockResolvedValueOnce(httpError(502, 'This model is currently experiencing high demand.')).mockResolvedValue(ok)
    const p = readPxkWithAi('a.pdf', 'application/pdf')
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toHaveLength(1)
    expect(invoke).toHaveBeenCalledTimes(2)
  })

  it('bận mãi thì báo lỗi sau 3 lần gọi; lỗi khác không gọi lại', async () => {
    const { readPxkWithAi } = await import('../pxkAi')
    invoke.mockResolvedValue(httpError(503, 'Gemini đang quá tải'))
    const p = readPxkWithAi('a.pdf', 'application/pdf')
    const done = expect(p).rejects.toThrow(/báo lỗi 503: Gemini đang quá tải/)
    await vi.advanceTimersByTimeAsync(20000)
    await done
    expect(invoke).toHaveBeenCalledTimes(3)

    invoke.mockReset()
    invoke.mockResolvedValue(httpError(413, 'File lớn hơn 18 MB'))
    await expect(readPxkWithAi('a.pdf', 'application/pdf')).rejects.toThrow(/413: File lớn hơn 18 MB/)
    expect(invoke).toHaveBeenCalledTimes(1)
  })
})
