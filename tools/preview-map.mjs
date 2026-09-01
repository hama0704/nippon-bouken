/** 生成した地図を目で確かめるための SVG を書き出す（開発用） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as m from "../src/content/pref-paths.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REGION = { hokkaido:[1], tohoku:[2,3,4,5,6,7], kanto:[8,9,10,11,12,13,14],
  chubu:[15,16,17,18,19,20,21,22,23], kinki:[24,25,26,27,28,29,30],
  chugoku:[31,32,33,34,35], shikoku:[36,37,38,39], kyushu:[40,41,42,43,44,45,46], okinawa:[47] };
const COLOR = { hokkaido:"#5eead4", tohoku:"#7dd3fc", kanto:"#fcd34d", chubu:"#c4b5fd",
  kinki:"#fda4af", chugoku:"#6ee7b7", shikoku:"#fdba74", kyushu:"#f9a8d4", okinawa:"#67e8f9" };
const regionOf = {};
for (const [r, ids] of Object.entries(REGION)) for (const id of ids) regionOf[id] = r;

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.VIEW_WIDTH} ${m.VIEW_HEIGHT}" width="820">`;
svg += `<rect width="100%" height="100%" fill="#16233f"/>`;
svg += `<rect x="${m.INSET_BOX.x}" y="${m.INSET_BOX.y}" width="${m.INSET_BOX.width}" height="${m.INSET_BOX.height}" fill="none" stroke="#8899bb" stroke-dasharray="8 6"/>`;
for (const [id, d] of Object.entries(m.PATHS)) {
  svg += `<path d="${d}" fill="${COLOR[regionOf[id]]}" stroke="#16233f" stroke-width="1.2"/>`;
}
for (const p of Object.values(m.LABEL_POINTS)) {
  svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#111"/>`;
}
svg += "</svg>";
fs.writeFileSync(path.join(HERE, "map-preview.svg"), svg);
console.log("tools/map-preview.svg を書き出しました");
