// Readable, collision-free paths inside the archive. Names come from user data
// (item names, original file names), so every segment is sanitized: no path
// separators, no control characters, no characters Windows refuses, no
// leading dots, no reserved device names, bounded length.

const EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
};

const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/** One path segment from free text; `fallback` when nothing is left. */
export function safeSegment(text: string | null | undefined, fallback: string, max = 60): string {
  let s = (text ?? "")
    .normalize("NFC")
    // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if ([...s].length > max) s = [...s].slice(0, max).join("").trim();
  if (!s || RESERVED.test(s)) return fallback;
  return s;
}

/** File name for an attachment: its original name (sanitized) with the extension of its type. */
export function attachmentFileName(
  originalName: string | null,
  mime: string,
  kind: string,
): string {
  const ext = EXT[mime] ?? "";
  const base = (originalName ?? "").replace(/\.[^.]{1,8}$/, "");
  return `${safeSegment(base, kind, 80)}${ext}`;
}

/** Hands out each path once; a taken path gets " (2)", " (3)" … before the extension. */
export function createPathAllocator() {
  const taken = new Set<string>();
  return (wanted: string): string => {
    const key = (p: string) => p.toLowerCase(); // case-insensitive file systems
    if (!taken.has(key(wanted))) {
      taken.add(key(wanted));
      return wanted;
    }
    const slash = wanted.lastIndexOf("/");
    const dot = wanted.lastIndexOf(".");
    const cut = dot > slash + 1 ? dot : wanted.length;
    for (let n = 2; ; n++) {
      const p = `${wanted.slice(0, cut)} (${n})${wanted.slice(cut)}`;
      if (!taken.has(key(p))) {
        taken.add(key(p));
        return p;
      }
    }
  };
}
