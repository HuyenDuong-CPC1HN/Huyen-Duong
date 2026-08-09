import { describe, expect, it } from 'vitest'
import { buildWeekKpiPackage } from '../buildWeekKpiPackage'

const tongdonReport = {
  id: 'tongdon-32',
  weekKey: 'donC_32_donDTP_32',
  label: 'Báo cáo tuần 32',
  createdAt: '2026-08-09T09:00:00.000Z',
  current: {
    grandTotal: 1500,
    totalC: 700,
    totalDTP: 600,
    totalTMDT: 200,
    trucTiepTong: 430,
    gh24: 300,
    gh48: 80,
    gh72: 20,
    chuaGiao: 30,
    rate24h: 69.8,
    returnRatePct: 1.6,
  },
}

describe('buildWeekKpiPackage', () => {
  it('builds a KPI-only package with its period, saved SLA, optional return rate, and frozen source references', () => {
    const result = buildWeekKpiPackage({
      tongdonReport,
      sources: {
        donC: { id: 'donC_32', label: 'Đơn C tuần 32' },
        donDTP: { id: 'donDTP_32', label: 'Đơn DTP tuần 32' },
      },
    })

    expect(result.kpi_json).toMatchObject({
      schema_version: '1.0',
      cycle_key: 'donC_32_donDTP_32',
      period: { label: 'Báo cáo tuần 32', saved_at: '2026-08-09T09:00:00.000Z' },
      totals: { total_orders: 1500, don_c: 700, don_dtp: 600, tmdt: 200 },
      delivery: { direct_total: 430, sla_24h_pct: 69.8, return_rate_pct: 1.6 },
    })
    expect(result.source_refs).toEqual({
      tongdon_report_id: 'tongdon-32',
      sheet_report_ids: { donC: 'donC_32', donDTP: 'donDTP_32' },
    })
  })

  it('omits unavailable optional KPI fields instead of faking zero values', () => {
    const { kpi_json } = buildWeekKpiPackage({
      tongdonReport: { ...tongdonReport, current: { grandTotal: 10 } },
      sources: { donC: { id: 'donC_32' }, donDTP: { id: 'donDTP_32' } },
    })

    expect(kpi_json.delivery).toBeUndefined()
    expect(kpi_json.totals).toEqual({ total_orders: 10 })
  })
})
