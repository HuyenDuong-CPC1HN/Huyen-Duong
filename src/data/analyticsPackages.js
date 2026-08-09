function fail(error) { if (error) throw new Error(error.message || String(error)) }

export function createAnalyticsPackagesRepository(client) {
  return {
    async publish({ cycleKey, tongdonReportId, kpiJson, sourceRefs }) {
      const { data, error } = await client.rpc('publish_analytics_cycle', {
        p_cycle_key: cycleKey,
        p_tongdon_report_id: tongdonReportId,
        p_kpi_json: kpiJson,
        p_source_refs: sourceRefs,
      })
      fail(error)
      return data
    },
    async markStale(cycleKey) {
      const { error } = await client.rpc('unpublish_analytics_cycle', { p_cycle_key: cycleKey })
      fail(error)
    },
  }
}
