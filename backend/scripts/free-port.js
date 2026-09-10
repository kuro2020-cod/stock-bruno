/**
 * Libera el puerto del backend antes de arrancar (evita EADDRINUSE en Windows).
 * Uso: node scripts/free-port.js
 */
import { execSync } from 'child_process';

const port = String(process.env.PORT || 3001);

function pidsEnPuerto() {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf8' });
    const pids = new Set();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes('LISTENING')) continue;
      const parts = line.trim().split(/\s+/);
      const pid = parts[parts.length - 1];
      if (pid && pid !== '0') pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

const pids = pidsEnPuerto();
if (pids.length === 0) {
  console.log(`Puerto ${port}: libre.`);
  process.exit(0);
}

for (const pid of pids) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
    console.log(`Puerto ${port}: proceso ${pid} terminado.`);
  } catch {
    console.warn(`No se pudo terminar PID ${pid}.`);
  }
}
