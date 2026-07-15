import type { PropsWithChildren } from "react";
import { NavLink } from "react-router-dom";
export function Layout({ children }: PropsWithChildren) {
  return (
    <>
      <header>
        <NavLink to="/" className="brand">
          Loxora
        </NavLink>
        <nav aria-label="Demo navigation">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/reviews">Review Inbox</NavLink>
          <NavLink to="/impact">Impact</NavLink>
          <NavLink to="/context">Context Package</NavLink>
          <NavLink to="/proof">MCP proof</NavLink>
        </nav>
      </header>
      <main>{children}</main>
    </>
  );
}
