import React from 'react';
import { Swords } from 'lucide-react';

interface FlagProps {
  className?: string;
}

/**
 * Türkiye Bayrağı (TR) - 🇹🇷
 */
export const TurkeyFlagSVG: React.FC<FlagProps> = ({ className = "w-5 h-3.5" }) => (
  <svg
    viewBox="0 0 1200 800"
    className={`rounded-[2px] inline-block shrink-0 ${className}`}
    aria-label="Türkiye Bayrağı"
  >
    <rect width="1200" height="800" fill="#E30A17" />
    <circle cx="420" cy="400" r="200" fill="#ffffff" />
    <circle cx="470" cy="400" r="160" fill="#E30A17" />
    <polygon
      fill="#ffffff"
      points="583,400 706,440 630,335 630,465 706,360"
      transform="rotate(-19.3 583 400)"
    />
  </svg>
);

/**
 * Birleşik Arap Emirlikleri Bayrağı (AE) - 🇦🇪
 */
export const UAEFlagSVG: React.FC<FlagProps> = ({ className = "w-5 h-3.5" }) => (
  <svg
    viewBox="0 0 1200 600"
    className={`rounded-[2px] inline-block shrink-0 ${className}`}
    aria-label="Birleşik Arap Emirlikleri Bayrağı"
  >
    {/* Horizontal green, white, black stripes */}
    <rect x="300" y="0" width="900" height="200" fill="#00732F" />
    <rect x="300" y="200" width="900" height="200" fill="#FFFFFF" />
    <rect x="300" y="400" width="900" height="200" fill="#000000" />
    {/* Vertical red hoist band */}
    <rect x="0" y="0" width="300" height="600" fill="#FF0000" />
  </svg>
);

/**
 * Azerbaycan Bayrağı (AZ) - 🇦🇿
 */
export const AzerbaijanFlagSVG: React.FC<FlagProps> = ({ className = "w-5 h-3.5" }) => (
  <svg
    viewBox="0 0 1200 600"
    className={`rounded-[2px] inline-block shrink-0 ${className}`}
    aria-label="Azerbaycan Bayrağı"
  >
    <rect width="1200" height="200" fill="#00B5E2" />
    <rect y="200" width="1200" height="200" fill="#ED2939" />
    <rect y="400" width="1200" height="200" fill="#3F9C35" />
    <circle cx="580" cy="300" r="80" fill="#ffffff" />
    <circle cx="600" cy="300" r="65" fill="#ED2939" />
    <circle cx="680" cy="300" r="28" fill="#ffffff" />
  </svg>
);

/**
 * Kamerun Bayrağı (CM) - 🇨🇲
 */
export const CameroonFlagSVG: React.FC<FlagProps> = ({ className = "w-5 h-3.5" }) => (
  <svg
    viewBox="0 0 900 600"
    className={`rounded-[2px] inline-block shrink-0 ${className}`}
    aria-label="Kamerun Bayrağı"
  >
    <rect width="300" height="600" fill="#007A5E" />
    <rect x="300" width="300" height="600" fill="#CE1126" />
    <rect x="600" width="300" height="600" fill="#FCD116" />
    {/* Golden star in red stripe center */}
    <polygon
      fill="#FCD116"
      points="450,230 467,285 525,285 478,320 496,375 450,340 404,375 422,320 375,285 433,285"
    />
  </svg>
);

/**
 * Ordu Sancağı / Bayrağı SVG (Askeri Birlik Sancağı)
 */
export const ArmyFlagSVG: React.FC<FlagProps> = ({ className = "w-5 h-3.5" }) => (
  <svg
    viewBox="0 0 120 80"
    className={`rounded-[2px] inline-block shrink-0 ${className}`}
    aria-label="Ordu Sancağı"
  >
    <defs>
      <linearGradient id="armyFlagBg2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1e293b" />
        <stop offset="45%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
      <linearGradient id="armyGoldFringe2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fde047" />
        <stop offset="50%" stopColor="#eab308" />
        <stop offset="100%" stopColor="#ca8a04" />
      </linearGradient>
    </defs>
    <rect width="120" height="80" fill="url(#armyFlagBg2)" rx="2" />
    <rect x="2" y="2" width="116" height="76" fill="none" stroke="url(#armyGoldFringe2)" strokeWidth="2.5" rx="1.5" />
    <circle cx="6" cy="6" r="2" fill="#facc15" />
    <circle cx="114" cy="6" r="2" fill="#facc15" />
    <circle cx="6" cy="74" r="2" fill="#facc15" />
    <circle cx="114" cy="74" r="2" fill="#facc15" />
    <g transform="translate(60, 40)">
      <line x1="-24" y1="-18" x2="24" y2="18" stroke="#fef08a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="-24" cy="-18" r="2.5" fill="#eab308" />
      <line x1="-18" y1="-23" x2="-23" y2="-18" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
      <line x1="24" y1="-18" x2="-24" y2="18" stroke="#fef08a" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="24" cy="-18" r="2.5" fill="#eab308" />
      <line x1="18" y1="-23" x2="23" y2="-18" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
      <circle cx="0" cy="0" r="7" fill="#ca8a04" stroke="#fef08a" strokeWidth="1" />
      <polygon points="0,-12 3.5,-3.5 12,0 3.5,3.5 0,12 -3.5,3.5 -12,0 -3.5,-3.5" fill="#fef08a" />
    </g>
  </svg>
);

interface DestinationBadgeProps {
  target?: 'country' | 'mu';
  targetName?: string;
  countryCode?: string;
  muAvatarUrl?: string;
  count?: number;
  compact?: boolean;
}

export const DestinationBadge: React.FC<DestinationBadgeProps> = ({
  target = 'country',
  targetName,
  countryCode,
  muAvatarUrl,
  count,
  compact = false,
}) => {
  const isArmy = target === 'mu';
  const cCode = countryCode?.toUpperCase();
  const tNameLower = (targetName || '').toLowerCase();

  const isUAE =
    cCode === 'AE' ||
    tNameLower.includes('emirlik') ||
    tNameLower.includes('arap') ||
    tNameLower.includes('uae');

  const isAzerbaijan =
    cCode === 'AZ' ||
    tNameLower.includes('azer');

  const isCameroon =
    cCode === 'CM' ||
    tNameLower.includes('kamerun') ||
    tNameLower.includes('cameroon');

  // Render Flag/Logo icon
  const renderVisual = (flagClassName: string, avatarClassName: string) => {
    if (isArmy) {
      if (muAvatarUrl) {
        return (
          <img
            src={muAvatarUrl}
            alt={targetName || 'Ordu'}
            className={`${avatarClassName} rounded-xs object-cover border border-slate-300 dark:border-[#28323d] shrink-0 inline-block`}
            referrerPolicy="no-referrer"
          />
        );
      }
      return <ArmyFlagSVG className={flagClassName} />;
    }

    if (isUAE) {
      return <UAEFlagSVG className={flagClassName} />;
    }
    if (isAzerbaijan) {
      return <AzerbaijanFlagSVG className={flagClassName} />;
    }
    if (isCameroon) {
      return <CameroonFlagSVG className={flagClassName} />;
    }
    return <TurkeyFlagSVG className={flagClassName} />;
  };

  const displayName = isArmy
    ? (targetName || 'Turkic Tribe')
    : isUAE
    ? 'Birleşik Arap Emirlikleri'
    : isAzerbaijan
    ? 'Azerbaycan'
    : isCameroon
    ? 'Kamerun'
    : (targetName || 'Türkiye');

  const subLabel = isArmy ? 'Ordu Fonu' : 'Devlet Hazinesi';

  if (compact) {
    return (
      <span
        title={`${displayName} (${isArmy ? 'Ordu' : 'Ülke'})`}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium shrink-0 bg-[#1B262C] text-[#BBE1FA] border border-[#3282B8]/40"
      >
        {renderVisual('w-3.5 h-2.5', 'w-3.5 h-3.5')}
        <span>{isArmy ? 'Ordu' : displayName}</span>
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2.5">
      <div className="shrink-0 flex items-center">
        {renderVisual('w-6 h-4', 'w-6 h-6')}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-xs text-white truncate">
            {displayName}
          </span>
          <span
            className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-md uppercase tracking-wide border bg-[#1B262C] text-[#BBE1FA] border-[#3282B8]/40"
          >
            {isArmy ? 'Ordu' : 'Ülke'}
          </span>
          {count !== undefined && count > 1 && (
            <span className="text-[10px] text-[#BBE1FA]/80 font-medium">
              ({count} bağış)
            </span>
          )}
        </div>
        <div className="text-[10.5px] text-[#BBE1FA]/70 flex items-center gap-1 mt-0.5">
          {isArmy ? <Swords className="w-2.5 h-2.5 text-[#3282B8] shrink-0" /> : null}
          <span className="truncate">{subLabel}</span>
        </div>
      </div>
    </div>
  );
};
