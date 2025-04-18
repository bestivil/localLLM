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
 * @returns {Promise<string[]>} A promise resolving to an array of absolute paths for the target package directories.
 */
export async function handleWorkspaceMode(repoPath, requestedModules) {
  let targetPackageDirs = [];
  if (cli.flags.debug) {
    console.log(
      chalk.blue(
        "Debug: Modules flag detected. Processing in workspace module mode."
      )
    );
  }

  const allPackages = await findWorkspacePackages(repoPath);

  const workspaceIndexPath = path.join(repoPath, "workspace-index.js");
  try {
    const isWorkspaceIndexExists = await fs.access(workspaceIndexPath);
    if (cli.flags.debug) {
      console.log(
        chalk.blue(
          "Debug: workspace-index.js already exists. Skipping generation."
        )
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      if (allPackages.size > 0) {
        console.log(chalk.blue("workspace-index.js not found. Generating..."));
        const workspaceData = Array.from(allPackages.entries()).map(
          ([name, packageInfo]) => ({
            name: name,
            path: `./${path
              .relative(repoPath, packageInfo.path)
              .replace(/\\/g, "/")}`,
            description: packageInfo.description,
            exports: packageInfo.exports,
          })
        );
        const fileContent = `export const workspaces = ${JSON.stringify(
          workspaceData,
          null,
          2
        )};\n`;
        try {
          await fs.writeFile(workspaceIndexPath, fileContent);
          console.log(
            chalk.green(
              `Successfully generated ${path.basename(workspaceIndexPath)}`
            )
          );
        } catch (writeError) {
          console.warn(
            chalk.yellow(
              `Warning: Failed to write ${path.basename(workspaceIndexPath)}: ${
                writeError.message
              }`
            )
          );
        }
      } else {
        if (cli.flags.debug) {
          console.log(
            chalk.blue(
              "Debug: No packages found, skipping workspace-index.js generation."
            )
          );
        }
      }
    } else {
      console.warn(
        chalk.yellow(
          `Warning: Could not check for ${path.basename(workspaceIndexPath)}: ${
            error.message
          }`
        )
      );
    }
  }

  if (allPackages.size === 0) {
    console.warn(
      chalk.yellow(
        "Warning: No packages found based on pnpm-workspace.yaml. Check the file and patterns."
      )
    );
  } else {
    if (cli.flags.debug) {
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
        console.warn(
          chalk.yellow(
            `Warning: Requested module '${moduleName}' not found in workspace.`
          )
        );
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
  return targetPackageDirs;
}
