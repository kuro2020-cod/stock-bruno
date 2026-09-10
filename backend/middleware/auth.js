import jwt from 'jsonwebtoken';
import { esAccesoDesdeFuera, esAccesoLimitado, rutaPermitidaAccesoLimitado } from '../utils/accesoRed.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-cambiar-en-produccion';

export function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    req.accesoExterno = esAccesoDesdeFuera(req);
    if (
      esAccesoLimitado(req) &&
      !rutaPermitidaAccesoLimitado(req.method, req.originalUrl, req.user?.rol)
    ) {
      return res.status(403).json({
        error: 'Desde fuera de la red solo se puede usar Faltantes y Pedidos'
      });
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }
}

export function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'ADMIN') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}
