import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Sanitize Supabase environment variables during build to strip accidental whitespace/newlines
if (process.env.VITE_SUPABASE_ANON_KEY) {
  process.env.VITE_SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY.trim();
}
if (process.env.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL.trim().replace(/\/+$/, '');
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
});
