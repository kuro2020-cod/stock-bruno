import express from 'express';
import { Retiro } from '../models/Retiro.js';

const router = express.Router();

const normalizarFecha = (dateString) => {
  const raw = String(dateString || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

router.get('/', async (req, res) => {
  try {
    const tipo = req.query.tipo === 'efectivo' || req.query.tipo === 'mercaderia' ? req.query.tipo : null;
    const rows = await Retiro.listar({
      tipo,
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

router.post('/efectivo', async (req, res) => {
  try {
    const retiro = await Retiro.registrarEfectivo({
      monto: req.body.monto ?? req.body.monto_total,
      motivo: req.body.motivo,
      authUser: req.user
    });
    res.status(201).json(retiro);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/mercaderia', async (req, res) => {
  try {
    const retiro = await Retiro.registrarMercaderia({
      producto_id: req.body.producto_id,
      cantidad: req.body.cantidad,
      motivo: req.body.motivo,
      authUser: req.user
    });
    res.status(201).json(retiro);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/mercaderia-lote', async (req, res) => {
  try {
    const resultado = await Retiro.registrarMercaderiaLote({
      items: req.body.items,
      motivo: req.body.motivo,
      authUser: req.user
    });
    res.status(201).json(resultado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
