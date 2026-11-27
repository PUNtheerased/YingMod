export const $ = (id) => document.getElementById(id);

/** Writes only when the value changed, so per-frame UI updates don't thrash layout. */
export function setText(el, value) {
  const v = String(value);
  if (el.textContent !== v) el.textContent = v;
}

export function setStyle(el, prop, value) {
  if (el.style[prop] !== value) el.style[prop] = value;
}

export function toggle(el, cls, on) {
  if (el.classList.contains(cls) !== on) el.classList.toggle(cls, on);
}

export function formatTime(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function icon(name, cls = "") {
  return `<svg class="${cls}"><use href="#i-${name}"/></svg>`;
}
