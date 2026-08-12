/**
 * selfcheck-recognizer.js ― 自己採点モードの認識エンジン。
 *
 * 何も読み取らず、常に「自信ゼロ」を返す。
 * その結果、問題画面は必ず「正解を見せて子どもが○△×を選ぶ」流れになる。
 *
 * ■ これがある理由
 *   1. 保険 …… 内蔵認識が動かない端末でも必ず学習できる
 *   2. 選択肢 …… 誤判定のストレスをゼロにしたい先生が選べる
 *   3. 教育的な価値 …… 自分の字と正解を見比べる作業そのものが定着に効く
 *
 * 「認識しないエンジン」もエンジンとして扱えるのが、
 * インターフェースを切っておくことの利点。
 */

import { Recognizer, emptyResult } from "./recognizer.js";

export class SelfCheckRecognizer extends Recognizer {
  static id = "selfcheck";
  static label = "じぶんで丸つけ（かならず動く）";

  async recognize() {
    return emptyResult();
  }
}
