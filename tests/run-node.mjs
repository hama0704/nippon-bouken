/**
 * run-node.mjs ― コマンドラインからテストを走らせる。
 *
 *   cd prefecture-rpg
 *   npm test
 *
 * ブラウザ版（tests/run.html）と同じテストコードを使う。
 * ブラウザを開かずに確認したいときや、
 * 将来 CI（GitHub Actions など）に載せたいときのための入口。
 */

import { run } from "./test-runner.js";
import "./tests.js";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

const result = await run((line, ok) => {
  const color = line.startsWith("──") ? YELLOW : (ok ? GREEN : RED);
  console.log(color + line + RESET);
});

console.log("");
if (result.failed === 0) {
  console.log(`${GREEN}すべて成功: ${result.passed}件${RESET}`);
} else {
  console.log(`${RED}成功 ${result.passed}件 / 失敗 ${result.failed}件${RESET}`);
  for (const failure of result.failures) {
    console.log(`  - ${failure.suite} › ${failure.test}: ${failure.message}`);
  }
}

process.exit(result.failed === 0 ? 0 : 1);
