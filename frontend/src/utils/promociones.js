import { fmtCantidadStock } from './unidades'
import { hoyLocalISO } from './fechas'

export const TIPOS_PROMOCION = {
  fiambre: {
    key: 'fiambre',
    label: 'Fiambre',
    descripcion: 'Promoción por peso (kg)',
    unidadDefault: 'kg',
    color: 'amber',
    cantidadHint: 'Ej. 0,5 kg mínimo'
  },
  prepizza: {
    key: 'prepizza',
    label: 'Pre-pizza',
    descripcion: 'Pre-pizza con salsa y queso',
    unidadDefault: 'unidad',
    color: 'rose',
    cantidadHint: 'Ej. 1 unidad'
  },
  huevos_maple: {
    key: 'huevos_maple',
    label: 'Huevos (maple)',
    descripcion: 'Venta por maple de huevos',
    unidadDefault: 'maple',
    color: 'yellow',
    cantidadHint: 'Ej. 1 maple (30 huevos)'
  },
  combo: {
    key: 'combo',
    label: 'Promociones',
    descripcion: '',
    unidadDefault: 'unidad',
    color: 'violet',
    cantidadHint: 'Armá la promo con los productos incluidos'
  }
}

export const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function etiquetaTipoPromo(tipo) {
  return TIPOS_PROMOCION[tipo]?.label || tipo
}

export function descripcionTipoPromo(tipo) {
  return TIPOS_PROMOCION[tipo]?.descripcion || ''
}

export function claseColorTipo(tipo) {
  const c = TIPOS_PROMOCION[tipo]?.color || 'gray'
  const map = {
    amber: 'bg-amber-50 border-amber-200 text-amber-900',
    rose: 'bg-rose-50 border-rose-200 text-rose-900',
    yellow: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    violet: 'bg-violet-50 border-violet-200 text-violet-900',
    gray: 'bg-gray-50 border-gray-200 text-gray-800'
  }
  return map[c] || map.gray
}

export function promoVigente(p) {
  if (!p?.activa) return false
  const hoy = hoyLocalISO()
  if (p.fecha_inicio && String(p.fecha_inicio).slice(0, 10) > hoy) return false
  if (p.fecha_fin && String(p.fecha_fin).slice(0, 10) < hoy) return false
  return true
}

export function textoCondicionPromo(p) {
  return fmtMoney(p.precio_promocional)
}

/** Productos incluidos en la promo (nombre × cantidad). */
export function textoIncluyeItemsPromo(p) {
  if (!p?.items?.length) return ''
  return p.items
    .map((it) => {
      const nom = it.producto_nombre || `Producto #${it.producto_id}`
      return `${nom} × ${fmtCantidadStock(it.cantidad, it.producto_unidad_medida || 'unidad')}`
    })
    .join(' · ')
}

export function textoFechasPromo(p) {
  const desde = p?.fecha_inicio ? String(p.fecha_inicio).slice(0, 10) : ''
  const hasta = p?.fecha_fin ? String(p.fecha_fin).slice(0, 10) : ''
  if (desde && hasta) return `Desde ${desde} · Hasta ${hasta}`
  if (desde) return `Desde ${desde}`
  if (hasta) return `Hasta ${hasta}`
  return ''
}

export function bordeIzquierdoTipo(tipo) {
  const map = {
    fiambre: 'border-l-amber-400',
    prepizza: 'border-l-rose-400',
    huevos_maple: 'border-l-yellow-400',
    combo: 'border-l-violet-400'
  }
  return map[tipo] || 'border-l-gray-300'
}
