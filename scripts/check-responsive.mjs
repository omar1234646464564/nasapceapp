/**
 * Headless responsive check for the Lunar Horizon deployment.
 *
 * Usage: node scripts/check-responsive.mjs <url> [widths...]
 * Reports horizontal overflow, the copilot launcher geometry, and any
 * console/page errors for each requested viewport width.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME =
  process.env.CHROME_PATH ??
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const url = process.argv[2] ?? "https://lunarhorizon.vercel.app/";
const widths = process.argv.slice(3).map(Number).filter(Boolean);
const sizes = widths.length ? widths : [390, 768, 1440];

const profile = mkdtempSync(join(tmpdir(), "lh-chrome-"));

function run(width) {
  return new Promise((resolve) => {
    const port = 9200 + Math.floor(Math.random() * 400);
    const proc = spawn(CHROME, [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--window-size=${width},900`,
      "--hide-scrollbars",
      "--no-first-run",
      "--disable-gpu",
      "about:blank",
    ]);

    const cleanup = () => {
      try {
        proc.kill();
      } catch {}
      resolve();
    };

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));

    (async () => {
      await wait(1600);
      try {
        const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
          r.json()
        );
        const page = targets.find((t) => t.type === "page");
        if (!page) throw new Error("no page target");
        const WS = globalThis.WebSocket;
        if (!WS) throw new Error("WebSocket unavailable");
        const ws = new WS(page.webSocketDebuggerUrl);
        let id = 0;
        const pending = new Map();
        const events = [];
        const send = (method, params = {}) =>
          new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { res, rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        await new Promise((res, rej) => {
          ws.addEventListener("open", res, { once: true });
          ws.addEventListener("error", rej, { once: true });
        });
        ws.addEventListener("message", (event) => {
          const msg = JSON.parse(event.data.toString());
          if (msg.id && pending.has(msg.id)) {
            const { res, rej } = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) rej(new Error(JSON.stringify(msg.error)));
            else res(msg.result);
          } else if (msg.method) {
            events.push(msg);
          }
        });

        await send("Runtime.enable");
        await send("Log.enable");
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {
          width,
          height: 900,
          deviceScaleFactor: 1,
          mobile: width < 700,
        });
        await send("Page.navigate", { url });
        await wait(4200);

        const evalResult = await send("Runtime.evaluate", {
          expression: `(() => {
            const doc = document.documentElement;
            const overflow = doc.scrollWidth - doc.clientWidth;
            const launcher = document.querySelector('button[aria-controls="luna-panel"]');
            const r = launcher ? launcher.getBoundingClientRect() : null;
            return {
              innerWidth: window.innerWidth,
              scrollWidth: doc.scrollWidth,
              overflow,
              hasLauncher: Boolean(launcher),
              launcherRect: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
              launcherVisible: r ? (r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1 && r.width > 0) : false,
            };
          })()`,
          returnByValue: true,
        });

        const consoleErrors = events
          .filter((e) => e.method === "Log.entryAdded" && e.params?.entry?.level === "error")
          .map((e) => e.params.entry.text);
        const exceptions = events
          .filter((e) => e.method === "Runtime.exceptionThrown")
          .map((e) => e.params?.exceptionDetails?.text);

        resolve({
          width,
          ...evalResult.result.value,
          consoleErrors,
          exceptions,
        });
      } catch (err) {
        resolve({ width, error: String(err) });
      } finally {
        cleanup();
      }
    })();
  });
}

const results = [];
for (const width of sizes) {
  results.push(await run(width));
}
console.log(JSON.stringify(results, null, 2));
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}
