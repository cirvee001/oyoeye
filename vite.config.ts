import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Node's `process` is available when Vite loads this file, but the app's
// tsconfig only includes browser types. Declare just what we use.
declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5190 },
});
