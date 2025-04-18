import { findWorkspacePackages } from "./findWorkspacePackages.js";
import { cli } from "../cli.js";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";

/**
 * Handles the logic when the script is run in workspace module mode (-m flag).
 * Finds packages, generates workspace-index.js if needed, filters packages.
 * @param {string} repoPath - Absolute path to the repository root.
 * @param {string[]} requestedModules - Array of module names passed via -m flag.
 * @param {boolean} debug - Whether debug mode is enabled.
 * @returns {Promise<string[]>} A promise resolving to an array of absolute paths for the target package directories.
 */
export async function handleModuleFlag(
  allPackages,
  repoPath,
  requestedModules,
  debug
) {
  if (requestedModules && requestedModules.length === 0) {
    return { targetPackageDirs: [repoPath], processingMode: "repo" };
  }

  let targetPackageDirs = [];
  if (debug) {
    console.log(
      chalk.blue(
        "Debug: Modules flag detected. Processing in workspace module mode."
      )
    );
  }

  if (allPackages.size === 0 && requestedModules.length > 0) {
    console.warn(
      chalk.yellow(
        "Warning: No packages found based on pnpm-workspace.yaml, cannot filter requested modules."
      )
    );
  } else {
    if (debug) {
      console.log(
        chalk.blue("Debug: Filtering packages by modules flag:"),
        requestedModules
      );
    }
    requestedModules.forEach((moduleName) => {
      const packageInfo = allPackages.get(moduleName);
      if (packageInfo) {
        targetPackageDirs.push(packageInfo.path);
      } else {
        if (requestedModules.length > 0) {
          console.warn(
            chalk.yellow(
              `Warning: Requested module '${moduleName}' not found in workspace.`
            )
          );
        }
      }
    });

    if (targetPackageDirs.length === 0 && requestedModules.length > 0) {
      console.warn(
        chalk.yellow(
          "Warning: None of the specifically requested modules were found. No files will be processed."
        )
      );
    }
  }
  return { targetPackageDirs, processingMode: "modules" };
}
