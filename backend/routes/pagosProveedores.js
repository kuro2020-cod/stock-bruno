import express from 'express';
import { PagoProveedor } from '../models/PagoProveedor.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

const normalizarFecha = (dateString) => {
  const raw = String(dateString || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

router.get('/', async (req, res) => {
  try {
    const fecha = normalizarFecha(req.query.fecha);
    const desde = normalizarFecha(req.query.desde);
    const hasta = normalizarFecha(req.query.hasta);
    const rows = await PagoProveedor.listar({ fecha, desde, hasta });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const pago = await PagoProveedor.registrar({
      proveedor: req.body.proveedor,
      concepto: req.body.concepto,
      monto_total: req.body.monto_total,
      metodo_pago: req.body.metodo_pago,
      pagos: req.body.pagos,
      authUser: req.user
    });
    res.status(201).json(pago);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const eliminado = await PagoProveedor.eliminar(req.params.id);
    res.json({ success: true, pago: eliminado });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
