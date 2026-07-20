-- Support Tickets Table (partner & public support)
CREATE TABLE IF NOT EXISTS d1_support_tickets (
    id TEXT PRIMARY KEY,
    requester_type TEXT DEFAULT 'partner', -- 'partner' or 'public'
    requester_id TEXT,
    requester_name TEXT,
    requester_email TEXT,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'open', -- open, in_progress, resolved, closed
    admin_reply TEXT,
    admin_reply_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_tickets_requester ON d1_support_tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON d1_support_tickets(status);

-- Partner Notifications Table
CREATE TABLE IF NOT EXISTS d1_partner_notifications (
    id TEXT PRIMARY KEY,
    partner_id TEXT REFERENCES d1_partners(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    message TEXT,
    type TEXT DEFAULT 'info', -- info, success, warning, alert
    read INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifs_partner ON d1_partner_notifications(partner_id);

-- Add earned_total and paid_total to d1_partners if not exists
-- (These might already be tracked in d1_partner_balances, but some code references them on d1_partners directly)
-- SQLite ALTER TABLE doesn't support IF NOT EXISTS for columns, so we use a safe approach:
-- If the column already exists, the ALTER will fail silently (wrapped in try/catch in the migration runner)
