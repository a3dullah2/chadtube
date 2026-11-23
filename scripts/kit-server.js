const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..", "download", "chadtube-starter-kit");
const types = { ".html": "text/html", ".json": "application/json", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".gz": "application/gzip" };
http
  .createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    fs.readFile(p, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("nope");
        return;
      }
      res.writeHead(200, { "Content-Type": types[path.extname(p)] || "application/octet-stream" });
      res.end(data);
    });
  })
  .listen(8899, () => console.log("kit on 8899"));
