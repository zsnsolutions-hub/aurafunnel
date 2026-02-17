-- ============================================================
-- Email Tracking: Tables, Indexes, RLS, and helper function
-- ============================================================

-- 1. email_messages — one row per sent email
CREATE TABLE IF NOT EXISTS email_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('sendgrid','mailchimp','gmail','smtp','manual')),
  provider_message_id TEXT,
  subject       TEXT,
  to_email      TEXT NOT NULL,
  from_email    TEXT,
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','bounced','failed')),
  track_opens   BOOLEAN NOT NULL DEFAULT true,
  track_clicks  BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_messages_lead_id    ON email_messages(lead_id);
CREATE INDEX idx_email_messages_owner_id   ON email_messages(owner_id);
CREATE INDEX idx_email_messages_provider_msg ON email_messages(provider_message_id);

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email messages"
  ON email_messages FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own email messages"
  ON email_messages FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own email messages"
  ON email_messages FOR UPDATE
  USING (owner_id = auth.uid());


-- 2. email_links — one row per tracked link per message
CREATE TABLE IF NOT EXISTS email_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id      UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  destination_url TEXT NOT NULL,
  link_label      TEXT,
  link_index      INT NOT NULL DEFAULT 0,
  click_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_links_message_id ON email_links(message_id);

ALTER TABLE email_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email links"
  ON email_links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM email_messages
      WHERE email_messages.id = email_links.message_id
        AND email_messages.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own email links"
  ON email_links FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM email_messages
      WHERE email_messages.id = email_links.message_id
        AND email_messages.owner_id = auth.uid()
    )
  );


-- 3. email_events — one row per tracking event
CREATE TABLE IF NOT EXISTS email_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id       UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  link_id          UUID REFERENCES email_links(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL CHECK (event_type IN ('open','click','delivered','bounced','unsubscribe','spam_report')),
  ip_address       TEXT,
  user_agent       TEXT,
  is_bot           BOOLEAN DEFAULT false,
  is_apple_privacy BOOLEAN DEFAULT false,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_events_message_id ON email_events(message_id);
CREATE INDEX idx_email_events_link_id    ON email_events(link_id);
CREATE INDEX idx_email_events_type       ON email_events(event_type);
CREATE INDEX idx_email_events_created    ON email_events(created_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email events"
  ON email_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM email_messages
      WHERE email_messages.id = email_events.message_id
        AND email_messages.owner_id = auth.uid()
    )
  );


-- 4. record_email_event() — SECURITY DEFINER function for edge functions
CREATE OR REPLACE FUNCTION record_email_event(
  p_message_id       UUID,
  p_event_type       TEXT,
  p_link_id          UUID DEFAULT NULL,
  p_ip_address       TEXT DEFAULT NULL,
  p_user_agent       TEXT DEFAULT NULL,
  p_is_bot           BOOLEAN DEFAULT false,
  p_is_apple_privacy BOOLEAN DEFAULT false,
  p_metadata         JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  -- Validate the message exists
  IF NOT EXISTS (SELECT 1 FROM email_messages WHERE id = p_message_id) THEN
    RAISE EXCEPTION 'Message not found: %', p_message_id;
  END IF;

  -- Insert the event
  INSERT INTO email_events (message_id, link_id, event_type, ip_address, user_agent, is_bot, is_apple_privacy, metadata)
  VALUES (p_message_id, p_link_id, p_event_type, p_ip_address, p_user_agent, p_is_bot, p_is_apple_privacy, p_metadata)
  RETURNING id INTO v_event_id;

  -- Side effects
  IF p_event_type = 'click' AND p_link_id IS NOT NULL THEN
    UPDATE email_links SET click_count = click_count + 1 WHERE id = p_link_id;
  END IF;

  IF p_event_type = 'delivered' THEN
    UPDATE email_messages SET status = 'delivered', updated_at = now() WHERE id = p_message_id AND status = 'sent';
  ELSIF p_event_type = 'bounced' THEN
    UPDATE email_messages SET status = 'bounced', updated_at = now() WHERE id = p_message_id;
  END IF;

  RETURN v_event_id;
END;
$$;
