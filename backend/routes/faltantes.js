import express from 'express';
import { Faltante } from '../models/Faltante.js';

const router = express.Router();

const normalizarFecha = (dateString) => {
  const raw = String(dateString || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

router.get('/', async (req, res) => {
  try {
    const tipoRaw = String(req.query.tipo || '')
      .trim()
      .toLowerCase();
    const tipo = Faltante.tiposValidos().includes(tipoRaw) ? tipoRaw : null;
    const soloManual =
      req.query.solo_manual === '1' ||
      req.query.solo_manual === 'true' ||
      req.query.manual === '1';
    const rows = await Faltante.listar({
      tipo,
      soloManual,
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
    const row = await Faltante.registrar({
      tipo: req.body.tipo,
      producto_texto: req.body.producto_texto ?? req.body.producto ?? req.body.descripcion,
      producto_id: req.body.producto_id,
      cantidad: req.body.cantidad,
      notas: req.body.notas ?? req.body.motivo,
      authUser: req.user
    });
    res.status(201).json(row);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
