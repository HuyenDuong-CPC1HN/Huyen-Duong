import assert from 'node:assert/strict'
import test from 'node:test'
import { assembleKvstore, mapKey } from '../migrate-firestore-to-supabase.mjs'

test('reassembles a chunked Firestore week payload', () => {
  const values = assembleKvstore([
    { id: 'weeks_donC', data: { chunked: true, chunkCount: 2 } },
    { id: 'weeks_donC__chunk0', data: { value: '[{"id":"donC_1"' } },
    { id: 'weeks_donC__chunk1', data: { value: ',"data":[]}]' } },
  ])

  assert.equal(values.get('weeks_donC'), '[{"id":"donC_1","data":[]}]')
})

test('maps a week list to relational metadata and Storage payloads', () => {
  const mapped = mapKey('weeks_donC', JSON.stringify([{ id: 'donC_1', label: 'Tuần 32', data: [{ code: 'A' }] }]))

  assert.equal(mapped.kind, 'report_weeks')
  assert.equal(mapped.rows[0].channel, 'donC')
  assert.deepEqual(mapped.files[0].value, [{ code: 'A' }])
})

test('keeps unknown values in ops_settings and reports orphan chunks', () => {
  const result = assembleKvstore([{ id: 'orphan__chunk0', data: { value: 'x' } }], { withWarnings: true })
  assert.deepEqual(result.warnings, ['Orphan chunk: orphan__chunk0'])
  assert.equal(mapKey('custom_override', '3').kind, 'ops_settings')
})

test('reports a missing chunk instead of accepting a truncated payload', () => {
  const result = assembleKvstore([{ id: 'weeks_donC', data: { chunked: true, chunkCount: 1 } }], { withWarnings: true })
  assert.deepEqual(result.warnings, ['Missing chunk: weeks_donC__chunk0'])
  assert.equal(result.values.get('weeks_donC'), '')
})
