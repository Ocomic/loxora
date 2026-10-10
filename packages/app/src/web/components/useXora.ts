import { useNavigate } from "react-router-dom";
import { post } from "../api.js";
import { useLanguage } from "../i18n.js";
import type { PostedMessage } from "../types.js";
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
