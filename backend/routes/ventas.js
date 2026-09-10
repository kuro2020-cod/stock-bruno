import express from 'express';
import { Venta } from '../models/Venta.js';
const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { items, usuario, motivo, metodo_pago, pagos, cliente_fiado } = req.body;
    const result = await Venta.registrar({
      items,
      usuario,
      motivo,
      metodo_pago,
      pagos,
      cliente_fiado,
      authUser: req.user
    });
    res.status(201).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
