import db from '../database/db.js'

const round2 = (n) => Math.round(Number(n) * 100) / 100
const round4 = (n) => Math.round(Number(n) * 10000) / 10000

function parseJson(value, fallback = null) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function esEnvaseSistema(producto) {
  return (
    String(producto?.codigo || '')
      .trim()
      .toUpperCase() === 'ENVASE' ||
    String(producto?.nombre || '')
      .trim()
      .toUpperCase() === 'ENVASE'
  )
}

function precioActualLinea(mov) {
  const precioViejo = Number(mov.precio_unitario)
  const precioLista = Number(mov.precio_venta)
  const sinStock = Boolean(mov.no_controla_stock)
  const esEnvase = esEnvaseSistema(mov)
  const esPromo = mov.promo_id != null && mov.promo_id !== ''

  if (esEnvase && sinStock && precioViejo < 0) {
    return precioViejo
  }
  // La promo se cobró a precio promocional; no rearmar la deuda a lista.
  if (esPromo && Number.isFinite(precioViejo)) {
    return precioViejo
  }
  if (!Number.isFinite(precioLista)) {
    return Number.isFinite(precioViejo) ? precioViejo : 0
  }
  return precioLista
}

function fiadoDeLinea(mov, subtotalNuevo, subtotalViejo) {
  const metodo = String(mov.metodo_pago || '').toLowerCase()
  if (metodo === 'fiado') {
    return subtotalNuevo
  }
  if (metodo !== 'mixto') {
    return 0
  }

  const desglose = parseJson(mov.pagos_desglose, {})
  const oldFiado = round2(desglose?.fiado || 0)
  if (oldFiado < 0.01) return 0
  if (subtotalViejo > 0.001) {
    return round2(subtotalNuevo * (oldFiado / subtotalViejo))
  }
  return oldFiado
}

export function recalcularFiadoDesdeMovimientos(movimientos) {
  const movs = (Array.isArray(movimientos) ? movimientos : []).filter(Boolean)
  if (!movs.length) return null

  const items = []
  let monto = 0

  for (const mov of movs) {
    const cantidad = round4(mov.cantidad)
    const precioViejo = Number(mov.precio_unitario)
    const precioActual = precioActualLinea(mov)
    const esPromo = mov.promo_id != null && mov.promo_id !== ''
    let subtotalNuevo = round2(cantidad * precioActual)
    let subtotalViejo = round2(cantidad * (Number.isFinite(precioViejo) ? precioViejo : precioActual))
    // 733.33 × 3 = 2199.99 cuando la promo vale 2200
    if (esPromo && cantidad > 1) {
      const enteros = Math.round(subtotalNuevo)
      if (Math.abs(subtotalNuevo - enteros) > 0 && Math.abs(subtotalNuevo - enteros) <= 0.011) {
        subtotalNuevo = enteros
      }
      const enterosV = Math.round(subtotalViejo)
      if (Math.abs(subtotalViejo - enterosV) > 0 && Math.abs(subtotalViejo - enterosV) <= 0.011) {
        subtotalViejo = enterosV
      }
    }
    const fiadoLinea = fiadoDeLinea(mov, subtotalNuevo, subtotalViejo)

    if (fiadoLinea < 0.01 && fiadoLinea > -0.01) continue

    monto = round2(monto + fiadoLinea)
    const precioViejoUnit = Number.isFinite(precioViejo) ? precioViejo : precioActual
    const fiadoLineaViejo = fiadoDeLinea(mov, subtotalViejo, subtotalViejo)
    const precioCambio = Math.abs(precioActual - precioViejoUnit) > 0.05

    items.push({
      producto_id: mov.producto_id,
      nombre: mov.nombre || mov.producto_nombre || 'Producto',
      cantidad,
      unidad_medida: mov.unidad_medida || 'unidad',
      precio_unitario: precioActual,
      precio_unitario_viejo: round2(precioViejoUnit),
      precio_cambio: precioCambio,
      subtotal: fiadoLinea,
      subtotal_viejo: fiadoLineaViejo,
      promo_nombre: mov.promo_nombre || null
    })
  }

  if (!items.length) return null

  const detalle = items
    .map((it) => {
      const promo = it.promo_nombre ? ` [${it.promo_nombre}]` : ''
      return `${it.nombre}${promo} x${it.cantidad} @ ${it.precio_unitario.toFixed(2)}`
    })
    .join(', ')
    .slice(0, 500)

  return {
    monto: round2(monto),
    items,
    detalle
  }
}

export async function cargarMovimientosPorIds(ids, runner = db) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isFinite(id)))]
  if (!list.length) return new Map()

  const placeholders = list.map(() => '?').join(', ')
  const rows = await runner.all(
    `
    SELECT
      m.id,
      m.producto_id,
      m.cantidad,
      m.precio_unitario,
      m.metodo_pago,
      m.pagos_desglose,
      m.promo_id,
      m.promo_nombre,
      p.nombre,
      p.codigo,
      p.precio_venta,
      p.unidad_medida,
      p.no_controla_stock
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    WHERE m.id IN (${placeholders})
  `,
    list
  )

  const map = new Map()
  for (const row of rows) {
    map.set(Number(row.id), row)
  }
  return map
}

const detallePagoParcial = (id) => `Pago parcial (ref. #${id})`

function mapPagoParcialRow(row, fiadoId) {
  let desglose = row.pagos_desglose_cobro
  if (typeof desglose === 'string') {
    try {
      desglose = JSON.parse(desglose)
    } catch {
      desglose = null
    }
  }
  return {
    fiado_id: fiadoId,
    monto: round2(row.monto),
    fecha: row.cobrado_at || row.fecha || null,
    metodo_cobro: row.metodo_cobro || null,
    cobrado_por: row.cobrado_por || null,
    pagos_desglose: desglose && typeof desglose === 'object' ? desglose : null
  }
}

async function cargarPagosParcialesPorFiadoIds(ids, runner = db) {
  const list = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => Number.isFinite(id)))]
  const map = new Map()
  if (!list.length) return map

  const placeholders = list.map(() => '?').join(', ')
  const rows = await runner.all(
    `
    SELECT id, detalle, monto, fecha, cobrado_at, metodo_cobro, cobrado_por, pagos_desglose_cobro
    FROM fiados
    WHERE estado = 'cobrado'
      AND detalle IN (${placeholders})
    ORDER BY cobrado_at ASC NULLS LAST, id ASC
  `,
    list.map(detallePagoParcial)
  )

  for (const row of rows || []) {
    const m = String(row.detalle || '').match(/Pago parcial \(ref\. #(\d+)\)/i)
    if (!m) continue
    const id = Number(m[1])
    const prev = map.get(id) || { total: 0, pagos: [] }
    const pago = mapPagoParcialRow(row, id)
    prev.total = round2(prev.total + pago.monto)
    prev.pagos.push(pago)
    map.set(id, prev)
  }
  return map
}

function aplicarPagosParciales(recalculado, infoPagos) {
  const pagos = Array.isArray(infoPagos?.pagos) ? infoPagos.pagos : []
  const cobrado = round2(infoPagos?.total || 0)
  if (!recalculado) return null

  const base = round2(recalculado.monto)
  const monto = round2(Math.max(0, base - cobrado))
  if (monto < 0.01 && cobrado < 0.01) return recalculado
  if (monto < 0.01) {
    return {
      ...recalculado,
      monto: 0,
      monto_compra: base,
      pagos_parciales: pagos
    }
  }

  return {
    ...recalculado,
    monto,
    monto_compra: cobrado > 0.01 ? base : undefined,
    pagos_parciales: pagos
  }
}

export async function enriquecerFiados(rows, runner = db) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return list

  const idsPendientes = list
    .filter((row) => row?.estado === 'pendiente')
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id))

  const idsMov = [
    ...new Set(
      list
        .filter((row) => row?.estado === 'pendiente' && Array.isArray(row.movimiento_ids) && row.movimiento_ids.length)
        .flatMap((row) => row.movimiento_ids.map(Number).filter((id) => Number.isFinite(id)))
    )
  ]

  const [movMap, pagosMap] = await Promise.all([
    cargarMovimientosPorIds(idsMov, runner),
    cargarPagosParcialesPorFiadoIds(idsPendientes, runner)
  ])

  return list.map((row) => {
    if (row?.estado !== 'pendiente') {
      return row
    }

    const infoPagos = pagosMap.get(Number(row.id)) || { total: 0, pagos: [] }
    const tieneMovs = Array.isArray(row.movimiento_ids) && row.movimiento_ids.length

    if (!tieneMovs) {
      if (infoPagos.total < 0.01) return row
      const stored = round2(row.monto)
      const monto = stored > infoPagos.total + 0.05 ? round2(stored - infoPagos.total) : stored
      return {
        ...row,
        monto,
        monto_compra: round2(monto + infoPagos.total),
        pagos_parciales: infoPagos.pagos
      }
    }

    const movs = row.movimiento_ids
      .map((id) => movMap.get(Number(id)))
      .filter(Boolean)

    const recalculado = aplicarPagosParciales(recalcularFiadoDesdeMovimientos(movs), infoPagos)
    if (!recalculado) {
      return { ...row, monto: 0, items: [], pagos_parciales: infoPagos.pagos }
    }

    const cambioPrecio = (recalculado.items || []).some((it) => it.precio_cambio)

    return {
      ...row,
      monto: recalculado.monto,
      monto_compra: recalculado.monto_compra,
      monto_original: cambioPrecio ? recalculado.monto_compra : undefined,
      detalle: recalculado.detalle || row.detalle,
      items: recalculado.items,
      pagos_parciales: recalculado.pagos_parciales || [],
      precios_actualizados: cambioPrecio
    }
  })
}

export async function sincronizarMontoFiadoPendiente(fiadoRow, runner = db) {
  if (!fiadoRow || fiadoRow.estado !== 'pendiente') return fiadoRow

  const [enriquecido] = await enriquecerFiados([fiadoRow], runner)
  if (!enriquecido) return fiadoRow

  const storedRow = await runner.get(
    `
    SELECT monto
    FROM fiados
    WHERE id = ? AND estado = 'pendiente'
  `,
    [fiadoRow.id]
  )
  if (!storedRow) return enriquecido

  // Comparar contra el monto en DB: el row en memoria puede venir ya enriquecido
  // y, si coinciden, se salteaba el UPDATE. El cobro después leía el valor viejo.
  if (enriquecido.monto === round2(storedRow.monto)) {
    return enriquecido
  }

  await runner.run(
    `
    UPDATE fiados
    SET monto = ?, detalle = ?
    WHERE id = ? AND estado = 'pendiente'
  `,
    [enriquecido.monto, enriquecido.detalle || fiadoRow.detalle, fiadoRow.id]
  )

  return enriquecido
}
