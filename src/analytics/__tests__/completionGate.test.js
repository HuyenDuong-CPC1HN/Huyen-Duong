import { describe, expect, it } from 'vitest'
import { evaluateCompletion } from '../completionGate'

const savedTongdon = { id: 'tongdon-32', weekKey: 'donC_32_donDTP_32' }
const savedDonC = { id: 'donC_32', label: 'Tuần 32 - Đơn C' }
const savedDonDTP = { id: 'donDTP_32', label: 'Tuần 32 - Đơn DTP' }

describe('evaluateCompletion', () => {
  it('passes only when a saved tongdon report and its two frozen sheet reports match one cycle', () => {
    expect(evaluateCompletion({
      tongdonReport: savedTongdon,
      sheetReportsDonC: [savedDonC],
      sheetReportsDonDTP: [savedDonDTP],
    })).toMatchObject({
      ok: true,
      cycleKey: 'donC_32_donDTP_32',
      missing: [],
      sources: { donC: savedDonC, donDTP: savedDonDTP },
    })
  })

  it('fails safely with a clear code when the DTP sheet snapshot is missing', () => {
    expect(evaluateCompletion({
      tongdonReport: savedTongdon,
      sheetReportsDonC: [savedDonC],
      sheetReportsDonDTP: [],
    })).toMatchObject({
      ok: false,
      cycleKey: 'donC_32_donDTP_32',
      missing: ['sheet_report_donDTP'],
    })
  })

  it('fails safely when the tongdon snapshot has no week key', () => {
    expect(evaluateCompletion({
      tongdonReport: { id: 'tongdon-32' },
      sheetReportsDonC: [savedDonC],
      sheetReportsDonDTP: [savedDonDTP],
    })).toEqual({ ok: false, cycleKey: null, missing: ['tongdon_week_key'], sources: {} })
  })

  it('does not make TMĐT a completion requirement in v1', () => {
    expect(evaluateCompletion({
      tongdonReport: savedTongdon,
      sheetReportsDonC: [savedDonC],
      sheetReportsDonDTP: [savedDonDTP],
      tmdtReports: [],
    }).ok).toBe(true)
  })

  it('does not accept prefix/suffix collisions as a completed cycle', () => {
    expect(evaluateCompletion({
      tongdonReport: { id: 'tongdon-ambiguous', weekKey: 'donC_1_other_donDTP_1' },
      sheetReportsDonC: [{ id: 'donC_1' }],
      sheetReportsDonDTP: [{ id: 'donDTP_1' }],
    })).toMatchObject({ ok: false, missing: ['sheet_report_donC', 'sheet_report_donDTP'] })
  })
})
