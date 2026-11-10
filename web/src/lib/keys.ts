// modLabel is the save-shortcut prefix to show: ⌘ on Apple platforms, Ctrl+ elsewhere.
export const modLabel = (platform: string) => (/Mac|iPhone|iPad/.test(platform) ? "⌘" : "Ctrl+");

export const isSubmit = (e: { key: string; ctrlKey: boolean; metaKey: boolean }) => e.key === "Enter" && (e.ctrlKey || e.metaKey);
