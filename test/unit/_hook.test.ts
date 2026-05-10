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

  it("scopes approxLine to JSON-quoted command value, not prose substring in prompt:", () => {
    // The word "Read" appears in a prompt: field BEFORE it appears at the start
    // of a command: field. A naive substring scan would point at the prompt: line.
    const text = `{
  "hooks": {
    "Stop": [
      { "type": "prompt", "prompt": "Read carefully before proceeding" },
      { "type": "command", "command": "Read" }
    ]
  }
}`;
    const cmds = extractHookCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.command).toBe("Read");
    // The command: line is line 5 (1-based) in the text above.
    const lines = text.split("\n");
    const commandLineIdx = lines.findIndex((l) => l.includes('"command": "Read"'));
    expect(cmds[0]?.approxLine).toBe(commandLineIdx + 1);
    // And it must NOT be the prompt: line.
    const promptLineIdx = lines.findIndex((l) => l.includes('"prompt":'));
    expect(cmds[0]?.approxLine).not.toBe(promptLineIdx + 1);
  });

  it("extracts only command: when an object has both command: and prompt: at the same level", () => {
    // Defensive: the walker recurses into all values, so a sibling prompt:
    // must not produce an extra entry.
    const text = `{
      "hooks": {
        "Stop": [
          { "type": "command", "command": "echo hi", "prompt": "should be ignored" }
        ]
      }
    }`;
    const cmds = extractHookCommands(text);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.command).toBe("echo hi");
  });

  it("returns [] for a hook object with no command: field", () => {
    const text = `{
      "hooks": {
        "Stop": [
          { "type": "prompt", "prompt": "just prose" }
        ]
      }
    }`;
    expect(extractHookCommands(text)).toEqual([]);
  });
});
