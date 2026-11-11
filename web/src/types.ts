export type Me = { login: string; notesRepo: string };
export type Repo = { fullName: string; private: boolean };
export type Project = { id: string; title: string; number: number; closed: boolean };
export type Option = { id: string; name: string };
export type Label = { name: string; color: string };
export type Item = {
  id: string;
  optionId: string;
  kind: "Issue" | "PullRequest" | "DraftIssue";
  title: string;
  number?: number;
  repo?: string;
  url?: string;
  state?: string;
  isDraft?: boolean;
  labels: Label[];
};
export type Board = { title: string; fieldId: string; options: Option[]; items: Item[] };
export type Comment = { id: number; user: string; body: string; createdAt: string };
export type PR = {
  merged: boolean;
  draft: boolean;
  reviews: { user: string; state: string }[];
  checks: { name: string; status: string; conclusion: string }[];
};
export type Issue = {
  number: number;
  title: string;
  state: string;
  body: string;
  url: string;
  user: string;
  labels: Label[];
  comments: Comment[];
  pr: PR | null;
};
export type TreeEntry = { path: string; type: "blob" | "tree" };
export type FileData = { content: string; sha: string };
export type LinkEntry = { path: string; title: string; kind: "note" | "drawing" };
export type IssueSummary = {
  number: number;
  repo?: string;
  title: string;
  state: string;
  url: string;
  user: string;
  labels: Label[];
  isPR: boolean;
  isDraft: boolean;
  comments: number;
  updatedAt: string;
};

export type Notification = {
  id: string;
  unread: boolean;
  reason: string;
  title: string;
  type: string;
  repo: string;
  ref: string; // owner/repo#n for issues and PRs, else ""
  updatedAt: string;
};

export type PRFile = { filename: string; status: string; patch: string };
