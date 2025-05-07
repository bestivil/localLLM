import { glob } from "glob";
import fs from "fs";
import path from "path";

const excludedExtensions = [".json"];

let fileIndex = [];
let isIndexed = false;

/**
 * Builds an index of all files in the given repository path.
 * @param {string} repositoryPath The absolute path to the repository.
 * @returns {Promise<void>}
 */
async function buildFileIndex(repositoryPath) {
  const files = [];
  for await (const file of glob.stream("**/*", {
    cwd: repositoryPath,
    ignore: ["**/node_modules/**", "**/.git/**"],
    dot: false,
    absolute: true,
  })) {
    files.push(file);
  }

  fileIndex = files
    .filter((file) => {
      try {
        return (
          fs.statSync(file).isFile() &&
          !excludedExtensions.some((ext) => file.endsWith(ext))
        );
      } catch (error) {
        return false;
      }
    })
    .map((file) => path.relative(repositoryPath, file));

  isIndexed = true;

  console.log(`Indexed ${fileIndex.length} files.`);
}

/**
 * Searches the file index for files matching the search term.
 * @param {string} searchTerm The term to search for.
 * @returns {string[]} An array of matching file paths (relative to repository root).
 */
function searchFileIndex(searchTerm) {
  if (!isIndexed) {
    console.warn(
      "File index has not been built yet. Please call buildFileIndex first."
    );
    return [];
  }

  if (!searchTerm) {
    return [...fileIndex];
  }

  return fileIndex.filter((file) =>
    file.toLowerCase().includes(searchTerm.toLowerCase())
  );
}

/**
 * Checks if the index has been built.
 * @returns {boolean}
 */
function isIndexReady() {
  return isIndexed;
}

export { buildFileIndex, searchFileIndex, isIndexReady };
