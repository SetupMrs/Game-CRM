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
// Authentication
// ---------------------------------------------------------------------------
// If APP_PASSWORD is set (recommended once this app is exposed on a network /
// real server), all /api routes except /api/auth/* require a valid session
// token obtained via POST /api/auth/login. When APP_PASSWORD is not set, the
// app behaves as before (open, intended for purely local single-PC use only).
const APP_PASSWORD = process.env.APP_PASSWORD || "";
const AUTH_REQUIRED = APP_PASSWORD.length > 0;

// In-memory sessions. Fine for a small single-user app; sessions reset on restart.
const activeSessions = new Set<string>();

// Very light brute-force protection for the login endpoint.
const loginAttempts = new Map<string, { count: number; blockedUntil: number }>();
const MAX_ATTEMPTS = 8;
const BLOCK_MS = 5 * 60 * 1000;

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // Compare against a same-length dummy so timing doesn't leak length info.
    crypto.timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

app.post("/api/auth/login", (req, res) => {
  if (!AUTH_REQUIRED) {
    return res.json({ status: "success", token: null, authRequired: false });
  }

  const ip = req.ip || "unknown";
  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.blockedUntil > Date.now()) {
    return res.status(429).json({ status: "error", message: "Забагато невдалих спроб. Спробуйте пізніше." });
  }

  const { password } = req.body || {};
  if (typeof password !== "string" || !timingSafeEqual(password, APP_PASSWORD)) {
    const prev = loginAttempts.get(ip) || { count: 0, blockedUntil: 0 };
    const count = prev.count + 1;
    loginAttempts.set(ip, {
      count,
      blockedUntil: count >= MAX_ATTEMPTS ? Date.now() + BLOCK_MS : 0
    });
    return res.status(401).json({ status: "error", message: "Невірний пароль." });
  }

  loginAttempts.delete(ip);
  const token = crypto.randomBytes(32).toString("hex");
  activeSessions.add(token);
  res.json({ status: "success", token, authRequired: true });
});

app.get("/api/auth/status", (req, res) => {
  res.json({ authRequired: AUTH_REQUIRED });
});

app.post("/api/auth/logout", (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  activeSessions.delete(token);
  res.json({ status: "success" });
});

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!AUTH_REQUIRED) return next();
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (token && activeSessions.has(token)) return next();
  res.status(401).json({ status: "error", message: "Потрібна авторизація." });
}

// ---------------------------------------------------------------------------
// Database (SQLite)
// ---------------------------------------------------------------------------
// Each top-level collection (tasks, transactions, suppliers, ...) gets its
// own table, keyed by id, with the full record stored as a JSON blob. This
// keeps the record shape flexible (tasks/suppliers have many optional nested
// fields) while still getting SQLite's real benefits over a single flat
// file: atomic transactional writes (no more "half-written" file if the
// process is killed mid-save), and a foundation to add indexed columns
// later if querying performance ever matters at a larger scale.
const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "game_crm.sqlite");
const LEGACY_JSON_PATH = path.join(DB_DIR, "crm_srm_db.json"); // old file-based DB, migrated once

const DEFAULT_CURRENCY_RATES = { USD: 1, RUB: 0.0105, UAH: 0.024 };
const DEFAULT_BASE_CURRENCY = "USD";

const DB_ARRAY_KEYS = ["tasks", "transactions", "suppliers", "teamMembers", "activityLog", "budgets", "taskTemplates"] as const;

const TABLE_BY_KEY: Record<(typeof DB_ARRAY_KEYS)[number], string> = {
  tasks: "tasks",
  transactions: "transactions",
  suppliers: "suppliers",
  teamMembers: "team_members",
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

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL"); // safer + faster concurrent reads/writes

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
// before the SQLite switch) and the SQLite database is still empty, import
// it automatically so nobody's existing data gets lost by the upgrade.
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
    if (!AUTH_REQUIRED) {
      console.warn(
        "⚠️  APP_PASSWORD is not set — the API is open to anyone who can reach this host/port. " +
        "Set APP_PASSWORD in your .env before exposing this server beyond your own PC."
      );
    }
  });
}

startServer();
