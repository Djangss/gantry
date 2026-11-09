import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, errorText } from "@/api";
import type { FileData } from "@/types";
import { clearDraft, loadDraft, saveDraft } from "./drafts";
import { afterSave, contentsUrl, overwrite, saveFile } from "./files";

export function useEditableFile(owner: string, repo: string, path: string, message: string) {
  const key = `${owner}/${repo}/${path}`;
  const qc = useQueryClient();
  const file = useQuery({
    queryKey: ["file", key],
    queryFn: () => api<FileData>(contentsUrl(owner, repo, path)),
    refetchOnWindowFocus: false,
  });
  const [edited, setEdited] = useState<string | null>(null);
  const [sha, setSha] = useState("");
  const [status, setStatus] = useState("");
  const [conflict, setConflict] = useState(false);
  const [draftOffer, setDraftOffer] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0); // bumps when content is replaced from outside the editor
  const value = edited ?? file.data?.content ?? "";
  const dirty = edited !== null && edited !== file.data?.content;

  useEffect(() => {
    if (!file.data) return;
    setSha(file.data.sha);
    const d = loadDraft(key);
    setDraftOffer(d !== null && d !== file.data.content ? d : null);
  }, [file.data, key]);

  const latest = useRef({ value, dirty });
  latest.current = { value, dirty };
  useEffect(() => {
    const keep = () => latest.current.dirty && saveDraft(key, latest.current.value);
    const warn = (e: BeforeUnloadEvent) => {
      if (!latest.current.dirty) return;
      keep();
      e.preventDefault();
    };
    const t = setInterval(keep, 3000);
    window.addEventListener("beforeunload", warn);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", warn);
      keep(); // leaving the file inside the app keeps the latest edit as a draft
    };
  }, [key]);

  function saved(newSha: string, savedValue: string) {
    clearDraft(key);
    qc.setQueryData<FileData>(["file", key], { content: savedValue, sha: newSha });
    setEdited((cur) => afterSave(cur, savedValue));
    setConflict(false);
    setStatus("Saved");
    void qc.invalidateQueries({ queryKey: ["links"] });
  }

  async function save() {
    if (!dirty) return;
    const v = value;
    setStatus("Saving…");
    try {
      const r = await saveFile(owner, repo, path, v, sha, message);
      if (r.ok) saved(r.sha, v);
      else {
        setConflict(true);
        setStatus("");
      }
    } catch (e) {
      setStatus(errorText(e));
    }
  }

  async function overwriteMine() {
    const v = value;
    setStatus("Saving…");
    try {
      const r = await overwrite(owner, repo, path, v, message);
      if (r.ok) saved(r.sha, v);
      else setStatus("Changed again on GitHub. Try again.");
    } catch (e) {
      setStatus(errorText(e));
    }
  }

  async function reloadTheirs() {
    saveDraft(key, value);
    setConflict(false);
    setEdited(null);
    await qc.invalidateQueries({ queryKey: ["file", key] });
    setGeneration((g) => g + 1);
    setStatus("Reloaded. Your version is kept as a draft.");
  }

  function restoreDraft() {
    if (draftOffer === null) return;
    setEdited(draftOffer);
    setDraftOffer(null);
    setGeneration((g) => g + 1);
  }

  function discardDraft() {
    clearDraft(key);
    setDraftOffer(null);
  }

  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setContent = (v: string) => {
    setEdited(v);
    setStatus("");
  };

  return { file, value, setContent, dirty, status, conflict, draftOffer, generation, save, overwriteMine, reloadTheirs, restoreDraft, discardDraft };
}

export type EditableFile = ReturnType<typeof useEditableFile>;
