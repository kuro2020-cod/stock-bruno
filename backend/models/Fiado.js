import db from '../database/db.js';
import { resolverMetodoPago } from '../utils/metodosPago.js';
import {
  enriquecerFiados,
  sincronizarMontoFiadoPendiente
} from '../services/recalcularFiado.js';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Medios con los que se puede cobrar un fiado (no se vuelve a fiar). */
export const METODOS_COBRO_FIADO = ['efectivo', 'transferencia', 'tarjeta'];

/** En pago parcial se permite dejar el resto como FIADO. */
export const METODOS_PAGO_PARCIAL_FIADO = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];

function etiquetaUsuario(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

function mapRow(row) {
  if (!row) return null;
  let movimientoIds = row.movimiento_ids;
  if (typeof movimientoIds === 'string') {
    try {
      movimientoIds = JSON.parse(movimientoIds);
    } catch {
      movimientoIds = null;
    }
  }
  let pagosCobro = row.pagos_desglose_cobro;
  if (typeof pagosCobro === 'string') {
    try {
      pagosCobro = JSON.parse(pagosCobro);
    } catch {
      pagosCobro = null;
    }
  }
  return {
    ...row,
    monto: round2(row.monto),
    movimiento_ids: Array.isArray(movimientoIds) ? movimientoIds : movimientoIds,
    pagos_desglose_cobro: pagosCobro,
    aviso_carrito_at: row.aviso_carrito_at || null,
    aviso_carrito_por: row.aviso_carrito_por || null,
    aviso_carrito_texto: row.aviso_carrito_texto || null
  };
}

function resolverPagoCobro(montoTotal, { metodo_pago, pagos }) {
  const tienePagos = Array.isArray(pagos) && pagos.length > 0;
  const tieneMetodo = Boolean(String(metodo_pago || '').trim());
  if (!tienePagos && !tieneMetodo) {
    throw new Error('Indicá el método de pago del cobro');
  }
  return resolverMetodoPago({
    pagos,
    metodo_pago,
    montoTotal,
    metodosPermitidos: METODOS_COBRO_FIADO
  });
}

/** Unifica mayúsculas/espacios: si ya existe el cliente, reutiliza el nombre guardado. */
export async function resolverNombreClienteFiado(nombreRaw, runner = db) {
  const nombre = String(nombreRaw || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!nombre) return '';
  const existente = await runner.get(
    `
    SELECT cliente_nombre
    FROM fiados
    WHERE LOWER(TRIM(cliente_nombre)) = LOWER(TRIM(?))
    ORDER BY id ASC
    LIMIT 1
  `,
    [nombre]
  );
  return existente?.cliente_nombre || nombre;
}

export class Fiado {
  /** Aviso en el fiado cuando se quitó del carrito sin cobrar. */
  static async registrarAvisoDescarteCarrito(fiadoIds, authUser, runner = db) {
    const ids = [
      ...new Set((Array.isArray(fiadoIds) ? fiadoIds : []).map(Number).filter((id) => Number.isFinite(id)))
    ];
    if (!ids.length) return;

    const por = etiquetaUsuario(authUser);
    const texto = `Eliminado del carrito sin cobrar por ${por}`;

    for (const id of ids) {
      await runner.run(
        `
        UPDATE fiados
        SET aviso_carrito_at = CURRENT_TIMESTAMP,
            aviso_carrito_por = ?,
            aviso_carrito_texto = ?
        WHERE id = ? AND estado = 'pendiente'
      `,
        [por, texto, id]
      );
    }
  }

  static async limpiarAvisoCarrito(fiadoIds, runner = db) {
    const ids = [
      ...new Set((Array.isArray(fiadoIds) ? fiadoIds : []).map(Number).filter((id) => Number.isFinite(id)))
    ];
    if (!ids.length) return;

    const placeholders = ids.map(() => '?').join(', ');
    await runner.run(
      `
      UPDATE fiados
      SET aviso_carrito_at = NULL,
          aviso_carrito_por = NULL,
          aviso_carrito_texto = NULL
      WHERE id IN (${placeholders}) AND estado = 'pendiente'
    `,
      ids
    );
  }

  static async crear(
    { cliente_nombre, monto, detalle, movimiento_ids, authUser },
    runner = db
  ) {
    const nombre = await resolverNombreClienteFiado(cliente_nombre, runner);
    if (!nombre) {
      throw new Error('Indique el nombre de la persona del fiado');
    }
    const m = round2(monto);
    if (!Number.isFinite(m) || m <= 0) {
      throw new Error('El monto del fiado debe ser mayor a 0');
    }

    const registradoPor = etiquetaUsuario(authUser);
    const idsJson =
      Array.isArray(movimiento_ids) && movimiento_ids.length
        ? JSON.stringify(movimiento_ids.map(Number).filter((x) => Number.isFinite(x)))
        : null;

    const ins = await runner.run(
      `
      INSERT INTO fiados
        (cliente_nombre, monto, estado, detalle, registrado_por, usuario_id, movimiento_ids)
      VALUES (?, ?, 'pendiente', ?, ?, ?, CAST(? AS JSONB))
    `,
      [
        nombre,
        m,
        detalle ? String(detalle).trim() : null,
        registradoPor,
        authUser?.id ?? null,
        idsJson
      ]
    );
    return this.getById(ins.lastID);
  }

  static async getById(id) {
    const row = await db.get(`SELECT * FROM fiados WHERE id = ?`, [id]);
    const mapped = mapRow(row);
    if (!mapped) return null;
    const [enriquecido] = await enriquecerFiados([mapped]);
    return enriquecido || mapped;
  }

  static async listarPendientesEnriquecidos({ q = null, limit = 500 } = {}) {
    const rows = await this.listar({ estado: 'pendiente', limit, q });
    return enriquecerFiados(rows);
  }

  static _agruparPorCliente(rows) {
    const map = new Map();
    for (const row of rows) {
      const key = String(row.cliente_nombre || '')
        .trim()
        .toLowerCase();
      if (!key) continue;
      if (!map.has(key)) {
        map.set(key, {
          cliente_nombre: row.cliente_nombre,
          total_debe: 0,
          compras_pendientes: 0,
          ultima_compra: row.fecha
        });
      }
      const agg = map.get(key);
      agg.total_debe = round2(agg.total_debe + Number(row.monto || 0));
      agg.compras_pendientes += 1;
      if (row.fecha && (!agg.ultima_compra || new Date(row.fecha) > new Date(agg.ultima_compra))) {
        agg.ultima_compra = row.fecha;
      }
    }
    return [...map.values()].sort((a, b) =>
      String(a.cliente_nombre || '').localeCompare(String(b.cliente_nombre || ''), 'es', {
        sensitivity: 'base'
      })
    );
  }

  static async listarClientes({ q = null, limit = 80 } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 80, 1), 200);
    const rows = await this.listarPendientesEnriquecidos({ q, limit: lim * 20 });
    const agrupados = this._agruparPorCliente(rows).slice(0, lim);
    return agrupados.map((r) => ({
      cliente_nombre: r.cliente_nombre,
      total_debe: round2(r.total_debe),
      compras_pendientes: Number(r.compras_pendientes || 0),
      ultima_compra: r.ultima_compra
    }));
  }

  static async listar({ estado = null, limit = 200, offset = 0, q = null } = {}) {
    const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const off = Math.max(Number(offset) || 0, 0);
    const params = [];
    const where = [];

    if (estado === 'pendiente' || estado === 'cobrado') {
      where.push('estado = ?');
      params.push(estado);
    }
    if (q && String(q).trim()) {
      where.push('LOWER(cliente_nombre) LIKE ?');
      params.push(`%${String(q).trim().toLowerCase()}%`);
    }

    const sqlWhere = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(lim, off);

    const rows = await db.all(
      `
      SELECT * FROM fiados
      ${sqlWhere}
      ORDER BY fecha DESC, id DESC
      LIMIT ? OFFSET ?
    `,
      params
    );
    const mapped = rows.map(mapRow);
    return enriquecerFiados(mapped);
  }

  static async resumenPorCliente({ soloPendientes = true } = {}) {
    if (!soloPendientes) {
      const rows = await db.all(
        `
        SELECT
          MIN(cliente_nombre) AS cliente_nombre,
          COUNT(*)::int AS compras,
          COALESCE(SUM(monto), 0)::numeric AS total_debe,
          MAX(fecha) AS ultima_compra
        FROM fiados
        GROUP BY LOWER(TRIM(cliente_nombre))
        ORDER BY LOWER(MIN(cliente_nombre)) ASC
      `
      );
      return rows.map((r) => ({
        cliente_nombre: r.cliente_nombre,
        compras: Number(r.compras || 0),
        total_debe: round2(r.total_debe),
        ultima_compra: r.ultima_compra
      }));
    }

    const rows = await this.listarPendientesEnriquecidos({ limit: 500 });
    return this._agruparPorCliente(rows).map((r) => ({
      cliente_nombre: r.cliente_nombre,
      compras: Number(r.compras_pendientes || 0),
      total_debe: round2(r.total_debe),
      ultima_compra: r.ultima_compra
    }));
  }

  static async marcarCobrado(id, { metodo_pago, pagos, authUser } = {}) {
    return this.marcarCobradoPorIds([id], { metodo_pago, pagos, authUser });
  }

  static async marcarCobradoPorIds(ids, { metodo_pago, pagos, authUser } = {}, runner = db) {
    const idList = [...new Set((ids || []).map(Number).filter((n) => Number.isFinite(n)))];
    if (!idList.length) {
      return { changes: 0, total_cobrado: 0, metodo_cobro: null, pagos_desglose: null };
    }

    const placeholders = idList.map(() => '?').join(', ');
    const pendientesRaw = await runner.all(
      `
      SELECT *
      FROM fiados
      WHERE id IN (${placeholders})
        AND estado = 'pendiente'
      ORDER BY fecha ASC, id ASC
    `,
      idList
    );
    if (!pendientesRaw.length) {
      throw new Error('No hay fiados pendientes para cobrar');
    }

    const pendientesSync = [];
    for (const row of pendientesRaw.map(mapRow)) {
      const synced = await sincronizarMontoFiadoPendiente(row, runner);
      if (synced && synced.estado === 'pendiente') pendientesSync.push(synced);
    }
    if (!pendientesSync.length) {
      throw new Error('No hay fiados pendientes para cobrar');
    }

    const total = round2(pendientesSync.reduce((s, r) => s + Number(r.monto || 0), 0));
    const { metodoPago, desglose } = resolverPagoCobro(total, { metodo_pago, pagos });
    const cobradoPor = etiquetaUsuario(authUser);
    const desgloseJson = desglose ? JSON.stringify(desglose) : null;
    const idsSync = pendientesSync.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));
    const idPrimero = idsSync[0];

    for (const id of idsSync) {
      const esPrimero = id === idPrimero;
      await runner.run(
        `
        UPDATE fiados
        SET estado = 'cobrado',
            cobrado_at = CURRENT_TIMESTAMP,
            cobrado_por = ?,
            metodo_cobro = ?,
            pagos_desglose_cobro = CAST(? AS JSONB),
            aviso_carrito_at = NULL,
            aviso_carrito_por = NULL,
            aviso_carrito_texto = NULL
        WHERE id = ? AND estado = 'pendiente'
      `,
        [
          cobradoPor,
          metodoPago,
          metodoPago === 'mixto' ? (esPrimero ? desgloseJson : null) : desgloseJson,
          id
        ]
      );
    }

    return {
      changes: idsSync.length,
      total_cobrado: total,
      metodo_cobro: metodoPago,
      pagos_desglose: desglose
    };
  }

  static async _pendientesSyncPorIds(idList, runner = db) {
    const ids = [...new Set((idList || []).map(Number).filter((n) => Number.isFinite(n)))];
    if (!ids.length) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const pendientesRaw = await runner.all(
      `
      SELECT *
      FROM fiados
      WHERE id IN (${placeholders})
        AND estado = 'pendiente'
      ORDER BY fecha ASC, id ASC
    `,
      ids
    );
    if (!pendientesRaw.length) return [];

    const synced = [];
    for (const row of pendientesRaw.map(mapRow)) {
      const next = await sincronizarMontoFiadoPendiente(row, runner);
      if (next && next.estado === 'pendiente') synced.push(next);
    }
    return synced.map((r) => ({
      id: r.id,
      monto: round2(r.monto),
      fecha: r.fecha,
      cliente_nombre: r.cliente_nombre
    }));
  }

  static async _aplicarPagoParcialCola(pendientes, { cash, pagoReal, authUser }, runner = db) {
    const cobradoPor = etiquetaUsuario(authUser);
    const clienteLabel = pendientes[0]?.cliente_nombre;
    const clavesCash = Object.keys(cash).filter((k) => cash[k] > 0);
    const metodoCobroRegistro =
      clavesCash.length > 1 ? 'mixto' : clavesCash[0] || 'efectivo';
    const desgloseCash = clavesCash.length > 1 ? { ...cash } : null;
    const desgloseJson = desgloseCash ? JSON.stringify(desgloseCash) : null;

    let porAplicar = pagoReal;
    let totalCobrado = 0;
    let registrosCobrados = 0;
    let desgloseMixtoAsignado = false;

    for (const row of pendientes) {
      if (porAplicar < 0.01) break;
      const montoFiado = round2(row.monto);
      if (montoFiado <= 0) continue;

      const desgloseParaFila =
        metodoCobroRegistro === 'mixto' && !desgloseMixtoAsignado ? desgloseJson : null;

      if (montoFiado <= porAplicar + 0.05) {
        await runner.run(
          `
          UPDATE fiados
          SET estado = 'cobrado',
              cobrado_at = CURRENT_TIMESTAMP,
              cobrado_por = ?,
              metodo_cobro = ?,
              pagos_desglose_cobro = CAST(? AS JSONB),
              aviso_carrito_at = NULL,
              aviso_carrito_por = NULL,
              aviso_carrito_texto = NULL
          WHERE id = ? AND estado = 'pendiente'
        `,
          [cobradoPor, metodoCobroRegistro, desgloseParaFila, row.id]
        );
        if (desgloseParaFila) desgloseMixtoAsignado = true;
        porAplicar = round2(porAplicar - montoFiado);
        totalCobrado = round2(totalCobrado + montoFiado);
        registrosCobrados += 1;
      } else {
        const pagadoAqui = porAplicar;
        const nuevoPendiente = round2(montoFiado - pagadoAqui);
        await runner.run(
          `
          UPDATE fiados
          SET monto = ?
          WHERE id = ? AND estado = 'pendiente'
        `,
          [nuevoPendiente, row.id]
        );

        await runner.run(
          `
          INSERT INTO fiados
            (cliente_nombre, monto, estado, detalle, registrado_por, usuario_id,
             fecha, cobrado_at, cobrado_por, metodo_cobro, pagos_desglose_cobro)
          VALUES (?, ?, 'cobrado', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CAST(? AS JSONB))
        `,
          [
            clienteLabel,
            pagadoAqui,
            `Pago parcial (ref. #${row.id})`,
            cobradoPor,
            authUser?.id ?? null,
            row.fecha,
            cobradoPor,
            metodoCobroRegistro,
            desgloseParaFila
          ]
        );
        if (desgloseParaFila) desgloseMixtoAsignado = true;
        porAplicar = 0;
        totalCobrado = round2(totalCobrado + pagadoAqui);
        registrosCobrados += 1;
      }
    }

    if (porAplicar > 0.05) {
      throw new Error('No se pudo aplicar el pago a los fiados pendientes');
    }

    return {
      total_cobrado: totalCobrado,
      registros_cobrados: registrosCobrados,
      metodo_cobro: metodoCobroRegistro,
      pagos_desglose: desgloseCash,
      cliente_nombre: clienteLabel
    };
  }

  /**
   * Cobro total o parcial de fiados por id (desde Ventas).
   * Permite dejar resto en FIADO si el pago incluye ese medio.
   */
  static async aplicarPagoPorIds(ids, { metodo_pago, pagos, monto_total, authUser } = {}, runner = db) {
    const pendientes = await this._pendientesSyncPorIds(ids, runner);
    if (!pendientes.length) {
      throw new Error('No hay fiados pendientes para cobrar');
    }

    const totalDb = round2(pendientes.reduce((s, r) => s + Number(r.monto || 0), 0));
    const total =
      monto_total != null && Number.isFinite(Number(monto_total))
        ? round2(monto_total)
        : totalDb;
    const { metodoPago, desglose } = resolverMetodoPago({
      pagos,
      metodo_pago,
      montoTotal: total,
      metodosPermitidos: METODOS_PAGO_PARCIAL_FIADO
    });

    const cash = { efectivo: 0, transferencia: 0, tarjeta: 0 };
    let restoFiado = 0;

    if (metodoPago === 'mixto' && desglose) {
      for (const k of Object.keys(cash)) {
        cash[k] = round2(desglose[k] || 0);
      }
      restoFiado = round2(desglose.fiado || 0);
    } else if (metodoPago === 'fiado') {
      throw new Error(
        'Indicá cuánto se cobra ahora (efectivo, transferencia o tarjeta). El resto puede quedar en FIADO.'
      );
    } else if (cash[metodoPago] !== undefined) {
      return this.marcarCobradoPorIds(ids, { metodo_pago: metodoPago, authUser }, runner);
    } else {
      throw new Error('Indicá cómo se paga (efectivo / transferencia / tarjeta) y, si aplica, cuánto queda en FIADO');
    }

    const pagoReal = round2(cash.efectivo + cash.transferencia + cash.tarjeta);
    if (pagoReal < 0.01) {
      throw new Error('Indicá un importe cobrado mayor a 0');
    }
    if (Math.abs(round2(pagoReal + restoFiado) - total) > 0.05) {
      throw new Error(
        `La suma cobrado + fiado ($${(pagoReal + restoFiado).toFixed(2)}) debe coincidir con el total ($${total.toFixed(2)})`
      );
    }

    if (restoFiado < 0.01) {
      const pagosCash = Object.entries(cash)
        .filter(([, v]) => v > 0)
        .map(([metodo, monto]) => ({ metodo, monto }));
      return this.marcarCobradoPorIds(
        ids,
        {
          pagos: pagosCash.length >= 2 ? pagosCash : undefined,
          metodo_pago: pagosCash.length === 1 ? pagosCash[0].metodo : undefined,
          authUser
        },
        runner
      );
    }

    const parcial = await this._aplicarPagoParcialCola(
      pendientes,
      { cash, pagoReal, authUser },
      runner
    );

    const saldoRow = await runner.get(
      `
      SELECT COALESCE(SUM(monto), 0)::numeric AS total_debe
      FROM fiados
      WHERE id IN (${pendientes.map(() => '?').join(', ')})
        AND estado = 'pendiente'
    `,
      pendientes.map((r) => r.id)
    );

    return {
      ...parcial,
      resto_fiado: round2(Number(saldoRow?.total_debe || 0)),
      modo: 'parcial'
    };
  }

  static async marcarCobradoCliente(cliente_nombre, { metodo_pago, pagos, authUser } = {}) {
    const nombre = String(cliente_nombre || '').trim();
    if (!nombre) throw new Error('Nombre de cliente inválido');

    const pendientesRaw = await db.all(
      `
      SELECT *
      FROM fiados
      WHERE LOWER(TRIM(cliente_nombre)) = LOWER(TRIM(?))
        AND estado = 'pendiente'
      ORDER BY fecha ASC, id ASC
    `,
      [nombre]
    );
    const pendientesSync = [];
    for (const row of pendientesRaw.map(mapRow)) {
      const synced = await sincronizarMontoFiadoPendiente(row);
      if (synced && synced.estado === 'pendiente') pendientesSync.push(synced);
    }
    if (!pendientesSync.length) {
      throw new Error('No hay fiados pendientes para esta persona');
    }

    const total = round2(pendientesSync.reduce((s, r) => s + Number(r.monto || 0), 0));
    const { metodoPago, desglose } = resolverPagoCobro(total, { metodo_pago, pagos });
    const cobradoPor = etiquetaUsuario(authUser);
    const desgloseJson = desglose ? JSON.stringify(desglose) : null;
    const ids = pendientesSync.map((r) => Number(r.id)).filter((id) => Number.isFinite(id));
    const idPrimero = ids[0];

    // En cobro mixto el desglose total va solo en un registro para no duplicar en caja.
    await db.transaction(async (tx) => {
      for (const id of ids) {
        const esPrimero = id === idPrimero;
        await tx.run(
          `
          UPDATE fiados
          SET estado = 'cobrado',
              cobrado_at = CURRENT_TIMESTAMP,
              cobrado_por = ?,
              metodo_cobro = ?,
              pagos_desglose_cobro = CAST(? AS JSONB),
              aviso_carrito_at = NULL,
              aviso_carrito_por = NULL,
              aviso_carrito_texto = NULL
          WHERE id = ? AND estado = 'pendiente'
        `,
          [
            cobradoPor,
            metodoPago,
            metodoPago === 'mixto' ? (esPrimero ? desgloseJson : null) : desgloseJson,
            id
          ]
        );
      }
    });

    return {
      changes: ids.length,
      total_cobrado: total,
      metodo_cobro: metodoPago,
      pagos_desglose: desglose
    };
  }

  /**
   * Pagar fiado (total o parcial) en una sola operación.
   * - Sin monto en FIADO: cobra todo (efectivo / transferencia / tarjeta).
   * - Con monto en FIADO: cobra la parte indicada y deja el resto pendiente.
   */
  static async pagoParcial({ cliente_nombre, fiado_id, metodo_pago, pagos, authUser } = {}) {
    let pendientes = [];
    if (fiado_id != null && fiado_id !== '') {
      const unoRaw = await db.get(`SELECT * FROM fiados WHERE id = ?`, [fiado_id]);
      const uno = await sincronizarMontoFiadoPendiente(mapRow(unoRaw));
      if (!uno) throw new Error('Fiado no encontrado');
      if (uno.estado === 'cobrado') throw new Error('Este fiado ya fue cobrado');
      pendientes = [
        { id: uno.id, monto: uno.monto, fecha: uno.fecha, cliente_nombre: uno.cliente_nombre }
      ];
    } else {
      const nombre = String(cliente_nombre || '').trim();
      if (!nombre) throw new Error('Nombre de cliente inválido');
      const pendientesRaw = await db.all(
        `
        SELECT *
        FROM fiados
        WHERE LOWER(TRIM(cliente_nombre)) = LOWER(TRIM(?))
          AND estado = 'pendiente'
        ORDER BY fecha ASC, id ASC
      `,
        [nombre]
      );
      pendientes = [];
      for (const row of pendientesRaw.map(mapRow)) {
        const synced = await sincronizarMontoFiadoPendiente(row);
        if (synced && synced.estado === 'pendiente') {
          pendientes.push({
            id: synced.id,
            monto: synced.monto,
            fecha: synced.fecha,
            cliente_nombre: synced.cliente_nombre
          });
        }
      }
    }

    if (!pendientes.length) {
      throw new Error('No hay fiados pendientes para esta persona');
    }

    const total = round2(pendientes.reduce((s, r) => s + Number(r.monto || 0), 0));
    const { metodoPago, desglose } = resolverMetodoPago({
      pagos,
      metodo_pago,
      montoTotal: total,
      metodosPermitidos: METODOS_PAGO_PARCIAL_FIADO
    });

    const cash = { efectivo: 0, transferencia: 0, tarjeta: 0 };
    let restoFiado = 0;

    if (metodoPago === 'mixto' && desglose) {
      for (const k of Object.keys(cash)) {
        cash[k] = round2(desglose[k] || 0);
      }
      restoFiado = round2(desglose.fiado || 0);
    } else if (metodoPago === 'fiado') {
      throw new Error(
        'Indicá cuánto se cobra ahora (efectivo, transferencia o tarjeta). Si no paga nada, no hace falta registrar.'
      );
    } else if (cash[metodoPago] !== undefined) {
      // Un solo medio de cobro = paga el total.
      if (fiado_id != null && fiado_id !== '') {
        await this.marcarCobrado(fiado_id, { metodo_pago: metodoPago, authUser });
      } else {
        await this.marcarCobradoCliente(pendientes[0].cliente_nombre, {
          metodo_pago: metodoPago,
          authUser
        });
      }
      return {
        total_cobrado: total,
        resto_fiado: 0,
        metodo_cobro: metodoPago,
        pagos_desglose: null,
        registros_cobrados: pendientes.length,
        cliente_nombre: pendientes[0].cliente_nombre,
        modo: 'total'
      };
    } else {
      throw new Error('Indicá cómo se paga (efectivo / transferencia / tarjeta) y, si aplica, cuánto queda en FIADO');
    }

    const pagoReal = round2(cash.efectivo + cash.transferencia + cash.tarjeta);
    if (pagoReal < 0.01) {
      throw new Error('Indicá un importe cobrado mayor a 0');
    }
    if (Math.abs(round2(pagoReal + restoFiado) - total) > 0.05) {
      throw new Error(
        `La suma cobrado + fiado ($${(pagoReal + restoFiado).toFixed(2)}) debe coincidir con el total ($${total.toFixed(2)})`
      );
    }

    // Sin resto en fiado: cobro total (puede ser mixto efectivo+transf+tarjeta).
    if (restoFiado < 0.01) {
      const pagosCash = Object.entries(cash)
        .filter(([, v]) => v > 0)
        .map(([metodo, monto]) => ({ metodo, monto }));
      if (fiado_id != null && fiado_id !== '') {
        await this.marcarCobrado(fiado_id, { pagos: pagosCash, authUser });
      } else {
        await this.marcarCobradoCliente(pendientes[0].cliente_nombre, {
          pagos: pagosCash,
          authUser
        });
      }
      return {
        total_cobrado: total,
        resto_fiado: 0,
        metodo_cobro: pagosCash.length > 1 ? 'mixto' : pagosCash[0]?.metodo || 'efectivo',
        pagos_desglose: pagosCash.length > 1 ? { ...cash } : null,
        registros_cobrados: pendientes.length,
        cliente_nombre: pendientes[0].cliente_nombre,
        modo: 'total'
      };
    }

    const cobradoPor = etiquetaUsuario(authUser);
    const clienteLabel = pendientes[0].cliente_nombre;
    const clavesCash = Object.keys(cash).filter((k) => cash[k] > 0);
    const metodoCobroRegistro =
      clavesCash.length > 1 ? 'mixto' : clavesCash[0] || 'efectivo';
    const desgloseCash = clavesCash.length > 1 ? { ...cash } : null;
    const desgloseJson = desgloseCash ? JSON.stringify(desgloseCash) : null;

    let porAplicar = pagoReal;
    let totalCobrado = 0;
    let registrosCobrados = 0;
    let desgloseMixtoAsignado = false;

    await db.transaction(async (tx) => {
      for (const row of pendientes) {
        if (porAplicar < 0.01) break;
        const montoFiado = round2(row.monto);
        if (montoFiado <= 0) continue;

        const desgloseParaFila =
          metodoCobroRegistro === 'mixto' && !desgloseMixtoAsignado ? desgloseJson : null;

        if (montoFiado <= porAplicar + 0.05) {
          await tx.run(
            `
            UPDATE fiados
            SET estado = 'cobrado',
                cobrado_at = CURRENT_TIMESTAMP,
                cobrado_por = ?,
                metodo_cobro = ?,
                pagos_desglose_cobro = CAST(? AS JSONB),
                aviso_carrito_at = NULL,
                aviso_carrito_por = NULL,
                aviso_carrito_texto = NULL
            WHERE id = ? AND estado = 'pendiente'
          `,
            [cobradoPor, metodoCobroRegistro, desgloseParaFila, row.id]
          );
          if (desgloseParaFila) desgloseMixtoAsignado = true;
          porAplicar = round2(porAplicar - montoFiado);
          totalCobrado = round2(totalCobrado + montoFiado);
          registrosCobrados += 1;
        } else {
          const pagadoAqui = porAplicar;
          const nuevoPendiente = round2(montoFiado - pagadoAqui);
          await tx.run(
            `
            UPDATE fiados
            SET monto = ?
            WHERE id = ? AND estado = 'pendiente'
          `,
            [nuevoPendiente, row.id]
          );

          await tx.run(
            `
            INSERT INTO fiados
              (cliente_nombre, monto, estado, detalle, registrado_por, usuario_id,
               fecha, cobrado_at, cobrado_por, metodo_cobro, pagos_desglose_cobro)
            VALUES (?, ?, 'cobrado', ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?, CAST(? AS JSONB))
          `,
            [
              clienteLabel,
              pagadoAqui,
              `Pago parcial (ref. #${row.id})`,
              cobradoPor,
              authUser?.id ?? null,
              row.fecha,
              cobradoPor,
              metodoCobroRegistro,
              desgloseParaFila
            ]
          );
          if (desgloseParaFila) desgloseMixtoAsignado = true;
          porAplicar = 0;
          totalCobrado = round2(totalCobrado + pagadoAqui);
          registrosCobrados += 1;
        }
      }

      if (porAplicar > 0.05) {
        throw new Error('No se pudo aplicar el pago a los fiados pendientes');
      }
    });

    const saldoRow = await db.get(
      `
      SELECT COALESCE(SUM(monto), 0)::numeric AS total_debe
      FROM fiados
      WHERE LOWER(TRIM(cliente_nombre)) = LOWER(TRIM(?))
        AND estado = 'pendiente'
    `,
      [clienteLabel]
    );

    return {
      total_cobrado: totalCobrado,
      resto_fiado: round2(Number(saldoRow?.total_debe || 0)),
      metodo_cobro: metodoCobroRegistro,
      pagos_desglose: desgloseCash || (clavesCash.length === 1 ? { [clavesCash[0]]: pagoReal } : null),
      registros_cobrados: registrosCobrados,
      cliente_nombre: clienteLabel,
      modo: 'parcial'
    };
  }
}
