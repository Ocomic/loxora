import type { PropsWithChildren } from "react";

export function TechnicalDetails({
  children,
  label = "Technical details",
}: PropsWithChildren<{ label?: string }>) {
  return (
    <details className="technical-details">
      <summary>{label}</summary>
      {children}
    </details>
  );
}
