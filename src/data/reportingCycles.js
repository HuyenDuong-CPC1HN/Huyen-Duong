function fail(error) { if (error) throw new Error(error.message || String(error)) }

export function createReportingCyclesRepository(client) {
  const table = () => client.from('reporting_cycles')
  return {
    async list() {
      const { data, error } = await table().select('*').order('updated_at', { ascending: false })
      fail(error)
      return data || []
    },
  }
}
