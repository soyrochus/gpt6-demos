import { defineConfig } from "vite";
const port = Number(process.env.PORT || 3014);
export default defineConfig({
  base: "./",
  server: { host: "127.0.0.1", port, strictPort: true },
  preview: { host: "127.0.0.1", port, strictPort: true },
});
