import db from '../database/db.js';

const DEFAULTS = {
  email_destino: 'bruno.german99@gmail.com',
  hora_envio: '22:00',
  activo: true
};

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function etiquetaUsuario(authUser) {
  if (!authUser) return null;
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || null;
}

export class ConfigReporteFaltantes {
  static defaults() {
    return { ...DEFAULTS };
  }

  static validarHora(hora) {
    const h = String(hora || '')
      .trim()
      .slice(0, 5);
    return HORA_RE.test(h) ? h : null;
  }

  static validarEmail(email) {
    const e = String(email || '')
      .trim()
      .toLowerCase();
    return EMAIL_RE.test(e) ? e : null;
  }

  /** Acepta string (coma/punto y coma/salto) o array. Omite inválidos (lectura). */
  static parseEmails(raw) {
    const partes = Array.isArray(raw)
      ? raw.flatMap((s) => String(s || '').split(/[,;\n]+/))
      : String(raw || '').split(/[,;\n]+/);
    const out = [];
    const seen = new Set();
    for (const p of partes) {
      const email = this.validarEmail(p);
      if (!email || seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
    return out;
  }

  static parseEmailsStrict(raw) {
    const partes = Array.isArray(raw)
      ? raw.flatMap((s) => String(s || '').split(/[,;\n]+/))
      : String(raw || '').split(/[,;\n]+/);
    const tokens = partes.map((s) => s.trim()).filter(Boolean);
    const invalidos = [];
    const out = [];
    const seen = new Set();
    for (const t of tokens) {
      const email = this.validarEmail(t);
      if (!email) {
        invalidos.push(t);
        continue;
      }
      if (seen.has(email)) continue;
      seen.add(email);
      out.push(email);
    }
    if (invalidos.length) {
      throw new Error(`Correo(s) inválido(s): ${invalidos.join(', ')}`);
    }
    return out;
  }

  static serializarEmails(emails) {
    return (emails || []).join(', ');
  }

  static mapRow(row) {
    const emails = this.parseEmails(row?.email_destino);
    return {
      email_destino: this.serializarEmails(emails),
      emails,
      hora_envio: row.hora_envio,
      activo: Boolean(row.activo),
      actualizado_en: row.actualizado_en,
      actualizado_por: row.actualizado_por
    };
  }

  static async get() {
    let row = await db.get(`SELECT * FROM config_reporte_faltantes WHERE id = 1`);
    if (!row) {
      await db.run(
        `
        INSERT INTO config_reporte_faltantes (id, email_destino, hora_envio, activo)
        VALUES (1, ?, ?, TRUE)
      `,
        [DEFAULTS.email_destino, DEFAULTS.hora_envio]
      );
      row = await db.get(`SELECT * FROM config_reporte_faltantes WHERE id = 1`);
    }
    return this.mapRow(row);
  }

  static async upsert({ email_destino, emails, hora_envio, activo }, authUser = null) {
    const lista = this.parseEmailsStrict(emails != null ? emails : email_destino);
    if (!lista.length) {
      throw new Error('Indicá al menos un correo destino válido.');
    }
    const hora = this.validarHora(hora_envio);
    if (!hora) {
      throw new Error('Horario inválido. Use formato HH:MM (ej. 22:00).');
    }
    const on = activo === undefined ? true : Boolean(activo);
    const por = etiquetaUsuario(authUser);
    const joined = this.serializarEmails(lista);

    await db.run(
      `
      INSERT INTO config_reporte_faltantes (id, email_destino, hora_envio, activo, actualizado_en, actualizado_por)
      VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP, ?)
      ON CONFLICT (id) DO UPDATE SET
        email_destino = EXCLUDED.email_destino,
        hora_envio = EXCLUDED.hora_envio,
        activo = EXCLUDED.activo,
        actualizado_en = CURRENT_TIMESTAMP,
        actualizado_por = EXCLUDED.actualizado_por
    `,
      [joined, hora, on, por]
    );

    return this.get();
  }
}
