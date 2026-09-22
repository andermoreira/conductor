import { runCommand, type CommandResult } from "@conductor/workspace";

interface ProviderDiagnostic {
  command: string;
  label: string;
  authArgs?: string[];
  helpArgs: string[];
  capabilities: readonly string[];
}

type CommandRunner = (command: string, args: string[], cwd: string, timeoutMs: number) => Promise<CommandResult>;

interface DoctorOptions {
  verbose: boolean;
  run?: CommandRunner;
  write?: (line: string) => void;
  cwd?: string;
}

const providerDiagnostics: readonly ProviderDiagnostic[] = [
  {
    command: "claude",
    label: "Claude Code",
    authArgs: ["auth", "status"],
    helpArgs: ["--help"],
    capabilities: ["-p", "--output-format", "stream-json", "--permission-mode"]
  },
  {
    command: "codex",
    label: "Codex CLI",
    authArgs: ["login", "status"],
    helpArgs: ["exec", "--help"],
    capabilities: ["--json", "--sandbox"]
  },
  {
    command: "cursor-agent",
    label: "Cursor CLI",
    authArgs: ["status"],
    helpArgs: ["--help"],
    capabilities: ["-p", "--output-format", "stream-json", "--mode"]
  },
  {
    command: "agy",
    label: "Antigravity CLI",
    helpArgs: ["--help"],
    capabilities: ["-p", "--output-format", "stream-json", "--sandbox", "--mode"]
  }
];

function authenticationState(command: string, output: string): "authenticated" | "not authenticated" | "unknown" {
  if (command === "claude") {
    try {
      return JSON.parse(output).loggedIn === true ? "authenticated" : "not authenticated";
    } catch {
      return "unknown";
    }
  }

  if (/not logged in|not authenticated|log in/i.test(output)) return "not authenticated";
  return /logged in|login successful/i.test(output) ? "authenticated" : "unknown";
}

export async function runDoctor(options: DoctorOptions): Promise<boolean> {
  const run = options.run ?? runCommand;
  const write = options.write ?? console.log;
  const cwd = options.cwd ?? process.cwd();
  let failed = false;

  for (const diagnostic of providerDiagnostics) {
    try {
      const version = await run(diagnostic.command, ["--version"], cwd, 15_000);
      if (version.exitCode !== 0) {
        failed = true;
        write(`✗ ${diagnostic.label}: unavailable`);
        continue;
      }

      write(`✓ ${diagnostic.label}: ${version.stdout.trim() || "available"}`);
      if (!options.verbose) continue;

      const auth = diagnostic.authArgs
        ? await run(diagnostic.command, diagnostic.authArgs, cwd, 15_000).catch(() => undefined)
        : undefined;
      const help = await run(diagnostic.command, diagnostic.helpArgs, cwd, 15_000).catch(() => undefined);
      const authOutput = auth?.exitCode === 0 ? `${auth.stdout}\n${auth.stderr}` : "";
      const helpOutput = help?.exitCode === 0 ? `${help.stdout}\n${help.stderr}` : "";
      const authentication = authOutput ? authenticationState(diagnostic.command, authOutput) : "unknown";
      const supported = help?.exitCode === 0 && diagnostic.capabilities.every(
        (capability) => helpOutput.includes(capability)
      );

      write(`  authentication: ${authentication}`);
      write(`  headless adapter flags: ${supported ? "supported" : "unverified"}`);
    } catch {
      failed = true;
      write(`✗ ${diagnostic.label}: unavailable`);
    }
  }

  return failed;
}
