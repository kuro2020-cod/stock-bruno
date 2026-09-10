import express from 'express';
import { Promocion } from '../models/Promocion.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.get('/activas', async (req, res) => {
  try {
    const promociones = await Promocion.getActivas();
    res.json(promociones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const promociones = await Promocion.getAll();
    res.json(promociones);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const promocion = await Promocion.getById(req.params.id);
    if (!promocion) {
      return res.status(404).json({ error: 'Promoción no encontrada' });
    }
    res.json(promocion);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const promocion = await Promocion.create(req.body);
    res.status(201).json(promocion);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const promocion = await Promocion.update(req.params.id, req.body);
    res.json(promocion);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await Promocion.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
