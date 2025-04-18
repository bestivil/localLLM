import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import chalk from "chalk";
import { cli } from "../cli.js";

const execAsync = promisify(exec);

/**
 * Validates the command line input, ensuring it's a local git repository path.
 * @param {string[]} input - Command line arguments
 * @returns {Promise<string>} Validated absolute local repository path
 */
export async function validateInput(input) {
  if (!input || input.length === 0) {
    throw new Error("Local repository path is required");
  }

  const sourcePath = input[0];

  try {
    const stats = await fs.stat(sourcePath);
    if (!stats.isDirectory()) {
      throw new Error(`Path '${sourcePath}' is not a directory.`);
    }

    try {
      await execAsync(`git -C "${sourcePath}" rev-parse --is-inside-work-tree`);

      if (cli.flags.debug) {
        console.log(
          chalk.blue("Debug: Valid local git repository path:"),
          sourcePath
        );
      }
      return path.resolve(sourcePath);
    } catch (gitError) {
      throw new Error(
        `Directory '${sourcePath}' exists but is not a git repository.`
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Local path '${sourcePath}' not found.`);
    }

    throw error;
  }
}
