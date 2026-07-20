import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/auth": "http://localhost:8001",
      "/api": "http://localhost:8001",
      "/portal": "http://localhost:8001",
      "/admin": "http://localhost:8001",
      "/credentials": "http://localhost:8001",
      "/vault": "http://localhost:8001",
      "/datasources": "http://localhost:8001",
      "/datasource-configs": "http://localhost:8001",
      "/users": "http://localhost:8001",
      "/rbac": "http://localhost:8001",
      "/intents": "http://localhost:8001",
      "/validation-rules": "http://localhost:8001",
      "/demo": "http://localhost:8001",
      "/email-inbox": "http://localhost:8001",
      "/killbill-api": {
        target: "http://localhost:3002",
        rewrite: (path) => path.replace(/^\/killbill-api/, "/api"),
      },
    },
  },
});
