// Pure logic plus a small brightness probe; hints explain *why* tracking may be unreliable.

const HINT_SHOW_MS = 600;
const HINT_HOLD_MS = 1500;
const BRIGHT_EVERY_MS = 1000;

/** Hand size and position from normalized image landmarks (x scaled by aspect so units match). */
export function handGeometry(lms, aspect = 4 / 3) {
  if (!lms) return null;
  const palm = Math.hypot((lms[0].x - lms[9].x) * aspect, lms[0].y - lms[9].y);
  let edge = false;
  for (const p of lms) if (p.x < 0.02 || p.x > 0.98 || p.y < 0.02 || p.y > 0.98) edge = true;
  return { palm, edge };
}

/** Picks the most important problem, or null when tracking conditions look fine. */
export function pickHint({ cameraOn, brightness, hand, handScore, fps }) {
  if (!cameraOn) return null;
  if (brightness !== null && brightness < 0.2) return "แสงน้อยเกินไป เปิดไฟหรือหันหน้าเข้าหาแสง";
  if (hand) {
    if (hand.palm < 0.08) return "มืออยู่ไกลกล้องเกินไป ขยับเข้ามาใกล้อีกนิด";
    if (hand.palm > 0.42) return "มือใกล้กล้องเกินไป ถอยออกอีกนิด";
    if (hand.edge) return "มือเกือบหลุดขอบภาพ เลื่อนมือเข้ามากลางภาพ";
    if (handScore !== null && handScore < 0.7) return "กล้องเห็นมือไม่ชัด หันฝ่ามือเข้ากล้องหรือเพิ่มแสง";
  }
  if (brightness !== null && brightness > 0.88) return "ภาพสว่างจ้าเกินไป หลีกเลี่ยงแสงจ้าด้านหลัง";
  if (fps > 0 && fps < 8) return `เครื่องตรวจจับมือได้ช้า (${fps.toFixed(0)} ครั้ง/วิ) ลองปิดแท็บอื่นหรือตั้ง GRAPHICS QUALITY เป็น LOW`;
  return null;
}

/** Tracks conditions over time; a hint must persist briefly to show and then stays a moment, so it never flickers. */
export class TrackingQuality {
  constructor() {
    this.brightness = null;
    this.lastBright = 0;
    this.canvas = null;
    this.hint = null;
    this.candidate = null;
    this.candidateSince = 0;
    this.shownAt = 0;
  }

  measureBrightness(video) {
    if (!video.videoWidth) return;
    try {
      this.canvas ??= Object.assign(document.createElement("canvas"), { width: 32, height: 24 });
      const g = this.canvas.getContext("2d", { willReadFrequently: true });
      g.drawImage(video, 0, 0, 32, 24);
      const d = g.getImageData(0, 0, 32, 24).data;
      let sum = 0;
      for (let k = 0; k < d.length; k += 4) sum += 0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2];
      this.brightness = sum / (d.length / 4) / 255;
    } catch {
      this.brightness = null;
    }
  }

  update(tracker, rec, now) {
    const cameraOn = tracker.cameraOn;
    if (!cameraOn) {
      this.brightness = null;
      this.hint = null;
      this.candidate = null;
      return null;
    }
    if (now - this.lastBright > BRIGHT_EVERY_MS) {
      this.lastBright = now;
      this.measureBrightness(tracker.video);
    }
    const hand = rec.handPresent ? handGeometry(tracker.landmarks, tracker.aspect) : null;
    const next = pickHint({ cameraOn, brightness: this.brightness, hand, handScore: rec.handScore, fps: tracker.detectFps });
    if (next !== this.candidate) {
      this.candidate = next;
      this.candidateSince = now;
    }
    const settled = now - this.candidateSince >= (next ? HINT_SHOW_MS : 0);
    if (settled && next !== this.hint && (this.hint === null || now - this.shownAt >= HINT_HOLD_MS)) {
      this.hint = next;
      this.shownAt = now;
    }
    return this.hint;
  }
}
