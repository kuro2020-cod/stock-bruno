const LoadingScreen = ({ label = 'Cargando…' }) => (
  <div className="loading-screen">
    <div className="loading-spinner" aria-hidden />
    <p className="text-slate-600 font-medium text-sm">{label}</p>
  </div>
)

export default LoadingScreen
