import assert from 'node:assert/strict'
import test from 'node:test'

import * as XLSX from 'xlsx'

const minimumSafeVersion = [0, 20, 2]

function compareVersions(left, right) {
  for (let index = 0; index < right.length; index += 1) {
    const difference = (left[index] ?? 0) - right[index]
    if (difference !== 0) return difference
  }
  return 0
}

test('uses a SheetJS release that includes the XLSX security fixes', () => {
  const installedVersion = XLSX.version.split('.').map(Number)

  assert.ok(
    compareVersions(installedVersion, minimumSafeVersion) >= 0,
    `Expected SheetJS >= ${minimumSafeVersion.join('.')}, received ${XLSX.version}`,
  )

  const sourceRows = [['Mã vận đơn', 'Trạng thái'], ['VTP001', 'Giao thành công']]
  const worksheet = XLSX.utils.aoa_to_sheet(sourceRows)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Báo cáo')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const parsedWorkbook = XLSX.read(bytes, { type: 'buffer' })

  assert.deepEqual(
    XLSX.utils.sheet_to_json(parsedWorkbook.Sheets['Báo cáo'], { defval: '' }),
    [{ 'Mã vận đơn': 'VTP001', 'Trạng thái': 'Giao thành công' }],
  )
})
