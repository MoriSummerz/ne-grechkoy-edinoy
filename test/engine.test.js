// node --test — проверки расчёта на настоящих данных из data/ и на маленьких каталогах, посчитанных руками.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  solve, evaluate, checkRules, compareKeys, RULES, TOLERANCE, baselineFor, comparison, floorDays, pricePerDay,
  eligible, notPicked, productKind, unitCap, withHousehold, household,
} from '../js/engine.js';
import { VIEWS } from '../js/config.js';

const load = (f) => JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url)));
const catalog = load('catalog.json');
const normsData = load('norms.json');
const baseline = load('baseline.json');
const items = catalog.items;
const GN = normsData.food_groups.groups;
const profiles = withHousehold(normsData.profiles);
const adult = profiles.find((p) => p.id === 'adult');

const run = (mode, profile, budget, extra = {}) => solve({ items, profile, budget, mode, groupNorms: GN, ...extra });
const rulesOk = (r, mode, profile, budget, fixed = {}) => checkRules(r.lines, { mode, budget, profile, fixed, groupNorms: GN });
const keyOf = (r) => ({ days: r.days.min, groups: r.groups, cost: Math.round(r.cost * 100) });

// Детерминированный генератор, чтобы тесты не «мигали».
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

test('бюджет не превышен и все правила соблюдены: суммы × профили × режимы', () => {
  const cases = [
    ['korob', [50, 99, 150, 151, 222, 300, 437, 500, 777, 1500, VIEWS.korob.max]],
    ['nedelya', [300, 650, 1000, 1999, 2000, 3000, 5000, VIEWS.nedelya.max]],
    ['nabory', [60, 150, 333, 500, 1000, 2500, VIEWS.nabory.maxPerSet]],
  ];
  let n = 0;
  for (const [mode, budgets] of cases) {
    for (const profile of mode === 'korob' ? [adult] : profiles) {
      for (const budget of budgets) {
        const r = run(mode, profile, budget);
        assert.ok(r.cost <= budget + 1e-9, `${mode} ${profile.id} ${budget}: ${r.cost}`);
        assert.deepEqual(rulesOk(r, mode, profile, budget), [], `${mode} ${profile.id} ${budget}`);
        assert.ok(r.lines.every((l) => !notPicked(l.item)), 'сладкое, мука, детское и перекус не подбираются');
        if (RULES[mode].shelfOnly) assert.ok(r.lines.every((l) => l.item.shelf_stable), 'только без холодильника');
        assert.ok(r.lines.length <= 8);
        n++;
      }
    }
  }
  assert.ok(n > 50);
});

test('поиск доказывает ответ (с допуском) на всех суммах, которые предлагают кнопки, и на краях диапазонов', () => {
  const cases = [
    ...[...VIEWS.korob.presets, VIEWS.korob.min, VIEWS.korob.max].map((b) => ['korob', adult, b]),
    ...profiles.flatMap((p) => [...VIEWS.nedelya.presets, VIEWS.nedelya.min].map((b) => ['nedelya', p, b])),
    ...profiles.map((p) => ['nabory', p, VIEWS.nabory.def / VIEWS.nabory.defN]),
    ...profiles.map((p) => ['nabory', p, VIEWS.nabory.maxPerSet]),
  ];
  for (const [mode, profile, budget] of cases) {
    const t = performance.now();
    const r = run(mode, profile, budget);
    const ms = performance.now() - t;
    assert.ok(r.exact, `${mode} ${profile.id} ${budget}: поиск не уложился в предохранитель`);
    assert.ok(ms < 400, `${mode} ${profile.id} ${budget}: ${ms.toFixed(0)} мс`);
  }
});

test('на 50 ₽ и больше в коробе что-то собирается; при совсем малой сумме — пустой список, без ошибок', () => {
  assert.ok(run('korob', adult, 150).lines.length > 0);
  const tiny = run('korob', adult, 5);
  assert.equal(tiny.lines.length, 0);
  assert.equal(tiny.cost, 0);
});

test('отмеченные остаются ровно с тем же количеством, исключённые не возвращаются', () => {
  const first = run('korob', adult, 500);
  assert.ok(first.lines.length >= 2);
  const keep = first.lines[0], drop = first.lines[first.lines.length - 1];
  const fixed = { [keep.item.id]: keep.qty };
  const second = run('korob', adult, 500, { fixed, exclude: [drop.item.id] });
  const kept = second.lines.find((l) => l.item.id === keep.item.id);
  assert.ok(kept, 'отмеченный товар на месте');
  assert.equal(kept.qty, keep.qty, 'количество отмеченного не меняется');
  assert.ok(!second.lines.some((l) => l.item.id === drop.item.id), 'исключённый не вернулся');
  assert.ok(second.cost <= 500);
  assert.deepEqual(rulesOk(second, 'korob', adult, 500, fixed), []);

  // Отмеченные одной штукой не «дорастают», даже если вторая штука выгодна.
  const one = { [keep.item.id]: 1 };
  assert.equal(run('korob', adult, 1000, { fixed: one }).lines.find((l) => l.item.id === keep.item.id).qty, 1);

  // Исключение сильнее отметки; несуществующий id и мусорное количество тихо отбрасываются.
  const third = run('korob', adult, 500, { fixed: { [keep.item.id]: keep.qty, 'нет-такого': 2, [drop.item.id]: 'abc' }, exclude: [keep.item.id] });
  assert.ok(!third.lines.some((l) => l.item.id === keep.item.id));
});

test('семья закрывает неделю, когда хватает денег, и каждого товара в списке кратно числу едоков', () => {
  const family = profiles.find((p) => p.id === 'family');
  assert.equal(household(family), 3, 'по калориям семья из norms.json — три взрослых');
  const r = run('nedelya', family, 5000);
  assert.ok(r.days.min >= 7 - 1e-9, String(r.days.min));
  assert.ok(r.lines.every((l) => l.qty % 3 === 0));
  assert.deepEqual(rulesOk(r, 'nedelya', family, 5000), []);
});

test('отмеченное дороже бюджета не ломает расчёт', () => {
  const pricey = items.filter((i) => eligible(i, RULES.korob)).sort((a, b) => b.price_rub - a.price_rub)[0];
  const r = run('korob', adult, 100, { fixed: { [pricey.id]: 3 } });
  assert.ok(r.cost <= 100);
});

test('метрика на маленьком каталоге, посчитанном вручную', () => {
  const tiny = [
    // 1000 г, 10 г белка и 350 ккал на 100 г, растительный
    { id: 'a', name: 'Крупа А', group: 'grains', price_rub: 50, weight_g: 1000, per100: { kcal: 350, protein_g: 10, fat_g: 1 }, shelf_stable: true, animal_protein: false },
    // 250 г, 20 г белка и 200 ккал на 100 г, животный
    { id: 'b', name: 'Консервы Б', group: 'meat_fish', price_rub: 100, weight_g: 250, per100: { kcal: 200, protein_g: 20, fat_g: 10 }, shelf_stable: true, animal_protein: true },
  ];
  const profile = { kcal: 2000, protein_g: 80, animal_protein_g: 40, fat_g: 70 };
  const ev = evaluate([{ item: tiny[0], qty: 2 }, { item: tiny[1], qty: 1 }], profile);
  // калории: 2·3500 + 500 = 7500 → 3,75 дня; белок: 2·100 + 50 = 250 → 3,125; животный: 50 → 1,25
  assert.equal(ev.cost, 200);
  assert.ok(Math.abs(ev.days.kcal - 3.75) < 1e-12);
  assert.ok(Math.abs(ev.days.prot - 3.125) < 1e-12);
  assert.ok(Math.abs(ev.days.anim - 1.25) < 1e-12);
  assert.ok(Math.abs(ev.days.min - 1.25) < 1e-12);
  assert.equal(pricePerDay(ev.cost, ev.days.min), 160);
  assert.equal(pricePerDay(10, 0.05), null);

  // На 200 ₽ по правилам короба: вторая банка нарушила бы «не больше половины суммы на группу» (200 из 250),
  // а вторая крупа не добавляет дней — узкое место животный белок, при равенстве берём дешевле.
  const r = solve({ items: tiny, profile, budget: 200, mode: 'korob', tolerance: 0 });
  assert.deepEqual(r.lines.map((l) => [l.item.id, l.qty]), [['a', 1], ['b', 1]]);
  assert.ok(Math.abs(r.days.min - 1.25) < 1e-12);
});

test('вид товара: первое слово названия без бренда, для общих слов — два, синонимы сведены', () => {
  const kind = (name, brand) => productKind({ name, brand });
  assert.equal(kind('Мука Makfa пшеничная 2кг', 'Makfa'), 'мука');
  assert.equal(kind('Консервы рыбные в томатном соусе'), 'консервы рыбные');
  assert.equal(kind('Консервы мясные (тушёнка)'), 'консервы мясные');
  assert.equal(kind('Крупа Увелка гречневая 500г', 'Увелка'), 'гречка');
  assert.equal(kind('Крупа Селяночка перловая №2 900г', 'Селяночка'), 'крупа перловая');
  assert.equal(kind('Спагетти Шебекинские №2 тонкие 450г', 'Шебекинские'), 'макароны');
  assert.equal(kind('Ядра арахиса Красная цена жареные солёные 80г', 'Красная цена'), 'арахис');
});

test('не подбираем по виду товара: сладкое, муку, детское, перекус', () => {
  const why = (name, group = 'grains', brand = '') => notPicked({ name, group, brand });
  assert.equal(why('Печенье овсяное 400г', 'sugar_sweets'), 'sweet');
  assert.equal(why('Сгущенное молоко цельное с сахаром 8.5% 360г', 'dairy'), 'sweet');
  assert.equal(why('Мука пшеничная 1кг'), 'flour');
  assert.equal(why('Сок яблочный 200мл', 'veg_fruit', 'ФрутоНяня'), 'baby');
  assert.equal(why('Творог Лесные ягоды с 6 мес. 90г', 'dairy'), 'baby');
  assert.equal(why('Вермишель быстрого приготовления с куриным бульоном 60г'), 'snack');
  assert.equal(why('Крекер в форме рыбок, 200г'), 'snack');
  assert.equal(why('Семена подсолнечные жареные 100г', 'other'), 'snack');
  assert.equal(why('Хлопья овсяные №3 быстрого приготовления 350г'), null, 'овсянка быстрого приготовления — обычная крупа');
  assert.equal(why('Гречка ядрица 900г'), null);
  // В каталоге правила что-то отсекают, но не больше трети.
  const cut = items.filter((i) => notPicked(i)).length;
  assert.ok(cut > 0 && cut < items.length / 3, String(cut));
});

// Семью в неделе solve считает на долю одного едока и умножает штуки на household: перебор — среди таких же списков.
const step = (mode, profile) => (mode === 'nedelya' ? household(profile) : 1);

test('подбор совпадает с полным перебором на урезанных каталогах (точно, без допуска)', () => {
  const rand = rng(20261124);
  const pool = items.filter((i) => !notPicked(i));
  let checked = 0;
  for (let t = 0; t < 150; t++) {
    const mode = ['korob', 'nedelya', 'nabory'][t % 3];
    const profile = profiles[Math.floor(rand() * profiles.length)];
    const picked = [];
    const ids = new Set();
    // 7 товаров; в «неделе» у семьи потолки штук больше, поэтому каталог меньше, чтобы перебор оставался быстрым.
    let combos = 1;
    while (picked.length < 7 && combos < 2e4) {
      const it = pool[Math.floor(rand() * pool.length)];
      if (ids.has(it.id) || (RULES[mode].shelfOnly && !it.shelf_stable)) continue;
      ids.add(it.id); picked.push(it);
      combos *= Math.floor(unitCap(it, RULES[mode], profile) / step(mode, profile)) + 1;
    }
    const budget = Math.round(100 + rand() * (mode === 'nedelya' ? 2500 : 900));
    const ours = solve({ items: picked, profile, budget, mode, groupNorms: GN, tolerance: 0 });

    // Полный перебор: каждый товар от 0 до потолка штук, проверка правил — отдельной реализацией checkRules.
    let best = null;
    const q = new Array(picked.length).fill(0);
    const target = RULES[mode].targetDays;
    (function rec(i) {
      if (i === picked.length) {
        const lines = picked.map((item, j) => ({ item, qty: q[j] })).filter((l) => l.qty > 0);
        if (checkRules(lines, { mode, budget, profile, groupNorms: GN }).length) return;
        const key = keyOf(evaluate(lines, profile));
        if (!best || compareKeys(key, best, target) > 0) best = key;
        return;
      }
      for (let v = 0; v <= unitCap(picked[i], RULES[mode], profile); v += step(mode, profile)) { q[i] = v; rec(i + 1); }
    })(0);

    assert.ok(ours.exact);
    assert.deepEqual(checkRules(ours.lines, { mode, budget, profile, groupNorms: GN }), []);
    assert.equal(compareKeys(keyOf(ours), best, target), 0, `${mode} ${profile.id} ${budget} ₽: ${JSON.stringify(keyOf(ours))} вместо ${JSON.stringify(best)}`);
    checked++;
  }
  assert.equal(checked, 150);
});

test('с допуском ответ хуже оптимума не больше чем на допуск', () => {
  const rand = rng(7);
  const pool = items.filter((i) => !notPicked(i));
  for (let t = 0; t < 24; t++) {
    const mode = ['korob', 'nedelya'][t % 2];
    const profile = mode === 'korob' ? adult : profiles[t % 3];
    const sub = pool.filter(() => rand() < 0.5);
    const budget = Math.round(200 + rand() * 2000);
    const exactR = solve({ items: sub, profile, budget, mode, groupNorms: GN, tolerance: 0 });
    const fast = solve({ items: sub, profile, budget, mode, groupNorms: GN });
    const T = RULES[mode].targetDays;
    const a = Math.min(fast.days.min, T), b = Math.min(exactR.days.min, T);
    assert.ok(a >= b / (1 + TOLERANCE) - 1e-9, `${mode} ${budget}: ${a} против ${b}`);
    if (b >= T - 1e-9) assert.ok(a >= T - 1e-9 && fast.cost <= exactR.cost * (1 + TOLERANCE) + 0.01, `${mode} ${budget}: ${fast.cost} против ${exactR.cost}`);
  }
});

test('сравнение с обычным набором: либо наш список не хуже, либо утверждения нет', () => {
  for (const b of baseline.baskets) {
    const ours = run('korob', adult, b.budget_rub);
    const base = baselineFor(baseline, items, adult, b.budget_rub);
    assert.equal(base.scaled, false);
    const cmp = comparison(ours, base);
    if (cmp.claim) assert.ok(floorDays(ours.days.min) > floorDays(base.days.min));
    else assert.ok(floorDays(ours.days.min) <= floorDays(base.days.min));
  }
  // Ветка «нет утверждения» срабатывает, когда наш список не лучше.
  const fake = { days: { min: 1.25 } };
  assert.equal(comparison(fake, { days: { min: 1.29 } }).claim, false, 'одинаково после округления — не утверждаем');
  assert.equal(comparison(fake, { days: { min: 3 } }).claim, false);
  assert.equal(comparison(fake, null).claim, false);
  assert.equal(comparison(fake, { days: { min: 1.1 } }).claim, true);
});

test('обычный набор для другой суммы — ближайший и в пересчёте', () => {
  const b = baselineFor(baseline, items, adult, 1000);
  const nearest = baseline.baskets.reduce((x, y) => (Math.abs(y.budget_rub - 1000) < Math.abs(x.budget_rub - 1000) ? y : x));
  assert.equal(b.basket.budget_rub, nearest.budget_rub);
  assert.equal(b.scaled, true);
  const raw = baselineFor(baseline, items, adult, nearest.budget_rub);
  assert.ok(Math.abs(b.days.min - raw.days.min * (1000 / nearest.budget_rub)) < 1e-9);
});

test('округление дней — только вниз', () => {
  assert.equal(floorDays(3.8), 3.8);
  assert.equal(floorDays(3.79999), 3.7);
  assert.equal(floorDays(0.09), 0);
  assert.equal(floorDays(10.99), 10);
  assert.equal(floorDays(0), 0);
  assert.equal(floorDays(-1), 0);
});
