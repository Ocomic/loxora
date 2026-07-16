export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="state-panel" aria-live="polite" aria-atomic="true">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-panel error" role="alert">
      <strong>Something went wrong</strong>
      <p>{message}</p>
      <p>Your project knowledge is unchanged.</p>
      {retry ? (
        <button className="button secondary" type="button" onClick={retry}>
          Try again
        </button>
      ) : null}
    </div>
  );
}
export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="state-panel empty">
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  );
}
