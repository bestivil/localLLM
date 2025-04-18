import fs from "fs/promises";
import path from "path";
import chalk from "chalk";
import { findWorkspacePackages } from "./findWorkspacePackages.js";

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
    const fileContent = `export const workspaces = ${JSON.stringify(
      workspaceData,
      null,
      2
    )};`;
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
