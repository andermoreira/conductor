import type { Provider } from "@conductor/core";
import { AntigravityProvider } from "./antigravity.js";
import { ClaudeProvider } from "./claude.js";
import { CodexProvider } from "./codex.js";
import { CursorProvider } from "./cursor.js";

export { AntigravityProvider, ClaudeProvider, CodexProvider, CursorProvider };

export function createDefaultProviders(): Record<string, Provider> {
  const providers: Provider[] = [
    new ClaudeProvider(),
    new CodexProvider(),
    new CursorProvider(),
    new AntigravityProvider()
  ];

  return Object.fromEntries(providers.map((provider) => [provider.id, provider]));
}
