// The war skill optimizer's and damage estimator's engine (WEBSITE.md → 12 war skill optimizer): model + search, the JavaScript twin of
// warera/battle.py, the same operations in the same order, so both find the same build for the same inputs
// (tests/damage_twin.py; change both together). No DOM, so it runs in a Web Worker (damage_worker.js). `D` is the global
// data: D.rules (warera/fighter.py: rules_data). The website's page sets globalThis.D; the desktop page
// (warera/pages/damage_estimator.py) embeds this file after its own `const D`.

// ---- The model (twin of warera/battle.py) -------------------------------------------------------------------------
const SKILLS = [
  "attack",
  "precision",
  "criticalChance",
  "criticalDamages",
  "armor",
  "dodge",
  "health",
  "hunger",
  "lootChance",
];
const SLOTS = ["weapon", "helmet", "chest", "pants", "boots", "gloves"];
const AMMO = ["lightAmmo", "ammo", "heavyAmmo"];
const FOODS = ["bread", "steak", "cookedFish"];
const FOOD_LEFT_OUT = 1e15; // the price of a food left out: beyond any budget (as warera/battle.py)
const NO_AMMO = ["knife"];
const HEALTH_PER_HIT = 10,
  SOFT_CAP = 40,
  MISS_FACTOR = 0.5,
  HITS_PER_ITEM = 100,
  REGEN_SHARE = 0.1,
  PILL_HOURS = 8,
  DAY_HOURS = 24;
const HELP_HEALTH = 10,
  ELITE_SHARE = 0.01,
  POINTS_PER_LEVEL = 4,
  MAX_SKILL_LEVEL = 10,
  DEEP_MOVES = 20,
  REGEAR_SPLITS = 3;
const ECO_SKILLS = ["energy", "production"],
  CLICK_COST = 10,
  POOL_ROUNDS = 10,
  PILL_DEBUFF = 0.6,
  MANAGEMENT_BONUS = 0.02;
const PRECISION_PENALTY = 1e6,
  MAX_BONUS_LEVELS = 4,
  NO_FIT = 1e9;
// Strategic resources (v0.28.1; twin of STRATEGIC, strategic_bonus, strategic_levels): resource -> [skill, value a level].
const STRATEGIC = {
  coal: ["precision", 5],
  diamonds: ["health", 10],
  lithium: ["energy", 10],
  rareEarths: ["production", 3],
  gold: ["management", 1],
  uranium: ["lootChance", 2],
};
const STRATEGIC_MAX_LEVEL = 3;
function strategicBonus(levels) {
  const bonus = {};
  for (const [resource, level] of Object.entries(levels)) {
    if (!STRATEGIC[resource] || !level) continue;
    const [skill, step] = STRATEGIC[resource];
    bonus[skill] =
      (bonus[skill] || 0) +
      step * Math.min(Math.max(Math.trunc(level), 0), STRATEGIC_MAX_LEVEL);
  }
  return bonus;
}
const strategicLevels = (bonus) =>
  Object.fromEntries(
    Object.entries(STRATEGIC).map(([resource, [skill, step]]) => [
      resource,
      Math.min(Math.round((bonus[skill] || 0) / step), STRATEGIC_MAX_LEVEL),
    ]),
  );
// Prestige (twin of skill_value, prestige_cost, bonus_levels): a bonus level is worth one more step, past 10 the last
// step again; stacking on one skill costs 1, 2, 4, 8 prestige points.
const skillValue = (values, level) =>
  level <= MAX_SKILL_LEVEL
    ? values[level]
    : values[MAX_SKILL_LEVEL] +
      (level - MAX_SKILL_LEVEL) *
        (values[MAX_SKILL_LEVEL] - values[MAX_SKILL_LEVEL - 1]);
const prestigeCost = (bonus) => 2 ** bonus - 1;
function bonusLevels(prestige) {
  let n = 0;
  while (prestigeCost(n + 1) <= prestige) n++;
  return n;
}
const SCRAPS = { 1: 6, 2: 18, 3: 54, 4: 162, 5: 486, 6: 1458 };
const ECO_ALL = [...ECO_SKILLS, "companies", "management"],
  ALL_SKILLS = [...SKILLS, ...ECO_ALL];
const DEFAULT_BOUNDS = Object.fromEntries(
  ALL_SKILLS.map((s) => [
    s,
    s === "companies" || s === "management" ? [0, 0] : [0, MAX_SKILL_LEVEL],
  ]),
);
// skill -> [min, max]: the scenario's limits within 0..10, a locked skill at 0, a min above the max lowered to it.
function skillBounds(sc) {
  const r = D.rules,
    bounds = {};
  for (const s of ALL_SKILLS) {
    const [lo, hi] = (sc.bounds || {})[s] || DEFAULT_BOUNDS[s];
    const top = sc.level >= r.unlock[s] ? MAX_SKILL_LEVEL : 0;
    const h = Math.min(Math.max(hi, 0), top);
    bounds[s] = [Math.min(Math.max(lo, 0), h), h];
  }
  return bounds;
}

function gearOption(o, scrapsPrice, adjust, tax) {
  const median = o.median * (1 + adjust / 100);
  const price = median * (1 + tax); // the buyer's country's market tax (the loaded player's)
  const back = Math.floor(SCRAPS[o.quality] / 3) * scrapsPrice;
  return {
    slot: o.slot,
    code: o.code,
    quality: o.quality,
    stats: o.stats,
    median,
    price,
    wear: Math.max(price - back, 0) / HITS_PER_ITEM,
    sales: o.sales,
    window: o.window,
  };
}

function makeCtx(sc, P) {
  const r = D.rules;
  const bounds = skillBounds(sc);
  // Prestige: the bonus levels each skill may take (the kept ones with fixedBonus; none on a locked skill).
  const prestige = Math.max(Math.trunc(sc.prestige || 0), 0),
    top = bonusLevels(prestige);
  const fixed =
      sc.fixedBonus && Object.keys(sc.fixedBonus).length ? sc.fixedBonus : null,
    bonusOptions = {};
  for (const s of ALL_SKILLS)
    bonusOptions[s] = fixed
      ? [fixed[s] || 0]
      : sc.level >= r.unlock[s] && !(sc.noBonus || []).includes(s)
        ? Array.from({ length: top + 1 }, (_, b) => b)
        : [0];
  const prestiged = ALL_SKILLS.some((s) => bonusOptions[s].some((b) => b));
  const reach =
    MAX_SKILL_LEVEL +
    1 +
    Math.max(...ALL_SKILLS.map((s) => Math.max(...bonusOptions[s])));
  const extra = sc.strategic || {}; // strategic resources: added at every level
  const extend = (s) =>
    Array.from(
      { length: reach },
      (_, n) => skillValue(r.values[s], n) + (extra[s] || 0),
    );
  const ctx = {
    sc,
    P,
    values: SKILLS.map(extend),
    ecoValues: Object.fromEntries(ECO_ALL.map((s) => [s, extend(s)])),
    costs: SKILLS.map((s) => r.costs[s]),
    bounds,
    prestige,
    bonusOptions,
    prestiged,
    need: new Map(),
    ecoChoices: new Map(),
    // the levels the fighting skills work at: skill points + bonus
    minLevel: SKILLS.map((s) => bounds[s][0] + Math.min(...bonusOptions[s])),
    maxLevel: SKILLS.map((s) => bounds[s][1] + Math.max(...bonusOptions[s])),
    pillMult: sc.pill ? 1 + r.pillBonus : 1,
    rankMult: 1 + sc.rank,
    bonusMult: 1 + sc.bonus,
    caseValue: P.case1 + ELITE_SHARE * P.case2,
    bounty: sc.bounty,
    fixed: sc.pill ? P.cocain : 0,
    bars: sc.pill ? 1 + PILL_HOURS * REGEN_SHARE : DAY_HOURS * REGEN_SHARE,
    helpHealth: sc.help ? (sc.pill ? HELP_HEALTH : 2 * HELP_HEALTH) : 0,
    debuff: sc.pill && sc.debuff,
    debuffBare: !!sc.debuffBare,
    debuffBars: (DAY_HOURS - PILL_HOURS) * REGEN_SHARE - 1,
    debuffHelp: sc.help ? HELP_HEALTH : 0,
    debuffRatio: (1 - PILL_DEBUFF) / (1 + r.pillBonus), // a geared hit's damage in the debuff over the window's
    foodShare: FOODS.map((f) => r.foodHealth[f]),
    foodPrices: FOODS.map((f) =>
      (sc.foodsOff || []).includes(f) ? FOOD_LEFT_OUT : P[f],
    ),
    ammoMult: { none: 1 },
    ammoPrice: { none: 0 },
    budget: sc.budget,
    precOver: r.precisionOverflow,
    critOver: r.critOverflow,
    cache: new Map(),
  };
  for (const a of AMMO) {
    ctx.ammoMult[a] = 1 + r.ammoBonus[a];
    ctx.ammoPrice[a] = P[a];
  }
  // Points the fighting skills may use: all but the economy skills' minimums (ctx.eco is indexed by the rest).
  ctx.ecoMinimum = 0;
  for (const s of ECO_ALL) ctx.ecoMinimum += r.costs[s][bounds[s][0]];
  ctx.totalPoints = POINTS_PER_LEVEL * sc.level;
  ctx.points = ctx.totalPoints - ctx.ecoMinimum;
  ctx.valid = pointsUsed(ctx, ctx.minLevel) <= ctx.points;
  ctx.poolDamage = sc.pool.map((x) => x[0]);
  ctx.poolCoins = sc.pool.map((x) => x[1]);
  ctx.eco = prestiged ? ecoTablePrestige(ctx) : ecoTable(ctx); // with prestige: [points][prestige points]
  return ctx;
}
// Self-work clicks a day (twin of self_work_clicks): the bar's less those given up for training, or the number the player
// set, at most what the bar gives.
function selfWorkClicks(ctx, energyLevel) {
  const sc = ctx.sc,
    bar =
      (ctx.ecoValues.energy[energyLevel] * DAY_HOURS * REGEN_SHARE) /
      CLICK_COST;
  if (sc.selfClicks === null || sc.selfClicks === undefined)
    return Math.max(bar - sc.trainClicks, 0);
  return Math.min(bar, Math.max(sc.selfClicks, 0));
}
// [manager job, self-work, engines, employees] coins a day of [energy, production, companies, management] levels
// (v0.27; twin of eco_parts).
function ecoParts(ctx, levels) {
  const v = ctx.ecoValues,
    sc = ctx.sc,
    [e, p, c, m] = levels,
    production = v.production[p],
    management = v.management[m];
  const engines = c < sc.engines.length ? sc.engines[c] : 0;
  const employees =
    c < sc.employees.length
      ? sc.employees[c] +
        sc.employeeBase[c] * MANAGEMENT_BONUS * (management - sc.managementNow)
      : 0;
  return [
    sc.level >= D.rules.managerLevel ? management * sc.managerPay : 0,
    selfWorkClicks(ctx, e) * production * sc.selfValue,
    engines,
    employees,
  ];
}
// The engines, employees and their base output by companies level: the best companies first, by engine + employees
// when the employees count (twin of income.company_tables). enginePP(company): its engine's PP a day.
function companyTables(companies, counts, enginePP, withEmployees) {
  const ranked = companies
    .slice()
    .sort(
      (a, b) =>
        enginePP(b) * b.value +
        (withEmployees ? b.employees : 0) -
        (enginePP(a) * a.value + (withEmployees ? a.employees : 0)),
    );
  const engines = [],
    employees = [],
    employeeBase = [];
  for (const count of counts) {
    let e = 0,
      p = 0,
      base = 0;
    for (const c of ranked.slice(0, count)) {
      e += enginePP(c) * c.value;
      if (withEmployees) {
        p += c.employees;
        base += c.employeeBase;
      }
    }
    engines.push(e);
    employees.push(p);
    employeeBase.push(base);
  }
  return { engines, employees, employeeBase };
}
// For 0..points skill points beyond the economy skills' minimums: [coins a day, levels] of the best split.
function ecoTable(ctx) {
  const r = D.rules,
    size = ctx.points + 1;
  if (size <= 0) return [];
  const ranges = ECO_ALL.map((s) => ctx.bounds[s]),
    costs = ECO_ALL.map((s) => r.costs[s]);
  const byCost = new Array(size).fill(null);
  for (let e = ranges[0][0]; e <= ranges[0][1]; e++)
    for (let p = ranges[1][0]; p <= ranges[1][1]; p++)
      for (let c = ranges[2][0]; c <= ranges[2][1]; c++)
        for (let m = ranges[3][0]; m <= ranges[3][1]; m++) {
          const k =
            costs[0][e] +
            costs[1][p] +
            costs[2][c] +
            costs[3][m] -
            ctx.ecoMinimum;
          if (k >= size) continue;
          const [manager, selfWork, engines, employees] = ecoParts(ctx, [
            e,
            p,
            c,
            m,
          ]);
          const coins = manager + selfWork + engines + employees;
          if (byCost[k] === null || coins > byCost[k][0])
            byCost[k] = [coins, [e, p, c, m]];
        }
  let best = byCost[0]; // the minimums: always there
  return byCost.map((entry) => {
    if (entry !== null && entry[0] > best[0]) best = entry;
    return best;
  });
}
// With prestige (twin of _eco_table_prestige): [points][prestige points] -> [coins, levels they work at, bonus levels]
// of the best split with at most that many of each; null where nothing fits.
function ecoTablePrestige(ctx) {
  const r = D.rules,
    size = ctx.points + 1,
    top = ctx.prestige;
  if (size <= 0) return [];
  const options = ECO_ALL.map((s) => {
    const list = [];
    for (let level = ctx.bounds[s][0]; level <= ctx.bounds[s][1]; level++)
      for (const bonus of ctx.bonusOptions[s]) {
        if (prestigeCost(bonus) <= top)
          list.push([
            level + bonus,
            r.costs[s][level],
            prestigeCost(bonus),
            bonus,
          ]);
      }
    return list;
  });
  const floor = ctx.ecoMinimum,
    by = Array.from({ length: size }, () => new Array(top + 1).fill(null));
  for (const e of options[0])
    for (const p of options[1]) {
      const q2 = e[2] + p[2],
        k2 = e[1] + p[1] - floor;
      if (q2 > top || k2 >= size) continue;
      for (const c of options[2]) {
        const q3 = q2 + c[2],
          k3 = k2 + c[1];
        if (q3 > top || k3 >= size) continue;
        for (const m of options[3]) {
          const q = q3 + m[2],
            k = k3 + m[1];
          if (q > top || k >= size) continue;
          const levels = [e[0], p[0], c[0], m[0]];
          const [manager, selfWork, engines, employees] = ecoParts(ctx, levels);
          const coins = manager + selfWork + engines + employees;
          if (by[k][q] === null || coins > by[k][q][0])
            by[k][q] = [coins, levels, [e[3], p[3], c[3], m[3]]];
        }
      }
    }
  const table = []; // the best with at most k points and at most r prestige points
  for (let k = 0; k < size; k++) {
    const row = [];
    for (let q = 0; q <= top; q++) {
      let best = k ? table[k - 1][q] : null;
      for (const entry of [q ? row[q - 1] : null, by[k][q]])
        if (entry !== null && (best === null || entry[0] > best[0]))
          best = entry;
      row.push(best);
    }
    table.push(row);
  }
  return table;
}
// Whole foods a day; for the burst goal one full hunger bar, eaten at the start.
const foodSlots = (ctx, hunger) =>
  ctx.sc.burstOnly
    ? Math.floor(hunger + 1e-9)
    : Math.floor(hunger * ctx.bars + 1e-9);
// Skill points the fighting skills use; with prestige the fewest, every prestige point available to them (fightNeed).
function pointsUsed(ctx, levels) {
  if (ctx.prestiged) return fightNeed(ctx, levels)[ctx.prestige];
  let s = 0;
  for (let i = 0; i < levels.length; i++) s += ctx.costs[i][levels[i]];
  return s;
}
// [the fewest skill points with at most q prestige points, q = 0..prestige] and the picks (twin of _fight_table).
function fightTable(ctx, levels) {
  const top = ctx.prestige,
    picks = [];
  let need = new Array(top + 1).fill(0);
  levels.forEach((level, i) => {
    const name = SKILLS[i],
      costs = ctx.costs[i],
      [lo, hi] = ctx.bounds[name];
    const next = new Array(top + 1).fill(NO_FIT),
      pick = new Array(top + 1).fill(0);
    for (const bonus of ctx.bonusOptions[name]) {
      const base = level - bonus;
      if (base < lo || base > hi) continue;
      const cost = costs[base],
        used = prestigeCost(bonus);
      for (let q = used; q <= top; q++)
        if (need[q - used] + cost < next[q]) {
          next[q] = need[q - used] + cost;
          pick[q] = bonus;
        }
    }
    need = next;
    picks.push(pick);
  });
  return [need, picks];
}
function fightNeed(ctx, levels) {
  const k = levels.join(",");
  let need = ctx.need.get(k);
  if (!need) {
    need = fightTable(ctx, levels)[0];
    ctx.need.set(k, need);
  }
  return need;
}
// With prestige: [coins, levels, bonus levels, prestige points the fighting skills take] of the economy skills, the
// best over how the prestige points are shared (twin of eco_choice).
function ecoChoice(ctx, levels) {
  const key = levels.join(",");
  let found = ctx.ecoChoices.get(key);
  if (!found) {
    const need = fightNeed(ctx, levels),
      top = ctx.prestige;
    found = null;
    for (let q = 0; q <= top; q++) {
      const left = ctx.points - need[q],
        entry = left >= 0 ? ctx.eco[left][top - q] : null;
      if (entry !== null && (found === null || entry[0] > found[0]))
        found = [entry[0], entry[1], entry[2], q];
    }
    if (found === null)
      found = [
        0,
        ECO_ALL.map((s) => ctx.bounds[s][0]),
        ECO_ALL.map(() => 0),
        0,
      ];
    ctx.ecoChoices.set(key, found);
  }
  return found;
}
// Where a split's points go (twin of placement).
function placement(ctx, levels) {
  if (!ctx.prestiged) {
    const used = pointsUsed(ctx, levels),
      [coins, ecoLevels] = ctx.eco[ctx.points - used];
    return {
      fightPoints: used,
      fightBonus: levels.map(() => 0),
      ecoCoins: coins,
      ecoLevels,
      ecoBonus: ECO_ALL.map(() => 0),
      prestigeUsed: 0,
    };
  }
  const [coins, ecoLevels, ecoBonus, q] = ecoChoice(ctx, levels),
    [need, picks] = fightTable(ctx, levels);
  const bonus = levels.map(() => 0);
  let left = q;
  for (let i = levels.length - 1; i >= 0; i--) {
    bonus[i] = picks[i][left];
    left -= prestigeCost(bonus[i]);
  }
  let used = 0;
  for (const b of [...bonus, ...ecoBonus]) used += prestigeCost(b);
  return {
    fightPoints: need[q],
    fightBonus: bonus,
    ecoCoins: coins,
    ecoLevels,
    ecoBonus,
    prestigeUsed: used,
  };
}
function skillValues(ctx, levels) {
  const k = levels.join(",");
  let v = ctx.cache.get(k);
  if (!v) {
    const fight = levels.map((l, i) => ctx.values[i][l]);
    const earned = ctx.prestiged
      ? ecoChoice(ctx, levels)[0]
      : ctx.eco[ctx.points - pointsUsed(ctx, levels)][0];
    v = [...fight, earned, ...nakedDebuff(ctx, fight)];
    ctx.cache.set(k, v);
  }
  return v;
}
// Armour / dodge as the game uses them (warera/battle.py): the rounded percent, .5 up; armour's health a hit cut down
// to 0.1 in floating point, which makes 11 percents cost 0.1 less (user's hits, 2026-10-20).
function softCapPercent(value) {
  return Math.floor((value / (value + SOFT_CAP)) * 100 + 0.5);
}
function armourHealth(armor) {
  return Math.max(
    Math.floor((1 - softCapPercent(armor) / 100) * HEALTH_PER_HIT * 10) / 10,
    1,
  );
}
function dodgeShare(dodge) {
  return softCapPercent(dodge) / 100;
}
// A debuff hit without gear or ammo, from the skills alone: [health a hit, damage a hit, cases a hit].
function nakedDebuff(ctx, fight) {
  const [attackS, precisionS, critS, critDamageS, armorS, dodgeS, , , loot] =
    fight;
  const healthPerHit = armourHealth(armorS) * (1 - dodgeShare(dodgeS));
  const hit = Math.min(precisionS, 100) / 100;
  const critDamage = critDamageS + ctx.critOver * Math.max(critS - 100, 0);
  const attack =
    (attackS + ctx.precOver * Math.max(precisionS - 100, 0)) *
    (1 - PILL_DEBUFF) *
    ctx.rankMult;
  const perHit =
    attack *
    (hit * (1 + ((Math.min(critS, 100) / 100) * critDamage) / 100) +
      (1 - hit) * MISS_FACTOR) *
    ctx.bonusMult;
  return [healthPerHit, perHit, ((hit * loot) / 100) * ctx.caseValue];
}
// One part of the day (the window, the debuff): its hits a food and the food's net cost with them.
// (Kept free of closures and object copies: the search works out millions of days.)
function phase(
  ctx,
  health,
  healthPerHit,
  perHit,
  netPerHit,
  baseHits,
  slots,
  geared,
  casesPerHit,
) {
  const sh = ctx.foodShare,
    fp = ctx.foodPrices;
  const g0 = (health * sh[0]) / healthPerHit,
    g1 = (health * sh[1]) / healthPerHit,
    g2 = (health * sh[2]) / healthPerHit;
  return {
    healthPerHit,
    perHit,
    netPerHit,
    baseHits,
    slots,
    geared,
    casesPerHit,
    gains: [g0, g1, g2],
    costs: [
      fp[0] + g0 * netPerHit,
      fp[1] + g1 * netPerHit,
      fp[2] + g2 * netPerHit,
    ],
  };
}
const cheapestFood = (p) => leastFood(p.slots, p.costs); // the least a part's food can cost
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const NO_FOOD = [0, 0, 0]; // shared: never changed

function poolValue(ctx, damage) {
  // pool loot a day: the table's value at the highest damage point reached
  let lo = 0,
    hi = ctx.poolDamage.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (damage < ctx.poolDamage[mid]) hi = mid;
    else lo = mid + 1;
  }
  return lo ? ctx.poolCoins[lo - 1] : 0;
}
// The fractional plan with the most gain (the plan before 2026-10-16: a corner of the linear programme); whole
// plans can't beat it, so the search screens builds with it (keyAbove). Twin of plan_food_lp.
function planFoodLp(gains, costs, slots, room, oneKind = false) {
  const corners = [[0, 0, 0]];
  for (let j = 0; j < 3; j++) {
    const n = costs[j] <= 0 ? slots : Math.min(slots, room / costs[j]);
    if (n > 0) {
      const p = [0, 0, 0];
      p[j] = n;
      corners.push(p);
    }
  }
  for (const [i, j] of oneKind
    ? []
    : [
        [0, 1],
        [0, 2],
        [1, 2],
      ]) {
    if (costs[i] !== costs[j]) {
      const ni = (room - slots * costs[j]) / (costs[i] - costs[j]);
      if (ni >= 0 && ni <= slots) {
        const p = [0, 0, 0];
        p[i] = ni;
        p[j] = slots - ni;
        corners.push(p);
      }
    }
  }
  let best = null,
    bestGain = -1,
    bestCost = 0;
  for (const p of corners) {
    const cost = p[0] * costs[0] + p[1] * costs[1] + p[2] * costs[2];
    if (cost > room + 1e-9) continue;
    const gain = p[0] * gains[0] + p[1] * gains[1] + p[2] * gains[2];
    if (
      gain > bestGain + 1e-12 ||
      (Math.abs(gain - bestGain) <= 1e-12 && cost < bestCost)
    ) {
      best = p;
      bestGain = gain;
      bestCost = cost;
    }
  }
  return best;
}
// Whole foods a day: every count of cooked fish and steak, from the most that fit down, with as much bread as then
// fits; stops once the rest of the slots can't reach the best plan found (twin of plan_food).
function planFood(gains, costs, slots, room, oneKind = false) {
  const nSlots = Math.trunc(slots),
    limit = room + 1e-9;
  const [g0, g1, g2] = gains,
    [c0, c1, c2] = costs,
    ordered = g0 <= g1 && g1 <= g2;
  let best = null,
    bestGain = -1,
    bestCost = 0;
  const top2 =
    c2 > 0 && c1 >= 0 && c0 >= 0
      ? Math.min(nSlots, Math.floor(limit / c2))
      : nSlots;
  for (let n2 = top2; n2 >= 0; n2--) {
    const left2 = nSlots - n2;
    if (ordered && n2 * g2 + left2 * g1 < bestGain - 1e-12) break;
    const base2 = n2 * c2;
    const top1 =
      oneKind && n2
        ? 0
        : c1 > 0 && c0 >= 0
          ? Math.min(left2, Math.floor((limit - base2) / c1))
          : left2;
    for (let n1 = top1; n1 >= 0; n1--) {
      if (ordered && n2 * g2 + n1 * g1 + (left2 - n1) * g0 < bestGain - 1e-12)
        break;
      const base = base2 + n1 * c1;
      if (base > limit && c0 >= 0) continue;
      const left = left2 - n1;
      const n0 =
        oneKind && (n1 || n2)
          ? 0
          : c0 <= 0
            ? left
            : Math.min(left, Math.floor((limit - base) / c0));
      const cost = base + n0 * c0;
      if (cost > limit) continue;
      const gain = n0 * g0 + n1 * g1 + n2 * g2;
      if (
        gain > bestGain + 1e-12 ||
        (Math.abs(gain - bestGain) <= 1e-12 && cost < bestCost)
      ) {
        best = [n0, n1, n2];
        bestGain = gain;
        bestCost = cost;
      }
    }
  }
  return best;
}

// A build's day: [feasible, damage, net, overspend, details]. With the pill the debuff's hits (16 h of refills: 0.6 of a
// bar beyond the next window's full one, the second MU help and 0.6 of a hunger bar of food, so the day eats as much
// as without the pill) are fought with the window's gear, ammo and food or with none, whichever day is better
// (user, 2026-11-20: a profit build's day with the pill must differ from one without only by the pill), or with the
// set `dset` ({gear, ammo}: the debuff's own equipment, user 2026-11-21; debuffGear searches it).
function day(ctx, v, gear, ammo, planner = planFood, dset = null) {
  const [
    attackS,
    precisionS,
    critS,
    critDamageS,
    armorS,
    dodgeS,
    health,
    hunger,
    loot,
    eco,
    nakedHealth,
    nakedPerHit,
    nakedCases,
  ] = v;
  const [weapon, helmet, chest, pants, boots, gloves] = gear;
  let wAttack = 0,
    wCrit = 0,
    weaponWear = 0;
  if (weapon) {
    wAttack = weapon.stats[0];
    wCrit = weapon.stats[1];
    weaponWear = weapon.wear;
  }
  const precision = precisionS + (gloves ? gloves.stats[0] : 0);
  const crit = critS + wCrit;
  const critDamage =
    critDamageS +
    (helmet ? helmet.stats[0] : 0) +
    ctx.critOver * Math.max(crit - 100, 0);
  const a = ammo || "none";
  const attack =
    (attackS + wAttack + ctx.precOver * Math.max(precision - 100, 0)) *
    ctx.ammoMult[a] *
    ctx.pillMult *
    ctx.rankMult;
  const hit = Math.min(precision, 100) / 100;
  const critShare = Math.min(crit, 100) / 100;
  const perHit =
    attack *
    (hit * (1 + (critShare * critDamage) / 100) + (1 - hit) * MISS_FACTOR) *
    ctx.bonusMult;
  const armor =
    armorS + (chest ? chest.stats[0] : 0) + (pants ? pants.stats[0] : 0);
  const dodge = dodgeS + (boots ? boots.stats[0] : 0);
  const dodged = dodgeShare(dodge);
  const healthPerHit = armourHealth(armor) * (1 - dodged);
  const armourWear =
    (helmet ? helmet.wear : 0) +
    (chest ? chest.wear : 0) +
    (pants ? pants.wear : 0) +
    (boots ? boots.wear : 0) +
    (gloves ? gloves.wear : 0);
  const costPerHit = ctx.ammoPrice[a] + weaponWear + (1 - dodged) * armourWear;
  const casesPerHit = ((hit * loot) / 100) * ctx.caseValue;
  const bountyPerHit = (ctx.bounty * perHit) / 1000;
  const netPerHit = costPerHit - casesPerHit - bountyPerHit;
  const W = phase(
    ctx,
    health,
    healthPerHit,
    perHit,
    netPerHit,
    (health * ctx.bars + ctx.helpHealth) / healthPerHit,
    foodSlots(ctx, hunger),
    true,
    casesPerHit,
  );
  const short = ctx.sc.fullPrecision && precision < 100; // at least 100% precision: a build that can miss is out
  const base = {
    perHit,
    healthPerHit,
    attack,
    precision,
    crit,
    critDamage,
    armor,
    dodge,
    dodged,
    slots: W.slots,
    netPerHit,
    casesPerHit,
    bountyPerHit,
    baseHits: W.baseHits,
    gains: W.gains,
    health,
    hunger,
    loot,
    eco,
  };
  if (!ctx.debuff) return dayWith(ctx, W, null, planner, short, base);
  const debuffHealth = health * ctx.debuffBars + ctx.debuffHelp;
  // the simple page's debuff (user, 2026-11-21): no gear and no food, so only the bar's own refills and the MU help
  const debuffSlots =
    ctx.sc.burstOnly || ctx.debuffBare
      ? 0
      : Math.floor(hunger * (ctx.bars + ctx.debuffBars) + 1e-9) -
        Math.floor(hunger * ctx.bars + 1e-9);
  if (ctx.debuffBare) dset = BARE_SET;
  if (dset)
    return dayWith(
      ctx,
      W,
      setPhase(ctx, v, dset, debuffHealth, debuffSlots),
      planner,
      short,
      base,
    );
  const gearedPerHit = perHit * ctx.debuffRatio;
  const geared = phase(
    ctx,
    health,
    healthPerHit,
    gearedPerHit,
    costPerHit - casesPerHit - (ctx.bounty * gearedPerHit) / 1000,
    debuffHealth / healthPerHit,
    debuffSlots,
    true,
    casesPerHit,
  );
  const naked = phase(
    ctx,
    health,
    nakedHealth,
    nakedPerHit,
    -nakedCases - (ctx.bounty * nakedPerHit) / 1000,
    debuffHealth / nakedHealth,
    debuffSlots,
    false,
    nakedCases,
  );
  if (planner !== planFood) {
    // the fractional plan, or the sandbox's food: both ways
    const withGear = dayWith(ctx, W, geared, planner, short, base),
      without = dayWith(ctx, W, naked, planner, short, base);
    return keyGt(keyOf(without), keyOf(withGear)) ? without : withGear;
  }
  // Whole foods: the way with the better fractional bound first, the other only when its bound beats that day.
  const boundGeared = keyOf(dayWith(ctx, W, geared, planFoodLp, short, base));
  const boundNaked = keyOf(dayWith(ctx, W, naked, planFoodLp, short, base));
  const nakedFirst = keyGt(boundNaked, boundGeared),
    first = nakedFirst ? naked : geared,
    second = nakedFirst ? geared : naked;
  const one = dayWith(ctx, W, first, planFood, short, base);
  if (!keyGt(nakedFirst ? boundGeared : boundNaked, keyOf(one))) return one;
  const other = dayWith(ctx, W, second, planFood, short, base);
  return keyGt(keyOf(other), keyOf(one)) ? other : one;
}
// The debuff's part fought with the set {gear, ammo}: the window's hit (day) at -60% attack without the pill's bonus.
function setPhase(ctx, v, dset, debuffHealth, slots) {
  const [
    attackS,
    precisionS,
    critS,
    critDamageS,
    armorS,
    dodgeS,
    health,
    ,
    loot,
  ] = v;
  const [weapon, helmet, chest, pants, boots, gloves] = dset.gear;
  let wAttack = 0,
    wCrit = 0,
    weaponWear = 0;
  if (weapon) {
    wAttack = weapon.stats[0];
    wCrit = weapon.stats[1];
    weaponWear = weapon.wear;
  }
  const precision = precisionS + (gloves ? gloves.stats[0] : 0);
  const crit = critS + wCrit;
  const critDamage =
    critDamageS +
    (helmet ? helmet.stats[0] : 0) +
    ctx.critOver * Math.max(crit - 100, 0);
  const a = dset.ammo || "none";
  const attack =
    (attackS + wAttack + ctx.precOver * Math.max(precision - 100, 0)) *
    ctx.ammoMult[a] *
    (1 - PILL_DEBUFF) *
    ctx.rankMult;
  const hit = Math.min(precision, 100) / 100;
  const perHit =
    attack *
    (hit * (1 + ((Math.min(crit, 100) / 100) * critDamage) / 100) +
      (1 - hit) * MISS_FACTOR) *
    ctx.bonusMult;
  const armor =
    armorS + (chest ? chest.stats[0] : 0) + (pants ? pants.stats[0] : 0);
  const dodged = dodgeShare(dodgeS + (boots ? boots.stats[0] : 0));
  const healthPerHit = armourHealth(armor) * (1 - dodged);
  const armourWear =
    (helmet ? helmet.wear : 0) +
    (chest ? chest.wear : 0) +
    (pants ? pants.wear : 0) +
    (boots ? boots.wear : 0) +
    (gloves ? gloves.wear : 0);
  const costPerHit = ctx.ammoPrice[a] + weaponWear + (1 - dodged) * armourWear;
  const casesPerHit = ((hit * loot) / 100) * ctx.caseValue;
  const p = phase(
    ctx,
    health,
    healthPerHit,
    perHit,
    costPerHit - casesPerHit - (ctx.bounty * perHit) / 1000,
    debuffHealth / healthPerHit,
    slots,
    true,
    casesPerHit,
  );
  p.set = dset;
  p.dodged = dodged;
  return p;
}
// The day of the window W and the debuff D (null: no hits in it). The food goes to the window first: it gets the room
// less the least the debuff's food can cost, the debuff what the window leaves (the fractional plan, a bound for the
// search's screen: the room less the least the window's food can cost).
// [feasible, value, net, overspend, the window's details (shared by both ways), its food, pool loot, D, D's food].
function dayWith(ctx, W, D, planner, short, base) {
  const room =
    ctx.budget +
    base.eco -
    ctx.fixed -
    W.baseHits * W.netPerHit -
    (D ? D.baseHits * D.netPerHit : 0);
  let p = foodPlans(ctx, W, D, planner, room),
    pool = 0;
  if (ctx.poolDamage.length) {
    // pool loot buys food, which adds damage and loot: repeat while it grows
    for (let n = 0; n < POOL_ROUNDS; n++) {
      const coins = poolValue(
        ctx,
        (W.baseHits + (p ? dot3(p[0], W.gains) : 0)) * W.perHit +
          (D ? (D.baseHits + (p ? dot3(p[1], D.gains) : 0)) * D.perHit : 0),
      );
      if (coins <= pool) break;
      pool = coins;
      p = foodPlans(ctx, W, D, planner, room + pool);
    }
  }
  if (!p || short) {
    let overspend = !p
      ? cheapestFood(W) + (D ? cheapestFood(D) : 0) - (room + pool)
      : 0;
    if (short)
      overspend =
        Math.max(overspend, 0) + PRECISION_PENALTY * (1 + 100 - base.precision);
    return [
      false,
      0,
      ctx.budget + base.eco + overspend,
      overspend,
      base,
      null,
      pool,
      D,
      null,
    ];
  }
  const pw = p[0],
    pd = p[1],
    fp = ctx.foodPrices,
    foodGain = dot3(pw, W.gains),
    hits = W.baseHits + foodGain;
  const debuffHits = D ? D.baseHits + dot3(pd, D.gains) : 0;
  const net =
    ctx.fixed +
    dot3(pw, fp) +
    hits * W.netPerHit +
    (D ? dot3(pd, fp) + debuffHits * D.netPerHit : 0) -
    pool;
  // The objective: the day's damage, or for the burst goal the first session's (full health bar and all the food).
  const value = ctx.sc.burstOnly
    ? (base.health / W.healthPerHit + foodGain) * W.perHit
    : hits * W.perHit + (D ? debuffHits * D.perHit : 0);
  return [true, value, net, 0, base, pw, pool, D, pd];
}
// [the window's food, the debuff's] for the room, or null when none fits. With one kind of food only and food in the
// debuff: each kind for both parts, the one with the most damage (then the lowest cost).
function foodPlans(ctx, W, D, planner, room) {
  const oneKind = ctx.sc.oneFood;
  if (!D) {
    const pw = planner(W.gains, W.costs, W.slots, room, oneKind);
    return pw ? [pw, NO_FOOD] : null;
  }
  if (!oneKind || !D.slots)
    return foodPair(W, D, planner, room, W.costs, D.costs, oneKind);
  let best = null,
    bestValue = 0,
    bestCost = 0;
  for (let k = 0; k < 3; k++) {
    const wc = onlyKind(W.costs, k),
      dc = onlyKind(D.costs, k),
      p = foodPair(W, D, planner, room, wc, dc, false);
    if (!p) continue;
    const value =
        dot3(p[0], W.gains) * W.perHit + dot3(p[1], D.gains) * D.perHit,
      cost = dot3(p[0], wc) + dot3(p[1], dc);
    if (
      !best ||
      value > bestValue + 1e-9 ||
      (Math.abs(value - bestValue) <= 1e-9 && cost < bestCost)
    ) {
      best = p;
      bestValue = value;
      bestCost = cost;
    }
  }
  return best;
}
const onlyKind = (costs, k) => [
  k === 0 ? costs[0] : FOOD_LEFT_OUT,
  k === 1 ? costs[1] : FOOD_LEFT_OUT,
  k === 2 ? costs[2] : FOOD_LEFT_OUT,
];
const leastFood = (slots, costs) =>
  slots * Math.min(costs[0], costs[1], costs[2], 0);
// The window's food from the room less the least the debuff's can cost, then the debuff's from what it leaves (the
// fractional plan: the room less the least the window's can cost, so the pair stays a bound for the search's screen).
function foodPair(W, D, planner, room, wCosts, dCosts, oneKind) {
  const pw = planner(
    W.gains,
    wCosts,
    W.slots,
    room - leastFood(D.slots, dCosts),
    oneKind,
  );
  if (!pw) return null;
  if (!D.slots) return [pw, NO_FOOD];
  const pd = planner(
    D.gains,
    dCosts,
    D.slots,
    room -
      (planner === planFoodLp ? leastFood(W.slots, wCosts) : dot3(pw, wCosts)),
    oneKind,
  );
  return pd ? [pw, pd] : null;
}
const keyOf = (d) => (d[0] ? [1, d[1], -d[2]] : [0, -d[3], 0]);
const keyGt = (a, b) =>
  a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
// A build's key when it's above `bound`, else one no higher (the fractional food plan screens it first; twin of _key_above).
function keyAbove(ctx, v, gear, ammo, bound, dset = null) {
  const key = keyOf(day(ctx, v, gear, ammo, planFoodLp, dset));
  return keyGt(key, bound)
    ? keyOf(day(ctx, v, gear, ammo, planFood, dset))
    : key;
}
const NO_GEAR = SLOTS.map(() => null),
  BARE_SET = { gear: NO_GEAR, ammo: null };
const sameItem = (a, b) =>
  a === b ||
  (!!a &&
    !!b &&
    a.code === b.code &&
    a.quality === b.quality &&
    a.stats.join() === b.stats.join());
// The debuff's equipment as a set: "same" (the window's), "none" or "own" (twin-free: the website only).
function setKind(set, gear, ammo) {
  if (
    set.gear.every((g, i) => sameItem(g, gear[i])) &&
    (set.ammo || null) === (ammo || null)
  )
    return "same";
  return set.gear.every((g) => !g) ? "none" : "own";
}

function evaluate(ctx, b, planner = planFood) {
  // planner: the page's Sandbox only (a food set by hand)
  const v = skillValues(ctx, b.skills),
    d = day(ctx, v, b.gear, b.ammo, planner, b.dset),
    D = d[7];
  const x = Object.assign({}, d[4], {
    plan: d[5],
    pool: d[6],
    slots: d[4].slots + (D ? D.slots : 0),
    debuff: null,
  });
  if (D) {
    const plan = d[8] || NO_FOOD,
      hits = D.baseHits + dot3(plan, D.gains);
    const set =
      D.set ||
      (D.geared
        ? { gear: b.gear, ammo: b.ammo }
        : { gear: NO_GEAR, ammo: null });
    x.debuff = {
      geared: D.geared,
      plan,
      slots: D.slots,
      hits,
      damage: hits * D.perHit,
      perHit: D.perHit,
      healthPerHit: D.healthPerHit,
      netPerHit: D.netPerHit,
      casesPerHit: D.casesPerHit,
      bountyPerHit: (ctx.bounty * D.perHit) / 1000,
      set,
      dodged: D.set ? D.dodged : x.dodged,
      kind: setKind(set, b.gear, b.ammo),
    };
  }
  x.place = placement(ctx, b.skills);
  x.ecoLevels = x.place.ecoLevels;
  const out = {
    feasible: d[0],
    damage: d[1],
    net: d[2],
    overspend: d[3],
    perHit: x.perHit,
    healthPerHit: x.healthPerHit,
    x,
  };
  if (!d[0]) return Object.assign(out, { hits: 0, foods: [0, 0, 0] });
  const hits = x.baseHits + dot3(x.plan, x.gains),
    dd = x.debuff;
  const debuffHits = dd ? dd.hits : 0,
    debuffDamage = dd ? dd.damage : 0;
  out.damage = hits * x.perHit + debuffDamage;
  // What a set uses a day: wear, items used up (HITS_PER_ITEM hits that wear each) and ammo (one a hit). The window's
  // set in ammo / wear / items, the debuff's in debuffSet (each part's own hits, also when it's the same set).
  const use = (gear, ammo, n, dodged) => {
    const wear = {},
      items = {};
    gear.forEach((g, i) => {
      if (g) {
        wear[SLOTS[i]] = n * (i === 0 ? g.wear : (1 - dodged) * g.wear);
        items[SLOTS[i]] = (n * (i === 0 ? 1 : 1 - dodged)) / HITS_PER_ITEM;
      }
    });
    return {
      wear,
      items,
      ammo: ammo ? n * ctx.ammoPrice[ammo] : 0,
      ammoUnits: ammo ? n : 0,
    };
  };
  const mine = use(b.gear, b.ammo, hits, x.dodged);
  const debuffSet = dd
    ? Object.assign(
        {
          gear: dd.set.gear,
          ammoCode: dd.set.ammo || null,
          kind: dd.kind,
          foods: dd.plan,
        },
        use(dd.set.gear, dd.set.ammo, debuffHits, dd.dodged),
      )
    : null;
  const burst = burstHits(
    ctx,
    x.health,
    x.hunger,
    x.plan,
    x.gains,
    x.healthPerHit,
  );
  const foods = dd ? x.plan.map((n, j) => n + dd.plan[j]) : x.plan;
  return Object.assign(out, {
    hits,
    foods,
    parts: {
      ammo: mine.ammo,
      wear: mine.wear,
      items: mine.items,
      debuffSet,
      ammoUnits: mine.ammoUnits,
      food: dot3(foods, ctx.foodPrices),
      pill: ctx.fixed,
      cases: hits * x.casesPerHit,
      bounty: hits * x.bountyPerHit,
      pool: x.pool,
      burstHits: burst,
      burstDamage: burst * x.perHit,
      objective: d[1],
      debuffHits,
      debuffDamage,
      debuffGeared: !!dd && dd.kind !== "none",
      debuffFoods: dd ? dd.plan : [0, 0, 0],
      debuffCases: debuffHits * (dd ? dd.casesPerHit : 0),
      debuffBounty: debuffHits * (dd ? dd.bountyPerHit : 0),
    },
  });
}
// Hits at the window's start: the full health bar and a full hunger bar of the planned food, the best food first.
function burstHits(ctx, health, hunger, plan, gains, healthPerHit) {
  if (!ctx.sc.pill) return 0;
  let hits = health / healthPerHit,
    left = hunger;
  for (const j of [2, 1, 0]) {
    const eaten = Math.min(plan[j], left);
    hits += eaten * gains[j];
    left -= eaten;
  }
  return hits;
}

// ---- The search (twin of warera/battle.py) ------------------------------------------------------------------------
function cmpStatsDesc(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return b[i] - a[i];
  return 0;
}
function cmpStatsAsc(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}
function prune(options) {
  const ordered = options
    .slice()
    .sort(
      (a, b) =>
        a.wear - b.wear ||
        cmpStatsDesc(a.stats, b.stats) ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
  const kept = [];
  for (const o of ordered) {
    const group = NO_AMMO.includes(o.code);
    if (
      !kept.some(
        (k) =>
          NO_AMMO.includes(k.code) === group &&
          k.wear <= o.wear &&
          k.stats.every((s, i) => s >= o.stats[i]),
      )
    )
      kept.push(o);
  }
  return kept;
}
function choicesFrom(gear, qualities) {
  const bySlot = {};
  for (const s of SLOTS)
    bySlot[s] = gear.filter((g) => g.slot === s && qualities.has(g.quality));
  const weapons = [[null, null]];
  for (const g of prune(bySlot.weapon)) {
    if (NO_AMMO.includes(g.code)) weapons.push([g, null]);
    else for (const a of AMMO) weapons.push([g, a]);
  }
  const lists = [weapons];
  for (const s of SLOTS.slice(1)) {
    const items =
      s === "helmet" || s === "gloves" ? prune(bySlot[s]) : bySlot[s];
    lists.push([
      null,
      ...items
        .slice()
        .sort(
          (a, b) =>
            a.quality - b.quality ||
            cmpStatsAsc(a.stats, b.stats) ||
            a.wear - b.wear,
        ),
    ]);
  }
  return lists;
}
const mk = (ctx, skills, gear, ammo) => ({
  skills,
  gear,
  ammo,
  key: keyOf(day(ctx, skillValues(ctx, skills), gear, ammo)),
});
const better = (a, b) => !b || keyGt(a.key, b.key);
function withChoice(gear, ammo, index, choice) {
  if (index === 0) return [[choice[0], ...gear.slice(1)], choice[1]];
  const g = gear.slice();
  g[index] = choice;
  return [g, ammo];
}
const sameChoice = (index, a, b) =>
  index === 0 ? a[0] === b[0] && a[1] === b[1] : a === b;
const currentOf = (b, index) =>
  index === 0 ? [b.gear[0], b.ammo] : b.gear[index];

// Positions of the (weapon, ammo) choices no other one beats with this helmet and these gloves: the most damage a hit
// for its coins a hit (ammo + weapon wear), in list order (twin of battle.py weapon_frontier).
function weaponFrontier(ctx, v, helmet, gloves, weapons) {
  const [attackS, precisionS, critS, critDamageS] = v;
  const precision = precisionS + (gloves ? gloves.stats[0] : 0);
  const hit = Math.min(precision, 100) / 100;
  const overflow = ctx.precOver * Math.max(precision - 100, 0);
  const helmetStat = helmet ? helmet.stats[0] : 0;
  const scored = weapons.map(([weapon, ammo], order) => {
    let wAttack = 0,
      wCrit = 0,
      weaponWear = 0;
    if (weapon) {
      wAttack = weapon.stats[0];
      wCrit = weapon.stats[1];
      weaponWear = weapon.wear;
    }
    const crit = critS + wCrit,
      a = ammo || "none";
    const critDamage =
      critDamageS + helmetStat + ctx.critOver * Math.max(crit - 100, 0);
    const attack =
      (attackS + wAttack + overflow) *
      ctx.ammoMult[a] *
      ctx.pillMult *
      ctx.rankMult;
    const perHit =
      attack *
      (hit * (1 + ((Math.min(crit, 100) / 100) * critDamage) / 100) +
        (1 - hit) * MISS_FACTOR);
    return [ctx.ammoPrice[a] + weaponWear, -perHit, order];
  });
  scored.sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const kept = [];
  let top = null;
  for (const [, minus, order] of scored)
    if (top === null || -minus > top) {
      kept.push(order);
      top = -minus;
    }
  return kept.sort((x, y) => x - y);
}
function gearPass(ctx, lists, b) {
  const v = skillValues(ctx, b.skills);
  for (;;) {
    let changed = false;
    lists.forEach((options, index) => {
      if (index === 0)
        options = weaponFrontier(ctx, v, b.gear[1], b.gear[5], options).map(
          (k) => options[k],
        );
      let current = currentOf(b, index);
      for (const choice of options) {
        if (sameChoice(index, choice, current)) continue;
        const [gear, ammo] = withChoice(b.gear, b.ammo, index, choice);
        const key = keyAbove(ctx, v, gear, ammo, b.key, b.dset);
        if (keyGt(key, b.key)) {
          b = { skills: b.skills, gear, ammo, dset: b.dset, key };
          current = choice;
          changed = true;
        }
      }
    });
    if (!changed) return b;
  }
}
// The debuff's own set (user, 2026-11-21: "the other set to wear during the debuff phase"): from the window's set and
// from none, each slot's choice in turn for the debuff alone, then the window's gear again with that set, until neither
// changes; kept only when the day beats the better of the window's set and none (the build's key).
function debuffGear(ctx, lists, b) {
  if (!ctx.debuff || ctx.debuffBare) return b;
  const v = skillValues(ctx, b.skills);
  let best = b;
  for (const set of [
    { gear: b.gear, ammo: b.ammo },
    { gear: NO_GEAR, ammo: null },
  ]) {
    let c = {
      skills: b.skills,
      gear: b.gear,
      ammo: b.ammo,
      dset: set,
      key: keyOf(day(ctx, v, b.gear, b.ammo, planFood, set)),
    };
    for (;;) {
      const before = c.key;
      c = gearPass(ctx, lists, debuffPass(ctx, lists, c, v));
      if (!keyGt(c.key, before)) break;
    }
    if (better(c, best)) best = c;
  }
  return best;
}
function debuffPass(ctx, lists, c, v) {
  for (;;) {
    let changed = false;
    lists.forEach((options, index) => {
      if (index === 0)
        options = weaponFrontier(
          ctx,
          v,
          c.dset.gear[1],
          c.dset.gear[5],
          options,
        ).map((k) => options[k]);
      let current = currentOf(c.dset, index);
      for (const choice of options) {
        if (sameChoice(index, choice, current)) continue;
        const [gear, ammo] = withChoice(
            c.dset.gear,
            c.dset.ammo,
            index,
            choice,
          ),
          dset = { gear, ammo };
        const key = keyAbove(ctx, v, c.gear, c.ammo, c.key, dset);
        if (keyGt(key, c.key)) {
          c = { skills: c.skills, gear: c.gear, ammo: c.ammo, dset, key };
          current = choice;
          changed = true;
        }
      }
    });
    if (!changed) return c;
  }
}
function gearPairs(ctx, lists, b) {
  const v = skillValues(ctx, b.skills),
    weapons = lists[0];
  const frontier = new Set(
    weaponFrontier(ctx, v, b.gear[1], b.gear[5], weapons),
  );
  let best = b;
  for (let i = 0; i < lists.length; i++)
    for (let j = i + 1; j < lists.length; j++) {
      const allowed =
        i === 0 && (j === 1 || j === 5) // helmet or gloves: a frontier for each of their choices
          ? lists[j].map(
              (second) =>
                new Set(
                  weaponFrontier(
                    ctx,
                    v,
                    j === 1 ? second : b.gear[1],
                    j === 5 ? second : b.gear[5],
                    weapons,
                  ),
                ),
            )
          : null;
      for (let order = 0; order < lists[i].length; order++) {
        if (i === 0 && !allowed && !frontier.has(order)) continue;
        const first = lists[i][order];
        const [gi, ai] = withChoice(b.gear, b.ammo, i, first);
        for (let k = 0; k < lists[j].length; k++) {
          if (allowed && !allowed[k].has(order)) continue;
          const second = lists[j][k];
          const [gear, ammo] = withChoice(gi, ai, j, second);
          const key = keyAbove(ctx, v, gear, ammo, best.key);
          if (keyGt(key, best.key))
            best = { skills: b.skills, gear, ammo, key };
        }
      }
    }
  return best;
}
const STEPS = (() => {
  const s = [[]];
  for (let i = 0; i < SKILLS.length; i++)
    for (const n of [1, 2]) s.push([[i, n]]);
  for (let i = 0; i < SKILLS.length; i++)
    for (let k = i + 1; k < SKILLS.length; k++)
      s.push([
        [i, 1],
        [k, 1],
      ]);
  return s;
})();
const DELTAS = (() => {
  const d = [];
  for (const down of STEPS) {
    const touched = new Set(down.map((x) => x[0]));
    for (const up of STEPS) {
      if ((down.length || up.length) && !up.some((x) => touched.has(x[0])))
        d.push([...down.map(([i, n]) => [i, -n]), ...up]);
    }
  }
  return d;
})();
function skillMoves(ctx, skills) {
  const moves = [];
  if (ctx.prestiged) {
    // with prestige each split's points are its fewest (pointsUsed)
    for (const delta of DELTAS) {
      const levels = skills.slice();
      let ok = true;
      for (const [i, change] of delta) {
        levels[i] += change;
        if (levels[i] < ctx.minLevel[i] || levels[i] > ctx.maxLevel[i]) {
          ok = false;
          break;
        }
      }
      if (ok && pointsUsed(ctx, levels) <= ctx.points) moves.push(levels);
    }
    return moves;
  }
  const used = pointsUsed(ctx, skills);
  for (const delta of DELTAS) {
    let extra = 0,
      ok = true;
    for (const [i, change] of delta) {
      const level = skills[i] + change;
      if (level < ctx.minLevel[i] || level > ctx.maxLevel[i]) {
        ok = false;
        break;
      }
      extra += ctx.costs[i][level] - ctx.costs[i][skills[i]];
    }
    if (ok && used + extra <= ctx.points) {
      const levels = skills.slice();
      for (const [i, change] of delta) levels[i] += change;
      moves.push(levels);
    }
  }
  return moves;
}
// The skill moves' builds with the best keys, best first: every one above the DEEP_MOVES-th (twin of _top_moves).
function topMoves(ctx, b) {
  const screened = skillMoves(ctx, b.skills).map((s, order) => ({
    key: keyOf(day(ctx, skillValues(ctx, s), b.gear, b.ammo, planFoodLp)),
    order,
    s,
  }));
  const cmp = (x, y) =>
    keyGt(x.key, y.key) ? -1 : keyGt(y.key, x.key) ? 1 : x.order - y.order;
  screened.sort(cmp);
  const scored = [];
  for (const c of screened) {
    if (scored.length >= DEEP_MOVES && keyGt(scored[DEEP_MOVES - 1].key, c.key))
      break;
    const m = mk(ctx, c.s, b.gear, b.ammo);
    scored.push({ key: m.key, order: c.order, b: m });
    scored.sort(cmp);
  }
  return scored.map((x) => x.b);
}
function improve(ctx, lists, b, fixed) {
  for (;;) {
    b = gearPass(ctx, lists, b);
    if (!fixed) {
      const scored = topMoves(ctx, b);
      if (scored.length && better(scored[0], b)) {
        b = scored[0];
        continue;
      }
      let deep = null;
      for (const c of scored.slice(0, DEEP_MOVES)) {
        const g = gearPass(ctx, lists, c);
        if (better(g, deep)) deep = g;
      }
      if (deep && better(deep, b)) {
        b = deep;
        continue;
      }
    }
    const paired = gearPairs(ctx, lists, b);
    if (better(paired, b)) {
      b = paired;
      continue;
    }
    return b;
  }
}
function climb(ctx, lists, b) {
  for (;;) {
    let best = null;
    for (const s of skillMoves(ctx, b.skills)) {
      // the best move above the build (screened: keyAbove)
      const key = keyAbove(
        ctx,
        skillValues(ctx, s),
        b.gear,
        b.ammo,
        best ? best.key : b.key,
      );
      if (keyGt(key, best ? best.key : b.key))
        best = { skills: s, gear: b.gear, ammo: b.ammo, key };
    }
    if (best && better(best, b)) {
      b = best;
      continue;
    }
    const passed = gearPass(ctx, lists, b);
    if (!better(passed, b)) return b;
    b = passed;
  }
}
function deepGear(ctx, lists, b) {
  const v = skillValues(ctx, b.skills),
    cands = [];
  lists.forEach((options, index) => {
    const current = currentOf(b, index);
    for (const choice of options) {
      if (sameChoice(index, choice, current)) continue;
      const [gear, ammo] = withChoice(b.gear, b.ammo, index, choice);
      const d = day(ctx, v, gear, ammo);
      cands.push({
        potential: d[4].baseHits * d[4].perHit,
        order: cands.length,
        b: { skills: b.skills, gear, ammo, key: keyOf(d) },
      });
    }
  });
  cands.sort((x, y) => y.potential - x.potential || x.order - y.order);
  let best = null;
  for (const c of cands.slice(0, DEEP_MOVES)) {
    const r = climb(ctx, lists, c.b);
    if (better(r, best)) best = r;
  }
  return best || b;
}
// The build's skill split with its gear chosen again from nothing, then the local search from there (twin of _regear).
function regear(ctx, lists, b) {
  const empty = SLOTS.map(() => null);
  for (;;) {
    const fresh = improve(ctx, lists, mk(ctx, b.skills, empty, null), true);
    if (!better(fresh, b)) return b;
    b = improve(ctx, lists, fresh, false);
  }
}
function fill(ctx, skills, order, cap = null) {
  const limit = cap === null ? ctx.points : Math.min(cap, ctx.points);
  skills = skills.slice();
  for (;;) {
    let raised = false;
    for (const i of order) {
      const level = skills[i] + 1;
      if (
        level <= ctx.maxLevel[i] &&
        pointsUsed(ctx, [
          ...skills.slice(0, i),
          level,
          ...skills.slice(i + 1),
        ]) <= limit
      ) {
        skills[i] = level;
        raised = true;
      }
    }
    if (!raised) return skills;
  }
}
function seedSkills(ctx) {
  const every = SKILLS.map((_, i) => i),
    zero = ctx.minLevel.slice();
  const seeds = [fill(ctx, zero, every)];
  for (const first of [[0, 1, 2, 3], [4, 5, 6, 7], [8]])
    seeds.push(fill(ctx, fill(ctx, zero, first), every));
  for (const quarters of [1, 2, 3])
    seeds.push(fill(ctx, zero, every, Math.floor((ctx.points * quarters) / 4)));
  const unique = [];
  for (const s of seeds)
    if (!unique.some((u) => u.join() === s.join())) unique.push(s);
  return unique;
}
const EXTRA_SEEDS = 12,
  RANDOM_SEED = 20261013;
function randomSeeds(ctx, count) {
  let state = RANDOM_SEED;
  const seeds = [];
  for (let k = 0; k < count; k++) {
    const order = SKILLS.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      state = (state * 48271) % 2147483647;
      const j = state % (i + 1);
      [order[i], order[j]] = [order[j], order[i]];
    }
    state = (state * 48271) % 2147483647;
    const first = order.slice(0, 1 + (state % 4));
    seeds.push(fill(ctx, fill(ctx, ctx.minLevel.slice(), first), order));
  }
  return seeds;
}
const fits = (ctx, skills) =>
  skills.length === SKILLS.length &&
  skills.every((l, i) => l >= ctx.minLevel[i] && l <= ctx.maxLevel[i]) &&
  pointsUsed(ctx, skills) <= ctx.points;
function optimise(ctx, lists, skills, extraSeeds = 0, starts = []) {
  const empty = SLOTS.map(() => null);
  let best = null;
  const seeds = [];
  for (const seed of skills
    ? [skills.slice()]
    : [
        ...seedSkills(ctx),
        ...randomSeeds(ctx, extraSeeds),
        ...starts.map((s) => s.slice()),
      ]) {
    if (!seeds.some((s) => s.join() === seed.join()) && fits(ctx, seed))
      seeds.push(seed);
  }
  if (!seeds.length)
    throw new Error("no skill split fits the limits and the level's points");
  const results = [];
  seeds.forEach((seed, done) => {
    if (globalThis.searchProgress) searchProgress(done, seeds.length); // the website's progress bar (no effect on the search)
    const b = improve(ctx, lists, mk(ctx, seed, empty, null), !!skills);
    results.push(b);
    if (better(b, best)) best = b;
  });
  if (!skills) {
    // the best REGEAR_SPLITS skill splits' gear chosen again (regear)
    const splits = []; // a stable sort: equal keys in seed order, as Python's
    for (const b of results
      .slice()
      .sort((x, y) =>
        keyGt(y.key, x.key) ? 1 : keyGt(x.key, y.key) ? -1 : 0,
      )) {
      if (!splits.some((s) => s.skills.join() === b.skills.join()))
        splits.push(b);
    }
    for (const b of splits.slice(0, REGEAR_SPLITS)) {
      const r = regear(ctx, lists, b);
      if (better(r, best)) best = r;
    }
  }
  while (!skills) {
    const deep = deepGear(ctx, lists, best);
    if (!better(deep, best)) break;
    best = improve(ctx, lists, deep, false);
  }
  best = debuffGear(ctx, lists, best);
  best.out = evaluate(ctx, best);
  return best;
}
// One search job, in the worker or on the page: the goal's build and the wealth to lose a day it needs (null build:
// the target is out of reach). Profit and target goals search the budget (cheapest); the others take the job's.
function runJob(job, P, lists) {
  if (job.goal === "profit" || job.goal === "target") {
    const found = cheapest(
      (w) => makeCtx({ ...job.sc, budget: w + job.income }, P),
      lists,
      job.goal === "target" ? job.target : null,
      job.skills,
      job.extra,
      job.starts,
    );
    if (!found) return { id: job.id, none: true };
    return {
      id: job.id,
      skills: found[1].skills,
      gear: found[1].gear,
      ammo: found[1].ammo,
      dset: found[1].dset || null,
      wealth: found[0],
    };
  }
  const b = optimise(
    makeCtx(job.sc, P),
    lists,
    job.skills,
    job.extra,
    job.starts,
  );
  return {
    id: job.id,
    skills: b.skills,
    gear: b.gear,
    ammo: b.ammo,
    dset: b.dset || null,
    wealth: job.sc.budget - job.income,
  };
}
// The goals beyond the most damage for a budget (twin of cheapest): the lowest wealth to lose a day whose best build is
// within the budget (target null: the most profit) and does at least `target` damage. [wealth, build] or null.
const GOAL_STEP = 100,
  GOAL_TOLERANCE = 1,
  GOAL_SHARE = 0.01,
  GOAL_LIMIT = 1e6,
  GOAL_FALSI_STEPS = 12,
  GOAL_OVERSHOOT = 1.5;
const goalMet = (b, target) =>
  !!b &&
  b.out.feasible &&
  (target === null || b.out.parts.objective >= target - 1e-6);
function cheapest(ctxFor, lists, target, skills, extraSeeds = 0, starts = []) {
  const run = (wealth, seeds = 0) => {
    try {
      return optimise(ctxFor(wealth), lists, skills, seeds, starts);
    } catch (e) {
      return null;
    }
  };
  const value = (b) => (b && b.out.feasible ? b.out.parts.objective : null);
  let found,
    low = null,
    high = null,
    lowBuild = null;
  if (target === null) {
    const probe = run(-GOAL_LIMIT, extraSeeds);
    if (!probe) return null;
    if (probe.out.feasible) return [-GOAL_LIMIT, probe];
    const wealth = -GOAL_LIMIT + probe.out.overspend + 1e-6;
    found = run(wealth, extraSeeds);
    if (goalMet(found, null)) return [wealth, found];
    low = wealth;
  } else {
    found = run(0);
    if (goalMet(found, target)) {
      high = 0;
      let step = GOAL_STEP;
      while (low === null) {
        const wealth = high - step,
          b = run(wealth);
        if (goalMet(b, target) && wealth > -GOAL_LIMIT) {
          high = wealth;
          found = b;
          step *= 2;
        } else {
          low = wealth;
          lowBuild = b;
        }
      }
    } else {
      low = 0;
      lowBuild = found;
    }
  }
  if (high === null) {
    // upwards: by the damage's slope so far (with GOAL_OVERSHOOT), else doubling
    let step = GOAL_STEP;
    for (;;) {
      if (low >= GOAL_LIMIT) return null;
      const wealth = Math.min(low + step, GOAL_LIMIT),
        b = run(wealth);
      if (goalMet(b, target)) {
        high = wealth;
        found = b;
        break;
      }
      const vLow = value(lowBuild),
        v = value(b);
      if (target !== null && vLow !== null && v !== null && v > vLow)
        step = Math.max(
          ((target - v) / ((v - vLow) / (wealth - low))) * GOAL_OVERSHOOT,
          GOAL_STEP,
        );
      else step *= 2;
      low = wealth;
      lowBuild = b;
    }
  }
  // Regula falsi within the bracket (Illinois), at least half a tolerance inside; halving otherwise (twin of cheapest).
  let fLow =
    target !== null && value(lowBuild) !== null
      ? value(lowBuild) - target
      : null;
  let fHigh = target !== null ? value(found) - target : null;
  let side = 0,
    steps = 0;
  while (high - low > Math.max(GOAL_TOLERANCE, GOAL_SHARE * Math.abs(high))) {
    steps += 1;
    let wealth;
    if (
      fLow !== null &&
      fHigh !== null &&
      fHigh > fLow &&
      steps <= GOAL_FALSI_STEPS
    ) {
      wealth = (low * fHigh - high * fLow) / (fHigh - fLow);
      wealth = Math.min(
        Math.max(wealth, low + GOAL_TOLERANCE / 2),
        high - GOAL_TOLERANCE / 2,
      );
    } else wealth = (low + high) / 2;
    const b = run(wealth);
    if (goalMet(b, target)) {
      high = wealth;
      found = b;
      fHigh = target !== null ? value(b) - target : null;
      if (side === 1 && fLow !== null) fLow /= 2;
      side = 1;
    } else {
      low = wealth;
      lowBuild = b;
      const v = value(b);
      fLow = target !== null && v !== null ? v - target : null;
      if (side === -1 && fHigh !== null) fHigh /= 2;
      side = -1;
    }
  }
  if (extraSeeds) {
    const b = run(high, extraSeeds);
    if (goalMet(b, target)) found = b;
  } // the build there: all the starts
  return [high, found];
}
