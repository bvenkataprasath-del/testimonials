import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 9000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "testimonials.db");

fs.mkdirSync(dataDir, { recursive: true });

sqlite3.verbose();
const db = new sqlite3.Database(dbPath);

function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

await dbRun("PRAGMA journal_mode = WAL;");
await dbRun(`
  CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    company TEXT,
    role TEXT,
    message TEXT NOT NULL,
    rating INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

function normalizeRating(raw) {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 1 || i > 5) return null;
  return i;
}

app.get("/", (_req, res) => {
  res.redirect("/submit");
});

app.get("/submit", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Submit testimonial</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; }
      .wrap { max-width: 860px; margin: 0 auto; padding: 24px; }
      .top { display:flex; gap: 12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
      a { color: inherit; }
      .card { border: 1px solid rgba(127,127,127,.35); border-radius: 14px; padding: 18px; }
      form { display:grid; gap: 12px; }
      .grid { display:grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      @media (max-width: 720px) { .grid { grid-template-columns: 1fr; } }
      label { display:grid; gap: 6px; font-size: 14px; }
      input, textarea, select, button {
        font: inherit; border-radius: 12px; border: 1px solid rgba(127,127,127,.35);
        padding: 10px 12px; background: transparent;
      }
      textarea { min-height: 130px; resize: vertical; }
      button { cursor: pointer; font-weight: 600; }
      .muted { opacity: .75; font-size: 13px; }
      .ok { display:none; margin-top: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(80,200,120,.5); }
      .err { display:none; margin-top: 12px; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(220,80,80,.55); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <h1 style="margin:0;">Submit a testimonial</h1>
        <div class="muted">
          <a href="/testimonials">View testimonials</a>
        </div>
      </div>

      <div class="card" style="margin-top:16px;">
        <form id="tForm">
          <div class="grid">
            <label>
              Name *
              <input name="name" required maxlength="80" placeholder="Jane Doe" />
            </label>
            <label>
              Company
              <input name="company" maxlength="80" placeholder="Acme Inc." />
            </label>
            <label>
              Role
              <input name="role" maxlength="80" placeholder="Founder" />
            </label>
            <label>
              Rating
              <select name="rating">
                <option value="">No rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Great</option>
                <option value="3">3 - Good</option>
                <option value="2">2 - Okay</option>
                <option value="1">1 - Poor</option>
              </select>
            </label>
          </div>

          <label>
            Testimonial *
            <textarea name="message" required maxlength="1200" placeholder="What did you like? What changed for you?"></textarea>
          </label>

          <div style="display:flex; gap: 10px; align-items:center; flex-wrap:wrap;">
            <button type="submit">Save testimonial</button>
            <span class="muted">Saved testimonials are stored in local SQLite.</span>
          </div>
        </form>

        <div id="ok" class="ok">Saved. <a href="/testimonials">Go to testimonials</a>.</div>
        <div id="err" class="err"></div>
      </div>
    </div>

    <script>
      const form = document.getElementById("tForm");
      const ok = document.getElementById("ok");
      const err = document.getElementById("err");

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        ok.style.display = "none";
        err.style.display = "none";
        err.textContent = "";

        const fd = new FormData(form);
        const payload = Object.fromEntries(fd.entries());

        try {
          const res = await fetch("/api/testimonials", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload)
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data?.error || "Failed to save testimonial");
          form.reset();
          ok.style.display = "block";
        } catch (e) {
          err.textContent = e?.message || "Unexpected error";
          err.style.display = "block";
        }
      });
    </script>
  </body>
</html>
  `);
});

app.get("/testimonials", (_req, res) => {
  res.type("html").send(`
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Testimonials</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; margin: 0; }
      .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
      a { color: inherit; }
      .top { display:flex; gap: 12px; align-items:center; justify-content:space-between; flex-wrap:wrap; }
      .grid { display:grid; gap: 12px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: 16px; }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
      .card { border: 1px solid rgba(127,127,127,.35); border-radius: 14px; padding: 18px; }
      .meta { display:flex; gap: 10px; justify-content:space-between; align-items:baseline; flex-wrap:wrap; }
      .name { font-weight: 700; }
      .muted { opacity: .75; font-size: 13px; }
      .msg { margin-top: 10px; line-height: 1.5; white-space: pre-wrap; }
      .pill { display:inline-block; padding: 4px 10px; border-radius: 999px; border: 1px solid rgba(127,127,127,.35); font-size: 12px; }
      .row { display:flex; gap: 10px; align-items:center; flex-wrap:wrap; }
      button { font: inherit; cursor:pointer; padding: 8px 12px; border-radius: 12px; background: transparent; border: 1px solid rgba(127,127,127,.35); }
      .empty { margin-top: 14px; padding: 14px; border: 1px dashed rgba(127,127,127,.45); border-radius: 14px; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="top">
        <h1 style="margin:0;">Testimonials</h1>
        <div class="row">
          <button id="refreshBtn" type="button">Refresh</button>
          <a class="muted" href="/submit">Submit a testimonial</a>
        </div>
      </div>

      <div id="empty" class="empty" style="display:none;">
        No testimonials yet. <a href="/submit">Be the first to add one</a>.
      </div>
      <div id="grid" class="grid"></div>
    </div>

    <script>
      const grid = document.getElementById("grid");
      const empty = document.getElementById("empty");
      const refreshBtn = document.getElementById("refreshBtn");

      function stars(n) {
        if (!n) return "";
        return "★".repeat(n) + "☆".repeat(5 - n);
      }

      async function load() {
        grid.innerHTML = "";
        empty.style.display = "none";
        const res = await fetch("/api/testimonials");
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) {
          empty.style.display = "block";
          return;
        }
        for (const t of data) {
          const card = document.createElement("div");
          card.className = "card";
          const headline = [t.role, t.company].filter(Boolean).join(" • ");
          const meta = document.createElement("div");
          meta.className = "meta";

          const left = document.createElement("div");
          const nameEl = document.createElement("div");
          nameEl.className = "name";
          nameEl.textContent = t.name || "";
          const headlineEl = document.createElement("div");
          headlineEl.className = "muted";
          headlineEl.textContent = headline || "";
          left.appendChild(nameEl);
          left.appendChild(headlineEl);

          const right = document.createElement("div");
          right.className = "row";
          if (t.rating) {
            const pill = document.createElement("span");
            pill.className = "pill";
            pill.title = "Rating";
            pill.textContent = stars(t.rating);
            right.appendChild(pill);
          }
          const dateEl = document.createElement("span");
          dateEl.className = "muted";
          dateEl.textContent = new Date(t.created_at).toLocaleString();
          right.appendChild(dateEl);

          meta.appendChild(left);
          meta.appendChild(right);

          const msg = document.createElement("div");
          msg.className = "msg";
          msg.textContent = t.message || "";

          card.appendChild(meta);
          card.appendChild(msg);
          grid.appendChild(card);
        }
      }

      refreshBtn.addEventListener("click", load);
      load().catch(() => {
        empty.style.display = "block";
        empty.textContent = "Failed to load testimonials.";
      });
    </script>
  </body>
</html>
  `);
});

app.get("/api/testimonials", async (_req, res) => {
  try {
    const rows = await dbAll(
      `SELECT id, name, company, role, message, rating, created_at
       FROM testimonials
       ORDER BY datetime(created_at) DESC, id DESC
       LIMIT 200`
    );
    res.json(rows);
  } catch (e) {
    console.error("Error fetching testimonials", e);
    res.status(500).json({ error: "Failed to load testimonials" });
  }
});

app.post("/api/testimonials", async (req, res) => {
  const name = (req.body?.name ?? "").toString().trim();
  const company = (req.body?.company ?? "").toString().trim() || null;
  const role = (req.body?.role ?? "").toString().trim() || null;
  const message = (req.body?.message ?? "").toString().trim();
  const rating = normalizeRating(req.body?.rating);

  if (!name) return res.status(400).json({ error: "Name is required" });
  if (!message) return res.status(400).json({ error: "Message is required" });

  try {
    const result = await dbRun(
      `INSERT INTO testimonials (name, company, role, message, rating)
       VALUES (?, ?, ?, ?, ?)`,
      [name, company, role, message, rating]
    );

    const created = await dbGet(
      `SELECT id, name, company, role, message, rating, created_at
       FROM testimonials
       WHERE id = ?`,
      [result.lastID]
    );

    res.status(201).json(created);
  } catch (e) {
    console.error("Error saving testimonial", e);
    res.status(500).json({ error: "Failed to save testimonial" });
  }
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

