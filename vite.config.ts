import { fileURLToPath } from "node:url";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `npm run app` builds into dist/ and the Node server serves it on :4300.
// `npm run app:dev` runs Vite on :5173 with hot reload, proxying to that server.
export default defineConfig({
  root: "app",
  plugins: [react(), tailwindcss()],
  // The shadcn components import each other as "@/components/ui/...".
  resolve: { alias: { "@": fileURLToPath(new URL("./app", import.meta.url)) } },
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4300",
      "/files": "http://127.0.0.1:4300",
    },
  },
});
