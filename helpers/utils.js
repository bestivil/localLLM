import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export const getRepositoryRoot = async (sourcePath) => {
  const repoRoot = await execAsync(
    `git -C "${sourcePath}" rev-parse --show-toplevel`
  );
  return repoRoot.stdout.trim();
};
