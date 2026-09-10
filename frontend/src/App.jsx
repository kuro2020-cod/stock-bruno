import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import AdminOnly from './components/AdminOnly'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Productos from './pages/Productos'
import Categorias from './pages/Categorias'
import MovimientosLayout from './pages/movimientos/MovimientosLayout'
import MovimientosHub from './pages/movimientos/MovimientosHub'
import HistorialCierresCaja from './pages/movimientos/HistorialCierresCaja'
import MovimientosRegistro from './pages/movimientos/MovimientosRegistro'
import MisVentas from './pages/movimientos/MisVentas'
import CargaProductos from './pages/CargaProductos'
import BajaProductos from './pages/BajaProductos'
import Incidencias from './pages/Incidencias'
import Estadisticas from './pages/Estadisticas'
import Ventas from './pages/Ventas'
import Usuarios from './pages/Usuarios'
import CierreCaja from './pages/CierreCaja'
import Promociones from './pages/Promociones'
import PagoProveedores from './pages/PagoProveedores'
import Retiros from './pages/Retiros'
import IngresosEfectivo from './pages/IngresosEfectivo'
import Fiados from './pages/Fiados'
import Faltantes from './pages/Faltantes'
import Asistente from './pages/Asistente'
import MercadoPago from './pages/MercadoPago'
import Pedidos from './pages/Pedidos'
import Vencimientos from './pages/Vencimientos'
import LoadingScreen from './components/ui/LoadingScreen'
import { esAccesoLimitado, rutaHome } from './utils/acceso'

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return <LoadingScreen />
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  const limitado = esAccesoLimitado(user)
  const home = rutaHome(user)

  return (
    <Layout>
      <Routes>
        <Route path="/login" element={<Navigate to={home} replace />} />
        <Route
          path="/"
          element={
            user.rol === 'ADMIN' ? <Dashboard /> : <Navigate to={home} replace />
          }
        />
        <Route
          path="/ventas"
          element={limitado ? <Navigate to={home} replace /> : <Ventas />}
        />
        <Route path="/promociones" element={<Promociones />} />
        <Route path="/carga-productos" element={<CargaProductos />} />
        <Route path="/pedidos" element={<Pedidos />} />
        <Route path="/vencimientos" element={<Vencimientos />} />
        <Route
          path="/baja-productos"
          element={
            <AdminOnly>
              <BajaProductos />
            </AdminOnly>
          }
        />
        <Route
          path="/incidencias"
          element={
            <AdminOnly>
              <Incidencias />
            </AdminOnly>
          }
        />
        <Route
          path="/estadisticas"
          element={
            <AdminOnly>
              <Estadisticas />
            </AdminOnly>
          }
        />
        <Route
          path="/productos"
          element={
            <AdminOnly>
              <Productos />
            </AdminOnly>
          }
        />
        <Route
          path="/categorias"
          element={
            <AdminOnly>
              <Categorias />
            </AdminOnly>
          }
        />
        <Route
          path="/asistente"
          element={
            <AdminOnly>
              <Asistente />
            </AdminOnly>
          }
        />
        <Route
          path="/usuarios"
          element={
            <AdminOnly>
              <Usuarios />
            </AdminOnly>
          }
        />
        <Route path="/pago-proveedores" element={<PagoProveedores />} />
        <Route path="/retiros" element={<Retiros />} />
        <Route path="/ingresos-efectivo" element={<IngresosEfectivo />} />
        <Route path="/fiados" element={<Fiados />} />
        <Route path="/faltantes" element={<Faltantes />} />
        <Route path="/mercadopago" element={<MercadoPago />} />
        <Route path="/cierre-caja" element={<CierreCaja />} />
        <Route
          path="/mis-ventas"
          element={
            user.rol === 'USER' ? <MisVentas /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/movimientos"
          element={
            <AdminOnly>
              <MovimientosLayout />
            </AdminOnly>
          }
        >
          <Route index element={<MovimientosHub />} />
          <Route path="cierres" element={<HistorialCierresCaja />} />
          <Route path="registro" element={<MovimientosRegistro />} />
        </Route>
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <Router>
      <AppRoutes />
    </Router>
  )
}

export default App
