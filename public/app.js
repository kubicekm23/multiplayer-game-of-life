const state = {
  game: null,
  previousGame: null,
  playerId: 1,
  tool: 'place',
  cellType: 'seed',
};

const board = document.querySelector('#board');
const playerSelect = document.querySelector('#player-select');
const timerEl = document.querySelector('#timer');
const phaseEl = document.querySelector('#phase-label');
const budgetCount = document.querySelector('#budget-count');
const budgetBase = document.querySelector('#budget-base');
const budgetEnergy = document.querySelector('#budget-energy');
const mutationModal = document.querySelector('#mutation-modal');
const mutationOptions = document.querySelector('#mutation-options');
const rerollMutationsButton = document.querySelector('#reroll-mutations');
const rulebookModal = document.querySelector('#rulebook-modal');
const rulebookContent = document.querySelector('#rulebook-content');
const form = document.querySelector('#new-game-form');
const appShell = document.querySelector('.app-shell');
const openMenuButton = document.querySelector('#open-menu');
const continueGameButton = document.querySelector('#continue-game');
const openRulebookButton = document.querySelector('#open-rulebook');
const closeRulebookButton = document.querySelector('#close-rulebook');

document.querySelectorAll('.tool').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.tool').forEach((candidate) => candidate.classList.remove('active'));
    button.classList.add('active');
    state.tool = button.dataset.tool;
    state.cellType = button.dataset.cell || state.cellType;
  });
});

playerSelect.addEventListener('change', () => {
  state.playerId = Number(playerSelect.value);
  render();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const game = await request('/api/game', {
    method: 'POST',
    body: JSON.stringify({
      playerCount: Number(data.get('playerCount')),
      teamMode: data.get('teamMode'),
      arena: data.get('arena'),
      planningSeconds: Number(data.get('planningSeconds')),
    }),
  });
  state.playerId = 1;
  setGame(game, { reset: true });
  closeMenu();
});

document.querySelector('#resolve-now').addEventListener('click', async () => {
  board.classList.add('resolving');
  const game = await request('/api/resolve', { method: 'POST' });
  setGame(game);
  window.setTimeout(() => board.classList.remove('resolving'), 900);
});

openMenuButton.addEventListener('click', () => {
  appShell.classList.add('menu-open');
});

continueGameButton.addEventListener('click', () => {
  closeMenu();
});

openRulebookButton.addEventListener('click', () => {
  renderRulebook();
  rulebookModal.classList.remove('hidden');
});

closeRulebookButton.addEventListener('click', () => {
  rulebookModal.classList.add('hidden');
});

rerollMutationsButton.addEventListener('click', async () => {
  await request('/api/mutations/reroll', {
    method: 'POST',
    body: JSON.stringify({ playerId: state.playerId }),
  });
  await loadGame();
});

function closeMenu() {
  appShell.classList.remove('menu-open');
}

async function loadGame() {
  const game = await request('/api/game');
  setGame(game);
}

function setGame(game, options = {}) {
  state.previousGame = options.reset ? null : state.game;
  state.game = game;
  render();
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await response.json();
  if (!response.ok) {
    flash(body.message || 'Action failed.');
    throw new Error(body.message || response.statusText);
  }
  return body;
}

function render() {
  if (!state.game) return;
  renderTimer();
  renderPlayerSelect();
  renderBudget();
  renderBoard();
  renderMutations();
  if (!rulebookModal.classList.contains('hidden')) renderRulebook();
}

function renderTimer() {
  if (!state.game) return;
  const ms = Math.max(0, state.game.phaseEndsAt - Date.now());
  timerEl.textContent = state.game.phase === 'finished' ? `Team ${state.game.winnerTeam} won` : `${Math.ceil(ms / 1000)}s`;
  phaseEl.textContent = `Round ${state.game.round} ${state.game.phase}`;
}

function renderBudget() {
  const player = activePlayer();
  if (!player) return;

  const queued = queuedPlacements(player);
  const total = totalPlacementBudget(player);
  budgetCount.textContent = `${Math.max(0, total - queued)} / ${total}`;
  budgetBase.textContent = `Base ${state.game.settings.placementsPerRound}`;
  budgetEnergy.textContent = `Biomass +${player.energy}`;
}

function renderPlayerSelect() {
  const currentOptions = [...playerSelect.options].map((option) => Number(option.value));
  const nextOptions = state.game.players.map((player) => player.id);
  if (currentOptions.join(',') === nextOptions.join(',')) return;

  playerSelect.innerHTML = '';
  state.game.players.forEach((player) => {
    const option = document.createElement('option');
    option.value = player.id;
    option.textContent = `${player.name} / Team ${player.team}`;
    playerSelect.append(option);
  });
  playerSelect.value = String(state.playerId);
}

function renderBoard() {
  board.style.gridTemplateColumns = `repeat(${state.game.settings.width}, minmax(0, 1fr))`;
  board.innerHTML = '';

  state.game.board.forEach((cell, index) => {
    const x = index % state.game.settings.width;
    const y = Math.floor(index / state.game.settings.width);
    const previousCell = state.previousGame?.board?.[index] || null;
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.type = 'button';
    tile.ariaLabel = `${x}, ${y}`;
    tile.dataset.x = x;
    tile.dataset.y = y;

    const queued = state.game.queuedActions.find((action) => action.x === x && action.y === y);
    if (cell) decorateCell(tile, cell);
    decorateCellChange(tile, cell, previousCell);
    if (isRangeSource(cell)) tile.classList.add('range-source');
    if (!cell && isInPlacementRange(x, y)) tile.classList.add('placement-range');
    if (queued) {
      const queuedPlayer = state.game.players.find((player) => player.id === queued.playerId);
      if (queuedPlayer) tile.style.setProperty('--queue-color', queuedPlayer.color);
      tile.classList.add(queued.action === 'remove' ? 'queued-remove' : 'queued-place');
      tile.title = `${queued.action} queued by ${queuedPlayer?.name || `Player ${queued.playerId}`}`;
    }

    tile.addEventListener('click', () => queueAction(x, y));
    board.append(tile);
  });
}

function decorateCellChange(tile, cell, previousCell) {
  if (!state.previousGame || !hasCellChanged(cell, previousCell)) return;

  tile.classList.add('cell-changed');
  if (!previousCell && cell) {
    tile.classList.add('cell-born');
    return;
  }

  if (previousCell && !cell) {
    decoratePreviousCell(tile, previousCell);
    tile.classList.add('cell-died');
    return;
  }

  if (previousCell && cell) {
    tile.classList.add(previousCell.ownerId !== cell.ownerId ? 'cell-captured' : 'cell-morphed');
  }
}

function decoratePreviousCell(tile, cell) {
  tile.classList.add('occupied', 'previous-cell', `cell-${cell.type}`);
  if (!cell.ownerId) return;

  const player = state.previousGame.players.find((candidate) => candidate.id === cell.ownerId);
  if (player) tile.style.setProperty('--cell-color', player.color);
}

function hasCellChanged(cell, previousCell) {
  return cellSignature(cell) !== cellSignature(previousCell);
}

function cellSignature(cell) {
  if (!cell) return 'empty';
  return `${cell.ownerId || 'neutral'}:${cell.type}`;
}

function decorateCell(tile, cell) {
  tile.classList.add('occupied', `cell-${cell.type}`);
  if (cell.ownerId) {
    const player = state.game.players.find((candidate) => candidate.id === cell.ownerId);
    tile.style.setProperty('--cell-color', player.color);
    tile.title = `${player.name} ${cell.type}`;
  } else {
    tile.title = cell.type;
  }
}

async function queueAction(x, y) {
  try {
    await request('/api/actions', {
      method: 'POST',
      body: JSON.stringify({
        playerId: state.playerId,
        action: state.tool,
        x,
        y,
        cellType: state.tool === 'place' ? state.cellType : undefined,
      }),
    });
    await loadGame();
  } catch (error) {
    console.warn(error);
  }
}

function renderMutations() {
  const player = activePlayer();
  mutationOptions.innerHTML = '';
  if (!player || player.pendingMutations.length === 0) {
    mutationModal.classList.add('hidden');
    return;
  }

  mutationModal.classList.remove('hidden');
  rerollMutationsButton.classList.toggle('hidden', !hasMutation(player, 'reroll_gland') || player.rerolls <= 0);
  rerollMutationsButton.textContent = `Reroll choices (${player.rerolls})`;

  player.pendingMutations.forEach((mutation) => {
    const definition = mutationDefinition(mutation);
    const button = document.createElement('button');
    button.type = 'button';
    button.innerHTML = `
      <strong>${definition?.name || mutation}</strong>
      <span>${definition?.rarity || 'common'} / ${definition?.polarity || 'benefit'}</span>
      <small>${definition?.summary || state.game.mutationLabels[mutation]}</small>
    `;
    button.addEventListener('click', async () => {
      await request('/api/mutations', {
        method: 'POST',
        body: JSON.stringify({ playerId: state.playerId, mutation }),
      });
      await loadGame();
    });
    mutationOptions.append(button);
  });
}

function renderRulebook() {
  if (!state.game) return;
  const active = activePlayer();
  rulebookContent.innerHTML = `
    <section>
      <h3>Turn</h3>
      <p>During planning, place or remove cells. When the timer ends or Resolve turn is pressed, removals apply, living cells simulate, placements land, pickups resolve, and the next planning round starts.</p>
    </section>
    <section>
      <h3>Cells</h3>
      <dl>
        <div><dt>Seed</dt><dd>Basic growth cell. It survives with 2-3 allied neighbors and helps create new cells.</dd></div>
        <div><dt>Wall</dt><dd>Low pressure, defensive cell. Good for holding territory and blocking some mutation effects.</dd></div>
        <div><dt>Hunter</dt><dd>High pressure attack cell. It helps convert or kill nearby enemy cells.</dd></div>
        <div><dt>Spore</dt><dd>Fragile spread cell. Mutations can make spores survive, explode, or bloom farther away.</dd></div>
      </dl>
    </section>
    <section>
      <h3>Pickups</h3>
      <p>Food grants biomass for future placement budget. Mutation pickups offer several permanent rule changes. Cursed mutations are intentionally bad or dangerous.</p>
    </section>
    <section>
      <h3>Placement</h3>
      <p>You can place cells only inside your placement range, shown by the highlighted tiles. Placement budget is spent by queued placements; removing your own cells is free.</p>
    </section>
    <section>
      <h3>Victory</h3>
      <p>A player is alive while any of their cells remain. The match ends when only one team still has living cells.</p>
    </section>
    <section>
      <h3>Your Status</h3>
      <p>${active ? `${active.name}: ${placementBudget(active)} placement budget left, range ${placementRange(active)}, ${active.mutations.length} mutations.` : 'No active player.'}</p>
    </section>
  `;
}

function mutationDefinition(id) {
  return state.game.mutationCatalog.find((mutation) => mutation.id === id);
}

function activePlayer() {
  return state.game.players.find((player) => player.id === state.playerId);
}

function placementBudget(player) {
  return Math.max(0, totalPlacementBudget(player) - queuedPlacements(player));
}

function queuedPlacements(player) {
  let used = 0;
  let seedIndex = 0;
  state.game.queuedActions.forEach((action) => {
    if (action.playerId !== player.id || action.action !== 'place') return;
    used += actionCost(player, action, seedIndex);
    if (action.cellType === 'seed') seedIndex += 1;
  });
  return used;
}

function actionCost(player, action, seedIndex) {
  if (action.cellType === 'seed' && hasMutation(player, 'cheap_seeds') && seedIndex < 2) return 0;
  if (action.cellType === 'hunter' && hasMutation(player, 'expensive_hunters')) return 2;
  if (action.cellType === 'wall' && hasMutation(player, 'hollow_walls')) return 0;
  return 1;
}

function totalPlacementBudget(player) {
  let budget = state.game.settings.placementsPerRound + player.energy + player.carryoverBudget + player.tempBudget - player.budgetDebt;
  if (hasMutation(player, 'extra_biomass')) budget += 1;
  if (hasMutation(player, 'thin_frontier')) budget -= 1;
  if (hasMutation(player, 'starved_colony')) budget -= 2;
  if (hasMutation(player, 'metabolic_crash') && state.game.round - player.lastFoodRound >= 3) budget -= 2;
  if (hasMutation(player, 'mutation_sickness')) {
    const sicknessIndex = player.mutations.indexOf('mutation_sickness');
    budget -= Math.max(0, player.mutations.length - sicknessIndex - 1);
  }
  if (hasMutation(player, 'deadweight')) budget -= Math.min(3, livingCells(player.id, 'wall'));
  if (hasMutation(player, 'burst_turn')) budget = state.game.round % 4 === 0 ? budget * 2 : budget - 1;
  if (hasMutation(player, 'cellular_debt')) budget += 3;
  return Math.max(0, Math.floor(budget));
}

function placementRange(player) {
  let range = state.game.settings.placementRange;
  if (hasMutation(player, 'overgrowth')) range += 1;
  if (hasMutation(player, 'thin_frontier')) range += 2;
  if (hasMutation(player, 'blind_expansion')) range += 3;
  if (hasMutation(player, 'local_only')) range -= 1;
  if (hasMutation(player, 'one_step_colony')) range = 1;
  return Math.max(1, range);
}

function isRangeSource(cell) {
  return Boolean(cell?.ownerId === state.playerId);
}

function isInPlacementRange(x, y) {
  const player = activePlayer();
  if (!player || !player.alive) return false;
  if (hasMutation(player, 'blind_expansion')) return false;
  const baseRange = placementRange(player);

  return state.game.board.some((cell, index) => {
    if (cell?.ownerId !== player.id) return false;
    const cx = index % state.game.settings.width;
    const cy = Math.floor(index / state.game.settings.width);
    const range = baseRange + (hasMutation(player, 'long_roots') && cell.type === 'seed' ? 1 : 0);
    return Math.abs(cx - x) <= range && Math.abs(cy - y) <= range;
  });
}

function hasMutation(player, mutation) {
  return player.mutations.includes(mutation);
}

function livingCells(playerId, type) {
  return state.game.board.filter((cell) => cell?.ownerId === playerId && (!type || cell.type === type)).length;
}

function flash(message) {
  const notice = document.createElement('div');
  notice.className = 'toast';
  notice.textContent = message;
  document.body.append(notice);
  setTimeout(() => notice.remove(), 2200);
}

loadGame();
setInterval(loadGame, 2500);
setInterval(renderTimer, 250);
