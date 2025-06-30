import { z, defineCollection } from "astro:content";
import { glob } from 'astro/loaders';

const postsCollection = defineCollection({
  loader: glob({ pattern: '**/[^_]*.{md,typ}', base: "./src/posts" }),

  schema: z.object({
    title: z.string(),
    pubDate: z.coerce.date(),
    description: z.string(),
    tags: z.array(z.string()).optional()
  })
});
// Export a single `collections` object to register your collection(s)
export const collections = {
  posts: postsCollection,
};
