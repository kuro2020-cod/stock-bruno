import db from '../database/db.js';

export class Categoria {
  static async getAll() {
    const categorias = await db.all(`
      SELECT c.*, COUNT(p.id) as total_productos
      FROM categorias c
      LEFT JOIN productos p ON c.id = p.categoria_id
      GROUP BY c.id
      ORDER BY c.nombre
    `);
    return categorias;
  }

  static async getById(id) {
    const categoria = await db.get('SELECT * FROM categorias WHERE id = ?', [id]);
    return categoria;
  }

  static async create(categoriaData) {
    const { nombre, descripcion } = categoriaData;
    
    // Validar nombre requerido
    if (!nombre || nombre.trim() === '') {
      throw new Error('El nombre de la categoría es requerido');
    }

    // Verificar si ya existe una categoría con el mismo nombre
    const existente = await db.get('SELECT * FROM categorias WHERE LOWER(nombre) = LOWER(?)', [nombre.trim()]);
    if (existente) {
      throw new Error('Ya existe una categoría con este nombre');
    }

    const result = await db.run(
      'INSERT INTO categorias (nombre, descripcion) VALUES (?, ?)',
      [nombre.trim(), descripcion?.trim() || null]
    );
    return this.getById(result.lastID);
  }

  static async update(id, categoriaData) {
    const { nombre, descripcion } = categoriaData;
    
    // Validar que la categoría existe
    const categoriaExistente = await this.getById(id);
    if (!categoriaExistente) {
      throw new Error('Categoría no encontrada');
    }

    // Validar nombre requerido
    if (!nombre || nombre.trim() === '') {
      throw new Error('El nombre de la categoría es requerido');
    }

    // Verificar si ya existe otra categoría con el mismo nombre
    if (nombre.trim().toLowerCase() !== categoriaExistente.nombre.toLowerCase()) {
      const existente = await db.get('SELECT * FROM categorias WHERE LOWER(nombre) = LOWER(?) AND id != ?', [nombre.trim(), id]);
      if (existente) {
        throw new Error('Ya existe una categoría con este nombre');
      }
    }

    await db.run(
      'UPDATE categorias SET nombre = ?, descripcion = ? WHERE id = ?',
      [nombre.trim(), descripcion?.trim() || null, id]
    );
    return this.getById(id);
  }

  static async delete(id) {
    await db.run('DELETE FROM categorias WHERE id = ?', [id]);
    return { success: true };
  }
}

