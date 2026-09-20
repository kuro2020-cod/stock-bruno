import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;

// Configuración de la conexión a PostgreSQL
const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'stock',
  user: process.env.DB_USER || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Solo añadir password si está configurado
if (process.env.DB_PASSWORD) {
  poolConfig.password = process.env.DB_PASSWORD;
}

const pool = new Pool(poolConfig);

// Probar la conexión
pool.on('connect', (client) => {
  console.log('Conectado a la base de datos PostgreSQL');
  client
    .query("SET TIME ZONE 'America/Argentina/Buenos_Aires'")
    .catch((err) => console.warn('No se pudo fijar zona horaria:', err.message));
});

pool.on('error', (err) => {
  console.error('Error inesperado en la base de datos:', err);
});

// Función para ejecutar consultas
const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query ejecutada', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error en query:', { text, error: error.message });
    throw error;
  }
};

// Ejecutar consultas usando un cliente específico (para transacciones)
const queryWithClient = async (client, text, params) => {
  const start = Date.now();
  try {
    const res = await client.query(text, params);
    const duration = Date.now() - start;
    console.log('Query (txn) ejecutada', { text, duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Error en query (txn):', { text, error: error.message });
    throw error;
  }
};

// Crear tablas si no existen
const initDatabase = async () => {
  try {
    // Tabla de categorías
    await query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL UNIQUE,
        descripcion TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de productos
    await query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        codigo VARCHAR(255) UNIQUE,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        categoria_id INTEGER,
        precio_compra DECIMAL(10, 2) DEFAULT 0,
        precio_venta DECIMAL(10, 2) DEFAULT 0,
        stock_actual NUMERIC(14, 4) DEFAULT 0,
        stock_minimo NUMERIC(14, 4) DEFAULT 0,
        unidad_medida VARCHAR(50) DEFAULT 'unidad',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON DELETE SET NULL
      )
    `);

    // Tabla de movimientos de stock
    await query(`
      CREATE TABLE IF NOT EXISTS movimientos (
        id SERIAL PRIMARY KEY,
        producto_id INTEGER NOT NULL,
        tipo VARCHAR(20) NOT NULL CHECK(tipo IN ('entrada', 'salida', 'ajuste', 'baja')),
        cantidad NUMERIC(14, 4) NOT NULL,
        motivo TEXT,
        usuario VARCHAR(255),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE
      )
    `);

    // Crear índices para mejorar el rendimiento
    await query(`
      CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos(producto_id)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha)
    `);

    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS precio_unitario DECIMAL(10, 2)
    `);
    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(20)
    `);
    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS pagos_desglose JSONB
    `);
    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS promo_id INTEGER
    `);
    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS promo_nombre VARCHAR(255)
    `);
    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS venta_grupo_id UUID
    `);
    await query(`
      ALTER TABLE movimientos
      ADD COLUMN IF NOT EXISTS promo_unidades NUMERIC(14, 4)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_movimientos_venta_grupo
        ON movimientos(venta_grupo_id)
    `);

    // Permitir tipo 'baja' (vencimiento, rotura, etc.) sin contar como venta
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'movimientos_tipo_check'
        ) THEN
          ALTER TABLE movimientos DROP CONSTRAINT movimientos_tipo_check;
        END IF;
        ALTER TABLE movimientos
          ADD CONSTRAINT movimientos_tipo_check
          CHECK (tipo IN ('entrada', 'salida', 'ajuste', 'baja'));
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END $$
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS cierres_caja (
        id SERIAL PRIMARY KEY,
        fecha_cierre DATE NOT NULL,
        total_general NUMERIC(14, 2) NOT NULL DEFAULT 0,
        total_movimientos INTEGER NOT NULL DEFAULT 0,
        detalle_metodos JSONB NOT NULL DEFAULT '{}'::jsonb,
        cerrado_por VARCHAR(255),
        observaciones TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      ALTER TABLE cierres_caja DROP CONSTRAINT IF EXISTS cierres_caja_fecha_cierre_key
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_cierres_caja_fecha ON cierres_caja(fecha_cierre)
    `);

    // Fecha de vencimiento (obligatoria al cargar productos que controlan stock)
    await query(`
      ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS fecha_vencimiento DATE
    `);

    // Productos elaborados (café máquina, etc.): se venden sin controlar stock
    await query(`
      ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS no_controla_stock BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await query(`
      ALTER TABLE productos
      ADD COLUMN IF NOT EXISTS no_verifica_vencimiento BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0
      WHERE no_controla_stock = FALSE
        AND (
          (
            (LOWER(nombre) LIKE '%cafe%' OR LOWER(nombre) LIKE '%café%')
            AND (LOWER(nombre) LIKE '%maquin%' OR LOWER(nombre) LIKE '%máquin%')
          )
          OR LOWER(nombre) LIKE '%cafe (maquina)%'
          OR LOWER(nombre) LIKE '%café (máquina)%'
          OR LOWER(nombre) LIKE '%cafe maquina%'
          OR LOWER(nombre) LIKE '%café máquina%'
        )
    `);

    // Revertir columnas de "abrir caja" si existían
    await query(`DROP INDEX IF EXISTS idx_productos_contenido`);
    await query(`
      ALTER TABLE productos DROP COLUMN IF EXISTS producto_contenido_id
    `);
    await query(`
      ALTER TABLE productos DROP COLUMN IF EXISTS unidades_por_caja
    `);

    // Stock y cantidades en decimal (kg, etc.): migrar instalaciones antiguas (INTEGER → NUMERIC)
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'productos'
            AND column_name = 'stock_actual' AND udt_name = 'int4'
        ) THEN
          ALTER TABLE productos
            ALTER COLUMN stock_actual TYPE NUMERIC(14, 4) USING stock_actual::numeric,
            ALTER COLUMN stock_minimo TYPE NUMERIC(14, 4) USING stock_minimo::numeric;
        END IF;
      END $$
    `);
    await query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'movimientos'
            AND column_name = 'cantidad' AND udt_name = 'int4'
        ) THEN
          ALTER TABLE movimientos
            ALTER COLUMN cantidad TYPE NUMERIC(14, 4) USING cantidad::numeric;
        END IF;
      END $$
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS promociones (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        tipo VARCHAR(30) NOT NULL
          CHECK (tipo IN ('fiambre', 'prepizza', 'huevos_maple')),
        descripcion TEXT,
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        precio_promocional DECIMAL(10, 2) NOT NULL DEFAULT 0,
        cantidad_minima NUMERIC(14, 4) DEFAULT 1,
        unidad_promo VARCHAR(30) DEFAULT 'unidad',
        activa BOOLEAN NOT NULL DEFAULT TRUE,
        fecha_inicio DATE,
        fecha_fin DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_promociones_tipo ON promociones(tipo)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_promociones_activa ON promociones(activa)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_promociones_producto ON promociones(producto_id)
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS promocion_items (
        id SERIAL PRIMARY KEY,
        promocion_id INTEGER NOT NULL REFERENCES promociones(id) ON DELETE CASCADE,
        producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
        cantidad NUMERIC(14, 4) NOT NULL DEFAULT 1,
        precio_unitario DECIMAL(10, 2),
        orden INTEGER NOT NULL DEFAULT 0
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_promocion_items_promo ON promocion_items(promocion_id)
    `);

    await query(`
      ALTER TABLE promociones DROP CONSTRAINT IF EXISTS promociones_tipo_check
    `);
    await query(`
      ALTER TABLE promociones ADD CONSTRAINT promociones_tipo_check
        CHECK (tipo IN ('fiambre', 'prepizza', 'huevos_maple', 'combo'))
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS usuario (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        apellido VARCHAR(255) NOT NULL,
        dni VARCHAR(32) NOT NULL UNIQUE,
        usuario VARCHAR(100) NOT NULL UNIQUE,
        clave VARCHAR(255) NOT NULL,
        rol VARCHAR(20) NOT NULL DEFAULT 'USER'
          CHECK (rol IN ('ADMIN', 'USER', 'EXTERNO', 'SUPER')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Alinear tablas creadas a mano (sin created_at / rol) con el esquema esperado
    await query(`
      ALTER TABLE usuario
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    `);
    await query(`
      ALTER TABLE usuario
      ADD COLUMN IF NOT EXISTS rol VARCHAR(20) DEFAULT 'USER'
    `);

    // Bases ya creadas: ampliar CHECK de rol para incluir EXTERNO y SUPER
    const rolChecks = await query(`
      SELECT DISTINCT con.conname
      FROM pg_constraint con
      JOIN pg_attribute att
        ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
      WHERE con.conrelid = 'usuario'::regclass
        AND con.contype = 'c'
        AND att.attname = 'rol'
    `);
    for (const row of rolChecks.rows || []) {
      await query(`ALTER TABLE usuario DROP CONSTRAINT IF EXISTS "${row.conname}"`);
    }
    await query(`
      ALTER TABLE usuario
      ADD CONSTRAINT usuario_rol_check
      CHECK (rol IN ('ADMIN', 'USER', 'EXTERNO', 'SUPER'))
    `);

    await query(`
      ALTER TABLE usuario
      ADD COLUMN IF NOT EXISTS acceso_externo BOOLEAN NOT NULL DEFAULT TRUE
    `);

    await query(`
      ALTER TABLE cierres_caja
      ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuario(id)
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_cierres_caja_usuario_fecha
      ON cierres_caja(usuario_id, fecha_cierre)
    `);

    // Apertura / fondo de caja por turno
    await query(`
      CREATE TABLE IF NOT EXISTS aperturas_caja (
        id SERIAL PRIMARY KEY,
        monto_apertura NUMERIC(14, 2) NOT NULL CHECK (monto_apertura >= 0),
        fondo_siguiente NUMERIC(14, 2),
        usuario_id INTEGER REFERENCES usuario(id),
        registrado_por VARCHAR(255),
        cierre_id INTEGER REFERENCES cierres_caja(id) ON DELETE SET NULL,
        abierta BOOLEAN NOT NULL DEFAULT TRUE,
        fecha_caja DATE NOT NULL DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cerrado_at TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_aperturas_caja_abierta
        ON aperturas_caja(abierta) WHERE abierta = TRUE
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_aperturas_caja_fecha
        ON aperturas_caja(fecha_caja DESC, created_at DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_aperturas_caja_usuario_abierta
        ON aperturas_caja(usuario_id)
        WHERE abierta = TRUE
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS pagos_proveedores (
        id SERIAL PRIMARY KEY,
        proveedor VARCHAR(255) NOT NULL,
        concepto TEXT,
        monto_total NUMERIC(14, 2) NOT NULL,
        metodo_pago VARCHAR(20) NOT NULL,
        pagos_desglose JSONB,
        registrado_por VARCHAR(255),
        usuario_id INTEGER REFERENCES usuario(id),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_pagos_proveedores_fecha ON pagos_proveedores(fecha)
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS incidencias_carrito (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('linea', 'carrito')),
        monto_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
        detalle JSONB NOT NULL DEFAULT '[]'::jsonb,
        registrado_por VARCHAR(255),
        usuario_id INTEGER REFERENCES usuario(id),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_incidencias_carrito_fecha ON incidencias_carrito(fecha DESC)
    `);
    await query(`
      ALTER TABLE incidencias_carrito DROP CONSTRAINT IF EXISTS incidencias_carrito_tipo_check
    `);
    await query(`
      ALTER TABLE incidencias_carrito
        ADD CONSTRAINT incidencias_carrito_tipo_check
        CHECK (tipo IN ('linea', 'carrito', 'fiado', 'fiado_carrito'))
    `);

    // Retiros de dueño: efectivo (resta en caja) y mercadería (baja de stock, no venta)
    await query(`
      CREATE TABLE IF NOT EXISTS retiros (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('efectivo', 'mercaderia')),
        monto NUMERIC(14, 2),
        metodo_pago VARCHAR(20),
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        producto_nombre VARCHAR(255),
        cantidad NUMERIC(14, 4),
        movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
        motivo TEXT,
        registrado_por VARCHAR(255),
        usuario_id INTEGER REFERENCES usuario(id),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_retiros_fecha ON retiros(fecha DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_retiros_tipo_fecha ON retiros(tipo, fecha DESC)
    `);

    // Ingresos de efectivo a caja (suman en arqueo / cierre)
    await query(`
      CREATE TABLE IF NOT EXISTS ingresos_efectivo (
        id SERIAL PRIMARY KEY,
        monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
        motivo TEXT,
        registrado_por VARCHAR(255),
        usuario_id INTEGER REFERENCES usuario(id),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_ingresos_efectivo_fecha ON ingresos_efectivo(fecha DESC)
    `);

    // Fiados: ventas a crédito (no afectan efectivo de caja)
    await query(`
      CREATE TABLE IF NOT EXISTS fiados (
        id SERIAL PRIMARY KEY,
        cliente_nombre VARCHAR(255) NOT NULL,
        monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
        estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
          CHECK (estado IN ('pendiente', 'cobrado')),
        detalle TEXT,
        registrado_por VARCHAR(255),
        usuario_id INTEGER REFERENCES usuario(id),
        movimiento_ids JSONB,
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        cobrado_at TIMESTAMP,
        cobrado_por VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_fiados_fecha ON fiados(fecha DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_fiados_cliente ON fiados(cliente_nombre)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_fiados_estado_fecha ON fiados(estado, fecha DESC)
    `);
    await query(`
      ALTER TABLE fiados
        ADD COLUMN IF NOT EXISTS metodo_cobro VARCHAR(20),
        ADD COLUMN IF NOT EXISTS pagos_desglose_cobro JSONB
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_fiados_cobrado_at ON fiados(cobrado_at DESC)
        WHERE cobrado_at IS NOT NULL
    `);
    await query(`
      ALTER TABLE fiados
        ADD COLUMN IF NOT EXISTS aviso_carrito_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS aviso_carrito_por VARCHAR(255),
        ADD COLUMN IF NOT EXISTS aviso_carrito_texto TEXT
    `);

    // Producto sistema para cobro de envase (retornables sin entrega)
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock)
      SELECT 'ENVASE', 'ENVASE', 'Cobro de envase (sin entrega)', 0, 0, 0, 0, 'unidad', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM productos
        WHERE UPPER(TRIM(codigo)) = 'ENVASE'
           OR UPPER(TRIM(nombre)) = 'ENVASE'
      )
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(codigo)) = 'ENVASE'
         OR UPPER(TRIM(nombre)) = 'ENVASE'
    `);

    // Producto sistema para reportes de reinicio del contador de café máquina
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock)
      SELECT 'REINICIO-CAFE', 'Reinicio contador café máquina', 'Registro de reinicio del contador de cafés (no es venta)', 0, 0, 0, 0, 'unidad', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM productos
        WHERE UPPER(TRIM(codigo)) = 'REINICIO-CAFE'
      )
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(codigo)) = 'REINICIO-CAFE'
    `);

    // Historial de reinicios del contador de café máquina
    await query(`
      CREATE TABLE IF NOT EXISTS cafe_maquina_reinicios (
        id SERIAL PRIMARY KEY,
        unidades_antes NUMERIC(14, 4) NOT NULL DEFAULT 0,
        movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
        usuario VARCHAR(255),
        usuario_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_cafe_reinicios_created
        ON cafe_maquina_reinicios(created_at DESC)
    `);

    // Producto sistema: reinicio diario del contador de milanesas (corte 06:00)
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock)
      SELECT 'REINICIO-MILANESAS', 'Reinicio contador milanesas', 'Registro diario del total vendido en milanesas (no es venta)', 0, 0, 0, 0, 'unidad', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM productos
        WHERE UPPER(TRIM(codigo)) = 'REINICIO-MILANESAS'
      )
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(codigo)) = 'REINICIO-MILANESAS'
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS milanesas_reinicios (
        id SERIAL PRIMARY KEY,
        monto_antes NUMERIC(14, 2) NOT NULL DEFAULT 0,
        unidades_antes NUMERIC(14, 4) NOT NULL DEFAULT 0,
        jornada_inicio TIMESTAMPTZ,
        movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
        usuario VARCHAR(255),
        usuario_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_milanesas_reinicios_created
        ON milanesas_reinicios(created_at DESC)
    `);

    // Producto sistema: reinicio diario sandwich de milanesas (corte 06:00)
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock)
      SELECT 'REINICIO-SANDWICH-MIL', 'Reinicio contador sandwich milanesas', 'Registro diario del total vendido en sandwich de milanesas (no es venta)', 0, 0, 0, 0, 'unidad', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM productos
        WHERE UPPER(TRIM(codigo)) = 'REINICIO-SANDWICH-MIL'
      )
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(codigo)) = 'REINICIO-SANDWICH-MIL'
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS sandwich_milanesas_reinicios (
        id SERIAL PRIMARY KEY,
        monto_antes NUMERIC(14, 2) NOT NULL DEFAULT 0,
        unidades_antes NUMERIC(14, 4) NOT NULL DEFAULT 0,
        jornada_inicio TIMESTAMPTZ,
        movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
        usuario VARCHAR(255),
        usuario_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_sandwich_milanesas_reinicios_created
        ON sandwich_milanesas_reinicios(created_at DESC)
    `);

    // Producto sistema: reinicio diario rollitos jamón y queso (corte 06:00)
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock)
      SELECT 'REINICIO-ROLLITOS-JQ', 'Reinicio contador rollitos jamón y queso', 'Registro diario del total vendido en rollitos jamón y queso (no es venta)', 0, 0, 0, 0, 'unidad', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM productos
        WHERE UPPER(TRIM(codigo)) = 'REINICIO-ROLLITOS-JQ'
      )
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(codigo)) = 'REINICIO-ROLLITOS-JQ'
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS rollitos_jamon_queso_reinicios (
        id SERIAL PRIMARY KEY,
        monto_antes NUMERIC(14, 2) NOT NULL DEFAULT 0,
        unidades_antes NUMERIC(14, 4) NOT NULL DEFAULT 0,
        jornada_inicio TIMESTAMPTZ,
        movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
        usuario VARCHAR(255),
        usuario_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_rollitos_jq_reinicios_created
        ON rollitos_jamon_queso_reinicios(created_at DESC)
    `);

    // Producto sistema: reinicio diario cigarrillos (corte 06:00)
    await query(`
      INSERT INTO productos (codigo, nombre, descripcion, precio_compra, precio_venta, stock_actual, stock_minimo, unidad_medida, no_controla_stock)
      SELECT 'REINICIO-CIGARRILLOS', 'Reinicio contador cigarrillos', 'Registro diario del total vendido en cigarrillos (no es venta)', 0, 0, 0, 0, 'unidad', TRUE
      WHERE NOT EXISTS (
        SELECT 1 FROM productos
        WHERE UPPER(TRIM(codigo)) = 'REINICIO-CIGARRILLOS'
      )
    `);
    await query(`
      UPDATE productos
      SET no_controla_stock = TRUE,
          stock_actual = 0,
          stock_minimo = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE UPPER(TRIM(codigo)) = 'REINICIO-CIGARRILLOS'
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS cigarrillos_reinicios (
        id SERIAL PRIMARY KEY,
        monto_antes NUMERIC(14, 2) NOT NULL DEFAULT 0,
        unidades_antes NUMERIC(14, 4) NOT NULL DEFAULT 0,
        jornada_inicio TIMESTAMPTZ,
        movimiento_id INTEGER REFERENCES movimientos(id) ON DELETE SET NULL,
        usuario VARCHAR(255),
        usuario_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_cigarrillos_reinicios_created
        ON cigarrillos_reinicios(created_at DESC)
    `);

    // Registro manual de faltantes / pedidos inexistentes
    await query(`
      CREATE TABLE IF NOT EXISTS faltantes (
        id SERIAL PRIMARY KEY,
        tipo VARCHAR(30) NOT NULL
          CHECK (tipo IN ('faltante', 'pedido_inexistente', 'otro')),
        producto_texto VARCHAR(255) NOT NULL,
        producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
        cantidad NUMERIC(14, 4),
        notas TEXT,
        registrado_por VARCHAR(255),
        usuario_id INTEGER REFERENCES usuario(id),
        fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_fecha ON faltantes(fecha DESC)
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_faltantes_tipo_fecha ON faltantes(tipo, fecha DESC)
    `);

    // Configuración del reporte diario por email (faltantes + stock bajo)
    await query(`
      CREATE TABLE IF NOT EXISTS config_reporte_faltantes (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        email_destino TEXT NOT NULL,
        hora_envio VARCHAR(5) NOT NULL DEFAULT '22:00',
        activo BOOLEAN NOT NULL DEFAULT TRUE,
        actualizado_en TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actualizado_por VARCHAR(255)
      )
    `);
    await query(`
      ALTER TABLE config_reporte_faltantes
        ALTER COLUMN email_destino TYPE TEXT
    `);
    await query(`
      INSERT INTO config_reporte_faltantes (id, email_destino, hora_envio, activo)
      VALUES (1, 'bruno.german99@gmail.com', '22:00', TRUE)
      ON CONFLICT (id) DO NOTHING
    `);

    // Contadores de dashboard por categoría (frecuencia configurable)
    await query(`
      CREATE TABLE IF NOT EXISTS dashboard_contadores (
        id SERIAL PRIMARY KEY,
        categoria_id INTEGER NOT NULL UNIQUE REFERENCES categorias(id) ON DELETE CASCADE,
        frecuencia VARCHAR(20) NOT NULL
          CHECK (frecuencia IN ('diario', 'semanal', 'mensual')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS dashboard_contador_reinicios (
        id SERIAL PRIMARY KEY,
        contador_id INTEGER NOT NULL REFERENCES dashboard_contadores(id) ON DELETE CASCADE,
        monto_antes NUMERIC(14, 2) NOT NULL DEFAULT 0,
        unidades_antes NUMERIC(14, 4) NOT NULL DEFAULT 0,
        periodo_inicio TIMESTAMPTZ,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await query(`
      CREATE INDEX IF NOT EXISTS idx_dash_contador_reinicios
        ON dashboard_contador_reinicios(contador_id, created_at DESC)
    `);

    // Categorías de ejemplo solo en base vacía (si no, al borrar una y reiniciar el servidor volverían a insertarse)
    const { rows: countRows } = await query(`SELECT COUNT(*)::int AS n FROM categorias`);
    const totalCategorias = countRows[0]?.n ?? 0;
    if (totalCategorias === 0) {
      const categoriasEjemplo = [
        ['Electrónica', 'Productos electrónicos y componentes'],
        ['Ropa', 'Prendas de vestir y accesorios'],
        ['Alimentos', 'Productos alimenticios'],
        ['Hogar', 'Artículos para el hogar']
      ];
      for (const [nombre, descripcion] of categoriasEjemplo) {
        await query(
          `INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2)`,
          [nombre, descripcion]
        );
      }
    }

    console.log('Base de datos inicializada correctamente');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    throw error;
  }
};

// Exportar la función de inicialización para que el servidor la llame
export { initDatabase };

// Variable para evitar múltiples inicializaciones
let initialized = false;

// Función wrapper que evita múltiples inicializaciones
export const ensureInitialized = async () => {
  if (!initialized) {
    await initDatabase();
    initialized = true;
  }
};

// Función para convertir placeholders de SQLite (?) a PostgreSQL ($1, $2, ...)
const convertPlaceholders = (text, params = []) => {
  if (!params || params.length === 0) {
    return { text, params };
  }
  
  let paramIndex = 1;
  const convertedText = text.replace(/\?/g, () => `$${paramIndex++}`);
  return { text: convertedText, params };
};

// Wrapper para compatibilidad con el código existente
const db = {
  // Para queries que devuelven múltiples filas
  all: async (text, params) => {
    const { text: convertedText, params: convertedParams } = convertPlaceholders(text, params);
    const result = await query(convertedText, convertedParams);
    return result.rows;
  },
  
  // Para queries que devuelven una sola fila
  get: async (text, params) => {
    const { text: convertedText, params: convertedParams } = convertPlaceholders(text, params);
    const result = await query(convertedText, convertedParams);
    return result.rows[0] || null;
  },
  
  // Para queries que modifican datos (INSERT, UPDATE, DELETE)
  run: async (text, params) => {
    // Para INSERT, necesitamos usar RETURNING para obtener el ID
    let modifiedText = text;
    if (text.trim().toUpperCase().startsWith('INSERT')) {
      // Si no tiene RETURNING, lo añadimos
      if (!text.includes('RETURNING')) {
        modifiedText = text.replace(/;?\s*$/, '') + ' RETURNING id';
      }
    }
    
    const { text: convertedText, params: convertedParams } = convertPlaceholders(modifiedText, params);
    const result = await query(convertedText, convertedParams);
    
    return {
      lastID: result.rows[0]?.id || null,
      changes: result.rowCount || 0
    };
  },

  // Ejecutar un bloque dentro de una transacción
  transaction: async (callback) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Helpers que usan el mismo cliente y conversión de placeholders
      const all = async (text, params) => {
        const { text: convertedText, params: convertedParams } = convertPlaceholders(text, params);
        const result = await queryWithClient(client, convertedText, convertedParams);
        return result.rows;
      };
      const get = async (text, params) => {
        const { text: convertedText, params: convertedParams } = convertPlaceholders(text, params);
        const result = await queryWithClient(client, convertedText, convertedParams);
        return result.rows[0] || null;
      };
      const run = async (text, params) => {
        let modifiedText = text;
        if (text.trim().toUpperCase().startsWith('INSERT')) {
          if (!text.includes('RETURNING')) {
            modifiedText = text.replace(/;?\s*$/, '') + ' RETURNING id';
          }
        }
        const { text: convertedText, params: convertedParams } = convertPlaceholders(modifiedText, params);
        const result = await queryWithClient(client, convertedText, convertedParams);
        return {
          lastID: result.rows[0]?.id || null,
          changes: result.rowCount || 0
        };
      };

      const result = await callback({ all, get, run, client });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  },
  
  // Cerrar la conexión
  close: async (callback) => {
    try {
      await pool.end();
      if (callback) callback(null);
    } catch (error) {
      if (callback) callback(error);
    }
  }
};

export default db;
