import { describe, it, expect } from "vitest";
import React from "react";
import { render } from "ink-testing-library";
import { Settings } from "../../../../src/cli/tui/screens/settings.js";
import { type Companion } from "../../../../src/cli/companion-config.js";
import { type AuthState } from "../../../../src/cli/tui/store/auth.js";

const companion: Companion = {
  version: 1,
  name: "Arienz",
  voice: "warm",
  createdAt: "2026-04-28T00:00:00Z",
};
const auth: AuthState = { mode: "subscription" };

describe("Settings screen", () => {
  it("renders companion and auth summary", () => {
    const { lastFrame } = render(
      <Settings
        companion={companion}
        auth={auth}
        onBack={() => undefined}
        onResetCompanion={() => undefined}
        onResetAuth={() => undefined}
      />,
    );
    const out = lastFrame() ?? "";
    expect(out).toContain("Arienz");
    expect(out).toContain("warm");
    expect(out).toContain("subscription");
  });
});
