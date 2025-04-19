import { findWorkspacePackages } from "./findWorkspacePackages.js";
import { cli } from "../cli.js";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url"; // Needed for dynamic import

// Regular expressions (keep these as they are)
const requireRegex = /require\(['"`]([^'`"]+)['"`]\)/g;
const importRegex =
  /import(?:["'\s]*(?:[\w*{}\n\r\t, ]+)from\s*)?['"`]([^'`"]+)['"`]/g;
const dynamicImportRegex = /import\(['"`]([^'`"]+)['"`]\)/g;

/**
 * Loads workspace data from workspace-index.js.
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {boolean} debug - Whether debug mode is enabled.
 * @returns {Promise<Map<string, {path: string, description: string, exports: object}>>} Map of package names to their info.
 */
async function loadWorkspaceIndex(repoRoot, debug) {
  const workspaceIndexPath = path.join(repoRoot, "workspace-index.js");
  const workspaceIndexUrl =
    pathToFileURL(workspaceIndexPath).href + `?t=${Date.now()}`; // Cache busting

  if (debug) {
    console.log(
      chalk.gray(`  Attempting to load workspace index: ${workspaceIndexPath}`)
    );
  }

  try {
    const workspaceModule = await import(workspaceIndexUrl);
    if (workspaceModule && Array.isArray(workspaceModule.workspaces)) {
      const packageMap = new Map();
      workspaceModule.workspaces.forEach((pkg) => {
        if (pkg && pkg.name && pkg.path) {
          packageMap.set(pkg.name, pkg);
        } else if (debug) {
          console.warn(
            chalk.gray(
              `  Skipping invalid entry in workspace-index.js: ${JSON.stringify(
                pkg
              )}`
            )
          );
        }
      });
      if (debug) {
        console.log(
          chalk.gray(
            `  Successfully loaded ${packageMap.size} packages from workspace index.`
          )
        );
      }
      return packageMap;
    } else {
      if (debug) {
        console.warn(
          chalk.gray(
            `  workspace-index.js loaded but 'workspaces' array not found or invalid.`
          )
        );
      }
      return new Map();
    }
  } catch (error) {
    if (
      debug ||
      (error.code !== "ERR_MODULE_NOT_FOUND" && error.code !== "ENOENT")
    ) {
      console.warn(
        chalk.yellow(
          `  Warning: Could not load or parse ${path.basename(
            workspaceIndexPath
          )}: ${error.message}`
        )
      );
    }
    if (debug && error.code === "ERR_MODULE_NOT_FOUND") {
      console.log(chalk.gray(`  workspace-index.js not found.`));
    }
    return new Map();
  }
}

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
  requestedFile,
  repoRoot,
  includeDependencies,
  debug
) {
  const targetPathsSet = new Set([requestedFile]);
  let processingMode = "file";

  if (includeDependencies) {
    processingMode = "file_with_deps";
    if (debug) {
      console.log(
        chalk.blue(
          `Debug: Analyzing dependencies for ${path.basename(
            requestedFile
          )} using workspace-index.js...`
        )
      );
    }

    const workspacePackagesMap = await loadWorkspaceIndex(repoRoot, debug);

    if (workspacePackagesMap.size === 0 && debug) {
      console.log(
        chalk.gray(
          `  Cannot resolve dependencies as no packages were loaded from workspace-index.js.`
        )
      );
    }

    if (workspacePackagesMap.size > 0) {
      try {
        const content = await fs.readFile(requestedFile, "utf8");
        const dependencyPathsToAdd = new Set();

        const allMatches = [
          ...content.matchAll(requireRegex),
          ...content.matchAll(importRegex),
          ...content.matchAll(dynamicImportRegex),
        ];

        for (const match of allMatches) {
          const moduleSpecifier = match[1];
          if (workspacePackagesMap.has(moduleSpecifier)) {
            const packageInfo = workspacePackagesMap.get(moduleSpecifier);

            const resolvedPath = path.resolve(repoRoot, packageInfo.path);
            dependencyPathsToAdd.add(resolvedPath);
            if (debug) {
              console.log(
                chalk.gray(
                  `  Found indexed dependency: ${moduleSpecifier} -> ${
                    path.relative(repoRoot, resolvedPath) || "."
                  }`
                )
              );
            }
          }
        }

        dependencyPathsToAdd.forEach((depPath) => targetPathsSet.add(depPath));
      } catch (error) {
        console.warn(
          chalk.yellow(
            `Warning: Could not read ${path.basename(
              requestedFile
            )} for dependency analysis: ${error.message}`
          )
        );
      }
    }
  }

  const targetPaths = Array.from(targetPathsSet);

  if (debug) {
    const relativeTargetPaths = targetPaths.map(
      (p) => path.relative(repoRoot, p) || path.basename(p)
    ); // Relative to repoRoot for consistency
    console.log(
      chalk.blue(`Debug: Final target paths (${processingMode} mode):`),
      relativeTargetPaths
    );
  }

  return { targetPaths, processingMode };
}
