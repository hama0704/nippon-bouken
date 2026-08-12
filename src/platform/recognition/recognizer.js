/**
 * recognizer.js ― 手書き文字認識エンジンの「差し込み口」。
 *
 * ■ なぜインターフェースにするのか
 *   手書き認識は技術の進歩が速く、数年で選択肢が変わる。
 *   ここを固定してしまうと、認識精度を上げたいときにゲーム全体を
 *   書き直すことになる。そこで「認識エンジンはこの形をしていればよい」
 *   という契約だけを決め、中身は自由に差し替えられるようにしている。
 *
 *   将来 Google ML Kit・WebNN・Tesseract.js などに乗り換えるときは、
 *   下の Recognizer を実装したクラスを作って registerRecognizer するだけ。
 *   詳しい手順は同じフォルダの README.md を参照。
 *
 * ■ 型（JSDoc で定義。TypeScript は使わない方針）
 *
 * @typedef {Object} Point        1点。x,y はマス内の座標(0..1)、p は筆圧(0..1)
 * @property {number} x
 * @property {number} y
 * @property {number} p
 *
 * @typedef {Object} Stroke       ひと続きの線（ペンを下ろして上げるまで）
 * @property {Point[]} points
 *
 * @typedef {Object} CellInput    マス1つぶんの手書き
 * @property {Stroke[]} strokes
 *
 * @typedef {Object} RecognizeRequest
 * @property {CellInput[]} cells       左のマスから順に。空のマスも含む
 * @property {string[]} candidates     ありうる答えの一覧（例: 47都道府県名）
 *
 * @typedef {Object} Ranked
 * @property {string} text
 * @property {number} score           0..1
 *
 * @typedef {Object} RecognitionResult
 * @property {string} text            いちばんあり得る読み取り結果（空文字なら読めなかった）
 * @property {number} confidence      0..1。この値が低いと自己確認に回る
 * @property {Ranked[]} ranked        上位候補
 * @property {boolean} needsConfirmation 子どもに○△×を確認してもらうべきか
 */

/**
 * 認識エンジンの基底クラス。
 * 継承しなくても、同じメソッドを持っていれば差し替えられる（ダックタイピング）。
 */
export class Recognizer {
  /** @type {string} 設定に保存される識別子 */
  static id = "base";
  /** @type {string} 設定画面に出す名前 */
  static label = "認識エンジン";

  /** 重いモデルの読み込みなど。使う直前に一度だけ呼ばれる */
  async init() {}

  /**
   * 手書きを読み取る。
   * @param {RecognizeRequest} request
   * @returns {Promise<RecognitionResult>}
   */
  async recognize(_request) {
    return emptyResult();
  }

  /** 後始末（WebGL コンテキストの解放など） */
  dispose() {}
}

/** 「読み取れなかった」を表す結果 */
export function emptyResult() {
  return { text: "", confidence: 0, ranked: [], needsConfirmation: true };
}

/* ---------------------------------------------------------------------------
 * レジストリ
 * ------------------------------------------------------------------------- */

const registry = new Map();

/** エンジンを登録する。id は settings.recognizer に保存される値になる */
export function registerRecognizer(RecognizerClass) {
  registry.set(RecognizerClass.id, RecognizerClass);
}

/** 設定画面に並べるための一覧 */
export function listRecognizers() {
  return [...registry.values()].map((R) => ({ id: R.id, label: R.label }));
}

/** 生成済みインスタンスの使い回し（テンプレートのキャッシュを捨てないため） */
const instances = new Map();

/**
 * id からエンジンを取り出す（初期化済み）。
 * 未知の id や初期化に失敗した場合は、必ず動く自己確認エンジンへ落とす。
 * 教室で「認識が動かないから問題が解けない」という状態を作らないため。
 *
 * @param {string} id
 * @param {string} [fallbackId="selfcheck"]
 * @returns {Promise<Recognizer>}
 */
export async function getRecognizer(id, fallbackId = "selfcheck") {
  const useId = registry.has(id) ? id : fallbackId;

  if (instances.has(useId)) return instances.get(useId);

  const RecognizerClass = registry.get(useId);
  if (!RecognizerClass) throw new Error(`認識エンジンが見つかりません: ${useId}`);

  const instance = new RecognizerClass();
  try {
    await instance.init();
  } catch (error) {
    console.warn(`[ocr] ${useId} の初期化に失敗しました。自己確認に切り替えます。`, error);
    if (useId !== fallbackId) return getRecognizer(fallbackId, fallbackId);
    throw error;
  }

  instances.set(useId, instance);
  return instance;
}
