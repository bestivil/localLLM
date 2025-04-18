import fs from "fs/promises";
import path from "path";
import { filesize as formatFileSize } from "filesize";
import { isBinaryFile } from "isbinaryfile";
import chalk from "chalk";
import { cli } from "../cli.js";

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

    return { output, processedFiles, skippedFiles };
  } catch (error) {
    if (process.env.NODE_ENV !== "test" && !cli.flags.debug) {
      console.error(chalk.red("Failed to process files."));
    }
    throw error;
  }
}
