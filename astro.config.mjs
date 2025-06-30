import { defineConfig } from 'astro/config';
import sitemap from "@astrojs/sitemap";
import { typst } from "astro-typst";

// https://astro.build/config
export default defineConfig({
  site: "https://partywump.us",
  vite: {
    ssr: {
      external: ["@myriaddreamin/typst-ts-node-compiler"]
    }
  },
  integrations: [
    typst({
      options: {
        remPx: 14
      },
      target: "html",
    }),
    sitemap()
  ],
});
