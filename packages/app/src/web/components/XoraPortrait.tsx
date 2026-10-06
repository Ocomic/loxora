/**
 * Xora's picture (Milestone 14 section 9; provenance in `public/xora/PROVENANCE.md`). It is
 * dimmed until the conversation starts.
 */
export function XoraPortrait({ dimmed, label }: { dimmed: boolean; label: string }) {
  return (
    <img
      className={`xora-portrait${dimmed ? " dimmed" : ""}`}
      src="/xora/xora.webp"
      width={720}
      height={900}
      alt={label}
    />
  );
}
