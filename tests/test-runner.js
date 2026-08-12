/**
 * test-runner.js ― 依存パッケージゼロの小さなテストランナー。
 *
 * ブラウザ（tests/run.html）でも Node（node tests/run-node.mjs）でも
 * 同じテストコードが動くように、DOM に触らない作りにしている。
 */

const suites = [];
let currentSuite = null;

/** テストのまとまりを定義する */
export function describe(name, body) {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  body();
  currentSuite = null;
}

/** テスト1件 */
export function it(name, body) {
  if (!currentSuite) throw new Error("it() は describe() の中で呼んでください");
  currentSuite.tests.push({ name, body });
}

/** 期待値の確認 */
export function expect(actual) {
  return {
    toBe(expected) {
      if (!Object.is(actual, expected)) {
        throw new Error(`期待: ${format(expected)} / 実際: ${format(actual)}`);
      }
    },
    toEqual(expected) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`期待: ${b} / 実際: ${a}`);
    },
    toBeCloseTo(expected, tolerance = 1e-6) {
      if (Math.abs(actual - expected) > tolerance) {
        throw new Error(`期待: ${expected}±${tolerance} / 実際: ${actual}`);
      }
    },
    toBeTruthy() {
      if (!actual) throw new Error(`真であるべきですが ${format(actual)} でした`);
    },
    toBeFalsy() {
      if (actual) throw new Error(`偽であるべきですが ${format(actual)} でした`);
    },
    toContain(item) {
      if (!actual?.includes?.(item)) {
        throw new Error(`${format(actual)} に ${format(item)} が含まれていません`);
      }
    },
    toHaveLength(length) {
      if (actual?.length !== length) {
        throw new Error(`長さ ${length} を期待しましたが ${actual?.length} でした`);
      }
    },
  };
}

function format(value) {
  if (typeof value === "string") return `"${value}"`;
  return String(value);
}

/**
 * 登録されたテストをすべて実行する。
 * @param {(line:string, ok:boolean) => void} [report] 1件ごとの通知
 * @returns {{ passed:number, failed:number, failures:Array }}
 */
export async function run(report = () => {}) {
  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const suite of suites) {
    report(`── ${suite.name}`, true);
    for (const test of suite.tests) {
      try {
        await test.body();
        passed++;
        report(`  ✓ ${test.name}`, true);
      } catch (error) {
        failed++;
        failures.push({ suite: suite.name, test: test.name, message: error.message });
        report(`  ✗ ${test.name}\n      ${error.message}`, false);
      }
    }
  }
  return { passed, failed, failures };
}
