import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const basePath = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,
  root: path.resolve(__dirname),
  plugins: [react()],
  server: {
    fs: {
      allow: [path.resolve(__dirname), path.resolve(__dirname, "../src"), path.resolve(__dirname, "../data")]
    }
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "../src")
    }
  },
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  }
});
