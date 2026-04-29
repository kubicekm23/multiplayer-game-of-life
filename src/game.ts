export type Phase = 'planning' | 'finished';
export type TeamMode = 'ffa' | 'duo';
export type ArenaId = 'garden' | 'maze' | 'crucible';
export type CellType = 'seed' | 'wall' | 'hunter' | 'spore';
export type PickupType = 'food' | 'mutation';
export type MutationId = 'overgrowth' | 'fortify' | 'predator' | 'fertile';

export interface Cell {
  ownerId: number | null;
  type: CellType | PickupType;
}

export interface Player {
  id: number;
  name: string;
  team: number;
  color: string;
  controller: 'human' | 'bot';
  energy: number;
  alive: boolean;
  mutations: MutationId[];
  pendingMutations: MutationId[];
}

export interface GameSettings {
  width: number;
  height: number;
  playerCount: number;
  teamMode: TeamMode;
  arena: ArenaId;
  planningSeconds: number;
  placementsPerRound: number;
  placementRange: number;
}

export interface QueuedAction {
  playerId: number;
  action: 'place' | 'remove';
  x: number;
  y: number;
  cellType?: CellType;
}

export interface GameState {
  settings: GameSettings;
  phase: Phase;
  round: number;
  phaseEndsAt: number;
  winnerTeam: number | null;
  players: Player[];
  board: Array<Cell | null>;
  queuedActions: QueuedAction[];
  log: string[];
}

const colors = ['#32d583', '#60a5fa', '#f97316', '#e879f9'];
const mutationPool: MutationId[] = ['overgrowth', 'fortify', 'predator', 'fertile'];

const mutationLabels: Record<MutationId, string> = {
  overgrowth: 'Overgrowth: placement range +1',
  fortify: 'Fortify: wall cells survive with one extra hostile pressure',
  predator: 'Predator: hunters apply stronger attack pressure',
  fertile: 'Fertile: spores can survive with one same-owner neighbor',
};

export function getMutationLabels(): Record<MutationId, string> {
  return mutationLabels;
}

export function createGame(overrides: Partial<GameSettings> = {}): GameState {
  const settings: GameSettings = {
    width: 32,
    height: 22,
    playerCount: 4,
    teamMode: 'ffa',
    arena: 'garden',
    planningSeconds: 25,
    placementsPerRound: 5,
    placementRange: 3,
    ...overrides,
  };

  settings.playerCount = clamp(Math.round(settings.playerCount), 2, 4);
  settings.width = clamp(Math.round(settings.width), 18, 42);
  settings.height = clamp(Math.round(settings.height), 14, 30);
  settings.planningSeconds = clamp(Math.round(settings.planningSeconds), 8, 90);
  settings.placementsPerRound = clamp(Math.round(settings.placementsPerRound), 2, 10);
  settings.placementRange = clamp(Math.round(settings.placementRange), 1, 6);

  const players: Player[] = Array.from({ length: settings.playerCount }, (_, index) => ({
    id: index + 1,
    name: index === 0 ? 'You' : `Bot ${index}`,
    team: settings.teamMode === 'duo' ? (index % 2) + 1 : index + 1,
    color: colors[index],
    controller: index === 0 ? 'human' : 'bot',
    energy: 2,
    alive: true,
    mutations: [],
    pendingMutations: [],
  }));

  const state: GameState = {
    settings,
    phase: 'planning',
    round: 1,
    phaseEndsAt: Date.now() + settings.planningSeconds * 1000,
    winnerTeam: null,
    players,
    board: Array(settings.width * settings.height).fill(null),
    queuedActions: [],
    log: [`Arena ${settings.arena} started.`],
  };

  seedArena(state);
  queueBotActions(state);
  return state;
}

export function serializeGame(state: GameState): GameState & { mutationLabels: Record<MutationId, string> } {
  tickGame(state);
  if (state.phase === 'planning') queueBotActions(state);
  return {
    ...state,
    board: state.board.map((cell) => (cell ? { ...cell } : null)),
    players: state.players.map((player) => ({ ...player, mutations: [...player.mutations], pendingMutations: [...player.pendingMutations] })),
    queuedActions: state.queuedActions.map((action) => ({ ...action })),
    log: [...state.log],
    mutationLabels,
  };
}

export function submitAction(state: GameState, action: QueuedAction): { ok: boolean; message?: string } {
  tickGame(state);
  if (state.phase !== 'planning') return { ok: false, message: 'Planning phase is closed.' };

  const player = state.players.find((candidate) => candidate.id === action.playerId);
  if (!player || !player.alive) return { ok: false, message: 'Player is not active.' };
  if (!inBounds(state, action.x, action.y)) return { ok: false, message: 'Target is outside arena.' };

  const existingQueuedIndex = state.queuedActions.findIndex(
    (queued) => queued.playerId === action.playerId && queued.x === action.x && queued.y === action.y,
  );
  if (existingQueuedIndex >= 0) state.queuedActions.splice(existingQueuedIndex, 1);

  const queuedPlaces = state.queuedActions.filter((queued) => queued.playerId === player.id && queued.action === 'place').length;
  if (action.action === 'place') {
    if (!action.cellType) return { ok: false, message: 'Missing cell type.' };
    if (queuedPlaces >= state.settings.placementsPerRound + player.energy) return { ok: false, message: 'No placement budget left.' };
    if (cellAt(state, action.x, action.y)) return { ok: false, message: 'Target is occupied.' };
    if (!isNearOwnedCell(state, player, action.x, action.y)) return { ok: false, message: 'Target is outside your placement range.' };
  }

  if (action.action === 'remove') {
    const target = cellAt(state, action.x, action.y);
    if (!target || target.ownerId !== player.id) return { ok: false, message: 'You can only remove your own cells.' };
  }

  state.queuedActions.push(action);
  return { ok: true };
}

export function chooseMutation(state: GameState, playerId: number, mutation: MutationId): { ok: boolean; message?: string } {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, message: 'Player not found.' };
  if (!player.pendingMutations.includes(mutation)) return { ok: false, message: 'Mutation is not available.' };

  player.mutations.push(mutation);
  player.pendingMutations = [];
  pushLog(state, `${player.name} chose ${mutationLabels[mutation]}.`);
  return { ok: true };
}

export function forceResolve(state: GameState): void {
  if (state.phase === 'planning') resolveRound(state);
}

function tickGame(state: GameState): void {
  if (state.phase === 'planning' && Date.now() >= state.phaseEndsAt) resolveRound(state);
}

function resolveRound(state: GameState): void {
  queueBotActions(state);
  applyQueuedRemovals(state);
  resolveLife(state);
  applyQueuedPlacements(state);
  resolvePickups(state);
  spawnPickups(state);
  updateAliveAndWinner(state);

  state.queuedActions = [];
  if (!state.winnerTeam) {
    state.round += 1;
    state.phaseEndsAt = Date.now() + state.settings.planningSeconds * 1000;
    pushLog(state, `Round ${state.round} planning started.`);
    queueBotActions(state);
  }
}

function queueBotActions(state: GameState): void {
  let botsQueued = 0;

  for (const player of state.players) {
    if (player.controller !== 'bot' || !player.alive) continue;

    if (player.pendingMutations.length > 0) {
      const preferred = player.pendingMutations.find((mutation) => mutation === 'overgrowth' || mutation === 'predator') ?? player.pendingMutations[0];
      player.mutations.push(preferred);
      player.pendingMutations = [];
      pushLog(state, `${player.name} adapted with ${mutationLabels[preferred]}.`);
    }

    const alreadyQueued = state.queuedActions.some((action) => action.playerId === player.id);
    if (alreadyQueued) continue;

    const budget = state.settings.placementsPerRound + player.energy;
    const candidates = placementCandidates(state, player)
      .map(([x, y]) => ({ x, y, score: botScoreTile(state, player, x, y) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, budget);

    candidates.forEach((candidate, index) => {
      state.queuedActions.push({
        playerId: player.id,
        action: 'place',
        x: candidate.x,
        y: candidate.y,
        cellType: chooseBotCellType(state, player, candidate.x, candidate.y, index),
      });
      botsQueued += 1;
    });
  }

  if (botsQueued > 0) pushLog(state, `Bots queued ${botsQueued} battlefield orders.`);
}

function placementCandidates(state: GameState, player: Player): Array<[number, number]> {
  const candidates: Array<[number, number]> = [];
  for (let y = 0; y < state.settings.height; y += 1) {
    for (let x = 0; x < state.settings.width; x += 1) {
      if (!cellAt(state, x, y) && isNearOwnedCell(state, player, x, y)) candidates.push([x, y]);
    }
  }
  return candidates;
}

function botScoreTile(state: GameState, player: Player, x: number, y: number): number {
  const nearestEnemy = nearestCellDistance(state, x, y, (cell) => Boolean(cell?.ownerId && state.players[(cell.ownerId as number) - 1]?.team !== player.team));
  const nearestPickup = nearestCellDistance(state, x, y, (cell) => cell?.type === 'food' || cell?.type === 'mutation');
  const sameOwnerSupport = sameOwnerNeighbors(state, x, y, player.id);
  const hostileNeighbors = neighbors(state, x, y).filter(([nx, ny]) => {
    const cell = cellAt(state, nx, ny);
    return Boolean(cell?.ownerId && state.players[cell.ownerId - 1]?.team !== player.team);
  }).length;

  return (20 - nearestEnemy) * 1.4 + (16 - nearestPickup) + sameOwnerSupport * 3 + hostileNeighbors * 5 + Math.random();
}

function chooseBotCellType(state: GameState, player: Player, x: number, y: number, index: number): CellType {
  const hostileNeighbors = neighbors(state, x, y).filter(([nx, ny]) => {
    const cell = cellAt(state, nx, ny);
    return Boolean(cell?.ownerId && state.players[cell.ownerId - 1]?.team !== player.team);
  }).length;

  if (hostileNeighbors >= 1) return 'hunter';
  if (index % 5 === 3) return 'wall';
  if (player.mutations.includes('fertile') && index % 3 === 1) return 'spore';
  return index % 4 === 2 ? 'spore' : 'seed';
}

function nearestCellDistance(state: GameState, x: number, y: number, predicate: (cell: Cell | null) => boolean): number {
  let nearest = state.settings.width + state.settings.height;
  forEachCell(state, (cx, cy, cell) => {
    if (predicate(cell)) nearest = Math.min(nearest, Math.abs(cx - x) + Math.abs(cy - y));
  });
  return nearest;
}

function applyQueuedRemovals(state: GameState): void {
  for (const action of state.queuedActions) {
    if (action.action !== 'remove') continue;
    const target = cellAt(state, action.x, action.y);
    if (target?.ownerId === action.playerId) setCell(state, action.x, action.y, null);
  }
}

function applyQueuedPlacements(state: GameState): void {
  const placeCounts = new Map<string, QueuedAction[]>();
  const placedByPlayer = new Map<number, number>();

  for (const action of state.queuedActions) {
    if (action.action !== 'place') continue;
    const player = state.players.find((candidate) => candidate.id === action.playerId && candidate.alive);
    if (!player) continue;

    const key = `${action.x},${action.y}`;
    placeCounts.set(key, [...(placeCounts.get(key) ?? []), action]);
  }

  for (const actions of placeCounts.values()) {
    if (actions.length !== 1) continue;
    const action = actions[0];
    const player = state.players.find((candidate) => candidate.id === action.playerId && candidate.alive);
    if (!player || !action.cellType || cellAt(state, action.x, action.y)) continue;
    setCell(state, action.x, action.y, { ownerId: player.id, type: action.cellType });
    placedByPlayer.set(player.id, (placedByPlayer.get(player.id) ?? 0) + 1);
  }

  const botPlacements = [...placedByPlayer.entries()]
    .filter(([playerId]) => state.players[playerId - 1]?.controller === 'bot')
    .reduce((sum, [, count]) => sum + count, 0);
  if (botPlacements > 0) pushLog(state, `Bots placed ${botPlacements} new cells.`);
}

function resolvePickups(state: GameState): void {
  forEachCell(state, (x, y, cell) => {
    if (!cell || (cell.type !== 'food' && cell.type !== 'mutation')) return;

    const adjacentOwners = neighbors(state, x, y)
      .map(([nx, ny]) => cellAt(state, nx, ny))
      .filter((candidate): candidate is Cell => Boolean(candidate?.ownerId))
      .map((candidate) => candidate.ownerId as number);

    const ownerId = adjacentOwners[0];
    if (!ownerId || adjacentOwners.some((candidate) => candidate !== ownerId)) return;

    const player = state.players.find((candidate) => candidate.id === ownerId);
    if (!player) return;

    if (cell.type === 'food') {
      player.energy = clamp(player.energy + 1, 0, 5);
      pushLog(state, `${player.name} consumed biomass and gained placement energy.`);
    } else if (player.pendingMutations.length === 0) {
      player.pendingMutations = drawMutations(player, 3);
      pushLog(state, `${player.name} unlocked mutation choices.`);
    }
    setCell(state, x, y, null);
  });
}

function resolveLife(state: GameState): void {
  const next = Array<Cell | null>(state.board.length).fill(null);

  for (let y = 0; y < state.settings.height; y += 1) {
    for (let x = 0; x < state.settings.width; x += 1) {
      const current = cellAt(state, x, y);
      if (current?.type === 'food' || current?.type === 'mutation') {
        next[indexOf(state, x, y)] = current;
        continue;
      }

      const pressure = ownerPressure(state, x, y);
      const strongest = [...pressure.entries()].sort((a, b) => b[1] - a[1])[0];

      if (current?.ownerId) {
        const player = state.players[current.ownerId - 1];
        const ownNeighbors = sameOwnerNeighbors(state, x, y, current.ownerId);
        const enemyPressure = [...pressure.entries()]
          .filter(([owner]) => owner !== current.ownerId)
          .reduce((sum, [, value]) => sum + value, 0);
        const defenseBonus = current.type === 'wall' && player?.mutations.includes('fortify') ? 1 : 0;
        const sporeLives = current.type === 'spore' && player?.mutations.includes('fertile') && ownNeighbors >= 1;

        if ((sporeLives || ownNeighbors === 2 || ownNeighbors === 3) && enemyPressure <= 3 + defenseBonus) {
          next[indexOf(state, x, y)] = current;
        } else if (strongest && strongest[0] !== current.ownerId && strongest[1] >= 4 + defenseBonus) {
          next[indexOf(state, x, y)] = { ownerId: strongest[0], type: 'seed' };
        }
        continue;
      }

      if (strongest && strongest[1] === 3 && [...pressure.values()].filter((value) => value === 3).length === 1) {
        next[indexOf(state, x, y)] = { ownerId: strongest[0], type: 'seed' };
      }
    }
  }

  state.board = next;
}

function ownerPressure(state: GameState, x: number, y: number): Map<number, number> {
  const pressure = new Map<number, number>();
  for (const [nx, ny] of neighbors(state, x, y)) {
    const cell = cellAt(state, nx, ny);
    if (!cell?.ownerId) continue;

    const player = state.players[cell.ownerId - 1];
    let weight = 1;
    if (cell.type === 'hunter') weight = player?.mutations.includes('predator') ? 3 : 2;
    if (cell.type === 'wall') weight = 0.5;

    pressure.set(cell.ownerId, (pressure.get(cell.ownerId) ?? 0) + weight);
  }
  return pressure;
}

function sameOwnerNeighbors(state: GameState, x: number, y: number, ownerId: number): number {
  return neighbors(state, x, y).filter(([nx, ny]) => cellAt(state, nx, ny)?.ownerId === ownerId).length;
}

function seedArena(state: GameState): void {
  const starts = [
    [3, 3],
    [state.settings.width - 4, state.settings.height - 4],
    [state.settings.width - 4, 3],
    [3, state.settings.height - 4],
  ];

  state.players.forEach((player, index) => {
    const [x, y] = starts[index];
    setCell(state, x, y, { ownerId: player.id, type: 'seed' });
    setCell(state, x + 1, y, { ownerId: player.id, type: 'seed' });
    setCell(state, x, y + 1, { ownerId: player.id, type: 'spore' });
    setCell(state, x + 1, y + 1, { ownerId: player.id, type: 'wall' });
  });

  if (state.settings.arena === 'maze') {
    for (let y = 4; y < state.settings.height - 4; y += 3) {
      for (let x = 6; x < state.settings.width - 6; x += 1) {
        if (x % 7 !== 0) setCell(state, x, y, { ownerId: null, type: 'food' });
      }
    }
  }

  if (state.settings.arena === 'crucible') {
    const cx = Math.floor(state.settings.width / 2);
    const cy = Math.floor(state.settings.height / 2);
    for (let offset = -2; offset <= 2; offset += 1) {
      setCell(state, cx + offset, cy, { ownerId: null, type: 'mutation' });
      setCell(state, cx, cy + offset, { ownerId: null, type: 'food' });
    }
  }

  spawnPickups(state);
}

function spawnPickups(state: GameState): void {
  const targetFood = Math.floor((state.settings.width * state.settings.height) / 95);
  const foodCount = state.board.filter((cell) => cell?.type === 'food').length;
  const mutationCount = state.board.filter((cell) => cell?.type === 'mutation').length;

  for (let i = foodCount; i < targetFood; i += 1) placeRandomPickup(state, 'food');
  if (mutationCount < 2 && state.round % 2 === 1) placeRandomPickup(state, 'mutation');
}

function placeRandomPickup(state: GameState, type: PickupType): void {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const x = Math.floor(Math.random() * state.settings.width);
    const y = Math.floor(Math.random() * state.settings.height);
    if (!cellAt(state, x, y)) {
      setCell(state, x, y, { ownerId: null, type });
      return;
    }
  }
}

function updateAliveAndWinner(state: GameState): void {
  for (const player of state.players) {
    player.alive = state.board.some((cell) => cell?.ownerId === player.id);
  }

  const livingTeams = new Set(state.players.filter((player) => player.alive).map((player) => player.team));
  if (livingTeams.size === 1) {
    state.winnerTeam = [...livingTeams][0];
    state.phase = 'finished';
    pushLog(state, `Team ${state.winnerTeam} wins.`);
  }
}

function drawMutations(player: Player, count: number): MutationId[] {
  const available = mutationPool.filter((mutation) => !player.mutations.includes(mutation));
  return shuffle(available).slice(0, count);
}

function isNearOwnedCell(state: GameState, player: Player, x: number, y: number): boolean {
  const range = state.settings.placementRange + (player.mutations.includes('overgrowth') ? 1 : 0);
  for (let cy = y - range; cy <= y + range; cy += 1) {
    for (let cx = x - range; cx <= x + range; cx += 1) {
      if (inBounds(state, cx, cy) && cellAt(state, cx, cy)?.ownerId === player.id) return true;
    }
  }
  return false;
}

function neighbors(state: GameState, x: number, y: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(state, nx, ny)) result.push([nx, ny]);
    }
  }
  return result;
}

function forEachCell(state: GameState, callback: (x: number, y: number, cell: Cell | null) => void): void {
  for (let y = 0; y < state.settings.height; y += 1) {
    for (let x = 0; x < state.settings.width; x += 1) callback(x, y, cellAt(state, x, y));
  }
}

function cellAt(state: GameState, x: number, y: number): Cell | null {
  return state.board[indexOf(state, x, y)];
}

function setCell(state: GameState, x: number, y: number, cell: Cell | null): void {
  state.board[indexOf(state, x, y)] = cell;
}

function indexOf(state: GameState, x: number, y: number): number {
  return y * state.settings.width + x;
}

function inBounds(state: GameState, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < state.settings.width && y < state.settings.height;
}

function pushLog(state: GameState, entry: string): void {
  state.log = [entry, ...state.log].slice(0, 12);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(items: T[]): T[] {
  return [...items].sort(() => Math.random() - 0.5);
}
