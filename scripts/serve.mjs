import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
    const relativePath = file.slice(root.length + 1);

    // Serve only the page and its assets; never expose Git or arbitrary project files.
    const isPublic = ["index.html", "styles.css", "script.js"].includes(relativePath)
      || relativePath.startsWith(`assets${sep}`);

    if (!file.startsWith(`${root}${sep}`) || !isPublic) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404);
    response.end("Not found");
  }
});

server.on("error", (error) => {
  console.error(`Cannot start preview: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Teaboom preview: http://localhost:${port}/`);
});
