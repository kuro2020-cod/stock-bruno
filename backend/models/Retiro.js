import db from '../database/db.js';
import { Movimiento } from './Movimiento.js';
import { Producto } from './Producto.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

export class Retiro {
  static async registrarEfectivo({ monto, motivo, authUser }) {
    const m = round2(monto);
    if (!Number.isFinite(m) || m <= 0) {
      throw new Error('El monto debe ser mayor a 0');
    }

    const registradoPor = etiquetaUsuario(authUser);
    const ins = await db.run(
      `
      INSERT INTO retiros
        (tipo, monto, metodo_pago, motivo, registrado_por, usuario_id)
      VALUES ('efectivo', ?, 'efectivo', ?, ?, ?)
    `,
      [
        m,
        motivo ? String(motivo).trim() : null,
        registradoPor,
        authUser?.id ?? null
      ]
    );
    return this.getById(ins.lastID);
  }

  static async registrarMercaderia({ producto_id, cantidad, motivo, authUser }) {
    const pid = Number(producto_id);
    if (!Number.isFinite(pid) || pid <= 0) {
      throw new Error('Producto inválido');
    }
    const cant = round4(cantidad);
    if (!Number.isFinite(cant) || cant <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }

    const producto = await Producto.getById(pid);
    if (!producto) throw new Error('Producto no encontrado');
    if (Producto.noControlaStock(producto)) {
      throw new Error(
        `"${producto.nombre}" no controla stock (producto elaborado). No aplica retiro de mercadería.`
      );
    }

    const registradoPor = etiquetaUsuario(authUser);
    const motivoMov = 'RETIRO DUEÑO';
    const nota = motivo ? String(motivo).trim() : null;

    const movimiento = await Movimiento.create({
      producto_id: pid,
      tipo: 'baja',
      cantidad: cant,
      motivo: motivoMov,
      usuario: registradoPor
    });

    const valorEstimado = round2(cant * Number(producto.precio_venta || 0));

    const ins = await db.run(
      `
      INSERT INTO retiros
        (tipo, monto, producto_id, producto_nombre, cantidad, movimiento_id, motivo, registrado_por, usuario_id)
      VALUES ('mercaderia', ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        valorEstimado,
        pid,
        producto.nombre,
        cant,
        movimiento.id,
        nota,
        registradoPor,
        authUser?.id ?? null
      ]
    );

    return this.getById(ins.lastID);
  }

  /** Varios productos en una sola operación (misma lógica que mercadería suelta). */
  static async registrarMercaderiaLote({ items, motivo, authUser }) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('El retiro debe incluir al menos un producto');
    }

    const consolidado = new Map();
    for (const raw of items) {
      const pid = Number(raw.producto_id);
      const cant = round4(raw.cantidad);
      if (!Number.isFinite(pid) || pid <= 0) {
        throw new Error('Producto inválido');
      }
      if (!Number.isFinite(cant) || cant <= 0) {
        throw new Error('La cantidad debe ser mayor a 0');
      }
      const prev = consolidado.get(pid) || { cant: 0, valor: 0, precioEnviado: false };
      const precioRaw = raw.precio_unitario;
      const tienePrecio =
        precioRaw !== undefined && precioRaw !== null && precioRaw !== '' && Number.isFinite(Number(precioRaw));
      consolidado.set(pid, {
        cant: round4(prev.cant + cant),
        valor: round2(prev.valor + (tienePrecio ? cant * Number(precioRaw) : 0)),
        precioEnviado: prev.precioEnviado || tienePrecio
      });
    }

    const registradoPor = etiquetaUsuario(authUser);
    const motivoMov = 'RETIRO DUEÑO';
    const nota = motivo ? String(motivo).trim() : '';
    if (!nota) {
      throw new Error('Indicá el nombre del dueño');
    }

    return db.transaction(async (tx) => {
      const creados = [];
      let totalImporte = 0;

      for (const [pid, acc] of consolidado) {
        const cant = acc.cant;
        const producto = await tx.get(`SELECT * FROM productos WHERE id = ? FOR UPDATE`, [pid]);
        if (!producto) throw new Error(`Producto no encontrado (id ${pid})`);
        const sinStock = Producto.noControlaStock(producto);

        if (!sinStock) {
          const disp = Number(producto.stock_actual);
          if (disp + 1e-9 < cant) {
            throw new Error(
              `Stock insuficiente para "${producto.nombre}". Disponible: ${disp}, solicitado: ${cant}`
            );
          }
        }

        const insMov = await tx.run(
          `
          INSERT INTO movimientos (producto_id, tipo, cantidad, motivo, usuario, precio_unitario, metodo_pago)
          VALUES (?, 'baja', ?, ?, ?, NULL, NULL)
        `,
          [pid, cant, motivoMov, registradoPor]
        );

        if (!sinStock) {
          await tx.run(
            `
            UPDATE productos
            SET stock_actual = stock_actual - ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
            [cant, pid]
          );
        }

        const valorEstimado = acc.precioEnviado
          ? acc.valor
          : round2(cant * Number(producto.precio_venta || 0));
        totalImporte = round2(totalImporte + valorEstimado);

        const insRet = await tx.run(
          `
          INSERT INTO retiros
            (tipo, monto, producto_id, producto_nombre, cantidad, movimiento_id, motivo, registrado_por, usuario_id)
          VALUES ('mercaderia', ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          [
            valorEstimado,
            pid,
            producto.nombre,
            cant,
            insMov.lastID,
            nota,
            registradoPor,
            authUser?.id ?? null
          ]
        );

        creados.push({
          retiro_id: insRet.lastID,
          movimiento_id: insMov.lastID,
          producto_id: pid,
          producto_nombre: producto.nombre,
          cantidad: cant,
          monto: valorEstimado
        });
      }

      return { lineas: creados.length, totalImporte, retiros: creados };
    });
  }

  static async getById(id) {
    const row = await db.get(`SELECT * FROM retiros WHERE id = ?`, [id]);
    return this._map(row);
  }

  static async listar({ tipo = null, limit = 50, offset = 0, desde = null, hasta = null } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const off = Math.max(Number(offset) || 0, 0);
    const where = [];
    const params = [];

    if (tipo === 'efectivo' || tipo === 'mercaderia') {
      where.push('tipo = ?');
      params.push(tipo);
    }
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
      FROM retiros
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
      tipo: row.tipo,
      monto: row.monto != null ? Number(row.monto) : null,
      metodo_pago: row.metodo_pago,
      producto_id: row.producto_id,
      producto_nombre: row.producto_nombre,
      cantidad: row.cantidad != null ? Number(row.cantidad) : null,
      movimiento_id: row.movimiento_id,
      motivo: row.motivo,
      registrado_por: row.registrado_por,
      usuario_id: row.usuario_id,
      fecha: row.fecha,
      created_at: row.created_at
    };
  }
}
