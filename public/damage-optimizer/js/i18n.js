// The site's two languages (user, 2026-10-31: English and Polish, every page). The language: ?lang= in the address,
// else the visitor's choice (the [ EN | PL ] switch in the top bar, remembered in this browser), else the browser's
// own language. Texts are keys: static ones in the HTML (data-i18n, data-i18n-placeholder, data-i18n-title), the rest
// through t(key, ...values) in the page scripts; each page adds its own with I18N.add({en: {...}, pl: {...}}). The
// game's own names (traits, training cards, items, rarities, stats) come from data/game_names.json, written on the
// server from the community translations (warera/site_data.py); without it they're spelled from their codes. Loaded
// in the crews engine's Web Worker too (no DOM there: setLanguage / setNames). Text goes in with textContent only.
"use strict";

const I18N = (() => {
  const LANGS = ["en", "pl", "tr"];
  const KEY = "warera_lang";
  const hasDom = typeof document !== "undefined";
  const dict = { en: {}, pl: {}, tr: {} };
  let names = { en: {}, pl: {}, tr: {} };
  const listeners = [];

  function chosen() {
    if (!hasDom) return "en";
    const asked = new URLSearchParams(location.search).get("lang");
    if (LANGS.includes(asked)) return asked;
    try {
      const saved = localStorage.getItem(KEY);
      if (LANGS.includes(saved)) return saved;
    } catch {
      // no storage: the browser's language
    }
    const browserLanguage = (navigator.language || "").toLowerCase();
    return browserLanguage.startsWith("tr") ? "tr" : browserLanguage.startsWith("pl") ? "pl" : "en";
  }
  let lang = chosen();

  function add(more) {
    for (const l of LANGS) Object.assign(dict[l], more[l] || {});
    if (hasDom) apply(); // a page adds its texts after this file ran: its static ones in place now
  }

  // a text by key, in the language now (English when the language lacks it; the key itself when nobody has it)
  function t(key, ...values) {
    const text = key in dict[lang] ? dict[lang][key] : dict.en[key];
    if (text === undefined) return key;
    return typeof text === "function" ? text(...values) : text;
  }

  const locale = () => (lang === "pl" ? "pl-PL" : lang === "tr" ? "tr-TR" : "en");
  const num = (x, digits = 2) =>
    x.toLocaleString(locale(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  // with its sign; one that rounds to zero shows as +0
  const signed = (x, digits = 2) =>
    (x < 0 && Math.abs(x) >= 0.5 * 10 ** -digits ? "-" : "+") +
    num(Math.abs(x), digits);
  // a word for n: English one / other (the last given); Polish one (1), few (2-4, 22-24…), many (5-21, 25…) and the
  // form a fraction takes ("2,5 dnia"; few when not given)
  function plural(n, one, few, many, fraction) {
    if (lang !== "pl") return n === 1 ? one : (many ?? few);
    if (!Number.isInteger(n)) return fraction ?? few;
    const form = new Intl.PluralRules("pl-PL").select(n);
    return form === "one" ? one : form === "few" ? few : many;
  }

  // the game's names: "trait.<code>", "item.<code>", "card.<kind>", "rarity.<r>", "stat.<s>"
  const spelled = (code) => {
    const words = String(code)
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase();
    return words.charAt(0).toUpperCase() + words.slice(1);
  };
  function name(key) {
    const found =
      (names[lang] || {})[key] ??
      names.en[key] ??
      dict[lang][`name.${key}`] ??
      dict.en[`name.${key}`];
    return found ?? spelled(key.split(".").slice(1).join("."));
  }
  const trait = (code) => name(`trait.${code}`);
  const item = (code) => name(`item.${code}`);

  function setNames(data) {
    if (data && data.names) names = { en: {}, pl: {}, tr: {}, ...data.names };
  }

  function setLanguage(next) {
    if (!LANGS.includes(next)) return;
    lang = next;
    if (!hasDom) return;
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // not remembered: still switched on this page
    }
    apply();
    for (const fn of listeners) fn(lang);
  }

  // every static text of the page in the language now
  function apply(root = hasDom ? document : null) {
    if (!root) return;
    document.documentElement.lang = lang;
    // a key nobody has (yet) leaves the text as the HTML has it
    const known = (key) => key in dict[lang] || key in dict.en;
    for (const node of root.querySelectorAll("[data-i18n]"))
      if (known(node.dataset.i18n)) node.textContent = t(node.dataset.i18n);
    for (const node of root.querySelectorAll("[data-i18n-placeholder]")) {
      if (known(node.dataset.i18nPlaceholder))
        node.placeholder = t(node.dataset.i18nPlaceholder);
    }
    for (const node of root.querySelectorAll("[data-i18n-title]"))
      if (known(node.dataset.i18nTitle)) node.title = t(node.dataset.i18nTitle);
    for (const node of root.querySelectorAll("[data-i18n-content]")) {
      if (known(node.dataset.i18nContent))
        node.setAttribute("content", t(node.dataset.i18nContent));
    }
    for (const node of root.querySelectorAll(".langs button")) {
      node.disabled = node.dataset.lang === lang;
      node.className = node.dataset.lang === lang ? "on" : "";
    }
  }

  // the [ EN | PL ] switch, at the end of the page's top bar
  function switcher() {
    const bar = document.querySelector(".bar");
    if (!bar || bar.querySelector(".langs")) return;
    const box = document.createElement("span");
    box.className = "langs";
    LANGS.forEach((l, i) => {
      if (i) box.append(" ");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.lang = l;
      button.textContent = `[ ${l.toUpperCase()} ]`;
      button.title = l === "pl" ? "polski" : l === "tr" ? "Türkçe" : "English";
      button.addEventListener("click", () => setLanguage(l));
      box.append(button);
    });
    bar.append(box);
  }

  // the game's names, from the site's data folder (at the root on the live site and beta, so any page depth finds it:
  // the private pages two folders deep looked in /private/data/ until 2026-11-06); the page re-renders when they arrive
  async function loadNames() {
    try {
      const response = await fetch(
        new URL("/data/game_names.json", location.href),
        { cache: "no-store" },
      );
      if (response.ok) {
        setNames(await response.json());
        for (const fn of listeners) fn(lang);
      }
    } catch {
      // without them the names are spelled from their codes
    }
  }

  const onChange = (fn) => listeners.push(fn);

  // texts every page and the crews engine share
  add({
    en: {
      "name.rarity.mythic": "Mythic",
      "common.unofficial":
        "-- unofficial fan site, not affiliated with WarEra.",
      "common.operator": "operator:",
      "common.allTools": "[ < all tools ]",
      "common.siteName": "warera analysis tools",
      "tool.tokenStatus":
        "The optional API token stays in this browser and is forwarded through this site's server proxy.",
      "tool.player": "player:",
      "tool.playerPlaceholder": "username or user ID",
      "tool.period": "period:",
      "tool.days": "days",
      "tool.howHead": "how it's worked out",
      "tool.readOnlyNote":
        "read-only: WarEra requests pass through this site's server proxy; its API keys remain server-side.",
      "access.title": "Access check",
      "access.heading": "ACCESS GRANTED",
      "access.text":
        "you are logged in: this page is under /private/, which only logged-in browsers can open",
      "access.back": "back to the main page",
      "token.label": "api token:",
      "token.placeholder": "paste your token",
      "token.remember": "remember",
      "token.forget": "[ forget ]",
      "token.remembered":
        "token set: remembered in this browser (forwarded through this site's proxy)",
      "token.thisTab":
        "token set: kept until this tab is closed (forwarded through this site's proxy)",
      "token.needed":
        "this tool needs your API token: paste it in the box above",
      "api.needsToken":
        "the API wants an API token for this (paste yours above)",
      "api.refused":
        "the API refused the token (check it in WarEra → Settings → API Tokens)",
      "relay.notPolish":
        "without an API token this site reads employees only for citizens of Poland: paste your token in the box above",
      "relay.busy":
        "this site's token is busy right now: try again in a minute, or paste your own token in the box above",
      "api.failed": (procedure, detail) => `${procedure} failed: ${detail}`,
      "api.noAnswer": (tries, last) =>
        `no answer after ${tries} tries (${last})`,
      "api.noId": (id) => `no player with the ID ${id}`,
      "api.notFound": (name) => `player "${name}" not found`,
      "data.noValues":
        "the item values aren't available on this site right now: try again later",
      "data.lookup": "looking up the player",
      "data.companies": (name) => `reading ${name}'s companies`,
      "data.employees": (n) => `reading the employees of ${n} companies`,
      "data.taxes": "reading every country's income tax",
      "tool.hammer": "Hammer",
      "tool.pickaxe": "Pickaxe",
      "tool.skillet": "Skillet",
      "tool.sickle": "Sickle",
      "tool.caliper": "Caliper",
      "tool.flask": "Flask",
      "data.toolboxes": "reading the toolboxes opened",
      "data.dismantles": (k) => `reading what was dismantled: page ${k}`,
      "run.toolRound": (r) => `trying the tools, round ${r}`,
      // the crews engine's progress and its card texts (crews.js)
      "run.seatTraining": "valuing a free seat: training the candidates",
      "run.seat": (k, n) =>
        `valuing a free seat: ${k} of ${n} companies and goods`,
      "run.simulating": (k, n) =>
        `simulating crews: ${num(k, 0)} of ${num(n, 0)}`,
      "run.split": (c, n) => `trying every split: company ${c} of ${n}`,
      "run.splitHires": (h, c, n) =>
        `trying every split with ${h} new hire${h === 1 ? "" : "s"}: company ${c} of ${n}`,
      "run.capSwitch":
        "too many companies on one good: switching some and improving",
      "run.capRound": (r, gap) =>
        `pricing the goods over the cap: round ${r} (at most ${gap} from the best)`,
      "run.local": (label, s, n, best) =>
        `local search${label}: start ${s} of ${n} (best so far ${best})`,
      "run.localHires": (h) => ` with ${h} new hire${h === 1 ? "" : "s"}`,
      "run.polish": (label) =>
        `local search${label}: polishing the managers' places and the goods`,
      "run.close": "checking the close calls",
      "run.guide": "writing the keep rule in Potential and traits",
      "run.order": "ordering the moves",
      "card.drill": (size, stat) =>
        `${size > 1 ? "intensive drill" : "drill"} +${size} ${stat}`,
      "card.negotiation": (pct) => `negotiation -${pct}% wage expectation`,
      "card.rehab": (trait) => `rehab: remove ${trait}`,
      "card.habit": (trait) => `new habit: ${trait}`,
      "card.habits": "two new habits",
      "card.wildCard": "wild card (a random trait, +2 to a random stat)",
      "card.morale": (size) =>
        `${size > 1 ? "big morale boost" : "morale boost"} +${3 * size} happiness`,
      "card.reroll": "reroll (a new hand, its rarity rolled again, free)",
      "card.cleanSlate": (traits) => `clean slate (removes ${traits})`,
      "card.secondWind": (size) => `second wind +${size} potential`,
      "stat.production": "production",
      "stat.luck": "luck",
      "stat.responsibility": "lasting happiness",
    },
    pl: {
      "name.rarity.mythic": "Mityczny",
      "common.unofficial":
        "-- nieoficjalna strona fanowska, niezwiązana z WarEra.",
      "common.operator": "operator:",
      "common.allTools": "[ < wszystkie narzędzia ]",
      "common.siteName": "narzędzia analityczne warera",
      "tool.tokenStatus":
        "Opcjonalny token API pozostaje w tej przeglądarce i jest przekazywany przez serwerowe proxy aplikacji.",
      "tool.player": "gracz:",
      "tool.playerPlaceholder": "nazwa gracza lub ID",
      "tool.period": "okres:",
      "tool.days": "dni",
      "tool.howHead": "jak to jest liczone",
      "tool.readOnlyNote":
        "tylko odczyt: żądania WarEra przechodzą przez proxy aplikacji; klucze API pozostają po stronie serwera.",
      "access.title": "Sprawdzenie dostępu",
      "access.heading": "DOSTĘP PRZYZNANY",
      "access.text":
        "jesteś zalogowany: ta strona jest w /private/, którą mogą otworzyć tylko zalogowane przeglądarki",
      "access.back": "wróć do strony głównej",
      "token.label": "token api:",
      "token.placeholder": "wklej swój token",
      "token.remember": "zapamiętaj",
      "token.forget": "[ zapomnij ]",
      "token.remembered":
        "token ustawiony: zapamiętany w tej przeglądarce (przekazywany przez proxy aplikacji)",
      "token.thisTab":
        "token ustawiony: do zamknięcia tej karty (przekazywany przez proxy aplikacji)",
      "token.needed":
        "to narzędzie potrzebuje twojego tokenu API: wklej go w polu powyżej",
      "api.needsToken": "API wymaga do tego tokenu API (wklej swój powyżej)",
      "api.refused":
        "API odrzuciło token (sprawdź go w WarEra → Ustawienia → Tokeny API)",
      "relay.notPolish":
        "bez tokenu API ta strona czyta pracowników tylko obywateli Polski: wklej swój token w polu powyżej",
      "relay.busy":
        "token tej strony jest teraz zajęty: spróbuj za minutę albo wklej swój token w polu powyżej",
      "api.failed": (procedure, detail) =>
        `${procedure} nie powiodło się: ${detail}`,
      "api.noAnswer": (tries, last) =>
        `brak odpowiedzi po ${tries} próbach (${last})`,
      "api.noId": (id) => `brak gracza o ID ${id}`,
      "api.notFound": (name) => `nie znaleziono gracza "${name}"`,
      "data.noValues":
        "wartości przedmiotów nie są teraz dostępne na tej stronie: spróbuj później",
      "data.lookup": "szukam gracza",
      "data.companies": (name) => `czytam firmy gracza ${name}`,
      "data.employees": (n) =>
        `czytam pracowników ${n} ${plural(n, "firmy", "firm", "firm")}`,
      "data.taxes": "czytam podatek dochodowy każdego kraju",
      "tool.hammer": "Młotek",
      "tool.pickaxe": "Kilof",
      "tool.skillet": "Patelnia",
      "tool.sickle": "Sierp",
      "tool.caliper": "Suwmiarka",
      "tool.flask": "Kolba",
      "data.toolboxes": "czytam otwarte skrzynki z narzędziami",
      "data.dismantles": (k) => `czytam rozebrane przedmioty: strona ${k}`,
      "run.seatTraining": "wyceniam wolne miejsce: szkolenia kandydatów",
      "run.seat": (k, n) =>
        `wyceniam wolne miejsce: ${k} z ${n} (firmy i towary)`,
      "run.simulating": (k, n) =>
        `symuluję załogi: ${num(k, 0)} z ${num(n, 0)}`,
      "run.toolRound": (r) => `sprawdzam narzędzia, runda ${r}`,
      "run.split": (c, n) => `sprawdzam każdy podział: firma ${c} z ${n}`,
      "run.splitHires": (h, c, n) =>
        `sprawdzam każdy podział przy ${h} ${plural(h, "nowym pracowniku", "nowych pracownikach", "nowych pracownikach")}: firma ${c} z ${n}`,
      "run.capSwitch":
        "za dużo firm na jednym towarze: zmieniam część i poprawiam",
      "run.capRound": (r, gap) =>
        `wyceniam towary ponad limit: runda ${r} (najwyżej ${gap} od najlepszego)`,
      "run.local": (label, s, n, best) =>
        `szukanie lokalne${label}: start ${s} z ${n} (najlepszy dotąd ${best})`,
      "run.localHires": (h) =>
        ` przy ${h} ${plural(h, "nowym pracowniku", "nowych pracownikach", "nowych pracownikach")}`,
      "run.polish": (label) =>
        `szukanie lokalne${label}: dopracowuję miejsca menedżerów i towary`,
      "run.close": "sprawdzam przypadki graniczne",
      "run.guide": "zapisuję zasadę zatrzymania w potencjale i cechach",
      "run.order": "układam kolejność przeniesień",
      "card.drill": (size, stat) =>
        `${size > 1 ? name("card.intensiveDrill") : name("card.drill")} +${size} ${stat}`,
      "card.negotiation": (pct) =>
        `${name("card.negotiation")} -${pct}% oczekiwanej stawki`,
      "card.rehab": (trait) => `${name("card.rehab")}: usuwa ${trait}`,
      "card.habit": (trait) => `${name("card.habit")}: ${trait}`,
      "card.habits": () => name("card.habits"),
      "card.wildCard": () =>
        `${name("card.wildCard")} (losowa cecha, +2 do losowej statystyki)`,
      "card.morale": (size) =>
        `${size > 1 ? name("card.bigMoraleBoost") : name("card.moraleBoost")} +${3 * size} zadowolenia`,
      "card.reroll": () =>
        `${name("card.reroll")} (nowe karty, rzadkość losowana od nowa, za darmo)`,
      "card.cleanSlate": (traits) =>
        `${name("card.cleanSlate")} (usuwa: ${traits})`,
      "card.secondWind": (size) =>
        `${name("card.secondWind")} +${size} potencjału`,
      "stat.production": "produkcja",
      "stat.luck": "szczęście",
      "stat.responsibility": "trwałe zadowolenie",
    },
  });

  if (hasDom) {
    switcher();
    apply();
    loadNames();
  }

  return {
    t,
    add,
    num,
    signed,
    plural,
    name,
    trait,
    item,
    setNames,
    setLanguage,
    apply,
    onChange,
    locale,
    lang: () => lang,
    names: () => names,
  };
})();
