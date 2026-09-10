import db from '../database/db.js';
import { Producto } from './Producto.js';

export const TIPOS_PROMOCION = ['fiambre', 'prepizza', 'huevos_maple', 'combo'];

const round2 = (n) => Math.round(Number(n) * 100) / 100;

export class Promocion {
  static _validarTipo(tipo) {
    const t = String(tipo || '').trim().toLowerCase();
    if (!TIPOS_PROMOCION.includes(t)) {
      throw new Error('Tipo de promoción inválido (fiambre, prepizza, huevos_maple, combo)');
    }
    return t;
  }

  static _unidadPorTipo(tipo, unidadRaw) {
    const u = String(unidadRaw || '').trim().toLowerCase();
    if (u) return u;
    if (tipo === 'fiambre') return 'kg';
    if (tipo === 'huevos_maple') return 'maple';
    return 'unidad';
  }

  static async _getItemsForPromo(promocionId) {
    return db.all(
      `
      SELECT pi.*,
        p.nombre AS producto_nombre,
        p.codigo AS producto_codigo,
        p.precio_venta AS producto_precio_venta,
        p.unidad_medida AS producto_unidad_medida,
        p.stock_actual AS producto_stock_actual
      FROM promocion_items pi
      JOIN productos p ON pi.producto_id = p.id
      WHERE pi.promocion_id = ?
      ORDER BY pi.orden ASC, pi.id ASC
    `,
      [promocionId]
    );
  }

  static async _attachItems(promoOrList) {
    if (!promoOrList) return promoOrList;
    if (Array.isArray(promoOrList)) {
      for (const p of promoOrList) {
        await this._attachItemsOne(p);
      }
      return promoOrList;
    }
    return this._attachItemsOne(promoOrList);
  }

  static async _attachItemsOne(p) {
    let items = await this._getItemsForPromo(p.id);
    if (items.length === 0 && p.producto_id) {
      const prod = await Producto.getById(p.producto_id);
      if (prod) {
        items = [
          {
            id: null,
            promocion_id: p.id,
            producto_id: prod.id,
                cantidad: p.cantidad_minima || 1,
                precio_unitario: null,
            orden: 0,
            producto_nombre: prod.nombre,
            producto_codigo: prod.codigo,
            producto_precio_venta: prod.precio_venta,
            producto_unidad_medida: prod.unidad_medida,
            producto_stock_actual: prod.stock_actual
          }
        ];
      }
    }
    p.items = items;
    return p;
  }

  static async _validarItems(items, precioPromocional) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('La promoción debe incluir al menos un producto');
    }
    const vistos = new Set();
    for (const raw of items) {
      const productoId = Number(raw.producto_id);
      const cantidad = Number(raw.cantidad);
      if (!productoId || Number.isNaN(cantidad) || cantidad <= 0) {
        throw new Error('Cada producto debe tener cantidad mayor a 0');
      }
      if (vistos.has(productoId)) {
        throw new Error('No repita el mismo producto; sume la cantidad en una sola línea');
      }
      vistos.add(productoId);
      const prod = await Producto.getById(productoId);
      if (!prod) throw new Error(`Producto no encontrado (id ${productoId})`);
      if (raw.precio_unitario != null && raw.precio_unitario !== '') {
        const pu = Number(raw.precio_unitario);
        if (Number.isNaN(pu) || pu < 0) {
          throw new Error(`Precio inválido para "${prod.nombre}"`);
        }
      }
    }
    const precio = Number(precioPromocional);
    if (Number.isNaN(precio) || precio < 0) {
      throw new Error('El precio promocional debe ser mayor o igual a 0');
    }
    return items.map((raw, idx) => ({
      producto_id: Number(raw.producto_id),
      cantidad: Number(raw.cantidad),
      precio_unitario:
        raw.precio_unitario != null && raw.precio_unitario !== '' ? round2(raw.precio_unitario) : null,
      orden: idx
    }));
  }

  static async _saveItems(promocionId, itemsNormalizados) {
    await db.run('DELETE FROM promocion_items WHERE promocion_id = ?', [promocionId]);
    for (const it of itemsNormalizados) {
      const cantidad = Number(it.cantidad);
      await db.run(
        `
        INSERT INTO promocion_items (promocion_id, producto_id, cantidad, precio_unitario, orden)
        VALUES (?, ?, ?, ?, ?)
      `,
        [promocionId, it.producto_id, cantidad, it.precio_unitario, it.orden ?? 0]
      );
    }
  }

  static async getAll() {
    const rows = await db.all(`
      SELECT * FROM promociones
      ORDER BY activa DESC, tipo ASC, nombre ASC
    `);
    return this._attachItems(rows);
  }

  static async getActivas() {
    const rows = await db.all(`
      SELECT * FROM promociones
      WHERE activa = TRUE
        AND (fecha_inicio IS NULL OR fecha_inicio <= CURRENT_DATE)
        AND (fecha_fin IS NULL OR fecha_fin >= CURRENT_DATE)
      ORDER BY tipo ASC, nombre ASC
    `);
    return this._attachItems(rows);
  }

  static async getById(id) {
    const p = await db.get('SELECT * FROM promociones WHERE id = ?', [id]);
    if (!p) return null;
    return this._attachItemsOne(p);
  }

  static async create(data) {
    const tipo = this._validarTipo(data.tipo);
    const nombre = String(data.nombre || '').trim();
    if (!nombre) throw new Error('El nombre de la promoción es requerido');

    const precio = Number(data.precio_promocional);
    if (Number.isNaN(precio) || precio < 0) {
      throw new Error('El precio promocional debe ser mayor o igual a 0');
    }

    const cantidadMin = Number(data.cantidad_minima ?? 1);
    if (Number.isNaN(cantidadMin) || cantidadMin <= 0) {
      throw new Error('La cantidad mínima debe ser mayor a 0');
    }

    const itemsNorm = await this._validarItems(data.items, precio);
    const activa = data.activa !== false && data.activa !== 'false';
    const unidad = this._unidadPorTipo(tipo, data.unidad_promo);
    const productoId = itemsNorm[0]?.producto_id ?? null;

    const result = await db.run(
      `
      INSERT INTO promociones
        (nombre, tipo, descripcion, producto_id, precio_promocional, cantidad_minima, unidad_promo, activa, fecha_inicio, fecha_fin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?::date, ?::date)
    `,
      [
        nombre,
        tipo,
        data.descripcion?.trim() || null,
        productoId,
        precio,
        cantidadMin,
        unidad,
        activa,
        data.fecha_inicio || null,
        data.fecha_fin || null
      ]
    );

    await this._saveItems(result.lastID, itemsNorm);
    return this.getById(result.lastID);
  }

  static async update(id, data) {
    const existente = await this.getById(id);
    if (!existente) throw new Error('Promoción no encontrada');

    const tipo = data.tipo != null ? this._validarTipo(data.tipo) : existente.tipo;
    const nombre = data.nombre != null ? String(data.nombre).trim() : existente.nombre;
    if (!nombre) throw new Error('El nombre de la promoción es requerido');

    const precio =
      data.precio_promocional != null ? Number(data.precio_promocional) : Number(existente.precio_promocional);
    if (Number.isNaN(precio) || precio < 0) {
      throw new Error('El precio promocional debe ser mayor o igual a 0');
    }

    const cantidadMin =
      data.cantidad_minima != null ? Number(data.cantidad_minima) : Number(existente.cantidad_minima);
    if (Number.isNaN(cantidadMin) || cantidadMin <= 0) {
      throw new Error('La cantidad mínima debe ser mayor a 0');
    }

    const activa =
      data.activa !== undefined ? data.activa !== false && data.activa !== 'false' : existente.activa;
    const unidad = this._unidadPorTipo(
      tipo,
      data.unidad_promo != null ? data.unidad_promo : existente.unidad_promo
    );

    let itemsNorm = null;
    if (data.items !== undefined) {
      itemsNorm = await this._validarItems(data.items, precio);
    }

    const productoId =
      itemsNorm != null ? itemsNorm[0]?.producto_id ?? null : existente.producto_id;

    await db.run(
      `
      UPDATE promociones SET
        nombre = ?,
        tipo = ?,
        descripcion = ?,
        producto_id = ?,
        precio_promocional = ?,
        cantidad_minima = ?,
        unidad_promo = ?,
        activa = ?,
        fecha_inicio = ?::date,
        fecha_fin = ?::date,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [
        nombre,
        tipo,
        data.descripcion !== undefined ? data.descripcion?.trim() || null : existente.descripcion,
        productoId,
        precio,
        cantidadMin,
        unidad,
        activa,
        data.fecha_inicio !== undefined ? data.fecha_inicio || null : existente.fecha_inicio,
        data.fecha_fin !== undefined ? data.fecha_fin || null : existente.fecha_fin,
        id
      ]
    );

    if (itemsNorm) {
      await this._saveItems(id, itemsNorm);
    }

    return this.getById(id);
  }

  static async delete(id) {
    const existente = await this.getById(id);
    if (!existente) throw new Error('Promoción no encontrada');
    await db.run('DELETE FROM promociones WHERE id = ?', [id]);
    return { success: true };
  }
}
