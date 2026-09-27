import { ADVENTURE_LEVELS } from "./companions.mjs";
import { escapeHtml as esc } from "./html.mjs";

/**
 * The Progreso rewards: the daily luck wheel, the sticker album and the dice
 * board that pops up when sales earn a roll. The API draws and stores every
 * prize; this module only animates what it was told and reports the grant.
 *
 * Moved verbatim out of dashboard.js's closure; what it used from that closure
 * now arrives as `deps`:
 *   api(path, options)   authenticated dashboard API call
 *   storeId()            active store id
 *   signedIn()           whether a merchant session exists
 *   currentXp()          total XP as the dashboard currently shows it
 *   runnerImage()        data URI of the blob that walks the board (the merchant's own)
 *   celebrateCompanion() plays the Progreso companion's "cheer"
 *   rerender(announce)   re-render the gamification view after a grant
 *   burstConfetti(anchor, options), playTouchSound(kind), audioContext()
 */
export function mountRewardsPanel(deps) {
  // The API draws and stores every prize; the wheel only animates to the slice it was told.
  let rewardsModule = null;
  const loadRewardsModule = () => (rewardsModule ||= import("./rewards.mjs"));
  let rewardsState = null;
  let luckWheelRotation = 0;
  let luckWheelSpinning = false;
  let luckWheelHome = null;

  async function loadRewards() {
    if (!deps.storeId() || !deps.signedIn()) return null;
    try {
      const state = await deps.api(`/dashboard/rewards?storeId=${encodeURIComponent(deps.storeId())}`);
      // Anything without the wheel and board shapes is treated as "no rewards data" rather than trusted.
      rewardsState = state?.wheel && state?.board && Array.isArray(state.wheel.segments) ? state : null;
    } catch { rewardsState = null; }
    renderLuckWheel();
    await renderRewardsBoard();
    maybeOpenRewardsBoardModal();
    return rewardsState;
  }

  function luckWheelSegments() { return rewardsState?.wheel.segments || []; }

  async function buildLuckWheelDisc() {
    const disc = document.getElementById("luckWheelDisc");
    const segments = luckWheelSegments();
    if (!disc || !segments.length || disc.dataset.segments === segments.join(",")) return;
    const { WHEEL_VISUALS } = await loadRewardsModule();
    const slice = 360 / segments.length;
    const point = (degrees, radius) => [radius * Math.sin(degrees * Math.PI / 180), -radius * Math.cos(degrees * Math.PI / 180)].map((value) => Number(value.toFixed(2)));
    disc.dataset.segments = segments.join(",");
    disc.innerHTML = `<circle r="98" class="luck-wheel-rim"/>${segments.map((key, index) => {
      const visual = WHEEL_VISUALS[key]; const start = index * slice; const end = start + slice; const center = start + slice / 2;
      return `<path d="M0 0 L${point(start, 92).join(" ")} A92 92 0 0 1 ${point(end, 92).join(" ")} Z" fill="${esc(visual.color)}"/><g transform="rotate(${center})" fill="${esc(visual.ink || "#15352f")}"><text y="-76" class="luck-wheel-icon">${esc(visual.icon)}</text><text x="47" transform="rotate(-90)" class="luck-wheel-label">${esc(visual.label)}</text></g>`;
    }).join("")}${segments.map((_, index) => { const [cx, cy] = point(index * slice, 92); return `<circle cx="${cx}" cy="${cy}" r="3.2" class="luck-wheel-peg"/>`; }).join("")}`;
  }

  function renderLuckWheelAlbum(newStickerId = null) {
    const stickers = rewardsState?.stickers || [];
    document.getElementById("luckWheelAlbumCount").textContent = `${stickers.filter((sticker) => sticker.owned).length} de ${stickers.length}`;
    document.getElementById("luckWheelAlbum").innerHTML = stickers.map((sticker) => {
      const label = sticker.owned ? esc(sticker.name) : "Sticker por descubrir";
      return `<span class="luck-wheel-sticker${sticker.owned ? " is-owned" : ""}${sticker.rare ? " is-rare" : ""}${sticker.id === newStickerId ? " is-new" : ""}" role="img" title="${label}" aria-label="${label}">${sticker.owned ? esc(sticker.icon) : "?"}</span>`;
    }).join("");
  }

  function showLuckWheelResult(copy, kind = "") {
    const box = document.getElementById("luckWheelResult");
    if (!copy) { box.hidden = true; box.innerHTML = ""; return; }
    box.hidden = false; box.dataset.kind = kind;
    box.innerHTML = `<span class="luck-wheel-result-icon" aria-hidden="true">${esc(copy.icon)}</span><span><strong>${esc(copy.title)}</strong>${esc(copy.message)}</span>`;
  }

  function renderLuckWheel() {
    if (!document.getElementById("luckWheel")) return;
    buildLuckWheelDisc();
    renderLuckWheelAlbum();
    if (luckWheelSpinning) return;
    const wheel = rewardsState?.wheel;
    const canSpin = !!wheel?.available;
    const spin = document.getElementById("luckWheelSpin"); const hub = document.getElementById("luckWheelHub");
    spin.disabled = !canSpin; hub.disabled = !canSpin;
    hub.textContent = canSpin ? "¡Gira!" : "Mañana";
    spin.textContent = canSpin ? (wheel.spinsUsed > 0 ? "Girar otra vez" : "Girar la ruleta") : "Vuelve mañana";
    document.getElementById("luckWheelStatus").textContent = !wheel
      ? "No pudimos cargar la ruleta. Vuelve a intentarlo en un momento."
      : canSpin ? "Una vuelta por día. Gana XP, créditos de IA y stickers." : "Ya usaste tu vuelta de hoy. Mañana (hora de Bolivia) la ruleta vuelve a girar.";
  }

  function openLuckWheelModal() {
    const modal = document.getElementById("luckWheelModal"); const wheel = document.getElementById("luckWheel");
    if (!modal || !wheel) return;
    luckWheelHome ||= { parent: wheel.parentElement, next: wheel.nextSibling };
    // One popup at a time: the board steps aside and reopens when the wheel closes.
    const boardModal = document.getElementById("rewardsBoardModal");
    if (boardModal && !rewardsBoardRolling) boardModal.hidden = true;
    document.getElementById("luckWheelModalSlot").appendChild(wheel);
    modal.hidden = false;
    document.getElementById("luckWheelSpin").focus();
  }

  function closeLuckWheelModal() {
    const modal = document.getElementById("luckWheelModal"); const wheel = document.getElementById("luckWheel");
    if (!modal || modal.hidden || luckWheelSpinning) return;
    modal.hidden = true;
    if (luckWheelHome) luckWheelHome.parent.insertBefore(wheel, luckWheelHome.next);
    maybeOpenRewardsBoardModal();
  }
  document.getElementById("luckWheelModalClose")?.addEventListener("click", closeLuckWheelModal);
  document.getElementById("luckWheelModal")?.addEventListener("click", (event) => { if (event.target.id === "luckWheelModal") closeLuckWheelModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { closeLuckWheelModal(); closeRewardsBoardModal(); } });


  async function announceRewardGrant(grant, previousXp, anchor, { showCard = true } = {}) {
    const { rewardCopy, celebrateXpGain } = await loadRewardsModule();
    if (showCard) showLuckWheelResult(rewardCopy(grant), grant.kind);
    deps.playTouchSound("open");
    if (anchor) deps.burstConfetti(anchor, { count: ["AI_CREDITS_25", "STICKER_RARE", "XP_200"].includes(grant.prize) ? 90 : 40, spread: 1 });
    await loadRewards();
    const rerender = (announce) => deps.rerender(announce);
    if (grant.kind !== "XP") return rerender(false);
    const bars = [
      { track: document.getElementById("topbarXpTrack") },
      { track: document.getElementById("gamificationSummaryTrack"), label: document.getElementById("gamificationSummaryXp") },
      { track: document.getElementById("adventureXpTrack") },
    ].filter((bar) => bar.track);
    // Animate from the old value first, then let the regular render settle every label and the level celebration.
    const run = () => celebrateXpGain({
      previousXp, gainedXp: grant.amount, thresholds: ADVENTURE_LEVELS.map((level) => level.xpRequired), bars,
      announcer: document.getElementById("xpGainAnnouncer"),
      reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      playSound: () => deps.playTouchSound("open"),
    }).then(() => rerender(true));
    // Wait until the top bar is on screen so the merchant actually sees it fill.
    const topbar = document.getElementById("topbarXpTrack");
    if (!topbar || typeof IntersectionObserver === "undefined") return run();
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect(); run();
    });
    observer.observe(topbar);
  }

  let luckWheelTickSegment = -1;
  function playLuckWheelTick() {
    try {
      const context = deps.audioContext();
      if (!context) return;
      const start = context.currentTime;
      const oscillator = context.createOscillator(); const gain = context.createGain();
      oscillator.type = "square"; oscillator.frequency.setValueAtTime(1300, start);
      gain.gain.setValueAtTime(.012, start); gain.gain.exponentialRampToValueAtTime(.0001, start + .03);
      oscillator.connect(gain).connect(context.destination); oscillator.start(start); oscillator.stop(start + .035);
    } catch {}
  }
  function trackLuckWheelTicks(disc) {
    if (!luckWheelSpinning) return;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(disc).transform);
    const angle = (Math.atan2(matrix.b, matrix.a) * 180 / Math.PI + 360) % 360;
    const segment = Math.floor(angle / (360 / Math.max(1, luckWheelSegments().length)));
    if (segment !== luckWheelTickSegment) {
      luckWheelTickSegment = segment;
      playLuckWheelTick();
      const pointer = document.getElementById("luckWheelPointer");
      pointer.classList.remove("is-ticking"); void pointer.offsetWidth; pointer.classList.add("is-ticking");
    }
    requestAnimationFrame(() => trackLuckWheelTicks(disc));
  }

  async function spinLuckWheel() {
    if (luckWheelSpinning || !rewardsState?.wheel.available) return;
    const spinButton = document.getElementById("luckWheelSpin"); const hub = document.getElementById("luckWheelHub");
    spinButton.disabled = true; hub.disabled = true; spinButton.textContent = "Girando…";
    showLuckWheelResult(null);
    const previousXp = deps.currentXp();
    let result;
    try {
      result = await deps.api("/dashboard/rewards/wheel/spin", { method: "POST", body: JSON.stringify({ storeId: deps.storeId() }) });
    } catch (error) {
      await loadRewards();
      document.getElementById("luckWheelStatus").textContent = error?.message || "No pudimos girar la ruleta. Vuelve a intentarlo.";
      return;
    }
    const { wheelRotationFor } = await loadRewardsModule();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const count = luckWheelSegments().length;
    luckWheelRotation = wheelRotationFor(luckWheelRotation, result.segmentIndex, count, { turns: reduceMotion ? 1 : 6, jitter: (Math.random() - .5) * (360 / count) * .6 });
    luckWheelSpinning = true;
    const disc = document.getElementById("luckWheelDisc");
    document.getElementById("luckWheel").classList.add("is-spinning");
    const duration = reduceMotion ? 500 : 4600;
    disc.style.transition = `transform ${duration}ms cubic-bezier(.12,.72,.14,1)`;
    disc.style.transform = `rotate(${luckWheelRotation}deg)`;
    if (!reduceMotion) requestAnimationFrame(() => trackLuckWheelTicks(disc));
    window.setTimeout(async () => {
      luckWheelSpinning = false;
      document.getElementById("luckWheel").classList.remove("is-spinning");
      // "Fiesta": a playful variant of a tip where the companion celebrates.
      if (result.grant.kind === "TIP" && Math.random() < .3) deps.celebrateCompanion();
      await announceRewardGrant(result.grant, previousXp, document.querySelector(".luck-wheel-stage"));
      renderLuckWheelAlbum(result.grant.sticker?.isNew ? result.grant.sticker.id : null);
    }, duration + 60);
  }
  document.getElementById("luckWheelSpin")?.addEventListener("click", spinLuckWheel);
  document.getElementById("luckWheelHub")?.addEventListener("click", spinLuckWheel);

  let rewardsBoardRolling = false;
  // The board only appears as a popup when a new roll is earned (one per 10 sales). Rolls are
  // stored server-side, so a roll earned while logged out pops the board on the next login.
  let rewardsBoardRollsAcknowledged = 0;

  function maybeOpenRewardsBoardModal() {
    const modal = document.getElementById("rewardsBoardModal");
    const rolls = rewardsState?.board.rollsAvailable || 0;
    if (!modal || !modal.hidden) return;
    // Spent rolls lower the bar so the next earned roll opens it again.
    rewardsBoardRollsAcknowledged = Math.min(rewardsBoardRollsAcknowledged, rolls);
    if (rolls <= rewardsBoardRollsAcknowledged) return;
    // The daily wheel goes first; closing it calls back here.
    if (!document.getElementById("luckWheelModal")?.hidden) return;
    modal.hidden = false;
    document.getElementById("rewardsBoardRoll")?.focus();
  }

  function closeRewardsBoardModal() {
    const modal = document.getElementById("rewardsBoardModal");
    if (!modal || modal.hidden || rewardsBoardRolling) return;
    modal.hidden = true;
    rewardsBoardRollsAcknowledged = rewardsState?.board.rollsAvailable || 0;
  }
  document.getElementById("rewardsBoardModalClose")?.addEventListener("click", closeRewardsBoardModal);
  document.getElementById("rewardsBoardModal")?.addEventListener("click", (event) => { if (event.target.id === "rewardsBoardModal") closeRewardsBoardModal(); });

  function placeBoardToken(token, index, boardTileCoords) {
    const { row, col } = boardTileCoords(index);
    token.style.gridRow = String(row); token.style.gridColumn = String(col); token.dataset.tile = String(index);
  }

  /**
   * Only the dice-board runner token's image, from the merchant's current blob. Safe to call whenever
   * the blob seed or the chosen variation changes, even before the board itself has ever loaded (unlike
   * renderBoard, it never touches the "couldn't load" hint or the roll button).
   */
  function refreshRunner() {
    const token = document.getElementById("rewardsBoardToken");
    if (token) token.style.backgroundImage = `url("${deps.runnerImage()}")`;
  }

  async function renderRewardsBoard() {
    const board = document.getElementById("rewardsBoard");
    if (!board) return;
    const state = rewardsState?.board;
    const button = document.getElementById("rewardsBoardRoll"); const hint = document.getElementById("rewardsBoardHint");
    if (!state) { button.disabled = true; hint.textContent = "No pudimos cargar el tablero."; return; }
    const { WHEEL_VISUALS, boardTileCoords } = await loadRewardsModule();
    if (board.dataset.tiles !== state.tiles.join(",")) {
      board.querySelectorAll(".board-tile").forEach((tile) => tile.remove());
      board.dataset.tiles = state.tiles.join(",");
      state.tiles.forEach((key, index) => {
        const { row, col } = boardTileCoords(index); const visual = WHEEL_VISUALS[key];
        const tile = document.createElement("span");
        tile.className = `board-tile board-tile-${key.toLowerCase()}`;
        tile.dataset.tile = String(index); tile.setAttribute("role", "listitem");
        tile.style.gridRow = String(row); tile.style.gridColumn = String(col); tile.style.setProperty("--tile-color", visual.color);
        tile.setAttribute("aria-label", `Casilla ${index + 1}: ${visual.label}`);
        tile.textContent = visual.icon;
        board.appendChild(tile);
      });
    }
    refreshRunner();
    if (rewardsBoardRolling) return;
    placeBoardToken(document.getElementById("rewardsBoardToken"), state.position, boardTileCoords);
    button.disabled = state.rollsAvailable <= 0;
    const kicker = document.getElementById("rewardsBoardKicker");
    if (kicker) kicker.textContent = state.rollsAvailable > 1 ? `¡Tus ventas te dieron ${state.rollsAvailable.toLocaleString("es-BO")} tiros de dado!` : "¡Completaste 10 ventas! Ganaste un tiro de dado.";
    button.textContent = state.rollsAvailable > 0 ? `Tirar dado (${state.rollsAvailable.toLocaleString("es-BO")})` : "Sin tiros";
    hint.textContent = `Te faltan ${state.salesUntilNextRoll.toLocaleString("es-BO")} ${state.salesUntilNextRoll === 1 ? "venta" : "ventas"} para el próximo tiro · Vueltas completadas: ${state.lapsCompleted.toLocaleString("es-BO")}`;
  }

  async function rollRewardsBoard() {
    if (rewardsBoardRolling || !(rewardsState?.board.rollsAvailable > 0)) return;
    const button = document.getElementById("rewardsBoardRoll"); const die = document.getElementById("rewardsBoardDie");
    const resultBox = document.getElementById("rewardsBoardResult");
    rewardsBoardRolling = true; button.disabled = true; button.textContent = "Tirando…"; resultBox.hidden = true;
    const previousXp = deps.currentXp();
    let result;
    try {
      result = await deps.api("/dashboard/rewards/board/roll", { method: "POST", body: JSON.stringify({ storeId: deps.storeId() }) });
    } catch (error) {
      rewardsBoardRolling = false;
      await loadRewards();
      document.getElementById("rewardsBoardHint").textContent = error?.message || "No pudimos tirar el dado. Vuelve a intentarlo.";
      return;
    }
    const { boardHopPath, boardTileCoords, rewardCopy } = await loadRewardsModule();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    die.textContent = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][result.die - 1];
    die.classList.remove("is-rolling"); void die.offsetWidth; if (!reduceMotion) die.classList.add("is-rolling");
    const token = document.getElementById("rewardsBoardToken");
    for (const tile of reduceMotion ? [result.to] : boardHopPath(result.from, result.die)) {
      placeBoardToken(token, tile, boardTileCoords);
      token.classList.remove("is-hopping"); void token.offsetWidth; if (!reduceMotion) token.classList.add("is-hopping");
      playLuckWheelTick();
      await new Promise((resolve) => window.setTimeout(resolve, reduceMotion ? 0 : 180));
    }
    const copy = rewardCopy(result.grant);
    resultBox.hidden = false; resultBox.dataset.kind = result.grant.kind;
    resultBox.innerHTML = `<span class="luck-wheel-result-icon" aria-hidden="true">${esc(copy.icon)}</span><span><strong>${esc(copy.title)}</strong>${esc(copy.message)}${result.lapCompleted ? " ¡Completaste una vuelta!" : ""}</span>`;
    rewardsBoardRolling = false;
    await announceRewardGrant(result.grant, previousXp, document.getElementById("rewardsBoard"), { showCard: false });
  }
  document.getElementById("rewardsBoardRoll")?.addEventListener("click", rollRewardsBoard);

  return {
    load: loadRewards,
    state: () => rewardsState,
    reset: () => { rewardsState = null; },
    renderWheel: renderLuckWheel,
    renderBoard: renderRewardsBoard,
    refreshRunner,
    openWheelModal: openLuckWheelModal,
  };
}
