// Export archive (GET /api/v1/export): shared constants and shapes. The layout
// of the archive is documented in docs/export-format.md; bump
// EXPORT_FORMAT_VERSION whenever a file or field changes meaning.

export const EXPORT_FORMAT = "hausmeister-export";
export const EXPORT_FORMAT_VERSION = 1;
export const EXPORT_URL = "/api/v1/export";

export type ExportScopeName = "all" | "own_and_household";

export type ExportPhase = "data" | "files" | "tables" | "finishing";

export type ExportProgress = {
  startedAt: Date;
  phase: ExportPhase;
  bytesWritten: number;
  filesDone: number;
  filesTotal: number;
};

export type ExportCounts = {
  items: number;
  itemTypes: number;
  locations: number;
  tags: number;
  attachments: number;
  files: number;
  missingFiles: number;
  events: number;
  grants: number;
  users: number;
  groups: number;
};

/** What /admin/export shows before and while an export runs. */
export type ExportInfo = {
  scope: ExportScopeName;
  estimate: { items: number; attachments: number; fileBytes: number };
  active: ExportProgress | null;
  last: { finishedAt: Date; completed: boolean; bytes: number } | null;
};
