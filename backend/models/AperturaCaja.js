import db from '../database/db.js';
import { fechaLocalISO, normalizarFechaISO } from '../utils/fechaCaja.js';
import { esUsuarioVendedor } from '../utils/usuarioAliases.js';
import { esRolAdmin } from '../utils/roles.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

function mapRow(row) {
  if (!row) return null;
  return {
    ...row,
    fecha_caja: normalizarFechaISO(row.fecha_caja) || row.fecha_caja,
    monto_apertura: round2(row.monto_apertura),
    fondo_siguiente:
      row.fondo_siguiente == null || row.fondo_siguiente === ''
        ? null
        : round2(row.fondo_siguiente),
    abierta: Boolean(row.abierta)
  };
}

function usuarioIdParaCaja(authUser) {
  if (!authUser?.id || !esUsuarioVendedor(authUser)) return null;
  return authUser.id;
}

export class AperturaCaja {
  /**
   * Apertura abierta. Si `usuarioId` está definido, solo la de ese vendedor.
   * Sin `usuarioId` (ADMIN): la última apertura global abierta.
   */
  static async getAbierta(usuarioId = undefined) {
    if (usuarioId != null) {
      const row = await db.get(
        `
        SELECT *
        FROM aperturas_caja
        WHERE abierta = TRUE AND usuario_id = ?
        ORDER BY id DESC
        LIMIT 1
      `,
        [usuarioId]
      );
      return mapRow(row);
    }

    const row = await db.get(
      `
      SELECT *
      FROM aperturas_caja
      WHERE abierta = TRUE
      ORDER BY id DESC
      LIMIT 1
    `
    );
    return mapRow(row);
  }

  /** Último fondo dejado para el siguiente turno (apertura ya cerrada). */
  static async getFondoSugerido() {
    const row = await db.get(
      `
      SELECT fondo_siguiente
      FROM aperturas_caja
      WHERE abierta = FALSE
        AND fondo_siguiente IS NOT NULL
      ORDER BY COALESCE(cerrado_at, created_at) DESC, id DESC
      LIMIT 1
    `
    );
    if (!row || row.fondo_siguiente == null) return null;
    return round2(row.fondo_siguiente);
  }

  static async getEstado(authUser = null) {
    const uid = usuarioIdParaCaja(authUser);
    const apertura = uid != null ? await this.getAbierta(uid) : await this.getAbierta();
    const sugerido = apertura ? null : await this.getFondoSugerido();
    return {
      necesitaApertura: !apertura,
      apertura,
      sugerido
    };
  }

  static async abrir({ monto, authUser }) {
    if (!authUser?.id) {
      throw new Error('Usuario no identificado');
    }

    const esAdmin = esRolAdmin(authUser.rol);
    const uid = usuarioIdParaCaja(authUser);
    let m = round2(monto);

    // USER: siempre abre con el fondo dejado por el turno anterior (no puede alterar el monto).
    if (!esAdmin) {
      const sugerido = await this.getFondoSugerido();
      m = sugerido != null && Number.isFinite(sugerido) && sugerido >= 0 ? sugerido : 0;
    }

    if (!Number.isFinite(m) || m < 0) {
      throw new Error('Indicá un monto válido para el inicio de caja (≥ 0)');
    }

    const existente = uid != null ? await this.getAbierta(uid) : await this.getAbierta();
    if (existente) {
      return { yaAbierta: true, apertura: existente };
    }

    const fecha = fechaLocalISO();
    const ins = await db.run(
      `
      INSERT INTO aperturas_caja
        (monto_apertura, usuario_id, registrado_por, abierta, fecha_caja)
      VALUES (?, ?, ?, TRUE, ?::date)
    `,
      [m, authUser.id, etiquetaUsuario(authUser), fecha]
    );

    const apertura = await db.get(`SELECT * FROM aperturas_caja WHERE id = ?`, [ins.lastID]);
    return { yaAbierta: false, apertura: mapRow(apertura) };
  }

  /**
   * Cierra la apertura abierta del usuario (o la global para ADMIN) y deja el fondo para el próximo turno.
   */
  static async cerrarTurno({ fondo_siguiente, cierre_id, authUser }) {
    const uid = usuarioIdParaCaja(authUser);
    const abierta = uid != null ? await this.getAbierta(uid) : await this.getAbierta();
    if (!abierta) {
      throw new Error('No hay un inicio de caja registrado. Entrá a Ventas y cargá el monto de INICIO DE CAJA.');
    }

    const fondo = round2(fondo_siguiente);
    if (!Number.isFinite(fondo) || fondo < 0) {
      throw new Error('Indicá el monto a dejar en caja para el siguiente turno (≥ 0)');
    }

    await db.run(
      `
      UPDATE aperturas_caja
      SET abierta = FALSE,
          fondo_siguiente = ?,
          cierre_id = ?,
          cerrado_at = CURRENT_TIMESTAMP
      WHERE id = ?
        AND abierta = TRUE
    `,
      [fondo, cierre_id ?? null, abierta.id]
    );

    return {
      aperturaId: abierta.id,
      monto_apertura: abierta.monto_apertura,
      fondo_siguiente: fondo,
      cerrado_por: etiquetaUsuario(authUser)
    };
  }
}
