import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// CodeMirror styled from the app's CSS tokens, so it follows light and dark without its own palette.
const view = (dark: boolean) =>
  EditorView.theme(
    {
      "&": { backgroundColor: "var(--card)", color: "var(--foreground)" },
      ".cm-content": { caretColor: "var(--ring)", fontFamily: "var(--font-mono)" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ring)" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "color-mix(in srgb, var(--hazard) 30%, transparent)",
      },
      ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--muted) 60%, transparent)" },
      ".cm-gutters": { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderRight: "1px solid var(--border)" },
      ".cm-activeLineGutter": { backgroundColor: "var(--accent)" },
    },
    { dark },
  );

const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700", color: "var(--foreground)" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--ring)", textDecoration: "underline" },
  { tag: t.monospace, color: "var(--go)" },
  { tag: t.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--muted-foreground)" },
]);

export const editorTheme = (dark: boolean) => [view(dark), syntaxHighlighting(highlight)];
