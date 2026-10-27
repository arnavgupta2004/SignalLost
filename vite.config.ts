import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = env.PORT || '3001';
  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': `http://127.0.0.1:${port}`,
        '/auth': `http://127.0.0.1:${port}`,
        '/ws': { target: `ws://127.0.0.1:${port}`, ws: true },
      },
    },
  };
});
