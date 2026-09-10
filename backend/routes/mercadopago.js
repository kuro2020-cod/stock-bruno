import express from 'express';
import {
  mercadopagoConfigurado,
  listarMovimientos,
  obtenerCuentaVinculada,
  qrCobroConfigurado,
  infoQrCobro,
  crearOrdenQr,
  consultarOrdenQr,
  cancelarOrdenQr
} from '../services/mercadopago.js';
import { fechaLocalISO } from '../utils/fechaCaja.js';

const router = express.Router();

const normalizarFecha = (dateString) => {
  const raw = String(dateString || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
};

const mapMpError = (error) => {
  const mpStatus = Number(error.status) || 0;
  let httpStatus = 400;
  let mensaje = error.message || 'Error de Mercado Pago';

  if (mpStatus === 401 || mpStatus === 403) {
    httpStatus = 502;
    mensaje =
      'Mercado Pago rechazó el Access Token (inválido o sin permisos). Revisá MERCADOPAGO_ACCESS_TOKEN en backend/.env.';
  } else if (mpStatus >= 500) {
    httpStatus = 502;
    mensaje = `Mercado Pago no respondió bien (${mpStatus}). Probá de nuevo en unos segundos.`;
  } else if (mpStatus >= 400) {
    httpStatus = 400;
  }

  return { httpStatus, mensaje };
};

/** ¿Hay token configurado? No expone el token. */
router.get('/estado', async (_req, res) => {
  try {
    const qr = infoQrCobro();
    if (!mercadopagoConfigurado()) {
      return res.json({
        configurado: false,
        cuenta: null,
        ...qr,
        mensaje: 'Falta MERCADOPAGO_ACCESS_TOKEN en el .env del backend.'
      });
    }
    const info = await obtenerCuentaVinculada();
    const esPrueba = Boolean(info.cuenta?.es_prueba);
    res.json({
      configurado: true,
      cuenta: info.cuenta,
      ...qr,
      mensaje: esPrueba
        ? 'El Access Token es de un usuario de PRUEBA. No vas a ver transferencias de tu cuenta real.'
        : qr.qr_cobro_configurado
          ? 'Mercado Pago listo: consulta de cobros + envío de monto al QR fijo.'
          : 'Mercado Pago listo para consultar cobros. Para QR con monto, configurá MERCADOPAGO_EXTERNAL_POS_ID.'
    });
  } catch (error) {
    const { httpStatus, mensaje } = mapMpError(error);
    res.status(httpStatus === 400 ? 400 : httpStatus).json({
      configurado: true,
      cuenta: null,
      ...infoQrCobro(),
      error: mensaje
    });
  }
});

/**
 * Cobros del día (solo lectura).
 * Query: fecha=YYYY-MM-DD, status=approved|pending|todos
 */
router.get('/movimientos', async (req, res) => {
  try {
    if (!mercadopagoConfigurado()) {
      return res.status(503).json({
        error:
          'Mercado Pago no está configurado. Agregá MERCADOPAGO_ACCESS_TOKEN en backend/.env y reiniciá el servidor.',
        configurado: false
      });
    }

    const fecha = normalizarFecha(req.query.fecha) || fechaLocalISO();
    const statusRaw = String(req.query.status || 'approved').trim().toLowerCase();
    const status =
      statusRaw === 'todos' || statusRaw === 'all'
        ? 'todos'
        : statusRaw === 'pending'
          ? 'pending'
          : 'approved';

    const data = await listarMovimientos({ fecha, status });
    res.json({ configurado: true, ...data });
  } catch (error) {
    const { httpStatus, mensaje } = mapMpError(error);
    res.status(httpStatus).json({ error: mensaje, configurado: true });
  }
});

/**
 * Envía el monto del carrito al QR fijo (orden mode=static asociada al POS).
 * Body: { monto, descripcion? }
 */
router.post('/qr/orden', async (req, res) => {
  try {
    if (!mercadopagoConfigurado()) {
      return res.status(503).json({
        error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).',
        configurado: false
      });
    }
    if (!qrCobroConfigurado()) {
      return res.status(503).json({
        error:
          'Falta MERCADOPAGO_EXTERNAL_POS_ID en backend/.env (external_id de la caja/POS del QR fijo).',
        configurado: true,
        qr_cobro_configurado: false
      });
    }

    const monto = Number(req.body?.monto);
    const orden = await crearOrdenQr({
      monto,
      descripcion: req.body?.descripcion,
      external_reference: req.body?.external_reference
    });
    res.status(201).json({ orden, ...infoQrCobro() });
  } catch (error) {
    const { httpStatus, mensaje } = mapMpError(error);
    res.status(httpStatus).json({ error: mensaje });
  }
});

router.get('/qr/orden/:id', async (req, res) => {
  try {
    if (!mercadopagoConfigurado()) {
      return res.status(503).json({
        error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).',
        configurado: false
      });
    }
    const orden = await consultarOrdenQr(req.params.id);
    res.json({ orden });
  } catch (error) {
    const { httpStatus, mensaje } = mapMpError(error);
    res.status(httpStatus).json({ error: mensaje });
  }
});

router.post('/qr/orden/:id/cancel', async (req, res) => {
  try {
    if (!mercadopagoConfigurado()) {
      return res.status(503).json({
        error: 'Mercado Pago no está configurado (MERCADOPAGO_ACCESS_TOKEN).',
        configurado: false
      });
    }
    const orden = await cancelarOrdenQr(req.params.id);
    res.json({ orden });
  } catch (error) {
    const { httpStatus, mensaje } = mapMpError(error);
    // Si ya estaba cancelada / pagada, devolvemos aviso sin tumbar la UI.
    if (httpStatus === 409 || /already|conflict|status/i.test(String(error.message || ''))) {
      return res.status(200).json({
        orden: null,
        aviso: error.message || 'La orden no se pudo cancelar (quizá ya estaba pagada o cancelada).'
      });
    }
    res.status(httpStatus).json({ error: mensaje });
  }
});

export default router;
