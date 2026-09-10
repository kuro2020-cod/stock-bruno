# Sistema de Control de Stock

Sistema completo de gestión de inventario con backend en Node.js/Express y frontend en React.

## Características

- ✅ Gestión completa de productos (crear, editar, eliminar)
- ✅ Gestión de categorías con validaciones
- ✅ Control de movimientos de stock (entradas, salidas, ajustes)
- ✅ Dashboard con estadísticas en tiempo real
- ✅ Alertas de stock bajo con vista destacada
- ✅ Búsqueda y filtrado avanzado en productos y movimientos
- ✅ Validaciones robustas en backend y frontend
- ✅ Manejo de errores mejorado con mensajes descriptivos
- ✅ Base de datos SQLite
- ✅ Interfaz moderna y responsive con Tailwind CSS
- ✅ Sistema de filtros por categoría y estado de stock

## Estructura del Proyecto

```
proyecto stock/
├── backend/          # API REST con Express
│   ├── database/     # Configuración de base de datos
│   ├── models/       # Modelos de datos
│   ├── routes/       # Rutas de la API
│   └── server.js     # Servidor principal
└── frontend/         # Aplicación React
    └── src/
        ├── components/  # Componentes reutilizables
        ├── pages/      # Páginas principales
        └── services/   # Servicios API
```

## Instalación

### Prerrequisitos

- Node.js (v16 o superior)
- PostgreSQL (v12 o superior)
- npm o yarn

### Backend

1. Navega a la carpeta backend:
```bash
cd backend
```

2. Instala las dependencias:
```bash
npm install
```

3. Configura las variables de entorno:
```bash
cp .env.example .env
# Edita .env con tus credenciales de PostgreSQL
```

4. Asegúrate de que PostgreSQL esté corriendo y que la base de datos `stock` exista:
```sql
CREATE DATABASE stock;
```

5. Inicia el servidor:
```bash
npm run dev
```

El servidor estará disponible en `http://localhost:3001` y creará automáticamente las tablas necesarias.

### Frontend

1. Navega a la carpeta frontend:
```bash
cd frontend
```

2. Instala las dependencias:
```bash
npm install
```

3. Inicia el servidor de desarrollo:
```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## Uso

1. Inicia primero el backend (puerto 3001)
2. Luego inicia el frontend (puerto 3000)
3. Abre tu navegador en `http://localhost:3000`

## API Endpoints

### Productos
- `GET /api/productos` - Obtener todos los productos
- `GET /api/productos/:id` - Obtener producto por ID
- `POST /api/productos` - Crear nuevo producto
- `PUT /api/productos/:id` - Actualizar producto
- `DELETE /api/productos/:id` - Eliminar producto
- `GET /api/productos/stock/bajo` - Productos con stock bajo

### Categorías
- `GET /api/categorias` - Obtener todas las categorías
- `GET /api/categorias/:id` - Obtener categoría por ID
- `POST /api/categorias` - Crear nueva categoría
- `PUT /api/categorias/:id` - Actualizar categoría
- `DELETE /api/categorias/:id` - Eliminar categoría

### Movimientos
- `GET /api/movimientos` - Obtener todos los movimientos
- `GET /api/movimientos/producto/:productoId` - Movimientos de un producto
- `POST /api/movimientos` - Crear nuevo movimiento
- `GET /api/movimientos/stats/diarias` - Estadísticas diarias

### Dashboard
- `GET /api/dashboard/stats` - Estadísticas generales

## Tecnologías Utilizadas

### Backend
- Node.js
- Express.js
- PostgreSQL (pg)
- CORS

### Frontend
- React 18
- Vite
- React Router
- Tailwind CSS
- Axios
- Lucide React (iconos)

## Base de Datos

El sistema utiliza PostgreSQL. Asegúrate de tener PostgreSQL instalado y crear una base de datos llamada `stock`.

### Configuración de PostgreSQL

1. **Instalar PostgreSQL** (si no lo tienes instalado):
   - Windows: Descarga desde [postgresql.org](https://www.postgresql.org/download/windows/)
   - macOS: `brew install postgresql`
   - Linux: `sudo apt-get install postgresql` (Ubuntu/Debian)

2. **Crear la base de datos**:
   ```sql
   CREATE DATABASE stock;
   ```

3. **Configurar variables de entorno**:
   - Copia `backend/.env.example` a `backend/.env`
   - Edita `backend/.env` con tus credenciales de PostgreSQL:
     ```
     DB_HOST=localhost
     DB_PORT=5432
     DB_NAME=stock
     DB_USER=postgres
     DB_PASSWORD=tu_contraseña
     ```

4. **Las tablas se crean automáticamente** al iniciar el servidor:
   - `categorias` - Categorías de productos
   - `productos` - Productos del inventario
   - `movimientos` - Historial de movimientos de stock

## Mejoras Implementadas

### Funcionalidades Nuevas
- **Búsqueda y Filtrado**: Búsqueda en tiempo real en productos y movimientos con filtros por categoría y tipo
- **Dashboard Mejorado**: Vista de productos con stock bajo directamente en el dashboard
- **Validaciones Robustas**: Validación de datos en backend y frontend con mensajes de error claros
- **Mejor UX**: Indicadores visuales mejorados, feedback claro en acciones y estados de carga

### Mejoras Técnicas
- Validación de códigos únicos de productos
- Validación de nombres únicos de categorías
- Validación de stock antes de realizar salidas
- Manejo mejorado de errores con mensajes descriptivos
- Lógica corregida para ajustes de stock

## Notas

- **Base de datos**: PostgreSQL (nombre de la base de datos: `stock`)
- El archivo `.env` en backend contiene la configuración de conexión a PostgreSQL (ver `.env.example`)
- El frontend está configurado para hacer proxy de las peticiones API al backend
- Para ajustes de stock, ingrese el stock final deseado (no la diferencia)
- Las tablas se crean automáticamente al iniciar el servidor por primera vez

