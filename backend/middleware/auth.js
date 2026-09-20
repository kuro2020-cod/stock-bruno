import jwt from 'jsonwebtoken';
import { Usuario } from '../models/Usuario.js';
import { esAccesoDesdeFuera, esAccesoLimitado, rutaBloqueadaSinVentas } from '../utils/accesoRed.js';
import { esRolAdmin } from '../utils/roles.js';

export const JWT_SECRET = process.env.JWT_SECRET || 'dev-cambiar-en-produccion';

export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  const token = authHeader.slice(7);
  try {
    req.user = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Sesión inválida o expirada' });
  }

  req.accesoExterno = esAccesoDesdeFuera(req);
  try {
    if (req.accesoExterno) {
      const permitido = await Usuario.permiteAccesoExterno(req.user.id);
      if (!permitido) {
        return res.status(403).json({
          error: 'Este usuario no tiene permitido ingresar desde internet.'
        });
      }
    }
    if (esAccesoLimitado(req) && rutaBloqueadaSinVentas(req.method, req.originalUrl)) {
      return res.status(403).json({
        error: 'Desde fuera de la red no se puede usar el módulo de Ventas'
      });
    }
    next();
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

export function requireAdmin(req, res, next) {
  if (!esRolAdmin(req.user?.rol)) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  next();
}
