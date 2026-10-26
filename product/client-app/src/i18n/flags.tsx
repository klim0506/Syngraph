// Small flags for the language picker. Inline SVG: emoji flags do not show on Windows.
import type { ReactElement } from "react";
import type { Lang } from ".";

const W = 21;
const H = 15;

export const FLAGS: Record<Lang, ReactElement> = {
  // United Kingdom
  en: (
    <svg viewBox="0 0 60 30" width={W} height={H} aria-hidden>
      <clipPath id="flag-gb">
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath="url(#flag-gb)" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  ),
  // Russia
  ru: (
    <svg viewBox="0 0 3 3" width={W} height={H} preserveAspectRatio="none" aria-hidden>
      <rect width="3" height="1" fill="#fff" />
      <rect y="1" width="3" height="1" fill="#0039A6" />
      <rect y="2" width="3" height="1" fill="#D52B1E" />
    </svg>
  ),
  // France
  fr: (
    <svg viewBox="0 0 3 2" width={W} height={H} preserveAspectRatio="none" aria-hidden>
      <rect width="1" height="2" fill="#002654" />
      <rect x="1" width="1" height="2" fill="#fff" />
      <rect x="2" width="1" height="2" fill="#CE1126" />
    </svg>
  ),
  // United Arab Emirates, for Arabic
  ar: (
    <svg viewBox="0 0 12 6" width={W} height={H} preserveAspectRatio="none" aria-hidden>
      <rect width="12" height="2" fill="#00732F" />
      <rect y="2" width="12" height="2" fill="#fff" />
      <rect y="4" width="12" height="2" fill="#000" />
      <rect width="3" height="6" fill="#FF0000" />
    </svg>
  ),
};
