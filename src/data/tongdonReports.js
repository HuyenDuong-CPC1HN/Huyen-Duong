function fail(error) { if (error) throw new Error(error.message || String(error)) }
export function createTongdonReportsRepository(client) {
  const table = () => client.from('tongdon_reports')
  return {
    async list() {
      const { data, error } = await table().select('*').order('updated_at', { ascending: false })
      fail(error)
      return (data || []).map(row => row.payload)
    },
    async save(report) {
      const { error } = await table().upsert({ id: String(report.id), label: report.label || null, payload: report })
      fail(error)
      return report
    },
    async remove(id) {
      const { error } = await table().delete().eq('id', String(id))
      fail(error)
    },
  }
}
