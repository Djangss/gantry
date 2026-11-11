import { slugify } from "@/lib/frontmatter";
import type { LinkEntry } from "@/types";

// Mirrors internal/notes/parse.go WikiLinks. Code never reaches here: mdast keeps it in code/inlineCode nodes, not text.
const WIKI = /\[\[([^[\]|]+)(?:\|([^[\]]*))?\]\]/g;

type Node = { type: string; value?: string; url?: string; children?: Node[]; data?: unknown };

// One slug rule everywhere: the one that names created notes (and internal/notes Slugify).
export const slugOf = (path: string) => slugify((path.split("/").pop() ?? "").replace(/\.[^.]*$/, ""));

// remarkWiki turns [[slug]] and [[slug|label]] into links. Known slugs open the note; unknown ones start creating it.
export function remarkWiki(repo: string, notes: LinkEntry[], current = "") {
  const paths = new Map<string, string>();
  for (const n of notes) if (!paths.has(slugOf(n.path))) paths.set(slugOf(n.path), n.path);
  const base = `/files/${repo}`;
  const link = (m: RegExpExecArray): Node => {
    const slug = slugify(m[1]);
    const path = paths.get(slug);
    return {
      type: "link",
      url: path ? `${base}?path=${encodeURIComponent(path)}` : `${base}?${current ? `path=${encodeURIComponent(current)}&` : ""}new=note&name=${encodeURIComponent(m[1].trim())}`,
      data: path ? {} : { hProperties: { title: `Create note ${slug}`, className: "wiki-new" } },
      children: [{ type: "text", value: (m[2] ?? m[1]).trim() }],
    };
  };
  const walk = (node: Node) => {
    if (!node.children || node.type === "link") return;
    node.children = node.children.flatMap((c) => {
      if (c.type !== "text" || !c.value) return [c];
      const out: Node[] = [];
      let last = 0;
      for (const m of c.value.matchAll(WIKI)) {
        if (m.index > last) out.push({ type: "text", value: c.value.slice(last, m.index) });
        out.push(link(m));
        last = m.index + m[0].length;
      }
      if (!out.length) return [c];
      if (last < c.value.length) out.push({ type: "text", value: c.value.slice(last) });
      return out;
    });
    node.children.forEach(walk);
  };
  return () => walk;
}
