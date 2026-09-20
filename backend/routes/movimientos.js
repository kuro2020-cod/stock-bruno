import express from 'express';
import { Movimiento } from '../models/Movimiento.js';
import { PagoProveedor } from '../models/PagoProveedor.js';
import { requireAdmin } from '../middleware/auth.js';
import { esRolAdmin } from '../utils/roles.js';

const router = express.Router();

function normalizarPagoProveedorComoMovimiento(pago) {
  return {
    id: `pp-${pago.id}`,
    pago_proveedor_id: pago.id,
    origen: 'pago_proveedor',
    tipo: 'pago_proveedor',
    fecha: pago.fecha,
    producto_nombre: pago.proveedor,
    producto_codigo: null,
    cantidad: null,
    precio_unitario: null,
    monto_total: Number(pago.monto_total),
    motivo: pago.concepto,
    metodo_pago: pago.metodo_pago,
    pagos_desglose: pago.pagos_desglose,
    usuario: pago.registrado_por
  };
}

// Ventas del usuario autenticado (rol USER)
router.get('/mis-ventas', async (req, res) => {
  try {
    if (req.user?.rol !== 'USER') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }
    const movimientos = await Movimiento.getVentasByUsuario(req.user, {
      limit: req.query.limit,
      offset: req.query.offset
    });
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener todos los movimientos (solo ADMIN), incluye pagos a proveedores
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [movimientos, pagos] = await Promise.all([
      Movimiento.getAll({
        limit: req.query.limit,
        offset: req.query.offset
      }),
      PagoProveedor.listar({})
    ]);

    const stock = movimientos.map((m) => ({ ...m, origen: 'stock' }));
    const pagosNorm = pagos.map(normalizarPagoProveedorComoMovimiento);
    const combinados = [...stock, ...pagosNorm].sort(
      (a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()
    );

    res.json(combinados);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obtener movimientos por producto (solo ADMIN)
router.get('/producto/:productoId', requireAdmin, async (req, res) => {
  try {
    const movimientos = await Movimiento.getByProducto(req.params.productoId);
    res.json(movimientos);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Crear nuevo movimiento
router.post('/', async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || '').toLowerCase();
    if (tipo === 'baja' && !esRolAdmin(req.user?.rol)) {
      return res.status(403).json({ error: 'Solo un administrador puede registrar bajas de productos' });
    }

    const etiquetaUsuario = (() => {
      const u = req.user;
      if (!u) return req.body?.usuario || 'Sistema';
      const label = [u.apellido, u.nombre].filter(Boolean).join(', ').trim();
      return label || u.usuario || req.body?.usuario || 'Sistema';
    })();

    const movimiento = await Movimiento.create({
      ...req.body,
      usuario: etiquetaUsuario
    });
    res.status(201).json(movimiento);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Obtener estadísticas (solo ADMIN)
router.get('/stats/diarias', requireAdmin, async (req, res) => {
  try {
    const stats = await Movimiento.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;

