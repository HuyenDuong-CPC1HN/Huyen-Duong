function fail(error) {
  if (error) throw new Error(error.message || String(error))
}

export function createOpsSettingsRepository(client) {
  const table = () => client.from('ops_settings')
  return {
    async get(key, fallback = null) {
      const { data, error } = await table().select('value').eq('key', key).single()
      if (error?.code === 'PGRST116') return fallback
      fail(error)
      return data?.value ?? fallback
    },
    async set(key, value) {
      const { error } = await table().upsert({ key, value })
      fail(error)
      return value
    },
    async remove(key) {
      const { error } = await table().delete().eq('key', key)
      fail(error)
    },
  }
}
