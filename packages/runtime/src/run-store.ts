import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunManifest } from "@conductor/core";

export class RunStore {
  readonly runDir: string;
  readonly artifactsDir: string;
  readonly eventsDir: string;

  constructor(stateRoot: string, runId: string) {
    this.runDir = join(stateRoot, "runs", runId);
    this.artifactsDir = join(this.runDir, "artifacts");
    this.eventsDir = join(this.runDir, "events");
  }

  async init(): Promise<void> {
    await Promise.all([
      mkdir(this.artifactsDir, { recursive: true }),
      mkdir(this.eventsDir, { recursive: true })
    ]);
  }

  async writeManifest(manifest: RunManifest): Promise<void> {
    await writeFile(
      join(this.runDir, "manifest.json"),
      JSON.stringify(manifest, null, 2) + "\n",
      "utf8"
    );
  }

  async writeArtifact(name: string, content: string): Promise<string> {
    const path = join(this.artifactsDir, name);
    await writeFile(path, content.endsWith("\n") ? content : content + "\n", "utf8");
    return path;
  }

  async readArtifact(name: string): Promise<string> {
    return await readFile(join(this.artifactsDir, name), "utf8");
  }

  async appendEvent(stepId: string, event: unknown): Promise<void> {
    await appendFile(
      join(this.eventsDir, `${stepId}.jsonl`),
      JSON.stringify(event) + "\n",
      "utf8"
    );
  }

  async writeJson(name: string, value: unknown): Promise<string> {
    const path = join(this.runDir, name);
    await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8");
    return path;
  }
}
