// Every job handler of the app, registered with the process-wide registry.
// Imported by the startup plugin before the worker starts. A feature adds its
// handlers here (relative imports only: Nitro bundles this outside Vite's `~`).
import { addAttachmentJobs } from "../attachments/jobs";
import { getBlobStore } from "../attachments/storage";
import { jobRegistry } from "./worker";

let done = false;

export function registerAllJobHandlers() {
  if (done) return;
  done = true;
  const registry = jobRegistry();
  addAttachmentJobs(registry, getBlobStore);
}
