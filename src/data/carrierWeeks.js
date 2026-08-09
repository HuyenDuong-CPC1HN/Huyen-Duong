import { createStorageFilesRepository } from './storageFiles'
function fail(error) { if (error) throw new Error(error.message || String(error)) }

export function createCarrierWeeksRepository(client) {
  const files = createStorageFilesRepository(client)
  const table = () => client.from('carrier_weeks')
  const holdTable = () => client.from('carrier_hold_weeks')
  return {
    async list(carrierKey) {
      const { data, error } = await table().select('*').eq('carrier_key', carrierKey).order('uploaded_at', { ascending: false })
      fail(error)
      return data || []
    },
    async save({ id, carrierKey, carrierType, fileName = null, uploadedAt = new Date().toISOString(), rows, isActive = true }) {
      const storagePath = `carriers/${carrierKey}/${id}.json`
      await files.writeJson(storagePath, rows)
      if (isActive) fail((await table().update({ is_active: false }).eq('carrier_key', carrierKey)).error)
      const record = { id, carrier_key: carrierKey, carrier_type: carrierType, file_name: fileName, uploaded_at: uploadedAt, storage_path: storagePath, is_active: isActive }
      const { error } = await table().upsert(record)
      if (error) { await files.remove(storagePath).catch(() => undefined); fail(error) }
      return record
    },
    async loadRows(week) { return files.readJson(week.storage_path) },
    async remove(week) { fail((await table().delete().eq('id', week.id)).error); await files.remove(week.storage_path) },
    async listHoldWeeks(carrierKey) {
      const { data, error } = await holdTable().select('*').eq('carrier_key', carrierKey).order('uploaded_at', { ascending: false })
      fail(error); return data || []
    },
  }
}
