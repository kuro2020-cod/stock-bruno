import express from 'express';
import { Movimiento } from '../models/Movimiento.js';

const router = express.Router();

// GET /api/estadisticas/ventas?periodo=dia|semana|mes&mes=YYYY-MM (mes solo con periodo=mes, mes calendario histórico)
router.get('/ventas', async (req, res) => {
  try {
    const periodo = req.query.periodo;
    const mes = req.query.mes;
    const data = await Movimiento.getVentasEstadisticas(periodo, { mes });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
