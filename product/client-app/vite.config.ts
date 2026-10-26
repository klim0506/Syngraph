import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api goes to the core API, so the browser sees one origin and the core needs no CORS.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:8000" },
  },
});
