export type MutationRarity = 'common' | 'uncommon' | 'rare' | 'legendary' | 'cursed';
export type MutationPolarity = 'benefit' | 'mixed' | 'drawback' | 'weird';
export type MutationStatus = 'implemented';

export interface MutationDefinition {
  id: string;
  name: string;
  rarity: MutationRarity;
  polarity: MutationPolarity;
  tags: string[];
  summary: string;
  status: MutationStatus;
}

// Gameplay catalog. Effects are implemented in src/game.ts.
export const MUTATION_CATALOG = [
  { id: 'overgrowth', name: 'Overgrowth', rarity: 'common', polarity: 'benefit', tags: ['range'], summary: 'Placement range increases by 1.', status: 'implemented' },
  { id: 'fortify', name: 'Fortify', rarity: 'common', polarity: 'benefit', tags: ['wall', 'defense'], summary: 'Wall cells survive with one extra hostile pressure.', status: 'implemented' },
  { id: 'predator', name: 'Predator', rarity: 'uncommon', polarity: 'benefit', tags: ['hunter', 'attack'], summary: 'Hunter cells apply stronger attack pressure.', status: 'implemented' },
  { id: 'fertile', name: 'Fertile', rarity: 'common', polarity: 'benefit', tags: ['spore', 'survival'], summary: 'Spore cells can survive with one same-owner neighbor.', status: 'implemented' },

  { id: 'long_roots', name: 'Long Roots', rarity: 'common', polarity: 'benefit', tags: ['range', 'seed'], summary: 'Seed cells extend placement range by 1.', status: 'implemented' },
  { id: 'thin_frontier', name: 'Thin Frontier', rarity: 'common', polarity: 'mixed', tags: ['range', 'budget'], summary: 'Placement range increases by 2, but placement budget decreases by 1.', status: 'implemented' },
  { id: 'local_only', name: 'Local Only', rarity: 'cursed', polarity: 'drawback', tags: ['range'], summary: 'Placement range is reduced by 1.', status: 'implemented' },
  { id: 'wild_tendrils', name: 'Wild Tendrils', rarity: 'rare', polarity: 'mixed', tags: ['range', 'random'], summary: 'Once per turn, gain one free random legal placement near your frontier.', status: 'implemented' },
  { id: 'territorial_memory', name: 'Territorial Memory', rarity: 'uncommon', polarity: 'benefit', tags: ['range', 'death'], summary: 'You may place near cells that died last round.', status: 'implemented' },
  { id: 'blind_expansion', name: 'Blind Expansion', rarity: 'rare', polarity: 'mixed', tags: ['range', 'ui'], summary: 'Placement range increases by 3, but range highlights are hidden.', status: 'implemented' },
  { id: 'salt_line', name: 'Salt Line', rarity: 'rare', polarity: 'mixed', tags: ['range', 'wall', 'denial'], summary: 'Enemies cannot place adjacent to your walls, but you cannot place adjacent to enemy walls.', status: 'implemented' },
  { id: 'one_step_colony', name: 'One Step Colony', rarity: 'cursed', polarity: 'drawback', tags: ['range'], summary: 'You may only place directly adjacent to owned cells.', status: 'implemented' },

  { id: 'extra_biomass', name: 'Extra Biomass', rarity: 'common', polarity: 'benefit', tags: ['budget'], summary: 'Placement budget increases by 1.', status: 'implemented' },
  { id: 'stored_calories', name: 'Stored Calories', rarity: 'common', polarity: 'benefit', tags: ['budget'], summary: 'Unused placement budget carries over, up to 3.', status: 'implemented' },
  { id: 'starved_colony', name: 'Starved Colony', rarity: 'cursed', polarity: 'drawback', tags: ['budget'], summary: 'Placement budget decreases by 2.', status: 'implemented' },
  { id: 'burst_turn', name: 'Burst Turn', rarity: 'rare', polarity: 'mixed', tags: ['budget', 'timer'], summary: 'Every fourth round, placement budget doubles. Other rounds, it is reduced by 1.', status: 'implemented' },
  { id: 'cheap_seeds', name: 'Cheap Seeds', rarity: 'common', polarity: 'benefit', tags: ['budget', 'seed'], summary: 'First two seed placements each round do not consume budget.', status: 'implemented' },
  { id: 'expensive_hunters', name: 'Expensive Hunters', rarity: 'cursed', polarity: 'drawback', tags: ['budget', 'hunter'], summary: 'Hunter cells cost 2 placement budget.', status: 'implemented' },
  { id: 'metabolic_refund', name: 'Metabolic Refund', rarity: 'uncommon', polarity: 'benefit', tags: ['budget', 'death'], summary: 'When one of your cells dies, gain 1 temporary budget next round, up to 3.', status: 'implemented' },
  { id: 'cellular_debt', name: 'Cellular Debt', rarity: 'rare', polarity: 'mixed', tags: ['budget'], summary: 'You may overspend by 3 budget, but next round starts with that much debt.', status: 'implemented' },

  { id: 'thick_walls', name: 'Thick Walls', rarity: 'common', polarity: 'benefit', tags: ['wall', 'defense'], summary: 'Wall cells count as one extra same-owner neighbor for survival.', status: 'implemented' },
  { id: 'brittle_walls', name: 'Brittle Walls', rarity: 'cursed', polarity: 'drawback', tags: ['wall'], summary: 'Wall cells die if they have any hostile neighbor.', status: 'implemented' },
  { id: 'thorn_walls', name: 'Thorn Walls', rarity: 'uncommon', polarity: 'benefit', tags: ['wall', 'attack'], summary: 'Enemies next to your walls receive extra hostile pressure.', status: 'implemented' },
  { id: 'hollow_walls', name: 'Hollow Walls', rarity: 'common', polarity: 'mixed', tags: ['wall', 'budget'], summary: 'Walls cost no budget but provide less defense.', status: 'implemented' },
  { id: 'deadweight', name: 'Deadweight', rarity: 'cursed', polarity: 'drawback', tags: ['wall', 'budget'], summary: 'Each living wall reduces next round budget by 1, capped at 3.', status: 'implemented' },

  { id: 'sharp_hunters', name: 'Sharp Hunters', rarity: 'common', polarity: 'benefit', tags: ['hunter', 'attack'], summary: 'Hunters add slightly more pressure against enemies.', status: 'implemented' },
  { id: 'rabid_hunters', name: 'Rabid Hunters', rarity: 'uncommon', polarity: 'mixed', tags: ['hunter', 'attack'], summary: 'Hunters apply high pressure to all neighbors, including allied cells.', status: 'implemented' },
  { id: 'coward_hunters', name: 'Coward Hunters', rarity: 'cursed', polarity: 'drawback', tags: ['hunter'], summary: 'Hunters lose attack pressure when adjacent to more than one enemy.', status: 'implemented' },
  { id: 'pack_hunting', name: 'Pack Hunting', rarity: 'rare', polarity: 'benefit', tags: ['hunter'], summary: 'Adjacent hunters multiply each other attack pressure.', status: 'implemented' },
  { id: 'friendly_fire', name: 'Friendly Fire', rarity: 'cursed', polarity: 'drawback', tags: ['hunter'], summary: 'Hunters count allied cells as enemies for pressure calculation.', status: 'implemented' },
  { id: 'trophy_growth', name: 'Trophy Growth', rarity: 'uncommon', polarity: 'benefit', tags: ['hunter', 'budget'], summary: 'Gain temporary budget when a hunter helps convert an enemy cell.', status: 'implemented' },

  { id: 'light_spores', name: 'Light Spores', rarity: 'common', polarity: 'benefit', tags: ['spore'], summary: 'Spores survive with one fewer neighbor when no enemies are adjacent.', status: 'implemented' },
  { id: 'volatile_spores', name: 'Volatile Spores', rarity: 'uncommon', polarity: 'mixed', tags: ['spore', 'attack'], summary: 'Spores explode into pressure when they die.', status: 'implemented' },
  { id: 'sterile_spores', name: 'Sterile Spores', rarity: 'cursed', polarity: 'drawback', tags: ['spore'], summary: 'Spores cannot create new cells.', status: 'implemented' },
  { id: 'cloud_bloom', name: 'Cloud Bloom', rarity: 'rare', polarity: 'benefit', tags: ['spore', 'growth'], summary: 'Spores can birth cells two tiles away if the landing tile is empty.', status: 'implemented' },
  { id: 'mold_problem', name: 'Mold Problem', rarity: 'cursed', polarity: 'mixed', tags: ['spore', 'random'], summary: 'Random spores appear in your territory and may overcrowd your cells.', status: 'implemented' },
  { id: 'pollen_trail', name: 'Pollen Trail', rarity: 'uncommon', polarity: 'benefit', tags: ['spore', 'range'], summary: 'Dead spores leave temporary placement range for one round.', status: 'implemented' },

  { id: 'strong_seeds', name: 'Strong Seeds', rarity: 'common', polarity: 'benefit', tags: ['seed'], summary: 'Seed cells have slightly better survival.', status: 'implemented' },
  { id: 'weak_seeds', name: 'Weak Seeds', rarity: 'cursed', polarity: 'drawback', tags: ['seed'], summary: 'Seed cells die from one less hostile pressure.', status: 'implemented' },
  { id: 'weed_patch', name: 'Weed Patch', rarity: 'rare', polarity: 'mixed', tags: ['seed', 'growth'], summary: 'Seeds spread aggressively but are easier for enemies to convert.', status: 'implemented' },
  { id: 'seed_husks', name: 'Seed Husks', rarity: 'uncommon', polarity: 'benefit', tags: ['seed', 'death'], summary: 'Dead seeds leave husks that block enemy placement for one round.', status: 'implemented' },

  { id: 'extra_choice', name: 'Extra Choice', rarity: 'uncommon', polarity: 'benefit', tags: ['mutation'], summary: 'Mutation pickups offer one additional option.', status: 'implemented' },
  { id: 'bad_choices', name: 'Bad Choices', rarity: 'cursed', polarity: 'drawback', tags: ['mutation'], summary: 'Mutation pickups always include at least one cursed mutation.', status: 'implemented' },
  { id: 'reroll_gland', name: 'Reroll Gland', rarity: 'rare', polarity: 'benefit', tags: ['mutation'], summary: 'Once per game, reroll offered mutations.', status: 'implemented' },
  { id: 'mutation_sickness', name: 'Mutation Sickness', rarity: 'cursed', polarity: 'drawback', tags: ['mutation'], summary: 'Each mutation after this reduces placement budget by 1.', status: 'implemented' },

  { id: 'richer_food', name: 'Richer Food', rarity: 'uncommon', polarity: 'benefit', tags: ['food', 'budget'], summary: 'Food grants one extra biomass.', status: 'implemented' },
  { id: 'spoiled_food', name: 'Spoiled Food', rarity: 'common', polarity: 'mixed', tags: ['food'], summary: 'Food grants biomass but kills one adjacent allied cell.', status: 'implemented' },
  { id: 'metabolic_crash', name: 'Metabolic Crash', rarity: 'cursed', polarity: 'drawback', tags: ['food', 'budget'], summary: 'If you do not consume food for 3 rounds, lose 2 budget next round.', status: 'implemented' },
] as const satisfies readonly MutationDefinition[];

export const MUTATION_CATALOG_SIZE = MUTATION_CATALOG.length;
