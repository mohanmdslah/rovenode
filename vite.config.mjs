import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  // Huawei phones still in use ship Chromium 69-79 WebViews and Huawei Browser
  // builds. Vite's default target keeps ES2020 syntax (`?.`, `??`) that those
  // engines cannot parse at all, which blanks the whole page. Lower it so the
  // bundle runs wherever the injected wallet can run.
  esbuild: {
    target: ["chrome69", "safari14", "firefox68", "edge79"],
  },
  build: {
    target: ["chrome69", "safari14", "firefox68", "edge79"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
