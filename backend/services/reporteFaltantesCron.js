import cron from 'node-cron';
import { ConfigReporteFaltantes } from '../models/ConfigReporteFaltantes.js';
import { enviarReporteFaltantes, smtpConfigurado } from './reporteFaltantesEmail.js';

const TZ = 'America/Argentina/Buenos_Aires';

let job = null;

function cronExprDesdeHora(horaEnvio) {
  const hora = ConfigReporteFaltantes.validarHora(horaEnvio) || '22:00';
  const [hh, mm] = hora.split(':').map((n) => Number(n));
  return `0 ${mm} ${hh} * * *`;
}

async function ejecutarProgramado() {
  try {
    const config = await ConfigReporteFaltantes.get();
    if (!config.activo) {
      console.log('[reporte-faltantes] Cron omitido: reporte desactivado.');
      return;
    }
    if (!smtpConfigurado()) {
      console.warn('[reporte-faltantes] Cron omitido: SMTP no configurado en .env.');
      return;
    }
    await enviarReporteFaltantes({ forzar: false });
  } catch (err) {
    console.error('[reporte-faltantes] Error en envío programado:', err.message || err);
  }
}

/**
 * (Re)programa el cron según la config en BD.
 */
export async function reprogramarReporteFaltantesCron() {
  if (job) {
    job.stop();
    job = null;
  }

  const config = await ConfigReporteFaltantes.get();
  const expr = cronExprDesdeHora(config.hora_envio);

  if (!cron.validate(expr)) {
    console.error(`[reporte-faltantes] Expresión cron inválida: ${expr}`);
    return;
  }

  job = cron.schedule(expr, () => {
    ejecutarProgramado();
  }, {
    timezone: TZ
  });

  console.log(
    `[reporte-faltantes] Cron programado a las ${config.hora_envio} (${TZ}). activo=${config.activo}`
  );
}

export async function iniciarReporteFaltantesCron() {
  await reprogramarReporteFaltantesCron();
}
