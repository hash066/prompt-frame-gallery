import path from "path";

// https://vitejs.dev/config/
export default {
  server: {
    host: "::",
    port: 3000,
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
