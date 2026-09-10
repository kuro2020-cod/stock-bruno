const STORAGE_PREFIX = 'ventas_carrito'
/** Carritos abandonados más viejos que esto no se restauran. */
const TTL_MS = 7 * 24 * 60 * 60 * 1000

function storageKey(userId) {
  return `${STORAGE_PREFIX}_${userId}`
}

function esLineaValida(line) {
  return (
    line &&
    typeof line === 'object' &&
    line.producto_id != null &&
    typeof line.nombre === 'string' &&
    line.nombre.length > 0
  )
}

export function leerCarritoPersistido(userId) {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const data = JSON.parse(raw)
    if (!data || !Array.isArray(data.items)) return []
    if (data.savedAt && Date.now() - data.savedAt > TTL_MS) {
      localStorage.removeItem(storageKey(userId))
      return []
    }
    return data.items.filter(esLineaValida)
  } catch {
    return []
  }
}

export function guardarCarritoPersistido(userId, items) {
  if (!userId) return
  const list = Array.isArray(items) ? items.filter(esLineaValida) : []
  if (list.length === 0) {
    localStorage.removeItem(storageKey(userId))
    return
  }
  localStorage.setItem(
    storageKey(userId),
    JSON.stringify({ savedAt: Date.now(), items: list })
  )
}

export function limpiarCarritoPersistido(userId) {
  if (!userId) return
  localStorage.removeItem(storageKey(userId))
}
