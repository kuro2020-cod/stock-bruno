import express from 'express';
import { getResumenMilanesas } from '../services/milanesas.js';

const router = express.Router();

router.get('/resumen', async (req, res) => {
  try {
    const limit = Number(req.query.historialLimit) || 14;
    const data = await getResumenMilanesas({ historialLimit: limit });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
