// Расчёт корзины. Чистые функции без DOM: этот же модуль импортируют страница и тесты (node --test).
//
// Метрика «дни нормы» = min(калории_дни, белок_дни, животный_белок_дни).
// Правила подбора (все режимы): целые штуки; не дороже бюджета; не больше 8 разных товаров; один товар
// каждого вида; на группу — не больше половины потраченной суммы (одна штука в группе разрешена всегда,
// иначе на малые суммы ничего не собрать); чего не подбираем — в notPicked().
// Короб и наборы: только то, что хранится без холодильника, до 3 штук одного товара.
// Неделя: до 3 штук и не больше 1 кг одного товара на взрослого едока; жиров — не больше нормы МР на 7 дней, масла —
// не больше нормы приказа № 614 на 7 дней.
// Метод: ветви и границы с допуском 1 % (подробно — у solve).

export const GROUP_NAMES = {
  grains: 'Крупы и макароны',
  legumes: 'Бобовые',
  meat_fish: 'Мясо и рыба',
  dairy: 'Молочное',
  veg_fruit: 'Овощи и фрукты',
  oils: 'Масло',
  sugar_sweets: 'Сахар и сладости',
  other: 'Другое',
};
// Порядок строк в списке покупок (спецификация, раздел 6).
export const LIST_ORDER = ['grains', 'legumes', 'meat_fish', 'dairy', 'oils', 'veg_fruit', 'other', 'sugar_sweets'];
// Порядок групп в таблицах (спецификация, раздел 4.3).
export const TABLE_ORDER = ['grains', 'legumes', 'meat_fish', 'dairy', 'veg_fruit', 'oils', 'sugar_sweets', 'other'];

export const RULES = {
  // Короб «Корзины доброты»: до 3 штук одного товара (спецификация).
  korob: { shelfOnly: true, maxUnits: 3, maxItems: 8, groupShare: 0.5, targetDays: Infinity },
  // Один продуктовый набор фонда: те же правила, что у короба.
  nabory: { shelfOnly: true, maxUnits: 3, maxItems: 8, groupShare: 0.5, targetDays: Infinity },
  // Неделя по сертификату: свежее можно, цель — 7 дней, дальше минимум денег. Против «задачи Стиглера»
  // (самое дешёвое — мешок крупы и бутылки масла): не больше 3 штук и 1 кг одного товара на взрослого едока (одна упаковка
  // разрешена всегда), жиров — не больше нормы МР на 7 дней, масла — не больше нормы приказа № 614 на 7 дней
  // (одна бутылка разрешена всегда, если проходит по жирам).
  nedelya: { shelfOnly: false, maxUnits: 3, maxItems: 8, groupShare: 0.5, targetDays: 7, gramsPerPerson: 1000, normGroups: ['oils'], fatCap: true },
};

const EPS = 1e-9;
const kop = (rub) => Math.round(rub * 100);
const low = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е');

export const isAnimal = (item) => item.animal_protein === true;

/** Питательность одной упаковки. */
export function packNutrients(item) {
  const w = item.weight_g / 100;
  const prot = w * item.per100.protein_g;
  return { kcal: w * item.per100.kcal, prot, anim: isAnimal(item) ? prot : 0 };
}

export function norms(profile) {
  return { kcal: profile.kcal, prot: profile.protein_g, anim: profile.animal_protein_g };
}

/** Оценка любой корзины: lines = [{item, qty}]. Используется для нашего списка, обычного набора и проверки готового. */
export function evaluate(lines, profile) {
  const n = norms(profile);
  let cost = 0, kcal = 0, prot = 0, anim = 0;
  const groups = new Set();
  for (const { item, qty } of lines) {
    if (!qty) continue;
    const p = packNutrients(item);
    cost += kop(item.price_rub) * qty;
    kcal += p.kcal * qty; prot += p.prot * qty; anim += p.anim * qty;
    groups.add(item.group);
  }
  const days = { kcal: kcal / n.kcal, prot: prot / n.prot, anim: anim / n.anim };
  return {
    cost: cost / 100,
    totals: { kcal, prot, anim },
    days: { ...days, min: Math.min(days.kcal, days.prot, days.anim) },
    groups: groups.size,
    groupSet: groups,
  };
}

// ---- Вид товара и то, чего не подбираем ----

// Первые слова, которые сами по себе вид не определяют: «консервы рыбные» и «консервы мясные» — разные виды.
const GENERIC_FIRST_WORDS = new Set(['консервы', 'крупа', 'хлопья', 'капуста', 'ядра', 'смесь', 'изделия', 'макаронные']);
// Разные слова для одного и того же: в списке не будет «спагетти» рядом с «макаронами».
const SAME_KIND = {
  'спагетти': 'макароны', 'вермишель': 'макароны', 'изделия макаронные': 'макароны', 'макаронные изделия': 'макароны',
  'крупа гречневая': 'гречка', 'ядра арахиса': 'арахис', 'семена': 'семечки', 'ядра подсолнечника': 'семечки',
  'томатная': 'паста',
};
// Линейки детского питания: кому достанется короб или набор, неизвестно.
const BABY_BRANDS = new Set(['фрутоняня', 'агуша', 'тема', 'спеленок', 'бабушкино лукошко', 'gerber', 'hipp']);
// Перекус, а не продукты: такого в продуктовой помощи не ждут.
const SNACK_KINDS = new Set(['крекер', 'чипсы', 'сухарики', 'семечки']);

/** Вид товара: первое слово названия без бренда (для общих слов — два), с учётом синонимов. */
const kindCache = new WeakMap();
export function productKind(item) {
  if (!kindCache.has(item)) kindCache.set(item, kindOf(item));
  return kindCache.get(item);
}
function kindOf(item) {
  let name = low(item.name);
  const brand = low(item.brand);
  if (brand && !brand.startsWith('—')) name = name.split(brand).join(' ');
  const w = name.split(/[\s,()]+/).filter(Boolean);
  const kind = GENERIC_FIRST_WORDS.has(w[0]) && w[1] ? w[0] + ' ' + w[1] : w[0] || '';
  return SAME_KIND[kind] || kind;
}

/**
 * Почему товар не подбираем ни в одном режиме, или null. Правила — по виду товара, а не по id: они переживут
 * замену каталога. Тексты причин — на странице «Как это считается».
 */
export function notPicked(item) {
  const name = low(item.name), kind = productKind(item);
  if (item.group === 'sugar_sweets' || (kind === 'сгущенное' && name.includes('с сахаром'))) return 'sweet';
  if (kind === 'мука') return 'flour';
  if (/(^|\s)с\s*\d+\s*мес|детск/.test(name) || BABY_BRANDS.has(low(item.brand))) return 'baby';
  if ((kind === 'макароны' && name.includes('быстрого приготовления')) || SNACK_KINDS.has(kind)) return 'snack';
  return null;
}

/** Что из каталога вообще может попасть в подбор этого режима. */
export function eligible(item, rules) {
  if (notPicked(item)) return false;
  if (rules.shelfOnly && !item.shelf_stable) return false;
  if (!(item.price_rub > 0)) return false;
  const p = packNutrients(item);
  return p.kcal > 0 || p.prot > 0;
}

/**
 * Потолок штук одного товара. В «неделе» — на каждого взрослого едока (household): до maxUnits штук
 * и до gramsPerPerson г, одна упаковка — всегда. В коробе и наборах — maxUnits.
 */
export function unitCap(item, rules, profile) {
  if (!rules.gramsPerPerson) return rules.maxUnits;
  const byWeight = Math.floor(rules.gramsPerPerson / item.weight_g + EPS);
  return household(profile) * Math.max(1, Math.min(rules.maxUnits, byWeight));
}

/** Сколько взрослых едоков в профиле: его калории ÷ калории взрослого из norms.json, округлённо (семья — 3). */
export function household(profile) {
  return profile.household || 1;
}
export function withHousehold(profiles) {
  const adult = profiles.find((p) => p.id === 'adult');
  return profiles.map((p) => ({ ...p, household: Math.max(1, Math.round(p.kcal / adult.kcal)) }));
}

/** Норма группы по приказу № 614 на days дней на всех едоков, г; Infinity, если нормы нет. */
export function groupNorm(groupNorms, group, profile, days) {
  const gn = groupNorms && groupNorms[group];
  // Молочное: в приказе итог «в пересчёте на молоко», с весом продуктов сравниваем натуральный вес подстрок.
  const perDay = gn && (gn.g_per_day_natural_weight ?? gn.g_per_day);
  return perDay > 0 ? perDay * days * persons(profile) : Infinity;
}
/** Потолок веса группы в подборе: норма на срок режима для групп из rules.normGroups, остальные без потолка. */
export function groupGramCap(groupNorms, group, profile, rules) {
  return rules.normGroups?.includes(group) ? groupNorm(groupNorms, group, profile, rules.targetDays) : Infinity;
}
/** Потолок жиров за срок «недели»: норма жиров профиля × 7 (в остальных режимах потолка нет). */
export function fatLimit(profile, rules) {
  return rules.fatCap && profile.fat_g > 0 ? profile.fat_g * rules.targetDays : Infinity;
}
export function persons(profile) {
  return profile.persons ?? (Array.isArray(profile.members) ? profile.members.length : 1);
}

/**
 * Сравнение ключей корзин: > 0 — a лучше. Стоимость — в копейках.
 * Короб и наборы: больше дней нормы → больше групп → дешевле.
 * Неделя: больше дней, но не выше 7 → если обе закрывают 7, дешевле → больше групп → дешевле.
 */
export function compareKeys(a, b, targetDays) {
  return cmpNum(a.days, a.groups, a.cost, b.days, b.groups, b.cost, targetDays);
}
function cmpNum(daysA, groupsA, costA, daysB, groupsB, costB, targetDays) {
  const da = Math.min(daysA, targetDays), db = Math.min(daysB, targetDays);
  if (Math.abs(da - db) > EPS) return da - db;
  if (targetDays !== Infinity && da >= targetDays - EPS && Math.abs(costA - costB) > 0.5) return costB - costA;
  if (groupsA !== groupsB) return groupsA - groupsB;
  return Math.abs(costA - costB) > 0.5 ? costB - costA : 0;
}

// Допуск: ветку, которая может обогнать найденный список меньше чем на 0,5 % (по дням, а в «неделе» после
// семи дней — по цене), не досматриваем. Тесты вызывают solve с допуском 0 и сверяют с полным перебором.
export const TOLERANCE = 0.005;
// Предохранитель от зависания на слабом телефоне: дальше этого числа шагов отдаём лучшее найденное
// и помечаем exact: false. На суммах, которые принимает страница, поиск укладывается (см. тесты).
const NODE_LIMIT = 1000000;
// Разгон: сначала перебор только среди самых выгодных товаров — он быстро даёт список, от которого отсекать.
const WARM_WIDTH = 24, WARM_NODES = 100000;
// С какой суммы на едока начинать поиск недели (см. solve).
const WEEK_START = 600;

/**
 * Главная функция: подобрать корзину.
 *
 * Метод — ветви и границы. Перебираем корзины в глубину: к текущей добавляем следующий товар из
 * упорядоченного списка в количестве от потолка до одной штуки; каждая корзина по пути — кандидат в ответ.
 * Ветку отбрасываем, если оценка сверху для любого её продолжения не обгоняет лучший найденный список.
 * Минимум трёх величин не больше их взвешенной суммы с любыми весами w (сумма весов — 1), поэтому
 * достаточно оценить сверху «пользу» w·(калории, белок, животный белок) в днях. Оценок две:
 *   — дробный рюкзак: товары по убыванию пользы на рубль, пока хватает денег, с потолками штук, половиной
 *     бюджета на группу, потолком масла и пределом в 8 товаров;
 *   — целочисленный рюкзак: заранее посчитанная динамика по бюджету для каждого «хвоста» порядка перебора —
 *     она знает, что упаковки не делятся.
 * Весов четыре: лучшие для всего каталога (ищем по сетке) и три «чистых». В «неделе», когда семь дней
 * закрыты, потолком трат становится цена найденного списка, а ветку отбрасываем, если по динамике
 * «сколько копеек нужно, чтобы добрать недостающее» она выйдет дороже.
 * Результат: лучший по compareKeys список среди разрешённых правилами — с точностью до допуска tolerance,
 * если поиск уложился в предохранитель (exact: true).
 *
 * @param {object} o
 * @param {Array} o.items  позиции catalog.json
 * @param {object} o.profile профиль из norms.json
 * @param {number} o.budget бюджет в рублях
 * @param {'korob'|'nedelya'|'nabory'} [o.mode]
 * @param {string[]} [o.exclude] id, которые нельзя брать («Нет на полке», «Исключить»)
 * @param {Object<string, number>} [o.fixed] id → количество, которое должно остаться ровно таким (отмеченные)
 * @param {object} [o.groupNorms] norms.food_groups.groups — для потолка масла в «неделе»
 * @param {number} [o.maxItems] предел позиций вместо 8 — для «добавки» к готовому набору
 * @param {number} [o.tolerance] допуск, по умолчанию TOLERANCE
 */
export function solve(o) {
  const T = RULES[o.mode || 'korob'].targetDays;
  if (!Number.isFinite(T)) return search(o);
  const f = household(o.profile);
  const fixed = Object.entries(o.fixed || {});
  if (f > 1 && fixed.every(([, q]) => q % f === 0)) {
    // Семья. Считаем список на долю одного взрослого едока (нормы ÷ f, сумма ÷ f) и умножаем штуки на f:
    // для доли перебор такой же быстрый и точный, как для одного человека, а все правила недели
    // (штуки и вес на едока, жиры, масло, доли групп) при умножении сохраняются. Ответ — лучший среди
    // списков, где каждого товара кратно f; для семьи целиком он может быть чуть хуже наилучшего.
    const part = { ...o.profile, household: 1, persons: persons(o.profile) / f };
    for (const k of ['kcal', 'protein_g', 'animal_protein_g', 'fat_g']) part[k] = o.profile[k] / f;
    const r = week({ ...o, profile: part, budget: Math.floor(kop(o.budget) / f) / 100, fixed: Object.fromEntries(fixed.map(([id, q]) => [id, q / f])) }, T);
    const lines = r.lines.map((l) => ({ ...l, qty: l.qty * f }));
    const ev = evaluate(lines, o.profile);
    return { ...r, lines, ...ev, budget: o.budget, left: (kop(o.budget) - kop(ev.cost)) / 100 };
  }
  return week(o, T);
}

// «Неделя». Самый дешёвый список на семь дней не зависит от суммы, если её хватает: найденный на сумму b,
// он лучший и для любой большей. Поэтому идём от небольшой суммы вверх: там перебор короче и доказывает
// ответ. Не закрыли — берём в полтора раза больше, пока не дойдём до бюджета.
function week(o, T) {
  if (search({ ...o, probe: true }).rootUpper < T) return search(o);
  for (let b = WEEK_START; b < o.budget; b *= 1.5) {
    const r = search({ ...o, budget: b });
    if (r.days.min >= T - EPS) return { ...r, budget: o.budget, left: (kop(o.budget) - kop(r.cost)) / 100 };
  }
  return search(o);
}

function search({ items, profile, budget, mode = 'korob', exclude = [], fixed = {}, groupNorms = null, maxItems = null, tolerance = TOLERANCE, probe = false }) {
  const rules = maxItems ? { ...RULES[mode], maxItems } : RULES[mode];
  const T = rules.targetDays, M = rules.maxItems;
  const nrm = norms(profile);
  const budgetK = kop(budget);
  const ex = new Set(exclude);
  const byId = new Map(items.map((it) => [it.id, it]));

  // Отмеченные товары: только существующие, не исключённые, с разумным количеством, в пределах бюджета.
  const fix = new Map();
  let fixCost = 0;
  for (const [id, qRaw] of Object.entries(fixed)) {
    const it = byId.get(id), q = Math.floor(Number(qRaw));
    if (!it || ex.has(id) || !(q >= 1) || q > 99) continue;
    fix.set(id, q); fixCost += kop(it.price_rub) * q;
  }
  if (fixCost > budgetK || fix.size > M) { fix.clear(); fixCost = 0; }

  const pool = items
    .filter((it) => fix.has(it.id) || (!ex.has(it.id) && eligible(it, rules)))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const groupIndex = new Map(), kindIndex = new Map();
  const c = pool.map((it) => {
    if (!groupIndex.has(it.group)) groupIndex.set(it.group, groupIndex.size);
    const kd = it.group + ':' + productKind(it);
    if (!kindIndex.has(kd)) kindIndex.set(kd, kindIndex.size);
    const p = packNutrients(it), lo = fix.get(it.id) || 0;
    return {
      item: it, price: kop(it.price_rub), grams: it.weight_g, fat: (it.weight_g * (it.per100.fat_g || 0)) / 100,
      nut: [p.kcal / nrm.kcal, p.prot / nrm.prot, p.anim / nrm.anim], // вклад одной штуки в дни по трём величинам
      g: groupIndex.get(it.group), k: kindIndex.get(kd), lo, hi: lo || unitCap(it, rules, profile),
    };
  });
  const n = c.length, G = groupIndex.size, K = kindIndex.size;

  // Одного вида — одна позиция; больше, только если человек сам отметил несколько.
  const kindAllowed = new Int32Array(K).fill(1);
  const fixKind = new Int32Array(K);
  for (const x of c) if (x.lo) fixKind[x.k]++;
  fixKind.forEach((v, k) => { if (v > 1) kindAllowed[k] = v; });
  // Отмеченное пользователем не пересматриваем: его доля и вес в группе разрешены всегда.
  const fixSpend = new Float64Array(G), fixGrams = new Float64Array(G), gramCap = new Float64Array(G);
  const maxUnit = new Float64Array(G), maxUnitGrams = new Float64Array(G);
  for (const x of c) {
    fixSpend[x.g] += x.price * x.lo; fixGrams[x.g] += x.grams * x.lo;
    maxUnit[x.g] = Math.max(maxUnit[x.g], x.price); maxUnitGrams[x.g] = Math.max(maxUnitGrams[x.g], x.grams);
  }
  for (const [g, gi] of groupIndex) gramCap[gi] = groupGramCap(groupNorms, g, profile, rules);
  // Больше, чем 8 видов по потолку штук, не потратить при любом бюджете: лишние деньги перебору не нужны.
  const kindMax = new Float64Array(K);
  for (const x of c) if (!x.lo && fixKind[x.k] < kindAllowed[x.k]) kindMax[x.k] = Math.max(kindMax[x.k], x.hi * x.price);
  kindMax.sort();
  let maxSpend = fixCost;
  for (let t = K - 1; t >= Math.max(0, K - (M - fix.size)); t--) maxSpend += kindMax[t];
  const B = Math.min(budgetK, maxSpend);
  // Сколько денег и граммов группа может забрать в любой допустимой корзине: по правилу, одну штуку или отмеченное.
  const spendCap = new Float64Array(G);
  const setSpendCap = (total) => spendCap.forEach((_, g) => { spendCap[g] = Math.max(rules.groupShare * total + 0.5, household(profile) * maxUnit[g], fixSpend[g] + 0.5); });
  setSpendCap(B);
  const gramLimit = Float64Array.from(gramCap, (cap, g) => Math.max(cap, household(profile) * maxUnitGrams[g], fixGrams[g]));

  // ---- Текущая корзина ----
  // Потолок трат: бюджет, а в «неделе», когда семь дней закрыты, — цена лучшего найденного списка.
  let cap = B;
  const q = new Int32Array(n), kCount = new Int32Array(K);
  const gSpend = new Float64Array(G), gUnits = new Int32Array(G), gGrams = new Float64Array(G);
  const sum = [0, 0, 0];
  let cost = 0, distinct = 0, groups = 0, fat = 0;
  const fatCap = Math.max(fatLimit(profile, rules), c.reduce((a, x) => a + x.fat * x.lo, 0));
  const add = (i, d) => {
    const x = c[i], before = q[i];
    q[i] += d; cost += x.price * d; fat += x.fat * d;
    for (let t = 0; t < 3; t++) sum[t] += x.nut[t] * d;
    const gu = gUnits[x.g];
    gSpend[x.g] += x.price * d; gUnits[x.g] += d; gGrams[x.g] += x.grams * d;
    if (gu === 0 && gUnits[x.g] > 0) groups++; else if (gu > 0 && gUnits[x.g] === 0) groups--;
    if (before === 0 && q[i] > 0) { distinct++; kCount[x.k]++; }
    if (before > 0 && q[i] === 0) { distinct--; kCount[x.k]--; }
  };
  // Одна упаковка в группе на едока разрешена всегда (у взрослого — одна, у семьи — household).
  const H = household(profile);
  const overShare = (g, total) => gSpend[g] > rules.groupShare * total + 0.5 && gSpend[g] > fixSpend[g] + 0.5;
  const overGrams = (g) => gGrams[g] > gramCap[g] + EPS && gGrams[g] > fixGrams[g] + EPS;
  // Доля и вес группы зависят от всей корзины, поэтому проверяем их у готового кандидата.
  const feasible = () => {
    for (let g = 0; g < G; g++) if (gUnits[g] > H && (overShare(g, cost) || overGrams(g))) return false;
    return true;
  };
  // Нарушение, которое уже не исправить добавлением товаров: сумма не выше потолка трат, вес и жиры только растут.
  const hopeless = (g) => fat > fatCap + EPS || (gUnits[g] > H && (overShare(g, cap) || overGrams(g)));
  c.forEach((x, i) => { if (x.lo) add(i, x.lo); });

  // ---- Порядок перебора и оценки ----
  let ord = [];
  c.forEach((x, i) => { if (!x.lo && x.price <= B - cost) ord.push(i); });
  const rank = new Int32Array(n).fill(-1);
  const setOrder = (list) => { ord = list; ord.forEach((i, p) => { rank[i] = p; }); };
  setOrder(ord);
  const usable = (i, pos) => rank[i] >= pos && kCount[c[i].k] < kindAllowed[c[i].k];
  const value = (w, i) => w[0] * c[i].nut[0] + w[1] * c[i].nut[1] + w[2] * c[i].nut[2];
  const sortBy = (list, key) => list.slice().sort((i, j) => key(j) - key(i) || i - j);
  const weightCapped = gramLimit.some(Number.isFinite);
  // Для весов w храним два порядка товаров: по пользе на рубль и (если есть потолок веса) — на грамм.
  const prepare = (w) => ({
    w,
    rub: sortBy(ord, (i) => value(w, i) / c[i].price),
    gram: weightCapped ? sortBy(ord, (i) => value(w, i) / c[i].grams) : null,
  });
  const room = new Float64Array(G), vRoom = new Float64Array(G), vRoom0 = new Float64Array(G), kindBest = new Float64Array(K), top = new Float64Array(M);

  // Сколько пользы каждая группа ещё может дать, не выходя за свой потолок веса (без потолка — сколько угодно).
  const valueRoom = (P, pos) => {
    vRoom.fill(Infinity);
    if (!P.gram) return;
    for (let g = 0; g < G; g++) if (Number.isFinite(gramLimit[g])) { vRoom[g] = 0; room[g] = gramLimit[g] - gGrams[g]; }
    for (const i of P.gram) {
      const x = c[i];
      if (vRoom[x.g] === Infinity || !usable(i, pos)) continue;
      const gr = Math.min(x.hi * x.grams, room[x.g]);
      if (gr > 0) { vRoom[x.g] += (gr * value(P.w, i)) / x.grams; room[x.g] -= gr; }
    }
  };

  // Дробная оценка сверху для весов P.w: товары ord[pos..] по убыванию пользы на рубль.
  const fractional = (P, pos) => {
    valueRoom(P, pos);
    vRoom0.set(vRoom);
    for (let g = 0; g < G; g++) room[g] = spendCap[g] - gSpend[g];
    let R = cap - cost, v = 0, used = 0;
    for (const i of P.rub) {
      const x = c[i], d = value(P.w, i) / x.price;
      if (R <= 0 || d <= 0) break;
      if (!usable(i, pos)) continue;
      const s = Math.min(x.hi * x.price, R, room[x.g], vRoom[x.g] / d);
      if (!(s > 0)) continue;
      v += s * d; R -= s; room[x.g] -= s; vRoom[x.g] -= s * d; used++;
    }
    const m = M - distinct;
    if (used > m) {
      // Предел в 8 товаров: не больше m добавок разных видов, каждая — сколько позволяют потолок и деньги.
      kindBest.fill(0);
      for (const i of P.rub) {
        const x = c[i];
        if (!usable(i, pos)) continue;
        const units = Math.min(x.hi, Math.floor(Math.min(cap - cost, spendCap[x.g] - gSpend[x.g]) / x.price));
        kindBest[x.k] = Math.max(kindBest[x.k], Math.min(units * value(P.w, i), vRoom0[x.g]));
      }
      top.fill(0);
      for (const u of kindBest) {
        if (u <= top[m - 1]) continue;
        let t = m - 1;
        while (t > 0 && top[t - 1] < u) { top[t] = top[t - 1]; t--; }
        top[t] = u;
      }
      let sumTop = 0;
      for (let t = 0; t < m; t++) sumTop += top[t];
      v = Math.min(v, sumTop);
    }
    return P.w[0] * sum[0] + P.w[1] * sum[1] + P.w[2] * sum[2] + v;
  };

  // Веса с наименьшей дробной оценкой для всего каталога ищем по сетке на симплексе (двойственная задача ЛП).
  // Перебор идёт по убыванию пользы на рубль при этих весах: хорошие списки находятся первыми.
  let rootUpper = Infinity, preps = [];
  const orient = () => {
    let wBest = [1 / 3, 1 / 3, 1 / 3];
    rootUpper = Infinity;
    for (let a = 0; a <= 20; a++) for (let b = 0; a + b <= 20; b++) {
      const w = [a / 20, b / 20, (20 - a - b) / 20];
      const ub = fractional(prepare(w), 0);
      if (ub < rootUpper) { rootUpper = ub; wBest = w; }
    }
    setOrder(sortBy(ord, (i) => value(wBest, i) / c[i].price));
    preps = [wBest, [1, 0, 0], [0, 1, 0], [0, 0, 1]].map(prepare);
    buildTables();
  };

  // Целочисленные оценки: динамика для каждого «хвоста» ord[pos..], считается до перебора.
  //   knap[t][pos][u] — сколько пользы preps[t].w дадут целые штуки на u шагов денег (цены округлены вниз);
  //   most[t][pos][m] — сколько пользы дадут m товаров, если денег сколько угодно (предел в 8 товаров);
  //   need[t][pos][j] — сколько копеек минимум нужно, чтобы добрать j шагов величины t (вклад округлён вверх);
  //   need2[pos][a][k] — то же для животного белка и калорий вместе: они обычно и упираются друг в друга.
  // Округления только в выгодную для ветки сторону, поэтому оценки остаются честными.
  let unit, U, knap, most, need, need2;
  const S1 = 200, S2 = 48;
  const buildTables = () => {
    const L = ord.length;
    setSpendCap(cap);
    unit = Math.max(100, Math.ceil((cap - cost) / 400)); U = Math.floor((cap - cost) / unit);
    knap = preps.map((P) => {
      const tb = new Float64Array((L + 1) * (U + 1));
      for (let p = L - 1; p >= 0; p--) {
        const x = c[ord[p]], pu = Math.floor(x.price / unit), v = value(P.w, ord[p]), row = p * (U + 1), next = row + U + 1;
        for (let u = 0; u <= U; u++) {
          let b = tb[next + u];
          for (let k = 1; k <= x.hi && k * pu <= u; k++) b = Math.max(b, tb[next + u - k * pu] + k * v);
          tb[row + u] = b;
        }
      }
      return tb;
    });
    most = preps.map((P) => {
      const tb = new Float64Array((L + 1) * (M + 1));
      for (let p = L - 1; p >= 0; p--) {
        const x = c[ord[p]], v = Math.min(x.hi, Math.floor((cap - cost) / x.price)) * value(P.w, ord[p]);
        const row = p * (M + 1), next = row + M + 1;
        for (let m = 1; m <= M; m++) tb[row + m] = Math.max(tb[next + m], tb[next + m - 1] + v);
      }
      return tb;
    });
    if (!Number.isFinite(T)) return;
    need = [0, 1, 2].map((t) => {
      const tb = new Float64Array((L + 1) * (S1 + 1)).fill(Infinity);
      tb[L * (S1 + 1)] = 0;
      for (let p = L - 1; p >= 0; p--) {
        const x = c[ord[p]], cu = Math.ceil((x.nut[t] * S1) / T - EPS), row = p * (S1 + 1), next = row + S1 + 1;
        for (let j = 0; j <= S1; j++) {
          let b = tb[next + j];
          for (let k = 1; k <= x.hi; k++) b = Math.min(b, tb[next + Math.max(0, j - k * cu)] + k * x.price);
          tb[row + j] = b;
        }
      }
      return tb;
    });
    const W = (S2 + 1) * (S2 + 1);
    need2 = new Float64Array((L + 1) * W).fill(Infinity);
    need2[L * W] = 0;
    for (let p = L - 1; p >= 0; p--) {
      const x = c[ord[p]], ca = Math.ceil((x.nut[2] * S2) / T - EPS), ck = Math.ceil((x.nut[0] * S2) / T - EPS);
      const row = p * W, next = row + W;
      for (let a = 0; a <= S2; a++) for (let k = 0; k <= S2; k++) {
        let b = need2[next + a * (S2 + 1) + k];
        for (let m = 1; m <= x.hi; m++) b = Math.min(b, need2[next + Math.max(0, a - m * ca) * (S2 + 1) + Math.max(0, k - m * ck)] + m * x.price);
        need2[row + a * (S2 + 1) + k] = b;
      }
    }
  };
  const integer = (t, pos) => {
    const w = preps[t].w;
    const add = Math.min(knap[t][pos * (U + 1) + Math.min(U, Math.floor((cap - cost) / unit))], most[t][pos * (M + 1) + M - distinct]);
    return w[0] * sum[0] + w[1] * sum[1] + w[2] * sum[2] + add;
  };
  // Сколько копеек минимум ещё нужно, чтобы закрыть T дней по всем трём величинам.
  const missingCost = (pos) => {
    const steps = (t, S) => Math.max(0, Math.min(S, Math.floor(((T - sum[t]) * S) / T + EPS)));
    let lb = need2[pos * (S2 + 1) * (S2 + 1) + steps(2, S2) * (S2 + 1) + steps(0, S2)];
    for (let t = 0; t < 3; t++) lb = Math.max(lb, need[t][pos * (S1 + 1) + steps(t, S1)]);
    return lb;
  };

  // ---- Поиск ----
  const days = () => Math.min(sum[0], sum[1], sum[2]);
  let best = null, bDays = 0, bGroups = 0, bCost = 0, nodes = 0, nodeLimit = WARM_NODES, exact = true, aim = 0, width = 0;
  const consider = () => {
    if (!feasible()) return;
    const d = days();
    if (best && cmpNum(d, groups, cost, bDays, bGroups, bCost, T) <= 0) return;
    best = Int32Array.from(q); bDays = Math.min(d, T); bGroups = groups; bCost = cost;
    if (bDays >= T - EPS) cap = Math.min(B, Math.floor(bCost / (1 + tolerance)));
  };
  const prune = (pos) => {
    if (cost > cap) return true;
    const reachT = best && bDays >= T - EPS;
    // Ветка интересна, только если может обогнать лучший список больше чем на допуск (и не ниже прицела).
    const target = reachT ? T : Math.max(aim, best ? bDays * (1 + tolerance) : 0);
    if (!target) return false;
    if (reachT && cost + missingCost(pos) > cap) return true;
    let ub = Infinity;
    for (let t = 0; t < preps.length && ub >= target - EPS; t++) ub = Math.min(ub, integer(t, pos));
    for (let t = 0; t < preps.length && ub >= target - EPS; t++) ub = Math.min(ub, fractional(preps[t], pos));
    if (ub < target - EPS) return true;
    if (reachT || tolerance > 0 || !best || ub > bDays + EPS) return false;
    // Без допуска дни можно разве что повторить: выиграть можно лишь числом групп, а при равных группах — ценой.
    const newGroups = new Set();
    for (let p = pos; p < ord.length && newGroups.size < M - distinct; p++) {
      const i = ord[p], x = c[i];
      if (!gUnits[x.g] && x.price <= cap - cost && usable(i, pos)) newGroups.add(x.g);
    }
    const maxGroups = groups + newGroups.size;
    return maxGroups < bGroups || (maxGroups === bGroups && cost >= bCost - 0.5);
  };
  const dfs = (pos) => {
    if (++nodes > nodeLimit) { exact = false; return; }
    consider();
    if (distinct >= M || prune(pos)) return;
    for (let p = pos; p < width && exact; p++) {
      const i = ord[p], x = c[i];
      if (!usable(i, pos)) continue;
      for (let k = Math.min(x.hi, Math.floor((cap - cost) / x.price)); k >= 1 && exact; k--) {
        add(i, k);
        if (!hopeless(x.g)) dfs(p + 1);
        add(i, -k);
      }
    }
  };

  // Разгон: полный перебор среди WARM_WIDTH самых выгодных товаров.
  orient();
  if (probe) return { rootUpper }; // solve спрашивает, можно ли на эту сумму в принципе закрыть неделю
  width = Math.min(ord.length, WARM_WIDTH);
  dfs(0);
  // Если неделя уже закрыта, потолок трат упал: заново выбираем веса, порядок и динамику под него.
  if (cap < B) orient();
  // Основной перебор с прицелом: сначала отбрасываем всё, что не дотягивает до 98 % от оценки для всего
  // каталога. Нашли список не хуже прицела — дальше искать незачем: всё, что могло его обогнать, просмотрено.
  // Не нашли — снижаем прицел; найденное остаётся и помогает отсекать ветки на следующем круге.
  width = ord.length; nodeLimit = nodes + NODE_LIMIT; exact = true;
  for (const f of [0.98, 0.93, 0.8, 0]) {
    aim = Math.min(rootUpper, T) * f;
    dfs(0);
    if (!exact || (best && bDays >= aim - EPS)) break;
  }

  const lines = [];
  c.forEach((x, i) => { if (best[i] > 0) lines.push({ item: x.item, qty: best[i], fixed: x.lo > 0 }); });
  lines.sort(byListOrder);
  const ev = evaluate(lines, profile);
  return { mode, budget: budgetK / 100, lines, ...ev, left: (budgetK - kop(ev.cost)) / 100, exact, nodes };
}

export function byListOrder(a, b) {
  const ga = LIST_ORDER.indexOf(a.item.group), gb = LIST_ORDER.indexOf(b.item.group);
  if (ga !== gb) return ga - gb;
  if (a.item.price_rub !== b.item.price_rub) return b.item.price_rub - a.item.price_rub;
  return a.item.id < b.item.id ? -1 : 1;
}

/** Проверка ограничений готовой корзины — для тестов и для полного перебора. Отдельная от поиска реализация тех же правил. */
export function checkRules(lines, { mode, budget, profile, fixed = {}, groupNorms = null }) {
  const rules = RULES[mode];
  const problems = [];
  const cost = lines.reduce((s, l) => s + kop(l.item.price_rub) * l.qty, 0);
  if (cost > kop(budget)) problems.push('бюджет');
  if (lines.length > rules.maxItems) problems.push('больше 8 товаров');
  const spend = {}, units = {}, grams = {}, fixSpend = {}, fixGrams = {}, kinds = {}, fixKinds = {};
  for (const l of lines) {
    const f = fixed[l.item.id] || 0, g = l.item.group, kd = g + ':' + productKind(l.item);
    if (!Number.isInteger(l.qty) || l.qty < 1) problems.push('количество ' + l.item.id);
    if (f ? l.qty !== f : l.qty > unitCap(l.item, rules, profile)) problems.push('потолок штук ' + l.item.id);
    if (!f && !eligible(l.item, rules)) problems.push('неподходящий товар ' + l.item.id);
    spend[g] = (spend[g] || 0) + kop(l.item.price_rub) * l.qty;
    units[g] = (units[g] || 0) + l.qty;
    grams[g] = (grams[g] || 0) + l.item.weight_g * l.qty;
    fixSpend[g] = (fixSpend[g] || 0) + kop(l.item.price_rub) * f;
    fixGrams[g] = (fixGrams[g] || 0) + l.item.weight_g * f;
    kinds[kd] = (kinds[kd] || 0) + 1;
    if (f) fixKinds[kd] = (fixKinds[kd] || 0) + 1;
  }
  for (const kd of Object.keys(kinds)) if (kinds[kd] > Math.max(1, fixKinds[kd] || 0)) problems.push('два товара одного вида: ' + kd);
  const fatOf = (l, q) => (l.item.weight_g * (l.item.per100.fat_g || 0) * q) / 100;
  const fat = lines.reduce((s, l) => s + fatOf(l, l.qty), 0), fixFat = lines.reduce((s, l) => s + fatOf(l, fixed[l.item.id] || 0), 0);
  if (fat > Math.max(fatLimit(profile, rules), fixFat) + EPS) problems.push('жиры');
  for (const g of Object.keys(spend)) {
    if (units[g] <= household(profile)) continue;
    if (!(spend[g] <= rules.groupShare * cost + 0.5 || spend[g] <= fixSpend[g] + 0.5)) problems.push('доля группы ' + g);
    if (!(grams[g] <= groupGramCap(groupNorms, g, profile, rules) + EPS || grams[g] <= fixGrams[g] + EPS)) problems.push('вес группы ' + g);
  }
  return problems;
}

// ---- Обычный набор (baseline.json) ----

/** Ближайший зафиксированный набор и коэффициент пересчёта на сумму B. */
export function baselineFor(baseline, catalogItems, profile, budget) {
  const byId = new Map(catalogItems.map((it) => [it.id, it]));
  let best = null;
  for (const b of baseline.baskets) {
    if (!best || Math.abs(b.budget_rub - budget) < Math.abs(best.budget_rub - budget)) best = b;
  }
  if (!best) return null;
  const lines = best.items.map((x) => ({ item: byId.get(x.id), qty: x.qty, category: x.category })).filter((l) => l.item);
  const ev = evaluate(lines, profile);
  const scale = budget / best.budget_rub;
  const scaled = scale !== 1;
  const sd = { kcal: ev.days.kcal * scale, prot: ev.days.prot * scale, anim: ev.days.anim * scale };
  return {
    basket: best, lines, scaled, scale,
    cost: ev.cost * scale,
    rawCost: ev.cost,
    days: { ...sd, min: Math.min(sd.kcal, sd.prot, sd.anim) },
    categories: [...new Set(best.items.map((x) => x.category))],
  };
}

/** Можно ли говорить, что наш список закрывает больше: сравниваем те же значения, что видит человек (вниз до 0,1). */
export function comparison(ours, base) {
  if (!base) return { claim: false };
  const a = floorDays(ours.days.min), b = floorDays(base.days.min);
  return { claim: a > b, ours: a, base: b };
}

/** Округление дней вниз: до 0,1; от 10 — до целого. Никогда не завышаем. */
export function floorDays(d) {
  if (!(d > 0)) return 0;
  if (d >= 10) return Math.floor(d + EPS);
  return Math.floor(d * 10 + 1e-7) / 10;
}

/** Цена дня нормы, до рубля; null, если дней меньше 0,1. */
export function pricePerDay(cost, days) {
  return days < 0.1 ? null : Math.round(cost / days);
}
