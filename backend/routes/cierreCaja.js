import express from 'express';
import db from '../database/db.js';
import { requireAdmin } from '../middleware/auth.js';
import { fechaLocalISO, normalizarFechaISO } from '../utils/fechaCaja.js';
import { getResumenCaja, aplicarAjusteFondoCaja } from '../services/resumenCaja.js';
import { AperturaCaja } from '../models/AperturaCaja.js';
import { esUsuarioVendedor } from '../utils/usuarioAliases.js';

const router = express.Router();

const normalizarFecha = (dateString) => {
  const raw = String(dateString || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

const etiquetaUsuario = (authUser) => {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const parseDetalleCierreRow = (raw) => {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/** Completa apertura_at en cierres viejos que solo guardaron apertura_id. */
async function enriquecerAperturaEnCierres(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return rows;

  const ids = new Set();
  for (const row of rows) {
    const det = parseDetalleCierreRow(row.detalle_metodos);
    const ap = det?.apertura_caja;
    if (ap?.apertura_id && !ap.apertura_at) ids.add(Number(ap.apertura_id));
  }
  if (!ids.size) return rows;

  const placeholders = [...ids].map(() => '?').join(', ');
  const aperturas = await db.all(
    `SELECT id, created_at FROM aperturas_caja WHERE id IN (${placeholders})`,
    [...ids]
  );
  const porId = new Map(aperturas.map((a) => [Number(a.id), a.created_at]));

  return rows.map((row) => {
    const det = parseDetalleCierreRow(row.detalle_metodos);
    const ap = det?.apertura_caja;
    if (!ap?.apertura_id || ap.apertura_at) return row;
    const createdAt = porId.get(Number(ap.apertura_id));
    if (!createdAt) return row;
    const detalle = { ...det, apertura_caja: { ...ap, apertura_at: createdAt } };
    return { ...row, detalle_metodos: detalle };
  });
}

/** Lista todos los cierres (filtro opcional por fecha de cierre). */
router.get('/lista', requireAdmin, async (req, res) => {
  try {
    const desde = normalizarFecha(req.query.desde);
    const hasta = normalizarFecha(req.query.hasta);
    const cond = [];
    const params = [];
    if (desde) {
      cond.push('fecha_cierre >= ?::date');
      params.push(desde);
    }
    if (hasta) {
      cond.push('fecha_cierre <= ?::date');
      params.push(hasta);
    }
    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
    const rows = await enriquecerAperturaEnCierres(
      await db.all(
      `
      SELECT id,
             to_char(fecha_cierre, 'YYYY-MM-DD') AS fecha_cierre,
             total_general, total_movimientos, detalle_metodos, cerrado_por, observaciones, created_at
      FROM cierres_caja
      ${where}
      ORDER BY fecha_cierre DESC, created_at DESC, id DESC
    `,
      params
    )
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/resumen', async (req, res) => {
  try {
    const fechaQuery = normalizarFecha(req.query.fecha) || fechaLocalISO();
    const resumen = await getResumenCaja(fechaQuery, { authUser: req.user });
    // Si hay turno abierto (p.ej. pasó medianoche), la fecha de caja es la del inicio de turno.
    const fecha = resumen.fecha || fechaQuery;
    const aperturaEstado = await AperturaCaja.getEstado(req.user);
    const cierreExistente = await db.get(
      `
      SELECT id, fecha_cierre, total_general, total_movimientos, cerrado_por, observaciones, created_at
      FROM cierres_caja
      WHERE fecha_cierre = ?::date
      ORDER BY id DESC
      LIMIT 1
    `,
      [fecha]
    );
    const countRow = await db.get(
      `SELECT COUNT(*)::int AS n FROM cierres_caja WHERE fecha_cierre = ?::date`,
      [fecha]
    );
    const cierresDelDia = Number(countRow?.n ?? 0);
    const cierres = await db.all(
      `
      SELECT id, fecha_cierre, total_general, total_movimientos, detalle_metodos, cerrado_por, observaciones, created_at
      FROM cierres_caja
      WHERE fecha_cierre = ?::date
      ORDER BY id ASC
    `,
      [fecha]
    );
    let cierresMiosEnFecha = 0;
    let miCierreEnFecha = null;
    if (req.user?.id) {
      const countMios = await db.get(
        `SELECT COUNT(*)::int AS n FROM cierres_caja WHERE usuario_id = ? AND fecha_cierre = ?::date`,
        [req.user.id, fecha]
      );
      cierresMiosEnFecha = Number(countMios?.n ?? 0);
      if (cierresMiosEnFecha > 0) {
        miCierreEnFecha = await db.get(
          `
          SELECT id, fecha_cierre, total_general, total_movimientos, cerrado_por, observaciones, created_at
          FROM cierres_caja
          WHERE usuario_id = ? AND fecha_cierre = ?::date
          ORDER BY id DESC
          LIMIT 1
        `,
          [req.user.id, fecha]
        );
      }
    }

    res.json({
      ...resumen,
      cierreExistente: cierreExistente || null,
      cierresDelDia,
      cierres: cierres || [],
      cierresMiosEnFecha,
      miCierreEnFecha: miCierreEnFecha || null,
      aperturaCaja: aperturaEstado
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cerrar', async (req, res) => {
  try {
    let fecha = normalizarFecha(req.body.fecha) || fechaLocalISO();
    const observaciones = String(req.body.observaciones || '').trim() || null;
    const cerradoPor = etiquetaUsuario(req.user);

    if (!req.user?.id) {
      return res.status(401).json({ error: 'Usuario no identificado' });
    }

    const apertura = esUsuarioVendedor(req.user)
      ? await AperturaCaja.getAbierta(req.user.id)
      : await AperturaCaja.getAbierta();
    if (!apertura) {
      return res.status(400).json({
        error: 'No hay inicio de caja registrado. Entrá a Ventas y cargá el monto de INICIO DE CAJA.'
      });
    }

    // Si el turno empezó otro día y cierran después, guardar con la fecha del turno.
    const fechaApertura = normalizarFechaISO(apertura.fecha_caja);
    if (fechaApertura) {
      fecha = fechaApertura;
    }

    const fondoRaw = req.body.fondo_siguiente;
    const esAdmin = String(req.user?.rol || '').toUpperCase() === 'ADMIN';
    // USER siempre deja el mismo monto de apertura; solo ADMIN puede cambiarlo.
    const fondo = !esAdmin
      ? round2(apertura.monto_apertura)
      : fondoRaw === undefined || fondoRaw === null || fondoRaw === ''
        ? round2(apertura.monto_apertura)
        : round2(fondoRaw);
    if (!Number.isFinite(fondo) || fondo < 0) {
      return res.status(400).json({
        error: 'Indicá el monto a dejar en caja para el siguiente turno'
      });
    }

    const resumenBase = await getResumenCaja(fecha, { authUser: req.user });
    const resumen = aplicarAjusteFondoCaja(resumenBase, apertura.monto_apertura, fondo, {
      apertura_id: apertura.id,
      registrado_por: apertura.registrado_por,
      apertura_at: apertura.created_at
    });
    const detalle = JSON.stringify(resumen.detalleCierre || { v: 2 });

    const ins = await db.run(
      `
      INSERT INTO cierres_caja
      (fecha_cierre, total_general, total_movimientos, detalle_metodos, cerrado_por, observaciones, usuario_id)
      VALUES (?::date, ?, ?, ?::jsonb, ?, ?, ?)
    `,
      [
        fecha,
        resumen.totalGeneralNeto,
        resumen.totalMovimientos,
        detalle,
        cerradoPor,
        observaciones,
        req.user.id
      ]
    );

    await AperturaCaja.cerrarTurno({
      fondo_siguiente: fondo,
      cierre_id: ins.lastID,
      authUser: req.user
    });

    const cierre = await db.get(
      `
      SELECT id, fecha_cierre, total_general, total_movimientos, detalle_metodos, cerrado_por, observaciones, created_at
      FROM cierres_caja
      WHERE id = ?
    `,
      [ins.lastID]
    );

    res.status(201).json({
      success: true,
      cierre,
      resumen,
      fondo_siguiente: fondo,
      monto_apertura: apertura.monto_apertura,
      diferencia_fondo: resumen.diferenciaFondo
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
