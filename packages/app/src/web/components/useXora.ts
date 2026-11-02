import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, post } from "../api.js";
import { useLanguage } from "../i18n.js";
import type { PostedMessage, XoraInfo } from "../types.js";
import { bridgePath } from "./Bridge.js";

/**
 * Asks Xora from an empty state (Milestone 13): the question goes into Xora's direct chat as
 * a new topic, and the bridge opens it with her reply (Milestone 15 section 3).
 */
export function useXora() {
  const navigate = useNavigate();
  const { language } = useLanguage();
  return {
    ask: (text: string, topic?: string) => {
      post<PostedMessage>("/api/chats/direct%3Axora/messages", {
        text,
        language,
        ...(topic ? { topic } : {}),
      })
        .then((posted) => navigate(bridgePath("direct:xora", posted.thread)))
        .catch(() => navigate(bridgePath("direct:xora")));
    },
  };
}

const XORA_POLL_MS = 5_000;

/**
 * Xora's model state from `GET /api/xora` (Milestone 16), asked again every few seconds,
 * because the runtime gets ready or fails in the background. Undefined until the first answer.
 */
export function useXoraStatus(): XoraInfo | undefined {
  const [status, setStatus] = useState<XoraInfo>();
  useEffect(() => {
    let active = true;
    const load = () =>
      api<XoraInfo>("/api/xora").then(
        (next) => {
          if (active) setStatus(next);
        },
        () => {
          // Without an answer the panel keeps its last state.
        },
      );
    void load();
    const timer = window.setInterval(load, XORA_POLL_MS);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);
  return status;
}
