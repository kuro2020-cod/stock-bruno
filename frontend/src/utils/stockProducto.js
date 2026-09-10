/** Productos internos (reinicios de contador, envase sistema): no son mercadería. */
export function esProductoSistema(p) {
  const codigo = String(p?.codigo || '')
    .trim()
    .toUpperCase()
  if (!codigo) return false
  if (codigo === 'ENVASE') return true
  if (codigo.startsWith('REINICIO-')) return true
  return false
}

function flagBool(v) {
  return v === true || v === 1 || v === '1' || v === 't' || v === 'true'
}

/** Productos elaborados (ej. café máquina): se venden sin controlar ni descontar stock. */
export function productoNoControlaStock(p) {
  if (!p) return false
  return flagBool(p.no_controla_stock)
}

/** Cigarrillos, limpieza, etc.: no piden fecha ni entran en la alerta de vencimiento. */
export function productoNoVerificaVencimiento(p) {
  if (!p) return false
  if (productoNoControlaStock(p)) return true
  return flagBool(p.no_verifica_vencimiento)
}

/** Tope práctico de cantidad en carrito cuando no hay control de stock. */
export const MAX_CANTIDAD_SIN_STOCK = 9999

/** Detecta nombres tipo "Cafe (maquina)" para sugerir el flag al editar. */
export function esNombreCafeMaquina(nombre) {
  const n = String(nombre || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  if (!n) return false
  if (n.includes('cafe') && n.includes('maquin')) return true
  return false
}
