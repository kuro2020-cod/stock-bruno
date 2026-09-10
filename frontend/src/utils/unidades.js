/** Unidad base de peso: kg (precio = $ por kg, stock = kg) */
export function esUnidadKg(unidad) {
  const u = String(unidad || '')
    .trim()
    .toLowerCase()
  return (
    u === 'kg' ||
    u === 'kilogramo' ||
    u === 'kilogramos' ||
    u === 'kilo' ||
    u === 'kilos'
  )
}

/** Litros: mismo tratamiento que kg (decimales, precio $/l) */
export function esUnidadLitro(unidad) {
  const u = String(unidad || '')
    .trim()
    .toLowerCase()
  return u === 'l' || u === 'lt' || u === 'litro' || u === 'litros'
}

/** kg o litro: venta y stock con decimales */
export function esVentaPorMedidaDecimal(unidad) {
  return esUnidadKg(unidad) || esUnidadLitro(unidad)
}

/** Umbral stock bajo sin mínimo configurado (kg o l) */
export const UMBRAL_KG_SIN_MINIMO = 0.5

/** Umbral stock bajo sin mínimo configurado (unidades) */
export const UMBRAL_STOCK_SIN_MINIMO = 2

/** Paso sugerido para +/- en ventas (kg o litros) */
export const PASO_KG_VENTA = 0.05

export function redondearCantidad(n, decimales = 4) {
  const f = 10 ** decimales
  return Math.round(Number(n) * f) / f
}

/** Etiqueta para precios en formularios: "($/kg)" | "($/l)" | "" */
export function etiquetaPrecioUnidad(unidad) {
  if (esUnidadKg(unidad)) return '($/kg)'
  if (esUnidadLitro(unidad)) return '($/l)'
  return ''
}

/** Etiqueta para cantidad en stock: "(kg)" | "(l)" | "" */
export function etiquetaCantidadUnidad(unidad) {
  if (esUnidadKg(unidad)) return '(kg)'
  if (esUnidadLitro(unidad)) return '(l)'
  return ''
}

export function fmtCantidadStock(n, unidad) {
  const u = String(unidad || 'unidad')
  if (esVentaPorMedidaDecimal(u)) {
    return `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })} ${u}`
  }
  return `${Number(n).toLocaleString('es-ES', { maximumFractionDigits: 0 })} ${u}`
}
