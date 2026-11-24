// Общее для всех видов: параметры адреса, шапка, подвал, блок «Тот же расчёт для других задач».
import { h } from './dom.js';
import { REPO_URL } from './config.js';

/** Параметры адреса. Некорректные значения молча заменяются значениями по умолчанию (кроме суммы — её проверяет вид). */
export function readParams() {
  const q = new URLSearchParams(location.search);
  const s = ['korob', 'nedelya', 'nabory'].includes(q.get('s')) ? q.get('s') : 'korob';
  const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter((x) => /^[\w-]{1,80}$/.test(x)) : []);
  const k = {};
  for (const part of (q.get('k') || '').split(',')) {
    const [id, qty] = part.split('*');
    if (/^[\w-]{1,80}$/.test(id || '') && /^\d{1,2}$/.test(qty || '1')) k[id] = Number(qty || 1);
  }
  return {
    s,
    b: q.has('b') ? q.get('b') : null,
    bRaw: q.get('b'),
    p: q.get('p'),
    n: q.get('n'),
    x: [...new Set(list(q.get('x')))],
    k,
  };
}

/** Пишем состояние в адрес без засорения истории. */
export function writeUrl({ s, b, p, n, x, k }) {
  const q = new URLSearchParams();
  q.set('s', s);
  if (b != null) q.set('b', String(b));
  if (p) q.set('p', p);
  if (n != null) q.set('n', String(n));
  if (x && x.length) q.set('x', x.join(','));
  const ks = Object.entries(k || {}).map(([id, qty]) => `${id}*${qty}`);
  if (ks.length) q.set('k', ks.join(','));
  const url = '?' + q.toString().replace(/%2C/gi, ',');
  if (url !== location.search) history.replaceState(null, '', url + location.hash);
}

const TASKS = {
  korob: { href: './?s=korob', title: 'Что положить в короб', text: 'Список на 150, 300 или 500 ₽ из того, что хранится без холодильника.' },
  nedelya: { href: './?s=nedelya', title: 'Покупки на неделю по сертификату', text: 'Что купить на всю сумму, чтобы на семь дней хватило калорий и белка, включая животный.' },
  nabory: { href: './?s=nabory', title: 'Состав продуктовых наборов', text: 'Сколько наборов выйдет из бюджета закупки и чего не хватает в уже собранном.' },
};

export function otherTasks(current) {
  return h('section', { class: 'other-tasks', 'aria-labelledby': 'other-h' },
    h('h2', { id: 'other-h' }, 'Тот же расчёт для других задач'),
    h('ul', null, Object.entries(TASKS).filter(([k]) => k !== current).map(([, t]) =>
      h('li', null, h('a', { href: t.href }, t.title), h('p', null, t.text)))));
}

/** Шапка: отмечаем текущую страницу. */
export function markNav(current) {
  for (const a of document.querySelectorAll('.nav a[data-view]')) {
    if (a.dataset.view === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

/** Строка о ценах под итогом: честно о смеси цен с полки и средних Росстата. */
export function priceDateLine(data, lines, forShare = false) {
  const f = data.facts;
  const hasOther = lines.some((l) => l.item.price_basis !== '5ka_shelf');
  const allOther = lines.length > 0 && lines.every((l) => l.item.price_basis !== '5ka_shelf');
  if (f.allApprox) return forShare ? `Цены примерные, на ${f.dateShort}, на кассе будут другими.` : 'Сумма примерная';
  if (forShare) {
    return `Цены «Пятёрочки» на ${f.dateShort}${hasOther ? (allOther ? ' не найдены, здесь средние по России (Росстат)' : ', у части товаров — средние по России (Росстат)') : ''}; в магазине могут отличаться.`;
  }
  return `Цены «Пятёрочки»${f.region ? ' (' + f.region + ')' : ''} на ${f.dateLong}` + (hasOther ? '; где отмечено — средняя цена по России, Росстат' : '');
}

/** Подвал: заполняем фактами из каталога. */
export function fillFooter(data) {
  const el = document.getElementById('footer-prices');
  if (!el) return;
  const f = data.facts;
  el.textContent = f.allApprox
    ? `Цены примерные: собраны по открытым источникам на ${f.dateLong}.`
    : `Цены: у ${f.shelf} из ${f.total} товаров — из прайс-листов магазинов «Пятёрочки»${f.region ? ' (' + f.region + ')' : ''} на ${f.dateLong}, у остальных ${f.other} — средние по России от Росстата, они помечены в списке. В вашем магазине цены и наличие могут отличаться.`;
  const repo = document.getElementById('repo-link');
  if (repo) repo.href = REPO_URL;
}
