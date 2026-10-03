import React from 'react';
import { 
  Shield, 
  Crosshair, 
  Flame, 
  Construction, 
  Sparkles, 
  Clock, 
  ArrowRight,
  TrendingUp,
  Activity,
  Award,
  Zap
} from 'lucide-react';
import { ActiveTab } from '../App';

interface WorkInProgressPanelProps {
  activeTab: ActiveTab;
  onSwitchToEconomy: () => void;
}

export const WorkInProgressPanel: React.FC<WorkInProgressPanelProps> = ({
  activeTab,
  onSwitchToEconomy,
}) => {
  const getTabConfig = () => {
    switch (activeTab) {
      case 'combatArmyInfo':
        return {
          title: 'Ordu Bilgisi',
          subtitle: 'Askeri birlik künyesi, rütbe dağılımı ve aktif cephe konuşlanması',
          icon: Shield,
          badgeText: 'Muharebe İstihbaratı',
          features: [
            {
              title: 'Canlı Birlik Konuşlanması',
              desc: 'Tüm askerlerin cephe durumu, hazır kuvvet sayısı ve koordinasyonu.',
              icon: Activity,
            },
            {
              title: 'Rütbe & Disiplin Hiyerarşisi',
              desc: 'Komutanlar, subaylar ve erlerin ordu içi görev dağılımı.',
              icon: Award,
            },
            {
              title: 'Cephane ve Donatım Durumu',
              desc: 'Birlik envanteri ve muharebe hazırlık seviyesi takibi.',
              icon: Zap,
            },
          ],
        };
      case 'combatDetails':
        return {
          title: 'Detaylı Bilgi',
          subtitle: 'Asker bazlı taktiksel beceri analizleri, vuruş oranları ve teçhizat raporları',
          icon: Crosshair,
          badgeText: 'Taktiksel Analiz',
          features: [
            {
              title: 'Asker Vuruş Gücü Karşılaştırması',
              desc: 'Askerlerin muharebe yetenekleri ve vuruş başına hasar verimliliği.',
              icon: Crosshair,
            },
            {
              title: 'Savaş Becerileri Matrisi',
              desc: 'Fiziksel güç, nişancılık ve savunma puanlarının detaylı dökümü.',
              icon: Zap,
            },
            {
              title: 'Gelişmiş Filtreleme & Dışa Aktarım',
              desc: 'Birlik komutanları için özelleştirilebilir savaş raporları ve PDF çıktısı.',
              icon: Activity,
            },
          ],
        };
      case 'combatDamage':
        return {
          title: 'Hasar Paneli',
          subtitle: 'Gerçek zamanlı cephe hasarı, haftalık vuruş sıralaması ve taarruz rekorları',
          icon: Flame,
          badgeText: 'Hasar İstatistikleri',
          features: [
            {
              title: 'Canlı Cephe Hasar Takibi',
              desc: 'Savaş anında atılan toplam hasarın saniyelik güncellemelerle izlenmesi.',
              icon: Flame,
            },
            {
              title: 'Haftalık Hasar Liderlik Tablosu',
              desc: 'En çok hasar veren ilk 10 ve ilk 50 askerin dinamik sıralaması.',
              icon: Award,
            },
            {
              title: 'Enerji & Mühimmat Verimliliği',
              desc: 'Kullanılan enerjiye oranla üretilen maksimum yıkım istatistikleri.',
              icon: Zap,
            },
          ],
        };
      default:
        return {
          title: 'Savaş Modülü',
          subtitle: 'Muharebe ve taktik analiz araçları',
          icon: Construction,
          badgeText: 'Savaş Modu',
          features: [],
        };
    }
  };

  const config = getTabConfig();
  const IconComponent = config.icon;

  return (
    <div className="w-full space-y-6">
      {/* Main Hero Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#182329]/95 via-[#141C21]/95 to-[#1a1215]/90 border border-rose-500/30 p-8 shadow-2xl backdrop-blur-md">
        {/* Ambient Glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-80 h-80 bg-red-800/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
          {/* Pulsing Icon Badge */}
          <div className="relative mb-5 group">
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-rose-600 to-red-500 opacity-60 blur-md animate-pulse" />
            <div className="relative w-16 h-16 rounded-2xl bg-[#141C21] border border-rose-500/50 flex items-center justify-center shadow-xl">
              <IconComponent className="w-8 h-8 text-rose-400" />
            </div>
            <div className="absolute -bottom-2 -right-2 px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-500/50 text-[10px] font-mono font-bold flex items-center gap-1 shadow-md">
              <Construction className="w-3 h-3 text-rose-400" />
              <span>WIP</span>
            </div>
          </div>

          {/* Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-mono mb-3">
            <Sparkles className="w-3.5 h-3.5 text-rose-400" />
            <span className="font-semibold uppercase tracking-wider">{config.badgeText}</span>
            <span className="text-rose-400/50">•</span>
            <span className="text-rose-300/80">Geliştirme Aşamasında</span>
          </div>

          {/* Title */}
          <h2 className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight mb-2">
            {config.title} <span className="text-rose-400">—</span> Yapım Aşamasında
          </h2>

          <p className="text-sm text-[#BBE1FA]/70 leading-relaxed max-w-xl mb-6 font-sans">
            {config.subtitle}. Bu modül için War Era API bağlantıları ve savaş motoru algoritmaları şu anda geliştirilmektedir.
          </p>

          {/* Status Indicators */}
          <div className="inline-flex flex-wrap items-center justify-center gap-2 p-1.5 rounded-xl bg-[#141C21]/80 border border-rose-500/25 mb-6 text-xs font-mono text-rose-300/90">
            <div className="flex items-center gap-1.5 px-2.5 py-1">
              <Clock className="w-3.5 h-3.5 text-rose-400" />
              <span>Durum: Planlandı & Kodlanıyor</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-rose-500/40 hidden sm:block" />
            <div className="flex items-center gap-1.5 px-2.5 py-1">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-amber-300 font-semibold">Erken Önizleme Modu</span>
            </div>
          </div>

          {/* CTA: Back to Economy */}
          <button
            type="button"
            onClick={onSwitchToEconomy}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-950 to-emerald-900/90 hover:from-emerald-900 hover:to-emerald-800 text-emerald-300 hover:text-white border border-emerald-500/40 font-mono text-xs font-bold transition-all shadow-lg shadow-emerald-950/40 cursor-pointer group"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span>Ekonomi Moduna Geri Dön</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>
      </div>

      {/* Planned Features Preview Grid */}
      {config.features.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider font-mono text-rose-400/90 flex items-center gap-2">
              <Crosshair className="w-3.5 h-3.5 text-rose-400" />
              <span>Geliştirilen Özellikler ve Modüller</span>
            </h3>
            <span className="text-[11px] font-mono text-[#BBE1FA]/50">War Era Combat v1.0</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {config.features.map((feat, idx) => {
              const FeatIcon = feat.icon;
              return (
                <div
                  key={idx}
                  className="rounded-xl bg-[#182329]/80 border border-rose-500/20 hover:border-rose-500/40 p-4 transition-all hover:bg-[#182329] group shadow-md"
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-950/70 border border-rose-500/30 flex items-center justify-center text-rose-400 group-hover:text-rose-300 transition-colors">
                      <FeatIcon className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="text-xs font-bold text-white font-mono group-hover:text-rose-200 transition-colors">
                      {feat.title}
                    </h4>
                  </div>
                  <p className="text-[12px] text-[#BBE1FA]/60 leading-relaxed font-sans">
                    {feat.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
