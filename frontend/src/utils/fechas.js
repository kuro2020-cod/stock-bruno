const TZ_AR = 'America/Argentina/Buenos_Aires'

/** Fecha calendario en Argentina YYYY-MM-DD (no UTC del navegador/servidor). */
export function fechaLocalISO(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d)
}

export const hoyLocalISO = fechaLocalISO

export function addDaysISO(iso, days) {
  const raw = fechaISOParaInput(iso)
  if (!raw) return ''
  const [y, m, d] = raw.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + Number(days)))
  return dt.toISOString().slice(0, 10)
}

/** Valor de input type="date" (YYYY-MM-DD) desde Date/ISO de la API. */
export function fechaISOParaInput(valor) {
  if (valor == null || valor === '') return ''
  const s = String(valor)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : ''
}

export function fmtFechaCorta(iso) {
  const raw = fechaISOParaInput(iso)
  if (!raw) return '—'
  const [y, m, d] = raw.split('-')
  if (!y || !m || !d) return raw
  return `${d}/${m}/${y}`
}
