export type Ref = { owner: string; repo: string; number: number };

export function parseRef(ref: string): Ref | null {
  const m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(ref.trim());
  return m ? { owner: m[1], repo: m[2], number: Number(m[3]) } : null;
}
