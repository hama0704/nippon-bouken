/**
 * save-manager.js ― localStorage への保存・読込・スキーマ移行。
 *
 * 設計方針:
 *  - セーブデータの「形」の正解はこのファイルだけが知っている。
 *  - 壊れたデータ／別バージョンのデータを読んでもアプリが起動不能にならない。
 *    （教室で使う以上、「開かない」が最悪の障害）
 *  - 書き込みはデバウンスする。手書き1画ごとに保存すると iPad が重くなるため。
 */

const STORAGE_KEY = "prefRPG:save:v1";
export const SAVE_VERSION = 1;

/** 保存の間引き間隔（ms）。この間に何度更新しても書き込みは1回。 */
const WRITE_DEBOUNCE_MS = 400;

/**
 * 1県ぶんの学習記録の初期値。
 * name = 都道府県名、cap = 県庁所在地。両方を別々に数える。
 */
export function createProgressEntry() {
  return {
    nameCorrect: 0,   // 漢字で正解した回数
    nameKana:    0,   // ひらがなで正解（△）した回数
    nameWrong:   0,   // 間違えた回数
    capCorrect:  0,
    capKana:     0,
    capWrong:    0,
    streak:      0,   // 連続正解数（苦手判定に使う）
    lastJudge:   null,// "maru" | "sankaku" | "batsu" | null
    totalMs:     0,   // 累計回答時間
    answered:    0,   // 累計回答数（平均時間 = totalMs / answered）
    srsLevel:    0,   // 忘却曲線の段階 0..5
    nextDueAt:   0,   // 次に出題すべき時刻（epoch ms）。0 = いつでも
    hintUsed:    0,   // ヒントを使った回数
  };
}

/** 図鑑の開放状態 */
export function createDexEntry() {
  return { name: false, capital: false, info: false };
}

/** 設定の初期値 */
export function createDefaultSettings() {
  return {
    sound:      true,      // 効果音
    fontScale:  "normal",  // small | normal | large
    cvdMode:    false,     // 色覚多様性に配慮したパレット
    furigana:   true,      // ふりがな表示
    penWidth:   6,         // 手書きの線の太さ(px)
    handedness: "right",   // right | left（ボタン配置を左右反転）
    recognizer: "stroke",  // 使用する文字認識エンジンの id
    reduceMotion: false,   // アニメを抑える（OS設定とは別に手動でも）
    requireSuffix: false,  // 「県」まで書かないと○にしない（先生の方針で切り替える）
  };
}

/**
 * まっさらなセーブデータを作る。
 * @param {number[]} subjectIds 学習対象のID一覧（都道府県なら 1..47）
 */
export function createNewSave(subjectIds) {
  const progress = {};
  const dex = {};
  for (const id of subjectIds) {
    progress[id] = createProgressEntry();
    dex[id] = createDexEntry();
  }

  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),

    player: {
      name: "ゆうしゃ",
      level: 1,
      exp: 0,          // 累計経験値
      hp: 30, maxHp: 30,
      atk: 8, def: 5, spd: 6,
    },

    progress,
    dex,

    /** 冒険の進行（どの地方の何体目と戦っているか） */
    battle: {
      region: null,       // 現在挑戦中の地方 id
      enemyIndex: 0,      // その地方の何体目か
      enemyHp: null,      // 途中の敵HP（null なら未出現）
      defeatedEnemies: [],// 倒した敵 id
      clearedRegions: [], // 制覇した地方 id
      demonLordDefeated: false,
    },

    /** 学習の記録（きろく画面・教師モードCSVの元データ） */
    stats: {
      studyDays: [],   // "2026-08-04" の配列。連続学習日数の計算に使う
      totalMs: 0,      // 累計学習時間
      totalQuestions: 0,
      dayStreak: 0,
    },

    settings: createDefaultSettings(),
  };
}

/**
 * 保存されているデータを読む。
 * 壊れている・古い・存在しない場合はすべて新規データを返す（例外は投げない）。
 *
 * @param {number[]} subjectIds
 * @returns {{ save: object, isNew: boolean }}
 */
export function loadSave(subjectIds) {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Safari のプライベートブラウズなどで localStorage が使えないことがある。
    // その場合はメモリ上だけで動かす（遊べはする）。
    console.warn("[save] localStorage が利用できません。記録は保存されません。");
    return { save: createNewSave(subjectIds), isNew: true };
  }

  if (!raw) return { save: createNewSave(subjectIds), isNew: true };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("[save] セーブデータが壊れていたため作り直します。");
    return { save: createNewSave(subjectIds), isNew: true };
  }

  const migrated = migrate(parsed, subjectIds);
  return { save: migrated, isNew: false };
}

/**
 * 版が上がったときの移行処理。
 * 将来 version 2 を作るときは、ここに `if (data.version < 2) { ... }` を足す。
 */
function migrate(data, subjectIds) {
  const fresh = createNewSave(subjectIds);

  if (typeof data !== "object" || data === null) return fresh;

  // 現時点では v1 のみ。未知の版（未来のデータ）は触らず捨てる方が安全。
  if (data.version !== SAVE_VERSION) {
    console.warn(`[save] 未知のバージョン(${data.version})のため作り直します。`);
    return fresh;
  }

  // 欠けているキーを初期値で埋める（部分的に壊れたデータの救済）。
  return reconcile(fresh, data, subjectIds);
}

/**
 * 初期値をベースに、保存値で上書きできるものだけ上書きする。
 * 想定外のキーは捨て、想定しているキーが無ければ初期値のまま残す。
 */
function reconcile(fresh, saved, subjectIds) {
  const result = fresh;

  result.createdAt = saved.createdAt ?? fresh.createdAt;
  Object.assign(result.player,   pickNumbers(saved.player,   fresh.player));
  Object.assign(result.stats,    pickShallow(saved.stats,    fresh.stats));
  Object.assign(result.battle,   pickShallow(saved.battle,   fresh.battle));
  Object.assign(result.settings, pickShallow(saved.settings, fresh.settings));

  for (const id of subjectIds) {
    const savedProgress = saved.progress?.[id];
    if (savedProgress) Object.assign(result.progress[id], pickShallow(savedProgress, result.progress[id]));

    const savedDex = saved.dex?.[id];
    if (savedDex) Object.assign(result.dex[id], pickShallow(savedDex, result.dex[id]));
  }

  return result;
}

/** テンプレートに存在するキーだけを、型が合う場合に採用する */
function pickShallow(source, template) {
  const out = {};
  if (typeof source !== "object" || source === null) return out;
  for (const key of Object.keys(template)) {
    const value = source[key];
    if (value === undefined) continue;
    if (Array.isArray(template[key]) && !Array.isArray(value)) continue;
    if (typeof template[key] === "number" && typeof value !== "number") continue;
    if (typeof template[key] === "boolean" && typeof value !== "boolean") continue;
    out[key] = value;
  }
  return out;
}

/** 数値だけを採用（プレイヤーステータスの改ざん・破損対策） */
function pickNumbers(source, template) {
  const out = {};
  if (typeof source !== "object" || source === null) return out;
  for (const key of Object.keys(template)) {
    const value = source[key];
    if (typeof template[key] === "number") {
      if (Number.isFinite(value)) out[key] = value;
    } else if (typeof value === typeof template[key]) {
      out[key] = value;
    }
  }
  return out;
}

/* ---------------------------------------------------------------------------
 * 書き込み
 * ------------------------------------------------------------------------- */

let writeTimer = null;
let pendingSave = null;

/** 実際に localStorage へ書く（内部用） */
function flush(onWritten) {
  writeTimer = null;
  if (!pendingSave) return;
  pendingSave.updatedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingSave));
    onWritten?.();
  } catch (error) {
    // 容量超過など。遊べなくはならないので警告に留める。
    console.warn("[save] 保存に失敗しました:", error);
  }
  pendingSave = null;
}

/**
 * 保存を予約する（デバウンス）。
 * @param {object} save
 * @param {() => void} [onWritten] 書き込み完了時のコールバック
 */
export function scheduleSave(save, onWritten) {
  pendingSave = save;
  if (writeTimer !== null) return;
  writeTimer = setTimeout(() => flush(onWritten), WRITE_DEBOUNCE_MS);
}

/** 予約を待たずに即書き込む（画面を閉じるときなど） */
export function saveNow(save, onWritten) {
  if (writeTimer !== null) { clearTimeout(writeTimer); writeTimer = null; }
  pendingSave = save;
  flush(onWritten);
}

/** セーブデータを完全に削除する */
export function clearSave() {
  if (writeTimer !== null) { clearTimeout(writeTimer); writeTimer = null; }
  pendingSave = null;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* 使えない環境では何もしない */ }
}

/** バックアップ用に JSON 文字列を書き出す */
export function exportSave(save) {
  return JSON.stringify(save, null, 2);
}
