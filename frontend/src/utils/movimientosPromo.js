/** Parsea pagos_desglose de un movimiento (objeto o JSON string). */
export function parsePagosDesglose(m) {
  if (!m?.pagos_desglose) return null
  if (typeof m.pagos_desglose === 'object') return m.pagos_desglose
  try {
    return JSON.parse(m.pagos_desglose)
  } catch {
    return null
  }
}

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100

/**
 * Agrupa salidas de una misma promoción en una sola fila de vista.
 * El stock sigue descontándose por producto en la base; solo cambia la presentación.
 */
export function consolidarPromosEnMovimientos(lista) {
  const out = []
  const vistos = new Set()

  for (const m of lista || []) {
    const grupo = m.venta_grupo_id
    const promoId = m.promo_id != null && m.promo_id !== '' ? Number(m.promo_id) : null

    if (m.tipo === 'salida' && grupo && promoId) {
      const key = `${grupo}::${promoId}`
      if (vistos.has(key)) continue
      vistos.add(key)

      const hermanos = lista.filter(
        (x) =>
          x.tipo === 'salida' &&
          x.venta_grupo_id === grupo &&
          Number(x.promo_id) === promoId
      )
      const importe = round2(
        hermanos.reduce(
          (s, x) => s + Number(x.cantidad || 0) * Number(x.precio_unitario || 0),
          0
        )
      )
      const packs = Number(hermanos[0]?.promo_unidades) || 1
      const incluye = hermanos
        .map((x) => x.producto_nombre)
        .filter(Boolean)
        .join(' · ')

      const desglose = {}
      let tieneDesglose = false
      for (const h of hermanos) {
        const p = parsePagosDesglose(h)
        if (!p) continue
        tieneDesglose = true
        for (const [k, v] of Object.entries(p)) {
          desglose[k] = round2((desglose[k] || 0) + Number(v || 0))
        }
      }

      out.push({
        ...hermanos[0],
        id: hermanos[0].id,
        producto_nombre: hermanos[0].promo_nombre || 'Promoción',
        producto_codigo: 'PROMO',
        cantidad: packs,
        precio_unitario: packs > 0 ? round2(importe / packs) : importe,
        pagos_desglose: tieneDesglose ? desglose : hermanos[0].pagos_desglose,
        motivo: incluye ? `Incluye: ${incluye}` : hermanos[0].motivo || 'Venta promoción',
        _esPromoAgrupada: true,
        _importePromo: importe
      })
      continue
    }

    out.push(m)
  }

  return out
}
