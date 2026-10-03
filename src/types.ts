export interface DonationItem {
  id: string;
  amount: number;
  currency: string;
  timestamp: string;
  description?: string;
  type?: string;
  target?: 'country' | 'mu';
  targetName?: string;
  targetAvatarUrl?: string;
  countryCode?: string;
}

export interface MilitaryUnitPreset {
  id: string;
  name: string;
  avatarUrl: string;
  isDefault?: boolean;
}

export const PRESET_MILITARY_UNITS: MilitaryUnitPreset[] = [
  {
    id: '69c229c4449287ea1a26a5b3',
    name: 'Turkic Tribe',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-69c229c4449287ea1a26a5b3-1787680897144-8qglepbh.png',
    isDefault: true,
  },
  {
    id: '689f69064e095b8b9f1b885a',
    name: 'ASHINA',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-689f69064e095b8b9f1b885a-1781036697919-z15zttgr.png',
  },
  {
    id: '68bc9bcb4870c8e343e42855',
    name: 'ASHINA Reserve',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-68bc9bcb4870c8e343e42855-1788975231586-trvgqowg.png',
  },
  {
    id: '690088ce4864a132a2d92d07',
    name: 'Legio Panthera',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-690088ce4864a132a2d92d07-1789328739738-1v6foes6.png',
  },
  {
    id: '6902269a560184d196a6fba8',
    name: 'BEASTs',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-6902269a560184d196a6fba8-1787571170299-iczr3flz.jpg',
  },
  {
    id: '6a0f1495478fe2a58d2868d6',
    name: 'Deliler',
    avatarUrl: 'https://media.warera.io/avatars/mu/mu-6a0f1495478fe2a58d2868d6-1779887796291-bfgxnrms.png',
  },
];

export interface FactoryItem {
  id: string;
  name: string;
  itemCode: string;
  production: number;
  automatedLevel: number; // Otomasyon Motoru Seviyesi (Motor Gücü / Engine Level)
  storageLevel: number;   // Depo Seviyesi
  breakRoomLevel?: number; // Mola Odası Seviyesi
  workerCount: number;
  estimatedValue?: number;
  region?: string;        // Fabrikanın bulunduğu bölge
  status?: string;        // 'active' | 'inactive'
  isActiveFactory?: boolean; // Oyuncunun beceri limitine göre aktif olan fabrika mı?
}

export type PlayerMode = 'economy' | 'combat';

export interface PlayerStats {
  userId: string;
  username: string;
  avatarUrl?: string;
  level: number;
  militaryRank: number;
  totalDamages: number;
  weeklyDamages: number;
  wealth: number;
  role: 'Leader' | 'Commander' | 'Manager' | 'Member';
  lastActive: string;
  isActive?: boolean;     // Son 3 gün içinde aktif mi
  isCitizen?: boolean;    // Aktif ve Seviye >= 10
  latestDonations: DonationItem[];
  totalDonations: number;
  donationCount: number;
  factoryLimit?: number;  // Beceriye bağlı aktif fabrika limiti (2 taban + yetenek puanı + prestij)
  activeFactoryCount?: number; // Aktif fabrika sayısı
  totalOwnedFactories?: number; // Toplam sahip olunan fabrika sayısı
  factoryCount?: number;  // Gösterilecek aktif fabrika sayısı
  totalAutomatedLevel?: number; // Aktif fabrikaların toplam motor gücü
  allFactoriesAutomatedLevel?: number; // Tüm fabrikaların toplam motor gücü
  factories?: FactoryItem[];
  playerMode?: PlayerMode; // 'economy' (Ekonomi Oyuncusu) | 'combat' (Savaş Oyuncusu)
  ecoSkillPoints?: number; // Ekonomi becerilerine (entrepreneurship, energy, production, companies, management) harcanan SP
  totalSkillPoints?: number; // Harcanan / toplam beceri puanı
  skills?: Record<string, any>;
}

export interface MilitaryUnitData {
  id: string;
  name: string;
  avatarUrl?: string;
  level: number;
  mercenaryReputation: number;
  membersCount: number;
  rankings?: {
    damages?: { value: number; rank: number; tier: string };
    wealth?: { value: number; rank: number; tier: string };
    reputation?: { value: number; rank: number; tier: string };
  };
  headquartersLevel?: number;
  dormitoriesLevel?: number;
}

export interface ApiResponse {
  success: boolean;
  timestamp: number;
  isLiveDonations: boolean;
  hasApiToken: boolean;
  militaryUnit: MilitaryUnitData;
  players: PlayerStats[];
  aggregated: {
    totalDonations: number;
    totalContributors: number;
    averageDonation: number;
    topDonor: {
      userId: string;
      username: string;
      amount: number;
      avatarUrl?: string;
    } | null;
  };
  error?: string;
}

export type SortField =
  | 'username'
  | 'level'
  | 'totalDonations'
  | 'latestDonation'
  | 'target'
  | 'wealth';

export type SortDirection = 'asc' | 'desc';

export interface LevelStatItem {
  level: number;
  playerCount: number;
  avgFactories: number;
  totalFactories: number;
  avgAutomatedLevel: number;
  totalAutomatedLevel: number;
  avgWealth?: number;
  totalWealth?: number;
  percentage?: number;
  combatCount?: number;
  economyCount?: number;
  combatRatio?: number;
  economyRatio?: number;
  combatFactories?: number;
  economyFactories?: number;
  combatAutomatedLevel?: number;
  economyAutomatedLevel?: number;
  combatWealth?: number;
  economyWealth?: number;
  avgCombatFactories?: number;
  avgEconomyFactories?: number;
  avgCombatAutomatedLevel?: number;
  avgEconomyAutomatedLevel?: number;
  avgCombatWealth?: number;
  avgEconomyWealth?: number;
}

export interface CountryStatsResponse {
  success: boolean;
  totalArmies: number;
  totalPlayers: number;
  totalCombatPlayers?: number;
  totalEconomyPlayers?: number;
  armies: { id: string; name: string; memberCount: number; avatarUrl?: string }[];
  levelStats: LevelStatItem[];
  generatedAt: string;
}

export interface MilitaryLeaderItem {
  userId: string;
  username: string;
  avatarUrl: string;
  role: 'leader' | 'manager' | 'commander';
  roleLabel: string;
  level: number;
}

export interface MilitaryMvpItem {
  userId: string;
  username: string;
  avatarUrl: string;
  value: number;
  formattedValue: string;
  level?: number;
  prestigeLevel?: number;
}

export interface LevelSpectrumItem {
  range: string;
  min: number;
  max: number;
  count: number;
  percentage: number;
}

export interface MilitaryMemberItem {
  userId: string;
  username: string;
  avatarUrl: string;
  level: number;
  totalXp: number;
  prestigeLevel: number;
  weeklyDamage: number;
  allTimeDamage: number;
  wealth: number;
}

export interface MilitaryOverviewData {
  muInfo: {
    id: string;
    name: string;
    avatarUrl: string;
    description: string;
    countryId: string;
    leaderId: string;
  };
  countryInfo: {
    name: string;
    code: string;
    flagUrl: string;
  };
  stats: {
    memberCount: number;
    commanderCount: number;
    totalWeeklyDamage: number;
    totalAllTimeDamage: number;
    averageLevel: number;
    totalWealth: number;
    averageWealth: number;
  };
  mvps: {
    weeklyDamageLeader: MilitaryMvpItem | null;
    allTimeDamageLeader: MilitaryMvpItem | null;
    mostExperienced: MilitaryMvpItem | null;
    wealthiest: MilitaryMvpItem | null;
  };
  leadership: MilitaryLeaderItem[];
  levelSpectrum: LevelSpectrumItem[];
  members: MilitaryMemberItem[];
  generatedAt: string;
}

export interface MilitaryOverviewResponse {
  success: boolean;
  data?: MilitaryOverviewData;
  error?: string;
}

