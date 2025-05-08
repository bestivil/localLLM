import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { pathToFileURL } from "url";

export const createWorkspaceIndex = async (allPackages, repoPath, debug) => {
  const workspaceIndexPath = path.join(repoPath, "workspace-index.js");
  if (allPackages.size > 0) {
    const workspaceData = Array.from(allPackages.entries()).map(
      ([name, packageInfo]) => ({
        name: name,
        path: `./${path
          .relative(repoPath, packageInfo.path)
          .replace(/\\\\/g, "/")}`,
        description: packageInfo.description || "",
        exports: packageInfo.exports || {},
      })
    );
    const fileContent = JSON.stringify(workspaceData, null, 2);
    try {
      await fs.writeFile(workspaceIndexPath, fileContent);
      if (debug) {
        console.log(
          chalk.green(
            `Successfully generated ${path.basename(workspaceIndexPath)}`
          )
        );
      }
    } catch (writeError) {
      console.warn(
        chalk.yellow(
          `Warning: Failed to write ${path.basename(workspaceIndexPath)}: ${
            writeError.message
          }`
        )
      );
    }
  } else if (debug) {
    console.log(
      chalk.blue(
        "Debug: No packages found, skipping workspace-index.js generation."
      )
    );
  }
};

/**
 * Loads workspace data from workspace-index.js.
 * @param {string} repoRoot - Absolute path to the repository root.
 * @param {boolean} debug - Whether debug mode is enabled.
 * @returns {Promise<Map<string, {path: string, description: string, exports: object}>>} Map of package names to their info.
 */
export async function loadWorkspaceIndex(repoRoot, debug) {
  const workspaceIndexPath = path.join(repoRoot, "workspace-index.js");

  if (debug) {
    console.log(
      chalk.gray(`  Attempting to load workspace index: ${workspaceIndexPath}`)
    );
  }

  try {
    const fileContent = await fs.readFile(workspaceIndexPath, "utf8");
    const workspaceData = JSON.parse(fileContent);
    const packageMap = new Map();
    workspaceData.forEach((pkg) => {
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
