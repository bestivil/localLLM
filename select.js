#!/usr/bin/env node

import inquirer from "inquirer";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import {
  buildFileIndex,
  searchFileIndex,
  isIndexReady,
} from "./fileIndexer.js";

const execAsync = promisify(exec);

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
        if (!isIndexReady()) {
          console.warn("Index not ready, attempting to build...");
          await buildFileIndex(repositoryPath);
        }
        const results = searchFileIndex(searchTerm);
        return results.slice(0, 10);
      },
    },
  ]);
  return file;
}

/**
 * Main function to run the CLI tool.
 */
async function run() {

  const args = process.argv.slice(2)[0];
  const { repositoryPath } = await inquirer.prompt([
    {
      type: "input",
      name: "repositoryPath",
      message: "Enter the path to your Git repository:",
      default: args ?? '',
    },
  ]);

  const absolutePath = path.resolve(repositoryPath);
  if (!absolutePath) {
    console.error("No repository path entered. Exiting.");
    process.exit(1);
  }


  await buildFileIndex(absolutePath);

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
