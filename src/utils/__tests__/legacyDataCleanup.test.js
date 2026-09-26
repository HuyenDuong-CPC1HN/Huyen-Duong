import { describe, expect, it } from 'vitest'
import { deleteLegacyData, isLegacySettingKey, scanLegacyData, storagePathsOf } from '../legacyDataCleanup'

// Supabase giả: mỗi bảng là 1 mảng dòng; select/delete hỗ trợ .in(cột, giá trị) nối nhiều lần.
function fakeClient(tables, storage) {
  const removedFiles = []
  const query = (table, mode) => {
    const filters = []
    const q = {
      select() { return q },
      in(column, values) { filters.push([column, values]); return q },
      then(resolve) {
        const match = row => filters.every(([c, v]) => v.includes(row[c]))
        if (mode === 'delete') tables[table] = tables[table].filter(row => !match(row))
        resolve({ data: mode === 'select' ? tables[table].filter(match) : null, error: null })
      },
    }
    return q
  }
  return {
    removedFiles,
    from: table => ({ select: () => query(table, 'select'), delete: () => query(table, 'delete') }),
    storage: { from: () => ({ remove: async paths => { removedFiles.push(...paths); storage.splice(0, storage.length, ...storage.filter(p => !paths.includes(p))); return { error: null } } }) },
  }
}

function seed() {
  return {
    report_weeks: [
      { id: 'w1', channel: 'donC', storage_path: 'weeks/donC/w1.json' },
      { id: 'w2', channel: 'donDTP', storage_path: 'weeks/donDTP/w2.json' },
      { id: 'w3', channel: 'khac', storage_path: 'weeks/khac/w3.json' },
    ],
    sheet_reports: [{ id: 's1', channel: 'donC' }, { id: 's1', channel: 'khac' }],
    tmdt_reports: [{ id: 't1' }, { id: 't2' }],
    carrier_weeks: [
      { id: 'c1', carrier_key: 'donC_viettel', storage_path: 'carriers/donC_viettel/c1.json' },
      { id: 'c2', carrier_key: 'unifiedTrial_donC_viettel', storage_path: 'carriers/unifiedTrial_donC_viettel/c2.json' },
    ],
    carrier_hold_weeks: [
      { id: 'h1', carrier_key: 'donDTP_viettel', storage_path: 'carrier-holds/donDTP_viettel/h1.json' },
      { id: 'h2', carrier_key: 'unifiedTrial_donDTP_viettel', storage_path: 'carrier-holds/unifiedTrial_donDTP_viettel/h2.json' },
    ],
    carrier_sales_order_weeks: [{ id: 'so1', carrier_key: 'unifiedTrial_donSO_spx', storage_path: 'carrier-sales-orders/unifiedTrial_donSO_spx/so1.json' }],
    carrier_packing_weeks: [{ id: 'p1', carrier_key: 'donC_spx', storage_path: 'carrier-packing/donC_spx/p1.json' }],
    ops_settings: [
      'vc_edits_donC', 'chuagiao_kh_donC_tructIep_w1', 'chuagiao_override_donC_chanhXe_w1_chuagui', 'tongdon_pick_donC_current',
      'tongdon_pick_tmdt_previous', 'tongdon_data_source', 'carrier_active_donC_viettel', 'carrier_exclude_orders_donC_spx',
      'unified_trial_donSO_rows', 'unifiedTrial_chuagiao_kh_donC', 'carrier_active_unifiedTrial_donC_viettel',
      'tongdon_pick_unifiedDonSO_current', 'tongdon_reports', 'swap_return_records', 'tongdon_field_donsan_verdict_ut_a_b',
    ].map(key => ({ key })),
  }
}

describe('isLegacySettingKey', () => {
  it.each([
    'vc_edits_donC', 'vc_edits_donDTP', 'chuagiao_kh_donDTP_tructIep_live', 'chuagiao_override_donC_chanhXe_live_chuagiao',
    'tongdon_pick_donDTP_current', 'tongdon_pick_tmdt_current', 'tongdon_data_source',
    'carrier_active_donC_viettel', 'carrier_hold_notes_donDTP_viettel', 'carrier_ngoaisan_exclude_donC_spx', 'carrier_data_donDTP_spx',
  ])('xoá khoá cũ: %s', key => expect(isLegacySettingKey(key)).toBe(true))

  it.each([
    'unified_trial_donSO_rows', 'unified_trial_reports_donSO', 'unifiedTrial_chuagiao_kh_donC', 'carrier_active_unifiedTrial_donC_viettel',
    'tongdon_pick_unifiedDonSO_current', 'tongdon_reports', 'tongdon_field_donsan_verdict_ut_a_b',
    'swap_return_records', 'swap_return_batches', 'damaged_goods_records', 'return_records',
  ])('giữ nguyên khoá không thuộc 3 tab cũ: %s', key => expect(isLegacySettingKey(key)).toBe(false))
})

describe('scanLegacyData / deleteLegacyData', () => {
  it('quét đúng dữ liệu cũ, không lẫn Gộp kênh và phần khác', async () => {
    const client = fakeClient(seed(), [])
    const scan = await scanLegacyData(client)
    expect(scan.reportWeeks.map(r => r.id)).toEqual(['w1', 'w2'])
    expect(scan.sheetReports).toEqual([{ id: 's1', channel: 'donC' }])
    expect(scan.tmdtReports).toHaveLength(2)
    expect(scan.carriers.carrier_weeks.map(r => r.id)).toEqual(['c1'])
    expect(scan.carriers.carrier_hold_weeks.map(r => r.id)).toEqual(['h1'])
    expect(scan.carriers.carrier_sales_order_weeks).toEqual([])
    expect(scan.carriers.carrier_packing_weeks.map(r => r.id)).toEqual(['p1'])
    expect(scan.settingKeys).toEqual([
      'carrier_active_donC_viettel', 'carrier_exclude_orders_donC_spx', 'chuagiao_kh_donC_tructIep_w1',
      'chuagiao_override_donC_chanhXe_w1_chuagui', 'tongdon_data_source', 'tongdon_pick_donC_current',
      'tongdon_pick_tmdt_previous', 'vc_edits_donC',
    ])
    expect(storagePathsOf(scan)).toEqual([
      'weeks/donC/w1.json', 'weeks/donDTP/w2.json', 'carriers/donC_viettel/c1.json',
      'carrier-holds/donDTP_viettel/h1.json', 'carrier-packing/donC_spx/p1.json',
    ])
  })

  it('xoá đúng danh sách đã quét, dữ liệu Gộp kênh và phần khác còn nguyên', async () => {
    const tables = seed()
    const storage = ['weeks/donC/w1.json', 'weeks/donDTP/w2.json', 'weeks/khac/w3.json', 'carriers/unifiedTrial_donC_viettel/c2.json']
    const client = fakeClient(tables, storage)
    await deleteLegacyData(client, await scanLegacyData(client))

    expect(tables.report_weeks.map(r => r.id)).toEqual(['w3'])
    expect(tables.sheet_reports).toEqual([{ id: 's1', channel: 'khac' }])
    expect(tables.tmdt_reports).toEqual([])
    expect(tables.carrier_weeks.map(r => r.carrier_key)).toEqual(['unifiedTrial_donC_viettel'])
    expect(tables.carrier_hold_weeks.map(r => r.carrier_key)).toEqual(['unifiedTrial_donDTP_viettel'])
    expect(tables.carrier_sales_order_weeks).toHaveLength(1)
    expect(tables.carrier_packing_weeks).toEqual([])
    expect(tables.ops_settings.map(r => r.key)).toEqual([
      'unified_trial_donSO_rows', 'unifiedTrial_chuagiao_kh_donC', 'carrier_active_unifiedTrial_donC_viettel',
      'tongdon_pick_unifiedDonSO_current', 'tongdon_reports', 'swap_return_records', 'tongdon_field_donsan_verdict_ut_a_b',
    ])
    expect(storage).toEqual(['weeks/khac/w3.json', 'carriers/unifiedTrial_donC_viettel/c2.json'])
  })

  it('danh sách quét bị sửa lẫn khoá Gộp kênh thì vẫn không xoá khoá đó', async () => {
    const tables = seed()
    const client = fakeClient(tables, [])
    const scan = await scanLegacyData(client)
    scan.settingKeys.push('unified_trial_donSO_rows')
    scan.carriers.carrier_weeks.push({ id: 'c2', carrier_key: 'unifiedTrial_donC_viettel', storage_path: 'carriers/unifiedTrial_donC_viettel/c2.json' })
    await deleteLegacyData(client, scan)
    expect(tables.ops_settings.map(r => r.key)).toContain('unified_trial_donSO_rows')
    expect(tables.carrier_weeks.map(r => r.id)).toEqual(['c2'])
    expect(client.removedFiles).not.toContain('carriers/unifiedTrial_donC_viettel/c2.json')
  })
})
