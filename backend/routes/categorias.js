import express from 'express';
import { Categoria } from '../models/Categoria.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Obtener todas las categorías
router.get('/', async (req, res) => {
  try {
    const categorias = await Categoria.getAll();
    res.json(categorias);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener categoría por ID
router.get('/:id', async (req, res) => {
  try {
    const categoria = await Categoria.getById(req.params.id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(categoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear nueva categoría (solo ADMIN)
router.post('/', requireAdmin, async (req, res) => {
  try {
    const categoria = await Categoria.create(req.body);
    res.status(201).json(categoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Actualizar categoría (solo ADMIN)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const categoria = await Categoria.update(req.params.id, req.body);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    res.json(categoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar categoría (solo ADMIN)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Verificar que la categoría existe
    const categoria = await Categoria.getById(req.params.id);
    if (!categoria) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }
    
    await Categoria.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

