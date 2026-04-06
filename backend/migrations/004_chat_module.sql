CREATE TABLE IF NOT EXISTS chat_rooms (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  type VARCHAR(16) NOT NULL CHECK (type IN ('direct', 'group', 'global')),
  direct_key VARCHAR(64) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_rooms_global_type
  ON chat_rooms (type)
  WHERE type = 'global';

CREATE TABLE IF NOT EXISTS chat_room_participants (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES settings_users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_room_participants_user_id
  ON chat_room_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_chat_room_participants_room_id
  ON chat_room_participants (room_id);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  room_id INT NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id INT REFERENCES settings_users(id) ON DELETE SET NULL,
  body TEXT,
  message_type VARCHAR(16) NOT NULL CHECK (message_type IN ('text', 'file', 'mixed', 'system')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE,
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_created_desc
  ON chat_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_room_id_desc
  ON chat_messages (room_id, id DESC);

CREATE TABLE IF NOT EXISTS chat_attachments (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  original_name VARCHAR(500) NOT NULL,
  stored_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(255) NOT NULL,
  extension VARCHAR(32) NOT NULL,
  size_bytes BIGINT NOT NULL,
  storage_disk VARCHAR(64) NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chat_attachments_message_id
  ON chat_attachments (message_id);

CREATE TABLE IF NOT EXISTS chat_message_reads (
  id BIGSERIAL PRIMARY KEY,
  message_id BIGINT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES settings_users(id) ON DELETE CASCADE,
  read_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_message_reads_user_message
  ON chat_message_reads (user_id, message_id);
