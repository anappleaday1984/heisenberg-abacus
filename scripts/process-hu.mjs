import { spawnSync } from "node:child_process";

const args = [
  "/tmp/celeb-photos/hu_2.jpg",
  "-auto-orient",
  "-crop", "350x350+170+30",
  "+repage",
  "-resize", "768x768",
  "-color-matrix", "0.55, 0.0, 0.20, 0.0, 0.75, 0.15, 0.10, 0.0, 1.10",
  "-modulate", "130,95,100",
  "-gamma", "1.15",
  "-fill", "#a78bfa",
  "-tint", "12",
  "/tmp/celeb-photos/huhanyen_v2.png",
];

const r = spawnSync("/opt/homebrew/bin/magick", args, { stdio: "inherit" });
console.log("exit", r.status);
