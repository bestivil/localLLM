import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import { cli } from "../cli.js";

const execAsync = promisify(exec);

/**
 * Validates the command line input, checking if it's a file or a git repository directory.
 * @param {string[]} input - Command line arguments
 * @returns {Promise<{resolvedPaths: string[]}>} Validated paths
 * @throws {Error} If input is missing, path doesn't exist, or it's a non-git directory.
 */
export async function validateIsFiles(input, fileNames) {
  if (!input || input.length === 0) {
    throw new Error("Local repository path is required");
  }

  try {
    const filesToCheck = [...fileNames];
    const fileResults = await Promise.all(
      filesToCheck.map(async (fileName) => {
        const stats = await fs.stat(fileName);
        return { fileName, stats };
      })
    );

    const allFiles = fileResults
      .filter((result) => result.stats.isFile())
      .map((result) => result.fileName);
    return {
      resolvedPaths: allFiles,
    };
  } catch (error) {
    throw error;
  }
}
