import path from "path";

// https://vitejs.dev/config/
export default {
  server: {
    host: "0.0.0.0",
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://host.docker.internal:3001',
        changeOrigin: true,
        secure: false
      }
    }
  },
  plugins: [],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
  },
};
