"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const sourceRoot = path.resolve(process.argv[2] || path.join(__dirname, ".."));
const targetRoot = path.resolve(process.argv[3] || "C:/Users/tbska/Documents/Codex/09_買取業者ノート/current/kaitori-company-local");
const excludedTopLevel = new Set([".git", ".agents", ".codex"]);

function inventory(root) {
  assert.ok(fs.existsSync(root), `folder does not exist: ${root}`);
  const result = new Map();
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const top = relative.split("/", 1)[0];
      if (excludedTopLevel.has(top)) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) {
        const hash = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
        result.set(relative, hash);
      }
    }
  }
  walk(root);
  return result;
}

const source = inventory(sourceRoot);
const target = inventory(targetRoot);
const missing = [...source.keys()].filter((relative) => !target.has(relative));
const extra = [...target.keys()].filter((relative) => !source.has(relative));
const mismatched = [...source.keys()].filter((relative) => target.has(relative) && target.get(relative) !== source.get(relative));

assert.deepEqual(missing, [], `target is missing files:\n${missing.join("\n")}`);
assert.deepEqual(extra, [], `target has extra files:\n${extra.join("\n")}`);
assert.deepEqual(mismatched, [], `SHA-256 mismatch:\n${mismatched.join("\n")}`);
assert.equal(target.size, source.size);

console.log(`PASS source/target file lists match (${source.size} files)`);
console.log(`PASS SHA-256 matches for every deployed file (${source.size} files)`);
console.log("PROTOTYPE3 DEPLOYMENT HASH RESULT: 2 tests passed");
