import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs = 120_000
): Promise<CommandResult> {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);

    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

export async function assertGitRepository(repository: string): Promise<string> {
  const root = resolve(repository);
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], root);
  if (result.exitCode !== 0) {
    throw new Error(`Not a git repository: ${root}`);
  }
  return result.stdout.trim();
}

export async function createRunWorktree(
  repository: string,
  stateRoot: string,
  runId: string
): Promise<string> {
  const repoRoot = await assertGitRepository(repository);
  const worktreesRoot = join(stateRoot, "worktrees", basename(repoRoot));
  await mkdir(worktreesRoot, { recursive: true });

  const destination = join(worktreesRoot, runId);
  const branch = `conductor/${runId}`;
  const result = await runCommand(
    "git",
    ["worktree", "add", "-b", branch, destination, "HEAD"],
    repoRoot
  );

  if (result.exitCode !== 0) {
    throw new Error(`Failed to create worktree: ${result.stderr.trim()}`);
  }

  return destination;
}

export async function workspaceFingerprint(cwd: string): Promise<string> {
  const diff = await runCommand(
    "git",
    ["diff", "--binary", "--no-ext-diff", "HEAD"],
    cwd
  );
  if (diff.exitCode !== 0) {
    throw new Error(`Failed to inspect workspace: ${diff.stderr.trim()}`);
  }

  const untracked = await runCommand(
    "git",
    ["ls-files", "--others", "--exclude-standard", "-z"],
    cwd
  );
  if (untracked.exitCode !== 0) {
    throw new Error(`Failed to list untracked files: ${untracked.stderr.trim()}`);
  }

  const hash = createHash("sha256");
  hash.update(diff.stdout);

  const paths = untracked.stdout.split("\0").filter(Boolean).sort();
  for (const path of paths) {
    hash.update(path);
    try {
      hash.update(await readFile(join(cwd, path)));
    } catch {
      hash.update("<unreadable>");
    }
  }

  return hash.digest("hex");
}

export async function changedFiles(cwd: string): Promise<string[]> {
  const result = await runCommand(
    "git",
    ["status", "--porcelain=v1", "--untracked-files=all"],
    cwd
  );
  if (result.exitCode !== 0) return [];
  return result.stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3).trim());
}
