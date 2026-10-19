export interface TrackedArmy {
  id: string;
  name: string;
  avatarUrl: string;
}

export const TRACKED_ARMIES: TrackedArmy[] = [
  {
    id: "69c229c4449287ea1a26a5b3",
    name: "Turkic Tribe",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png",
  },
  {
    id: "689f69064e095b8b9f1b885a",
    name: "ASHINA",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png",
  },
  {
    id: "68bc9bcb4870c8e343e42855",
    name: "ASHINA Reserve",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png",
  },
  {
    id: "690088ce4864a132a2d92d07",
    name: "SANCAK",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1791393626311-tje1l0qg.png",
  },
  {
    id: "69ab3f2fd0fc128eeeba7a65",
    name: "BEAST",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-69ab3f2fd0fc128eeeba7a65-1791987932593-20rp7wkr.jpg",
  },
  {
    id: "6a0f1495478fe2a58d2868d6",
    name: "Deliler",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png",
  },
  {
    id: "693d20605669127e9d45f9b8",
    name: "DTX",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-693d20605669127e9d45f9b8-1777019037251-2qmzl25l.png",
  },
  {
    id: "6902269a560184d196a6fba8",
    name: "BEASTs",
    avatarUrl: "https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg",
  },
];

export const TRACKED_ARMY_IDS = TRACKED_ARMIES.map((army) => army.id);
