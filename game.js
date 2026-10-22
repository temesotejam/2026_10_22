"use strict";

const SIZE = 5;
const storageKey = "reality-revision-bureau-v1";
const state = {
  edition: null,
  player: { x: 0, y: 0, health: 3 },
  enemies: [],
  records: [],
  water: new Set(),
  turns: 12,
  usedCard: false,
  log: [],
  status: "playing",
  seals: Number(localStorage.getItem(storageKey) || 0),
  message: "任務を開始しました。記録片を回収してください。",
};

const cells = () => Array.from({ length: SIZE * SIZE }, (_, i) => ({ x: i % SIZE, y: Math.floor(i / SIZE) }));
const key = (x, y) => `${x},${y}`;
const same = (a, b) => a.x === b.x && a.y === b.y;
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const dateKey = () => new Intl.DateTimeFormat("sv-SE", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date());

function hash(text) {
  return [...text].reduce((n, char) => ((n << 5) - n + char.codePointAt(0)) | 0, 2166136261) >>> 0;
}
function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function moonName(date = new Date()) {
  const synodic = 29.53058867;
  const knownNewMoon = Date.UTC(2000, 0, 6, 18, 14);
  const age = (((date.getTime() - knownNewMoon) / 86400000) % synodic + synodic) % synodic;
  if (age < 1.85) return { name: "新月", icon: "●", tag: "影" };
  if (age < 7.38) return { name: "満ちる月", icon: "◔", tag: "月光" };
  if (age < 11.08) return { name: "上弦", icon: "◑", tag: "月光" };
  if (age < 16.61) return { name: "満月", icon: "○", tag: "月光" };
  if (age < 20.3) return { name: "欠ける月", icon: "◕", tag: "月光" };
  if (age < 23.99) return { name: "下弦", icon: "◐", tag: "影" };
  return { name: "細い月", icon: "◌", tag: "影" };
}
function seasonName(date = new Date()) {
  const month = date.getMonth();
  if ([2, 3, 4].includes(month)) return { name: "春の境目", tag: "芽吹き", icon: "✿" };
  if ([5, 6, 7].includes(month)) return { name: "夏の盛り", tag: "熱", icon: "☀" };
  if ([8, 9, 10].includes(month)) return { name: "秋の頁", tag: "風", icon: "🍂" };
  return { name: "冬の余白", tag: "静寂", icon: "❄" };
}
function createEdition(weather = null) {
  const today = new Date();
  const moon = moonName(today);
  const season = seasonName(today);
  const random = seeded(hash(dateKey()));
  const fallbackSky = ["薄曇り", "遠い雨", "乾いた風", "明るい空"][Math.floor(random() * 4)];
  const sky = weather?.label || fallbackSky;
  const wet = weather?.wet ?? (/雨|雪|雷/.test(sky) || (!weather && random() > .72));
  const windy = weather?.windy ?? (season.tag === "風" || (!wet && random() > .7));
  const bright = moon.tag === "月光";
  const tags = [moon, season, { name: sky, tag: wet ? "浸透" : windy ? "風" : "澄明", icon: weather?.icon || (wet ? "☂" : windy ? "〰" : "☼") }];
  const rules = [];
  if (wet) rules.push("浸透：手番終了時、水が一マス広がります。水の中の敵は移動が遅くなります。");
  if (windy) rules.push("偏風：手番終了時、最も近い敵が一マス押し流されます。");
  if (bright) rules.push("月光：斜めのマスにも敵の位置が見えます。水面は淡く光ります。");
  if (!rules.length) rules.push("静寂：敵はあなたの足音を聞き逃しません。二マス以内で追跡を始めます。");
  return { date: dateKey(), moon, season, sky, wet, windy, bright, tags, rules, weather };
}

function randomOpenCell(random, blocked) {
  const choices = cells().filter(c => !blocked.has(key(c.x, c.y)) && !(c.x === 0 && c.y === 0) && !(c.x === 4 && c.y === 4));
  return choices[Math.floor(random() * choices.length)];
}
function resetGame() {
  const random = seeded(hash(`${state.edition.date}-${Date.now()}-${Math.random()}`));
  const blocked = new Set();
  state.player = { x: 0, y: 0, health: 3 };
  state.records = [];
  state.enemies = [];
  state.water = new Set();
  state.turns = 12;
  state.usedCard = false;
  state.status = "playing";
  state.message = "任務を開始しました。記録片を三つ回収し、出口（右下）へ。";
  state.log = ["今日の版を現場へ持ち込みました。"];
  for (let i = 0; i < 3; i += 1) {
    const cell = randomOpenCell(random, blocked); blocked.add(key(cell.x, cell.y)); state.records.push(cell);
  }
  for (let i = 0; i < 3; i += 1) {
    const cell = randomOpenCell(random, blocked); blocked.add(key(cell.x, cell.y)); state.enemies.push({ ...cell, stunned: 0 });
  }
  if (state.edition.wet) {
    for (let i = 0; i < 3; i += 1) { const c = randomOpenCell(random, blocked); state.water.add(key(c.x, c.y)); }
  }
  render();
}
function addLog(text) { state.log.unshift(text); state.log = state.log.slice(0, 6); }
function setMessage(text) { state.message = text; }
function isActive() { return state.status === "playing"; }
function enemyAt(x, y) { return state.enemies.find(enemy => enemy.x === x && enemy.y === y); }
function move(direction) {
  if (!isActive()) return;
  const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction];
  const next = { x: state.player.x + delta[0], y: state.player.y + delta[1] };
  if (next.x < 0 || next.x >= SIZE || next.y < 0 || next.y >= SIZE) { setMessage("頁の端です。そこには進めません。"); render(); return; }
  const enemy = enemyAt(next.x, next.y);
  if (enemy) { setMessage("監査官が行く手を塞いでいます。カードで対処してください。"); render(); return; }
  state.player = next;
  const recordIndex = state.records.findIndex(record => same(record, next));
  if (recordIndex >= 0) { state.records.splice(recordIndex, 1); addLog("失われた記録片を回収しました。"); setMessage("記録片を回収。残りを探してください。"); }
  if (next.x === 4 && next.y === 4) {
    if (state.records.length === 0) return win();
    setMessage(`出口です。記録片があと ${state.records.length} 枚必要です。`);
  }
  render();
}
function useCard(name) {
  if (!isActive() || state.usedCard) return;
  const nearest = [...state.enemies].sort((a, b) => manhattan(a, state.player) - manhattan(b, state.player))[0];
  if (name === "redact") {
    if (!nearest || manhattan(nearest, state.player) > 2) return notifyCard("伏字にできる敵が二マス以内にいません。");
    nearest.stunned = 2; state.usedCard = true; setMessage("伏字：最寄りの監査官を二手番、沈黙させました。"); addLog("監査官の記述を伏字にしました。");
  }
  if (name === "correct") {
    const wetCells = [...state.water].map(value => value.split(",").map(Number)).filter(([x, y]) => Math.abs(x - state.player.x) + Math.abs(y - state.player.y) <= 1);
    if (!wetCells.length) return notifyCard("訂正できる水面が隣接していません。");
    state.water.delete(key(...wetCells[0])); state.usedCard = true; setMessage("訂正：近くの水面を消しました。"); addLog("にじんだ一行を乾かしました。");
  }
  if (name === "transpose") {
    if (!nearest || manhattan(nearest, state.player) > 3) return notifyCard("差し替える敵が三マス以内にいません。");
    const former = { ...state.player }; state.player = { x: nearest.x, y: nearest.y }; nearest.x = former.x; nearest.y = former.y;
    state.usedCard = true; setMessage("差し替え：監査官と位置を入れ替えました。"); addLog("段落の順番を入れ替えました。");
  }
  if (name === "quote") {
    if (!nearest || manhattan(nearest, state.player) > 3) return notifyCard("引用できる敵が三マス以内にいません。");
    nearest.stunned = 1; state.usedCard = true;
    const behind = { x: clamp(nearest.x + Math.sign(nearest.x - state.player.x), 0, 4), y: clamp(nearest.y + Math.sign(nearest.y - state.player.y), 0, 4) };
    if (!enemyAt(behind.x, behind.y) && !same(behind, state.player)) { nearest.x = behind.x; nearest.y = behind.y; }
    setMessage("引用：監査官の動きを一行だけ先送りしました。"); addLog("敵の行動記録を引用しました。");
  }
  render();
}
function notifyCard(text) { setMessage(text); render(); }
function spreadWater() {
  if (!state.edition.wet || !state.water.size) return;
  const next = new Set(state.water);
  for (const value of state.water) {
    const [x, y] = value.split(",").map(Number);
    const choices = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].filter(([nx, ny]) => nx >= 0 && nx < SIZE && ny >= 0 && ny < SIZE && !(nx === 4 && ny === 4));
    if (choices.length) { const [nx, ny] = choices[(hash(`${value}-${state.turns}`) % choices.length)]; next.add(key(nx, ny)); }
  }
  state.water = next;
}
function moveEnemies() {
  state.enemies.forEach(enemy => {
    if (enemy.stunned > 0) { enemy.stunned -= 1; return; }
    if (state.water.has(key(enemy.x, enemy.y)) && state.edition.wet) return;
    const dx = state.player.x - enemy.x; const dy = state.player.y - enemy.y;
    if (Math.abs(dx) + Math.abs(dy) <= 1) return;
    if (Math.abs(dx) >= Math.abs(dy)) enemy.x += Math.sign(dx); else enemy.y += Math.sign(dy);
    if (state.edition.windy && Math.abs(dx) + Math.abs(dy) > 2) enemy.x = clamp(enemy.x + (enemy.x > 2 ? 1 : -1), 0, 4);
  });
  const attackers = state.enemies.filter(enemy => same(enemy, state.player)).length;
  if (attackers) {
    state.player.health -= attackers;
    addLog(`監査官に記録を傷つけられました。体力 -${attackers}。`);
    setMessage("監査官に捕まりました。出口まで急いでください。");
    state.enemies.forEach(enemy => { if (same(enemy, state.player)) { enemy.x = clamp(enemy.x - 1, 0, 4); } });
  }
}
function endTurn() {
  if (!isActive()) return;
  state.turns -= 1;
  spreadWater(); moveEnemies(); state.usedCard = false;
  if (state.player.health <= 0) return lose("記録は赤いインクに沈みました。任務は中断です。");
  if (state.turns <= 0) return lose("版の締切です。記録を持ち帰れませんでした。");
  if (state.water.has(key(state.player.x, state.player.y))) { setMessage("水面に立っています。足跡がにじみます。"); }
  else if (!state.message.includes("捕ま")) setMessage("監査官の配置が変わりました。次の一手を選んでください。");
  render();
}
function win() {
  state.status = "won"; state.seals += 1; localStorage.setItem(storageKey, String(state.seals));
  addLog("任務成功。校正印を一つ獲得しました。"); setMessage("任務成功！ 今日の現実に、あなた自身の注釈を残しました。"); render();
}
function lose(text) { state.status = "lost"; setMessage(text); addLog("任務は失敗しました。版は明日も届きます。"); render(); }
function render() {
  document.querySelector("#edition-date").textContent = state.edition.date.replaceAll("-", ".");
  const place = state.edition.weather?.place ? `遠方の観測地「${state.edition.weather.place}」では、` : "観測所より、";
  document.querySelector("#observation-text").textContent = `${place}${state.edition.season.name}、${state.edition.moon.name}、空は「${state.edition.sky}」。この現実へのオマージュが、現場の規則を少しだけ書き換えます。`;
  document.querySelector("#omen-list").innerHTML = state.edition.tags.map(tag => `<span class="omen">${tag.icon} ${tag.name} — ${tag.tag}</span>`).join("");
  document.querySelector("#rule-text").textContent = state.edition.rules.join(" ");
  document.querySelector("#health").textContent = "●".repeat(Math.max(0, state.player.health)) + "○".repeat(Math.max(0, 3 - state.player.health));
  document.querySelector("#turns").textContent = state.turns;
  document.querySelector("#records").textContent = `${3 - state.records.length} / 3`;
  document.querySelector("#seals").textContent = state.seals;
  document.querySelector("#message").textContent = state.message;
  document.querySelector("#objective").textContent = state.status === "playing" ? "記録を集めて出口へ。" : state.status === "won" ? "任務完了。次の版も編めます。" : "任務中断。記録を組み直せます。";
  const board = document.querySelector("#board"); board.innerHTML = "";
  cells().forEach(cell => {
    const element = document.createElement("div"); element.className = "cell"; element.dataset.index = `${cell.x + 1}:${cell.y + 1}`; element.setAttribute("role", "gridcell");
    if (state.water.has(key(cell.x, cell.y))) element.classList.add("water");
    if (state.edition.bright && (cell.x + cell.y) % 2 === 0) element.classList.add("moonlit");
    if (cell.x === 4 && cell.y === 4) { element.classList.add("exit"); element.textContent = "⇱"; }
    if (state.records.some(record => same(record, cell))) { element.classList.add("record"); element.textContent = "✦"; }
    const enemy = enemyAt(cell.x, cell.y);
    if (enemy) { element.classList.add("enemy"); element.textContent = enemy.stunned ? "⌧" : "◆"; }
    if (same(state.player, cell)) { element.classList.add("player"); element.textContent = "✎"; }
    board.append(element);
  });
  const cardDefs = [
    ["redact", "伏字", "近くの敵を二手番、停止"],
    ["correct", "訂正", "隣の水面を一つ消す"],
    ["transpose", "差し替え", "近くの敵と位置を交換"],
    ["quote", "引用", "敵を一歩、先送りにする"],
  ];
  document.querySelector("#cards").innerHTML = cardDefs.map(([id, title, text]) => `<button class="card" data-card="${id}" type="button" ${(!isActive() || state.usedCard) ? "disabled" : ""}><strong>${title}</strong><span>${text}</span></button>`).join("");
  document.querySelector("#log").innerHTML = state.log.map(entry => `<li>${entry}</li>`).join("");
  document.querySelectorAll("[data-move], #end-turn").forEach(button => { button.disabled = !isActive(); });
}
async function observeWeather() {
  const button = document.querySelector("#weather-button");
  const observatories = [
    { place: "レイキャビク", latitude: 64.1466, longitude: -21.9426 },
    { place: "ナイロビ", latitude: -1.2864, longitude: 36.8172 },
    { place: "バルパライソ", latitude: -33.0472, longitude: -71.6127 },
    { place: "ウランバートル", latitude: 47.8864, longitude: 106.9057 },
    { place: "ホバート", latitude: -42.8821, longitude: 147.3272 },
    { place: "リスボン", latitude: 38.7223, longitude: -9.1393 },
    { place: "バンクーバー", latitude: 49.2827, longitude: -123.1207 },
    { place: "ケープタウン", latitude: -33.9249, longitude: 18.4241 },
  ];
  const observatory = observatories[Math.floor(Math.random() * observatories.length)];
  button.disabled = true; button.textContent = "遠方の空を観測中…";
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${observatory.latitude}&longitude=${observatory.longitude}&current=weather_code,wind_speed_10m&timezone=auto`);
    if (!response.ok) throw new Error("weather request failed");
    const payload = await response.json();
    const code = payload.current.weather_code;
    const labels = { 0: ["晴れ", "☼"], 1: ["おおむね晴れ", "☼"], 2: ["薄曇り", "☁"], 3: ["曇り", "☁"], 45: ["霧", "≋"], 48: ["霧", "≋"], 51: ["霧雨", "☂"], 53: ["霧雨", "☂"], 55: ["濃い霧雨", "☂"], 61: ["小雨", "☂"], 63: ["雨", "☂"], 65: ["強い雨", "☂"], 71: ["雪", "❄"], 73: ["雪", "❄"], 75: ["強い雪", "❄"], 80: ["にわか雨", "☂"], 81: ["にわか雨", "☂"], 82: ["強いにわか雨", "☂"], 95: ["雷雨", "ϟ"], 96: ["雷雨", "ϟ"], 99: ["雹を伴う雷雨", "ϟ"] };
    const [label, icon] = labels[code] || ["観測不能な空", "◌"];
    state.edition = createEdition({ place: observatory.place, label, icon, wet: /雨|雪|雷/.test(label), windy: payload.current.wind_speed_10m >= 24 });
    resetGame();
  } catch (error) {
    setMessage("空模様を受信できませんでした。暦から生成した観測で続けます。"); render();
  } finally { button.disabled = false; button.textContent = "遠方の空を読む"; }
}

document.addEventListener("click", event => {
  const moveButton = event.target.closest("[data-move]"); if (moveButton) move(moveButton.dataset.move);
  const cardButton = event.target.closest("[data-card]"); if (cardButton) useCard(cardButton.dataset.card);
  if (event.target.closest("#end-turn")) endTurn();
  if (event.target.closest("#new-case")) resetGame();
  if (event.target.closest("#weather-button")) observeWeather();
});
document.addEventListener("keydown", event => {
  const keys = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  if (keys[event.key]) { event.preventDefault(); move(keys[event.key]); }
  if (event.key === " ") { event.preventDefault(); endTurn(); }
});

state.edition = createEdition();
resetGame();
