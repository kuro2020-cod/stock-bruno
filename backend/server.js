import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import productosRoutes from './routes/productos.js';
import categoriasRoutes from './routes/categorias.js';
import movimientosRoutes from './routes/movimientos.js';
import dashboardRoutes from './routes/dashboard.js';
import dashboardContadoresRoutes from './routes/dashboardContadores.js';
import estadisticasRoutes from './routes/estadisticas.js';
import ventasRoutes from './routes/ventas.js';
import cierreCajaRoutes from './routes/cierreCaja.js';
import usuariosRoutes from './routes/usuarios.js';
import promocionesRoutes from './routes/promociones.js';
import pagosProveedoresRoutes from './routes/pagosProveedores.js';
import incidenciasRoutes from './routes/incidencias.js';
import retirosRoutes from './routes/retiros.js';
import ingresosEfectivoRoutes from './routes/ingresosEfectivo.js';
import fiadosRoutes from './routes/fiados.js';
import cajaRoutes from './routes/caja.js';
import mercadopagoRoutes from './routes/mercadopago.js';
import cafeMaquinaRoutes from './routes/cafeMaquina.js';
import milanesasRoutes from './routes/milanesas.js';
import sandwichMilanesasRoutes from './routes/sandwichMilanesas.js';
import rollitosJamonQuesoRoutes from './routes/rollitosJamonQueso.js';
import cigarrillosRoutes from './routes/cigarrillos.js';
import faltantesRoutes from './routes/faltantes.js';
import reporteFaltantesRoutes from './routes/reporteFaltantes.js';
import pedidosRoutes from './routes/pedidos.js';
import asistenteRoutes from './routes/asistente.js';
import authRoutes from './routes/auth.js';
import { authenticate, requireAdmin } from './middleware/auth.js';
import db, { ensureInitialized } from './database/db.js';
import { iniciarReporteFaltantesCron } from './services/reporteFaltantesCron.js';
import { getLocalIPv4Addresses } from './utils/networkHosts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDist = path.resolve(__dirname, '../frontend/dist');
const serveFrontend = fs.existsSync(path.join(frontendDist, 'index.html'));

const app = express();
const PORT = Number(process.env.PORT) || 3001;
/** 0.0.0.0 = aceptar conexiones desde otras PCs en la red local */
const HOST = process.env.HOST || '0.0.0.0';

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// Routes (login público; el resto requiere JWT salvo /health)
app.use('/api/auth', authRoutes);
app.use('/api/productos', authenticate, productosRoutes);
app.use('/api/categorias', authenticate, categoriasRoutes);
app.use('/api/movimientos', authenticate, movimientosRoutes);
app.use('/api/dashboard', authenticate, requireAdmin, dashboardRoutes);
app.use('/api/dashboard-contadores', authenticate, requireAdmin, dashboardContadoresRoutes);
app.use('/api/estadisticas', authenticate, requireAdmin, estadisticasRoutes);
app.use('/api/ventas', authenticate, ventasRoutes);
app.use('/api/cierre-caja', authenticate, cierreCajaRoutes);
app.use('/api/promociones', authenticate, promocionesRoutes);
app.use('/api/pagos-proveedores', authenticate, pagosProveedoresRoutes);
app.use('/api/incidencias', authenticate, incidenciasRoutes);
app.use('/api/retiros', authenticate, retirosRoutes);
app.use('/api/ingresos-efectivo', authenticate, ingresosEfectivoRoutes);
app.use('/api/fiados', authenticate, fiadosRoutes);
app.use('/api/caja', authenticate, cajaRoutes);
app.use('/api/mercadopago', authenticate, mercadopagoRoutes);
app.use('/api/cafe-maquina', authenticate, cafeMaquinaRoutes);
app.use('/api/milanesas', authenticate, milanesasRoutes);
app.use('/api/sandwich-milanesas', authenticate, sandwichMilanesasRoutes);
app.use('/api/rollitos-jamon-queso', authenticate, rollitosJamonQuesoRoutes);
app.use('/api/cigarrillos', authenticate, cigarrillosRoutes);
app.use('/api/faltantes', authenticate, faltantesRoutes);
app.use('/api/reporte-faltantes', authenticate, reporteFaltantesRoutes);
app.use('/api/pedidos', authenticate, pedidosRoutes);
app.use('/api/asistente', authenticate, asistenteRoutes);
app.use('/api/usuarios', authenticate, requireAdmin, usuariosRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor funcionando correctamente' });
});

// Si existe frontend/dist, servir la app web (uso local / producción).
if (serveFrontend) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'), (err) => {
      if (err) next(err);
    });
  });
}

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo salió mal!' });
});

// Iniciar servidor después de inicializar la base de datos
const startServer = async () => {
  try {
    // Esperar a que la base de datos esté lista
    await ensureInitialized();
    await iniciarReporteFaltantesCron();

    const server = app.listen(PORT, HOST, () => {
      console.log(`✅ Servidor corriendo en http://localhost:${PORT}`);
      console.log(`📊 API disponible en http://localhost:${PORT}/api`);
      if (serveFrontend) {
        console.log(`🖥️  Aplicación web en http://localhost:${PORT}`);
      } else {
        console.log(`⚠️  No hay frontend compilado (frontend/dist). Ejecutá: scripts\\instalar-dependencias.bat`);
      }

      const ips = getLocalIPv4Addresses();
      if (HOST === '0.0.0.0' && ips.length) {
        console.log('');
        console.log('🌐 Acceso desde otra PC en la misma red:');
        for (const ip of ips) {
          console.log(`   → http://${ip}:${PORT}`);
        }
          console.log('   (Usá esa dirección en el navegador de la otra computadora)');
          console.log('');
          console.log('🌍 Acceso desde internet: reenviá el puerto ' + PORT + ' del router a una de esas IPs.');
          console.log('   Desde internet se ve todo el sistema excepto el módulo de Ventas.');
      } else if (HOST === '0.0.0.0') {
        console.log('');
        console.log('🌐 Red local: no se detectó IP; usá ipconfig para ver la IPv4 de esta PC.');
      }
    });
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(
          `❌ El puerto ${PORT} ya está en uso. Cerrá la otra terminal del backend o ejecutá: npm run free-port`
        );
      } else {
        console.error('❌ Error al escuchar el puerto:', err.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error);
    process.exit(1);
  }
};

startServer();

// Cerrar conexión a la base de datos al terminar
process.on('SIGINT', async () => {
  try {
    await db.close();
    console.log('Conexión a la base de datos cerrada.');
    process.exit(0);
  } catch (err) {
    console.error('Error al cerrar la conexión:', err.message);
    process.exit(1);
  }
});

