import { MUTATION_CATALOG } from './mutations';

export type Phase = 'planning' | 'finished';
export type TeamMode = 'ffa' | 'duo';
export type ArenaId = 'garden' | 'maze' | 'crucible';
export type CellType = 'seed' | 'wall' | 'hunter' | 'spore';
export type PickupType = 'food' | 'mutation';
export type MutationId = (typeof MUTATION_CATALOG)[number]['id'];

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
  carryoverBudget: number;
  budgetDebt: number;
  tempBudget: number;
  lastFoodRound: number;
  rerolls: number;
  alive: boolean;
  mutations: MutationId[];
  pendingMutations: MutationId[];
}

export interface BoardMarker {
  x: number;
  y: number;
  ownerId: number;
  type?: CellType;
  round: number;
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
  deadCells: BoardMarker[];
  husks: BoardMarker[];
  log: string[];
}

const colors = ['#32d583', '#60a5fa', '#f97316', '#e879f9'];
const mutationPool: MutationId[] = MUTATION_CATALOG.map((mutation) => mutation.id);

const mutationLabels = Object.fromEntries(
  MUTATION_CATALOG.map((mutation) => [mutation.id, `${mutation.name}: ${mutation.summary}`]),
) as Record<MutationId, string>;

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
    carryoverBudget: 0,
    budgetDebt: 0,
    tempBudget: 0,
    lastFoodRound: 1,
    rerolls: 1,
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
    deadCells: [],
    husks: [],
    log: [`Arena ${settings.arena} started.`],
  };

  seedArena(state);
  queueBotActions(state);
  return state;
}

export function serializeGame(state: GameState): GameState & { mutationLabels: Record<MutationId, string>; mutationCatalog: typeof MUTATION_CATALOG } {
  tickGame(state);
  if (state.phase === 'planning') queueBotActions(state);
  return {
    ...state,
    board: state.board.map((cell) => (cell ? { ...cell } : null)),
    players: state.players.map((player) => ({ ...player, mutations: [...player.mutations], pendingMutations: [...player.pendingMutations] })),
    queuedActions: state.queuedActions.map((action) => ({ ...action })),
    deadCells: state.deadCells.map((marker) => ({ ...marker })),
    husks: state.husks.map((marker) => ({ ...marker })),
    log: [...state.log],
    mutationLabels,
    mutationCatalog: MUTATION_CATALOG,
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

  if (action.action === 'place') {
    if (!action.cellType) return { ok: false, message: 'Missing cell type.' };
    const nextActions = [...state.queuedActions, action];
    if (usedPlacementBudget(nextActions, player) > placementBudget(state, player, true)) return { ok: false, message: 'No placement budget left.' };
    if (cellAt(state, action.x, action.y)) return { ok: false, message: 'Target is occupied.' };
    if (isBlockedByHusk(state, player, action.x, action.y)) return { ok: false, message: 'Seed husk blocks enemy placement this round.' };
    if (!isNearOwnedCell(state, player, action.x, action.y)) return { ok: false, message: 'Target is outside your placement range.' };
    if (isBlockedBySaltLine(state, player, action.x, action.y)) return { ok: false, message: 'Salt Line blocks placement near enemy walls.' };
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
  if (mutation === 'extra_biomass') player.energy = clamp(player.energy + 1, 0, 8);
  pushLog(state, `${player.name} chose ${mutationLabels[mutation]}.`);
  return { ok: true };
}

export function rerollMutations(state: GameState, playerId: number): { ok: boolean; message?: string } {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (!player) return { ok: false, message: 'Player not found.' };
  if (!player.mutations.includes('reroll_gland') || player.rerolls <= 0) return { ok: false, message: 'No mutation reroll available.' };
  if (player.pendingMutations.length === 0) return { ok: false, message: 'No mutation choices to reroll.' };

  player.rerolls -= 1;
  player.pendingMutations = drawMutations(player, mutationChoiceCount(player));
  pushLog(state, `${player.name} rerolled mutation choices.`);
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
  applyWildTendrils(state);
  recordRoundEconomy(state);
  applyQueuedRemovals(state);
  const deaths = resolveLife(state);
  applyDeathEffects(state, deaths);
  applyQueuedPlacements(state);
  resolvePickups(state);
  applyGrowthAftershocks(state, deaths);
  spawnPickups(state);
  updateAliveAndWinner(state);

  state.queuedActions = [];
  if (!state.winnerTeam) {
    state.round += 1;
    prepareNextRound(state, deaths);
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

    const budget = placementBudget(state, player, true);
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

function placementBudget(state: GameState, player: Player, includeDebtCredit = false): number {
  let budget = state.settings.placementsPerRound + player.energy + player.carryoverBudget + player.tempBudget - player.budgetDebt;
  if (player.mutations.includes('extra_biomass')) budget += 1;
  if (player.mutations.includes('thin_frontier')) budget -= 1;
  if (player.mutations.includes('starved_colony')) budget -= 2;
  if (player.mutations.includes('metabolic_crash') && state.round - player.lastFoodRound >= 3) budget -= 2;
  if (player.mutations.includes('mutation_sickness')) {
    const sicknessIndex = player.mutations.indexOf('mutation_sickness');
    budget -= Math.max(0, player.mutations.length - sicknessIndex - 1);
  }
  if (player.mutations.includes('deadweight')) budget -= Math.min(3, livingCells(state, player.id, 'wall'));
  if (player.mutations.includes('burst_turn')) budget = state.round % 4 === 0 ? budget * 2 : budget - 1;
  if (player.mutations.includes('cellular_debt') && includeDebtCredit) budget += 3;
  return Math.max(0, Math.floor(budget));
}

function usedPlacementBudget(actions: QueuedAction[], player: Player): number {
  let used = 0;
  let freeSeeds = 0;
  for (const action of actions) {
    if (action.playerId !== player.id || action.action !== 'place') continue;
    used += actionPlacementCost(action, player, freeSeeds);
    if (action.cellType === 'seed') freeSeeds += 1;
  }
  return used;
}

function actionPlacementCost(action: QueuedAction, player: Player, seedIndex: number): number {
  if (action.cellType === 'seed' && player.mutations.includes('cheap_seeds') && seedIndex < 2) return 0;
  if (action.cellType === 'hunter' && player.mutations.includes('expensive_hunters')) return 2;
  if (action.cellType === 'wall' && player.mutations.includes('hollow_walls')) return 0;
  return 1;
}

function livingCells(state: GameState, playerId: number, type?: CellType): number {
  return state.board.filter((cell) => cell?.ownerId === playerId && (!type || cell.type === type)).length;
}

function recordRoundEconomy(state: GameState): void {
  for (const player of state.players) {
    if (!player.alive) continue;
    const baseBudget = placementBudget(state, player, false);
    const used = usedPlacementBudget(state.queuedActions, player);
    player.carryoverBudget = player.mutations.includes('stored_calories') ? Math.min(3, Math.max(0, baseBudget - used)) : 0;
    player.budgetDebt = player.mutations.includes('cellular_debt') ? Math.min(3, Math.max(0, used - baseBudget)) : 0;
  }
}

function prepareNextRound(state: GameState, deaths: BoardMarker[]): void {
  for (const player of state.players) {
    const playerDeaths = deaths.filter((death) => death.ownerId === player.id).length;
    player.tempBudget = player.mutations.includes('metabolic_refund') ? Math.min(3, playerDeaths) : 0;
  }

  state.deadCells = deaths;
  state.husks = state.husks.filter((marker) => state.round - marker.round <= 1);
}

function applyWildTendrils(state: GameState): void {
  for (const player of state.players) {
    if (!player.alive || !player.mutations.includes('wild_tendrils')) continue;
    const candidates = placementCandidates(state, player).filter(([x, y]) => !isBlockedBySaltLine(state, player, x, y));
    const [x, y] = shuffle(candidates)[0] ?? [];
    if (x === undefined || y === undefined) continue;
    state.queuedActions.push({ playerId: player.id, action: 'place', x, y, cellType: 'seed' });
  }
}

function applyDeathEffects(state: GameState, deaths: BoardMarker[]): void {
  for (const death of deaths) {
    const player = state.players[death.ownerId - 1];
    if (death.type === 'seed' && player?.mutations.includes('seed_husks')) {
      state.husks.push(death);
    }
    if (death.type === 'spore' && player?.mutations.includes('volatile_spores')) {
      for (const [nx, ny] of neighbors(state, death.x, death.y)) {
        const target = cellAt(state, nx, ny);
        if (!target || (target.ownerId && state.players[target.ownerId - 1]?.team !== player.team)) {
          setCell(state, nx, ny, { ownerId: player.id, type: 'seed' });
          break;
        }
      }
    }
    if (death.type === 'spore' && player?.mutations.includes('pollen_trail')) {
      state.deadCells.push(death);
    }
  }
}

function applyGrowthAftershocks(state: GameState, deaths: BoardMarker[]): void {
  for (const player of state.players) {
    if (!player.alive) continue;

    if (player.mutations.includes('mold_problem')) {
      const owned = ownedCellPositions(state, player.id);
      const [x, y] = shuffle(owned)[0] ?? [];
      if (x !== undefined && y !== undefined) {
        const candidates = neighbors(state, x, y).filter(([nx, ny]) => !cellAt(state, nx, ny));
        const [sx, sy] = shuffle(candidates)[0] ?? [];
        if (sx !== undefined && sy !== undefined) setCell(state, sx, sy, { ownerId: player.id, type: 'spore' });
      }
    }

    if (player.mutations.includes('cloud_bloom')) {
      const spores = ownedCellPositions(state, player.id).filter(([x, y]) => cellAt(state, x, y)?.type === 'spore');
      for (const [x, y] of spores.slice(0, 2)) {
        const targets = twoStepCells(state, x, y).filter(([tx, ty]) => !cellAt(state, tx, ty));
        const [tx, ty] = shuffle(targets)[0] ?? [];
        if (tx !== undefined && ty !== undefined) setCell(state, tx, ty, { ownerId: player.id, type: 'spore' });
      }
    }
  }

  for (const death of deaths) {
    for (const player of state.players) {
      if (!player.mutations.includes('trophy_growth') || player.id === death.ownerId) continue;
      const hunterNearby = neighbors(state, death.x, death.y).some(([nx, ny]) => {
        const cell = cellAt(state, nx, ny);
        return cell?.ownerId === player.id && cell.type === 'hunter';
      });
      if (hunterNearby) player.tempBudget = Math.min(3, player.tempBudget + 1);
    }
  }
}

function ownedCellPositions(state: GameState, playerId: number): Array<[number, number]> {
  const positions: Array<[number, number]> = [];
  forEachCell(state, (x, y, cell) => {
    if (cell?.ownerId === playerId) positions.push([x, y]);
  });
  return positions;
}

function twoStepCells(state: GameState, x: number, y: number): Array<[number, number]> {
  const result: Array<[number, number]> = [];
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== 2) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (inBounds(state, nx, ny)) result.push([nx, ny]);
    }
  }
  return result;
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
    if (isBlockedByHusk(state, player, action.x, action.y)) continue;
    if (isBlockedBySaltLine(state, player, action.x, action.y)) continue;
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
      const gain = 1 + (player.mutations.includes('richer_food') ? 1 : 0);
      player.energy = clamp(player.energy + gain, 0, 8);
      player.lastFoodRound = state.round;
      if (player.mutations.includes('spoiled_food')) killAdjacentOwnedCell(state, player.id, x, y);
      pushLog(state, `${player.name} consumed biomass and gained placement energy.`);
    } else if (player.pendingMutations.length === 0) {
      player.pendingMutations = drawMutations(player, mutationChoiceCount(player));
      pushLog(state, `${player.name} unlocked mutation choices.`);
    }
    setCell(state, x, y, null);
  });
}

function killAdjacentOwnedCell(state: GameState, playerId: number, x: number, y: number): void {
  const target = shuffle(neighbors(state, x, y)).find(([nx, ny]) => cellAt(state, nx, ny)?.ownerId === playerId);
  if (!target) return;
  setCell(state, target[0], target[1], null);
}

function resolveLife(state: GameState): BoardMarker[] {
  const previous = state.board.map((cell) => (cell ? { ...cell } : null));
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
        const ownNeighbors = effectiveOwnNeighbors(state, x, y, current);
        const enemyPressure = hostilePressureAgainst(state, x, y, current.ownerId);
        const defenseBonus = survivalDefenseBonus(state, current, x, y);
        const sporeLives =
          current.type === 'spore' &&
          ((player?.mutations.includes('fertile') && ownNeighbors >= 1) ||
            (player?.mutations.includes('light_spores') && ownNeighbors >= 1 && enemyPressure === 0));
        const brittleWallDies = current.type === 'wall' && player?.mutations.includes('brittle_walls') && enemyPressure > 0;

        if (!brittleWallDies && (sporeLives || ownNeighbors === 2 || ownNeighbors === 3) && enemyPressure <= 3 + defenseBonus) {
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
  return collectDeaths(state, previous, next);
}

function ownerPressure(state: GameState, x: number, y: number): Map<number, number> {
  const pressure = new Map<number, number>();
  for (const [nx, ny] of neighbors(state, x, y)) {
    const cell = cellAt(state, nx, ny);
    if (!cell?.ownerId) continue;

    const player = state.players[cell.ownerId - 1];
    let weight = 1;
    if (cell.type === 'hunter') weight = hunterPressure(state, player, nx, ny);
    if (cell.type === 'wall') weight = wallPressure(player);
    if (cell.type === 'spore' && player?.mutations.includes('sterile_spores')) weight = 0;
    if (cell.type === 'seed' && player?.mutations.includes('weed_patch')) weight = 1.35;

    pressure.set(cell.ownerId, (pressure.get(cell.ownerId) ?? 0) + weight);
  }
  return pressure;
}

function sameOwnerNeighbors(state: GameState, x: number, y: number, ownerId: number): number {
  return neighbors(state, x, y).filter(([nx, ny]) => cellAt(state, nx, ny)?.ownerId === ownerId).length;
}

function effectiveOwnNeighbors(state: GameState, x: number, y: number, cell: Cell): number {
  let count = sameOwnerNeighbors(state, x, y, cell.ownerId as number);
  const player = state.players[(cell.ownerId as number) - 1];
  if (cell.type === 'wall' && player?.mutations.includes('thick_walls')) count += 1;
  return count;
}

function survivalDefenseBonus(state: GameState, cell: Cell, x: number, y: number): number {
  const player = state.players[(cell.ownerId as number) - 1];
  if (!player) return 0;

  let bonus = 0;
  if (cell.type === 'wall' && player.mutations.includes('fortify')) bonus += 1;
  if (cell.type === 'wall' && player.mutations.includes('hollow_walls')) bonus -= 1;
  if (cell.type === 'seed' && player.mutations.includes('strong_seeds')) bonus += 1;
  if (cell.type === 'seed' && player.mutations.includes('weak_seeds')) bonus -= 1;
  if (cell.type === 'seed' && player.mutations.includes('weed_patch')) bonus -= 1;
  if (cell.type === 'hunter' && player.mutations.includes('coward_hunters') && hostileNeighborCount(state, x, y, player.team) > 1) bonus -= 1;
  return bonus;
}

function hostilePressureAgainst(state: GameState, x: number, y: number, ownerId: number): number {
  const owner = state.players[ownerId - 1];
  let pressure = 0;

  for (const [nx, ny] of neighbors(state, x, y)) {
    const cell = cellAt(state, nx, ny);
    if (!cell?.ownerId) continue;

    const player = state.players[cell.ownerId - 1];
    const sameOwner = cell.ownerId === ownerId;
    const sameTeam = player?.team === owner?.team;
    const friendlyFire = sameOwner && cell.type === 'hunter' && player?.mutations.includes('friendly_fire');
    const rabid = sameOwner && cell.type === 'hunter' && player?.mutations.includes('rabid_hunters');

    if (!sameTeam || friendlyFire || rabid) {
      pressure += cell.type === 'hunter' ? hunterPressure(state, player, nx, ny) : player?.mutations.includes('thorn_walls') && cell.type === 'wall' ? 1.25 : 1;
    }
  }

  return pressure;
}

function hunterPressure(state: GameState, player: Player | undefined, x: number, y: number): number {
  if (!player) return 2;
  let pressure = player.mutations.includes('predator') ? 3 : 2;
  if (player.mutations.includes('sharp_hunters')) pressure += 0.5;
  if (player.mutations.includes('rabid_hunters')) pressure += 1;
  if (player.mutations.includes('coward_hunters') && hostileNeighborCount(state, x, y, player.team) > 1) pressure = 1;
  if (player.mutations.includes('pack_hunting')) {
    pressure += neighbors(state, x, y).filter(([nx, ny]) => {
      const neighbor = cellAt(state, nx, ny);
      return neighbor?.ownerId === player.id && neighbor.type === 'hunter';
    }).length * 0.75;
  }
  return pressure;
}

function wallPressure(player: Player | undefined): number {
  if (!player) return 0.5;
  if (player.mutations.includes('thorn_walls')) return 1.5;
  if (player.mutations.includes('hollow_walls')) return 0.25;
  return 0.5;
}

function hostileNeighborCount(state: GameState, x: number, y: number, team: number): number {
  return neighbors(state, x, y).filter(([nx, ny]) => {
    const cell = cellAt(state, nx, ny);
    return Boolean(cell?.ownerId && state.players[cell.ownerId - 1]?.team !== team);
  }).length;
}

function collectDeaths(state: GameState, previous: Array<Cell | null>, next: Array<Cell | null>): BoardMarker[] {
  const deaths: BoardMarker[] = [];
  for (let index = 0; index < previous.length; index += 1) {
    const before = previous[index];
    const after = next[index];
    if (!before?.ownerId) continue;
    if (!after || after.ownerId !== before.ownerId) {
      deaths.push({
        x: index % state.settings.width,
        y: Math.floor(index / state.settings.width),
        ownerId: before.ownerId,
        type: before.type as CellType,
        round: state.round,
      });
    }
  }
  return deaths;
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
  const choices = shuffle(available).slice(0, count);
  if (player.mutations.includes('bad_choices') && !choices.some((mutation) => mutationDefinition(mutation)?.rarity === 'cursed')) {
    const cursed = shuffle(available.filter((mutation) => mutationDefinition(mutation)?.rarity === 'cursed'))[0];
    if (cursed) choices[choices.length - 1] = cursed;
  }
  return choices;
}

function isNearOwnedCell(state: GameState, player: Player, x: number, y: number): boolean {
  const maxRange = placementRangeForPlayer(state, player) + (player.mutations.includes('long_roots') ? 1 : 0);
  for (let cy = y - maxRange; cy <= y + maxRange; cy += 1) {
    for (let cx = x - maxRange; cx <= x + maxRange; cx += 1) {
      if (!inBounds(state, cx, cy)) continue;
      const source = cellAt(state, cx, cy);
      if (source?.ownerId !== player.id) continue;
      const sourceRange = placementRangeForPlayer(state, player) + (player.mutations.includes('long_roots') && source.type === 'seed' ? 1 : 0);
      if (Math.abs(cx - x) <= sourceRange && Math.abs(cy - y) <= sourceRange) return true;
    }
  }
  if (player.mutations.includes('territorial_memory') || player.mutations.includes('pollen_trail')) {
    const range = placementRangeForPlayer(state, player);
    return state.deadCells.some((marker) => marker.ownerId === player.id && state.round - marker.round <= 1 && Math.abs(marker.x - x) <= range && Math.abs(marker.y - y) <= range);
  }
  return false;
}

function placementRangeForPlayer(state: GameState, player: Player): number {
  let range = state.settings.placementRange;
  if (player.mutations.includes('overgrowth')) range += 1;
  if (player.mutations.includes('thin_frontier')) range += 2;
  if (player.mutations.includes('blind_expansion')) range += 3;
  if (player.mutations.includes('local_only')) range -= 1;
  if (player.mutations.includes('one_step_colony')) range = 1;
  return Math.max(1, range);
}

function isBlockedBySaltLine(state: GameState, player: Player, x: number, y: number): boolean {
  return neighbors(state, x, y).some(([nx, ny]) => {
    const cell = cellAt(state, nx, ny);
    if (cell?.type !== 'wall' || !cell.ownerId) return false;
    const wallOwner = state.players[cell.ownerId - 1];
    if (wallOwner?.team === player.team) return false;
    return player.mutations.includes('salt_line') || wallOwner?.mutations.includes('salt_line');
  });
}

function isBlockedByHusk(state: GameState, player: Player, x: number, y: number): boolean {
  return state.husks.some((husk) => {
    const owner = state.players[husk.ownerId - 1];
    return husk.x === x && husk.y === y && state.round - husk.round <= 1 && owner?.team !== player.team;
  });
}

function mutationChoiceCount(player: Player): number {
  return 3 + (player.mutations.includes('extra_choice') ? 1 : 0);
}

function mutationDefinition(id: MutationId) {
  return MUTATION_CATALOG.find((mutation) => mutation.id === id);
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
