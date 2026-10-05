import {
  createContext,
  type FormEvent,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useState,
} from "react";
import { post } from "../api.js";
import { useLabels, useLanguage } from "../i18n.js";
import type { AssistantReply } from "../types.js";

/**
 * The Xora input bar (RFC-011 section 8, Milestone 13): at the bottom of every screen in
 * normal mode. In script mode the server answers with a fixed reply key; the text is in the
 * labels. Messages are not stored. Empty states open the bar with the answer for their topic.
 */
interface Exchange {
  readonly question: string;
  readonly reply: AssistantReply["reply"] | null;
  readonly failed: string | null;
}

const XoraContext = createContext<{ ask: (text: string, topic?: string) => void }>({
  ask: () => undefined,
});

export function useXora() {
  return useContext(XoraContext);
}

export function XoraProvider({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  const [exchange, setExchange] = useState<Exchange | null>(null);
  const [busy, setBusy] = useState(false);
  const ask = useCallback(
    async (text: string, topic?: string) => {
      setBusy(true);
      try {
        const answer = await post<AssistantReply>("/api/assistant/message", {
          text,
          language,
          ...(topic ? { topic } : {}),
        });
        setExchange({ question: text, reply: answer.reply ?? null, failed: null });
      } catch (error) {
        setExchange({
          question: text,
          reply: null,
          failed: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusy(false);
      }
    },
    [language],
  );
  return (
    <XoraContext.Provider value={{ ask: (text, topic) => void ask(text, topic) }}>
      {children}
      <XoraBar
        exchange={exchange}
        busy={busy}
        onSend={(text) => void ask(text)}
        onClose={() => setExchange(null)}
      />
    </XoraContext.Provider>
  );
}

function XoraBar({
  exchange,
  busy,
  onSend,
  onClose,
}: {
  exchange: Exchange | null;
  busy: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}) {
  const t = useLabels();
  const id = useId();
  const [text, setText] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setText("");
  };
  return (
    <section className="xora-bar" aria-label="Xora">
      {exchange ? (
        <div className="xora-exchange" aria-live="polite">
          <p className="xora-question">{exchange.question}</p>
          <p className="xora-line">
            {exchange.reply
              ? t.xora.replies[exchange.reply]
              : t.setup.failed(exchange.failed ?? "")}
          </p>
          <button type="button" className="button button-quiet" onClick={onClose}>
            {t.xora.close}
          </button>
        </div>
      ) : null}
      <form className="xora-form" onSubmit={submit}>
        <label htmlFor={id} className="visually-hidden">
          {t.xora.bar}
        </label>
        <span className="xora-mark" aria-hidden="true">
          Xora
        </span>
        <input
          id={id}
          value={text}
          maxLength={2000}
          placeholder={t.xora.placeholder}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className="button" disabled={busy || !text.trim()}>
          {t.xora.send}
        </button>
      </form>
      <small className="muted xora-note">{t.xora.notStored}</small>
    </section>
  );
}
