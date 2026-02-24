import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const geminiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(geminiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        target: 'es2020',
        minify: 'esbuild',
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-react': ['react', 'react-dom', 'react-router-dom'],
              'vendor-supabase': ['@supabase/supabase-js'],
              'vendor-charts': ['recharts'],
              'vendor-stripe': ['@stripe/stripe-js', '@stripe/react-stripe-js'],
              'vendor-query': ['@tanstack/react-query'],
              'vendor-icons': ['lucide-react'],
              'vendor-ai': ['@google/genai'],
              'vendor-markdown': ['react-markdown', 'remark-gfm'],
              'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            },
          },
        },
      },
      esbuild: {
        drop: mode === 'production' ? ['console', 'debugger'] : [],
      },
    };
});
