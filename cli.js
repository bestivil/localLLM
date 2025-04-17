#!/usr/bin/env node

import meow from "meow";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { filesize as formatFileSize } from "filesize";
import { isBinaryFile } from "isbinaryfile";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const helpText = `
  ${chalk.bold("Usage")}
    $ git2txt <local-repo-path>

  ${chalk.bold("Options")}
    --output, -o     Specify output file path (default: <repo-name>.txt)
    --threshold, -t  Set file size threshold in MB (default: 0.1)
    --include-all    Include all files regardless of size or type
    --debug         Enable debug mode with verbose logging
    --help          Show help
    --version       Show version

  ${chalk.bold("Examples")}
    $ git2txt ./path/to/local/repository
    $ git2txt ../another-repo --output=output.txt
`;

/**
 * Custom exit function that handles both production and test environments
 * @param {number} code - Exit code to return
 * @throws {Error} In test environment instead of exiting
 */
const exit = (code) => {
  if (process.env.NODE_ENV === "test") {
    throw new Error(`Exit called with code: ${code}`);
  } else {
    process.exit(code);
  }
};

export const cli = meow(helpText, {
  importMeta: import.meta,
  flags: {
    output: {
      type: "string",
      shortFlag: "o",
    },
    threshold: {
      type: "number",
      shortFlag: "t",
      default: 0.1,
    },
    includeAll: {
      type: "boolean",
      default: false,
    },
    debug: {
      type: "boolean",
      default: false,
    },
  },
});

/**
 * Validates the command line input, ensuring it's a local git repository path.
 * @param {string[]} input - Command line arguments
 * @returns {Promise<string>} Validated absolute local repository path
 * @throws {Error} If input is missing or invalid
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

/**
 * Processes files in the repository directory and combines them into a single text output
 * @param {string} directory - Path to the repository directory
 * @param {Object} options - Processing options
 * @param {number} options.threshold - File size threshold in MB
 * @param {boolean} options.includeAll - Whether to include all files regardless of size/type
 * @returns {Promise<string>} Combined content of all processed files
 * @throws {Error} If file processing fails
 */
export async function processFiles(directory, options) {
  if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
    console.log(chalk.blue("Processing files..."));
  }
  const thresholdBytes = options.threshold * 1024 * 1024;
  let output = "";
  let processedFiles = 0;
  let skippedFiles = 0;

  /**
   * Recursively processes files in a directory
   * @param {string} dir - Directory to process
   */
  async function processDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (
        entry.isDirectory() &&
        entry.name !== "node_modules" &&
        entry.name !== ".git"
      ) {
        await processDirectory(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      try {
        const stats = await fs.stat(fullPath);

        if (!options.includeAll && stats.size > thresholdBytes) {
          if (process.env.DEBUG)
            console.log(`Skipping large file: ${entry.name}`);
          skippedFiles++;
          continue;
        }

        if (!options.includeAll) {
          if (await isBinaryFile(fullPath)) {
            if (cli.flags.debug)
              console.log(
                `Skipping binary file: ${path.relative(directory, fullPath)}`
              );
            skippedFiles++;
            continue;
          }
        }

        const content = await fs.readFile(fullPath, "utf8");
        const relativePath = path.relative(directory, fullPath);

        output += `\n${"=".repeat(80)}\n`;
        output += `File: ${relativePath}\n`;
        output += `Size: ${formatFileSize(stats.size)}\n`;
        output += `${"=".repeat(80)}\n\n`;
        output += `${content}\n`;

        processedFiles++;

        if (process.env.DEBUG) {
          console.log(`Processed file: ${relativePath}`);
        }
      } catch (error) {
        if (process.env.DEBUG) {
          console.error(`Error processing ${entry.name}:`, error);
        }
        skippedFiles++;
      }
    }
  }

  try {
    await processDirectory(directory);

    if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
      console.log(
        chalk.green(
          `Processed ${processedFiles} files successfully (${skippedFiles} skipped).`
        )
      );
    }

    if (processedFiles === 0 && cli.flags.debug) {
      console.warn(
        "Warning: No text files were processed (check filters/threshold/repo content)."
      );
    }

    return output;
  } catch (error) {
    if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
      console.error(chalk.red("Failed to process files."));
    }
    throw error;
  }
}

/**
 * Writes the processed content to an output file
 * @param {string} content - Content to write
 * @param {string} outputPath - Path to the output file
 * @returns {Promise<void>}
 * @throws {Error} If writing fails
 */
export async function writeOutput(content, outputPath) {
  if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
    console.log(chalk.blue(`Writing output to ${outputPath}...`));
  }
  try {
    await fs.writeFile(outputPath, content);
    if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
      console.log(
        chalk.green(`Output saved successfully to ${chalk.bold(outputPath)}`)
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
      console.error(chalk.red(`Failed to write output file: ${outputPath}`));
    }
    if (process.env.NODE_ENV !== "test") {
      console.error(chalk.red("Write error details:"), error);
    }
    throw error;
  }
}

/**
 * Main application function that orchestrates the entire process
 * @returns {Promise<void>}
 */
export async function main() {
  try {
    const repoPath = await validateInput(cli.input);
    const repoName = path.basename(repoPath);

    if (process.env.NODE_ENV !== "test") {
      const outputPath = cli.flags.output || `${repoName}.txt`;
      if (cli.flags.debug) {
        console.log(
          chalk.blue("Debug: Processing local repository:"),
          repoPath
        );
        console.log(chalk.blue("Debug: Output path:"), outputPath);
      }

      const content = await processFiles(repoPath, {
        threshold: cli.flags.threshold,
        includeAll: cli.flags.includeAll,
      });

      if (!content && !cli.flags.includeAll) {
        console.warn(
          chalk.yellow(
            "Warning: No processable text content found. Output file will be empty or not created."
          )
        );
        if (cli.flags.output) {
          await writeOutput("", outputPath);
          console.log(
            chalk.yellow(
              `Created empty output file at ${outputPath} as specified.`
            )
          );
        } else {
          console.log(
            chalk.yellow(
              "Skipping output file creation as no content was generated and no output path specified."
            )
          );
        }
      } else {
        await writeOutput(content || "", outputPath);
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV === "test") {
      throw error;
    } else {
      console.error(chalk.red("\nAn error occurred:"));
      console.error(error.message || error);

      if (error.message && error.message.includes("ENOENT")) {
        console.error(chalk.yellow("Hint: Check if the provided path exists."));
      } else if (
        error.message &&
        error.message.includes("not a git repository")
      ) {
        console.error(
          chalk.yellow(
            "Hint: The specified directory must be a valid Git repository."
          )
        );
      } else if (error.message && error.message.includes("permission denied")) {
        console.error(
          chalk.yellow(
            "Hint: Check read permissions for the repository directory and its contents."
          )
        );
      }
      exit(1);
    }
  }
}

if (process.env.NODE_ENV !== "test") {
  main();
}
