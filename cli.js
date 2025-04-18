#!/usr/bin/env node

import meow from "meow";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { processFiles } from "./helpers/processFiles.js";
import { validateInput } from "./helpers/validateInput.js";
import { handleWorkspaceMode } from "./helpers/handleWorkspaceMode.js";

const execAsync = promisify(exec);

const helpText = `
  ${chalk.bold("Usage")}
    $ localllm <local-repo-path> [options]

  ${chalk.bold("Options")}
    --output, -o     Specify output file path (default: <repo-name>.txt)
    --threshold, -t  Set file size threshold in MB (default: 0.1)
    --include-all    Include all files regardless of size or type
    --modules, -m    Specify specific workspace packages to include (repeatable, e.g., -m pkg1 -m pkg2)
    --debug         Enable debug mode with verbose logging
    --help          Show help
    --version       Show version 
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
    modules: {
      type: "string",
      shortFlag: "m",
      isMultiple: true,
    },
  },
});

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
    const outputPath = cli.flags.output || `${repoName}.txt`;
    let targetPackageDirs = [];
    let processingMode = "repo";

    const requestedModules = cli.flags.modules;

    if (requestedModules && requestedModules.length > 0) {
      processingMode = "modules";
      targetPackageDirs = await handleWorkspaceMode(repoPath, requestedModules);
    } else {
      targetPackageDirs = [repoPath];
      if (cli.flags.debug) {
        console.log(
          chalk.blue(
            "Debug: No modules flag detected. Processing entire repository."
          )
        );
      }
    }

    if (targetPackageDirs.length > 0) {
      let combinedContent = "";
      let totalProcessedFiles = 0;
      let totalSkippedFiles = 0;

      if (process.env.NODE_ENV !== "test" || cli.flags.debug) {
        console.log(
          chalk.blue(`Processing targets (${processingMode} mode):`),
          targetPackageDirs.map((p) => path.relative(repoPath, p) || ".")
        );
        if (cli.flags.debug) {
          console.log(chalk.blue("Debug: Output path:"), outputPath);
        }
      }

      for (const targetDir of targetPackageDirs) {
        if (process.env.NODE_ENV !== "test" || cli.flags.debug) {
          console.log(
            chalk.blue(
              `--- Processing directory: ${
                path.relative(repoPath, targetDir) || "."
              } ---`
            )
          );
        }
        try {
          const result = await processFiles(targetDir, {
            threshold: cli.flags.threshold,
            includeAll: cli.flags.includeAll,
            debug: cli.flags.debug,
            repoRoot: repoPath,
          });

          combinedContent += result.output;
          totalProcessedFiles += result.processedFiles;
          totalSkippedFiles += result.skippedFiles;
        } catch (processError) {
          console.error(
            chalk.red(
              `Error processing directory ${targetDir}: ${processError.message}`
            )
          );
          if (cli.flags.debug) {
            console.error(processError.stack);
          }
        }
      }

      if (process.env.NODE_ENV !== "test" || cli.flags.debug) {
        console.log(
          chalk.green(
            `Total processed files: ${totalProcessedFiles}, Total skipped files: ${totalSkippedFiles}`
          )
        );
      }

      if (!combinedContent && !cli.flags.includeAll) {
        const warningMsg =
          processingMode === "modules"
            ? "Warning: No processable text content found in the selected packages. Output file will be empty or not created."
            : "Warning: No processable text content found in the repository. Output file will be empty or not created.";
        console.warn(chalk.yellow(warningMsg));

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
        await writeOutput(combinedContent || "", outputPath);
      }
    } else {
      console.log(
        chalk.yellow(
          "No packages selected or found for processing. Skipping file processing and output."
        )
      );
      if (cli.flags.output) {
        await writeOutput("", outputPath);
        console.log(
          chalk.yellow(
            `Created empty output file at ${outputPath} as specified, but no packages were processed.`
          )
        );
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
