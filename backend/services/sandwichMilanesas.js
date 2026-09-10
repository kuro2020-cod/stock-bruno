import db from '../database/db.js';
import { SQL_SANDWICH_MILANESAS, HORA_CORTE_MILANESAS, inicioJornadaMilanesas } from './milanesas.js';

export const HORA_CORTE_SANDWICH_MILANESAS = HORA_CORTE_MILANESAS;
export const CODIGO_PRODUCTO_REINICIO_SANDWICH_MILANESAS = 'REINICIO-SANDWICH-MIL';
export { SQL_SANDWICH_MILANESAS };

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const roundUnidades = (n) => {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
};

function fmtMoneyMotivo(n) {
  return round2(n).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function etiquetaJornada(desde) {
  if (!desde) return 'Jornada actual';
  const d = new Date(desde);
  const texto = d.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  return `Desde ${texto}`;
}

export async function getUltimoReinicioSandwichMilanesas() {
  return db.get(
    `
    SELECT id, monto_antes, unidades_antes, jornada_inicio, movimiento_id, usuario, usuario_id, created_at
    FROM sandwich_milanesas_reinicios
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `
  );
}

async function asegurarProductoReinicio(tx = db) {
  let prod = await tx.get(
    `
    SELECT id, nombre FROM productos
    WHERE UPPER(TRIM(codigo)) = ?
    LIMIT 1
  `,
    [CODIGO_PRODUCTO_REINICIO_SANDWICH_MILANESAS]
  );
  if (prod) return prod;

  const ins = await tx.run(
    `
    INSERT INTO productos (
      codigo, nombre, descripcion, precio_compra, precio_venta,
      stock_actual, stock_minimo, unidad_medida, no_controla_stock
    ) VALUES (?, ?, ?, 0, 0, 0, 0, 'unidad', TRUE)
  `,
    [
      CODIGO_PRODUCTO_REINICIO_SANDWICH_MILANESAS,
      'Reinicio contador sandwich milanesas',
      'Registro diario del total vendido en sandwich de milanesas (no es venta)'
    ]
  );
  return { id: ins.lastID, nombre: 'Reinicio contador sandwich milanesas' };
}

async function sumarVentas({ desdeExclusivo = null, hastaInclusive = null } = {}) {
  const params = [CODIGO_PRODUCTO_REINICIO_SANDWICH_MILANESAS];
  let condFecha = '';

  if (desdeExclusivo) {
    condFecha += ` AND m.fecha > ?::timestamptz`;
    params.push(desdeExclusivo);
  }
  if (hastaInclusive) {
    condFecha += ` AND m.fecha <= ?::timestamptz`;
    params.push(hastaInclusive);
  }

  const row = await db.get(
    `
    SELECT
      COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, 0)), 0)::numeric AS monto,
      COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
      COUNT(*)::int AS movimientos
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE m.tipo = 'salida'
      AND UPPER(TRIM(COALESCE(p.codigo, ''))) <> ?
      AND ${SQL_SANDWICH_MILANESAS}
      ${condFecha}
  `,
    params
  );

  return {
    monto: round2(row?.monto),
    unidades: roundUnidades(row?.unidades),
    movimientos: Number(row?.movimientos || 0)
  };
}

export async function asegurarReinicioJornadaSandwichMilanesas() {
  const corte = inicioJornadaMilanesas();
  const corteIso = corte.toISOString();
  const ultimo = await getUltimoReinicioSandwichMilanesas();

  if (!ultimo) {
    await db.run(
      `
      INSERT INTO sandwich_milanesas_reinicios
        (monto_antes, unidades_antes, jornada_inicio, movimiento_id, usuario, usuario_id)
      VALUES (0, 0, ?::timestamptz, NULL, 'Sistema', NULL)
    `,
      [corteIso]
    );
    return { reinicioRealizado: true, seed: true, montoAntes: 0 };
  }

  const ancla = ultimo.jornada_inicio || ultimo.created_at;
  if (ancla && new Date(ancla).getTime() >= corte.getTime()) {
    return { reinicioRealizado: false };
  }

  const desde = ultimo.jornada_inicio || ultimo.created_at;
  const totales = await sumarVentas({
    desdeExclusivo: desde,
    hastaInclusive: corteIso
  });

  const userLabel = 'Sistema';
  const montoAntes = totales.monto;
  const unidadesAntes = totales.unidades;

  await db.transaction(async (tx) => {
    const prod = await asegurarProductoReinicio(tx);
    const motivo =
      montoAntes > 0
        ? `Reinicio contador sandwich milanesas (corte 06:00): total vendido $${fmtMoneyMotivo(montoAntes)} (${unidadesAntes} u.); contador vuelve a 0.`
        : 'Reinicio contador sandwich milanesas (corte 06:00): sin ventas en la jornada; contador vuelve a 0.';

    const mov = await tx.run(
      `
      INSERT INTO movimientos (producto_id, tipo, cantidad, motivo, usuario, precio_unitario)
      VALUES (?, 'ajuste', 1, ?, ?, ?)
    `,
      [prod.id, motivo, userLabel, montoAntes]
    );

    await tx.run(
      `
      INSERT INTO sandwich_milanesas_reinicios
        (monto_antes, unidades_antes, jornada_inicio, movimiento_id, usuario, usuario_id)
      VALUES (?, ?, ?::timestamptz, ?, ?, NULL)
    `,
      [montoAntes, unidadesAntes, corteIso, mov.lastID, userLabel]
    );
  });

  return {
    reinicioRealizado: true,
    seed: false,
    montoAntes,
    unidadesAntes
  };
}

export async function getContadorSandwichMilanesasJornada() {
  await asegurarReinicioJornadaSandwichMilanesas();

  const ultimo = await getUltimoReinicioSandwichMilanesas();
  const jornadaInicio = ultimo?.jornada_inicio || inicioJornadaMilanesas().toISOString();
  const desde = jornadaInicio;
  const totales = await sumarVentas({ desdeExclusivo: desde });

  return {
    monto: totales.monto,
    unidades: totales.unidades,
    movimientos: totales.movimientos,
    jornadaInicio,
    desdeReinicio: desde,
    jornadaLabel: etiquetaJornada(jornadaInicio),
    horaCorte: HORA_CORTE_SANDWICH_MILANESAS
  };
}

export async function getHistorialReiniciosSandwichMilanesas(limit = 14) {
  const lim = Math.min(60, Math.max(1, Number(limit) || 14));
  const rows = await db.all(
    `
    SELECT id, monto_antes, unidades_antes, jornada_inicio, movimiento_id, usuario, created_at
    FROM sandwich_milanesas_reinicios
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `,
    [lim]
  );

  return (rows || []).map((r) => ({
    id: r.id,
    monto: round2(r.monto_antes),
    unidades: roundUnidades(r.unidades_antes),
    jornadaInicio: r.jornada_inicio,
    movimientoId: r.movimiento_id,
    usuario: r.usuario,
    createdAt: r.created_at,
    label: new Date(r.created_at).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short'
    })
  }));
}

export async function getResumenSandwichMilanesas({ historialLimit = 14 } = {}) {
  const actual = await getContadorSandwichMilanesasJornada();
  const historial = await getHistorialReiniciosSandwichMilanesas(historialLimit);
  const ultimoReinicio = await getUltimoReinicioSandwichMilanesas();

  return {
    actual,
    historial,
    horaCorte: HORA_CORTE_SANDWICH_MILANESAS,
    ultimoReinicio: ultimoReinicio
      ? {
          id: ultimoReinicio.id,
          montoAntes: round2(ultimoReinicio.monto_antes),
          unidadesAntes: roundUnidades(ultimoReinicio.unidades_antes),
          jornadaInicio: ultimoReinicio.jornada_inicio,
          movimientoId: ultimoReinicio.movimiento_id,
          usuario: ultimoReinicio.usuario,
          createdAt: ultimoReinicio.created_at
        }
      : null
  };
}
