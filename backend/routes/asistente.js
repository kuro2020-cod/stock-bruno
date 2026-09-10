import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import {
  estadoAsistente,
  armarPlan,
  ejecutarPlan
} from '../services/asistenteCatalogo.js';

const router = express.Router();

router.use(requireAdmin);

router.get('/estado', (req, res) => {
  res.json(estadoAsistente());
});

router.post('/plan', async (req, res) => {
  try {
    const plan = await armarPlan(req.body?.texto, req.user);
    res.json(plan);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/ejecutar', async (req, res) => {
  try {
    const result = await ejecutarPlan(req.body?.plan_id, req.user);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
