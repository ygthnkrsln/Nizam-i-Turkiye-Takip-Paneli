export interface BattleBonusAssessment {
  key: string;
  percent: number;
  enabled: boolean;
  source: "API" | "belirlenemedi";
  reason: string;
}

const idOf = (value: any): string => String(value?._id || value?.id || value?.muId || value?.countryId || (typeof value === "string" ? value : ""));

export function assessBattleBonuses(input: {
  playerCountryId: string;
  playerAllianceId: string;
  enemyCountryIds: string[];
  playerMuIds: string[];
  battle: any;
  countriesById: Record<string, any>;
  ordersBySide: Record<"attacker" | "defender", any[]>;
  ordersKnown: Partial<Record<"attacker" | "defender", boolean>>;
  allianceKnown: boolean;
  enemyListKnown: boolean;
  configuredBonuses: Record<string, number>;
}): BattleBonusAssessment[] {
  const { playerCountryId, playerAllianceId, enemyCountryIds, playerMuIds, battle, countriesById, ordersBySide, ordersKnown, allianceKnown, enemyListKnown, configuredBonuses } = input;
  const attackerId = idOf(battle?.attacker?.country);
  const defenderId = idOf(battle?.defender?.country);
  const attackerOwn = attackerId === playerCountryId;
  const defenderOwn = defenderId === playerCountryId;
  const countryFor = (id: string) => countriesById[id] || {};
  const sharesAlliance = (id: string) => Boolean(playerAllianceId && String(countryFor(id)?.allianceId || countryFor(id)?.alliance?._id || countryFor(id)?.alliance?.id || "") === playerAllianceId);
  const includesPlayerMu = (sideName: "attacker" | "defender") => {
    const raw = battle?.[sideName]?.muOrders;
    const ids = Array.isArray(raw) ? raw.map(idOf) : [];
    return ids.some((id: string) => playerMuIds.includes(id));
  };
  const side = attackerOwn || defenderOwn
    ? attackerOwn ? "attacker" : "defender"
    : sharesAlliance(attackerId) ? "attacker"
      : sharesAlliance(defenderId) ? "defender"
        : includesPlayerMu("attacker") ? "attacker"
          : includesPlayerMu("defender") ? "defender" : null;
  const opponentId = side === "attacker" ? defenderId : side === "defender" ? attackerId : "";
  const sideIds = { attacker: attackerId, defender: defenderId };
  const sideData = side ? battle?.[side] || {} : {};
  const orders = side ? ordersBySide[side] || [] : [];
  const playerMuSet = new Set(playerMuIds);
  const activeOrders = orders.filter((order) => order?.isActive !== false);
  const countryOrder = activeOrders.some((order) => idOf(order?.countryId || order?.country) === playerCountryId || (Array.isArray(order?.countryIds) && order.countryIds.map(idOf).includes(playerCountryId))) ||
    (Array.isArray(sideData?.countryOrders) && sideData.countryOrders.map(idOf).includes(playerCountryId));
  const muOrder = activeOrders.some((order) => playerMuSet.has(idOf(order?.muId || order?.mu)) || (Array.isArray(order?.muIds) && order.muIds.map(idOf).some((id: string) => playerMuSet.has(id)))) ||
    (Array.isArray(sideData?.muOrders) && sideData.muOrders.map(idOf).some((id: string) => playerMuSet.has(id)));
  const sideCountry = side ? countriesById[sideIds[side]] || {} : {};
  const sameAlliance = Boolean(side && sharesAlliance(sideIds[side]));
  const enemy = enemyCountryIds.includes(opponentId);
  const facts: Record<string, { enabled: boolean; reason: string }> = {
    patrioticBonusPercent: { enabled: attackerOwn || defenderOwn, reason: attackerOwn || defenderOwn ? "Oyuncunun ülkesi seçili savaşta taraf." : "Oyuncunun ülkesi bu savaşta taraf olarak görünmüyor." },
    countryOrderBonusPercent: { enabled: countryOrder, reason: countryOrder ? "Savaş tarafında oyuncunun ülkesi için etkin emir bulundu." : "Ülke emri yanıtı oyuncunun ülkesi için emir doğrulamadı." },
    muOrderBonusPercent: { enabled: muOrder, reason: muOrder ? "Savaş tarafında oyuncunun MU'su için etkin emir bulundu." : "MU emir yanıtı oyuncunun birliklerinden biri için emir doğrulamadı." },
    allianceDamagesBonusPercent: { enabled: sameAlliance, reason: sameAlliance ? "Savaş tarafı oyuncunun ülkesiyle aynı ittifakta." : "İttifak bağı API yanıtında doğrulanamadı." },
    enemyDamagesBonusPercent: { enabled: enemy, reason: enemy ? "Rakip ülke, oyuncunun ülkesinin API düşman listesinde." : "Rakip ülke düşman listesinde doğrulanamadı." },
  };
  const keys = ["patrioticBonusPercent", "countryOrderBonusPercent", "muOrderBonusPercent", "allianceDamagesBonusPercent", "enemyDamagesBonusPercent", "regionNotLinkedToCapitalMalusPercent", "lostAttackingRegionMalusPercent", "occupyingYourRegionsMalusPercent"];
  return keys.map((key) => {
    const known = facts[key];
    const regionCondition = key === "regionNotLinkedToCapitalMalusPercent" || key === "lostAttackingRegionMalusPercent" || key === "occupyingYourRegionsMalusPercent";
    const ordersAvailable=Boolean(side&&ordersKnown[side]);
    const sideAllianceKnown=["allianceId","alliance"].some(field=>Object.prototype.hasOwnProperty.call(sideCountry,field));
    const relationAvailable=key==="allianceDamagesBonusPercent"?Boolean(allianceKnown&&sideAllianceKnown):key==="enemyDamagesBonusPercent"?Boolean(enemyListKnown):true;
    const evidenceAvailable=key==="countryOrderBonusPercent"||key==="muOrderBonusPercent"?ordersAvailable:relationAvailable;
    const source=known&&evidenceAvailable?"API":"belirlenemedi";
    const reason=known&&!evidenceAvailable?key.includes("Order")?"Savaş emir yanıtı alınamadı; elle seçin.":"Ülke ilişki alanları yanıtta yok; elle seçin.":known?known.reason:regionCondition?"Bölge/savaş yanıtı bu koşulu açıkça doğrulamıyor; elle seçin.":"Yanıt alanları koşulu doğrulamadı; elle seçin.";
    return {
      key,
      percent: Number(configuredBonuses[key]) || 0,
      enabled: known ? known.enabled : false,
      source,
      reason,
    };
  });
}

export function marketTaxToPercent(value: unknown, interpretation: "percentage-points" | "ratio" = "percentage-points"): number | null {
  if(value===null||value===undefined||value==="")return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return interpretation === "ratio" ? number * 100 : number;
}
