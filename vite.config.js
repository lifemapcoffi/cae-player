import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    plugins: [react()],
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
      dedupe: ["react", "react-dom", "react-router-dom"],
    },

    // (Optionnel mais recommandé) build un peu plus robuste pour Pages
    build: {
      sourcemap: false,
    },

    server: {
      port: 5173,
      strictPort: true,
      host: true,

      // ✅ On garde le proxy UNIQUEMENT en dev (local confort)
      ...(isDev
        ? {
            proxy: {
              "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
                secure: false,
                rewrite: (p) => p.replace(/^\/api/, ""),
              },
            },
          }
        : {}),

      // ⚠️ On retire allowedHosts trycloudflare : inutile et instable maintenant
      // allowedHosts: ...
    },
  };
});