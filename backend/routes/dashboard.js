import express from 'express';
import { Producto } from '../models/Producto.js';
import { Movimiento } from '../models/Movimiento.js';
import db from '../database/db.js';
import { getResumenCafeMaquina } from '../services/cafeMaquina.js';
import { getResumenMilanesas } from '../services/milanesas.js';
import { getResumenCigarrillos } from '../services/cigarrillos.js';
import { listarContadoresDashboard } from '../services/dashboardContadores.js';

const router = express.Router();

// Obtener estadísticas del dashboard
router.get('/stats', async (req, res) => {
  try {
    const totalProductos = await db.get('SELECT COUNT(*) as total FROM productos');

    const totalCategorias = await db.get('SELECT COUNT(*) as total FROM categorias');

    const valorInventario = await db.get(`
      SELECT SUM(stock_actual * precio_compra) as total
      FROM productos
    `);

    const stockBajo = await db.get(`
      SELECT COUNT(*) as total
      FROM productos
      WHERE ${Producto.condicionStockBajo()}
    `);

    const movimientosHoy = await Movimiento.getStats();

    const topProductos = await db.all(`
      SELECT nombre, stock_actual, precio_venta
      FROM productos
      ORDER BY stock_actual DESC
      LIMIT 5
    `);

    const cafeMaquina = await getResumenCafeMaquina({ historialLimit: 12 });
    const milanesas = await getResumenMilanesas({ historialLimit: 14 });
    const cigarrillos = await getResumenCigarrillos({ historialLimit: 14 });
    const contadoresCategoria = await listarContadoresDashboard({ historialLimit: 14 });

    res.json({
      totalProductos: totalProductos.total,
      totalCategorias: totalCategorias.total,
      valorInventario: valorInventario.total || 0,
      stockBajo: stockBajo.total,
      movimientosHoy: movimientosHoy || { total_movimientos: 0, total_entradas: 0, total_salidas: 0 },
      topProductos,
      cafeMaquina,
      milanesas,
      cigarrillos,
      contadoresCategoria
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
