export function normalizeRol(rol) {
  const r = String(rol || '')
    .trim()
    .toUpperCase();
  if (r === 'SUPER') return 'SUPER';
  if (r === 'ADMIN') return 'ADMIN';
  if (r === 'EXTERNO') return 'EXTERNO';
  return 'USER';
}

export function esRolAdmin(rol) {
  const r = normalizeRol(rol);
  return r === 'ADMIN' || r === 'SUPER';
}

export function esRolSuper(rol) {
  return normalizeRol(rol) === 'SUPER';
}

/** Lo que se muestra en pantalla: SUPER no se nombra. */
export function rolVisible(rol) {
  const r = normalizeRol(rol);
  return r === 'SUPER' ? 'ADMIN' : r;
}

/** SUPER no se puede asignar desde la API salvo que el actor ya sea SUPER. */
export function rolAsignable(rolPedido, { actorRol, rolActual } = {}) {
  if (esRolSuper(rolActual) && !esRolSuper(actorRol)) {
    return 'SUPER';
  }
  const pedido = normalizeRol(rolPedido);
  if (pedido === 'SUPER') {
    return esRolSuper(actorRol) ? 'SUPER' : 'ADMIN';
  }
  return pedido;
}
