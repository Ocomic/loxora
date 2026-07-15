interface BreadcrumbProps {
  readonly path: { readonly segments: readonly { readonly id: string; readonly label: string }[] };
}

export function Breadcrumb({ path }: BreadcrumbProps) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {path.segments.map((segment) => (
        <span key={segment.id}>{segment.label} / </span>
      ))}
    </nav>
  );
}
