import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/admin": "http://localhost:8001",
      "/api": "http://localhost:8001",
      "/killbill-api": {
        target: "http://localhost:3002",
        rewrite: (path) => path.replace(/^\/killbill-api/, "/api"),
      },
    },
  },
});
