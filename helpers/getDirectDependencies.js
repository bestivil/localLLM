import fs from "fs/promises";
import path from "path";

import chalk from "chalk";
import { exec } from "child_process";
import { promisify } from "util";
import { getExportsFromFile } from "./importExport.js";

const execAsync = promisify(exec);

/**
 * Finds the absolute paths of files directly imported by a given file.
 * @param {string} filePath - Absolute path to the starting file
 * @param {string} repoRoot - Absolute path to the repository root
 * @param {object} workspaceIndex - The workspace index mapping package names to paths
 * @param {boolean} debugFlag - Whether to enable debug logging
 * @returns {Promise<string[]>} Array containing the original file path and its direct dependencies' absolute paths
 */
export async function getDirectDependencies(
  filePath,
  repoRoot,
  workspaceIndex,
  debugFlag,
  imports
) {
  if (debugFlag) {
    console.log(
      chalk.blue(
        `[Debug] Getting direct dependencies for: ${path.relative(
          repoRoot,
          filePath
        )}`
      )
    );
  }

  const directDependencyPaths = [filePath];

  try {
    for (const importItem of imports) {
      const resolvedPath = await findPackageEntryPointRelativePath(
        importItem.package,
        importItem.function,
        workspaceIndex,
        repoRoot
      );
      if (resolvedPath) {
        directDependencyPaths.push(...resolvedPath);
      }
    }
  } catch (error) {
    console.error(chalk.red(`Error processing file ${filePath}: ${error}`));
    throw error;
  }

  return [...directDependencyPaths];
}

/**
 * Finds the relative path of the main entry point file for a given workspace package.
 * @param {string} packageName - The name of the package (e.g., 'package-a', '@scope/pkg')
 * @param {string} functionName - The name of the imported/exported function
 * @param {object} workspaceIndex - Map of package names to their absolute directory paths
 * @param {string} repoRoot - Absolute path to the repository root
 * @param {boolean} [debugFlag=false] - Enable debug logging
 * @returns {Promise<string|null>} The relative path of the package's entry file from the repo root
 */
async function findPackageEntryPointRelativePath(
  packageName,
  functionName,
  workspaceIndex,
  repoRoot
) {
  const packageInfo = workspaceIndex.get(packageName);
  const packageDir = packageInfo.path;
  const fullPackageDir = path.join(repoRoot, packageDir);
  const extensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];
  const filePathOptions = new Set();
  try {
    const { stdout } = await execAsync(
      `grep -rw "${functionName}" "${fullPackageDir}"`
    );

    if (stdout) {
      const lines = stdout.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        const filePath = line.split(":", 1)[0];
        const hasValidExtension = extensions.some((ext) =>
          filePath.endsWith(ext)
        );

        if (!hasValidExtension) {
          continue;
        }

        const fileExports = await getExportsFromFile(filePath);
        const exportsRequestedFunction =
          fileExports.exports.includes(functionName);

        if (exportsRequestedFunction) {
          const relativePath = path.relative(repoRoot, filePath);
          filePathOptions.add(relativePath);
        }
      }

      return Array.from(filePathOptions);
    }
  } catch (error) {
    if (error.code === 1) {
      return null;
    }
    throw error;
  }
}
