// Разбор вставленного состава набора: «Макароны 450 г — 2» → товар каталога и количество. Чистые функции.

const STOP = new Set(['для', 'без', 'или', 'как', 'шт', 'штук', 'штуки', 'упак', 'уп', 'пачка', 'пачки', 'банка', 'банки', 'пакет', 'бутылка']);
// Как товары называют в списках наборов и как они названы в каталоге.
const SAY = { 'тушенка': 'тушеная', 'говяжья': 'говядина', 'свиная': 'свинина', 'сгущенка': 'сгущенное', 'подсолнечка': 'подсолнечное', 'геркулес': 'овсяные' };
const norm = (s) => String(s).toLowerCase().replace(/ё/g, 'е');
const tokens = (s) => norm(s).split(/[^a-zа-я0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t) && !/^\d+$/.test(t)).map((t) => SAY[t] || t);

// Слова-штуки после количества: «2 шт», «3 банки», «2 пачки».
const PCS = String.raw`(?:шт|штук[аи]?|уп|упак|упаковк[аи]|банк[аи]|пачк[аи]|пачек|бутылк[аи]|пакет(?:а|ов)?)\.?`;
const AFTER_SIGN = new RegExp(String.raw`^(.*?)\s*(?:—|–|-|x|х|×|\*)\s*(\d{1,4})\s*(?:${PCS})?\s*$`, 'i');
const BEFORE_PCS = new RegExp(String.raw`^(.*?)[\s,]+(\d{1,4})\s*${PCS}\s*$`, 'i');

/**
 * Количество: число в конце строки после «—», «-», «x», «×» или перед «шт», «банки», «пачки»; голое число
 * до 50 в конце строки — тоже количество («Консервы 2»), а число с единицей веса — нет («Сахар 1 кг»). Иначе 1.
 */
export function parseLine(raw) {
  const text = String(raw).trim();
  let name = text, qty = 1, m;
  if (((m = text.match(AFTER_SIGN)) || (m = text.match(BEFORE_PCS))) && m[1].trim()) {
    name = m[1]; qty = Number(m[2]);
  } else if ((m = text.match(/^(.*[^\d\s])\s+(\d{1,2})$/)) && Number(m[2]) <= 50) {
    name = m[1]; qty = Number(m[2]);
  }
  return { text, name: name.trim(), qty: Math.max(0, qty) };
}

/** Вес из строки («450 г», «1 кг», «900мл») в граммах — помогает различить фасовки. */
export function parseWeight(s) {
  const m = norm(s).match(/(\d+(?:[.,]\d+)?)\s*(кг|г|гр|мл|л)(?![а-я])/);
  if (!m) return null;
  const v = Number(m[1].replace(',', '.'));
  return m[2] === 'кг' || m[2] === 'л' ? v * 1000 : v;
}

const stem = (t) => t.slice(0, Math.max(4, t.length - 2));
function tokenMatch(q, it) {
  if (q === it) return 2;
  if (it.startsWith(stem(q)) || q.startsWith(stem(it))) return 1.5;
  return 0;
}

/** Лучший товар каталога для строки; null, если уверенного совпадения нет. */
export function matchItem(name, items) {
  const q = tokens(name);
  if (!q.length) return null;
  const w = parseWeight(name);
  let best = null;
  for (const item of items) {
    const it = tokens(item.name + ' ' + (item.brand || ''));
    let score = 0;
    for (const t of q) score += Math.max(0, ...it.map((x) => tokenMatch(t, x)));
    if (!score) continue;
    if (tokenMatch(q[0], tokens(item.name)[0] || '') > 0) score += 1; // совпал сам продукт — первое слово
    const iw = parseWeight(item.name) ?? item.weight_g; // «1 л» в названии, а не 920 г масла
    if (w && Math.abs(iw - w) <= w * 0.06) score += 1;
    // при равенстве — товар с ценой «Пятёрочки», потом самый недорогой (так обычно и закупают)
    const key = [score, item.price_basis === '5ka_shelf' ? 1 : 0, -item.price_rub];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && (key[1] > best.key[1] || (key[1] === best.key[1] && key[2] > best.key[2])))) best = { item, key };
  }
  return best && best.key[0] >= 3 ? best.item : null;
}

/** Весь текст: строки → {text, qty, item|null}. Пустые строки пропускаем. */
export function parseList(text, items) {
  return String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
    const p = parseLine(l);
    return { ...p, item: matchItem(p.name, items) };
  });
}
