import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "PORT");
  return {
    server: {
      host: "127.0.0.1",
      port: Number(env.PORT || 3013),
      strictPort: true,
    },
  };
});
