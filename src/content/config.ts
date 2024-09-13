import { z, defineCollection } from "astro:content";

const postsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    pubDate: z.date(),
    description: z.string(),
    tags: z.array(z.string()).optional()
  })
});
// Export a single `collections` object to register your collection(s)
export const collections = {
  posts: postsCollection,
};
