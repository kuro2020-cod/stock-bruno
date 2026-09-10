const round2 = (n) => Math.round(Number(n) * 100) / 100

export const parseMontoPago = (s) => {
  const t = String(s ?? '')
    .trim()
    .replace(',', '.')
  if (t === '') return 0
  const n = parseFloat(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

export const formatMontoInput = (n) => {
  const r = Math.round(Number(n) * 100) / 100
  if (!Number.isFinite(r) || r <= 0) return '0'
  return Number.isInteger(r) ? String(r) : r.toFixed(2)
}

export const sumaMontosMetodos = (metodos, montosPago) => {
  let s = 0
  for (const key of metodos || []) {
    const v = parseMontoPago(montosPago?.[key])
    if (!Number.isNaN(v)) s += v
  }
  return round2(s)
}

/** El fiado cubre lo que falta después de los otros medios. */
export const restoComoFiado = (metodosSeleccionados, montosPago, totalRedondeado) => {
  const otros = (metodosSeleccionados || []).filter((k) => k !== 'fiado')
  return round2(Math.max(0, Number(totalRedondeado) - sumaMontosMetodos(otros, montosPago)))
}

/**
 * Vista previa mientras se cargan montos (permite campos vacíos o en 0).
 */
export function previewPagosCombinados(metodosSeleccionados, montosPago, totalRedondeado) {
  if (!Array.isArray(metodosSeleccionados) || metodosSeleccionados.length < 2) {
    return null
  }

  if (metodosSeleccionados.includes('fiado')) {
    const otros = metodosSeleccionados.filter((k) => k !== 'fiado')
    const montosOtros = {}
    let hayInvalido = false
    for (const key of otros) {
      const raw = montosPago[key]
      if (raw === '' || raw == null) {
        montosOtros[key] = 0
        continue
      }
      const v = parseMontoPago(raw)
      if (Number.isNaN(v)) {
        hayInvalido = true
        montosOtros[key] = 0
        continue
      }
      montosOtros[key] = v
    }
    if (hayInvalido) {
      return {
        estado: 'invalido',
        sumaParcial: 0,
        error: 'Revisá los importes: usá números válidos.'
      }
    }
    const sumaOtros = round2(otros.reduce((s, k) => s + (montosOtros[k] || 0), 0))
    const fiado = round2(Math.max(0, totalRedondeado - sumaOtros))
    const sumaParcial = round2(sumaOtros + fiado)
    if (sumaOtros > totalRedondeado + 0.05) {
      return {
        estado: 'sobra_otros',
        sumaParcial,
        error: 'Los otros medios superan el total. Bajá algún importe para que el fiado pueda cubrir el resto.'
      }
    }
    if (otros.length > 0 && otros.every((k) => (montosOtros[k] || 0) > 0) && fiado >= 0) {
      return {
        estado: fiado < 0.01 ? 'completo' : 'completo',
        sumaParcial,
        resta: 0
      }
    }
    if (sumaOtros <= 0) {
      return {
        estado: 'falta',
        sumaParcial: fiado,
        resta: 0
      }
    }
    return { estado: 'completo', sumaParcial, resta: 0 }
  }

  const montos = {}
  let hayInvalido = false
  let hayAlguno = false

  for (const key of metodosSeleccionados) {
    const raw = montosPago[key]
    if (raw === '' || raw == null) {
      montos[key] = 0
      continue
    }
    hayAlguno = true
    const v = parseMontoPago(raw)
    if (Number.isNaN(v)) {
      hayInvalido = true
      montos[key] = 0
      continue
    }
    montos[key] = v
    if (v > 0) hayAlguno = true
  }

  if (hayInvalido) {
    return {
      estado: 'invalido',
      sumaParcial: 0,
      error: 'Revisá los importes: usá números válidos.'
    }
  }

  if (!hayAlguno) {
    return {
      estado: 'vacio',
      sumaParcial: 0,
      resta: round2(totalRedondeado)
    }
  }

  const sumaParcial = round2(
    metodosSeleccionados.reduce((s, key) => s + (montos[key] || 0), 0)
  )
  const incluyeEfectivo = metodosSeleccionados.includes('efectivo')
  const otrosMetodos = metodosSeleccionados.filter((k) => k !== 'efectivo')

  if (incluyeEfectivo && otrosMetodos.length > 0) {
    const otrosSum = round2(otrosMetodos.reduce((s, k) => s + (montos[k] || 0), 0))
    if (otrosSum > totalRedondeado + 0.05) {
      return {
        estado: 'sobra_otros',
        sumaParcial,
        error:
          'El monto de transferencia, tarjeta o fiado supera el total. Reducilo para poder calcular el vuelto en efectivo.'
      }
    }

    const efectivoNecesario = round2(totalRedondeado - otrosSum)
    const efectivoIngresado = montos.efectivo || 0
    const vuelto = round2(Math.max(0, efectivoIngresado - efectivoNecesario))

    if (efectivoIngresado + 1e-9 >= efectivoNecesario) {
      if (vuelto > 0.05) {
        return {
          estado: 'vuelto',
          sumaParcial,
          vuelto,
          efectivoRegistrado: efectivoNecesario,
          efectivoNecesario
        }
      }
      const todosConMonto = metodosSeleccionados.every((k) => (montos[k] || 0) > 0)
      if (todosConMonto && Math.abs(sumaParcial - totalRedondeado) <= 0.05) {
        return { estado: 'completo', sumaParcial }
      }
    }

    return {
      estado: 'falta',
      sumaParcial,
      resta: round2(Math.max(0, totalRedondeado - sumaParcial)),
      efectivoNecesario,
      efectivoIngresado
    }
  }

  if (Math.abs(sumaParcial - totalRedondeado) <= 0.05) {
    const todosConMonto = metodosSeleccionados.every((k) => (montos[k] || 0) > 0)
    if (todosConMonto) return { estado: 'completo', sumaParcial }
    return {
      estado: 'falta',
      sumaParcial,
      resta: round2(Math.max(0, totalRedondeado - sumaParcial))
    }
  }

  if (sumaParcial > totalRedondeado + 0.05) {
    return {
      estado: 'sobra',
      sumaParcial,
      resta: round2(sumaParcial - totalRedondeado)
    }
  }

  return {
    estado: 'falta',
    sumaParcial,
    resta: round2(totalRedondeado - sumaParcial)
  }
}

/**
 * Resuelve pagos combinados. Si incluye efectivo + otro medio y el efectivo ingresado
 * supera lo necesario, calcula vuelto y registra solo el efectivo neto.
 */
export function resolverPagosCombinados(metodosSeleccionados, montosPago, totalRedondeado) {
  if (!Array.isArray(metodosSeleccionados) || metodosSeleccionados.length < 2) {
    return { ok: false, error: 'Con pago combinado necesitás al menos dos métodos con importe.' }
  }

  if (metodosSeleccionados.includes('fiado')) {
    const otros = metodosSeleccionados.filter((k) => k !== 'fiado')
    const montos = {}
    for (const key of otros) {
      const v = parseMontoPago(montosPago[key])
      if (Number.isNaN(v)) {
        return { ok: false, error: 'Revisá los importes: usá números válidos.' }
      }
      if (v <= 0) {
        return { ok: false, error: 'Cada método además del fiado debe tener un importe mayor a 0.' }
      }
      montos[key] = v
    }
    const sumaOtros = round2(otros.reduce((s, k) => s + montos[k], 0))
    if (sumaOtros > totalRedondeado + 0.05) {
      return {
        ok: false,
        estado: 'sobra_otros',
        sumaIngresada: sumaOtros,
        error: 'Los otros medios superan el total. Bajá algún importe para dejar el resto en fiado.'
      }
    }
    const fiado = round2(Math.max(0, totalRedondeado - sumaOtros))
    const entries = [
      ...otros.map((k) => ({ metodo: k, monto: montos[k] })),
      ...(fiado > 0.001 ? [{ metodo: 'fiado', monto: fiado }] : [])
    ].filter((e) => e.monto > 0.001)
    if (!entries.length) {
      return { ok: false, error: 'Revisá los importes de cada método.' }
    }
    return {
      ok: true,
      entries,
      vuelto: 0,
      estado: 'completo',
      sumaIngresada: round2(sumaOtros + fiado)
    }
  }

  const montos = {}
  for (const key of metodosSeleccionados) {
    const v = parseMontoPago(montosPago[key])
    if (Number.isNaN(v)) {
      return { ok: false, error: 'Revisá los importes: usá números válidos.' }
    }
    if (v <= 0) {
      return { ok: false, error: 'Cada método seleccionado debe tener un importe mayor a 0.' }
    }
    montos[key] = v
  }

  const sumaIngresada = round2(
    metodosSeleccionados.reduce((s, key) => s + montos[key], 0)
  )
  const incluyeEfectivo = metodosSeleccionados.includes('efectivo')
  const otrosMetodos = metodosSeleccionados.filter((k) => k !== 'efectivo')

  if (!incluyeEfectivo || otrosMetodos.length === 0) {
    if (Math.abs(sumaIngresada - totalRedondeado) <= 0.05) {
      return {
        ok: true,
        entries: metodosSeleccionados.map((k) => ({ metodo: k, monto: montos[k] })),
        vuelto: 0,
        estado: 'completo',
        sumaIngresada
      }
    }
    if (sumaIngresada > totalRedondeado + 0.05) {
      return {
        ok: false,
        estado: 'sobra',
        sumaIngresada,
        error: `La suma (${sumaIngresada}) supera el total (${totalRedondeado}).`
      }
    }
    return {
      ok: false,
      estado: 'falta',
      error: null,
      sumaIngresada,
      resta: round2(totalRedondeado - sumaIngresada)
    }
  }

  const otrosSum = round2(otrosMetodos.reduce((s, k) => s + montos[k], 0))
  if (otrosSum > totalRedondeado + 0.05) {
    return {
      ok: false,
      estado: 'sobra_otros',
      sumaIngresada,
      error:
        'El monto de transferencia, tarjeta o fiado supera el total. Reducilo para poder calcular el vuelto en efectivo.'
    }
  }

  const efectivoRegistrado = round2(totalRedondeado - otrosSum)
  const efectivoIngresado = montos.efectivo
  const vuelto = round2(Math.max(0, efectivoIngresado - efectivoRegistrado))

  if (efectivoIngresado + 1e-9 < efectivoRegistrado) {
    return {
      ok: false,
      estado: 'falta',
      error: null,
      sumaIngresada,
      resta: round2(efectivoRegistrado - efectivoIngresado)
    }
  }

  const entries = [
    ...otrosMetodos.map((k) => ({ metodo: k, monto: montos[k] })),
    { metodo: 'efectivo', monto: efectivoRegistrado }
  ].filter((e) => e.monto > 0.001)

  if (entries.length < 2) {
    return { ok: false, error: 'Con pago combinado necesitás al menos dos métodos con importe.' }
  }

  return {
    ok: true,
    entries,
    vuelto,
    estado: vuelto > 0.05 ? 'vuelto' : 'completo',
    efectivoRegistrado,
    sumaIngresada
  }
}

export function indicadorPagosCombinados(preview, totalRedondeado, fmtMoney) {
  if (!preview) {
    return { variant: 'falta', titulo: 'Resta pagar', monto: fmtMoney(totalRedondeado), detalle: 'Completá los importes' }
  }

  const detalleBase = (extra = '') => {
    const base = `Cargado ${fmtMoney(preview.sumaParcial || 0)} de ${fmtMoney(totalRedondeado)}`
    return extra ? `${base} · ${extra}` : base
  }

  if (preview.estado === 'invalido') {
    return {
      variant: 'sobra',
      titulo: 'Monto inválido',
      monto: null,
      detalle: preview.error
    }
  }

  if (preview.estado === 'vacio') {
    return {
      variant: 'falta',
      titulo: 'Resta pagar',
      monto: fmtMoney(totalRedondeado),
      detalle: `Total venta ${fmtMoney(totalRedondeado)}`
    }
  }

  if (preview.estado === 'completo') {
    return {
      variant: 'completo',
      titulo: 'Completo',
      monto: fmtMoney(totalRedondeado),
      detalle: detalleBase('La suma coincide con el total')
    }
  }

  if (preview.estado === 'vuelto') {
    return {
      variant: 'vuelto',
      titulo: 'Vuelto',
      monto: fmtMoney(preview.vuelto),
      detalle: detalleBase(`Efectivo registrado ${fmtMoney(preview.efectivoRegistrado)}`)
    }
  }

  if (preview.estado === 'sobra' || preview.estado === 'sobra_otros') {
    return {
      variant: 'sobra',
      titulo: 'Sobra',
      monto: fmtMoney(preview.resta || 0),
      detalle: preview.error || detalleBase()
    }
  }

  return {
    variant: 'falta',
    titulo: 'Resta pagar',
    monto: fmtMoney(preview.resta || 0),
    detalle: detalleBase()
  }
}
