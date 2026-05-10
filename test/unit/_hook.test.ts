import { describe, expect, it } from "vitest";
import { extractHookCommands } from "../../src/_hook.js";

describe("extractHookCommands", () => {
  it("returns command: strings, skips prompt: strings", () => {
    const text = `{
      "hooks": {
        "Stop": [
          { "type": "command", "command": "echo Read here" },
          { "type": "prompt", "prompt": "Verify Real impact and Read the trace" }
        ]
      }
    }`;
    const cmds = extractHookCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.command).toBe("echo Read here");
  });

  it("returns [] on malformed JSON", () => {
    expect(extractHookCommands("not json")).toEqual([]);
  });
});
