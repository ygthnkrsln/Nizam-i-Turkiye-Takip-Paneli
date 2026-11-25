// A player's companies and employees as the reference crews engine expects. WarEra calls use the application's
// same-origin proxy, and item values are adapted server-side from game rules and live prices.
"use strict";

// A skill's value as the game uses it: the profile's value + what the alliance's strategic resources add (v0.28.1; twin
// of warera/production.py skill_now).
const skillNow = (skills, name) =>
  ((skills[name] || {}).value || 0) + ((skills[name] || {}).strategic || 0);

// item code -> rarity (item_values.json), set by gather; a game item or card in its rarity's colour (style.css .r-*)
let RARITY = {};

function tinted(text, rarity) {
  const span = document.createElement("span");
  span.textContent = text;
  if (rarity) span.className = `r-${rarity}`;
  return span;
}

// an item by its game name in the page's language (i18n.js), in its rarity's colour
const itemText = (code) => tinted(I18N.item(code), RARITY[code]);

// Traits have no rarity: each in the colour the game's trait list gives it (user's screenshots, 2026-10-31; red = bad).
// Sweethearts, Girl power and Band of brothers weren't in the screenshots: gold, as the other good coworker traits.
// v0.27.4, not from a screenshot: Bully is bad now (red); Talks to Machines beside Stockpiler (green).
const TRAIT_COLOUR = {};
for (const [colour, codes] of Object.entries({
  gold: [
    "handy",
    "improviser",
    "nationalist",
    "cosmopolitan",
    "loner",
    "sociable",
    "rival",
    "primaDonna",
    "oldFriends",
    "sweethearts",
    "girlPower",
    "bandOfBrothers",
    "specialist",
    "craftsman",
    "laborer",
    "patriot",
    "expat",
    "statist",
  ],
  blue: [
    "comic",
    "mentor",
    "foreman",
    "loyal",
    "anchor",
    "scavenger",
    "gambler",
  ],
  green: [
    "quickStudy",
    "stockpiler",
    "talksToMachines",
    "veteran",
    "diamondInTheRough",
    "lateBloomer",
    "earlyBloomer",
    "modest",
    "salvager",
    "luckyCharm",
    "recruiter",
    "trainer",
  ],
  red: [
    "bully",
    "xenophobe",
    "envious",
    "nemesis",
    "manHater",
    "misogynist",
    "claustrophobe",
    "creatureOfHabit",
    "burnout",
    "wornOut",
    "homesick",
    "taxShy",
    "greedy",
    "climber",
    "flightRisk",
    "jinx",
  ],
}))
  codes.forEach((code) => {
    TRAIT_COLOUR[code] = colour;
  });

// a trait by its game name in its colour (Specialist's good, Diamond in the rough's stat in brackets)
function traitSpan(code, arg = null) {
  const span = document.createElement("span");
  span.textContent =
    arg && (code === "specialist" || code === "diamondInTheRough")
      ? `${I18N.trait(code)} (${code === "specialist" ? I18N.item(arg) : I18N.t(`stat.${arg}`)})`
      : I18N.trait(code);
  if (TRAIT_COLOUR[code]) span.className = `t-${TRAIT_COLOUR[code]}`;
  return span;
}

// [[code, arg], ...] as coloured names separated by commas; null for none
function traitsText(list) {
  if (!list || !list.length) return null;
  const out = document.createElement("span");
  list.forEach(([code, arg], i) =>
    out.append(...(i ? [", "] : []), traitSpan(code, arg)),
  );
  return out;
}

// One player's transactions of a type, newest first, a page at a time; each(items) answers false to stop.
async function pagedTransactions(api, params, each) {
  for (let cursor = null; ; ) {
    const page = await api.call("transaction.getPaginatedTransactions", {
      ...params,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });
    if (each(page.items || []) === false) return;
    cursor = page.nextCursor;
    if (!cursor || !(page.items || []).length) return;
  }
}

const TOOL_CODE = /^(hammer|pickaxe|skillet|sickle|caliper|flask)[0-9]+$/;

// What the engine needs to work out a player's tools (crews.js: heldTools; warera/crews.py: held_tools): the toolboxes
// opened, and the tools dismantled, read back only to the oldest tool not on an employee (a crafter dismantles hundreds
// of items a day, and the list can't be filtered by what was dismantled). Tools can't be traded.
async function readTools(api, userId, rosters, progress = () => {}) {
  progress(I18N.t("data.toolboxes"), 0);
  const opened = [];
  await pagedTransactions(
    api,
    { userId, transactionType: "openCase", itemCode: "toolbox" },
    (items) => {
      for (const r of items) {
        if (r.item)
          opened.push({
            id: r.item._id,
            code: r.item.code,
            bonus: r.item.skills.production,
            state: r.item.state,
            at: r.createdAt,
          });
      }
    },
  );
  const inUse = new Set(
    rosters
      .flat()
      .filter((e) => e.toolItem)
      .map((e) => e.toolItem._id),
  );
  const waiting = new Set(
    opened.filter((x) => !inUse.has(x.id)).map((x) => x.id),
  );
  const dismantled = [];
  if (waiting.size) {
    const oldest = Math.min(
      ...opened.filter((x) => waiting.has(x.id)).map((x) => Date.parse(x.at)),
    );
    let pages = 0;
    await pagedTransactions(
      api,
      { userId, transactionType: "dismantleItem" },
      (items) => {
        progress(I18N.t("data.dismantles", ++pages), 0.5);
        for (const r of items) {
          if (Date.parse(r.createdAt) < oldest) return false;
          if (r.item && TOOL_CODE.test(r.item.code)) {
            dismantled.push(r.item._id);
            waiting.delete(r.item._id);
          }
        }
        return waiting.size > 0;
      },
    );
  }
  return { opened, dismantled };
}

// A tool by its type, in its rarity's colour: the digit in its code is the rarity (config: hammer1 common .. hammer6 mythic)
const TOOL_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "epic",
  "legendary",
  "mythic",
];
const toolName = (x, withBonus = false) =>
  tinted(
    `${I18N.t(`tool.${x.type}`)}${withBonus ? ` +${I18N.num(x.bonus, 0)}%` : ""}`,
    TOOL_RARITIES[Number(x.code.replace(/^[a-z]+/, "")) - 1],
  );

async function itemValues() {
  if (globalThis.REFERENCE_ITEM_VALUES) return globalThis.REFERENCE_ITEM_VALUES;
  let response;
  try {
    response = await fetch("/api/warera-proxy?tool=damage&data=values", { cache: "no-store" });
  } catch {
    response = null;
  }
  if (!response || !response.ok) throw new Error(I18N.t("data.noValues"));
  return response.json();
}

// A player's company records (needs no token).
async function companyRecords(api, userId) {
  const list = await api.call("company.getCompanies", { userId, perPage: 50 });
  return (
    await api.callBatch(
      "company.getById",
      (list.items || []).map((companyId) => ({ companyId })),
    )
  ).filter(Boolean);
}

// Everything the engine needs, read the way tests/crews_twin.py reads it; progress(text, share of the reading).
async function gather(api, player, progress = () => {}) {
  progress(I18N.t("data.lookup"), 0);
  const [userId, username] = await api.findUser(player);
  progress(I18N.t("data.companies", username), 0.3);
  const [user, records, values] = await Promise.all([
    api.call("user.getUserById", { userId }),
    companyRecords(api, userId),
    itemValues(),
  ]);
  // without a token the site's relay reads the employees, for citizens of Poland only (api.js)
  if (!api.canReadEmployees(user)) throw new Error(I18N.t("relay.notPolish"));
  progress(I18N.t("data.employees", records.length), 0.6);
  return {
    username,
    userId,
    updated: Date.parse(values.updated),
    priceHours: values.price_hours,
    concrete: ((values.items || {}).concrete || {}).price || 0,
    input: await crewInput(api, user, records, values, Date.now()),
  };
}

// The crews engine's input for a player's companies: rosters (needs a token), regions, taxes, values.
async function crewInput(api, user, records, values, now) {
  const rosters = await api.callBatch(
    "employee.getCompanyEmployees",
    records.map((c) => ({ companyId: c._id })),
  );
  const estimates = await api.callBatch(
    "employee.getCompanyEstimate",
    records.map((c) => ({ companyId: c._id })),
  );
  const regionIds = [...new Set(records.map((c) => c.region))].sort();
  const regionRecords = await api.callBatch(
    "region.getById",
    regionIds.map((regionId) => ({ regionId })),
  );
  const regions = Object.fromEntries(
    regionIds.map((id, i) => [
      id,
      {
        country: (regionRecords[i] || {}).country ?? null,
        initialCountry: (regionRecords[i] || {}).initialCountry ?? null,
      },
    ]),
  );
  const countryIds = [
    ...new Set(
      Object.values(regions)
        .map((r) => r.country)
        .filter(Boolean),
    ),
  ].sort();
  const countries = await api.callBatch(
    "country.getCountryById",
    countryIds.map((countryId) => ({ countryId })),
  );
  const items = values.items || {};
  const engine = values.engine_daily_pp || {};
  RARITY = Object.fromEntries(
    Object.entries(items)
      .filter(([, v]) => v.rarity)
      .map(([code, v]) => [code, v.rarity]),
  );
  return {
    now,
    days: 30,
    // Management and a self-work click's PP with the alliance's strategic resources (v0.28.1; warera/production.py
    // skill_now); training cards go by the Management level (v0.27.3 note).
    owner: {
      country: user.country ?? null,
      management: skillNow(user.skills, "management"),
      managementLevel: user.skills.management.level || 0,
      clickPP: skillNow(user.skills, "production"),
      regen: user.skills.energy.hourlyBarRegen,
    },
    // the API keeps those who left on the roster for days (warera/crews.py: current_roster)
    companies: records,
    rosters: rosters.map((r) => (r || []).filter((e) => !e.leftAt)),
    regions,
    taxes: Object.fromEntries(
      countryIds.map((id, i) => [
        id,
        ((countries[i] || {}).taxes || {}).income || 0,
      ]),
    ),
    raw: Object.keys(items).filter((code) => items[code].raw),
    values: Object.fromEntries(
      Object.entries(items)
        .filter(([, v]) => v.value_per_pp)
        .map(([code, v]) => [code, v.value_per_pp]),
    ),
    engines: Object.fromEntries(
      records.map((c) => [
        c._id,
        engine[String((c.activeUpgradeLevels || {}).automatedEngine)] || 0,
      ]),
    ),
    energyPerClick: values.energy_per_click || 10,
    scrapsPrice: values.scraps_price || 0, // a tool's wear, as scraps lost (crews.js TOOL_WEAR_SHARE)
    managerCosts: Object.fromEntries(
      records.map((c, i) => [c._id, (estimates[i] || {}).managerCost || 0]),
    ),
  };
}
