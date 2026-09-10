import db from '../database/db.js';
import { SQL_CAFE_MAQUINA, getResumenCafeMaquina } from './cafeMaquina.js';
import { SQL_MILANESAS } from './milanesas.js';
import { SQL_SANDWICH_MILANESAS } from './sandwichMilanesas.js';
import { SQL_ROLLITOS_JAMON_QUESO } from './rollitosJamonQueso.js';
import { SQL_CIGARRILLOS } from './cigarrillos.js';
import { condicionPeriodoCaja, fechaLocalISO, normalizarFechaISO } from '../utils/fechaCaja.js';
import { METODOS_VENTA, metodosVacios, metodosProveedorVacios } from '../utils/metodosPago.js';
import { aliasesUsuario, esUsuarioVendedor } from '../utils/usuarioAliases.js';
import { AperturaCaja } from '../models/AperturaCaja.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function filtroPorVendedor(authUser) {
  if (!authUser?.id || !esUsuarioVendedor(authUser)) return null;
  return {
    usuarioId: authUser.id,
    aliases: aliasesUsuario(authUser)
  };
}

function condicionUsuarioMovimiento(alias, filtro) {
  if (!filtro?.aliases?.length) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.usuario = ANY(?::text[])`, params: [filtro.aliases] };
}

function condicionUsuarioId(alias, filtro) {
  if (!filtro?.usuarioId) return { sql: '', params: [] };
  return { sql: ` AND ${alias}.usuario_id = ?`, params: [filtro.usuarioId] };
}

function condicionCobradorFiado(filtro) {
  if (!filtro?.aliases?.length) return { sql: '', params: [] };
  return {
    sql: ` AND (f.cobrado_por = ANY(?::text[]) OR f.usuario_id = ?)`,
    params: [filtro.aliases, filtro.usuarioId]
  };
}

/** Momento del último cierre del día. Por usuario si se indica `usuarioId`. */
export async function getDesdeUltimoCierre(fecha, usuarioId = null) {
  const row = usuarioId
    ? await db.get(
        `
        SELECT created_at
        FROM cierres_caja
        WHERE fecha_cierre = ?::date AND usuario_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
        [fecha, usuarioId]
      )
    : await db.get(
        `
        SELECT created_at
        FROM cierres_caja
        WHERE fecha_cierre = ?::date
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `,
        [fecha]
      );
  return row?.created_at ?? null;
}

/** Inicio del período a arquear: posterior al último cierre propio o al inicio de caja. */
async function resolverDesdeTimestamp(fecha, filtro, aperturaUsuario) {
  const desdeApertura = aperturaUsuario?.created_at ?? null;
  const desdeCierre = filtro
    ? await getDesdeUltimoCierre(fecha, filtro.usuarioId)
    : await getDesdeUltimoCierre(fecha);

  // Si hay turno abierto, también mirar el último cierre del usuario sin importar la fecha
  // (por si el turno empezó ayer y hoy ya es otro día calendario).
  let desdeCierreGlobal = null;
  if (aperturaUsuario && filtro?.usuarioId) {
    const row = await db.get(
      `
      SELECT created_at
      FROM cierres_caja
      WHERE usuario_id = ?
        AND created_at >= ?::timestamptz
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
      [filtro.usuarioId, aperturaUsuario.created_at]
    );
    desdeCierreGlobal = row?.created_at ?? null;
  } else if (aperturaUsuario && !filtro) {
    const row = await db.get(
      `
      SELECT created_at
      FROM cierres_caja
      WHERE created_at >= ?::timestamptz
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
      [aperturaUsuario.created_at]
    );
    desdeCierreGlobal = row?.created_at ?? null;
  }

  const candidatos = [desdeCierre, desdeCierreGlobal, desdeApertura].filter(Boolean);
  if (!candidatos.length) return null;
  return candidatos.reduce((a, b) => (new Date(a) >= new Date(b) ? a : b));
}

/**
 * Define el período del resumen.
 * Con caja abierta: modo turno (desde apertura/cierre hasta ahora), aunque cruce medianoche.
 * Sin caja abierta: día calendario (consulta histórica).
 */
function resolverPeriodo(fecha, desdeTimestamp, aperturaUsuario) {
  if (aperturaUsuario?.created_at) {
    const fechaApertura =
      normalizarFechaISO(aperturaUsuario.fecha_caja) ||
      fechaLocalISO(aperturaUsuario.created_at);
    const desde = desdeTimestamp || aperturaUsuario.created_at;
    return {
      modo: 'turno',
      fecha: fechaApertura,
      fechaSolicitada: fecha,
      desdeTimestamp: desde,
      cruzaMedianoche: fechaApertura !== fechaLocalISO(),
      apertura_id: aperturaUsuario.id,
      apertura_desde: aperturaUsuario.created_at
    };
  }
  return {
    modo: 'dia',
    fecha,
    fechaSolicitada: fecha,
    desdeTimestamp: desdeTimestamp || null,
    cruzaMedianoche: false
  };
}

async function resumenVentasPorMetodo(periodo, filtro = null) {
  const base = metodosVacios();
  const condFecha = condicionPeriodoCaja('m', periodo);
  const condUsuario = condicionUsuarioMovimiento('m', filtro);
  const params = [...condFecha.params, ...condUsuario.params];

  const countRow = await db.get(
    `
    SELECT COUNT(*)::int AS n
    FROM movimientos m
    WHERE m.tipo = 'salida'
      AND ${condFecha.sql}${condUsuario.sql}
  `,
    params
  );
  const totalMovimientos = Number(countRow?.n ?? 0);

  const rowsDesglose = await db.all(
    `
    SELECT
      e.key AS metodo,
      COUNT(DISTINCT m.id)::int AS movimientos,
      COALESCE(SUM((e.value)::numeric), 0)::numeric AS total
    FROM movimientos m
    CROSS JOIN LATERAL jsonb_each_text(m.pagos_desglose) AS e(key, value)
    WHERE m.tipo = 'salida'
      AND ${condFecha.sql}${condUsuario.sql}
      AND m.pagos_desglose IS NOT NULL
      AND jsonb_typeof(m.pagos_desglose) = 'object'
      AND m.pagos_desglose <> '{}'::jsonb
    GROUP BY e.key
  `,
    params
  );

  for (const row of rowsDesglose) {
    const key = METODOS_VENTA.includes(row.metodo) ? row.metodo : 'sin_definir';
    base[key].total += Number(row.total || 0);
    base[key].movimientos += Number(row.movimientos || 0);
  }

  const rowsSimple = await db.all(
    `
    SELECT
      COALESCE(NULLIF(m.metodo_pago, 'mixto'), 'sin_definir') AS metodo_pago,
      COUNT(*)::int AS movimientos,
      COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, 0)), 0)::numeric AS total
    FROM movimientos m
    WHERE m.tipo = 'salida'
      AND ${condFecha.sql}${condUsuario.sql}
      AND (
        m.pagos_desglose IS NULL
        OR m.pagos_desglose = '{}'::jsonb
        OR jsonb_typeof(m.pagos_desglose) <> 'object'
      )
      AND (m.metodo_pago IS NULL OR m.metodo_pago <> 'mixto')
    GROUP BY COALESCE(NULLIF(m.metodo_pago, 'mixto'), 'sin_definir')
  `,
    params
  );

  for (const row of rowsSimple) {
    const key = METODOS_VENTA.includes(row.metodo_pago) ? row.metodo_pago : 'sin_definir';
    base[key].total += Number(row.total || 0);
    base[key].movimientos += Number(row.movimientos || 0);
  }

  const totalGeneral = Object.values(base).reduce((s, x) => s + x.total, 0);

  return { metodos: base, totalMovimientos, totalGeneral };
}

async function resumenPagosProveedores(periodo, filtro = null) {
  const base = metodosProveedorVacios();
  const condFecha = condicionPeriodoCaja('p', periodo);
  const condUsuario = condicionUsuarioId('p', filtro);
  const params = [...condFecha.params, ...condUsuario.params];

  const lista = await db.all(
    `
    SELECT id, proveedor, concepto, monto_total, metodo_pago, pagos_desglose, registrado_por, fecha, created_at
    FROM pagos_proveedores p
    WHERE ${condFecha.sql}${condUsuario.sql}
    ORDER BY p.fecha DESC, p.id DESC
  `,
    params
  );

  for (const row of lista) {
    let partes = [];
    if (
      row.pagos_desglose &&
      typeof row.pagos_desglose === 'object' &&
      Object.keys(row.pagos_desglose).length > 0
    ) {
      partes = Object.entries(row.pagos_desglose).map(([k, v]) => ({
        metodo: k,
        monto: Number(v)
      }));
    } else if (row.metodo_pago === 'mixto' && typeof row.pagos_desglose === 'string') {
      try {
        const obj = JSON.parse(row.pagos_desglose);
        partes = Object.entries(obj).map(([k, v]) => ({ metodo: k, monto: Number(v) }));
      } catch {
        partes = [];
      }
    } else {
      partes = [{ metodo: row.metodo_pago, monto: Number(row.monto_total) }];
    }

    for (const parte of partes) {
      const key = parte.metodo;
      if (!base[key]) continue;
      base[key].total += Number(parte.monto || 0);
      base[key].movimientos += 1;
    }
  }

  const totalGeneral = round2(Object.values(base).reduce((s, x) => s + x.total, 0));

  return { lista, metodos: base, totalGeneral, cantidad: lista.length };
}

async function resumenRetirosEfectivo(periodo, filtro = null) {
  const condFecha = condicionPeriodoCaja('r', periodo);
  const condUsuario = condicionUsuarioId('r', filtro);
  const params = [...condFecha.params, ...condUsuario.params];

  const lista = await db.all(
    `
    SELECT id, monto, metodo_pago, motivo, registrado_por, fecha, created_at
    FROM retiros r
    WHERE r.tipo = 'efectivo'
      AND ${condFecha.sql}${condUsuario.sql}
    ORDER BY r.fecha DESC, r.id DESC
  `,
    params
  );

  let totalEfectivo = 0;
  let totalTransferencia = 0;
  for (const row of lista || []) {
    const monto = Number(row.monto || 0);
    const metodo = String(row.metodo_pago || 'efectivo').toLowerCase();
    if (metodo === 'transferencia') totalTransferencia += monto;
    else totalEfectivo += monto;
  }

  return {
    lista: lista || [],
    totalGeneral: round2(totalEfectivo + totalTransferencia),
    porMetodo: {
      efectivo: round2(totalEfectivo),
      transferencia: round2(totalTransferencia)
    },
    cantidad: (lista || []).length
  };
}

async function resumenIngresosEfectivo(periodo, filtro = null) {
  const condFecha = condicionPeriodoCaja('i', periodo);
  const condUsuario = condicionUsuarioId('i', filtro);
  const params = [...condFecha.params, ...condUsuario.params];

  const lista = await db.all(
    `
    SELECT id, monto, motivo, registrado_por, fecha, created_at
    FROM ingresos_efectivo i
    WHERE ${condFecha.sql}${condUsuario.sql}
    ORDER BY i.fecha DESC, i.id DESC
  `,
    params
  );

  let totalGeneral = 0;
  for (const row of lista || []) {
    totalGeneral += Number(row.monto || 0);
  }

  return {
    lista: lista || [],
    totalGeneral: round2(totalGeneral),
    cantidad: (lista || []).length
  };
}

/** Rubros a discriminar en arqueo / cierre (por nombre o categoría del producto). */
const RUBROS_ESPECIALES = [
  {
    key: 'milanesas',
    label: 'MILANESAS',
    sql: SQL_MILANESAS
  },
  {
    key: 'sandwich_milanesas',
    label: 'SANDWICH MILANESAS',
    sql: SQL_SANDWICH_MILANESAS
  },
  {
    key: 'rollitos_jamon_queso',
    label: 'ROLLITOS JAMÓN Y QUESO',
    sql: SQL_ROLLITOS_JAMON_QUESO
  },
  {
    key: 'cigarrillos',
    label: 'CIGARRILLOS',
    sql: SQL_CIGARRILLOS
  },
  {
    key: 'cafe_maquina',
    label: 'CAFÉ (MÁQUINA)',
    sql: SQL_CAFE_MAQUINA
  },
  {
    key: 'electronica',
    label: 'ELECTRONICA',
    sql: `(
      LOWER(p.nombre) LIKE '%electronic%'
      OR LOWER(p.nombre) LIKE '%electrónic%'
      OR LOWER(COALESCE(c.nombre, '')) LIKE '%electronic%'
      OR LOWER(COALESCE(c.nombre, '')) LIKE '%electrónic%'
    )`
  }
];

async function resumenRubrosEspeciales(periodo, filtro = null) {
  const condFecha = condicionPeriodoCaja('m', periodo);
  const condUsuario = condicionUsuarioMovimiento('m', filtro);
  const params = [...condFecha.params, ...condUsuario.params];
  const out = {};

  for (const rubro of RUBROS_ESPECIALES) {
    let row;

    if (rubro.key === 'cafe_maquina') {
      // Café suelto → precio de esa venta.
      // Café en promo → una sola vez el total completo de la promo (ej. $1600),
      // no el prorrateo ni solo el precio de lista del café.
      row = await db.get(
        `
        WITH cafe_base AS (
          SELECT
            m.id,
            m.cantidad,
            m.precio_unitario,
            m.promo_id,
            m.venta_grupo_id
          FROM movimientos m
          JOIN productos p ON p.id = m.producto_id
          LEFT JOIN categorias c ON c.id = p.categoria_id
          WHERE m.tipo = 'salida'
            AND ${condFecha.sql}${condUsuario.sql}
            AND ${SQL_CAFE_MAQUINA}
        ),
        aportes AS (
          SELECT (cb.cantidad * COALESCE(cb.precio_unitario, 0))::numeric AS aporte
          FROM cafe_base cb
          WHERE cb.promo_id IS NULL

          UNION ALL

          SELECT SUM(m2.cantidad * COALESCE(m2.precio_unitario, 0))::numeric AS aporte
          FROM (
            SELECT DISTINCT venta_grupo_id, promo_id
            FROM cafe_base
            WHERE promo_id IS NOT NULL
              AND venta_grupo_id IS NOT NULL
          ) g
          JOIN movimientos m2
            ON m2.venta_grupo_id = g.venta_grupo_id
           AND m2.promo_id = g.promo_id
           AND m2.tipo = 'salida'
          GROUP BY g.venta_grupo_id, g.promo_id

          UNION ALL

          SELECT (cb.cantidad * COALESCE(cb.precio_unitario, 0))::numeric AS aporte
          FROM cafe_base cb
          WHERE cb.promo_id IS NOT NULL
            AND cb.venta_grupo_id IS NULL
        )
        SELECT
          COALESCE((SELECT SUM(aporte) FROM aportes), 0)::numeric AS total,
          (SELECT COUNT(*)::int FROM cafe_base) AS movimientos,
          COALESCE((SELECT SUM(cantidad) FROM cafe_base), 0)::numeric AS unidades
      `,
        params
      );
    } else {
      row = await db.get(
        `
        SELECT
          COALESCE(SUM(m.cantidad * COALESCE(m.precio_unitario, 0)), 0)::numeric AS total,
          COUNT(*)::int AS movimientos,
          COALESCE(SUM(m.cantidad), 0)::numeric AS unidades
        FROM movimientos m
        JOIN productos p ON p.id = m.producto_id
        LEFT JOIN categorias c ON c.id = p.categoria_id
        WHERE m.tipo = 'salida'
          AND ${condFecha.sql}${condUsuario.sql}
          AND ${rubro.sql}
      `,
        params
      );
    }

    out[rubro.key] = {
      key: rubro.key,
      label: rubro.label,
      total: round2(row?.total ?? 0),
      movimientos: Number(row?.movimientos ?? 0),
      unidades: Number(row?.unidades ?? 0)
    };
  }

  return {
    milanesas: out.milanesas,
    sandwich_milanesas: out.sandwich_milanesas,
    rollitos_jamon_queso: out.rollitos_jamon_queso,
    cigarrillos: out.cigarrillos,
    cafe_maquina: out.cafe_maquina,
    electronica: out.electronica,
    lista: [
      {
        key: 'milanesas',
        label: 'MILANESAS',
        total: round2(
          Number(out.milanesas?.total || 0) +
            Number(out.sandwich_milanesas?.total || 0) +
            Number(out.rollitos_jamon_queso?.total || 0)
        ),
        movimientos:
          Number(out.milanesas?.movimientos || 0) +
          Number(out.sandwich_milanesas?.movimientos || 0) +
          Number(out.rollitos_jamon_queso?.movimientos || 0),
        unidades:
          Number(out.milanesas?.unidades || 0) +
          Number(out.sandwich_milanesas?.unidades || 0) +
          Number(out.rollitos_jamon_queso?.unidades || 0)
      },
      out.cigarrillos,
      out.cafe_maquina,
      out.electronica
    ]
  };
}

function calcularNeto(
  ventasMetodos,
  proveedoresMetodos,
  retirosPorMetodo = {},
  cobrosFiadosPorMetodo = {},
  totalIngresosEfectivo = 0
) {
  const neto = metodosVacios();
  const keys = Object.keys(neto);
  const ingresos = round2(totalIngresosEfectivo);

  for (const key of keys) {
    const v = Number(ventasMetodos[key]?.total ?? 0);
    const p = Number(proveedoresMetodos[key]?.total ?? 0);
    const r = Number(retirosPorMetodo[key] ?? 0);
    const c = Number(cobrosFiadosPorMetodo[key] ?? 0);
    const ing = key === 'efectivo' ? ingresos : 0;
    neto[key].ventas = round2(v);
    neto[key].proveedores = round2(proveedoresMetodos[key] ? p : 0);
    neto[key].retiros = round2(r);
    neto[key].cobros_fiados = round2(c);
    neto[key].ingresos_efectivo = round2(ing);
    // Cobro de fiado: dinero que entra a caja (efectivo/transf/tarjeta).
    neto[key].neto = round2(v - (proveedoresMetodos[key] ? p : 0) - r + c + ing);
    neto[key].movimientos = Number(ventasMetodos[key]?.movimientos ?? 0);
    neto[key].total = neto[key].neto;
  }

  return neto;
}

/**
 * Suma cobros de fiados en el período.
 * - porMetodo: todos los cobros del día/turno (entran a efectivo/transf/tarjeta).
 * - totalMismoPeriodoVenta: cobros cuya venta a fiado también es de este período;
 *   se restan del rubro FIADO para no duplicar (la venta ya figuraba como fiado).
 */
async function resumenCobrosFiados(periodo, filtro = null) {
  const porMetodo = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  const condCobrador = condicionCobradorFiado(filtro);

  let cond;
  let params;
  if (periodo?.modo === 'turno' && periodo.desdeTimestamp) {
    cond = `f.estado = 'cobrado' AND f.cobrado_at IS NOT NULL
      AND f.cobrado_at > ?::timestamptz AND f.cobrado_at <= CURRENT_TIMESTAMP`;
    params = [periodo.desdeTimestamp];
  } else {
    cond = `f.estado = 'cobrado' AND f.cobrado_at IS NOT NULL
      AND f.cobrado_at >= ?::date AND f.cobrado_at < (?::date + interval '1 day')`;
    params = [periodo.fecha, periodo.fecha];
    if (periodo.desdeTimestamp) {
      cond += ` AND f.cobrado_at > ?::timestamptz`;
      params.push(periodo.desdeTimestamp);
    }
  }
  cond += condCobrador.sql;
  params.push(...condCobrador.params);

  let condMismoPeriodo;
  let paramsMismo;
  if (periodo?.modo === 'turno' && periodo.desdeTimestamp) {
    condMismoPeriodo = `${cond}
      AND f.fecha > ?::timestamptz AND f.fecha <= CURRENT_TIMESTAMP`;
    paramsMismo = [...params, periodo.desdeTimestamp];
  } else {
    condMismoPeriodo = `${cond}
      AND f.fecha >= ?::date AND f.fecha < (?::date + interval '1 day')`;
    paramsMismo = [...params, periodo.fecha, periodo.fecha];
    if (periodo.desdeTimestamp) {
      condMismoPeriodo += ` AND f.fecha > ?::timestamptz`;
      paramsMismo.push(periodo.desdeTimestamp);
    }
  }

  const sumarCobros = async (whereSql, whereParams) => {
    const acc = { efectivo: 0, transferencia: 0, tarjeta: 0 };
    let cantidad = 0;

    const rowsDesglose = await db.all(
      `
      SELECT
        e.key AS metodo,
        COALESCE(SUM((e.value)::numeric), 0)::numeric AS total,
        COUNT(*)::int AS cantidad
      FROM fiados f
      CROSS JOIN LATERAL jsonb_each_text(f.pagos_desglose_cobro) AS e(key, value)
      WHERE ${whereSql}
        AND f.pagos_desglose_cobro IS NOT NULL
        AND jsonb_typeof(f.pagos_desglose_cobro) = 'object'
        AND f.pagos_desglose_cobro <> '{}'::jsonb
        AND e.key IN ('efectivo', 'transferencia', 'tarjeta')
      GROUP BY e.key
    `,
      whereParams
    );

    for (const row of rowsDesglose) {
      const key = row.metodo;
      if (acc[key] == null) continue;
      acc[key] = round2(acc[key] + Number(row.total || 0));
      cantidad += Number(row.cantidad || 0);
    }

    const rowsSimple = await db.all(
      `
      SELECT
        f.metodo_cobro AS metodo,
        COALESCE(SUM(f.monto), 0)::numeric AS total,
        COUNT(*)::int AS cantidad
      FROM fiados f
      WHERE ${whereSql}
        AND (
          f.pagos_desglose_cobro IS NULL
          OR f.pagos_desglose_cobro = '{}'::jsonb
          OR jsonb_typeof(f.pagos_desglose_cobro) <> 'object'
        )
        AND f.metodo_cobro IS NOT NULL
        AND f.metodo_cobro IN ('efectivo', 'transferencia', 'tarjeta')
      GROUP BY f.metodo_cobro
    `,
      whereParams
    );

    for (const row of rowsSimple) {
      const key = row.metodo;
      if (acc[key] == null) continue;
      acc[key] = round2(acc[key] + Number(row.total || 0));
      cantidad += Number(row.cantidad || 0);
    }

    const total = round2(Object.values(acc).reduce((s, x) => s + x, 0));
    return { porMetodo: acc, totalGeneral: total, cantidad };
  };

  const todos = await sumarCobros(cond, params);
  const mismoPeriodo = await sumarCobros(condMismoPeriodo, paramsMismo);

  for (const key of Object.keys(porMetodo)) {
    porMetodo[key] = todos.porMetodo[key] || 0;
  }

  return {
    porMetodo,
    totalGeneral: todos.totalGeneral,
    cantidad: todos.cantidad,
    totalMismoPeriodoVenta: mismoPeriodo.totalGeneral,
    porMetodoMismoPeriodo: mismoPeriodo.porMetodo
  };
}

/** Detalle persistido en cierre de caja (compatible con registros viejos). */
export function construirDetalleCierre(
  ventas,
  proveedores,
  neto,
  rubros = null,
  retirosEfectivo = null,
  cafeMaquina = null,
  ingresosEfectivo = null
) {
  const ventasPlano = {};
  const proveedoresPlano = {};
  const netoPlano = {};

  for (const k of Object.keys(ventas.metodos)) {
    ventasPlano[k] = {
      total: round2(ventas.metodos[k].total),
      movimientos: ventas.metodos[k].movimientos
    };
  }
  for (const k of ['efectivo', 'transferencia']) {
    proveedoresPlano[k] = {
      total: round2(proveedores.metodos[k]?.total ?? 0),
      movimientos: proveedores.metodos[k]?.movimientos ?? 0
    };
  }
  for (const k of Object.keys(neto)) {
    netoPlano[k] = {
      ventas: neto[k].ventas,
      proveedores: neto[k].proveedores,
      retiros: neto[k].retiros || 0,
      cobros_fiados: neto[k].cobros_fiados || 0,
      ingresos_efectivo: neto[k].ingresos_efectivo || 0,
      neto: neto[k].neto,
      total: neto[k].neto,
      movimientos: neto[k].movimientos
    };
  }

  const detalle = {
    v: 2,
    ventas: ventasPlano,
    proveedores: proveedoresPlano,
    neto: netoPlano
  };

  const rubrosGuardar = rubros
    ? Object.entries(rubros).filter(([k, v]) => k !== 'lista' && v && typeof v === 'object')
    : [];
  if (rubrosGuardar.length) {
    detalle.rubros = {};
    for (const [key, r] of rubrosGuardar) {
      detalle.rubros[key] = {
        label: r.label,
        total: r.total,
        movimientos: r.movimientos,
        unidades: r.unidades
      };
    }
  }

  if (retirosEfectivo) {
    detalle.retiros_efectivo = {
      total: round2(retirosEfectivo.totalGeneral || 0),
      cantidad: Number(retirosEfectivo.cantidad || 0),
      por_metodo: {
        efectivo: round2(retirosEfectivo.porMetodo?.efectivo || 0),
        transferencia: round2(retirosEfectivo.porMetodo?.transferencia || 0)
      },
      lista: (retirosEfectivo.lista || []).map((r) => ({
        id: r.id,
        monto: round2(r.monto),
        metodo_pago: r.metodo_pago || 'efectivo',
        motivo: r.motivo,
        registrado_por: r.registrado_por,
        fecha: r.fecha
      }))
    };
  }

  if (ingresosEfectivo) {
    detalle.ingresos_efectivo = {
      total: round2(ingresosEfectivo.totalGeneral || 0),
      cantidad: Number(ingresosEfectivo.cantidad || 0),
      lista: (ingresosEfectivo.lista || []).map((r) => ({
        id: r.id,
        monto: round2(r.monto),
        motivo: r.motivo,
        registrado_por: r.registrado_por,
        fecha: r.fecha
      }))
    };
  }

  if (cafeMaquina?.actual) {
    detalle.cafe_maquina_mes = {
      mes: cafeMaquina.actual.mes,
      unidades: cafeMaquina.actual.unidades,
      movimientos: cafeMaquina.actual.movimientos,
      umbral: cafeMaquina.umbral ?? cafeMaquina.actual.umbral,
      exceso: Boolean(cafeMaquina.actual.exceso),
      excedente: cafeMaquina.actual.excedente || 0
    };
  }

  return detalle;
}

/**
 * Ajusta el efectivo neto del cierre por la diferencia de fondo:
 * diferencia = monto_apertura − fondo_siguiente
 * - Si dejás MÁS que el inicio → se RESTA del efectivo (queda en caja).
 * - Si dejás MENOS que el inicio → se SUMA al efectivo.
 * (ej. inicio 30000, deja 40000 → −10000 al efectivo).
 */
export function aplicarAjusteFondoCaja(resumen, montoApertura, fondoSiguiente, metaApertura = {}) {
  const apertura = round2(montoApertura);
  const fondo = round2(fondoSiguiente);
  const diferencia = round2(apertura - fondo);

  const metodos = { ...(resumen.metodos || {}) };
  const efBase = { ...(metodos.efectivo || {}) };
  const netoSinAjuste = round2(efBase.neto ?? efBase.total ?? 0);
  const netoAjustado = round2(netoSinAjuste + diferencia);

  metodos.efectivo = {
    ...efBase,
    neto: netoAjustado,
    total: netoAjustado,
    ajuste_fondo: diferencia,
    neto_sin_ajuste_fondo: netoSinAjuste
  };

  const totalGeneralNeto = round2(Number(resumen.totalGeneralNeto || 0) + diferencia);

  const detalleBase =
    resumen.detalleCierre && typeof resumen.detalleCierre === 'object'
      ? { ...resumen.detalleCierre }
      : { v: 2 };
  const netoDetalle = { ...(detalleBase.neto || {}) };
  const efDet = { ...(netoDetalle.efectivo || {}) };
  netoDetalle.efectivo = {
    ...efDet,
    neto: netoAjustado,
    total: netoAjustado,
    ajuste_fondo: diferencia,
    neto_sin_ajuste_fondo: netoSinAjuste
  };

  const detalleCierre = {
    ...detalleBase,
    neto: netoDetalle,
    apertura_caja: {
      monto_apertura: apertura,
      fondo_siguiente: fondo,
      diferencia_fondo: diferencia,
      ...metaApertura
    }
  };

  return {
    ...resumen,
    metodos,
    totalGeneralNeto,
    totalGeneral: totalGeneralNeto,
    diferenciaFondo: diferencia,
    detalleCierre
  };
}

export async function getResumenCaja(fecha, options = {}) {
  const { authUser } = options;
  const filtro = filtroPorVendedor(authUser);
  const aperturaUsuario = filtro
    ? await AperturaCaja.getAbierta(filtro.usuarioId)
    : await AperturaCaja.getAbierta();
  const desdeUltimoCierre = await resolverDesdeTimestamp(fecha, filtro, aperturaUsuario);
  const periodo = resolverPeriodo(fecha, desdeUltimoCierre, aperturaUsuario);
  const ventas = await resumenVentasPorMetodo(periodo, filtro);
  const proveedores = await resumenPagosProveedores(periodo, filtro);
  const retirosEfectivo = await resumenRetirosEfectivo(periodo, filtro);
  const ingresosEfectivo = await resumenIngresosEfectivo(periodo, filtro);
  const cobrosFiados = await resumenCobrosFiados(periodo, filtro);
  const rubros = await resumenRubrosEspeciales(periodo, filtro);
  const cafeMaquina = await getResumenCafeMaquina({ historialLimit: 6 });
  const metodos = calcularNeto(
    ventas.metodos,
    proveedores.metodos,
    retirosEfectivo.porMetodo,
    cobrosFiados.porMetodo,
    ingresosEfectivo.totalGeneral
  );

  // Si el fiado se cobró en el mismo período, dejar de mostrarlo como FIADO
  // y dejarlo en efectivo/transf/tarjeta (ya sumado vía cobros).
  const ajusteFiadoMismoPeriodo = round2(cobrosFiados.totalMismoPeriodoVenta || 0);
  if (ajusteFiadoMismoPeriodo > 0 && metodos.fiado) {
    metodos.fiado.neto = round2(Number(metodos.fiado.neto || 0) - ajusteFiadoMismoPeriodo);
    metodos.fiado.total = metodos.fiado.neto;
    metodos.fiado.ajuste_cobro_mismo_periodo = ajusteFiadoMismoPeriodo;
  }

  const totalGeneralVentas = round2(ventas.totalGeneral);
  const totalGeneralProveedores = round2(proveedores.totalGeneral);
  const totalGeneralRetiros = round2(retirosEfectivo.totalGeneral);
  const totalGeneralIngresosEfectivo = round2(ingresosEfectivo.totalGeneral);
  const totalGeneralCobrosFiados = round2(cobrosFiados.totalGeneral);
  const totalGeneralNeto = round2(
    Object.values(metodos).reduce((s, x) => s + Number(x.neto || 0), 0)
  );

  // Fecha de caja del turno (día de apertura) si cruza medianoche.
  const fechaCaja = periodo.modo === 'turno' ? periodo.fecha : fecha;

  return {
    fecha: fechaCaja,
    fechaSolicitada: fecha,
    periodo,
    desdeUltimoCierre,
    esCierreParcialDelDia: Boolean(desdeUltimoCierre),
    turnoAbiertoCruzaMedianoche: Boolean(periodo.cruzaMedianoche),
    ventas: {
      metodos: ventas.metodos,
      totalMovimientos: ventas.totalMovimientos,
      totalGeneral: totalGeneralVentas
    },
    pagosProveedores: proveedores,
    retirosEfectivo,
    ingresosEfectivo,
    cobrosFiados,
    rubros,
    cafeMaquina,
    metodos,
    totalMovimientos: ventas.totalMovimientos,
    totalGeneralVentas,
    totalGeneralProveedores,
    totalGeneralRetiros,
    totalGeneralIngresosEfectivo,
    totalGeneralCobrosFiados,
    totalGeneralNeto,
    totalGeneral: totalGeneralNeto,
    detalleCierre: construirDetalleCierre(
      ventas,
      proveedores,
      metodos,
      rubros,
      retirosEfectivo,
      cafeMaquina,
      ingresosEfectivo
    )
  };
}
