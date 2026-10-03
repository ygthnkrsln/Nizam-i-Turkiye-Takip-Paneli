import React from 'react';
import { 
  Crown, 
  ScrollText, 
  Coins, 
  Handshake, 
  ShieldCheck, 
  Users, 
  Award, 
  Clock, 
  Sparkles, 
  ChevronRight,
  TrendingUp,
  Swords
} from 'lucide-react';
import { NizamTurkiyeLogo } from './NizamTurkiyeLogo';

export type ManagementTab = 'mgmtUnit' | 'mgmtOrders' | 'mgmtTreasury' | 'mgmtDiplomacy';

interface ManagementWipSectionProps {
  activeTab: ManagementTab;
  onTabChange: (tab: ManagementTab) => void;
  onSwitchMode: (mode: 'economy' | 'combat') => void;
  muName?: string;
}

export const ManagementWipSection: React.FC<ManagementWipSectionProps> = ({
  activeTab,
  onTabChange,
  onSwitchMode,
  muName = 'Nizam-ı Türkiye',
}) => {
  const getTabConfig = () => {
    switch (activeTab) {
      case 'mgmtUnit':
        return {
          title: 'BİRLİK YÖNETİMİ & KADRO',
          subtitle: 'Kıdem, rütbe atamaları, ordu rolleri ve üye izinleri kontrol merkezi',
          icon: <Crown className="w-6 h-6 text-amber-400" />,
          color: 'amber',
          previewCards: [
            { title: 'Aktif Komuta Kademesi', value: '6 Komutan / 2 Yönetici', desc: 'Hiyerarşik yetki dağılımı' },
            { title: 'Terfi Bekleyen Askerler', value: '14 Asker', desc: 'Rütbe yükseltme incelemesinde' },
            { title: 'Birlik Disiplin Puanı', value: '%98.4', desc: 'Savaş ve operasyon katılımı' },
          ],
        };
      case 'mgmtOrders':
        return {
          title: 'GÖREV DAĞILIMI & OPERASYONEL EMİRLER',
          subtitle: 'Günlük stratejik direktifler, cephe hedefleri ve vuruş sıralaması',
          icon: <ScrollText className="w-6 h-6 text-amber-400" />,
          color: 'amber',
          previewCards: [
            { title: 'Aktif Muharebe Emri', value: '02:55 Hazırlık Emri #104', desc: 'Tüm birlik hazır durumda' },
            { title: 'Öncelikli Vuruş Cephesi', value: 'Eurasia Central', desc: 'T1 - T2 koordinasyonu' },
            { title: 'Hedeflenen Günlük Hasar', value: '1.20B DMG', desc: 'Hedef tutturma oranı: %106' },
          ],
        };
      case 'mgmtTreasury':
        return {
          title: 'BİRLİK KASASI & LOJİSTİK DEPO',
          subtitle: 'Altın rezervleri, fabrika sevkiyatları ve askeri malzeme ikmali',
          icon: <Coins className="w-6 h-6 text-amber-400" />,
          color: 'amber',
          previewCards: [
            { title: 'Merkezi Kasa Rezervi', value: '248,500 Gold', desc: 'Acil operasyon ödeneği' },
            { title: 'Stoktaki İlaç (Pill)', value: '1,420 Adet', desc: '%60 Buff rezervi hazır' },
            { title: 'Haftalık Lojistik Gider', value: '18,400 Gold', desc: 'Birlik sübvansiyonları' },
          ],
        };
      case 'mgmtDiplomacy':
        return {
          title: 'İTTİFAK & DİPLOMASİ DAİRESİ',
          subtitle: 'Dost ordular, pakt anlaşmaları ve uluslararası koordinasyon masası',
          icon: <Handshake className="w-6 h-6 text-amber-400" />,
          color: 'amber',
          previewCards: [
            { title: 'Müttefik Ordu Sayısı', value: '6 Kardeş Birlik', desc: 'Nizam-ı Türkiye Konfederasyonu' },
            { title: 'Saldırmazlık Paktı (NAP)', value: '4 Aktif Pakt', desc: 'Diplomatik güvence altında' },
            { title: 'Ortak Operasyon Masası', value: 'Aktif / Canlı', desc: 'Strateji kanalı bağlı' },
          ],
        };
    }
  };

  const config = getTabConfig();

  return (
    <div className="w-full space-y-6 text-white font-mono bg-gradient-to-b from-[#1E1911] via-[#161410] to-[#12100E] p-4 sm:p-6 rounded-2xl border border-amber-500/35 shadow-2xl relative overflow-hidden">
      {/* Background Golden Accent Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4 border-b border-amber-500/20 relative z-10">
        <div className="flex items-center gap-3.5">
          <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500/40 shadow-md">
            <NizamTurkiyeLogo className="w-12 h-12" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-widest text-amber-400/80 font-bold">
                NİZAM-I TÜRKİYE KOMUTA VE YÖNETİM MODÜLÜ
              </span>
              <span className="px-2 py-0.5 rounded-full bg-amber-950/80 border border-amber-500/50 text-amber-300 text-[10px] font-bold">
                YÖNETİM MODU
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-amber-200 uppercase tracking-wide flex items-center gap-2 mt-0.5">
              <span>{config.title}</span>
            </h1>
            <p className="text-xs text-amber-100/60 mt-1 max-w-2xl">{config.subtitle}</p>
          </div>
        </div>

        {/* Quick Mode Switch Shortcuts */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSwitchMode('economy')}
            className="px-3 py-1.5 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-500/30 text-emerald-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
            <span>Ekonomi Paneli</span>
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode('combat')}
            className="px-3 py-1.5 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 border border-rose-500/30 text-rose-300 text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Swords className="w-3.5 h-3.5 text-rose-400" />
            <span>Savaş Paneli</span>
          </button>
        </div>
      </div>

      {/* Top 3 Preview Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 relative z-10">
        {config.previewCards.map((card, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-[#181510] border border-amber-500/25 hover:border-amber-500/50 transition-all shadow-md group"
          >
            <div className="text-[11px] font-bold text-amber-300/70 uppercase tracking-wider mb-1">
              {card.title}
            </div>
            <div className="text-xl font-black text-amber-100 group-hover:text-amber-300 transition-colors">
              {card.value}
            </div>
            <div className="text-[10px] text-amber-200/50 mt-1">{card.desc}</div>
          </div>
        ))}
      </div>

      {/* WIP Feature Showcase Box */}
      <div className="p-6 sm:p-8 rounded-2xl bg-[#14120E] border border-amber-500/30 text-center space-y-4 relative z-10">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-950/70 border border-amber-500/50 flex items-center justify-center shadow-lg shadow-amber-950/50">
          {config.icon}
        </div>

        <div className="space-y-1.5 max-w-lg mx-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Geliştirme Aşamasında (WIP)</span>
          </div>
          <h2 className="text-lg sm:text-xl font-bold text-amber-100">
            Nizam-ı Türkiye Yönetim Modülü Yakında Hizmetinizde
          </h2>
          <p className="text-xs text-amber-200/60 leading-relaxed">
            Bu ekran Nizam-ı Türkiye ordu liderleri ve komutanları için özel olarak planlanan
            kapsamlı yönetim, emir dağıtımı, kasa bütçelemesi ve ittifak protokolleri paneline ayrılmıştır.
            Altyapı çalışmaları sürmektedir.
          </p>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl mx-auto pt-3 text-left">
          <div className="p-3.5 rounded-xl bg-[#1A1610] border border-amber-500/20 flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-200">Rol & Yetki Matrisi</div>
              <div className="text-[11px] text-amber-100/50 mt-0.5">
                Birlik içi lider, komutan ve yönetici yetkilerinin tek tıkla yapılandırılması.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#1A1610] border border-amber-500/20 flex items-start gap-3">
            <ScrollText className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-200">Operasyonel Günlük Emirler</div>
              <div className="text-[11px] text-amber-100/50 mt-0.5">
                02:55 sıfırlaması sonrası askerlere otomatik iletilen cephe ve hasar kotaları.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#1A1610] border border-amber-500/20 flex items-start gap-3">
            <Coins className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-200">Kasa & Sübvansiyon Havuzu</div>
              <div className="text-[11px] text-amber-100/50 mt-0.5">
                Fabrika hammadde ve buff hapları için ordu içi adil dağıtım algoritmaları.
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#1A1610] border border-amber-500/20 flex items-start gap-3">
            <Users className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-xs font-bold text-amber-200">Nizam-ı Türkiye Konfederasyonu</div>
              <div className="text-[11px] text-amber-100/50 mt-0.5">
                Turkic Tribe, ASHINA, Deliler, BEASTs ve müttefik ordular arası tam entegrasyon.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
