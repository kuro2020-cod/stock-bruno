import db from '../database/db.js';
import bcrypt from 'bcryptjs';
import { esRolSuper, normalizeRol, rolAsignable } from '../utils/roles.js';

const SALT_ROUNDS = 10;

function asBool(v, def = true) {
  if (v === undefined || v === null) return def;
  if (v === true || v === 1 || v === '1' || v === 't' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'f' || v === 'false') return false;
  return def;
}

export class Usuario {
  static async getAll() {
    // No pedir created_at: tablas creadas a mano a veces no tienen esa columna y la query fallaba en silencio en el front
    return db.all(`
      SELECT id, nombre, apellido, dni, usuario, rol, acceso_externo
      FROM usuario
      ORDER BY apellido, nombre
    `);
  }

  static async getById(id) {
    return db.get(
      `
      SELECT id, nombre, apellido, dni, usuario, rol, acceso_externo
      FROM usuario WHERE id = ?
    `,
      [id]
    );
  }

  static async permiteAccesoExterno(id) {
    const row = await db.get(`SELECT acceso_externo FROM usuario WHERE id = ?`, [id]);
    if (!row) return false;
    return asBool(row.acceso_externo, true);
  }

  /**
   * Login: valida clave (bcrypt o texto plano heredado) y devuelve datos públicos sin la clave.
   */
  static async autenticar(usuario, clavePlano) {
    const row = await db.get(
      `SELECT id, nombre, apellido, dni, usuario, rol, clave, acceso_externo FROM usuario WHERE LOWER(usuario) = LOWER(?)`,
      [String(usuario).trim()]
    );
    if (!row) return null;
    const plain = String(clavePlano);
    let ok = false;
    try {
      ok = await bcrypt.compare(plain, row.clave);
    } catch {
      ok = false;
    }
    if (!ok && row.clave === plain) {
      ok = true;
    }
    if (!ok) return null;
    return {
      id: row.id,
      nombre: row.nombre,
      apellido: row.apellido,
      dni: row.dni,
      usuario: row.usuario,
      rol: normalizeRol(row.rol),
      accesoExternoPermitido: asBool(row.acceso_externo, true)
    };
  }

  static async create(data) {
    const { nombre, apellido, dni, usuario, clave, rol, acceso_externo } = data;

    if (!nombre?.trim()) throw new Error('El nombre es requerido');
    if (!apellido?.trim()) throw new Error('El apellido es requerido');
    if (!dni?.trim()) throw new Error('El DNI es requerido');
    if (!usuario?.trim()) throw new Error('El usuario es requerido');
    if (!clave || String(clave).trim() === '') {
      throw new Error('La clave es requerida');
    }

    const usuarioNorm = usuario.trim().toLowerCase();
    const dniNorm = dni.trim();

    const dupUsuario = await db.get(
      'SELECT id FROM usuario WHERE LOWER(usuario) = LOWER(?)',
      [usuarioNorm]
    );
    if (dupUsuario) throw new Error('Ya existe un usuario con ese nombre de usuario');

    const dupDni = await db.get('SELECT id FROM usuario WHERE dni = ?', [dniNorm]);
    if (dupDni) throw new Error('Ya existe un usuario con ese DNI');

    const hash = await bcrypt.hash(String(clave).trim(), SALT_ROUNDS);
    const accesoExterno = asBool(acceso_externo, true);
    const result = await db.run(
      `INSERT INTO usuario (nombre, apellido, dni, usuario, clave, rol, acceso_externo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        nombre.trim(),
        apellido.trim(),
        dniNorm,
        usuarioNorm,
        hash,
        rolAsignable(rol),
        accesoExterno
      ]
    );
    return this.getById(result.lastID);
  }

  static async update(id, data, actor = null) {
    const existente = await db.get('SELECT * FROM usuario WHERE id = ?', [id]);
    if (!existente) {
      throw new Error('Usuario no encontrado');
    }

    if (esRolSuper(existente.rol) && !esRolSuper(actor?.rol)) {
      throw new Error('No se puede modificar este usuario');
    }

    const nombre = data.nombre?.trim() ?? existente.nombre;
    const apellido = data.apellido?.trim() ?? existente.apellido;
    const dni = data.dni?.trim() ?? existente.dni;
    const usuario = (data.usuario?.trim() ?? existente.usuario).toLowerCase();
    const rol = rolAsignable(data.rol ?? existente.rol, {
      actorRol: actor?.rol,
      rolActual: existente.rol
    });
    const accesoExterno = asBool(
      data.acceso_externo ?? data.accesoExterno ?? existente.acceso_externo,
      true
    );

    if (!nombre) throw new Error('El nombre es requerido');
    if (!apellido) throw new Error('El apellido es requerido');
    if (!dni) throw new Error('El DNI es requerido');
    if (!usuario) throw new Error('El usuario es requerido');

    if (usuario !== existente.usuario.toLowerCase()) {
      const dup = await db.get(
        'SELECT id FROM usuario WHERE LOWER(usuario) = LOWER(?) AND id != ?',
        [usuario, id]
      );
      if (dup) throw new Error('Ya existe otro usuario con ese nombre de usuario');
    }

    if (dni !== existente.dni) {
      const dupDni = await db.get('SELECT id FROM usuario WHERE dni = ? AND id != ?', [
        dni,
        id
      ]);
      if (dupDni) throw new Error('Ya existe otro usuario con ese DNI');
    }

    const nuevaClave = data.clave != null && String(data.clave).trim() !== '';

    if (nuevaClave) {
      const hash = await bcrypt.hash(String(data.clave).trim(), SALT_ROUNDS);
      await db.run(
        `UPDATE usuario SET nombre = ?, apellido = ?, dni = ?, usuario = ?, clave = ?, rol = ?, acceso_externo = ? WHERE id = ?`,
        [nombre, apellido, dni, usuario, hash, rol, accesoExterno, id]
      );
    } else {
      await db.run(
        `UPDATE usuario SET nombre = ?, apellido = ?, dni = ?, usuario = ?, rol = ?, acceso_externo = ? WHERE id = ?`,
        [nombre, apellido, dni, usuario, rol, accesoExterno, id]
      );
    }

    return this.getById(id);
  }

  static async delete(id, actor = null) {
    const existente = await db.get('SELECT rol FROM usuario WHERE id = ?', [id]);
    if (!existente) {
      throw new Error('Usuario no encontrado');
    }
    if (esRolSuper(existente.rol) && !esRolSuper(actor?.rol)) {
      throw new Error('No se puede eliminar este usuario');
    }
    await db.run('DELETE FROM usuario WHERE id = ?', [id]);
    return { success: true };
  }
}
