import express from 'express';
import { Producto } from '../models/Producto.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Obtener todos los productos
router.get('/', async (req, res) => {
  try {
    const productos = await Producto.getAll();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Productos por vencer / vencidos (antes de rutas con :id)
router.get('/vencimientos/alerta', async (req, res) => {
  try {
    const productos = await Producto.getProximosVencer();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Productos con stock bajo (antes de rutas con :id)
router.get('/stock/bajo', async (req, res) => {
  try {
    const productos = await Producto.getLowStock();
    res.json(productos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Siguiente código numérico sugerido (carga de productos / alta manual)
router.get('/codigo-sugerido', async (req, res) => {
  try {
    const codigo = await Producto.sugerirSiguienteCodigo();
    res.json({ codigo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Buscar por código de barras / SKU (antes de /:id)
router.get('/codigo/:codigo', async (req, res) => {
  try {
    const codigo = decodeURIComponent(req.params.codigo).trim();
    if (!codigo) {
      return res.status(400).json({ error: 'Código vacío' });
    }
    const producto = await Producto.getByCodigo(codigo);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    const completo = await Producto.getById(producto.id);
    res.json(completo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener producto por ID
router.get('/:id', async (req, res) => {
  try {
    const producto = await Producto.getById(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear nuevo producto
router.post('/', async (req, res) => {
  try {
    const producto = await Producto.create(req.body);
    res.status(201).json(producto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Solo categoría (Faltantes / Pedidos / Productos)
router.put('/:id/categoria', async (req, res) => {
  try {
    const producto = await Producto.updateCategoria(req.params.id, req.body.categoria_id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(producto);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Actualizar producto
router.put('/:id', async (req, res) => {
  try {
    const producto = await Producto.update(req.params.id, req.body);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(producto);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Eliminar producto (solo ADMIN)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    // Verificar que el producto existe
    const producto = await Producto.getById(req.params.id);
    if (!producto) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    await Producto.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
