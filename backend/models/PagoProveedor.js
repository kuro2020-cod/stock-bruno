import db from '../database/db.js';
import {
  METODOS_PROVEEDOR,
  mergeMontosPorMetodo,
  resolverMetodoPago
} from '../utils/metodosPago.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

export class PagoProveedor {
  static async registrar({ proveedor, concepto, monto_total, metodo_pago, pagos, authUser }) {
    const nom = String(proveedor || '').trim();
    if (!nom) throw new Error('Indique el nombre del proveedor');

    const monto = round2(monto_total);
    if (!Number.isFinite(monto) || monto <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    const { metodoPago, desglose } = resolverMetodoPago({
      pagos,
      metodo_pago,
      montoTotal: monto,
      metodosPermitidos: METODOS_PROVEEDOR
    });

    const registradoPor = etiquetaUsuario(authUser);
    const desgloseJson = desglose ? JSON.stringify(desglose) : null;

    const ins = await db.run(
      `
      INSERT INTO pagos_proveedores
        (proveedor, concepto, monto_total, metodo_pago, pagos_desglose, registrado_por, usuario_id)
      VALUES (?, ?, ?, ?, CAST(? AS JSONB), ?, ?)
    `,
      [
        nom,
        concepto ? String(concepto).trim() : null,
        monto,
        metodoPago,
        desgloseJson,
        registradoPor,
        authUser?.id ?? null
      ]
    );

    return this.getById(ins.lastID);
  }

  static async getById(id) {
    return db.get(
      `
      SELECT id, proveedor, concepto, monto_total, metodo_pago, pagos_desglose,
             registrado_por, usuario_id, fecha, created_at
      FROM pagos_proveedores
      WHERE id = ?
    `,
      [id]
    );
  }

  static async listar({ fecha, desde, hasta } = {}) {
    const cond = [];
    const params = [];

    if (fecha) {
      cond.push('p.fecha >= ?::date AND p.fecha < (?::date + interval \'1 day\')');
      params.push(fecha, fecha);
    } else {
      if (desde) {
        cond.push('p.fecha >= ?::date');
        params.push(desde);
      }
      if (hasta) {
        cond.push('p.fecha < (?::date + interval \'1 day\')');
        params.push(hasta);
      }
    }

    const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';

    return db.all(
      `
      SELECT id, proveedor, concepto, monto_total, metodo_pago, pagos_desglose,
             registrado_por, usuario_id, fecha, created_at
      FROM pagos_proveedores p
      ${where}
      ORDER BY p.fecha DESC, p.id DESC
    `,
      params
    );
  }

  static async eliminar(id) {
    const row = await this.getById(id);
    if (!row) throw new Error('Pago no encontrado');
    await db.run('DELETE FROM pagos_proveedores WHERE id = ?', [id]);
    return row;
  }
}
