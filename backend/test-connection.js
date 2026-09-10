import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Client } = pkg;

async function testConnection() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'stock',
    user: process.env.DB_USER || 'postgres',
  };

  // Solo añadir password si está configurado
  if (process.env.DB_PASSWORD) {
    config.password = process.env.DB_PASSWORD;
  } else {
    console.log('⚠️  No se encontró DB_PASSWORD en .env, intentando sin contraseña...\n');
  }

  const client = new Client(config);

  try {
    console.log('🔌 Intentando conectar a PostgreSQL...');
    console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`   Puerto: ${process.env.DB_PORT || 5432}`);
    console.log(`   Base de datos: ${process.env.DB_NAME || 'stock'}`);
    console.log(`   Usuario: ${process.env.DB_USER || 'postgres'}`);
    
    await client.connect();
    console.log('✅ Conexión exitosa a PostgreSQL!\n');

    // Verificar que la base de datos existe
    const dbCheck = await client.query('SELECT current_database()');
    console.log(`📊 Base de datos actual: ${dbCheck.rows[0].current_database}`);

    // Verificar versión de PostgreSQL
    const version = await client.query('SELECT version()');
    console.log(`📦 Versión: ${version.rows[0].version.split(',')[0]}\n`);

    // Verificar si las tablas existen
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    if (tables.rows.length > 0) {
      console.log('📋 Tablas existentes:');
      tables.rows.forEach(row => {
        console.log(`   - ${row.table_name}`);
      });
    } else {
      console.log('📋 No hay tablas creadas aún (se crearán al iniciar el servidor)');
    }

    console.log('\n✨ Todo está listo para usar!');
    
  } catch (error) {
    console.error('\n❌ Error al conectar a PostgreSQL:');
    console.error(`   ${error.message}\n`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('💡 Posibles soluciones:');
      console.log('   1. Verifica que PostgreSQL esté corriendo');
      console.log('   2. Verifica el host y puerto en tu archivo .env');
    } else if (error.code === '3D000') {
      console.log('💡 La base de datos no existe. Créala con:');
      console.log('   CREATE DATABASE stock;');
    } else if (error.code === '28P01' || error.message.includes('password')) {
      console.log('💡 Error de autenticación. Necesitas configurar la contraseña:');
      console.log('   1. Crea un archivo .env en la carpeta backend');
      console.log('   2. Añade la siguiente línea:');
      console.log('      DB_PASSWORD=tu_contraseña_de_postgres');
      console.log('   3. Si no tienes contraseña, puedes configurarla en PostgreSQL');
    } else {
      console.log('💡 Revisa tu configuración en el archivo .env');
      console.log('   Crea backend/.env con las siguientes variables:');
      console.log('   DB_HOST=localhost');
      console.log('   DB_PORT=5432');
      console.log('   DB_NAME=stock');
      console.log('   DB_USER=postgres');
      console.log('   DB_PASSWORD=tu_contraseña');
    }
    
    process.exit(1);
  } finally {
    await client.end();
  }
}

testConnection();

