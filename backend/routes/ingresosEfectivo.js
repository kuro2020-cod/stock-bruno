import express from 'express';
import { IngresoEfectivo } from '../models/IngresoEfectivo.js';

const router = express.Router();

const normalizarFecha = (dateString) => {
  const raw = String(dateString || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

router.get('/', async (req, res) => {
  try {
    const rows = await IngresoEfectivo.listar({
      limit: req.query.limit,
      offset: req.query.offset,
      desde: normalizarFecha(req.query.desde),
      hasta: normalizarFecha(req.query.hasta)
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const ingreso = await IngresoEfectivo.registrar({
      monto: req.body.monto ?? req.body.monto_total,
      motivo: req.body.motivo,
      authUser: req.user
    });
    res.status(201).json(ingreso);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
