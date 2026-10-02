import React, { useState, useEffect } from 'react';
import { getUserApiKey, setUserApiKey } from '../services/wareraApi';
import { CheckCircle2 } from 'lucide-react';

interface ApiKeySectionProps {
  onKeyChange?: () => void;
}

export const ApiKeySection: React.FC<ApiKeySectionProps> = ({ onKeyChange }) => {
  const [apiKey, setApiKey] = useState('');
  const [savedKey, setSavedKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    const existing = getUserApiKey();
    if (existing) {
      setApiKey(existing);
      setSavedKey(existing);
      setStatusMessage('API anahtarı başarıyla kaydedildi ve bu tarayıcıda saklanıyor.');
    }
  }, []);

  const handleSave = () => {
    const trimmed = apiKey.trim();
    setUserApiKey(trimmed);
    setSavedKey(trimmed);
    if (trimmed) {
      setStatusMessage('API anahtarı başarıyla kaydedildi ve bu tarayıcıda saklanıyor.');
    } else {
      setStatusMessage(null);
    }
    if (onKeyChange) {
      onKeyChange();
    }
  };

  const handleClear = () => {
    setApiKey('');
    setSavedKey('');
    setUserApiKey('');
    setStatusMessage(null);
    if (onKeyChange) {
      onKeyChange();
    }
  };

  return (
    <div
      id="api-key-section"
      className="mb-6 p-5 sm:p-6 rounded-2xl bg-[#182329]/95 border border-[#3282B8]/25 shadow-xl shadow-black/30 backdrop-blur-sm"
    >
      {/* 1. Üst Başlık */}
      <div className="flex items-center gap-2.5 mb-3 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-white font-mono">
          WARERA API ANAHTARI
        </h3>
      </div>

      {/* 2. Açıklama Metinleri */}
      <div className="space-y-1.5 text-xs text-[#BBE1FA]/70 leading-relaxed mb-4">
        <p>
          WarEra API anahtarınızı buraya kaydederek bağış ve oyuncu verilerinizi doğrudan kendi API kotanız üzerinden güncelleyebilirsiniz.
        </p>
        <p>
          Profil -&gt; Ayarlar sekmesinin en alt kısmından oluşturabilir veya kopyalayabilirsiniz.
        </p>
        <p className="text-[11px] text-[#BBE1FA]/60 font-mono">
          Yalnızca bu tarayıcıda yerel olarak saklanır ve sadece WarEra API isteklerinde <code className="text-[#BBE1FA] bg-[#141C21] px-1 py-0.5 rounded">X-API-Key</code> olarak iletilir. Asla harici bir veri tabanına kaydedilmez.
        </p>
      </div>

      {/* 3. API Anahtarı Giriş Alanı */}
      <div className="space-y-2">
        <label className="block text-xs font-mono font-semibold text-[#BBE1FA]/80">
          API Anahtarı
        </label>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Input Box with Show / Hide Toggle */}
          <div className="relative flex-1 group">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="wae_..."
              className="w-full pl-3.5 pr-20 py-2.5 text-xs font-mono rounded-xl bg-[#141C21] border border-[#3282B8]/30 focus:border-[#3282B8] text-white placeholder:text-[#BBE1FA]/30 focus:outline-none focus:ring-1 focus:ring-[#3282B8]/50 transition shadow-inner tracking-wider"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 text-[11px] font-mono text-[#BBE1FA]/70 hover:text-white bg-[#182329] hover:bg-[#0F4C75]/40 rounded border border-[#3282B8]/20 transition cursor-pointer"
            >
              {showKey ? 'Gizle' : 'Göster'}
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Primary Save Button */}
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-[#E5A93C] hover:bg-[#F59E0B] text-black font-mono font-bold text-xs shadow-md transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              API Anahtarını Kaydet
            </button>

            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              className="px-4 py-2.5 rounded-xl bg-[#141C21] hover:bg-[#0F4C75]/30 text-white font-mono font-semibold text-xs border border-[#3282B8]/30 hover:border-[#3282B8]/60 transition cursor-pointer whitespace-nowrap active:scale-95"
            >
              Temizle
            </button>
          </div>
        </div>
      </div>

      {/* 4. Durum Bildirim Kutusu (Görseldeki yeşil çerçeveli başarı kutusu) */}
      {statusMessage && savedKey && (
        <div className="mt-3.5 p-3 rounded-xl bg-emerald-950/25 border border-emerald-500/40 text-emerald-300 text-xs font-mono flex items-center gap-2 animate-fadeIn">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{statusMessage}</span>
        </div>
      )}
    </div>
  );
};
