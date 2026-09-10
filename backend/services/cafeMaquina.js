import db from '../database/db.js';

/** Umbral del ciclo actual: a partir de acá se muestra alerta de exceso. */
export const UMBRAL_CAFE_MAQUINA = 400;

export const CODIGO_PRODUCTO_REINICIO_CAFE = 'REINICIO-CAFE';

/**
 * Condición SQL para identificar ventas de café máquina
 * (por nombre del producto o de la categoría).
 * Alias esperados: productos p, categorias c (LEFT JOIN).
 */
export const SQL_CAFE_MAQUINA = `(
  (
    (LOWER(p.nombre) LIKE '%cafe%' OR LOWER(p.nombre) LIKE '%café%')
    AND (LOWER(p.nombre) LIKE '%maquin%' OR LOWER(p.nombre) LIKE '%máquin%')
  )
  OR (
    (LOWER(COALESCE(c.nombre, '')) LIKE '%cafe%' OR LOWER(COALESCE(c.nombre, '')) LIKE '%café%')
    AND (
      LOWER(COALESCE(c.nombre, '')) LIKE '%maquin%'
      OR LOWER(COALESCE(c.nombre, '')) LIKE '%máquin%'
    )
  )
  OR LOWER(p.nombre) LIKE '%cafe (maquina)%'
  OR LOWER(p.nombre) LIKE '%café (máquina)%'
  OR LOWER(p.nombre) LIKE '%cafe maquina%'
  OR LOWER(p.nombre) LIKE '%café máquina%'
)`;

/** Café máquina “malo” (variante del producto). */
export const SQL_CAFE_MAQUINA_MALO = `(
  ${SQL_CAFE_MAQUINA}
  AND LOWER(p.nombre) LIKE '%malo%'
)`;

/** Café máquina normal (sin “malo”). */
export const SQL_CAFE_MAQUINA_NORMAL = `(
  ${SQL_CAFE_MAQUINA}
  AND LOWER(p.nombre) NOT LIKE '%malo%'
)`;

function roundUnidades(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
}

function round2(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function mesActualISO(fechaRef = new Date()) {
  const y = fechaRef.getFullYear();
  const m = String(fechaRef.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function etiquetaMes(yyyyMm) {
  const [y, m] = String(yyyyMm).split('-').map(Number);
  if (!y || !m) return String(yyyyMm);
  const d = new Date(y, m - 1, 1);
  const texto = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function armarResumen({ mes, unidades, movimientos, desdeReinicio = null, cicloLabel = null }) {
  const u = roundUnidades(unidades);
  const umbral = UMBRAL_CAFE_MAQUINA;
  return {
    mes,
    mesLabel: cicloLabel || etiquetaMes(mes),
    unidades: u,
    movimientos: Number(movimientos || 0),
    umbral,
    restante: Math.max(0, roundUnidades(umbral - u)),
    porcentaje: umbral > 0 ? Math.min(100, Math.round((u / umbral) * 1000) / 10) : 0,
    exceso: u >= umbral,
    excedente: u > umbral ? roundUnidades(u - umbral) : 0,
    desdeReinicio: desdeReinicio || null
  };
}

/**
 * Montos del ciclo: café suelto, café máquina malo y promo que incluye café.
 */
async function getDetalleMontosCafe({ desdeTimestamp = null, mesKey = null } = {}) {
  const params = [CODIGO_PRODUCTO_REINICIO_CAFE];
  let condFecha;

  if (mesKey && /^\d{4}-\d{2}$/.test(mesKey)) {
    condFecha = `m.fecha >= (? || '-01')::date AND m.fecha < ((? || '-01')::date + interval '1 month')`;
    params.push(mesKey, mesKey);
  } else if (desdeTimestamp) {
    condFecha = `m.fecha > ?::timestamptz`;
    params.push(desdeTimestamp);
  } else {
    condFecha = `m.fecha >= date_trunc('month', CURRENT_TIMESTAMP)
      AND m.fecha < date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month'`;
  }

  const row = await db.get(
    `
    WITH cafe_base AS (
      SELECT
        m.id,
        m.cantidad,
        m.precio_unitario,
        m.promo_id,
        m.venta_grupo_id,
        COALESCE(NULLIF(m.promo_unidades, 0), 1)::numeric AS promo_unidades,
        (LOWER(p.nombre) LIKE '%malo%') AS es_malo
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE m.tipo = 'salida'
        AND UPPER(TRIM(COALESCE(p.codigo, ''))) <> ?
        AND ${condFecha}
        AND ${SQL_CAFE_MAQUINA}
    ),
    suelto_normal AS (
      SELECT
        COALESCE(SUM(cb.cantidad), 0)::numeric AS unidades,
        COALESCE(SUM(cb.cantidad * COALESCE(cb.precio_unitario, 0)), 0)::numeric AS total
      FROM cafe_base cb
      WHERE cb.promo_id IS NULL
        AND cb.es_malo = FALSE
    ),
    suelto_malo AS (
      SELECT
        COALESCE(SUM(cb.cantidad), 0)::numeric AS unidades,
        COALESCE(SUM(cb.cantidad * COALESCE(cb.precio_unitario, 0)), 0)::numeric AS total
      FROM cafe_base cb
      WHERE cb.promo_id IS NULL
        AND cb.es_malo = TRUE
    ),
    aportes_promo AS (
      SELECT
        SUM(m2.cantidad * COALESCE(m2.precio_unitario, 0))::numeric AS aporte,
        MAX(COALESCE(NULLIF(m2.promo_unidades, 0), g.promo_unidades, 1))::numeric AS packs
      FROM (
        SELECT
          venta_grupo_id,
          promo_id,
          MAX(promo_unidades)::numeric AS promo_unidades
        FROM cafe_base
        WHERE promo_id IS NOT NULL
          AND venta_grupo_id IS NOT NULL
        GROUP BY venta_grupo_id, promo_id
      ) g
      JOIN movimientos m2
        ON m2.venta_grupo_id = g.venta_grupo_id
       AND m2.promo_id = g.promo_id
       AND m2.tipo = 'salida'
      GROUP BY g.venta_grupo_id, g.promo_id, g.promo_unidades

      UNION ALL

      SELECT
        (cb.cantidad * COALESCE(cb.precio_unitario, 0))::numeric AS aporte,
        cb.promo_unidades AS packs
      FROM cafe_base cb
      WHERE cb.promo_id IS NOT NULL
        AND cb.venta_grupo_id IS NULL
    ),
    promo AS (
      SELECT
        COALESCE((SELECT SUM(packs) FROM aportes_promo), 0)::numeric AS ventas,
        COALESCE((SELECT SUM(aporte) FROM aportes_promo), 0)::numeric AS total
    )
    SELECT
      (SELECT unidades FROM suelto_normal) AS cafe_unidades,
      (SELECT total FROM suelto_normal) AS cafe_total,
      (SELECT unidades FROM suelto_malo) AS malo_unidades,
      (SELECT total FROM suelto_malo) AS malo_total,
      (SELECT ventas FROM promo) AS promo_ventas,
      (SELECT total FROM promo) AS promo_total
  `,
    params
  );

  const cafeSuelto = {
    unidades: roundUnidades(row?.cafe_unidades),
    total: round2(row?.cafe_total)
  };
  const cafeMalo = {
    unidades: roundUnidades(row?.malo_unidades),
    total: round2(row?.malo_total)
  };
  const promoCafe = {
    ventas: roundUnidades(row?.promo_ventas),
    total: round2(row?.promo_total)
  };

  return {
    cafeSuelto,
    cafeMalo,
    promoCafe,
    totalCobrado: round2(cafeSuelto.total + cafeMalo.total + promoCafe.total)
  };
}

export async function getUltimoReinicioCafeMaquina() {
  return db.get(
    `
    SELECT id, unidades_antes, movimiento_id, usuario, usuario_id, created_at
    FROM cafe_maquina_reinicios
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
    [CODIGO_PRODUCTO_REINICIO_CAFE]
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
      CODIGO_PRODUCTO_REINICIO_CAFE,
      'Reinicio contador café máquina',
      'Registro de reinicio del contador de cafés (no es venta)'
    ]
  );
  return { id: ins.lastID, nombre: 'Reinicio contador café máquina' };
}

/**
 * Contador del ciclo actual: desde el último reinicio.
 * Si nunca se reinició, cuenta desde el inicio del mes calendario.
 */
export async function getContadorCafeMaquinaMes(mes = null) {
  // Si piden un mes concreto (historial), se mantiene el recorte calendario.
  const mesKey = mes && /^\d{4}-\d{2}$/.test(mes) ? mes : null;

  if (mesKey) {
    const row = await db.get(
      `
      SELECT
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
        COUNT(*)::int AS movimientos
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE m.tipo = 'salida'
        AND UPPER(TRIM(COALESCE(p.codigo, ''))) <> ?
        AND m.fecha >= (? || '-01')::date
        AND m.fecha < ((? || '-01')::date + interval '1 month')
        AND ${SQL_CAFE_MAQUINA}
    `,
      [CODIGO_PRODUCTO_REINICIO_CAFE, mesKey, mesKey]
    );

    return armarResumen({
      mes: mesKey,
      unidades: row?.unidades,
      movimientos: row?.movimientos
    });
  }

  const ultimo = await getUltimoReinicioCafeMaquina();
  const mesResuelto =
    (
      await db.get(`SELECT to_char(date_trunc('month', CURRENT_TIMESTAMP), 'YYYY-MM') AS mes`)
    )?.mes || mesActualISO();

  let row;
  let desdeReinicio = null;
  let cicloLabel = etiquetaMes(mesResuelto);

  if (ultimo?.created_at) {
    desdeReinicio = ultimo.created_at;
    row = await db.get(
      `
      SELECT
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
        COUNT(*)::int AS movimientos
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE m.tipo = 'salida'
        AND UPPER(TRIM(COALESCE(p.codigo, ''))) <> ?
        AND m.fecha > ?::timestamptz
        AND ${SQL_CAFE_MAQUINA}
    `,
      [CODIGO_PRODUCTO_REINICIO_CAFE, ultimo.created_at]
    );
    const cuando = new Date(ultimo.created_at).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short'
    });
    cicloLabel = `Desde reinicio (${cuando})`;
  } else {
    row = await db.get(
      `
      SELECT
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
        COUNT(*)::int AS movimientos
      FROM movimientos m
      JOIN productos p ON p.id = m.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE m.tipo = 'salida'
        AND UPPER(TRIM(COALESCE(p.codigo, ''))) <> ?
        AND m.fecha >= date_trunc('month', CURRENT_TIMESTAMP)
        AND m.fecha < date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month'
        AND ${SQL_CAFE_MAQUINA}
    `,
      [CODIGO_PRODUCTO_REINICIO_CAFE]
    );
  }

  return armarResumen({
    mes: mesResuelto,
    unidades: row?.unidades,
    movimientos: row?.movimientos,
    desdeReinicio,
    cicloLabel
  });
}

/**
 * Historial mensual de cafés máquina (más reciente primero).
 * @param {number} [limit=12]
 */
export async function getHistorialMensualCafeMaquina(limit = 12) {
  const lim = Math.min(36, Math.max(1, Number(limit) || 12));
  const rows = await db.all(
    `
    SELECT
      to_char(date_trunc('month', m.fecha), 'YYYY-MM') AS mes,
      COALESCE(SUM(m.cantidad), 0)::numeric AS unidades,
      COUNT(*)::int AS movimientos
    FROM movimientos m
    JOIN productos p ON p.id = m.producto_id
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE m.tipo = 'salida'
      AND UPPER(TRIM(COALESCE(p.codigo, ''))) <> ?
      AND ${SQL_CAFE_MAQUINA}
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT ?
  `,
    [CODIGO_PRODUCTO_REINICIO_CAFE, lim]
  );

  return (rows || []).map((r) =>
    armarResumen({
      mes: r.mes,
      unidades: r.unidades,
      movimientos: r.movimientos
    })
  );
}

/** Payload completo para dashboard / cierre. */
export async function getResumenCafeMaquina({ historialLimit = 12 } = {}) {
  const actual = await getContadorCafeMaquinaMes();
  const historial = await getHistorialMensualCafeMaquina(historialLimit);
  const ultimoReinicio = await getUltimoReinicioCafeMaquina();
  const detalleVentas = await getDetalleMontosCafe({
    desdeTimestamp: actual.desdeReinicio || null
  });
  return {
    actual,
    historial,
    umbral: UMBRAL_CAFE_MAQUINA,
    detalleVentas,
    ultimoReinicio: ultimoReinicio
      ? {
          id: ultimoReinicio.id,
          unidadesAntes: roundUnidades(ultimoReinicio.unidades_antes),
          movimientoId: ultimoReinicio.movimiento_id,
          usuario: ultimoReinicio.usuario,
          createdAt: ultimoReinicio.created_at
        }
      : null
  };
}

/**
 * Reinicia el contador a 0 y deja un movimiento (ajuste) como reporte.
 */
export async function reiniciarContadorCafeMaquina({ usuario, usuarioId } = {}) {
  const actual = await getContadorCafeMaquinaMes();
  const unidadesAntes = roundUnidades(actual.unidades);
  const userLabel = String(usuario || 'Sistema').trim() || 'Sistema';

  const result = await db.transaction(async (tx) => {
    const prod = await asegurarProductoReinicio(tx);
    const motivo =
      unidadesAntes > 0
        ? `Reinicio contador café máquina: se vendieron ${unidadesAntes} unidad(es); contador vuelve a 0.`
        : 'Reinicio contador café máquina: el contador ya estaba en 0; se registra el reinicio.';

    const mov = await tx.run(
      `
      INSERT INTO movimientos (producto_id, tipo, cantidad, motivo, usuario, precio_unitario)
      VALUES (?, 'ajuste', ?, ?, ?, 0)
    `,
      [prod.id, unidadesAntes, motivo, userLabel]
    );

    const reinicio = await tx.run(
      `
      INSERT INTO cafe_maquina_reinicios (unidades_antes, movimiento_id, usuario, usuario_id)
      VALUES (?, ?, ?, ?)
    `,
      [unidadesAntes, mov.lastID, userLabel, usuarioId ?? null]
    );

    return {
      reinicioId: reinicio.lastID,
      movimientoId: mov.lastID,
      unidadesAntes,
      motivo
    };
  });

  const resumen = await getResumenCafeMaquina({ historialLimit: 6 });
  return {
    ...result,
    contador: resumen.actual,
    resumen
  };
}
