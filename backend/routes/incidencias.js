import express from 'express';
import { Incidencia } from '../models/Incidencia.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Cualquier usuario autenticado puede registrar (vendedor también elimina del carrito)
router.post('/', async (req, res) => {
  try {
    const incidencia = await Incidencia.registrar({
      tipo: req.body.tipo,
      items: req.body.items,
      authUser: req.user
    });
    res.status(201).json(incidencia);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Listado solo admin
router.get('/', requireAdmin, async (req, res) => {
  try {
    const result = await Incidencia.listar({
      limit: req.query.limit,
      offset: req.query.offset,
      desde: req.query.desde || null,
      hasta: req.query.hasta || null
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
