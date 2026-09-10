/** IP del cliente (sin confiar en X-Forwarded-For, para no falsear el origen). */
export function getRequestIp(req) {
  const raw = req.socket?.remoteAddress || req.connection?.remoteAddress || req.ip || '';
  return String(raw).replace(/^::ffff:/, '').trim();
}

function hostDeLaPeticion(req) {
  const xfHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = xfHost || String(req.headers.host || '');
  return host.toLowerCase().replace(/:\d+$/, '');
}

/** URL del túnel (ngrok/Cloudflare) o hostname público: hay que tratarlo como “desde afuera”. */
export function esHostTunelOPublico(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  if (
    h.includes('ngrok-free.app') ||
    h.includes('ngrok-free.dev') ||
    h.includes('ngrok.io') ||
    h.includes('ngrok.app')
  ) {
    return true;
  }
  if (h.endsWith('.trycloudflare.com')) return true;
  if (
    h.endsWith('.sytes.net') ||
    h.endsWith('.ddns.net') ||
    h.endsWith('.hopto.org') ||
    h.endsWith('.no-ip.com')
  ) {
    return true;
  }
  return false;
}

export function esIpPrivadaOLocal(ip) {
  const raw = String(ip || '').trim();
  if (!raw) return true;
  if (raw === '127.0.0.1' || raw === '::1' || raw === 'localhost') return true;
  if (raw.startsWith('192.168.')) return true;
  if (raw.startsWith('10.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(raw)) return true;
  if (raw.startsWith('169.254.')) return true;
  const lower = raw.toLowerCase();
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower === '::1') return true;
  return false;
}

export function esAccesoDesdeFuera(req) {
  if (esHostTunelOPublico(hostDeLaPeticion(req))) return true;
  return !esIpPrivadaOLocal(getRequestIp(req));
}

export function esRolExterno(rol) {
  return String(rol || '').toUpperCase() === 'EXTERNO';
}

export function esAccesoLimitado(req) {
  return esRolExterno(req.user?.rol) || esAccesoDesdeFuera(req);
}

/** Desde afuera / EXTERNO: todo el sistema excepto registrar ventas (POS). */
export function rutaBloqueadaSinVentas(method, originalUrl) {
  const path = String(originalUrl || '').split('?')[0];
  if (path === '/api/ventas' || path.startsWith('/api/ventas/')) return true;
  if (path.startsWith('/api/mercadopago/qr/orden')) return true;
  return false;
}
