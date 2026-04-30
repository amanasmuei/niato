import React, { useState } from "react";
import { Box, Text, useApp } from "ink";
import { randomUUID } from "node:crypto";
import { useScreenStack } from "./hooks/use-screen-stack.js";
import { Launcher, type LauncherChoice } from "./screens/launcher.js";
import { Session } from "./screens/session.js";
import { Settings } from "./screens/settings.js";
import { About } from "./screens/about.js";
import { FirstRun } from "./screens/first-run.js";
import { ApiKeyEntry } from "./screens/api-key-entry.js";
import { CompanionWizard } from "./screens/companion-wizard.js";
import { Menu } from "./components/menu.js";
import { type TurnState } from "./hooks/use-niato-session.js";
import {
  loadCompanion,
  defaultCompanionPath,
  type Companion,
} from "../companion-config.js";
import {
  loadAuth,
  saveAuth,
  defaultAuthPath,
  type AuthMode,
  type AuthState,
} from "./store/auth.js";
import {
  loadMostRecent,
  defaultSessionsDir,
  pruneSessions,
  type SessionMode,
} from "./store/sessions.js";
import { type Niato } from "../../core/compose.js";
import { type Logger } from "../../observability/log.js";

export interface AppProps {
  companionPath?: string;
  sessionsDir?: string;
  authPath?: string;
  niatoFactory: (logger: Logger) => Niato;
  version: string;
}

// Narrow the menu's emitted string id back into the SessionMode union without a
// blind `as` cast. The two ids below match the SessionMode union exactly; any
// unexpected id falls back to "casual" (the safer default).
function toSessionMode(id: string): SessionMode {
  if (id === "casual" || id === "dev") return id;
  return "casual";
}

// Shape of props passed when pushing the "session" screen onto the stack.
// Hoisted to a named type so the runtime narrow below stays readable and
// avoids an inline `import("...").TurnState` type-import.
interface SessionScreenProps {
  sessionId: string;
  mode: SessionMode;
  replayedTurns: TurnState[];
}

// Runtime narrow of the screen-stack's untyped props bag into our concrete
// SessionScreenProps. Each push site below populates these fields, but
// useScreenStack stores everything as Record<string, unknown>, so we
// validate before reading.
function asSessionScreenProps(
  props: Record<string, unknown>,
): SessionScreenProps | null {
  const sessionId = props["sessionId"];
  const mode = props["mode"];
  const replayedTurns = props["replayedTurns"];
  if (typeof sessionId !== "string") return null;
  if (mode !== "casual" && mode !== "dev") return null;
  if (!Array.isArray(replayedTurns)) return null;
  // The push sites below are the only producers of this bag; they always
  // pass a TurnState[]. We trust the array shape — the runtime guards
  // above filter the ids and types we actually branch on.
  return {
    sessionId,
    mode,
    // Cast: the only producers are our own push sites, which pass
    // TurnState[]. A deeper structural check would duplicate the
    // hook's schema for no test value.
    replayedTurns: replayedTurns as TurnState[],
  };
}

export function App({
  companionPath = defaultCompanionPath(),
  sessionsDir = defaultSessionsDir(),
  authPath = defaultAuthPath(),
  niatoFactory,
  version,
}: AppProps): React.ReactElement {
  const { exit } = useApp();
  const [companion, setCompanion] = useState<Companion | null>(() =>
    loadCompanion(companionPath),
  );
  const [auth, setAuth] = useState<AuthState | null>(() => loadAuth(authPath));

  // Best-effort prune on cold start. Errors are silent and not user-facing.
  React.useEffect(() => {
    try {
      pruneSessions(50, sessionsDir);
    } catch {
      /* ignore */
    }
  }, [sessionsDir]);

  const initialScreen = companion === null ? "first-run" : "launcher";
  const stack = useScreenStack({ name: initialScreen, props: {} });

  const recent = loadMostRecent(sessionsDir);
  const hasResumable = recent !== null;

  const onLauncherSelect = (choice: LauncherChoice): void => {
    if (companion === null) return;
    if (choice === "new") {
      // Per spec Q2: mode is picked per-session at start. Push the
      // mode-prompt screen, which on selection replaces itself with
      // the session screen carrying the chosen mode.
      stack.push("mode-prompt", {});
    } else if (choice === "resume" && recent !== null) {
      const replayed: TurnState[] = recent.turns.map((t) => {
        if (t.type === "error") {
          return {
            input: t.input,
            output: undefined,
            classification: undefined,
            trace: undefined,
            errorMessage: t.errorMessage,
            phase: "error" as const,
          };
        }
        return {
          input: t.input,
          output: t.output,
          classification: t.classification,
          trace: t.trace,
          errorMessage: undefined,
          phase: "done" as const,
        };
      });
      stack.push("session", {
        sessionId: recent.sessionId,
        mode: recent.mode,
        replayedTurns: replayed,
      });
    } else if (choice === "settings") {
      stack.push("settings", {});
    } else if (choice === "about") {
      stack.push("about", {});
    } else {
      exit();
    }
  };

  const proceedAfterAuth = (): void => {
    const existing = loadCompanion(companionPath);
    if (existing === null) {
      stack.replace("companion-wizard", {});
      return;
    }
    setCompanion(existing);
    stack.replace("launcher", {});
  };

  const onAuthPicked = (mode: AuthMode): void => {
    if (mode === "subscription") {
      saveAuth({ mode: "subscription" }, authPath);
      setAuth({ mode: "subscription" });
      proceedAfterAuth();
      return;
    }
    // api-key path: env-var shortcut still wins for power users; otherwise
    // show the in-app key-entry screen.
    const env = process.env["ANTHROPIC_API_KEY"];
    if (typeof env === "string" && env.length > 0) {
      const next: AuthState = { mode: "api-key", apiKey: env };
      saveAuth(next, authPath);
      setAuth(next);
      proceedAfterAuth();
      return;
    }
    stack.replace("api-key-entry", {});
  };

  const onApiKeySubmit = (apiKey: string): void => {
    const next: AuthState = { mode: "api-key", apiKey };
    saveAuth(next, authPath);
    setAuth(next);
    proceedAfterAuth();
  };

  const onApiKeyCancel = (): void => {
    stack.replace("first-run", {});
  };

  const onCompanionComplete = (newCompanion: Companion): void => {
    setCompanion(newCompanion);
    stack.replace("launcher", {});
  };

  const onCompanionCancel = (): void => {
    // Replace with first-run rather than pop: the wizard is always reached via
    // stack.replace so it occupies the bottom of the stack. pop() on a
    // singleton would leave the wizard showing; first-run is the correct
    // fallback for both first-run flow and settings flow.
    stack.replace("first-run", {});
  };

  const screen = stack.current;
  if (screen.name === "first-run") {
    return <FirstRun onAuthPicked={onAuthPicked} />;
  }
  if (screen.name === "launcher" && companion !== null) {
    return (
      <Launcher
        companion={companion}
        hasResumable={hasResumable}
        onSelect={onLauncherSelect}
      />
    );
  }
  if (screen.name === "settings" && companion !== null) {
    return (
      <Settings
        companion={companion}
        auth={auth}
        onBack={stack.pop}
        onResetCompanion={() => {
          stack.replace("companion-wizard", {});
        }}
        onResetAuth={() => {
          stack.replace("first-run", {});
        }}
      />
    );
  }
  if (screen.name === "about") {
    return <About version={version} onBack={stack.pop} />;
  }
  if (screen.name === "mode-prompt") {
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color="cyan">
          Mode for this session?
        </Text>
        <Box marginTop={1}>
          <Menu
            items={[
              {
                id: "casual",
                label: "Casual",
                detail: "warm; observability minimal",
              },
              {
                id: "dev",
                label: "Dev",
                detail: "expanded footer; full trace",
              },
            ]}
            onSelect={(id) => {
              stack.replace("session", {
                sessionId: randomUUID(),
                mode: toSessionMode(id),
                replayedTurns: [],
              });
            }}
            onCancel={stack.pop}
          />
        </Box>
      </Box>
    );
  }
  if (screen.name === "session" && companion !== null) {
    const props = asSessionScreenProps(screen.props);
    if (props !== null) {
      return (
        <Session
          companion={companion}
          mode={props.mode}
          sessionId={props.sessionId}
          sessionsDir={sessionsDir}
          niatoFactory={niatoFactory}
          replayedTurns={props.replayedTurns}
          onExit={stack.pop}
        />
      );
    }
  }
  if (screen.name === "api-key-entry") {
    return <ApiKeyEntry onSubmit={onApiKeySubmit} onCancel={onApiKeyCancel} />;
  }
  if (screen.name === "companion-wizard") {
    return (
      <CompanionWizard
        onComplete={onCompanionComplete}
        onCancel={onCompanionCancel}
        companionPath={companionPath}
      />
    );
  }
  // Defensive fallback. The branches above cover every reachable
  // (screen.name, companion) combination produced by our push/replace
  // sites; rendering a quiet message keeps the tree non-empty and
  // gives the user a way back if something slips through.
  return (
    <Box paddingX={1}>
      <Text color="gray">(unknown screen — press Ctrl+C to exit)</Text>
    </Box>
  );
}
