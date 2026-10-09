/** Render the original Three.js scene into local background media.
 * Usage: FFMPEG_PATH=/path/to/ffmpeg node scripts/render-hero-video.mjs
 * Requires Playwright Chromium and FFmpeg (H.264 and libvpx-vp9).
 * Three.js is a development dependency; no WebGL runtime ships to visitors.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "@playwright/test";
const root = path.resolve(import.meta.dirname, "..");
const output = path.join(root, "public/sporthub/hero");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const posterOnly = process.argv.includes("--poster-only");

async function main() {
  fs.mkdirSync(output, { recursive: true });
  const server = http.createServer((req, res) => {
    const file =
      req.url === "/three.module.js"
        ? "node_modules/three/build/three.module.js"
        : req.url === "/three.core.js"
          ? "node_modules/three/build/three.core.js"
          : "scripts/hero-arena-scene.html";
    res.setHeader(
      "Content-Type",
      file.endsWith(".js") ? "text/javascript" : "text/html",
    );
    fs.createReadStream(path.join(root, file)).pipe(res);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
    });
    page.on("pageerror", (error) => console.error(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.waitForFunction(() => window.sceneReady);
    const canvas = page.locator("canvas").first();
    await canvas.screenshot({
      path: path.join(output, "arena-poster-v2.jpg"),
      type: "jpeg",
      quality: 95,
    });
    if (posterOnly) return;
    const encoder = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-r",
        "24",
        "-i",
        "-",
        "-an",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "21",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        path.join(output, "arena-loop.mp4"),
      ],
      { stdio: ["pipe", "ignore", "inherit"] },
    );
    const completion = once(encoder, "close");
    for (let frame = 0; frame < 192; frame++) {
      await page.evaluate((phase) => window.renderFrame(phase), frame / 192);
      const jpeg = await canvas.screenshot({ type: "jpeg", quality: 95 });
      if (!encoder.stdin.write(jpeg)) await once(encoder.stdin, "drain");
      if (frame % 48 === 0) console.log(`Rendered ${frame}/192 frames`);
    }
    encoder.stdin.end();
    if ((await completion)[0] !== 0) throw new Error("MP4 encoding failed");
    const webm = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        path.join(output, "arena-loop.mp4"),
        "-an",
        "-vf",
        "scale=1280:720",
        "-c:v",
        "libvpx-vp9",
        "-b:v",
        "0",
        "-crf",
        "30",
        "-deadline",
        "good",
        "-cpu-used",
        "4",
        path.join(output, "arena-loop.webm"),
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    if ((await once(webm, "close"))[0] !== 0)
      throw new Error("WebM encoding failed");
    console.log("Hero media rendered into public/sporthub/hero");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
