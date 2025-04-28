#!/usr/bin/env node

import inquirer from "inquirer";
import fs from "fs";
import path from "path";
import { glob } from "glob";
import { exec } from "child_process";
import { promisify } from "util";

const excludedExtensions = [".json"];

const execAsync = promisify(exec);
/**
 * Checks if the given path is a valid Git repository directory.
 * @param {string} dirPath The path to check.
 * @returns {boolean} True if it's a Git repository, false otherwise.
 */
function isGitRepository(dirPath) {
  try {
    const stats = fs.statSync(dirPath);
    if (!stats.isDirectory()) {
      return false;
    }

    const gitPath = path.join(dirPath, ".git");
    const gitStats = fs.statSync(gitPath);
    return gitStats.isDirectory();
  } catch (error) {
    return false;
  }
}

/**
 * Prompts the user to search for and select a file from the repository.
 * @returns {Promise<string>} The selected file name.
 */
async function getFile(repositoryPath) {
  const { file } = await inquirer.prompt([
    {
      type: "search",
      name: "file",
      message: "Search for a file:",
      source: async (searchTerm) => {
        const files = await glob("**/*", {
          cwd: repositoryPath,
          ignore: ["**/node_modules/**", "**/.git/**"],
          dot: false,
        });

        const fileNames = files
          .map((file) => {
            const fullPath = path.join(repositoryPath, file);
            return fs.statSync(fullPath).isFile() &&
              !excludedExtensions.some((ext) => file.endsWith(ext))
              ? file
              : null;
          })
          .filter(Boolean);
        const uniqueNames = [...new Set(fileNames)];

        if (!searchTerm) return uniqueNames;

        return uniqueNames
          .filter((name) =>
            name.toLowerCase().includes(searchTerm.toLowerCase())
          )
          .slice(0, 5);
      },
    },
  ]);
  return file;
}

/**
 * Main function to run the CLI tool.
 */
async function run() {
  const { repositoryPath } = await inquirer.prompt([
    {
      type: "input",
      name: "repositoryPath",
      message: "Enter the path to your Git repository:",
    },
  ]);

  const absolutePath = path.resolve(repositoryPath);
  if (!absolutePath) {
    console.error("No repository path entered. Exiting.");
    process.exit(1);
  }

  if (!isGitRepository(absolutePath)) {
    console.error(
      `\nError: '${absolutePath}' is not a valid Git repository directory.`
    );
  }

  const selectedFiles = [];
  let addAnother = true;

  while (addAnother) {
    const file = await getFile(absolutePath);
    selectedFiles.push(file);

    const { addMore } = await inquirer.prompt([
      {
        type: "confirm",
        name: "addMore",
        message: "Add another file?",
      },
    ]);

    addAnother = addMore;
  }

  const { addDependencies } = await inquirer.prompt([
    {
      type: "confirm",
      name: "addDependencies",
      message: "Add dependencies?",
    },
  ]);

  const fileArgs = selectedFiles
    .map((f) => `-f ${path.join(absolutePath, f)}`)
    .join(" ");
  const singleFlag = !addDependencies ? " -single" : "";

  const command = `node cli.js ${absolutePath} ${fileArgs}${singleFlag}`;
  console.log(`\nRunning command: ${command}`);
  await execAsync(command);

  process.exit(0);
}

run().catch((error) => {
  console.error("An unexpected error occurred:", error);
  process.exit(1);
});
