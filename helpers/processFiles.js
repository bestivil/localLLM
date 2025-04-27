import fs from "fs/promises";
import path from "path";
import { filesize as formatFileSize } from "filesize";
import { isBinaryFile } from "isbinaryfile";
import chalk from "chalk";
import { exclusions } from "./exclusions.js";

/**
 * Processes files in a target path (file or directory) and combines them into a single text output.
 * @param {string} targetPath - Path to the file or directory to process.
 * @param {Object} options - Processing options
 * @param {number} options.threshold - File size threshold in MB
 * @param {boolean} options.includeAll - Whether to include all files regardless of size/type
 * @param {boolean} options.debug - Whether debug mode is enabled.
 * @param {string} options.repoRoot - The root path for calculating relative paths.
 * @returns {Promise<{output: string, processedFiles: number, skippedFiles: number}>} Combined content and stats.
 * @throws {Error} If file processing fails
 */
export async function processFiles(targetPath, options) {
  if (process.env.NODE_ENV !== "test" && !options.debug) {
    console.log(chalk.blue("Processing files..."));
  }
  const { threshold, includeAll, debug, repoRoot } = options;
  const thresholdBytes = options.threshold * 1024 * 1024;
  let output = "";
  let processedFiles = 0;
  let skippedFiles = 0;

  /**
   * Processes a single file.
   * @param {string} fullPath - Absolute path to the file.
   * @param {import("fs").Stats} stats - File stats object.
   */
  async function processSingleFile(fullPath, stats) {
    try {
      const fileName = path.basename(fullPath);

      if (!includeAll) {
        if (
          exclusions.fileExclusions.includes(fileName) ||
          exclusions.prefixExclusions.some((prefix) =>
            fileName.startsWith(prefix)
          )
        ) {
          if (debug) {
            console.log(
              chalk.gray(
                `Skipping excluded file: ${path.relative(repoRoot, fullPath)}`
              )
            );
          }
          skippedFiles++;
          return;
        }

        if (stats.size > thresholdBytes) {
          if (debug)
            console.log(
              chalk.gray(
                `Skipping large file: ${path.relative(
                  repoRoot,
                  fullPath
                )} (${formatFileSize(stats.size)})`
              )
            );
          skippedFiles++;
          return;
        }

        if (await isBinaryFile(fullPath)) {
          if (debug)
            console.log(
              chalk.gray(
                `Skipping binary file: ${path.relative(repoRoot, fullPath)}`
              )
            );
          skippedFiles++;
          return;
        }
      }

      const content = await fs.readFile(fullPath, "utf8");
      const relativePath = path.relative(repoRoot, fullPath);

      output += `\n${"=".repeat(80)}\n`;
      output += `File: ${relativePath}\n`;
      output += `Size: ${formatFileSize(stats.size)}\n`;
      output += `${"=".repeat(80)}\n\n`;
      output += `${content}\n`;

      processedFiles++;

      if (debug) {
        console.log(`Processed file: ${relativePath}`);
      }
    } catch (error) {
      if (debug) {
        console.error(
          `Error processing ${path.relative(repoRoot, fullPath)}:`,
          error
        );
      }
      skippedFiles++;
    }
  }

  /**
   * Recursively processes files within a directory.
   * @param {string} dir - Directory to process
   */
  async function processDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (
          !includeAll &&
          (exclusions.directoryExclusions.includes(entry.name) ||
            exclusions.prefixExclusions.some((prefix) =>
              entry.name.startsWith(prefix)
            ))
        ) {
          if (debug) {
            console.log(
              chalk.gray(
                `Skipping excluded directory: ${path.relative(
                  repoRoot,
                  fullPath
                )}`
              )
            );
          }
          continue;
        }
        await processDirectory(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;

      try {
        const stats = await fs.stat(fullPath);
        await processSingleFile(fullPath, stats);
      } catch (statError) {
        if (debug) {
          console.error(`Error getting stats for ${fullPath}:`, statError);
        }
        skippedFiles++;
      }
    }
  }

  try {
    const stats = await fs.stat(targetPath);

    if (stats.isFile()) {
      await processSingleFile(targetPath, stats);
    } else if (stats.isDirectory()) {
      await processDirectory(targetPath);
    } else {
      throw new Error(
        `Target path ${targetPath} is neither a file nor a directory.`
      );
    }

    if (processedFiles === 0 && skippedFiles === 0 && debug) {
      console.warn(
        "Warning: No text files were processed (check filters/threshold/repo content)."
      );
    }

    return { output, processedFiles, skippedFiles };
  } catch (error) {
    if (process.env.NODE_ENV !== "test" && !debug) {
      console.error(chalk.red("Failed to process files."));
    }
    throw error;
  }
}
