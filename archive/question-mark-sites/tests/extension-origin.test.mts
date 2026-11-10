import assert from "node:assert/strict";
import test from "node:test";
import { allowedExtensionOrigin } from "../lib/extension-origin.ts";

test("installed Chrome and Edge extension IDs can use the question service", () => {
  for (const origin of [
    "chrome-extension://njfhkgjkndlmegmocgdmlmkddifagafk",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "chrome-extension://pppppppppppppppppppppppppppppppp",
  ]) {
    assert.equal(allowedExtensionOrigin(origin), origin);
  }
});

test("ordinary or malformed origins are not treated as extensions", () => {
  for (const origin of [
    null,
    "https://www.cc98.org",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.evil.example",
    "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/",
    "chrome-extension://qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq",
    "chrome-extension://short",
  ]) {
    assert.equal(allowedExtensionOrigin(origin), null);
  }
});
