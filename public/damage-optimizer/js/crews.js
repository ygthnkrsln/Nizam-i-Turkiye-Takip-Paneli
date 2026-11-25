// The employee crews engine: the JavaScript twin of warera/crews.py's moves-only part (hour, crew_profit, crews_of,
// reshuffle, move_plan): the same operations in the same order, so both give the same numbers; tests/crews_twin.py
// runs both on live players and compares. No DOM: it runs in a Web Worker (crews_worker.js) and in the twin check.
// Times are milliseconds since 1970 (UTC), never Date objects.
"use strict";

const CrewEngine = (() => {
  const DAY = 86400000;
  const HOUR = 3600000;
  const OUTPUT_DIVISOR = 4;
  const SAME_GOOD_CAP = 20;
  const RESPONSIBILITY_HAPPINESS = 3;
  const HAPPINESS_MAX = 100;
  const ANCHOR_UNHAPPY = -50; // an Anchor never leaves, but below QUIT_BELOW happiness works at -50%
  const HABIT_DAYS = 3;
  // the income tax's happiness: -tax² / 60, to 2 decimals (2026-11-16: 141 employees of 6 players, taxes 2-5.49%; was -1 a %)
  const taxHappiness = (tax) =>
    Math.floor(((tax * tax) / 60) * 100 + 0.5) / 100;
  const TOOL_HOURS = 500; // a tool's worked hours when new
  // A tool dismantles like equipment: floor(scraps x (1/3 + 2/3 x state)), scraps 6 x 3^(rarity - 1), common 1 to mythic 6
  // (GAME_RULES.md; 2 tool dismantles seen). So each worked hour costs 2/3 of its scraps over TOOL_HOURS, at the scraps
  // price (user, 2026-11-16: a mythic tool loses more as scraps than it earns for almost anyone; FINDINGS.md).
  const TOOL_WEAR_SHARE = 2 / 3 / TOOL_HOURS;
  const toolScraps = (code) =>
    6 * 3 ** (Number((code.match(/[0-9]+$/) || ["1"])[0]) - 1);
  const dismantleScraps = (code, hours) =>
    Math.floor(
      toolScraps(code) * (1 / 3 + (2 / 3) * Math.min(1, hours / TOOL_HOURS)),
    );
  const IMPROVISER_BONUS = 25; // an Improviser's bonus without a fitting tool, given up for one
  const TOOL_ROUNDS = 6; // searches trying tools on other employees, at most ...
  const TOOL_MS = 20000; // ... and their time at most, after the first
  const TOOL_CACHE = 1500000; // crews remembered between the rounds, at most
  const TOOL_GOODS = {
    hammer: ["steel", "concrete"],
    pickaxe: ["iron", "lead", "petroleum", "limestone"],
    skillet: ["cookedFish", "steak", "bread"],
    sickle: ["fish", "coca", "wood", "livestock", "grain"],
    caliper: ["lightAmmo", "heavyAmmo", "ammo"],
    flask: ["cocain", "oil", "paper"],
  };
  const RETIRE_AGE = 65;
  const RETIRE_EVERY_DAYS = 10;
  const RETIRE_CHANCE = 0.9; // asked to stay: 90% at 65 less 5 points a year past it (user, 2026-11-18)
  const RETIRE_HARDER = 0.05;
  const RETIRE_PAY_DAYS = 0.8; // with extra pay, ~80% of a day's wage, paid even if they leave: +10 for 7 days;
  const RETIRE_PAID = [10, 7]; // without: -5 happiness for 3 days, the retiree only (warera/crews.py)
  const RETIRE_UNPAID = [-5, 3];
  const QUIT_BELOW = 30,
    QUIT_SLOPE = 600;
  const FLIGHT_BELOW = 50,
    FLIGHT_SLOPE = 1000;
  const QUIT_MAX = 0.05;
  const CLIMBER_WEEKLY = 0.02;
  const OWN_HAPPINESS = new Set([
    "event",
    "managerCare",
    "recentlyMoved",
    "coworkerFired",
  ]);
  const COMPANY_HAPPINESS = new Set(["regionAttacked", "storageFull"]);
  const EXACT_OPS = 1.5e9; // the exact search's work at most (crews × the employee sets they can join) ...
  const EXACT_MAX = 20; // ... and employees (its tables hold 2^n numbers a company)
  const LAGRANGE_ITERS = 60; // with a cap on goods: rounds of pricing the goods over it ...
  const LAGRANGE_MS = 8000; // ... and their time at most
  const RESTARTS = 60; // the local search's random starts besides the setup now
  const HIRE_TABLES = 2 ** 25; // letting go: the exact search's numbers at most (hires x employee sets x companies)
  const TRAIT_NAMES = {
    primaDonna: "Prima donna",
    oldFriends: "Old friends",
    quickStudy: "Quick study",
    flightRisk: "Flight risk",
    luckyCharm: "Lucky charm",
    creatureOfHabit: "Creature of habit",
    diamondInTheRough: "Diamond in the rough",
    lateBloomer: "Late bloomer",
    wornOut: "Worn out",
    taxShy: "Tax shy",
    girlPower: "Girl power",
    bandOfBrothers: "Band of brothers",
    manHater: "Man hater",
    earlyBloomer: "Early bloomer",
    talksToMachines: "Talks to Machines",
  };

  const time = (value) => (value ? Date.parse(value) : null);
  const has = (traits, code) =>
    Object.prototype.hasOwnProperty.call(traits, code);
  const live = (until, at) => until === null || until > at;
  const days = (ms) => Math.trunc(ms / DAY); // Python's int(timedelta / DAY)
  const floorDiv = (a, b) => Math.floor(a / b); // Python's // on ints

  // texts the pages show, in their language (i18n.js); without it (the twin check loads only this file) the keys
  const say = (key, ...values) =>
    typeof I18N !== "undefined" ? I18N.t(key, ...values) : key;
  const traitLabel = (code) =>
    typeof I18N !== "undefined"
      ? I18N.trait(code)
      : TRAIT_NAMES[code] || code.charAt(0).toUpperCase() + code.slice(1);
  const argLabel = (code, arg) =>
    code === "specialist" && typeof I18N !== "undefined"
      ? I18N.item(arg)
      : code === "diamondInTheRough"
        ? say(`stat.${arg}`)
        : arg;

  function traitNames(e) {
    return Object.entries(e.traits)
      .map(([code, arg]) => {
        const name = traitLabel(code);
        return arg && (code === "specialist" || code === "diamondInTheRough")
          ? `${name} (${argLabel(code, arg)})`
          : name;
      })
      .join(", ");
  }

  // ---- records ----

  // worked hours a tool has left: 0.2 points of state an hour (warera/crews.py: tool_hours)
  const toolHours = (item) =>
    (item.state / (item.maxState || 100)) * TOOL_HOURS;

  function parseEmployee(record, read = null) {
    const stats = record.breakdown;
    let tool = null,
      toolEnds = null,
      toolWear = 0;
    const readAt = read ?? time(record.updatedAt);
    if (record.toolItem && (record.toolStatus || {}).isUsable !== false) {
      tool = [
        record.toolItem.code.replace(/[0-9]+$/, ""),
        record.toolStatus.bonusPercent,
      ];
      toolWear = toolScraps(record.toolItem.code) * TOOL_WEAR_SHARE;
      if (
        record.toolItem.state !== undefined &&
        record.toolItem.state !== null &&
        readAt
      ) {
        toolEnds = readAt + toolHours(record.toolItem) * HOUR;
      }
    }
    const happiness = record.happinessBreakdown.contributions
      .filter((c) => OWN_HAPPINESS.has(c.reason))
      .map((c) => [c.reason, c.delta, time(c.until)]);
    const events = (record.eventModifiers || [])
      .filter((m) => m.kind === "production" || m.kind === "away")
      .map((m) => [
        m.kind === "production" ? m.delta || 0 : "away",
        time(m.until),
      ]);
    const seen = time(record.lastAgedDay || record.updatedAt); // v0.27.4: the UTC day the age is as of
    const retireIn = record.retireInDays;
    const traits = {};
    for (const t of record.traits || [])
      traits[t.code] = t.arg === undefined ? null : t.arg;
    return {
      id: record._id,
      name: record.name,
      company: record.company,
      female: record.gender === "female",
      nationality: record.nationality ?? null,
      age: record.age ?? 0,
      production: stats.production.base + stats.production.trained,
      luck: stats.luck.base + stats.luck.trained,
      responsibility: stats.responsibility.base + stats.responsibility.trained,
      traits,
      sameGood: { ...(record.specializations || {}) },
      wage: record.wage || 0,
      created: time(record.createdAt),
      moved: time(record.lastMovedAt),
      tool,
      happiness,
      events,
      retireAsk:
        retireIn !== undefined && retireIn !== null && seen !== null
          ? seen + retireIn * DAY
          : null,
      seen,
      read: readAt, // its wage has Climber's rises up to then
      toolEnds, // when the tool wears out, if they work every hour
      toolWear, // scraps the tool loses a worked hour (TOOL_WEAR_SHARE)
      expectation: record.wageExpectation,
      estimate: (record.estimate || {}).production,
      potential: record.potential || 0,
      potentialMax: record.potentialMax || 0,
    };
  }

  // A company from its record (warera/crews.py: company_context); regions: id -> {country, initialCountry}.
  function companyContext(
    record,
    regions,
    raw,
    ownerCountry,
    ownerMgmt,
    tax,
    employees,
  ) {
    const region = regions[record.region] || {};
    const levels = record.activeUpgradeLevels || {};
    const company = {
      id: record._id,
      name: record.name || "",
      item: record.itemCode,
      raw: raw.has(record.itemCode),
      room: levels.breakRoom ?? 1,
      active: !record.disabledAt,
      storage: levels.storage ?? 1,
      country: region.country === undefined ? null : region.country,
      initialCountry:
        region.initialCountry === undefined ? null : region.initialCountry,
      tax,
      management: 2 * ownerMgmt,
      manager: 0,
      core: ownerCountry && region.initialCountry === ownerCountry ? 5 : 0,
      timed: [],
      stock: record.production || 0,
    };
    for (const e of employees.slice(0, 1)) {
      const parts = {};
      for (const c of e.productionBonus.contributions)
        parts[c.source] = c.percent;
      company.management = parts.management || 0;
      company.manager = parts.manager || 0;
      company.core = parts.coreRegion || 0;
    }
    const timed = new Map(); // from every record: a Stockpiler's doesn't show a full storage
    for (const e of employees) {
      for (const c of e.happinessBreakdown.contributions) {
        if (COMPANY_HAPPINESS.has(c.reason) && !timed.has(c.reason))
          timed.set(c.reason, [c.reason, c.delta, time(c.until)]);
      }
    }
    company.timed = [...timed.values()];
    return company;
  }

  // ---- an employee's hour ----

  function homesick(e, company) {
    return (
      company.country !== e.nationality &&
      company.initialCountry !== e.nationality
    );
  }

  function aged(e, at) {
    const t = e.traits;
    const age = e.age + (e.seen ? days(at - e.seen) : 0);
    const tenure = days(at - e.created);
    let prod = 0,
      luck = 0,
      resp = 0;
    if (has(t, "earlyBloomer"))
      prod += age < 40 ? 6 : Math.max(0, 6 - 2 * floorDiv(age - 30, 10));
    if (has(t, "lateBloomer"))
      prod += Math.min(6, 2 * Math.max(0, floorDiv(age - 40, 10)));
    if (has(t, "wornOut"))
      prod -= Math.min(6, 2 * Math.max(0, floorDiv(age - 50, 10)));
    if (has(t, "diamondInTheRough")) {
      const k = Math.min(4, floorDiv(tenure, 10));
      const stat = t.diamondInTheRough;
      prod += k * (stat === "production");
      luck += k * (stat === "luck");
      resp += k * (stat === "responsibility");
    }
    if (has(t, "burnout")) {
      const k = Math.min(3, floorDiv(tenure, 20));
      prod -= k;
      luck -= k;
      resp -= k;
    }
    return [prod, luck, resp];
  }

  function foreign(e, crew) {
    let n = 0;
    const seen = new Set();
    for (const c of crew) {
      if (c.nationality !== e.nationality && !seen.has(c.nationality)) {
        seen.add(c.nationality);
        n += 1;
      }
    }
    return n;
  }

  function points(e, company, crew, at) {
    const t = e.traits,
      n = crew.length;
    let p = aged(e, at)[0];
    if (has(t, "comic") && n) p -= 1;
    if (has(t, "bully") && n) p += 2;
    if (has(t, "cosmopolitan")) p += Math.min(4, 2 * foreign(e, crew));
    if (has(t, "xenophobe") && foreign(e, crew)) p -= 2;
    if (has(t, "craftsman")) p += company.raw ? -1 : 3;
    if (has(t, "laborer")) p += company.raw ? 3 : -1;
    if (has(t, "specialist") && t.specialist === company.item) p += 3;
    if (has(t, "patriot") && company.initialCountry === e.nationality) p += 2;
    if (has(t, "homesick") && homesick(e, company)) p -= 2;
    if (has(t, "expat") && company.country !== e.nationality) p += 2;
    return p;
  }

  function quitChance(e, happiness) {
    if (has(e.traits, "anchor")) return 0;
    let chance = Math.max(0, (QUIT_BELOW - happiness) / QUIT_SLOPE);
    if (has(e.traits, "flightRisk"))
      chance = Math.max(chance, (FLIGHT_BELOW - happiness) / FLIGHT_SLOPE);
    return Math.min(QUIT_MAX, chance);
  }

  const sum = (xs) => xs.reduce((a, b) => a + b, 0);
  const signedText = (x) => (x < 0 ? "" : "+") + x.toFixed(1);

  function hour(e, company, crew, at, daysOn = 0) {
    const t = e.traits,
      n = crew.length;
    let prod = e.production,
      luck = e.luck,
      resp = e.responsibility;
    const good = [],
      bad = [],
      bonus = {};
    const happy = (delta) => (delta >= 0 ? good : bad).push(delta);
    for (const c of crew) {
      if (has(c.traits, "bully")) happy(-10);
      if (has(c.traits, "luckyCharm")) luck += 3;
      if (has(c.traits, "jinx")) luck -= 2;
      if (has(c.traits, "foreman")) happy(9); // v0.28.0: its own happiness line (was +3 Responsibility)
    }
    if (crew.some((c) => has(c.traits, "comic"))) happy(10);
    // Mentor and Rival compare Production with the traits' other points, on both sides (warera/crews.py: hour)
    const own = points(e, company, crew, at);
    prod += own;
    if (
      has(t, "rival") ||
      has(t, "mentor") ||
      crew.some((c) => has(c.traits, "mentor"))
    ) {
      const strength = Math.max(1, e.production + own); // floored at 1 too
      const others = crew.map((c) =>
        Math.max(
          1,
          c.production +
            points(c, company, crew.filter((x) => x !== c).concat([e]), at),
        ),
      );
      crew.forEach((c, i) => {
        if (has(c.traits, "mentor") && others[i] > strength) prod += 2;
      });
      if (has(t, "mentor") && others.some((x) => x < strength)) prod -= 1;
      if (has(t, "rival") && n)
        prod += others.some((x) => x > strength) ? 3 : -1;
    }
    const sameNation = crew.some((c) => c.nationality === e.nationality);
    if (has(t, "xenophobe") && foreign(e, crew)) happy(-5);
    if (has(t, "nationalist") && sameNation) happy(10); // v0.28.0: +10 (was +2 Responsibility and +5)
    if (has(t, "specialist") && t.specialist === company.item) happy(5);
    if (has(t, "patriot") && company.initialCountry === e.nationality)
      happy(10);
    if (has(t, "homesick") && homesick(e, company)) happy(-10);
    if (has(t, "statist") && company.tax >= 20) happy(6); // v0.28.0: +6 happiness (was +2 Responsibility)
    if (has(t, "gambler")) {
      luck += 3;
      bonus.gambler = -15;
    }
    if (has(t, "loner") && !n) {
      bonus.loner = 100;
      happy(5);
    }
    if (has(t, "sociable")) {
      if (n) bonus.sociable = Math.min(50, 25 * n);
      else happy(-10);
    }
    if (has(t, "primaDonna") && n) {
      if (crew.every((c) => c.wage < e.wage)) bonus.primaDonna = 20;
      else happy(-10);
    }
    if (has(t, "envious")) {
      const richer = crew.filter((c) => c.wage > e.wage).length;
      if (richer) happy(-Math.min(10, 5 * richer));
    }
    for (const [code, key] of [
      ["girlPower", true],
      ["bandOfBrothers", false],
    ]) {
      if (has(t, code)) {
        const k = crew.filter((c) => c.female === key).length;
        if (k) bonus[code] = Math.min(30, 15 * k);
      }
    }
    for (const [code, key] of [
      ["misogynist", true],
      ["manHater", false],
    ]) {
      if (has(t, code)) {
        const k = crew.filter((c) => c.female === key).length;
        if (k) bonus[code] = -Math.min(30, 15 * k);
      }
    }
    if (has(t, "oldFriends") && crew.some((c) => c.id === t.oldFriends))
      bonus.oldFriends = 15;
    if (has(t, "sweethearts") && crew.some((c) => c.id === t.sweethearts))
      bonus.sweethearts = 20; // the partner
    if (has(t, "nemesis") && crew.some((c) => c.id === t.nemesis))
      bonus.nemesis = -15;
    if (has(t, "scavenger")) bonus.scavenger = -25;
    if (has(t, "taxShy") && company.tax)
      bonus.taxShy = -Math.min(30, company.tax);
    if (has(t, "claustrophobe") && company.storage <= 2)
      bonus.claustrophobe = -20;
    if (has(t, "creatureOfHabit") && e.moved && at - e.moved < HABIT_DAYS * DAY)
      bonus.creatureOfHabit = -30;
    if (has(t, "veteran") && at - e.created >= 30 * DAY) bonus.veteran = 20;
    const fits =
      e.tool !== null &&
      (TOOL_GOODS[e.tool[0]] || []).includes(company.item) &&
      (!e.toolEnds || at < e.toolEnds);
    if (fits) bonus.tool = e.tool[1];
    if (has(t, "handy") && fits) bonus.handy = 40;
    if (has(t, "improviser") && !fits) bonus.improviser = 25;

    happy(-taxHappiness(company.tax));
    for (const [reason, delta, until, since] of company.timed.concat(
      e.happiness,
    )) {
      // a planned care starts later
      if (
        live(until, at) &&
        (since === undefined || since <= at) &&
        !(reason === "storageFull" && has(t, "stockpiler"))
      )
        happy(delta);
    }
    const [, agedLuck, agedResp] = aged(e, at);
    luck += agedLuck;
    resp += agedResp;
    let wage = e.wage;
    if (has(t, "climber") && e.read) {
      // +2 points every 7 days from the hire: the record's wage has the ones so far
      const expectation = e.expectation || 1.0;
      const weeks = (when) => floorDiv(days(when - e.created), 7);
      wage =
        (e.wage * (expectation + CLIMBER_WEEKLY * weeks(at))) /
        (expectation + CLIMBER_WEEKLY * weeks(e.read));
    }
    prod = Math.max(1, prod);
    luck = Math.max(1, luck);
    resp = Math.max(1, resp);
    const penalty = sum(bad) * (has(t, "loyal") ? 0.5 : 1);
    const happiness = Math.min(
      HAPPINESS_MAX,
      Math.max(0, 50 + sum(good) + penalty + RESPONSIBILITY_HAPPINESS * resp),
    );
    if (has(t, "anchor") && happiness < QUIT_BELOW)
      bonus.anchor = ANCHOR_UNHAPPY;

    bonus.management = company.management;
    bonus.manager = company.manager;
    bonus.coreRegion = company.core;
    bonus.happiness = happiness - 50;
    const rate = has(t, "quickStudy") ? 2 : 1;
    bonus.specialization = Math.min(
      SAME_GOOD_CAP,
      (e.sameGood[company.item] || 0) + rate * daysOn,
    );
    let away = false;
    for (const [delta, until] of e.events) {
      if (live(until, at)) {
        if (delta === "away") away = true;
        else bonus.event = (bonus.event || 0) + delta;
      }
    }
    const total = sum(Object.values(bonus));
    const working = company.active && !away;
    const output = working ? (prod / OUTPUT_DIVISOR) * (1 + total / 100) : 0;
    const engine =
      has(t, "talksToMachines") && !n && working ? company.engine || 0 : 0;
    return {
      production: prod,
      luck,
      responsibility: resp,
      happiness,
      bonus: total,
      parts: bonus,
      output,
      engine,
      wage: working ? wage : 0,
      quit: quitChance(e, happiness),
    };
  }

  // an hour's coins: the output, the engine's extra with Talks to Machines (v0.27.4), less the wage
  const hourProfit = (h, value) => (h.output + h.engine) * value - h.wage;

  const moved = (e, at) => ({ ...e, moved: at });

  // ---- the coming days ----

  function changes(e, company) {
    const times = [];
    for (const [, , u] of e.happiness.concat(company.timed))
      if (u) times.push(u);
    for (const p of e.happiness) if (p.length > 3) times.push(p[3]); // a planned care's start
    for (const [, u] of e.events) if (u) times.push(u);
    times.push(e.created + 30 * DAY);
    if (e.toolEnds && (TOOL_GOODS[e.tool[0]] || []).includes(company.item))
      times.push(e.toolEnds);
    const t = e.traits;
    const every = [];
    if (has(t, "diamondInTheRough")) every.push(10);
    if (has(t, "burnout")) every.push(20);
    if (has(t, "climber")) every.push(7);
    for (const k of every)
      for (let n = 1; n < 13; n++) times.push(e.created + n * k * DAY);
    if (
      e.seen &&
      (has(t, "lateBloomer") || has(t, "wornOut") || has(t, "earlyBloomer"))
    ) {
      for (let decade = 40; decade < 110; decade += 10)
        if (decade > e.age) times.push(e.seen + (decade - e.age) * DAY);
    }
    if (e.moved) times.push(e.moved + HABIT_DAYS * DAY);
    return times;
  }

  function asks(e, start, end) {
    const out = [];
    let t = e.retireAsk;
    while (t && t < end) {
      if (t >= start) out.push(t);
      t += RETIRE_EVERY_DAYS * DAY;
    }
    return out;
  }

  function segment(
    company,
    crew,
    value,
    origin,
    a,
    b,
    totals,
    weight,
    end = null,
    refill = 0,
  ) {
    const mid = a + (b - a) / 2;
    crew.forEach((e, i) => {
      const h = hour(
        e,
        company,
        crew.slice(0, i).concat(crew.slice(i + 1)),
        mid,
      );
      if (!h.output && !h.wage) return;
      const base = h.bonus - h.parts.specialization;
      const spec = e.sameGood[company.item] || 0,
        rate = has(e.traits, "quickStudy") ? 2 : 1;
      const perHour = (h.production / OUTPUT_DIVISOR) * value;
      // the tool's wear while it works for them, as scraps lost (company.scrap: the scraps price; 0 without it)
      const wear =
        h.output > 0 && h.parts.tool !== undefined
          ? (e.toolWear || 0) * (company.scrap || 0)
          : 0;
      const stay = 1 - h.quit;
      let t = a;
      while (t < b) {
        const d = days(t - origin);
        const next = Math.min(b, origin + (d + 1) * DAY);
        const bonus = base + Math.min(SAME_GOOD_CAP, spec + rate * d);
        const hours = (next - t) / HOUR;
        const expected = stay < 1 ? (1 - stay ** hours) / (1 - stay) : hours;
        totals[e.id] +=
          (perHour * (1 + bonus / 100) + h.engine * value - h.wage - wear) *
          expected *
          weight[e.id];
        if (refill)
          totals[e.id] +=
            (weight[e.id] * (1 - stay ** hours) * refill * (end - next)) / HOUR;
        weight[e.id] *= stay ** hours;
        t = next;
      }
    });
  }

  // Asking e, who asks to retire at `at`, to stay (warera/crews.py: _stay): [worth over the next 10 days or to the end
  // against letting go and the seat's refill, cost in coins, the happiness part it brings] for the better way to ask.
  function stay(e, company, others, value, at, daysOn, chance, end, refill) {
    const span = Math.min(RETIRE_EVERY_DAYS * 24, (end - at) / HOUR);
    const plain = hourProfit(hour(e, company, others, at, daysOn), value);
    let best = null;
    for (const [delta, d, cost] of [
      [...RETIRE_UNPAID, 0],
      [...RETIRE_PAID, RETIRE_PAY_DAYS * 24 * e.wage],
    ]) {
      const part = ["retirementStay", delta, at + d * DAY];
      const h = hour(
        { ...e, happiness: e.happiness.concat([part]) },
        company,
        others,
        at,
        daysOn,
      );
      const hours = Math.min(d * 24, span);
      const worth =
        chance *
          ((plain - refill) * span + (hourProfit(h, value) - plain) * hours) -
        cost;
      if (best === null || worth > best[0]) best = [worth, cost, part];
    }
    return best;
  }

  // Each member's coins in `company` over `horizon` days from `start` (warera/crews.py: crew_profit); refill: coins an
  // hour the seat of one who retires or quits is worth until the end, counted to them.
  function crewProfit(company, crew, value, start, horizon, refill = 0) {
    const end = start + horizon * DAY;
    const totals = {},
      weight = {};
    for (const e of crew) {
      totals[e.id] = 0;
      weight[e.id] = 1;
    }
    const members = crew.slice();
    const askList = [];
    if (company.active)
      for (const e of crew)
        for (const at of asks(e, start, end)) askList.push([at, e.id]);
    askList.sort(
      (x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0),
    );
    askList.push([end, null]);
    let t = start;
    for (const [when, eid] of askList) {
      if (eid !== null && members.every((e) => e.id !== eid)) continue;
      const cuts = new Set([t, when]);
      for (const e of members)
        for (const x of changes(e, company)) if (t < x && x < when) cuts.add(x);
      const sorted = [...cuts].sort((x, y) => x - y);
      for (let k = 0; k + 1 < sorted.length; k++) {
        segment(
          company,
          members,
          value,
          start,
          sorted[k],
          sorted[k + 1],
          totals,
          weight,
          end,
          refill,
        );
      }
      t = when;
      if (eid === null) break;
      const e = members.find((x) => x.id === eid);
      const others = members.filter((x) => x !== e);
      const age = e.age + days(when - (e.seen ?? start)); // the record's age is as of its lastAgedDay
      const chance = Math.max(
        0,
        RETIRE_CHANCE - RETIRE_HARDER * (age - RETIRE_AGE),
      );
      const left = (refill * (end - when)) / HOUR;
      const [worth, cost, part] = stay(
        e,
        company,
        others,
        value,
        when,
        days(when - start),
        chance,
        end,
        refill,
      );
      if (worth > 0) {
        totals[eid] -= weight[eid] * cost;
        totals[eid] += weight[eid] * (1 - chance) * left;
        weight[eid] *= chance;
        members[members.indexOf(e)] = {
          ...e,
          happiness: e.happiness.concat([part]),
        };
      } else {
        totals[eid] += weight[eid] * left;
        members.splice(members.indexOf(e), 1);
      }
    }
    return crew.map((e) => totals[e.id]);
  }

  function dayRate(company, crew, value, at) {
    return crew.map((e, i) => {
      const h = hour(
        e,
        company,
        crew.slice(0, i).concat(crew.slice(i + 1)),
        at,
      );
      return hourProfit(h, value) * 24;
    });
  }

  // `combo` (indexes into `order`) working in `company`, the ones from elsewhere moved in at `start`.
  function crewScore(company, combo, order, value, start, horizon) {
    const members = combo.map((i) =>
      order[i].company === company.id ? order[i] : moved(order[i], start),
    );
    return sum(crewProfit(company, members, value, start, horizon));
  }

  // Every combination of `size` out of n, in Python's itertools order.
  function* combinations(n, size) {
    const idx = Array.from({ length: size }, (_, i) => i);
    if (size > n) return;
    for (;;) {
      yield idx.slice();
      let i = size - 1;
      while (i >= 0 && idx[i] === i + n - size) i--;
      if (i < 0) return;
      idx[i]++;
      for (let j = i + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }

  function choose(n, k) {
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return r;
  }

  // ---- the search ----

  // The exact search's work for company c: every crew against every placed set it doesn't touch (A), or every placed
  // set reachable so far against every crew (B), whichever is less; rooms before c bound the sets reachable. m: the
  // movable managers (a bit each above the n employees'), runs[c]: the company's options (no manager, each manager).
  function exactCost(n, m, rooms, runs, c) {
    let a = 0,
      k = 0,
      reach = 0;
    for (let s = 0; s <= Math.min(rooms[c], n); s++) {
      a += choose(n, s) * 2 ** (n + m - s) * (1 + (runs[c] - 1) / 2);
      k += choose(n, s) * runs[c];
    }
    const before =
      rooms.slice(0, c).reduce((x, y) => x + y, 0) + Math.min(c, m);
    for (let j = 0; j <= Math.min(before, n + m); j++)
      reach += choose(n + m, j);
    return Math.min(a, reach * k);
  }

  // Exact: a company at a time over every set of employees (and movable managers: the bits above n) placed so far
  // (dp[mask]); crews[c] = [{mask, score, ...}]; at least `need` employees placed. {total, picks: crews[c][k] each}.
  function exactSearch(active, crews, bits, n, need, told = () => {}) {
    const size = 1 << bits,
      full = size - 1,
      people = (1 << n) - 1;
    let dp = new Float64Array(size).fill(-Infinity);
    dp[0] = 0;
    const choice = [];
    for (let c = 0; c < active.length; c++) {
      told(c);
      const next = new Float64Array(size).fill(-Infinity);
      const pick = new Int32Array(size).fill(-1);
      const reach = [];
      for (let m = 0; m < size; m++) if (dp[m] !== -Infinity) reach.push(m);
      let a = 0;
      for (const { mask } of crews[c]) a += 2 ** (bits - popcount(mask));
      if (reach.length * crews[c].length <= a) {
        for (const sub of reach) {
          const before = dp[sub];
          crews[c].forEach(({ mask, score }, k) => {
            if (mask & sub) return;
            const value = before + score,
              to = sub | mask;
            if (value > next[to]) {
              next[to] = value;
              pick[to] = k;
            }
          });
        }
      } else {
        crews[c].forEach(({ mask, score }, k) => {
          const rest = full & ~mask;
          for (let sub = rest; ; sub = (sub - 1) & rest) {
            // every placed set the crew doesn't touch
            const before = dp[sub];
            if (before !== -Infinity) {
              const value = before + score,
                to = sub | mask;
              if (value > next[to]) {
                next[to] = value;
                pick[to] = k;
              }
            }
            if (sub === 0) break;
          }
        });
      }
      dp = next;
      choice.push(pick);
    }
    let best = -Infinity,
      end = -1;
    for (let m = 0; m < size; m++)
      if (dp[m] > best && popcount(m & people) >= need) {
        best = dp[m];
        end = m;
      }
    if (end < 0) return null;
    const picks = new Array(active.length);
    for (let c = active.length - 1; c >= 0; c--) {
      picks[c] = crews[c][choice[c][end]];
      end &= ~picks[c].mask;
    }
    return { total: best, picks };
  }

  // The exact search with new hires: crews[c] = [{mask, hires, score, ...}], at most H new hires in all (dp[h][mask]);
  // nobody has to be placed (letting go allowed). {total, picks, dp (the last tables), choice} for `backtrack`.
  function exactSearchHires(active, crews, bits, H, told = () => {}) {
    const size = 1 << bits,
      full = size - 1;
    let dp = [];
    for (let h = 0; h <= H; h++)
      dp.push(new Float64Array(size).fill(-Infinity));
    dp[0][0] = 0;
    const choice = [];
    for (let c = 0; c < active.length; c++) {
      told(c);
      const next = [],
        pick = [];
      for (let h = 0; h <= H; h++) {
        next.push(new Float64Array(size).fill(-Infinity));
        pick.push(new Int32Array(size).fill(-1));
      }
      for (let h = 0; h <= H; h++) {
        const from = dp[h],
          reach = [];
        for (let m = 0; m < size; m++) if (from[m] !== -Infinity) reach.push(m);
        if (!reach.length) continue;
        let a = 0;
        for (const { mask, hires } of crews[c])
          if (h + hires <= H) a += 2 ** (bits - popcount(mask));
        if (reach.length * crews[c].length <= a) {
          for (const sub of reach) {
            const before = from[sub];
            crews[c].forEach(({ mask, score, hires }, k) => {
              if (mask & sub || h + hires > H) return;
              const value = before + score,
                to = sub | mask,
                into = next[h + hires];
              if (value > into[to]) {
                into[to] = value;
                pick[h + hires][to] = k;
              }
            });
          }
        } else {
          crews[c].forEach(({ mask, score, hires }, k) => {
            if (h + hires > H) return;
            const rest = full & ~mask,
              into = next[h + hires],
              chosen = pick[h + hires];
            for (let sub = rest; ; sub = (sub - 1) & rest) {
              const before = from[sub];
              if (before !== -Infinity) {
                const value = before + score,
                  to = sub | mask;
                if (value > into[to]) {
                  into[to] = value;
                  chosen[to] = k;
                }
              }
              if (sub === 0) break;
            }
          });
        }
      }
      dp = next;
      choice.push(pick);
    }
    let best = -Infinity,
      endH = -1,
      end = -1;
    for (let h = 0; h <= H; h++)
      for (let m = 0; m < size; m++)
        if (dp[h][m] > best) {
          best = dp[h][m];
          endH = h;
          end = m;
        }
    if (end < 0) return null;
    return {
      total: best,
      picks: backtrack(crews, choice, endH, end),
      dp,
      choice,
    };
  }

  function backtrack(crews, choice, h, m) {
    const picks = new Array(crews.length);
    for (let c = crews.length - 1; c >= 0; c--) {
      picks[c] = crews[c][choice[c][h][m]];
      h -= picks[c].hires;
      m &= ~picks[c].mask;
    }
    return picks;
  }

  function popcount(m) {
    let k = 0;
    while (m) {
      m &= m - 1;
      k++;
    }
    return k;
  }

  // A small seeded generator (the local search's random starts, the move plan's orders).
  function random(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rnd) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  // warera/crews.py: local_plan, from `start` (employee index -> company id, null = parked), and the movable managers
  // from `mStart` (manager index -> active company id or null): employee moves and swaps, then manager moves (to an
  // active company without one; `fixedAt`: company id -> a manager that stays) and swaps, then product switches
  // (`goodsOf[c]`: the goods company c may make, at most `cap` companies on one; `gStart`: the goods to start from).
  // score(c, members, manager index or null, good) -> coins. deep: a manager move or a switch is judged after the
  // employees settle around it (a move that pays only with them; 2026-10-30: Luitold_v_Eppenstein's plan was 2.5 coins
  // short of the exact one without it).
  function localPlan(active, n, score, start, outCap, opts = {}) {
    const {
      mStart = [],
      fixedAt = {},
      deep = false,
      gStart = null,
      goodsOf = null,
      cap = null,
      lStart = null,
      placesOf = null,
    } = opts;
    const rooms = Object.fromEntries(active.map((c) => [c.id, c.room]));
    let assign = start.slice();
    const mAt = mStart.slice();
    const gAt = gStart ? gStart.slice() : active.map((c) => c.item);
    const lAt = lStart ? lStart.slice() : active.map(() => null); // the country it moves to (null: stays)
    const members = (cid) =>
      assign.map((c, i) => (c === cid ? i : -1)).filter((i) => i >= 0);
    const runner = (cid) =>
      cid in fixedAt
        ? fixedAt[cid]
        : (() => {
            const k = mAt.indexOf(cid);
            return k < 0 ? null : k;
          })();
    const total = () =>
      sum(
        active.map((c, ci) =>
          score(c, members(c.id), runner(c.id), gAt[ci], lAt[ci]),
        ),
      );
    const targets = active.map((c) => c.id).concat(outCap > 0 ? [null] : []);

    // employee moves and swaps until none adds anything: the total then
    function settle(current) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < n; i++) {
          for (const target of targets) {
            const source = assign[i];
            if (
              target === source ||
              (target !== null && members(target).length >= rooms[target])
            )
              continue;
            if (
              target === null &&
              assign.filter((c) => c === null).length >= outCap
            )
              continue;
            assign[i] = target;
            const value = total();
            if (value > current + 1e-9) {
              current = value;
              improved = true;
            } else {
              assign[i] = source;
            }
          }
        }
        for (let i = 0; i < n; i++) {
          for (let j = i + 1; j < n; j++) {
            if (assign[i] === assign[j]) continue;
            [assign[i], assign[j]] = [assign[j], assign[i]];
            const value = total();
            if (value > current + 1e-9) {
              current = value;
              improved = true;
            } else {
              [assign[i], assign[j]] = [assign[j], assign[i]];
            }
          }
        }
      }
      return current;
    }

    // a change to try (it returns the undo): kept when the total grows, the employees settled first when deep
    function attempt(change, current) {
      const before = assign.slice();
      const undo = change();
      const value = deep ? settle(total()) : total();
      if (value > current + 1e-9) return deep ? value : settle(value);
      undo();
      assign = before;
      return null;
    }

    let current = settle(total());
    let improved = true;
    while (improved) {
      improved = false;
      for (let k = 0; k < mAt.length; k++) {
        for (const c of active) {
          if (c.id === mAt[k] || c.id in fixedAt) continue;
          const kept = attempt(() => {
            const other = mAt.indexOf(c.id),
              source = mAt[k]; // another manager there: a swap
            mAt[k] = c.id;
            if (other >= 0) mAt[other] = source;
            return () => {
              mAt[k] = source;
              if (other >= 0) mAt[other] = c.id;
            };
          }, current);
          if (kept !== null) {
            current = kept;
            improved = true;
          }
        }
      }
      if (goodsOf) {
        active.forEach((c, ci) => {
          for (const g of goodsOf[ci]) {
            if (
              g === gAt[ci] ||
              (cap && gAt.filter((x) => x === g).length >= cap)
            )
              continue;
            const kept = attempt(() => {
              const old = gAt[ci];
              gAt[ci] = g;
              return () => {
                gAt[ci] = old;
              };
            }, current);
            if (kept !== null) {
              current = kept;
              improved = true;
            }
          }
        });
        // two companies trade their goods (with a cap a good may only move this way)
        for (let a = 0; a < active.length; a++) {
          for (let b = a + 1; b < active.length; b++) {
            if (
              gAt[a] === gAt[b] ||
              !goodsOf[a].includes(gAt[b]) ||
              !goodsOf[b].includes(gAt[a])
            )
              continue;
            const kept = attempt(() => {
              [gAt[a], gAt[b]] = [gAt[b], gAt[a]];
              return () => {
                [gAt[a], gAt[b]] = [gAt[b], gAt[a]];
              };
            }, current);
            if (kept !== null) {
              current = kept;
              improved = true;
            }
          }
        }
      }
      if (placesOf) {
        active.forEach((c, ci) => {
          for (const x of placesOf[ci]) {
            if (x === lAt[ci]) continue;
            const kept = attempt(() => {
              const old = lAt[ci];
              lAt[ci] = x;
              return () => {
                lAt[ci] = old;
              };
            }, current);
            if (kept !== null) {
              current = kept;
              improved = true;
            }
          }
        });
      }
    }
    return { total: current, assign, mAt, gAt, lAt };
  }

  // warera/crews.py: park: where the ones not placed in an active company sit.
  function park(companies, order, placed) {
    const disabled = companies.filter((c) => !c.active);
    const where = {},
      used = {};
    const out = order.filter((e) => !(e.id in placed));
    for (const e of out) {
      if (disabled.some((c) => c.id === e.company)) {
        where[e.id] = e.company;
        used[e.company] = (used[e.company] || 0) + 1;
      }
    }
    for (const e of out) {
      if (e.id in where) continue;
      const seat = disabled.find((c) => (used[c.id] || 0) < c.room);
      if (!seat)
        throw new Error(
          "more employees parked than the disabled companies' seats",
        );
      where[e.id] = seat.id;
      used[seat.id] = (used[seat.id] || 0) + 1;
    }
    return where;
  }

  // ---- the moves in the fewest steps (warera/crews.py: move_steps, _rings, move_plan) ----

  function moveSteps(moves, rooms, occupiedNow, spare) {
    const occupied = { ...occupiedNow };
    const pending = moves.slice();
    const steps = [];
    const seat = (c) => occupied[c] || 0;
    const doMove = (move, to, temporary) => {
      steps.push([move[0], move[1], to, temporary]);
      occupied[move[1]] -= 1;
      if (to !== null) occupied[to] = seat(to) + 1;
    };
    while (pending.length) {
      const ready = pending.filter(
        (m) => m[2] === null || seat(m[2]) < (rooms[m[2]] || 0),
      );
      ready.sort((x, y) => (x[2] !== null) - (y[2] !== null));
      if (ready.length) {
        doMove(ready[0], ready[0][2], false);
        pending.splice(pending.indexOf(ready[0]), 1);
        continue;
      }
      const wait = spare.find((c) => seat(c) < (rooms[c] || 0));
      if (wait === undefined) break;
      const wanted = new Set(pending.map((m) => m[2]));
      const move = pending.find((m) => wanted.has(m[1]) && m[1] !== wait);
      if (!move) break;
      doMove(move, wait, true);
      pending[pending.indexOf(move)] = [move[0], wait, move[2]];
    }
    return [steps, pending];
  }

  function rings(moves, rnd) {
    let left = shuffle(moves.slice(), rnd);
    const found = [];
    for (;;) {
      let best = null;
      for (const start of left) {
        const paths = new Map([[start[2], []]]);
        let frontier = [start[2]];
        while (frontier.length && !paths.has(start[1])) {
          const next = [];
          for (const node of frontier) {
            for (const m of left) {
              if (
                m !== start &&
                m[1] === node &&
                !paths.has(m[2]) &&
                paths.get(node).every((x) => x !== m)
              ) {
                paths.set(m[2], paths.get(node).concat([m]));
                next.push(m[2]);
              }
            }
          }
          frontier = next;
        }
        if (
          paths.has(start[1]) &&
          (best === null || paths.get(start[1]).length + 1 < best.length)
        ) {
          best = [start].concat(paths.get(start[1]));
        }
      }
      if (best === null) return found;
      found.push(best);
      left = left.filter((m) => best.every((x) => x !== m));
    }
  }

  // moves: [employee id, from, to]; steps: [kind "move" / "swap", employee, from, to, other employee or null, temporary].
  function movePlan(moves, rooms, occupied, spare, tries = 200) {
    const rnd = random(7);
    let best = [];
    for (let k = 0; k < tries; k++) {
      const r = rings(moves, rnd);
      if (r.length > best.length) best = r;
    }
    const steps = [];
    const inRings = new Set(best.flat());
    for (const ring of best) {
      const home = ring[0][1];
      for (let j = 0; j + 1 < ring.length; j++)
        steps.push([
          "swap",
          ring[j][0],
          home,
          ring[j][2],
          ring[j + 1][0],
          false,
        ]);
    }
    const [chain, stuck] = moveSteps(
      moves.filter((m) => !inRings.has(m)),
      rooms,
      occupied,
      spare,
    );
    for (const [e, a, b, temporary] of chain)
      steps.push(["move", e, a, b, null, temporary]);
    return { steps, stuck };
  }

  // Self-work in the best active company (no production bonus since v0.27: a click makes the Production skill's PP):
  // coins a click (energyPerClick energy) and a day with every click of 24 h of energy regen (warera/production.py:
  // self_work_pp; employee_crews.py values 10 energy the same way).
  function selfWork(active, value, input) {
    const best = active.reduce(
      (a, c) => (a === null || value(c) > value(a) ? c : a),
      null,
    );
    const perClick = best ? (input.owner.clickPP || 0) * value(best) : 0;
    const clicks =
      ((input.owner.regen || 0) * 24) / (input.energyPerClick || 10);
    return {
      company: best ? best.id : null,
      energy: input.energyPerClick || 10,
      pp: input.owner.clickPP || 0,
      perClick,
      clicks,
      day: perClick * clicks,
    };
  }

  // ---- hired managers (warera/crews.py: managers_of, care_parts, managed_crew; user, 2026-10-30: a bonus for the
  // company they run, a daily care, and the owner moves them freely) ----

  const CARE_HAPPINESS = 5,
    CARE_HOURS = 48;
  const CHANGE_CONCRETE = 5; // concrete a product switch costs (warera/production.py) ...
  // a company move: 5 concrete unless free, and its crew −10 happiness for 7 days but for the ones moved out to a
  // disabled company for it and back (user, 2026-10-31; warera/crews.py)
  const RELOCATION_CONCRETE = 5;
  const COMPANY_MOVE_HAPPINESS = -10,
    COMPANY_MOVE_DAYS = 7;
  const LOCATION_TRAITS = ["patriot", "homesick", "expat"];
  const CORE_BONUS = 5;

  // warera/crews.py: neutral_group, abroad_group, candidate_countries, relocated, arriving.
  const located = (e) => LOCATION_TRAITS.some((t) => has(e.traits, t));

  function neutralGroup(order, owner, taxes, floor = null) {
    const relevant = new Set(order.filter(located).map((e) => e.nationality));
    const rest = Object.keys(taxes).filter(
      (x) =>
        x !== owner &&
        !relevant.has(x) &&
        (floor === null || taxes[x] >= floor),
    );
    if (!rest.length) return [];
    const low = Math.min(...rest.map((x) => taxes[x]));
    return rest.filter((x) => taxes[x] === low).sort();
  }

  // perks only: abroad only for an Expat, and at no lower tax than home
  function abroadGroup(order, owner, taxes, perksOnly) {
    if (!perksOnly) return neutralGroup(order, owner, taxes);
    if (!order.some((e) => has(e.traits, "expat"))) return [];
    return neutralGroup(order, owner, taxes, taxes[owner] || 0);
  }

  function candidateCountries(order, owner, taxes, perksOnly) {
    const relevant = [
      ...new Set(
        order
          .filter((e) => located(e) && e.nationality in taxes)
          .map((e) => e.nationality),
      ),
    ].sort();
    const out = (owner in taxes ? [owner] : []).concat(
      relevant.filter((x) => x !== owner),
    );
    const group = abroadGroup(order, owner, taxes, perksOnly);
    if (group.length) out.push(group[0]);
    return out;
  }

  function relocatedCompany(company, country, tax, owner) {
    return {
      ...company,
      country,
      initialCountry: country,
      tax,
      core: country === owner ? CORE_BONUS : 0,
      timed: company.timed.filter((t) => t[0] !== "regionAttacked"),
    };
  }

  function arriving(e, company, start, moving, shielded = false) {
    const there = e.company !== company.id ? moved(e, start) : e;
    if (!moving || !COMPANY_MOVE_HAPPINESS || shielded) return there;
    return {
      ...there,
      happiness: there.happiness.concat([
        [
          "recentlyMoved",
          COMPANY_MOVE_HAPPINESS,
          start + COMPANY_MOVE_DAYS * DAY,
        ],
      ]),
    };
  }

  function managersOf(companies, order, costs, at) {
    const midnight = Math.floor(at / DAY) * DAY;
    const out = [];
    for (const c of companies) {
      if (!costs[c.id] && !c.manager) continue;
      const crew = order.filter((e) => e.company === c.id);
      const cared = crew.some((e) =>
        e.happiness.some(
          (p) =>
            p[0] === "managerCare" &&
            p[2] &&
            p[2] - CARE_HOURS * HOUR >= midnight,
        ),
      );
      out.push({
        company: c.id,
        bonus: crew.length ? c.manager : null,
        cost: costs[c.id] || 0,
        caredToday: cared,
      });
    }
    return out;
  }

  function careParts(start, horizon, caredToday) {
    const midnight = Math.floor(start / DAY) * DAY,
      end = start + horizon * DAY;
    const times = caredToday ? [] : [start];
    for (let k = 1; k < horizon + 2; k++) {
      const t = midnight + k * DAY;
      if (t < end) times.push(t);
    }
    return times.map((t) => [
      "managerCare",
      CARE_HAPPINESS,
      t + CARE_HOURS * HOUR,
      t,
    ]);
  }

  // warera/crews.py: candidate_goods: a company's own good first, then the `extra` others worth the most a PP.
  function candidateGoods(company, values, extra) {
    const rank = Object.keys(values)
      .filter((g) => values[g] > 0)
      .sort((a, b) => values[b] - values[a] || (a < b ? -1 : a > b ? 1 : 0));
    return [company.item].concat(
      rank.filter((g) => g !== company.item).slice(0, extra),
    );
  }

  // warera/crews.py: shielded_ids: who in a moving company's crew steps out to a disabled company's free seat for
  // the move (up to `seats`, the most Production first, never a Creature of habit)
  function shieldedIds(crew, seats) {
    const able = crew
      .filter((e) => !has(e.traits, "creatureOfHabit"))
      .sort(
        (a, b) =>
          b.production - a.production ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
    return new Set(able.slice(0, Math.max(0, seats)).map((e) => e.id));
  }

  // `combo` (indexes into `order`) in `company` run by `manager` (null: none), its care to the member worth most. With
  // `neutral` (what coworkers see in a seat filled by a new hire) also every number of new hires for the seats left
  // (byK: [hires, the members' profits, the care's member]); refill: see crewProfit; training: id -> coins of their
  // draws left (the members' go into the score). (warera/crews.py: managed_crew)
  function managedCrew(
    company,
    combo,
    order,
    value,
    start,
    horizon,
    manager,
    care,
    moving = false,
    shield = 0,
    neutral = null,
    refill = 0,
    training = null,
  ) {
    const there = { ...company, manager: manager ? manager.bonus || 0 : 0 };
    const out = moving
      ? shieldedIds(
          combo.map((i) => order[i]),
          shield,
        )
      : new Set();
    const members = combo.map((i) =>
      arriving(order[i], company, start, moving, out.has(order[i].id)),
    );
    const targets =
      manager && members.length ? members.map((_, k) => k) : [null];
    const byK = [];
    for (let k = 0; k < (neutral ? company.room - combo.length + 1 : 1); k++) {
      const hires = [];
      for (let j = 0; j < k; j++) hires.push(neutral(there, j));
      let best = null;
      for (const t of targets) {
        const crew = members.map((e, i) =>
          i === t ? { ...e, happiness: e.happiness.concat(care) } : e,
        );
        const profits = crewProfit(
          there,
          crew.concat(hires),
          value,
          start,
          horizon,
          refill,
        ).slice(0, crew.length);
        if (best === null || sum(profits) > sum(best[1]))
          best = [k, profits, t === null ? null : members[t].id];
      }
      byK.push(best);
    }
    let trained = 0;
    for (const i of combo) trained += (training || {})[order[i].id] || 0;
    const [, profits, target] = byK[0];
    return {
      score: sum(profits) + trained,
      profits,
      care: target,
      byK,
      training: trained,
      incoming: combo.filter((i) => order[i].company !== company.id).length,
    };
  }

  // a crew's best number of new hires when a seat is worth `seat` (or exactly `hires`): [hires, profits, care]
  // (warera/crews.py: rescored, the first best on a tie)
  function withHires(r, seat, hires = null) {
    if (hires !== null) return r.byK[hires];
    let best = null;
    for (const x of r.byK)
      if (
        best === null ||
        sum(x[1]) + x[0] * seat > sum(best[1]) + best[0] * seat
      )
        best = x;
    return best;
  }

  function careRates(company, crew, value, at, manager, target, care) {
    const there = { ...company, manager: manager ? manager.bonus || 0 : 0 };
    return dayRate(
      there,
      crew.map((e) =>
        e.id === target ? { ...e, happiness: e.happiness.concat(care) } : e,
      ),
      value,
      at,
    );
  }

  // ---- tools: which ones a player has, and who should hold them (user, 2026-11-02; warera/crews.py) ----

  // A player's usable tools, worked out as the API shows no inventory: everything out of opened toolboxes less what was
  // dismantled, by the item's ID. opened: [{id, code, bonus, state}], dismantled: [item IDs], rosters: employee records.
  // [{id, code, type, bonus, hours, holder (employee ID or null)}], by ID.
  function heldTools(opened, dismantled, rosters) {
    const tools = new Map(),
      gone = new Set(dismantled),
      kind = (code) => code.replace(/[0-9]+$/, "");
    for (const x of opened) {
      if (!gone.has(x.id))
        tools.set(x.id, {
          id: x.id,
          code: x.code,
          type: kind(x.code),
          bonus: x.bonus,
          hours: toolHours({ state: x.state }),
          holder: null,
        });
    }
    for (const roster of rosters) {
      for (const record of roster) {
        const item = record.toolItem;
        if (!item) continue;
        tools.delete(item._id);
        if (
          (record.toolStatus || {}).isUsable !== false &&
          toolHours(item) > 0
        ) {
          tools.set(item._id, {
            id: item._id,
            code: item.code,
            type: kind(item.code),
            bonus: record.toolStatus.bonusPercent,
            hours: toolHours(item),
            holder: record._id,
          });
        }
      }
    }
    return [...tools.keys()]
      .sort()
      .map((id) => tools.get(id))
      .filter((t) => t.hours > 0);
  }

  const holding = (e, tool, start) =>
    tool
      ? {
          ...e,
          tool: [tool.type, tool.bonus],
          toolEnds: start + tool.hours * HOUR,
          toolWear: toolScraps(tool.code) * TOOL_WEAR_SHARE,
        }
      : { ...e, tool: null, toolEnds: null, toolWear: 0 };

  // Each row's column for the largest sum, each column used once, a row left without one rather than a gain of 0 or less
  // (the Hungarian method; warera/crews.py: best_assignment, the same operations in the same order)
  function bestAssignment(gains) {
    const rows = gains.length,
      columns = rows ? gains[0].length : 0;
    const size = columns + rows; // a row's own empty columns: no tool
    const u = new Array(rows + 1).fill(0),
      v = new Array(size + 1).fill(0);
    const match = new Array(size + 1).fill(0),
      way = new Array(size + 1).fill(0);
    for (let i = 1; i <= rows; i++) {
      match[0] = i;
      let j0 = 0;
      const low = new Array(size + 1).fill(Infinity),
        used = new Array(size + 1).fill(false);
      for (;;) {
        used[j0] = true;
        const i0 = match[j0];
        let delta = Infinity,
          j1 = 0;
        for (let j = 1; j <= size; j++) {
          if (used[j]) continue;
          const cost =
            j <= columns && gains[i0 - 1][j - 1] > 0
              ? -gains[i0 - 1][j - 1]
              : 0;
          const reduced = cost - u[i0] - v[j];
          if (reduced < low[j]) {
            low[j] = reduced;
            way[j] = j0;
          }
          if (low[j] < delta) {
            delta = low[j];
            j1 = j;
          }
        }
        for (let j = 0; j <= size; j++) {
          if (used[j]) {
            u[match[j]] += delta;
            v[j] -= delta;
          } else {
            low[j] -= delta;
          }
        }
        j0 = j1;
        if (match[j0] === 0) break;
      }
      while (j0) {
        const j1 = way[j0];
        match[j0] = match[j1];
        j0 = j1;
      }
    }
    const out = new Array(rows).fill(null);
    for (let j = 1; j <= columns; j++)
      if (match[j] && gains[match[j] - 1][j - 1] > 0) out[match[j] - 1] = j - 1;
    return out;
  }

  // `${employee id}|${tool id}` -> coins over the days that tool in that member's hands adds against no tool, for every
  // tool fitting the company's good (warera/crews.py: tool_gains)
  function toolGains(
    there,
    members,
    value,
    start,
    horizon,
    refill,
    hires,
    tools,
    into,
  ) {
    const fitting = tools.filter((t) =>
      (TOOL_GOODS[t.type] || []).includes(there.item),
    );
    if (!fitting.length || !members.length) return;
    const bare = members.map((e) => holding(e, null, start));
    const base = crewProfit(
      there,
      bare.concat(hires),
      value,
      start,
      horizon,
      refill,
    );
    const seen = new Map();
    bare.forEach((e, i) => {
      for (const t of fitting) {
        const key = `${i}|${t.type}|${t.bonus}|${t.hours}`;
        if (!seen.has(key)) {
          const crew = bare.slice();
          crew[i] = holding(e, t, start);
          seen.set(
            key,
            crewProfit(
              there,
              crew.concat(hires),
              value,
              start,
              horizon,
              refill,
            )[i] - base[i],
          );
        }
        into[`${e.id}|${t.id}`] = seen.get(key);
      }
    });
  }

  // The best tools for crews as they stand: {assign (employee id -> tool id), gain, attached (what `attach` gives them)};
  // of equal ways, tools stay where they are (warera/crews.py: tool_match)
  function toolMatch(gains, order, tools, attach) {
    const rows = order
      .map((e) => e.id)
      .filter((i) => tools.some((t) => `${i}|${t.id}` in gains));
    const table = rows.map((i) =>
      tools.map(
        (t) =>
          (gains[`${i}|${t.id}`] || 0) +
          (t.holder === i && `${i}|${t.id}` in gains ? TIE_MOVE : 0),
      ),
    );
    const matched = {};
    bestAssignment(table).forEach((j, k) => {
      if (j !== null) matched[rows[k]] = tools[j].id;
    });
    const assign = sameKindStay(matched, rows, tools);
    let gain = 0,
      attached = 0;
    for (const i of rows) if (i in assign) gain += gains[`${i}|${assign[i]}`];
    for (const [i, id] of Object.entries(attach))
      attached += gains[`${i}|${id}`] || 0;
    return { assign, gain, attached };
  }

  // Tools of the same type and bonus as one kind: whoever gets a tool of a kind they already hold keeps their own,
  // the others of that kind get the rest of what the match gave it, in `rows` order (warera/crews.py: same_kind_stay)
  function sameKindStay(assign, rows, tools) {
    const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
    const kind = (id) => `${byId[id].type}|${byId[id].bonus}`;
    const kinds = [],
      out = {};
    for (const i of rows)
      if (i in assign && !kinds.includes(kind(assign[i])))
        kinds.push(kind(assign[i]));
    for (const k of kinds) {
      const takers = rows.filter((i) => i in assign && kind(assign[i]) === k);
      const own = {};
      for (const t of tools)
        if (t.holder && takers.includes(t.holder) && kind(t.id) === k)
          own[t.holder] = t.id;
      const kept = new Set(Object.values(own));
      const free = takers.map((i) => assign[i]).filter((id) => !kept.has(id));
      let next = 0;
      for (const i of takers) out[i] = i in own ? own[i] : free[next++];
    }
    const sorted = {};
    for (const i of rows) if (i in out) sorted[i] = out[i];
    return sorted;
  }

  // Who to try with which tool in a search that may then move them to where it fits: first each Handy, most Production
  // first, with a type they haven't tried (what they hold is then free for the next), taking one from someone not Handy
  // if none is spare; then the tools left to whoever has none (warera/crews.py: spare_tries). tried: Set of
  // `${employee}|${tool type}`, which grows.
  function spareTries(order, tools, assign, able, tried) {
    const byId = Object.fromEntries(tools.map((t) => [t.id, t]));
    const usable = (t) => (TOOL_GOODS[t.type] || []).some((g) => able.has(g));
    const attach = { ...assign };
    const taken = new Set(Object.values(attach));
    const rank = (a, b) => b.bonus - a.bonus || (a.id < b.id ? -1 : 1);
    const pool = tools.filter((t) => !taken.has(t.id) && usable(t)).sort(rank);
    const people = order
      .slice()
      .sort((a, b) => b.production - a.production || (a.id < b.id ? -1 : 1));
    const handy = new Set(
      people.filter((e) => has(e.traits, "handy")).map((e) => e.id),
    );
    for (const e of people) {
      if (!handy.has(e.id)) continue;
      const held = byId[attach[e.id]] || null;
      if (held) tried.add(`${e.id}|${held.type}`);
      let pick = pool.find((t) => !tried.has(`${e.id}|${t.type}`)) || null;
      if (pick) {
        pool.splice(pool.indexOf(pick), 1);
      } else {
        const others = Object.entries(attach)
          .filter(
            ([i, id]) =>
              !handy.has(i) &&
              usable(byId[id]) &&
              !tried.has(`${e.id}|${byId[id].type}`),
          )
          .map(([i, id]) => [byId[id], i])
          .sort((a, b) => rank(a[0], b[0]));
        if (others.length) {
          pick = others[0][0];
          delete attach[others[0][1]];
        }
      }
      if (pick) {
        attach[e.id] = pick.id;
        tried.add(`${e.id}|${pick.type}`);
        if (held && usable(held)) {
          pool.push(held);
          pool.sort(rank);
        }
      }
    }
    for (const t of pool) {
      const e = people.find(
        (x) =>
          !(x.id in attach) &&
          !tried.has(`${x.id}|${t.type}`) &&
          (!has(x.traits, "improviser") || t.bonus > IMPROVISER_BONUS),
      );
      if (e) {
        attach[e.id] = t.id;
        tried.add(`${e.id}|${t.type}`);
      }
    }
    return attach;
  }

  const attachKey = (attach) => JSON.stringify(Object.entries(attach).sort());

  // The best crews (`plan`), with input.tools ({opened, dismantled}) also who should hold each tool: the crews searched
  // with the tools as they are, the tools matched exactly to those crews, then other employees tried with the tools left
  // over, for as many rounds as give something new (warera/crews.py: reshuffle). Adds tools: [{...heldTools, to, gain}],
  // toolsOnly (what re-equipping adds with nobody moved).
  function reshuffle(input, progress = () => {}) {
    if (!input.tools) return plan(input, progress);
    const began = Date.now();
    const tools = heldTools(
      input.tools.opened,
      input.tools.dismantled,
      input.rosters,
    );
    const { employees } = build(input);
    const order = employees
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const worth = (found) =>
      found.objective + found.toolMatch.gain - found.toolMatch.attached;
    let attach = Object.fromEntries(
      tools.filter((t) => t.holder).map((t) => [t.holder, t.id]),
    );
    let best = null;
    const seen = new Set(),
      tried = new Set(),
      cache = new Map();
    for (let round = 0; round < TOOL_ROUNDS; round++) {
      seen.add(attachKey(attach));
      const found = plan(
        input,
        (text, share) =>
          progress(
            `${say("run.toolRound", round + 1)}: ${text}`,
            (0.8 * (round + share)) / TOOL_ROUNDS,
          ),
        tools,
        attach,
        true,
        cache,
      );
      if (best === null || worth(found) > best.worth + 1e-9)
        best = { worth: worth(found), assign: found.toolMatch.assign };
      if (Date.now() - began > TOOL_MS) break;
      attach = spareTries(
        order,
        tools,
        best.assign,
        new Set(found.toolMatch.able),
        tried,
      );
      if (seen.has(attachKey(attach))) break;
    }
    attach = best.assign;
    let result = null;
    for (let i = 0; i < 2; i++) {
      // the search with them in hand may find better crews, and those better tools
      result = plan(
        input,
        (text, share) => progress(text, 0.8 + 0.2 * share),
        tools,
        attach,
        false,
        cache,
      );
      const match = result.toolMatch;
      if (
        match.gain <= match.attached + 1e-9 ||
        attachKey(match.assign) === attachKey(attach)
      )
        break;
      attach = match.assign;
    }
    const holderOf = Object.fromEntries(
      Object.entries(result.toolMatch.assign).map(([i, id]) => [id, i]),
    );
    // a tool that fits someone's company in the plan but earns nobody more than its wear: worth more dismantled (its
    // scraps now; a used tool back in the inventory is shown as it dropped, so "up to")
    const fits = {};
    for (const [key, gain] of Object.entries(result.toolGains)) {
      const id = key.slice(key.indexOf("|") + 1);
      fits[id] = Math.max(fits[id] ?? -Infinity, gain);
    }
    return {
      ...result,
      seconds: (Date.now() - began) / 1000,
      scrapsPrice: input.scrapsPrice || 0,
      tools: tools.map((t) => ({
        ...t,
        to: holderOf[t.id] ?? null,
        gain: result.toolGains[`${holderOf[t.id]}|${t.id}`] || 0,
        scraps: dismantleScraps(t.code, t.hours),
        dismantle:
          !holderOf[t.id] &&
          t.id in fits &&
          fits[t.id] <= 0 &&
          (input.scrapsPrice || 0) > 0,
      })),
    };
  }

  // ---- the whole plan ----

  // input: {now, days, owner: {country, management, clickPP, regen}, companies: [records], rosters: [[records]],
  // regions: {id: {country, initialCountry}}, taxes: {country id: income tax %}, raw: [codes], values: {good: coins a PP},
  // engines: {company id: PP a day}, energyPerClick, managerCosts: {company id: coins an hour}, switching: null or
  // {extra, maxPerGood (null: no limit), concrete (its price)}}. progress(text, share done 0..1) is told what's going on,
  // at most every 100 ms.
  // tools (`reshuffle`): attach (employee id -> tool id) is who holds what in the plan, "as it is" stays with the tools as
  // they are now, and the result adds toolMatch, toolGains, toolsOnly. quick: no close calls or as-it-is tool check, for a
  // round before the last. cache: crews worked out in the other rounds.
  function plan(
    input,
    progress = () => {},
    tools = null,
    attach = null,
    quick = false,
    cache = null,
  ) {
    const started = Date.now();
    let told = 0;
    const tick = (text, share, now = false) => {
      const t = Date.now();
      if (now || t - told >= 100) {
        told = t;
        progress(text, Math.max(0, Math.min(1, share)));
      }
    };
    const { raw, companies, employees } = build(input);
    const now = input.now,
      horizon = input.days;
    const value = (c) => input.values[c.item] || 0;
    const active = companies.filter((c) => c.active);
    const byId = Object.fromEntries(companies.map((c) => [c.id, c]));
    const orderNow = employees
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const toolOf = Object.fromEntries((tools || []).map((t) => [t.id, t]));
    const order = tools
      ? orderNow.map((e) => holding(e, toolOf[(attach || {})[e.id]], now))
      : orderNow;
    const index = Object.fromEntries(order.map((e, i) => [e.id, i]));
    const n = order.length;
    const crewsNow = Object.fromEntries(
      companies.map((c) => [c.id, orderNow.filter((e) => e.company === c.id)]),
    );

    // the managers: where they run now, their cares, which can move
    const managers = managersOf(
      companies,
      order,
      input.managerCosts || {},
      now,
    );
    const cares = managers.map((m) => careParts(now, horizon, m.caredToday));
    const atNow = {},
      fixed = {};
    managers.forEach((m, j) => {
      atNow[m.company] = j;
      if (m.bonus === null) fixed[m.company] = j;
    });
    const movable = managers
      .map((_, j) => j)
      .filter((j) => managers[j].bonus !== null);
    // free seats in the disabled companies for a company move (their seats less the fewest the plan must park)
    const shield = Math.max(
      0,
      sum(companies.filter((c) => !c.active).map((c) => c.room)) -
        Math.max(0, n - sum(active.map((c) => c.room))),
    );
    // letting employees go (warera/crews.py: reshuffle's `firing`): new hires by the hire rule, training counted
    const firing = input.firing || null;
    let neutral = null,
      training = null,
      hiring = null,
      passShare = 0,
      candidates = [];
    const seatOf = {},
      refillOf = {};
    const run = (c, combo, j, moving = false, people = order) =>
      managedCrew(
        c,
        combo,
        people,
        value(c),
        now,
        horizon,
        j === null ? null : managers[j],
        j === null ? [] : cares[j],
        moving,
        shield,
        neutral,
        refillOf[`${c.id}:${c.item}`] || 0,
        training,
      );
    // product switches (warera/crews.py: reshuffle's `switching`): each active company may make one of its candidates
    const switching = input.switching || null;
    const cap = switching && switching.maxPerGood ? switching.maxPerGood : null;
    const extraGoods = switching
      ? cap
        ? Math.max(switching.extra, Math.ceil(active.length / cap))
        : switching.extra
      : 0;
    const goodsOf = active.map((c) =>
      switching ? candidateGoods(c, input.values, extraGoods) : [c.item],
    );
    const engineValue = (c, g) =>
      (input.engines[c.id] || 0) * (input.values[g] || 0);
    const switchCost = (c, g) =>
      g !== c.item ? CHANGE_CONCRETE * ((switching || {}).concrete || 0) : 0;
    const making = (c, g) =>
      g === c.item ? c : { ...c, item: g, raw: raw.has(g) };
    // company moves to another country (warera/crews.py: reshuffle's `relocating`)
    const relocating = input.relocating || null;
    const taxes = relocating ? relocating.taxes : {};
    const owner = relocating ? relocating.owner : null;
    const countries = relocating
      ? candidateCountries(order, owner, taxes, relocating.perksOnly)
      : [];
    const placesOf = active.map((c) =>
      [null].concat(
        countries.filter((x) => !(c.country === x && c.initialCountry === x)),
      ),
    );
    const moveCost = (c, x) =>
      x === null || (relocating.free || {})[c.id]
        ? 0
        : RELOCATION_CONCRETE * (relocating.concrete || 0);
    const placedIn = (c, x) =>
      x === null ? c : relocatedCompany(c, x, taxes[x] || 0, owner);
    // a crew with its manager in good g: the employees' coins, and with the engine less the switch (what's maximised)
    // cache.variant {id, tag}: that employee changed (a training card tried, `cardAllocation`), so crews with them differ
    const variant =
      cache && cache.variant && cache.variant.id in index
        ? index[cache.variant.id]
        : null;
    const runIn = (c, combo, j, g, x = null) => {
      // tools: a crew whose tools in hand count the same was worked out in an earlier round
      const key = cache
        ? `${c.id}:${j}:${g}:${x}:${combo.join(",")}:${combo
            .map((i) => {
              const t = order[i].tool;
              return t && (TOOL_GOODS[t[0]] || []).includes(g)
                ? `${t[1]}/${order[i].toolEnds}`
                : "";
            })
            .join(
              ",",
            )}${variant !== null && combo.includes(variant) ? `:${cache.variant.tag}` : ""}`
        : null;
      if (cache && cache.has(key)) return cache.get(key);
      const r = run(making(placedIn(c, x), g), combo, j, x !== null);
      const found = {
        ...r,
        good: g,
        place: x,
        objective:
          r.score +
          engineValue(c, g) * horizon -
          switchCost(c, g) -
          moveCost(c, x),
      };
      if (cache && cache.size < TOOL_CACHE) cache.set(key, found);
      return found;
    };
    if (firing && n && active.length) {
      // a free seat's value per company and good, from the candidates the hire rule takes
      tick(say("run.seatTraining"), 0, true);
      hiring = hiringOf(companies, orderNow, now);
      neutral = neutralOf(hiring, now);
      // the same in every round: worked out once
      training =
        (cache && cache.get("training")) ||
        trainingNow(
          companies,
          orderNow,
          input.values,
          now,
          horizon,
          firing.drawCost,
          firing.management,
          tools,
        );
      if (cache) cache.set("training", training);
      const found = hireCandidates(
        firing.rule || HIRE_RULE,
        active[0],
        hiring,
        now,
        firing.samples || HIRE_SAMPLES,
      );
      passShare = found[1];
      candidates = found[0];
      const tried = {},
        all = sum(goodsOf.map((g) => g.length));
      let done = 0;
      active.forEach((c, ci) =>
        goodsOf[ci].forEach((g) => {
          tick(say("run.seat", done + 1, all), (0.05 * done) / all, true);
          seatOf[`${c.id}:${g}`] = freeSeat(
            making(c, g),
            found[0],
            hiring,
            input.values[g] || 0,
            now,
            horizon,
            firing.drawCost,
            firing.management,
            tried,
          );
          refillOf[`${c.id}:${g}`] = refillRate(
            seatOf[`${c.id}:${g}`],
            horizon,
          );
          done += 1;
        }),
      );
    }
    const runnerNow = (c) => (c.id in atNow ? atNow[c.id] : null);
    const nowRuns = Object.fromEntries(
      active.map((c) => [
        c.id,
        run(
          c,
          crewsNow[c.id].map((e) => index[e.id]),
          runnerNow(c),
          false,
          orderNow,
        ),
      ]),
    );
    const nowRates = {};
    for (const c of active) {
      const j = runnerNow(c);
      careRates(
        c,
        crewsNow[c.id],
        value(c),
        now,
        j === null ? null : managers[j],
        nowRuns[c.id].care,
        j === null ? [] : cares[j],
      ).forEach((r, k) => {
        nowRates[crewsNow[c.id][k].id] = r;
      });
    }

    // where they work now: the model against the game's own estimate (the records as they are), coins a day (with the
    // manager's care as planned)
    const asItIs = orderNow.map((e) => {
      const company = byId[e.company];
      const h = hour(
        e,
        company,
        crewsNow[company.id].filter((x) => x !== e),
        now,
      );
      return {
        id: e.id,
        name: e.name,
        company: e.company,
        traits: traitNames(e),
        traitList: Object.entries(e.traits),
        production: h.production,
        tool: e.tool ? e.tool[0] : null,
        machines: h.engine > 0,
        happiness: h.happiness,
        bonus: h.bonus,
        output: h.output,
        wage: h.wage,
        quit: h.quit,
        estimate: e.estimate,
        matched:
          e.estimate !== undefined &&
          Math.abs(Math.round(h.output * 100) / 100 - e.estimate) <= 0.011,
        day:
          e.id in nowRates
            ? nowRates[e.id]
            : hourProfit(h, value(company)) * 24,
      };
    });
    const seats = sum(companies.filter((c) => !c.active).map((c) => c.room));
    const result = {
      toolGoods: TOOL_GOODS,
      companies: companies.map((c) => ({
        id: c.id,
        name: c.name,
        item: c.item,
        room: c.room,
        active: c.active,
        country: c.country,
        core: c.initialCountry === c.country,
        tax: c.tax,
        value: value(c),
        engine: c.active ? (input.engines[c.id] || 0) * value(c) : 0,
      })),
      employees: asItIs,
      matched: asItIs.filter((r) => r.matched).length,
      days: horizon,
      current: sum(active.map((c) => nowRuns[c.id].score)),
      dayNow: sum(
        active.map((c) => sum(crewsNow[c.id].map((e) => nowRates[e.id]))),
      ),
      selfWork: selfWork(active, value, input),
      nowCare: Object.fromEntries(
        active
          .filter((c) => runnerNow(c) !== null)
          .map((c) => [c.id, nowRuns[c.id].care]),
      ),
    };
    const describe = (to) =>
      managers.map((m, j) => ({
        company: m.company,
        bonus: m.bonus,
        cost: m.cost,
        caredToday: m.caredToday,
        to: to[j][0],
        care: to[j][1],
      }));
    if (!n || !active.length) {
      const enginesNow = sum(active.map((c) => engineValue(c, c.item)));
      return {
        ...result,
        total: result.current,
        dayAfter: result.dayNow,
        placed: {},
        plan: [],
        steps: [],
        stuck: [],
        managers: describe(managers.map((m) => [m.company, null])),
        managerSteps: [],
        managerStuck: [],
        exact: true,
        bound: null,
        starts: 0,
        objective: result.current + enginesNow * horizon,
        enginesNow,
        enginesAfter: enginesNow,
        switchCost: 0,
        switches: [],
        goods: {},
        switching: Boolean(switching),
        relocating: Boolean(relocating),
        places: {},
        moveCost: 0,
        companyMoves: [],
        neutral: [],
        owner,
        selfWorkAfter: result.selfWork,
        seconds: 0,
        toolGains: {},
        toolsOnly: 0,
        toolMatch: { assign: {}, gain: 0, attached: 0, able: [] },
      };
    }

    // every crew of every active company with each manager it can have: worth enumerating, and searching exactly?
    const need = Math.max(0, n - seats);
    const M = movable.length,
      bits = n + M;
    const runsCount = active.map((c) => (c.id in fixed ? 1 : 1 + M));
    const counts = active.map((c, k) => {
      let x = 0;
      for (let s = 0; s <= Math.min(c.room, n); s++) x += choose(n, s);
      return x * runsCount[k] * goodsOf[k].length * placesOf[k].length;
    });
    const roomList = active.map((c) => c.room);
    const ops = sum(
      active.map((_, c) => exactCost(n, M, roomList, runsCount, c)),
    );
    const exact = bits <= EXACT_MAX && ops <= EXACT_OPS;
    const memo = new Map();
    const score = (company, combo, j, g, x = null) => {
      const key =
        company.id + ":" + j + ":" + g + ":" + x + ":" + combo.join(",");
      if (!memo.has(key)) memo.set(key, runIn(company, combo, j, g, x));
      return memo.get(key);
    };
    // what the search maximises: of equal plans the one with the fewest moves (warera/crews.py: TIE_MOVE)
    const tied = (r) => r.objective - TIE_MOVE * r.incoming;
    const where = Object.fromEntries(active.map((c) => [c.id, null]));
    const runner = {},
      placedActive = {},
      goods = Object.fromEntries(active.map((c) => [c.id, c.item]));
    let total,
      bound = null;
    let exactFits = exact;
    const setPlan = (assignOf, runnerOf, goodOf, placeOf) => {
      // the plan found: employees, managers, goods, places
      for (const id of Object.keys(placedActive)) delete placedActive[id];
      Object.assign(placedActive, assignOf);
      active.forEach((c) => {
        runner[c.id] = runnerOf(c);
        goods[c.id] = goodOf(c);
        where[c.id] = placeOf(c);
      });
    };
    // letting go: how many new hires can be found how fast, and paid for in energy (warera/crews.py: reshuffle)
    const hiresAt = Object.fromEntries(active.map((c) => [c.id, 0]));
    let fire = null,
      seatNow = {},
      useLocal = false,
      tableAlts = null;
    const waitedSeats = (N) =>
      Object.fromEntries(
        Object.entries(seatOf).map(([key, s]) => [
          key,
          waited(s, averageWait(N, fire.rate), horizon),
        ]),
      );
    if (firing) {
      const spare = sum(
        companies.map((c) => Math.max(0, c.room - crewsNow[c.id].length)),
      );
      const seatList = Object.values(seatOf),
        finite = seatList.filter((s) => Number.isFinite(s.value));
      const rate = keepersADay(
        companies.length,
        passShare,
        seatList.length ? mean(seatList.map((s) => s.keep)) : 0,
        spare,
        hiring.recruiter,
      );
      let draws = 0;
      for (const e of order)
        if (training[e.id] > 0) draws += Math.min(drawsLeft(e), horizon);
      const energyLeft = Math.max(
        0,
        (firing.energy || 0) * horizon - HIRE_ENERGY * draws,
      );
      const perHire = finite.length ? mean(finite.map((s) => s.energy)) : 0;
      fire = {
        rate,
        energyHires: perHire > 0 ? Math.floor(energyLeft / perHire) : 0,
        energyLeft,
        margin: firing.margin ?? FIRING_MARGIN,
        seatsTotal: sum(active.map((c) => c.room)),
        allowed: 0,
        close: {},
        cut: false,
        pending: [],
      };
      seatNow = waitedSeats(0);
    }
    if (exact && !firing) {
      const all = sum(counts);
      let done = 0;
      // every crew with each manager, its objective in each candidate good (and the care target there)
      const crews = active.map((c, ci) => {
        const list = [];
        const runs = c.id in fixed ? [fixed[c.id]] : [null].concat(movable);
        for (const j of runs) {
          const bit =
            j !== null && movable.includes(j)
              ? 1 << (n + movable.indexOf(j))
              : 0;
          for (let s = 0; s <= Math.min(c.room, n); s++) {
            for (const combo of combinations(n, s)) {
              let mask = bit;
              for (const i of combo) mask |= 1 << i;
              const objs = [],
                cares_ = [],
                locs = [];
              for (const g of goodsOf[ci]) {
                // each good in its best place
                let r = null;
                for (const x of placesOf[ci]) {
                  const y = runIn(c, combo, j, g, x);
                  if (r === null || y.objective > r.objective) r = y;
                  done += 1;
                }
                objs.push(r.objective);
                cares_.push(r.care);
                locs.push(r.place);
              }
              list.push({
                mask,
                score: 0,
                k: 0,
                j,
                objs,
                cares: cares_,
                locs,
                combo,
                incoming: combo.filter((i) => order[i].company !== c.id).length,
              });
              tick(say("run.simulating", done, all), (0.9 * done) / all);
            }
          }
        }
        return list;
      });
      // each crew in its best good less the good's price (`lambda`: 0 = the best overall)
      const union = [...new Set(goodsOf.flat())];
      const lambda = Object.fromEntries(union.map((g) => [g, 0]));
      const price = () =>
        crews.forEach((list, ci) =>
          list.forEach((e) => {
            let bk = 0,
              bv = -Infinity;
            e.objs.forEach((v, k) => {
              const x = v - lambda[goodsOf[ci][k]];
              if (x > bv) {
                bv = x;
                bk = k;
              }
            });
            e.score = bv - TIE_MOVE * e.incoming;
            e.k = bk;
          }),
        );
      const used = (best) => {
        const count = {};
        best.picks.forEach((p, ci) => {
          const g = goodsOf[ci][p.k];
          count[g] = (count[g] || 0) + 1;
        });
        return count;
      };
      const fits = (best) =>
        !cap || Object.values(used(best)).every((k) => k <= cap);
      const real = (best) =>
        sum(best.picks.map((p) => p.objs[p.k] - TIE_MOVE * p.incoming));
      const takePicks = (best) =>
        setPlan(
          Object.fromEntries(
            best.picks.flatMap((p, ci) =>
              p.combo.map((i) => [order[i].id, active[ci].id]),
            ),
          ),
          (c) => best.picks[active.indexOf(c)].j,
          (c) => goodsOf[active.indexOf(c)][best.picks[active.indexOf(c)].k],
          (c) =>
            best.picks[active.indexOf(c)].locs[best.picks[active.indexOf(c)].k],
        );
      price();
      let best = exactSearch(active, crews, bits, n, need, (c) =>
        tick(
          say("run.split", c + 1, active.length),
          0.9 + (0.08 * c) / active.length,
          true,
        ),
      );
      if (!best) throw new Error("no plan fits the seats");
      if (fits(best)) {
        total = real(best);
        takePicks(best);
      } else {
        // too many companies on a good: the local search's plan (the exact one with the goods over the cap switched to
        // the next candidate with room, improved) is the floor; then a price on each good over the cap, raised until the
        // exact search's plan fits (Lagrangian relaxation): each price gives a ceiling (no plan can do better), and a
        // plan that fits at those prices may beat the floor. Floor = ceiling: the best plan, proved.
        takePicks(best);
        const count = {};
        const gStart = active.map((c) => goods[c.id]);
        gStart.forEach((g) => {
          count[g] = (count[g] || 0) + 1;
        });
        active.forEach((c, ci) => {
          if (count[gStart[ci]] <= cap) return;
          const g = goodsOf[ci].find((x) => (count[x] || 0) < cap);
          count[gStart[ci]] -= 1;
          gStart[ci] = g;
          count[g] = (count[g] || 0) + 1;
        });
        const fixedAt = {};
        for (const c of active) if (c.id in fixed) fixedAt[c.id] = fixed[c.id];
        const mStart = movable.map((j) => {
          const c = active.find((x) => runner[x.id] === j);
          return c ? c.id : null;
        });
        const scoreOf = (c, members, k, g, x) =>
          tied(
            score(
              c,
              members,
              k === null ? null : c.id in fixed ? k : movable[k],
              g,
              x,
            ),
          );
        tick(say("run.capSwitch"), 0.9, true);
        const floor = localPlan(
          active,
          n,
          scoreOf,
          order.map((e) => placedActive[e.id] ?? null),
          seats,
          {
            mStart,
            fixedAt,
            deep: true,
            gStart,
            goodsOf,
            cap,
            lStart: active.map((c) => where[c.id]),
            placesOf: relocating ? placesOf : null,
          },
        );
        let lb = floor.total,
          ub = best.total,
          fromPicks = null;
        let theta = 1,
          stale = 0;
        const began = Date.now();
        for (
          let it = 0;
          it < LAGRANGE_ITERS &&
          ub - lb > 1e-6 * Math.max(1, Math.abs(lb)) &&
          Date.now() - began < LAGRANGE_MS;
          it++
        ) {
          tick(
            say("run.capRound", it + 1, signedText(ub - lb)),
            0.9 + (0.08 * it) / LAGRANGE_ITERS,
            true,
          );
          const count_ = used(best);
          const sub = union.map((g) => (count_[g] || 0) - cap);
          const dual = best.total + cap * sum(union.map((g) => lambda[g]));
          const norm = sum(
            sub.map((x, k) => (x > 0 || lambda[union[k]] > 0 ? x * x : 0)),
          );
          if (!norm) break;
          const step = (theta * (dual - lb)) / norm;
          union.forEach((g, k) => {
            lambda[g] = Math.max(0, lambda[g] + step * sub[k]);
          });
          price();
          best = exactSearch(active, crews, bits, n, need);
          const value = best.total + cap * sum(union.map((g) => lambda[g]));
          if (value < ub - 1e-9) {
            ub = value;
            stale = 0;
          } else if (++stale >= 3) {
            theta /= 2;
            stale = 0;
          }
          if (fits(best) && real(best) > lb + 1e-9) {
            lb = real(best);
            fromPicks = { picks: best.picks.map((p) => ({ ...p })) };
          }
        }
        total = lb;
        exactFits = ub - lb <= 1e-6 * Math.max(1, Math.abs(lb));
        bound = exactFits ? null : ub + TIE_MOVE * n; // what no plan can beat, moves or none
        if (fromPicks) {
          takePicks(fromPicks);
        } else {
          setPlan(
            Object.fromEntries(
              floor.assign.flatMap((cid, i) =>
                cid === null ? [] : [[order[i].id, cid]],
              ),
            ),
            (c) =>
              c.id in fixed
                ? fixed[c.id]
                : (() => {
                    const k = floor.mAt.indexOf(c.id);
                    return k < 0 ? null : movable[k];
                  })(),
            (c) => floor.gAt[active.indexOf(c)],
            (c) => floor.lAt[active.indexOf(c)],
          );
        }
      }
    } else if (exact) {
      // letting go, exactly: every crew with each number of new hires, each good in its best place; for each number of
      // hires N (each seat waiting N's wait) the best plan with at most N hires, the best N kept
      const margin = fire.margin,
        all = sum(counts);
      let done = 0;
      const crews = active.map((c, ci) => {
        const list = [];
        const runs = c.id in fixed ? [fixed[c.id]] : [null].concat(movable);
        for (const j of runs) {
          const bit =
            j !== null && movable.includes(j)
              ? 1 << (n + movable.indexOf(j))
              : 0;
          for (let s = 0; s <= Math.min(c.room, n); s++) {
            for (const combo of combinations(n, s)) {
              let mask = bit;
              for (const i of combo) mask |= 1 << i;
              const per = goodsOf[ci].map((g) =>
                placesOf[ci].map((x) => {
                  done += 1;
                  return runIn(c, combo, j, g, x);
                }),
              );
              const adj =
                margin * horizon * combo.length - TIE_MOVE * per[0][0].incoming;
              for (let k = 0; k < per[0][0].byK.length; k++) {
                const base = [],
                  cares_ = [],
                  locs = [];
                for (const options of per) {
                  // each good in its best place
                  let r = null,
                    v = -Infinity;
                  for (const y of options) {
                    const w =
                      y.objective - y.score + y.training + sum(y.byK[k][1]);
                    if (r === null || w > v) {
                      r = y;
                      v = w;
                    }
                  }
                  base.push(v);
                  cares_.push(r.byK[k][2]);
                  locs.push(r.place);
                }
                list.push({
                  mask,
                  hires: k,
                  score: 0,
                  k: 0,
                  j,
                  base,
                  objs: base.slice(),
                  cares: cares_,
                  locs,
                  combo,
                  adj,
                });
              }
              tick(
                say("run.simulating", done, all),
                0.05 + (0.85 * done) / all,
              );
            }
          }
        }
        return list;
      });
      const priced = () =>
        crews.forEach((list, ci) =>
          list.forEach((e) => {
            e.objs = e.base.map(
              (b, gi) =>
                b +
                e.hires * seatNow[`${active[ci].id}:${goodsOf[ci][gi]}`] +
                e.adj,
            );
            let bk = 0,
              bv = -Infinity;
            e.objs.forEach((v, k) => {
              if (v > bv) {
                bv = v;
                bk = k;
              }
            });
            e.score = bv;
            e.k = bk;
          }),
        );
      const realOf = (picks) => sum(picks.map((p) => p.objs[p.k] - p.adj));
      const snap = (picks) => picks.map((p) => ({ ...p })); // a plan's picks as they are (pricing changes k)
      const union = [...new Set(goodsOf.flat())];
      const usedGoods = (picks) => {
        const count = {};
        picks.forEach((p, ci) => {
          const g = goodsOf[ci][p.k];
          count[g] = (count[g] || 0) + 1;
        });
        return count;
      };
      const fitsCap = (picks) =>
        !cap || Object.values(usedGoods(picks)).every((k) => k <= cap);
      // the best plan with n hires found one after another (each seat waits n's wait), at most `most`; one over the
      // cap on goods: {misfit} (the local search then)
      const solveAt = (N, most = N) => {
        seatNow = waitedSeats(N);
        priced();
        const H = Math.min(most, fire.energyHires);
        if ((H + 1) * 2 ** bits * active.length > HIRE_TABLES) return null;
        const r = exactSearchHires(active, crews, bits, H, (c) =>
          tick(
            say("run.splitHires", N, c + 1, active.length),
            0.9 + (0.08 * c) / active.length,
            true,
          ),
        );
        if (!r) return null;
        return fitsCap(r.picks)
          ? { ...r, picks: snap(r.picks), real: realOf(r.picks), seatNow, N }
          : { misfit: true };
      };
      let best = null;
      for (let N = 0; ; N++) {
        const found = solveAt(N);
        if (!found) {
          fire.cut = true;
          break;
        }
        if (found.misfit) {
          best = null;
          break;
        }
        if (!best || found.real > best.real) best = found;
        if (
          sum(found.picks.map((x) => x.hires)) < N ||
          N >= Math.min(fire.seatsTotal, fire.energyHires)
        )
          break;
      }
      useLocal = !best;
      if (!useLocal) {
        seatNow = best.seatNow;
        priced();
        fire.allowed = best.N;
        total = best.real;
        setPlan(
          Object.fromEntries(
            best.picks.flatMap((x, ci) =>
              x.combo.map((i) => [order[i].id, active[ci].id]),
            ),
          ),
          (c) => best.picks[active.indexOf(c)].j,
          (c) => goodsOf[active.indexOf(c)][best.picks[active.indexOf(c)].k],
          (c) =>
            best.picks[active.indexOf(c)].locs[best.picks[active.indexOf(c)].k],
        );
        best.picks.forEach((x, ci) => {
          hiresAt[active[ci].id] = x.hires;
        });
      }
      // the best plan without each of `kept` from the exact tables, for the close calls (whichever search made the plan):
      // the same hires at the same wait (at most n, n's wait) and one more hire at the wait one more takes (user,
      // 2026-10-31: one more at the same wait made every replacement look 30-100 coins better when the plan hired
      // nobody, its wait 0). {alts: {i: [{real, fits}]}, complete}
      tableAlts = (kept, N) => {
        const alts = Object.fromEntries(kept.map((i) => [i, []]));
        let complete = true;
        for (const H of [N, N + 1]) {
          if (H > N && H > Math.min(fire.seatsTotal, fire.energyHires))
            continue;
          const most = Math.min(H, fire.energyHires);
          if ((most + 1) * 2 ** bits * active.length > HIRE_TABLES) {
            complete = false;
            continue;
          }
          seatNow = waitedSeats(H);
          priced();
          const r = exactSearchHires(active, crews, bits, most);
          if (!r) {
            complete = false;
            continue;
          }
          // everyone else kept stays (user, 2026-10-31: else the plan without one could let a second go too)
          let keptMask = 0;
          for (const i of kept) keptMask |= 1 << i;
          for (const i of kept) {
            const need = keptMask & ~(1 << i);
            let top = -Infinity,
              th = -1,
              tm = -1;
            r.dp.forEach((row, h) => {
              for (let m = 0; m < row.length; m++) {
                if (!(m & (1 << i)) && (m & need) === need && row[m] > top) {
                  top = row[m];
                  th = h;
                  tm = m;
                }
              }
            });
            if (tm < 0) continue;
            const alt = backtrack(crews, r.choice, th, tm);
            alts[i].push({ real: realOf(alt), fits: fitsCap(alt) });
          }
        }
        return { alts, complete };
      };
    }
    // the local search's pieces: moves and swaps (employees, then managers) from the setup now and from random starts
    const start = order.map((e) => (byId[e.company].active ? e.company : null));
    const mStart = movable.map((j) =>
      byId[managers[j].company].active ? managers[j].company : null,
    );
    const fixedAt = {};
    for (const c of active) if (c.id in fixed) fixedAt[c.id] = fixed[c.id];
    const outCap = firing ? n : seats;
    // a crew's objective; letting go: with its best number of new hires at the seats' value now, the margin and the
    // tie-breaker (warera/crews.py: rescored)
    const scoreOf = (c, members, k, g, x) => {
      const r = score(
        c,
        members,
        k === null ? null : c.id in fixed ? k : movable[k],
        g,
        x,
      );
      if (!firing) return tied(r);
      const seat = seatNow[`${c.id}:${g}`];
      const [hires, profits] = withHires(r, seat);
      return (
        r.objective -
        r.score +
        r.training +
        sum(profits) +
        hires * seat +
        fire.margin * horizon * members.length -
        TIE_MOVE * r.incoming
      );
    };
    // the goods to start from: as now, with any good over the cap switched to the next candidate with room
    const gStart = active.map((c) => c.item),
      count = {};
    gStart.forEach((g) => {
      count[g] = (count[g] || 0) + 1;
    });
    if (cap) {
      active.forEach((c, ci) => {
        if (count[gStart[ci]] <= cap) return;
        const g = goodsOf[ci].find((x) => (count[x] || 0) < cap);
        count[gStart[ci]] -= 1;
        gStart[ci] = g;
        count[g] = (count[g] || 0) + 1;
      });
    }
    const lp = {
      fixedAt,
      gStart,
      goodsOf: switching ? goodsOf : null,
      cap,
      placesOf: relocating ? placesOf : null,
    };
    const searched = (label) => {
      const rnd = random(29);
      let best = localPlan(active, n, scoreOf, start, outCap, {
        ...lp,
        mStart,
      });
      for (let r = 0; r < RESTARTS; r++) {
        tick(
          say("run.local", label, r + 2, RESTARTS + 1, signedText(best.total)),
          (0.98 * (r + 1)) / (RESTARTS + 1),
        );
        const people = shuffle(
          order.map((_, i) => i),
          rnd,
        );
        const assign = new Array(n).fill(null);
        const free = Object.fromEntries(active.map((c) => [c.id, c.room]));
        let out = 0;
        for (const i of people) {
          const open = active.filter((c) => free[c.id] > 0);
          if (open.length && (out >= outCap || rnd() < 0.9)) {
            const c = open[Math.floor(rnd() * open.length)];
            assign[i] = c.id;
            free[c.id] -= 1;
          } else {
            out += 1;
          }
        }
        if (out > outCap) continue;
        const places = M
          ? shuffle(
              active.filter((c) => !(c.id in fixed)).map((c) => c.id),
              rnd,
            )
          : [];
        const tried = localPlan(active, n, scoreOf, assign, outCap, {
          ...lp,
          mStart: movable.map((_, k) => places[k] ?? null),
        });
        if (tried.total > best.total + 1e-9) best = tried;
      }
      if (M || switching || relocating) {
        // the best plan polished: each manager move, switch or company move with the employees settled
        tick(say("run.polish", label), 0.98, true);
        const polished = localPlan(active, n, scoreOf, best.assign, outCap, {
          ...lp,
          mStart: best.mAt,
          gStart: best.gAt,
          lStart: best.lAt,
          deep: true,
        });
        if (polished.total > best.total + 1e-9) best = polished;
      }
      return best;
    };
    // the hires of a local plan, company by company (each crew's best number at the seats' value now)
    const hiresOf = (best) =>
      active.map((c, ci) => {
        const members = best.assign
          .map((cid, i) => (cid === c.id ? i : -1))
          .filter((i) => i >= 0);
        const k =
          c.id in fixed
            ? fixed[c.id]
            : (() => {
                const x = best.mAt.indexOf(c.id);
                return x < 0 ? null : x;
              })();
        const r = score(
          c,
          members,
          k === null ? null : c.id in fixed ? k : movable[k],
          best.gAt[ci],
          best.lAt[ci],
        );
        return withHires(r, seatNow[`${c.id}:${best.gAt[ci]}`])[0];
      });
    // a local plan with its best hires at their true wait: for each number of hires u, the best hires per company
    // with at most u in all (a small table over the companies), each seat waiting u's wait; the best u kept. `fixed_`:
    // {seats, most}: only at most `most` hires, the seats valued as given (a close call: the plan's own wait)
    const hired = (best, fixed_ = null) => {
      const runs = active.map((c, ci) => {
        const members = best.assign
          .map((cid, i) => (cid === c.id ? i : -1))
          .filter((i) => i >= 0);
        const k =
          c.id in fixed
            ? fixed[c.id]
            : (() => {
                const x = best.mAt.indexOf(c.id);
                return x < 0 ? null : movable[x];
              })();
        return score(c, members, k, best.gAt[ci], best.lAt[ci]);
      });
      let top = null;
      for (
        let u = fixed_ ? fixed_.most : 0;
        u <= (fixed_ ? fixed_.most : fire.seatsTotal);
        u++
      ) {
        const seats_ = fixed_ ? fixed_.seats : waitedSeats(u);
        let table = [0],
          ways = []; // table[h]: the best with h hires so far
        runs.forEach((r, ci) => {
          const seat = seats_[`${active[ci].id}:${best.gAt[ci]}`];
          const next = new Array(
            Math.min(u, table.length - 1 + r.byK.length - 1) + 1,
          ).fill(-Infinity);
          const way = next.map(() => -1);
          table.forEach((v, h) => {
            if (v === -Infinity) return;
            r.byK.forEach(([k, profits]) => {
              if (h + k > u) return;
              const x =
                v +
                r.objective -
                r.score +
                r.training +
                sum(profits) +
                k * seat;
              if (x > next[h + k]) {
                next[h + k] = x;
                way[h + k] = k;
              }
            });
          });
          table = next;
          ways.push(way);
        });
        let h = 0;
        table.forEach((v, i) => {
          if (v > table[h]) h = i;
        });
        if (top && table[h] <= top.real) continue;
        const real = table[h],
          ks = new Array(runs.length);
        for (let ci = runs.length - 1; ci >= 0; ci--) {
          ks[ci] = ways[ci][h];
          h -= ks[ci];
        }
        top = { real, ks, u, seats: seats_ };
      }
      return top;
    };
    if (!exact || useLocal) {
      // too many employees for the exact search (or letting go over a cap on goods)
      let best;
      if (firing) {
        // each number of hires N in turn (the seats' value at N's wait in the search), as warera/crews.py's local
        // search, until a plan hires N or fewer, and two more (a plan with more hires may still pay: AdmiraalAap
        // 2026-10-31); every plan valued with its best hires at their true wait
        let top = null,
          last = Infinity;
        for (let N = 0; N <= Math.min(last + 2, fire.seatsTotal); N++) {
          seatNow = waitedSeats(N);
          const found = searched(say("run.localHires", N));
          const h = hired(found);
          if (!top || h.real > top.real) top = { ...h, found };
          if (last === Infinity && sum(hiresOf(found)) <= N) last = N;
        }
        best = top.found;
        seatNow = top.seats;
        fire.allowed = top.u;
        top.ks.forEach((k, ci) => {
          hiresAt[active[ci].id] = k;
        });
        fire.close = {};
        best = { ...best, total: top.real }; // the plan's coins, without the margin and the tie-breaker
      } else {
        best = searched("");
      }
      total = best.total;
      for (const id of Object.keys(placedActive)) delete placedActive[id];
      best.assign.forEach((cid, i) => {
        if (cid !== null) placedActive[order[i].id] = cid;
      });
      active.forEach((c, ci) => {
        goods[c.id] = best.gAt[ci];
        where[c.id] = best.lAt[ci];
        if (c.id in fixed) runner[c.id] = fixed[c.id];
        else {
          const k = best.mAt.indexOf(c.id);
          runner[c.id] = k < 0 ? null : movable[k];
        }
      });
    }

    if (fire && !quick) {
      // close calls: kept within the margin, what letting each go would gain. From the exact tables when they can say
      // (the plan without them fits the cap on goods); else the plan with them taken out, improved by the local
      // search with them kept out, each case searched with the seats it's judged by (`hired`: their best hires)
      tick(say("run.close"), 0.99, true);
      const plan = {
        assign: order.map((e) => placedActive[e.id] ?? null),
        mAt: movable.map((j) => {
          const c = active.find((x) => runner[x.id] === j);
          return c ? c.id : null;
        }),
        gAt: active.map((c) => goods[c.id]),
        lAt: active.map((c) => where[c.id]),
      };
      const sameWait = waitedSeats(fire.allowed);
      const oneMore =
        fire.allowed < Math.min(fire.seatsTotal, fire.energyHires)
          ? waitedSeats(fire.allowed + 1)
          : null;
      const kept = order
        .map((_, i) => i)
        .filter((i) => plan.assign[i] !== null);
      const tables = tableAlts ? tableAlts(kept, fire.allowed) : null;
      seatNow = sameWait;
      const base = hired(plan, { seats: sameWait, most: fire.allowed }).real;
      for (const i of kept) {
        const list = tables && tables.complete ? tables.alts[i] : null;
        let gain = -Infinity;
        if (list && list.length && list.every((x) => x.fits)) {
          gain = Math.max(...list.map((x) => x.real)) - base;
        } else {
          fire.pending.push(i);
          const out = (c, members, k, g, x) =>
            members.includes(i) ? -1e15 : scoreOf(c, members, k, g, x);
          const assign = plan.assign.slice();
          assign[i] = null;
          // nobody else let go: the search can't cap the hires, and at a short wait it would let go many more
          for (const [seats_, most] of [
            [sameWait, fire.allowed],
            ...(oneMore ? [[oneMore, fire.allowed + 1]] : []),
          ]) {
            seatNow = seats_;
            const alt = localPlan(
              active,
              n,
              out,
              assign,
              assign.filter((x) => x === null).length,
              {
                ...lp,
                mStart: plan.mAt,
                gStart: plan.gAt,
                lStart: plan.lAt,
                deep: Boolean(M || switching || relocating),
              },
            );
            gain = Math.max(
              gain,
              hired(alt, { seats: seats_, most }).real - base,
            );
          }
          seatNow = sameWait;
        }
        if (gain > -fire.margin * horizon) fire.close[order[i].id] = gain;
      }
    }

    // the plan: each company's crew, manager and care; the rate right after the moves
    let dayAfter = 0;
    const to = {};
    let employeesTotal = 0;
    const gains = {};
    const finalPlan = active.map((c) => {
      const combo = order
        .map((e, i) => (placedActive[e.id] === c.id ? i : -1))
        .filter((i) => i >= 0);
      const j = runner[c.id] ?? null;
      const there = making(placedIn(c, where[c.id]), goods[c.id]);
      const r = run(there, combo, j, where[c.id] !== null);
      // letting go: the crew with its new hires (their seats at the value the plan counted)
      const [hires, profits, care] = firing
        ? r.byK[hiresAt[c.id]]
        : [0, r.profits, r.care];
      const seat = firing ? seatNow[`${c.id}:${goods[c.id]}`] : 0;
      employeesTotal += firing
        ? sum(profits) + r.training + hires * seat
        : r.score;
      const out =
        where[c.id] !== null
          ? shieldedIds(
              combo.map((i) => order[i]),
              shield,
            )
          : new Set();
      const crew = combo.map((i) =>
        arriving(order[i], c, now, where[c.id] !== null, out.has(order[i].id)),
      );
      const rates = careRates(
        there,
        crew,
        value(there),
        now,
        j === null ? null : managers[j],
        care,
        j === null ? [] : cares[j],
      );
      dayAfter += sum(rates);
      if (j !== null) to[j] = [c.id, care];
      if (tools) {
        const runBy = {
          ...there,
          manager: j !== null ? managers[j].bonus || 0 : 0,
        };
        const cared = crew.map((e) =>
          j !== null && e.id === care
            ? { ...e, happiness: e.happiness.concat(cares[j]) }
            : e,
        );
        const fresh = [];
        for (let k = 0; firing && k < hiresAt[c.id]; k++)
          fresh.push(neutral(runBy, k));
        toolGains(
          runBy,
          cared,
          value(there),
          now,
          horizon,
          refillOf[`${c.id}:${goods[c.id]}`] || 0,
          fresh,
          tools,
          gains,
        );
      }
      return {
        company: c.id,
        manager: j,
        care,
        good: goods[c.id],
        engine: engineValue(c, goods[c.id]),
        place: where[c.id],
        hires,
        seat,
        members: combo.map((i, k) => ({
          id: order[i].id,
          profit: profits[k],
          day: rates[k],
          training: firing ? training[order[i].id] || 0 : 0,
        })),
      };
    });
    const switches = active
      .filter((c) => goods[c.id] !== c.item)
      .map((c) => ({
        company: c.id,
        from: c.item,
        to: goods[c.id],
        cost: switchCost(c, goods[c.id]),
        emptyFirst: raw.has(c.item) !== raw.has(goods[c.id]) && c.stock > 1,
      }));
    const taken = new Set(Object.values(to).map((x) => x[0]));
    managers.forEach((m, j) => {
      // not placed (nothing to gain): stays, or takes a company without one
      if (j in to) return;
      const where = !taken.has(m.company)
        ? m.company
        : companies.find((c) => !taken.has(c.id)).id;
      to[j] = [where, null];
      taken.add(where);
    });
    const placed = firing
      ? { ...placedActive }
      : { ...park(companies, order, placedActive), ...placedActive };
    // the keep rule in game terms for the company the next hire goes to: the most new hires, else the best one more
    const guideOf = () => {
      if (!candidates.length) return null;
      const seatIn = (c) => seatOf[`${c.id}:${goods[c.id]}`];
      // a company where a hire can go: hires planned or a free seat after the moves (any, if none has one)
      const open = (c) =>
        hiresAt[c.id] > 0 ||
        c.room >
          Object.values(placedActive).filter((x) => x === c.id).length +
            hiresAt[c.id];
      const finite = active.filter((c) => Number.isFinite(seatIn(c).value));
      const usable = finite.some(open) ? finite.filter(open) : finite;
      if (!usable.length) return null;
      const extra = (c) =>
        waited(seatIn(c), averageWait(fire.allowed + 1, fire.rate), horizon);
      const c = usable.reduce((a, b) =>
        hiresAt[b.id] > hiresAt[a.id] ||
        (hiresAt[b.id] === hiresAt[a.id] && extra(b) > extra(a))
          ? b
          : a,
      );
      const there = making(c, goods[c.id]); // as the seats: at the company's place now
      tick(say("run.guide"), 0.99, true);
      return {
        company: c.id,
        peek: seatIn(c).peek,
        ...keepGuide(
          there,
          candidates,
          hiring,
          input.values[goods[c.id]] || 0,
          now,
          horizon,
          firing.drawCost,
          firing.management,
          seatIn(c).keepFromPlain,
        ),
      };
    };

    const moves = order
      .filter((e) => placed[e.id] !== e.company)
      .map((e) => [e.id, e.company, placed[e.id] ?? null]);
    const rooms = Object.fromEntries(companies.map((c) => [c.id, c.room]));
    const occupied = Object.fromEntries(
      companies.map((c) => [c.id, crewsNow[c.id].length]),
    );
    const spare = companies
      .filter((c) => !c.active)
      .map((c) => c.id)
      .concat(active.map((c) => c.id));
    tick(say("run.order"), 0.98, true);
    const { steps, stuck } = movePlan(moves, rooms, occupied, spare);
    // managers: one a company, so a manager moving into a company that has one swaps them
    const mMoves = managers
      .map((m, j) => [`manager:${j}`, m.company, to[j][0]])
      .filter((x) => x[1] !== x[2]);
    const mRooms = Object.fromEntries(companies.map((c) => [c.id, 1]));
    const mOccupied = Object.fromEntries(
      companies.map((c) => [c.id, c.id in atNow ? 1 : 0]),
    );
    const managerPlan = movePlan(mMoves, mRooms, mOccupied, spare);
    // without letting go the search's total carries the tie-breaker: the plan's coins from its crews
    const objective = firing
      ? total
      : employeesTotal -
        sum(
          active.map(
            (c) => switchCost(c, goods[c.id]) + moveCost(c, where[c.id]),
          ),
        ) +
        sum(active.map((c) => engineValue(c, goods[c.id]))) * horizon;
    let toolsOnly = 0;
    if (tools && !quick) {
      // what the best tools add with everyone staying where they are
      const here = {};
      for (const c of active) {
        const j = runnerNow(c);
        const runBy = {
          ...c,
          manager: j !== null ? managers[j].bonus || 0 : 0,
        };
        const cared = crewsNow[c.id].map((e) =>
          j !== null && e.id === nowRuns[c.id].care
            ? { ...e, happiness: e.happiness.concat(cares[j]) }
            : e,
        );
        toolGains(
          runBy,
          cared,
          value(c),
          now,
          horizon,
          refillOf[`${c.id}:${c.item}`] || 0,
          [],
          tools,
          here,
        );
      }
      const held = toolMatch(
        here,
        orderNow,
        tools,
        Object.fromEntries(
          tools.filter((t) => t.holder).map((t) => [t.holder, t.id]),
        ),
      );
      toolsOnly = held.gain - held.attached;
    }
    return {
      ...result,
      objective,
      total: employeesTotal,
      dayAfter,
      placed,
      plan: finalPlan,
      steps,
      stuck,
      toolGains: gains,
      toolsOnly,
      toolMatch: tools
        ? {
            ...toolMatch(gains, order, tools, attach || {}),
            able: [...new Set(goodsOf.flat())],
          }
        : null,
      exact: exactFits && !useLocal,
      bound,
      starts: exact && !useLocal ? 0 : RESTARTS + 1,
      managers: describe(to),
      managerSteps: managerPlan.steps,
      managerStuck: managerPlan.stuck,
      enginesNow: sum(active.map((c) => engineValue(c, c.item))),
      enginesAfter: sum(active.map((c) => engineValue(c, goods[c.id]))),
      switchCost: sum(switches.map((x) => x.cost)),
      switches,
      goods,
      switching: Boolean(switching),
      relocating: Boolean(relocating),
      places: where,
      moveCost: sum(active.map((c) => moveCost(c, where[c.id]))),
      companyMoves: active
        .filter((c) => where[c.id] !== null)
        .map((c) => ({
          company: c.id,
          from: c.country,
          to: where[c.id],
          tax: taxes[where[c.id]] || 0,
          cost: moveCost(c, where[c.id]),
          free: Boolean((relocating.free || {})[c.id]),
          crew: order
            .filter((e) => placedActive[e.id] === c.id)
            .map((e) => e.id),
          shielded: [
            ...shieldedIds(
              order.filter((e) => placedActive[e.id] === c.id),
              shield,
            ),
          ],
        })),
      neutral: relocating
        ? abroadGroup(order, owner, taxes, relocating.perksOnly)
        : [],
      owner,
      selfWorkAfter: selfWork(
        active.map((c) => making(c, goods[c.id])),
        value,
        input,
      ),
      firing: fire && {
        letGo: order.filter((e) => !(e.id in placed)).map((e) => e.id),
        hires: hiresAt,
        seats: Object.fromEntries(
          active.map((c) => [
            c.id,
            {
              ...seatOf[`${c.id}:${goods[c.id]}`],
              waited: seatNow[`${c.id}:${goods[c.id]}`],
              // one more hire there, after the wait one more takes (the column showed no wait when
              // the plan hired nobody: user, 2026-10-31)
              next: waited(
                seatOf[`${c.id}:${goods[c.id]}`],
                averageWait(fire.allowed + 1, fire.rate),
                horizon,
              ),
              nextWait: averageWait(fire.allowed + 1, fire.rate),
            },
          ]),
        ),
        guide: quick ? null : guideOf(),
        wait: averageWait(fire.allowed, fire.rate),
        rate: fire.rate,
        passShare,
        allowed: fire.allowed,
        energyHires: fire.energyHires,
        energyLeft: fire.energyLeft,
        close: fire.close,
        cut: fire.cut,
        training,
        rule: firing.rule || HIRE_RULE,
        margin: fire.margin,
        recruiter: hiring.recruiter,
        exact: exact && !useLocal,
        closeExact: !fire.pending.length,
      },
      seconds: (Date.now() - started) / 1000,
    };
  }

  // ---- random numbers both twins draw alike (warera/crews.py: Rng, seed_of, below, between, pick) ----

  // mulberry32 on unsigned 32-bit numbers, as warera/crews.py's Rng
  class Rng {
    constructor(seed) {
      this.state = seed >>> 0;
    }
    random() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      const a = this.state;
      let t = Math.imul(a ^ (a >>> 15), a | 1) >>> 0;
      t = (((t + (Math.imul(t ^ (t >>> 7), t | 61) >>> 0)) >>> 0) ^ t) >>> 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
  }

  function seedOf(text) {
    // FNV-1a
    let h = 2166136261;
    for (const ch of text) h = Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0;
    return h;
  }

  const below = (rng, n) => Math.trunc(rng.random() * n);
  const between = (rng, low, high) => low + below(rng, high - low + 1);

  function pick(rng, weights) {
    let total = 0;
    for (const w of weights) total += w;
    const r = rng.random() * total;
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r < acc) return i;
    }
    return weights.length - 1;
  }

  // ---- training: what the draws left are worth (warera/crews.py: rarity_odds ... training_now) ----

  // traits: class (as the training cards name them) and the weight they're rolled with (warera/crews.py: TRAITS)
  const TRAITS = {
    handy: ["good", 5],
    improviser: ["good", 5],
    nationalist: ["good", 10],
    xenophobe: ["bad", 10],
    cosmopolitan: ["good", 10],
    loner: ["good", 5],
    sociable: ["mixed", 10],
    comic: ["mixed", 10],
    mentor: ["mixed", 2],
    foreman: ["good", 5],
    rival: ["mixed", 5],
    primaDonna: ["mixed", 5],
    bully: ["bad", 5],
    envious: ["bad", 10],
    oldFriends: ["good", 2],
    nemesis: ["bad", 2],
    sweethearts: ["good", 0],
    girlPower: ["good", 5],
    bandOfBrothers: ["good", 5],
    manHater: ["bad", 5],
    misogynist: ["bad", 5],
    specialist: ["good", 10],
    craftsman: ["mixed", 10],
    laborer: ["mixed", 10],
    quickStudy: ["good", 10],
    stockpiler: ["good", 10],
    talksToMachines: ["good", 5],
    claustrophobe: ["bad", 5],
    earlyBloomer: ["good", 5],
    veteran: ["good", 5],
    creatureOfHabit: ["bad", 10],
    diamondInTheRough: ["good", 2],
    burnout: ["bad", 2],
    lateBloomer: ["good", 5],
    wornOut: ["bad", 10],
    patriot: ["good", 10],
    homesick: ["bad", 10],
    expat: ["good", 10],
    taxShy: ["bad", 10],
    statist: ["good", 10],
    greedy: ["bad", 10],
    modest: ["good", 10],
    climber: ["bad", 10],
    loyal: ["good", 5],
    flightRisk: ["bad", 10],
    anchor: ["mixed", 5],
    scavenger: ["mixed", 2],
    salvager: ["good", 5],
    gambler: ["mixed", 10],
    luckyCharm: ["good", 5],
    jinx: ["bad", 10],
    recruiter: ["good", 2],
    trainer: ["good", 5],
  };
  const EXCLUSIVE = [
    ["handy", "improviser"],
    ["loner", "sociable"],
    ["cosmopolitan", "xenophobe"],
    ["comic", "bully"],
    ["craftsman", "laborer"],
    ["expat", "homesick"],
    ["statist", "taxShy"],
    ["earlyBloomer", "creatureOfHabit"],
    ["earlyBloomer", "veteran"],
    ["diamondInTheRough", "burnout"],
    ["greedy", "modest"],
    ["flightRisk", "anchor"],
    ["luckyCharm", "jinx"],
    ["scavenger", "handy"],
  ];
  const RARITY_ODDS = {
    common: 0.55,
    uncommon: 0.25,
    rare: 0.13,
    epic: 0.05,
    legendary: 0.02,
  };
  const LUCK_SHIFT = { uncommon: 0.5, rare: 0.3, epic: 0.15, legendary: 0.05 }; // points a Luck point
  const MANAGEMENT_SHIFT = {
    uncommon: 1.0,
    rare: 0.6,
    epic: 0.3,
    legendary: 0.1,
  }; // ... a Management level
  const CARDS = {
    common: [
      ["drill", 1],
      ["negotiation", 0.05],
    ],
    uncommon: [
      ["drill", 2],
      ["reroll", null],
      ["negotiation", 0.1],
    ],
    rare: [
      ["rehab", "bad"],
      ["wildCard", 2],
      ["secondWind", 2],
      ["negotiation", 0.2],
    ],
    epic: [
      ["drill", 3],
      ["habit", "good"],
      ["secondWind", 3],
    ],
    legendary: [
      ["drill", 4],
      ["habits", "good"],
      ["secondWind", 4],
      ["cleanSlate", null],
    ],
  };
  const STATS = ["production", "luck", "responsibility"];
  const EXPECTATION_FLOOR = 0.7;
  const POTENTIAL_CAP = 15;
  const HANDS = 200; // sampled hands per rarity
  const REROLL = -1; // Reroll's place among a deck's Potential changes: it deals a new hand instead
  const REROLL_ROUNDS = 30; // a new hand can hold a Reroll too: rounds at most to settle what one is worth
  const TOOLBOX_PER_LUCK = 0.001; // warera/employees.py
  const TOOLBOX_ODDS = {
    common: 0.35,
    uncommon: 0.37,
    rare: 0.2,
    epic: 0.065,
    legendary: 0.013,
    mythic: 0.002,
  };
  const TOOL_BONUS = {
    common: 0.045,
    uncommon: 0.095,
    rare: 0.165,
    epic: 0.255,
    legendary: 0.38,
    mythic: 0.555,
  };
  const TOOL_MEAN = Object.keys(TOOLBOX_ODDS).reduce(
    (a, r) => a + TOOLBOX_ODDS[r] * TOOL_BONUS[r],
    0,
  );

  function rarityOdds(luck, management) {
    const odds = {};
    for (const [r, p] of Object.entries(RARITY_ODDS)) {
      odds[r] =
        p +
        (luck * (LUCK_SHIFT[r] || 0) +
          management * (MANAGEMENT_SHIFT[r] || 0)) /
          100;
    }
    let rest = 0;
    for (const r of Object.keys(odds)) if (r !== "common") rest += odds[r];
    odds.common = Math.max(0, 1 - rest);
    let total = 0;
    for (const r of Object.keys(odds)) total += odds[r];
    for (const r of Object.keys(odds)) odds[r] /= total;
    return odds;
  }

  // a trait a card can teach e: not held, not exclusive with one held
  const addable = (e, code) =>
    !has(e.traits, code) &&
    !EXCLUSIVE.some(
      (pair) =>
        pair.includes(code) && pair.some((x) => x !== code && has(e.traits, x)),
    );

  // what each change a card can make to e is worth an hour to the crew: "production:k", "negotiation:cut", "add:trait"…
  const TIME_TRAITS = [
    "lateBloomer",
    "earlyBloomer",
    "wornOut",
    "diamondInTheRough",
    "burnout",
    "veteran",
    "climber",
  ];
  const TOOL_TRAITS = ["handy", "improviser"];
  const LUCK_TO_COWORKERS = { luckyCharm: 3, jinx: -2 }; // each coworker's Luck

  // days: a trait that changes with age or tenure counts as its average over those days; options: the tools Handy or
  // Improviser may be held with, [[tool or null, coins an hour it costs whoever holds it now]] (warera/crews.py: card_effects)
  function cardEffects(
    e,
    company,
    crew,
    value,
    at,
    luckPoint,
    horizon = null,
    options = null,
  ) {
    const rate = (x, when = at, daysOn = 0) => {
      const members = [x].concat(crew);
      let total = 0;
      members.forEach((m, i) => {
        const h = hour(
          m,
          company,
          members.slice(0, i).concat(members.slice(i + 1)),
          when,
          daysOn,
        );
        total += hourProfit(h, value);
      });
      return total;
    };
    const base = rate(e);
    const worth = (x, code) => {
      if (horizon && (TIME_TRAITS.includes(code) || code === "quickStudy")) {
        // Quick study: the same-good days, two a day
        const n = Math.max(1, Math.trunc(horizon)),
          on = code === "quickStudy" ? 1 : 0;
        let total = 0;
        for (let d = 0; d < n; d++)
          total +=
            rate(x, at + (d + 0.5) * DAY, d * on) -
            rate(e, at + (d + 0.5) * DAY, d * on);
        return total / n;
      }
      if (options && options.length && TOOL_TRAITS.includes(code)) {
        let top = rate(x);
        for (const [t, cost] of options)
          top = Math.max(top, rate(holding(x, t, at)) - cost);
        return top - base;
      }
      return rate(x) - base;
    };
    const expectation = e.expectation || 1.0;
    const out = new Map();
    for (const k of [1, 2, 3, 4]) {
      const p = e.production + k;
      out.set(
        `production:${k}`,
        rate({
          ...e,
          production: p,
          wage: (e.wage * p) / Math.max(1, e.production),
        }) - base,
      );
      out.set(
        `responsibility:${k}`,
        rate({ ...e, responsibility: e.responsibility + k }) - base,
      );
      out.set(`luck:${k}`, luckPoint * k);
    }
    for (const cut of [0.05, 0.1, 0.2]) {
      out.set(
        `negotiation:${cut}`,
        (e.wage *
          (expectation - Math.max(EXPECTATION_FLOOR, expectation - cut))) /
          expectation,
      );
    }
    for (const code of Object.keys(TRAITS)) {
      const luck = (LUCK_TO_COWORKERS[code] || 0) * crew.length * luckPoint;
      if (has(e.traits, code)) {
        const rest = { ...e.traits };
        delete rest[code];
        out.set(`remove:${code}`, worth({ ...e, traits: rest }, code) - luck);
      } else if (addable(e, code)) {
        const wage =
          e.wage * (code === "greedy" ? 1.2 : code === "modest" ? 0.85 : 1);
        // Specialist always the company's good; Diamond in the rough's stat isn't known before the pick
        const args =
          code === "diamondInTheRough"
            ? STATS
            : [code === "specialist" ? company.item : null];
        let total = 0;
        for (const arg of args)
          total += worth(
            { ...e, traits: { ...e.traits, [code]: arg }, wage },
            code,
          );
        out.set(`add:${code}`, luck + total / args.length);
      }
    }
    return out;
  }

  // the card types a draw of `rarity` can deal e: [[ [variant weight, coins an hour, potential +], ... ], ...]
  function cardTypes(e, effects, rarity) {
    const have = (cls) =>
      Object.keys(e.traits).filter((c) => (TRAITS[c] || ["", 0])[0] === cls);
    const teach = (cls) =>
      Object.keys(TRAITS)
        .filter(
          (c) =>
            TRAITS[c][0] === cls && TRAITS[c][1] && effects.has(`add:${c}`),
        )
        .map((c) => [TRAITS[c][1], effects.get(`add:${c}`)]);
    const types = [];
    for (const [kind, size] of CARDS[rarity]) {
      let variants;
      if (kind === "drill") {
        variants = STATS.map((s) => [1, effects.get(`${s}:${size}`)]);
      } else if (kind === "negotiation") {
        variants = [[1, effects.get(`negotiation:${size}`)]];
      } else if (kind === "rehab") {
        variants = have(size).map((c) => [1, effects.get(`remove:${c}`)]);
      } else if (kind === "habit") {
        variants = teach(size);
      } else if (kind === "habits") {
        const good = teach("good");
        variants = [];
        for (let i = 0; i < good.length; i++) {
          for (let j = i + 1; j < good.length; j++)
            variants.push([good[i][0] * good[j][0], good[i][1] + good[j][1]]);
        }
      } else if (kind === "wildCard") {
        const every = teach("good").concat(teach("mixed"), teach("bad"));
        let weights = 0,
          worth = 0;
        for (const [w, v] of every) {
          weights += w;
          worth += w * v;
        }
        const drill =
          effects.get(`production:${size}`) +
          effects.get(`luck:${size}`) +
          effects.get(`responsibility:${size}`);
        variants = [[1, drill / 3 + worth / (weights || 1)]];
      } else if (kind === "cleanSlate") {
        const bad = have("bad");
        variants =
          bad.length >= 2
            ? [[1, sum(bad.map((c) => effects.get(`remove:${c}`)))]]
            : [];
      } else if (kind === "reroll") {
        // a new hand, its rarity rolled again (dealtWorth)
        variants = [[1, 0, REROLL]];
      } else {
        // secondWind: the cap +size, the draw spent
        variants = [[1, 0, size - 1]];
      }
      variants = variants
        .filter((v) => v[0] > 0)
        .map((v) => (v.length === 3 ? v : [v[0], v[1], 0]));
      if (variants.length) types.push(variants);
    }
    return types;
  }

  // n hands of 3 different cards (a type at random, then its variant by weight); the last card is padding
  function dealHands(types, rng, n) {
    if (!types.length) types = [[[1, 0, 0]]];
    const coins = [],
      extra = [],
      index = new Map();
    types.forEach((variants, t) =>
      variants.forEach(([, c, x], v) => {
        index.set(`${t}:${v}`, coins.length);
        coins.push(c);
        extra.push(x);
      }),
    );
    const size = Math.min(3, coins.length);
    const pad = coins.length;
    const hands = [];
    for (let row = 0; row < n; row++) {
      const picked = new Set();
      while (picked.size < size) {
        const t = below(rng, types.length);
        const v = pick(
          rng,
          types[t].map((x) => x[0]),
        );
        picked.add(index.get(`${t}:${v}`));
      }
      const hand = [...picked].sort((a, b) => a - b);
      while (hand.length < 3) hand.push(pad);
      hands.push(hand);
    }
    coins.push(0);
    extra.push(0);
    return { coins, extra, hands };
  }

  // each card's coins: its change for the days left after it, plus what the draws after it are worth; a Reroll: `again`
  function cardTotals(deck, following, p, daysLeft, again = -Infinity) {
    const n = deck.coins.length,
      totals = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      totals[i] =
        deck.coins[i] * 24 * (daysLeft - 0.5) +
        following[Math.min(POTENTIAL_CAP, Math.max(0, p - 1 + deck.extra[i]))];
      if (deck.extra[i] === REROLL) totals[i] = again;
    }
    totals[n - 1] = -Infinity;
    return totals;
  }

  const best = (totals, hand) =>
    Math.max(totals[hand[0]], totals[hand[1]], totals[hand[2]]);

  // what a draw is worth once its energy is paid (warera/crews.py: _dealt): each rarity's best card on average, a Reroll
  // worth this same number, settled round by round
  function dealtWorth(odds, decks, following, p, daysLeft) {
    let settled = 0;
    const rerolling = [];
    for (const [r, chance] of Object.entries(odds)) {
      const deck = decks[r],
        totals = cardTotals(deck, following, p, daysLeft),
        others = [];
      let plain = 0;
      for (const hand of deck.hands) {
        if (
          deck.extra[hand[0]] === REROLL ||
          deck.extra[hand[1]] === REROLL ||
          deck.extra[hand[2]] === REROLL
        ) {
          others.push(best(totals, hand));
        } else {
          plain += best(totals, hand);
        }
      }
      settled += (chance * plain) / deck.hands.length;
      if (others.length) rerolling.push([chance / deck.hands.length, others]);
    }
    let worth = settled;
    for (const [share, others] of rerolling) worth += share * sum(others);
    if (!rerolling.length) return worth;
    for (let round = 0; round < REROLL_ROUNDS; round++) {
      let next = settled;
      for (const [share, others] of rerolling) {
        let total = 0;
        for (const x of others) total += Math.max(x, worth);
        next += share * total;
      }
      const change = Math.abs(next - worth);
      worth = next;
      if (change < 1e-9) break;
    }
    return worth;
  }

  // the dynamic programme: table[s][p] = coins expected from draw slot s on with p draws left; perDay slots a day (1 + a
  // Trainer's stacks), slot s on day floor(s / perDay); decks: dealt already (the same hands at another number a day)
  function trainingTable(
    e,
    effects,
    horizon,
    drawCost,
    management,
    rng,
    hands,
    perDay = 1,
    decks = null,
  ) {
    const odds = rarityOdds(e.luck, management);
    if (!decks) {
      decks = {};
      for (const r of Object.keys(odds))
        decks[r] = dealHands(cardTypes(e, effects, r), rng, hands);
    }
    const slots = horizon * perDay,
      table = [];
    for (let s = 0; s <= slots; s++)
      table.push(new Float64Array(POTENTIAL_CAP + 1));
    for (let s = slots - 1; s >= 0; s--) {
      const following = table[s + 1],
        now = Float64Array.from(following);
      for (let p = 1; p <= POTENTIAL_CAP; p++) {
        now[p] = Math.max(
          following[p],
          dealtWorth(
            odds,
            decks,
            following,
            p,
            horizon - Math.floor(s / perDay),
          ) - drawCost,
        );
      }
      table[s] = now;
    }
    return { table, odds, decks };
  }

  const drawsLeft = (e) =>
    Math.max(0, (e.potentialMax || 0) - (e.potential || 0));

  // expected coins from e's draws left over `horizon` days; with `first` (an Rng) also after one first draw: [both]
  function trainingValue(
    e,
    effects,
    horizon,
    drawCost,
    management,
    rng,
    hands = HANDS,
    first = null,
    perDay = 1,
  ) {
    const left = Math.min(drawsLeft(e), POTENTIAL_CAP);
    horizon = Math.trunc(horizon);
    if (!left || horizon <= 0) return first ? [0, 0] : 0;
    const { table, odds, decks } = trainingTable(
      e,
      effects,
      horizon,
      drawCost,
      management,
      rng,
      hands,
      perDay,
    );
    if (!first) return table[0][left];
    const rarity = Object.keys(odds)[pick(first, Object.values(odds))];
    const deck = decks[rarity];
    const hand = deck.hands[below(first, deck.hands.length)];
    const after =
      horizon * perDay > 1 ? table[1] : new Float64Array(POTENTIAL_CAP + 1);
    const totals = cardTotals(
      deck,
      after,
      left,
      horizon,
      dealtWorth(odds, decks, after, left, horizon),
    );
    return [table[0][left], best(totals, hand) - drawCost];
  }

  // coins an hour a Luck point adds through toolboxes (warera/crews.py: luck_point_value)
  const luckPointValue = (output, value, fit, hours) =>
    TOOLBOX_PER_LUCK *
    fit *
    TOOL_MEAN *
    output *
    value *
    Math.min(TOOL_HOURS, hours / 2);

  // each employee's training draws left where they work now (warera/crews.py: training_now): id -> coins
  // what training needs for every employee: the crews now, the average output, the share of tool types that fit
  // Coins an hour one more toolbox's tool adds, on average over the types and rarities: the best tools for the crews with
  // it less without it (warera/crews.py: new_tool_worth)
  function newToolWorth(employees, byId, crews, tools, values, at) {
    let total = 0;
    const kinds = Object.keys(TOOL_GOODS);
    for (const kind of kinds) {
      const rows = [];
      for (const e of employees) {
        const c = byId[e.company];
        if (!c.active || !TOOL_GOODS[kind].includes(c.item)) continue;
        const h = hour(
          e,
          c,
          crews[c.id].filter((x) => x !== e),
          at,
        );
        rows.push([
          ((h.production / OUTPUT_DIVISOR) * (values[c.item] || 0)) / 100,
          has(e.traits, "handy")
            ? 40
            : has(e.traits, "improviser")
              ? -IMPROVISER_BONUS
              : 0,
        ]);
      }
      if (!rows.length) continue;
      const best = (bonuses) => {
        if (!bonuses.length) return 0;
        const table = rows.map(([unit, perk]) =>
          bonuses.map((b) => unit * (b + perk)),
        );
        let sum_ = 0;
        bestAssignment(table).forEach((j, i) => {
          if (j !== null) sum_ += table[i][j];
        });
        return sum_;
      };
      const held = tools.filter((t) => t.type === kind).map((t) => t.bonus);
      const now = best(held);
      for (const rarity of Object.keys(TOOLBOX_ODDS)) {
        total +=
          (TOOLBOX_ODDS[rarity] / kinds.length) *
          (best(held.concat(TOOL_BONUS[rarity] * 100)) - now);
      }
    }
    return total;
  }

  // The training model's view of a player's tools: the best tools for the crews as they stand are what a card adds to
  // (warera/crews.py: tool_context)
  function toolContext(companies, employees, tools, values, start, horizon) {
    let crews = Object.fromEntries(
      companies.map((c) => [c.id, employees.filter((e) => e.company === c.id)]),
    );
    const gains = {};
    for (const c of companies) {
      if (c.active)
        toolGains(
          c,
          crews[c.id],
          values[c.item] || 0,
          start,
          horizon,
          0,
          [],
          tools,
          gains,
        );
    }
    const sorted = employees
      .slice()
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const { assign } = toolMatch(gains, sorted, tools, {});
    const byTool = Object.fromEntries(tools.map((t) => [t.id, t]));
    const holder = Object.fromEntries(
      Object.entries(assign).map(([i, id]) => [id, i]),
    );
    const equipped = employees.map((e) =>
      holding(e, byTool[assign[e.id]], start),
    );
    crews = Object.fromEntries(
      companies.map((c) => [c.id, equipped.filter((e) => e.company === c.id)]),
    );
    const byId = Object.fromEntries(companies.map((c) => [c.id, c]));
    const options = {};
    for (const e of equipped) {
      const item = byId[e.company].item;
      options[e.id] = [[null, 0]].concat(
        tools
          .filter((t) => (TOOL_GOODS[t.type] || []).includes(item))
          .map((t) => [
            t,
            holder[t.id] !== undefined && holder[t.id] !== e.id
              ? (gains[`${holder[t.id]}|${t.id}`] || 0) / (horizon * 24)
              : 0,
          ]),
      );
    }
    return {
      employees: equipped,
      options,
      held: Object.fromEntries(
        Object.entries(assign).map(([i, id]) => [i, byTool[id]]),
      ),
      worth: newToolWorth(equipped, byId, crews, tools, values, start),
    };
  }

  function trainingContext(
    companies,
    employees_,
    start,
    tools = null,
    values = null,
    horizon = 0,
  ) {
    const byId = Object.fromEntries(companies.map((c) => [c.id, c]));
    const active = companies.filter((c) => c.active);
    const toolsNow = tools
      ? toolContext(companies, employees_, tools, values, start, horizon)
      : null;
    const employees = toolsNow ? toolsNow.employees : employees_;
    const crews = Object.fromEntries(
      companies.map((c) => [c.id, employees.filter((e) => e.company === c.id)]),
    );
    const outputs = employees.map(
      (e) =>
        hour(
          e,
          byId[e.company],
          crews[e.company].filter((x) => x !== e),
          start,
        ).output,
    );
    let total = 0;
    for (const x of outputs) total += x;
    const average = (outputs.length ? total / outputs.length : 0) || 1.0;
    const made = new Set(active.map((c) => c.item));
    const fit =
      Object.values(TOOL_GOODS).filter((goods) =>
        goods.some((g) => made.has(g)),
      ).length / Object.keys(TOOL_GOODS).length;
    return { byId, crews, average, fit, tools: toolsNow, employees };
  }

  // one employee's card effects where they work now, and the days their draws can pay over
  function employeeTraining(ctx, e, values, start, horizon) {
    const company = ctx.byId[e.company];
    const value = values[company.item] || 0;
    const left = e.retireAsk
      ? Math.min(horizon, Math.max(0, (e.retireAsk - start) / DAY))
      : horizon;
    const luck = ctx.tools
      ? TOOLBOX_PER_LUCK *
        ctx.tools.worth *
        Math.min(TOOL_HOURS, (left * 24) / 2) *
        (has(e.traits, "scavenger") ? 2 : 1)
      : luckPointValue(ctx.average, value, ctx.fit, horizon * 24);
    const effects = cardEffects(
      e,
      company,
      ctx.crews[company.id].filter((x) => x !== e),
      value,
      start,
      luck,
      left,
      ctx.tools ? ctx.tools.options[e.id] : null,
    );
    return { company, value, left, effects, luck };
  }

  function trainingNow(
    companies,
    employees_,
    values,
    start,
    horizon,
    drawCost,
    management,
    tools = null,
  ) {
    const ctx = trainingContext(
      companies,
      employees_,
      start,
      tools,
      values,
      horizon,
    );
    const out = {};
    const { setup, plan } = trainingSetup(
      ctx,
      values,
      start,
      horizon,
      drawCost,
      management,
    );
    for (const e of ctx.employees) if (!(e.id in setup)) out[e.id] = 0; // v0.27.4: nobody trains in a disabled company
    for (const [id, { e, effects, left }] of Object.entries(setup)) {
      out[id] = trainingValue(
        e,
        effects,
        left,
        drawCost,
        management,
        new Rng(seedOf(id)),
        HANDS,
        null,
        plan[id],
      );
    }
    return out;
  }

  // every employee who can train: card effects where they work now, days, draws a day with the Trainers' stacks
  // (warera/crews.py: training_now's setup and trainer_plan)
  function trainingSetup(ctx, values, start, horizon, drawCost, management) {
    const setup = {};
    for (const e of ctx.employees) {
      if (!ctx.byId[e.company].active) continue;
      const { left, effects, luck } = employeeTraining(
        ctx,
        e,
        values,
        start,
        horizon,
      );
      setup[e.id] = { e, effects, left, luck };
    }
    return {
      setup,
      plan: trainerPlan(setup, ctx.employees, drawCost, management),
    };
  }

  const TRAINER_STACKS = 2; // a Trainer's extra draws a day for other employees (each uses Potential and 10 energy)

  // e's draws left worth with 0..reach extra draws a day from Trainers, the same hands for each (training_curve). Each
  // worked out when first asked for (`at`), as the share-out reads only 0 and 1 for most employees (code review
  // 2026-11-07: every one up front took 7.5 s for SzczwanyLisek's 39); the same numbers as Python's list, as the hands
  // are dealt once, whichever comes first.
  function trainingCurve(
    e,
    effects,
    horizon,
    drawCost,
    management,
    reach,
    hands = HANDS,
  ) {
    const left = Math.min(drawsLeft(e), POTENTIAL_CAP);
    horizon = Math.trunc(horizon);
    if (!left || horizon <= 0) return new Array(reach + 1).fill(0);
    const out = new Array(reach + 1).fill(null);
    let decks = null;
    return {
      length: reach + 1,
      at: (k) => {
        if (out[k] === null) {
          const found = trainingTable(
            e,
            effects,
            horizon,
            drawCost,
            management,
            new Rng(seedOf(e.id)),
            hands,
            1 + k,
            decks,
          );
          decks = found.decks;
          out[k] = found.table[0][left];
        }
        return out[k];
      },
    };
  }

  const byCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  // Trainers' stacks handed out one at a time to whom one more adds the most; a Trainer can't take their own
  // (trainer_shares): id -> extra a day
  function trainerShares(curves, own, stacks) {
    const got = Object.fromEntries(Object.keys(curves).map((i) => [i, 0]));
    const ids = Object.keys(curves).sort(byCode);
    for (let s = 0; s < stacks; s++) {
      let best = null,
        gain = 1e-9;
      for (const i of ids) {
        const k = got[i];
        if (k + 1 < curves[i].length && k + 1 <= stacks - (own[i] || 0)) {
          const g = curves[i].at(k + 1) - curves[i].at(k);
          if (g > gain) {
            best = i;
            gain = g;
          }
        }
      }
      if (best === null) break;
      got[best] += 1;
    }
    return got;
  }

  // the Trainers' stacks: id -> draws a day; a Trainer card's worth into each one's effects (trainer_plan)
  function trainerPlan(setup, employees, drawCost, management) {
    const trainers = {};
    for (const e of employees)
      if (has(e.traits, "trainer")) trainers[e.id] = TRAINER_STACKS;
    const pool = TRAINER_STACKS * Object.keys(trainers).length;
    const curves = {};
    for (const [id, { e, effects, left }] of Object.entries(setup)) {
      curves[id] = trainingCurve(
        e,
        effects,
        left,
        drawCost,
        management,
        pool + TRAINER_STACKS,
      );
    }
    const shares = trainerShares(curves, trainers, pool);
    const total = (got) => {
      let x = 0;
      for (const i of Object.keys(got).sort(byCode)) x += curves[i].at(got[i]);
      return x;
    };
    const now = total(shares);
    for (const [id, { effects, left }] of Object.entries(setup)) {
      if (effects.has("add:trainer") && Math.trunc(left) > 0) {
        const more = trainerShares(
          curves,
          { ...trainers, [id]: TRAINER_STACKS + (trainers[id] || 0) },
          pool + TRAINER_STACKS,
        );
        effects.set(
          "add:trainer",
          effects.get("add:trainer") +
            (total(more) - now) / (24 * Math.max(0.5, left - 0.5)),
        );
      }
    }
    return Object.fromEntries(
      Object.entries(shares).map(([i, k]) => [i, 1 + k]),
    );
  }

  const traitName = traitLabel;

  // every card each rarity can deal e, labelled, as cardTypes builds them ("two new habits": its good traits)
  function cardList(e, effects, rarity) {
    const have = (cls) =>
      Object.keys(e.traits).filter((c) => (TRAITS[c] || ["", 0])[0] === cls);
    const teach = (cls) =>
      Object.keys(TRAITS).filter(
        (c) => TRAITS[c][0] === cls && TRAITS[c][1] && effects.has(`add:${c}`),
      );
    const out = [];
    for (const [kind, size] of CARDS[rarity]) {
      if (kind === "drill") {
        for (const s of STATS) {
          out.push({
            kind,
            arg: s,
            size,
            label:
              s === "responsibility"
                ? say("card.morale", size)
                : say("card.drill", size, say(`stat.${s}`)),
            coins: effects.get(`${s}:${size}`),
            extra: 0,
          });
        }
      } else if (kind === "negotiation") {
        out.push({
          kind,
          arg: size,
          label: say("card.negotiation", Math.round(size * 100)),
          coins: effects.get(`negotiation:${size}`),
          extra: 0,
        });
      } else if (kind === "rehab") {
        for (const c of have(size))
          out.push({
            kind,
            arg: c,
            label: say("card.rehab", traitName(c)),
            coins: effects.get(`remove:${c}`),
            extra: 0,
          });
      } else if (kind === "habit") {
        for (const c of teach(size))
          out.push({
            kind,
            arg: c,
            label: say("card.habit", traitName(c)),
            coins: effects.get(`add:${c}`),
            extra: 0,
          });
      } else if (kind === "habits") {
        const good = teach("good");
        if (good.length >= 2) {
          out.push({
            kind,
            arg: null,
            label: say("card.habits"),
            coins: null,
            extra: 0,
            traits: good.map((c) => ({
              code: c,
              name: traitName(c),
              coins: effects.get(`add:${c}`),
            })),
          });
        }
      } else if (kind === "wildCard") {
        const every = teach("good").concat(teach("mixed"), teach("bad"));
        let weights = 0,
          worth = 0;
        for (const c of every) {
          weights += TRAITS[c][1];
          worth += TRAITS[c][1] * effects.get(`add:${c}`);
        }
        const drill =
          effects.get(`production:${size}`) +
          effects.get(`luck:${size}`) +
          effects.get(`responsibility:${size}`);
        out.push({
          kind,
          arg: null,
          label: say("card.wildCard"),
          coins: drill / 3 + worth / (weights || 1),
          extra: 0,
        });
      } else if (kind === "cleanSlate") {
        const bad = have("bad");
        if (bad.length >= 2) {
          out.push({
            kind,
            arg: null,
            label: say("card.cleanSlate", bad.map(traitName).join(", ")),
            coins: sum(bad.map((c) => effects.get(`remove:${c}`))),
            extra: 0,
            codes: bad,
          });
        }
      } else if (kind === "reroll") {
        out.push({
          kind,
          arg: null,
          label: say("card.reroll"),
          coins: 0,
          extra: 0,
        });
      } else {
        out.push({
          kind,
          arg: size,
          label: say("card.secondWind", size),
          coins: 0,
          extra: size - 1,
        });
      }
    }
    return out;
  }

  // the cards page (site/cards/): one employee's training where they work now, every card they can be dealt and
  // what each is worth over the days left against a card that does nothing (its change for the days after it, and
  // what it does to the draws after it); input.training = {drawCost, management}
  // what every employee's cards share (`cardsFor`'s `prepared`): the companies, the best tools for the crews, and
  // everyone's draws, for the Trainers' stacks (how many a day they get, what a Trainer card adds to the others). The
  // cards page keeps it for a loaded player and a day count: it takes seconds for a big roster (code review 2026-11-07:
  // 8 s a pick for 39 employees when every pick worked it out again).
  function cardsContext(input) {
    const { companies, employees } = build(input);
    const tools = input.tools
      ? heldTools(input.tools.opened, input.tools.dismantled, input.rosters)
      : null;
    const ctx = trainingContext(
      companies,
      employees,
      input.now,
      tools,
      input.values,
      input.days,
    );
    const { setup, plan } = trainingSetup(
      ctx,
      input.values,
      input.now,
      input.days,
      input.training.drawCost,
      input.training.management,
    );
    return { companies, ctx, setup, perDayOf: plan };
  }

  function cardsFor(input, employeeId, prepared = null) {
    const { companies, ctx, setup, perDayOf } = prepared || cardsContext(input);
    const e = ctx.employees.find((x) => x.id === employeeId);
    const { company, left, effects, luck } =
      e.id in setup
        ? { company: ctx.byId[e.company], ...setup[e.id] }
        : employeeTraining(ctx, e, input.values, input.now, input.days);
    const perDay = perDayOf[e.id] || 1;
    const trainers = ctx.employees.filter((x) =>
      has(x.traits, "trainer"),
    ).length;
    // a draw dealt and not picked yet has spent its Potential already (the game takes it at the draw): its hand
    // is the draw being valued, with draws left after it as the record shows
    const offers = waitingOffers(input, employeeId);
    const horizon = Math.trunc(left),
      p = Math.min(drawsLeft(e) + (offers ? 1 : 0), POTENTIAL_CAP);
    const odds = rarityOdds(e.luck, input.training.management);
    const out = {
      id: e.id,
      name: e.name,
      company: company.name,
      item: company.item,
      active: company.active,
      traits: traitNames(e),
      traitList: Object.entries(e.traits),
      production: e.production,
      luck: e.luck,
      responsibility: e.responsibility,
      draws: drawsLeft(e),
      days: horizon,
      odds,
      drawCost: input.training.drawCost,
      cards: {},
      waiting: null,
      perDay,
      trainers,
      companies: Object.fromEntries(companies.map((c) => [c.id, c.name])),
      tool: ctx.tools ? ctx.tools.held[e.id] || null : undefined,
      fits: Object.keys(TOOL_GOODS).find((k) =>
        TOOL_GOODS[k].includes(company.item),
      ),
    };
    if (!p || horizon <= 0 || !company.active) return out;
    const { table, decks } = trainingTable(
      e,
      effects,
      horizon,
      input.training.drawCost,
      input.training.management,
      new Rng(seedOf(e.id)),
      HANDS,
      perDay,
    );
    const next =
      horizon * perDay > 1 ? table[1] : new Float64Array(POTENTIAL_CAP + 1);
    const worth = (coins, extra) =>
      coins * 24 * (horizon - 0.5) +
      next[Math.min(POTENTIAL_CAP, Math.max(0, p - 1 + extra))] -
      next[p - 1];
    // a Luck drill also makes the draws after it rarer (the same hands, only the odds move); it pays no coins by itself
    const rarer = (k) => {
      if (horizon * perDay <= 1 || p <= 1) return 0;
      const lucky = trainingTable(
        { ...e, luck: e.luck + k },
        effects,
        horizon,
        input.training.drawCost,
        input.training.management,
        new Rng(seedOf(e.id)),
        HANDS,
        perDay,
      ).table[1];
      return lucky[p - 1] - next[p - 1];
    };
    // a crew-dependent change in each of your companies (`crewRanges`): its least and most, in coins over the days
    const ranges = crewRanges(ctx, e, input.values, input.now, luck);
    const spread = (key) => {
      const r = ranges.get(key);
      return r
        ? { min: worth(r.min, 0), max: worth(r.max, 0), places: r.places }
        : null;
    };
    const scavenger = has(e.traits, "scavenger") ? 2 : 1;
    const newHand = dealtWorth(odds, decks, next, p, horizon); // what a Reroll deals, for free
    for (const r of Object.keys(odds)) {
      out.cards[r] = cardList(e, effects, r).map((card) =>
        card.traits
          ? {
              ...card,
              traits: card.traits.map((t) => ({
                ...t,
                gain: worth(t.coins, 0),
              })),
            }
          : card.kind === "drill" && card.arg === "luck"
            ? (() => {
                const k = card.size;
                const fromOdds = rarer(k),
                  fromTools = worth(card.coins, 0);
                return {
                  ...card,
                  gain: fromTools + fromOdds,
                  luck: {
                    boxes: k * TOOLBOX_PER_LUCK * 24 * horizon * scavenger,
                    fromTools,
                    fromOdds,
                  },
                };
              })()
            : {
                ...card,
                gain:
                  card.kind === "reroll"
                    ? newHand - next[p - 1]
                    : worth(card.coins, card.extra),
                range:
                  card.kind === "habit"
                    ? spread(`add:${card.arg}`)
                    : card.kind === "rehab"
                      ? spread(`remove:${card.arg}`)
                      : card.kind === "cleanSlate"
                        ? spread("clean")
                        : null,
              },
      );
      for (const card of out.cards[r]) {
        if (card.traits)
          for (const x of card.traits) x.range = spread(`add:${x.code}`);
      }
    }
    out.all = table[0][p]; // every draw left, from today
    out.today = table[0][p] - table[Math.min(perDay, table.length - 1)][p]; // drawing today rather than waiting a day
    out.later = next[p - 1]; // the draws after this one (the next slot: the same day with a Trainer's stacks)
    out.after = p - 1; // how many
    out.pairGain = (a, b) => worth(a + b, 0); // two new habits: their coins an hour added
    out.pairRange = (a, b) => {
      // two new habits, at least one crew-dependent: both in each company
      const r = ranges.pair(a, b);
      return r
        ? { min: worth(r.min, 0), max: worth(r.max, 0), places: r.places }
        : null;
    };
    out.together = (a, b) =>
      a !== b &&
      !EXCLUSIVE.some((pair) => pair.includes(a) && pair.includes(b));
    if (offers) {
      const rarity = offers[0].rarity;
      out.waiting = {
        rarity,
        cards: out.cards[rarity]
          ? offers.map((o) => offerCard(out.cards[rarity], o))
          : [],
      };
    }
    return out;
  }

  // Traits whose worth depends on the company or the coworkers (user, 2026-11-06: the cards page shows them where the
  // employee works now and, beside it, their least and most in your other companies)
  const CREW_TRAITS = [
    "nationalist",
    "xenophobe",
    "cosmopolitan",
    "loner",
    "sociable",
    "comic",
    "mentor",
    "foreman",
    "rival",
    "primaDonna",
    "bully",
    "envious",
    "oldFriends",
    "nemesis",
    "sweethearts",
    "girlPower",
    "bandOfBrothers",
    "manHater",
    "misogynist",
    "specialist",
    "craftsman",
    "laborer",
    "patriot",
    "homesick",
    "expat",
    "taxShy",
    "statist",
    "claustrophobe",
    "stockpiler",
    "talksToMachines",
    "luckyCharm",
    "jinx",
    "loyal",
  ];

  // A crew-dependent trait added to (or taken from) e in each active company with its crew: where e works now, a free
  // seat elsewhere, or a full company's seat with each of its employees out in turn. Specialist keeps the good e makes
  // now (it names the good at the draw). key ("add:code", "remove:code", "clean") -> {min, max (coins an hour to the
  // crew), places: {min, max: company id}}; .pair(a, b): two new habits together (null when neither is crew-dependent).
  function crewRanges(ctx, e, values, start, luckPoint) {
    const places = [];
    for (const c of Object.values(ctx.byId)) {
      if (!c.active) continue;
      const crew = ctx.crews[c.id].filter((x) => x.id !== e.id);
      const groups =
        c.id === e.company || crew.length < c.room
          ? [crew]
          : crew.map((m) => crew.filter((x) => x !== m));
      for (const g of groups) places.push({ company: c, crew: g });
    }
    const rate = (x, c, crew) => {
      const members = [x].concat(crew);
      let total = 0;
      members.forEach((m, i) => {
        total += hourProfit(
          hour(m, c, members.slice(0, i).concat(members.slice(i + 1)), start),
          values[c.item] || 0,
        );
      });
      return total;
    };
    const home = ctx.byId[e.company].item;
    const argOf = (code) => (code === "specialist" ? home : null);
    const base = places.map((pl) =>
      rate({ ...e, company: pl.company.id }, pl.company, pl.crew),
    );
    const span = (traits, luck) => {
      let min = Infinity,
        max = -Infinity,
        at = { min: null, max: null };
      places.forEach((pl, i) => {
        const g =
          rate({ ...e, company: pl.company.id, traits }, pl.company, pl.crew) -
          base[i] +
          luck * pl.crew.length * luckPoint;
        if (g < min) {
          min = g;
          at = { ...at, min: pl.company.id };
        }
        if (g > max) {
          max = g;
          at = { ...at, max: pl.company.id };
        }
      });
      return places.length ? { min, max, places: at } : null;
    };
    const without = (codes) =>
      Object.fromEntries(
        Object.entries(e.traits).filter(([k]) => !codes.includes(k)),
      );
    const out = new Map();
    for (const code of CREW_TRAITS) {
      const luck = LUCK_TO_COWORKERS[code] || 0;
      if (has(e.traits, code))
        out.set(`remove:${code}`, span(without([code]), -luck));
      else if (addable(e, code))
        out.set(
          `add:${code}`,
          span({ ...e.traits, [code]: argOf(code) }, luck),
        );
    }
    const bad = Object.keys(e.traits).filter(
      (c) => (TRAITS[c] || ["", 0])[0] === "bad",
    );
    if (bad.length >= 2 && bad.some((c) => CREW_TRAITS.includes(c))) {
      out.set(
        "clean",
        span(without(bad), -sum(bad.map((c) => LUCK_TO_COWORKERS[c] || 0))),
      );
    }
    out.pair = (a, b) =>
      CREW_TRAITS.includes(a) || CREW_TRAITS.includes(b)
        ? span(
            { ...e.traits, [a]: argOf(a), [b]: argOf(b) },
            (LUCK_TO_COWORKERS[a] || 0) + (LUCK_TO_COWORKERS[b] || 0),
          )
        : null;
    return out;
  }

  // The experimental check (user, 2026-11-06): a crew-dependent card valued by the best allocation of all your employees
  // with it against the best without it: the crews tool's plan with moves only (no hiring, letting go, product switches
  // or company moves; tools as held now), over the employee's days. specs: [{key, add: [codes], remove: [codes]}];
  // each(key, found, done, total, without) as each is found. {days, without: {objective, moves}, results: {key: {gain
  // (coins over the days, from half a day in, as the cards count), objective, moves: [[id, name, from, to]], same (the
  // moves the best allocation without it makes too)}}}
  function cardAllocation(input, employeeId, specs, horizon, each = () => {}) {
    const k = input.rosters.findIndex((r) =>
      (r || []).some((x) => x._id === employeeId),
    );
    const record = input.rosters[k].find((x) => x._id === employeeId);
    const home = input.companies[k].itemCode;
    const days = Math.max(1, Math.trunc(horizon));
    const base = {
      ...input,
      days,
      firing: null,
      switching: null,
      relocating: null,
    };
    const cache = new Map();
    const names = {},
      at = {};
    input.rosters.forEach((r, i) =>
      (r || []).forEach((x) => {
        names[x._id] = x.name;
        at[x._id] = input.companies[i]._id;
      }),
    );
    const run = (rec, tag) => {
      cache.variant = tag === null ? null : { id: employeeId, tag };
      const rosters = input.rosters.map((r, i) =>
        i === k ? r.map((x) => (x._id === employeeId ? rec : x)) : r,
      );
      const found = plan(
        { ...base, rosters },
        () => {},
        null,
        null,
        true,
        cache,
      );
      const moves = Object.entries(found.placed)
        .filter(([id, to]) => to !== at[id])
        .map(([id, to]) => [id, names[id], at[id], to]);
      return { objective: found.objective, moves };
    };
    const without = run(record, null);
    const results = {};
    specs.forEach((spec, i) => {
      const traits = (record.traits || [])
        .filter((x) => !(spec.remove || []).includes(x.code))
        .concat(
          (spec.add || []).map((code) =>
            code === "specialist" ? { code, arg: home } : { code },
          ),
        );
      const found = run({ ...record, traits }, spec.key);
      const key = (moves) =>
        moves
          .map((m) => `${m[0]}>${m[3]}`)
          .sort()
          .join(",");
      results[spec.key] = {
        ...found,
        gain: ((found.objective - without.objective) * (days - 0.5)) / days,
        same: key(found.moves) === key(without.moves),
      };
      each(spec.key, results[spec.key], i + 1, specs.length, without);
    });
    return { days, without, results };
  }

  // the cards of the employee's draw waiting to be picked (record.pendingTraining), or null
  function waitingOffers(input, employeeId) {
    for (const roster of input.rosters) {
      for (const r of roster || []) {
        if (r._id !== employeeId) continue;
        const offers = ((r.pendingTraining || {}).offers || []).filter(
          (o) => o && CARDS[o.rarity],
        );
        return offers.length ? offers : null;
      }
    }
    return null;
  }

  // where an offer is in cardList's cards: {index, pair: [i, j] for two new habits}, or null when it isn't there
  function offerCard(cards, offer) {
    const two = offer.card === "habit" && offer.traitTo2;
    const kind = offer.card === "rehabAll" ? "cleanSlate" : offer.card; // the record's name for Clean slate
    const index = cards.findIndex((c) =>
      two
        ? c.kind === "habits"
        : c.kind === kind &&
          (offer.card === "drill"
            ? c.arg === offer.stat
            : offer.card === "habit"
              ? c.arg === offer.traitTo
              : offer.card === "rehab"
                ? c.arg === offer.trait
                : offer.card === "negotiation"
                  ? Math.abs(c.arg - offer.delta) < 1e-9
                  : true),
    );
    if (index < 0) return null;
    if (!two) return { index };
    const pair = [offer.traitTo, offer.traitTo2].map((code) =>
      cards[index].traits.findIndex((t) => t.code === code),
    );
    return pair.includes(-1) ? null : { index, pair };
  }

  // ---- new hires (warera/crews.py: HireRule … refill_rate): a free seat filled from candidates the hire rule takes ----

  const STAT_RANGE = [1, 4],
    AGE_RANGE = [18, 45],
    EXPECTATION_RANGE = [0.7, 1.3],
    POTENTIAL_RANGE = [3, 10];
  const TRAIT_CHANCE = 1.0; // v0.27.3: every new employee has one trait
  const HIRE_ENERGY = 10;
  const TRIALS_A_DAY_A_SEAT = 2; // a trial hire stays 12 h before it can be fired, holding a free seat
  const POOL = 3; // candidates in a company's free pool, new each day (Recruiter: 4)
  const MAX_DRAWN = 30000;
  const TIE_MOVE = 0.01; // coins a move costs in the search: of equal plans, the fewest moves
  const FIRING_MARGIN = 1.0; // a firing must beat keeping by 1 coin a day (user, 2026-10-31)
  const HIRE_SAMPLES = 300;
  const HIRE_RULE = {
    minProduction: 3,
    minResponsibility: 3,
    maxExpectation: 1.0,
    maxAge: 35,
  };

  const passes = (rule, c) =>
    c.production >= rule.minProduction &&
    c.responsibility >= rule.minResponsibility &&
    (c.expectation ?? 1.0) < rule.maxExpectation &&
    c.age <= rule.maxAge;

  function median(xs) {
    const s = xs.slice().sort((a, b) => a - b),
      m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  const mean = (xs) => sum(xs) / xs.length;

  // a neutral new hire: what coworkers see in a seat filled by one (warera/crews.py: typical_hire)
  const typicalHire = (
    company,
    production,
    expectation,
    ppValue,
    at,
    index = 0,
  ) => ({
    id: `hire:${company.id}:${index}`,
    name: "(new hire)",
    company: company.id,
    female: null,
    nationality: company.country,
    age: 30,
    production,
    luck: 2.5,
    responsibility: 2.5,
    traits: {},
    sameGood: {},
    wage: (production / OUTPUT_DIVISOR) * ppValue * expectation,
    created: at,
    moved: null,
    tool: null,
    happiness: [],
    events: [],
    retireAsk: null,
    seen: null,
    expectation,
    potential: 0,
    potentialMax: 0,
  });

  // a candidate as the rules roll them, drawn in the same order as warera/crews.py's random_hire
  function randomHire(rng, company, ppValue, at, homeShare, index = 0) {
    const traits = {};
    if (rng.random() < TRAIT_CHANCE) {
      const codes = Object.keys(TRAITS);
      const code =
        codes[
          pick(
            rng,
            codes.map((c) => TRAITS[c][1]),
          )
        ];
      traits[code] = code === "specialist" ? company.item : null;
    }
    const [low, high] = EXPECTATION_RANGE;
    const expectation =
      (low + (high - low) * rng.random()) *
      (has(traits, "greedy") ? 1.2 : has(traits, "modest") ? 0.85 : 1);
    const production = between(rng, ...STAT_RANGE);
    const age = between(rng, ...AGE_RANGE);
    const female = rng.random() < 0.5;
    const nationality =
      rng.random() < homeShare ? company.country : `abroad:${index}`;
    const luck = between(rng, ...STAT_RANGE);
    const responsibility = between(rng, ...STAT_RANGE);
    const potentialMax = between(rng, ...POTENTIAL_RANGE);
    return {
      id: `candidate:${company.id}:${index}`,
      name: "(candidate)",
      company: company.id,
      female,
      nationality,
      age,
      production,
      luck,
      responsibility,
      traits,
      sameGood: {},
      wage: (production / OUTPUT_DIVISOR) * ppValue * expectation,
      created: at,
      moved: null,
      tool: null,
      happiness: [],
      events: [],
      retireAsk: at + (RETIRE_AGE - age) * DAY,
      seen: null,
      expectation,
      potential: 0,
      potentialMax,
    };
  }

  // the keep rule's value on a set of hires, and the best keep rule (warera/crews.py: _keep_value, _best_keep)
  function keepValue(final, keepFrom, peek, hireCost, drawCost) {
    const kept = final.filter((x) => x >= keepFrom);
    const share = final.length ? kept.length / final.length : 0;
    if (!share) return -Infinity;
    return (
      mean(kept) - (hireCost + (peek ? drawCost * (1 - share) : 0)) / share
    );
  }

  // numpy's unique(quantile(xs, linspace(0, 0.95, 20), method="inverted_cdf"))
  function keepGrid(xs) {
    const s = xs.slice().sort((a, b) => a - b),
      n = s.length,
      step = 0.95 / 19,
      out = [];
    for (let i = 0; i < 20; i++) {
      const q = i === 19 ? 0.95 : i * step;
      const index = n * q - 1,
        previous = Math.floor(index);
      let j = index - previous === 0 ? previous : previous + 1;
      if (j < 0) j = 0;
      if (!out.length || s[j] !== out[out.length - 1]) out.push(s[j]);
    }
    return out;
  }

  function bestKeep(worths, peeked, hireCost, drawCost) {
    let best = [0, false, -Infinity];
    for (const [peek, final] of [
      [false, worths],
      [true, peeked],
    ]) {
      if (!final || !final.length) continue;
      for (const keepFrom of keepGrid(final)) {
        const value = keepValue(final, keepFrom, peek, hireCost, drawCost);
        if (value > best[2]) best = [keepFrom, peek, value];
      }
    }
    return best;
  }

  // a free seat filled from the candidates the rule takes, the keep rule judged out of sample (seat_value)
  function seatValue(worths, hireCost, peeked = null, drawCost = 0) {
    if (!worths.length)
      return {
        value: -Infinity,
        keepFrom: 0,
        peek: false,
        keep: 0,
        trials: Infinity,
        keptWorth: 0,
      };
    const [keepFrom, peek] = bestKeep(worths, peeked, hireCost, drawCost);
    const half = (xs, k) => (xs ? xs.filter((_, i) => i % 2 === k) : null);
    const judged = [];
    for (const [fit, test] of [
      [0, 1],
      [1, 0],
    ]) {
      if (half(worths, fit).length && half(worths, test).length) {
        const [k, p] = bestKeep(
          half(worths, fit),
          half(peeked, fit),
          hireCost,
          drawCost,
        );
        judged.push(
          keepValue(half(p ? peeked : worths, test), k, p, hireCost, drawCost),
        );
      }
    }
    const final = peek ? peeked : worths;
    const kept = final.filter((x) => x >= keepFrom);
    const value =
      judged.length && judged.every(Number.isFinite) ? mean(judged) : -Infinity;
    const keep = kept.length / final.length;
    return {
      value,
      keepFrom,
      peek,
      keep,
      trials: 1 / keep,
      keptWorth: mean(kept),
    };
  }

  // new employees kept a day from the free pools; a seat's average wait; a seat's value after the wait; a refilled
  // seat's coins an hour (keepers_a_day, average_wait, waited, refill_rate)
  const keepersADay = (
    companies,
    passShare,
    keepShare,
    trialSeats,
    recruiter,
  ) =>
    Math.min(
      companies * (POOL + (recruiter ? 1 : 0)) * passShare,
      TRIALS_A_DAY_A_SEAT * Math.max(1, trialSeats),
    ) * keepShare;
  const averageWait = (hires, rate) =>
    hires && rate > 0 ? (hires + 1) / (2 * rate) : hires ? Infinity : 0;
  const waited = (seat, wait, horizon) =>
    Number.isFinite(seat.value)
      ? Math.max(
          -1e6,
          seat.value - seat.keptWorth * Math.min(1, wait / horizon),
        )
      : -1e6;
  const refillRate = (seat, horizon) =>
    Number.isFinite(seat.value) ? Math.max(0, seat.value) / (horizon * 24) : 0;

  // what new hires need from the employees now (hiring_of)
  function hiringOf(companies, employees, start) {
    const byId = Object.fromEntries(companies.map((c) => [c.id, c]));
    const crews = Object.fromEntries(
      companies.map((c) => [c.id, employees.filter((e) => e.company === c.id)]),
    );
    const outputs = employees.map(
      (e) =>
        hour(
          e,
          byId[e.company],
          crews[e.company].filter((x) => x !== e),
          start,
        ).output,
    );
    const made = new Set(companies.filter((c) => c.active).map((c) => c.item));
    const ratios = employees
      .filter((e) => e.wage && e.production && e.expectation)
      .map((e) => e.wage / ((e.production / OUTPUT_DIVISOR) * e.expectation));
    const ppValue = (ratios.length ? median(ratios) : null) || 0.1;
    return {
      ppValue,
      homeShare: mean(
        employees.map((e) =>
          e.nationality === byId[e.company].country ? 1 : 0,
        ),
      ),
      averageOutput: mean(outputs) || 1.0,
      fit:
        Object.values(TOOL_GOODS).filter((goods) =>
          goods.some((g) => made.has(g)),
        ).length / Object.keys(TOOL_GOODS).length,
      production: median(employees.map((e) => e.production)),
      expectation: median(employees.map((e) => e.expectation)),
      recruiter: employees.some((e) => has(e.traits, "recruiter")),
    };
  }

  const neutralOf = (hiring, start) => (company, index) =>
    typicalHire(
      company,
      hiring.production,
      hiring.expectation,
      hiring.ppValue,
      start,
      index,
    );

  function hireCandidates(
    rule,
    company,
    hiring,
    start,
    samples,
    rng = new Rng(29),
  ) {
    const candidates = [];
    let drawn = 0;
    while (candidates.length < samples && drawn < MAX_DRAWN) {
      const c = randomHire(
        rng,
        company,
        hiring.ppValue,
        start,
        hiring.homeShare,
        drawn,
      );
      drawn += 1;
      if (passes(rule, c)) candidates.push(c);
    }
    return [candidates, drawn ? candidates.length / drawn : 0];
  }

  // a candidate rolled for another company as one from `there`'s pool: a home one from its country, a Specialist in the
  // good it makes (warera/crews.py: rehomed)
  function rehomed(c, there) {
    const home = !String(c.nationality).startsWith("abroad:");
    const traits = has(c.traits, "specialist")
      ? { ...c.traits, specialist: there.item }
      : c.traits;
    return {
      ...c,
      company: there.id,
      nationality: home ? there.country : c.nationality,
      traits,
    };
  }

  // a free seat in `there` filled from `candidates` (free_seat); trained: candidate id -> [training, after a first draw]
  function freeSeat(
    there,
    candidates,
    hiring,
    value,
    start,
    horizon,
    drawCost,
    management,
    trained,
  ) {
    const others = [];
    for (let i = 0; i < there.room - 1; i++) {
      others.push(
        typicalHire(
          there,
          hiring.production,
          hiring.expectation,
          hiring.ppValue,
          start,
          i + 1,
        ),
      );
    }
    const worths = [],
      peeked = [],
      parts = [];
    for (const raw of candidates) {
      const c = rehomed(raw, there);
      if (!(c.id in trained)) {
        const effects = cardEffects(
          c,
          there,
          others,
          value,
          start,
          luckPointValue(hiring.averageOutput, value, hiring.fit, horizon * 24),
        );
        trained[c.id] = trainingValue(
          c,
          effects,
          horizon,
          drawCost,
          management,
          new Rng(seedOf(c.id)),
          100,
          new Rng(seedOf(c.id + ":first")),
        );
      }
      const [expected, after] = trained[c.id];
      const profit = crewProfit(
        there,
        [moved(c, start)].concat(others),
        value,
        start,
        horizon,
      )[0];
      worths.push(profit + expected);
      peeked.push(profit + after);
      parts.push(expected);
    }
    const seat = seatValue(
      worths,
      (drawCost * HIRE_ENERGY) / 10,
      peeked,
      drawCost,
    );
    seat.keepFromPlain = bestKeep(
      worths,
      null,
      (drawCost * HIRE_ENERGY) / 10,
      drawCost,
    )[0]; // the bar without a first draw
    seat.energy =
      seat.trials * HIRE_ENERGY +
      (seat.trials - 1) * HIRE_ENERGY * (seat.peek ? 1 : 0);
    const kept = parts.filter(
      (_, i) => (seat.peek ? peeked[i] : worths[i]) >= seat.keepFrom,
    );
    seat.keptTraining = kept.length ? mean(kept) : 0;
    return seat;
  }

  // The keep rule in what the game shows once a hire is made (user, 2026-10-31: "keep from +159.4" can't be used in the
  // game): for a typical hire the rule takes (the median stats of the sampled ones), each trait, the lowest Potential
  // at which they're worth `keepFrom` or more in `there` (their profit and their training draws, as freeSeat values
  // them). {stats, from: {trait: Potential or null (never)}}
  function keepGuide(
    there,
    candidates,
    hiring,
    value,
    start,
    horizon,
    drawCost,
    management,
    keepFrom,
  ) {
    const med = (f) => median(candidates.map(f));
    const production = med((c) => c.production),
      expectation = med((c) => c.expectation),
      age = Math.round(med((c) => c.age));
    const base = {
      ...candidates[0],
      id: `guide:${there.id}`,
      company: there.id,
      female: null,
      nationality: there.country,
      production,
      luck: med((c) => c.luck),
      responsibility: med((c) => c.responsibility),
      expectation,
      age,
      wage: (production / OUTPUT_DIVISOR) * hiring.ppValue * expectation,
      retireAsk: start + (RETIRE_AGE - age) * DAY,
      potential: 0,
      potentialMax: POTENTIAL_RANGE[1],
    };
    const others = [];
    for (let i = 0; i < there.room - 1; i++) {
      others.push(
        typicalHire(
          there,
          hiring.production,
          hiring.expectation,
          hiring.ppValue,
          start,
          i + 1,
        ),
      );
    }
    const luckPoint = luckPointValue(
      hiring.averageOutput,
      value,
      hiring.fit,
      horizon * 24,
    );
    const from = {};
    for (const code of Object.keys(TRAITS)) {
      const c = {
        ...base,
        traits: { [code]: code === "specialist" ? there.item : null },
      };
      const effects = cardEffects(c, there, others, value, start, luckPoint);
      const { table } = trainingTable(
        c,
        effects,
        Math.trunc(horizon),
        drawCost,
        management,
        new Rng(seedOf(c.id + code)),
        100,
      );
      const profit = crewProfit(
        there,
        [moved(c, start)].concat(others),
        value,
        start,
        horizon,
      )[0];
      from[code] = null;
      for (let p = POTENTIAL_RANGE[0]; p <= POTENTIAL_RANGE[1]; p++) {
        if (profit + table[0][Math.min(p, POTENTIAL_CAP)] >= keepFrom) {
          from[code] = p;
          break;
        }
      }
    }
    return {
      stats: {
        production,
        luck: base.luck,
        responsibility: base.responsibility,
        expectation,
        age,
      },
      from,
      names: Object.fromEntries(
        Object.keys(TRAITS).map((code) => [code, traitName(code)]),
      ),
    };
  }

  // the companies and employees of an input, as reshuffle reads them
  function build(input) {
    const raw = new Set(input.raw);
    const companies = [],
      employees = [];
    input.companies.forEach((record, k) => {
      const roster = input.rosters[k] || [];
      const region = input.regions[record.region] || {};
      const tax = input.taxes[region.country] || 0;
      const company = companyContext(
        record,
        input.regions,
        raw,
        input.owner.country,
        input.owner.management,
        tax,
        roster,
      );
      company.engine = ((input.engines || {})[record._id] || 0) / 24; // PP an hour
      company.scrap = input.scrapsPrice || 0; // a tool's wear, as scraps lost
      companies.push(company);
      for (const r of roster) employees.push(parseEmployee(r, input.now));
    });
    return { raw, companies, employees };
  }

  // Each company's employees a day at today's rates, as if it's switched on (twin of company_day): [{profit, base, draws}]
  function companyDays(input) {
    const raw = new Set(input.raw);
    return input.companies.map((record, k) => {
      const roster = input.rosters[k] || [];
      const region = input.regions[record.region] || {};
      const company = {
        ...companyContext(
          record,
          input.regions,
          raw,
          input.owner.country,
          input.owner.management,
          input.taxes[region.country] || 0,
          roster,
        ),
        active: true,
      };
      company.engine = ((input.engines || {})[record._id] || 0) / 24;
      const crew = roster.map((r) => parseEmployee(r, input.now));
      const value = input.values[record.itemCode] || 0;
      let profit = 0,
        base = 0;
      for (const e of crew) {
        const h = hour(
          e,
          company,
          crew.filter((x) => x !== e),
          input.now,
        );
        profit += hourProfit(h, value) * 24;
        if (h.output) base += (h.production / OUTPUT_DIVISOR) * value * 24;
      }
      return {
        profit,
        base,
        draws: crew.filter((e) => drawsLeft(e) > 0).length,
        crew: crew.length,
      };
    });
  }

  // training values for the page or the twin check: input.training = {drawCost, management}
  function trainingOf(input) {
    const { companies, employees } = build(input);
    return trainingNow(
      companies,
      employees,
      input.values,
      input.now,
      input.days,
      input.training.drawCost,
      input.training.management,
      input.tools
        ? heldTools(input.tools.opened, input.tools.dismantled, input.rosters)
        : null,
    );
  }

  return {
    reshuffle,
    hour,
    crewProfit,
    parseEmployee,
    companyContext,
    movePlan,
    traitNames,
    trainingOf,
    heldTools,
    companyDays,
    cardAllocation,
    CREW_TRAITS,
    trainingNow,
    trainingValue,
    cardEffects,
    rarityOdds,
    Rng,
    seedOf,
    cardsFor,
    cardsContext,
  };
})();

if (typeof module !== "undefined") module.exports = CrewEngine;
