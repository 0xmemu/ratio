import * as net from 'net';

/**
 * Check apakah sebuah port tersedia (tidak sedang dipakai).
 */
export function isPortAvailable(port: number, host = '0.0.0.0'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, host, () => {
      server.close(() => resolve(true));
    });
  });
}

/**
 * Cari port yang tersedia mulai dari `preferredPort`.
 * Jika port utama sudah dipakai, otomatis coba port berikutnya
 * hingga `maxAttempts` kali.
 *
 * @param preferredPort - Port yang diinginkan (default dari env APP_PORT atau 3000)
 * @param maxAttempts   - Berapa kali maksimal mencoba port berikutnya (default 20)
 * @param host          - Host yang digunakan untuk pengecekan (default '0.0.0.0')
 * @returns Port yang tersedia
 * @throws Error jika tidak ada port tersedia dalam rentang yang dicoba
 *
 * @example
 * const port = await findAvailablePort(3000);
 * // Jika 3000 dipakai -> coba 3001 -> 3002 -> dst
 */
export async function findAvailablePort(
  preferredPort = 3000,
  maxAttempts = 20,
  host = '0.0.0.0',
): Promise<number> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const port = preferredPort + attempt;
    const available = await isPortAvailable(port, host);
    if (available) {
      if (attempt > 0) {
        console.warn(
          `[port-utils] Port ${preferredPort} tidak tersedia. Menggunakan port ${port} sebagai gantinya.`,
        );
      }
      return port;
    }
  }
  throw new Error(
    `[port-utils] Tidak ada port tersedia dalam rentang ${preferredPort}-${
      preferredPort + maxAttempts - 1
    }. Pastikan ada port yang bebas.`,
  );
}
