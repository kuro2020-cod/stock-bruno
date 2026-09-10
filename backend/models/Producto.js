import db from '../database/db.js';
import { fechaLocalISO, normalizarFechaISO } from '../utils/fechaCaja.js';

const DIAS_ALERTA_VENCIMIENTO = 7;

function addDaysISO(iso, days) {
  const [y, m, d] = String(iso)
    .split('-')
    .map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function diasHasta(hoyISO, fechaISO) {
  const [y1, m1, d1] = hoyISO.split('-').map(Number);
  const [y2, m2, d2] = fechaISO.split('-').map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86400000);
}

function esFlagActivo(v) {
  if (v === true || v === 1) return true;
  if (v === false || v === 0 || v == null || v === '') return false;
  const s = String(v).trim().toLowerCase();
  return s === 'true' || s === '1' || s === 't' || s === 'on' || s === 'yes' || s === 'si' || s === 'sí';
}

function resolverFechaVencimiento(productoData, noControla, noVerifica) {
  const omitirFecha =
    esFlagActivo(noControla) ||
    esFlagActivo(noVerifica) ||
    esFlagActivo(productoData?.no_controla_stock) ||
    esFlagActivo(productoData?.no_verifica_vencimiento);
  if (omitirFecha) return null;
  const fecha = normalizarFechaISO(productoData?.fecha_vencimiento);
  if (!fecha) {
    throw new Error('La fecha de vencimiento es obligatoria para productos que controlan stock');
  }
  return fecha;
}

/**
 * Si stock_minimo queda en 0 (sin configurar), el stock se considera "bajo" cuando
 * stock_actual <= este valor. Unidades: 2; kg/l: 0.5.
 */
export const UMBRAL_STOCK_SIN_MINIMO_CONFIGURADO = 2;
/** Sin mínimo y unidad kg o litro: considerar stock bajo por debajo de esto */
export const UMBRAL_STOCK_KG_SIN_MINIMO = 0.5;

export class Producto {
  /**
   * Condición SQL unificada para listados y conteos de stock bajo.
   * @param {string} alias Prefijo de tabla (ej. 'p') o '' sin alias
   */
  static condicionStockBajo(alias = '') {
    const c = alias ? `${alias}.` : '';
    const um = `LOWER(TRIM(COALESCE(${c}unidad_medida, '')))`;
    const esMedidaDecimal = `(${um} IN ('kg', 'kilogramo', 'kilogramos', 'kilo', 'kilos', 'l', 'lt', 'litro', 'litros'))`;
    return `(
      COALESCE(${c}no_controla_stock, FALSE) = FALSE
      AND (
        (${c}stock_minimo > 0 AND ${c}stock_actual <= ${c}stock_minimo)
        OR (
          COALESCE(${c}stock_minimo, 0) = 0
          AND (
            (${esMedidaDecimal} AND ${c}stock_actual <= ${UMBRAL_STOCK_KG_SIN_MINIMO})
            OR (NOT (${esMedidaDecimal}) AND ${c}stock_actual <= ${UMBRAL_STOCK_SIN_MINIMO_CONFIGURADO})
          )
        )
      )
    )`;
  }

  static noControlaStock(producto) {
    return Boolean(producto?.no_controla_stock);
  }

  static async getAll() {
    const productos = await db.all(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      ORDER BY p.created_at DESC
    `);
    return productos;
  }

  static async getById(id) {
    const producto = await db.get(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE p.id = ?
    `, [id]);
    return producto;
  }

  static async getByCodigo(codigo) {
    const producto = await db.get(`
      SELECT * FROM productos WHERE codigo = ?
    `, [codigo]);
    return producto;
  }

  /**
   * Siguiente código numérico sugerido (max de códigos solo dígitos + 1).
   * Si no hay códigos numéricos, devuelve "1".
   */
  static async sugerirSiguienteCodigo() {
    const row = await db.get(`
      SELECT COALESCE(MAX(codigo::bigint), 0) AS max_num
      FROM productos
      WHERE codigo IS NOT NULL
        AND TRIM(codigo::text) <> ''
        AND codigo::text ~ '^[0-9]+$'
    `);
    const max = row?.max_num != null ? BigInt(row.max_num) : 0n;
    return String(max + 1n);
  }

  static async create(productoData) {
    const { codigo, nombre, descripcion, categoria_id, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock, no_verifica_vencimiento } = productoData;
    const noControla = esFlagActivo(no_controla_stock);
    const noVerifica = esFlagActivo(no_verifica_vencimiento);

    // Validar nombre requerido
    if (!nombre || nombre.trim() === '') {
      throw new Error('El nombre del producto es requerido');
    }

    // Código único antes de la fecha: en carga, un producto existente
    // (papel, cigarrillos) debe poder actualizarse sin chocar por vencimiento.
    if (codigo) {
      const existente = await this.getByCodigo(codigo);
      if (existente) {
        throw new Error('Ya existe un producto con este código');
      }
    }

    const fechaVenc = resolverFechaVencimiento(productoData, noControla, noVerifica);

    // Validar precios no negativos
    if (precio_compra < 0 || precio_venta < 0) {
      throw new Error('Los precios no pueden ser negativos');
    }

    const sa = noControla ? 0 : Number(stock_actual);
    const sm = noControla ? 0 : Number(stock_minimo);
    if (Number.isNaN(sa) || Number.isNaN(sm) || sa < 0 || sm < 0) {
      throw new Error('El stock no puede ser negativo');
    }

    const result = await db.run(`
      INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock, no_verifica_vencimiento, fecha_vencimiento)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [codigo || null, nombre.trim(), descripcion?.trim() || null, categoria_id || null, precio_compra || 0, precio_venta || 0, sa, sm, unidad_medida || 'unidad', noControla, noVerifica, fechaVenc]);

    return this.getById(result.lastID);
  }

  static async update(id, productoData) {
    const { codigo, nombre, descripcion, categoria_id, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock, no_verifica_vencimiento } = productoData;
    const noControla = esFlagActivo(no_controla_stock);
    const noVerifica = esFlagActivo(no_verifica_vencimiento);
    const fechaVenc = resolverFechaVencimiento(productoData, noControla, noVerifica);
    
    // Validar que el producto existe
    const productoExistente = await this.getById(id);
    if (!productoExistente) {
      throw new Error('Producto no encontrado');
    }

    // Validar nombre requerido
    if (!nombre || nombre.trim() === '') {
      throw new Error('El nombre del producto es requerido');
    }

    // Validar código único si se proporciona y es diferente al actual
    if (codigo && codigo !== productoExistente.codigo) {
      const existente = await this.getByCodigo(codigo);
      if (existente) {
        throw new Error('Ya existe un producto con este código');
      }
    }

    // Validar precios no negativos
    if (precio_compra < 0 || precio_venta < 0) {
      throw new Error('Los precios no pueden ser negativos');
    }

    const sa = noControla ? 0 : Number(stock_actual);
    const sm = noControla ? 0 : Number(stock_minimo);
    if (Number.isNaN(sa) || Number.isNaN(sm) || sa < 0 || sm < 0) {
      throw new Error('El stock no puede ser negativo');
    }

    await db.run(`
      UPDATE productos
      SET codigo = ?, nombre = ?, descripcion = ?, categoria_id = ?, 
          precio_compra = ?, precio_venta = ?, stock_actual = ?, 
          stock_minimo = ?, unidad_medida = ?, no_controla_stock = ?,
          no_verifica_vencimiento = ?, fecha_vencimiento = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [codigo || null, nombre.trim(), descripcion?.trim() || null, categoria_id || null, precio_compra || 0, precio_venta || 0, sa, sm, unidad_medida || 'unidad', noControla, noVerifica, fechaVenc, id]);

    return this.getById(id);
  }

  static async delete(id) {
    await db.run('DELETE FROM productos WHERE id = ?', [id]);
    return { success: true };
  }

  static async updateCategoria(id, categoriaId) {
    const existente = await this.getById(id);
    if (!existente) {
      throw new Error('Producto no encontrado');
    }
    let cat = categoriaId == null || categoriaId === '' ? null : Number(categoriaId);
    if (cat != null && !Number.isFinite(cat)) {
      throw new Error('Categoría inválida');
    }
    if (cat != null) {
      const row = await db.get('SELECT id FROM categorias WHERE id = ?', [cat]);
      if (!row) throw new Error('Categoría no encontrada');
    }
    await db.run(
      `
      UPDATE productos
      SET categoria_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
      [cat, id]
    );
    return this.getById(id);
  }

  static async asignarCategoria(ids, categoriaId) {
    const list = [...new Set((ids || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
    if (!list.length) return { actualizados: 0 };
    const placeholders = list.map(() => '?').join(',');
    const result = await db.run(
      `
      UPDATE productos
      SET categoria_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `,
      [categoriaId, ...list]
    );
    return { actualizados: result.changes || 0 };
  }

  static async updateStock(id, cantidad) {
    await db.run(`
      UPDATE productos
      SET stock_actual = stock_actual + ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [cantidad, id]);
    return this.getById(id);
  }

  static async getLowStock() {
    const productos = await db.all(`
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE ${this.condicionStockBajo('p')}
      ORDER BY p.stock_actual ASC
    `);
    return productos;
  }

  /** Productos con stock que vencen en 7 días o ya vencieron. */
  static async getProximosVencer() {
    const hoy = fechaLocalISO();
    const hasta = addDaysISO(hoy, DIAS_ALERTA_VENCIMIENTO);
    const rows = await db.all(
      `
      SELECT p.*, c.nombre as categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      WHERE COALESCE(p.no_controla_stock, FALSE) = FALSE
        AND COALESCE(p.no_verifica_vencimiento, FALSE) = FALSE
        AND p.fecha_vencimiento IS NOT NULL
        AND p.fecha_vencimiento::date <= ?::date
        AND COALESCE(p.stock_actual, 0) > 0
      ORDER BY p.fecha_vencimiento ASC, p.nombre ASC
    `,
      [hasta]
    );
    return (rows || []).map((p) => {
      const fecha = normalizarFechaISO(p.fecha_vencimiento);
      const dias = fecha ? diasHasta(hoy, fecha) : null;
      return {
        ...p,
        fecha_vencimiento: fecha,
        dias,
        vencido: dias != null && dias < 0,
        vence_hoy: dias === 0
      };
    });
  }
}
