import express from 'express';
import { enviarPedidoEmail } from '../services/reporteFaltantesEmail.js';

const router = express.Router();

router.post('/enviar', async (req, res) => {
  try {
    const result = await enviarPedidoEmail({ items: req.body?.items });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
