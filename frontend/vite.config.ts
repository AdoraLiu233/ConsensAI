import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import generouted from '@generouted/react-router/plugin'
import tsconfigPaths from 'vite-tsconfig-paths'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // @ts-expect-error process is a node global
  const env = loadEnv(mode, process.cwd(), '')
  const target = env.VITE_API_BASE_URL || 'http://183.173.141.217:8000'

  return {
    plugins: [
      react(),
      generouted(),
      tsconfigPaths(),
    ],
    server: {
      proxy: {
        '/api': {
          target: target,
          changeOrigin: true,
        },
        '/token': {
          target: target,
          changeOrigin: true,
        },
        '/socket.io': {
          target: target,
          ws: true,
          changeOrigin: true,
        }
      }
    }
  }
})
