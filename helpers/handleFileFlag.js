import { getDirectDependencies } from "./getDirectDependencies.js";
import { loadWorkspaceIndex } from "./workspaceIndex.js";
import { getImportsFromFile } from "./importExport.js";
/**
 * Handles the logic when a single file is provided, potentially including its workspace dependencies
 * by referencing workspace-index.js.
 * @param {string} requestedFile - Absolute path to the primary file requested.
 * @param {string} repoRoot - Absolute path to the repository root (where workspace-index.js is located).
 * @param {boolean} includeDependencies - Whether to find and include workspace dependencies.
 * @param {boolean} debug - Whether debug mode is enabled.
 * @returns {Promise<{targetPaths: string[], processingMode: string}>} Paths to process and the mode.
 */
export async function handleFileFlag(
  requestedFiles,
  repoRoot,
  debug,
  onlyExtractFile
) {
  const targetPathsSet = [];

  const workspacePackagesMap = await loadWorkspaceIndex(repoRoot, debug);

  if (onlyExtractFile) {
    targetPathsSet.push(...requestedFiles);
    return { targetPaths: Array.from(targetPathsSet), processingMode: "file" };
  }

  for (const requestedFile of requestedFiles) {
    const directDependencies = await getDirectDependencies(
      requestedFile,
      repoRoot,
      workspacePackagesMap,
      debug
    );
    targetPathsSet.push(...directDependencies);
  }

  return {
    targetPaths: Array.from(targetPathsSet),
    processingMode: "file_with_direct_dependencies",
  };
}
