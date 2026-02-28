-- Conversation Messages Table
-- Stores the last 20 messages per user for conversational context persistence

CREATE TABLE IF NOT EXISTS conversation_messages (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups by phone + ordering by created_at
CREATE INDEX IF NOT EXISTS idx_conv_phone_created
  ON conversation_messages(phone, created_at DESC);

-- Comment for documentation
COMMENT ON TABLE conversation_messages IS 'Stores conversation history for AI context (max 20 messages per user)';
COMMENT ON COLUMN conversation_messages.phone IS 'User phone number (WhatsApp ID)';
COMMENT ON COLUMN conversation_messages.role IS 'Message sender: user or assistant';
COMMENT ON COLUMN conversation_messages.content IS 'Message text content';
