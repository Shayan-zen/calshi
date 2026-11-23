-- Admins added from the admin panel (in addition to the ADMIN_EMAILS secret, whose entries can't be removed from the UI).
CREATE TABLE IF NOT EXISTS admins (
  email TEXT PRIMARY KEY,
  added_by TEXT,
  created_at INTEGER NOT NULL
);
