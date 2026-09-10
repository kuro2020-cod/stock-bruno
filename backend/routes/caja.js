import express from 'express';
import { AperturaCaja } from '../models/AperturaCaja.js';

const router = express.Router();

router.get('/apertura', async (req, res) => {
  try {
    const estado = await AperturaCaja.getEstado(req.user);
    res.json(estado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/apertura', async (req, res) => {
  try {
    const result = await AperturaCaja.abrir({
      monto: req.body.monto ?? req.body.monto_apertura,
      authUser: req.user
    });
    res.status(result.yaAbierta ? 200 : 201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
