import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ApiError, api, post, usePolling } from "../api.js";
import { useLabels, useLanguage } from "../i18n.js";
import { chatName, clockTime, eventLabel, relativeTime, waitReasonLabel } from "../labels.js";
import type {
  ChatEntry,
  ChatList,
  ChatSummary,
  ChatThread,
  ChatView,
  MessageEntry,
  MessagePreview,
  PostedMessage,
} from "../types.js";
import { eventText, StatePanel } from "./MissionDetailView.js";
import { StatusBadge } from "./StatusBadge.js";

/**
 * The bridge as the ship's chat (RFC-011 Amendment 2, Milestone 15 section 3): the side list,
 * the open chat, its thread next to it, and a details panel. Stored messages and derived
 * entries come merged from the server; the client polls every 5 seconds (RFC-010 section 6).
 */

const enc = encodeURIComponent;

export function bridgePath(address: string, thread?: string | null, message?: string | null) {
  const query = new URLSearchParams();
  if (thread) query.set("thread", thread);
  if (message) query.set("message", message);
  const search = query.toString();
  return `/bridge/${enc(address)}${search ? `?${search}` : ""}`;
}

export function messageLink(id: string): string {
  return `${window.location.origin}/bridge/m/${id}`;
}

type Panel = "none" | "side" | "details";

export function Bridge() {
  const t = useLabels();
  const params = useParams();
  const [search] = useSearchParams();
  const navigate = useNavigate();
  const address = params.address ?? "ship";
  const threadKey = search.get("thread");
  const highlight = search.get("message");
  const list = usePolling<ChatList>("/api/chats");
  const view = usePolling<ChatView>(
    `/api/chats/${enc(address)}${threadKey ? `?thread=${enc(threadKey)}` : ""}`,
  );
  const [panel, setPanel] = useState<Panel>("none");
  const titleId = useId();
  // Opening or closing a thread keeps the chat on screen (and its draft) while it reloads.
  const last = useRef<ChatView | null>(null);
  if (view.data) last.current = view.data;
  const stale = last.current?.chat.address === address ? last.current : null;
  const shown: ChatView | null =
    view.data ??
    (stale && threadKey !== (stale.thread?.key ?? null) ? withoutThread(stale) : stale);
  const reload = () => {
    void list.reload();
    void view.reload();
  };
  const open = (target: string, thread?: string | null, message?: string | null) => {
    setPanel("none");
    navigate(bridgePath(target, thread, message));
  };

  useEffect(() => {
    if (!highlight || !view.data) return;
    document.getElementById(`message-${highlight}`)?.scrollIntoView({ block: "center" });
  }, [highlight, view.data]);

  // New entries arrive at the bottom; follow them unless a linked message is being shown.
  const chatCount = view.data?.entries.length ?? 0;
  const threadCount = view.data?.thread?.entries.length ?? 0;
  const direct = view.data?.chat.kind === "direct";
  useEffect(() => {
    if (highlight || (chatCount === 0 && threadCount === 0)) return;
    const panes = direct ? [".bridge-thread"] : [".bridge-chat", ".bridge-thread"];
    for (const selector of panes) {
      const pane = document.querySelector(selector);
      if (pane) pane.scrollTop = pane.scrollHeight;
    }
  }, [highlight, chatCount, threadCount, direct]);

  return (
    <div className="bridge" data-panel={panel}>
      <SideList
        list={list.data}
        current={address}
        onOpen={(target) => open(target)}
        onCreated={reload}
      />
      <section className="bridge-chat" aria-labelledby={titleId}>
        {view.error ? (
          <div className="panel" role="alert">
            <p>
              {view.error.status === 404 ? t.bridge.notFound : t.bridge.failed(view.error.message)}
            </p>
            <Link to="/bridge">{t.bridge.shipChannel}</Link>
          </div>
        ) : !shown ? (
          <p className="muted">{t.bridge.loading}</p>
        ) : (
          <ChatPane
            titleId={titleId}
            view={shown}
            list={list.data}
            highlight={highlight}
            onOpen={open}
            onPanel={setPanel}
            reload={reload}
          />
        )}
      </section>
      {shown?.thread ? (
        <ThreadPane
          view={shown}
          thread={shown.thread}
          highlight={highlight}
          onClose={() => open(address)}
          onOpen={open}
          reload={reload}
        />
      ) : null}
      {shown ? <DetailsPanel view={shown} onClose={() => setPanel("none")} /> : null}
    </div>
  );
}

function withoutThread({ thread: _thread, ...rest }: ChatView): ChatView {
  return rest;
}

/** The side list (Milestone 15 section 3): decisions first, in red with a counter. */
function SideList({
  list,
  current,
  onOpen,
  onCreated,
}: {
  list: ChatList | null;
  current: string;
  onOpen: (address: string) => void;
  onCreated: () => void;
}) {
  const t = useLabels();
  const [creating, setCreating] = useState(false);
  const item = (chat: Pick<ChatSummary, "address" | "kind" | "name">, extra?: ReactNode) => (
    <li key={chat.address}>
      <Link
        to={bridgePath(chat.address)}
        className={`chat-link chat-${chat.kind}`}
        aria-current={chat.address === current ? "page" : undefined}
        onClick={(event) => {
          event.preventDefault();
          onOpen(chat.address);
        }}
      >
        <span>{chatName(t, chat)}</span>
        {extra}
      </Link>
    </li>
  );
  return (
    <nav className="bridge-side" aria-label={t.bridge.chats}>
      {list ? (
        <>
          <ul className="chat-list">
            {item(
              { address: list.decisions.address, kind: "decisions", name: null },
              list.decisions.count > 0 ? (
                <span
                  className="count count-alert"
                  title={t.bridge.decisionsCount(list.decisions.count)}
                >
                  <span className="visually-hidden">
                    {t.bridge.decisionsCount(list.decisions.count)}
                  </span>
                  <span aria-hidden="true">{list.decisions.count}</span>
                </span>
              ) : null,
            )}
          </ul>
          <h2 className="side-title">{t.bridge.channels}</h2>
          <ul className="chat-list">{list.channels.map((chat) => item(chat))}</ul>
          {list.writable ? (
            creating ? (
              <NewChannel
                projects={list.projects}
                onDone={(address) => {
                  setCreating(false);
                  onCreated();
                  if (address) onOpen(address);
                }}
              />
            ) : (
              <button
                type="button"
                className="button button-quiet side-button"
                onClick={() => setCreating(true)}
              >
                {t.bridge.newChannel}
              </button>
            )
          ) : null}
          <h2 className="side-title">{t.bridge.direct}</h2>
          <ul className="chat-list">
            {list.direct.map((chat) =>
              item(
                chat,
                <span className="presence" title={t.bridge.xoraStatus} aria-hidden="true" />,
              ),
            )}
          </ul>
          <h2 className="side-title">{t.bridge.crew}</h2>
          <p className="muted side-note">{t.bridge.noCrew}</p>
          <Link className="chat-link side-missions" to="/missions">
            {t.bridge.missions}
          </Link>
        </>
      ) : (
        <p className="muted">{t.bridge.loading}</p>
      )}
    </nav>
  );
}

function NewChannel({
  projects,
  onDone,
}: {
  projects: ChatList["projects"];
  onDone: (address: string | null) => void;
}) {
  const t = useLabels();
  const nameId = useId();
  const projectId = useId();
  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const created = await post<{ address: string }>("/api/chats", {
        name,
        ...(project ? { projectId: project } : {}),
      });
      onDone(created.address);
    } catch (value) {
      setError(t.bridge.failed(value instanceof Error ? value.message : String(value)));
    }
  };
  return (
    <form className="channel-form" onSubmit={submit}>
      <label htmlFor={nameId}>{t.bridge.channelName}</label>
      <input
        id={nameId}
        value={name}
        maxLength={80}
        onChange={(event) => setName(event.target.value)}
      />
      <label htmlFor={projectId}>{t.bridge.channelProject}</label>
      <select id={projectId} value={project} onChange={(event) => setProject(event.target.value)}>
        <option value="">{t.bridge.noProject}</option>
        {projects.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      {error ? <p className="action-error">{error}</p> : null}
      <div className="action-row">
        <button type="submit" className="button" disabled={!name.trim()}>
          {t.bridge.create}
        </button>
        <button type="button" className="button button-quiet" onClick={() => onDone(null)}>
          {t.bridge.cancel}
        </button>
      </div>
    </form>
  );
}

function ChatPane({
  titleId,
  view,
  list,
  highlight,
  onOpen,
  onPanel,
  reload,
}: {
  titleId: string;
  view: ChatView;
  list: ChatList | null;
  highlight: string | null;
  onOpen: (address: string, thread?: string | null, message?: string | null) => void;
  onPanel: (panel: Panel) => void;
  reload: () => void;
}) {
  const t = useLabels();
  const { chat } = view;
  const name = chatName(t, chat);
  const direct = chat.kind === "direct";
  const canThread = direct || chat.kind === "topic";
  return (
    <>
      <header className={`chat-header chat-header-${chat.kind}`}>
        <button
          type="button"
          className="button button-quiet narrow-only"
          onClick={() => onPanel("side")}
        >
          {t.bridge.showChats}
        </button>
        <h1 id={titleId}>{name}</h1>
        {chat.archived ? <span className="badge badge-neutral">{t.bridge.archived}</span> : null}
        <ChatMenu view={view} onChanged={reload} onArchived={() => onOpen("ship")} />
        <button
          type="button"
          className="button button-quiet narrow-only"
          onClick={() => onPanel("details")}
        >
          {t.bridge.showDetails}
        </button>
      </header>
      {list && !list.available ? (
        <output className="bridge-note bridge-note-warning">{t.bridge.migration}</output>
      ) : chat.kind === "decisions" ? (
        <p className="bridge-note bridge-note-alert">{t.bridge.decisionsNote}</p>
      ) : null}
      {direct && view.entries.length > 0 ? (
        <h2 className="chat-subtitle">{t.bridge.topics}</h2>
      ) : null}
      {view.entries.length === 0 ? (
        <p className="muted chat-empty">{t.bridge.empty[chat.kind]}</p>
      ) : (
        <ol className="chat-entries" aria-live="polite" aria-relevant="additions">
          {view.entries.map((entry) => (
            <EntryView
              key={`${entry.type}-${entry.id}`}
              entry={entry}
              chat={view.chat}
              highlight={highlight}
              open={view.thread?.key}
              canThread={canThread}
              onOpen={onOpen}
              reload={reload}
            />
          ))}
        </ol>
      )}
      <Composer
        chat={view.chat}
        available={list?.available ?? true}
        placeholder={direct ? t.bridge.placeholderXora : t.bridge.placeholder(name)}
        onPosted={(posted) => {
          reload();
          if (direct && posted.thread) onOpen(chat.address, posted.thread);
        }}
      />
    </>
  );
}

/** Rename and archive for task channels, "Clear chat" for the direct chat with Xora. */
function ChatMenu({
  view,
  onChanged,
  onArchived,
}: {
  view: ChatView;
  onChanged: () => void;
  onArchived: () => void;
}) {
  const t = useLabels();
  const nameId = useId();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(view.chat.name ?? "");
  const [error, setError] = useState<string | null>(null);
  const { chat } = view;
  if (!chat.writable || (chat.kind !== "topic" && chat.kind !== "direct")) return null;
  const run = async (path: string, body: Record<string, unknown> = {}) => {
    try {
      await post(`/api/chats/${enc(chat.address)}/${path}`, body);
      setError(null);
      return true;
    } catch (value) {
      setError(t.bridge.failed(value instanceof Error ? value.message : String(value)));
      return false;
    }
  };
  if (renaming) {
    return (
      <form
        className="rename-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await run("rename", { name })) {
            setRenaming(false);
            onChanged();
          }
        }}
      >
        <label htmlFor={nameId} className="visually-hidden">
          {t.bridge.channelName}
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
        <button type="submit" className="button" disabled={!name.trim()}>
          {t.bridge.save}
        </button>
        <button type="button" className="button button-quiet" onClick={() => setRenaming(false)}>
          {t.bridge.cancel}
        </button>
        {error ? <span className="action-error">{error}</span> : null}
      </form>
    );
  }
  return (
    <details className="menu">
      <summary aria-label={t.bridge.channelMenu}>⋯</summary>
      <div className="menu-items">
        {chat.kind === "topic" ? (
          <>
            <button
              type="button"
              className="button button-quiet"
              onClick={() => {
                setName(chat.name ?? "");
                setRenaming(true);
              }}
            >
              {t.bridge.rename}
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={async () => {
                if (!window.confirm(t.bridge.archiveConfirm(chat.name ?? ""))) return;
                if (await run("archive")) {
                  onChanged();
                  onArchived();
                }
              }}
            >
              {t.bridge.archive}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="button button-danger"
            onClick={async () => {
              if (!window.confirm(t.bridge.clearConfirm)) return;
              if (await run("clear")) onChanged();
            }}
          >
            {t.bridge.clear}
          </button>
        )}
        {error ? <p className="action-error">{error}</p> : null}
      </div>
    </details>
  );
}

function EntryView({
  entry,
  chat,
  highlight,
  open,
  canThread,
  onOpen,
  reload,
}: {
  entry: ChatEntry;
  chat: ChatView["chat"];
  highlight: string | null;
  open: string | undefined;
  canThread: boolean;
  onOpen: (address: string, thread?: string | null, message?: string | null) => void;
  reload: () => void;
}) {
  const t = useLabels();
  switch (entry.type) {
    case "message":
      return (
        <MessageView
          entry={entry}
          chat={chat}
          highlight={highlight}
          threadKey={canThread ? `message:${entry.id}` : null}
          active={open === `message:${entry.id}`}
          onOpen={onOpen}
          reload={reload}
        />
      );
    case "event":
      return (
        <li className="entry entry-system">
          <Avatar kind="shipComputer" name={t.bridge.shipComputer} />
          <div className="entry-body">
            <EntryHead name={t.bridge.shipComputer} at={entry.at} />
            <p>
              {t.bridge.events[entry.event]({
                project: entry.project.name,
                mission: entry.mission?.title ?? "",
                title: entry.title ?? "",
              })}
            </p>
            <div className="entry-links">
              {entry.thread ? (
                <button
                  type="button"
                  className="link-button"
                  onClick={() => onOpen(entry.address, entry.thread)}
                >
                  {t.bridge.toThread}
                </button>
              ) : (
                <button type="button" className="link-button" onClick={() => onOpen(entry.address)}>
                  {t.bridge.toChannel}
                </button>
              )}
            </div>
          </div>
        </li>
      );
    case "mission":
      return (
        <li className={`entry entry-mission${open === entry.thread ? " entry-active" : ""}`}>
          <div className="mission-card">
            <div className="mission-card-head">
              <strong>{entry.mission.title}</strong>
              <StatusBadge state={entry.mission.state} waitReason={entry.mission.waitReason} />
            </div>
            {entry.mission.question ? (
              <p className="row-question">
                {t.overview.needsYou} {entry.mission.question}
              </p>
            ) : entry.mission.currentActivity ? (
              <p className="muted">{entry.mission.currentActivity}</p>
            ) : null}
            <div className="entry-links">
              <button
                type="button"
                className="link-button"
                onClick={() => onOpen(chat.address, entry.thread)}
              >
                {entry.replies > 0 ? t.bridge.replies(entry.replies) : t.bridge.openThread}
              </button>
              <Link to={`/missions/${entry.id}`}>{t.bridge.missionDetail}</Link>
              <span className="muted">{relativeTime(t, entry.at)}</span>
            </div>
          </div>
        </li>
      );
    case "attention":
      return (
        <li className="entry entry-attention">
          <div className="mission-card">
            <div className="mission-card-head">
              <strong>{entry.mission.title}</strong>
              <span className="badge badge-input">
                <span className="dot" aria-hidden="true" />
                {entry.waitReason ? waitReasonLabel(t, entry.waitReason) : t.bridge.waitsForYou}
              </span>
            </div>
            <p className="question">{entry.mission.question}</p>
            <div className="entry-links">
              <span className="tag">{entry.mission.project.name}</span>
              <button
                type="button"
                className="button"
                onClick={() => onOpen(entry.address, entry.thread)}
              >
                {t.bridge.toThread}
              </button>
              <span className="muted">{relativeTime(t, entry.at)}</span>
            </div>
          </div>
        </li>
      );
    case "missionEvent":
      return (
        <li className={`entry entry-event event-${entry.event.newState}`}>
          <span className="event-dot" aria-hidden="true" />
          <span>
            <strong>
              {eventLabel(t, entry.event.type)}
              {entry.event.type === "Waiting" && entry.event.waitReason
                ? ` · ${waitReasonLabel(t, entry.event.waitReason)}`
                : ""}
            </strong>{" "}
            <span className="muted">{eventText(t, entry.event as never)}</span>
          </span>
          <time className="muted" dateTime={entry.at}>
            {clockTime(t, entry.at)}
          </time>
        </li>
      );
  }
}

function MessageView({
  entry,
  chat,
  highlight,
  threadKey,
  active,
  onOpen,
  reload,
  isRoot = false,
}: {
  entry: MessageEntry;
  chat: ChatView["chat"];
  highlight: string | null;
  threadKey: string | null;
  active: boolean;
  onOpen: (address: string, thread?: string | null, message?: string | null) => void;
  reload: () => void;
  isRoot?: boolean;
}) {
  const t = useLabels();
  const [note, setNote] = useState<string | null>(null);
  const highlighted = highlight === entry.id;
  const author = entry.author.role === "shipComputer" ? t.bridge.shipComputer : entry.author.name;
  const remove = async (thread: boolean) => {
    if (!window.confirm(thread ? t.bridge.deleteThreadConfirm : t.bridge.deleteConfirm)) return;
    try {
      await post(`/api/chats/messages/${enc(entry.id)}/delete`, thread ? { thread: true } : {});
      reload();
    } catch (value) {
      setNote(t.bridge.failed(value instanceof Error ? value.message : String(value)));
    }
  };
  const copy = async () => {
    const link = messageLink(entry.id);
    try {
      await navigator.clipboard.writeText(link);
      setNote(t.bridge.linkCopied);
    } catch {
      setNote(t.bridge.copyFailed(link));
    }
  };
  const deletable = chat.writable && !entry.deleted;
  // A deleted topic root keeps "Delete topic" while it still has replies.
  const threadDeletable =
    chat.writable && isRoot && threadKey !== null && (!entry.deleted || entry.replies > 0);
  return (
    <li
      id={`message-${entry.id}`}
      className={`entry entry-message${highlighted ? " entry-highlighted" : ""}${active ? " entry-active" : ""}${isRoot ? " entry-root" : ""}`}
    >
      <Avatar kind={entry.author.role} name={author} />
      <div className="entry-body">
        <EntryHead name={author} at={entry.at} />
        {entry.deleted ? (
          <p className="muted entry-deleted">{t.bridge.deleted}</p>
        ) : (
          <>
            <MessageText text={entry.body ?? ""} />
            {entry.links.map((link) => (
              <PreviewCard key={link.id} preview={link} />
            ))}
          </>
        )}
        <div className="entry-links">
          {threadKey && !isRoot && (entry.replies > 0 || chat.writable) ? (
            <button
              type="button"
              className="link-button"
              onClick={() => onOpen(chat.address, threadKey)}
            >
              {entry.replies > 0 ? t.bridge.replies(entry.replies) : t.bridge.reply}
            </button>
          ) : null}
          {entry.deleted && !threadDeletable ? null : (
            <details className="menu">
              <summary aria-label={t.bridge.messageMenu}>⋯</summary>
              <div className="menu-items">
                {entry.deleted ? null : (
                  <button type="button" className="button button-quiet" onClick={() => void copy()}>
                    {t.bridge.copyLink}
                  </button>
                )}
                {deletable ? (
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void remove(false)}
                  >
                    {t.bridge.delete}
                  </button>
                ) : null}
                {threadDeletable ? (
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={() => void remove(true)}
                  >
                    {t.bridge.deleteThread}
                  </button>
                ) : null}
              </div>
            </details>
          )}
          {note ? <output className="muted">{note}</output> : null}
        </div>
      </div>
    </li>
  );
}

const LINK_PATTERN = /(https?:\/\/[^\s]+?\/bridge\/m\/[A-Za-z0-9-]+|@[Xx][Oo][Rr][Aa]\b)/g;

/** The message text with message links as links and @Xora marked. */
function MessageText({ text }: { text: string }) {
  const parts = text.split(LINK_PATTERN);
  return (
    <p className="entry-text">
      {parts.map((part, index) => {
        const key = `${index}-${part.slice(0, 12)}`;
        if (index % 2 === 0) return <span key={key}>{part}</span>;
        if (part.startsWith("@")) {
          return (
            <span key={key} className="mention">
              {part}
            </span>
          );
        }
        const id = part.slice(part.lastIndexOf("/") + 1);
        return (
          <Link key={key} to={`/bridge/m/${id}`}>
            {part}
          </Link>
        );
      })}
    </p>
  );
}

function PreviewCard({ preview }: { preview: MessagePreview }) {
  const t = useLabels();
  return (
    <Link className="preview-card" to={bridgePath(preview.address, preview.thread, preview.id)}>
      <span className="preview-title">
        {t.bridge.linkPreview} · {chatName(t, preview.chat)}
      </span>
      <span>
        <strong>
          {preview.author.role === "shipComputer" ? t.bridge.shipComputer : preview.author.name}
        </strong>{" "}
        <span className="muted">{relativeTime(t, preview.at)}</span>
      </span>
      <span>{preview.deleted ? t.bridge.deleted : preview.excerpt}</span>
    </Link>
  );
}

function EntryHead({ name, at }: { name: string; at: string }) {
  const t = useLabels();
  return (
    <div className="entry-head">
      <strong>{name}</strong>
      <time className="muted" dateTime={at} title={new Date(at).toLocaleString(t.locale)}>
        {clockTime(t, at)}
      </time>
    </div>
  );
}

function Avatar({ kind, name }: { kind: MessageEntry["author"]["role"]; name: string }) {
  if (kind === "xora") {
    return (
      <img className="avatar avatar-xora" src="/xora/xora.webp" alt="" width={36} height={36} />
    );
  }
  if (kind === "shipComputer") return <span className="avatar avatar-ship" aria-hidden="true" />;
  return (
    <span className="avatar avatar-initials" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

function initials(name: string): string {
  const words = name.split(/[\s._-]+/).filter(Boolean);
  return (
    words.length > 1 ? `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}` : name.slice(0, 2)
  ).toUpperCase();
}

function ThreadPane({
  view,
  thread,
  highlight,
  onClose,
  onOpen,
  reload,
}: {
  view: ChatView;
  thread: ChatThread;
  highlight: string | null;
  onClose: () => void;
  onOpen: (address: string, thread?: string | null, message?: string | null) => void;
  reload: () => void;
}) {
  const t = useLabels();
  const titleId = useId();
  const { root } = thread;
  return (
    <section className="bridge-thread" aria-labelledby={titleId}>
      <header className="chat-header">
        <h2 id={titleId}>{root.type === "mission" ? root.mission.title : t.bridge.thread}</h2>
        <button type="button" className="button button-quiet" onClick={onClose}>
          {t.bridge.closeThread}
        </button>
      </header>
      {root.type === "mission" ? (
        <div className="thread-mission">
          <div className="mission-card-head">
            <StatusBadge state={root.mission.state} waitReason={root.mission.waitReason} />
            <Link to={`/missions/${root.mission.id}`}>{t.bridge.missionDetail}</Link>
          </div>
          <p className="goal">{root.mission.goal}</p>
          <StatePanel mission={root.mission} onDone={reload} />
        </div>
      ) : (
        <ol className="chat-entries">
          <MessageView
            entry={root}
            chat={view.chat}
            highlight={highlight}
            threadKey={thread.key}
            active={false}
            onOpen={onOpen}
            reload={reload}
            isRoot
          />
        </ol>
      )}
      {thread.entries.length === 0 ? (
        <p className="muted chat-empty">{t.bridge.emptyThread}</p>
      ) : (
        <ol className="chat-entries" aria-live="polite" aria-relevant="additions">
          {thread.entries.map((entry) => (
            <EntryView
              key={`${entry.type}-${entry.id}`}
              entry={entry}
              chat={view.chat}
              highlight={highlight}
              open={undefined}
              canThread={false}
              onOpen={onOpen}
              reload={reload}
            />
          ))}
        </ol>
      )}
      <Composer
        chat={view.chat}
        available
        threadRoot={thread.key}
        placeholder={t.bridge.placeholderThread}
        onPosted={() => reload()}
      />
    </section>
  );
}

/**
 * The input bar of the open chat or thread (Milestone 15 section 3). Enter sends, Shift+Enter
 * starts a new line. Typing `@` offers the participants of the chat.
 */
function Composer({
  chat,
  available,
  threadRoot,
  placeholder,
  onPosted,
}: {
  chat: ChatView["chat"];
  available: boolean;
  threadRoot?: string;
  placeholder: string;
  onPosted: (posted: PostedMessage) => void;
}) {
  const t = useLabels();
  const { language } = useLanguage();
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mention = /(^|\s)@(\w*)$/.exec(text);
  const offerXora =
    mention !== null &&
    "xora".startsWith((mention[2] ?? "").toLowerCase()) &&
    chat.kind !== "direct";
  if (!chat.writable || !available) {
    return (
      <p className="composer-note muted">
        {!available
          ? null
          : chat.archived
            ? t.bridge.archivedNote
            : chat.kind === "decisions"
              ? null
              : t.bridge.readOnly}
      </p>
    );
  }
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    try {
      const posted = await post<PostedMessage>(`/api/chats/${enc(chat.address)}/messages`, {
        text: value,
        language,
        ...(threadRoot ? { threadRoot } : {}),
      });
      setText("");
      setError(null);
      onPosted(posted);
    } catch (value) {
      setError(t.bridge.failed(value instanceof Error ? value.message : String(value)));
    } finally {
      setBusy(false);
    }
  };
  const insertMention = () => {
    setText((current) => current.replace(/@(\w*)$/, "@Xora "));
    field.current?.focus();
  };
  const keyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab" && offerXora && !event.shiftKey) {
      event.preventDefault();
      insertMention();
    } else if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  };
  return (
    <form className="composer" onSubmit={send}>
      {offerXora ? (
        <fieldset className="mention-list">
          <legend className="visually-hidden">{t.bridge.mentionList}</legend>
          <button type="button" className="mention-option" onClick={insertMention}>
            <img src="/xora/xora.webp" alt="" width={20} height={20} /> @Xora
          </button>
        </fieldset>
      ) : null}
      <label htmlFor={id} className="visually-hidden">
        {t.bridge.input}
      </label>
      <textarea
        id={id}
        ref={field}
        rows={2}
        value={text}
        maxLength={4000}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={keyDown}
      />
      <button type="submit" className="button" disabled={busy || !text.trim()}>
        {t.bridge.send}
      </button>
      {error ? (
        <p className="action-error" role="alert">
          {error}
        </p>
      ) : chat.kind !== "direct" ? (
        <small className="muted composer-hint">{t.bridge.mentionHint}</small>
      ) : null}
    </form>
  );
}

/** For Xora her status and what she can do; for a project its purpose; for the ship who is on board. */
function DetailsPanel({ view, onClose }: { view: ChatView; onClose: () => void }) {
  const t = useLabels();
  const { details } = view;
  return (
    <aside className="bridge-details" aria-label={t.bridge.details}>
      <button type="button" className="button button-quiet narrow-only" onClick={onClose}>
        {t.bridge.hidePanel}
      </button>
      {details.kind === "direct" ? (
        <>
          <img
            className="details-portrait"
            src="/xora/xora.webp"
            alt="Xora"
            width={720}
            height={900}
          />
          <h2>Xora</h2>
          <p className="presence-line">
            <span className="presence" aria-hidden="true" /> {t.bridge.xoraStatus}
          </p>
          <ul className="plain">
            {t.bridge.xoraCan.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </>
      ) : details.kind === "project" ? (
        <>
          <h2>{details.project.name}</h2>
          <h3>{t.bridge.purpose}</h3>
          <p>{details.project.purpose || "–"}</p>
          <p className="muted">{t.bridge.missionCount(details.missions, details.open)}</p>
        </>
      ) : details.kind === "topic" ? (
        <>
          <h2>{chatName(t, view.chat)}</h2>
          {details.project ? (
            <>
              <h3>{details.project.name}</h3>
              <p>{details.project.purpose}</p>
            </>
          ) : null}
        </>
      ) : (
        <>
          <h2>{t.bridge.onBoard}</h2>
          <ul className="plain crew-list">
            {details.crew.map((member) => (
              <li key={member.id}>
                <Avatar kind={member.role} name={member.name || t.bridge.shipComputer} />{" "}
                {member.role === "shipComputer" ? t.bridge.shipComputer : member.name}
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

/** `/bridge/m/<id>`: a pasted message link opens the message in its chat or thread. */
export function MessageLink() {
  const t = useLabels();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    api<MessagePreview>(`/api/chats/messages/${enc(id)}`)
      .then((preview) => {
        if (current)
          navigate(bridgePath(preview.address, preview.thread, preview.id), { replace: true });
      })
      .catch((error: unknown) => {
        if (!current) return;
        setFailed(
          error instanceof ApiError && error.status === 404 ? t.bridge.notFound : String(error),
        );
      });
    return () => {
      current = false;
    };
  }, [id, navigate, t]);
  return failed ? (
    <section className="panel" role="alert">
      <p>{failed}</p>
      <Link to="/bridge">{t.bridge.shipChannel}</Link>
    </section>
  ) : (
    <p className="muted">{t.bridge.loading}</p>
  );
}
