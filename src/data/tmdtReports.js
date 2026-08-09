function fail(error) { if (error) throw new Error(error.message || String(error)) }
export function createTmdtReportsRepository(client) {
  const table = () => client.from('tmdt_reports')
  return {
    async list() {
      const { data, error } = await table().select('*').order('date_from', { ascending: false })
      fail(error)
      return (data || []).map(row => row.payload)
    },
    async save(report) {
      const { error } = await table().upsert({ id: String(report.id), report_key: report.key, label: report.label, date_from: report.dateFrom, date_to: report.dateTo, payload: report })
      fail(error)
      return report
    },
    async remove(id) {
      const { error } = await table().delete().eq('id', String(id))
      fail(error)
    },
  }
}
