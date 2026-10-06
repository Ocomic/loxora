import { useId } from "react";

/**
 * A neutral placeholder for Xora's picture (Milestone 14 section 9). The picture supplied by
 * the decision owner replaces it once its provenance is recorded.
 */
export function XoraPortrait({ dimmed, label }: { dimmed: boolean; label: string }) {
  // React ids contain characters that a url(#…) reference does not accept.
  const fill = `xora-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className={`xora-portrait${dimmed ? " dimmed" : ""}`}
      viewBox="0 0 200 240"
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#38d9ff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#f05bd8" stopOpacity="0.12" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="86" r="44" fill={`url(#${fill})`} stroke="#38d9ff" strokeWidth="2" />
      <path
        d="M24 236c4-52 36-86 76-86s72 34 76 86"
        fill={`url(#${fill})`}
        stroke="#38d9ff"
        strokeWidth="2"
      />
      <path d="M58 70c10-30 74-30 84 0" fill="none" stroke="#f05bd8" strokeWidth="2" />
    </svg>
  );
}
