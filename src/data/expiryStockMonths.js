import { createStorageFilesRepository } from './storageFiles'
function fail(error) { if (error) throw new Error(error.message || String(error)) }

export function createExpiryStockMonthsRepository(client) {
  const files = createStorageFilesRepository(client)
  const table = () => client.from('expiry_stock_months')
  return {
    async list() {
      const { data, error } = await table().select('*').order('uploaded_at', { ascending: false })
      fail(error)
      return data || []
    },
    async save({ id, fileName = null, uploadedAt = new Date().toISOString(), rows, isActive = true }) {
      const storagePath = `expiry-stock/${id}.json`
      await files.writeJson(storagePath, rows)
      if (isActive) fail((await table().update({ is_active: false }).eq('is_active', true)).error)
      const record = { id, file_name: fileName, uploaded_at: uploadedAt, storage_path: storagePath, is_active: isActive }
      const { error } = await table().upsert(record)
      if (error) { await files.remove(storagePath).catch(() => undefined); fail(error) }
      return record
    },
    async loadRows(month) { return files.readJson(month.storage_path) },
    async remove(month) { fail((await table().delete().eq('id', month.id)).error); await files.remove(month.storage_path) },
    async setActive(id) {
      fail((await table().update({ is_active: false }).eq('is_active', true)).error)
      if (id) fail((await table().update({ is_active: true }).eq('id', id)).error)
    },
  }
}
