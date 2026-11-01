import React from "react";
import {
  X,
  Building2,
  Cpu,
  Users,
  Coins,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Percent,
  Layers,
  ArrowRight,
  ShieldCheck,
  Info,
} from "lucide-react";
import { PlayerCompanyCalculationResponse } from "../services/wareraApi";

interface DonationCalculationModalProps {
  data: PlayerCompanyCalculationResponse | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}

const ITEM_NAMES_TR: Record<string, string> = {
  grain: "Tahıl",
  limestone: "Kireç Taşı",
  coca: "Koka",
  wood: "Odun",
  scraps: "Hurda",
  oil: "Ham Petrol",
  iron: "Demir",
  lead: "Kurşun",
  fish: "Balık",
  livestock: "Canlı Hayvan",
  paper: "Kağıt",
  petroleum: "Petrol",
  concrete: "Beton",
  bread: "Ekmek",
  steel: "Çelik",
  lightAmmo: "Hafif Mühimmat",
  ammo: "Mühimmat",
  heavyAmmo: "Ağır Mühimmat",
  cookedFish: "Pişmiş Balık",
  steak: "Biftek",
  cocain: "Kokain",
  case1: "Kasa I",
  case2: "Kasa II",
  woodenCase: "Tahta Kasa",
  weapon: "Silah",
  tank: "Tank",
};

function getItemIcon(code: string): string {
  const c = (code || "").toLowerCase();
  const map: Record<string, string> = {
    grain: "/assets/grain.png",
    limestone: "/assets/limestone.png",
    coca: "/assets/coca.png",
    wood: "/assets/wood.png",
    scraps: "/assets/scraps.png",
    oil: "/assets/oil.png",
    iron: "/assets/iron.png",
    lead: "/assets/lead.png",
    fish: "/assets/fish.png",
    livestock: "/assets/livestock.png",
    paper: "/assets/paper.png",
    petroleum: "/assets/petroleum.png",
    concrete: "/assets/concrete.png",
    bread: "/assets/bread.png",
    steel: "/assets/steel.png",
    lightammo: "/assets/lightAmmo.png",
    ammo: "/assets/ammo.png",
    heavyammo: "/assets/heavyAmmo.png",
    cookedfish: "/assets/cookedFish.png",
    steak: "/assets/steak.png",
    cocain: "/assets/cocain.png",
    case1: "/assets/case1.png",
    case2: "/assets/case2.png",
    woodencase: "/assets/woodenCase.png",
    weapon: "/assets/lead.png",
    tank: "/assets/steel.png",
  };
  return map[c] || "/assets/iron.png";
}

export const DonationCalculationModal: React.FC<DonationCalculationModalProps> = ({
  data,
  isLoading,
  error,
  onClose,
}) => {
  if (!data && !isLoading && !error) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 sm:p-5 backdrop-blur-sm overflow-y-auto"
    >
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-emerald-500/30 bg-[#121A20] text-white shadow-2xl overflow-hidden font-mono">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-500/20 bg-[#141C21] p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-emerald-500/35 bg-emerald-950/40 text-emerald-400">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white">
                  Şirket Geliri ve Bağış Hesaplama Detayı
                </h3>
                {data && (
                  <span className="rounded-md border border-emerald-500/30 bg-emerald-950/40 px-2 py-0.5 text-xs font-bold text-emerald-300">
                    {data.username}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#BBE1FA]/60">
                Otomatik motor, çalışan verimi ve pazar fiyatı bazlı resmi hesaplama
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700/60 p-2 text-[#BBE1FA]/70 hover:bg-emerald-950 hover:text-white"
            title="Kapat"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 space-y-3">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500/30 border-t-emerald-400" />
              <p className="text-sm font-semibold text-emerald-300">
                Oyuncunun şirketleri, motor seviyeleri ve çalışan tahminleri hesaplanıyor…
              </p>
              <p className="text-xs text-[#BBE1FA]/40">
                WarEra tRPC API üzerinden güncel pazar fiyatları alınıyor.
              </p>
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/30 p-4 text-sm text-rose-200">
              <div className="flex items-center gap-2 font-bold mb-1">
                <AlertCircle className="h-4 w-4" /> Hesaplama Alınamadı
              </div>
              <p className="text-xs">{error}</p>
            </div>
          )}

          {data && (
            <>
              {/* Oyuncu Durum Kartı & Kurallar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-[#3282B8]/20 bg-[#162128] p-3">
                  <div className="text-[10px] uppercase text-[#BBE1FA]/50">Oyuncu Seviyesi</div>
                  <div className="mt-1 text-lg font-black text-white">Lv. {data.level}</div>
                  <div className="text-[10px] text-emerald-300/80">
                    {data.level >= 30 ? "✓ 30+ (Bağış Kapsamında)" : "✗ 30 Altı (Muaf)"}
                  </div>
                </div>

                <div className="rounded-xl border border-[#3282B8]/20 bg-[#162128] p-3">
                  <div className="text-[10px] uppercase text-[#BBE1FA]/50">Bireysel Servet</div>
                  <div className="mt-1 text-lg font-black text-amber-300">
                    ${Math.round(data.wealth).toLocaleString("tr-TR")}
                  </div>
                  <div className="text-[10px] text-[#BBE1FA]/60">
                    {data.wealth < 20000
                      ? "20k- (%0 Oran)"
                      : data.wealth <= 30000
                      ? "20k - 30k (%20 Oran)"
                      : "30k+ (%25 Oran)"}
                  </div>
                </div>

                <div className="rounded-xl border border-[#3282B8]/20 bg-[#162128] p-3">
                  <div className="text-[10px] uppercase text-[#BBE1FA]/50">Fabrika Limiti</div>
                  <div className="mt-1 text-lg font-black text-cyan-300">
                    {data.activeFactoryCount} / {data.factoryLimit} Aktif
                  </div>
                  <div className="text-[10px] text-[#BBE1FA]/60">
                    Toplam {data.totalOwnedFactories} fabrika mevcut
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-3">
                  <div className="text-[10px] uppercase text-emerald-400">Uygulanan Bağış Oranı</div>
                  <div className="mt-1 text-xl font-black text-emerald-200">
                    {data.donationRateLabel}
                  </div>
                  <div className="text-[10px] text-emerald-300/80">{data.statusReason}</div>
                </div>
              </div>

              {/* Nihai Sonuç Banner'ı */}
              <div className="rounded-2xl border border-emerald-500/40 bg-gradient-to-r from-emerald-950/60 via-[#142327] to-[#121A20] p-4 sm:p-5 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
                      <Coins className="h-4 w-4" /> Ülkeye Atılması Gereken Günlük Bağış
                    </div>
                    <div className="text-2xl sm:text-3xl font-black text-white">
                      {data.dailyDonationTarget.toLocaleString("tr-TR")}{" "}
                      <span className="text-emerald-400 text-lg">Gold / Gün</span>
                    </div>
                    <p className="text-xs text-[#BBE1FA]/70">
                      Toplam Günlük Gelir ({Math.round(data.totalDailyRevenue).toLocaleString("tr-TR")} G) × {data.donationRateLabel} = {data.dailyDonationTarget.toLocaleString("tr-TR")} G
                    </p>
                  </div>

                  <div className="flex flex-col sm:items-end gap-1.5 border-t sm:border-t-0 sm:border-l border-emerald-500/20 pt-3 sm:pt-0 sm:pl-5 text-xs">
                    <div className="text-[#BBE1FA]/70">
                      Otomatik Motor: <span className="font-bold text-white">+{Math.round(data.totalAutoIncome).toLocaleString("tr-TR")} Gold</span>
                    </div>
                    <div className="text-[#BBE1FA]/70">
                      Çalışan Geliri: <span className="font-bold text-white">+{Math.round(data.totalWorkerIncome).toLocaleString("tr-TR")} Gold</span>
                    </div>
                    <div className="text-emerald-300 font-bold">
                      Toplam Günlük Gelir: {Math.round(data.totalDailyRevenue).toLocaleString("tr-TR")} Gold
                    </div>
                  </div>
                </div>
              </div>

              {/* Aktif Şirketler Listesi */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-emerald-400" />
                    <h4 className="text-sm font-bold text-white">
                      Aktif Şirketler ({data.activeCompanies.length} Fabrika)
                    </h4>
                  </div>
                  <span className="text-[11px] text-[#BBE1FA]/50">
                    Becerilere göre en yüksek seviyeli fabrikalar seçilmiştir
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-emerald-500/20 bg-[#141C21]">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#0f171c] text-[10px] uppercase text-[#BBE1FA]/50 border-b border-emerald-500/20">
                      <tr>
                        <th className="px-3 py-2.5">Fabrika & Ürün</th>
                        <th className="px-2.5 py-2.5 text-right">Piyasa Fiyatı</th>
                        <th className="px-2.5 py-2.5">Motor Dönüşüm / Reçete</th>
                        <th className="px-2 py-2.5 text-center">Motor</th>
                        <th className="px-2.5 py-2.5 text-right">Motor Üretim (24s)</th>
                        <th className="px-2.5 py-2.5 text-right">Motor Net</th>
                        <th className="px-2.5 py-2.5 text-center">İşçi Üretim (24s)</th>
                        <th className="px-2.5 py-2.5 text-right">Maaş+Masraf (24s)</th>
                        <th className="px-2.5 py-2.5 text-right">İşçi Net</th>
                        <th className="px-3 py-2.5 text-right font-bold text-emerald-300">
                          Şirket Toplam
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-emerald-500/10">
                      {data.activeCompanies.map((c) => {
                        const icon = getItemIcon(c.itemCode);
                        const trName = ITEM_NAMES_TR[c.itemCode] || c.itemCode;
                        const dailyCost = c.dailyWage + c.dailyManagerCost;
                        const autoItems = c.dailyAutoItemsProduced ?? (c.dailyAutoProduction / (c.conversion?.prodRequired || 1));
                        const autoMatCost = c.dailyAutoMaterialCost ?? 0;
                        const workerItems = c.dailyWorkerItemsProduced ?? c.dailyWorkerProduction;

                        return (
                          <tr key={c.id} className="hover:bg-emerald-950/20">
                            <td className="px-3 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <img
                                  src={icon}
                                  alt={trName}
                                  className="h-6 w-6 object-contain rounded bg-[#101920] p-0.5 border border-[#3282B8]/20 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                                <div>
                                  <div className="font-bold text-white leading-tight">{c.name}</div>
                                  <div className="text-[10px] text-[#BBE1FA]/50">
                                    {trName} · Depo Lv.{c.storageLevel} · Mola Lv.{c.breakRoomLevel}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2.5 py-2.5 text-right text-amber-200 whitespace-nowrap">
                              {c.itemPrice.toFixed(3)} G
                            </td>
                            <td className="px-2.5 py-2.5">
                              <span className="inline-block rounded border border-[#3282B8]/25 bg-[#0e161c] px-1.5 py-0.5 text-[9px] text-[#BBE1FA]/80">
                                {c.conversion?.label || `1 prod = 1 ${c.itemCode}`}
                              </span>
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              <span className="rounded bg-cyan-950/60 border border-cyan-500/30 px-1.5 py-0.5 text-[10px] text-cyan-200">
                                Lv. {c.autoLevel}
                              </span>
                            </td>
                            <td className="px-2.5 py-2.5 text-right whitespace-nowrap">
                              <div className="text-white font-medium">
                                {autoItems.toFixed(1)} adet
                              </div>
                              <div className="text-[9px] text-[#BBE1FA]/45">
                                {c.dailyAutoProduction} prod
                                {autoMatCost > 0 && ` · -${autoMatCost.toFixed(1)}G mat.`}
                              </div>
                            </td>
                            <td className="px-2.5 py-2.5 text-right font-bold text-cyan-200 whitespace-nowrap">
                              +{c.dailyAutoIncome.toFixed(1)} G
                            </td>
                            <td className="px-2.5 py-2.5 text-center whitespace-nowrap">
                              {c.dailyWorkerProduction > 0 ? (
                                <div>
                                  <div className="text-white font-medium">
                                    {workerItems.toFixed(1)} adet
                                  </div>
                                  <div className="text-[9px] text-[#BBE1FA]/45">
                                    {c.dailyWorkerProduction.toFixed(1)} üretim / gün
                                  </div>
                                </div>
                              ) : (
                                <span
                                  className={c.workerEstimateError ? "text-rose-300" : "text-[#BBE1FA]/40"}
                                  title={c.workerEstimateError}
                                >
                                  {c.workerEstimateError || "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-2.5 text-right text-rose-300 whitespace-nowrap">
                              {dailyCost > 0 ? (
                                <div>
                                  <div>-{dailyCost.toFixed(1)} G</div>
                                  <div className="text-[9px] text-rose-400/60">
                                    M:{c.dailyWage.toFixed(1)} · Y:{c.dailyManagerCost.toFixed(1)} G
                                  </div>
                                </div>
                              ) : (
                                "0 G"
                              )}
                            </td>
                            <td
                              className={`px-2.5 py-2.5 text-right font-bold whitespace-nowrap ${
                                c.dailyWorkerIncome >= 0 ? "text-emerald-300" : "text-rose-400"
                              }`}
                            >
                              {c.dailyWorkerIncome >= 0 ? "+" : ""}
                              {c.dailyWorkerIncome.toFixed(1)} G
                            </td>
                            <td className="px-3 py-2.5 text-right font-black text-emerald-200 whitespace-nowrap">
                              +{c.companyTotalIncome.toFixed(1)} G
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-[#0e161b] font-bold border-t border-emerald-500/20 text-xs">
                      <tr>
                        <td colSpan={5} className="px-3 py-2.5 text-white">
                          TOPLAM AKTİF ŞİRKET GELİRLERİ ({data.activeCompanies.length} Fabrika)
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-cyan-200">
                          +{data.totalAutoIncome.toFixed(1)} G
                        </td>
                        <td colSpan={2} className="px-2.5 py-2.5 text-right text-[#BBE1FA]/50">
                          Çalışan Net Toplamı:
                        </td>
                        <td className="px-2.5 py-2.5 text-right text-emerald-300">
                          +{data.totalWorkerIncome.toFixed(1)} G
                        </td>
                        <td className="px-3 py-2.5 text-right font-black text-emerald-300">
                          {data.totalDailyRevenue.toFixed(1)} Gold
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Pasif / Yedek Şirketler (Varsa) */}
              {data.passiveCompanies.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#BBE1FA]/60">
                    <Info className="h-3.5 w-3.5" />
                    <span>
                      Yedekte Olan Pasif Şirketler ({data.passiveCompanies.length} Adet) — Beceri
                      limiti ({data.factoryLimit}) aşıldığı için gelire dahil edilmez:
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.passiveCompanies.map((c) => (
                      <div
                        key={c.id}
                        className="rounded-lg border border-slate-700/50 bg-[#11191E] px-2.5 py-1.5 text-[11px] text-slate-400 flex items-center gap-1.5"
                      >
                        <img
                          src={getItemIcon(c.itemCode)}
                          alt=""
                          className="h-3.5 w-3.5 object-contain opacity-50"
                        />
                        <span>{c.name}</span>
                        <span className="text-[9px] text-slate-500">(Motor Lv.{c.autoLevel})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Formül & Kural Açıklaması */}
              <div className="rounded-xl border border-slate-800 bg-[#0e161a] p-4 text-xs text-[#BBE1FA]/70 space-y-3">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" /> Hesaplama Yöntemi & 20 Eşya Dönüşüm Reçeteleri
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] bg-[#11191e] p-3 rounded-lg border border-[#3282B8]/15">
                  <div>
                    <div className="text-emerald-300 font-bold mb-1">Mühimmat & Hammaddeler</div>
                    <ul className="space-y-0.5 text-[#BBE1FA]/65">
                      <li>• Lead: 1 prod = 1 lead</li>
                      <li>• Light ammo: 1 prod + 1 lead = 1 light ammo</li>
                      <li>• Ammo: 4 prod + 4 lead = 1 ammo</li>
                      <li>• Heavy ammo: 16 prod + 16 lead = 1 heavy ammo</li>
                      <li>• Coca: 1 prod = 1 coca</li>
                      <li>• Pill: 200 prod + 200 coca = 1 pill</li>
                      <li>• Grain: 1 prod = 1 grain</li>
                      <li>• Farm Animal: 20 prod = 1 farm animal</li>
                      <li>• Fish: 40 prod = 1 fish</li>
                      <li>• Bread: 10 prod + 10 grain = 1 bread</li>
                    </ul>
                  </div>
                  <div>
                    <div className="text-emerald-300 font-bold mb-1">Yiyecek, Sanayi & Yapı Malzemeleri</div>
                    <ul className="space-y-0.5 text-[#BBE1FA]/65">
                      <li>• Steak: 20 prod + 1 farm animal = 1 steak</li>
                      <li>• Cooked Fish: 40 prod + 1 fish = 1 cooked fish</li>
                      <li>• Oil: 1 prod + 1 petroleum = 1 oil</li>
                      <li>• Petroleum: 1 prod = 1 petroleum</li>
                      <li>• Wood: 1 prod = 1 wood</li>
                      <li>• Paper: 1 prod + 1 wood = 1 paper</li>
                      <li>• Iron: 1 prod = 1 iron</li>
                      <li>• Steel: 10 prod + 10 iron = 1 steel</li>
                      <li>• Limestone: 1 prod = 1 limestone</li>
                      <li>• Concrete: 10 prod + 10 limestone = 1 concrete</li>
                    </ul>
                  </div>
                </div>

                <ul className="list-disc list-inside space-y-1 text-[11px] text-[#BBE1FA]/70">
                  <li>
                    <strong>Motor Net Geliri:</strong> Üretilen eşya adedi = motor üretimi / reçete prod değeri. Kullanılan girdi hammaddelerinin piyasa maliyeti, brüt gelirden düşülür.
                  </li>
                  <li>
                    <strong>Çalışan Net Geliri:</strong> Her estimate için (production × 24 × estimate.itemCode piyasa fiyatı) hesaplanır; günlük maaş ve yönetici masrafı (wage × 24 + managerCost × 24) toplam gelirden düşülür.
                  </li>
                  <li>
                    <strong>Bağış Kriteri (Yalnızca 30+ Seviye):</strong> 20k altı servet: %0 (Muaf); 20k–30k arası servet: %20; 30k ve üzeri servet: %25 oranı toplam günlük şirket gelirine (Motor + Çalışan) uygulanır.
                  </li>
                </ul>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-emerald-500/20 bg-[#141C21] px-4 py-3 sm:px-6">
          <span className="text-[11px] text-[#BBE1FA]/50">
            WarEra Takip Paneli · Gerçek Zamanlı Komuta ve Bağış Sistemi
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors"
          >
            Kapat
          </button>
        </div>
      </div>
    </div>
  );
};
