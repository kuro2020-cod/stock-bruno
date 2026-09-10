import db from '../database/db.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

export class IngresoEfectivo {
  static async registrar({ monto, motivo, authUser }) {
    const m = round2(monto);
    if (!Number.isFinite(m) || m <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    const registradoPor = etiquetaUsuario(authUser);
    const ins = await db.run(
      `
      INSERT INTO ingresos_efectivo
        (monto, motivo, registrado_por, usuario_id)
      VALUES (?, ?, ?, ?)
    `,
      [m, motivo ? String(motivo).trim() : null, registradoPor, authUser?.id ?? null]
    );
    return this.getById(ins.lastID);
  }

  static async getById(id) {
    const row = await db.get(`SELECT * FROM ingresos_efectivo WHERE id = ?`, [id]);
    return this._map(row);
  }

  static async listar({ limit = 50, offset = 0, desde = null, hasta = null } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const off = Math.max(Number(offset) || 0, 0);
    const where = [];
    const params = [];

    if (desde) {
      where.push('fecha::date >= ?::date');
      params.push(String(desde).trim());
    }
    if (hasta) {
      where.push('fecha::date <= ?::date');
      params.push(String(hasta).trim());
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await db.all(
      `
      SELECT *
      FROM ingresos_efectivo
      ${whereSql}
      ORDER BY fecha DESC, id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, lim, off]
    );
    return (rows || []).map((r) => this._map(r));
  }

  static _map(row) {
    if (!row) return null;
    return {
      id: row.id,
      monto: row.monto != null ? Number(row.monto) : null,
      motivo: row.motivo,
      registrado_por: row.registrado_por,
      usuario_id: row.usuario_id,
      fecha: row.fecha,
      created_at: row.created_at
    };
  }
}
