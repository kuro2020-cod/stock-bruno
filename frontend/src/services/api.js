import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json'
  }
})

api.interceptors.request.use((config) => {
  const raw = localStorage.getItem('auth')
  if (raw) {
    try {
      const { token } = JSON.parse(raw)
      if (token) {
        config.headers.Authorization = `Bearer ${token}`
      }
    } catch {
      /* ignore */
    }
  }
  return config
})

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      const url = (err.config?.url || '').toString()
      // Errores de APIs externas / auxiliares no deben cerrar la sesión local.
      if (
        !url.includes('/auth/login') &&
        !url.includes('/mercadopago')
      ) {
        localStorage.removeItem('auth')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)

export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me')
}

export const productosAPI = {
  getAll: () => api.get('/productos'),
  getById: (id) => api.get(`/productos/${id}`),
  getCodigoSugerido: () => api.get('/productos/codigo-sugerido'),
  getByCodigo: (codigo) =>
    api.get(`/productos/codigo/${encodeURIComponent(String(codigo).trim())}`),
  create: (data) => api.post('/productos', data),
  update: (id, data) => api.put(`/productos/${id}`, data),
  updateCategoria: (id, categoria_id) => api.put(`/productos/${id}/categoria`, { categoria_id }),
  delete: (id) => api.delete(`/productos/${id}`),
  getLowStock: () => api.get('/productos/stock/bajo'),
  getVencimientosAlerta: () => api.get('/productos/vencimientos/alerta')
}

export const categoriasAPI = {
  getAll: () => api.get('/categorias'),
  getById: (id) => api.get(`/categorias/${id}`),
  create: (data) => api.post('/categorias', data),
  update: (id, data) => api.put(`/categorias/${id}`, data),
  delete: (id) => api.delete(`/categorias/${id}`)
}

export const movimientosAPI = {
  getAll: (params) => api.get('/movimientos', { params }),
  getMisVentas: (params) => api.get('/movimientos/mis-ventas', { params }),
  getByProducto: (productoId) => api.get(`/movimientos/producto/${productoId}`),
  create: (data) => api.post('/movimientos', data),
  getStats: () => api.get('/movimientos/stats/diarias')
}

export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats')
}

export const dashboardContadoresAPI = {
  getAll: () => api.get('/dashboard-contadores'),
  create: (data) => api.post('/dashboard-contadores', data),
  delete: (id) => api.delete(`/dashboard-contadores/${id}`)
}

export const estadisticasAPI = {
  getVentas: (periodo, mes) =>
    api.get('/estadisticas/ventas', {
      params: mes ? { periodo, mes } : { periodo }
    })
}

export const ventasAPI = {
  registrar: (data) => api.post('/ventas', data)
}

export const cafeMaquinaAPI = {
  getResumen: (params) => api.get('/cafe-maquina/resumen', { params }),
  reiniciar: () => api.post('/cafe-maquina/reiniciar')
}

export const milanesasAPI = {
  getResumen: (params) => api.get('/milanesas/resumen', { params })
}

export const sandwichMilanesasAPI = {
  getResumen: (params) => api.get('/sandwich-milanesas/resumen', { params })
}

export const rollitosJamonQuesoAPI = {
  getResumen: (params) => api.get('/rollitos-jamon-queso/resumen', { params })
}

export const cigarrillosAPI = {
  getResumen: (params) => api.get('/cigarrillos/resumen', { params })
}

export const cierreCajaAPI = {
  getResumen: (fecha) =>
    api.get('/cierre-caja/resumen', {
      params: fecha ? { fecha } : undefined
    }),
  lista: (params) => api.get('/cierre-caja/lista', { params }),
  cerrar: (data) => api.post('/cierre-caja/cerrar', data)
}

export const cajaAPI = {
  getApertura: () => api.get('/caja/apertura'),
  abrir: (data) => api.post('/caja/apertura', data)
}

export const pagosProveedoresAPI = {
  listar: (params) => api.get('/pagos-proveedores', { params }),
  registrar: (data) => api.post('/pagos-proveedores', data),
  eliminar: (id) => api.delete(`/pagos-proveedores/${id}`)
}

export const promocionesAPI = {
  getAll: () => api.get('/promociones'),
  getActivas: () => api.get('/promociones/activas'),
  getById: (id) => api.get(`/promociones/${id}`),
  create: (data) => api.post('/promociones', data),
  update: (id, data) => api.put(`/promociones/${id}`, data),
  delete: (id) => api.delete(`/promociones/${id}`)
}

export const usuariosAPI = {
  getAll: () => api.get('/usuarios'),
  getById: (id) => api.get(`/usuarios/${id}`),
  create: (data) => api.post('/usuarios', data),
  update: (id, data) => api.put(`/usuarios/${id}`, data),
  delete: (id) => api.delete(`/usuarios/${id}`)
}

export const incidenciasAPI = {
  listar: (params) => api.get('/incidencias', { params }),
  registrar: (data) => api.post('/incidencias', data)
}

export const retirosAPI = {
  listar: (params) => api.get('/retiros', { params }),
  efectivo: (data) => api.post('/retiros/efectivo', data),
  mercaderia: (data) => api.post('/retiros/mercaderia', data),
  mercaderiaLote: (data) => api.post('/retiros/mercaderia-lote', data)
}

export const ingresosEfectivoAPI = {
  listar: (params) => api.get('/ingresos-efectivo', { params }),
  registrar: (data) => api.post('/ingresos-efectivo', data)
}

export const faltantesAPI = {
  listar: (params) => api.get('/faltantes', { params }),
  registrar: (data) => api.post('/faltantes', data)
}

export const reporteFaltantesAPI = {
  getConfig: () => api.get('/reporte-faltantes/config'),
  saveConfig: (data) => api.put('/reporte-faltantes/config', data),
  enviarAhora: () => api.post('/reporte-faltantes/enviar-ahora')
}

export const pedidosAPI = {
  enviar: (data) => api.post('/pedidos/enviar', data)
}

export const fiadosAPI = {
  listar: (params) => api.get('/fiados', { params }),
  resumen: (params) => api.get('/fiados/resumen', { params }),
  clientes: (params) => api.get('/fiados/clientes', { params }),
  cobrar: (id, data) => api.post(`/fiados/${id}/cobrar`, data),
  cobrarCliente: (data) => api.post('/fiados/cobrar-cliente', data),
  pagar: (data) => api.post('/fiados/pago-parcial', data),
  /** @deprecated Usar pagar — mismo endpoint unificado (total o parcial). */
  pagoParcial: (data) => api.post('/fiados/pago-parcial', data)
}

export const mercadopagoAPI = {
  estado: () => api.get('/mercadopago/estado'),
  movimientos: (params) =>
    api.get('/mercadopago/movimientos', {
      params,
      timeout: 60000
    }),
  crearOrdenQr: (data) => api.post('/mercadopago/qr/orden', data, { timeout: 30000 }),
  consultarOrdenQr: (id) => api.get(`/mercadopago/qr/orden/${encodeURIComponent(id)}`, { timeout: 20000 }),
  cancelarOrdenQr: (id) =>
    api.post(`/mercadopago/qr/orden/${encodeURIComponent(id)}/cancel`, {}, { timeout: 20000 })
}

export const asistenteAPI = {
  estado: () => api.get('/asistente/estado'),
  plan: (texto) => api.post('/asistente/plan', { texto }),
  ejecutar: (planId) => api.post('/asistente/ejecutar', { plan_id: planId })
}

export default api

