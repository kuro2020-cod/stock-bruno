import db from '../database/db.js';
import { HORA_CORTE_MILANESAS, inicioJornadaMilanesas } from './milanesas.js';

export const FRECUENCIAS_VALIDAS = ['diario', 'semanal', 'mensual'];
export const HORA_CORTE_CONTADOR = HORA_CORTE_MILANESAS;

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const roundUnidades = (n) => {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 1000) / 1000;
};

function etiquetaPeriodo(frecuencia, desde) {
  if (!desde) return 'Período actual';
  const texto = new Date(desde).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  });
  if (frecuencia === 'semanal') return `Semana desde ${texto}`;
  if (frecuencia === 'mensual') return `Mes desde ${texto}`;
  return `Desde ${texto}`;
}

export function textoReinicio(frecuencia, horaCorte = HORA_CORTE_CONTADOR) {
  const hora = `${String(horaCorte).padStart(2, '0')}:00`;
  if (frecuencia === 'semanal') return `Se reinicia cada lunes a las ${hora}`;
  if (frecuencia === 'mensual') return `Se reinicia el día 1 a las ${hora}`;
  return `Se reinicia cada día a las ${hora}`;
}

/**
 * Inicio del período vigente. El corte diario/semanal/mensual es a las 06:00.
 * Hasta esa hora sigue contando el período anterior.
 */
export function inicioPeriodo(frecuencia, fechaRef = new Date()) {
  const d = new Date(fechaRef);
  const jornada = inicioJornadaMilanesas(d);

  if (frecuencia === 'semanal') {
    const day = jornada.getDay();
    const diasDesdeLunes = day === 0 ? 6 : day - 1;
    const lunes = new Date(jornada);
    lunes.setDate(lunes.getDate() - diasDesdeLunes);
    lunes.setHours(HORA_CORTE_CONTADOR, 0, 0, 0);
    return lunes;
  }

  if (frecuencia === 'mensual') {
    return new Date(
      jornada.getFullYear(),
      jornada.getMonth(),
      1,
      HORA_CORTE_CONTADOR,
      0,
      0,
      0
    );
  }

  return jornada;
}

async function sumarVentasCategoria(categoriaId, { desdeExclusivo = null, hastaInclusive = null } = {}) {
  const params = [categoriaId];
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
    WHERE m.tipo = 'salida'
      AND p.categoria_id = ?
      AND UPPER(TRIM(COALESCE(p.codigo, ''))) NOT LIKE 'REINICIO-%'
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

async function getUltimoReinicio(contadorId) {
  return db.get(
    `
    SELECT id, monto_antes, unidades_antes, periodo_inicio, created_at
    FROM dashboard_contador_reinicios
    WHERE contador_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
  `,
    [contadorId]
  );
}

async function asegurarReinicio(contador) {
  const corte = inicioPeriodo(contador.frecuencia);
  const corteIso = corte.toISOString();
  const ultimo = await getUltimoReinicio(contador.id);

  if (!ultimo) {
    await db.run(
      `
      INSERT INTO dashboard_contador_reinicios
        (contador_id, monto_antes, unidades_antes, periodo_inicio)
      VALUES (?, 0, 0, ?::timestamptz)
    `,
      [contador.id, corteIso]
    );
    return;
  }

  const ancla = ultimo.periodo_inicio || ultimo.created_at;
  if (ancla && new Date(ancla).getTime() >= corte.getTime()) {
    return;
  }

  const desde = ultimo.periodo_inicio || ultimo.created_at;
  const totales = await sumarVentasCategoria(contador.categoria_id, {
    desdeExclusivo: desde,
    hastaInclusive: corteIso
  });

  await db.run(
    `
    INSERT INTO dashboard_contador_reinicios
      (contador_id, monto_antes, unidades_antes, periodo_inicio)
    VALUES (?, ?, ?, ?::timestamptz)
  `,
    [contador.id, totales.monto, totales.unidades, corteIso]
  );
}

async function getHistorial(contadorId, limit = 14) {
  const lim = Math.min(60, Math.max(1, Number(limit) || 14));
  const rows = await db.all(
    `
    SELECT id, monto_antes, unidades_antes, periodo_inicio, created_at
    FROM dashboard_contador_reinicios
    WHERE contador_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `,
    [contadorId, lim]
  );

  return (rows || []).map((r) => ({
    id: r.id,
    monto: round2(r.monto_antes),
    unidades: roundUnidades(r.unidades_antes),
    periodoInicio: r.periodo_inicio,
    createdAt: r.created_at,
    label: new Date(r.created_at).toLocaleString('es-AR', {
      dateStyle: 'short',
      timeStyle: 'short'
    })
  }));
}

async function armarResumen(contador, { historialLimit = 14 } = {}) {
  await asegurarReinicio(contador);

  const ultimo = await getUltimoReinicio(contador.id);
  const periodoInicio = ultimo?.periodo_inicio || inicioPeriodo(contador.frecuencia).toISOString();
  const totales = await sumarVentasCategoria(contador.categoria_id, {
    desdeExclusivo: periodoInicio
  });
  const historial = await getHistorial(contador.id, historialLimit);

  return {
    id: contador.id,
    categoriaId: contador.categoria_id,
    categoriaNombre: contador.categoria_nombre,
    titulo: contador.categoria_nombre,
    frecuencia: contador.frecuencia,
    reinicioTexto: textoReinicio(contador.frecuencia),
    horaCorte: HORA_CORTE_CONTADOR,
    actual: {
      monto: totales.monto,
      unidades: totales.unidades,
      movimientos: totales.movimientos,
      jornadaInicio: periodoInicio,
      jornadaLabel: etiquetaPeriodo(contador.frecuencia, periodoInicio),
      horaCorte: HORA_CORTE_CONTADOR
    },
    historial
  };
}

export async function listarContadoresDashboard({ historialLimit = 14 } = {}) {
  const rows = await db.all(
    `
    SELECT dc.id, dc.categoria_id, dc.frecuencia, dc.created_at, c.nombre AS categoria_nombre
    FROM dashboard_contadores dc
    JOIN categorias c ON c.id = dc.categoria_id
    ORDER BY dc.id ASC
  `
  );

  const list = [];
  for (const row of rows || []) {
    list.push(await armarResumen(row, { historialLimit }));
  }
  return list;
}

export async function crearContadorDashboard({ categoriaId, frecuencia }) {
  const freq = String(frecuencia || '').toLowerCase();
  if (!FRECUENCIAS_VALIDAS.includes(freq)) {
    const err = new Error('La frecuencia debe ser diario, semanal o mensual.');
    err.status = 400;
    throw err;
  }

  const catId = Number(categoriaId);
  if (!Number.isInteger(catId) || catId <= 0) {
    const err = new Error('Seleccioná una categoría válida.');
    err.status = 400;
    throw err;
  }

  const categoria = await db.get(`SELECT id, nombre FROM categorias WHERE id = ?`, [catId]);
  if (!categoria) {
    const err = new Error('La categoría no existe.');
    err.status = 404;
    throw err;
  }

  const existente = await db.get(
    `SELECT id FROM dashboard_contadores WHERE categoria_id = ?`,
    [catId]
  );
  if (existente) {
    const err = new Error('Ya hay un contador para esa categoría.');
    err.status = 409;
    throw err;
  }

  const ins = await db.run(
    `
    INSERT INTO dashboard_contadores (categoria_id, frecuencia)
    VALUES (?, ?)
  `,
    [catId, freq]
  );

  const creado = {
    id: ins.lastID,
    categoria_id: catId,
    frecuencia: freq,
    categoria_nombre: categoria.nombre
  };

  return armarResumen(creado);
}

export async function eliminarContadorDashboard(id) {
  const contadorId = Number(id);
  const row = await db.get(`SELECT id FROM dashboard_contadores WHERE id = ?`, [contadorId]);
  if (!row) {
    const err = new Error('El contador no existe.');
    err.status = 404;
    throw err;
  }
  await db.run(`DELETE FROM dashboard_contadores WHERE id = ?`, [contadorId]);
  return { ok: true };
}
