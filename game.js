"use strict";

const LOCATIONS = [
  ["レイキャビク", "北の海", 64.1466, -21.9426], ["ナイロビ", "東アフリカ", -1.2864, 36.8172],
  ["バルパライソ", "南米西岸", -33.0472, -71.6127], ["ウランバートル", "中央アジア", 47.8864, 106.9057],
  ["ホバート", "南の島", -42.8821, 147.3272], ["リスボン", "大西洋岸", 38.7223, -9.1393],
  ["バンクーバー", "北太平洋", 49.2827, -123.1207], ["ケープタウン", "南アフリカ", -33.9249, 18.4241],
  ["モンゴメリー", "北米内陸", 32.3668, -86.3], ["釧路", "北西太平洋", 42.9849, 144.3814],
  ["シドニー", "珊瑚海", -33.8688, 151.2093], ["アンカレッジ", "北極圏", 61.2181, -149.9003],
];
const TYPES = {
  light: { name: "晴れ", icon: "☼" }, cloud: { name: "雲", icon: "☁" }, fog: { name: "霧", icon: "≋" },
  rain: { name: "雨", icon: "☂" }, snow: { name: "雪", icon: "❄" }, storm: { name: "嵐", icon: "ϟ" },
};
const THEORIES = [
  { id: "wind", name: "偏西風の理論", text: "風の印があるカードは、基礎点が +6。" },
  { id: "horizon", name: "地平線の理論", text: "地平線（3地域以上）の加点が +18。" },
  { id: "resonance", name: "反復の理論", text: "同調の加点が +16。" },
  { id: "pressure", name: "等圧の理論", text: "等圧線（連続強度）の加点が +16。" },
  { id: "water", name: "水文学の理論", text: "雨・雪・霧のカードは、基礎点が +5。" },
];
const state = { deck: [], hand: [], discard: [], selected: new Set(), chapter: 1, target: 0, papers: 4, discards: 2, score: 0, theories: [], phase: "loading", log: [], source: "" };
const $ = selector => document.querySelector(selector);
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const hash = text => [...text].reduce((value, char) => ((value << 5) - value + char.charCodeAt(0)) | 0, 2166136261) >>> 0;
const random = seed => () => { let value = seed += 0x6d2b79f5; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
function shuffle(array) { for (let index = array.length - 1; index > 0; index -= 1) { const pick = Math.floor(Math.random() * (index + 1)); [array[index], array[pick]] = [array[pick], array[index]]; } return array; }
function log(text) { state.log.unshift(text); state.log = state.log.slice(0, 7); }
function weatherType(code) { if (code <= 1) return "light"; if (code <= 3) return "cloud"; if (code <= 48) return "fog"; if (code <= 67) return "rain"; if (code <= 77) return "snow"; return "storm"; }
function makeCard(observation, copy) {
  const type = weatherType(observation.code);
  const intensity = clamp(1 + Math.floor(observation.wind / 9) + (type === "storm" ? 2 : 0) + (type === "snow" ? 1 : 0), 1, 6);
  return { id: `${observation.city}-${copy}-${Math.random().toString(36).slice(2)}`, city: observation.city, region: observation.region, type, intensity, wind: observation.wind >= 18, temp: Math.round(observation.temp) };
}
function cardsFromObservations(observations) { return shuffle(observations.flatMap(observation => [makeCard(observation, 1), makeCard(observation, 2)])); }
function draw() { while (state.hand.length < 8 && (state.deck.length || state.discard.length)) { if (!state.deck.length) state.deck = shuffle(state.discard.splice(0)); state.hand.push(state.deck.pop()); } }
function chapterTarget() { return [105, 160, 230][state.chapter - 1] || 230; }
function resetChapter() { state.target = chapterTarget(); state.papers = 4; state.discards = 2; state.selected.clear(); state.deck.push(...state.hand.splice(0), ...state.discard.splice(0)); shuffle(state.deck); draw(); }
function start(observations, source) { state.deck = cardsFromObservations(observations); state.hand = []; state.discard = []; state.selected.clear(); state.chapter = 1; state.score = 0; state.theories = []; state.phase = "playing"; state.log = ["観測札を配りました。最初の式を作ってください。"]; state.source = source; resetChapter(); render(); }
function selectedCards() { return state.hand.filter(card => state.selected.has(card.id)); }
function longestRun(values) { const unique = [...new Set(values)].sort((a, b) => a - b); let best = 1; let current = 1; for (let index = 1; index < unique.length; index += 1) { current = unique[index] === unique[index - 1] + 1 ? current + 1 : 1; best = Math.max(best, current); } return best; }
function calculate(cards) {
  if (!cards.length) return { score: 0, name: "まだ式はありません", copy: "カードを1〜5枚選んでください。", parts: [] };
  let base = cards.reduce((total, card) => total + card.intensity * 5, 0); const parts = [`基礎記録 ${base}`];
  const groups = Object.values(cards.reduce((all, card) => { all[card.type] = (all[card.type] || 0) + 1; return all; }, {})); const same = Math.max(...groups);
  const regions = new Set(cards.map(card => card.region)).size; const types = new Set(cards.map(card => card.type)).size; const run = longestRun(cards.map(card => card.intensity)); let bonus = 0; const names = [];
  if (same >= 2) { const points = [0, 0, 10, 28, 51, 80][same]; bonus += points; names.push("同調"); parts.push(`同調 +${points}`); }
  if (run >= 3) { const points = 18 + (run - 3) * 11; bonus += points; names.push("等圧線"); parts.push(`等圧線 +${points}`); }
  if (regions >= 3) { const points = 15 + (regions - 3) * 8; bonus += points; names.push("地平線"); parts.push(`地平線 +${points}`); }
  if (types >= 4) { const points = 27 + (types - 4) * 12; bonus += points; names.push("前線"); parts.push(`前線 +${points}`); }
  state.theories.forEach(theory => {
    let points = 0;
    if (theory === "wind") points = cards.filter(card => card.wind).length * 6;
    if (theory === "water") points = cards.filter(card => ["rain", "snow", "fog"].includes(card.type)).length * 5;
    if (theory === "horizon" && regions >= 3) points = 18;
    if (theory === "resonance" && same >= 2) points = 16;
    if (theory === "pressure" && run >= 3) points = 16;
    if (points) { bonus += points; parts.push(`採用理論 +${points}`); }
  });
  const score = base + bonus; return { score, name: names.length ? names.join(" × ") : "単純観測", copy: names.length ? "重なった現象が、歪みを大きく削ります。" : "弱い式です。空模様・強度・地域を組み合わせてください。", parts };
}
function submit() {
  if (state.phase !== "playing") return; const cards = selectedCards(); if (!cards.length) return notice("まずカードを選んでください。");
  const result = calculate(cards); state.target -= result.score; state.score += result.score; state.papers -= 1; state.hand = state.hand.filter(card => !state.selected.has(card.id)); state.discard.push(...cards); state.selected.clear();
  log(`「${result.name}」を提出。歪みを ${result.score} 削りました。`); draw();
  if (state.target <= 0) return completeChapter(); if (state.papers <= 0) { state.phase = "lost"; log("提出枠を使い切りました。今日の譜は完成しませんでした。"); return render(); } render();
}
function discard() {
  if (state.phase !== "playing") return; const cards = selectedCards(); if (!cards.length) return notice("引き直すカードを選んでください。"); if (!state.discards) return notice("この章では、もう引き直せません。");
  state.discards -= 1; state.hand = state.hand.filter(card => !state.selected.has(card.id)); state.deck.push(...cards); shuffle(state.deck); state.selected.clear(); draw(); log(`${cards.length} 枚を遠方の束へ戻し、引き直しました。`); render();
}
function completeChapter() {
  if (state.chapter === 3) { state.phase = "won"; log("全ての天候譜がつながりました。今日の世界を、あなたが一冊の記録にしました。"); return render(); }
  state.phase = "theory"; log(`第${state.chapter}章を完了。次の章のための理論を選びます。`); render();
}
function chooseTheory(id) { state.theories.push(id); state.chapter += 1; state.phase = "playing"; resetChapter(); log(`「${THEORIES.find(theory => theory.id === id).name}」を採用しました。`); render(); }
function notice(text) { log(text); render(); }
function fallbackObservations() {
  const today = new Date().toISOString().slice(0, 10); const roll = random(hash(today)); return shuffle([...LOCATIONS]).slice(0, 7).map(([city, region]) => ({ city, region, code: Math.floor(roll() * 100), wind: 4 + Math.floor(roll() * 39), temp: -8 + Math.floor(roll() * 36) }));
}
async function loadReality() {
  state.phase = "loading"; render(); $("#refresh").disabled = true; $("#refresh").textContent = "遠方の空を照会中…";
  const locations = shuffle([...LOCATIONS]).slice(0, 7);
  try {
    const results = await Promise.all(locations.map(async ([city, region, latitude, longitude]) => {
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=weather_code,wind_speed_10m,temperature_2m&timezone=auto`);
      if (!response.ok) throw new Error("observation failed"); const data = await response.json(); return { city, region, code: data.current.weather_code, wind: data.current.wind_speed_10m, temp: data.current.temperature_2m };
    }));
    start(results, "ランダムな7つの遠方観測所から、現在の公開天気を受信しました。");
  } catch (error) {
    start(fallbackObservations(), "遠方の天気を受信できないため、今日の日付から代替観測を編みました。");
  } finally { $("#refresh").disabled = false; $("#refresh").textContent = "遠方の観測を更新"; }
}
function render() {
  const finished = state.phase === "won" || state.phase === "lost"; const formula = calculate(selectedCards());
  $("#chapter").textContent = state.phase === "loading" ? "読み込み中" : `第 ${state.chapter} 章 / 3`;
  $("#distortion").textContent = state.phase === "loading" ? "—" : Math.max(0, state.target);
  $("#papers").textContent = state.phase === "loading" ? "—" : state.papers;
  $("#score").textContent = state.score;
  $("#source-note").textContent = state.source || "遠方の観測所へ照会中…";
  $("#cards").innerHTML = state.hand.map(card => { const type = TYPES[card.type]; const selected = state.selected.has(card.id); return `<button class="card ${selected ? "selected" : ""}" data-card="${card.id}" type="button" ${state.phase !== "playing" ? "disabled" : ""}><span class="card-top"><span class="weather">${type.icon}</span><span class="value">強度 ${card.intensity}</span></span><span class="city">${card.city}</span><span class="meta">${type.name} ・ ${card.region} ・ ${card.temp}℃</span>${card.wind ? '<span class="tag">風の印</span>' : ""}</button>`; }).join("") || "<p>観測札を補充しています。</p>";
  $("#selection-note").textContent = state.phase === "loading" ? "観測札を取得しています。" : finished ? (state.phase === "won" ? "完了：遠方の空を、あなたの式でつなぎました。" : "失敗：観測を更新して、もう一度式を編めます。") : `${state.selected.size} 枚を選択中。最大5枚まで。`;
  $("#submit").disabled = state.phase !== "playing"; $("#discard").disabled = state.phase !== "playing" || !state.discards; $("#discards").textContent = `(${state.discards})`;
  $("#formula-title").textContent = formula.name; $("#formula-copy").textContent = formula.copy; $("#formula-score").textContent = formula.score; $("#formula-parts").innerHTML = formula.parts.map(part => `<li>${part}</li>`).join("");
  $("#log").innerHTML = state.log.map(entry => `<li>${entry}</li>`).join("");
  const theoryPanel = $("#theory-panel"); theoryPanel.classList.toggle("hidden", state.phase !== "theory");
  if (state.phase === "theory") { const pool = shuffle(THEORIES.filter(theory => !state.theories.includes(theory.id))).slice(0, 3); $("#theory-title").textContent = `第${state.chapter}章を完了`; $("#theory-copy").textContent = "次の章では歪みがさらに深くなります。採用する理論を一つ選んでください。"; $("#theory-options").innerHTML = pool.map(theory => `<button class="theory-option" data-theory="${theory.id}" type="button"><strong>${theory.name}</strong><span>${theory.text}</span></button>`).join(""); }
}
document.addEventListener("click", event => {
  const card = event.target.closest("[data-card]"); if (card && state.phase === "playing") { const id = card.dataset.card; if (state.selected.has(id)) state.selected.delete(id); else if (state.selected.size < 5) state.selected.add(id); else return notice("観測式には5枚までしか入れられません。"); render(); }
  const theory = event.target.closest("[data-theory]"); if (theory) chooseTheory(theory.dataset.theory);
  if (event.target.closest("#submit")) submit(); if (event.target.closest("#discard")) discard(); if (event.target.closest("#refresh")) loadReality();
});
loadReality();
