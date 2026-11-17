const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.cwd());
const builtRoot = path.join(root, "dist", "chrome-mv3");
const port = Math.max(1, Number(process.argv[2]) || 8765);
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  let filePath =
    fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()
      ? path.join(candidate, "index.html")
      : candidate;
  // Generated popup/chunks live in the WXT output, not at the repository root.
  if (!fs.existsSync(filePath)) {
    const built = path.resolve(builtRoot, `.${pathname}`);
    if (built.startsWith(builtRoot + path.sep)) {
      filePath =
        fs.existsSync(built) && fs.statSync(built).isDirectory()
          ? path.join(built, "index.html")
          : built;
    }
  }
  fs.readFile(filePath, (error, data) => {
    if (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500).end(error.code || "Read error");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type":
        contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream"
    });
    response.end(data);
  });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`http://127.0.0.1:${port}\n`);
});
