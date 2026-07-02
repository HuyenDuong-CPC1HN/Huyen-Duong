// Các đối tác có tên chứa "Trực tiếp" nhưng thực chất là chành xe khu vực, không tính vào Giao hàng trực tiếp
const CHANHXE_EXCEPTIONS = ['GIAO TRỰC TIẾP - TÂY NGUYÊN', 'GIAO HÀNG TRỰC TIẾP TN']

// Phân loại đối tác vận chuyển: 'tructiep' | 'viettel' | 'spx' | 'chanhxe'
export function partnerType(row) {
  const raw = (row['Đối tác vận chuyển'] || '').trim().toUpperCase()
  if (CHANHXE_EXCEPTIONS.some(ex => raw === ex.toUpperCase())) return 'chanhxe'
  if (raw.includes('TRỰC TIẾP') || raw.includes('TRUC TIEP') || raw.includes('GIAO THẲNG')) return 'tructiep'
  if (raw.includes('VIETTEL')) return 'viettel'
  if (raw.includes('SPX')) return 'spx'
  // Bất kỳ đối tác nào khác (chành xe, cá nhân vận chuyển...) đều tính là Chành xe
  return 'chanhxe'
}
