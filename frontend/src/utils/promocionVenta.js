import { fmtCantidadStock, redondearCantidad } from './unidades'
import { productoNoControlaStock, MAX_CANTIDAD_SIN_STOCK } from './stockProducto'

const round2 = (n) => Math.round(Number(n) * 100) / 100

const numQ = (q) => (q === '' || q === null || q === undefined ? 0 : Number(q))

/**
 * Reparte el precio total de la promo (precio_promocional) entre las líneas de stock.
 */
export function calcPreciosLineasPromo(promo, items) {
  const lineas = (items || []).map((it) => ({
    producto_id: Number(it.producto_id),
    cantidad: Number(it.cantidad),
    precioLista: Number(it.producto_precio_venta ?? it.precio_venta ?? 0),
    precioUnitFijo:
      it.precio_unitario != null && it.precio_unitario !== '' ? round2(Number(it.precio_unitario)) : null
  }))

  if (lineas.length === 0) return []

  const totalPromo = round2(Number(promo?.precio_promocional) || 0)

  const todosConPrecioFijo = lineas.every((l) => l.precioUnitFijo != null && !Number.isNaN(l.precioUnitFijo))
  if (todosConPrecioFijo) {
    const sumaFija = round2(lineas.reduce((s, l) => s + l.cantidad * l.precioUnitFijo, 0))
    if (totalPromo <= 0 || Math.abs(sumaFija - totalPromo) <= 0.05) {
      return lineas.map((l) => ({
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: l.precioUnitFijo
      }))
    }
  }

  if (totalPromo <= 0) {
    return lineas.map((l) => ({
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: round2(l.precioLista)
    }))
  }

  if (lineas.length === 1) {
    const l = lineas[0]
    return [
      {
        producto_id: l.producto_id,
        cantidad: l.cantidad,
        precio_unitario: round2(totalPromo / l.cantidad)
      }
    ]
  }

  const subtotales = lineas.map((l) => l.cantidad * l.precioLista)
  const sumLista = subtotales.reduce((s, x) => s + x, 0)

  if (sumLista <= 0) {
    const porLinea = totalPromo / lineas.length
    return lineas.map((l) => ({
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: round2(porLinea / l.cantidad)
    }))
  }

  let assigned = 0
  return lineas.map((l, i) => {
    const isLast = i === lineas.length - 1
    const parte = isLast ? round2(totalPromo - assigned) : round2((subtotales[i] / sumLista) * totalPromo)
    assigned = round2(assigned + parte)
    return {
      producto_id: l.producto_id,
      cantidad: l.cantidad,
      precio_unitario: round2(parte / l.cantidad)
    }
  })
}

/** Stock ya comprometido en carrito para un producto (líneas sueltas + promos empaquetadas). */
export function qtyStockProductoEnCarrito(cart, productoId, excluirLineKey = null) {
  const pid = Number(productoId)
  let s = 0
  for (const l of cart) {
    const lk = l.line_key ?? l.producto_id
    if (excluirLineKey != null && lk === excluirLineKey) continue

    if (l.es_linea_promo && l.promo_detalle_stock?.length) {
      for (const d of l.promo_detalle_stock) {
        if (Number(d.producto_id) === pid) {
          s += numQ(l.cantidad) * Number(d.cantidad)
        }
      }
    } else if (!l.es_envase && !l.es_cobro_fiado && Number(l.producto_id) === pid) {
      s += numQ(l.cantidad)
    }
  }
  return redondearCantidad(s, 4)
}

/** Cuántas unidades de la promo se pueden vender (1 = una promo) según stock. */
export function maxUnidadesPromoEnCarrito(cart, line, productos, excluirLineKey = null) {
  if (!line.promo_detalle_stock?.length) return 0
  let minPacks = Infinity
  for (const d of line.promo_detalle_stock) {
    const p = productos.find((x) => Number(x.id) === Number(d.producto_id))
    if (!p) return 0
    const need = Number(d.cantidad)
    if (!Number.isFinite(need) || need <= 0) return 0
    if (productoNoControlaStock(p)) {
      minPacks = Math.min(minPacks, Math.floor(MAX_CANTIDAD_SIN_STOCK / need))
      continue
    }
    const lk = line.line_key ?? line.producto_id
    const usado = qtyStockProductoEnCarrito(cart, p.id, excluirLineKey ?? lk)
    const disp = Number(p.stock_actual) - usado
    const packs = Math.floor(disp / need + 1e-9)
    minPacks = Math.min(minPacks, packs)
  }
  return minPacks === Infinity ? 0 : Math.max(0, minPacks)
}

export function textoIncluyePromo(promo, productos) {
  if (!promo?.items?.length) return ''
  return promo.items
    .map((it) => {
      const p = productos.find((x) => Number(x.id) === Number(it.producto_id))
      return p?.nombre || `Producto #${it.producto_id}`
    })
    .join(' · ')
}

/** Una línea de carrito: nombre de la promo, cantidad 1, precio = total de la promo. */
export function lineaCarritoPromoEmpaquetada(promo, productos) {
  if (!promo?.items?.length) return null
  const precios = calcPreciosLineasPromo(promo, promo.items)
  const totalPromo = round2(Number(promo.precio_promocional) || 0)

  const promo_detalle_stock = promo.items.map((it, idx) => {
    const pr = precios[idx] || {}
    return {
      producto_id: Number(it.producto_id),
      cantidad: Number(it.cantidad),
      precio_unitario:
        pr.precio_unitario != null && !Number.isNaN(pr.precio_unitario) ? pr.precio_unitario : 0
    }
  })

  return {
    line_key: `promo-${promo.id}`,
    producto_id: promo_detalle_stock[0]?.producto_id,
    nombre: promo.nombre,
    codigo: 'PROMO',
    unidad_medida: 'promo',
    precio_unitario: totalPromo,
    cantidad: 1,
    promo_id: promo.id,
    promo_nombre: promo.nombre,
    es_linea_promo: true,
    promo_detalle_stock,
    promo_incluye: textoIncluyePromo(promo, productos)
  }
}

export function promoTieneItems(promo) {
  return Array.isArray(promo?.items) && promo.items.length > 0
}

export function lineasCarritoDesdePromo(promo, productos) {
  const linea = lineaCarritoPromoEmpaquetada(promo, productos)
  return linea ? [linea] : []
}

export function validarStockPromo(promo, productos, cart) {
  const linea = lineaCarritoPromoEmpaquetada(promo, productos)
  if (!linea) return ['La promoción no tiene productos configurados']
  if (maxUnidadesPromoEnCarrito(cart, linea, productos) < 1) {
    return [`No hay stock suficiente para "${promo.nombre}"`]
  }
  return []
}

export function subtotalLineaPromo(line) {
  const q = numQ(line.cantidad)
  return round2(q * (Number(line.precio_unitario) || 0))
}

/** Expande el carrito a ítems de venta (cantidades reales de stock). */
export function itemsVentaDesdeCarrito(cart) {
  const out = []
  for (const l of cart) {
    const packs = numQ(l.cantidad)
    if (packs <= 0) continue

    if (l.es_linea_promo && l.promo_detalle_stock?.length) {
      for (const d of l.promo_detalle_stock) {
        out.push({
          producto_id: d.producto_id,
          cantidad: redondearCantidad(packs * Number(d.cantidad), 4),
          precio_unitario: d.precio_unitario,
          promo_id: l.promo_id ?? null,
          promo_nombre: l.promo_nombre || l.nombre || null,
          promo_unidades: packs
        })
      }
    } else {
      out.push({
        producto_id: l.producto_id,
        cantidad: packs,
        precio_unitario: l.precio_unitario,
        es_cobro_fiado: Boolean(l.es_cobro_fiado),
        fiado_id: l.fiado_id != null ? Number(l.fiado_id) : null
      })
    }
  }
  return out
}

export function idLineaCarrito(line) {
  return line.line_key ?? line.producto_id
}
