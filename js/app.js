import { parseArenaData } from "./arena-parser.js";
import { buildArenaRows } from "./arena-geometry.js";
import { Viewer, PLAYER_WEAPONS } from "./scene.js";
import * as gameScene from "./scene.js";
import { CREATIVE_CATALOG } from "./furniture.js";
import { generateRandomMap } from "./random-map.js";

const byId = (id) => document.getElementById(id);
const VIEW_GAME = "game";
const VIEW_OVERVIEW = "3d";
const settingsKey = "arena-forge:settings";
const modeNames = { elimination: "Eliminierung", survival: "Überleben" };
const difficultyNames = { easy: "Leicht", normal: "Normal", hard: "Schwer" };
const categoryNames = { furniture: "Möbel", sanitary: "Sanitär", equipment: "Gerät", lighting: "Beleuchtung", built_in: "Einrichtung", weapon: "Waffe", consumable: "Vorrat", throwable: "Granate" };
const itemIcons = { sanitary: "◇", furniture: "▰", equipment: "⚙", built_in: "▥", lighting: "✦", weapon: "⚔", consumable: "✚", throwable: "✹" };
const weaponSvg = {
  knife: '<path d="M12 24 20 18 56 7 45 17 24 23Z" fill="#c6d9e1"/><path d="m8 24 12-6 4 5-12 7z" fill="#586d7b"/><path d="m20 16 6 10" stroke="#879cab" stroke-width="3"/>',
  sword: '<path d="M21 21 51 3 60 2 55 10 25 26Z" fill="#cbdee8"/><path d="m20 18 7 11" stroke="#cea76b" stroke-width="3"/><path d="m19 25-10 5" stroke="#6e8594" stroke-width="5"/>',
  spear: '<path d="M4 29 47 8" stroke="#aa8760" stroke-width="4"/><path d="m44 5 17-4-11 13z" fill="#c3d6df"/>',
  axe: '<path d="m16 30 22-23" stroke="#b0895f" stroke-width="4"/><path d="M30 5q15-8 26 3l-7 12-9-8-11 2z" fill="#b6cad4"/><path d="m39 4 7 5" stroke="#607b8c" stroke-width="3"/>',
  hammer: '<path d="m18 29 18-18" stroke="#998467" stroke-width="5"/><path d="m30 4 8-3 20 17-6 8z" fill="#8ba5b4"/><path d="m39 1-3 8 17 15 5-6" fill="#c6d5dc"/>',
  bow: '<path d="M18 3q32 13 0 27" fill="none" stroke="#b19873" stroke-width="4"/><path d="m18 3 7 13-7 14" fill="none" stroke="#e1eff4" stroke-width="1"/><path d="M9 16h43" stroke="#c9dce7" stroke-width="2"/><path d="m48 12 9 4-9 4" fill="#bfd7e1"/><path d="m12 12-6 4 6 4" fill="#8bc981"/>',
  pistol: '<path d="M13 9h39v8H30l-5 14H14l5-14h-6z" fill="#738b9c"/><path d="M12 6h43v8H12z" fill="#b3c5cd"/><path d="M18 19h10l-3 10H15z" fill="#415b6a"/><path d="M34 17v6h-6" fill="none" stroke="#728b9c" stroke-width="2"/><path d="M18 7v5M46 7v5" stroke="#607d8d" stroke-width="2"/>',
  rifle: '<path d="M3 10h14l6 4-5 7H3z" fill="#648373"/><path d="M20 11h29v9H20z" fill="#9bb4bf"/><path d="M36 8h17v5H36z" fill="#647e8e"/><path d="M49 13h13v3H49z" fill="#bbcbd2"/><path d="m27 20-4 10h7l4-10M36 20v10h8l-2-10" fill="#526d7b"/><path d="M28 6h12v4H28z" fill="#698493"/>',
  shotgun: '<path d="M4 12h17l5 4-5 6H4z" fill="#a48661"/><path d="M22 12h36v7H22z" fill="#839dab"/><path d="M42 10h19v4H42z" fill="#c9d7dd"/><path d="M30 16h16v7H30z" fill="#ad926d"/><path d="m22 22-4 8h7l5-8" fill="#6d7980"/>',
  smg: '<path d="M4 14h11v8H4z" fill="#566e7c"/><path d="M14 10h36v11H14z" fill="#92aab8"/><path d="M50 13h12v4H50z" fill="#b7cbd6"/><path d="M20 21v9h7v-9M33 21l3 10h8l-4-10" fill="#4c6574"/><path d="M33 7h12v3H33z" fill="#648897"/>',
  sniper: '<path d="M3 12h15l8 4-7 7H3z" fill="#7d9a7b"/><path d="M22 12h26v7H22z" fill="#a2b9c4"/><path d="M46 13h17v3H46z" fill="#c1d2d9"/><path d="M28 5h17v6H28z" fill="#607e8f"/><path d="M30 8h13" stroke="#b0d9db" stroke-width="2"/><path d="m24 20-4 9h7l4-9M43 20v10" stroke="#6d8796" stroke-width="4"/>',
};

let viewer;
let arena;
let arenaRows;
let currentConfig;
let activeView = VIEW_GAME;
let dragItem = null;
let inventoryWasLocked = false;
let pauseWasLocked = false;
let mutedAudio = false;
let messageTimer;
let feedbackTimer;
let damageTimer;
let match = { phase: "ready", mode: "elimination", elapsed: 0, score: 0, kills: 0 };

function gameConfig() {
  return {
    difficulty: byId("difficulty").value,
    mapSize: byId("map-size").value,
    enemyCount: Number(byId("enemy-count").value),
    roomCount: Number(byId("map-room-count").value),
    style: byId("arena-style").value,
    gameMode: byId("game-mode").value,
    seed: byId("map-seed").value.trim() || undefined,
  };
}

function iconFor(item) {
  if (!item) return "·";
  const weaponId = item.weaponId || item.id;
  if (weaponSvg[weaponId]) return `<svg class="weapon-svg weapon-${weaponId}" viewBox="0 0 64 34" aria-hidden="true">${weaponSvg[weaponId]}</svg>`;
  return item.icon || itemIcons[item.category] || "◆";
}

function showStatus(message, error = false) {
  byId("status").textContent = message;
  byId("status").classList.toggle("error", error);
}

function showMessage(message) {
  if (!message) return;
  clearTimeout(messageTimer);
  byId("game-message").textContent = message;
  byId("game-message").classList.add("visible");
  messageTimer = setTimeout(() => byId("game-message").classList.remove("visible"), 2400);
}

function formatCredits(value = 0) {
  return Math.max(0, Number(value) || 0).toLocaleString("de-DE");
}

function updateCredits(value = 0) {
  const label = formatCredits(value);
  byId("credits-hud").textContent = label;
  byId("inventory-credits").textContent = label;
  byId("armory-credits").textContent = `◈ ${label}`;
  document.querySelectorAll(".armory-buy").forEach((button) => {
    const price = Number(button.dataset.price) || 0;
    button.disabled = value < price;
    button.textContent = value < price ? `${formatCredits(price)} Credits nötig` : `Kaufen · ${formatCredits(price)} Credits`;
  });
}

function formatTime(seconds) {
  const time = Math.max(0, Math.ceil(Number(seconds) || 0));
  return `${Math.floor(time / 60).toString().padStart(2, "0")}:${(time % 60).toString().padStart(2, "0")}`;
}

function createSlot(kind, index) {
  const slot = document.createElement("div");
  slot.className = `${kind}-slot empty`;
  slot.dataset.slot = String(index);
  slot.draggable = false;
  slot.tabIndex = 0;
  slot.setAttribute("role", "button");
  slot.innerHTML = `<span class="slot-number">${index + 1}</span><span class="slot-icon">·</span><span class="slot-name">Leer</span>${kind === "hotbar" ? '<span class="slot-ammo"></span>' : ""}`;
  const activate = () => {
    if (byId("inventory-panel").hidden) {
      if (kind === "hotbar") viewer?.selectHotbar(index, true);
      return;
    }
    if (slot.classList.contains("empty")) return;
    if (kind === "hotbar") viewer?.quickMoveHotbar(index);
    else viewer?.quickMoveInventory(index);
  };
  slot.addEventListener("click", activate);
  slot.addEventListener("keydown", (event) => {
    if (event.code === "Enter" || event.code === "Space") {
      event.preventDefault();
      event.stopPropagation();
      activate();
    }
  });
  slot.addEventListener("dragstart", (event) => {
    if (slot.classList.contains("empty")) return event.preventDefault();
    dragItem = { source: kind, index };
    event.dataTransfer.setData("text/plain", JSON.stringify(dragItem));
    event.dataTransfer.effectAllowed = "move";
  });
  slot.addEventListener("dragover", (event) => {
    event.preventDefault();
    slot.classList.add("drag-over");
  });
  slot.addEventListener("dragleave", () => slot.classList.remove("drag-over"));
  slot.addEventListener("drop", (event) => {
    event.preventDefault();
    slot.classList.remove("drag-over");
    try {
      const payload = JSON.parse(event.dataTransfer.getData("text/plain") || "null") || dragItem;
      if (payload?.source === "creative") viewer?.addCreativeItem(payload.templateId, kind, index);
      else if (payload) viewer?.moveInventoryItem(payload.source, payload.index, kind, index);
    } catch {
      showMessage("Dieser Gegenstand konnte nicht verschoben werden.");
    } finally {
      dragItem = null;
    }
  });
  slot.addEventListener("dragend", () => {
    dragItem = null;
    document.querySelectorAll(".drag-over").forEach((element) => element.classList.remove("drag-over"));
  });
  return slot;
}

function createInventoryUi() {
  for (let index = 0; index < 9; index++) byId("hotbar").append(createSlot("hotbar", index));
  for (let index = 0; index < 27; index++) byId("inventory-grid").append(createSlot("inventory", index));
  const catalog = [
    ...PLAYER_WEAPONS.map((weapon) => ({ ...weapon, category: "weapon", templateId: `weapon:${weapon.id}` })),
    ...(gameScene.LOOT_ITEMS || []).map((item) => ({ ...item, templateId: `item:${item.id}` })),
    ...CREATIVE_CATALOG,
  ];
  for (const item of catalog) {
    const card = document.createElement("div");
    card.className = "creative-item";
    card.draggable = true;
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `${item.label} zum Inventar hinzufügen`);
    card.title = `${item.label} · ${categoryNames[item.category] || item.category}`;
    card.dataset.category = item.category;
    card.dataset.label = item.label.toLocaleLowerCase("de");
    card.innerHTML = `<span class="slot-icon">${iconFor(item)}</span>`;
    const name = document.createElement("span");
    name.className = "slot-name";
    name.textContent = item.label;
    card.append(name);
    const templateId = item.templateId || item.id;
    card.addEventListener("dragstart", (event) => {
      dragItem = { source: "creative", templateId };
      event.dataTransfer.setData("text/plain", JSON.stringify(dragItem));
      event.dataTransfer.effectAllowed = "copy";
    });
    card.addEventListener("click", () => viewer?.addCreativeItem(templateId));
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        event.stopPropagation();
        viewer?.addCreativeItem(templateId);
      }
    });
    byId("creative-grid").append(card);
  }
  for (const weapon of PLAYER_WEAPONS.filter((entry) => entry.price > 0)) {
    const card = document.createElement("article");
    card.className = "armory-item";
    card.innerHTML = `<span class="slot-icon">${iconFor(weapon)}</span><div><strong>${weapon.label}</strong><small>◈ ${formatCredits(weapon.price)} Credits</small></div>`;
    const buy = document.createElement("button");
    buy.type = "button";
    buy.className = "armory-buy";
    buy.dataset.price = String(weapon.price);
    buy.setAttribute("aria-label", `${weapon.label} für ${formatCredits(weapon.price)} Credits kaufen`);
    buy.addEventListener("click", () => viewer?.buyWeapon(weapon.id));
    card.append(buy);
    byId("armory-grid").append(card);
  }
  updateCredits(0);
}

function filterCreative() {
  const term = byId("creative-search").value.trim().toLocaleLowerCase("de");
  const category = byId("creative-category").value;
  let visible = 0;
  document.querySelectorAll(".creative-item").forEach((card) => {
    card.hidden = Boolean((term && !card.dataset.label.includes(term)) || (category !== "all" && card.dataset.category !== category));
    if (!card.hidden) visible++;
  });
  byId("creative-empty").hidden = visible > 0;
}

function updateReadyPanel() {
  const running = viewer?.pointer.isLocked;
  const overlay = !byId("pause-panel").hidden || !byId("inventory-panel").hidden || !byId("result-panel").hidden;
  byId("ready-panel").classList.toggle("running", Boolean(running || overlay));
  const resumed = match.phase === "active";
  byId("game-state").innerHTML = resumed ? 'Deine Arena<br><em>wartet auf dich.</em>' : 'Deine nächste<br><em>Herausforderung.</em>';
  byId("ready-label").textContent = resumed ? "MATCH UNTERBROCHEN" : "ARENA FORGE";
  byId("game-start").innerHTML = `${resumed ? "Match fortsetzen" : "Match starten"} <span>→</span>`;
  const config = currentConfig || gameConfig();
  byId("ready-mode").textContent = modeNames[config.gameMode] || "Eliminierung";
  byId("ready-difficulty").textContent = difficultyNames[config.difficulty] || "Normal";
  byId("ready-enemies").textContent = `${config.enemyCount} Gegner`;
  byId("ready-description").textContent = config.gameMode === "survival"
    ? "Überlebe fünf Wellen. Sammle Vorräte zwischen den Kämpfen, nutze Deckung und behalte deine Munition im Blick."
    : "Sichere die Arena. Nutze Deckung, sammle Ausrüstung und schalte alle Gegner aus. Du hast drei Leben.";
}

function loadArena(arenaXml) {
  try {
    arena = parseArenaData(arenaXml);
    arenaRows = buildArenaRows(arena);
    byId("project-title").textContent = arena.projectName || "Taktische Arena";
    byId("arena-meta").textContent = `${arenaRows.length} Bereiche · ${arena.planObjects.length} Objekte`;
    viewer.restartGame(arena, arenaRows, currentConfig);
    applyControlSettings(false);
    updateReadyPanel();
    showStatus("Arena bereit. Starte dein Match oder passe die nächste Arena an.");
  } catch (error) {
    console.error("Arena konnte nicht erzeugt werden:", error);
    showStatus(`Arena konnte nicht erzeugt werden: ${error.message}`, true);
  }
}

function generateArena() {
  viewer?.pointer.unlock();
  setInventoryOpen(false, false);
  setPauseOpen(false, false);
  byId("result-panel").hidden = true;
  byId("kill-feed").replaceChildren();
  byId("interaction-prompt").hidden = true;
  activeView = VIEW_GAME;
  currentConfig = gameConfig();
  match = { phase: "ready", mode: currentConfig.gameMode, elapsed: 0, score: 0, kills: 0 };
  loadArena(generateRandomMap(Math.random, currentConfig));
  updateViewUi();
}

function updateViewUi() {
  const game = activeView === VIEW_GAME;
  byId("tab-game").classList.toggle("active", game);
  byId("tab-game").setAttribute("aria-pressed", String(game));
  byId("tab-3d").classList.toggle("active", !game);
  byId("tab-3d").setAttribute("aria-pressed", String(!game));
  byId("game-hud").hidden = !game;
  byId("orbit-note").hidden = game;
  byId("axis-note").hidden = game;
  viewer?.resize();
}

function setView(view) {
  if (activeView === view) return;
  activeView = view;
  if (view !== VIEW_GAME) {
    setInventoryOpen(false, false);
    setPauseOpen(false, false);
    viewer?.pointer.unlock();
  }
  if (arena) {
    viewer.setGame(view === VIEW_GAME, arena, arenaRows, currentConfig);
    if (view !== VIEW_GAME) viewer.fit();
    else applyControlSettings(false);
  }
  updateReadyPanel();
  updateViewUi();
}

function setInventoryOpen(open, relock = true) {
  if (open === !byId("inventory-panel").hidden) return;
  if (open) {
    if (match.phase === "victory" || match.phase === "defeat") return;
    if (!byId("pause-panel").hidden) setPauseOpen(false, false);
    inventoryWasLocked = Boolean(viewer?.pointer.isLocked);
    viewer?.pointer.unlock();
  }
  byId("inventory-panel").hidden = !open;
  byId("game-hud").classList.toggle("inventory-open", open);
  viewer?.setInventoryOpen(open);
  updateReadyPanel();
  if (open) byId("inventory-close").focus({ preventScroll: true });
  if (!open && relock && inventoryWasLocked && activeView === VIEW_GAME) viewer?.lockGame();
  if (!open) inventoryWasLocked = false;
}

function setPauseOpen(open, relock = true) {
  if (open === !byId("pause-panel").hidden) return;
  if (open) {
    if (match.phase === "victory" || match.phase === "defeat") return;
    const inventoryWasOpen = !byId("inventory-panel").hidden;
    const previousLock = inventoryWasLocked;
    setInventoryOpen(false, false);
    pauseWasLocked = Boolean(viewer?.pointer.isLocked || (inventoryWasOpen && previousLock));
    viewer?.setPaused(true);
    viewer?.pointer.unlock();
  }
  byId("pause-panel").hidden = !open;
  byId("game-hud").classList.toggle("overlay-open", open || !byId("result-panel").hidden);
  if (!open) {
    viewer?.setPaused(false);
    if (relock && pauseWasLocked && activeView === VIEW_GAME) viewer?.lockGame();
    pauseWasLocked = false;
  }
  updateReadyPanel();
  if (open) byId("pause-resume").focus({ preventScroll: true });
}

function readSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(settingsKey) || "{}");
    for (const id of ["sound-volume", "music-volume", "sensitivity", "fov"]) {
      if (Number.isFinite(settings[id])) {
        const input = byId(id);
        input.value = String(Math.max(Number(input.min), Math.min(Number(input.max), settings[id])));
      }
    }
    mutedAudio = Boolean(settings.muted);
  } catch { /* Settings are optional when browser storage is unavailable. */ }
}

function saveSettings() {
  try {
    const settings = { muted: mutedAudio };
    for (const id of ["sound-volume", "music-volume", "sensitivity", "fov"]) settings[id] = Number(byId(id).value);
    localStorage.setItem(settingsKey, JSON.stringify(settings));
  } catch { /* Gameplay remains available without browser storage. */ }
}

function updateAudio(persist = true) {
  const sound = mutedAudio ? 0 : Number(byId("sound-volume").value) / 100;
  const music = mutedAudio ? 0 : Number(byId("music-volume").value) / 100;
  byId("sound-volume-value").textContent = `${Math.round(sound * 100)} %`;
  byId("music-volume-value").textContent = `${Math.round(music * 100)} %`;
  byId("audio-mute").textContent = mutedAudio ? "Ton einschalten" : "Ton ausschalten";
  viewer?.setAudioLevels({ sound, music });
  if (persist) saveSettings();
}

function applyControlSettings(persist = true) {
  const sensitivity = Number(byId("sensitivity").value) / 100;
  const fov = Number(byId("fov").value);
  byId("sensitivity-value").textContent = `${sensitivity.toFixed(1).replace(".", ",")} ×`;
  byId("fov-value").textContent = `${fov}°`;
  viewer?.setControlSettings?.({ sensitivity, fov });
  if (persist) saveSettings();
}

function renderSlot(slot, item, index) {
  slot.classList.toggle("empty", !item);
  slot.draggable = Boolean(item);
  slot.querySelector(".slot-icon").innerHTML = iconFor(item);
  slot.querySelector(".slot-name").textContent = item?.label || "Leer";
  slot.title = item ? `${item.label}${item.ammoCapacity != null ? ` · ${item.ammo} / ${item.reserveAmmo ?? item.ammoCapacity} ${item.ammoType || "Munition"}` : ""}` : `Slot ${index + 1} · Leer`;
  slot.setAttribute("aria-label", slot.title);
  const ammo = slot.querySelector(".slot-ammo");
  if (ammo) ammo.textContent = item?.ammoCapacity != null ? String(item.ammo ?? 0) : "";
}

function updateHotbar({ selected, slots = [], inventory = [], message }) {
  document.querySelectorAll(".hotbar-slot").forEach((slot, index) => {
    renderSlot(slot, slots[index], index);
    slot.classList.toggle("selected", index === selected);
    slot.setAttribute("aria-pressed", String(index === selected));
  });
  document.querySelectorAll(".inventory-slot").forEach((slot, index) => renderSlot(slot, inventory[index], index));
  const equipped = slots[selected];
  const ranged = equipped?.ammoCapacity != null;
  byId("ammo-status").hidden = !ranged;
  byId("equipped-name").textContent = equipped?.label || "Hände";
  byId("equipped-hint").textContent = equipped?.weaponId === "bow" ? "Halten · Spannen / Loslassen · Schießen"
    : ranged ? "Linksklick · Feuern / Rechtsklick · Zielen"
    : equipped?.category === "consumable" || ["armor", "ammo"].includes(equipped?.id) ? "Rechtsklick · Benutzen"
    : equipped?.category === "throwable" ? "Rechtsklick · Werfen"
    : equipped && equipped.category !== "weapon" ? "Rechtsklick · Platzieren"
    : "Linksklick · Nahkampf";
  if (ranged) {
    byId("ammo-count").textContent = String(equipped.ammo ?? 0);
    byId("ammo-reserve").textContent = String(equipped.reserveAmmo ?? 0);
    byId("ammo-type").textContent = equipped.reloading ? "Lädt nach …" : equipped.ammoType || "Munition";
    byId("ammo-status").classList.toggle("empty-ammo", !equipped.ammo);
    byId("reload-track").hidden = !equipped.reloading;
    byId("ammo-reload-key").hidden = equipped.weaponId === "bow";
  }
  byId("inventory-capacity").textContent = `${inventory.filter(Boolean).length} / 27 belegt`;
  showMessage(message);
}

function updatePlayerStatus(detail) {
  const max = detail.maxHealth || detail.max || 100;
  const ratio = Math.max(0, Math.min(1, detail.health / max));
  byId("player-health-value").textContent = String(detail.health ?? 100);
  byId("player-health-fill").style.width = `${ratio * 100}%`;
  byId("player-status").classList.toggle("low", ratio <= .3);
  byId("player-armor-value").textContent = String(detail.armor ?? 0);
  byId("player-stamina-fill").style.width = `${Math.max(0, Math.min(100, Number(detail.stamina ?? 100)))}%`;
  byId("score-kills").textContent = String(detail.kills ?? 0);
  byId("score-deaths").textContent = String(detail.deaths ?? 0);
  byId("pause-health").textContent = String(detail.health ?? 100);
  byId("pause-kills").textContent = String(detail.kills ?? 0);
  byId("pause-deaths").textContent = String(detail.deaths ?? 0);
  updateCredits(detail.credits ?? 0);
  showMessage(detail.message);
}

function updateMatchStatus(detail) {
  match = { ...match, ...detail };
  byId("match-mode").textContent = (modeNames[match.mode] || "Eliminierung").toLocaleUpperCase("de");
  byId("match-clock").textContent = formatTime(match.timeRemaining ?? match.elapsed);
  byId("match-wave").textContent = match.waveDelay > 0 ? `NÄCHSTE WELLE IN ${match.waveDelay}s` : match.mode === "survival" ? `WELLE ${match.wave || 1} / ${match.totalWaves || 5}` : "ARENA SICHERN";
  byId("match-alive").textContent = String(match.alive ?? currentConfig?.enemyCount ?? 0);
  byId("match-lives").textContent = `${match.lives ?? 3} LEBEN`;
  byId("score-points").textContent = String(match.score ?? 0);
  byId("pause-score").textContent = String(match.score ?? 0);
  byId("score-teams").textContent = `Rekord ${(match.bestScore ?? 0).toLocaleString("de")}`;
  const finished = match.phase === "victory" || match.phase === "defeat";
  if (finished) {
    setInventoryOpen(false, false);
    setPauseOpen(false, false);
    const victory = match.phase === "victory";
    byId("result-panel").hidden = false;
    byId("result-panel").classList.toggle("defeat", !victory);
    byId("result-title").textContent = victory ? "Arena gesichert." : "Der nächste Versuch zählt.";
    byId("result-eyebrow").textContent = victory ? "MISSION ERFÜLLT" : "MATCH BEENDET";
    byId("result-symbol").textContent = victory ? "✦" : "↻";
    byId("result-description").textContent = victory ? "Starker Einsatz. Neue Arena, neue Chancen — deine nächste Runde wartet." : "Nutze Deckung, lade rechtzeitig nach und sammle Heilung. Versuch es noch einmal.";
    byId("result-score").textContent = String(match.score ?? 0);
    byId("result-kills").textContent = String(match.kills ?? 0);
    byId("result-time").textContent = formatTime(match.elapsed);
    if (!byId("result-panel").contains(document.activeElement)) byId("result-next").focus({ preventScroll: true });
  } else byId("result-panel").hidden = true;
  byId("game-hud").classList.toggle("overlay-open", finished || !byId("pause-panel").hidden);
  updateReadyPanel();
}

function showCombatFeedback({ type }) {
  if (type === "damage") {
    clearTimeout(damageTimer);
    byId("damage-overlay").classList.add("visible");
    damageTimer = setTimeout(() => byId("damage-overlay").classList.remove("visible"), 280);
    return;
  }
  clearTimeout(feedbackTimer);
  byId("hit-marker").classList.add("visible");
  byId("hit-marker").classList.toggle("kill", type === "kill");
  feedbackTimer = setTimeout(() => byId("hit-marker").classList.remove("visible"), type === "kill" ? 330 : 140);
}

function addKillFeed({ killer, victim, weapon, player }) {
  const entry = document.createElement("div");
  entry.className = `kill-entry${player ? " player" : ""}`;
  for (const [tag, text] of [["b", killer || "Unbekannt"], ["em", weapon || "⚔"], ["b", victim || "Gegner"]]) {
    const element = document.createElement(tag);
    element.textContent = text;
    entry.append(element);
  }
  byId("kill-feed").prepend(entry);
  while (byId("kill-feed").children.length > 4) byId("kill-feed").lastElementChild.remove();
  setTimeout(() => entry.remove(), 6500);
}

function drawMinimap(detail) {
  const canvas = byId("minimap-canvas");
  const context = canvas.getContext("2d");
  const bounds = detail.bounds;
  if (!context || !bounds) return;
  const minX = bounds.minX ?? bounds.x ?? 0;
  const minY = bounds.minY ?? bounds.minZ ?? bounds.y ?? 0;
  const maxX = bounds.maxX ?? minX + (bounds.width || 50);
  const maxY = bounds.maxY ?? bounds.maxZ ?? minY + (bounds.height || 40);
  const scale = Math.min((canvas.width - 16) / Math.max(1, maxX - minX), (canvas.height - 16) / Math.max(1, maxY - minY));
  const offsetX = (canvas.width - (maxX - minX) * scale) / 2;
  const offsetY = (canvas.height - (maxY - minY) * scale) / 2;
  const toPoint = (point) => {
    const x = Array.isArray(point) ? point[0] : point.x;
    const y = Array.isArray(point) ? point[1] : point.y ?? point.z;
    return [offsetX + (x - minX) * scale, canvas.height - offsetY - (y - minY) * scale];
  };
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#0d192b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#23384f";
  context.strokeStyle = "#718ba355";
  context.lineWidth = 1;
  for (const room of detail.rooms || []) {
    const rings = typeof room[0]?.[0] === "number" ? [room] : room;
    context.beginPath();
    for (const ring of rings) {
      if (!ring?.length) continue;
      ring.forEach((point, index) => {
        const [x, y] = toPoint(point);
        if (index) context.lineTo(x, y); else context.moveTo(x, y);
      });
      context.closePath();
    }
    context.fill("evenodd");
    context.stroke();
  }
  const dot = (point, radius, color) => {
    const [x, y] = toPoint(point);
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  };
  for (const loot of detail.loot || []) dot(loot, 2, "#f8c479");
  for (const enemy of detail.enemies || []) if (enemy.visible) dot(enemy, 2.8, "#ff8773");
  if (detail.player) {
    const [x, y] = toPoint(detail.player);
    context.save();
    context.translate(x, y);
    context.rotate(detail.player.yaw || 0);
    context.fillStyle = "#a6ef80";
    context.beginPath();
    context.moveTo(0, -5); context.lineTo(-3.5, 4); context.lineTo(0, 2); context.lineTo(3.5, 4); context.closePath(); context.fill();
    context.restore();
  }
}

function restartMatch(lock = true) {
  setInventoryOpen(false, false);
  setPauseOpen(false, false);
  byId("result-panel").hidden = true;
  byId("game-hud").classList.remove("overlay-open");
  byId("kill-feed").replaceChildren();
  viewer?.restartGame(arena, arenaRows, currentConfig);
  applyControlSettings(false);
  updateReadyPanel();
  if (lock) viewer?.lockGame();
}

function toggleFullscreen() {
  const action = document.fullscreenElement === byId("view-3d") ? document.exitFullscreen() : byId("view-3d").requestFullscreen();
  action?.catch(() => showMessage("Vollbild ist in diesem Browser gerade nicht verfügbar."));
}

function bindEvents() {
  byId("random-map").onclick = generateArena;
  byId("game-mode").onchange = () => {
    byId("mode-description").textContent = byId("game-mode").value === "survival" ? "Überlebe fünf immer schwierigere Gegnerwellen." : "Schalte alle Gegner aus und sichere die Arena.";
  };
  byId("lobby-toggle").onclick = () => {
    const closed = byId("app-layout").classList.toggle("lobby-hidden");
    byId("lobby-toggle").setAttribute("aria-expanded", String(!closed));
    viewer?.resize();
  };
  byId("tab-game").onclick = () => setView(VIEW_GAME);
  byId("tab-3d").onclick = () => setView(VIEW_OVERVIEW);
  byId("reset").onclick = () => activeView === VIEW_GAME ? viewer?.resetPlayer() : viewer?.fit();
  byId("game-start").onclick = (event) => {
    event.stopPropagation();
    viewer?.setPaused(false);
    viewer?.lockGame();
  };
  byId("game-fullscreen").onclick = (event) => { event.stopPropagation(); toggleFullscreen(); };
  byId("inventory-close").onclick = () => setInventoryOpen(false);
  byId("pause-resume").onclick = () => {
    setPauseOpen(false, false);
    viewer?.lockGame();
  };
  byId("pause-restart").onclick = () => restartMatch();
  byId("pause-exit").onclick = () => {
    setPauseOpen(false, false);
    setView(VIEW_OVERVIEW);
    byId("app-layout").classList.remove("lobby-hidden");
    byId("lobby-toggle").setAttribute("aria-expanded", "true");
    viewer?.resize();
  };
  byId("result-restart").onclick = () => restartMatch();
  byId("result-next").onclick = () => { generateArena(); viewer?.lockGame(); };
  byId("armory-toggle").onclick = () => {
    const open = byId("armory-section").hidden;
    byId("armory-section").hidden = !open;
    byId("creative-section").hidden = true;
    byId("armory-toggle").setAttribute("aria-pressed", String(open));
    byId("creative-toggle").setAttribute("aria-pressed", "false");
    byId("armory-toggle").textContent = open ? "◈ Waffenkammer schließen" : "◈ Waffenkammer";
    byId("creative-toggle").textContent = "✦ Sandbox-Katalog";
    document.querySelector(".inventory-content").classList.toggle("creative-open", open);
  };
  byId("creative-toggle").onclick = () => {
    const open = byId("creative-section").hidden;
    byId("creative-section").hidden = !open;
    byId("armory-section").hidden = true;
    byId("creative-toggle").setAttribute("aria-pressed", String(open));
    byId("armory-toggle").setAttribute("aria-pressed", "false");
    document.querySelector(".inventory-content").classList.toggle("creative-open", open);
    byId("creative-toggle").textContent = open ? "✦ Katalog schließen" : "✦ Sandbox-Katalog";
    byId("armory-toggle").textContent = "◈ Waffenkammer";
    if (open) byId("creative-search").focus();
  };
  byId("creative-search").oninput = filterCreative;
  byId("creative-category").onchange = filterCreative;
  for (const id of ["sound-volume", "music-volume"]) byId(id).oninput = () => { mutedAudio = false; updateAudio(); };
  for (const id of ["sensitivity", "fov"]) byId(id).oninput = () => applyControlSettings();
  byId("audio-mute").onclick = () => { mutedAudio = !mutedAudio; updateAudio(); };
  addEventListener("keydown", (event) => {
    if (activeView !== VIEW_GAME || event.repeat) return;
    if (event.code === "Escape") {
      if (!byId("inventory-panel").hidden) setInventoryOpen(false, false);
      else if (!byId("pause-panel").hidden) setPauseOpen(false, false);
      return;
    }
    if (event.code === "Tab") {
      const panel = ["result-panel", "pause-panel", "inventory-panel"].map(byId).find((element) => !element.hidden);
      if (panel) {
        const focusable = [...panel.querySelectorAll('button, input, select, [tabindex="0"]')].filter((element) => element.offsetParent !== null);
        const first = focusable[0];
        const last = focusable.at(-1);
        if (!panel.contains(document.activeElement) || (event.shiftKey && document.activeElement === first) || (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        }
      }
      return;
    }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    if (event.code === "KeyI") { event.preventDefault(); setInventoryOpen(byId("inventory-panel").hidden); }
    if (event.code === "KeyP") { event.preventDefault(); setPauseOpen(byId("pause-panel").hidden); }
    if (event.code === "KeyF") { event.preventDefault(); toggleFullscreen(); }
  });
  addEventListener("fullscreenchange", () => {
    byId("game-fullscreen").innerHTML = document.fullscreenElement === byId("view-3d") ? '⛶ <span>Vollbild beenden</span>' : '⛶ <span>Vollbild</span>';
    viewer?.resize();
  });
  const on = (name, callback) => byId("viewport").addEventListener(name, ({ detail }) => callback(detail));
  on("game-lock", updateReadyPanel);
  on("hotbar-change", updateHotbar);
  on("player-status", updatePlayerStatus);
  on("match-status", updateMatchStatus);
  on("interaction-status", ({ label, key = "E" }) => {
    byId("interaction-prompt").hidden = !label;
    byId("interaction-label").textContent = label || "";
    byId("interaction-key").textContent = key;
  });
  on("combat-feedback", showCombatFeedback);
  on("kill-feed", addKillFeed);
  on("mini-map", drawMinimap);
  on("npc-status", (detail) => {
    if (!Object.hasOwn(match, "alive")) byId("match-alive").textContent = String(detail.alive ?? 0);
  });
}

try {
  viewer = new Viewer(byId("viewport"));
  readSettings();
  createInventoryUi();
  bindEvents();
  updateAudio(false);
  applyControlSettings(false);
  generateArena();
} catch (error) {
  console.error("Arena Forge konnte nicht starten:", error);
  showStatus(`Arena Forge konnte nicht starten: ${error.message}. WebGL muss im Browser verfügbar sein.`, true);
}
