import React, { useEffect, useState } from "react";
import { Swords } from "lucide-react";

const MIN_FRAME_HEIGHT = 900;

export const DamageOptimizationSection: React.FC = () => {
  const [frameHeight, setFrameHeight] = useState(MIN_FRAME_HEIGHT);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== "nizam-damage-optimizer-height") return;
      const height = Number(event.data.height);
      if (Number.isFinite(height)) setFrameHeight(Math.max(MIN_FRAME_HEIGHT, Math.min(height, 20_000)));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return (
    <section className="space-y-4" aria-labelledby="damage-optimizer-title">
      <header className="flex items-start gap-3 rounded-2xl border border-[#3282B8]/20 bg-[#182329] p-4 sm:p-5">
        <span className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-2.5 text-cyan-200">
          <Swords className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-cyan-200">Araçlar</p>
          <h1 id="damage-optimizer-title" className="mt-1 text-xl font-bold text-white">Hasar Optimizasyonu</h1>
          <p className="mt-1 text-xs text-[#BBE1FA]/60">Referans optimizasyon motoru · Supabase ekipman fiyatları · sunucu üzerinden WarEra verileri</p>
        </div>
      </header>
      <iframe
        title="Hasar ve gelir optimizasyonu"
        src="/damage-optimizer/reference/simple_dmg.html?lang=tr"
        className="block w-full rounded-2xl border border-[#3282B8]/20 bg-[#1B262C]"
        style={{ height: frameHeight }}
        loading="lazy"
        referrerPolicy="same-origin"
      />
    </section>
  );
};
