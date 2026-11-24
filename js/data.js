// Загрузка данных и подписи, которые выводятся из данных (а не вписаны руками).
import { isAnimal, packNutrients, withHousehold } from './engine.js';
import { dateLong, dateShort, kcal, num0, weight } from './format.js';

export async function loadData() {
  const get = async (f) => {
    const r = await fetch(new URL('data/' + f, document.baseURI), { cache: 'no-cache' });
    if (!r.ok) throw new Error(f + ': ' + r.status);
    return r.json();
  };
  const [catalog, norms, baseline] = await Promise.all([get('catalog.json'), get('norms.json'), get('baseline.json')]);
  norms.profiles = withHousehold(norms.profiles);
  return { catalog, norms, baseline, items: catalog.items, facts: facts(catalog) };
}

/** Что известно о снимке цен: дата, регион, сколько цен настоящие с полки «Пятёрочки». */
export function facts(catalog) {
  const items = catalog.items;
  const shelf = items.filter((i) => i.price_basis === '5ka_shelf').length;
  const region = (String(catalog.store || '').match(/»,\s*([^:;,]+)/) || [])[1] || '';
  return {
    date: catalog.snapshot_date,
    dateLong: dateLong(catalog.snapshot_date),
    dateShort: dateShort(catalog.snapshot_date),
    region: region.trim(),
    total: items.length,
    shelf,
    other: items.length - shelf,
    allApprox: shelf === 0,
  };
}

export const PROFILE_BY_URL = { pozhiloy: 'elderly_single', vzroslyi: 'adult', semya: 'family' };
export const URL_BY_PROFILE = Object.fromEntries(Object.entries(PROFILE_BY_URL).map(([k, v]) => [v, k]));
export const PROFILE_LABEL = { elderly_single: 'Пожилой человек', adult: 'Взрослый', family: 'Семья с детьми' };
export const PROFILE_DATIVE = { elderly_single: 'одному пожилому человеку', adult: 'одному взрослому', family: 'семье с детьми' };

/** Состав семьи из данных, без служебного «КФА». */
export function composition(profile) {
  return String(profile.composition || '').replace(/\s*\(КФА[^)]*\)/g, '').replace(/,?\s*КФА\s*[\d,.]+/g, '').replace(/\s+\)/g, ')').trim();
}

// Короткие слова для подписи обычного набора — только сокращения категорий из baseline.json.
const SHORT = { 'крупы': 'крупа', 'макаронные изделия': 'макароны', 'кондитерские изделия': 'сладкое к чаю', 'подсолнечное масло': 'масло' };
export function baselineLabel(categories) {
  return categories.map((c) => SHORT[c] || c).join(', ');
}

// Слова, в которых на ценниках не пишут «ё». На странице пишем: в спецификации «ё» везде.
const YO = ['жёлтый', 'зелёная', 'зелёный', 'осветлённый', 'полутвёрдый', 'сгущённое', 'солёные', 'солёный', 'твёрдой', 'твёрдый', 'тёртый', 'тушёная', 'алёнка'];
const YO_RE = new RegExp(`(?<![а-яё])(${YO.map((w) => w.replace(/ё/g, 'е')).join('|')})(?![а-яё])`, 'gi');
const yo = (s) => s.replace(YO_RE, (m) => {
  const w = YO.find((x) => x.replace(/ё/g, 'е') === m.toLowerCase());
  return m[0] === m[0].toLowerCase() ? w : w[0].toUpperCase() + w.slice(1);
});

/**
 * Название для списка — как на полочном ценнике: отдельно название, бренд, фасовка и пояснение из скобок.
 * Убираем служебное («БЗМЖ», «цена за 1 кг», «— средняя цена Росстата», «, банка» в конце), дробные — через запятую.
 */
export function splitName(item) {
  let name = String(item.name)
    .replace(/\s+—\s+средн[^—]*$/i, '')
    .replace(/,?\s*цена за [^,]*$/i, '')
    .replace(/\s*БЗМЖ/g, '')
    .trim();
  const notes = [];
  name = name.replace(/\s*\(([^)]*)\)/g, (_, t) => { notes.push(t.trim()); return ''; });
  const re = /(\d+(?:[.,]\d+)?)\s*(?:[xх×]\s*(\d+(?:[.,]\d+)?)\s*)?(кг|г|мл|л|шт\.?|пак\.?)(?=$|[\s,.)])/gi;
  let m, last = null;
  while ((m = re.exec(name))) last = m;
  let size = '';
  if (last) {
    const n = (s) => s.replace('.', ',');
    const unit = last[3].toLowerCase().replace(/^шт$/, 'шт.').replace(/^пак$/, 'пак.');
    size = (last[2] ? `${n(last[1])}\u00a0×\u00a0${n(last[2])}` : n(last[1])) + '\u00a0' + unit;
    name = (name.slice(0, last.index) + name.slice(last.index + last[0].length)).trim();
  }
  const brand = String(item.brand || '').trim();
  const realBrand = brand && !brand.startsWith('—') ? brand : '';
  if (realBrand) {
    const esc = realBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/[её]/gi, '[её]');
    const stripped = name.replace(new RegExp('\\s*' + esc + '\\s*', 'i'), ' ').replace(/\s+/g, ' ').trim();
    if (stripped.length >= 3) name = stripped;
  }
  name = name.replace(/[\s,]+$/, '').replace(/\s+,/g, ',').replace(/,\s*(банка|пачка|бутылка|упаковка|пакет)$/i, '');
  name = yo(name.replace(/(\d)\.(\d)/g, '$1,$2'));
  return { title: name.charAt(0).toUpperCase() + name.slice(1), brand: yo(realBrand), note: notes.join(', '), size: size || weight(item.weight_g) };
}

/** Вторая строка в списке: бренд, пояснение из скобок, фасовка. */
export function metaLine(n) {
  return [n.brand, n.note, n.size].filter(Boolean).join(', ');
}

export function priceNote(item) {
  if (item.price_basis === '5ka_shelf') return '';
  if (item.price_basis === 'rosstat_avg') return 'средняя цена по России, Росстат';
  return 'цена ориентировочная, не с полки';
}

/** Вклад строки: белок (животный — так и пишем) и калории на всё количество. */
export function contribution(item, qty) {
  const p = packNutrients(item);
  const prot = Math.round(p.prot * qty);
  const parts = [];
  if (prot >= 1) parts.push(`${num0(prot)} г ${isAnimal(item) ? 'животного белка' : 'белка'}`);
  parts.push(kcal(p.kcal * qty));
  return parts.join(', ');
}

/** Название для текста «Отправить список» и таблиц. */
export function plainName(item) {
  const s = splitName(item);
  return [s.title + (s.note ? ` (${s.note})` : ''), s.brand, s.size].filter(Boolean).join(', ');
}
