/** Etiquetas con las que un usuario puede figurar en movimientos (ventas). */
export function aliasesUsuario(authUser) {
  if (!authUser) return ['Sistema'];
  const label = [authUser.apellido, authUser.nombre].filter(Boolean).join(', ').trim();
  const login = String(authUser.usuario || '').trim();
  const aliases = [];
  if (label) aliases.push(label);
  if (login && !aliases.includes(login)) aliases.push(login);
  if (!aliases.length) aliases.push('Sistema');
  return aliases;
}

export function esUsuarioVendedor(authUser) {
  return String(authUser?.rol || '').toUpperCase() === 'USER';
}
