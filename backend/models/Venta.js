import db from '../database/db.js';
import { getContadorCafeMaquinaMes } from '../services/cafeMaquina.js';
import { Fiado } from './Fiado.js';
import crypto from 'crypto';

const round4 = (n) => Math.round(Number(n) * 10000) / 10000;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** Evita 733.33 × 3 = 2199.99 cuando la promo vale 2200. */
function cerrarCentavosGruposPromo(detalle) {
  const groups = new Map();
  for (const d of detalle || []) {
    if (d.es_cobro_fiado || !d.promo_id || d.promo_total == null) continue;
    const key = `${d.promo_id}|${d.promo_unidades || 1}|${d.promo_total}`;
    if (!groups.has(key)) groups.set(key, { target: round2(d.promo_total), lines: [] });
    groups.get(key).lines.push(d);
  }
  for (const { target, lines } of groups.values()) {
    const sum = round2(lines.reduce((s, d) => s + round2(d.subtotalLinea), 0));
    const diff = round2(target - sum);
    if (Math.abs(diff) < 0.001 || Math.abs(diff) > 0.05) continue;
    const last = lines[lines.length - 1];
    last.subtotalLinea = round2(last.subtotalLinea + diff);
    if (last.cantidad > 0) last.precio = round4(last.subtotalLinea / last.cantidad);
  }
}

const METODOS_VALIDOS = ['efectivo', 'transferencia', 'tarjeta', 'fiado'];

/** Café máquina: precio fijo de lista (sin descuentos manuales del carrito). */
function esProductoCafeMaquina(producto) {
  const n = String(producto?.nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!n) return false;
  return n.includes('cafe') && n.includes('maquin');
}

function etiquetaVendedor(authUser) {
  if (!authUser) return 'Sistema';
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  return label || authUser.usuario || 'Sistema';
}

/**
 * Une montos por método (varias líneas del mismo medio).
 */
function mergeMontosPorMetodo(pagosArr) {
  const acc = {};
  for (const raw of pagosArr || []) {
    const m = String(raw.metodo || '')
      .trim()
      .toLowerCase();
    if (!METODOS_VALIDOS.includes(m)) continue;
    const v = round2(raw.monto);
    if (Number.isNaN(v) || v <= 0) continue;
    acc[m] = round2((acc[m] || 0) + v);
  }
  return acc;
}

/**
 * Reparte cada medio de pago entre líneas proporcionalmente al subtotal de la línea.
 */
function allocarDesgloseLineas(lineTotals, montosPorMetodo) {
  const T = lineTotals.reduce((a, b) => a + b, 0);
  if (T <= 0) {
    throw new Error('Total inválido');
  }
  const metodos = Object.entries(montosPorMetodo).filter(([, g]) => g > 0.001);
  if (metodos.length === 0) {
    throw new Error('Sin montos de pago');
  }
  const n = lineTotals.length;
  const out = lineTotals.map(() => ({}));

  for (const [metodo, G] of metodos) {
    let assigned = 0;
    for (let i = 0; i < n; i++) {
      const isLast = i === n - 1;
      const parte = isLast ? round2(G - assigned) : round2((lineTotals[i] / T) * G);
      out[i][metodo] = parte;
      assigned = round2(assigned + parte);
    }
  }
  return out;
}

/** Si hay fiado, los otros medios son fijos y el fiado cubre el resto del total real. */
function ajustarFiadoComoResto(merged, totalRed) {
  if (!merged || merged.fiado == null) return merged;
  const otrosKeys = Object.keys(merged).filter((k) => k !== 'fiado');
  if (otrosKeys.length === 0) {
    return { fiado: totalRed };
  }
  const sumaOtros = round2(otrosKeys.reduce((s, k) => s + Number(merged[k] || 0), 0));
  if (sumaOtros > totalRed + 0.05) {
    throw new Error(
      `La suma de los medios ($${sumaOtros.toFixed(2)}) supera el total de la venta ($${totalRed.toFixed(2)})`
    );
  }
  const fiado = round2(Math.max(0, totalRed - sumaOtros));
  const next = {};
  for (const k of otrosKeys) next[k] = merged[k];
  if (fiado > 0.001) next.fiado = fiado;
  return next;
}

function pagosArrayDesdeMontos(montos) {
  return Object.entries(montos || {})
    .filter(([, v]) => round2(v) > 0.001)
    .map(([metodo, monto]) => ({ metodo, monto: round2(monto) }));
}

/** Reparte medios de pago entre cobro de fiado pendiente y venta nueva.
 * El efectivo/transferencia/tarjeta baja primero la deuda vieja; el resto queda en fiado. */
function repartirPagosCombinados(montosPorMetodo, totalCobroFiado, totalVentaNueva) {
  const cobro = round2(Math.max(0, totalCobroFiado));
  const venta = round2(Math.max(0, totalVentaNueva));
  if (cobro < 0.01) {
    return { pagosFiado: null, pagosVenta: { ...montosPorMetodo } };
  }
  if (venta < 0.01) {
    return { pagosFiado: { ...montosPorMetodo }, pagosVenta: null };
  }

  const cashOrder = ['efectivo', 'transferencia', 'tarjeta'];
  const pagosFiado = {};
  const pagosVenta = {};
  let cubiertoCobro = 0;

  for (const k of cashOrder) {
    let left = round2(montosPorMetodo?.[k] || 0);
    if (left <= 0) continue;
    const faltaCobro = round2(cobro - cubiertoCobro);
    if (faltaCobro > 0.001) {
      const take = round2(Math.min(left, faltaCobro));
      pagosFiado[k] = take;
      cubiertoCobro = round2(cubiertoCobro + take);
      left = round2(left - take);
    }
    if (left > 0.001) {
      pagosVenta[k] = round2((pagosVenta[k] || 0) + left);
    }
  }

  const restoCobro = round2(cobro - cubiertoCobro);
  if (restoCobro > 0.001) pagosFiado.fiado = restoCobro;

  const cashVenta = round2(cashOrder.reduce((s, k) => s + (pagosVenta[k] || 0), 0));
  const restoVenta = round2(venta - cashVenta);
  if (restoVenta > 0.001) pagosVenta.fiado = restoVenta;

  return {
    pagosFiado: Object.keys(pagosFiado).length ? pagosFiado : null,
    pagosVenta: Object.keys(pagosVenta).length ? pagosVenta : null
  };
}

/**
 * Registra una venta como varias salidas en una sola transacción.
 * Cantidades pueden ser decimales (ej. kg).
 * @param {object} [authUser] Usuario JWT: rol USER no puede fijar vendedor ni precio (usa datos de sesión y lista de precios).
 * @param {Array<{metodo:string,monto:number}>} [pagos] Varios medios; la suma debe coincidir con el total (±$0,05).
 */
export class Venta {
  static async registrar({ items, usuario, motivo, metodo_pago, pagos, cliente_fiado, authUser }) {
    if (!items || !Array.isArray(items) || items.length === 0) {
      throw new Error('La venta debe incluir al menos un producto');
    }

    const esRolUser = authUser?.rol === 'USER';
    const user = esRolUser
      ? etiquetaVendedor(authUser)
      : (usuario && String(usuario).trim()) || etiquetaVendedor(authUser) || 'Sistema';
    const mot = (motivo && String(motivo).trim()) || 'Venta registrada';

    const lineasPre = [];
    for (const raw of items) {
      const producto_id = Number(raw.producto_id);
      const cantidad = round4(raw.cantidad);
      if (!producto_id || Number.isNaN(cantidad) || cantidad <= 0) {
        throw new Error('Cada línea debe tener un producto válido y cantidad mayor a 0');
      }
      const promoUnidadesRaw =
        raw.promo_unidades != null && raw.promo_unidades !== ''
          ? Number(raw.promo_unidades)
          : null;
      const subtotalHint =
        raw.subtotal != null && raw.subtotal !== '' ? round2(raw.subtotal) : null;
      const promoTotalHint =
        raw.promo_total != null && raw.promo_total !== '' ? round2(raw.promo_total) : null;
      lineasPre.push({
        producto_id,
        cantidad,
        precio_unitario: raw.precio_unitario,
        subtotal_hint: subtotalHint != null && Number.isFinite(subtotalHint) ? subtotalHint : null,
        promo_id: raw.promo_id != null && raw.promo_id !== '' ? Number(raw.promo_id) : null,
        promo_nombre: raw.promo_nombre != null ? String(raw.promo_nombre).trim() : null,
        promo_unidades:
          promoUnidadesRaw != null && !Number.isNaN(promoUnidadesRaw) && promoUnidadesRaw > 0
            ? round4(promoUnidadesRaw)
            : null,
        promo_total:
          promoTotalHint != null && Number.isFinite(promoTotalHint) ? promoTotalHint : null,
        es_cobro_fiado: Boolean(raw.es_cobro_fiado),
        fiado_id:
          raw.fiado_id != null && raw.fiado_id !== '' ? Number(raw.fiado_id) : null
      });
    }

    const ventaGrupoId = crypto.randomUUID();

    const result = await db.transaction(async (tx) => {
      const detalle = [];
      let totalImporte = 0;
      const promoNombreCache = new Map();

      for (const line of lineasPre) {
        const esCobroFiado = Boolean(line.es_cobro_fiado);
        const producto = await tx.get(
          `
          SELECT * FROM productos
          WHERE id = ?
          FOR UPDATE
        `,
          [line.producto_id]
        );

        if (!producto) {
          throw new Error(`Producto no encontrado (id ${line.producto_id})`);
        }

        const sinStock = Boolean(producto.no_controla_stock);
        if (!esCobroFiado && !sinStock) {
          const disp = Number(producto.stock_actual);
          if (disp + 1e-9 < line.cantidad) {
            throw new Error(
              `Stock insuficiente para "${producto.nombre}". Disponible: ${disp}, solicitado: ${line.cantidad}`
            );
          }
        }

        const precioLista = Number(producto.precio_venta);
        const precioEnviado =
          line.precio_unitario !== undefined &&
          line.precio_unitario !== null &&
          line.precio_unitario !== '';

        let precio = precioEnviado ? Number(line.precio_unitario) : precioLista;

        const esEnvaseSistema =
          String(producto.codigo || '')
            .trim()
            .toUpperCase() === 'ENVASE' ||
          String(producto.nombre || '')
            .trim()
            .toUpperCase() === 'ENVASE';
        // Crédito por entrega de envase: precio negativo solo en producto ENVASE sin stock.
        const permiteCreditoEnvase = esEnvaseSistema && sinStock && precio < 0;

        if (Number.isNaN(precio) || (precio < 0 && !permiteCreditoEnvase)) {
          throw new Error(`Precio inválido para "${producto.nombre}"`);
        }

        // Café máquina: siempre precio de lista (salvo promo). Evita importes raros
        // por precio viejo/editado en el carrito (ej. 1129.41 en vez de 1200).
        const esCafeMaquina = esProductoCafeMaquina(producto);
        if (
          esCafeMaquina &&
          !line.promo_id &&
          !permiteCreditoEnvase &&
          !Number.isNaN(precioLista) &&
          precioLista > 0
        ) {
          precio = precioLista;
        }

        // USER sin promo: si el precio enviado supera lista (dato viejo del carrito), usar lista.
        if (
          !esCafeMaquina &&
          esRolUser &&
          !line.promo_id &&
          precioEnviado &&
          !Number.isNaN(precioLista) &&
          precioLista > 0 &&
          !permiteCreditoEnvase
        ) {
          if (precio > precioLista + 0.05) {
            precio = precioLista;
          }
        }

        let subtotalLinea = round2(line.cantidad * precio);
        if (
          line.subtotal_hint != null &&
          Math.abs(line.subtotal_hint - subtotalLinea) <= 0.05
        ) {
          subtotalLinea = line.subtotal_hint;
          if (line.cantidad > 0) precio = round4(subtotalLinea / line.cantidad);
        }
        totalImporte += subtotalLinea;

        let promoNombre = line.promo_nombre || null;
        if (line.promo_id && !promoNombre) {
          if (promoNombreCache.has(line.promo_id)) {
            promoNombre = promoNombreCache.get(line.promo_id);
          } else {
            const promoRow = await tx.get(`SELECT nombre FROM promociones WHERE id = ?`, [
              line.promo_id
            ]);
            promoNombre = promoRow?.nombre || null;
            promoNombreCache.set(line.promo_id, promoNombre);
          }
        }

        detalle.push({
          producto_id: line.producto_id,
          nombre: producto.nombre,
          cantidad: line.cantidad,
          precio,
          subtotalLinea,
          mot,
          user,
          no_controla_stock: sinStock,
          promo_id: line.promo_id,
          promo_nombre: promoNombre,
          promo_unidades: line.promo_unidades,
          promo_total: line.promo_total,
          es_cobro_fiado: esCobroFiado,
          fiado_id: line.fiado_id
        });
      }

      cerrarCentavosGruposPromo(detalle);

      const detalleVenta = detalle.filter((d) => !d.es_cobro_fiado);
      const detalleCobroFiado = detalle.filter((d) => d.es_cobro_fiado);
      let totalCobroFiado = round2(
        detalleCobroFiado.reduce((s, d) => s + d.subtotalLinea, 0)
      );
      const totalVentaNueva = round2(detalleVenta.reduce((s, d) => s + d.subtotalLinea, 0));
      const fiadosCobrarIds = [
        ...new Set(
          detalleCobroFiado.map((d) => d.fiado_id).filter((id) => Number.isFinite(id))
        )
      ];

      if (detalleCobroFiado.length && !fiadosCobrarIds.length) {
        throw new Error('Línea de cobro de fiado sin identificador');
      }

      if (fiadosCobrarIds.length > 0) {
        const pendientesSync = await Fiado._pendientesSyncPorIds(fiadosCobrarIds, tx);
        if (!pendientesSync.length) {
          throw new Error('No hay fiados pendientes para cobrar');
        }
        if (pendientesSync.length !== fiadosCobrarIds.length) {
          throw new Error('Uno o más fiados ya fueron cobrados o no están disponibles');
        }
        totalCobroFiado = round2(
          pendientesSync.reduce((s, r) => s + Number(r.monto || 0), 0)
        );
      }

      const totalRed = round2(totalVentaNueva + totalCobroFiado);

      if (totalRed < -0.009) {
        const tieneCreditoEnvase = detalle.some((d) => Number(d.precio) < 0);
        if (!tieneCreditoEnvase) {
          throw new Error(
            'El total no puede ser negativo. Solo se permite con devolución de envase (ENVASE).'
          );
        }
      }

      const merged = ajustarFiadoComoResto(
        mergeMontosPorMetodo(Array.isArray(pagos) ? pagos : []),
        totalRed
      );
      const clavesPago = Object.keys(merged);

      let metodoPago;
      let desglosesPorLinea;
      let pagosParaFiadoCobro = null;

      const aplicarRepartoPagos = (montosFull) => {
        const { pagosFiado, pagosVenta } = repartirPagosCombinados(
          montosFull,
          totalCobroFiado,
          totalVentaNueva
        );
        pagosParaFiadoCobro = pagosFiado;
        const ventaMerged = pagosVenta || {};
        const clavesVenta = Object.keys(ventaMerged).filter((k) => ventaMerged[k] > 0.001);

        if (detalleVenta.length > 0) {
          if (clavesVenta.length >= 2) {
            metodoPago = 'mixto';
            desglosesPorLinea = allocarDesgloseLineas(
              detalleVenta.map((d) => d.subtotalLinea),
              ventaMerged
            );
          } else if (clavesVenta.length === 1) {
            metodoPago = clavesVenta[0];
            desglosesPorLinea = detalleVenta.map(() => null);
          } else {
            metodoPago = 'efectivo';
            desglosesPorLinea = detalleVenta.map(() => null);
          }
        } else {
          desglosesPorLinea = [];
        }
      };

      if (clavesPago.length >= 2) {
        if (totalRed < -0.009) {
          throw new Error('En una devolución de envase usá un solo método de pago');
        }
        metodoPago = 'mixto';
        const sumPagos = round2(clavesPago.reduce((s, k) => s + merged[k], 0));
        if (Math.abs(totalRed - sumPagos) > 0.05) {
          throw new Error(
            `La suma de los medios de pago ($${sumPagos.toFixed(2)}) debe coincidir con el total de la venta ($${totalRed.toFixed(2)})`
          );
        }
        aplicarRepartoPagos(merged);
      } else if (clavesPago.length === 1) {
        metodoPago = clavesPago[0];
        if (totalRed < -0.009 && metodoPago === 'fiado') {
          throw new Error('La devolución de envase no se puede registrar como fiado');
        }
        const sumPagos = round2(merged[metodoPago]);
        if (Math.abs(totalRed - sumPagos) > 0.05) {
          throw new Error(
            `El importe indicado para ${metodoPago} ($${sumPagos.toFixed(2)}) debe coincidir con el total ($${totalRed.toFixed(2)})`
          );
        }
        aplicarRepartoPagos(merged);
      } else {
        metodoPago = METODOS_VALIDOS.includes(String(metodo_pago || '').toLowerCase())
          ? String(metodo_pago).toLowerCase()
          : 'efectivo';
        if (totalRed < -0.009 && metodoPago === 'fiado') {
          throw new Error('La devolución de envase no se puede registrar como fiado');
        }
        aplicarRepartoPagos({ [metodoPago]: totalRed });
      }

      const ventaMerged =
        totalVentaNueva > 0.009
          ? repartirPagosCombinados(
              clavesPago.length >= 1 ? merged : { [metodoPago]: totalRed },
              totalCobroFiado,
              totalVentaNueva
            ).pagosVenta || {}
          : {};

      const montoFiado =
        totalVentaNueva > 0.009
          ? round2(ventaMerged.fiado || 0) > 0.009
            ? round2(ventaMerged.fiado)
            : metodoPago === 'fiado'
              ? totalVentaNueva
              : 0
          : 0;

      if (montoFiado > 0.009) {
        const nombreFiado = String(cliente_fiado || '').trim();
        if (!nombreFiado) {
          throw new Error('Para ventas en fiado indique el nombre de la persona');
        }
      }

      if (fiadosCobrarIds.length > 0) {
        const fiadoMontos =
          pagosParaFiadoCobro ||
          (clavesPago.length >= 1 ? merged : { [metodoPago]: totalRed });
        const fiadoPagosArr = pagosArrayDesdeMontos(fiadoMontos);
        if (!fiadoPagosArr.length) {
          throw new Error('Indicá cómo se cobra el fiado pendiente');
        }
        await Fiado.aplicarPagoPorIds(
          fiadosCobrarIds,
          {
            pagos: fiadoPagosArr.length >= 1 ? fiadoPagosArr : undefined,
            metodo_pago: fiadoPagosArr.length === 1 ? fiadoPagosArr[0].metodo : undefined,
            monto_total: totalCobroFiado,
            authUser
          },
          tx
        );
      }

      const movimientoIds = [];
      let i = 0;
      for (const d of detalleVenta) {
        let pagosObj = desglosesPorLinea[i];
        if (pagosObj && typeof pagosObj === 'object') {
          const cleaned = {};
          for (const [k, v] of Object.entries(pagosObj)) {
            if (Number(v) > 0.0001) cleaned[k] = round2(v);
          }
          pagosObj = Object.keys(cleaned).length > 0 ? cleaned : null;
        }

        const motivoLinea =
          d.promo_id && d.promo_nombre
            ? `Venta promoción "${d.promo_nombre}"`
            : d.mot;

        const ins = await tx.run(
          `
          INSERT INTO movimientos (
            producto_id, tipo, cantidad, motivo, usuario, precio_unitario, metodo_pago, pagos_desglose,
            promo_id, promo_nombre, venta_grupo_id, promo_unidades
          )
          VALUES (?, 'salida', ?, ?, ?, ?, ?, CAST(? AS JSONB), ?, ?, ?::uuid, ?)
        `,
          [
            d.producto_id,
            d.cantidad,
            motivoLinea,
            d.user,
            d.precio,
            metodoPago,
            pagosObj ? JSON.stringify(pagosObj) : null,
            d.promo_id,
            d.promo_nombre,
            d.promo_id ? ventaGrupoId : null,
            d.promo_id ? d.promo_unidades : null
          ]
        );

        movimientoIds.push(ins.lastID);

        if (!d.no_controla_stock) {
          await tx.run(
            `
            UPDATE productos
            SET stock_actual = stock_actual - ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
            [d.cantidad, d.producto_id]
          );
        }
        i += 1;
      }

      let fiadoId = null;
      if (montoFiado > 0.009) {
        const detalleTxt = detalleVenta
          .map((d) => `${d.nombre} x${d.cantidad}`)
          .join(', ')
          .slice(0, 500);
        const insF = await tx.run(
          `
          INSERT INTO fiados
            (cliente_nombre, monto, estado, detalle, registrado_por, usuario_id, movimiento_ids)
          VALUES (?, ?, 'pendiente', ?, ?, ?, CAST(? AS JSONB))
        `,
          [
            await (async () => {
              const raw = String(cliente_fiado || '')
                .trim()
                .replace(/\s+/g, ' ');
              const existente = await tx.get(
                `
                SELECT cliente_nombre
                FROM fiados
                WHERE LOWER(TRIM(cliente_nombre)) = LOWER(TRIM(?))
                ORDER BY id ASC
                LIMIT 1
              `,
                [raw]
              );
              return existente?.cliente_nombre || raw;
            })(),
            montoFiado,
            detalleTxt || null,
            user,
            authUser?.id ?? null,
            JSON.stringify(movimientoIds)
          ]
        );
        fiadoId = insF.lastID;
      }

      return {
        movimientoIds,
        totalImporte: totalRed,
        lineas: detalleVenta.length,
        fiadoId,
        montoFiado: montoFiado > 0.009 ? montoFiado : 0,
        fiadosCobrados: fiadosCobrarIds.length
      };
    });

    try {
      result.cafeMaquina = await getContadorCafeMaquinaMes();
    } catch {
      /* no bloquear la venta si falla el contador */
    }

    return result;
  }
}
