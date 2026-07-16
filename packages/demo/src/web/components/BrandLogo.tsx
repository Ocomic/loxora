import { useId } from "react";

export function BrandLogo() {
  const gradientId = useId();
  return (
    <span className="brand-lockup" aria-hidden="true">
      <svg className="brand-mark" viewBox="0 0 58 52">
        <title>Loxora elephant circuit mark</title>
        <defs>
          <linearGradient id={gradientId} x1="8" y1="6" x2="48" y2="46">
            <stop offset="0" stopColor="#16e7ff" />
            <stop offset="0.52" stopColor="#1677ff" />
            <stop offset="1" stopColor="#6d21ff" />
          </linearGradient>
        </defs>
        <path
          className="brand-orbit"
          d="M7 30C8 12 26 3 42 10c10 5 13 17 10 28"
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeLinecap="round"
          strokeWidth="2.4"
        />
        <path
          d="M8 27c0-8 6-14 14-14 7 0 12 4 14 10 5 1 8 5 8 10v4c0 3 2 5 5 5 2 0 4-1 5-3-1 7-5 11-11 11-7 0-11-5-11-12v-8c0-3-2-5-5-5v13c0 7-4 11-10 11C10 49 6 44 6 37c0-4 1-7 2-10Z"
          fill={`url(#${gradientId})`}
        />
        <path d="M15 22c5-4 11-3 15 2-7-1-11 2-15 7Z" fill="#061025" opacity="0.75" />
        <circle cx="35" cy="14" r="2.6" fill="#16e7ff" />
        <circle cx="43" cy="18" r="2.3" fill="#20c8ff" />
        <circle cx="47" cy="26" r="2.1" fill="#278cff" />
        <path d="m35 14 8 4 4 8-7 5" fill="none" stroke="#22c7ff" strokeWidth="1.5" />
      </svg>
      <span className="brand-wordmark">Loxora</span>
    </span>
  );
}
