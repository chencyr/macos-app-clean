const path = require("path");
const os = require("os");

const { isDangerousPath } = require("../src/deleter");

describe("deleter guardrails", () => {
  test("refuses dangerous root paths", () => {
    const homeDir = os.homedir();
    expect(isDangerousPath(homeDir, homeDir)).toBe(true);
    expect(isDangerousPath(path.join(homeDir, "Library"), homeDir)).toBe(true);
    expect(isDangerousPath("/Library", homeDir)).toBe(true);
    expect(isDangerousPath("/Applications", homeDir)).toBe(true);
  });

  test("allows non-root paths", () => {
    const homeDir = os.homedir();
    expect(isDangerousPath(path.join(homeDir, "Desktop"), homeDir)).toBe(false);
    expect(isDangerousPath("/Applications/Chrome.app", homeDir)).toBe(false);
    expect(isDangerousPath("/Library/Application Support", homeDir)).toBe(false);
  });
});

