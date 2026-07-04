import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Respect an externally assigned port (e.g. preview tooling sets PORT);
// fall back to Vite's default behavior otherwise.
const envPort = Number((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.PORT);

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number.isFinite(envPort) && envPort > 0 ? envPort : 5173,
  },
});
