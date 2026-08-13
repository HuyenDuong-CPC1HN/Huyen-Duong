/**
 * Representative Đơn DTP fixture — frozen KPI baseline for characterization tests.
 * Includes hold scenario (VTP "Đang lấy hàng" matched to hold file).
 *
 * Counts are computed manually once and frozen; must NOT change before/after redesign.
 */
export const donDTPFixture = {
  type: 'donDTP',
  weekId: 'donDTP_test_week32',
  weekLabel: 'Đơn DTP - Tuần 32',

  // Minimal representative rows — trực tiếp + VTP (with hold scenario)
  rows: [
    // Trực tiếp — giao 24h
    makeRow('D001', 'tructiep', 'Đã giao', 'NT Bình An', '01/08/2026 09:00', '01/08/2026 10:00'),
    makeRow('D002', 'tructiep', 'Đã giao', 'NT Minh Châu', '01/08/2026 08:30', '01/08/2026 09:15'),
    makeRow('D003', 'tructiep', 'Đã giao', 'PK Sài Gòn', '01/08/2026 10:00', '01/08/2026 11:00'),
    // Trực tiếp — giao 48h
    makeRow('D004', 'tructiep', 'Đã giao', 'KH Lẻ X', '01/08/2026 09:00', '03/08/2026 08:30'),
    makeRow('D005', 'tructiep', 'Đã giao', 'KH Lẻ Y', '01/08/2026 11:00', '03/08/2026 10:00'),
    // Trực tiếp — giao 72h
    makeRow('D006', 'tructiep', 'Đã giao', 'KH Lẻ Z', '01/08/2026 08:00', '04/08/2026 17:00'),
    // Trực tiếp — chưa giao
    makeRow('D007', 'tructiep', 'Đang chuyển', 'KH Lẻ W', '05/08/2026 09:00'),
    // Viettel Post — "Đang lấy hàng" (DTP hold)
    makeRow('D008', 'viettel', 'Đang lấy hàng', 'NT Hoa Mai', '02/08/2026'),
    makeRow('D009', 'viettel', 'Đang vận chuyển', 'PK Tâm Đức', '01/08/2026'),
    makeRow('D010', 'viettel', 'Đã giao', 'KH Lẻ V', '01/08/2026'),
  ],

  // Hand-computed KPIs
  expectedKpi: {
    total: 10,
    delivered: 8,   // D001-006, D010
    pending: 2,       // D007, D009 (Đang chuyển, Đang vận chuyển) — D008 is hold and treated differently
    rateLabel: '80%', // 8/10 = 80%
  },

  // Expected sections (DTP has no SPX, no Chành xe)
  expectedSections: [
    'Giao hàng trực tiếp',
    'Viettel Post',
  ],

  // Bucket breakdown for trực tiếp
  expectedTruCiepBuckets: {
    '24': 3, // D001, D002, D003
    '48': 2, // D004, D005
    '72': 1, // D006
    khac: 1, // D007 (chưa giao)
  },

  // VTP hold scenario:
  // - "Đang lấy hàng" matched to hold file → held in "Chờ lấy" block
  // - "Đang vận chuyển" → counted as pending / Đang vận chuyển
  expectedVtpRows: 3, // D008, D009, D010
  holdRow: 'D008',      // "Đang lấy hàng" — would be in hold block if hold file uploaded
}

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
