import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import Database from "better-sqlite3";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
// Configurable via env so this can be deployed behind a reverse proxy / on a real server.
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ---------------------------------------------------------------------------
// Database connection (SQLite) — shared by both the user/auth tables below
// and the CRM data tables further down.
// ---------------------------------------------------------------------------
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "game_crm.sqlite");
const LEGACY_JSON_PATH = path.join(DB_DIR, "crm_srm_db.json"); // old file-based DB, migrated once

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL"); // safer + faster concurrent reads/writes

// ---------------------------------------------------------------------------
// Authentication — real per-person accounts (username + password), not a
// single shared password. Nothing in the app renders for an unauthenticated
// visitor except the login form.
// ---------------------------------------------------------------------------
type UserRole = "admin" | "support";

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','support')),
    created_at TEXT NOT NULL
  );
`);

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

// Passwords are never stored or logged in plain text. scrypt is a built-in
// Node.js primitive (no extra dependency) designed specifically to be slow
// and memory-hard, which is what you want for password hashing (unlike a
// fast general-purpose hash like SHA-256, which would make brute-forcing
// leaked hashes far too cheap).
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const hashBuf = Buffer.from(hash, "hex");
  if (derived.length !== hashBuf.length) return false;
  // Constant-time comparison so response timing can't leak how many
  // leading bytes of the hash matched.
  return crypto.timingSafeEqual(derived, hashBuf);
}

interface DbUser {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  created_at: string;
}

function generateRandomPassword(): string {
  // 16 chars from a large, unambiguous alphabet — cryptographically random,
  // not Math.random().
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const bytes = crypto.randomBytes(16);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

function createUserRecord(username: string, password: string, role: UserRole): DbUser {
  const id = crypto.randomUUID();
  const record: DbUser = {
    id,
    username,
    password_hash: hashPassword(password),
    role,
    created_at: new Date().toISOString()
  };
  sqlite.prepare(
    "INSERT INTO users (id, username, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(record.id, record.username, record.password_hash, record.role, record.created_at);
  return record;
}

// Bootstrap: create the very first admin account if the users table is
// still empty. Credentials come from .env if set; otherwise a random
// password is generated and written once to a local, gitignored file plus
// printed to the server log, so whoever is running this on the server can
// retrieve it.
function bootstrapInitialAdmin() {
  const existingCount = (sqlite.prepare("SELECT COUNT(*) as c FROM users").get() as { c: number }).c;
  if (existingCount > 0) return;

  const envUsername = (process.env.ADMIN_USERNAME || "admin").trim();
  const username = USERNAME_RE.test(envUsername) ? envUsername : "admin";
  const envPassword = process.env.ADMIN_PASSWORD || "";
  const password = envPassword.length >= MIN_PASSWORD_LENGTH ? envPassword : generateRandomPassword();

  createUserRecord(username, password, "admin");

  console.log("");
  console.log("========================================================");
  console.log("  Створено початковий акаунт адміністратора:");
  console.log(`    Логін:  ${username}`);
  if (envPassword.length >= MIN_PASSWORD_LENGTH) {
    console.log("    Пароль: (той, що вказаний у ADMIN_PASSWORD у .env)");
  } else {
    console.log(`    Пароль: ${password}`);
    try {
      const credsPath = path.join(DB_DIR, "INITIAL_ADMIN_PASSWORD.txt");
      fs.writeFileSync(
        credsPath,
        `Логін: ${username}\nПароль: ${password}\n\nЦей файл створено один раз при першому запуску. Видаліть його після того, як увійдете і збережете пароль у надійному місці.\n`,
        "utf8"
      );
      console.log(`    (також збережено в ${credsPath})`);
    } catch (e) {
      console.warn("    Не вдалося зберегти пароль у файл:", e);
    }
  }
  console.log("  Увійдіть під цим акаунтом і одразу створіть інших користувачів у розділі «Користувачі».");
  console.log("========================================================");
  console.log("");
}

bootstrapInitialAdmin();

// In-memory sessions, mapping a bearer token to the authenticated user.
// Fine for a small team; sessions reset when the server process restarts.
interface Session {
  userId: string;
  username: string;
  role: UserRole;
}
const activeSessions = new Map<string, Session>();

// Brute-force protection for the login endpoint, keyed by IP. Deliberately
// generic error messages everywhere below so a failed attempt never reveals
// whether the username itself exists (prevents account enumeration).
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 5 * 60 * 1000;
const GENERIC_LOGIN_ERROR = "Невірний логін або пароль.";

app.post("/api/auth/login", (req, res) => {
  const ip = req.ip || "unknown";
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.blockedUntil > Date.now()) {
    return res.status(429).json({ status: "error", message: "Забагато невдалих спроб. Спробуйте пізніше." });
  }

  const { username, password } = req.body || {};
  const registerFailure = () => {
    const prev = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    const count = prev.count + 1;
    loginAttempts.set(ip, {
      count,
      blockedUntil: count >= MAX_ATTEMPTS ? Date.now() + BLOCK_MS : 0
    });
  };

  if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
    registerFailure();
    return res.status(401).json({ status: "error", message: GENERIC_LOGIN_ERROR });
  }

  const user = sqlite.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username.trim()) as DbUser | undefined;

  // Always run a password hash comparison, even when the user doesn't
  // exist, using a dummy stored hash of the same shape. This keeps the
  // response time for "unknown username" and "wrong password" the same,
  // so an attacker can't use timing to figure out which usernames are real.
  const DUMMY_HASH = "0000000000000000000000000000000000000000000000000000000000000000000000000000:0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
  const isValid = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, DUMMY_HASH), false);

  if (!user || !isValid) {
    registerFailure();
    return res.status(401).json({ status: "error", message: GENERIC_LOGIN_ERROR });
  }

  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.set(token, { userId: user.id, username: user.username, role: user.role });
  res.json({ status: "success", token, user: { id: user.id, username: user.username, role: user.role } });
});

app.get("/api/auth/me", (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = token ? activeSessions.get(token) : undefined;
  if (!session) {
    return res.status(401).json({ status: "error", message: "Потрібна авторизація." });
  }
  res.json({ status: "success", user: { id: session.userId, username: session.username, role: session.role } });
});

app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  activeSessions.delete(token);
  res.json({ status: "success" });
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const session = token ? activeSessions.get(token) : undefined;
  if (!session) {
    return res.status(401).json({ status: "error", message: "Потрібна авторизація." });
  }
  (req as any).user = session;
  next();
}

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = (req as any).user as Session | undefined;
  if (!session || session.role !== "admin") {
    return res.status(403).json({ status: "error", message: "Потрібні права адміністратора." });
  }
  next();
}

// ---------------------------------------------------------------------------
// User management (admin only), plus a lightweight endpoint any logged-in
// user can call to populate "assign this to..." pickers (task assignee,
// dashboard workload, calendar) without exposing full account management.
// ---------------------------------------------------------------------------
app.get("/api/users/basic", requireAuth, (req, res) => {
  const rows = sqlite.prepare("SELECT id, username FROM users ORDER BY username ASC").all();
  res.json({ status: "success", users: rows });
});

app.get("/api/users", requireAuth, requireAdmin, (req, res) => {
  const rows = sqlite.prepare("SELECT id, username, role, created_at as createdAt FROM users ORDER BY created_at ASC").all();
  res.json({ status: "success", users: rows });
});

app.post("/api/users", requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};

  if (typeof username !== "string" || !USERNAME_RE.test(username.trim())) {
    return res.status(400).json({ status: "error", message: "Логін має бути 3-32 символи: латинські літери, цифри, крапка, дефіс або підкреслення." });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ status: "error", message: `Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів.` });
  }
  if (role !== "admin" && role !== "support") {
    return res.status(400).json({ status: "error", message: "Невірна роль." });
  }

  const trimmedUsername = username.trim();
  const existing = sqlite.prepare("SELECT id FROM users WHERE username = ? COLLATE NOCASE").get(trimmedUsername);
  if (existing) {
    return res.status(409).json({ status: "error", message: "Такий логін вже зайнятий." });
  }

  try {
    const record = createUserRecord(trimmedUsername, password, role);
    res.json({ status: "success", user: { id: record.id, username: record.username, role: record.role, createdAt: record.created_at } });
  } catch (error) {
    console.error("Failed to create user:", error);
    res.status(500).json({ status: "error", message: "Не вдалося створити користувача." });
  }
});

app.post("/api/users/:id/reset-password", requireAuth, requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ status: "error", message: `Пароль має містити щонайменше ${MIN_PASSWORD_LENGTH} символів.` });
  }
  const user = sqlite.prepare("SELECT id FROM users WHERE id = ?").get(req.params.id);
  if (!user) {
    return res.status(404).json({ status: "error", message: "Користувача не знайдено." });
  }
  sqlite.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), req.params.id);
  // Invalidate any existing sessions for this user so an old, possibly
  // compromised session can't keep using the account after a password reset.
  for (const [token, session] of activeSessions) {
    if (session.userId === req.params.id) activeSessions.delete(token);
  }
  res.json({ status: "success" });
});

app.delete("/api/users/:id", requireAuth, requireAdmin, (req, res) => {
  const target = sqlite.prepare("SELECT * FROM users WHERE id = ?").get(req.params.id) as DbUser | undefined;
  if (!target) {
    return res.status(404).json({ status: "error", message: "Користувача не знайдено." });
  }
  if (target.role === "admin") {
    const adminCount = (sqlite.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get() as { c: number }).c;
    if (adminCount <= 1) {
      return res.status(400).json({ status: "error", message: "Не можна видалити останнього адміністратора." });
    }
  }
  sqlite.prepare("DELETE FROM users WHERE id = ?").run(req.params.id);
  for (const [token, session] of activeSessions) {
    if (session.userId === req.params.id) activeSessions.delete(token);
  }
  res.json({ status: "success" });
});

// ---------------------------------------------------------------------------
// CRM data (SQLite) — one table per top-level collection, each row storing
// the full record as a JSON blob. This keeps record shapes flexible (tasks/
// suppliers have many optional nested fields) while getting real SQLite
// benefits over a single flat file: atomic transactional writes (no more
// "half-written" file if the process is killed mid-save).
// ---------------------------------------------------------------------------
const DEFAULT_CURRENCY_RATES = { USD: 1, RUB: 0.0105, UAH: 0.024 };
const DEFAULT_BASE_CURRENCY = "USD";

const DB_ARRAY_KEYS = ["tasks", "transactions", "suppliers", "activityLog", "budgets", "taskTemplates"] as const;

const TABLE_BY_KEY: Record<(typeof DB_ARRAY_KEYS)[number], string> = {
  tasks: "tasks",
  transactions: "transactions",
  suppliers: "suppliers",
  activityLog: "activity_log",
  budgets: "budgets",
  taskTemplates: "task_templates"
};

function normalizeCurrencyRates(value: any, baseCurrency: string): Record<string, number> {
  const rates: Record<string, number> = { [baseCurrency]: 1 };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [code, rate] of Object.entries(value)) {
      if (typeof rate === "number" && rate > 0) {
        rates[code.toUpperCase()] = rate;
      }
    }
  } else {
    Object.assign(rates, DEFAULT_CURRENCY_RATES);
  }
  rates[baseCurrency] = 1;
  return rates;
}

function normalizeBaseCurrency(value: any): string {
  if (typeof value === "string" && value.trim()) return value.trim().toUpperCase();
  return DEFAULT_BASE_CURRENCY;
}

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS team_members (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS activity_log (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS budgets (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS task_templates (id TEXT PRIMARY KEY, data TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// Load DB — reconstructs the same DatabaseState shape the frontend has
// always received, just sourced from SQLite tables instead of one big file.
function readDb() {
  const result: any = {};
  for (const key of DB_ARRAY_KEYS) {
    const table = TABLE_BY_KEY[key];
    const rows = sqlite.prepare(`SELECT data FROM ${table}`).all() as { data: string }[];
    result[key] = rows.map(r => {
      try { return JSON.parse(r.data); } catch { return null; }
    }).filter(Boolean);
  }
  const baseCurrencyRow = sqlite.prepare("SELECT value FROM settings WHERE key = 'baseCurrency'").get() as { value: string } | undefined;
  const currencyRatesRow = sqlite.prepare("SELECT value FROM settings WHERE key = 'currencyRates'").get() as { value: string } | undefined;
  result.baseCurrency = normalizeBaseCurrency(baseCurrencyRow?.value);
  result.currencyRates = normalizeCurrencyRates(
    currencyRatesRow ? JSON.parse(currencyRatesRow.value) : null,
    result.baseCurrency
  );
  return result;
}

// Save DB — replaces the full contents of every table inside one atomic
// transaction (so a crash mid-write can never leave a half-updated database).
const writeDbTxn = sqlite.transaction((data: any) => {
  for (const key of DB_ARRAY_KEYS) {
    const table = TABLE_BY_KEY[key];
    sqlite.prepare(`DELETE FROM ${table}`).run();
    const insert = sqlite.prepare(`INSERT INTO ${table} (id, data) VALUES (?, ?)`);
    const items = Array.isArray(data[key]) ? data[key] : [];
    for (const item of items) {
      if (!item || typeof item.id !== "string") continue;
      insert.run(item.id, JSON.stringify(item));
    }
  }
  const baseCurrency = normalizeBaseCurrency(data.baseCurrency);
  const currencyRates = normalizeCurrencyRates(data.currencyRates, baseCurrency);
  sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('baseCurrency', ?)").run(baseCurrency);
  sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('currencyRates', ?)").run(JSON.stringify(currencyRates));
});

function writeDb(data: any): boolean {
  try {
    writeDbTxn(data);
    return true;
  } catch (error) {
    console.error("Error writing to SQLite database", error);
    return false;
  }
}

// One-time migration: if an old data/crm_srm_db.json file exists (from
// before the SQLite switch) and it hasn't been imported yet, import it
// automatically so nobody's existing data gets lost by the upgrade.
function migrateLegacyJsonIfNeeded() {
  const alreadyMigrated = sqlite.prepare("SELECT value FROM settings WHERE key = 'migratedFromJson'").get();
  if (alreadyMigrated) return;

  if (fs.existsSync(LEGACY_JSON_PATH)) {
    try {
      const raw = fs.readFileSync(LEGACY_JSON_PATH, "utf8");
      const data = JSON.parse(raw);
      writeDb(data);
      const renamedPath = `${LEGACY_JSON_PATH}.migrated`;
      fs.renameSync(LEGACY_JSON_PATH, renamedPath);
      console.log(`Migrated existing data/crm_srm_db.json into SQLite (renamed old file to ${path.basename(renamedPath)}).`);
    } catch (error) {
      console.error("Legacy JSON migration failed, starting with an empty database:", error);
    }
  }
  sqlite.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('migratedFromJson', '1')").run();
}

migrateLegacyJsonIfNeeded();

// REST API Endpoints

// Basic shape validation to avoid a bad client request corrupting the DB file.
function isValidDbShape(data: any): boolean {
  if (!data || typeof data !== "object") return false;
  return DB_ARRAY_KEYS.every(key => Array.isArray(data[key]));
}

// Get complete DB
app.get("/api/db", requireAuth, (req, res) => {
  res.json(readDb());
});

// Save complete DB
app.post("/api/db", requireAuth, (req, res) => {
  if (!isValidDbShape(req.body)) {
    return res.status(400).json({ status: "error", message: "Невірний формат даних бази." });
  }
  const success = writeDb(req.body);
  if (success) {
    res.json({ status: "success", message: "Database updated" });
  } else {
    res.status(500).json({ status: "error", message: "Failed to write database file" });
  }
});

// Configure Vite middleware or Static files serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
