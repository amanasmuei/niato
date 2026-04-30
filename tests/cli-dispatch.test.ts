import { describe, it, expect } from "vitest";
import { resolveDispatch } from "../src/cli/dispatch.js";

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

  it("returns kind=version for --version", () => {
    expect(resolveDispatch(["--version"]).kind).toBe("version");
    expect(resolveDispatch(["-v"]).kind).toBe("version");
  });

  it("returns kind=help for --help", () => {
    expect(resolveDispatch(["--help"]).kind).toBe("help");
    expect(resolveDispatch(["-h"]).kind).toBe("help");
  });

  it("returns kind=unknown with the bad subcommand for anything else", () => {
    const result = resolveDispatch(["bogus"]);
    expect(result.kind).toBe("unknown");
    if (result.kind === "unknown") expect(result.subcommand).toBe("bogus");
  });
});
