// Вид «Наборы» (?s=nabory): состав одного набора, таблица закупки, проверка готового набора и подбор добавки.
import { solve, baselineFor, comparison, pricePerDay, floorDays, isAnimal, eligible, evaluate, RULES, GROUP_NAMES, TABLE_ORDER, LIST_ORDER, byListOrder } from './engine.js';
import { daysParts, daysText, plural, ITEM, SET, rub, rub0, num0 } from './format.js';
import { h, put, icon, setFieldError, announce, copyText, animateDays } from './dom.js';
import { splitName, metaLine, priceNote, contribution, plainName, baselineLabel, PROFILE_BY_URL, URL_BY_PROFILE, PROFILE_LABEL, PROFILE_DATIVE, composition } from './data.js';
import { parseList } from './paste.js';
import { VIEWS } from './config.js';
import { writeUrl, otherTasks, priceDateLine } from './shell.js';

const SUB = (profile) => `калорий и белка, включая животный, ${PROFILE_DATIVE[profile.id]}`;

export function mountNabory(root, data, params) {
  const cfg = VIEWS.nabory;
  const profiles = Object.fromEntries(data.norms.profiles.map((p) => [p.id, p]));
  const GN = data.norms.food_groups.groups;
  const state = {
    B: cfg.def, N: cfg.defN,
    p: PROFILE_BY_URL[params.p] || 'adult',
    x: params.x.filter((id) => data.items.some((i) => i.id === id)),
    result: null, prevDays: null,
  };

  // ---------- Форма ----------
  const bInput = h('input', { id: 'nb-b', class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': 'nb-b-hint nb-b-err' });
  const nInput = h('input', { id: 'nb-n', class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', 'aria-describedby': 'nb-n-hint nb-n-err' });
  const bErr = h('div', { id: 'nb-b-err', hidden: true });
  const nErr = h('div', { id: 'nb-n-err', hidden: true });
  const perSet = h('p', { class: 'per-set', 'aria-live': 'off' });
  const profileSet = h('fieldset', null, h('legend', null, 'Для кого набор'),
    h('div', { class: 'choices choices--profile' }, ['elderly_single', 'adult', 'family'].map((id) =>
      h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'nb-profile', value: id }), h('span', null, PROFILE_LABEL[id])))),
    h('p', { class: 'hint choice-note', id: 'nb-family', hidden: true }, 'Считаем на ' + composition(profiles.family)));
  const form = h('form', { class: 'nb-form stack', novalidate: true, style: '--gap:1.25rem' },
    h('div', { class: 'field' }, h('label', { for: 'nb-b' }, 'Бюджет закупки, ₽'), bInput,
      h('span', { id: 'nb-b-hint', class: 'hint' }, `От ${num0(cfg.min)} до ${rub0(cfg.max)}`), bErr),
    h('div', { class: 'field' }, h('label', { for: 'nb-n' }, 'Сколько наборов'), nInput,
      h('span', { id: 'nb-n-hint', class: 'hint' }, `От ${num0(cfg.minN)} до ${num0(cfg.maxN)}`), nErr),
    profileSet,
    h('div', null, h('button', { type: 'submit', class: 'btn' }, 'Рассчитать')),
    perSet);

  const tagArea = h('div', { class: 'tags-pair' });
  const setHead = h('span', { class: 'num' });
  const setNotices = h('div');
  const setList = h('ul', { class: 'list', 'aria-busy': 'true', 'aria-labelledby': 'set-h' });
  const buyBox = h('section', { class: 'buy', 'aria-labelledby': 'buy-h', style: 'margin-top:2.5rem' });
  const copyHost = h('div');
  const printTitle = h('p', { class: 'print-only print-title' });

  const view = h('div', { class: 'view' },
    h('div', { class: 'col-left' },
      h('div', { class: 'h1-block' },
        h('h1', null, 'Состав продуктовых наборов'),
        printTitle,
        h('p', { class: 'intro' }, 'Для фондов и НКО. Укажите бюджет закупки и число наборов — покажем состав одного набора из того, что хранится без холодильника, и общий список закупки.'),
        h('p', { class: 'no-print' }, h('a', { href: '#proverka' }, 'Уже собрали набор? Проверьте, чего в нём не хватает')),
        data.facts.allApprox ? h('p', { class: 'priceband' }, `Цены примерные, на ${data.facts.dateLong}. Суммы — ориентир, на кассе они будут другими.`) : null),
      form,
      tagArea),
    h('section', { class: 'col-right', 'aria-labelledby': 'set-h' },
      h('div', { class: 'list-head' }, h('h2', { id: 'set-h' }, 'Состав одного набора'), setHead),
      setNotices,
      setList,
      buyBox,
      copyHost));
  const check = checkSection();
  put(root, view, check.el, h('div', { class: 'bottom' }, otherTasks('nabory')));

  // ---------- Начальные значения из адреса ----------
  bInput.value = String(cfg.def);
  nInput.value = String(cfg.defN);
  if (params.b != null) bInput.value = params.bRaw;
  if (params.n != null) nInput.value = params.n;
  for (const r of profileSet.querySelectorAll('input')) r.checked = r.value === state.p;
  profileSet.querySelector('#nb-family').hidden = state.p !== 'family';
  profileSet.addEventListener('change', (e) => {
    state.p = e.target.value;
    profileSet.querySelector('#nb-family').hidden = state.p !== 'family';
    submit();
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(true); });

  function readInt(input, errBox, min, max, nanText, maxText) {
    const str = input.value.replace(/[\s  ]/g, '');
    if (!/^\d+$/.test(str)) { setFieldError(input, errBox, nanText); return null; }
    const v = Number(str);
    if (v < min) { setFieldError(input, errBox, `Минимум — ${num0(min)}.`); return null; }
    if (v > max) { setFieldError(input, errBox, maxText); return null; }
    setFieldError(input, errBox, null);
    return v;
  }
  function submit(focusError) {
    const B = readInt(bInput, bErr, cfg.min, cfg.max, 'Введите сумму цифрами, например 50000.', `Максимальный бюджет — ${rub0(cfg.max)}.`);
    const N = readInt(nInput, nErr, cfg.minN, cfg.maxN, 'Введите число наборов цифрами, например 100.', `Максимум — ${num0(cfg.maxN)} наборов.`);
    if (B == null || N == null) {
      if (focusError) (B == null ? bInput : nInput).focus();
      announce('Проверьте поля формы.');
      return;
    }
    // Набор дороже 3 000 ₽ по правилам (8 товаров, до 3 штук каждого) не собрать — деньги остались бы лежать.
    if (B / N > cfg.maxPerSet) {
      perSet.textContent = `На один набор — ${rub(Math.floor((B / N) * 100) / 100)}`;
      setFieldError(nInput, nErr, `Один набор считаем до ${rub0(cfg.maxPerSet)}: дороже по нашим правилам — до 8 товаров, до 3 штук каждого — почти ничего не добавить. Увеличьте число наборов хотя бы до ${num0(Math.ceil(B / cfg.maxPerSet))}.`);
      if (focusError) nInput.focus();
      announce('Проверьте поля формы.');
      return;
    }
    state.B = B; state.N = N;
    recompute();
  }

  // ---------- Расчёт ----------
  const perBudget = () => Math.floor((state.B / state.N) * 100) / 100;
  function recompute(silent) {
    const profile = profiles[state.p];
    const b = perBudget();
    perSet.textContent = `На один набор — ${rub(b)}`;
    printTitle.textContent = `Закупка на ${num0(state.N)} ${plural(state.N, SET)}`;
    const r = solve({ items: data.items, profile, budget: b, mode: 'nabory', exclude: state.x, groupNorms: GN });
    const prevIds = state.result ? new Set(state.result.lines.map((l) => l.item.id + '*' + l.qty)) : null;
    state.result = r;
    writeUrl({ s: 'nabory', b: state.B === cfg.def ? null : state.B, n: state.N === cfg.defN ? null : state.N, p: state.p !== 'adult' ? URL_BY_PROFILE[state.p] : null, x: state.x });
    setList.removeAttribute('aria-busy');
    if (!r.lines.length) {
      put(tagArea);
      setHead.textContent = '';
      put(buyBox);
      const cheapest = data.items.filter((i) => eligible(i, RULES.nabory) && !state.x.includes(i.id)).sort((a, c) => a.price_rub - c.price_rub)[0];
      const msg = state.x.length && cheapest && cheapest.price_rub <= b
        ? `Без убранных товаров на ${rub(b)} ничего не собрать.`
        : `На один набор выходит ${rub(b)} — на эти деньги ничего не собрать. Уменьшите число наборов или увеличьте бюджет.`;
      put(setList, h('li', { class: 'state' }, h('p', null, msg),
        state.x.length ? h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { state.x = []; recompute(); } }, 'Вернуть убранные товары') : null));
      announce(msg);
      return;
    }
    renderTags(r, profile, b);
    const n = r.lines.length;
    setHead.textContent = `${n} ${plural(n, ITEM)}, ${rub(r.cost)}`;
    put(setList, ...r.lines.map((l) => staticRow(l, prevIds && !prevIds.has(l.item.id + '*' + l.qty), () => exclude(l))));
    renderBuy(r);
    if (!silent) announce(`Один набор: ${n} ${plural(n, ITEM)} на ${num0(Math.round(r.cost))} рублей. Калорий и белка, включая животный, на ${daysText(r.days.min)}.`);
  }

  function renderTags(r, profile, b) {
    const base = baselineFor(data.baseline, data.items, profile, b);
    const prev = state.prevDays;
    state.prevDays = r.days.min;
    const p = daysParts(r.days.min);
    const num = h('span', { class: 'tag-num', 'aria-hidden': 'true' }, p.num);
    animateDays(num, prev, r.days.min);
    const ppd = pricePerDay(r.cost, r.days.min);
    const ours = h('div', { class: 'tag', role: 'group', 'aria-label': `Один набор на ${rub(b)}` },
      h('p', { class: 'tag-top' }, `Один набор на ${rub(b)}`),
      mainLine(p, num),
      h('p', { class: 'tag-sub' }, SUB(profile)),
      h('p', { class: 'tag-bar' }, ppd != null ? `${rub0(ppd)} за день нормы` : 'меньше 0,1 дня нормы'));
    const bp = daysParts(base.days.min);
    const bppd = pricePerDay(base.cost, base.days.min);
    const typical = h('div', { class: 'tag tag--typical', role: 'group', 'aria-label': `Обычный набор на ${rub(b)}` },
      h('p', { class: 'tag-top' }, `Обычный набор на ${rub(b)}`),
      mainLine(bp, h('span', { class: 'tag-num', 'aria-hidden': 'true' }, bp.num)),
      h('p', { class: 'tag-sub' }, baselineLabel(base.categories) + (base.scaled ? `, в пересчёте на ${rub(b)}` : '')),
      h('p', { class: 'tag-bar' }, bppd != null ? `${rub0(bppd)} за день нормы` : base.days.anim < 0.1 ? 'животного белка нет' : 'меньше 0,1 дня нормы'));
    const cmp = comparison(r, base);
    put(tagArea, ours, typical,
      h('p', { class: 'details-line', style: 'grid-column:1/-1' },
        `Калории: ${daysText(r.days.kcal)} у набора и ${daysText(base.days.kcal)} у обычного. Белок: ${daysText(r.days.prot)} и ${daysText(base.days.prot)}. Животный белок: ${daysText(r.days.anim)} и ${daysText(base.days.anim)}.` +
        (cmp.claim ? '' : ' На эту сумму наш набор не закрывает больше дней, чем обычный.')));
  }

  function exclude(l) {
    const title = splitName(l.item).title;
    state.x = [...state.x, l.item.id];
    recompute(true);
    const notice = h('div', { class: 'notice' }, h('span', null, `Исключили «${title}».`),
      h('button', { type: 'button', class: 'textbtn', onclick: () => { state.x = state.x.filter((id) => id !== l.item.id); notice.remove(); recompute(); } }, 'Вернуть'));
    put(setNotices, notice);
    announce(`Исключили «${title}». Набор пересчитан.`);
  }

  function renderBuy(r) {
    const N = state.N;
    const total = r.cost * N;
    const rows = r.lines.map((l) => h('tr', null,
      h('td', null, plainName(l.item), priceNote(l.item) ? h('span', { class: 'parse-src small' }, priceNote(l.item)) : null),
      h('td', { class: 'n' }, rub(l.item.price_rub)),
      h('td', { class: 'n' }, num0(l.qty * N)),
      h('td', { class: 'n' }, rub(l.item.price_rub * l.qty * N))));
    put(buyBox, 
      h('h2', { id: 'buy-h' }, `Закупка на ${num0(N)} ${plural(N, SET)}`),
      h('div', { class: 'table-wrap', style: 'margin-top:0.75rem' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Товар'), h('th', { class: 'n' }, 'Цена'), h('th', { class: 'n' }, 'Всего, шт.'), h('th', { class: 'n' }, 'Сумма'))),
        h('tbody', null, rows))),
      h('p', { class: 'total-sum num', style: 'margin-top:0.75rem' }, `Итого ${rub(total)} из ${rub0(state.B)}`),
      h('p', { class: 'muted' }, priceDateLine(data, r.lines)),
      h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'btn', onclick: () => copyText(tsv(r), copyHost, 'Таблица скопирована') }, 'Скопировать для Excel'),
        h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => window.print() }, 'Распечатать')));
  }

  function tsv(r) {
    const N = state.N;
    const dec = (x) => x.toFixed(2).replace('.', ',');
    return [['Товар', 'Цена', 'Всего, шт.', 'Сумма'].join('\t'),
      ...r.lines.map((l) => [plainName(l.item), dec(l.item.price_rub), String(l.qty * N), dec(l.item.price_rub * l.qty * N)].join('\t')),
      ['Итого', '', '', dec(r.cost * N)].join('\t')].join('\n');
  }

  // ---------- Проверка готового набора ----------
  function checkSection() {
    const ta = h('textarea', { id: 'chk-text', class: 'input', rows: '8', 'aria-describedby': 'chk-hint chk-err' });
    const err = h('div', { id: 'chk-err', hidden: true });
    const parsedBox = h('div');
    const resultBox = h('div');
    const el = h('section', { id: 'proverka', class: 'check', 'aria-labelledby': 'chk-h' },
      h('div', { class: 'check-grid' },
      h('div', { class: 'stack', style: '--gap:0.75rem' },
        h('h2', { id: 'chk-h' }, 'Проверить готовый набор'),
        h('p', { id: 'chk-hint', class: 'hint' }, 'Вставьте состав: по товару на строку, количество в конце. Например: «Макароны 450 г — 2».'),
        h('form', { class: 'stack', novalidate: true, style: '--gap:0.75rem', onsubmit: (e) => { e.preventDefault(); runParse(); } },
          h('div', { class: 'field' }, h('label', { for: 'chk-text' }, 'Состав набора'), ta, err),
          h('div', null, h('button', { type: 'submit', class: 'btn' }, 'Проверить')))),
      parsedBox),
      resultBox);

    let parsed = [];
    function runParse() {
      parsed = parseList(ta.value, data.items);
      put(resultBox);
      if (!parsed.length) { setFieldError(ta, err, 'Вставьте хотя бы одну строку.'); ta.focus(); put(parsedBox); return; }
      setFieldError(ta, err, null);
      const found = parsed.filter((p) => p.item).length;
      renderParsed(found === 0);
      if (found) evaluateSet();
      else announce('Ни одной строки не нашли в каталоге. Выберите товары вручную в таблице ниже.');
    }

    function itemSelect(row, i) {
      const sel = h('select', { class: 'input', id: `chk-sel-${i}`, 'aria-label': `Товар для строки «${row.text}»` });
      sel.append(h('option', { value: '' }, 'Не нашли — выберите товар'), h('option', { value: '-' }, 'Не учитывать'));
      for (const g of LIST_ORDER) {
        const its = data.items.filter((it) => it.group === g).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
        if (!its.length) continue;
        sel.append(h('optgroup', { label: GROUP_NAMES[g] }, its.map((it) => h('option', { value: it.id }, `${plainName(it)} — ${rub(it.price_rub)}`))));
      }
      sel.value = row.item ? row.item.id : row.skip ? '-' : '';
      sel.addEventListener('change', () => {
        row.skip = sel.value === '-';
        row.item = data.items.find((it) => it.id === sel.value) || null;
      });
      return sel;
    }

    function renderParsed(noneFound) {
      const rows = parsed.map((row, i) => {
        const q = h('input', { class: 'input', type: 'text', inputmode: 'numeric', name: `chk-qty-${i}`, value: String(row.qty), 'aria-label': `Количество для строки «${row.text}»` });
        q.addEventListener('input', () => { const v = Number(q.value.replace(/\s/g, '')); row.qty = Number.isInteger(v) && v >= 0 ? v : row.qty; });
        return h('tr', null,
          h('td', null, h('span', { class: 'parse-src' }, row.text), itemSelect(row, i)),
          h('td', { class: 'n', style: 'vertical-align:bottom' }, q));
      });
      put(parsedBox, 
        h('h3', null, 'Как мы прочитали список'),
        noneFound ? h('p', { class: 'error' }, icon.alert(), h('span', null, 'Ни одной строки не нашли в каталоге. Выберите товары вручную в таблице ниже.')) : null,
        h('div', { class: 'table-wrap', style: 'margin-top:0.75rem' }, h('table', { class: 'parse-table' },
          h('thead', null, h('tr', null, h('th', null, 'Строка и товар'), h('th', { class: 'n' }, 'Штук'))),
          h('tbody', null, rows))),
        h('div', { class: 'actions' }, h('button', { type: 'button', class: 'btn btn--secondary', onclick: evaluateSet }, 'Пересчитать')));
    }

    function currentSet() {
      const byId = new Map();
      for (const row of parsed) if (row.item && !row.skip && row.qty > 0) byId.set(row.item.id, (byId.get(row.item.id) || 0) + row.qty);
      return [...byId].map(([id, qty]) => ({ item: data.items.find((it) => it.id === id), qty })).sort(byListOrder);
    }

    function evaluateSet() {
      const profile = profiles[state.p];
      const lines = currentSet();
      if (!lines.length) {
        put(resultBox, h('p', { class: 'error' }, icon.alert(), h('span', null, 'Ни одной строки не нашли в каталоге. Выберите товары вручную в таблице ниже.')));
        return;
      }
      const ev = evaluate(lines, profile);
      const p = daysParts(ev.days.min);
      const missing = TABLE_ORDER.filter((g) => g !== 'sugar_sweets' && g !== 'other' && !ev.groupSet.has(g)).map((g) => GROUP_NAMES[g].toLowerCase());
      const addInput = h('input', { id: 'chk-add', class: 'input', type: 'text', inputmode: 'numeric', value: String(defaultAdd()), 'aria-describedby': 'chk-add-err' });
      const addErr = h('div', { id: 'chk-add-err', hidden: true });
      const addBox = h('div');
      put(resultBox, h('div', { class: 'result-grid', style: 'margin-top:1.5rem' },
        h('div', { class: 'stack' },
          h('div', { class: 'tag', role: 'group', 'aria-label': `Ваш набор, ${rub(ev.cost)}` },
            h('p', { class: 'tag-top' }, `Ваш набор, ${rub(ev.cost)}`),
            mainLine(p, h('span', { class: 'tag-num', 'aria-hidden': 'true' }, p.num)),
            h('p', { class: 'tag-sub' }, SUB(profile)),
            h('p', { class: 'tag-bar' }, pricePerDay(ev.cost, ev.days.min) != null ? `${rub0(pricePerDay(ev.cost, ev.days.min))} за день нормы` : 'меньше 0,1 дня нормы')),
          h('p', null, weakPoint(ev.days)),
          missing.length ? h('p', null, `В наборе нет: ${missing.join(', ')}.`) : null),
        h('div', null,
          h('form', { novalidate: true, onsubmit: (e) => { e.preventDefault(); addOn(lines, ev, addInput, addErr, addBox); } },
            h('div', { class: 'inline-form' },
              h('div', { class: 'field' }, h('label', { for: 'chk-add' }, 'Сколько можно добавить на один набор, ₽'), addInput),
              h('button', { type: 'submit', class: 'btn' }, 'Подобрать добавку')),
            addErr),
          addBox)));
      announce(`Ваш набор: калорий и белка, включая животный, на ${daysText(ev.days.min)}. ${weakPoint(ev.days)}`);
    }

    function addOn(lines, ev, addInput, addErr, addBox) {
      const str = addInput.value.replace(/[\s ]/g, '');
      if (!/^\d+$/.test(str)) { setFieldError(addInput, addErr, 'Введите сумму цифрами, например 100.'); addInput.focus(); return; }
      const add = Number(str);
      if (add < 10) { setFieldError(addInput, addErr, `Минимальная сумма — ${rub0(10)}.`); addInput.focus(); return; }
      if (add > 100000) { setFieldError(addInput, addErr, `Максимальная сумма — ${rub0(100000)}.`); addInput.focus(); return; }
      setFieldError(addInput, addErr, null);
      const profile = profiles[state.p];
      const fixed = Object.fromEntries(lines.map((l) => [l.item.id, l.qty]));
      const r = solve({ items: data.items, profile, budget: ev.cost + add, mode: 'nabory', fixed, groupNorms: GN, maxItems: lines.length + 4 });
      const extra = r.lines.map((l) => ({ item: l.item, qty: l.qty - (fixed[l.item.id] || 0) })).filter((l) => l.qty > 0);
      if (!extra.length || floorDays(r.days.min) <= floorDays(ev.days.min)) {
        const a = cheapestAnimal();
        const msg = `На ${rub0(add)} дни нормы не вырастут.` + (a && ev.days.anim <= ev.days.kcal && ev.days.anim <= ev.days.prot ? ` Не хватает животного белка, а самый недорогой его источник без холодильника — ${splitName(a).title}, ${rub(a.price_rub)}.` : ' Попробуйте сумму больше.');
        put(addBox, h('p', { style: 'margin-top:1rem' }, msg));
        announce(msg);
        return;
      }
      const cost = extra.reduce((a, l) => a + l.item.price_rub * l.qty, 0);
      put(addBox, 
        h('h3', { style: 'margin-top:1.5rem' }, 'Добавьте к набору'),
        h('p', null, `Тогда набор закроет ${daysText(r.days.min)} вместо ${daysText(ev.days.min)}. Добавка стоит ${rub(cost)}.`),
        h('ul', { class: 'list', style: 'margin-top:0.5rem' }, extra.map((l) => staticRow(l, false, null))));
      announce(`Добавьте к набору ${extra.length} ${plural(extra.length, ITEM)}. Тогда набор закроет ${daysText(r.days.min)} вместо ${daysText(ev.days.min)}.`);
    }

    return { el };
  }

  // Добавка по умолчанию — 100 ₽, но не меньше самого недорогого источника животного белка (иначе добавить нечего).
  function cheapestAnimal() {
    return data.items.filter((i) => eligible(i, RULES.nabory) && isAnimal(i)).sort((a, b) => a.price_rub - b.price_rub)[0] || null;
  }
  function defaultAdd() {
    const a = cheapestAnimal();
    return a && a.price_rub > cfg.defAdd ? Math.ceil(a.price_rub / 50) * 50 : cfg.defAdd;
  }

  submit();
}

function mainLine(p, num) {
  return h('p', { class: 'tag-main' },
    p.less ? h('span', { class: 'tag-pre', 'aria-hidden': 'true' }, 'меньше') : null,
    num, h('span', { class: 'tag-unit', 'aria-hidden': 'true' }, p.unit),
    h('span', { class: 'vh' }, (p.less ? 'меньше ' : '') + p.num + ' ' + p.unit));
}

/** Строка без чекбокса: для набора и добавки. onExclude — кнопка «Исключить». */
function staticRow(l, fresh, onExclude) {
  const it = l.item, n = splitName(it), note = priceNote(it);
  return h('li', { class: 'row row--static' + (fresh ? ' is-fresh' : '') },
    h('div', { class: 'row-label' },
      h('span', { class: 'r-name' }, n.title),
      h('span', { class: 'r-qty' }, h('span', { class: 'vh' }, 'количество '), `×${l.qty}`),
      h('span', { class: 'r-meta' }, metaLine(n), note ? h('span', { class: 'r-basis' }, note) : null),
      h('span', { class: 'r-each' }, 'по ', rub(it.price_rub)),
      h('span', { class: 'r-contrib', style: onExclude ? null : 'padding-right:0' }, contribution(it, l.qty))),
    onExclude ? h('button', { type: 'button', class: 'textbtn shelf-btn', 'aria-label': `Исключить: ${n.title}`, onclick: onExclude }, 'Исключить') : null);
}

/** Фраза о слабом месте набора: что закончится первым. */
export function weakPoint(d) {
  const k = daysText(d.kcal), p = daysText(d.prot), a = daysText(d.anim);
  if (d.anim <= d.prot && d.anim <= d.kcal) return `Калорий в наборе на ${k}, белка — на ${p}, а животного белка — на ${a}. Животный белок закончится первым.`;
  if (d.prot <= d.kcal) return `Калорий в наборе на ${k}, а белка — на ${p}. Белок закончится первым.`;
  return `Белка в наборе на ${p}, а калорий — на ${k}. Калории закончатся первыми.`;
}
