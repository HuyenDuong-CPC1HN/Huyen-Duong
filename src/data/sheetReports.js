function fail(error) { if (error) throw new Error(error.message || String(error)) }

export function createSheetReportsRepository(client) {
  const table = () => client.from('sheet_reports')
  return {
    async list(channel) {
      const { data, error } = await table().select('*').eq('channel', channel).order('updated_at', { ascending: false })
      fail(error)
      return (data || []).map(row => row.payload)
    },
    async save(channel, report) {
      const { error } = await table().upsert({ id: report.id, channel, week_id: report.id, label: report.label, payload: report })
      fail(error)
      return report
    },
    async rename(channel, id, label) {
      const { data, error } = await table().select('payload').eq('channel', channel).eq('week_id', id).single()
      fail(error)
      const payload = { ...data.payload, label }
      const result = await table().upsert({ id, channel, week_id: id, label, payload })
      fail(result.error)
      return payload
    },
    async remove(channel, id) {
      const { error } = await table().delete().eq('channel', channel).eq('week_id', id)
      fail(error)
    },
  }
}
