-- ADR-007: the bridge chat. Chats and messages are conversation, not knowledge. The ship
-- chat, the project chats, and the direct chat with Xora exist without a row; a row is
-- written with a chat's first stored message, or when the captain creates a task channel.
-- Messages are never edited; deleting one removes its body and keeps a marker.

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('ship','project','direct','topic')),
  project_id TEXT,
  agent_id TEXT,
  name TEXT,
  created_by TEXT NOT NULL CHECK (length(trim(created_by)) > 0),
  created_at TEXT NOT NULL,
  archived_by TEXT,
  archived_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  CHECK (kind <> 'ship' OR (id = 'ship' AND project_id IS NULL AND agent_id IS NULL AND name IS NULL)),
  CHECK (kind <> 'project' OR (project_id IS NOT NULL AND id = 'project:' || project_id AND agent_id IS NULL AND name IS NULL)),
  CHECK (kind <> 'direct' OR (agent_id IS NOT NULL AND id = 'direct:' || agent_id AND project_id IS NULL AND name IS NULL)),
  CHECK (kind <> 'topic' OR (id LIKE 'topic:%' AND agent_id IS NULL AND name IS NOT NULL AND length(trim(name)) > 0)),
  CHECK (kind = 'topic' OR archived_at IS NULL),
  CHECK ((archived_at IS NULL) = (archived_by IS NULL))
) STRICT;

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  -- Workspace-wide insertion order; timestamps can tie within a millisecond.
  sequence INTEGER NOT NULL UNIQUE CHECK (sequence >= 1),
  chat_id TEXT NOT NULL,
  author_id TEXT NOT NULL CHECK (length(trim(author_id)) > 0),
  body TEXT CHECK (body IS NULL OR (length(trim(body)) > 0 AND length(body) <= 4000)),
  thread_root_message_id TEXT,
  thread_root_mission_id TEXT,
  created_at TEXT NOT NULL,
  deleted_by TEXT,
  deleted_at TEXT,
  FOREIGN KEY (chat_id) REFERENCES chats(id),
  FOREIGN KEY (thread_root_message_id) REFERENCES chat_messages(id),
  FOREIGN KEY (thread_root_mission_id) REFERENCES missions(id),
  CHECK (thread_root_message_id IS NULL OR thread_root_mission_id IS NULL),
  CHECK (thread_root_message_id IS NULL OR thread_root_message_id <> id),
  CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
  CHECK ((deleted_at IS NULL) = (body IS NOT NULL))
) STRICT;

CREATE INDEX chat_messages_chat ON chat_messages(chat_id, sequence);
CREATE INDEX chat_messages_message_thread ON chat_messages(thread_root_message_id, sequence);
CREATE INDEX chat_messages_mission_thread ON chat_messages(thread_root_mission_id, sequence);

CREATE TABLE chat_message_references (
  message_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 1),
  kind TEXT NOT NULL CHECK (kind IN ('mention','message','chat','mission','proposal','node')),
  project_id TEXT,
  target_id TEXT NOT NULL CHECK (length(trim(target_id)) > 0),
  PRIMARY KEY (message_id, position),
  FOREIGN KEY (message_id) REFERENCES chat_messages(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  CHECK ((kind IN ('proposal','node')) = (project_id IS NOT NULL))
) STRICT;

-- Guards: chats and messages are never deleted as rows; a chat changes only its name
-- (task channels) and is archived at most once; a message changes only by being deleted,
-- once; references are append-only.
CREATE TRIGGER chats_no_delete BEFORE DELETE ON chats
BEGIN SELECT RAISE(ABORT, 'Chats are never deleted'); END;
CREATE TRIGGER chats_identity_immutable BEFORE UPDATE ON chats
WHEN NEW.id <> OLD.id OR NEW.kind <> OLD.kind
  OR NEW.project_id IS NOT OLD.project_id OR NEW.agent_id IS NOT OLD.agent_id
  OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
  OR (OLD.archived_at IS NOT NULL AND (NEW.archived_at IS NOT OLD.archived_at
    OR NEW.archived_by IS NOT OLD.archived_by OR NEW.name IS NOT OLD.name))
BEGIN SELECT RAISE(ABORT, 'A chat keeps its identity; an archived channel is read-only'); END;
CREATE TRIGGER chat_messages_no_delete BEFORE DELETE ON chat_messages
BEGIN SELECT RAISE(ABORT, 'Chat messages are never removed; deleting keeps a marker'); END;
CREATE TRIGGER chat_messages_delete_once BEFORE UPDATE ON chat_messages
WHEN OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NULL OR NEW.body IS NOT NULL
  OR NEW.id <> OLD.id OR NEW.sequence <> OLD.sequence OR NEW.chat_id <> OLD.chat_id
  OR NEW.author_id <> OLD.author_id
  OR NEW.thread_root_message_id IS NOT OLD.thread_root_message_id
  OR NEW.thread_root_mission_id IS NOT OLD.thread_root_mission_id
  OR NEW.created_at <> OLD.created_at
BEGIN SELECT RAISE(ABORT, 'A chat message is never edited; it can only be deleted once'); END;
CREATE TRIGGER chat_message_references_no_update BEFORE UPDATE ON chat_message_references
BEGIN SELECT RAISE(ABORT, 'Chat message references are append-only'); END;
CREATE TRIGGER chat_message_references_no_delete BEFORE DELETE ON chat_message_references
BEGIN SELECT RAISE(ABORT, 'Chat message references are append-only'); END;
