const { normalizeKey, displayNameFromKey } = require("../src/normalizer");

describe("normalizer", () => {
  test("normalizeKey should strip .app and .plist and lowercase", () => {
    expect(normalizeKey("Chrome.app")).toBe("chrome");
    expect(normalizeKey("com.google.Chrome.plist")).toBe("google/chrome");
  });

  test("displayNameFromKey should generate readable name", () => {
    expect(displayNameFromKey("google/chrome")).toBe("Google / Chrome");
    expect(displayNameFromKey("firefox")).toBe("Firefox");
  });
});

