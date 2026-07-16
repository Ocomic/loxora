import { Link } from "react-router-dom";
import { useDemoState } from "./DemoState.js";
import { withMode } from "./DemoActionButton.js";

interface BreadcrumbProps {
  readonly path: {
    readonly segments: readonly {
      readonly kind?: string;
      readonly id: string;
      readonly label: string;
    }[];
  };
}

export function Breadcrumb({ path }: BreadcrumbProps) {
  const { mode } = useDemoState();
  const project =
    path.segments.find((segment) => segment.kind === "Project")?.id ?? path.segments[0]?.id;
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {path.segments.map((segment, index) => {
        const href =
          segment.kind === "Project"
            ? `/projects/${segment.id}`
            : segment.kind === "Space"
              ? `/projects/${project}/spaces/${segment.id}`
              : segment.kind === "Collection"
                ? `/projects/${project}/collections/${segment.id}`
                : null;
        return (
          <span key={`${segment.kind}:${segment.id}`}>
            {href ? <Link to={withMode(href, mode)}>{segment.label}</Link> : segment.label}
            {index < path.segments.length - 1 ? <span aria-hidden="true"> / </span> : null}
          </span>
        );
      })}
    </nav>
  );
}
