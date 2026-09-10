import db from '../database/db.js';
import { Fiado } from './Fiado.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

export class Incidencia {
  /**
   * @param {{ tipo: 'linea'|'carrito'|'fiado'|'fiado_carrito', items: Array, authUser?: object }}
   */
  static async registrar({ tipo, items, authUser }) {
    const tiposValidos = ['linea', 'carrito', 'fiado', 'fiado_carrito'];
    const t = tiposValidos.includes(tipo) ? tipo : 'linea';
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      throw new Error('La incidencia debe incluir al menos un producto');
    }

    const detalle = list.map((it) => {
      const cantidad = Number(it.cantidad) || 0;
      const precio = Number(it.precio_unitario) || 0;
      const subtotal =
        it.subtotal != null && it.subtotal !== ''
          ? round2(it.subtotal)
          : round2(cantidad * precio);
      return {
        producto_id: it.producto_id != null ? Number(it.producto_id) : null,
        nombre: String(it.nombre || 'Producto').trim(),
        codigo: it.codigo != null ? String(it.codigo) : null,
        cantidad,
        precio_unitario: precio,
        subtotal,
        es_linea_promo: Boolean(it.es_linea_promo),
        promo_nombre: it.promo_nombre || null,
        es_cobro_fiado: Boolean(it.es_cobro_fiado),
        fiado_id: it.fiado_id != null ? Number(it.fiado_id) : null,
        fiado_cliente: it.fiado_cliente != null ? String(it.fiado_cliente).trim() : null
      };
    });

    const montoTotal = round2(detalle.reduce((s, d) => s + Number(d.subtotal), 0));
    const registradoPor = etiquetaUsuario(authUser);
    const usuarioId = authUser?.id != null ? Number(authUser.id) : null;

    const result = await db.run(
      `
      INSERT INTO incidencias_carrito (tipo, monto_total, detalle, registrado_por, usuario_id)
      VALUES (?, ?, CAST(? AS JSONB), ?, ?)
    `,
      [t, montoTotal, JSON.stringify(detalle), registradoPor, usuarioId]
    );

    if (t === 'fiado' || t === 'fiado_carrito') {
      const fiadoIds = [
        ...new Set(
          detalle.map((d) => d.fiado_id).filter((id) => id != null && Number.isFinite(Number(id)))
        )
      ];
      await Fiado.registrarAvisoDescarteCarrito(fiadoIds, authUser);
    }

    return this.getById(result.lastID);
  }

  static async getById(id) {
    const row = await db.get(`SELECT * FROM incidencias_carrito WHERE id = ?`, [id]);
    return this._map(row);
  }

  static async listar({ limit = 10, offset = 0, desde = null, hasta = null } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 10, 1), 1000);
    const off = Math.max(Number(offset) || 0, 0);

    const where = [];
    const params = [];
    if (desde) {
      where.push(`fecha::date >= ?::date`);
      params.push(String(desde).trim());
    }
    if (hasta) {
      where.push(`fecha::date <= ?::date`);
      params.push(String(hasta).trim());
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const countRow = await db.get(
      `
      SELECT COUNT(*)::int AS total
      FROM incidencias_carrito
      ${whereSql}
    `,
      params
    );
    const total = Number(countRow?.total ?? 0);

    const rows = await db.all(
      `
      SELECT *
      FROM incidencias_carrito
      ${whereSql}
      ORDER BY fecha DESC, id DESC
      LIMIT ? OFFSET ?
    `,
      [...params, lim, off]
    );

    return {
      items: (rows || []).map((r) => this._map(r)),
      total,
      limit: lim,
      offset: off
    };
  }

  static _map(row) {
    if (!row) return null;
    let detalle = row.detalle;
    if (typeof detalle === 'string') {
      try {
        detalle = JSON.parse(detalle);
      } catch {
        detalle = [];
      }
    }
    if (!Array.isArray(detalle)) detalle = [];
    return {
      id: row.id,
      tipo: row.tipo,
      monto_total: Number(row.monto_total) || 0,
      detalle,
      registrado_por: row.registrado_por,
      usuario_id: row.usuario_id,
      fecha: row.fecha
    };
  }
}
