/**
 * Archive module exports
 */

export {
  findExpiredFacts,
  archiveFacts,
  runArchiveCleanup,
  getArchiveDir,
  getConfigDir,
  setConfigDir,
  loadIdentityV2,
  saveIdentityV2,
  DEFAULT_ARCHIVE_THRESHOLD,
  type CleanupResult,
} from "./archive.js";
