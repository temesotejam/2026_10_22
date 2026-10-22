"use strict";

const NODES = ["港", "市場", "塔", "駅", "公園", "図書館", "病院", "劇場", "工場", "広場", "研究所", "屋上"];
const MAP_POINTS = [[9, 18], [32, 12], [60, 18], [87, 13], [19, 42], [43, 35], [67, 42], [88, 34], [11, 73], [38, 78], [66, 68], [89, 76]];
const state = { player: 8, bot: null, turns: 12, blocks: 2, mode: "move", blocked: new Map(), traces: new Map(), activated: new Set(), scan: null, pulse: null, pulses: 0, status: "playing", log: [], event: "まず「移動」を選び、隣の地点をクリックしてください。" };
const $ = selector => document.querySelector(selector);
const neighbors = node => [node - 4, node + 4, node % 4 ? node - 1 : -1, node % 4 !== 3 ? node + 1 : -1].filter(value => value >= 0 && value < 12);
const hash = text => [...text].reduce((value, char) => ((value << 5) - value + char.charCodeAt(0)) | 0, 2166136261) >>> 0;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const icon = node => ["⚓", "◈", "▴", "↟", "♣", "▤", "✚", "◌", "▦", "✧", "⌬", "⌂"][node];
function addLog(text) { state.log.unshift(text); state.log = state.log.slice(0, 7); }
function fetchJson(url) { return fetch(url, { headers: { Accept: "application/json" } }).then(response => { if (!response.ok) throw new Error("feed unavailable"); return response.json(); }); }
function fallbackPulse() { const now = new Date(); const base = hash(`${now.toISOString().slice(0, 13)}-${now.getUTCMinutes()}`); return { tech: base % 8, attention: (base >>> 3) % 100, earth: (base >>> 8) % 18, clock: now.getUTCMinutes(), live: false }; }
function describePulse(pulse) {
  const urgency = clamp(pulse.tech * 10 + Math.floor(pulse.earth * 1.5), 0, 100);
  const deceptive = pulse.attention >= 55;
  return { ...pulse, urgency, deceptive, pace: urgency >= 74 ? 2 : 1, tags: [`技術活動 ${pulse.tech}`, `話題の熱 ${pulse.attention}`, `地球信号 ${pulse.earth}`] };
}
async function refreshPulse(initial = false) {
  const fallback = describePulse(fallbackPulse());
  if (initial && !state.pulse) { state.pulse = fallback; render(); }
  try {
    const [github, topIds, quakes] = await Promise.all([
      fetchJson("https://api.github.com/events?per_page=30"),
      fetchJson("https://hacker-news.firebaseio.com/v0/topstories.json"),
      fetchJson("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson"),
    ]);
    const newsItems = await Promise.all(topIds.slice(0, 5).map(id => fetchJson(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)));
    const tech = github.filter(event => ["PushEvent", "ReleaseEvent", "CreateEvent"].includes(event.type)).length;
    const attention = clamp(Math.round(newsItems.reduce((sum, item) => sum + (item.score || 0), 0) / 10), 0, 99);
    const earth = clamp(quakes.features.length, 0, 99);
    state.pulse = describePulse({ tech, attention, earth, clock: new Date().getUTCMinutes(), live: true });
  } catch (error) { state.pulse = fallback; }
  state.pulses += 1;
  if (state.bot) state.bot.pace = state.pulse.pace;
  if (!initial) addLog(`世界パルスを更新。侵入者の行動速度は ${state.pulse.pace} です。`);
  render();
}
function shortestPath(from, to) {
  const queue = [[from]]; const seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift(); const current = path[path.length - 1];
    if (current === to) return path;
    neighbors(current).filter(next => !seen.has(next) && !state.blocked.has(next)).forEach(next => { seen.add(next); queue.push([...path, next]); });
  }
  return null;
}
function createPlan() {
  const pulse = state.pulse || describePulse(fallbackPulse());
  const seed = hash(`${pulse.tech}-${pulse.attention}-${pulse.earth}-${pulse.clock}`);
  const choices = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11];
  const targets = []; let value = seed;
  while (targets.length < 3) { value = (value * 1664525 + 1013904223) >>> 0; const choice = choices[value % choices.length]; if (!targets.includes(choice)) targets.push(choice); }
  state.bot = { pos: 0, targets, index: 0, pace: pulse.pace, charge: 0 };
}
function newGame() {
  state.player = 8; state.turns = 12; state.blocks = 2; state.mode = "move"; state.blocked = new Map(); state.traces = new Map(); state.activated = new Set(); state.scan = null; state.status = "playing"; state.log = []; state.event = "あなたは「工場」にいます。侵入者は「港」から入り、橙色の「痕跡」札を残しました。";
  createPlan(); state.traces.set(state.bot.pos, { ttl: 3, age: 0 }); addLog("作戦開始。侵入者は3地点の接続を試みています。"); render(); refreshPulse();
}
function distance(from, to) { const path = shortestPath(from, to); return path ? path.length - 1 : 99; }
function canMove(node) { return neighbors(state.player).includes(node) && !state.blocked.has(node); }
function decay() { for (const [node, trace] of state.traces) { if (trace.ttl <= 1) state.traces.delete(node); else state.traces.set(node, { ttl: trace.ttl - 1, age: trace.age + 1 }); } for (const [node, time] of state.blocked) { if (time <= 1) { state.blocked.delete(node); addLog(`${NODES[node]}の封鎖が解除されました。`); } else state.blocked.set(node, time - 1); } }
function advanceRelayCharge() {
  const target = state.bot.targets[state.bot.index];
  if (state.bot.pos !== target) return false;
  if (state.blocked.has(target)) { state.bot.charge = 0; state.event = `${NODES[target]}の封鎖が、侵入者の起動準備を中断しました。`; addLog(`${NODES[target]}の起動準備を封鎖で中断。`); return true; }
  state.bot.charge += 1;
  if (state.bot.charge < 2) { state.event = `侵入者が「${NODES[target]}」で回線を起動中です（準備 ${state.bot.charge} / 2）。次の一手で止めてください。`; addLog(`${NODES[target]}で回線起動の準備を確認。`); return true; }
  state.activated.add(target); state.bot.index += 1; state.bot.charge = 0; addLog(`侵入者が「${NODES[target]}」を起動しました。`); state.event = `遅れました。${NODES[target]}が起動済みです。残りの計画を止めてください。`;
  if (state.bot.index === 3) finish(false, "侵入者が3地点の回線を完成させました。");
  return true;
}
function botTurn() {
  if (state.status !== "playing") return;
  decay();
  for (let step = 0; step < state.bot.pace && state.status === "playing"; step += 1) {
    if (advanceRelayCharge()) break;
    const target = state.bot.targets[state.bot.index]; const path = shortestPath(state.bot.pos, target);
    if (!path || path.length < 2) { addLog("侵入者は封鎖を前に、別経路を探しています。"); break; }
    const before = state.bot.pos; state.bot.pos = path[1]; state.traces.set(before, { ttl: 3, age: 0 });
    if (state.pulse.deceptive && (state.pulse.clock + state.turns + step) % 3 === 0) {
      const fake = neighbors(before).find(node => node !== state.bot.pos && !state.blocked.has(node)); if (fake !== undefined) state.traces.set(fake, { ttl: 2, age: 0 });
    }
    if (state.bot.pos === state.player) return finish(true, `侵入者を${NODES[state.player]}で待ち伏せ、確保しました。`);
    if (state.bot.pos === target) { state.bot.charge = 0; state.event = `警報：侵入者が「${NODES[target]}」で回線を起動しようとしています（準備 0 / 2）。`; addLog(`${NODES[target]}で回線起動の兆候を検知。`); break; }
  }
}
function takeTurn() {
  state.turns -= 1; state.scan = null; botTurn();
  if (state.status === "playing" && state.turns <= 0) finish(false, "時間切れです。侵入者の回線は残りました。");
  if (state.status === "playing" && state.turns % 2 === 0) refreshPulse();
  render();
}
function selectNode(node) {
  if (state.status !== "playing") return;
  if (state.mode === "move") {
    if (!canMove(node)) { state.event = "移動では、青い地点に隣接する地点だけを選べます。"; return render(); }
    state.player = node; state.event = `${NODES[node]}へ移動しました。侵入者がいないか確認します。`;
    if (state.player === state.bot.pos) return finish(true, `侵入者を${NODES[node]}で確保しました。`);
    addLog(`${NODES[node]}へ移動。`); takeTurn();
  }
  if (state.mode === "scan") {
    const steps = distance(node, state.bot.pos); state.scan = node; state.event = steps === 0 ? `${NODES[node]}に侵入者がいます！ 次の手で確保できます。` : `${NODES[node]}から侵入者まで、最短で ${steps} 地点です。`;
    addLog(`${NODES[node]}をスキャン。距離 ${steps}。`); takeTurn();
  }
  if (state.mode === "block") {
    if (!state.blocks) { state.event = "封鎖できる回数を使い切りました。"; return render(); }
    if (node === state.player || state.activated.has(node)) { state.event = "ここは封鎖できません。未起動の別地点を選んでください。"; return render(); }
    state.blocks -= 1; state.blocked.set(node, 2); state.event = `${NODES[node]}を2手のあいだ封鎖しました。`;
    addLog(`${NODES[node]}を封鎖。`); takeTurn();
  }
}
function finish(win, message) { state.status = win ? "won" : "lost"; state.event = message; addLog(message); render(); }
function render() {
  const pulse = state.pulse || describePulse(fallbackPulse());
  $("#turns").textContent = state.turns; $("#progress").textContent = `${state.bot?.index || 0} / 3`; $("#blocks").textContent = state.blocks; $("#pulse-count").textContent = state.pulses;
  $("#pulse-title").textContent = pulse.live ? "公開フィードを受信中：侵入者の作戦が変化" : "代替パルスで作戦を維持中";
  $("#pulse-copy").textContent = `技術活動と話題の熱は迂回・偽痕跡に、地球信号は侵入者の行動速度に反映されます。次回更新まで最大60秒。`;
  $("#pulse-tags").innerHTML = pulse.tags.map(tag => `<span>${tag}</span>`).join(""); $("#pulse-dot").classList.toggle("ready", pulse.live);
  $("#task").textContent = state.status !== "playing" ? "作戦終了。結果を確認してください。" : state.mode === "move" ? "青い地点へ移動して、侵入者の痕跡を追ってください。" : state.mode === "scan" ? "調べたい地点をクリックしてください。距離が分かります。" : "封鎖したい未起動の地点をクリックしてください。";
  $("#event").textContent = state.event; $("#log").innerHTML = state.log.map(item => `<li>${item}</li>`).join("");
  document.querySelectorAll("[data-mode]").forEach(button => { button.classList.toggle("active", button.dataset.mode === state.mode); button.disabled = state.status !== "playing" || (button.dataset.mode === "block" && !state.blocks); });
  const board = $("#board"); board.innerHTML = "";
  const routes = document.createElementNS("http://www.w3.org/2000/svg", "svg"); routes.setAttribute("class", "routes"); routes.setAttribute("viewBox", "0 0 100 100"); routes.setAttribute("preserveAspectRatio", "none"); routes.setAttribute("aria-hidden", "true");
  NODES.forEach((_, node) => neighbors(node).filter(next => next > node).forEach(next => {
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); line.setAttribute("x1", MAP_POINTS[node][0]); line.setAttribute("y1", MAP_POINTS[node][1]); line.setAttribute("x2", MAP_POINTS[next][0]); line.setAttribute("y2", MAP_POINTS[next][1]); line.setAttribute("class", state.blocked.has(node) || state.blocked.has(next) ? "route closed-route" : "route"); routes.append(line);
  }));
  board.append(routes);
  NODES.forEach((name, node) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "node"; button.dataset.node = node; button.disabled = state.status !== "playing";
    button.style.setProperty("--x", `${MAP_POINTS[node][0]}%`); button.style.setProperty("--y", `${MAP_POINTS[node][1]}%`);
    if (node === state.player) button.classList.add("player"); if (state.mode === "move" && canMove(node)) button.classList.add("reachable"); if (state.blocked.has(node)) button.classList.add("blocked"); if (state.activated.has(node)) button.classList.add("activated"); if (state.traces.has(node)) button.classList.add("has-trace"); if (state.scan === node) button.classList.add("scan-result");
    const traceInfo = state.traces.get(node); const trace = traceInfo ? `<span class="trace ${traceInfo.age === 0 ? "fresh" : "old"}">${traceInfo.age === 0 ? "新しい痕跡" : "古い痕跡"}</span>` : ""; const charging = state.bot && state.bot.index < 3 && state.bot.pos === node && state.bot.targets[state.bot.index] === node; if (charging) button.classList.add("charging"); const target = state.activated.has(node) ? '<span class="target">起動済み</span>' : charging ? `<span class="target charging">起動準備 ${state.bot.charge} / 2</span>` : ""; const you = node === state.player ? '<span class="you">あなた</span>' : "";
    button.innerHTML = `<span class="name">${name}</span><span class="symbol">${node === state.player ? "●" : state.blocked.has(node) ? "▣" : state.activated.has(node) ? "✦" : icon(node)}</span>${you}${trace}${target}`; board.append(button);
  });
  const result = $("#result"); result.classList.toggle("hidden", state.status === "playing");
  if (state.status !== "playing") result.innerHTML = `<h2>${state.status === "won" ? "作戦成功" : "作戦失敗"}</h2><p>${state.event}</p><button id="result-new" class="outline" type="button">別の作戦を開始</button>`;
}
document.addEventListener("click", event => {
  const mode = event.target.closest("[data-mode]"); if (mode && state.status === "playing") { state.mode = mode.dataset.mode; state.event = state.mode === "move" ? "隣の地点を選んで移動してください。" : state.mode === "scan" ? "任意の地点を選び、侵入者までの距離を調べます。" : "封鎖したい地点を選んでください。"; render(); }
  const node = event.target.closest("[data-node]"); if (node) selectNode(Number(node.dataset.node));
  if (event.target.closest("#new-game") || event.target.closest("#result-new")) newGame();
});
setInterval(() => refreshPulse(), 60000);
state.pulse = describePulse(fallbackPulse()); newGame();
