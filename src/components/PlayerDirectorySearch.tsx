import React, { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, UserRound } from "lucide-react";
import { fetchTrackedPlayerDirectory, TrackedPlayerDirectoryEntry } from "../services/wareraApi";

interface PlayerDirectorySearchProps {
  onSelect: (userId: string) => void;
  onManualInput: (value: string) => void;
}

export const PlayerDirectorySearch: React.FC<PlayerDirectorySearchProps> = ({ onSelect, onManualInput }) => {
  const [players, setPlayers] = useState<TrackedPlayerDirectoryEntry[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    fetchTrackedPlayerDirectory()
      .then((directory) => { if (active) setPlayers(directory); })
      .catch(() => { if (active) setDirectoryError(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    if (normalized.length < 2) return [];
    return players
      .filter((player) => player.username.toLocaleLowerCase("tr-TR").includes(normalized) || player.userId.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [players, query]);

  const handleChange = (value: string) => {
    setQuery(value);
    setOpen(true);
    onManualInput(value);
  };

  const selectPlayer = (player: TrackedPlayerDirectoryEntry) => {
    setQuery(player.username);
    setOpen(false);
    onSelect(player.userId);
  };

  return (
    <div className="relative">
      <label htmlFor="tracked-player-search" className="mb-2 block text-sm font-semibold text-[#BBE1FA]">Oyuncu adı veya WarEra ID’si</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#BBE1FA]/40" />
        <input
          id="tracked-player-search"
          value={query}
          onChange={(event) => handleChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          placeholder="Oyuncu adı veya userId ara..."
          autoComplete="off"
          className="w-full rounded-xl border border-[#3282B8]/25 bg-[#11191E] py-3 pl-10 pr-10 text-sm text-white outline-none placeholder:text-[#BBE1FA]/35 focus:border-cyan-400/60"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && matches.length > 0}
          aria-controls="tracked-player-results"
        />
        {loading && <LoaderCircle className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-cyan-300" />}
      </div>
      {open && matches.length > 0 && (
        <ul id="tracked-player-results" role="listbox" className="absolute z-20 mt-2 max-h-72 w-full overflow-auto rounded-xl border border-[#3282B8]/25 bg-[#141C21] p-1.5 shadow-2xl">
          {matches.map((player) => (
            <li key={player.userId} role="option" aria-selected="false">
              <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selectPlayer(player)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#1B2B34]">
                <UserRound className="h-4 w-4 shrink-0 text-cyan-300" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-white">{player.username}</span><span className="block truncate font-mono text-[10px] text-[#BBE1FA]/45">{player.userId}</span></span>
                <span className="max-w-32 truncate text-right text-[10px] text-[#BBE1FA]/40">{player.armyNames.join(", ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-[#BBE1FA]/40">
        {directoryError ? "Oyuncu listesi şu an alınamadı; userId’yi elle girebilirsin." : loading ? "Takip edilen orduların oyuncu listesi yükleniyor..." : `${players.length} takip edilen oyuncu arasından isimle arayabilirsin.`}
      </p>
    </div>
  );
};
