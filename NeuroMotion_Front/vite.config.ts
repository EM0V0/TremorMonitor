import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import * as path from 'path'
import * as fs from 'fs'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@contexts': path.resolve(__dirname, './src/contexts'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@layouts': path.resolve(__dirname, './src/layouts'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@services': path.resolve(__dirname, './src/services'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@assets': path.resolve(__dirname, './src/assets'),
    },
  },
  server: {
    port: 3000,
    host: 'localhost',
    
    // HTTPS configuration for secure local development
    https: {
      // Load PFX certificate (PKCS#12 format) from local filesystem
      pfx: fs.readFileSync('./certs/https.pfx'),
      // Password for the PFX certificate
      passphrase: 'password' // Could also use environment variable for this
    },
    
    // Proxy API requests to the backend server
    proxy: {
      '/api': {
        // Forward requests to the backend HTTPS server
        target: 'https://localhost:5038',
        // Allow changing the Origin header to match the target
        changeOrigin: true,
        // Skip certificate validation for self-signed certificates in development
        secure: false,
      }
    },
    
    open: true, // Automatically open browser on start
  },
}) 