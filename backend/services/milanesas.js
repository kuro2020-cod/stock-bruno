import db from '../database/db.js';

/** Hora local de corte de jornada (reinicio diario del contador). */
export const HORA_CORTE_MILANESAS = 6;

export const CODIGO_PRODUCTO_REINICIO_MILANESAS = 'REINICIO-MILANESAS';

/**
 * Condición SQL: sandwich / sánguche de milanesa (nombre o categoría).
 * Alias esperados: productos p, categorias c (LEFT JOIN).
 */
export const SQL_ES_SANDWICH_MILANESA = `(
  (
    LOWER(p.nombre) LIKE '%milanes%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%milanes%'
  )
  AND (
    LOWER(p.nombre) LIKE '%sandwich%'
    OR LOWER(p.nombre) LIKE '%sandwicht%'
    OR LOWER(p.nombre) LIKE '%sanguch%'
    OR LOWER(p.nombre) LIKE '%sanduch%'
    OR LOWER(p.nombre) LIKE '%sándwich%'
    OR LOWER(p.nombre) LIKE '%sánguch%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%sandwich%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%sanguch%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%sanduch%'
  )
)`;

export const SQL_SANDWICH_MILANESAS = SQL_ES_SANDWICH_MILANESA;

/**
 * Rollitos jamón y queso (mismo criterio que el contador dedicado).
 */
export const SQL_ROLLITOS_JAMON_QUESO_EN_MILANESAS = `(
  (
    LOWER(p.nombre) LIKE '%rollit%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%rollit%'
  )
  AND (
    LOWER(p.nombre) LIKE '%jamon%'
    OR LOWER(p.nombre) LIKE '%jamón%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%jamon%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%jamón%'
  )
  AND (
    LOWER(p.nombre) LIKE '%queso%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%queso%'
  )
)`;

/**
 * Condición SQL para milanesas sueltas (excluye sandwich / sánguche).
 * Alias esperados: productos p, categorias c (LEFT JOIN).
 */
export const SQL_MILANESAS = `(
  (
    LOWER(p.nombre) LIKE '%milanes%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%milanes%'
  )
  AND NOT ${SQL_ES_SANDWICH_MILANESA}
)`;

/** Contador unificado del dashboard: milanesas + sandwich/sanguche + rollitos. */
export const SQL_MILANESAS_UNIFICADO = `(
  ${SQL_MILANESAS}
  OR ${SQL_ES_SANDWICH_MILANESA}
  OR ${SQL_ROLLITOS_JAMON_QUESO_EN_MILANESAS}
)`;

const SQL_EXCLUIR_REINICIOS = `UPPER(TRIM(COALESCE(p.codigo, ''))) NOT LIKE 'REINICIO-%'`;

const SQL_MILANESA_POLLO = `(
  ${SQL_MILANESAS}
  AND (
    LOWER(p.nombre) LIKE '%pollo%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%pollo%'
  )
)`;

const SQL_MILANESA_CARNE = `(
  ${SQL_MILANESAS}
  AND NOT (
    LOWER(p.nombre) LIKE '%pollo%'
    OR LOWER(COALESCE(c.nombre, '')) LIKE '%pollo%'
  )
)`;

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const roundUnidades = (n) => {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
};

/**
 * Inicio de la jornada actual: último corte a las 06:00 (hora local del servidor).
 * Antes de las 6:00 pertenece a la jornada del día anterior.
 */
export function inicioJornadaMilanesas(fechaRef = new Date()) {
  const d = new Date(fechaRef);
  const corte = new Date(d.getFullYear(), d.getMonth(), d.getDate(), HORA_CORTE_MILANESAS, 0, 0, 0);
  if (d < corte) {
    corte.setDate(corte.getDate() - 1);
  }
  return corte;
}

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

export async function getUltimoReinicioMilanesas() {
  return db.get(
    `
    SELECT id, monto_antes, unidades_antes, jornada_inicio, movimiento_id, usuario, usuario_id, created_at
    FROM milanesas_reinicios
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
    [CODIGO_PRODUCTO_REINICIO_MILANESAS]
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
      CODIGO_PRODUCTO_REINICIO_MILANESAS,
      'Reinicio contador milanesas',
      'Registro diario del total vendido en milanesas (no es venta)'
    ]
  );
  return { id: ins.lastID, nombre: 'Reinicio contador milanesas' };
}

async function sumarVentasMilanesas({ desdeExclusivo = null, hastaInclusive = null } = {}) {
  const params = [];
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
      AND ${SQL_EXCLUIR_REINICIOS}
      AND ${SQL_MILANESAS_UNIFICADO}
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

async function sumarBucket({ sqlBucket, desdeExclusivo = null } = {}) {
  const params = [];
  let condFecha = '';
  if (desdeExclusivo) {
    condFecha = ` AND m.fecha > ?::timestamptz`;
    params.push(desdeExclusivo);
  }
  const row = await db.get(
    `
    SELECT
      COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, 0)), 0)::numeric AS total,
      COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
      COUNT(*)::int AS movimientos
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE m.tipo = 'salida'
      AND ${SQL_EXCLUIR_REINICIOS}
      AND ${sqlBucket}
      ${condFecha}
  `,
    params
  );
  return {
    unidades: roundUnidades(row?.unidades),
    movimientos: Number(row?.movimientos || 0),
    total: round2(row?.total)
  };
}

/**
 * Detalle de la jornada: distinción por tipo de producto (como el café).
 */
export async function getDetalleVentasMilanesas({ desdeExclusivo = null } = {}) {
  const [carne, pollo, sandwich, rollitos] = await Promise.all([
    sumarBucket({ sqlBucket: SQL_MILANESA_CARNE, desdeExclusivo }),
    sumarBucket({ sqlBucket: SQL_MILANESA_POLLO, desdeExclusivo }),
    sumarBucket({ sqlBucket: SQL_ES_SANDWICH_MILANESA, desdeExclusivo }),
    sumarBucket({ sqlBucket: SQL_ROLLITOS_JAMON_QUESO_EN_MILANESAS, desdeExclusivo })
  ]);

  const totalCobrado = round2(carne.total + pollo.total + sandwich.total + rollitos.total);

  return {
    milanesasCarne: carne,
    milanesasPollo: pollo,
    sandwichMilanesas: sandwich,
    rollitosJamonQueso: rollitos,
    totalCobrado
  };
}

/**
 * Si ya pasó el corte de las 6:00 y aún no hay reinicio de esta jornada,
 * registra en Movimientos el total acumulado y deja el contador en 0 para la jornada nueva.
 */
export async function asegurarReinicioJornadaMilanesas() {
  const corte = inicioJornadaMilanesas();
  const corteIso = corte.toISOString();
  const ultimo = await getUltimoReinicioMilanesas();

  if (!ultimo) {
    // Primera vez: anclar el ciclo en el corte actual sin arrastrar histórico ni ensuciar Movimientos.
    await db.run(
      `
      INSERT INTO milanesas_reinicios
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
  const totales = await sumarVentasMilanesas({
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
        ? `Reinicio contador milanesas (corte 06:00): total vendido $${fmtMoneyMotivo(montoAntes)} (${unidadesAntes} u.); contador vuelve a 0.`
        : 'Reinicio contador milanesas (corte 06:00): sin ventas en la jornada; contador vuelve a 0.';

    const mov = await tx.run(
      `
      INSERT INTO movimientos (producto_id, tipo, cantidad, motivo, usuario, precio_unitario)
      VALUES (?, 'ajuste', 1, ?, ?, ?)
    `,
      [prod.id, motivo, userLabel, montoAntes]
    );

    await tx.run(
      `
      INSERT INTO milanesas_reinicios
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

/**
 * Contador de la jornada actual: $ vendidos desde el último reinicio / corte 06:00.
 */
export async function getContadorMilanesasJornada() {
  await asegurarReinicioJornadaMilanesas();

  const ultimo = await getUltimoReinicioMilanesas();
  const jornadaInicio = ultimo?.jornada_inicio || inicioJornadaMilanesas().toISOString();
  const desde = jornadaInicio;

  const totales = await sumarVentasMilanesas({ desdeExclusivo: desde });

  return {
    monto: totales.monto,
    unidades: totales.unidades,
    movimientos: totales.movimientos,
    jornadaInicio,
    desdeReinicio: desde,
    jornadaLabel: etiquetaJornada(jornadaInicio),
    horaCorte: HORA_CORTE_MILANESAS
  };
}

export async function getHistorialReiniciosMilanesas(limit = 14) {
  const lim = Math.min(60, Math.max(1, Number(limit) || 14));
  const rows = await db.all(
    `
    SELECT id, monto_antes, unidades_antes, jornada_inicio, movimiento_id, usuario, created_at
    FROM milanesas_reinicios
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

/** Payload para dashboard. */
export async function getResumenMilanesas({ historialLimit = 14 } = {}) {
  const actual = await getContadorMilanesasJornada();
  const historial = await getHistorialReiniciosMilanesas(historialLimit);
  const ultimoReinicio = await getUltimoReinicioMilanesas();
  const detalleVentas = await getDetalleVentasMilanesas({
    desdeExclusivo: actual.desdeReinicio || null
  });

  return {
    actual,
    historial,
    horaCorte: HORA_CORTE_MILANESAS,
    detalleVentas,
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
