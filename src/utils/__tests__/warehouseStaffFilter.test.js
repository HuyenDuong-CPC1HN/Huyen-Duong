import { describe, expect, it } from 'vitest'
import { classifyRowWarehouse, parseStaffRoster, splitByWarehouseStaff } from '../warehouseStaffFilter'

describe('warehouseStaffFilter', () => {
  it('parseStaffRoster: mỗi dòng 1 người, chuẩn hoá khoảng trắng thừa', () => {
    const roster = parseStaffRoster('Phạm Thị Kiều Mi (0941512763)\n\nHuỳnh Thị Kim Thảo  (0352204040)\n')
    expect(roster.has('Phạm Thị Kiều Mi (0941512763)')).toBe(true)
    expect(roster.has('Huỳnh Thị Kim Thảo (0352204040)')).toBe(true)
    expect(roster.size).toBe(2)
  })

  it('classifyRowWarehouse: cả Bốc hàng + Đóng hàng đều trong danh sách -> hcm', () => {
    const roster = parseStaffRoster('A (111)\nB (222)')
    expect(classifyRowWarehouse({ 'Bốc hàng': 'A (111)', 'Đóng hàng': 'B (222)' }, roster)).toBe('hcm')
  })

  it('classifyRowWarehouse: cả 2 đều KHÔNG trong danh sách -> other', () => {
    const roster = parseStaffRoster('A (111)\nB (222)')
    expect(classifyRowWarehouse({ 'Bốc hàng': 'X (999)', 'Đóng hàng': 'Y (888)' }, roster)).toBe('other')
  })

  it('classifyRowWarehouse: chỉ 1 trong 2 khớp -> mismatch (đơn bốc/đóng lẫn kho)', () => {
    const roster = parseStaffRoster('A (111)\nB (222)')
    expect(classifyRowWarehouse({ 'Bốc hàng': 'A (111)', 'Đóng hàng': 'Y (888)' }, roster)).toBe('mismatch')
    expect(classifyRowWarehouse({ 'Bốc hàng': 'X (999)', 'Đóng hàng': 'B (222)' }, roster)).toBe('mismatch')
  })

  it('splitByWarehouseStaff: danh sách rỗng (chưa nhập) -> không lọc gì, mọi dòng vẫn tính hcm', () => {
    const rows = [{ 'Bốc hàng': 'X (1)', 'Đóng hàng': 'Y (2)' }]
    const result = splitByWarehouseStaff(rows, new Set())
    expect(result).toEqual({ hcmRows: rows, otherRows: [], mismatchRows: [] })
  })

  it('splitByWarehouseStaff: tách đúng 3 nhóm', () => {
    const roster = parseStaffRoster('A (111)\nB (222)')
    const rows = [
      { id: 1, 'Bốc hàng': 'A (111)', 'Đóng hàng': 'B (222)' }, // hcm
      { id: 2, 'Bốc hàng': 'X (999)', 'Đóng hàng': 'Y (888)' }, // other
      { id: 3, 'Bốc hàng': 'A (111)', 'Đóng hàng': 'Y (888)' }, // mismatch
    ]
    const result = splitByWarehouseStaff(rows, roster)
    expect(result.hcmRows.map(r => r.id)).toEqual([1])
    expect(result.otherRows.map(r => r.id)).toEqual([2])
    expect(result.mismatchRows.map(r => r.id)).toEqual([3])
  })
})
