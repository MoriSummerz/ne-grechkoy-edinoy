// «Как это считается»: все числа на странице — из тех же данных и того же расчёта, что и на главной.
import { loadData, splitName, plainName, baselineLabel, PROFILE_LABEL, composition, priceNote } from './data.js';
import { solve, baselineFor, isAnimal, eligible, RULES } from './engine.js';
import { daysText, plural, ITEM, rub, rub0, num0, grams, kcal } from './format.js';
import { h, put } from './dom.js';
import { fillFooter } from './shell.js';
import { REPO_URL, VIEWS } from './config.js';

const $ = (id) => document.getElementById(id);
const PRICE = ['цена', 'цены', 'цен'];
// «у 31 товара», «у 27 товаров»: после «у» — родительный падеж.
const ofItems = (n) => `${num0(n)} ${plural(n, ['товара', 'товаров', 'товаров'])}`;

async function main() {
  for (const id of ['repo-link', 'repo-link-2']) if ($(id)) $(id).href = REPO_URL;
  $('code-link').href = REPO_URL + '/blob/main/js/engine.js';
  let data;
  try { data = await loadData(); } catch {
    put($('data-facts'), h('p', null, 'Не загрузился каталог товаров. Проверьте интернет и обновите страницу.'));
    return;
  }
  fillFooter(data);
  const { norms, baseline, items, facts } = data;
  const profiles = Object.fromEntries(norms.profiles.map((p) => [p.id, p]));
  const adult = profiles.adult;
  const GN = norms.food_groups.groups;

  // Живой пример: короб на 300 ₽.
  const r = solve({ items, profile: adult, budget: 300, mode: 'korob', groupNorms: GN });
  const ex = $('example');
  put(ex,
    h('h3', null, 'Пример: короб на 300 ₽, один взрослый'),
    h('div', { class: 'table-wrap' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, 'Товар'), h('th', { class: 'n' }, 'Штук'), h('th', { class: 'n' }, 'Калории'), h('th', { class: 'n' }, 'Белок'), h('th', { class: 'n' }, 'Животный'))),
      h('tbody', null, r.lines.map((l) => {
        const w = l.item.weight_g * l.qty / 100;
        const prot = w * l.item.per100.protein_g;
        return h('tr', null, h('td', null, plainName(l.item)), h('td', { class: 'n' }, String(l.qty)),
          h('td', { class: 'n' }, num0(Math.round(w * l.item.per100.kcal))), h('td', { class: 'n' }, grams(prot)), h('td', { class: 'n' }, isAnimal(l.item) ? grams(prot) : '—'));
      })),
      h('tfoot', null, h('tr', null, h('td', null, 'Всего'), h('td'), h('td', { class: 'n' }, num0(Math.round(r.totals.kcal))), h('td', { class: 'n' }, grams(r.totals.prot)), h('td', { class: 'n' }, grams(r.totals.anim)))))),
    h('p', { style: 'margin-top:0.75rem' },
      `Норма взрослого — ${kcal(adult.kcal)}, ${grams(adult.protein_g)} белка, из них ${grams(adult.animal_protein_g)} животного в день. ` +
      `Калорий хватит на ${daysText(r.days.kcal)}, белка — на ${daysText(r.days.prot)}, животного белка — на ${daysText(r.days.anim)}. ` +
      `Список закрывает ${daysText(r.days.min)}; он стоит ${rub(r.cost)}.`));

  // Нормы.
  put($('norms-table').tBodies[0], norms.profiles.map((p) => h('tr', null,
    h('td', null, PROFILE_LABEL[p.id] || p.name, h('span', { class: 'parse-src small' }, composition(p))),
    h('td', { class: 'n' }, num0(p.kcal)), h('td', { class: 'n' }, grams(p.protein_g)), h('td', { class: 'n' }, grams(p.animal_protein_g)))));
  $('norms-family').textContent = 'Для семьи нормы — сумма норм её членов. Взрослый — мужчина с низкой физической активностью: его норма выше женской, поэтому оценка «на сколько дней хватит» осторожная.';
  const mr = norms.sources?.MR_0253_21, mz = norms.sources?.MZ_614;
  if (mr) $('src-mr').href = mr.official_page || mr.official_pdf;
  if (mz) $('src-614').href = mz.official_news_page || mz.official_pdf_2016;

  // Обычный набор на 150, 300, 500 ₽.
  put($('baseline-tables'), baseline.baskets.map((b) => {
    const base = baselineFor(baseline, items, adult, b.budget_rub);
    const ours = solve({ items, profile: adult, budget: b.budget_rub, mode: 'korob', groupNorms: GN });
    return h('div', null,
      h('h3', null, `Обычный набор на ${rub0(b.budget_rub)}: ${baselineLabel(base.categories)}`),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Товар'), h('th', { class: 'n' }, 'Штук'), h('th', { class: 'n' }, 'Сумма'))),
        h('tbody', null, base.lines.map((l) => h('tr', null, h('td', null, plainName(l.item), priceNote(l.item) ? h('span', { class: 'parse-src small' }, priceNote(l.item)) : null), h('td', { class: 'n' }, String(l.qty)), h('td', { class: 'n' }, rub(l.item.price_rub * l.qty))))),
        h('tfoot', null, h('tr', null, h('td', null, 'Итого'), h('td'), h('td', { class: 'n' }, rub(base.rawCost)))))),
      h('p', { class: 'hint' }, `Дни нормы: обычный набор — ${daysText(base.days.min)} (калории ${daysText(base.days.kcal)}, белок ${daysText(base.days.prot)}, животный белок ${daysText(base.days.anim)}); наш список на ту же сумму — ${daysText(ours.days.min)}.`));
  }));

  // Правила — с числами из данных и конфигурации.
  const fam = profiles.family.household;
  const eaters = (n) => `${n} ${plural(n, ['взрослому', 'взрослым', 'взрослым'])}`;
  const fishLike = items.filter((i) => eligible(i, RULES.korob) && isAnimal(i)).sort((a, b) => a.price_rub - b.price_rub)[0];
  const rules = [
    'Для короба и наборов — только то, что хранится без холодильника.',
    'Сладкое не подбираем: сахар, конфеты, печенье, сгущёнку с сахаром. Калории в них есть, больше почти ничего.',
    'Муку не подбираем: по калориям на рубль она обгоняет всё, и без этого правила список превращается в мешок муки.',
    'Детское питание не подбираем: неизвестно, кому достанется короб или набор.',
    'Лапшу быстрого приготовления, крекеры и семечки не подбираем: это перекус, а не продукты.',
    'Эти исключения — по виду товара, а не по отдельным позициям: при замене каталога они работают так же.',
    'Не больше 8 товаров в списке и один товар каждого вида: не два разных риса, не спагетти рядом с макаронами, не две бутылки разного масла.',
    `Не больше 3 штук одного товара. В неделе — не больше 3 штук и 1 кг одного товара на взрослого едока; одна упаковка разрешена всегда. Семье по нормам нужно столько же калорий, сколько ${eaters(fam)}, поэтому ей — до ${3 * fam} штук и ${fam} кг. Список семьи считаем на долю одного едока и умножаем на ${fam}: так перебор остаётся быстрым, но каждого товара в нём кратно ${fam}.`,
    'На одну группу продуктов — не больше половины суммы списка. Одна штука в группе (у семьи в неделе — по штуке на едока) разрешена всегда' +
      (fishLike ? `: иначе на 150 ₽ не прошла бы даже самая недорогая банка или пачка с животным белком (${splitName(fishLike).title.toLowerCase()}, ${rub(fishLike.price_rub)}), и список остался бы без него.` : '.'),
    'В неделе жиров — не больше нормы МР на семь дней, а масла — не больше нормы приказа № 614. Иначе самый дешёвый способ добрать калории — бутылка масла.',
    'При равном числе дней берём список, где больше разных групп продуктов, затем — дешевле. В неделе, когда семь дней уже закрыты, — дешевле; остаток показываем.',
    `Короб и один набор считаем до ${rub0(VIEWS.korob.max)}: дороже по этим правилам почти ничего не добавить. Для больших сумм — расчёт нескольких наборов.`,
  ];
  put($('rules'), rules.map((t) => h('li', null, t)));

  // Данные — из метаданных каталога.
  const otherTitles = items.filter((i) => i.price_basis !== '5ka_shelf').map((i) => splitName(i).title.toLowerCase()).join(', ');
  const nb = (k) => items.filter((i) => i.nutrition_basis === k).length;
  put($('data-facts'),
    h('p', null, `Снимок от ${facts.dateLong}${facts.region ? ', ' + facts.region : ''}, ${num0(facts.total)} ${plural(facts.total, ITEM)}.`),
    h('ul', { class: 'bullets', style: 'margin-top:0.75rem' },
      h('li', null, `${num0(facts.shelf)} ${plural(facts.shelf, PRICE)} — настоящие цены «Пятёрочки» из публичных прайс-листов магазинов на Яндекс Картах (данные Едадила). Если у товара в разных магазинах разная цена, берём самую частую.`),
      h('li', null, `${num0(facts.other)} ${plural(facts.other, PRICE)} — не «Пятёрочка», а средние потребительские цены Росстата по России, пересчитанные на упаковку: ${otherTitles}. В списке такие товары помечены «средняя цена по России, Росстат».`),
      h('li', null, `Калории и белок: у ${ofItems(nb('label_same_product'))} — с этикетки этого товара, у ${num0(nb('label_comparable_product'))} — с этикетки похожего, у ${num0(nb('reference_table'))} — из справочника USDA. Для товаров с костью, кожурой и скорлупой несъедобная часть вычтена.`),
      h('li', null, 'Сайт 5ka.ru и его API с нашего адреса закрыты, обходить защиту мы не стали. Для боевого запуска всё это заменяется одним фидом цен и состава от X5.')));
}

main();
