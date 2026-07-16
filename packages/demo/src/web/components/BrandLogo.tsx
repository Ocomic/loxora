export function BrandLogo() {
  return (
    <span className="brand-lockup" aria-hidden="true">
      <img
        className="brand-logo-image"
        src="/loxora-logo.png"
        alt=""
        decoding="async"
        fetchPriority="high"
      />
    </span>
  );
}
