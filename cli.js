#!/usr/bin/env node

import meow from "meow";
import chalk from "chalk";
import fs from "fs/promises";
import path from "path";
import { processFiles } from "./helpers/processFiles.js";
import { validateInput } from "./helpers/validateInput.js";
import { handleModuleFlag } from "./helpers/handleModuleFlag.js";
import { createWorkspaceIndex } from "./helpers/workspaceIndex.js";
import { findWorkspacePackages } from "./helpers/findWorkspacePackages.js";
import { handleFileFlag } from "./helpers/handleFileFlag.js";
const helpText = `
  ${chalk.bold("Usage")}
    $ localllm <local-repo-path> [options]

  ${chalk.bold("Options")}
    --output, -o     Specify output file path (default: <repo-name>.txt)
    --threshold, -t  Set file size threshold in MB (default: 10)
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
      default: 10,
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
    file: {
      type: "string",
      shortFlag: "f",
    },
    onlyExtractSingleFile: {
      type: "boolean",
      default: false,
      shortFlag: "single",
    },
    includeDependencies: {
      type: "boolean",
      default: false,
      shortFlag: "d",
    },
    directDeps: {
      type: "boolean",
      default: false,
      shortFlag: "a",
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
    const fileFlag = cli.flags.file;
    const outputFlag = cli.flags.output;
    const modulesFlag = cli.flags.modules;
    const debugFlag = cli.flags.debug;
    const onlyExtractSingleFileFlag = cli.flags.onlyExtractSingleFile;
    const { resolvedPath, type, fileDirectoryName, repoRoot } =
      await validateInput(cli.input, fileFlag);

    let targetPaths = [];
    let processingMode = "unknown";
    let outputPath = outputFlag;
    const repoName = path.basename(repoRoot);
    const onlyExtractSingleFile = onlyExtractSingleFileFlag;

    if (type === "file") {
      targetPaths = onlyExtractSingleFile
        ? [resolvedPath]
        : [fileDirectoryName];
      processingMode = "file";
      if (!outputPath) {
        outputPath = `${repoName}.txt`;
      }
      if (debugFlag) {
        console.log(
          chalk.blue(`Debug: Processing single file: ${resolvedPath}`)
        );
      }
    } else if (type === "directory") {
      if (!outputPath) {
        outputPath = `${repoName}.txt`;
      }
    }

    const allPackages = await findWorkspacePackages(repoRoot);
    await createWorkspaceIndex(allPackages, repoRoot, debugFlag);

    console.log({
      includeDependencies: cli.flags.includeDependencies,
      directDeps: cli.flags.directDeps,
    });

    if (!!fileFlag) {
      const fileResult = await handleFileFlag(
        resolvedPath,
        repoRoot,
        cli.flags.includeDependencies,
        cli.flags.debug,
        cli.flags.directDeps
      );
      targetPaths = fileResult.targetPaths;
      processingMode = fileResult.processingMode;
    } else {
      const moduleResult = await handleModuleFlag(
        allPackages,
        repoRoot,
        modulesFlag,
        debugFlag
      );
      targetPaths = moduleResult.targetPackageDirs;
      processingMode = moduleResult.processingMode;
    }

    if (!outputPath) {
      console.warn(
        chalk.yellow(
          "Warning: Output path could not be determined. Using default 'output.txt'."
        )
      );
      outputPath = "output.txt";
    }

    if (targetPaths.length > 0) {
      let combinedContent = "";
      let totalProcessedFiles = 0;
      let totalSkippedFiles = 0;

      if (process.env.NODE_ENV !== "test" || cli.flags.debug) {
        const displayPaths = targetPaths.map(
          (p) => path.relative(repoRoot, p) || path.basename(p)
        );
        console.log(
          chalk.blue(`Processing targets (${processingMode} mode):`),
          displayPaths
        );
        if (cli.flags.debug) {
          console.log(chalk.blue("Debug: Output path:"), outputPath);
        }
      }

      for (const targetPath of targetPaths) {
        if (process.env.NODE_ENV !== "test" || cli.flags.debug) {
          const displayPath =
            path.relative(repoRoot, targetPath) || path.basename(targetPath);
          console.log(chalk.blue(`--- Processing target: ${displayPath} ---`));
        }
        try {
          const result = await processFiles(targetPath, {
            threshold: cli.flags.threshold,
            includeAll: cli.flags.includeAll,
            debug: cli.flags.debug,
            repoRoot: repoRoot,
          });

          combinedContent += result.output;
          totalProcessedFiles += result.processedFiles;
          totalSkippedFiles += result.skippedFiles;
        } catch (processError) {
          console.error(
            chalk.red(`Error processing ${targetPath}: ${processError.message}`)
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
            : processingMode === "file"
            ? `Warning: No processable text content found in the input file: ${path.basename(
                resolvedPath
              )}. Output file will be empty or not created.`
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
