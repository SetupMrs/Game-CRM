import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
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

// File-based local Database path
const DB_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DB_DIR, "crm_srm_db.json");

// Default seed data is now empty to support clean start
const DEFAULT_CURRENCY_RATES = { USD: 1, RUB: 0.0105, UAH: 0.024 };
const DEFAULT_BASE_CURRENCY = "USD";

const DEFAULT_DB = {
  tasks: [],
  transactions: [],
  suppliers: [],
  teamMembers: [],
  activityLog: [],
  budgets: [],
  taskTemplates: [],
  baseCurrency: DEFAULT_BASE_CURRENCY,
  currencyRates: DEFAULT_CURRENCY_RATES
};

const DB_ARRAY_KEYS = ["tasks", "transactions", "suppliers", "teamMembers", "activityLog", "budgets", "taskTemplates"] as const;

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

// Initialize file database
function initDatabase() {
  try {
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_FILE)) {
      fs.writeFileSync(DB_FILE, JSON.stringify(DEFAULT_DB, null, 2), "utf8");
      console.log("Database file created successfully.");
    } else {
      // Validate that DB matches current schema
      const raw = fs.readFileSync(DB_FILE, "utf8");
      let data;
      try {
        data = JSON.parse(raw);
      } catch (e) {
        data = {};
      }
      // Guarantee properties exist (handles upgrades from older DB files too)
      let updated = false;
      for (const key of DB_ARRAY_KEYS) {
        if (!Array.isArray(data[key])) {
          data[key] = [];
          updated = true;
        }
      }
      if (!data.currencyRates || typeof data.currencyRates !== "object") {
        data.currencyRates = { ...DEFAULT_CURRENCY_RATES };
        updated = true;
      }
      if (!data.baseCurrency || typeof data.baseCurrency !== "string") {
        data.baseCurrency = DEFAULT_BASE_CURRENCY;
        updated = true;
      }
      if (updated) {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), "utf8");
        console.log("Database migrated to include any newly added collections.");
      }
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

initDatabase();

// Load DB
function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, "utf8");
      const db = JSON.parse(content);
      for (const key of DB_ARRAY_KEYS) {
        db[key] = Array.isArray(db[key]) ? db[key] : [];
      }
      db.baseCurrency = normalizeBaseCurrency(db.baseCurrency);
      db.currencyRates = normalizeCurrencyRates(db.currencyRates, db.baseCurrency);
      return db;
    }
  } catch (error) {
    console.error("Error reading database file, returning default schema", error);
  }
  const defaultClone = JSON.parse(JSON.stringify(DEFAULT_DB));
  return defaultClone;
}

// Write DB
function writeDb(data: any) {
  try {
    const cleanData: any = {};
    for (const key of DB_ARRAY_KEYS) {
      cleanData[key] = Array.isArray(data[key]) ? data[key] : [];
    }
    cleanData.baseCurrency = normalizeBaseCurrency(data.baseCurrency);
    cleanData.currencyRates = normalizeCurrencyRates(data.currencyRates, cleanData.baseCurrency);
    fs.writeFileSync(DB_FILE, JSON.stringify(cleanData, null, 2), "utf8");
    return true;
  } catch (error) {
    console.error("Error writing to database file", error);
    return false;
  }
}

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
