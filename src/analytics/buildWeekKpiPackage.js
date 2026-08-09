function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

function addNumber(target, key, value) {
  const number = finiteNumber(value)
  if (number !== undefined) target[key] = number
}

function firstNumber(source, keys) {
  for (const key of keys) {
    const value = finiteNumber(source?.[key])
    if (value !== undefined) return value
  }
  return undefined
}

export function buildWeekKpiPackage({ tongdonReport, sources = {} } = {}) {
  const current = tongdonReport?.current || {}
  const totals = {}
  addNumber(totals, 'total_orders', current.grandTotal)
  addNumber(totals, 'don_c', current.totalC)
  addNumber(totals, 'don_dtp', current.totalDTP)
  addNumber(totals, 'tmdt', current.totalTMDT)

  const delivery = {}
  addNumber(delivery, 'direct_total', current.trucTiepTong)
  addNumber(delivery, 'within_24h', current.gh24)
  addNumber(delivery, 'within_48h', current.gh48)
  addNumber(delivery, 'within_72h', current.gh72)
  addNumber(delivery, 'pending', current.chuaGiao)
  addNumber(delivery, 'sla_24h_pct', current.rate24h)
  const returnRate = firstNumber(current, ['returnRatePct', 'return_rate_pct', 'returnRate'])
  if (returnRate !== undefined) delivery.return_rate_pct = returnRate

  const kpi_json = {
    schema_version: '1.0',
    cycle_key: tongdonReport?.weekKey,
    period: {
      label: tongdonReport?.label || tongdonReport?.title || null,
      saved_at: tongdonReport?.createdAt || null,
    },
  }
  if (Object.keys(totals).length) kpi_json.totals = totals
  if (Object.keys(delivery).length) kpi_json.delivery = delivery

  return {
    kpi_json,
    source_refs: {
      tongdon_report_id: String(tongdonReport?.id || ''),
      sheet_report_ids: {
        donC: String(sources.donC?.id || ''),
        donDTP: String(sources.donDTP?.id || ''),
      },
    },
  }
}
