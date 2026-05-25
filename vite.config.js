import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        hh: resolve(__dirname, 'hh-distributors.html'),
        zendure: resolve(__dirname, 'zendure.html'),
        rainbow: resolve(__dirname, 'rainbow.html'),
        cuestionario: resolve(__dirname, 'cuestionario.html'),
        'zendure-standalone': resolve(__dirname, 'zendure-standalone.html'),
      },
    },
  },
})
