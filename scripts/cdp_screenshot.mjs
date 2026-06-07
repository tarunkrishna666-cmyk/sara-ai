import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const [
  ,
  ,
  browserPath,
  portText,
  url,
  outputPath,
  widthText,
  heightText,
  userAgent = "",
  waitText = "5000",
  closeInstallText = "",
] = process.argv;

if (!browserPath || !portText || !url || !outputPath || !widthText || !heightText) {
  console.error("Usage: node cdp_screenshot.mjs <browser> <port> <url> <output> <width> <height> [userAgent]");
  process.exit(2);
}

const port = Number(portText);
const width = Number(widthText);
const height = Number(heightText);
const waitMs = Number(waitText);
mkdirSync(dirname(outputPath), { recursive: true });

const browser = spawn(browserPath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${dirname(outputPath)}/profile-${port}`,
  "about:blank",
]);

browser.stderr.on("data", () => undefined);
browser.stdout.on("data", () => undefined);

async function waitForDevTools() {
  for (let index = 0; index < 80; index += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("DevTools port did not open");
}

async function cdp() {
  await waitForDevTools();
  const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, {
    method: "PUT",
  });
  const target = await response.json();
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  });

  function send(method, params = {}) {
    id += 1;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve) => pending.set(id, resolve));
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 768,
  });
  if (userAgent && userAgent !== "-") {
    await send("Emulation.setUserAgentOverride", { userAgent });
  }
  await send("Page.navigate", { url });
  await new Promise((resolve) => setTimeout(resolve, waitMs));
  if (closeInstallText === "close-install") {
    await send("Runtime.evaluate", {
      expression: "document.querySelector('.install-close')?.click()",
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  const screenshot = await send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(outputPath, Buffer.from(screenshot.result.data, "base64"));
  socket.close();
}

try {
  await cdp();
} finally {
  browser.kill();
}
