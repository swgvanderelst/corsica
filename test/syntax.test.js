// Every browser file parses: a syntax error there breaks the whole app, and only the Edge smoke test would notice it otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
for (const f of ['app.js', 'logic.js', 'deck.js', 'maps.js', 'store.js', 'store-dev.js', 'store-firebase.js', 'sw.js']) {
  test(`${f} parses`, () => {
    assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', f], { cwd: ROOT, stdio: 'pipe' }));
  });
}
