export const COUNTRY_STATS_ARMIES = [
  {
    id: "69c229c4449287ea1a26a5b3",
    name: "Turkic Tribe",
    memberCount: 21,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png",
  },
  {
    id: "689f69064e095b8b9f1b885a",
    name: "ASHINA",
    memberCount: 13,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png",
  },
  {
    id: "68bc9bcb4870c8e343e42855",
    name: "ASHINA Reserve",
    memberCount: 16,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png",
  },
  {
    id: "690088ce4864a132a2d92d07",
    name: "Legio Panthera",
    memberCount: 25,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png",
  },
  {
    id: "6902269a560184d196a6fba8",
    name: "BEASTs",
    memberCount: 25,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg",
  },
  {
    id: "6a0f1495478fe2a58d2868d6",
    name: "Deliler",
    memberCount: 24,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png",
  },
  {
    id: "68e0f3b86351b310a982d79e",
    name: "WAVVE",
    memberCount: 20,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-68e0f3b86351b310a982d79e-1786113114746-rr3s4yb3.png",
  },
  {
    id: "693d20605669127e9d45f9b8",
    name: "DTX",
    memberCount: 0,
    avatarUrl:
      "https://media.warera.io/avatars/mu/mu-693d20605669127e9d45f9b8-1777019037251-2qmzl25l.png",
  },
] as const;

export const REQUIRED_COUNTRY_STATS_ARMY_IDS = [
  "68e0f3b86351b310a982d79e",
  "693d20605669127e9d45f9b8",
] as const;

export function includesRequiredCountryStatsArmies(
  armies: ReadonlyArray<{ id: string }> | null | undefined,
): boolean {
  const ids = new Set((armies || []).map((army) => army.id));
  return REQUIRED_COUNTRY_STATS_ARMY_IDS.every((id) => ids.has(id));
}
