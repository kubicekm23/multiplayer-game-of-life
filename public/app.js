const state = {
  game: null,
  playerId: 1,
  tool: 'place',
  cellType: 'seed',
};

const board = document.querySelector('#board');
const playerSelect = document.querySelector('#player-select');
const playersEl = document.querySelector('#players');
const logEl = document.querySelector('#log');
const timerEl = document.querySelector('#timer');
const phaseEl = document.querySelector('#phase-label');
const budgetCount = document.querySelector('#budget-count');
const budgetBase = document.querySelector('#budget-base');
const budgetEnergy = document.querySelector('#budget-energy');
const mutationModal = document.querySelector('#mutation-modal');
const mutationOptions = document.querySelector('#mutation-options');
const form = document.querySelector('#new-game-form');

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
  await request('/api/game', {
    method: 'POST',
    body: JSON.stringify({
      playerCount: Number(data.get('playerCount')),
      teamMode: data.get('teamMode'),
      arena: data.get('arena'),
      planningSeconds: Number(data.get('planningSeconds')),
    }),
  });
  state.playerId = 1;
  await loadGame();
});

document.querySelector('#resolve-now').addEventListener('click', async () => {
  await request('/api/resolve', { method: 'POST' });
  await loadGame();
});

async function loadGame() {
  state.game = await request('/api/game');
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
  renderPlayers();
  renderBoard();
  renderMutations();
  renderLog();
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

function renderPlayers() {
  playersEl.innerHTML = '';
  state.game.players.forEach((player) => {
    const card = document.createElement('article');
    card.className = `player-card ${player.id === state.playerId ? 'selected' : ''}`;
    card.style.setProperty('--player-color', player.color);
    card.innerHTML = `
      <div>
        <strong>${player.name}</strong>
        <span>Team ${player.team}</span>
      </div>
      <div class="stats">
        <span>${player.controller}</span>
        <span>${placementBudget(player)} / ${totalPlacementBudget(player)} cells</span>
      </div>
      <div class="stats">
        <span>${player.alive ? 'alive' : 'dead'}</span>
        <span>range ${placementRange(player)}</span>
      </div>
      <small>${player.mutations.map((mutation) => state.game.mutationLabels[mutation].split(':')[0]).join(', ') || 'No mutations'}</small>
    `;
    playersEl.append(card);
  });
}

function renderBoard() {
  board.style.gridTemplateColumns = `repeat(${state.game.settings.width}, minmax(0, 1fr))`;
  board.innerHTML = '';

  state.game.board.forEach((cell, index) => {
    const x = index % state.game.settings.width;
    const y = Math.floor(index / state.game.settings.width);
    const tile = document.createElement('button');
    tile.className = 'tile';
    tile.type = 'button';
    tile.ariaLabel = `${x}, ${y}`;
    tile.dataset.x = x;
    tile.dataset.y = y;

    const queued = state.game.queuedActions.find((action) => action.x === x && action.y === y);
    if (cell) decorateCell(tile, cell);
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

  player.pendingMutations.forEach((mutation) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = state.game.mutationLabels[mutation];
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

function renderLog() {
  logEl.innerHTML = '';
  state.game.log.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry;
    logEl.append(item);
  });
}

function activePlayer() {
  return state.game.players.find((player) => player.id === state.playerId);
}

function placementBudget(player) {
  return Math.max(0, totalPlacementBudget(player) - queuedPlacements(player));
}

function queuedPlacements(player) {
  return state.game.queuedActions.filter((action) => action.playerId === player.id && action.action === 'place').length;
}

function totalPlacementBudget(player) {
  return state.game.settings.placementsPerRound + player.energy;
}

function placementRange(player) {
  return state.game.settings.placementRange + (player.mutations.includes('overgrowth') ? 1 : 0);
}

function isRangeSource(cell) {
  return Boolean(cell?.ownerId === state.playerId);
}

function isInPlacementRange(x, y) {
  const player = activePlayer();
  if (!player || !player.alive) return false;
  const range = placementRange(player);

  return state.game.board.some((cell, index) => {
    if (cell?.ownerId !== player.id) return false;
    const cx = index % state.game.settings.width;
    const cy = Math.floor(index / state.game.settings.width);
    return Math.abs(cx - x) <= range && Math.abs(cy - y) <= range;
  });
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
