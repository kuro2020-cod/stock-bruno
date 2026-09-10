import express from 'express';
import jwt from 'jsonwebtoken';
import { Usuario } from '../models/Usuario.js';
import { JWT_SECRET, authenticate } from '../middleware/auth.js';
import { esAccesoDesdeFuera } from '../utils/accesoRed.js';

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { usuario, clave } = req.body;
    if (!usuario || !clave) {
      return res.status(400).json({ error: 'Usuario y clave son requeridos' });
    }
    const user = await Usuario.autenticar(usuario, clave);
    if (!user) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
    }
    const token = jwt.sign(
      {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
        nombre: user.nombre,
        apellido: user.apellido
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const accesoExterno = esAccesoDesdeFuera(req);
    res.json({
      token,
      accesoExterno,
      user: {
        id: user.id,
        usuario: user.usuario,
        rol: user.rol,
        nombre: user.nombre,
        apellido: user.apellido,
        dni: user.dni,
        accesoExterno
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/me', authenticate, (req, res) => {
  const accesoExterno = Boolean(req.accesoExterno);
  res.json({
    id: req.user.id,
    usuario: req.user.usuario,
    rol: req.user.rol,
    nombre: req.user.nombre,
    apellido: req.user.apellido,
    accesoExterno
  });
});

export default router;
