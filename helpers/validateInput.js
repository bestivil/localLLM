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
 * @returns {Promise<{resolvedPath: string, type: 'file' | 'directory'}>} Validated path and its type.
 * @throws {Error} If input is missing, path doesn't exist, or it's a non-git directory.
 */
export async function validateInput(input, fileName) {
  if (!input || input.length === 0) {
    throw new Error("Local repository path is required");
  }

  const sourcePath = input[0];
  const repoRoot = await execAsync(
    `git -C "${sourcePath}" rev-parse --show-toplevel`
  );

  try {
    const stats = await fs.stat(fileName ?? sourcePath);

    if (stats.isFile()) {
      if (cli.flags.debug) {
        console.log(chalk.blue("Debug: Valid file path:"), sourcePath);
      }
      return {
        resolvedPath: fileName,
        type: "file",
        repoRoot: repoRoot.stdout.trim(),
        directoryName: path.dirname(fileName),
      };
    } else if (stats.isDirectory()) {
      try {
        await execAsync(
          `git -C "${sourcePath}" rev-parse --is-inside-work-tree`
        );

        if (cli.flags.debug) {
          console.log(
            chalk.blue("Debug: Valid local git repository directory:"),
            sourcePath
          );
        }
        return {
          resolvedPath: path.resolve(sourcePath),
          type: "directory",
          repoRoot: repoRoot.stdout.trim(),
        };
      } catch (gitError) {
        throw new Error(
          `Directory '${sourcePath}' exists but is not a git repository. Use a file path or a git directory.`
        );
      }
    } else {
      // Should not happen with fs.stat, but handle defensively
      throw new Error(
        `Path '${sourcePath}' is neither a file nor a directory.`
      );
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(`Local path '${sourcePath}' not found.`);
    } else if (error.message.includes("not a git repository")) {
      // Re-throw the specific git error from the inner try-catch
      throw error;
    }
    // Re-throw other fs.stat errors
    throw error;
  }
}
