import express from 'express';
import { requireAdmin } from '../middleware/auth.js';
import { ConfigReporteFaltantes } from '../models/ConfigReporteFaltantes.js';
import { enviarReporteFaltantes, smtpConfigurado } from '../services/reporteFaltantesEmail.js';
import { reprogramarReporteFaltantesCron } from '../services/reporteFaltantesCron.js';

const router = express.Router();

router.use(requireAdmin);

router.get('/config', async (req, res) => {
  try {
    const config = await ConfigReporteFaltantes.get();
    res.json({
      ...config,
      smtp_configurado: smtpConfigurado()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/config', async (req, res) => {
  try {
    const config = await ConfigReporteFaltantes.upsert(
      {
        emails: req.body.emails,
        email_destino: req.body.email_destino,
        hora_envio: req.body.hora_envio,
        activo: req.body.activo
      },
      req.user
    );
    await reprogramarReporteFaltantesCron();
    res.json({
      ...config,
      smtp_configurado: smtpConfigurado()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/enviar-ahora', async (req, res) => {
  try {
    const result = await enviarReporteFaltantes({ forzar: true });
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
