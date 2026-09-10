const TZ_AR = 'America/Argentina/Buenos_Aires';

/** Fecha calendario en Argentina (YYYY-MM-DD), independiente del TZ del proceso Node. */
export function fechaLocalISO(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_AR,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d instanceof Date ? d : new Date(d));
}

/**
 * Normaliza cualquier valor de fecha (Date de pg, ISO, YYYY-MM-DD) a 'YYYY-MM-DD'.
 * Evita errores tipo: date «Tue Aug 18».
 */
export function normalizarFechaISO(valor) {
  if (valor == null || valor === '') return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return fechaLocalISO(valor);
  }
  const raw = String(valor).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const isoPrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return fechaLocalISO(parsed);
  return null;
}

/**
 * Movimientos del día calendario.
 * Si `desdeTimestamp` existe, excluye lo anterior a ese instante (ya cerrado / antes de abrir).
 */
export function condicionMovimientoEnFecha(alias = 'm', desdeTimestamp = null) {
  let cond = `${alias}.fecha >= ?::date AND ${alias}.fecha < (?::date + interval '1 day')`;
  if (desdeTimestamp) {
    cond += ` AND ${alias}.fecha > ?::timestamptz`;
  }
  return cond;
}

export function paramsRangoFechaCaja(fecha, desdeTimestamp = null) {
  const params = [fecha, fecha];
  if (desdeTimestamp) params.push(desdeTimestamp);
  return params;
}

/**
 * Período de turno abierto (puede cruzar medianoche):
 * desde el inicio del turno hasta ahora.
 */
export function condicionMovimientoEnTurno(alias = 'm') {
  return `${alias}.fecha > ?::timestamptz AND ${alias}.fecha <= CURRENT_TIMESTAMP`;
}

export function paramsRangoTurno(desdeTimestamp) {
  return [desdeTimestamp];
}

/**
 * Condición unificada: turno abierto (cruza días) o día calendario.
 * @param {{ modo: 'turno'|'dia', fecha?: string, desdeTimestamp?: string|Date|null }} periodo
 */
export function condicionPeriodoCaja(alias, periodo) {
  if (periodo?.modo === 'turno' && periodo.desdeTimestamp) {
    return {
      sql: condicionMovimientoEnTurno(alias),
      params: paramsRangoTurno(periodo.desdeTimestamp)
    };
  }
  return {
    sql: condicionMovimientoEnFecha(alias, periodo?.desdeTimestamp || null),
    params: paramsRangoFechaCaja(periodo?.fecha, periodo?.desdeTimestamp || null)
  };
}
