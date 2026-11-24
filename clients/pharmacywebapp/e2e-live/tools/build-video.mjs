// Turns the guided flow videos into shareable MP4s.
//
//   node e2e-live/tools/build-video.mjs --out "C:\path\videos-folder"
//
// For each e2e-live/videos/<flow>.webm: <out>/<flow>.mp4. Then one PharmaCare-Full-Guide.mp4 with a 3-second
// title card before every flow and a chapter marker per flow (players show them as a chapter list).
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const VIDEOS = path.join(here, "..", "videos")
const i = process.argv.indexOf("--out")
const out = i > 0 ? process.argv[i + 1] : path.join(here, "..", ".run", "mp4")
const work = path.join(out, "_work")
fs.mkdirSync(work, { recursive: true })

const ff = (args) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" })
const seconds = (file) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim())

// Same size/rate/codec everywhere so the parts can be joined without re-encoding.
const ENC = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-r", "25", "-vf", "scale=1440:900:force_original_aspect_ratio=decrease,pad=1440:900:(ow-iw)/2:(oh-ih)/2", "-an"]
const FONT = "C\\:/Windows/Fonts/segoeuib.ttf"
const titleOf = (base) => {
  const [no, ...rest] = base.split("-")
  const words = rest.join(" ")
  return `${no} · ${words.charAt(0).toUpperCase()}${words.slice(1)}`
}

const files = fs.readdirSync(VIDEOS).filter((f) => f.endsWith(".webm")).sort()
const list = []
const chapters = []
let t = 0
for (const f of files) {
  const base = f.replace(/\.webm$/, "")
  const mp4 = path.join(out, `${base}.mp4`)
  ff(["-i", path.join(VIDEOS, f), ...ENC, mp4])
  const card = path.join(work, `${base}-card.mp4`)
  const text = titleOf(base).replace(/[:'\\]/g, "")
  ff(["-f", "lavfi", "-i", "color=c=0x0f172a:s=1440x900:d=3:r=25", "-vf", `drawtext=fontfile='${FONT}':text='${text}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=(h-text_h)/2,drawtext=fontfile='${FONT}':text='PharmaCare guide':fontcolor=0x5eead4:fontsize=26:x=(w-text_w)/2:y=(h/2)+60`, "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-r", "25", card])
  list.push(card, mp4)
  const len = 3 + seconds(mp4)
  chapters.push({ title: titleOf(base), start: t, end: t + len })
  t += len
  console.log(`${base}.mp4 (${Math.round(seconds(mp4))}s)`)
}

const listFile = path.join(work, "list.txt")
fs.writeFileSync(listFile, list.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"))
const meta = path.join(work, "chapters.txt")
fs.writeFileSync(
  meta,
  `;FFMETADATA1\ntitle=PharmaCare full guide\n` +
    chapters.map((c) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${c.title}\n`).join(""),
)
const full = path.join(out, "PharmaCare-Full-Guide.mp4")
ff(["-f", "concat", "-safe", "0", "-i", listFile, "-i", meta, "-map_metadata", "1", "-map_chapters", "1", "-c", "copy", "-movflags", "+faststart", full])
fs.rmSync(work, { recursive: true, force: true })
console.log(`full guide: ${files.length} flows, ${Math.round(seconds(full) / 60)} min -> ${full}`)
