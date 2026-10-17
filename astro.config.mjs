import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
const localConfig = process.env.HULETTCRAFT_LOCAL_CONFIG;
export default defineConfig({
  site: "https://hulettcraft.com",
  output: "server",
  adapter: cloudflare({
    imageService: "passthrough",
    ...(localConfig
      ? {
          platformProxy: {
            configPath: localConfig,
            persist: {
              path: process.env.HULETTCRAFT_LOCAL_STATE ?? ".wrangler/state/v3",
            },
          },
        }
      : {}),
  }),
  vite: { resolve: { alias: { "@": "/src", "@config": "/src/config" } } },
});
