import express from 'express';
import { Fiado } from '../models/Fiado.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const estado =
      req.query.estado === 'pendiente' || req.query.estado === 'cobrado'
        ? req.query.estado
        : null;
    const rows = await Fiado.listar({
      estado,
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/clientes', async (req, res) => {
  try {
    const rows = await Fiado.listarClientes({
      q: req.query.q,
      limit: req.query.limit
    });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/resumen', async (req, res) => {
  try {
    const soloPendientes = req.query.todos !== '1' && req.query.todos !== 'true';
    const rows = await Fiado.resumenPorCliente({ soloPendientes });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/cobrar-cliente', async (req, res) => {
  try {
    const result = await Fiado.marcarCobradoCliente(req.body.cliente_nombre, {
      metodo_pago: req.body.metodo_pago,
      pagos: req.body.pagos,
      authUser: req.user
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/pago-parcial', async (req, res) => {
  try {
    const result = await Fiado.pagoParcial({
      cliente_nombre: req.body.cliente_nombre,
      fiado_id: req.body.fiado_id,
      metodo_pago: req.body.metodo_pago,
      pagos: req.body.pagos,
      authUser: req.user
    });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/cobrar', async (req, res) => {
  try {
    const fiado = await Fiado.marcarCobrado(req.params.id, {
      metodo_pago: req.body.metodo_pago,
      pagos: req.body.pagos,
      authUser: req.user
    });
    res.json(fiado);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
