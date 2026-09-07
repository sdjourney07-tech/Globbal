require("dotenv").config();

// Local preview always uses file accounts — ignore MONGODB_URI from .env.
process.env.ALLOW_FILE_ACCOUNTS = "1";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { createAccountsStore } = require("./accounts-store.cjs");
const { createAccountsHttp } = require("./accounts-http.cjs");

const PORT = Number(process.env.PORT, 10) || 8080;
const ROOT = path.resolve(__dirname);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

function safeJoin(base, target) {
  const baseNorm = path.resolve(base);
  const resolved = path.resolve(path.join(baseNorm, target));
  const rel = path.relative(baseNorm, resolved);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return null;
  }
  return resolved;
}

function sendStaticFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(file);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    if (ext === ".html" || ext === ".css" || ext === ".js" || ext === ".svg") {
      res.setHeader("Cache-Control", "no-cache");
    }
    res.end(data);
  });
}

async function start() {
  const accountsStore = await createAccountsStore();
  const accountsHttp = createAccountsHttp(accountsStore);

  http
    .createServer(async (req, res) => {
      try {
        let urlPath = (req.url || "/").split("?")[0];
        try {
          urlPath = decodeURIComponent(urlPath);
        } catch {
          res.writeHead(400);
          res.end("Bad request");
          return;
        }

        if (urlPath.startsWith("/api/")) {
          const handled = await accountsHttp.handle(req, res, urlPath);
          if (handled) {
            return;
          }
          res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: "Not found" }));
          return;
        }

        if (urlPath === "/") {
          urlPath = "/mobile-preview.html";
        }

        const file = safeJoin(ROOT, urlPath.replace(/^\//, "").replace(/\\/g, "/"));
        if (!file) {
          res.writeHead(403);
          res.end("Forbidden");
          return;
        }
        sendStaticFile(res, file);
      } catch (err) {
        process.stderr.write(`${err.stack || err.message}\n`);
        res.writeHead(500);
        res.end("Server error");
      }
    })
    .listen(PORT, "127.0.0.1", () => {
      process.stdout.write(
        `Globbal — serving files from:\n  ${ROOT}\n` +
          `Open http://127.0.0.1:${PORT}/ for mobile preview (390×844).\n` +
          `Accounts API: enabled (${accountsStore.mode}${
            accountsStore.mode === "file" ? ", local data/accounts-store.json" : ""
          })\n`
      );
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(
          `Port ${PORT} is already in use. Close the other server or run: set PORT=8081 && npm run start:static\n`
        );
      } else {
        process.stderr.write(`${err.message}\n`);
      }
      process.exit(1);
    });
}

start().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
