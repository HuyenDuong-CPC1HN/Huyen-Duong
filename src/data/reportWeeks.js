import { createStorageFilesRepository } from './storageFiles'

function fail(error) {
  if (error) throw new Error(error.message || String(error))
}

function storagePath(channel, id) {
  return `weeks/${channel}/${id}.json`
}

export function createReportWeeksRepository(client) {
  const files = createStorageFilesRepository(client)
  const table = () => client.from('report_weeks')
  return {
    async list(channel) {
      const { data, error } = await table().select('*').eq('channel', channel).order('uploaded_at', { ascending: true })
      fail(error)
      return data || []
    },
    async loadRows(week) {
      return files.readJson(week.storage_path)
    },
    async save({ id, channel, label, fileName = null, uploadedAt = new Date().toISOString(), rows, isActive = true }) {
      const path = storagePath(channel, id)
      await files.writeJson(path, rows)
      if (isActive) {
        const { error } = await table().update({ is_active: false }).eq('channel', channel)
        fail(error)
      }
      const record = { id, channel, label, file_name: fileName, uploaded_at: uploadedAt, storage_path: path, is_active: isActive }
      const { error } = await table().upsert(record)
      if (error) {
        await files.remove(path).catch(() => undefined)
        fail(error)
      }
      return record
    },
    async setActive(channel, id) {
      let result = await table().update({ is_active: false }).eq('channel', channel)
      fail(result.error)
      result = await table().update({ is_active: true }).eq('id', id).eq('channel', channel)
      fail(result.error)
    },
    async rename(id, label) {
      const { error } = await table().update({ label }).eq('id', id)
      fail(error)
    },
    async remove(week) {
      const { error } = await table().delete().eq('id', week.id)
      fail(error)
      await files.remove(week.storage_path)
    },
    storagePath,
  }
}
