import os from 'os';

/** Direcciones IPv4 de la PC en la red local (sin loopback). */
export function getLocalIPv4Addresses() {
  const nets = os.networkInterfaces();
  const ips = [];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family !== 'IPv4' && net.family !== 4) continue;
      if (net.internal) continue;
      ips.push(net.address);
    }
  }

  return [...new Set(ips)];
}
