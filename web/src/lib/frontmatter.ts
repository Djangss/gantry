export type Note = { title: string; links: string[]; body: string };

const unquote = (s: string) => s.replace(/^["']+|["']+$/g, "");

// Mirrors internal/notes/parse.go ParseNote; keep both in sync.
export function splitFrontmatter(src: string): Note {
  const text = src.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return { title: "", links: [], body: src };
  const end = text.indexOf("\n---", 4);
  if (end < 0) return { title: "", links: [], body: src };
  const lines = text.slice(4, end).split("\n");
  let title = "";
  const links: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const c = lines[i].indexOf(":");
    if (c < 0) continue;
    const key = lines[i].slice(0, c).trim();
    const val = lines[i].slice(c + 1).trim();
    if (key === "title") title = unquote(val);
    if (key !== "links") continue;
    if (val.startsWith("[")) {
      for (const l of val.replace(/^\[|\]$/g, "").split(",")) if (unquote(l.trim())) links.push(unquote(l.trim()));
      continue;
    }
    while (i + 1 < lines.length && lines[i + 1].trim().startsWith("- ")) {
      i++;
      const l = unquote(lines[i].trim().slice(2).trim());
      if (l) links.push(l);
    }
  }
  const after = text.indexOf("\n", end + 4);
  return { title, links, body: after < 0 ? "" : text.slice(after + 1) };
}

export const noteTemplate = (title: string, links: string[]) =>
  `---\ntitle: ${title}\nlinks: [${links.join(", ")}]\n---\n\n`;

export const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").normalize("NFC").replace(/[^\p{L}\p{M}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") ||
  "untitled";

// The preview shows the frontmatter title unless the body already opens with an H1.
export const previewTitle = (title: string, body: string) => (/^\s*# /.test(body) ? "" : title);
