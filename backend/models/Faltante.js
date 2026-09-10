import db from '../database/db.js';

const TIPOS = ['faltante', 'pedido_inexistente', 'otro'];
const round4 = (n) => Math.round(Number(n) * 10000) / 10000;

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

export class Faltante {
  static tiposValidos() {
    return [...TIPOS];
  }

  static async getById(id) {
    return db.get(
      `
      SELECT f.*, p.nombre AS producto_catalogo, p.codigo AS producto_codigo,
             p.unidad_medida AS producto_unidad, p.stock_actual AS producto_stock,
             c.nombre AS categoria_nombre
      FROM faltantes f
      LEFT JOIN productos p ON p.id = f.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE f.id = ?
    `,
      [id]
    );
  }

  static async listar({
    desde = null,
    hasta = null,
    tipo = null,
    soloManual = false,
    limit = 500,
    offset = 0
  } = {}) {
    const lim = Math.min(2000, Math.max(1, Number(limit) || 500));
    const off = Math.max(0, Number(offset) || 0);
    const params = [];
    const conds = [];

    if (desde) {
      conds.push(`f.fecha >= ?::date`);
      params.push(desde);
    }
    if (hasta) {
      conds.push(`f.fecha < (?::date + interval '1 day')`);
      params.push(hasta);
    }
    if (tipo && TIPOS.includes(tipo)) {
      conds.push(`f.tipo = ?`);
      params.push(tipo);
    }
    if (soloManual) {
      conds.push(`f.producto_id IS NULL`);
    }

    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    params.push(lim, off);

    return db.all(
      `
      SELECT f.*, p.nombre AS producto_catalogo, p.codigo AS producto_codigo,
             p.unidad_medida AS producto_unidad, p.stock_actual AS producto_stock,
             c.nombre AS categoria_nombre
      FROM faltantes f
      LEFT JOIN productos p ON p.id = f.producto_id
      LEFT JOIN categorias c ON c.id = p.categoria_id
      ${where}
      ORDER BY COALESCE(c.nombre, 'Sin categoría') ASC,
               COALESCE(p.nombre, f.producto_texto) ASC,
               f.fecha DESC, f.id DESC
      LIMIT ? OFFSET ?
    `,
      params
    );
  }

  static async registrar({
    tipo,
    producto_texto,
    producto_id = null,
    cantidad = null,
    notas = null,
    authUser
  }) {
    const t = String(tipo || '')
      .trim()
      .toLowerCase();
    if (!TIPOS.includes(t)) {
      throw new Error('Tipo inválido. Use: faltante, pedido_inexistente u otro.');
    }

    const texto = String(producto_texto || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!texto) {
      throw new Error('Indique el producto o descripción del faltante.');
    }

    let cant = null;
    if (cantidad !== null && cantidad !== undefined && String(cantidad).trim() !== '') {
      cant = round4(cantidad);
      if (!Number.isFinite(cant) || cant <= 0) {
        throw new Error('La cantidad debe ser mayor a 0.');
      }
    }

    let pid = null;
    if (producto_id != null && producto_id !== '') {
      pid = Number(producto_id);
      if (!Number.isFinite(pid) || pid <= 0) pid = null;
      else {
        const existe = await db.get(`SELECT id FROM productos WHERE id = ?`, [pid]);
        if (!existe) pid = null;
      }
    }

    const notasTxt = notas != null && String(notas).trim() ? String(notas).trim() : null;
    const registradoPor = etiquetaUsuario(authUser);

    const ins = await db.run(
      `
      INSERT INTO faltantes
        (tipo, producto_texto, producto_id, cantidad, notas, registrado_por, usuario_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
      [t, texto.slice(0, 255), pid, cant, notasTxt, registradoPor, authUser?.id ?? null]
    );

    return this.getById(ins.lastID);
  }
}
