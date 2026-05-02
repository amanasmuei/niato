import { describe, it, expect } from "vitest";
import { resolveDispatch, helpText } from "../src/cli/dispatch.js";

describe("resolveDispatch", () => {
  it("defaults to tui entry when no subcommand is given", () => {
    const result = resolveDispatch([]);
    expect(result.kind).toBe("entry");
    if (result.kind === "entry") {
      expect(result.entry).toBe("cli/tui/index.js");
      expect(result.forwardArgs).toEqual([]);
    }
  });

  it("routes 'tui' explicitly", () => {
    const result = resolveDispatch(["tui"]);
    expect(result.kind).toBe("entry");
    if (result.kind === "entry") expect(result.entry).toBe("cli/tui/index.js");
  });

  it("routes 'chat' to cli-chat.js and forwards extra args", () => {
    const result = resolveDispatch(["chat", "--reset"]);
    expect(result.kind).toBe("entry");
    if (result.kind === "entry") {
      expect(result.entry).toBe("cli-chat.js");
      expect(result.forwardArgs).toEqual(["--reset"]);
    }
  });

  it("routes 'login' to cli-login.js", () => {
    const result = resolveDispatch(["login"]);
    expect(result.kind).toBe("entry");
    if (result.kind === "entry") expect(result.entry).toBe("cli-login.js");
  });

  it("routes 'setup-token' to cli-setup-token.js", () => {
    const result = resolveDispatch(["setup-token"]);
    expect(result.kind).toBe("entry");
    if (result.kind === "entry") {
      expect(result.entry).toBe("cli-setup-token.js");
    }
  });

  it.each([["--version"], ["-v"]])(
    "returns kind=version for %s",
    (flag) => {
      expect(resolveDispatch([flag]).kind).toBe("version");
    },
  );

  it.each([["--help"], ["-h"]])(
    "returns kind=help for %s",
    (flag) => {
      expect(resolveDispatch([flag]).kind).toBe("help");
    },
  );

  it("returns kind=unknown with the bad subcommand for anything else", () => {
    const result = resolveDispatch(["bogus"]);
    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") expect(result.subcommand).toBe("bogus");
  });
});

describe("helpText", () => {
  it("includes the program name and core subcommands", () => {
    const text = helpText();
    expect(text).toMatch(/^niato —/);
    expect(text).toContain("niato tui");
    expect(text).toContain("niato chat");
    expect(text).toContain("niato login");
    expect(text).toContain("niato setup-token");
    expect(text).toContain("ANTHROPIC_API_KEY");
    expect(text).toContain("CLAUDE_CODE_OAUTH_TOKEN");
  });
});
