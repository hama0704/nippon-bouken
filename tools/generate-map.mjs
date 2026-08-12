/**
 * デフォルメ地図のレイアウトを生成する。
 *  ・位置  … 実際の緯度経度（県庁所在地ではなく県の重心）から決める
 *  ・大きさ… 実面積の平方根に比例（そのままだと東京が1マスになり押せない）
 *  ・形    … 実際の縦横比に合わせて伸ばす
 *  ・島    … 別の島どうしが辺で接しないよう海を1マス空ける
 *
 * 出力: SPANS の JS 断片 と、確認用の PNG
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const OUT_DIR = path.dirname(fileURLToPath(import.meta.url));

// id: [名前, 緯度, 経度, 面積km², 島, 横の伸び, 縦の伸び]
const P = {
  1:  ["北海道", 43.4, 142.5, 83424, "hokkaido", 1.2, 1.0],
  2:  ["青森",   40.7, 140.7,  9646, "honshu",   1.3, 0.8],
  3:  ["岩手",   39.6, 141.4, 15275, "honshu",   0.8, 1.3],
  4:  ["宮城",   38.4, 140.9,  7282, "honshu",   0.9, 1.2],
  5:  ["秋田",   39.7, 140.4, 11638, "honshu",   0.8, 1.3],
  6:  ["山形",   38.5, 140.1,  9323, "honshu",   0.8, 1.3],
  7:  ["福島",   37.4, 140.3, 13784, "honshu",   1.4, 0.8],
  8:  ["茨城",   36.3, 140.3,  6097, "honshu",   0.8, 1.3],
  9:  ["栃木",   36.7, 139.8,  6408, "honshu",   1.0, 1.0],
  10: ["群馬",   36.5, 138.9,  6362, "honshu",   1.1, 1.0],
  11: ["埼玉",   36.0, 139.4,  3798, "honshu",   1.6, 0.6],
  12: ["千葉",   35.5, 140.2,  5158, "honshu",   0.9, 1.3],
  13: ["東京",   35.7, 139.4,  2194, "honshu",   1.6, 0.6],
  14: ["神奈川", 35.4, 139.3,  2416, "honshu",   1.3, 0.8],
  15: ["新潟",   37.5, 138.9, 12584, "honshu",   1.0, 1.3],
  16: ["富山",   36.6, 137.2,  4248, "honshu",   1.2, 0.9],
  17: ["石川",   36.8, 136.8,  4186, "honshu",   0.6, 1.6],
  18: ["福井",   35.8, 136.3,  4191, "honshu",   1.4, 0.8],
  19: ["山梨",   35.6, 138.6,  4465, "honshu",   1.0, 1.0],
  20: ["長野",   36.2, 138.1, 13562, "honshu",   0.7, 1.5],
  21: ["岐阜",   35.8, 137.0, 10621, "honshu",   0.9, 1.2],
  22: ["静岡",   35.0, 138.3,  7777, "honshu",   1.4, 0.8],
  23: ["愛知",   35.0, 137.1,  5173, "honshu",   1.1, 1.0],
  24: ["三重",   34.5, 136.4,  5774, "honshu",   0.7, 1.5],
  25: ["滋賀",   35.2, 136.1,  4017, "honshu",   1.0, 1.0],
  26: ["京都",   35.2, 135.5,  4612, "honshu",   0.8, 1.3],
  27: ["大阪",   34.6, 135.5,  1905, "honshu",   0.9, 1.2],
  28: ["兵庫",   35.0, 134.8,  8401, "honshu",   0.9, 1.3],
  29: ["奈良",   34.4, 135.9,  3691, "honshu",   0.8, 1.3],
  30: ["和歌山", 33.9, 135.5,  4725, "honshu",   1.1, 1.0],
  31: ["鳥取",   35.4, 133.9,  3507, "honshu",   1.5, 0.7],
  32: ["島根",   35.1, 132.7,  6708, "honshu",   1.5, 0.7],
  33: ["岡山",   34.9, 133.8,  7115, "honshu",   1.0, 1.1],
  34: ["広島",   34.6, 132.8,  8480, "honshu",   1.1, 1.0],
  35: ["山口",   34.2, 131.6,  6113, "honshu",   1.3, 0.9],
  36: ["徳島",   33.9, 134.3,  4147, "shikoku",  1.2, 0.9],
  37: ["香川",   34.2, 134.0,  1877, "shikoku",  1.3, 0.8],
  38: ["愛媛",   33.7, 132.9,  5676, "shikoku",  1.2, 0.9],
  39: ["高知",   33.5, 133.4,  7104, "shikoku",  1.5, 0.7],
  40: ["福岡",   33.5, 130.6,  4987, "kyushu",   1.0, 1.1],
  41: ["佐賀",   33.3, 130.1,  2441, "kyushu",   1.1, 1.0],
  42: ["長崎",   32.9, 129.8,  4131, "kyushu",   0.9, 1.2],
  43: ["熊本",   32.6, 130.8,  7409, "kyushu",   1.0, 1.1],
  44: ["大分",   33.2, 131.5,  6341, "kyushu",   1.1, 1.0],
  45: ["宮崎",   32.1, 131.3,  7735, "kyushu",   0.9, 1.3],
  46: ["鹿児島", 31.6, 130.6,  9187, "kyushu",   0.9, 1.3],
};

// --- マス数の割り当て -------------------------------------------------------
// 面積そのままだと東京が1マスになって押せない。平方根にして差を圧縮する。
const MIN_CELLS = 3;
const K = 3 / Math.sqrt(P[13][3]);   // 東京がちょうど3マスになる倍率
const budget = {};
for (const [id, v] of Object.entries(P)) {
  budget[id] = Math.max(MIN_CELLS, Math.round(Math.sqrt(v[3]) * K));
}

// --- 緯度経度 → グリッド ----------------------------------------------------
// 密集地帯（関東・近畿）で押し出しが起きすぎないよう、実尺より広めに取る
const COL_PER_LON = 2.15;
const ROW_PER_LAT = 2.6;     // 緯度1度の距離は経度1度より長いので大きめ
const LON_MIN = 129.3;
const LAT_MAX = 45.9;

/**
 * 実際の重心をそのまま使うと、面積を圧縮したぶんだけ島と島の間があきすぎる。
 * 北海道は本州から4マスも離れてしまい、津軽海峡が海というより外洋に見える。
 * そこで島ごとに「寄せる量」を持たせ、本州へ引きつける。
 */
// lat を足すと南（下）へ、lon を足すと東（右）へ寄る
const PULL = { hokkaido: { lat: 1.25 }, shikoku: { lat: 0.1 }, kyushu: { lon: 0.2 } };

const gx = (lon, island) => 1 + (lon - LON_MIN + (PULL[island]?.lon ?? 0)) * COL_PER_LON;
const gy = (lat, island) => 1 + (LAT_MAX - lat + (PULL[island]?.lat ?? 0)) * ROW_PER_LAT;

let COLS = 0, ROWS = 0;
for (const v of Object.values(P)) {
  COLS = Math.max(COLS, Math.ceil(gx(v[2], v[4])) + 4);
  ROWS = Math.max(ROWS, Math.ceil(gy(v[1], v[4])) + 4);
}

// --- 配置 -------------------------------------------------------------------
const owner = new Map();               // "c,r" -> id
const key = (c, r) => `${c},${r}`;
const at = (c, r) => owner.get(key(c, r));

/** そのマスを id が取れるか（別の島と辺で接しないこと） */
function canTake(c, r, id) {
  if (c < 1 || c > COLS || r < 1 || r > ROWS) return false;
  if (owner.has(key(c, r))) return false;
  const island = P[id][4];
  for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    const neighbour = at(c + dc, r + dr);
    if (neighbour && P[neighbour][4] !== island) return false;
  }
  return true;
}

const ids = Object.keys(P).map(Number);
const cellsOf = new Map(ids.map((id) => [id, []]));

/* --- 第1段階: 全県の「中心の1マス」を先に確保する ------------------------
 * 大きい県から順に育てると、最後に置かれる小さな県（大阪・香川など）が
 * 押し出されて本来の位置から離れてしまう。
 * まず全員に居場所を1つずつ配ってから育てる。
 * ------------------------------------------------------------------------ */
for (const id of ids.sort((a, b) => P[b][3] - P[a][3])) {
  const [, lat, lon, , island, wx, wy] = P[id];
  const cx = gx(lon, island), cy = gy(lat, island);

  let seed = null;
  for (let radius = 0; radius < 30 && !seed; radius++) {
    let best = null, bestDist = Infinity;
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
        const c = Math.round(cx) + dc, r = Math.round(cy) + dr;
        if (!canTake(c, r, id)) continue;
        const dist = Math.hypot((c - cx) / wx, (r - cy) / wy);
        if (dist < bestDist) { bestDist = dist; best = [c, r]; }
      }
    }
    seed = best;
  }
  if (!seed) { console.warn("置けません:", P[id][0]); continue; }
  owner.set(key(seed[0], seed[1]), id);
  cellsOf.get(id).push(seed);
}

/* --- 第2段階: 順ぐりに1マスずつ育てる ------------------------------------
 * 全員が交代で伸ばすので、大きい県が空きを独占しない。
 * 候補のうち「重心に近く、かつ自分のマスに多く接する」ものを選ぶと、
 * 細長いひげが伸びずに、ずんぐりした形にまとまる。
 * ------------------------------------------------------------------------ */
let growing = true;
while (growing) {
  growing = false;
  for (const id of ids) {
    const cells = cellsOf.get(id);
    if (cells.length >= budget[id]) continue;

    const [, lat, lon, , island, wx, wy] = P[id];
    const cx = gx(lon, island), cy = gy(lat, island);

    let best = null, bestScore = Infinity;
    for (const [c, r] of cells) {
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nc = c + dc, nr = r + dr;
        if (!canTake(nc, nr, id)) continue;

        // 縦横の伸びを反映した距離（長野は縦に、静岡は横に伸びる）
        const dist = Math.hypot((nc - cx) / wx, (nr - cy) / wy);
        // 自分のマスとの接触数が多いほどまとまった形になる
        let touching = 0;
        for (const [tc, tr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          if (at(nc + tc, nr + tr) === id) touching++;
        }
        const score = dist - touching * 0.45;
        if (score < bestScore) { bestScore = score; best = [nc, nr]; }
      }
    }
    if (!best) continue;
    owner.set(key(best[0], best[1]), id);
    cells.push(best);
    growing = true;
  }
}

/* --- 第3段階: 穴を埋める --------------------------------------------------
 * 1マスだけ取り残された海が県の中にできると、地図として不自然に見える。
 * まわりを1つの県に囲まれた空きマスは、その県のものにする。
 * ------------------------------------------------------------------------ */
for (let pass = 0; pass < 4; pass++) {
  for (let r = 1; r <= ROWS; r++) {
    for (let c = 1; c <= COLS; c++) {
      if (owner.has(key(c, r))) continue;

      const north = at(c, r - 1), south = at(c, r + 1);
      const west  = at(c - 1, r), east  = at(c + 1, r);
      const around = [north, south, west, east].filter(Boolean);
      if (around.length === 0) continue;

      // 別々の島にはさまれた海は、海のまま残す（瀬戸内海・関門海峡）
      const islands = new Set(around.map((id) => P[id][4]));
      if (islands.size > 1) continue;

      // 3方向以上が陸、または上下・左右で挟まれている＝内陸の穴とみなす
      const pinched = (north && south) || (west && east);
      if (around.length < 3 && !pinched) continue;

      // いちばん多く接している県のものにする（同数なら重心が近いほう）。
      // 単純に重心の近さだけで決めると、1辺しか接していない県が
      // 穴を取ってしまい、細いでっぱりができる。
      let bestId = null, bestCount = 0, bestDist = Infinity;
      for (const id of new Set(around)) {
        const count = around.filter((x) => x === id).length;
        const [, lat, lon, , island] = P[id];
        const dist = Math.hypot(c - gx(lon, island), r - gy(lat, island));
        if (count > bestCount || (count === bestCount && dist < bestDist)) {
          bestCount = count; bestDist = dist; bestId = id;
        }
      }
      owner.set(key(c, r), bestId);
    }
  }
}

/* --- 第4段階: 小さすぎる県を救う ------------------------------------------
 * まわりを囲まれた小さな県（滋賀・奈良・香川）は、育つ先が無くなって
 * 2マスで止まってしまう。指でタップできる大きさを下回るので、
 * となりの余裕がある県から1マス譲ってもらう。
 * 譲る側がバラバラにならないことを毎回たしかめる。
 * ------------------------------------------------------------------------ */
function cellsById(id) {
  const list = [];
  for (const [k, v] of owner) if (v === id) list.push(k.split(",").map(Number));
  return list;
}

/** その県のマスがひとつながりか */
function isConnected(cells) {
  if (cells.length === 0) return false;
  const all = new Set(cells.map(([c, r]) => key(c, r)));
  const seen = new Set([key(cells[0][0], cells[0][1])]);
  const queue = [cells[0]];
  while (queue.length) {
    const [c, r] = queue.pop();
    for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const k = key(c + dc, r + dr);
      if (all.has(k) && !seen.has(k)) {
        seen.add(k);
        queue.push([c + dc, r + dr]);
      }
    }
  }
  return seen.size === cells.length;
}

for (let pass = 0; pass < 8; pass++) {
  for (const id of ids) {
    const mine = cellsById(id);
    if (mine.length >= Math.min(budget[id], MIN_CELLS)) continue;

    let taken = false;
    for (const [c, r] of mine) {
      for (const [dc, dr] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        if (taken) break;
        const nc = c + dc, nr = r + dr;
        const donorId = at(nc, nr);
        if (!donorId || donorId === id) continue;
        if (P[donorId][4] !== P[id][4]) continue;       // 別の島からは取らない

        const donorCells = cellsById(donorId);
        if (donorCells.length <= MIN_CELLS) continue;   // 相手が小さくなりすぎる

        const remaining = donorCells.filter(([x, y]) => !(x === nc && y === nr));
        if (!isConnected(remaining)) continue;          // 相手が分断されるならだめ

        owner.set(key(nc, nr), id);
        taken = true;
      }
      if (taken) break;
    }
  }
}

// --- 余白を詰める -----------------------------------------------------------
let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
for (const k of owner.keys()) {
  const [c, r] = k.split(",").map(Number);
  minC = Math.min(minC, c); maxC = Math.max(maxC, c);
  minR = Math.min(minR, r); maxR = Math.max(maxR, r);
}
const shiftC = minC - 2, shiftR = minR - 2;
const shifted = new Map();
for (const [k, id] of owner) {
  const [c, r] = k.split(",").map(Number);
  shifted.set(key(c - shiftC, r - shiftR), id);
}
const FINAL_COLS = maxC - shiftC + 2;
const FINAL_ROWS = maxR - shiftR + 6;   // 沖縄の別枠ぶんを下に足す

// --- SPANS 形式に変換 -------------------------------------------------------
const spans = {};
for (const id of Object.keys(P).map(Number)) {
  const rows = new Map();
  for (const [k, ownerId] of shifted) {
    if (ownerId !== id) continue;
    const [c, r] = k.split(",").map(Number);
    if (!rows.has(r)) rows.set(r, []);
    rows.get(r).push(c);
  }
  const list = [];
  for (const r of [...rows.keys()].sort((a, b) => a - b)) {
    const cols = rows.get(r).sort((a, b) => a - b);
    let start = cols[0], prev = cols[0];
    for (let i = 1; i <= cols.length; i++) {
      if (cols[i] !== prev + 1) { list.push([r, start, prev]); start = cols[i]; }
      prev = cols[i];
    }
  }
  spans[id] = list;
}

// 沖縄は本州から遠いので、左下の別枠に手で置く
const okinawaRow = FINAL_ROWS - 3;
spans[47] = [[okinawaRow, 13, 15], [okinawaRow + 1, 14, 14]];

// --- 出力 -------------------------------------------------------------------
const lines = [];
lines.push(`export const GRID_COLS = ${FINAL_COLS};`);
lines.push(`export const GRID_ROWS = ${FINAL_ROWS};`);
lines.push("");
lines.push("export const SPANS = {");
for (const id of Object.keys(P).map(Number)) {
  const body = spans[id].map(([r, a, b]) => `[${r},${a},${b}]`).join(",");
  lines.push(`  ${id}: [${body}],`.padEnd(64) + ` // ${P[id][0]}（${spans[id].reduce((s, [, a, b]) => s + b - a + 1, 0)}マス）`);
}
lines.push(`  47: [[${okinawaRow},13,15],[${okinawaRow + 1},14,14]],`.padEnd(64) + " // 沖縄（別枠）");
lines.push("};");
fs.writeFileSync(path.join(OUT_DIR, "spans.txt"), lines.join("\n"), "utf8");

// ASCIIでも確認できるようにする
const code = { 1:"HK",2:"AO",3:"IW",4:"MG",5:"AK",6:"YT",7:"FS",8:"IB",9:"TG",10:"GM",
  11:"ST",12:"CB",13:"TK",14:"KN",15:"NG",16:"TY",17:"IS",18:"FI",19:"YN",20:"NN",
  21:"GF",22:"SZ",23:"AI",24:"ME",25:"SG",26:"KY",27:"OS",28:"HG",29:"NR",30:"WK",
  31:"TT",32:"SM",33:"OY",34:"HS",35:"YG",36:"TS",37:"KG",38:"EH",39:"KC",40:"FO",
  41:"SA",42:"NS",43:"KM",44:"OT",45:"MZ",46:"KS",47:"ON" };
const art = [];
for (let r = 1; r <= FINAL_ROWS; r++) {
  let line = String(r).padStart(2) + "|";
  for (let c = 1; c <= FINAL_COLS; c++) {
    const id = shifted.get(key(c, r)) ?? (spans[47].some(([rr, a, b]) => rr === r && c >= a && c <= b) ? 47 : null);
    line += id ? code[id] : " ·";
  }
  art.push(line);
}
fs.writeFileSync(path.join(OUT_DIR, "map.txt"), art.join("\n"), "utf8");

// --- 確認用PNG（地方ごとに色分け）-------------------------------------------
const REGION_OF = {};
const groups = {
  hokkaido: [1], tohoku: [2,3,4,5,6,7], kanto: [8,9,10,11,12,13,14],
  chubu: [15,16,17,18,19,20,21,22,23], kinki: [24,25,26,27,28,29,30],
  chugoku: [31,32,33,34,35], shikoku: [36,37,38,39],
  kyushu: [40,41,42,43,44,45,46], okinawa: [47],
};
for (const [region, ids] of Object.entries(groups)) for (const id of ids) REGION_OF[id] = region;
const COLOR = {
  hokkaido: [94,234,212], tohoku: [125,211,252], kanto: [252,211,77],
  chubu: [196,181,253], kinki: [253,164,175], chugoku: [110,231,183],
  shikoku: [253,186,116], kyushu: [249,168,212], okinawa: [103,232,249],
};

function crc32(buf){let c,crc=0xffffffff;for(let n=0;n<buf.length;n++){c=(crc^buf[n])&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=c^(crc>>>8);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const b=Buffer.concat([Buffer.from(type,"ascii"),data]);const c=Buffer.alloc(4);c.writeUInt32BE(crc32(b));return Buffer.concat([l,b,c]);}

const SCALE = 14;
const W = FINAL_COLS * SCALE, H = FINAL_ROWS * SCALE;
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) { rgba[i*4]=22; rgba[i*4+1]=35; rgba[i*4+2]=63; rgba[i*4+3]=255; }
for (let r = 1; r <= FINAL_ROWS; r++) {
  for (let c = 1; c <= FINAL_COLS; c++) {
    const id = shifted.get(key(c, r)) ?? (spans[47].some(([rr,a,b]) => rr===r && c>=a && c<=b) ? 47 : null);
    if (!id) continue;
    const col = COLOR[REGION_OF[id]];
    for (let y = (r-1)*SCALE; y < r*SCALE; y++) {
      for (let x = (c-1)*SCALE; x < c*SCALE; x++) {
        const edge = x === (c-1)*SCALE || y === (r-1)*SCALE;
        const i = (y*W + x) * 4;
        rgba[i]   = edge ? Math.round(col[0]*0.55) : col[0];
        rgba[i+1] = edge ? Math.round(col[1]*0.55) : col[1];
        rgba[i+2] = edge ? Math.round(col[2]*0.55) : col[2];
      }
    }
  }
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W,0); ihdr.writeUInt32BE(H,4); ihdr[8]=8; ihdr[9]=6;
const raw = Buffer.alloc(H*(W*4+1));
for (let y=0;y<H;y++){ raw[y*(W*4+1)]=0; rgba.copy(raw,y*(W*4+1)+1,y*W*4,(y+1)*W*4); }
fs.writeFileSync(path.join(OUT_DIR,"map-preview.png"), Buffer.concat([
  Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
  chunk("IHDR",ihdr), chunk("IDAT", zlib.deflateSync(raw,{level:9})), chunk("IEND",Buffer.alloc(0)),
]));

console.log(`グリッド ${FINAL_COLS} × ${FINAL_ROWS}`);
console.log("マス数:", Object.values(budget).reduce((a,b)=>a+b,0) + 4);
console.log(art.join("\n"));
