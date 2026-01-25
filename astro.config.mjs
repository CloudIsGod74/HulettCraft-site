import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  output: "server",
  adapter: cloudflare(),
  vite: {
    resolve: {
      alias: {
        "@config": "/src/config",
      },
    },
  },
});
