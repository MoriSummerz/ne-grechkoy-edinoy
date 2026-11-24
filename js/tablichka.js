// Табличка А5: числа считаются из текущих данных для 300 ₽ в момент открытия.
import { loadData } from './data.js';
import { solve, baselineFor, comparison } from './engine.js';
import { daysParts, daysText } from './format.js';
import { SITE_URL } from './config.js';

const $ = (id) => document.getElementById(id);
$('print').addEventListener('click', () => window.print());
$('url').textContent = SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '');

try {
  const data = await loadData();
  const adult = data.norms.profiles.find((p) => p.id === 'adult');
  const r = solve({ items: data.items, profile: adult, budget: 300, mode: 'korob', groupNorms: data.norms.food_groups.groups });
  const base = baselineFor(data.baseline, data.items, adult, 300);
  const p = daysParts(r.days.min);
  $('days').textContent = (p.less ? 'меньше ' : '') + p.num;
  $('unit').textContent = p.unit;
  $('base').textContent = comparison(r, base).claim ? `Обычный набор: ${daysText(base.days.min)}` : 'Список на 300 ₽ из того, что хранится без холодильника';
  $('fine').textContent = `Только то, что хранится без холодильника. Цены «Пятёрочки» на ${data.facts.dateShort}, у части товаров — средние по России (Росстат). Независимый проект, не сервис X5 и не сервис фонда.`;
} catch {
  $('tag').hidden = true;
}
