// Небольшие помощники для DOM: создание элементов, иконки, живая область, уведомления, копирование, анимация числа.
import { floorDays } from './engine.js';
import { daysParts } from './format.js';

/** h('p', {class: 'x'}, 'текст', child) — элемент без innerHTML: данные каталога никогда не попадают в разметку как HTML. */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.setAttribute('style', v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, children);
  return el;
}
/** replaceChildren без null/false: условные блоки можно передавать как есть. */
export function put(el, ...children) {
  el.replaceChildren(...children.flat().filter((c) => c != null && c !== false));
}
function append(el, children) {
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVG = 'http://www.w3.org/2000/svg';
function svg(viewBox, paths, cls) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', viewBox);
  s.setAttribute('aria-hidden', 'true');
  s.setAttribute('focusable', 'false');
  if (cls) s.setAttribute('class', cls);
  for (const d of paths) {
    const p = document.createElementNS(SVG, d.circle ? 'circle' : 'path');
    for (const [k, v] of Object.entries(d)) if (k !== 'circle') p.setAttribute(k, v);
    p.setAttribute('fill', 'none');
    p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '2.5');
    p.setAttribute('stroke-linecap', 'round');
    p.setAttribute('stroke-linejoin', 'round');
    s.append(p);
  }
  return s;
}
export const icon = {
  check: () => svg('0 0 20 20', [{ d: 'M4 10.5l4 4 8-9' }]),
  chevron: () => svg('0 0 20 20', [{ d: 'M5 7.5l5 5 5-5' }]),
  alert: () => svg('0 0 20 20', [{ circle: true, cx: '10', cy: '10', r: '8' }, { d: 'M10 5.5v5.5' }, { d: 'M10 14.2v.3' }]),
};

/** Ошибка поля: текст + значок, связь через aria-describedby. */
export function setFieldError(input, box, text, extra) {
  box.replaceChildren();
  if (!text) {
    input.removeAttribute('aria-invalid');
    box.hidden = true;
    return;
  }
  input.setAttribute('aria-invalid', 'true');
  box.hidden = false;
  box.append(h('p', { class: 'error' }, icon.alert(), h('span', null, text)));
  if (extra) box.append(h('div', { class: 'error-actions' }, extra));
}

let liveEl = null;
/** Одна вежливая живая область на страницу. */
export function announce(text) {
  if (!liveEl) liveEl = document.getElementById('live');
  if (!liveEl) return;
  liveEl.textContent = '';
  // пауза нужна, чтобы диктор заметил одинаковый текст
  setTimeout(() => { liveEl.textContent = text; }, 60);
}

let toastTimer = 0;
export function toast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', 'aria-hidden': 'true' });
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add('is-on');
  announce(text);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3000);
}

/** Копирование: Clipboard API, иначе — выделенная textarea для ручного копирования. */
export async function copyText(text, fallbackHost, okText = 'Список скопирован') {
  try {
    if (!navigator.clipboard || !window.isSecureContext) throw new Error('no clipboard');
    await navigator.clipboard.writeText(text);
    fallbackHost?.replaceChildren();
    toast(okText);
    return true;
  } catch {
    if (fallbackHost) {
      const ta = h('textarea', { class: 'input', name: 'copy-text', readonly: true, 'aria-label': 'Текст для копирования' });
      ta.value = text;
      fallbackHost.replaceChildren(
        h('div', { class: 'copy-fallback' }, h('p', { class: 'error' }, icon.alert(), h('span', null, 'Не получилось скопировать. Текст выделен ниже — скопируйте его вручную.')), ta),
      );
      ta.focus();
      ta.select();
      announce('Не получилось скопировать. Текст выделен ниже — скопируйте его вручную.');
    }
    return false;
  }
}

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// cubic-bezier(0.2, 0, 0, 1): численно решаем x(t) = p, возвращаем y(t).
function easeOut(p) {
  const bx = (t) => 3 * (1 - t) * (1 - t) * t * 0.2 + 3 * (1 - t) * t * t * 0 + t * t * t;
  const by = (t) => 3 * (1 - t) * t * t * 1 + t * t * t;
  let lo = 0, hi = 1;
  for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (bx(m) < p) lo = m; else hi = m; }
  return by((lo + hi) / 2);
}

/** Число на ценнике досчитывает от старого значения к новому за 320 мс. Диктор получает только конечное значение. */
export function animateDays(numEl, from, to, format = (v) => daysParts(v).num) {
  const final = format(to);
  if (reducedMotion() || !(from >= 0) || Math.abs(floorDays(from) - floorDays(to)) < 1e-9) {
    numEl.textContent = final;
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / 320);
    numEl.textContent = p >= 1 ? final : format(from + (to - from) * easeOut(p));
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Клетки дней: по клетке на день, последняя дробная залита частично; больше 14 — сплошная полоса. */
export function cells(value, count, typical = false) {
  const v = Math.max(0, value);
  if (count > 14) {
    const bar = h('div', { class: 'cells cells--bar' + (typical ? ' cells--typical' : ''), 'aria-hidden': 'true' }, h('i'));
    bar.style.setProperty('--f', String(Math.min(1, v / count)));
    return bar;
  }
  const box = h('div', { class: 'cells' + (typical ? ' cells--typical' : ''), 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const f = Math.max(0, Math.min(1, v - i));
    const c = h('span', { class: 'cell' }, h('i'));
    c.style.setProperty('--f', String(f));
    c.style.setProperty('--d', `${i * 40}ms`);
    box.append(c);
  }
  requestAnimationFrame(() => requestAnimationFrame(() => box.classList.add('is-filled')));
  return box;
}
