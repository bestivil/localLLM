import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { glob } from "glob";
import chalk from "chalk";
import { cli } from "../cli.js";

/**
 * Finds workspace packages defined in pnpm-workspace.yaml
 * @param {string} repoRoot - Absolute path to the repository root
 * @returns {Promise<Map<string, {path: string, description: string}>>} A map of package names to their details
 * @throws {Error} If pnpm-workspace.yaml is missing or invalid, or package.json is missing/invalid
 */
export async function findWorkspacePackages(repoRoot) {
  const workspaceFilePath = path.join(repoRoot, "pnpm-workspace.yaml");
  const packages = new Map();

  try {
    const fileContent = await fs.readFile(workspaceFilePath, "utf8");
    const workspaceConfig = yaml.load(fileContent);

    if (!workspaceConfig || !Array.isArray(workspaceConfig.packages)) {
      throw new Error(
        "Invalid pnpm-workspace.yaml: 'packages' field is missing or not an array."
      );
    }

    const globPatterns = workspaceConfig.packages.map((p) =>
      path.join(repoRoot, p, "package.json").replace(/\\/g, "/")
    );

    if (cli.flags.debug) {
      console.log(
        chalk.blue("Debug: Glob patterns from pnpm-workspace.yaml:"),
        globPatterns
      );
    }

    const packageJsonPaths = await glob(globPatterns, { absolute: true });

    if (cli.flags.debug) {
      console.log(
        chalk.blue("Debug: Found package.json files:"),
        packageJsonPaths
      );
    }

    for (const pkgJsonPath of packageJsonPaths) {
      try {
        const pkgContent = await fs.readFile(pkgJsonPath, "utf8");
        const pkgJson = JSON.parse(pkgContent);
        if (pkgJson && pkgJson.name) {
          const packageDir = path.dirname(pkgJsonPath);
          packages.set(pkgJson.name, {
            path: packageDir,
            description: pkgJson.description || "",
            exports: pkgJson.exports || {},
          });
          if (cli.flags.debug) {
            console.log(
              chalk.blue(
                `Debug: Found package '${pkgJson.name}' at ${packageDir}`
              )
            );
          }
        } else {
          console.warn(
            chalk.yellow(
              `Warning: Skipping package.json without a name: ${pkgJsonPath}`
            )
          );
        }
      } catch (parseError) {
        console.warn(
          chalk.yellow(
            `Warning: Skipping invalid package.json at ${pkgJsonPath}: ${parseError.message}`
          )
        );
      }
    }
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `pnpm-workspace.yaml not found in repository root: ${repoRoot}`
      );
    } else {
      throw new Error(
        `Error reading or parsing pnpm-workspace.yaml: ${error.message}`
      );
    }
  }

  if (cli.flags.debug) {
    console.log(
      chalk.blue("Debug: Discovered workspace packages:"),
      Object.fromEntries(packages)
    );
  }
  return packages;
}
