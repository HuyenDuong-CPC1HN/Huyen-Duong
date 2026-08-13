/**
 * Representative Đơn C fixture — frozen KPI baseline for characterization tests.
 * Counts are computed manually once and frozen; must NOT change before/after redesign.
 *
 * Composition: trực tiếp 24/48/72h, chành xe, VTP, SPX — đã giao / chưa giao.
 */
export const donCFixture = {
  type: 'donC',
  weekId: 'donC_test_week32',
  weekLabel: 'Đơn C - Tuần 32',

  // Minimal representative rows — enough to exercise all partnerType paths + deliveryBucket
  rows: [
    // Trực tiếp — giao 24h
    makeRow('K001', 'tructiep', 'Đã giao', 'BV Chợ Rẫy', '01/08/2026 09:00', '01/08/2026 10:30'),
    makeRow('K002', 'tructiep', 'Đã giao', 'NT Pharma', '01/08/2026 08:00', '01/08/2026 09:45'),
    makeRow('K003', 'tructiep', 'Đã giao', 'KH Lẻ A', '01/08/2026 11:00', '01/08/2026 12:00'),
    // Trực tiếp — giao 48h
    makeRow('K004', 'tructiep', 'Đã giao', 'BV Từ Dũ', '01/08/2026 09:00', '03/08/2026 08:00'),
    makeRow('K005', 'tructiep', 'Đã giao', 'NT Quỳnh', '01/08/2026 10:00', '03/08/2026 09:00'),
    // Trực tiếp — giao 72h
    makeRow('K006', 'tructiep', 'Đã giao', 'KH Lẻ B', '01/08/2026 14:00', '04/08/2026 15:00'),
    // Trực tiếp — chưa giao
    makeRow('K007', 'tructiep', 'Đang chuyển', 'KH Lẻ C', '05/08/2026 10:00'),
    // Chành xe
    makeRow('K008', 'chanhxe', 'Đã giao', 'KH Tỉnh', '01/08/2026 09:00', '02/08/2026 14:00'),
    makeRow('K009', 'chanhxe', 'Đã giao', 'KH Tỉnh 2', '01/08/2026 10:00', '02/08/2026 15:00'),
    makeRow('K010', 'chanhxe', 'Đã giao', 'KH Tỉnh 3', '01/08/2026 08:00', '02/08/2026 16:00'),
    // Viettel Post
    makeRow('K011', 'viettel', 'Đã giao', 'NT An Khang', '01/08/2026', '02/08/2026'),
    makeRow('K012', 'viettel', 'Đang vận chuyển', 'KH Lẻ D', '01/08/2026'),
    // SPX
    makeRow('K013', 'spx', 'Đã giao', 'BV Nguyễn Tri Phương', '01/08/2026', '02/08/2026'),
    makeRow('K014', 'spx', 'Hoàn hàng', 'KH Lẻ E', '01/08/2026', '03/08/2026'),
    makeRow('K015', 'spx', 'Đã giao', 'NT Phúc An', '01/08/2026', '02/08/2026'),
  ],

  // Hand-computed KPIs — must remain stable across redesign
  expectedKpi: {
    total: 15,
    delivered: 11,   // K001-006, K008-009, K011, K013, K015
    pending: 4,        // K007, K010, K012, K014 (chưa giao / Hoàn hàng / Đang vận chuyển)
    rateLabel: '73%', // 11/15 = 73.33 → rounded
  },

  // Expected section presence (eyebrow labels)
  expectedSections: [
    'Giao hàng trực tiếp',
    'Giao qua Chành xe',
    'Viettel Post',
    'SPX Express',
  ],

  // Bucket breakdown for trực tiếp (from deliveryBucket)
  expectedTruCiepBuckets: {
    '24': 3, // K001, K002, K003
    '48': 2, // K004, K005
    '72': 1, // K006
    khac: 1, // K007 (chưa giao)
  },

  // Carrier row counts
  expectedCarrierRows: {
    viettel: 2, // K011, K012
    spx: 3,     // K013, K014, K015
    chanhxe: 3, // K008, K009, K010
  },
}

// Helper — creates a minimal row matching the Excel import shape
function makeRow(maKien, partner, status, tenKhach, ngayTao, ngayGiao = '') {
  return {
    'Mã kiện hàng': maKien,
    'Mã hóa đơn': maKien,
    'Tên khách hàng': tenKhach,
    'Thành phố': 'HCM',
    'Trạng thái': status,
    'Ngày tạo kiện': ngayTao,
    'Ngày giao hàng': ngayGiao,
    'Đối tác vận chuyển': partner === 'tructiep' ? 'Trực tiếp'
      : partner === 'chanhxe' ? 'Chành xe'
      : partner === 'viettel' ? 'Viettel Post'
      : 'SPX Express',
    'Thu hộ': '',
  }
}
