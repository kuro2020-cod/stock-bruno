export const METODOS_VENTA = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];
export const METODOS_PROVEEDOR = ['efectivo', 'transferencia'];

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function mergeMontosPorMetodo(pagosArr, metodosPermitidos = METODOS_VENTA) {
  const acc = {};
  for (const raw of pagosArr || []) {
    const m = String(raw.metodo || '')
      .trim()
      .toLowerCase();
    if (!metodosPermitidos.includes(m)) continue;
    const v = round2(raw.monto);
    if (Number.isNaN(v) || v <= 0) continue;
    acc[m] = round2((acc[m] || 0) + v);
  }
  return acc;
}

export function resolverMetodoPago({ pagos, metodo_pago, montoTotal, metodosPermitidos = METODOS_VENTA }) {
  const merged = mergeMontosPorMetodo(Array.isArray(pagos) ? pagos : [], metodosPermitidos);
  const claves = Object.keys(merged);
  const totalRed = round2(montoTotal);

  if (claves.length >= 2) {
    const sumPagos = round2(claves.reduce((s, k) => s + merged[k], 0));
    if (Math.abs(totalRed - sumPagos) > 0.05) {
      throw new Error(
        `La suma de los medios ($${sumPagos.toFixed(2)}) debe coincidir con el total ($${totalRed.toFixed(2)})`
      );
    }
    return { metodoPago: 'mixto', desglose: merged };
  }

  if (claves.length === 1) {
    const metodo = claves[0];
    const sumPagos = round2(merged[metodo]);
    if (Math.abs(totalRed - sumPagos) > 0.05) {
      throw new Error(
        `El importe para ${metodo} ($${sumPagos.toFixed(2)}) debe coincidir con el total ($${totalRed.toFixed(2)})`
      );
    }
    return { metodoPago: metodo, desglose: null };
  }

  const metodo = metodosPermitidos.includes(String(metodo_pago || '').toLowerCase())
    ? String(metodo_pago).toLowerCase()
    : metodosPermitidos[0];

  return { metodoPago: metodo, desglose: null };
}

export function metodosVacios() {
  return {
    efectivo: { movimientos: 0, total: 0 },
    transferencia: { movimientos: 0, total: 0 },
    tarjeta: { movimientos: 0, total: 0 },
    fiado: { movimientos: 0, total: 0 },
    sin_definir: { movimientos: 0, total: 0 }
  };
}

export function metodosProveedorVacios() {
  return {
    efectivo: { movimientos: 0, total: 0 },
    transferencia: { movimientos: 0, total: 0 }
  };
}
