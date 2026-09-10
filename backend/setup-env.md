# Configuración de PostgreSQL

## Pasos para configurar la conexión

1. **Crea el archivo `.env` en la carpeta `backend/`**

2. **Copia el siguiente contenido y ajusta los valores:**

```env
PORT=3001
NODE_ENV=development

# Configuración de PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=stock
DB_USER=postgres
DB_PASSWORD=tu_contraseña_aqui
```

3. **Reemplaza `tu_contraseña_aqui` con tu contraseña de PostgreSQL**

4. **Si no sabes tu contraseña o no la has configurado:**

   - **Windows (pgAdmin o línea de comandos):**
     ```sql
     ALTER USER postgres PASSWORD 'nueva_contraseña';
     ```

   - **O crea un nuevo usuario:**
     ```sql
     CREATE USER stock_user WITH PASSWORD 'tu_contraseña';
     GRANT ALL PRIVILEGES ON DATABASE stock TO stock_user;
     ```

5. **Asegúrate de que la base de datos `stock` existe:**
   ```sql
   CREATE DATABASE stock;
   ```

6. **Ejecuta el test de conexión:**
   ```bash
   node test-connection.js
   ```

