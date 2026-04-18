import { defineConfig } from 'astro/config';
import sitemap from "@astrojs/sitemap";
import mdx from '@astrojs/mdx';

// https://astro.build/config
export default defineConfig({
  site: "https://partywump.us",
  vite: {
    ssr: {
      external: ["@myriaddreamin/typst-ts-node-compiler"]
    }
  },
  integrations: [
    mdx(),
    sitemap()
  ],
});
