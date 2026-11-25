// The war skill optimizer (public, called the damage estimator until 2026-11-05; WEBSITE.md → 12 war skill optimizer; damage_estimator.py on the desktop): a player's name
// and what they want -> [ RUN ] -> the skills to assign and the equipment to use, with a sandbox mode to set a build by
// hand. Shared game rules and equipment prices come from the server proxy and Supabase; player details go through
// the same-origin WarEra proxy; the searches run in a Web Worker
// (damage_worker.js → damage.js, the twin of warera/battle.py; tests/damage_twin.py). Turkish, English or Polish (i18n.js); text
// goes in with textContent.
"use strict";

const t = I18N.t;
// The simple version (site/simple-damage/, public tool 12a; user, 2026-11-21: "just put your username/token and the wealth
// to lose amount"): its own page (body.simple) with the same fields, the full version's hidden and fixed (applySimple),
// one search, the pill's debuff fought without gear or food (sc.debuffBare), and the results cut to the skills, the
// equipment and the summary with the combat stats.
const SIMPLE = document.body.classList.contains("simple");
I18N.add({
  en: {
    "dmg.title": "War skill optimizer",
    "dmg.description":
      "The skills and equipment that do the most damage a day for what a WarEra player accepts to pay.",
    "dmg.heading": "WAR SKILL OPTIMIZER",
    "dmg.titleSimple": "War skill optimizer, simple",
    "dmg.headingSimple": "WAR SKILL OPTIMIZER (SIMPLE)",
    "dmg.promptSimple":
      "type your name and the wealth you accept to lose a day: the skills to set and the equipment to buy for the most damage",
    "dmg.toSimple": "[ simple version: only your name and the wealth to lose ]",
    "dmg.toFull":
      "[ full version: every option, the sandbox and the comparisons ]",
    "dmg.budgetHintSimple":
      "coins a day; 0 = your wealth stays where it is, negative = the gain you want.",
    "dmg.donationReminder":
      "the build assumes you donate 50 coins a day to your country's treasury, so remember to donate!",
    "dmg.noEmployeesSimple":
      "employees not counted: the game shows them only to a token (this site reads them itself only for citizens of Poland). Paste your token to count them.",
    "dmg.prompt":
      "the skills and equipment that do the most damage a day for what you accept to pay",
    "dmg.tokenStatus":
      "the token stays in this browser and is sent only to api2.warera.io, never to this site.",
    "dmg.playerHint":
      'the tool runs without an API token. The token is needed only to count your employees\' income, except for citizens of Poland (this site reads their employees with its own token); otherwise type that income yourself under "your income".',
    "dmg.optionalHint":
      "The fields below will be autopopulated by the tool if left empty, no need to fill them",
    "dmg.run": "[ RUN ]",
    "dmg.wantHead": "what you want",
    "dmg.goal": "goal:",
    "dmg.goalDamage": "most damage for the wealth I accept to lose",
    "dmg.goalProfit": "most profit",
    "dmg.goalTarget": "least cost for a damage",
    "dmg.goalMax": "most damage, at any cost",
    "dmg.budget": "wealth to lose a day:",
    "dmg.budgetHint":
      "coins; negative = the gain you want. Fighting may spend this plus your income.",
    "dmg.target": "damage to reach:",
    "dmg.bonus": "battle bonus:",
    "dmg.bonusHint":
      "patriotic, orders, MU headquarters... added up (a State Army +5% for its country and allies, a Private Mercenary +5% under contract)",
    "dmg.burst":
      "count only the burst (full bars at the start) instead of the day",
    "dmg.countHead": "what to count",
    "dmg.pill": "use pill",
    "dmg.help": "MU help (10 health every 12 h)",
    "dmg.debuff":
      "hits in the pill's debuff too (with the window's gear, none or a set of their own, whichever is best)",
    "dmg.pool": "pool loot (war spoils) for the day's damage",
    "dmg.employees":
      "my employees' profit (needs the token, except for citizens of Poland)",
    "dmg.keepCompanies":
      "keep all my current companies (unticked: the companies skill may be any level, and new companies are counted)",
    "dmg.noEco":
      "no economy skills other than companies (energy, production and management at most level 0)",
    "dmg.fullPrecision":
      "only builds with at least 100% precision (no misses with the gear on)",
    "dmg.oneFood": "one kind of food only",
    "dmg.foods": "foods allowed:",
    "dmg.qualities": "equipment qualities:",
    "dmg.bounty": "pay per 1,000 damage:",
    "dmg.bountyHint": "bounty or mercenary contract, coins",
    "dmg.bountyMillion": "bounty per 1M damage:",
    "dmg.bountyMillionHint":
      "coins you get for each million damage (a bounty or mercenary contract); 0 = none",
    "dmg.skillsHead": "skills",
    "dmg.skillsMode": "skills:",
    "dmg.modeSearch": "search every skill (a reset)",
    "dmg.modeAdd": "only add to my skills (no reset)",
    "dmg.keepBuild":
      "keep my current build: only choose the equipment (no skill reset)",
    "dmg.noStrategic":
      "don't count strategic resources (as if your alliance held none)",
    "dmg.modeFreeze": "keep the skills shown below",
    "dmg.level": "level:",
    "dmg.prestige": "prestige points:",
    "dmg.rank": "military rank %:",
    "dmg.yours": "yours",
    "dmg.auto": "auto",
    "dmg.strategic": "strategic resources, your alliance's levels 0-3:",
    "dmg.res.coal": "coal",
    "dmg.res.diamonds": "diamonds",
    "dmg.res.lithium": "lithium",
    "dmg.res.rareEarths": "rare earths",
    "dmg.res.gold": "gold",
    "dmg.res.uranium": "uranium",
    "dmg.strategicHint":
      "a level adds at every skill level: coal +5 precision, diamonds +10 health, lithium +10 energy, rare earths +3 production, gold +1 management, uranium +2 loot chance (empty: what your profile shows)",
    "dmg.limitsHint":
      'each skill\'s lowest and highest level, 0-10 (empty: any; companies: as now while "keep all my current companies" is ticked). Prestige bonus levels come on top.',
    "dmg.min": "min",
    "dmg.max": "max",
    "dmg.incomeHead": "your income",
    "dmg.incomeHint":
      "empty fields use what the game shows for you; these raise what fighting may cost.",
    "dmg.coinsDay": "coins a day",
    "dmg.casesDay": "cases a day",
    "dmg.incMissions": "missions, every set",
    "dmg.incDaily": "daily reward calendar",
    "dmg.incOther": "other (trading, crafting...)",
    "dmg.incEmployees": "employees (their output less wages)",
    "dmg.donate": "donate to my country's treasury a day:",
    "dmg.donateHint": "coins, counted as an expense.",
    "dmg.gearPrices":
      "the prices below may differ slightly from those you see on the market, so double-check them, especially for weapons.",
    "dmg.gearScraps":
      "an item that is used up gives back 1/3 of its scrap value, so when the tool suggests gold items that look much more expensive than purple ones, remember they also give more scraps back.",
    "dmg.rowDonation": "donation to the country",
    "dmg.donationNote": "to the treasury, an expense",
    "dmg.noDonation": "without the donation",
    "dmg.noDonationNote": (more, pct) => `${more} (${pct}) more`,
    "dmg.mercDamage": "mercenary damage it pays for",
    "dmg.countryGoods": "or, for the country",
    "dmg.paperOrOil": (paper, oil) => `${paper} paper or ${oil} oil`,
    "dmg.countryNote": (paper, oil) =>
      `to keep the country running; 24 h prices: paper ${paper}, oil ${oil}`,
    "dmg.mercNote": (rate) =>
      `at ${rate} coins per 1,000 damage, a professional mercenary's rate`,
    "dmg.searchingNoDonation": "the same without the donation",
    "dmg.rowEmployeesTyped": "employees (typed)",
    "dmg.rowAfterDonation": "left after the donation",
    "dmg.incPool": "pool loot (war spoils)",
    "dmg.poolHint":
      "pool loot: empty = what fighters with the build's damage got on the last 7 days, at market prices, worked out for each build; type coins a day to count your own number instead.",
    "dmg.poolOff":
      'pool loot isn\'t counted (ticked off under "what to count").',
    "dmg.poolAt": (damage, coins) =>
      `pool loot at this build's ${damage} damage a day: ${coins} coins, what fighters with that damage got on the last 7 days`,
    "dmg.poolAtEnd": ". Type coins a day to count your own number instead.",
    "dmg.poolTyped": (coins) =>
      `pool loot: your ${coins} coins a day, whatever the damage`,
    "dmg.poolTable": (coins) =>
      `; by the fighters' days it would be ${coins} at this build's damage`,
    "dmg.poolAbout": " (about ",
    "dmg.poolADay": " items a day)",
    "dmg.poolNoItems": "no items",
    "dmg.muDivision": "MU league division:",
    "dmg.muDivisionNow": (name) => `your MU's: ${name}`,
    "dmg.muNotIn": "not in the league this week",
    "dmg.muPlace": "MU league place:",
    "dmg.muPlaceHint":
      "an assumption: the unit's place in its group of 10; the League tab shows the real one",
    "dmg.muShare": "your share of the MU's damage %:",
    "dmg.muShareHint": "by default an equal split of its members",
    "dmg.muShareNow": (members, now) =>
      `by default an equal split of ${members} members${now === null ? "" : `; yours this week so far ${now}%`}`,
    "dmg.div": (k) =>
      k === 15
        ? "Master"
        : `${["Bronze", "Silver", "Gold", "Platinum", "Diamond"][Math.floor(k / 3)]} ${["III", "II", "I"][k % 3]}`,
    "dmg.leaguePlace": "your weekly league place:",
    "dmg.leagueHint":
      "your group is random, so this is an assumption; the League card shows your real place",
    "dmg.leagueBonus": "league group bonus %:",
    "dmg.leagueBonusHint":
      "raises the prizes above, money and cases; empty: your group's, read from the game (x1.39 = 39)",
    "dmg.leagueDefault": (place, prize) =>
      `by default place ${place} (${prize})`,
    "dmg.leaguePlaceN": (place, prize) => `place ${place}: ${prize}`,
    "dmg.leagueNone": "no prize (the last 2 places)",
    "dmg.leagueMoney": (n) => `${n} coins`,
    "dmg.managerPay": "a manager job's pay:",
    "dmg.managerHint":
      "coins a day a Management point, after tax; 0 = no manager job",
    "dmg.managerNow": (pay) =>
      `coins a day a Management point, after tax; 0 = no manager job. Open jobs pay about ${pay} before tax.`,
    "dmg.selfValue": "self-work, coins a PP:",
    "dmg.selfHint": "by default your best company's item",
    "dmg.selfClicks": "self-work clicks a day:",
    "dmg.selfClicksHint":
      "empty: what your energy bar gives, less one for each employee with training draws left. Type more to give up training and go full on self-work (at most what the bar gives counts).",
    "dmg.selfClicksNow": (n) =>
      `empty: what your energy bar gives, less one for each employee with training draws left (${n} now). Type more to give up training and go full on self-work (at most what the bar gives counts).`,
    "dmg.rowSelfClicks": (n) => `self-work (${n} clicks a day)`,
    "dmg.engine": "automated engines:",
    "dmg.engineOwn": "each at its own level",
    "dmg.engineAt": (n) => `all at level ${n}`,
    "dmg.pricesHead": "prices",
    "dmg.pricesHint": "empty: the median of the last 24 hours.",
    "dmg.adjust": "all equipment prices, %:",
    "dmg.reset": "[ reset the fields ]",
    "dmg.sandboxHead": "sandbox",
    "dmg.sandbox": "sandbox mode: set the build yourself, worked out at once",
    "dmg.summaryHead": "the best build",
    "dmg.summarySandbox": "your sandbox build",
    "dmg.buildSkills": "skills to assign",
    "dmg.buildGear": "equipment to buy and use",
    "dmg.costsHead": "coins a day",
    "dmg.incomeResult": "income a day",
    "dmg.statsHead": "combat stats",
    "dmg.compareHead":
      "compare: without the pill, and with your fighting skills",
    "dmg.curveHead": "wealth to lose a day and damage a day",
    "dmg.curveRun": "[ work out the curve ]",
    "dmg.curveTable": "[ table ]",
    "dmg.curveChart": "[ chart only ]",
    "dmg.listHead": "equipment prices",
    "dmg.noPlayer": "type a player's name first",
    "dmg.noData":
      "the market data isn't available right now: the server writes it once an hour",
    "dmg.reading": (name) => `reading ${name}`,
    "dmg.market": "reading the market data",
    "dmg.searching": "searching the best build",
    "dmg.searchingNoPill": "the same without the pill",
    "dmg.searchingYours": "the same with your fighting skills",
    "dmg.goalSearch":
      "searching the budget: about 12 searches a build, up to a minute",
    "dmg.done": (s) => `done in ${s} s.`,
    "dmg.stopped": "the search stopped",
    "dmg.limitsTooHigh": (need, level, have) =>
      `the skill limits' minimums need ${need} skill points; level ${level} gives ${have}. Lower a minimum.`,
    "dmg.notReached": (damage, burst) =>
      `no build within the skill limits and qualities does ${damage} damage ${burst ? "in the burst" : "a day"}.`,
    "dmg.keepFailed":
      "your skills need more points than that level gives, so the skills are searched too.",
    "dmg.freezeFailed":
      "the skills shown need more points than that level gives, so the skills are searched too.",
    "dmg.noPrecision": (best) =>
      `no build within the limits and qualities reaches 100% precision (best ${best}%): raise the precision limit or allow better gloves.`,
    "dmg.overBudget": (cost, over) =>
      `not possible: the cheapest build found costs ${cost} a day, ${over} more than your income + the wealth you accept to lose.`,
    "dmg.noEmployees":
      'employees not counted: the game shows them only to a token, and without one this site reads them only for citizens of Poland. Paste your token, or type their income under "your income", in the employees row.',
    "dmg.lowLevel": (level) =>
      `below level ${level} fighting skills are closed (the game opens them at ${level}), so the points go to the economy skills.`,
    "dmg.pricesAsOf": (when) =>
      `prices as of ${when}, your local time; refreshed once an hour.`,
    "dmg.damageDay": "damage a day",
    "dmg.hitsNote": (hits, debuff, kind) =>
      `${hits} hits` +
      (debuff
        ? ` + ${debuff} in the debuff (${
            {
              same: "the same gear and ammo",
              none: "no gear",
              own: "their own gear",
            }[kind]
          })`
        : ""),
    "dmg.damageHit": "damage a hit",
    "dmg.hitNote": (health, dodged) =>
      `${health} health a hit, ${dodged}% dodged`,
    "dmg.burstRow": "burst at the start",
    "dmg.burstNote": (hits, rest) =>
      `${hits} hits; then ${rest} on the refills over 8 h`,
    "dmg.fightCost": "fighting cost a day",
    "dmg.fightNote": "net of the cases and loot it brings",
    "dmg.incomeDay": "income a day",
    "dmg.incomeNote": (fixed, eco) => `fixed ${fixed} + skills ${eco}`,
    "dmg.wealthDay": "wealth change a day",
    "dmg.wealthNote": "income - fighting",
    "dmg.per1000": "per 1,000 damage",
    "dmg.gearSet": "equipment set",
    "dmg.gearSetNote": "one of each, coins tied up",
    "dmg.overShort": "over budget",
    "dmg.goalLineMax": "at any cost",
    "dmg.goalLineProfit": "the most any build in the limits gains",
    "dmg.goalLineTarget": (d) => `the least loss for ${d} damage`,
    "dmg.skill": "skill",
    "dmg.lvl": "level",
    "dmg.now": "now",
    "dmg.change": "change",
    "dmg.val": "value",
    "dmg.points": "points",
    "dmg.prestigeCol": "prestige",
    "dmg.fighting": "fighting",
    "dmg.economy": "economy",
    "dmg.pointsNote": (total, fight, eco) =>
      `${total} skill points: ${fight} in fighting, ${eco} in economy`,
    "dmg.unused": (n) => `, ${n} unused`,
    "dmg.prestigeUsed": (used, all) =>
      `; ${used} of ${all} prestige points in bonus levels (shown as skill points + bonus)`,
    "dmg.resetNote": (cost, free) =>
      ` A reset costs ${cost} coins here` +
      (free
        ? `, or none with your ${free} free ${free === 1 ? "reset" : "resets"}.`
        : "."),
    "dmg.slot": "slot",
    "dmg.item": "item",
    "dmg.statsCol": "stats",
    "dmg.price": "price",
    "dmg.coinsADay": "coins a day",
    "dmg.usedDay": "used a day",
    "dmg.scrapsBack": "scraps back",
    "dmg.week": "for 7 days",
    "dmg.ammoRow": "ammo",
    "dmg.foodRow": "food",
    "dmg.pillRow": "pill",
    "dmg.oneADay": "one a day",
    "dmg.none": "none",
    "dmg.foodsOf": (slots) => `of ${slots} hunger`,
    "dmg.slot.weapon": "weapon",
    "dmg.slot.helmet": "helmet",
    "dmg.slot.chest": "chest",
    "dmg.slot.pants": "pants",
    "dmg.slot.boots": "boots",
    "dmg.slot.gloves": "gloves",
    "dmg.gearNote":
      "stats: weapons attack/crit %. An item lasts 100 hits (armour isn't worn on dodged hits); ammo one a hit. Coins a day = price x used a day - scraps back: a broken item dismantles into 1/3 of its scraps. Used a day counts the pill window's hits; the debuff's are in its own table below. Click an item for its market in the game.",
    "dmg.costAmmo": "ammo",
    "dmg.costWear": (slot) => `wear: ${slot}`,
    "dmg.costFood": "food",
    "dmg.costPill": "pill",
    "dmg.costCases": "cases dropped",
    "dmg.costDebuff": "cases dropped in the debuff",
    "dmg.costDebuffAmmo": "ammo in the debuff",
    "dmg.costDebuffWear": (slot) => `wear in the debuff: ${slot}`,
    "dmg.gearWindow": "during the pill (8 h at +60% attack):",
    "dmg.gearDebuff": (hits, kind) =>
      `during the debuff (16 h at -60% attack, ${hits} hits): ${
        {
          same: "the same equipment",
          none: "no equipment",
          own: "its own equipment",
        }[kind]
      }`,
    "dmg.debuffNote": (kind) =>
      ({
        same: "the same items and ammo as during the pill; the numbers are the debuff's hits only.",
        none: "no equipment and no ammo: the debuff's hits cost nothing but food, and those that don't miss still drop cases.",
        own: "change into these when the pill's 8 h end. An item worn in both sets is bought once; the numbers are the debuff's hits only.",
      })[kind],
    "dmg.costBounty": "pay per 1,000 damage",
    "dmg.costPool": "pool loot",
    "dmg.costTotal": "fighting a day",
    "dmg.source": "source",
    "dmg.value": "coins a day",
    "dmg.rowManager": "manager job",
    "dmg.rowSelf": "self-work",
    "dmg.rowEngines": "automated engines",
    "dmg.rowEmployees": "employees",
    "dmg.rowMu": "MU league prize (assumed place, your share)",
    "dmg.rowLeague": "weekly league prize (assumed place)",
    "dmg.rowTotal": "income with this build",
    "dmg.rowNew": (n) =>
      `of these, ${n} new ${n === 1 ? "company" : "companies"} you don't have yet`,
    "dmg.newCompanies": (n, coins, cost, concrete, steel, level, days) =>
      `This build counts ${n} new ${n === 1 ? "company" : "companies"} you don't have yet, ${coins} coins a day of its income. That needs an investment of about ${cost} coins: ${concrete} concrete to build, ${steel} steel for engines at level ${level} and the break rooms (80% back if undone)${days ? `, about ${days} days of what they earn` : ""}.`,
    "dmg.newCrews": (seats, each) =>
      ` Each needs ${seats} ${seats === 1 ? "employee" : "employees"} hired and trained first: counted at your weakest crew's rate today, ${each} coins a day; a new crew may well start lower. The energy for hiring and training isn't taken off self-work.`,
    "dmg.companiesNote": (count, all) =>
      `the build's companies skill keeps your best ${count} of ${all} companies on; the rest are switched off, not lost.`,
    "dmg.steelNote": (steel, coins) =>
      ` Upgrading the engines takes ${steel} steel (~${coins} coins, kept in wealth).`,
    "dmg.statAttack": "attack (with ammo, pill, rank)",
    "dmg.statPrecision": "precision",
    "dmg.statCrit": "crit chance",
    "dmg.statCritDamage": "crit damage",
    "dmg.statArmor": "armor",
    "dmg.statDodge": "dodge",
    "dmg.statHealth": "health / hunger",
    "dmg.statLoot": "loot chance",
    "dmg.armorNote": (p, h) => `${p}% less health, ${h} a hit`,
    "dmg.dodgeNote": (p) => `${p}% of hits`,
    "dmg.build": "build",
    "dmg.rowBest": "best, with the pill",
    "dmg.rowSandbox": "sandbox, with the pill",
    "dmg.rowNoPill": "without the pill",
    "dmg.rowYours": "your fighting skills as now",
    "dmg.rowBase": "the search's best",
    "dmg.weapon": "weapon",
    "dmg.skillsCol": "skills",
    "dmg.waiting": "working on it…",
    "dmg.curveNote":
      "the best build at each wealth to lose, with and without the pill (a quicker search: within ~1% of the best). 28 searches, ~15 s on 4 cores.",
    "dmg.curveProgress": (a, b) => `working out the curve: ${a} of ${b}`,
    "dmg.curveFailed": (a, b, error) =>
      `the curve stopped after ${a} of ${b}: ${error}`,
    "dmg.curvePill": "with the pill",
    "dmg.curveNoPill": "without the pill",
    "dmg.curveOnly": "the curve is for the most damage goal.",
    "dmg.curveBudget": "wealth to lose a day",
    "dmg.curveDamage": "damage",
    "dmg.listNote": (tax) =>
      `the price to expect for each item + stats of the qualities ticked (its median sale, or its last 3 sales when higher, as a cheap run that sold out says nothing about the next buy; never below a worse item), the window it's from, what you pay (your country's market tax: ${tax}%) and the wear a hit (what you pay minus the scraps a broken one gives back, over its 100 hits). Q1-Q2 come from each item's latest 100 sales, so a rare stat can rest on one sale.`,
    "dmg.allSlots": "all slots",
    "dmg.median": "market price",
    "dmg.paid": "you pay",
    "dmg.wear": "wear a hit",
    "dmg.sales": "sales",
    "dmg.window": "window",
    "dmg.sb.intro":
      "it starts from the build shown; every field is worked out at once, with the same model. Prices: the exact item + stats' market price, else the nearest sold stats, unless you type one.",
    "dmg.sb.points": (used, total) => `${used} of ${total} skill points used`,
    "dmg.sb.over": (n) => ` (${n} too many)`,
    "dmg.sb.left": (n) => ` (${n} left)`,
    "dmg.sb.prestige": (used, all) =>
      `; ${used} of ${all} prestige points in bonus levels (the + fields: 1, 2, 4, 8 points a level on one skill)`,
    "dmg.sb.item": "item",
    "dmg.sb.sold": "sold stats (price, sales)",
    "dmg.sb.stats": "stats",
    "dmg.sb.yourPrice": "your price",
    "dmg.sb.used": "price used",
    "dmg.sb.nothing": "none",
    "dmg.sb.ownStats": "own stats",
    "dmg.sb.noneSold": "none sold",
    "dmg.sb.ammo": "ammo:",
    "dmg.sb.food": "food:",
    "dmg.sb.foodAuto": "auto: the best within the budget",
    "dmg.sb.foodEvery": (name) => `${name}, every hunger slot`,
    "dmg.sb.fromBest": "[ from the search's best ]",
    "dmg.sb.fromMine": "[ from my skills now ]",
    "dmg.sb.ownPrice": "your price",
    "dmg.sb.medianOf": (n, w) =>
      `from ${n} ${n === 1 ? "sale" : "sales"} (${w})`,
    "dmg.sb.nearest": (s) => `not sold: nearest sold ${s}`,
    "dmg.sb.never": "never sold: type a price",
    "dmg.sb.paid": (p, note) => `${p} paid: ${note}`,
    "dmg.sb.noPrice": (name) =>
      `${name} has no sales to price it: type a price (counted as 0).`,
    "dmg.sb.tooMany": (used, level, have) =>
      `the sandbox's skills use ${used} skill points; level ${level} gives ${have}. Lower a skill.`,
    "dmg.sb.tooManyPrestige": (used, have) =>
      `the sandbox's bonus levels take ${used} prestige points; you have ${have}. Lower a + field.`,
    "dmg.sb.over2": (cost, over) =>
      `this build costs ${cost} a day, ${over} more than your income + the wealth to lose.`,
    "dmg.sb.ok": (used, total) =>
      `sandbox: your build, worked out without a search (${used} of ${total} skill points).`,
    "dmg.stat.attack": "attack",
    "dmg.stat.crit": "crit %",
    "dmg.stat.critDamage": "crit damage",
    "dmg.stat.armor": "armor",
    "dmg.stat.dodge": "dodge",
    "dmg.stat.precision": "precision",
    "name.skill.attack": "Attack",
    "name.skill.precision": "Precision",
    "name.skill.criticalChance": "Crit. chance",
    "name.skill.criticalDamages": "Crit. damages",
    "name.skill.armor": "Armor",
    "name.skill.dodge": "Dodge",
    "name.skill.health": "Health",
    "name.skill.lootChance": "Loot chance",
    "name.skill.hunger": "Hunger",
    "name.skill.energy": "Energy",
    "name.skill.production": "Production",
    "name.skill.companies": "Companies",
    "name.skill.management": "Management",
    "name.item.case1": "Case",
    "name.item.case2": "Elite Case",
    "name.item.woodenCase": "Wooden Case",
    "name.item.scraps": "Scraps",
    "name.item.cocain": "Pill",
    "dmg.notes": [
      "one day = one pill window: 8 h at +60% attack, starting with full health and hunger bars, 8 hourly refills (10% of each bar), one MU help and the food you buy; every hit that gives is fought. Without the pill: 24 h of refills, two MU helps, the same gear.",
      "hits in the debuff: its 16 h of refills fill the bar for the next window and leave 0.6 of a bar, plus the second MU help and 0.6 of a hunger bar of food (so the day eats as much as without the pill). They're fought at -60% attack with the window's gear, ammo and food, or with no gear (they cost nothing and the hits that don't miss still drop cases), or with a set of their own (searched after the build: from the window's set and from none, each slot in turn, then the window's gear again), whichever gives the best day: with the window's gear, the costs and cases are those of a day without the pill, plus the pill. The debuff's set is shown in its own fold under the equipment.",
      "wealth to lose = the most your wealth may fall a day. Fighting may spend that plus your income: missions, the daily reward calendar, the MU league prize (your unit's division and place 5 unless you pick others, split by your share of its damage: an equal split of its members unless you type one), the weekly league prize at the place you assume (place 5 unless you pick another; your group is random; its bonus read from the game), and what the build's skills earn.",
      "the donation to your country (ticked by default, 50 coins a day): an expense the game doesn't require. It's taken off what fighting may spend, and for the most damage goal the same search runs without it, to show the damage it costs; the mercenary line is the donation at 0.15 coins per 1,000 damage (a professional mercenary's rate), and the paper and oil line the same coins at those items' prices of the last 24 hours.",
      "fighting and economy skills share one pool of points (4 a level; level n of a skill costs n). The points fighting leaves go to the best mix of energy and production (self-work: the energy bar, 2.4 bars a day, 10 energy a click, less a click for each employee with training draws left, or the clicks you type; production's PP a click, valued at your best company's item), companies (the engines and employees of the companies it keeps on) and management (+2% of your employees' base output a point; a manager job's pay if you type one; better training cards aren't counted). Fighting skills and manager jobs open at level 10.",
      "employees: today's rates from their records (output at the item's 24 h median, less wages), as the crews page works them out, with no training or retirements ahead. A number typed in their row under \"your income\" replaces them: a fixed amount, whatever the companies and management levels.",
      "damage a hit = attack x (precision x (1 + crit chance x crit damage) + misses x 1/2) x (1 + battle bonus); attack = (skill + weapon + 4 per precision point over 100) x ammo x pill x military rank. Checked against live hits.",
      "health a hit = 10 x (1 - armour %), armour % = armour / (40 + armour) rounded to a whole percent, the health cut down to 0.1 as the game does; dodged hits (dodge / (dodge + 40), also rounded) cost none and don't wear the armour.",
      "costs: ammo (one a hit), each item's wear (1% a hit, armour only when not dodged; the price less the scraps a broken one gives back, 1/3 of its scraps), food, the pill. Back: cases (loot chance per hit that doesn't miss; the elite case at 1/100 of it) and the pay per 1,000 damage.",
      "strategic resources (v0.28.1): your alliance's levels from your profile (change them to try another alliance); a level adds at every skill level coal +5 precision, diamonds +10 health, lithium +10 energy, rare earths +3 production, gold +1 management, uranium +2 loot chance. The tick for not counting them, in the first section, leaves them all out. The wooden cases on the map aren't counted (they leave the game on 9 November).",
      "pool loot: what fighters with about your day's damage really got on the last 7 whole days, over all the rounds and battles they fought in (about 3 rounds in 2.4 battles a day, the largest with about 72% of their damage), each item at its market price.",
      "new companies (only with \"keep all my current companies\" unticked): each one the companies skill allows beyond what you own is counted as an engine at your lowest level, making your best company's item, with your weakest crew's profit (never below 0). The nth company costs 50 x n concrete. The investment is only reported: it isn't taken off the budget, so the search can choose companies that take a long time to pay back.",
      "not counted: buying the equipment on better or worse offers than this price, your own crafting, the +1 health a helper gets for an MU help, equipment you already own.",
      "the search: 16 starting skill splits, one- and two-slot equipment changes, skill moves of up to 4 levels; it found the true best in all 60 small cases checked by trying everything. Same model and search as the desktop tool, checked to give the same build.",
    ],
  },
  pl: {
    "dmg.title": "Optymalizator umiejętności wojennych",
    "dmg.description":
      "Umiejętności i sprzęt, które dają najwięcej obrażeń dziennie za tyle, ile gracz WarEra chce zapłacić.",
    "dmg.heading": "OPTYMALIZATOR UMIEJĘTNOŚCI WOJENNYCH",
    "dmg.titleSimple": "Optymalizator umiejętności wojennych, prosty",
    "dmg.headingSimple": "OPTYMALIZATOR UMIEJĘTNOŚCI WOJENNYCH (PROSTY)",
    "dmg.promptSimple":
      "wpisz swoją nazwę i ile majątku dziennie chcesz stracić: umiejętności do ustawienia i sprzęt do kupienia na najwięcej obrażeń",
    "dmg.toSimple": "[ wersja prosta: tylko nazwa i strata majątku ]",
    "dmg.toFull": "[ wersja pełna: wszystkie opcje, piaskownica i porównania ]",
    "dmg.budgetHintSimple":
      "monet dziennie; 0 = majątek się nie zmienia, ujemna = zysk, którego chcesz.",
    "dmg.donationReminder":
      "build zakłada, że wpłacasz 50 monet dziennie do skarbca swojego kraju, więc pamiętaj o wpłacie!",
    "dmg.noEmployeesSimple":
      "pracownicy nie są liczeni: gra pokazuje ich tylko z tokenem (ta strona czyta ich sama tylko dla obywateli Polski). Wklej token, aby ich policzyć.",
    "dmg.prompt":
      "umiejętności i sprzęt, które dają najwięcej obrażeń dziennie za tyle, ile chcesz zapłacić",
    "dmg.tokenStatus":
      "token zostaje w tej przeglądarce i trafia tylko do api2.warera.io, nigdy na tę stronę.",
    "dmg.playerHint":
      'narzędzie działa bez tokena API. Token jest potrzebny tylko, żeby policzyć dochód z twoich pracowników, poza obywatelami Polski (ich pracowników ta strona czyta własnym tokenem); w innym razie wpisz ten dochód sam w sekcji "twój dochód".',
    "dmg.optionalHint":
      "Pola poniżej narzędzie uzupełni samo, jeśli zostaną puste, nie trzeba ich wypełniać",
    "dmg.run": "[ LICZ ]",
    "dmg.wantHead": "czego chcesz",
    "dmg.goal": "cel:",
    "dmg.goalDamage": "najwięcej obrażeń za majątek, który chcę stracić",
    "dmg.goalProfit": "największy zysk",
    "dmg.goalTarget": "najmniejszy koszt dla danych obrażeń",
    "dmg.goalMax": "najwięcej obrażeń, za każdą cenę",
    "dmg.budget": "strata majątku dziennie:",
    "dmg.budgetHint":
      "monety; ujemna = zysk, jakiego chcesz. Walka może kosztować tyle plus twój dochód.",
    "dmg.target": "obrażenia do osiągnięcia:",
    "dmg.bonus": "bonus bitewny:",
    "dmg.bonusHint":
      "patriotyczny, rozkazy, kwatera JW... razem (Armia Państwowa +5% dla swojego kraju i sojuszników, Prywatni Najemnicy +5% na kontrakcie)",
    "dmg.burst":
      "licz tylko uderzenie na start (pełne paski) zamiast całego dnia",
    "dmg.countHead": "co liczyć",
    "dmg.pill": "użyj pigułki",
    "dmg.help": "pomoc JW (10 zdrowia co 12 h)",
    "dmg.debuff":
      "uderzenia także w osłabieniu po pigułce (ze sprzętem z okna, bez albo z osobnym kompletem, co najlepsze)",
    "dmg.pool": "łupy z puli (war spoils) za dzienne obrażenia",
    "dmg.employees":
      "zysk z moich pracowników (potrzebny token, poza obywatelami Polski)",
    "dmg.keepCompanies":
      "zachowaj wszystkie moje obecne firmy (odznaczone: umiejętność firm może mieć dowolny poziom i liczone są nowe firmy)",
    "dmg.noEco":
      "bez umiejętności ekonomicznych poza firmami (energia, produkcja i zarządzanie najwyżej na poziomie 0)",
    "dmg.fullPrecision":
      "tylko buildy z precyzją co najmniej 100% (bez pudeł w sprzęcie)",
    "dmg.oneFood": "tylko jeden rodzaj jedzenia",
    "dmg.foods": "dozwolone jedzenie:",
    "dmg.qualities": "jakość sprzętu:",
    "dmg.bounty": "zapłata za 1000 obrażeń:",
    "dmg.bountyHint": "nagroda lub kontrakt najemniczy, monety",
    "dmg.bountyMillion": "nagroda za 1 mln obrażeń:",
    "dmg.bountyMillionHint":
      "monety za każdy milion obrażeń (nagroda lub kontrakt najemniczy); 0 = brak",
    "dmg.skillsHead": "umiejętności",
    "dmg.skillsMode": "umiejętności:",
    "dmg.modeSearch": "szukaj wszystkich (reset)",
    "dmg.modeAdd": "tylko dodaj do moich (bez resetu)",
    "dmg.keepBuild":
      "zostaw moje obecne umiejętności: wybierz tylko sprzęt (bez resetu)",
    "dmg.noStrategic":
      "nie licz surowców strategicznych (jakby twój sojusz nie miał żadnych)",
    "dmg.modeFreeze": "zostaw te pokazane niżej",
    "dmg.level": "poziom:",
    "dmg.prestige": "punkty prestiżu:",
    "dmg.rank": "ranga wojskowa %:",
    "dmg.yours": "twój",
    "dmg.auto": "auto",
    "dmg.strategic": "surowce strategiczne, poziomy twojego sojuszu 0-3:",
    "dmg.res.coal": "węgiel",
    "dmg.res.diamonds": "diamenty",
    "dmg.res.lithium": "lit",
    "dmg.res.rareEarths": "metale ziem rzadkich",
    "dmg.res.gold": "złoto",
    "dmg.res.uranium": "uran",
    "dmg.strategicHint":
      "poziom dodaje na każdym poziomie umiejętności: węgiel +5 celności, diamenty +10 zdrowia, lit +10 energii, metale ziem rzadkich +3 produkcji, złoto +1 zarządzania, uran +2 szansy na łup (puste: to, co pokazuje twój profil)",
    "dmg.limitsHint":
      'najniższy i najwyższy poziom każdej umiejętności, 0-10 (puste: dowolny; firmy: jak teraz, gdy zaznaczone jest "zachowaj wszystkie moje obecne firmy"). Poziomy z prestiżu dochodzą do tego.',
    "dmg.min": "min",
    "dmg.max": "maks",
    "dmg.incomeHead": "twój dochód",
    "dmg.incomeHint":
      "puste pola biorą to, co gra pokazuje dla ciebie; to podnosi, ile może kosztować walka.",
    "dmg.coinsDay": "monety dziennie",
    "dmg.casesDay": "skrzynki dziennie",
    "dmg.incMissions": "misje, wszystkie zestawy",
    "dmg.incDaily": "kalendarz nagród dziennych",
    "dmg.incOther": "inne (handel, rzemiosło...)",
    "dmg.incEmployees": "pracownicy (ich produkcja minus płace)",
    "dmg.donate": "wpłacaj do skarbca mojego kraju dziennie:",
    "dmg.donateHint": "monety, liczone jako wydatek.",
    "dmg.gearPrices":
      "ceny poniżej mogą się trochę różnić od tych, które widzisz na rynku, więc sprawdź je, zwłaszcza przy broni.",
    "dmg.gearScraps":
      "zużyty przedmiot oddaje 1/3 swojej wartości w złomie, więc gdy narzędzie proponuje złote przedmioty, które wydają się dużo droższe od fioletowych, pamiętaj, że oddają też więcej złomu.",
    "dmg.rowDonation": "wpłata dla kraju",
    "dmg.donationNote": "do skarbca, jako wydatek",
    "dmg.noDonation": "bez wpłaty",
    "dmg.noDonationNote": (more, pct) => `${more} (${pct}) więcej`,
    "dmg.mercNote": (rate) =>
      `po ${rate} monety za 1000 obrażeń, stawka zawodowego najemnika`,
    "dmg.mercDamage": "obrażenia najemników za nią",
    "dmg.countryGoods": "albo, dla kraju",
    "dmg.paperOrOil": (paper, oil) => `${paper} papieru albo ${oil} ropy`,
    "dmg.countryNote": (paper, oil) =>
      `żeby kraj działał; ceny z 24 h: papier ${paper}, ropa ${oil}`,
    "dmg.searchingNoDonation": "to samo bez wpłaty",
    "dmg.rowEmployeesTyped": "pracownicy (wpisane)",
    "dmg.rowAfterDonation": "zostaje po wpłacie",
    "dmg.incPool": "łupy z puli (war spoils)",
    "dmg.poolHint":
      "łupy z puli: puste = to, co gracze z obrażeniami buildu dostali w ostatnich 7 dniach, po cenach rynkowych, liczone dla każdego buildu; wpisz monety dziennie, żeby liczyć własną liczbę.",
    "dmg.poolOff": "łupy z puli nie są liczone (odznaczone w „co liczyć”).",
    "dmg.poolAt": (damage, coins) =>
      `łupy z puli przy ${damage} obrażeń dziennie tego buildu: ${coins} monet, tyle dostali gracze z takimi obrażeniami w ostatnich 7 dniach`,
    "dmg.poolAtEnd": ". Wpisz monety dziennie, żeby liczyć własną liczbę.",
    "dmg.poolTyped": (coins) =>
      `łupy z puli: twoje ${coins} monet dziennie, niezależnie od obrażeń`,
    "dmg.poolTable": (coins) =>
      `; według dni graczy byłoby ${coins} przy obrażeniach tego buildu`,
    "dmg.poolAbout": " (około ",
    "dmg.poolADay": " przedmiotów dziennie)",
    "dmg.poolNoItems": "bez przedmiotów",
    "dmg.muDivision": "dywizja ligi JW:",
    "dmg.muDivisionNow": (name) => `twojej JW: ${name}`,
    "dmg.muNotIn": "poza ligą w tym tygodniu",
    "dmg.muPlace": "miejsce w lidze JW:",
    "dmg.muPlaceHint":
      "założenie: miejsce jednostki w jej grupie 10; prawdziwe pokazuje karta Ligi",
    "dmg.muShare": "twój udział w obrażeniach JW %:",
    "dmg.muShareHint": "domyślnie równy podział między członków",
    "dmg.muShareNow": (members, now) =>
      `domyślnie równy podział między ${members} członków${now === null ? "" : `; twój w tym tygodniu dotąd ${now}%`}`,
    "dmg.div": (k) =>
      k === 15
        ? "Mistrz"
        : `${["Brąz", "Srebro", "Złoto", "Platyna", "Diament"][Math.floor(k / 3)]} ${["III", "II", "I"][k % 3]}`,
    "dmg.leaguePlace": "twoje miejsce w lidze tygodniowej:",
    "dmg.leagueHint":
      "twoja grupa jest losowa, więc to tylko założenie; prawdziwe miejsce pokazuje karta Ligi",
    "dmg.leagueBonus": "premia grupy w lidze %:",
    "dmg.leagueBonusHint":
      "podnosi nagrody wyżej, monety i skrzynki; puste: premia twojej grupy odczytana z gry (x1,39 = 39)",
    "dmg.leagueDefault": (place, prize) =>
      `domyślnie miejsce ${place} (${prize})`,
    "dmg.leaguePlaceN": (place, prize) => `miejsce ${place}: ${prize}`,
    "dmg.leagueNone": "bez nagrody (2 ostatnie miejsca)",
    "dmg.leagueMoney": (n) =>
      `${n} ${I18N.plural(n, "moneta", "monety", "monet")}`,
    "dmg.managerPay": "płaca za pracę menedżera:",
    "dmg.managerHint":
      "monety dziennie za punkt Zarządzania, po podatku; 0 = bez pracy menedżera",
    "dmg.managerNow": (pay) =>
      `monety dziennie za punkt Zarządzania, po podatku; 0 = bez pracy menedżera. Otwarte oferty płacą około ${pay} przed podatkiem.`,
    "dmg.selfValue": "praca własna, monety za PP:",
    "dmg.selfHint": "domyślnie towar twojej najlepszej firmy",
    "dmg.selfClicks": "kliknięcia pracy własnej dziennie:",
    "dmg.selfClicksHint":
      "puste: tyle, ile daje pasek energii, minus jedno na każdego pracownika, któremu zostały szkolenia. Wpisz więcej, żeby zrezygnować ze szkoleń i iść w pełni w pracę własną (liczy się najwyżej tyle, ile daje pasek).",
    "dmg.selfClicksNow": (n) =>
      `puste: tyle, ile daje pasek energii, minus jedno na każdego pracownika, któremu zostały szkolenia (teraz ${n}). Wpisz więcej, żeby zrezygnować ze szkoleń i iść w pełni w pracę własną (liczy się najwyżej tyle, ile daje pasek).`,
    "dmg.rowSelfClicks": (n) =>
      `praca własna (${n} ${I18N.plural(n, "kliknięcie", "kliknięcia", "kliknięć")} dziennie)`,
    "dmg.engine": "automaty:",
    "dmg.engineOwn": "każdy na swoim poziomie",
    "dmg.engineAt": (n) => `wszystkie na poziomie ${n}`,
    "dmg.pricesHead": "ceny",
    "dmg.pricesHint": "puste: mediana z ostatnich 24 godzin.",
    "dmg.adjust": "wszystkie ceny sprzętu, %:",
    "dmg.reset": "[ wyczyść pola ]",
    "dmg.sandboxHead": "piaskownica",
    "dmg.sandbox": "tryb piaskownicy: ustaw build sam, liczony od razu",
    "dmg.summaryHead": "najlepszy build",
    "dmg.summarySandbox": "twój build z piaskownicy",
    "dmg.buildSkills": "umiejętności do rozdania",
    "dmg.buildGear": "sprzęt do kupienia i używania",
    "dmg.costsHead": "monety dziennie",
    "dmg.incomeResult": "dochód dziennie",
    "dmg.statsHead": "statystyki bojowe",
    "dmg.compareHead":
      "porównanie: bez pigułki i z twoimi umiejętnościami bojowymi",
    "dmg.curveHead": "strata majątku dziennie a obrażenia dziennie",
    "dmg.curveRun": "[ policz krzywą ]",
    "dmg.curveTable": "[ tabela ]",
    "dmg.curveChart": "[ tylko wykres ]",
    "dmg.listHead": "ceny sprzętu",
    "dmg.noPlayer": "najpierw wpisz nazwę gracza",
    "dmg.noData":
      "dane rynkowe nie są teraz dostępne: serwer zapisuje je raz na godzinę",
    "dmg.reading": (name) => `czytam ${name}`,
    "dmg.market": "czytam dane rynkowe",
    "dmg.searching": "szukam najlepszego buildu",
    "dmg.searchingNoPill": "to samo bez pigułki",
    "dmg.searchingYours": "to samo z twoimi umiejętnościami bojowymi",
    "dmg.goalSearch": "szukam budżetu: około 12 przeszukań na build, do minuty",
    "dmg.done": (s) => `gotowe w ${s} s.`,
    "dmg.stopped": "szukanie się zatrzymało",
    "dmg.limitsTooHigh": (need, level, have) =>
      `minima umiejętności wymagają ${need} punktów; poziom ${level} daje ${have}. Obniż któreś minimum.`,
    "dmg.notReached": (damage, burst) =>
      `żaden build w tych limitach i jakościach nie daje ${damage} obrażeń ${burst ? "w uderzeniu na start" : "dziennie"}.`,
    "dmg.keepFailed":
      "twoje umiejętności wymagają więcej punktów, niż daje ten poziom, więc szukam też umiejętności.",
    "dmg.freezeFailed":
      "pokazane umiejętności wymagają więcej punktów, niż daje ten poziom, więc szukam też umiejętności.",
    "dmg.noPrecision": (best) =>
      `żaden build w tych limitach i jakościach nie osiąga 100% precyzji (najlepszy ${best}%): podnieś limit precyzji albo dopuść lepsze rękawice.`,
    "dmg.overBudget": (cost, over) =>
      `niemożliwe: najtańszy znaleziony build kosztuje ${cost} dziennie, o ${over} więcej niż twój dochód + strata, na którą się godzisz.`,
    "dmg.noEmployees":
      'pracownicy nie są liczeni: gra pokazuje ich tylko z tokenem, a bez niego ta strona czyta ich tylko dla obywateli Polski. Wklej swój token albo wpisz ich dochód w sekcji "twój dochód", w wierszu pracownicy.',
    "dmg.lowLevel": (level) =>
      `poniżej poziomu ${level} umiejętności bojowe są zamknięte (gra otwiera je na poziomie ${level}), więc punkty idą na umiejętności ekonomiczne.`,
    "dmg.pricesAsOf": (when) =>
      `ceny z ${when}, twój czas lokalny; odświeżane raz na godzinę.`,
    "dmg.damageDay": "obrażenia dziennie",
    "dmg.hitsNote": (hits, debuff, kind) =>
      `${hits} uderzeń` +
      (debuff
        ? ` + ${debuff} w osłabieniu (${
            {
              same: "ten sam sprzęt i amunicja",
              none: "bez sprzętu",
              own: "osobny sprzęt",
            }[kind]
          })`
        : ""),
    "dmg.damageHit": "obrażenia za uderzenie",
    "dmg.hitNote": (health, dodged) =>
      `${health} zdrowia za uderzenie, ${dodged}% uników`,
    "dmg.burstRow": "uderzenie na start",
    "dmg.burstNote": (hits, rest) =>
      `${hits} uderzeń; potem ${rest} z odnawiania przez 8 h`,
    "dmg.fightCost": "koszt walki dziennie",
    "dmg.fightNote": "po odjęciu skrzynek i łupów",
    "dmg.incomeDay": "dochód dziennie",
    "dmg.incomeNote": (fixed, eco) => `stały ${fixed} + umiejętności ${eco}`,
    "dmg.wealthDay": "zmiana majątku dziennie",
    "dmg.wealthNote": "dochód - walka",
    "dmg.per1000": "za 1000 obrażeń",
    "dmg.gearSet": "komplet sprzętu",
    "dmg.gearSetNote": "po jednej sztuce, zamrożone monety",
    "dmg.overShort": "ponad budżet",
    "dmg.goalLineMax": "za każdą cenę",
    "dmg.goalLineProfit": "najwięcej, ile zyska build w limitach",
    "dmg.goalLineTarget": (d) => `najmniejsza strata dla ${d} obrażeń`,
    "dmg.skill": "umiejętność",
    "dmg.lvl": "poziom",
    "dmg.now": "teraz",
    "dmg.change": "zmiana",
    "dmg.val": "wartość",
    "dmg.points": "punkty",
    "dmg.prestigeCol": "prestiż",
    "dmg.fighting": "bojowe",
    "dmg.economy": "ekonomiczne",
    "dmg.pointsNote": (total, fight, eco) =>
      `${total} punktów umiejętności: ${fight} bojowych, ${eco} ekonomicznych`,
    "dmg.unused": (n) => `, ${n} niewykorzystanych`,
    "dmg.prestigeUsed": (used, all) =>
      `; ${used} z ${all} punktów prestiżu w poziomach dodatkowych (pokazane jako punkty + dodatek)`,
    "dmg.resetNote": (cost, free) =>
      ` Reset kosztuje tu ${cost} monet` +
      (free ? ` albo nic, jeśli użyjesz darmowego (masz: ${free}).` : "."),
    "dmg.slot": "miejsce",
    "dmg.item": "przedmiot",
    "dmg.statsCol": "statystyki",
    "dmg.price": "cena",
    "dmg.coinsADay": "monety dziennie",
    "dmg.usedDay": "zużycie dziennie",
    "dmg.scrapsBack": "zwrot ze złomu",
    "dmg.week": "na 7 dni",
    "dmg.ammoRow": "amunicja",
    "dmg.foodRow": "jedzenie",
    "dmg.pillRow": "pigułka",
    "dmg.oneADay": "jedna dziennie",
    "dmg.none": "brak",
    "dmg.foodsOf": (slots) => `z ${slots} głodu`,
    "dmg.slot.weapon": "broń",
    "dmg.slot.helmet": "hełm",
    "dmg.slot.chest": "korpus",
    "dmg.slot.pants": "spodnie",
    "dmg.slot.boots": "buty",
    "dmg.slot.gloves": "rękawice",
    "dmg.gearNote":
      "statystyki: broń atak/kryt %. Przedmiot wystarcza na 100 uderzeń (pancerz nie zużywa się przy unikach); amunicja jedna na uderzenie. Monety dziennie = cena x zużycie dziennie - zwrot ze złomu: zniszczony przedmiot rozbiera się na 1/3 jego złomu. Zużycie dziennie liczy uderzenia w oknie pigułki; te w osłabieniu są w osobnej tabeli niżej. Kliknij przedmiot, aby otworzyć jego rynek w grze.",
    "dmg.costAmmo": "amunicja",
    "dmg.costWear": (slot) => `zużycie: ${slot}`,
    "dmg.costFood": "jedzenie",
    "dmg.costPill": "pigułka",
    "dmg.costCases": "skrzynki z uderzeń",
    "dmg.costDebuff": "skrzynki w osłabieniu",
    "dmg.costDebuffAmmo": "amunicja w osłabieniu",
    "dmg.costDebuffWear": (slot) => `zużycie w osłabieniu: ${slot}`,
    "dmg.gearWindow": "w czasie pigułki (8 h z atakiem +60%):",
    "dmg.gearDebuff": (hits, kind) =>
      `w czasie osłabienia (16 h z atakiem -60%, ${hits} uderzeń): ${
        {
          same: "ten sam sprzęt",
          none: "bez sprzętu",
          own: "osobny sprzęt",
        }[kind]
      }`,
    "dmg.debuffNote": (kind) =>
      ({
        same: "te same przedmioty i amunicja co w czasie pigułki; liczby dotyczą tylko uderzeń w osłabieniu.",
        none: "bez sprzętu i amunicji: uderzenia w osłabieniu kosztują tylko jedzenie, a te bez pudła wciąż dają skrzynki.",
        own: "przebierz się w ten komplet, gdy skończy się 8 h pigułki. Przedmiot noszony w obu kompletach kupujesz raz; liczby dotyczą tylko uderzeń w osłabieniu.",
      })[kind],
    "dmg.costBounty": "zapłata za 1000 obrażeń",
    "dmg.costPool": "łupy z puli",
    "dmg.costTotal": "walka dziennie",
    "dmg.source": "źródło",
    "dmg.value": "monety dziennie",
    "dmg.rowManager": "praca menedżera",
    "dmg.rowSelf": "praca własna",
    "dmg.rowEngines": "automaty",
    "dmg.rowEmployees": "pracownicy",
    "dmg.rowMu": "nagroda z ligi JW (zakładane miejsce, twój udział)",
    "dmg.rowLeague": "nagroda z ligi tygodniowej (zakładane miejsce)",
    "dmg.rowTotal": "dochód z tym buildem",
    "dmg.rowNew": (n) =>
      `z tego ${n} ${I18N.plural(n, "nowa firma", "nowe firmy", "nowych firm")}, których jeszcze nie masz`,
    "dmg.newCompanies": (n, coins, cost, concrete, steel, level, days) =>
      `Ten build liczy ${n} ${I18N.plural(n, "nową firmę", "nowe firmy", "nowych firm")}, których jeszcze nie masz: ${coins} monet dziennie z jego dochodu. To wymaga inwestycji około ${cost} monet: ${concrete} betonu na budowę, ${steel} stali na automaty na poziomie ${level} i pokoje socjalne (80% do odzyskania przy wycofaniu)${days ? `, czyli około ${days} dni tego, co zarobią` : ""}.`,
    "dmg.newCrews": (seats, each) =>
      ` Każda potrzebuje ${seats} ${I18N.plural(seats, "pracownika", "pracowników", "pracowników")}, których trzeba najpierw zatrudnić i wyszkolić: liczone według dzisiejszej stawki twojej najsłabszej załogi, ${each} monet dziennie; nowa załoga może zacząć niżej. Energia na zatrudnianie i szkolenie nie jest odejmowana od pracy własnej.`,
    "dmg.companiesNote": (count, all) =>
      `umiejętność firm w tym buildzie zostawia włączone twoje najlepsze ${count} z ${all} firm; reszta jest wyłączona, nie stracona.`,
    "dmg.steelNote": (steel, coins) =>
      ` Ulepszenie automatów to ${steel} stali (~${coins} monet, zostaje w majątku).`,
    "dmg.statAttack": "atak (z amunicją, pigułką, rangą)",
    "dmg.statPrecision": "precyzja",
    "dmg.statCrit": "szansa na kryt",
    "dmg.statCritDamage": "obrażenia kryt.",
    "dmg.statArmor": "pancerz",
    "dmg.statDodge": "unik",
    "dmg.statHealth": "zdrowie / głód",
    "dmg.statLoot": "szansa na łup",
    "dmg.armorNote": (p, h) => `${p}% mniej zdrowia, ${h} za uderzenie`,
    "dmg.dodgeNote": (p) => `${p}% uderzeń`,
    "dmg.build": "build",
    "dmg.rowBest": "najlepszy, z pigułką",
    "dmg.rowSandbox": "piaskownica, z pigułką",
    "dmg.rowNoPill": "bez pigułki",
    "dmg.rowYours": "twoje umiejętności bojowe jak teraz",
    "dmg.rowBase": "najlepszy z wyszukiwania",
    "dmg.weapon": "broń",
    "dmg.skillsCol": "umiejętności",
    "dmg.waiting": "liczę…",
    "dmg.curveNote":
      "najlepszy build przy każdej stracie majątku, z pigułką i bez (szybsze szukanie: do ~1% od najlepszego). 28 przeszukań, ~15 s na 4 rdzeniach.",
    "dmg.curveProgress": (a, b) => `liczę krzywą: ${a} z ${b}`,
    "dmg.curveFailed": (a, b, error) =>
      `krzywa zatrzymała się po ${a} z ${b}: ${error}`,
    "dmg.curvePill": "z pigułką",
    "dmg.curveNoPill": "bez pigułki",
    "dmg.curveOnly": "krzywa jest dla celu: najwięcej obrażeń.",
    "dmg.curveBudget": "strata majątku dziennie",
    "dmg.curveDamage": "obrażenia",
    "dmg.listNote": (tax) =>
      `cena, jakiej można się spodziewać za każdy przedmiot + statystyki zaznaczonych jakości (mediana sprzedaży albo ostatnich 3 sprzedaży, gdy wyższa, bo tania seria, która się wyprzedała, nic nie mówi o następnym zakupie; nigdy poniżej gorszego przedmiotu), okres, z którego pochodzi, ile płacisz (podatek rynkowy twojego kraju: ${tax}%) i zużycie za uderzenie (ile płacisz minus złom ze zniszczonego, na 100 uderzeń). Q1-Q2 pochodzą z ostatnich 100 sprzedaży przedmiotu, więc rzadka statystyka może opierać się na jednej sprzedaży.`,
    "dmg.allSlots": "wszystkie miejsca",
    "dmg.median": "cena rynkowa",
    "dmg.paid": "płacisz",
    "dmg.wear": "zużycie za uderzenie",
    "dmg.sales": "sprzedaże",
    "dmg.window": "okres",
    "dmg.sb.intro":
      "zaczyna od pokazanego buildu; każde pole liczone od razu tym samym modelem. Ceny: cena rynkowa dokładnego przedmiotu + statystyk, inaczej najbliższych sprzedanych, chyba że wpiszesz swoją.",
    "dmg.sb.points": (used, total) =>
      `użyte ${used} z ${total} punktów umiejętności`,
    "dmg.sb.over": (n) => ` (o ${n} za dużo)`,
    "dmg.sb.left": (n) => ` (zostało ${n})`,
    "dmg.sb.prestige": (used, all) =>
      `; ${used} z ${all} punktów prestiżu w poziomach dodatkowych (pola +: 1, 2, 4, 8 punktów za poziom na jednej umiejętności)`,
    "dmg.sb.item": "przedmiot",
    "dmg.sb.sold": "sprzedane statystyki (cena, sprzedaże)",
    "dmg.sb.stats": "statystyki",
    "dmg.sb.yourPrice": "twoja cena",
    "dmg.sb.used": "użyta cena",
    "dmg.sb.nothing": "brak",
    "dmg.sb.ownStats": "własne statystyki",
    "dmg.sb.noneSold": "nie sprzedano",
    "dmg.sb.ammo": "amunicja:",
    "dmg.sb.food": "jedzenie:",
    "dmg.sb.foodAuto": "auto: najlepsze w budżecie",
    "dmg.sb.foodEvery": (name) => `${name}, każde miejsce głodu`,
    "dmg.sb.fromBest": "[ z najlepszego wyszukanego ]",
    "dmg.sb.fromMine": "[ z moich umiejętności ]",
    "dmg.sb.ownPrice": "twoja cena",
    "dmg.sb.medianOf": (n, w) =>
      `z ${n} ${I18N.plural(n, "sprzedaży", "sprzedaży", "sprzedaży")} (${w})`,
    "dmg.sb.nearest": (s) => `nie sprzedano: najbliższe sprzedane ${s}`,
    "dmg.sb.never": "nigdy nie sprzedano: wpisz cenę",
    "dmg.sb.paid": (p, note) => `płacisz ${p}: ${note}`,
    "dmg.sb.noPrice": (name) =>
      `${name} nie ma sprzedaży do wyceny: wpisz cenę (liczone jako 0).`,
    "dmg.sb.tooMany": (used, level, have) =>
      `umiejętności w piaskownicy używają ${used} punktów; poziom ${level} daje ${have}. Obniż którąś.`,
    "dmg.sb.tooManyPrestige": (used, have) =>
      `poziomy dodatkowe biorą ${used} punktów prestiżu; masz ${have}. Obniż któreś pole +.`,
    "dmg.sb.over2": (cost, over) =>
      `ten build kosztuje ${cost} dziennie, o ${over} więcej niż twój dochód + strata, na którą się godzisz.`,
    "dmg.sb.ok": (used, total) =>
      `piaskownica: twój build, policzony bez szukania (${used} z ${total} punktów umiejętności).`,
    "dmg.stat.attack": "atak",
    "dmg.stat.crit": "kryt %",
    "dmg.stat.critDamage": "obrażenia kryt.",
    "dmg.stat.armor": "pancerz",
    "dmg.stat.dodge": "unik",
    "dmg.stat.precision": "precyzja",
    "name.skill.attack": "Atak",
    "name.skill.precision": "Precyzja",
    "name.skill.criticalChance": "Szansa kryt.",
    "name.skill.criticalDamages": "Obrażenia kryt.",
    "name.skill.armor": "Pancerz",
    "name.skill.dodge": "Unik",
    "name.skill.health": "Zdrowie",
    "name.skill.lootChance": "Szansa na łup",
    "name.skill.hunger": "Głód",
    "name.skill.energy": "Energia",
    "name.skill.production": "Produkcja",
    "name.skill.companies": "Firmy",
    "name.skill.management": "Zarządzanie",
    "name.item.case1": "Skrzynka",
    "name.item.case2": "Elitarna Skrzynka",
    "name.item.woodenCase": "Drewniana Skrzynka",
    "name.item.scraps": "Złom",
    "name.item.cocain": "Pigułka",
    "dmg.notes": [
      "jeden dzień = jedno okno pigułki: 8 h z atakiem +60%, start z pełnymi paskami zdrowia i głodu, 8 odnowień co godzinę (10% paska), jedna pomoc JW i kupione jedzenie; każde możliwe uderzenie jest wykonane. Bez pigułki: 24 h odnawiania, dwie pomoce JW, ten sam sprzęt.",
      "uderzenia w osłabieniu: 16 h odnawiania napełnia pasek na następne okno i zostawia 0,6 paska, plus druga pomoc JW i 0,6 paska głodu jedzenia (więc dzień zjada tyle, co bez pigułki). Są wykonane z atakiem -60% ze sprzętem, amunicją i jedzeniem z okna albo bez sprzętu (nic nie kosztują, a te bez pudła wciąż dają skrzynki), albo z osobnym kompletem (szukanym po buildzie: od kompletu z okna i od zera, miejsce po miejscu, potem znów sprzęt okna), zależnie od tego, co daje najlepszy dzień: ze sprzętem z okna koszty i skrzynki są takie jak w dniu bez pigułki, plus pigułka. Komplet na osłabienie jest w osobnej rozwijanej sekcji pod sprzętem.",
      "strata majątku = o ile najwyżej majątek może spaść dziennie. Walka może kosztować tyle plus dochód: misje, kalendarz nagród, nagroda z ligi JW (dywizja twojej jednostki i miejsce 5, jeśli nie wybierzesz innych, dzielona według twojego udziału w jej obrażeniach: równo między członków, jeśli nie wpiszesz udziału), nagroda z ligi tygodniowej na zakładanym miejscu (miejsce 5, jeśli nie wybierzesz innego; grupa jest losowa; jej premia odczytana z gry) oraz to, co dają umiejętności buildu.",
      "wpłata dla kraju (domyślnie zaznaczona, 50 monet dziennie): wydatek, którego gra nie wymaga. Jest odejmowana od tego, ile może kosztować walka, a dla celu najwięcej obrażeń to samo szukanie idzie też bez niej, żeby pokazać, ile obrażeń kosztuje; wiersz najemników to wpłata przy 0,15 monety za 1000 obrażeń (stawka zawodowego najemnika), a wiersz papieru i ropy to te same monety po cenach tych towarów z ostatnich 24 godzin.",
      "umiejętności bojowe i ekonomiczne dzielą jedną pulę punktów (4 na poziom; poziom n umiejętności kosztuje n). Punkty, które zostawia walka, idą na najlepszą mieszankę energii i produkcji (praca własna: pasek energii, 2,4 paska dziennie, 10 energii za kliknięcie, minus kliknięcie na każdego pracownika, któremu zostały szkolenia, albo wpisana liczba kliknięć; PP za kliknięcie z produkcji, po wartości towaru najlepszej firmy), firm (automaty i pracownicy firm, które zostają włączone) i zarządzania (+2% bazowej produkcji pracowników za punkt; płaca menedżera, jeśli ją wpiszesz; lepsze karty szkoleniowe nie są liczone). Umiejętności bojowe i praca menedżera otwierają się na poziomie 10.",
      'pracownicy: dzisiejsze stawki z ich kart (produkcja po 24-godzinnej medianie towaru minus płace), tak jak liczy strona załóg, bez przyszłych szkoleń i emerytur. Liczba wpisana w ich wierszu w sekcji "twój dochód" zastępuje je: stała kwota, niezależnie od poziomów firm i zarządzania.',
      "obrażenia za uderzenie = atak x (precyzja x (1 + szansa kryt. x obrażenia kryt.) + pudła x 1/2) x (1 + bonus bitewny); atak = (umiejętność + broń + 4 za punkt precyzji ponad 100) x amunicja x pigułka x ranga. Sprawdzone na prawdziwych uderzeniach.",
      "zdrowie za uderzenie = 10 x (1 - pancerz %), pancerz % = pancerz / (40 + pancerz) zaokrąglony do pełnego procentu, zdrowie ucięte do 0,1 jak w grze; uniki (unik / (unik + 40), też zaokrąglone) nic nie kosztują i nie zużywają pancerza.",
      "koszty: amunicja (jedna na uderzenie), zużycie przedmiotów (1% za uderzenie, pancerz tylko bez uniku; cena minus złom ze zniszczonego, 1/3 jego złomu), jedzenie, pigułka. Zwrot: skrzynki (szansa na łup za uderzenie bez pudła; elitarna 1/100 tego) i zapłata za 1000 obrażeń.",
      "surowce strategiczne (v0.28.1): poziomy twojego sojuszu z twojego profilu (zmień je, żeby sprawdzić inny sojusz); poziom dodaje na każdym poziomie umiejętności węgiel +5 celności, diamenty +10 zdrowia, lit +10 energii, metale ziem rzadkich +3 produkcji, złoto +1 zarządzania, uran +2 szansy na łup. Zaznaczenie „nie licz surowców strategicznych” pomija je wszystkie. Drewniane skrzynki na mapie nie są liczone (znikają z gry 9 listopada).",
      "łupy z puli: co naprawdę dostali walczący z podobnymi dziennymi obrażeniami w ostatnich 7 pełnych dniach, we wszystkich rundach i bitwach, w których walczyli (około 3 rund w 2,4 bitwy dziennie, w największej około 72% ich obrażeń), każdy przedmiot po cenie rynkowej.",
      'nowe firmy (tylko gdy "zachowaj wszystkie moje obecne firmy" jest odznaczone): każda, na którą pozwala umiejętność firm ponad te, które masz, jest liczona jako automat na twoim najniższym poziomie, produkujący towar twojej najlepszej firmy, z zyskiem twojej najsłabszej załogi (nigdy poniżej 0). N-ta firma kosztuje 50 x n betonu. Inwestycja jest tylko podawana: nie jest odejmowana od budżetu, więc szukanie może wybrać firmy, które długo się zwracają.',
      "nie liczone: kupowanie sprzętu taniej lub drożej niż ta cena, własne rzemiosło, +1 zdrowia dla pomagającego w JW, sprzęt, który już masz.",
      "szukanie: 16 początkowych podziałów umiejętności, zmiany sprzętu w jednym i dwóch miejscach, ruchy umiejętności do 4 poziomów; znalazło prawdziwe maksimum we wszystkich 60 małych przypadkach sprawdzonych na wszystkich kombinacjach. Ten sam model i szukanie co w narzędziu na komputerze, sprawdzone, że dają ten sam build.",
    ],
  },
});

const $ = (id) => document.getElementById(id);
function el(tag, className, ...children) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}
const fmt = (v, digits = 0) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "-"
    : I18N.num(v, digits);
const signedFmt = (v, digits = 1) => I18N.signed(v, digits);

// The skills in the game's order, for everything shown (user, 2026-10-26); the engine keeps its own order.
const GAME_ORDER = [
  "attack",
  "precision",
  "criticalChance",
  "criticalDamages",
  "armor",
  "dodge",
  "health",
  "lootChance",
  "hunger",
  "energy",
  "production",
  "companies",
  "management",
];
const skillName = (code) => I18N.name(`skill.${code}`);
const PRICE_KEYS = [
  "lightAmmo",
  "ammo",
  "heavyAmmo",
  "bread",
  "steak",
  "cookedFish",
  "cocain",
  "case1",
  "case2",
  "scraps",
];
// The battle bonus by default (user, 2026-11-05: 60-85% fighting for allies, 20-50% for another country; the top fighters'
// typical battle ~+74%, FINDINGS.md → The damage model against the top 200 fighters). The desktop tool keeps 50.
const DEFAULT_BONUS = 70;
const NO_ECO_SKILLS = ["energy", "production", "management"];
const CONCRETE_PER_COMPANY = 50;
// the nth company costs 50 x n concrete (config company.constructionCostIncreasePerCompany)
const BREAK_ROOM_STEEL = [0, 0, 20, 100];
// steel for seats for 0..3 employees (config upgradesConfig.breakRoom)
const RARITIES = ["common", "uncommon", "rare", "epic", "legendary", "mythic"];
const ANY_COST = 1e9;
// the any cost goal's wealth to lose a day (as the desktop tool's)
const READ_SHARE = 0.1;
// of the progress bar: reading the data
const PLAYER_KEEP = 5 * 60000;
// a second run within 5 minutes reuses the player's data
const MARKET_KEEP = 15 * 60000;
const MARKET_URL = "https://app.warera.io/market/equipments?item=";
let clock = () => Date.now();
// tests/damage_twin.py sets it, so both sides read employees at one moment

let MARKET = null,
  marketRead = 0,
  PLAYER = null,
  playerRead = 0,
  playerKey = "";
let VALUES = null;
let LAST = null;
// what's on screen: {s, best, noPill, yours}
let lastBest = null,
  frozen = null,
  sandboxBase = null;
let worker = null,
  curveWorker = null,
  runId = 0;

// ---- progress ----
const CELLS = 32;
let progressShare = 0,
  progressText = "",
  progressStart = 0,
  progressTimer = null;
function drawProgress() {
  const full = Math.round(progressShare * CELLS);
  $("progress-bar").textContent =
    "[" + "#".repeat(full) + ".".repeat(CELLS - full) + "]";
  $("progress-pct").textContent = `${Math.floor(progressShare * 100)}%`;
  $("progress-text").textContent =
    `${progressText} (${Math.floor((Date.now() - progressStart) / 1000)} s)`;
  $("progress").setAttribute(
    "aria-valuenow",
    String(Math.floor(progressShare * 100)),
  );
}
function progress(text, share) {
  if (!progressTimer) {
    progressStart = Date.now();
    progressTimer = setInterval(drawProgress, 250);
    $("progress").hidden = false;
  }
  progressText = text;
  progressShare = Math.max(progressShare, share);
  drawProgress();
}
function endProgress() {
  clearInterval(progressTimer);
  progressTimer = null;
  progressShare = 0;
  $("progress").hidden = true;
}
function status(text, error = false) {
  $("status").textContent = text;
  $("status").classList.toggle("error", error);
}

// ---- the data ----
async function marketData() {
  if (MARKET && clock() - marketRead < MARKET_KEEP) return MARKET;
  let response;
  try {
    response = await fetch("/api/warera-proxy?tool=damage&data=market", {
      cache: "no-store",
    });
  } catch {
    response = null;
  }
  if (!response || !response.ok) throw new Error(t("dmg.noData"));
  MARKET = await response.json();
  globalThis.REFERENCE_ITEM_VALUES = MARKET.values;
  const limitations = [];
  if (!MARKET.sourceInfo?.engineUpgradeCostsAvailable) limitations.push("motor yükseltme çelik maliyeti oyun config'inde bulunmuyor");
  if (!MARKET.sourceInfo?.missionsAvailable) limitations.push("görev ödülü config'te bulunmuyor");
  if (!MARKET.sourceInfo?.poolAvailable) limitations.push("ordu havuz tablosu mevcut veritabanında bulunmuyor");
  const sourceNote = $("reference-source-note");
  if (sourceNote) sourceNote.textContent = limitations.length
    ? `Oyuncu ve oyun kuralları WarEra API'sinden; ekipman fiyatları Supabase price_data'dan yüklenir. Veri kaynağında olmayan kalemler: ${limitations.join("; ")}.`
    : "Oyuncu ve oyun kuralları WarEra API'sinden; ekipman fiyatları Supabase price_data'dan yüklenir.";
  if (limitations.length) sourceNote?.classList.add("data-limitation");
  marketRead = clock();
  globalThis.D = {
    rules: MARKET.rules,
  };
  fillFromMarket();
  return MARKET;
}

// One player, the way warera/fighter.py reads them (player_data, page_fields), rounded the same.
async function readPlayer(api, name, withEmployees) {
  const [userId, username] = await api.findUser(name);
  progress(t("dmg.reading", username), READ_SHARE * 0.3);
  const [user, records] = await Promise.all([
    api.call("user.getUserById", {
      userId,
    }),
    companyRecords(api, userId),
  ]);
  const values = (VALUES = await itemValues());
  RARITY = Object.fromEntries(
    Object.entries(values.items || {})
      .filter(([, v]) => v.rarity)
      .map(([code, v]) => [code, v.rarity]),
  );
  progress(t("dmg.reading", username), READ_SHARE * 0.6);
  const countries = user.country
    ? await api.callBatch("country.getCountryById", [
        {
          countryId: user.country,
        },
      ])
    : [null];
  const marketTax = ((countries[0] || {}).taxes || {}).market;
  const levelsNow = {},
    bonusNow = {},
    strategic = {};
  // strategic: what the alliance's resources add (v0.28.1)
  for (const s of ALL_SKILLS) {
    levelsNow[s] = (user.skills[s] || {}).level || 0;
    bonusNow[s] = (user.skills[s] || {}).prestige || 0;
    if ((user.skills[s] || {}).strategic)
      strategic[s] = user.skills[s].strategic;
  }
  let prestige = (user.leveling || {}).prestige || 0;
  for (const skill of Object.values(user.skills))
    if (skill && typeof skill === "object")
      prestige += prestigeCost(skill.prestige || 0);
  const round = (x, digits) => Number(x.toFixed(digits));
  const companies = records.map((c) => {
    const level = (c.activeUpgradeLevels || {}).automatedEngine || 1;
    const value = ((values.items || {})[c.itemCode] || {}).value_per_pp || 0;
    return {
      name: c.name || c._id,
      item: c.itemCode,
      level,
      value: round(value, 6),
      employees: 0,
      employeeBase: 0,
      draws: 0,
      crew: 0,
    };
  });
  let read = withEmployees && api.canReadEmployees(user);
  // no token: the site's relay, citizens of Poland only
  if (read && records.length) {
    let days = null;
    try {
      days = CrewEngine.companyDays(
        await crewInput(api, user, records, values, clock()),
      );
    } catch (error) {
      if (api.token || !(error instanceof WarEraApi.ApiError)) throw error;
      read = false;
      // the relay refused or was busy: the run goes on without the employees, and the page says so
    }
    (days || []).forEach((day, i) => {
      Object.assign(companies[i], {
        employees: round(day.profit, 2),
        employeeBase: round(day.base, 2),
        draws: day.draws,
        crew: day.crew,
      });
    });
  }
  const [mu, leagueMultiplier] = await Promise.all([
    readMu(api, user),
    readLeagueMultiplier(api, userId),
  ]);
  const best = companies.reduce(
    (a, b) => (!a || b.value > a.value ? b : a),
    null,
  );
  return {
    username,
    userId,
    level: user.leveling.level,
    rank: (user.skills.attack.militaryRankPercent || 0) / 100,
    levelsNow,
    bonusNow,
    prestige,
    mine: SKILLS.map((s) => levelsNow[s] + bonusNow[s]),
    marketTax:
      marketTax === undefined || marketTax === null ? 0.01 : marketTax / 100,
    companies,
    mu,
    leagueMultiplier,
    prestigeLevel: (user.leveling || {}).prestigeLevel || 0,
    employeesRead: Boolean(read),
    selfValue: best ? round(best.value, 5) : 0,
    bestCompany: best ? best.name : null,
    strategic,
    managementNow:
      skillValue(
        MARKET.rules.values.management,
        levelsNow.management + bonusNow.management,
      ) + (strategic.management || 0),
    spent: (user.leveling || {}).spentSkillPoints || 0,
    freeResets: (user.leveling || {}).freeReset || 0,
  };
}
const quietly = (promise) => promise.catch(() => null);
// an answer the page can do without
// The player's MU in this week's MU league (v0.28.3, muLeague.getMuLeague: user's OK 2026-11-16): its division (0 = Bronze
// III ... 15 = Master; null: no MU, or not in the league this week), the places' pots, its members and the player's share so far.
async function readMu(api, user) {
  if (!user.mu)
    return {
      name: null,
      division: null,
      members: 0,
      shareNow: null,
      pots: null,
    };
  const [mu, league] = await Promise.all([
    quietly(
      api.call("mu.getById", {
        muId: user.mu,
      }),
    ),
    quietly(
      api.call("muLeague.getMuLeague", {
        muId: user.mu,
      }),
    ),
  ]);
  const me = (league || {}).me || {},
    row = ((league || {}).rows || []).find((r) => r.mu === user.mu);
  const share = ((league || {}).shares || []).find((s) => s.user === user._id);
  return {
    name: (mu || {}).name || user.mu,
    division: Number.isInteger(me.division) ? me.division : null,
    members: row ? row.seats : ((mu || {}).members || []).length,
    shareNow: share ? share.share : null,
    pots: Number.isInteger(me.division) ? league.placePots || null : null,
  };
}
// The player's weekly league group's multiplier (league.getUserLeague, user's OK 2026-11-16), null when not readable.
async function readLeagueMultiplier(api, userId) {
  const league = await quietly(
    api.call("league.getUserLeague", {
      userId,
    }),
  );
  const m = ((league || {}).league || {}).multiplier;
  return Number.isFinite(m) && m > 0 ? m : null;
}

// The MU league (v0.28.3, GAME_RULES.md): Bronze III's prize a place 1-8 -> [money, elite cases, cases] (9th and 10th
// nothing); division k multiplies them by 10^(k/15) rounded to 2 decimals (Platinum I = 11: x5.41), each rounded to a whole
// number. The unit's own division takes the game's pots. The member's part: the pot x their share of the unit's damage.
const MU_LEAGUE_PRIZES = [
  [1500, 2, 30],
  [1050, 0, 20],
  [750, 0, 12],
  [540, 0, 0],
  [420, 0, 0],
  [300, 0, 0],
  [210, 0, 0],
  [150, 0, 0],
];
const MU_DEFAULT_PLACE = 5,
  MU_DIVISIONS = 16;
// 5th: user, 2026-11-21 (4th from 2026-11-16)
const muMultiplier = (division) =>
  Math.round(10 ** (division / 15) * 100) / 100;
function muPot(place, division, mu) {
  if (!(place >= 1 && place <= MU_LEAGUE_PRIZES.length) || division === null)
    return [0, 0, 0];
  const own =
    mu && mu.pots && division === mu.division ? mu.pots[place - 1] : null;
  if (own) return [own.money || 0, own.case2 || 0, own.case1 || 0];
  const m = muMultiplier(division);
  return MU_LEAGUE_PRIZES[place - 1].map((n) => Math.round(n * m + 1e-9));
}
// [coins, cases] a day: elite cases in the coins at their price
function muPrize(place, division, share, mu, elitePrice) {
  const [money, elite, cases] = muPot(place, division, mu);
  return [
    Number((((money + elite * elitePrice) * share) / 7).toFixed(2)),
    Number(((cases * share) / 7).toFixed(3)),
  ];
}
function muPotText(place, division, mu) {
  const [money, elite, cases] = muPot(place, division, mu);
  return [
    t("dmg.leagueMoney", money),
    elite ? `${elite} × ${I18N.item("case2")}` : "",
    cases ? `${cases} × ${I18N.item("case1")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
const muDivisionOf = (P) =>
  $("mu-division").value === ""
    ? P
      ? P.mu.division
      : null
    : Number($("mu-division").value);
const muShareDefault = (P) => (P && P.mu.members ? 100 / P.mu.members : 0);
// The weekly league (v0.28.2, the patch note; twin of warera/income.py): place -> [money, elite cases, cases] a week. The
// API shows no league and the group is random, so the place is an assumption, 5th by default (user).
const LEAGUE_PRIZES = {
  1: [150, 2, 16],
  2: [105, 1, 12],
  3: [75, 0, 8],
  4: [54, 0, 0],
  5: [42, 0, 0],
  6: [30, 0, 0],
  7: [21, 0, 0],
  8: [15, 0, 0],
  9: [12, 0, 0],
};
const LEAGUE_DEFAULT_PLACE = 5,
  LEVELS_PER_PRESTIGE = 3;
const LEAGUE_BONUS = [
  [0, 0],
  [30, 0.34],
  [50, 0.5],
];
// "about +34% at level 30 and +50% at level 50", straight lines between
function leagueBonus(level) {
  for (let i = 1; i < LEAGUE_BONUS.length; i++) {
    const [low, lowBonus] = LEAGUE_BONUS[i - 1],
      [high, highBonus] = LEAGUE_BONUS[i];
    if (level <= high)
      return (
        lowBonus +
        ((highBonus - lowBonus) * (Math.max(level, low) - low)) / (high - low)
      );
  }
  return LEAGUE_BONUS[LEAGUE_BONUS.length - 1][1];
}
// [money, elite cases, cases] a week with the group's bonus, each a whole number (the player's board, warera/income.py league_items)
const leagueItems = (place, bonus) =>
  (LEAGUE_PRIZES[place] || [0, 0, 0]).map((n) =>
    Math.floor(n * (1 + bonus) + 0.5),
  );
// [coins, cases] a day: elite cases in the coins at their price (warera/income.py league_prize)
function leaguePrize(place, bonus, elitePrice) {
  const [money, elite, cases] = leagueItems(place, bonus);
  return [
    Number(((money + elite * elitePrice) / 7).toFixed(2)),
    Number((cases / 7).toFixed(3)),
  ];
}
function leaguePrizeText(place) {
  const [money, elite, cases] = LEAGUE_PRIZES[place];
  return [
    t("dmg.leagueMoney", money),
    elite ? `${elite} × ${I18N.item("case2")}` : "",
    cases ? `${cases} × ${I18N.item("case1")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
}
const numberOr = (id, fallback) => {
  const v = parseFloat($(id).value);
  return Number.isFinite(v) ? v : fallback;
};
const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// A company the player doesn't have yet (user, 2026-11-05): an engine at their lowest level making their best company's
// item, with their weakest crew's profit, never below 0 (FINDINGS.md: a new crew's day is nearer the weakest crew's than
// the average's). Only the website's page has this; the Python tool counts the companies a player owns.
function newCompanyOf(P, M, engine, employees) {
  if (!P.companies.length) return null;
  const level = engine || Math.min(...P.companies.map((c) => c.level));
  const value = Math.max(...P.companies.map((c) => c.value));
  const weakest = (
    employees ? P.companies.filter((c) => c.crew > 0) : []
  ).reduce((a, b) => (!a || b.employees < a.employees ? b : a), null);
  return {
    level,
    engine: M.engines[level][0] * value,
    employees: weakest ? Math.max(weakest.employees, 0) : 0,
    employeeBase: weakest ? weakest.employeeBase : 0,
    seats: weakest ? weakest.crew : 0,
  };
}
// What n new companies cost beyond the `owned` ones: concrete and steel, and in coins.
function newCompanyCost(n, owned, one, M) {
  let concrete = 0;
  for (let k = 1; k <= n; k++) concrete += CONCRETE_PER_COMPANY * (owned + k);
  const steel =
    n * (M.engines[one.level][1] + BREAK_ROOM_STEEL[Math.min(one.seats, 3)]);
  return {
    concrete,
    steel,
    coins:
      concrete * ((VALUES.items.concrete || {}).price || 0) +
      steel * M.steelPrice,
  };
}

// The simple version's fixed choices (user, 2026-11-21), set again before every run: the hidden fields as the full
// version's defaults, except one kind of food, every equipment quality and the 50-coin donation; every typed field
// empty. "Keep my current build" and the bounty per million damage are the visitor's (shown below the battle bonus).
function applySimple() {
  if (!SIMPLE) return;
  for (const node of $("inputs").querySelectorAll(
    ".full-only input[type=number]",
  ))
    node.value = "";
  $("donation").value = "50";
  for (const [id, value] of [
    ["adjust", "0"],
    ["manager-pay", "0"],
  ])
    $(id).value = value;
  // the one income field the simple page shows (user, 2026-11-22): a bounty per million damage, the engine's pay per 1,000
  $("bounty").value = String(
    Math.max(0, Number($("bounty-million").value) || 0) / 1000,
  );
  for (const [id, on] of Object.entries({
    donate: true,
    pill: true,
    help: true,
    debuff: true,
    pool: true,
    employees: true,
    "keep-companies": false,
    "no-eco": true,
    "full-precision": false,
    "one-food": true,
    burst: false,
    "no-strategic": false,
  }))
    $(id).checked = on;
  FOODS.forEach((f) => {
    $(`food-${f}`).checked = true;
  });
  [1, 2, 3, 4, 5, 6].forEach((q) => {
    $(`q${q}`).checked = true;
  });
  $("goal").value = "damage";
  $("skills-mode").value = "search";
  for (const id of ["mu-division", "mu-place", "league-place", "engine"])
    $(id).selectedIndex = 0;
  syncGoal();
}
// The scenario from the fields; an empty field takes the player's own value.
function readScenario(noKeep = false) {
  const P = PLAYER,
    M = MARKET;
  const prices = {};
  for (const k of PRICE_KEYS) prices[k] = numberOr(`p-${k}`, M.prices[k]);
  const qualities = new Set(
    [1, 2, 3, 4, 5, 6].filter((q) => $(`q${q}`).checked),
  );
  // "keep my current build" is in the first section (user, 2026-11-07); it wins over the skills fold's choice
  const mode = noKeep
    ? "search"
    : $("keep-build").checked
      ? "keep"
      : $("skills-mode").value;
  const keep = mode === "keep",
    freeze = mode === "freeze" && Boolean(frozen),
    add = mode === "add";
  const prestige = Math.round(clamp(numberOr("prestige", P.prestige), 0, 31));
  const bonusNow = Object.fromEntries(
    ALL_SKILLS.map((s) => [s, P.bonusNow[s]]),
  );
  const fixedBonus = keep
    ? ALL_SKILLS.reduce((n, s) => n + prestigeCost(bonusNow[s]), 0) <= prestige
      ? bonusNow
      : null
    : freeze
      ? frozen.bonus
      : null;
  const bounds = {};
  const keepCompanies = $("keep-companies").checked,
    noEco = $("no-eco").checked;
  for (const s of ALL_SKILLS) {
    const asNow = s === "companies" && keepCompanies;
    let lo = Math.round(
      clamp(
        numberOr(`lo-${s}`, asNow ? P.levelsNow[s] : 0),
        0,
        MAX_SKILL_LEVEL,
      ),
    );
    let hi = Math.round(
      clamp(
        numberOr(`hi-${s}`, asNow ? P.levelsNow[s] : MAX_SKILL_LEVEL),
        0,
        MAX_SKILL_LEVEL,
      ),
    );
    if (noEco && NO_ECO_SKILLS.includes(s)) hi = 0;
    if (add) {
      lo = Math.max(lo, P.levelsNow[s]);
      hi = Math.max(hi, P.levelsNow[s]);
    }
    const at = freeze ? frozen.levels[s] : P.levelsNow[s];
    bounds[s] = keep || freeze ? [at, at] : [lo, hi];
  }
  const engine = Number($("engine").value) || 0;
  // employees (user, 2026-11-15): read from the API they're counted per build (the companies kept on, management); a number
  // typed in their income row replaces them as a fixed amount, as when they can't be read
  const typedEmployees = numberOr("inc-employees-coins", null);
  const read = $("employees").checked && P.employeesRead,
    employees = read && typedEmployees === null;
  const counts = [];
  for (let c = 0; c <= MAX_SKILL_LEVEL + MAX_BONUS_LEVELS; c++)
    counts.push(skillValue(M.rules.values.companies, c));
  const tables = companyTables(
    P.companies,
    counts,
    (c) => M.engines[engine || c.level][0],
    employees,
  );
  const newCompany = keepCompanies
    ? null
    : newCompanyOf(P, M, engine, employees);
  if (newCompany) {
    // after the ones the player owns: a level never turns an owned company off for a new one
    counts.forEach((count, i) => {
      const n = Math.max(count - P.companies.length, 0);
      tables.engines[i] += n * newCompany.engine;
      tables.employees[i] += n * newCompany.employees;
      tables.employeeBase[i] += n * newCompany.employeeBase;
    });
  }
  const draws = P.companies.reduce((n, c) => n + c.draws, 0);
  // pool loot (user, 2026-11-16): empty, the fighters' table by the build's damage; typed, those coins a day at any damage
  const typedPool =
    $("pool").checked && numberOr("inc-pool-coins", null) !== null
      ? clamp(numberOr("inc-pool-coins", 0), 0, 1e6)
      : null;
  const muPlace =
    $("mu-place").value === "" ? MU_DEFAULT_PLACE : Number($("mu-place").value);
  const muShare = clamp(numberOr("mu-share", muShareDefault(P)), 0, 100) / 100;
  const level = Math.round(clamp(numberOr("level", P.level), 1, 200));
  const leaguePlace =
    $("league-place").value === ""
      ? LEAGUE_DEFAULT_PLACE
      : Number($("league-place").value);
  const typedBonus = parseFloat($("league-bonus").value);
  // the group's bonus: typed, else the game's for the player's group (unless another level is typed), else the patch note's line
  const leagueGroup = Number.isFinite(typedBonus)
    ? clamp(typedBonus, 0, 1000) / 100
    : P.leagueMultiplier && level === P.level
      ? P.leagueMultiplier - 1
      : leagueBonus(level + LEVELS_PER_PRESTIGE * P.prestigeLevel);
  const rows = [
    // in the order warera/income.py adds them up
    [
      "missions",
      numberOr("inc-missions-coins", M.missions[0]),
      numberOr("inc-missions-cases", M.missions[1]),
    ],
    [
      "daily",
      numberOr("inc-daily-coins", M.dailyReward[0]),
      numberOr("inc-daily-cases", M.dailyReward[1]),
    ],
    ["mu", ...muPrize(muPlace, muDivisionOf(P), muShare, P.mu, prices.case2)],
    ["league", ...leaguePrize(leaguePlace, leagueGroup, prices.case2)],
    ["employees", typedEmployees || 0, 0],
    ["other", numberOr("inc-other-coins", 0), 0],
  ];
  let income = 0;
  for (const [, coins, cases] of rows) income += coins + cases * prices.case1;
  // the donation to the country (user, 2026-11-15): an expense the player may choose; s.income is net of it
  const donation = $("donate").checked
    ? clamp(numberOr("donation", 0), 0, 1e6)
    : 0;
  income -= donation;
  const goal = $("goal").value,
    target = clamp(numberOr("target", 500000), 1, 1e9),
    burst = $("burst").checked && goal !== "profit";
  const wealth =
    goal === "max" ? ANY_COST : clamp(numberOr("budget", 0), -1e6, 1e6);
  const out = {
    sc: {
      level,
      budget: wealth + income,
      bounds,
      ...tables,
      managementNow: P.managementNow,
      trainClicks: read ? draws : 0,
      selfClicks: numberOr("self-clicks", null),
      prestige,
      fixedBonus,
      managerPay: clamp(numberOr("manager-pay", 0), 0, 1000),
      selfValue: clamp(numberOr("self-value", P.selfValue), 0, 100),
      pool: $("pool").checked
        ? typedPool === null
          ? M.pool
          : [[0, typedPool]]
        : [],
      bonus: clamp(numberOr("bonus", DEFAULT_BONUS), -100, 1000) / 100,
      rank: clamp(numberOr("rank", P.rank * 100), 0, 100) / 100,
      bounty: clamp(numberOr("bounty", 0), 0, 100),
      pill: $("pill").checked,
      help: $("help").checked,
      debuff: $("debuff").checked,
      debuffBare: SIMPLE,
      oneFood: $("one-food").checked,
      foodsOff: FOODS.filter((f) => !$(`food-${f}`).checked),
      burstOnly: burst,
      fullPrecision: $("full-precision").checked,
      strategic: $("no-strategic").checked
        ? {}
        : strategicBonus(
            Object.fromEntries(
              Object.entries(strategicLevels(P.strategic || {})).map(
                ([r, now]) => [
                  r,
                  Math.round(
                    clamp(numberOr(`st-${r}`, now), 0, STRATEGIC_MAX_LEVEL),
                  ),
                ],
              ),
            ),
          ),
      noBonus: noEco && mode === "search" ? NO_ECO_SKILLS : [],
    },
    P: prices,
    typedPool,
    qualities,
    adjust: clamp(numberOr("adjust", 0), -99, 1000),
    wealth,
    income,
    donation,
    rows,
    keep,
    freeze,
    keepFailed: false,
    engine,
    goal,
    target,
    burst,
    tax: P.marketTax,
    employees,
    newCompany,
  };
  if ((keep || freeze) && !makeCtx(out.sc, prices).valid)
    return {
      ...readScenario(true),
      keepFailed: keep ? "keep" : "freeze",
    };
  return out;
}

// ---- running ----
function makeWorker() {
  return new Worker(new URL("../js/damage_worker.js", location.href));
}
// The search jobs over a few workers at once (user, 2026-11-21: 15 s for the four searches one after another): each
// worker takes the next job when it's done with one. Every job is the same search on the same input, so the builds are
// the same as one worker's, only sooner. on: progress(id, done, total), result(msg), error(text), done().
const POOL_SIZE = Math.max(
  1,
  Math.min(4, (navigator.hardwareConcurrency || 2) - 1),
);
function runPool(jobs, s, on) {
  const queue = jobs.slice(),
    workers = [];
  const base = {
    rules: MARKET.rules,
    options: MARKET.options,
    s: {
      P: s.P,
      adjust: s.adjust,
      qualities: [...s.qualities],
      tax: s.tax,
    },
  };
  let running = 0,
    stopped = false;
  const stop = () => {
    stopped = true;
    for (const w of workers) w.terminate();
  };
  const failed = (text) => {
    if (!stopped) {
      stop();
      on.error(text);
    }
  };
  const next = (w) => {
    const job = queue.shift();
    if (job) {
      w.postMessage({
        ...base,
        jobs: [job],
      });
      return;
    }
    w.terminate();
    running -= 1;
    if (!running && !stopped) {
      stopped = true;
      on.done();
    }
  };
  for (let k = 0; k < Math.min(POOL_SIZE, jobs.length); k++) {
    const w = makeWorker();
    workers.push(w);
    running += 1;
    w.onerror = (event) => failed(event.message || t("dmg.stopped"));
    w.onmessage = ({ data }) => {
      if (stopped) return;
      if (data.error) failed(data.error);
      else if (data.progress) on.progress(data.progress, data.done, data.total);
      else if (data.result) on.result(data.result);
      else if (data.finished) next(w);
    };
    next(w);
  }
  return {
    terminate: stop,
  };
}
const asBuild = (msg, sc, s) => {
  const ctx = makeCtx(
    {
      ...sc,
      budget: msg.wealth + s.income,
    },
    s.P,
  );
  const b = {
    skills: msg.skills,
    gear: msg.gear,
    ammo: msg.ammo,
    dset: msg.dset || null,
    ctx,
    wealth: msg.wealth,
  };
  b.out = evaluate(ctx, b);
  return b;
};
async function run() {
  const name = $("player").value.trim();
  if (!name) {
    status(t("dmg.noPlayer"), true);
    return;
  }
  const mine = ++runId;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  if (curveWorker) {
    curveWorker.terminate();
    curveWorker = null;
  }
  $("run").disabled = true;
  status("");
  document.body.dataset.state = "running";
  const started = Date.now();
  try {
    progress(t("dmg.market"), 0);
    await marketData();
    const token = readToken();
    const withEmployees = $("employees").checked;
    const key = `${name.toLowerCase()}|${withEmployees}`;
    if (!PLAYER || key !== playerKey || clock() - playerRead > PLAYER_KEEP) {
      progress(t("dmg.reading", name), READ_SHARE * 0.1);
      PLAYER = await readPlayer(
        new WarEraApi.Client(token),
        name,
        withEmployees,
      );
      playerKey = key;
      playerRead = clock();
      frozen = null;
      $("skills-mode").querySelector("[value=freeze]").disabled = true;
      if ($("skills-mode").value === "freeze")
        $("skills-mode").value = "search";
    }
    applySimple();
    fillFromPlayer();
    if ($("sandbox").checked) {
      $("sandbox").checked = false;
      showSandbox(false);
    }
    const s = readScenario();
    const check = makeCtx(s.sc, s.P);
    if (!check.valid) {
      status(
        t(
          "dmg.limitsTooHigh",
          fmt(check.ecoMinimum + pointsUsed(check, check.minLevel)),
          s.sc.level,
          fmt(check.totalPoints),
        ),
        true,
      );
      finishRun();
      return;
    }
    await search(mine, s, started);
  } catch (error) {
    status(String((error && error.message) || error), true);
    finishRun();
  }
}
function finishRun() {
  endProgress();
  $("run").disabled = false;
  document.body.dataset.state = "done";
}

function search(mine, s, started) {
  return new Promise((resolve, reject) => {
    const keep = s.keep ? PLAYER.mine : s.freeze ? frozen.skills : null;
    const goal = {
      goal: s.goal,
      target: s.target,
      income: s.income,
    };
    const jobs = [
      {
        id: "best",
        sc: s.sc,
        skills: keep,
        extra: EXTRA_SEEDS,
        starts: [PLAYER.mine],
        ...goal,
      },
    ];
    // the same build search with the donation's coins back in the budget: what the donation costs in damage (most damage goal only)
    const free = !SIMPLE && s.donation > 0 && s.goal === "damage";
    const unDonated = {
      ...s,
      income: s.income + s.donation,
    };
    if (free)
      jobs.push({
        id: "noDonation",
        sc: {
          ...s.sc,
          budget: s.sc.budget + s.donation,
        },
        skills: keep,
        extra: EXTRA_SEEDS,
        starts: [PLAYER.mine],
        ...goal,
        income: unDonated.income,
      });
    if (!SIMPLE)
      jobs.push({
        id: "noPill",
        sc: {
          ...s.sc,
          pill: false,
        },
        skills: keep,
        extra: EXTRA_SEEDS,
        starts: [PLAYER.mine],
        ...goal,
      });
    if (!SIMPLE && !s.keep && fits(makeCtx(s.sc, s.P), PLAYER.mine))
      jobs.push({
        id: "yours",
        sc: s.sc,
        skills: PLAYER.mine,
        extra: 0,
        starts: [],
        ...goal,
      });
    const byId = Object.fromEntries(jobs.map((j) => [j.id, j])),
      got = {};
    const labels = {
      best: t("dmg.searching"),
      noDonation: t("dmg.searchingNoDonation"),
      noPill: t("dmg.searchingNoPill"),
      yours: t("dmg.searchingYours"),
    };
    const weight = {
        best: 5,
        noDonation: 6,
        noPill: 3,
        yours: 0.2,
      },
      share = {};
    // the jobs' usual seconds (2026-11-21)
    const weights = jobs.reduce((n, j) => n + weight[j.id], 0);
    const longGoal = s.goal === "profit" || s.goal === "target";
    const showProgress = () => {
      const f =
        jobs.reduce((n, j) => n + weight[j.id] * (share[j.id] || 0), 0) /
        weights;
      const open = jobs.find((j) => !(j.id in got)) || jobs[0];
      progress(
        longGoal ? t("dmg.goalSearch") : labels[open.id],
        READ_SHARE + (1 - READ_SHARE) * f,
      );
    };
    worker = runPool(jobs, s, {
      error: (text) => {
        if (mine === runId) reject(new Error(text));
      },
      progress: (id, done, total) => {
        if (mine !== runId) return;
        share[id] = done / total;
        showProgress();
      },
      result: (msg) => {
        if (mine !== runId) return;
        got[msg.id] = msg.none
          ? null
          : asBuild(
              msg,
              byId[msg.id].sc,
              msg.id === "noDonation" ? unDonated : s,
            );
        share[msg.id] = 1;
        showProgress();
        if (msg.id === "best") {
          if (!got.best) {
            status(t("dmg.notReached", fmt(s.target), s.burst), true);
            $("results").hidden = true;
          } else {
            // the other jobs may have ended first: what they found so far comes along
            lastBest = got.best;
            LAST = {
              s,
              best: got.best,
              noPill: got.noPill,
              yours: got.yours,
              noDonation: free ? got.noDonation : null,
            };
            frozenChoice(got.best);
            render();
            $("results").hidden = false;
          }
        } else if (msg.id === "noDonation" && LAST && got.best) {
          LAST.noDonation = got.noDonation;
          renderSummary();
        } else if (LAST && got.best) {
          LAST[msg.id] = got[msg.id];
          renderCompare();
        }
      },
      done: () => {
        if (mine !== runId) return;
        if (LAST && got.best) {
          if (LAST.noDonation === undefined) {
            LAST.noDonation = got.noDonation ?? null;
            renderSummary();
          }
          LAST.noPill = got.noPill ?? null;
          LAST.yours = got.yours ?? null;
          renderCompare();
          renderStatus(
            `${t("dmg.done", Math.round((Date.now() - started) / 100) / 10)}`,
          );
          document.body.dataset.result = JSON.stringify(resultOf(got.best));
        }
        finishRun();
        resolve();
      },
    });
  });
}
// what tests/damage_twin.py compares with Python
const resultOf = (b) => ({
  damage: b.out.damage,
  net: b.out.net,
  eco: b.out.x.eco,
  skills: b.skills,
  ecoLevels: b.out.x.ecoLevels,
  ammo: b.ammo || null,
  foods: b.out.foods,
  gear: b.gear.map((g) => (g ? [g.code, g.stats] : null)),
});

// the choice "keep the skills shown below": the skill-point levels and bonus levels of the build shown
function frozenChoice(b) {
  const pl = b.out.x.place,
    n = SKILLS.length;
  const bonusOf = (i) => (i < n ? pl.fightBonus[i] : pl.ecoBonus[i - n]);
  if ($("skills-mode").value === "freeze" && frozen) return;
  frozen = {
    skills: b.skills.slice(),
    levels: Object.fromEntries(
      ALL_SKILLS.map((sk, i) => [
        sk,
        (i < n ? b.skills[i] : pl.ecoLevels[i - n]) - bonusOf(i),
      ]),
    ),
    bonus: Object.fromEntries(ALL_SKILLS.map((sk, i) => [sk, bonusOf(i)])),
  };
  $("skills-mode").querySelector("[value=freeze]").disabled = false;
}

// ---- the results ----
const lvlText = (level, bonus) =>
  bonus ? `${level - bonus}+${bonus}` : String(level);
const skillsOf = (b) => {
  const pl = b.out.x.place,
    m = {};
  SKILLS.forEach((sk, i) => {
    m[sk] = [b.skills[i], pl.fightBonus[i]];
  });
  ECO_ALL.forEach((sk, i) => {
    m[sk] = [pl.ecoLevels[i], pl.ecoBonus[i]];
  });
  return m;
};
const nowLevel = (sk) => PLAYER.levelsNow[sk] + PLAYER.bonusNow[sk];
const change = (a, b) =>
  a === b
    ? "0"
    : (a > b ? "+" : "-") +
      I18N.num(Math.abs(a - b), Number.isInteger(a - b) ? 0 : 1);
const itemName = (g) =>
  g.slot === "weapon" ? I18N.item(g.code) : I18N.item(g.slot);
function gearLink(g) {
  const link = el(
    "a",
    `r-${RARITIES[g.quality - 1]}`,
    `Q${g.quality} ${itemName(g)}`,
  );
  link.href = MARKET_URL + encodeURIComponent(g.code);
  link.target = "_blank";
  link.rel = "noopener";
  return link;
}
function head(...labels) {
  return el(
    "thead",
    "",
    el(
      "tr",
      "",
      ...labels.map(([text, num]) => el("th", num ? "num" : "", text)),
    ),
  );
}

function renderStatus(end = "") {
  const { s, best } = LAST,
    o = best.out,
    bits = [];
  if (s.keepFailed)
    bits.push(
      t(s.keepFailed === "keep" ? "dmg.keepFailed" : "dmg.freezeFailed"),
    );
  if (!o.feasible && s.sc.fullPrecision && o.x.precision < 100)
    bits.push(t("dmg.noPrecision", fmt(o.x.precision)));
  else if (!o.feasible)
    bits.push(t("dmg.overBudget", fmt(o.net, 1), fmt(o.overspend, 1)));
  if ($("employees").checked && !PLAYER.employeesRead)
    bits.push(t(SIMPLE ? "dmg.noEmployeesSimple" : "dmg.noEmployees"));
  if (s.sc.level < D.rules.unlock.attack)
    bits.push(t("dmg.lowLevel", D.rules.unlock.attack));
  const warn = !o.feasible || s.keepFailed;
  status([end, ...bits].filter(Boolean).join(" "), Boolean(warn));
}

// A professional mercenary's rate for the donation's line (user, 2026-11-15): coins a 1,000 damage.
const MERCENARY_RATE = 0.15;
function renderSummary() {
  const { s, best, noDonation } = LAST,
    o = best.out,
    parts = o.parts || {};
  const fixed = s.income + s.donation,
    income = fixed + o.x.eco;
  // before the donation
  // what the donation would buy the country instead (user, 2026-11-15): the items' 24 h medians (item_values.json)
  const price = (code) =>
      ((VALUES && VALUES.items && VALUES.items[code]) || {}).price || 0,
    paper = price("paper"),
    oil = price("oil");
  $("summary-head").textContent = t(
    s.sandbox ? "dmg.summarySandbox" : "dmg.summaryHead",
  );
  // one of each item, the debuff's own items too (an item in the same slot of both sets once)
  const ds = parts.debuffSet;
  const setPrice =
    best.gear.reduce((n, g) => n + (g ? g.price : 0), 0) +
    (ds
      ? ds.gear.reduce(
          (n, g, i) => n + (g && !sameItem(g, best.gear[i]) ? g.price : 0),
          0,
        )
      : 0);
  const line = (label, value, note, bright = false) =>
    el(
      "tr",
      "",
      el("th", "", label),
      el("td", `num${bright ? " up" : ""}`, value),
      el("td", "muted row-note", note || ""),
    );
  const goalLine = {
    max: t("dmg.goalLineMax"),
    profit: t("dmg.goalLineProfit"),
    target: t("dmg.goalLineTarget", fmt(s.target)),
  }[s.goal];
  let without = null;
  if (s.donation && !s.sandbox && noDonation !== null) {
    if (noDonation === undefined)
      without = line(t("dmg.noDonation"), t("dmg.waiting"), "");
    else {
      const q = noDonation.out,
        more = q.damage - (o.feasible ? o.damage : 0);
      without = line(
        t("dmg.noDonation"),
        q.feasible ? fmt(q.damage) : t("dmg.overShort"),
        q.feasible && o.feasible && o.damage
          ? t(
              "dmg.noDonationNote",
              signedFmt(more, 0),
              `${signedFmt((more / o.damage) * 100, 1)}%`,
            )
          : "",
      );
    }
  }
  if (SIMPLE) {
    $("summary").replaceChildren(
      el(
        "tbody",
        "",
        line(
          t("dmg.damageDay"),
          o.feasible ? fmt(o.damage) : t("dmg.overShort"),
          t(
            "dmg.hitsNote",
            fmt(o.hits, 1),
            parts.debuffHits ? fmt(parts.debuffHits, 1) : null,
            "none",
          ),
          true,
        ),
        line(
          t("dmg.damageHit"),
          fmt(o.perHit),
          t(
            "dmg.hitNote",
            fmt(armourHealth(o.x.armor), 1),
            fmt(o.x.dodged * 100),
          ),
        ),
        parts.burstHits
          ? line(
              t("dmg.burstRow"),
              fmt(parts.burstDamage),
              t(
                "dmg.burstNote",
                fmt(parts.burstHits, 1),
                fmt(o.damage - parts.debuffDamage - parts.burstDamage),
              ),
            )
          : null,
        el(
          "tr",
          "total",
          el("th", "", t("dmg.statsHead")),
          el("td", ""),
          el("td", ""),
        ),
        ...statParts(o.x).map(([label, value, note]) =>
          line(label, value, note),
        ),
      ),
    );
    return;
  }
  $("summary").replaceChildren(
    el(
      "tbody",
      "",
      line(
        t("dmg.damageDay"),
        o.feasible ? fmt(o.damage) : t("dmg.overShort"),
        t(
          "dmg.hitsNote",
          fmt(o.hits, 1),
          parts.debuffHits ? fmt(parts.debuffHits, 1) : null,
          ds ? ds.kind : "none",
        ),
        true,
      ),
      line(
        t("dmg.damageHit"),
        fmt(o.perHit),
        t(
          "dmg.hitNote",
          fmt(armourHealth(o.x.armor), 1),
          fmt(o.x.dodged * 100),
        ),
      ),
      parts.burstHits
        ? line(
            t("dmg.burstRow"),
            fmt(parts.burstDamage),
            t(
              "dmg.burstNote",
              fmt(parts.burstHits, 1),
              fmt(o.damage - parts.debuffDamage - parts.burstDamage),
            ),
          )
        : null,
      line(t("dmg.fightCost"), fmt(o.net, 1), t("dmg.fightNote")),
      line(
        t("dmg.incomeDay"),
        fmt(income, 1),
        t("dmg.incomeNote", fmt(fixed, 1), fmt(o.x.eco, 1)),
      ),
      s.donation
        ? line(
            t("dmg.rowDonation"),
            signedFmt(-s.donation),
            t("dmg.donationNote"),
          )
        : null,
      line(
        t("dmg.wealthDay"),
        signedFmt(income - s.donation - o.net),
        goalLine || t("dmg.wealthNote"),
        true,
      ),
      line(
        t("dmg.per1000"),
        o.damage ? fmt((o.net / o.damage) * 1000, 2) : "-",
        "",
      ),
      line(t("dmg.gearSet"), fmt(setPrice, 1), t("dmg.gearSetNote")),
      without,
      s.donation
        ? line(
            t("dmg.mercDamage"),
            fmt((s.donation / MERCENARY_RATE) * 1000),
            t("dmg.mercNote", fmt(MERCENARY_RATE, 2)),
          )
        : null,
      s.donation && paper && oil
        ? line(
            t("dmg.countryGoods"),
            t("dmg.paperOrOil", fmt(s.donation / paper), fmt(s.donation / oil)),
            t("dmg.countryNote", fmt(paper, 3), fmt(oil, 3)),
          )
        : null,
    ),
  );
}

// The build's combat stats: [label, value, note] (the stats fold shows the note after the value, the simple mode's
// summary in its own column).
function statParts(x) {
  return [
    [t("dmg.statAttack"), fmt(x.attack), ""],
    [t("dmg.statPrecision"), `${fmt(x.precision)}%`, ""],
    [t("dmg.statCrit"), `${fmt(x.crit)}%`, ""],
    [t("dmg.statCritDamage"), `+${fmt(x.critDamage)}%`, ""],
    [
      t("dmg.statArmor"),
      fmt(x.armor),
      t(
        "dmg.armorNote",
        softCapPercent(x.armor),
        fmt(armourHealth(x.armor), 1),
      ),
    ],
    [t("dmg.statDodge"), fmt(x.dodge), t("dmg.dodgeNote", fmt(x.dodged * 100))],
    [t("dmg.statHealth"), `${fmt(x.health)} / ${fmt(x.hunger)}`, ""],
    [t("dmg.statLoot"), `${fmt(x.loot)}%`, ""],
  ];
}
function statRows(x) {
  return statParts(x).map(([label, value, note]) =>
    el(
      "tr",
      "",
      el("th", "", label),
      el("td", "num", note ? `${value} (${note})` : value),
    ),
  );
}
function render() {
  if (!LAST) return;
  const { s, best } = LAST,
    o = best.out,
    ctx = best.ctx,
    levels = o.x.ecoLevels,
    income = s.income + s.donation + o.x.eco;
  const [manager, selfWork, engines, employees] = ecoParts(ctx, levels);
  $("self-clicks").placeholder = fmt(selfWorkClicks(ctx, levels[0]), 1);
  const parts = o.parts || {};
  renderSummary();
  renderSkills();
  renderGear();
  poolHint();
  const ds = parts.debuffSet;
  const rows = o.parts
    ? [
        [t("dmg.costAmmo"), -parts.ammo],
        ...Object.entries(parts.wear).map(([slot, v]) => [
          t("dmg.costWear", t(`dmg.slot.${slot}`)),
          -v,
        ]),
        ...(ds
          ? [
              [t("dmg.costDebuffAmmo"), -ds.ammo],
              ...Object.entries(ds.wear).map(([slot, v]) => [
                t("dmg.costDebuffWear", t(`dmg.slot.${slot}`)),
                -v,
              ]),
            ]
          : []),
        [t("dmg.costFood"), -parts.food],
        [t("dmg.costPill"), -parts.pill],
        [t("dmg.costCases"), parts.cases],
        [t("dmg.costDebuff"), parts.debuffCases],
        [t("dmg.costBounty"), parts.bounty + parts.debuffBounty],
        [t("dmg.costPool"), parts.pool],
      ]
    : [];
  $("costs").replaceChildren(
    el(
      "tbody",
      "",
      ...rows
        .filter((r) => Math.abs(r[1]) > 1e-9)
        .map(([label, v]) =>
          el(
            "tr",
            "",
            el("th", "", label),
            el("td", `num${v < 0 ? " neg" : " up"}`, signedFmt(v)),
          ),
        ),
      el(
        "tr",
        "total",
        el("th", "", t("dmg.costTotal")),
        el("td", "num up", signedFmt(-o.net)),
      ),
    ),
  );
  const tier = (name, row) =>
    el(
      "tr",
      "",
      el("th", "", name),
      el("td", "num", fmt(row[1] + row[2] * s.P.case1, 1)),
    );
  const incomeRows = [
    tier(t("dmg.incMissions"), s.rows[0]),
    tier(t("dmg.incDaily"), s.rows[1]),
    tier(t("dmg.rowMu"), s.rows[2]),
    tier(t("dmg.rowLeague"), s.rows[3]),
    ...(s.rows[4][1] ? [tier(t("dmg.rowEmployeesTyped"), s.rows[4])] : []),
    ...(s.rows[5][1] ? [tier(t("dmg.incOther"), s.rows[5])] : []),
    el(
      "tr",
      "",
      el(
        "th",
        "",
        t("dmg.rowSelfClicks", fmt(selfWorkClicks(ctx, levels[0]), 1)),
      ),
      el("td", "num", fmt(selfWork, 1)),
    ),
    el(
      "tr",
      "",
      el("th", "", t("dmg.rowEngines")),
      el("td", "num", fmt(engines, 1)),
    ),
    ...(s.employees
      ? [
          el(
            "tr",
            "",
            el("th", "", t("dmg.rowEmployees")),
            el("td", "num", fmt(employees, 1)),
          ),
        ]
      : []),
    ...(manager
      ? [
          el(
            "tr",
            "",
            el("th", "", t("dmg.rowManager")),
            el("td", "num", fmt(manager, 1)),
          ),
        ]
      : []),
    el(
      "tr",
      "total",
      el("th", "", t("dmg.rowTotal")),
      el("td", "num up", fmt(income, 1)),
    ),
    ...(s.donation
      ? [
          el(
            "tr",
            "",
            el("th", "", t("dmg.rowDonation")),
            el("td", "num neg", signedFmt(-s.donation)),
          ),
          el(
            "tr",
            "total",
            el("th", "", t("dmg.rowAfterDonation")),
            el("td", "num up", fmt(income - s.donation, 1)),
          ),
        ]
      : []),
  ];
  const count = skillValue(MARKET.rules.values.companies, levels[2]),
    all = PLAYER.companies.length;
  const one = s.newCompany,
    built = one ? Math.max(count - all, 0) : 0;
  if (built) {
    const management = ctx.ecoValues.management[levels[3]];
    const each =
      one.engine +
      one.employees +
      one.employeeBase * MANAGEMENT_BONUS * (management - s.sc.managementNow);
    const cost = newCompanyCost(built, all, one, MARKET);
    incomeRows.splice(
      -1,
      0,
      el(
        "tr",
        "",
        el("th", "", t("dmg.rowNew", built)),
        el("td", "num", fmt(built * each, 1)),
      ),
    );
    $("new-companies").textContent =
      t(
        "dmg.newCompanies",
        built,
        fmt(built * each, 1),
        fmt(cost.coins),
        fmt(cost.concrete),
        fmt(cost.steel),
        one.level,
        each > 0 ? fmt(cost.coins / (built * each)) : null,
      ) +
      (one.seats ? t("dmg.newCrews", one.seats, fmt(one.employees, 1)) : "");
  }
  $("new-companies").hidden = !built;
  $("income").replaceChildren(el("tbody", "", ...incomeRows));
  let steel = 0;
  if (s.engine)
    for (const c of PLAYER.companies)
      steel += Math.max(
        MARKET.engines[s.engine][1] - MARKET.engines[c.level][1],
        0,
      );
  $("income-note").textContent =
    (all > count ? t("dmg.companiesNote", count, all) : "") +
    (steel
      ? t("dmg.steelNote", fmt(steel), fmt(steel * MARKET.steelPrice))
      : "");
  $("stats").replaceChildren(el("tbody", "", ...statRows(o.x)));
  renderCompare();
  $("notes").replaceChildren(
    ...t("dmg.notes").map((text) => el("li", "", text)),
  );
  $("list-note").textContent = t("dmg.listNote", fmt(s.tax * 100, 1));
  if ($("prices-list").open) renderList();
  renderCurveState();
  renderStatus();
}

function renderSkills() {
  const { best } = LAST,
    o = best.out,
    ctx = best.ctx,
    r = MARKET.rules,
    built = skillsOf(best),
    place = o.x.place;
  const showPrestige = ctx.prestige > 0;
  const row = (sk) => {
    const extra = (ctx.sc.strategic || {})[sk] || 0,
      [level, bonus] = built[sk],
      now = nowLevel(sk);
    // with the strategic resources
    const value = skillValue(r.values[sk], level) + extra,
      valueNow = skillValue(r.values[sk], now) + extra;
    const moved = level !== now;
    return el(
      "tr",
      moved ? "moved" : "",
      el("th", "", skillName(sk)),
      el("td", "num up", lvlText(level, bonus)),
      el("td", "num muted", lvlText(now, PLAYER.bonusNow[sk])),
      el("td", "num", change(level, now)),
      el("td", "num", fmt(value)),
      el("td", "num muted", fmt(valueNow)),
      el("td", "num", String(r.costs[sk][level - bonus])),
      showPrestige
        ? el("td", "num", bonus ? String(prestigeCost(bonus)) : "")
        : null,
    );
  };
  const part = (label, codes) => [
    el("tr", "next", el("td", "muted", label)),
    ...codes.map(row),
  ];
  $("skills").replaceChildren(
    head(
      [t("dmg.skill")],
      [t("dmg.lvl"), 1],
      [t("dmg.now"), 1],
      [t("dmg.change"), 1],
      [t("dmg.val"), 1],
      [t("dmg.now"), 1],
      [t("dmg.points"), 1],
      ...(showPrestige ? [[t("dmg.prestigeCol"), 1]] : []),
    ),
    el(
      "tbody",
      "",
      ...part(t("dmg.fighting"), GAME_ORDER.slice(0, 9)),
      ...part(t("dmg.economy"), GAME_ORDER.slice(9)),
    ),
  );
  const ecoPoints = ECO_ALL.reduce(
    (n, sk, i) => n + r.costs[sk][place.ecoLevels[i] - place.ecoBonus[i]],
    0,
  );
  const unused = ctx.totalPoints - place.fightPoints - ecoPoints;
  const changed = GAME_ORDER.some((sk) => built[sk][0] !== nowLevel(sk));
  const resetCost = (MARKET.resetCost || 0) * PLAYER.spent;
  $("skills-note").textContent =
    t("dmg.pointsNote", ctx.totalPoints, place.fightPoints, ecoPoints) +
    (unused ? t("dmg.unused", unused) : "") +
    (ctx.prestige
      ? t("dmg.prestigeUsed", place.prestigeUsed, ctx.prestige)
      : "") +
    "." +
    (changed && resetCost
      ? t("dmg.resetNote", fmt(resetCost, 1), PLAYER.freeResets)
      : "");
}

// One set's table: each slot's item, its ammo and food (use: wear, items, ammo, ammoUnits of evaluate's parts).
function gearRows(gear, ammo, use, foods, slots, pill) {
  const { s } = LAST,
    ctx = LAST.best.ctx,
    ok = !!LAST.best.out.parts,
    week = (n) => Math.ceil(n * 7 - 1e-9);
  const items = use.items || {},
    wear = use.wear || {};
  const rows = gear.map((g, i) => {
    const slot = SLOTS[i];
    return el(
      "tr",
      "",
      el("th", "", t(`dmg.slot.${slot}`)),
      g ? el("td", "", gearLink(g)) : el("td", "muted", t("dmg.none")),
      el("td", "num up", g ? g.stats.join("/") : ""),
      el("td", "num", g ? fmt(g.price, 2) : ""),
      el(
        "td",
        "num",
        g && items[slot] !== undefined ? fmt(items[slot], 2) : "",
      ),
      el(
        "td",
        "num",
        g && items[slot] !== undefined
          ? fmt(g.price * items[slot] - wear[slot], 1)
          : "",
      ),
      el("td", "num", g && wear[slot] !== undefined ? fmt(wear[slot], 1) : ""),
      el(
        "td",
        "num",
        g && items[slot] !== undefined ? fmt(week(items[slot])) : "",
      ),
    );
  });
  const flat = (label, name, price, day, used, sevenDays) =>
    el(
      "tr",
      "",
      el("th", "", label),
      el("td", "wrap", name),
      el("td", "num", ""),
      el("td", "num", price),
      el("td", "num", used),
      el("td", "num", ""),
      el("td", "num", day),
      el("td", "num", sevenDays),
    );
  rows.push(
    flat(
      t("dmg.ammoRow"),
      ammo ? I18N.item(ammo) : t("dmg.none"),
      ammo ? fmt(ctx.ammoPrice[ammo], 3) : "",
      ok && ammo ? fmt(use.ammo, 1) : "",
      ok && ammo ? fmt(Math.ceil(use.ammoUnits - 1e-9)) : "",
      ok && ammo ? fmt(week(use.ammoUnits)) : "",
    ),
  );
  const count = foods.reduce((a, b) => a + b, 0);
  const names =
    FOODS.map((f, i) =>
      foods[i] > 0.005 ? `${fmt(foods[i])} ${I18N.item(f)}` : "",
    )
      .filter(Boolean)
      .join(", ") || t("dmg.none");
  rows.push(
    flat(
      t("dmg.foodRow"),
      `${names} (${t("dmg.foodsOf", fmt(slots))})`,
      "",
      ok
        ? fmt(
            foods.reduce((n, k, i) => n + k * ctx.foodPrices[i], 0),
            1,
          )
        : "",
      fmt(count),
      fmt(count * 7),
    ),
  );
  if (pill)
    rows.push(
      flat(
        t("dmg.pillRow"),
        s.sc.pill ? t("dmg.oneADay") : t("dmg.none"),
        s.sc.pill ? fmt(ctx.fixed, 1) : "",
        s.sc.pill ? fmt(ctx.fixed, 1) : "",
        s.sc.pill ? "1" : "",
        s.sc.pill ? "7" : "",
      ),
    );
  return [
    head(
      [t("dmg.slot")],
      [t("dmg.item")],
      [t("dmg.statsCol"), 1],
      [t("dmg.price"), 1],
      [t("dmg.usedDay"), 1],
      [t("dmg.scrapsBack"), 1],
      [t("dmg.coinsADay"), 1],
      [t("dmg.week"), 1],
    ),
    el("tbody", "", ...rows),
  ];
}
function renderGear() {
  const { s, best } = LAST,
    o = best.out,
    parts = o.parts || {},
    dd = o.x.debuff,
    ds = parts.debuffSet;
  // the pill window's set (its own food and hunger); without the pill, the day's
  const debuffSlots = dd ? dd.slots : 0;
  $("gear-window").hidden = !dd;
  $("gear-window").textContent = t("dmg.gearWindow");
  $("gear").replaceChildren(
    ...gearRows(
      best.gear,
      best.ammo,
      parts,
      o.feasible ? o.x.plan : [0, 0, 0],
      o.x.slots - debuffSlots,
      true,
    ),
  );
  $("gear-note").textContent = t("dmg.gearNote");
  $("debuff-fold").hidden = !dd;
  if (!dd) return;
  const kind = ds ? ds.kind : dd.kind;
  $("debuff-head").textContent = t("dmg.gearDebuff", fmt(dd.hits, 1), kind);
  $("debuff-note").textContent = t("dmg.debuffNote", kind);
  $("debuff-gear").replaceChildren(
    ...gearRows(
      dd.set.gear,
      dd.set.ammo,
      ds || {},
      dd.plan,
      debuffSlots,
      false,
    ),
  );
}

function renderCompare() {
  if (!LAST) return;
  const { s, best, noPill, yours } = LAST;
  const row = (label, b) => {
    if (b === undefined)
      return el(
        "tr",
        "",
        el("th", "", label),
        el("td", "muted", t("dmg.waiting")),
      );
    if (b === null) return null;
    const q = b.out,
      e = q.x.eco,
      ms = skillsOf(b),
      under = el("td", "muted wrap");
    under.colSpan = 5;
    const skills = GAME_ORDER.filter((sk) => ms[sk][0] || nowLevel(sk))
      .map(
        (sk) =>
          `${skillName(sk)} ${lvlText(...ms[sk])}` +
          (ms[sk][0] !== nowLevel(sk)
            ? ` (${change(ms[sk][0], nowLevel(sk))})`
            : ""),
      )
      .join(", ");
    under.textContent = skills;
    return [
      el(
        "tr",
        "next",
        el("th", "", label),
        el("td", "num up", q.feasible ? fmt(q.damage) : t("dmg.overShort")),
        el("td", "num", fmt(q.net, 1)),
        el("td", "num", fmt(e, 1)),
        el("td", "num", signedFmt(s.income + e - q.net)),
        b.gear[0]
          ? el(
              "td",
              "",
              gearLink(b.gear[0]),
              b.ammo ? ` + ${I18N.item(b.ammo)}` : "",
            )
          : el("td", "muted", t("dmg.none")),
      ),
      el("tr", "under", el("td", ""), under),
    ];
  };
  $("compare").replaceChildren(
    head(
      [t("dmg.build")],
      [t("dmg.damageDay"), 1],
      [t("dmg.fightCost"), 1],
      [t("dmg.incomeResult"), 1],
      [t("dmg.wealthDay"), 1],
      [t("dmg.weapon")],
    ),
    el(
      "tbody",
      "",
      ...[
        row(t(s.sandbox ? "dmg.rowSandbox" : "dmg.rowBest"), best),
        row(t("dmg.rowNoPill"), noPill),
        s.sandbox
          ? row(t("dmg.rowBase"), sandboxBase)
          : row(t("dmg.rowYours"), yours),
      ]
        .flat()
        .filter(Boolean),
    ),
  );
}

function renderList() {
  const { s } = LAST,
    slot = $("list-slot").value;
  const gear = MARKET.options
    .map((o) => gearOption(o, s.P.scraps, s.adjust, s.tax))
    .filter((g) => (!slot || g.slot === slot) && s.qualities.has(g.quality));
  $("list").replaceChildren(
    head(
      [t("dmg.slot")],
      [t("dmg.item")],
      [t("dmg.statsCol"), 1],
      [t("dmg.median"), 1],
      [t("dmg.paid"), 1],
      [t("dmg.wear"), 1],
      [t("dmg.sales"), 1],
      [t("dmg.window")],
    ),
    el(
      "tbody",
      "",
      ...gear.map((g) =>
        el(
          "tr",
          "",
          el("th", "", t(`dmg.slot.${g.slot}`)),
          el("td", "", gearLink(g)),
          el("td", "num", g.stats.join("/")),
          el("td", "num", fmt(g.median, 2)),
          el("td", "num", fmt(g.price, 2)),
          el("td", "num", fmt(g.wear, 3)),
          el("td", "num", String(g.sales)),
          el("td", "muted", g.window),
        ),
      ),
    ),
  );
}

// ---- the curve: on request (28 quicker searches), in its own workers ----
let curvePoints = [],
  curveShowsTable = false;
function renderCurveState() {
  if (!LAST) return;
  const usable = LAST.s.goal === "damage" && !LAST.s.sandbox;
  $("curve-run").hidden = !usable;
  $("curve-note").textContent = t(usable ? "dmg.curveNote" : "dmg.curveOnly");
  drawCurve();
}
function startCurve() {
  const s = LAST && LAST.s;
  if (!s || s.goal !== "damage") return;
  if (curveWorker) curveWorker.terminate();
  const keep = s.keep ? PLAYER.mine : s.freeze ? frozen.skills : null;
  const curve = MARKET.curve,
    jobs = [];
  curve.forEach((budget, i) => {
    for (const pill of [true, false])
      jobs.push({
        id: `curve:${i}:${pill ? 1 : 0}`,
        sc: {
          ...s.sc,
          budget: budget + s.income,
          pill,
        },
        skills: keep,
        extra: 0,
        starts: [],
        goal: "damage",
        target: s.target,
        income: s.income,
      });
  });
  curvePoints = curve.map((budget) => ({
    budget,
  }));
  const byId = Object.fromEntries(jobs.map((j) => [j.id, j]));
  let done = 0,
    mine = null;
  const failed = (text) => {
    // a job that throws stops the rest: say so instead of a count that never ends
    if (curveWorker !== mine) return;
    curveWorker = null;
    $("curve-note").textContent = t("dmg.curveFailed", done, jobs.length, text);
  };
  const result = (msg) => {
    if (curveWorker !== mine) return;
    const [, i, pill] = msg.id.split(":"),
      p = curvePoints[Number(i)],
      b = asBuild(msg, byId[msg.id].sc, s);
    if (pill === "1") {
      p.pill = b.out.feasible ? b.out.damage : null;
      p.weapon =
        b.out.feasible && b.gear[0]
          ? `Q${b.gear[0].quality} ${itemName(b.gear[0])} ${b.gear[0].stats.join("/")}`
          : "";
    } else p.noPill = b.out.feasible ? b.out.damage : null;
    done += 1;
    $("curve-note").textContent =
      done < jobs.length
        ? t("dmg.curveProgress", done, jobs.length)
        : t("dmg.curveNote");
    drawCurve();
  };
  mine = curveWorker = runPool(jobs, s, {
    error: failed,
    progress: () => {},
    result,
    done: () => {
      if (curveWorker === mine) curveWorker = null;
    },
  });
  $("curve-note").textContent = t("dmg.curveProgress", 0, jobs.length);
}
const esc = (text) =>
  String(text).replace(
    /[&<>"]/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
      })[c],
  );
function drawCurve() {
  const holder = $("curve-chart"),
    pts = curvePoints.filter(
      (p) => p.pill !== undefined || p.noPill !== undefined,
    );
  const ready = pts.some((p) => p.pill || p.noPill);
  $("curve-legend").hidden = !ready;
  $("curve-table").hidden = !ready;
  if (!ready) {
    holder.replaceChildren();
    $("curve-rows").hidden = true;
    return;
  }
  $("curve-legend").replaceChildren(
    el("span", "key c-ev", "— "),
    t("dmg.curvePill"),
    "   ",
    el("span", "key c-price", "— "),
    t("dmg.curveNoPill"),
  );
  const W = Math.max(holder.clientWidth || 800, 320),
    H = 280,
    M = {
      l: 62,
      r: 16,
      t: 12,
      b: 32,
    };
  const xs = curvePoints.map((p) => p.budget),
    ys = pts.flatMap((p) => [p.pill, p.noPill]).filter((v) => v);
  const top = Math.max(...ys),
    raw = top / 4,
    mag = 10 ** Math.floor(Math.log10(raw));
  const tick = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((v) => v >= raw),
    yMax = Math.ceil(top / tick) * tick;
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs);
  const X = (v) => M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r),
    Y = (v) => H - M.b - (v / yMax) * (H - M.t - M.b);
  const out = [];
  for (let v = 0; v <= yMax + tick / 2; v += tick) {
    out.push(
      `<line class="${v ? "gridline" : "axis"}" x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}"/>`,
      `<text x="${M.l - 6}" y="${Y(v) + 4}" text-anchor="end">${esc(fmt(v))}</text>`,
    );
  }
  let lastLabel = -Infinity;
  for (const b of xs) {
    if (X(b) - lastLabel < 44) continue;
    lastLabel = X(b);
    out.push(
      `<text x="${X(b)}" y="${H - 10}" text-anchor="middle">${esc(fmt(b))}</text>`,
    );
  }
  for (const [key, cls] of [
    ["noPill", "c-price"],
    ["pill", "c-ev"],
  ]) {
    const line = curvePoints.filter((p) => p[key]);
    if (line.length > 1)
      out.push(
        `<polyline class="line ${cls}" points="${line.map((p) => `${X(p.budget).toFixed(1)},${Y(p[key]).toFixed(1)}`).join(" ")}"/>`,
      );
    for (const p of line)
      out.push(
        `<circle class="dot ${cls}" cx="${X(p.budget).toFixed(1)}" cy="${Y(p[key]).toFixed(1)}" r="4"/>`,
      );
  }
  out.push(`<line class="cross" x1="0" x2="0" y1="${M.t}" y2="${H - M.b}"/>`);
  holder.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t("dmg.curveHead"))}">${out.join("")}</svg>`;
  const svg = holder.querySelector("svg"),
    cross = svg.querySelector(".cross");
  svg.addEventListener("pointermove", (event) => {
    const box = svg.getBoundingClientRect(),
      mx = ((event.clientX - box.left) / box.width) * W;
    let near = curvePoints[0];
    for (const p of curvePoints)
      if (Math.abs(X(p.budget) - mx) < Math.abs(X(near.budget) - mx)) near = p;
    cross.setAttribute("x1", X(near.budget));
    cross.setAttribute("x2", X(near.budget));
    cross.classList.add("shown");
    const tip = $("tip"),
      value = (v) => (v ? fmt(v) : v === null ? t("dmg.overShort") : "…");
    tip.replaceChildren(
      el("div", "when", `${t("dmg.curveBudget")}: ${fmt(near.budget)}`),
      el(
        "div",
        "row",
        el("span", "", el("span", "key c-ev", "— "), t("dmg.curvePill")),
        el("strong", "", value(near.pill)),
      ),
      el(
        "div",
        "row",
        el("span", "", el("span", "key c-price", "— "), t("dmg.curveNoPill")),
        el("strong", "", value(near.noPill)),
      ),
      near.weapon ? el("div", "when", near.weapon) : null,
    );
    tip.hidden = false;
    tip.style.left = `${Math.max(8, Math.min(event.clientX + 14, innerWidth - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, Math.min(event.clientY + 14, innerHeight - tip.offsetHeight - 8))}px`;
  });
  svg.addEventListener("pointerleave", () => {
    $("tip").hidden = true;
    cross.classList.remove("shown");
  });
  $("curve").replaceChildren(
    head(
      [t("dmg.curveBudget"), 1],
      [t("dmg.curvePill"), 1],
      [t("dmg.curveNoPill"), 1],
      [t("dmg.weapon")],
    ),
    el(
      "tbody",
      "",
      ...curvePoints.map((p) =>
        el(
          "tr",
          "",
          el("td", "num", fmt(p.budget)),
          el(
            "td",
            "num",
            p.pill ? fmt(p.pill) : p.pill === null ? t("dmg.overShort") : "…",
          ),
          el(
            "td",
            "num",
            p.noPill
              ? fmt(p.noPill)
              : p.noPill === null
                ? t("dmg.overShort")
                : "…",
          ),
          el("td", "muted", p.weapon || ""),
        ),
      ),
    ),
  );
  $("curve-rows").hidden = !curveShowsTable;
}

// ---- sandbox: a build set by hand, worked out at once with the same model ----
const STAT_KEYS = {
  weapon: ["attack", "crit"],
  helmet: ["critDamage"],
  chest: ["armor"],
  pants: ["armor"],
  boots: ["dodge"],
  gloves: ["precision"],
};
const codesFor = (slot) =>
  Object.keys(MARKET.items)
    .filter((c) => MARKET.items[c].slot === slot)
    .sort(
      (a, b) =>
        MARKET.items[a].quality - MARKET.items[b].quality ||
        (a < b ? -1 : a > b ? 1 : 0),
    );
const soldOf = (code) =>
  MARKET.options
    .filter((o) => o.code === code)
    .sort((a, b) =>
      a.stats.length > 1
        ? b.stats[1] - a.stats[1] || b.stats[0] - a.stats[0]
        : b.stats[0] - a.stats[0],
    );
function option(value, text) {
  const node = el("option", "", text);
  node.value = value;
  return node;
}
function numberInput(id, min, max, step, className = "tiny-num") {
  const node = el("input", className);
  node.id = id;
  node.type = "number";
  if (min !== null) node.min = min;
  if (max !== null) node.max = max;
  node.step = step;
  return node;
}
function buildSandbox() {
  const skillRows = GAME_ORDER.map((sk) =>
    el(
      "label",
      "limit",
      el("span", "", skillName(sk)),
      el(
        "span",
        "",
        numberInput(`sb-${sk}`, 0, MAX_SKILL_LEVEL, 1),
        el(
          "span",
          "sb-bonus",
          " + ",
          numberInput(`sbb-${sk}`, 0, MAX_BONUS_LEVELS, 1),
        ),
      ),
    ),
  );
  const gearRows = SLOTS.map((slot) => {
    const code = el(
      "select",
      "",
      option("", t("dmg.sb.nothing")),
      ...codesFor(slot).map((c) => {
        const g = MARKET.items[c];
        return option(
          c,
          `Q${g.quality} ${g.slot === "weapon" ? I18N.item(c) : I18N.item(g.slot)}`,
        );
      }),
    );
    code.id = `sb-code-${slot}`;
    const pick = el("select", "");
    pick.id = `sb-pick-${slot}`;
    const stats = STAT_KEYS[slot].map((key, k) =>
      el(
        "label",
        "stat",
        `${t(`dmg.stat.${key}`)} `,
        numberInput(`sb-s${k}-${slot}`, null, null, 1),
        " ",
        (() => {
          const range = el("span", "muted");
          range.id = `sb-r${k}-${slot}`;
          return range;
        })(),
      ),
    );
    const note = el("td", "muted wrap");
    note.id = `sb-note-${slot}`;
    note.colSpan = 4;
    return [
      el(
        "tr",
        "",
        el("th", "", t(`dmg.slot.${slot}`)),
        el("td", "", code),
        el("td", "", pick),
        el("td", "", ...stats),
        el(
          "td",
          "num",
          numberInput(`sb-price-${slot}`, 0, null, 0.01, "wide-num"),
        ),
      ),
      el("tr", "under", el("td", ""), note),
    ];
  });
  const ammo = el(
    "select",
    "",
    option("", t("dmg.none")),
    ...AMMO.map((a) => option(a, I18N.item(a))),
  );
  ammo.id = "sb-ammo";
  const food = el(
    "select",
    "",
    option("auto", t("dmg.sb.foodAuto")),
    ...FOODS.map((f) => option(f, t("dmg.sb.foodEvery", I18N.item(f)))),
    option("none", t("dmg.none")),
  );
  food.id = "sb-food";
  const points = el("p", "hint");
  points.id = "sb-points";
  const fromBest = el("button", "", t("dmg.sb.fromBest"));
  fromBest.type = "button";
  fromBest.id = "sb-from-best";
  const fromMine = el("button", "", t("dmg.sb.fromMine"));
  fromMine.type = "button";
  fromMine.id = "sb-from-mine";
  const gear = el(
    "table",
    "grid inputs",
    head(
      [t("dmg.slot")],
      [t("dmg.sb.item")],
      [t("dmg.sb.sold")],
      [t("dmg.sb.stats")],
      [t("dmg.sb.yourPrice"), 1],
    ),
    el("tbody", "", ...gearRows.flat()),
  );
  $("sandbox-panel").replaceChildren(
    el("p", "hint", t("dmg.sb.intro")),
    points,
    el("div", "limits", ...skillRows),
    el("div", "scroll", gear),
    el(
      "div",
      "option fields",
      el("label", "", t("dmg.sb.ammo"), " ", ammo),
      el("label", "", t("dmg.sb.food"), " ", food),
    ),
    el("p", "", fromBest, " ", fromMine),
  );
}
function sbSetItem(slot, code, stats = null) {
  $(`sb-code-${slot}`).value = code || "";
  const sold = code ? soldOf(code) : [],
    range = code ? MARKET.items[code].stats : [];
  $(`sb-pick-${slot}`).replaceChildren(
    option(
      "",
      code ? t(sold.length ? "dmg.sb.ownStats" : "dmg.sb.noneSold") : "",
    ),
    ...sold.map((o, i) =>
      option(
        String(i),
        `${o.stats.join("/")} · ${fmt(o.median, 2)} (${o.sales})`,
      ),
    ),
  );
  $(`sb-pick-${slot}`).disabled = !sold.length;
  if (code && !stats)
    stats = sold.length
      ? sold.reduce((a, b) => (b.sales > a.sales ? b : a)).stats
      : range.map(([lo, hi]) => Math.round((lo + hi) / 2));
  STAT_KEYS[slot].forEach((_, k) => {
    const input = $(`sb-s${k}-${slot}`);
    input.disabled = !code;
    input.value = code ? stats[k] : "";
    input.min = code ? range[k][0] : "";
    input.max = code ? range[k][1] : "";
    $(`sb-r${k}-${slot}`).textContent = code
      ? `${range[k][0]}-${range[k][1]}`
      : "";
  });
  $(`sb-price-${slot}`).value = "";
  sbMatchPick(slot);
}
function sbMatchPick(slot) {
  // the sold-stats list shows the typed stats when they were sold
  const code = $(`sb-code-${slot}`).value;
  if (!code) return;
  const stats = STAT_KEYS[slot].map((_, k) =>
    parseFloat($(`sb-s${k}-${slot}`).value),
  );
  const i = soldOf(code).findIndex((o) =>
    o.stats.every((v, k) => v === stats[k]),
  );
  $(`sb-pick-${slot}`).value = i < 0 ? "" : String(i);
}
function sandboxFrom(b) {
  const pl = b ? b.out.x.place : null;
  const levels = b
    ? [...b.skills, ...b.out.x.ecoLevels]
    : ALL_SKILLS.map(nowLevel);
  const bonus = b
    ? [...pl.fightBonus, ...pl.ecoBonus]
    : ALL_SKILLS.map((sk) => PLAYER.bonusNow[sk]);
  ALL_SKILLS.forEach((sk, i) => {
    $(`sb-${sk}`).value = levels[i] - bonus[i];
    $(`sbb-${sk}`).value = bonus[i];
  });
  SLOTS.forEach((slot, i) => {
    const g = b ? b.gear[i] : null;
    sbSetItem(
      slot,
      g && MARKET.items[g.code] ? g.code : null,
      g ? g.stats.slice() : null,
    );
  });
  $("sb-ammo").value = b && b.ammo ? b.ammo : "";
  $("sb-food").value = "auto";
  sbDset = b && b.dset ? b.dset : null;
}
function readSandbox(s) {
  const r = MARKET.rules,
    levels = {},
    bonus = {},
    warnings = [],
    prestige = s.sc.prestige,
    topBonus = bonusLevels(prestige);
  let used = 0,
    prestigeUsed = 0;
  for (const sk of ALL_SKILLS) {
    const open = s.sc.level >= r.unlock[sk];
    let v = Math.round(parseFloat($(`sb-${sk}`).value)),
      w = Math.round(parseFloat($(`sbb-${sk}`).value));
    if (!Number.isFinite(v)) v = 0;
    if (!Number.isFinite(w)) w = 0;
    const kept = open ? clamp(v, 0, MAX_SKILL_LEVEL) : 0,
      keptBonus = open ? clamp(w, 0, topBonus) : 0;
    $(`sb-${sk}`).disabled = !open;
    $(`sbb-${sk}`).disabled = !open;
    $(`sbb-${sk}`).max = topBonus;
    $(`sbb-${sk}`).parentElement.hidden = !prestige;
    $(`sb-${sk}`).classList.toggle("over", kept !== v);
    $(`sbb-${sk}`).classList.toggle(
      "over",
      keptBonus !== w && Boolean(prestige),
    );
    levels[sk] = kept;
    bonus[sk] = keptBonus;
    used += r.costs[sk][kept];
    prestigeUsed += prestigeCost(keptBonus);
  }
  const total = POINTS_PER_LEVEL * s.sc.level;
  $("sb-points").classList.toggle(
    "error",
    used > total || prestigeUsed > prestige,
  );
  $("sb-points").textContent =
    t("dmg.sb.points", fmt(used), fmt(total)) +
    (used > total
      ? t("dmg.sb.over", fmt(used - total))
      : t("dmg.sb.left", fmt(total - used))) +
    (prestige ? t("dmg.sb.prestige", fmt(prestigeUsed), fmt(prestige)) : "");
  const gear = SLOTS.map((slot) => {
    const code = $(`sb-code-${slot}`).value;
    if (!code) {
      $(`sb-note-${slot}`).textContent = "";
      $(`sb-price-${slot}`).placeholder = "";
      return null;
    }
    const info = MARKET.items[code],
      range = info.stats,
      stats = range.map(([lo, hi], k) => {
        const input = $(`sb-s${k}-${slot}`),
          v = Math.round(parseFloat(input.value)),
          kept = Number.isFinite(v) ? clamp(v, lo, hi) : lo;
        input.classList.toggle("over", kept !== v);
        return kept;
      });
    const sold = soldOf(code),
      exact = sold.find((o) => o.stats.every((v, k) => v === stats[k]));
    const own = parseFloat($(`sb-price-${slot}`).value);
    let o, note;
    if (Number.isFinite(own) && own >= 0) {
      o = {
        median: own,
        sales: 0,
        window: "own",
      };
      note = t("dmg.sb.ownPrice");
    } else if (exact) {
      o = exact;
      note = t("dmg.sb.medianOf", exact.sales, exact.window);
    } else if (sold.length) {
      const dist = (x) =>
        x.stats.reduce(
          (n, v, k) =>
            n + Math.abs(v - stats[k]) / (range[k][1] - range[k][0] + 1),
          0,
        );
      o = sold.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      note = t("dmg.sb.nearest", o.stats.join("/"));
    } else {
      o = {
        median: 0,
        sales: 0,
        window: "none",
      };
      note = t("dmg.sb.never");
      warnings.push(
        t(
          "dmg.sb.noPrice",
          itemName({
            slot: info.slot,
            code,
          }),
        ),
      );
    }
    const g = gearOption(
      {
        slot,
        code,
        quality: info.quality,
        stats,
        median: o.median,
        sales: o.sales,
        window: o.window,
      },
      s.P.scraps,
      o.window === "own" ? 0 : s.adjust,
      s.tax,
    );
    $(`sb-price-${slot}`).placeholder = fmt(g.median, 2);
    $(`sb-note-${slot}`).textContent = t("dmg.sb.paid", fmt(g.price, 2), note);
    return g;
  });
  const knife = gear[0] && NO_AMMO.includes(gear[0].code);
  $("sb-ammo").disabled = !gear[0] || knife;
  const ammo = gear[0] && !knife ? $("sb-ammo").value || null : null;
  const food = $("sb-food").value,
    j = FOODS.indexOf(food);
  const planner =
    food === "auto"
      ? (g, c, slots, room, one) =>
          planFood(g, c, slots, room, one) || [0, 0, 0] // no food fits: none
      : (g, c, slots) => FOODS.map((f, i) => (i === j ? slots : 0));
  // every slot, or none
  return {
    levels,
    bonus,
    used,
    total,
    prestigeUsed,
    prestige,
    gear,
    ammo,
    food,
    planner,
    warnings,
  };
}
function computeSandbox() {
  const s0 = readScenario();
  const sb = readSandbox(s0);
  if (sb.used > sb.total) {
    status(t("dmg.sb.tooMany", fmt(sb.used), s0.sc.level, fmt(sb.total)), true);
    return;
  }
  if (sb.prestigeUsed > sb.prestige) {
    status(
      t("dmg.sb.tooManyPrestige", fmt(sb.prestigeUsed), fmt(sb.prestige)),
      true,
    );
    return;
  }
  const wealth = numberOr("budget", 0);
  const sc = {
    ...s0.sc,
    budget: wealth + s0.income,
    bounds: Object.fromEntries(
      ALL_SKILLS.map((sk) => [sk, [sb.levels[sk], sb.levels[sk]]]),
    ),
    fixedBonus: sb.bonus,
    foodsOff: sb.food === "auto" ? s0.sc.foodsOff : [],
    burstOnly: false,
    fullPrecision: false,
  };
  const s = {
    ...s0,
    sc,
    wealth,
    goal: "damage",
    burst: false,
    keep: false,
    freeze: false,
    keepFailed: false,
    sandbox: true,
  };
  const make = (scx) => {
    const ctx = makeCtx(scx, s.P),
      b = {
        skills: SKILLS.map((sk) => sb.levels[sk] + sb.bonus[sk]),
        gear: sb.gear,
        ammo: sb.ammo,
        dset: null,
        ctx,
        wealth,
      };
    b.out = evaluate(ctx, b, sb.planner);
    if (sbDset && ctx.debuff) {
      // the debuff's own set from the build the sandbox started from, when it gives a better day
      const own = {
        ...b,
        dset: sbDset,
      };
      own.out = evaluate(ctx, own, sb.planner);
      const key = (q) =>
        q.feasible ? [1, q.parts.objective, -q.net] : [0, -q.overspend, 0];
      if (keyGt(key(own.out), key(b.out))) return own;
    }
    return b;
  };
  LAST = {
    s,
    best: make(sc),
    noPill: make({
      ...sc,
      pill: false,
    }),
    yours: null,
  };
  render();
  const o = LAST.best.out,
    room = LAST.best.ctx.budget + o.x.eco,
    bits = [...sb.warnings];
  if (o.net > room + 1e-6)
    bits.push(t("dmg.sb.over2", fmt(o.net, 1), fmt(o.net - room, 1)));
  status(
    bits.length ? bits.join(" ") : t("dmg.sb.ok", fmt(sb.used), fmt(sb.total)),
    bits.length > 0,
  );
}
function showSandbox(on) {
  $("sandbox-panel").hidden = !on;
  if (!on && lastBest && LAST && LAST.s.sandbox) {
    LAST = {
      s: readScenario(),
      best: lastBest,
      noPill: sandboxNoPill,
      yours: sandboxYours,
      noDonation: sandboxNoDonation,
    };
    render();
  }
}
let sandboxNoPill = null,
  sandboxYours = null,
  sandboxNoDonation = null,
  sandboxTimer = null,
  sbDset = null;
function sandboxChanged() {
  clearTimeout(sandboxTimer);
  sandboxTimer = setTimeout(computeSandbox, 60);
}

// ---- the form ----
function checkPick(id, text, className = "") {
  const box = el("input");
  box.type = "checkbox";
  box.id = id;
  return el("label", "check", box, " ", el("span", className, text));
}
function buildFoods() {
  const kept = FOODS.map((f) =>
    $(`food-${f}`) ? $(`food-${f}`).checked : true,
  );
  $("foods").replaceChildren(
    ...FOODS.map((f) => checkPick(`food-${f}`, I18N.item(f))),
  );
  FOODS.forEach((f, i) => {
    $(`food-${f}`).checked = kept[i];
  });
}
function buildQualities() {
  if ($("q1")) return;
  $("qualities").replaceChildren(
    ...[1, 2, 3, 4, 5, 6].map((q) =>
      checkPick(`q${q}`, `Q${q}`, `r-${RARITIES[q - 1]}`),
    ),
  );
  for (const q of [3, 4, 5]) $(`q${q}`).checked = true;
}
function buildLimits() {
  const saved = Object.fromEntries(
    ALL_SKILLS.flatMap((s) => [
      [`lo-${s}`, ($(`lo-${s}`) || {}).value || ""],
      [`hi-${s}`, ($(`hi-${s}`) || {}).value || ""],
    ]),
  );
  $("limits").replaceChildren(
    ...GAME_ORDER.map((s) => {
      const lo = numberInput(`lo-${s}`, 0, MAX_SKILL_LEVEL, 1),
        hi = numberInput(`hi-${s}`, 0, MAX_SKILL_LEVEL, 1);
      lo.title = t("dmg.min");
      hi.title = t("dmg.max");
      lo.setAttribute("aria-label", `${skillName(s)} ${t("dmg.min")}`);
      hi.setAttribute("aria-label", `${skillName(s)} ${t("dmg.max")}`);
      return el(
        "div",
        "limit",
        el("span", "", skillName(s)),
        el("span", "", lo, " - ", hi),
      );
    }),
  );
  for (const [id, value] of Object.entries(saved)) $(id).value = value;
}
function buildPrices() {
  const saved = Object.fromEntries(
    PRICE_KEYS.map((k) => [k, ($(`p-${k}`) || {}).value || ""]),
  );
  $("prices").replaceChildren(
    ...PRICE_KEYS.map((k) => {
      const input = numberInput(`p-${k}`, 0, null, 0.001);
      input.value = saved[k];
      if (MARKET)
        input.placeholder = fmt(
          MARKET.prices[k],
          k === "lightAmmo" || k === "scraps" ? 3 : 2,
        );
      const label = el("label", "limit", el("span", "", I18N.item(k)), input);
      return label;
    }),
  );
}
// The pool loot table's coins and items a day (quality 1..6, poolInfo.mix: the server's file after 2026-11-16) at a damage.
function poolAt(damage) {
  const table = MARKET.pool || [],
    mix = (MARKET.poolInfo || {}).mix || [];
  let lo = 0,
    hi = table.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (damage < table[mid][0]) hi = mid;
    else lo = mid + 1;
  }
  return lo
    ? {
        coins: table[lo - 1][1],
        mix: mix[lo - 1] || null,
      }
    : {
        coins: 0,
        mix: null,
      };
}
function poolItems(mix) {
  // "2.8 × Epic, 2.0 × Rare, ..." in the rarities' colours, best first
  const parts = (mix || [])
    .map((n, q) => [n, q])
    .filter(([n]) => n >= 0.05)
    .reverse();
  if (!parts.length) return [t("dmg.poolNoItems")];
  return parts.flatMap(([n, q], i) => [
    ...(i ? [", "] : []),
    `${fmt(n, 1)} × `,
    tinted(I18N.name(`rarity.${RARITIES[q]}`), RARITIES[q]),
  ]);
}
// the line under "your income" about pool loot: where the number comes from, at the build on screen
function poolHint() {
  const node = $("pool-hint"),
    typed = numberOr("inc-pool-coins", null);
  $("inc-pool-coins").placeholder = t("dmg.auto");
  if (!$("pool").checked) return node.replaceChildren(t("dmg.poolOff"));
  const o = LAST && LAST.best && LAST.best.out;
  if (!MARKET || !o || !o.feasible)
    return node.replaceChildren(
      typed === null
        ? t("dmg.poolHint")
        : t("dmg.poolTyped", fmt(typed, 1)) + ".",
    );
  const at = poolAt(o.damage);
  const items = at.mix
    ? [t("dmg.poolAbout"), ...poolItems(at.mix), t("dmg.poolADay")]
    : [];
  // no items in an older data file
  if (typed !== null)
    return node.replaceChildren(
      t("dmg.poolTyped", fmt(typed, 1)),
      t("dmg.poolTable", fmt(at.coins, 1)),
      ...items,
      ".",
    );
  $("inc-pool-coins").placeholder = fmt(at.coins, 1);
  node.replaceChildren(
    t("dmg.poolAt", fmt(o.damage), fmt(at.coins, 1)),
    ...items,
    t("dmg.poolAtEnd"),
  );
}
// the MU league's division and place choices; the places show the pot of the division chosen (the unit's: the game's own)
function buildMu() {
  const divisionWas = $("mu-division").value,
    own = PLAYER ? PLAYER.mu.division : null;
  const ownText = !PLAYER
    ? t("dmg.auto")
    : t(
        "dmg.muDivisionNow",
        own === null
          ? t("dmg.muNotIn")
          : `${t("dmg.div", own)} (x${fmt(muMultiplier(own), 2)})`,
      );
  $("mu-division").replaceChildren(
    option("", ownText),
    ...Array.from(
      {
        length: MU_DIVISIONS,
      },
      (_, k) =>
        option(String(k), `${t("dmg.div", k)} (x${fmt(muMultiplier(k), 2)})`),
    ),
  );
  $("mu-division").value = divisionWas;
  const placeWas = $("mu-place").value,
    division = muDivisionOf(PLAYER),
    mu = PLAYER ? PLAYER.mu : null;
  const pot = (place) =>
    division === null ? "-" : muPotText(place, division, mu);
  $("mu-place").replaceChildren(
    option("", t("dmg.leagueDefault", MU_DEFAULT_PLACE, pot(MU_DEFAULT_PLACE))),
    ...MU_LEAGUE_PRIZES.map((_, i) =>
      option(String(i + 1), t("dmg.leaguePlaceN", i + 1, pot(i + 1))),
    ),
    option("0", t("dmg.leagueNone")),
  );
  $("mu-place").value = placeWas;
}
function buildTiers() {
  buildMu();
  const leagueWas = $("league-place").value;
  $("league-place").replaceChildren(
    option(
      "",
      t(
        "dmg.leagueDefault",
        LEAGUE_DEFAULT_PLACE,
        leaguePrizeText(LEAGUE_DEFAULT_PLACE),
      ),
    ),
    ...Object.keys(LEAGUE_PRIZES).map((p) =>
      option(p, t("dmg.leaguePlaceN", p, leaguePrizeText(p))),
    ),
    option("0", t("dmg.leagueNone")),
  );
  $("league-place").value = leagueWas;
  const engine = $("engine").value;
  $("engine").replaceChildren(
    option("0", t("dmg.engineOwn")),
    ...[1, 2, 3, 4, 5, 6, 7].map((n) =>
      option(String(n), t("dmg.engineAt", n)),
    ),
  );
  $("engine").value = engine || "0";
  const slot = $("list-slot").value;
  $("list-slot").replaceChildren(
    option("", t("dmg.allSlots")),
    ...SLOTS.map((s) => option(s, t(`dmg.slot.${s}`))),
  );
  $("list-slot").value = slot;
}
function fillFromMarket() {
  buildPrices();
  poolHint();
  $("inc-missions-coins").placeholder = fmt(MARKET.missions[0], 2);
  $("inc-missions-cases").placeholder = fmt(MARKET.missions[1], 2);
  $("inc-daily-coins").placeholder = fmt(MARKET.dailyReward[0], 2);
  $("inc-daily-cases").placeholder = fmt(MARKET.dailyReward[1], 2);
  const hint = $("manager-pay").parentElement.querySelector(".hint-inline");
  hint.textContent = MARKET.managerPayNow
    ? t("dmg.managerNow", fmt(MARKET.managerPayNow, 2))
    : t("dmg.managerHint");
}
function fillFromPlayer() {
  $("level").placeholder = String(PLAYER.level);
  $("prestige").placeholder = String(PLAYER.prestige);
  $("rank").placeholder = fmt(PLAYER.rank * 100, 2);
  for (const [r, level] of Object.entries(
    strategicLevels(PLAYER.strategic || {}),
  ))
    $(`st-${r}`).placeholder = String(level);
  $("self-value").placeholder = fmt(PLAYER.selfValue, 3);
  const employees = $("employees").checked && PLAYER.employeesRead;
  $("self-clicks-hint").textContent = t(
    "dmg.selfClicksNow",
    employees ? PLAYER.companies.reduce((n, c) => n + c.draws, 0) : 0,
  );
  // what the employees make a day now (the companies the companies skill keeps on today), shown in their empty income row
  const count = skillValue(
    MARKET.rules.values.companies,
    nowLevel("companies"),
  );
  $("inc-employees-coins").placeholder = employees
    ? fmt(
        companyTables(
          PLAYER.companies,
          [count],
          (c) => MARKET.engines[c.level][0],
          true,
        ).employees[0],
        1,
      )
    : "0";
  buildMu();
  $("mu-share").placeholder = fmt(muShareDefault(PLAYER), 1);
  $("mu-share-hint").textContent = PLAYER.mu.members
    ? t(
        "dmg.muShareNow",
        PLAYER.mu.members,
        PLAYER.mu.shareNow === null ? null : fmt(PLAYER.mu.shareNow * 100, 1),
      )
    : t("dmg.muShareHint");
  $("league-bonus").placeholder = fmt(
    (PLAYER.leagueMultiplier
      ? PLAYER.leagueMultiplier - 1
      : leagueBonus(
          PLAYER.level + LEVELS_PER_PRESTIGE * PLAYER.prestigeLevel,
        )) * 100,
    0,
  );
  for (const s of GAME_ORDER) {
    const asNow = s === "companies" && $("keep-companies").checked;
    $(`lo-${s}`).placeholder = asNow ? String(PLAYER.levelsNow[s]) : "0";
    $(`hi-${s}`).placeholder = asNow
      ? String(PLAYER.levelsNow[s])
      : $("no-eco").checked && NO_ECO_SKILLS.includes(s)
        ? "0"
        : "10";
  }
}
function syncGoal() {
  const goal = $("goal").value;
  $("budget-row").hidden = goal !== "damage";
  $("target-row").hidden = goal !== "target";
  $("burst").disabled = goal === "profit";
  $("skills-mode").disabled = $("keep-build").checked;
  // keeping the build overrides the skills fold's choice
  for (const r of Object.keys(STRATEGIC))
    $(`st-${r}`).disabled = $("no-strategic").checked;
  // the tick overrides the fold's levels
  $("donation").disabled = !$("donate").checked;
}
function resetFields() {
  for (const node of $("inputs").querySelectorAll("input[type=number]")) {
    node.value =
      {
        budget: "0",
        target: "500000",
        bonus: String(DEFAULT_BONUS),
        donation: "50",
        bounty: "0",
        "manager-pay": "0",
        adjust: "0",
      }[node.id] ?? "";
  }
  for (const [id, on] of Object.entries({
    donate: true,
    pill: true,
    help: true,
    debuff: true,
    pool: true,
    employees: true,
    "keep-companies": false,
    "no-eco": true,
    "full-precision": false,
    "one-food": false,
    burst: false,
    "keep-build": false,
    "no-strategic": false,
  }))
    $(id).checked = on;
  FOODS.forEach((f) => {
    $(`food-${f}`).checked = true;
  });
  [1, 2, 3, 4, 5, 6].forEach((q) => {
    $(`q${q}`).checked = [3, 4, 5].includes(q);
  });
  for (const id of [
    "goal",
    "skills-mode",
    "mu-division",
    "mu-place",
    "league-place",
    "engine",
  ])
    $(id).selectedIndex = 0;
  syncGoal();
  if (PLAYER) fillFromPlayer();
}

function start() {
  tokenBox();
  buildFoods();
  buildQualities();
  buildLimits();
  buildPrices();
  buildTiers();
  syncGoal();
  fetch(new URL("../data/game_names.json", location.href), {
    cache: "no-store",
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((names) => {
      if (names) {
        I18N.setNames(names);
        redraw();
      }
    })
    .catch(() => {});
  $("run-form").addEventListener("submit", (event) => {
    event.preventDefault();
    run();
  });
  $("goal").addEventListener("change", syncGoal);
  for (const id of ["keep-build", "no-strategic", "donate"])
    $(id).addEventListener("change", syncGoal);
  for (const id of ["keep-companies", "no-eco"])
    $(id).addEventListener("change", () => {
      if (PLAYER) fillFromPlayer();
    });
  $("reset").addEventListener("click", resetFields);
  $("sandbox").addEventListener("change", () => {
    const on = $("sandbox").checked;
    if (on) {
      sandboxBase = lastBest;
      sandboxNoPill = LAST ? LAST.noPill : null;
      sandboxYours = LAST ? LAST.yours : null;
      sandboxNoDonation =
        LAST && LAST.noDonation !== undefined ? LAST.noDonation : null;
      buildSandbox();
      sandboxFrom(lastBest);
      $("sandbox-panel").hidden = false;
      computeSandbox();
    } else showSandbox(false);
  });
  $("sandbox-panel").addEventListener("input", (event) => {
    const id = event.target.id || "";
    for (const slot of SLOTS) {
      if (id === `sb-code-${slot}`) sbSetItem(slot, event.target.value || null);
      else if (id === `sb-pick-${slot}` && event.target.value !== "")
        sbSetItem(
          slot,
          $(`sb-code-${slot}`).value,
          soldOf($(`sb-code-${slot}`).value)[
            Number(event.target.value)
          ].stats.slice(),
        );
      else if (id.startsWith("sb-s") && id.endsWith(`-${slot}`))
        sbMatchPick(slot);
    }
    sandboxChanged();
  });
  $("sandbox-panel").addEventListener("click", (event) => {
    if (event.target.id === "sb-from-best" && sandboxBase) {
      sandboxFrom(sandboxBase);
      computeSandbox();
    }
    if (event.target.id === "sb-from-mine") {
      sandboxFrom(null);
      computeSandbox();
    }
  });
  $("inputs").addEventListener("input", () => {
    if ($("sandbox").checked) sandboxChanged();
  });
  $("curve-run").addEventListener("click", startCurve);
  $("curve-table").addEventListener("click", () => {
    curveShowsTable = !curveShowsTable;
    $("curve-table").textContent = t(
      curveShowsTable ? "dmg.curveChart" : "dmg.curveTable",
    );
    $("curve-rows").hidden = !curveShowsTable;
  });
  $("prices-list").addEventListener("toggle", () => {
    if ($("prices-list").open && LAST) renderList();
  });
  $("list-slot").addEventListener("change", () => {
    if (LAST) renderList();
  });
  $("mu-division").addEventListener("change", buildMu);
  $("inc-pool-coins").addEventListener("input", poolHint);
  $("pool").addEventListener("change", poolHint);
  $("curve-fold").addEventListener("toggle", drawCurve);
  addEventListener("resize", () => {
    if ($("curve-fold").open) drawCurve();
  });
  applySimple();
  I18N.onChange(redraw);
}
// every text drawn by this script again, in the language now; the fields keep their values
function redraw() {
  buildFoods();
  buildLimits();
  buildPrices();
  buildTiers();
  if (MARKET) fillFromMarket();
  if (PLAYER) fillFromPlayer();
  if ($("sandbox").checked && LAST) {
    const fields = [...$("sandbox-panel").querySelectorAll("input, select")]
      .filter((n) => n.id)
      .map((n) => [n.id, n.value]);
    const items = SLOTS.map((slot) => [slot, $(`sb-code-${slot}`).value]);
    buildSandbox();
    for (const [slot, code] of items) sbSetItem(slot, code || null);
    for (const [id, value] of fields) $(id).value = value;
    computeSandbox();
  } else render();
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", start);
else start();
