import { execFileSync } from "child_process";

/**
 * ffmpeg's presence and, if it's missing, how to get it on *this* machine.
 *
 * Checked before any slide renders rather than at encode time: rendering five
 * 1080x1920 frames and then failing wastes half a minute and makes the missing
 * dependency look like a bug in the skill.
 */
export function ffmpegAvailable() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function ffmpegInstallHint() {
  switch (process.platform) {
    case "win32":
      return [
        "ffmpeg isn't on this machine. Install it with whichever you have:",
        "",
        "  winget install Gyan.FFmpeg",
        "  choco install ffmpeg",
        "  scoop install ffmpeg",
        "",
        "Then open a NEW terminal — Windows only picks up PATH changes in new sessions,",
        "which is the usual reason it still looks missing straight after installing.",
      ].join("\n");
    case "darwin":
      return ["ffmpeg isn't on this machine:", "", "  brew install ffmpeg"].join("\n");
    default:
      return [
        "ffmpeg isn't on this machine:",
        "",
        "  sudo apt install ffmpeg      # Debian, Ubuntu",
        "  sudo dnf install ffmpeg      # Fedora",
        "  sudo pacman -S ffmpeg        # Arch",
      ].join("\n");
  }
}

/** Statics don't need ffmpeg, so a missing encoder is never a reason to ship nothing. */
export const STATICS_STILL_WORK =
  "The static ads don't need ffmpeg — render those now and cut the video once it's installed.";
