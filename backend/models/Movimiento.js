import db from '../database/db.js';
import { Producto } from './Producto.js';

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

export class Movimiento {
  static _etiquetaUsuario(authUser) {
    if (!authUser) return 'Sistema';
    const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
    return label || authUser.usuario || 'Sistema';
  }

  static async getAll(options = {}) {
    const limitRaw = options.limit != null ? Number(options.limit) : 50000;
    const offsetRaw = options.offset != null ? Number(options.offset) : 0;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50000, 1), 100000);
    const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);
    const movimientos = await db.all(
      `
      SELECT m.*, p.nombre as producto_nombre, p.codigo as producto_codigo
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      ORDER BY m.fecha DESC
      LIMIT ? OFFSET ?
    `,
      [limit, offset]
    );
    return movimientos;
  }

  static async getByProducto(productoId) {
    const movimientos = await db.all(`
      SELECT m.*, p.nombre as producto_nombre
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      WHERE m.producto_id = ?
      ORDER BY m.fecha DESC
    `, [productoId]);
    return movimientos;
  }

  static async getVentasByUsuario(authUser, options = {}) {
    const limitRaw = options.limit != null ? Number(options.limit) : 1000;
    const offsetRaw = options.offset != null ? Number(options.offset) : 0;
    const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 1000, 1), 10000);
    const offset = Math.max(Number.isFinite(offsetRaw) ? offsetRaw : 0, 0);

    const etiqueta = this._etiquetaUsuario(authUser);
    const usuarioLogin = String(authUser?.usuario || '').trim();
    const aliases = [etiqueta];
    if (usuarioLogin && !aliases.includes(usuarioLogin)) aliases.push(usuarioLogin);

    const movimientos = await db.all(
      `
      SELECT m.*, p.nombre as producto_nombre, p.codigo as producto_codigo, p.unidad_medida
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      WHERE m.tipo = 'salida'
        AND m.usuario = ANY(?::text[])
      ORDER BY m.fecha DESC
      LIMIT ? OFFSET ?
    `,
      [aliases, limit, offset]
    );
    return movimientos;
  }

  static async create(movimientoData) {
    const { producto_id, tipo, cantidad: cantRaw, motivo, usuario, precio_unitario, metodo_pago } = movimientoData;
    const cantidad = round4(cantRaw);

    // Validar que el producto existe
    const producto = await Producto.getById(producto_id);
    if (!producto) {
      throw new Error('Producto no encontrado');
    }

    if (Number.isNaN(cantidad) || cantidad <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }

    const sinStock = Producto.noControlaStock(producto);

    // Validar stock para salidas y bajas (excepto productos elaborados sin control)
    if (
      !sinStock &&
      (tipo === 'salida' || tipo === 'baja') &&
      Number(producto.stock_actual) + 1e-9 < cantidad
    ) {
      throw new Error(`Stock insuficiente. Stock actual: ${producto.stock_actual}, solicitado: ${cantidad}`);
    }

    if (tipo === 'baja') {
      const motivosValidos = [
        'VENCIMIENTO',
        'ROTURA',
        'ROBO',
        'DIFERENCIA DE STOCK EN BALANCE',
        'RETIRO DUEÑO'
      ];
      const motivoNorm = String(motivo || '')
        .trim()
        .toUpperCase();
      if (!motivosValidos.includes(motivoNorm)) {
        throw new Error(
          'Motivo de baja inválido. Use: VENCIMIENTO, ROTURA, ROBO o DIFERENCIA DE STOCK EN BALANCE'
        );
      }
    }

    let precioGuardado = null;
    if (tipo === 'salida') {
      const raw =
        precio_unitario !== undefined && precio_unitario !== null && precio_unitario !== ''
          ? Number(precio_unitario)
          : Number(producto.precio_venta);
      if (Number.isNaN(raw) || raw < 0) {
        throw new Error('El precio unitario de venta debe ser un número mayor o igual a 0');
      }
      precioGuardado = raw;
    }

    const metodosValidos = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];
    const metodoPagoNormalizado = metodosValidos.includes(String(metodo_pago || '').toLowerCase())
      ? String(metodo_pago).toLowerCase()
      : null;

    const motivoGuardado =
      tipo === 'baja'
        ? String(motivo).trim().toUpperCase()
        : motivo || null;

    // Crear movimiento (precio_unitario solo aplica a salidas / ventas)
    const result = await db.run(`
      INSERT INTO movimientos (producto_id, tipo, cantidad, motivo, usuario, precio_unitario, metodo_pago)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [producto_id, tipo, cantidad, motivoGuardado, usuario || 'Sistema', precioGuardado, metodoPagoNormalizado]);

    // Actualizar stock del producto (no aplica a elaborados sin control de stock)
    if (!sinStock) {
      let cantidadAjuste;
      if (tipo === 'entrada') {
        cantidadAjuste = cantidad;
      } else if (tipo === 'salida' || tipo === 'baja') {
        cantidadAjuste = -cantidad;
      } else {
        // ajuste: cantidad = stock final deseado
        cantidadAjuste = round4(cantidad - Number(producto.stock_actual));
      }
      await Producto.updateStock(producto_id, cantidadAjuste);
    }

    return this.getById(result.lastID);
  }

  static async getById(id) {
    const movimiento = await db.get(`
      SELECT m.*, p.nombre as producto_nombre, p.codigo as producto_codigo
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      WHERE m.id = ?
    `, [id]);
    return movimiento;
  }

  static async getStats() {
    const stats = await db.get(`
      SELECT 
        COUNT(*) as total_movimientos,
        SUM(CASE WHEN tipo = 'entrada' THEN cantidad ELSE 0 END) as total_entradas,
        SUM(CASE WHEN tipo = 'salida' THEN cantidad ELSE 0 END) as total_salidas
      FROM movimientos
      WHERE DATE(fecha) = CURRENT_DATE
    `);
    return stats;
  }

  /**
   * Condición SQL para filtrar movimientos por período (solo referencia a alias m).
   * dia = hoy | semana = semana calendario (lun–dom) | mes = mes calendario actual
   */
  static _condicionFecha(periodo) {
    switch (periodo) {
      case 'semana':
        return `m.fecha >= date_trunc('week', CURRENT_TIMESTAMP) AND m.fecha < date_trunc('week', CURRENT_TIMESTAMP) + interval '1 week'`;
      case 'mes':
        return `m.fecha >= date_trunc('month', CURRENT_TIMESTAMP) AND m.fecha < date_trunc('month', CURRENT_TIMESTAMP) + interval '1 month'`;
      case 'dia':
      default:
        return `DATE(m.fecha) = CURRENT_DATE`;
    }
  }

  /**
   * Ventas = salidas. Ingresos = suma(cantidad × precio en el movimiento);
   * si falta (datos viejos), se usa precio_venta actual del producto.
   */
  static _precioVentaLinea() {
    return `COALESCE(m.precio_unitario, p.precio_venta, 0)`;
  }

  /**
   * @param {string} periodo dia | semana | mes
   * @param {{ mes?: string }} options Si periodo es "mes", `mes` en formato YYYY-MM filtra ese mes calendario (histórico).
   */
  static async getVentasEstadisticas(periodo, options = {}) {
    const p = ['dia', 'semana', 'mes'].includes(periodo) ? periodo : 'dia';
    const mesRaw = options.mes;
    const mesValido =
      typeof mesRaw === 'string' && /^\d{4}-\d{2}$/.test(mesRaw.trim()) ? mesRaw.trim() : null;

    let cond;
    let params = [];
    if (p === 'mes' && mesValido) {
      const diaInicio = `${mesValido}-01`;
      cond = `m.fecha >= ?::date AND m.fecha < (?::date + interval '1 month')`;
      params = [diaInicio, diaInicio];
    } else {
      cond = this._condicionFecha(p);
    }

    const px = this._precioVentaLinea();

    const totales = await db.get(
      `
      SELECT
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades_vendidas,
        COALESCE(SUM(m.cantidad * (${px})), 0)::numeric AS ingresos_ventas
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      WHERE m.tipo = 'salida'
        AND (${cond})
    `,
      params
    );

    const top = await db.all(
      `
      SELECT
        p.id AS producto_id,
        p.nombre,
        p.codigo,
        SUM(m.cantidad)::numeric AS unidades_vendidas,
        SUM(m.cantidad * (${px}))::numeric AS ingresos_estimados
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      WHERE m.tipo = 'salida'
        AND (${cond})
      GROUP BY p.id, p.nombre, p.codigo
      ORDER BY unidades_vendidas DESC, p.nombre ASC
      LIMIT 20
    `,
      params
    );

    const ventasPorUsuario = await db.all(
      `
      SELECT
        u.id AS usuario_id,
        u.nombre,
        u.apellido,
        u.usuario AS login,
        u.rol,
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades_vendidas,
        COALESCE(SUM(m.cantidad * (${px})), 0)::numeric AS total_ventas
      FROM usuario u
      LEFT JOIN movimientos m ON m.tipo = 'salida'
        AND (
          LOWER(TRIM(m.usuario)) = LOWER(TRIM(CONCAT(u.apellido, ', ', u.nombre)))
          OR LOWER(TRIM(m.usuario)) = LOWER(TRIM(u.usuario))
        )
        AND (${cond})
      LEFT JOIN productos p ON m.producto_id = p.id
      GROUP BY u.id, u.nombre, u.apellido, u.usuario, u.rol
      ORDER BY total_ventas DESC, u.apellido ASC, u.nombre ASC
    `,
      params
    );

    const sinAsignar = await db.get(
      `
      SELECT
        COALESCE(SUM(m.cantidad), 0)::numeric AS unidades_vendidas,
        COALESCE(SUM(m.cantidad * (${px})), 0)::numeric AS total_ventas
      FROM movimientos m
      JOIN productos p ON m.producto_id = p.id
      WHERE m.tipo = 'salida'
        AND (${cond})
        AND NOT EXISTS (
          SELECT 1 FROM usuario u
          WHERE LOWER(TRIM(m.usuario)) = LOWER(TRIM(CONCAT(u.apellido, ', ', u.nombre)))
             OR LOWER(TRIM(m.usuario)) = LOWER(TRIM(u.usuario))
        )
    `,
      params
    );

    let etiqueta;
    if (p === 'mes' && mesValido) {
      const [y, m] = mesValido.split('-').map(Number);
      const d = new Date(y, m - 1, 1);
      etiqueta =
        d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, (c) => c.toUpperCase());
    } else {
      const etiquetas = {
        dia: 'Hoy',
        semana: 'Esta semana',
        mes: 'Este mes'
      };
      etiqueta = etiquetas[p];
    }

    return {
      periodo: p,
      mes: p === 'mes' ? mesValido || null : null,
      etiqueta,
      unidadesVendidas: Number(totales?.unidades_vendidas ?? 0),
      ingresosVentas: Number(totales?.ingresos_ventas ?? 0),
      topProductos: (top || []).map((row) => ({
        producto_id: row.producto_id,
        nombre: row.nombre,
        codigo: row.codigo,
        unidades_vendidas: Number(row.unidades_vendidas),
        ingresos_estimados: Number(row.ingresos_estimados)
      })),
      ventasPorUsuario: [
        ...(ventasPorUsuario || []).map((row) => ({
          usuario_id: row.usuario_id,
          nombre: row.nombre,
          apellido: row.apellido,
          login: row.login,
          rol: row.rol,
          unidades_vendidas: Number(row.unidades_vendidas),
          total_ventas: Number(row.total_ventas)
        })),
        ...(Number(sinAsignar?.total_ventas ?? 0) > 0 || Number(sinAsignar?.unidades_vendidas ?? 0) > 0
          ? [
              {
                usuario_id: null,
                nombre: 'Sin asignar',
                apellido: '',
                login: '—',
                rol: null,
                unidades_vendidas: Number(sinAsignar?.unidades_vendidas ?? 0),
                total_ventas: Number(sinAsignar?.total_ventas ?? 0)
              }
            ]
          : [])
      ]
    };
  }
}

