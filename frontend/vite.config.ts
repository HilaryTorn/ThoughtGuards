import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import history from 'connect-history-api-fallback';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        fs: {
          allow: ['..'] // Allow serving files from parent directory (for mock_data)
        },
        proxy: {
          '/api': {
            target: 'http://localhost:8787',
            changeOrigin: true,
          }
        },
      },
      // SPA mode - Vite will serve index.html for non-file requests
      appType: 'spa',
      plugins: [
        react(),
        // SPA fallback - must return a function to run AFTER Vite's internal middleware
        {
          name: 'spa-fallback',
          configureServer(server) {
            // Return a function to add middleware AFTER Vite's built-in middleware
            return () => {
              server.middlewares.use(
                history({
                  disableDotRule: true,
                  htmlAcceptHeaders: ['text/html', 'application/xhtml+xml'],
                }) as any
              );
            };
          },
        },
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      publicDir: 'public',
    };
});
