import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

// CodeMirror styled from the app's CSS tokens, so it follows light and dark without its own palette.
const view = (dark: boolean) =>
  EditorView.theme(
    {
      "&": { backgroundColor: "var(--card)", color: "var(--foreground)" },
      ".cm-content": { caretColor: "var(--ring)", fontFamily: "var(--font-mono)", padding: "12px 0" },
      ".cm-line": { padding: "0 16px" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ring)" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
        backgroundColor: "color-mix(in srgb, var(--hazard) 30%, transparent)",
      },
      ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--muted) 45%, transparent)" },
      ".cm-gutters": { backgroundColor: "var(--card)", color: "color-mix(in srgb, var(--muted-foreground) 60%, transparent)", border: "none" },
      ".cm-gutterElement": { paddingLeft: "12px" },
      // The active line number gets the yellow tick: it's where you're typing.
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
      ".cm-lineNumbers .cm-activeLineGutter": { boxShadow: "inset 3px 0 0 var(--hazard)" },
    },
    { dark },
  );

const highlight = HighlightStyle.define([
  { tag: t.heading, fontWeight: "700", color: "var(--foreground)" },
  { tag: t.heading1, fontSize: "1.15em" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  { tag: [t.link, t.url], color: "var(--ring)", textDecoration: "underline" },
  { tag: t.monospace, color: "var(--go)" },
  { tag: t.quote, color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: "var(--muted-foreground)" },
]);

export const editorTheme = (dark: boolean) => [view(dark), syntaxHighlighting(highlight)];
