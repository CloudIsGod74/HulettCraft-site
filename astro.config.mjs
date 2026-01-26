import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  site: "https://hulettcraft.com",
  output: "server",
  adapter: cloudflare(),
  vite: {
    resolve: {
      alias: {
	"@": "/src",
        "@config": "/src/config",
      },
    },
  },
});
