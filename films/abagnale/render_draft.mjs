import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const PORT = 8765;
const OUT = path.join(ROOT, "draft");
const FRAMES = path.join(OUT, "frames");

const times = process.argv.includes("--stills")
  ? [0, 27.22, 36.6]
  : null;

function serve() {
  const child = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: ROOT, stdio: ["ignore", "pipe", "pipe"],
  });
  return child;
}

async function main() {
  await mkdir(FRAMES, { recursive: true });
  const server = serve();
  await new Promise((r) => setTimeout(r, 400));
  const browser = await puppeteer.launch({
    executablePath: "/usr/local/bin/google-chrome",
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--hide-scrollbars",
    ],
  });
  const page = await browser.newPage();
  page.on("pageerror", (err) => { console.error("PAGE", err); process.exitCode = 1; });
  page.on("console", (msg) => { if (msg.type() === "error") console.error("CONSOLE", msg.text()); });
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 0.5 });
  await page.goto(`http://127.0.0.1:${PORT}/film/index.html`, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(() => window.READY);
  const dur = await page.evaluate(() => window.DUR);
  const fps = await page.evaluate(() => window.FPS);
  const n = Math.round(dur * fps);
  const jobs = times
    ? times.map((t, i) => ({ t, file: path.join(OUT, `still_${String(i).padStart(2, "0")}_${t.toFixed(2)}.jpg`) }))
    : Array.from({ length: n }, (_, i) => ({ t: i / fps, file: path.join(FRAMES, `${String(i).padStart(4, "0")}.jpg`) }));
  const t0 = Date.now();
  for (let i = 0; i < jobs.length; i++) {
    const { t, file } = jobs[i];
    await page.evaluate(async (time) => {
      window.seek(time);
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    }, t);
    const buf = await page.screenshot({ type: "jpeg", quality: 72, captureBeyondViewport: false });
    await writeFile(file, buf);
    if (i === 0 || i % 100 === 0 || i === jobs.length - 1) {
      const sec = (Date.now() - t0) / 1000;
      console.log(`${i + 1}/${jobs.length} t=${t.toFixed(3)} ${sec.toFixed(1)}s`);
    }
  }
  await browser.close();
  server.kill();
  console.log("frames", jobs.length);
  if (!times) {
    await new Promise((resolve, reject) => {
      const ff = spawn("ffmpeg", [
        "-y", "-framerate", "30", "-i", path.join(FRAMES, "%04d.jpg"),
        "-i", path.join(OUT, "mix.wav"),
        "-t", "50.1",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", "-preset", "fast", "-tune", "animation",
        "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-c:a", "aac", "-b:a", "192k",
        path.join(OUT, "abagnale-draft.mp4"),
      ], { stdio: "inherit" });
      ff.on("exit", (code) => code === 0 ? resolve() : reject(new Error("ffmpeg " + code)));
    });
    console.log("encoded");
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
