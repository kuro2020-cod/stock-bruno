import express from 'express';
import { getResumenCigarrillos } from '../services/cigarrillos.js';

const router = express.Router();

router.get('/resumen', async (req, res) => {
  try {
    const limit = Number(req.query.historialLimit) || 14;
    const data = await getResumenCigarrillos({ historialLimit: limit });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
