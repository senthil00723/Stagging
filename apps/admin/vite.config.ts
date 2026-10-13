import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Separate deployable (admin.g3leads.com). It only ever talks to /admin-api.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { "/admin-api": { target: "http://localhost:4000" } },
  },
});
