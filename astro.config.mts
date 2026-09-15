import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import type * as hast from "hast";
import { visit } from "unist-util-visit";

export function rehypeFootnotePopover() {
  return (tree: hast.Root) => {
    // wrap footnote marker in a button
    // tldr:
    // <sup>
    //   <a id="user-content-fnref-N">
    //     N
    //   </a>
    // </sup>
    //
    // ->
    //
    // <button id="user-content-fnref-N" popovertarget=N>
    //   <sup>
    //     N
    //   </sup>
    // </button>
    visit(tree, "element", (node, index, parent) => {
      if (node.tagName !== "sup" || index === undefined || parent === undefined)
        return;

      const link = node.children.find(
        (child): child is hast.Element =>
          child.type === "element" && child.tagName === "a",
      );

      const href = link?.properties?.href;
      if (
        link === undefined ||
        typeof href !== "string" ||
        !href.startsWith("#user-content-fn-")
      ) {
        return;
      }

      const footnoteId = href.slice("#user-content-fn-".length);

      const newNode: hast.ElementContent = {
        type: "element",
        tagName: "button",
        properties: {
          id: link.properties.id,
          class: "footnote-button",
          popovertarget: `footnote-${footnoteId}`,
          style: `--my-anchor:--footnote-${footnoteId}`,
          "aria-describedby": "footnote-label",
        },
        children: [
          {
            type: "element",
            tagName: "sup",
            properties: {},
            children: link.children,
          },
        ],
      };

      parent.children[index] = newNode;
    });

    // wrap footnote text in a popover span
    // tldr:
    // <li id="user-content-fn-N">
    //   <p>
    //     Text
    //     <a>the backref</a>
    //   </p>
    // </li>
    //
    // ->
    //
    // <li id="user-content-fn-N">
    //   <p>
    //     <span popover=N >Text</span>
    //     <a>the backref</a>
    //   </p>
    // </li>
    visit(tree, "element", (node) => {
      if (node.tagName !== "li") return;

      const href = node?.properties.id;
      if (typeof href !== "string" || !href.startsWith("user-content-fn-")) {
        return;
      }

      const footnoteId = href.slice("user-content-fn-".length);

      const footnoteWrapper = node.children.find(
        (child): child is hast.Element =>
          child.type === "element" && child.tagName === "p",
      );

      if (footnoteWrapper === undefined)
        throw new Error(`Footnote is missing p tag`);

      if (footnoteWrapper.children.length < 2)
        throw new Error(
          `Footnote p tag is too short length (${footnoteWrapper.children.length})`,
        );

      const backref =
        footnoteWrapper.children[footnoteWrapper.children.length - 1];

      if (
        backref === undefined ||
        backref.type !== "element" ||
        backref.tagName !== "a"
      )
        throw new Error(`Footnote p tag is missing backref`);

      const newNode: hast.ElementContent = {
        type: "element",
        tagName: "span",
        properties: {
          id: `footnote-${footnoteId}`,
          class: "footnote-popover",
          popover: "auto",
          style: `--my-anchor:--footnote-${footnoteId}`,
        },
        // include all children other than the backref link
        children: footnoteWrapper.children.slice(0, -1),
      };

      footnoteWrapper.children = [newNode, backref];
    });
  };
}

// https://astro.build/config
export default defineConfig({
  site: "https://partywump.us",
  vite: {
    ssr: {
      external: ["@myriaddreamin/typst-ts-node-compiler"],
    },
  },
  integrations: [mdx({ rehypePlugins: [rehypeFootnotePopover] }), sitemap()],
});
