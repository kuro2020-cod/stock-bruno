/**
 * Convierte ítems de fiados pendientes en líneas del carrito de Ventas.
 * No descuentan stock al cobrar (es_cobro_fiado).
 * Si hubo pagos a cuenta, el carrito usa el saldo restante (no el total de la compra).
 */
export function lineasCarritoDesdeFiado(fiado) {
  const items = Array.isArray(fiado?.items) ? fiado.items : []
  if (!items.length) return []

  const totalItems = items.reduce((s, it) => {
    const sub = Number(it.subtotal)
    if (Number.isFinite(sub)) return s + sub
    return s + (Number(it.cantidad) || 0) * (Number(it.precio_unitario) || 0)
  }, 0)
  const restante = Number(fiado.monto)
  const factor =
    Number.isFinite(restante) && totalItems > 0.001 ? restante / totalItems : 1

  return items.map((it, idx) => {
    const cantidad = Number(it.cantidad) || 1
    const subtotalOrig = Number.isFinite(Number(it.subtotal))
      ? Number(it.subtotal)
      : cantidad * (Number(it.precio_unitario) || 0)
    const subtotalCart = Math.round(subtotalOrig * factor * 100) / 100
    const precio = cantidad > 0 ? subtotalCart / cantidad : Number(it.precio_unitario) || 0

    return {
      line_key: `fiado-cobro-${fiado.id}-${it.producto_id}-${idx}`,
      producto_id: Number(it.producto_id),
      nombre: it.nombre || 'Producto',
      codigo: it.codigo ?? null,
      unidad_medida: it.unidad_medida || 'unidad',
      precio_unitario: Number.isFinite(precio) ? precio : 0,
      cantidad,
      promo_nombre: it.promo_nombre || null,
      es_cobro_fiado: true,
      fiado_id: Number(fiado.id),
      fiado_cliente: fiado.cliente_nombre || null
    }
  })
}

export function lineasCarritoDesdeFiados(fiados) {
  const out = []
  for (const fiado of Array.isArray(fiados) ? fiados : []) {
    out.push(...lineasCarritoDesdeFiado(fiado))
  }
  return out
}

export function fiadoIdsDesdeCarrito(cart) {
  const ids = new Set()
  for (const line of Array.isArray(cart) ? cart : []) {
    if (line?.es_cobro_fiado && line.fiado_id != null) {
      ids.add(Number(line.fiado_id))
    }
  }
  return [...ids].filter((id) => Number.isFinite(id))
}

export function clienteFiadoDesdeCarrito(cart) {
  for (const line of Array.isArray(cart) ? cart : []) {
    if (line?.es_cobro_fiado && line.fiado_cliente) {
      return String(line.fiado_cliente).trim()
    }
  }
  return ''
}
