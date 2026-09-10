import express from 'express';
import {
  crearContadorDashboard,
  eliminarContadorDashboard,
  listarContadoresDashboard
} from '../services/dashboardContadores.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const limit = Number(req.query.historialLimit) || 14;
    const data = await listarContadoresDashboard({ historialLimit: limit });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const data = await crearContadorDashboard({
      categoriaId: req.body?.categoria_id ?? req.body?.categoriaId,
      frecuencia: req.body?.frecuencia
    });
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const data = await eliminarContadorDashboard(req.params.id);
    res.json(data);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message });
  }
});

export default router;
