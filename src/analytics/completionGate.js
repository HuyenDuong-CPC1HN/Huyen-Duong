function isReport(value) {
  return value && typeof value === 'object' && typeof value.id !== 'undefined'
}

function findMatchingSheets(cycleKey, sheetReportsDonC, sheetReportsDonDTP) {
  for (const donC of sheetReportsDonC.filter(isReport)) {
    for (const donDTP of sheetReportsDonDTP.filter(isReport)) {
      if (`${donC.id}_${donDTP.id}` === cycleKey) return { donC, donDTP }
    }
  }
  return {
    donC: sheetReportsDonDTP.filter(isReport).length === 0
      ? sheetReportsDonC.filter(isReport).find((report) => cycleKey.startsWith(`${report.id}_`))
      : undefined,
    donDTP: sheetReportsDonC.filter(isReport).length === 0
      ? sheetReportsDonDTP.filter(isReport).find((report) => cycleKey.endsWith(`_${report.id}`))
      : undefined,
  }
}

export function evaluateCompletion({ tongdonReport, sheetReportsDonC = [], sheetReportsDonDTP = [] } = {}) {
  const cycleKey = typeof tongdonReport?.weekKey === 'string' && tongdonReport.weekKey.trim()
    ? tongdonReport.weekKey
    : null
  if (!cycleKey) return { ok: false, cycleKey: null, missing: ['tongdon_week_key'], sources: {} }

  const sources = findMatchingSheets(cycleKey, sheetReportsDonC, sheetReportsDonDTP)
  const missing = []
  if (!sources.donC) missing.push('sheet_report_donC')
  if (!sources.donDTP) missing.push('sheet_report_donDTP')

  return { ok: missing.length === 0, cycleKey, missing, sources }
}
