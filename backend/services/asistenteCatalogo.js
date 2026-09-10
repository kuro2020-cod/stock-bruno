import crypto from 'crypto';
import { Categoria } from '../models/Categoria.js';
import { Producto } from '../models/Producto.js';
import db from '../database/db.js';

const PLAN_TTL_MS = 15 * 60 * 1000;
const MAX_PREVIEW = 40;
const planesPendientes = new Map();

const SQL_NO_SISTEMA = `
  NOT (
    UPPER(TRIM(COALESCE(p.codigo, ''))) LIKE 'REINICIO-%'
    OR UPPER(TRIM(COALESCE(p.nombre, ''))) = 'ENVASE'
  )
`;

function limpiarPlanesVencidos() {
  const now = Date.now();
  for (const [id, plan] of planesPendientes) {
    if (now - plan.createdAt > PLAN_TTL_MS) planesPendientes.delete(id);
  }
}

export function proveedorAsistente() {
  const pref = String(process.env.ASISTENTE_PROVEEDOR || '')
    .trim()
    .toLowerCase();
  if (pref === 'local') return 'local';
  if (pref === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
  if (pref === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return 'local';
}

export function estadoAsistente() {
  const proveedor = proveedorAsistente();
  return {
    proveedor,
    ia_configurada: proveedor !== 'local',
    puede_usar: true
  };
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function limpiarNombre(s) {
  return String(s || '')
    .replace(/^["'«»]+|["'«»]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitTerminos(raw) {
  return String(raw || '')
    .split(/\s*(?:,|;|\/|\s+[oy]\s+)\s*/i)
    .map((t) => limpiarNombre(t))
    .filter((t) => t.length >= 2)
    .slice(0, 12);
}

function normalizarBusqueda(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/[-_/.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** El término puede ser una frase: tiene que aparecer en el nombre o código (todas las palabras). */
function productoCoincideTermino(producto, termino) {
  const hay = normalizarBusqueda(`${producto?.nombre || ''} ${producto?.codigo || ''}`);
  const needle = normalizarBusqueda(termino);
  if (!hay || !needle) return false;
  if (hay.includes(needle)) return true;
  const palabras = needle.split(' ').filter((w) => w.length >= 2);
  if (palabras.length > 1) return palabras.every((w) => hay.includes(w));
  return false;
}

function parseJsonLoose(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

function validarAcciones(acciones) {
  if (!Array.isArray(acciones)) return [];
  const out = [];
  for (const a of acciones) {
    const tipo = String(a?.tipo || '').trim();
    if (tipo === 'crear_categoria') {
      const nombre = limpiarNombre(a.nombre);
      if (!nombre) continue;
      out.push({
        tipo,
        nombre,
        descripcion: limpiarNombre(a.descripcion) || null
      });
    } else if (tipo === 'asignar_categoria') {
      const categoria = limpiarNombre(a.categoria);
      const terminos = Array.isArray(a.terminos)
        ? a.terminos.map(limpiarNombre).filter((t) => t.length >= 2)
        : splitTerminos(a.terminos);
      if (!categoria || !terminos.length) continue;
      out.push({
        tipo,
        categoria,
        terminos: [...new Set(terminos)].slice(0, 12),
        solo_sin_categoria: Boolean(a.solo_sin_categoria)
      });
    } else if (tipo === 'listar_sin_categoria') {
      out.push({ tipo });
    }
  }
  return out.slice(0, 6);
}

function interpretLocal(texto) {
  const t = String(texto || '').trim();
  const lower = t.toLowerCase();
  const acciones = [];

  if (/sin categor/i.test(t) && /(list|mostr|cu[aá]nt|productos?|cu[aá]les)/i.test(t)) {
    return {
      mensaje: 'Voy a listar los productos que no tienen categoría.',
      acciones: [{ tipo: 'listar_sin_categoria' }]
    };
  }

  const mCrear = t.match(
    /cre(?:a|á|ar)\s+(?:una\s+|la\s+)?categor[ií]a\s+(?:llamada\s+|de\s+)?["«»]?(.+?)["«»]?(?=\s+y\s+|\s*,\s*(?:met|pon|pas|asign)|\s*$)/i
  );
  if (mCrear) {
    acciones.push({
      tipo: 'crear_categoria',
      nombre: limpiarNombre(mCrear[1])
    });
  }

  const mPalabra = t.match(/palabra(?:s)?\s+["«»]?(.+?)["«»]?(?:\s+en\s+el\s+nombre)?\s*$/i);
  const mTerminos = t.match(
    /(?:digan|diga|tengan|tienen|tenga|contengan|contiene|contenga|marca[s]?\s+|llamad[oa]s?\s+)["«»]?(.+?)["«»]?(?:\s+en\s+el\s+nombre)?\s*$/i
  );
  let terminos = mPalabra
    ? splitTerminos(mPalabra[1])
    : mTerminos
      ? splitTerminos(String(mTerminos[1]).replace(/^(la\s+)?palabra(?:s)?\s+/i, ''))
      : [];

  const destBruto = limpiarNombre(
    (t.match(
      /(?:pas[aá]\s+a|met[eé](?:los)?\s+en|dentro de|en la categor[ií]a)\s+["«»]?([^"«»\n]+?)["«»]?(?=\s+todo|\s+los|\s+y\s+|\s*$)/i
    ) || [])[1]
  );
  const destInvalido = (s) => {
    const n = norm(s);
    return !n || /^(todos?|los|las|productos?|marcas?)$/.test(n);
  };
  let dest = destBruto && !destInvalido(destBruto) ? destBruto : null;

  if (!dest && acciones[0]?.tipo === 'crear_categoria') dest = acciones[0].nombre;

  if (!terminos.length && dest && /(met|pon|pas|asign|dentro|marca)/i.test(lower)) {
    terminos = splitTerminos(dest);
  }

  if (dest && terminos.length) {
    acciones.push({
      tipo: 'asignar_categoria',
      categoria: dest,
      terminos,
      solo_sin_categoria: /sin categor/i.test(t)
    });
  }

  if (!acciones.length) {
    return {
      mensaje:
        'No pude armar un plan. Probá algo como: «Creá la categoría Coca Cola y meté los productos que digan Coca o Coca-Cola».',
      acciones: []
    };
  }

  const partes = [];
  for (const a of acciones) {
    if (a.tipo === 'crear_categoria') partes.push(`crear la categoría «${a.nombre}»`);
    if (a.tipo === 'asignar_categoria') {
      partes.push(`asignar a «${a.categoria}» lo que coincida con: ${a.terminos.join(', ')}`);
    }
  }
  return {
    mensaje: `Plan: ${partes.join('; ')}. Revisá el detalle y confirmá para aplicar.`,
    acciones
  };
}

async function llamarOpenAI(system, user) {
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const base = String(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ]
      }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `OpenAI HTTP ${res.status}`);
    }
    return data?.choices?.[0]?.message?.content || '';
  } finally {
    clearTimeout(t);
  }
}

async function llamarGemini(system, user) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const key = process.env.GEMINI_API_KEY;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error?.message || `Gemini HTTP ${res.status}`);
    }
    return data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  } finally {
    clearTimeout(t);
  }
}

async function interpretarConIA(texto, categorias) {
  const cats = (categorias || [])
    .map((c) => `- ${c.nombre} (${c.total_productos || 0} prod.)`)
    .join('\n');

  const system = `Sos el asistente de catálogo de un almacén. Solo podés proponer estas acciones:
- crear_categoria: { "tipo":"crear_categoria", "nombre":"...", "descripcion":"..." }
- asignar_categoria: { "tipo":"asignar_categoria", "categoria":"nombre de categoría (nueva o existente)", "terminos":["coca","coca-cola"], "solo_sin_categoria": false }
- listar_sin_categoria: { "tipo":"listar_sin_categoria" }

Reglas:
- Respondé SOLO un JSON: { "mensaje":"resumen corto en español", "acciones":[ ... ] }
- No inventes IDs. Los productos se buscan después por los términos.
- "terminos" son palabras o marcas que aparecen en cualquier parte del nombre del producto (no hace falta que sea el nombre exacto).
- Si piden «Coca Cola», incluí el término "coca cola" (con espacio). También va a coincidir "COCA COLA" en medio del nombre.
- Si piden crear una categoría y meter marcas, incluí crear_categoria y asignar_categoria.
- Si la categoría ya existe, no hace falta crear_categoria.
- Si el pedido no es de catálogo (ventas, caja, etc.), acciones vacías y explicá qué sí podés hacer.
- Máximo 6 acciones.

Categorías actuales:
${cats || '(ninguna)'}`;

  const proveedor = proveedorAsistente();
  const content =
    proveedor === 'gemini' ? await llamarGemini(system, texto) : await llamarOpenAI(system, texto);
  const parsed = parseJsonLoose(content);
  if (!parsed) {
    throw new Error('La IA no devolvió un plan válido.');
  }
  return {
    mensaje: String(parsed.mensaje || 'Revisá el plan y confirmá para aplicar.').slice(0, 500),
    acciones: validarAcciones(parsed.acciones)
  };
}

async function buscarProductosPorTerminos(terminos, soloSinCategoria) {
  const terms = [...new Set((terminos || []).map(limpiarNombre).filter((t) => t.length >= 2))];
  if (!terms.length) return [];

  const piezasLike = new Set();
  for (const t of terms) {
    const n = normalizarBusqueda(t);
    if (n.length >= 2) piezasLike.add(n);
    for (const w of n.split(' ').filter((x) => x.length >= 2)) piezasLike.add(w);
  }
  const likes = [...piezasLike];
  if (!likes.length) return [];

  const conds = likes.map(() => `(LOWER(p.nombre) LIKE ? OR LOWER(COALESCE(p.codigo,'')) LIKE ?)`);
  const params = [];
  for (const t of likes) {
    const like = `%${t}%`;
    params.push(like, like);
  }

  let extra = '';
  if (soloSinCategoria) extra = ' AND p.categoria_id IS NULL';

  const rows =
    (await db.all(
      `
    SELECT p.id, p.nombre, p.codigo, p.categoria_id, c.nombre AS categoria_nombre
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
    WHERE ${SQL_NO_SISTEMA}
      AND (${conds.join(' OR ')})
      ${extra}
    ORDER BY p.nombre
    LIMIT 500
  `,
      params
    )) || [];

  return rows.filter((p) => terms.some((term) => productoCoincideTermino(p, term)));
}

async function listarSinCategoria() {
  return (
    (await db.all(
      `
      SELECT p.id, p.nombre, p.codigo, p.categoria_id, c.nombre AS categoria_nombre
      FROM productos p
      LEFT JOIN categorias c ON c.id = p.categoria_id
      WHERE ${SQL_NO_SISTEMA}
        AND p.categoria_id IS NULL
      ORDER BY p.nombre
      LIMIT 400
    `
    )) || []
  );
}

function compactarProductos(rows) {
  return (rows || []).map((p) => ({
    id: p.id,
    nombre: p.nombre,
    codigo: p.codigo || null,
    categoria_actual: p.categoria_nombre || null
  }));
}

export async function armarPlan(texto, authUser) {
  const pedido = String(texto || '').trim();
  if (pedido.length < 4) {
    throw new Error('Escribí qué querés hacer (mínimo unas palabras).');
  }

  const categorias = await Categoria.getAll();
  const proveedor = proveedorAsistente();
  let interpretado;
  let modo = proveedor;

  if (proveedor === 'local') {
    interpretado = interpretLocal(pedido);
  } else {
    try {
      interpretado = await interpretarConIA(pedido, categorias);
    } catch (err) {
      console.warn('[asistente] IA falló, uso intérprete local:', err.message || err);
      interpretado = interpretLocal(pedido);
      modo = 'local';
      if (!interpretado.acciones.length) {
        throw new Error(
          `No pude usar la IA (${err.message}). Configurá la clave o probá una frase más directa, ej.: «Creá la categoría Coca Cola y meté los productos que digan Coca».`
        );
      }
    }
  }

  const acciones = validarAcciones(interpretado.acciones);
  if (!acciones.length) {
    return {
      ok: true,
      modo,
      requiere_confirmacion: false,
      resumen: interpretado.mensaje,
      pasos: []
    };
  }

  const pasos = [];
  const ejecucion = [];

  for (const a of acciones) {
    if (a.tipo === 'listar_sin_categoria') {
      const rows = await listarSinCategoria();
      const productos = compactarProductos(rows);
      pasos.push({
        tipo: a.tipo,
        titulo: 'Productos sin categoría',
        detalle: `${productos.length} producto(s) sin categoría.`,
        productos: productos.slice(0, MAX_PREVIEW),
        total: productos.length
      });
      ejecucion.push({ tipo: a.tipo, productos });
    }

    if (a.tipo === 'crear_categoria') {
      const existente = categorias.find((c) => norm(c.nombre) === norm(a.nombre));
      if (existente) {
        pasos.push({
          tipo: a.tipo,
          titulo: `Categoría «${existente.nombre}»`,
          detalle: 'Ya existe; no se crea de nuevo.',
          omitido: true
        });
        ejecucion.push({
          tipo: a.tipo,
          omitido: true,
          categoria_id: existente.id,
          nombre: existente.nombre
        });
      } else {
        pasos.push({
          tipo: a.tipo,
          titulo: `Crear categoría «${a.nombre}»`,
          detalle: a.descripcion || 'Se va a crear en el catálogo.'
        });
        ejecucion.push({
          tipo: a.tipo,
          omitido: false,
          nombre: a.nombre,
          descripcion: a.descripcion
        });
      }
    }

    if (a.tipo === 'asignar_categoria') {
      const rows = await buscarProductosPorTerminos(a.terminos, a.solo_sin_categoria);
      const productos = compactarProductos(rows);
      const existente = categorias.find((c) => norm(c.nombre) === norm(a.categoria));
      pasos.push({
        tipo: a.tipo,
        titulo: `Asignar a «${existente?.nombre || a.categoria}»`,
        detalle: `${productos.length} producto(s) coinciden con: ${a.terminos.join(', ')}${
          a.solo_sin_categoria ? ' (solo sin categoría)' : ''
        }.`,
        productos: productos.slice(0, MAX_PREVIEW),
        total: productos.length
      });
      ejecucion.push({
        tipo: a.tipo,
        categoria_nombre: a.categoria,
        categoria_id: existente?.id || null,
        producto_ids: productos.map((p) => p.id)
      });
    }
  }

  const muta = ejecucion.some(
    (e) =>
      (e.tipo === 'crear_categoria' && !e.omitido) ||
      (e.tipo === 'asignar_categoria' && (e.producto_ids || []).length)
  );

  if (!muta) {
    return {
      ok: true,
      modo,
      requiere_confirmacion: false,
      resumen: interpretado.mensaje,
      pasos
    };
  }

  limpiarPlanesVencidos();
  const planId = crypto.randomUUID();
  planesPendientes.set(planId, {
    userId: authUser?.id,
    ejecucion,
    createdAt: Date.now()
  });

  return {
    ok: true,
    modo,
    plan_id: planId,
    requiere_confirmacion: true,
    resumen: interpretado.mensaje,
    pasos
  };
}

export async function ejecutarPlan(planId, authUser) {
  limpiarPlanesVencidos();
  const plan = planesPendientes.get(String(planId || ''));
  if (!plan) {
    throw new Error('El plan expiró o no existe. Generá uno nuevo.');
  }
  if (plan.userId && authUser?.id && Number(plan.userId) !== Number(authUser.id)) {
    throw new Error('Este plan pertenece a otro usuario.');
  }

  planesPendientes.delete(String(planId));

  const resultados = [];
  const creadas = new Map();

  for (const paso of plan.ejecucion) {
    if (paso.tipo === 'listar_sin_categoria') {
      resultados.push({
        tipo: paso.tipo,
        ok: true,
        detalle: `${(paso.productos || []).length} producto(s) sin categoría.`
      });
      continue;
    }

    if (paso.tipo === 'crear_categoria') {
      if (paso.omitido) {
        if (paso.categoria_id && paso.nombre) creadas.set(norm(paso.nombre), paso.categoria_id);
        resultados.push({ tipo: paso.tipo, ok: true, detalle: `«${paso.nombre}» ya existía.` });
        continue;
      }
      const cat = await Categoria.create({
        nombre: paso.nombre,
        descripcion: paso.descripcion
      });
      creadas.set(norm(cat.nombre), cat.id);
      resultados.push({
        tipo: paso.tipo,
        ok: true,
        detalle: `Categoría «${cat.nombre}» creada.`
      });
    }

    if (paso.tipo === 'asignar_categoria') {
      let catId = paso.categoria_id || creadas.get(norm(paso.categoria_nombre));
      if (!catId) {
        const cats = await Categoria.getAll();
        const found = cats.find((c) => norm(c.nombre) === norm(paso.categoria_nombre));
        catId = found?.id || null;
      }
      if (!catId) {
        resultados.push({
          tipo: paso.tipo,
          ok: false,
          detalle: `No encontré la categoría «${paso.categoria_nombre}».`
        });
        continue;
      }
      const ids = paso.producto_ids || [];
      if (!ids.length) {
        resultados.push({
          tipo: paso.tipo,
          ok: true,
          detalle: 'No había productos para asignar.'
        });
        continue;
      }
      const r = await Producto.asignarCategoria(ids, catId);
      resultados.push({
        tipo: paso.tipo,
        ok: true,
        detalle: `${r.actualizados} producto(s) pasaron a «${paso.categoria_nombre}».`
      });
    }
  }

  return { ok: true, resultados };
}
