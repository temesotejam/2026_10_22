"use strict";

const NODES = ["港", "市場", "塔", "駅", "公園", "図書館", "病院", "劇場", "工場", "広場", "研究所", "屋上"];
const MAP_POINTS = [[9, 18], [32, 12], [60, 18], [87, 13], [19, 42], [43, 35], [67, 42], [88, 34], [11, 73], [38, 78], [66, 68], [89, 76]];
const state = { player: 8, editor: null, turns: 0, blocks: 2, evidence: 0, mode: "move", blocked: new Map(), traces: new Map(), altered: new Set(), rebutted: new Set(), scan: null, pulse: null, status: "playing", log: [], event: "" };
const $ = selector => document.querySelector(selector);
const neighbors = node => [node - 4, node + 4, node % 4 ? node - 1 : -1, node % 4 !== 3 ? node + 1 : -1].filter(value => value >= 0 && value < 12);
const hash = text => [...text].reduce((value, char) => ((value << 5) - value + char.charCodeAt(0)) | 0, 2166136261) >>> 0;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const icon = node => ["⚓", "◈", "▴", "↟", "♣", "▤", "✚", "◌", "▦", "✧", "⌬", "⌂"][node];
function addLog(text) { state.log.unshift(text); state.log = state.log.slice(0, 7); }
function fetchJson(url) { return fetch(url, { headers: { Accept: "application/json" } }).then(response => { if (!response.ok) throw new Error("feed unavailable"); return response.json(); }); }
function fallbackPulse() { const now = new Date(); const base = hash(`${now.toISOString().slice(0, 13)}-${now.getUTCMinutes()}`); return { tech: base % 8, attention: (base >>> 3) % 100, earth: (base >>> 8) % 18, clock: now.getUTCMinutes(), live: false }; }
function describePulse(pulse) {
  const development = clamp(Math.round((pulse.tech / 30) * 100), 0, 100);
  const urgency = clamp(Math.round(development * .45 + pulse.attention * .3 + pulse.earth * 2), 0, 100);
  return { ...pulse, urgency, deceptive: pulse.attention >= 55, pace: urgency >= 68 && pulse.attention >= 40 && pulse.earth >= 4 ? 2 : 1, tags: [`技術活動 ${pulse.tech}`, `話題の熱 ${pulse.attention}`, `地球信号 ${pulse.earth}`] };
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
    state.pulse = describePulse({
      tech: github.filter(event => ["PushEvent", "ReleaseEvent", "CreateEvent"].includes(event.type)).length,
      attention: clamp(Math.round(newsItems.reduce((sum, item) => sum + (item.score || 0), 0) / 10), 0, 99),
      earth: clamp(quakes.features.length, 0, 99), clock: new Date().getUTCMinutes(), live: true,
    });
  } catch (error) { state.pulse = fallback; }
  if (state.editor) state.editor.pace = state.pulse.pace;
  if (!initial) addLog(`世界パルス更新。改竄者の今回の移動は最大 ${state.pulse.pace} 地点。`);
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
function distance(from, to) { const path = shortestPath(from, to); return path ? path.length - 1 : 99; }
function createPlan() {
  const pulse = state.pulse || describePulse(fallbackPulse());
  const seed = hash(`${pulse.tech}-${pulse.attention}-${pulse.earth}-${pulse.clock}`);
  const choices = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11]; const targets = []; let value = seed;
  while (targets.length < 5) { value = (value * 1664525 + 1013904223) >>> 0; const choice = choices[value % choices.length]; if (!targets.includes(choice)) targets.push(choice); }
  state.editor = { pos: 0, targets, index: 0, pace: pulse.pace, charge: 0, candidates: [], verified: false, heat: 0 };
}
function setAlarm(target) {
  const near = [...new Set([...neighbors(target), ...neighbors(target).flatMap(neighbors)])].filter(node => node !== target);
  near.sort((a, b) => hash(`${state.pulse.clock}-${a}-${state.turns}`) - hash(`${state.pulse.clock}-${b}-${state.turns}`));
  state.editor.candidates = [target, ...near.slice(0, 2)]; state.editor.verified = false;
}
function advanceTarget() {
  for (let attempt = 0; attempt < state.editor.targets.length; attempt += 1) {
    state.editor.index = (state.editor.index + 1) % state.editor.targets.length;
    if (!state.altered.has(state.editor.targets[state.editor.index])) return;
  }
}
function redirectEditor() {
  state.editor.heat = (state.editor.heat || 0) + 1;
  if (state.editor.heat < 2) return false;
  advanceTarget(); state.editor.heat = 0; state.editor.charge = 0; state.editor.candidates = []; state.editor.verified = false;
  state.event = "改竄者が追跡を振り切り、別の記録を狙い始めました。痕跡を照合して行き先を探ってください。"; addLog("改竄者が狙いを切り替えた。"); return true;
}
function newGame() {
  state.player = 8; state.turns = 0; state.blocks = 2; state.evidence = 0; state.mode = "move"; state.blocked = new Map(); state.traces = new Map(); state.altered = new Set(); state.rebutted = new Set(); state.scan = null; state.status = "playing"; state.log = [];
  createPlan(); state.traces.set(state.editor.pos, { ttl: 3, age: 0 }); state.event = "あなたは「工場」にいます。追跡なら「公園」か「広場」へ。新しい痕跡を照合すれば、反証と確保に使える証拠が得られます。"; addLog("調査開始。改竄者は5つの候補から記録を書き換えようとしています。"); render(); refreshPulse();
}
function canMove(node) { return neighbors(state.player).includes(node) && !state.blocked.has(node); }
function decay() {
  for (const [node, trace] of state.traces) { if (trace.ttl <= 1) state.traces.delete(node); else state.traces.set(node, { ttl: trace.ttl - 1, age: trace.age + 1 }); }
  for (const [node, time] of state.blocked) { if (time <= 1) { state.blocked.delete(node); addLog(`${NODES[node]}の隔離が解除されました。`); } else state.blocked.set(node, time - 1); }
}
function alterRecord() {
  const target = state.editor.targets[state.editor.index];
  if (state.editor.pos !== target) return false;
  if (state.blocked.has(target)) {
    const exits = neighbors(target).filter(node => !state.blocked.has(node) && node !== state.player).sort((a, b) => distance(b, state.player) - distance(a, state.player));
    state.editor.charge = 0;
    if (!exits.length) return finish(true, `${NODES[target]}を隔離し、逃げ場を失った改竄者を確保しました。`);
    state.traces.set(target, { ttl: 3, age: 0 }); state.editor.pos = exits[0]; state.editor.heat = 0; state.editor.candidates = []; state.editor.verified = false; state.event = `${NODES[target]}の隔離で改竄準備を中断。改竄者は「${NODES[exits[0]]}」へ退避しました。`; addLog(`${NODES[target]}の隔離で改竄者が退避。`); return true;
  }
  state.editor.charge += 1;
  if (state.editor.charge < 2) { state.event = `改竄者が「${NODES[target]}」の記録を書き換え中です（準備 ${state.editor.charge} / 2）。`; addLog(`${NODES[target]}で改竄準備を確認。`); return true; }
  state.altered.add(target); state.rebutted.delete(target); state.editor.charge = 0; state.editor.heat = 0; state.editor.candidates = []; state.editor.verified = false; addLog(`「${NODES[target]}」の記録が書き換えられました。`); state.event = `${NODES[target]}の記録が書き換え済みです。証拠2つで反証できます。`;
  if (state.altered.size >= 3) finish(false, "3つの記録が書き換えられ、都市の履歴が確定してしまいました。");
  if (state.status === "playing") advanceTarget();
  return true;
}
function editorTurn() {
  if (state.status !== "playing") return;
  decay();
  for (let step = 0; step < state.editor.pace && state.status === "playing"; step += 1) {
    if (alterRecord()) break;
    const target = state.editor.targets[state.editor.index]; const path = shortestPath(state.editor.pos, target);
    if (!path) {
      const detours = neighbors(state.editor.pos).filter(node => !state.blocked.has(node) && node !== state.player);
      if (!detours.length) return finish(true, "隔離で逃げ場を失った改竄者を確保しました。");
      const before = state.editor.pos; state.editor.pos = detours[(state.pulse.clock + state.turns + step) % detours.length]; state.traces.set(before, { ttl: 3, age: 0 }); state.event = "隔離を前に、改竄者が別ルートを探しています。新しい痕跡を追ってください。"; addLog("改竄者が隔離を迂回中。"); break;
    }
    if (path.length < 2) break;
    const before = state.editor.pos; const next = path[1];
    if (next === state.player) {
      const escapes = neighbors(before).filter(node => !state.blocked.has(node) && node !== state.player).sort((a, b) => distance(b, state.player) - distance(a, state.player));
      if (!escapes.length) return finish(true, `${NODES[before]}で改竄者を追い詰め、確保しました。`);
      state.editor.pos = escapes[0]; state.editor.candidates = []; state.editor.verified = false; state.traces.set(before, { ttl: 3, age: 0 }); const redirected = redirectEditor(); if (!redirected) { state.event = `改竄者はあなたを察知し、「${NODES[escapes[0]]}」へ逃げました。新しい痕跡を追ってください。`; addLog("改竄者が監査員を避けて逃走。"); } break;
    }
    state.editor.pos = next; state.traces.set(before, { ttl: 3, age: 0 });
    if (state.pulse.deceptive && (state.pulse.clock + state.turns + step) % 3 === 0) { const fake = neighbors(before).find(node => node !== state.editor.pos && !state.blocked.has(node)); if (fake !== undefined) state.traces.set(fake, { ttl: 2, age: 0 }); }
    if (state.editor.pos === target) { state.editor.charge = 0; state.editor.heat = 0; setAlarm(target); state.event = "警報：3地点で異常反応を検知。照合して本物の改竄作業を特定してください。"; addLog("改竄作業の異常反応を3地点で検知。"); break; }
  }
}
function takeTurn() {
  state.turns += 1; editorTurn();
  if (state.status === "playing" && state.turns % 2 === 0) refreshPulse();
  render();
}
function selectNode(node) {
  if (state.status !== "playing") return;
  state.scan = null;
  if (state.mode === "move") {
    if (!canMove(node)) { state.event = "移動では、青い地点に隣接する地点だけを選べます。"; return render(); }
    state.player = node; state.event = `${NODES[node]}へ移動しました。`;
    if (state.player === state.editor.pos) {
      if (state.evidence >= 1) return finish(true, `証拠を提示し、改竄者を${NODES[node]}で確保しました。`);
      const exits = neighbors(node).filter(next => !state.blocked.has(next) && next !== state.player).sort((a, b) => distance(b, state.player) - distance(a, state.player));
      if (!exits.length) return finish(true, `${NODES[node]}で改竄者を追い詰め、確保しました。`);
      state.editor.pos = exits[0]; state.editor.charge = 0; state.editor.candidates = []; state.editor.verified = false; state.traces.set(node, { ttl: 3, age: 0 }); const redirected = redirectEditor(); if (!redirected) { state.event = `証拠が足りず、改竄者は「${NODES[exits[0]]}」へ逃げました。新しい痕跡を照合して証拠を集めてください。`; addLog("証拠不足で改竄者を取り逃がした。"); } takeTurn(); return;
    }
    addLog(`${NODES[node]}へ移動。`); takeTurn();
  }
  if (state.mode === "scan") {
    const trace = state.traces.get(node); if (trace?.age === 0 && state.evidence < 3) { state.evidence += 1; addLog(`${NODES[node]}の新しい痕跡から証拠を得た（${state.evidence} / 3）。`); }
    addLog(`${NODES[node]}を照合。改竄者の行動後の信号を待機。`); takeTurn();
    if (state.status !== "playing") return;
    const path = shortestPath(node, state.editor.pos); const steps = path ? path.length - 1 : 99; const toward = steps > 0 && path ? NODES[path[1]] : null;
    if (state.editor.candidates.includes(node) && steps === 0) { state.editor.verified = true; addLog(`${NODES[node]}の異常反応が本物の改竄作業だと特定。`); }
    state.scan = { node, steps, toward }; state.event = steps === 0 ? `${NODES[node]}に改竄者がいます！ ${state.evidence ? "証拠を提示して確保できます。" : "証拠がないため、隔離か痕跡の照合を選んでください。"}` : `${NODES[node]}から最短 ${steps} 地点。次に近いのは「${toward}」です。`; addLog(`${NODES[node]}を照合。距離 ${steps}、${toward || "改竄者の地点"}方向。`); render();
  }
  if (state.mode === "block") {
    if (!state.blocks) { state.event = "隔離できる回数を使い切りました。"; return render(); }
    if (node === state.player || state.altered.has(node)) { state.event = "ここは隔離できません。書き換え前の別地点を選んでください。"; return render(); }
    state.blocks -= 1; state.blocked.set(node, 3); state.event = `${NODES[node]}を相手の2手のあいだ隔離しました。`; addLog(`${NODES[node]}を隔離。`); takeTurn();
  }
  if (state.mode === "refute") {
    if (!state.altered.has(node)) { state.event = "反証できるのは、書き換え済み（✦）の記録だけです。"; return render(); }
    if (state.evidence < 2) { state.event = `反証には証拠が2つ必要です。現在は ${state.evidence} です。`; return render(); }
    state.evidence -= 2; state.altered.delete(node); state.rebutted.add(node); state.event = `${NODES[node]}の記録を反証し、都市の履歴を取り戻しました。`; addLog(`${NODES[node]}を反証。証拠を2つ使用。`); takeTurn();
  }
}
function finish(win, message) { state.status = win ? "won" : "lost"; state.event = message; addLog(message); render(); }
function render() {
  const pulse = state.pulse || describePulse(fallbackPulse());
  const chargingText = state.editor && state.editor.verified ? ` · 準備 ${state.editor.charge} / 2` : state.editor?.candidates.length ? " · 異常反応" : "";
  $("#turns").textContent = state.turns; $("#progress").textContent = `${state.altered.size} / 3${chargingText}`; $("#evidence").textContent = `${state.evidence} / 3`; $("#blocks").textContent = state.blocks;
  $("#pulse-title").textContent = pulse.live ? "公開フィードを受信中：改竄者の行動が変化" : "代替パルスで調査を維持中";
  $("#pulse-copy").textContent = `今回の改竄者の移動は最大 ${pulse.pace} 地点。技術活動と話題の熱は迂回・偽痕跡に、地球信号は行動速度に反映されます。`;
  $("#pulse-tags").innerHTML = pulse.tags.map(tag => `<span>${tag}</span>`).join(""); $("#pulse-dot").classList.toggle("ready", pulse.live);
  $("#task").textContent = state.status !== "playing" ? "調査終了。結果を確認してください。" : state.mode === "move" ? "青い地点から、隣の地点へ移動してください。確保には証拠が必要です。" : state.mode === "scan" ? "異常反応か新しい痕跡を照合してください。" : state.mode === "block" ? "隔離したい書き換え前の地点をクリックしてください。" : "反証したい ✦ の地点をクリックしてください。";
  $("#event").textContent = state.event; $("#log").innerHTML = state.log.map(item => `<li>${item}</li>`).join("");
  document.querySelectorAll("[data-mode]").forEach(button => { button.classList.toggle("active", button.dataset.mode === state.mode); button.disabled = state.status !== "playing" || (button.dataset.mode === "block" && !state.blocks) || (button.dataset.mode === "refute" && state.evidence < 2); });
  const board = $("#board"); board.innerHTML = "";
  const routes = document.createElementNS("http://www.w3.org/2000/svg", "svg"); routes.setAttribute("class", "routes"); routes.setAttribute("viewBox", "0 0 100 100"); routes.setAttribute("preserveAspectRatio", "none"); routes.setAttribute("aria-hidden", "true");
  NODES.forEach((_, node) => neighbors(node).filter(next => next > node).forEach(next => { const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); line.setAttribute("x1", MAP_POINTS[node][0]); line.setAttribute("y1", MAP_POINTS[node][1]); line.setAttribute("x2", MAP_POINTS[next][0]); line.setAttribute("y2", MAP_POINTS[next][1]); line.setAttribute("class", state.blocked.has(node) || state.blocked.has(next) ? "route closed-route" : "route"); routes.append(line); })); board.append(routes);
  NODES.forEach((name, node) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "node"; button.dataset.node = node; button.disabled = state.status !== "playing"; button.style.setProperty("--x", `${MAP_POINTS[node][0]}%`); button.style.setProperty("--y", `${MAP_POINTS[node][1]}%`);
    if (node === state.player) button.classList.add("player"); if (state.mode === "move" && canMove(node)) button.classList.add("reachable"); if (state.blocked.has(node)) button.classList.add("blocked"); if (state.altered.has(node)) button.classList.add("activated"); if (state.rebutted.has(node)) button.classList.add("rebutted"); if (state.traces.has(node)) button.classList.add("has-trace"); if (state.scan?.node === node) button.classList.add("scan-result");
    const traceInfo = state.traces.get(node); const trace = traceInfo ? `<span class="trace ${traceInfo.age === 0 ? "fresh" : "old"}">${traceInfo.age === 0 ? "新しい痕跡" : "古い痕跡"}</span>` : ""; const charging = state.editor && state.editor.index < state.editor.targets.length && state.editor.pos === node && state.editor.targets[state.editor.index] === node; const alarm = state.editor?.candidates.includes(node); if (charging && state.editor.verified) button.classList.add("charging"); if (alarm && !state.editor.verified) button.classList.add("alarm"); const target = state.altered.has(node) ? '<span class="target">書換済み</span>' : charging && state.editor.verified ? `<span class="target charging">改竄準備 ${state.editor.charge} / 2</span>` : alarm ? '<span class="target alarm">異常反応</span>' : ""; const scan = state.scan?.node === node ? `<span class="scan-reading">${state.scan.steps === 0 ? "改竄者あり" : `距離 ${state.scan.steps} → ${state.scan.toward}`}</span>` : ""; const rebutted = state.rebutted.has(node) ? '<span class="rebutted-mark">反証済み</span>' : ""; const you = node === state.player ? '<span class="you">あなた</span>' : "";
    button.innerHTML = `<span class="name">${name}</span><span class="symbol">${node === state.player ? "●" : state.blocked.has(node) ? "▣" : state.altered.has(node) ? "✦" : icon(node)}</span>${you}${trace}${target}${scan}${rebutted}`; board.append(button);
  });
  const result = $("#result"); result.classList.toggle("hidden", state.status === "playing");
  if (state.status !== "playing") result.innerHTML = `<h2>${state.status === "won" ? "調査成功" : "調査失敗"}</h2><p>${state.event}</p><button id="result-new" class="outline" type="button">別の調査を開始</button>`;
}
document.addEventListener("click", event => {
  const mode = event.target.closest("[data-mode]"); if (mode && state.status === "playing") { state.mode = mode.dataset.mode; state.event = state.mode === "move" ? "隣の地点を選んで移動してください。確保には証拠が必要です。" : state.mode === "scan" ? "異常反応か新しい痕跡を選び、行動後の信号を照合します。" : state.mode === "block" ? "隔離したい地点を選んでください。" : "書き換え済みの記録を選んで反証してください。"; render(); }
  const node = event.target.closest("[data-node]"); if (node) selectNode(Number(node.dataset.node));
  if (event.target.closest("#new-game") || event.target.closest("#result-new")) newGame();
});
setInterval(() => refreshPulse(), 60000);
state.pulse = describePulse(fallbackPulse()); newGame();
