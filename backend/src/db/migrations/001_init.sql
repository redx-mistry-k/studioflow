-- StudioFlow initial schema.
-- Portable DDL: runs on PostgreSQL (production) and SQLite (local dev).
-- Conventions: TEXT primary keys (app-generated UUIDs), ISO-8601 timestamps
-- stored in TIMESTAMPTZ columns, JSON stored as TEXT and parsed app-side.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'STAFF',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  whatsapp_number TEXT,
  email TEXT,
  instagram_handle TEXT,
  instagram_id TEXT,
  source TEXT NOT NULL DEFAULT 'MANUAL',
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  date_of_birth TIMESTAMPTZ,
  address TEXT,
  notes TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_wa ON customers(whatsapp_number);
CREATE INDEX IF NOT EXISTS idx_customers_ig ON customers(instagram_handle);
CREATE INDEX IF NOT EXISTS idx_customers_source ON customers(source);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_created ON customers(created_at);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  subject TEXT,
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  external_id TEXT,
  last_message_at TIMESTAMPTZ NOT NULL,
  unread_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_convos_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_convos_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_convos_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_convos_assigned ON conversations(assigned_to_id);
CREATE INDEX IF NOT EXISTS idx_convos_lastmsg ON conversations(last_message_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  sender_type TEXT NOT NULL DEFAULT 'STAFF',
  sender_name TEXT,
  body TEXT NOT NULL,
  media_url TEXT,
  is_note BOOLEAN NOT NULL DEFAULT FALSE,
  external_id TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE TABLE IF NOT EXISTS workshops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  duration_mins INTEGER NOT NULL DEFAULT 120,
  default_price REAL NOT NULL DEFAULT 0,
  default_capacity INTEGER NOT NULL DEFAULT 20,
  instructor TEXT,
  location TEXT,
  color TEXT NOT NULL DEFAULT '#7c3aed',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workshops_active ON workshops(active);
CREATE INDEX IF NOT EXISTS idx_workshops_category ON workshops(category);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  workshop_id TEXT NOT NULL REFERENCES workshops(id) ON DELETE CASCADE,
  title TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  instructor TEXT,
  location TEXT,
  capacity INTEGER NOT NULL DEFAULT 20,
  price REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_workshop ON sessions(workshop_id);
CREATE INDEX IF NOT EXISTS idx_sessions_starts ON sessions(starts_at);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

CREATE TABLE IF NOT EXISTS enquiries (
  id TEXT PRIMARY KEY,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  workshop_id TEXT REFERENCES workshops(id) ON DELETE SET NULL,
  preferred_date TIMESTAMPTZ,
  participants INTEGER NOT NULL DEFAULT 1,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'WEBSITE',
  status TEXT NOT NULL DEFAULT 'NEW',
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_enquiries_status ON enquiries(status);
CREATE INDEX IF NOT EXISTS idx_enquiries_source ON enquiries(source);
CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries(created_at);
CREATE INDEX IF NOT EXISTS idx_enquiries_customer ON enquiries(customer_id);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  booking_code TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  participants INTEGER NOT NULL DEFAULT 1,
  price_per_person REAL NOT NULL DEFAULT 0,
  discount REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'UNPAID',
  status TEXT NOT NULL DEFAULT 'PENDING',
  source TEXT NOT NULL DEFAULT 'MANUAL',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(customer_id);
CREATE INDEX IF NOT EXISTS idx_bookings_session ON bookings(session_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_paystatus ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_code ON bookings(booking_code);
CREATE INDEX IF NOT EXISTS idx_bookings_created ON bookings(created_at);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'UPI',
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'COMPLETED',
  received_at TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_by_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
CREATE INDEX IF NOT EXISTS idx_payments_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_received ON payments(received_at);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  booking_id TEXT REFERENCES bookings(id) ON DELETE SET NULL,
  conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'WHATSAPP',
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  assigned_to_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_followups_customer ON follow_ups(customer_id);
CREATE INDEX IF NOT EXISTS idx_followups_status ON follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_followups_due ON follow_ups(due_at);
CREATE INDEX IF NOT EXISTS idx_followups_assigned ON follow_ups(assigned_to_id);

CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'GENERAL',
  channel TEXT NOT NULL DEFAULT 'ANY',
  subject TEXT,
  body TEXT NOT NULL,
  variables TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  trigger TEXT NOT NULL,
  conditions TEXT NOT NULL DEFAULT '{}',
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  action TEXT NOT NULL,
  action_config TEXT NOT NULL DEFAULT '{}',
  template_id TEXT REFERENCES message_templates(id) ON DELETE SET NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rules_trigger ON automation_rules(trigger);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON automation_rules(enabled);

CREATE TABLE IF NOT EXISTS automation_executions (
  id TEXT PRIMARY KEY,
  rule_id TEXT NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
  trigger_entity TEXT NOT NULL,
  trigger_entity_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'SCHEDULED',
  run_at TIMESTAMPTZ NOT NULL,
  details TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_exec_rule ON automation_executions(rule_id);
CREATE INDEX IF NOT EXISTS idx_exec_status ON automation_executions(status);
CREATE INDEX IF NOT EXISTS idx_exec_runat ON automation_executions(run_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);

CREATE TABLE IF NOT EXISTS business_settings (
  id TEXT PRIMARY KEY,
  business_name TEXT NOT NULL DEFAULT 'StudioFlow',
  logo_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  currency TEXT NOT NULL DEFAULT 'INR',
  auto_confirm_bookings BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_host TEXT,
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_from_email TEXT,
  smtp_from_name TEXT,
  smtp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_phone_number_id TEXT,
  whatsapp_business_account_id TEXT,
  whatsapp_access_token TEXT,
  whatsapp_verify_token TEXT,
  whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  instagram_page_access_token TEXT,
  instagram_verify_token TEXT,
  instagram_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  n8n_webhook_url TEXT,
  notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL
);
