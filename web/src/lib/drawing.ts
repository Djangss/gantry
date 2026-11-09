export type DrawingFile = {
  elements: unknown[];
  appState?: Record<string, unknown>;
  files?: Record<string, unknown>;
  links: string[];
  [k: string]: unknown;
};

// null means "not a drawing": the editor must refuse rather than open an empty canvas and overwrite the file.
export function parseDrawing(src: string): DrawingFile | null {
  try {
    const d = JSON.parse(src);
    if (!d || typeof d !== "object" || Array.isArray(d)) return null;
    return { ...d, elements: Array.isArray(d.elements) ? d.elements : [], links: Array.isArray(d.links) ? d.links : [] };
  } catch {
    return null;
  }
}

export function withLinks(json: string, links: string[]): string {
  return JSON.stringify({ ...JSON.parse(json), links }, null, 2);
}

export const emptyDrawing = (links: string[]) =>
  JSON.stringify({ type: "excalidraw", version: 2, source: "gantry", elements: [], appState: {}, files: {}, links }, null, 2);
