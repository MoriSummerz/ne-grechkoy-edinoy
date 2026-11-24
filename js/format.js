// Форматирование чисел и склонения. Чистые функции, общие для страницы и тестов.
import { floorDays } from './engine.js';

const NBSP = ' ';
const pr = new Intl.PluralRules('ru-RU');
const nf1 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Склонение счётного слова: forms = [один, несколько, много]; дробные — как «несколько» («3,8 дня»). */
export function plural(n, [one, few, many]) {
  const c = pr.select(n);
  return c === 'one' ? one : c === 'few' ? few : c === 'many' ? many : few;
}
export const DAY = ['день', 'дня', 'дней'];
export const ITEM = ['товар', 'товара', 'товаров'];
export const PIECE = ['штука', 'штуки', 'штук'];
export const SET = ['набор', 'набора', 'наборов'];

/**
 * Дни нормы для показа: вниз до 0,1 (от 10 — до целого). Возвращает число и слово отдельно — на ценнике они разного размера.
 * 0 → «0 дней»; от 0 до 0,1 → «меньше 0,1 дня».
 */
export function daysParts(d) {
  if (!(d > 0)) return { num: '0', unit: 'дней', value: 0, less: false };
  const v = floorDays(d);
  if (v < 0.1) return { num: '0,1', unit: 'дня', value: 0, less: true, prefix: 'меньше' };
  return { num: nf1.format(v), unit: plural(v, DAY), value: v, less: false };
}
export function daysText(d) {
  const p = daysParts(d);
  return (p.less ? 'меньше ' : '') + p.num + ' ' + p.unit;
}

/** «287,60 ₽» — цены всегда с копейками. */
export function rub(x) {
  return nf2.format(x) + NBSP + '₽';
}
/** «1 250 ₽» — бюджеты и суммы закупки без копеек. */
export function rub0(x) {
  return nf0.format(x) + NBSP + '₽';
}
export function num0(x) {
  return nf0.format(x);
}
/** «800 г», «1,5 кг», «1 л» для веса упаковки. */
export function weight(g) {
  return g >= 1000 ? nf1.format(Math.round(g / 100) / 10) + NBSP + 'кг' : nf0.format(g) + NBSP + 'г';
}
export function grams(g) {
  return nf0.format(Math.round(g)) + NBSP + 'г';
}
export function kcal(x) {
  return nf0.format(Math.round(x)) + NBSP + 'ккал';
}
/** Дата из «2026-10-07» → «7 октября 2026» и «07.10.2026». */
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export function dateLong(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return d && m && y ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso);
}
export function dateShort(iso) {
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}.${m}.${y}` : String(iso);
}
