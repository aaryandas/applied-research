import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } },
    },
  },
  renderer: {
    plugins: [
      react(),
      {
        name: 'renderer-content-security-policy',
        transformIndexHtml(html, context) {
          // Vite's development refresh preamble uses an inline script.
          const policy = context.server
            ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:5173; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'"
            : "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'";
          return html.replace('__CONTENT_SECURITY_POLICY__', policy);
        },
      },
    ],
    server: { host: 'localhost', port: 5173, strictPort: true },
  },
});
