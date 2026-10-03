import React, { useState } from 'react';

interface NizamTurkiyeLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

export const NizamTurkiyeLogo: React.FC<NizamTurkiyeLogoProps> = ({
  className = 'w-10 h-10',
  size,
}) => {
  const [hasError, setHasError] = useState(false);

  // If the PNG image loads properly, render the actual uploaded image
  if (!hasError) {
    return (
      <img
        src="/assets/logo.png"
        alt="Nizam-ı Türkiye Logosu"
        className={`object-contain shrink-0 select-none drop-shadow-[0_2px_12px_rgba(223,178,83,0.4)] ${className}`}
        style={size ? { width: size, height: size } : undefined}
        onError={() => setHasError(true)}
      />
    );
  }

  // Graceful vector fallback if image is missing
  return (
    <svg
      viewBox="0 0 500 500"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={size ? { width: size, height: size } : undefined}
    >
      <defs>
        <linearGradient id="goldGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF2A3" />
          <stop offset="30%" stopColor="#DFB253" />
          <stop offset="60%" stopColor="#9C712B" />
          <stop offset="85%" stopColor="#E5C158" />
          <stop offset="100%" stopColor="#875E19" />
        </linearGradient>

        <linearGradient id="goldGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#845D1C" />
          <stop offset="35%" stopColor="#E8CA72" />
          <stop offset="70%" stopColor="#FFF7C2" />
          <stop offset="100%" stopColor="#B38634" />
        </linearGradient>

        <radialGradient id="globeDark" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#253540" />
          <stop offset="80%" stopColor="#10181D" />
          <stop offset="100%" stopColor="#080C0E" />
        </radialGradient>

        <linearGradient id="crimsonRed" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF334B" />
          <stop offset="100%" stopColor="#BA1426" />
        </linearGradient>
      </defs>

      <circle cx="250" cy="250" r="235" fill="#0D1317" stroke="url(#goldGrad1)" strokeWidth="6" />
      <circle cx="250" cy="275" r="115" fill="url(#globeDark)" stroke="url(#goldGrad1)" strokeWidth="4" />

      {/* Crescent */}
      <path
        d="M 250 40 C 285 40, 305 65, 305 95 C 305 130, 275 150, 250 150 C 225 150, 195 130, 195 95 C 195 65, 215 40, 250 40 Z"
        fill="url(#goldGrad1)"
      />
      <polygon
        points="250,60 254,72 266,72 257,79 260,91 250,84 240,91 243,79 234,72 246,72"
        fill="url(#goldGrad2)"
      />

      {/* Banner with text */}
      <path
        d="M 60 380 Q 250 355, 440 380 L 430 425 Q 250 445, 70 425 Z"
        fill="#141C21"
        stroke="url(#goldGrad1)"
        strokeWidth="4"
      />
      <text
        x="250"
        y="412"
        textAnchor="middle"
        fill="url(#goldGrad2)"
        fontFamily="serif"
        fontWeight="900"
        fontSize="28"
        letterSpacing="4"
      >
        NİZAM-I TÜRKİYE
      </text>
    </svg>
  );
};
