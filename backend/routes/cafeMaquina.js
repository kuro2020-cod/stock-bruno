import express from 'express';
import { getResumenCafeMaquina, reiniciarContadorCafeMaquina } from '../services/cafeMaquina.js';

const router = express.Router();

function etiquetaUsuario(user) {
  if (!user) return 'Sistema';
  const label = [user.apellido, user.nombre].filter(Boolean).join(', ').trim();
  return label || user.usuario || 'Sistema';
}

router.get('/resumen', async (req, res) => {
  try {
    const limit = Number(req.query.historialLimit) || 12;
    const data = await getResumenCafeMaquina({ historialLimit: limit });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/reiniciar', async (req, res) => {
  try {
    const data = await reiniciarContadorCafeMaquina({
      usuario: etiquetaUsuario(req.user),
      usuarioId: req.user?.id ?? null
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message || 'No se pudo reiniciar el contador' });
  }
});

export default router;
