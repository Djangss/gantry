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
    if (!d || typeof d !== "object" || !Array.isArray(d.elements)) return null;
    return { ...d, links: Array.isArray(d.links) ? d.links : [] };
  } catch {
    return null;
  }
}

export function withLinks(json: string, links: string[]): string {
  return JSON.stringify({ ...JSON.parse(json), links }, null, 2);
}

export const emptyDrawing = (links: string[]) =>
  JSON.stringify({ type: "excalidraw", version: 2, source: "gantry", elements: [], appState: {}, files: {}, links }, null, 2);

// null means the scene is back to what was loaded, so there is nothing to save.
export const sceneEdit = (json: string, base: string) => (json === base ? null : json);

// Excalidraw remounts (resetting undo and viewport) only on first load, reload or draft restore, never on save.
export const drawingMountKey = (generation: number, loaded: boolean) => `${generation}:${loaded ? 1 : 0}`;
