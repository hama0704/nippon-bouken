/**
 * prefectures.js ― 47都道府県のマスターデータ。
 *
 * フィールドの意味:
 *   name          「県」を除いた本体。採点の基準になる（例: "神奈川"）
 *   reading        name のひらがな読み。ひらがな解答（△判定）の基準
 *   suffix        「都/道/府/県」。付けても付けなくても正解にするため分けている
 *   capital        県庁所在地の本体。「市」を除く（例: "横浜"）
 *   capitalReading capital のひらがな読み
 *   capitalSuffix 「市」など。北海道・東京の扱いを吸収する
 *   region         regions.js の id
 *   specialty      名産（図鑑・ヒントで使う）
 *   fact           豆知識（図鑑）
 *   population     人口の目安（図鑑）
 *   famous         有名なもの（図鑑）
 *
 * 地図の形（どのマスを占めるか）は pref-shapes.js 側に分離している。
 * データを直したいときの手順は docs/CUSTOMIZE.md を参照。
 */

export const PREFECTURES = [
  // ── 北海道 ────────────────────────────────────────────────────────────
  {
    id: 1, name: "北海道", reading: "ほっかいどう", suffix: "",
    capital: "札幌", capitalReading: "さっぽろ", capitalSuffix: "市",
    region: "hokkaido",
    specialty: "じゃがいも・かに",
    fact: "日本でいちばん大きな都道府県！広い大地に牧場がたくさんある。",
    population: "約505万人",
    famous: ["さっぽろ雪まつり", "流氷", "ラベンダー畑"],
  },

  // ── 東北 ──────────────────────────────────────────────────────────────
  {
    id: 2, name: "青森", reading: "あおもり", suffix: "県",
    capital: "青森", capitalReading: "あおもり", capitalSuffix: "市",
    region: "tohoku",
    specialty: "りんご",
    fact: "りんごの生産量が日本一！ねぶた祭りも有名。",
    population: "約118万人",
    famous: ["ねぶた祭", "白神山地", "三内丸山遺跡"],
  },
  {
    id: 3, name: "岩手", reading: "いわて", suffix: "県",
    capital: "盛岡", capitalReading: "もりおか", capitalSuffix: "市",
    region: "tohoku",
    specialty: "わんこそば",
    fact: "日本で2番目に大きな県！わんこそばの早食い大会がある。",
    population: "約116万人",
    famous: ["中尊寺金色堂", "リアス海岸", "宮沢賢治のふるさと"],
  },
  {
    id: 4, name: "宮城", reading: "みやぎ", suffix: "県",
    capital: "仙台", capitalReading: "せんだい", capitalSuffix: "市",
    region: "tohoku",
    specialty: "ずんだもち",
    fact: "「杜の都（もりのみやこ）」と呼ばれる仙台市がある！",
    population: "約226万人",
    famous: ["松島", "七夕まつり", "牛タン"],
  },
  {
    id: 5, name: "秋田", reading: "あきた", suffix: "県",
    capital: "秋田", capitalReading: "あきた", capitalSuffix: "市",
    region: "tohoku",
    specialty: "きりたんぽ",
    fact: "なまはげという伝統行事が有名！大きな鬼のお面をかぶる。",
    population: "約91万人",
    famous: ["なまはげ", "竿燈まつり", "秋田犬"],
  },
  {
    id: 6, name: "山形", reading: "やまがた", suffix: "県",
    capital: "山形", capitalReading: "やまがた", capitalSuffix: "市",
    region: "tohoku",
    specialty: "さくらんぼ",
    fact: "さくらんぼの生産量が日本一！甘くておいしい。",
    population: "約102万人",
    famous: ["蔵王の樹氷", "花笠まつり", "最上川"],
  },
  {
    id: 7, name: "福島", reading: "ふくしま", suffix: "県",
    capital: "福島", capitalReading: "ふくしま", capitalSuffix: "市",
    region: "tohoku",
    specialty: "もも",
    fact: "面積が全国3位の大きな県！おいしい桃が有名。",
    population: "約176万人",
    famous: ["会津若松城", "猪苗代湖", "赤べこ"],
  },

  // ── 関東 ──────────────────────────────────────────────────────────────
  {
    id: 8, name: "茨城", reading: "いばらき", suffix: "県",
    capital: "水戸", capitalReading: "みと", capitalSuffix: "市",
    region: "kanto",
    specialty: "納豆",
    fact: "納豆の生産量が日本一！偕楽園（かいらくえん）の梅も有名。",
    population: "約282万人",
    famous: ["偕楽園", "筑波山", "国営ひたち海浜公園"],
  },
  {
    id: 9, name: "栃木", reading: "とちぎ", suffix: "県",
    capital: "宇都宮", capitalReading: "うつのみや", capitalSuffix: "市",
    region: "kanto",
    specialty: "いちご",
    fact: "いちごの生産量が日本一！日光東照宮もある。",
    population: "約189万人",
    famous: ["日光東照宮", "華厳の滝", "宇都宮ぎょうざ"],
  },
  {
    id: 10, name: "群馬", reading: "ぐんま", suffix: "県",
    capital: "前橋", capitalReading: "まえばし", capitalSuffix: "市",
    region: "kanto",
    specialty: "こんにゃく",
    fact: "こんにゃくの生産量が日本一！山と温泉が多い。",
    population: "約190万人",
    famous: ["草津温泉", "富岡製糸場", "上毛かるた"],
  },
  {
    id: 11, name: "埼玉", reading: "さいたま", suffix: "県",
    capital: "さいたま", capitalReading: "さいたま", capitalSuffix: "市",
    region: "kanto",
    specialty: "深谷ねぎ",
    fact: "海がない内陸の県！東京のとなりにある大きな都市。",
    population: "約733万人",
    famous: ["川越の蔵づくり", "秩父夜祭", "草加せんべい"],
  },
  {
    id: 12, name: "千葉", reading: "ちば", suffix: "県",
    capital: "千葉", capitalReading: "ちば", capitalSuffix: "市",
    region: "kanto",
    specialty: "落花生",
    fact: "落花生（ピーナッツ）の生産量が日本一！",
    population: "約626万人",
    famous: ["成田国際空港", "九十九里浜", "銚子の醤油"],
  },
  {
    id: 13, name: "東京", reading: "とうきょう", suffix: "都",
    capital: "東京", capitalReading: "とうきょう", capitalSuffix: "",
    region: "kanto",
    specialty: "もんじゃ焼き",
    fact: "日本の首都！人口が日本一多い。世界有数の大都市。",
    population: "約1410万人",
    famous: ["東京スカイツリー", "浅草寺", "国会議事堂"],
  },
  {
    id: 14, name: "神奈川", reading: "かながわ", suffix: "県",
    capital: "横浜", capitalReading: "よこはま", capitalSuffix: "市",
    region: "kanto",
    specialty: "シウマイ",
    fact: "横浜は日本最大の港のひとつ！中華街も有名。",
    population: "約923万人",
    famous: ["鎌倉の大仏", "横浜中華街", "箱根の温泉"],
  },

  // ── 中部 ──────────────────────────────────────────────────────────────
  {
    id: 15, name: "新潟", reading: "にいがた", suffix: "県",
    capital: "新潟", capitalReading: "にいがた", capitalSuffix: "市",
    region: "chubu",
    specialty: "こしひかり（お米）",
    fact: "お米（コシヒカリ）の生産量が日本一！日本海に面している。",
    population: "約210万人",
    famous: ["佐渡島", "雪国の暮らし", "錦鯉"],
  },
  {
    id: 16, name: "富山", reading: "とやま", suffix: "県",
    capital: "富山", capitalReading: "とやま", capitalSuffix: "市",
    region: "chubu",
    specialty: "白えび",
    fact: "3000m級の立山連峰（たてやまれんぽう）がある！薬でも有名。",
    population: "約100万人",
    famous: ["立山黒部アルペンルート", "五箇山の合掌造り", "ますのすし"],
  },
  {
    id: 17, name: "石川", reading: "いしかわ", suffix: "県",
    capital: "金沢", capitalReading: "かなざわ", capitalSuffix: "市",
    region: "chubu",
    specialty: "加賀がに",
    fact: "金沢には昔の町並みが残っていて、工芸品が有名！",
    population: "約111万人",
    famous: ["兼六園", "輪島塗", "能登半島"],
  },
  {
    id: 18, name: "福井", reading: "ふくい", suffix: "県",
    capital: "福井", capitalReading: "ふくい", capitalSuffix: "市",
    region: "chubu",
    specialty: "越前がに",
    fact: "眼鏡（めがね）の生産量が日本一！恐竜の化石も有名。",
    population: "約74万人",
    famous: ["恐竜博物館", "東尋坊", "永平寺"],
  },
  {
    id: 19, name: "山梨", reading: "やまなし", suffix: "県",
    capital: "甲府", capitalReading: "こうふ", capitalSuffix: "市",
    region: "chubu",
    specialty: "もも・ぶどう",
    fact: "富士山の裾野（すその）が広がる県！フルーツ王国。",
    population: "約79万人",
    famous: ["富士五湖", "ぶどう狩り", "武田信玄"],
  },
  {
    id: 20, name: "長野", reading: "ながの", suffix: "県",
    capital: "長野", capitalReading: "ながの", capitalSuffix: "市",
    region: "chubu",
    specialty: "りんご・そば",
    fact: "海がない内陸の県で、3000m超の山がたくさんある！",
    population: "約200万人",
    famous: ["善光寺", "上高地", "野沢菜"],
  },
  {
    id: 21, name: "岐阜", reading: "ぎふ", suffix: "県",
    capital: "岐阜", capitalReading: "ぎふ", capitalSuffix: "市",
    region: "chubu",
    specialty: "飛騨牛（ひだぎゅう）",
    fact: "日本のほぼ真ん中にある県！合掌造り（がっしょうづくり）の家が有名。",
    population: "約191万人",
    famous: ["白川郷", "高山の古い町並み", "長良川の鵜飼"],
  },
  {
    id: 22, name: "静岡", reading: "しずおか", suffix: "県",
    capital: "静岡", capitalReading: "しずおか", capitalSuffix: "市",
    region: "chubu",
    specialty: "お茶",
    fact: "お茶の生産量が日本一！富士山が一部にある。",
    population: "約353万人",
    famous: ["富士山", "登呂遺跡", "うなぎ"],
  },
  {
    id: 23, name: "愛知", reading: "あいち", suffix: "県",
    capital: "名古屋", capitalReading: "なごや", capitalSuffix: "市",
    region: "chubu",
    specialty: "みそかつ",
    fact: "自動車工場がたくさんある工業の県！名古屋城も有名。",
    population: "約748万人",
    famous: ["名古屋城", "自動車工場", "ひつまぶし"],
  },

  // ── 近畿 ──────────────────────────────────────────────────────────────
  {
    id: 24, name: "三重", reading: "みえ", suffix: "県",
    capital: "津", capitalReading: "つ", capitalSuffix: "市",
    region: "kinki",
    specialty: "伊勢えび",
    fact: "有名な伊勢神宮（いせじんぐう）がある！真珠（しんじゅ）の養殖も。",
    population: "約172万人",
    famous: ["伊勢神宮", "真珠の養殖", "鈴鹿サーキット"],
  },
  {
    id: 25, name: "滋賀", reading: "しが", suffix: "県",
    capital: "大津", capitalReading: "おおつ", capitalSuffix: "市",
    region: "kinki",
    specialty: "鮒ずし（ふなずし）",
    fact: "日本最大の湖「琵琶湖（びわこ）」がある！面積の6分の1が湖。",
    population: "約140万人",
    famous: ["琵琶湖", "彦根城", "比叡山延暦寺"],
  },
  {
    id: 26, name: "京都", reading: "きょうと", suffix: "府",
    capital: "京都", capitalReading: "きょうと", capitalSuffix: "市",
    region: "kinki",
    specialty: "西陣織（にしじんおり）",
    fact: "お寺や神社がたくさんある！日本の昔の都（みやこ）。",
    population: "約253万人",
    famous: ["金閣寺", "清水寺", "祇園祭"],
  },
  {
    id: 27, name: "大阪", reading: "おおさか", suffix: "府",
    capital: "大阪", capitalReading: "おおさか", capitalSuffix: "市",
    region: "kinki",
    specialty: "たこ焼き",
    fact: "「天下の台所（てんかのだいどころ）」と呼ばれる食の都！",
    population: "約878万人",
    famous: ["大阪城", "通天閣", "お好み焼き"],
  },
  {
    id: 28, name: "兵庫", reading: "ひょうご", suffix: "県",
    capital: "神戸", capitalReading: "こうべ", capitalSuffix: "市",
    region: "kinki",
    specialty: "神戸牛（こうべぎゅう）",
    fact: "神戸は外国との交流が盛んな港町！異人館も有名。",
    population: "約538万人",
    famous: ["姫路城", "明石海峡大橋", "淡路島"],
  },
  {
    id: 29, name: "奈良", reading: "なら", suffix: "県",
    capital: "奈良", capitalReading: "なら", capitalSuffix: "市",
    region: "kinki",
    specialty: "吉野葛（よしのくず）",
    fact: "野生の鹿が町の中を歩いている！大仏（だいぶつ）も有名。",
    population: "約129万人",
    famous: ["東大寺の大仏", "奈良公園の鹿", "法隆寺"],
  },
  {
    id: 30, name: "和歌山", reading: "わかやま", suffix: "県",
    capital: "和歌山", capitalReading: "わかやま", capitalSuffix: "市",
    region: "kinki",
    specialty: "みかん・梅（うめ）",
    fact: "みかんと梅の生産量が全国上位！高野山（こうやさん）も有名。",
    population: "約89万人",
    famous: ["高野山", "熊野古道", "南紀白浜"],
  },

  // ── 中国 ──────────────────────────────────────────────────────────────
  {
    id: 31, name: "鳥取", reading: "とっとり", suffix: "県",
    capital: "鳥取", capitalReading: "とっとり", capitalSuffix: "市",
    region: "chugoku",
    specialty: "松葉がに・梨（なし）",
    fact: "日本最大の砂丘「鳥取砂丘（とっとりさきゅう）」がある！",
    population: "約53万人",
    famous: ["鳥取砂丘", "水木しげるロード", "大山"],
  },
  {
    id: 32, name: "島根", reading: "しまね", suffix: "県",
    capital: "松江", capitalReading: "まつえ", capitalSuffix: "市",
    region: "chugoku",
    specialty: "しじみ",
    fact: "縁結びで有名な出雲大社（いずもたいしゃ）がある！",
    population: "約65万人",
    famous: ["出雲大社", "石見銀山", "宍道湖"],
  },
  {
    id: 33, name: "岡山", reading: "おかやま", suffix: "県",
    capital: "岡山", capitalReading: "おかやま", capitalSuffix: "市",
    region: "chugoku",
    specialty: "もも・マスカット",
    fact: "桃太郎伝説の発祥の地！フルーツが有名。",
    population: "約183万人",
    famous: ["後楽園", "倉敷美観地区", "瀬戸大橋"],
  },
  {
    id: 34, name: "広島", reading: "ひろしま", suffix: "県",
    capital: "広島", capitalReading: "ひろしま", capitalSuffix: "市",
    region: "chugoku",
    specialty: "かき・お好み焼き",
    fact: "かきの生産量が日本一！厳島神社（いつくしまじんじゃ）も有名。",
    population: "約273万人",
    famous: ["原爆ドーム", "厳島神社", "尾道の坂道"],
  },
  {
    id: 35, name: "山口", reading: "やまぐち", suffix: "県",
    capital: "山口", capitalReading: "やまぐち", capitalSuffix: "市",
    region: "chugoku",
    specialty: "ふぐ",
    fact: "本州の西のはしにある県！ふぐ料理が有名。",
    population: "約128万人",
    famous: ["秋吉台", "錦帯橋", "関門海峡"],
  },

  // ── 四国 ──────────────────────────────────────────────────────────────
  {
    id: 36, name: "徳島", reading: "とくしま", suffix: "県",
    capital: "徳島", capitalReading: "とくしま", capitalSuffix: "市",
    region: "shikoku",
    specialty: "なると金時（なるときんとき）",
    fact: "阿波おどりという有名なお祭りがある！",
    population: "約69万人",
    famous: ["阿波おどり", "鳴門の渦潮", "藍染め"],
  },
  {
    id: 37, name: "香川", reading: "かがわ", suffix: "県",
    capital: "高松", capitalReading: "たかまつ", capitalSuffix: "市",
    region: "shikoku",
    specialty: "うどん",
    fact: "うどんの消費量が日本一！日本で最も面積が小さい県。",
    population: "約92万人",
    famous: ["讃岐うどん", "金刀比羅宮", "小豆島"],
  },
  {
    id: 38, name: "愛媛", reading: "えひめ", suffix: "県",
    capital: "松山", capitalReading: "まつやま", capitalSuffix: "市",
    region: "shikoku",
    specialty: "みかん",
    fact: "みかんの生産量が全国上位！道後温泉（どうごおんせん）が有名。",
    population: "約128万人",
    famous: ["道後温泉", "松山城", "しまなみ海道"],
  },
  {
    id: 39, name: "高知", reading: "こうち", suffix: "県",
    capital: "高知", capitalReading: "こうち", capitalSuffix: "市",
    region: "shikoku",
    specialty: "かつおのたたき",
    fact: "カツオの水揚げ量が日本一！坂本龍馬（さかもとりょうま）の故郷。",
    population: "約66万人",
    famous: ["四万十川", "坂本龍馬", "よさこい祭り"],
  },

  // ── 九州 ──────────────────────────────────────────────────────────────
  {
    id: 40, name: "福岡", reading: "ふくおか", suffix: "県",
    capital: "福岡", capitalReading: "ふくおか", capitalSuffix: "市",
    region: "kyushu",
    specialty: "明太子（めんたいこ）",
    fact: "九州の玄関口！明太子発祥の地。",
    population: "約512万人",
    famous: ["博多ラーメン", "太宰府天満宮", "屋台"],
  },
  {
    id: 41, name: "佐賀", reading: "さが", suffix: "県",
    capital: "佐賀", capitalReading: "さが", capitalSuffix: "市",
    region: "kyushu",
    specialty: "有田焼（ありたやき）",
    fact: "有田焼という美しい陶磁器（とうじき）が有名！",
    population: "約79万人",
    famous: ["有田焼", "吉野ヶ里遺跡", "熱気球大会"],
  },
  {
    id: 42, name: "長崎", reading: "ながさき", suffix: "県",
    capital: "長崎", capitalReading: "ながさき", capitalSuffix: "市",
    region: "kyushu",
    specialty: "カステラ",
    fact: "外国との交流が昔から盛んな町！ハウステンボスも有名。",
    population: "約125万人",
    famous: ["出島", "軍艦島", "ちゃんぽん"],
  },
  {
    id: 43, name: "熊本", reading: "くまもと", suffix: "県",
    capital: "熊本", capitalReading: "くまもと", capitalSuffix: "市",
    region: "kyushu",
    specialty: "馬刺し（ばさし）",
    fact: "阿蘇山（あそさん）というとても大きな火山がある！",
    population: "約170万人",
    famous: ["阿蘇山", "熊本城", "天草の海"],
  },
  {
    id: 44, name: "大分", reading: "おおいた", suffix: "県",
    capital: "大分", capitalReading: "おおいた", capitalSuffix: "市",
    region: "kyushu",
    specialty: "かぼす",
    fact: "温泉（おんせん）の数が日本一！「おんせん県」とも呼ばれる。",
    population: "約109万人",
    famous: ["別府温泉", "湯布院", "関あじ・関さば"],
  },
  {
    id: 45, name: "宮崎", reading: "みやざき", suffix: "県",
    capital: "宮崎", capitalReading: "みやざき", capitalSuffix: "市",
    region: "kyushu",
    specialty: "チキン南蛮（なんばん）",
    fact: "日照時間（にっしょうじかん）が日本一長い！暖かい県。",
    population: "約104万人",
    famous: ["高千穂峡", "マンゴー", "シーガイア"],
  },
  {
    id: 46, name: "鹿児島", reading: "かごしま", suffix: "県",
    capital: "鹿児島", capitalReading: "かごしま", capitalSuffix: "市",
    region: "kyushu",
    specialty: "さつまいも",
    fact: "桜島（さくらじま）という火山がある！さつまいもの産地。",
    population: "約154万人",
    famous: ["桜島", "屋久島", "黒豚"],
  },

  // ── 沖縄 ──────────────────────────────────────────────────────────────
  {
    id: 47, name: "沖縄", reading: "おきなわ", suffix: "県",
    capital: "那覇", capitalReading: "なは", capitalSuffix: "市",
    region: "okinawa",
    specialty: "ゴーヤー・泡盛（あわもり）",
    fact: "日本の南のはし！きれいなビーチとサンゴ礁（しょう）がある。",
    population: "約147万人",
    famous: ["首里城", "美ら海水族館", "エイサー"],
  },
];

/** id 引きの索引 */
export const PREFECTURE_BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]));

/** 全 id（セーブデータの初期化に使う） */
export const PREFECTURE_IDS = PREFECTURES.map((p) => p.id);

/** 地方 id → その地方の都道府県 */
export function prefecturesOfRegion(regionId) {
  return PREFECTURES.filter((p) => p.region === regionId);
}

/** 表示用のフルネーム（例: "神奈川県" / "北海道" / "東京都"） */
export function fullName(prefecture) {
  return prefecture.name + prefecture.suffix;
}

/** 県庁所在地のフルネーム（例: "横浜市" / "東京"） */
export function fullCapital(prefecture) {
  return prefecture.capital + prefecture.capitalSuffix;
}
