// Виды «Короб» (?s=korob) и «Неделя» (?s=nedelya): форма, ценник, список с отметками, «Нет на полке», отправка, печать.
import { solve, baselineFor, comparison, pricePerDay, eligible, RULES, GROUP_NAMES, TABLE_ORDER, persons, groupNorm, household } from './engine.js';
import { daysParts, daysText, plural, ITEM, PIECE, rub, rub0, num0, grams } from './format.js';
import { h, put, icon, setFieldError, announce, copyText, animateDays, cells } from './dom.js';
import { splitName, metaLine, priceNote, contribution, plainName, baselineLabel, PROFILE_BY_URL, URL_BY_PROFILE, PROFILE_LABEL, PROFILE_DATIVE, composition } from './data.js';
import { VIEWS } from './config.js';
import { writeUrl, otherTasks, priceDateLine } from './shell.js';

const TEXT = {
  korob: {
    h1: 'Что положить в короб «Корзины доброты»',
    intro: 'В продуктовой помощи много круп и макарон и мало белка, особенно животного. Здесь — что взять в «Пятёрочке», чтобы на ваши деньги было больше и калорий, и белка. Всё хранится без холодильника, как требует акция.',
    legend: 'Сколько готовы потратить',
    print: (b) => `Список для короба на ${rub0(b)}`,
    shareHead: (b) => `Что положить в короб «Корзины доброты» на ${rub0(b)}:`,
  },
  nedelya: {
    h1: 'Покупки на неделю по сертификату',
    intro: 'Укажите сумму сертификата и на кого покупаете — покажем, что взять в «Пятёрочке», чтобы на семь дней хватило калорий и белка, включая животный. Свежие продукты тоже учитываем. Ничего не сохраняется.',
    legend: 'Сумма сертификата',
    print: (b) => `Покупки на неделю на ${rub0(b)}`,
    shareHead: (b, p) => `Покупки на неделю на ${rub0(b)}, ${PROFILE_LABEL[p.id].toLowerCase()}:`,
  },
};
const HINT = 'Отмечайте, что уже взяли. Если товара нет на полке, нажмите «Нет на полке» — подберём замену, отмеченное не изменится.';
const SUB = (profile) => `калорий и белка, включая животный, ${PROFILE_DATIVE[profile.id]}`;

export function mountList(root, data, params) {
  const s = params.s;
  const cfg = VIEWS[s];
  const T = TEXT[s];
  const profiles = Object.fromEntries(data.norms.profiles.map((p) => [p.id, p]));
  const state = {
    s,
    b: cfg.def,
    p: s === 'korob' ? 'adult' : PROFILE_BY_URL[params.p] || 'adult',
    x: params.x.filter((id) => data.items.some((i) => i.id === id)),
    k: params.k,
    custom: false,
    result: null,
    prevDays: null,
    prevBase: null,
    prevIds: null,
  };
  let urlError = null;
  if (params.b != null) {
    const v = validateSum(params.bRaw, cfg, s);
    if (v.ok) { state.b = v.value; state.custom = !cfg.presets.includes(v.value); }
    else urlError = v;
  }

  // ---------- Разметка ----------
  const errBox = h('div', { id: 'sum-error', hidden: true });
  const customInput = h('input', {
    id: 'sum-input', class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off', enterkeyhint: 'done',
    'aria-describedby': 'sum-hint sum-error',
  });
  const customRow = h('div', { class: 'custom-row', hidden: true },
    h('div', { class: 'inline-form' },
      h('div', { class: 'field' }, h('label', { for: 'sum-input' }, 'Сумма, ₽'), customInput),
      h('button', { type: 'submit', class: 'btn' }, 'Посчитать')),
    h('p', { id: 'sum-hint', class: 'hint field-hint' }, `От ${num0(cfg.min)} до ${rub0(cfg.max)}`));
  const sumRadios = [...cfg.presets.map((v) => ({ v, label: rub0(v) })), { v: 'other', label: 'Другая сумма' }];
  const sumForm = h('form', { class: 'sums', novalidate: true },
    h('fieldset', null,
      h('legend', null, T.legend),
      h('div', { class: 'choices choices--sum' }, sumRadios.map(({ v, label }) =>
        h('label', { class: 'choice' + (v === 'other' ? ' choice--other' : '') },
          h('input', { type: 'radio', name: 'sum', value: String(v) }),
          h('span', null, label))))),
    customRow, errBox);

  let profileForm = null, familyNote = null;
  if (s === 'nedelya') {
    familyNote = h('p', { class: 'hint choice-note', hidden: true }, 'Считаем на ' + composition(profiles.family));
    profileForm = h('fieldset', { class: 'profiles' },
      h('legend', null, 'На кого покупаете'),
      h('div', { class: 'choices choices--profile' }, ['elderly_single', 'adult', 'family'].map((id) =>
        h('label', { class: 'choice' }, h('input', { type: 'radio', name: 'profile', value: id }), h('span', null, PROFILE_LABEL[id])))),
      familyNote);
  }

  const tagArea = h('div', { class: 'tag-area' });
  const leftExtra = h('div', { class: 'left-extra stack', style: '--gap:1.5rem' });
  const listHeadNum = h('span', { class: 'num' });
  const notices = h('div', { class: 'notices', 'aria-live': 'off' });
  const list = h('ul', { class: 'list', 'aria-busy': 'true', 'aria-labelledby': 'list-h' });
  const totalBox = h('div', { class: 'total' });
  const copyHost = h('div', { class: 'copy-host' });
  const shareBtnLabel = canShare() ? 'Отправить список' : 'Скопировать список';
  const actions = h('div', { class: 'actions desktop-only' },
    h('button', { type: 'button', class: 'btn', onclick: () => shareList(false) }, 'Скопировать список'),
    h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => window.print() }, 'Распечатать'));
  const printTitle = h('p', { class: 'print-only print-title' });
  const printFoot = h('p', { class: 'print-only small' });

  const view = h('div', { class: 'view' },
    h('div', { class: 'col-left' },
      h('div', { class: 'h1-block' },
        h('h1', null, T.h1),
        printTitle,
        h('p', { class: 'intro' }, T.intro),
        data.facts.allApprox ? h('p', { class: 'priceband' }, `Цены примерные, на ${data.facts.dateLong}. Суммы — ориентир, на кассе они будут другими.`) : null),
      sumForm,
      profileForm,
      tagArea,
      leftExtra),
    h('section', { class: 'col-right', 'aria-labelledby': 'list-h' },
      h('div', { class: 'list-head' }, h('h2', { id: 'list-h' }, 'Что купить'), listHeadNum),
      h('p', { class: 'hint list-hint' }, HINT),
      notices,
      list,
      totalBox,
      actions,
      copyHost,
      printFoot));
  const compareSection = s === 'korob' ? h('section', { class: 'compare', 'aria-labelledby': 'cmp-h' }) : null;
  const bottom = h('div', { class: 'bottom' }, compareSection, otherTasks(s));
  const barSum = h('span', { class: 'bar-sum' });
  const bar = h('div', { class: 'bar' }, h('div', { class: 'bar-in' }, barSum,
    h('button', { type: 'button', class: 'btn', onclick: () => shareList(canShare()) }, shareBtnLabel)));
  put(root, view, bottom, bar);
  document.body.classList.add('has-bar');
  // Панель липкая: отступ снизу равен её высоте, чтобы она не закрывала последнюю строку и при крупном шрифте.
  new ResizeObserver(() => { document.body.style.setProperty('--bar-h', bar.offsetHeight + 'px'); }).observe(bar);
  put(list, h('li', { class: 'state' }, 'Считаем список…'));

  // ---------- Состояние формы ----------
  const sumInputs = [...sumForm.querySelectorAll('input[name=sum]')];
  const syncSumRadios = () => {
    for (const r of sumInputs) r.checked = state.custom ? r.value === 'other' : Number(r.value) === state.b;
    customRow.hidden = !state.custom;
    if (state.custom && !customInput.value) customInput.value = String(state.b);
  };
  syncSumRadios();
  if (urlError) {
    state.custom = true;
    syncSumRadios();
    customInput.value = params.bRaw;
    showSumError(urlError);
  }
  if (profileForm) {
    for (const r of profileForm.querySelectorAll('input')) r.checked = r.value === state.p;
    familyNote.hidden = state.p !== 'family';
    profileForm.addEventListener('change', (e) => {
      state.p = e.target.value;
      familyNote.hidden = state.p !== 'family';
      state.k = {};
      recompute();
    });
  }
  sumForm.addEventListener('change', (e) => {
    if (e.target.name !== 'sum') return;
    if (e.target.value === 'other') {
      state.custom = true;
      customRow.hidden = false;
      customInput.value = '';
      customInput.focus();
      return;
    }
    state.custom = false;
    customRow.hidden = true;
    setFieldError(customInput, errBox, null);
    state.b = Number(e.target.value);
    recompute();
  });
  sumForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = validateSum(customInput.value, cfg, s);
    if (!v.ok) { showSumError(v); customInput.focus(); return; }
    setFieldError(customInput, errBox, null);
    state.b = v.value;
    recompute();
  });

  function showSumError(v) {
    let extra = null;
    if (v.kind === 'max' && s === 'korob') {
      const b = Math.min(v.value, VIEWS.nabory.max);
      extra = h('a', { class: 'btn btn--secondary', href: `./?s=nabory&b=${b}&n=${Math.ceil(b / VIEWS.nabory.maxPerSet)}` }, 'Рассчитать наборы');
    }
    setFieldError(customInput, errBox, v.text, extra);
    announce(v.text);
  }

  // ---------- Расчёт ----------
  function recompute(opts = {}) {
    const profile = profiles[state.p];
    if (!opts.now && s === 'nedelya' && household(profile) > 1) {
      // Для семьи перебор бывает до полусекунды: сначала показываем «Считаем список…», потом считаем.
      list.setAttribute('aria-busy', 'true');
      put(list, h('li', { class: 'state' }, 'Считаем список…'));
      requestAnimationFrame(() => setTimeout(() => recompute({ ...opts, now: true }), 0));
      return null;
    }
    const fixed = Object.fromEntries(Object.entries(state.k).filter(([id]) => !state.x.includes(id)));
    const r = solve({ items: data.items, profile, budget: state.b, mode: s, exclude: state.x, fixed, groupNorms: data.norms.food_groups.groups });
    // отметки, которые расчёт не смог сохранить (например, дороже новой суммы), снимаем
    const inList = new Map(r.lines.map((l) => [l.item.id, l.qty]));
    for (const id of Object.keys(state.k)) if (inList.get(id) !== state.k[id]) delete state.k[id];
    const prevIds = state.result ? new Set(state.result.lines.map((l) => l.item.id + '*' + l.qty)) : null;
    state.result = r;
    writeUrl({ s, b: state.b === cfg.def ? null : state.b, p: s === 'nedelya' && state.p !== 'adult' ? URL_BY_PROFILE[state.p] : null, x: state.x, k: state.k });
    render(r, profile, prevIds, opts);
    return r;
  }

  function render(r, profile, prevIds, opts) {
    const B = state.b;
    const base = s === 'korob' ? baselineFor(data.baseline, data.items, profile, B) : null;
    const cmp = comparison(r, base);
    printTitle.textContent = T.print(B);

    // Пусто: ничего не помещается или всё подходящее убрано.
    if (!r.lines.length) {
      renderEmpty(r, profile);
      return;
    }

    renderTags(r, profile, base, cmp);
    renderList(r, prevIds);
    const n = r.lines.length;
    listHeadNum.textContent = `${n} ${plural(n, ITEM)}, ${rub(r.cost)}`;
    put(totalBox, 
      h('p', { class: 'total-sum num' }, `Итого ${rub(r.cost)} из ${rub0(B)}`),
      h('p', { class: 'muted' }, priceDateLine(data, r.lines)));
    barSum.textContent = `${rub(r.cost)} из ${num0(B)}`;
    printFoot.textContent = `${daysSentence(r, profile)} ${shareLink()}`;
    if (compareSection) renderCompare(r, base, cmp);
    if (!opts.silent) announce(`${n} ${plural(n, ITEM)} на ${num0(Math.round(r.cost))} рублей. Калорий и белка, включая животный, на ${daysText(s === 'nedelya' ? Math.min(r.days.min, 7) : r.days.min)}.`);
  }

  function renderEmpty(r, profile) {
    put(tagArea);
    put(leftExtra);
    listHeadNum.textContent = '';
    put(totalBox);
    barSum.textContent = '';
    if (compareSection) put(compareSection);
    const withoutX = state.x.length ? solve({ items: data.items, profile, budget: state.b, mode: s, groupNorms: data.norms.food_groups.groups }) : null;
    let msg, btn;
    if (withoutX && withoutX.lines.length) {
      msg = `Без убранных товаров на ${rub0(state.b)} ничего не собрать.`;
      btn = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { state.x = []; recompute(); } }, 'Вернуть убранные товары');
    } else {
      const cheapest = data.items.filter((i) => eligible(i, RULES[s])).sort((a, b) => a.price_rub - b.price_rub)[0];
      const to = cfg.presets[0];
      msg = `На ${rub0(state.b)} ничего не собрать.` + (cheapest ? ` Самый недорогой подходящий товар — ${splitName(cheapest).title}, ${rub(cheapest.price_rub)}.` : '');
      btn = h('button', { type: 'button', class: 'btn btn--secondary', onclick: () => { state.b = to; state.custom = false; syncSumRadios(); recompute(); } }, `Посчитать на ${rub0(to)}`);
    }
    list.removeAttribute('aria-busy');
    put(list, h('li', { class: 'state' }, h('p', null, msg), btn));
    announce(msg);
  }

  // ---------- Ценники ----------
  function renderTags(r, profile, base, cmp) {
    const B = state.b;
    const week = s === 'nedelya';
    const ours = week ? Math.min(r.days.min, 7) : r.days.min;
    const ppd = pricePerDay(r.cost, r.days.min);
    const prev = state.prevDays;
    state.prevDays = ours;

    const tagOurs = (compact) => {
      const parts = daysParts(ours);
      const num = h('span', { class: 'tag-num', 'aria-hidden': 'true' }, parts.num);
      animateDays(num, prev, ours);
      const unit = week ? `${parts.unit} из 7` : parts.unit;
      const main = h('p', { class: 'tag-main' },
        parts.less ? h('span', { class: 'tag-pre', 'aria-hidden': 'true' }, 'меньше') : null,
        num, h('span', { class: 'tag-unit', 'aria-hidden': 'true' }, unit),
        h('span', { class: 'vh' }, (parts.less ? 'меньше ' : '') + parts.num + ' ' + unit));
      const sub = h('p', { class: 'tag-sub' }, SUB(profile));
      let barText;
      if (compact && base) barText = `Обычный набор на ${rub0(B)}: ${daysText(base.days.min)}`;
      else barText = ppd != null ? `${rub0(ppd)} за день нормы` : 'меньше 0,1 дня нормы';
      return h('div', { class: 'tag' + (compact ? ' tag--compact' : ''), role: 'group', 'aria-label': `Этот список на ${rub0(B)}` },
        compact ? null : h('p', { class: 'tag-top' }, `Этот список на ${rub0(B)}`),
        compact ? h('div', { class: 'tag-body' }, main, sub) : main,
        compact ? null : sub,
        h('p', { class: 'tag-bar' }, barText));
    };
    const tagBase = () => {
      const parts = daysParts(base.days.min);
      const num = h('span', { class: 'tag-num', 'aria-hidden': 'true' }, parts.num);
      animateDays(num, state.prevBase, base.days.min);
      const bppd = pricePerDay(base.cost, base.days.min);
      return h('div', { class: 'tag tag--typical', role: 'group', 'aria-label': `Обычный набор на ${rub0(B)}` },
        h('p', { class: 'tag-top' }, `Обычный набор на ${rub0(B)}`),
        h('p', { class: 'tag-main' },
          parts.less ? h('span', { class: 'tag-pre', 'aria-hidden': 'true' }, 'меньше') : null,
          num, h('span', { class: 'tag-unit', 'aria-hidden': 'true' }, parts.unit),
          h('span', { class: 'vh' }, (parts.less ? 'меньше ' : '') + parts.num + ' ' + parts.unit)),
        h('p', { class: 'tag-sub' }, baselineLabel(base.categories) + (base.scaled ? `, в пересчёте на ${rub0(B)}` : '')),
        h('p', { class: 'tag-bar' }, bppd != null ? `${rub0(bppd)} за день нормы` : base.days.anim < 0.1 ? 'животного белка нет' : 'меньше 0,1 дня нормы'));
    };

    if (!week) {
      put(tagArea, h('div', { class: 'phone-only' }, tagOurs(true)));
      const pair = () => h('div', { class: 'tags-pair' }, tagOurs(false), tagBase());
      put(leftExtra, 
        h('div', { class: 'desktop-only' }, pair()),
        h('div', { class: 'desktop-only' }, daysRows(r, base)),
        h('p', { class: 'desktop-only details-line' }, detailsLine(r, base)),
        cmp.claim && claimHolds(base) ? h('p', { class: 'desktop-only claim' }, CLAIM_TEXT(base)) : null);
      state.prevBase = base.days.min;
      state.pairForPhone = pair;
    } else {
      const full = ours >= 7 - 1e-9;
      // Деньги остались, а неделя не закрыта: упёрлись в правила списка, а не в сумму — так и говорим.
      const byRules = !full && r.left >= 0.1 * B;
      put(tagArea, tagOurs(false));
      put(leftExtra,
        h('p', null, full
          ? `Норма на неделю закрыта. Остаётся ${rub(r.left)} — их можно потратить на что хочется.`
          : byRules
            ? `Всю неделю не закрыть: в списке не больше 8 товаров и не больше 3 штук каждого на едока. Остаётся ${rub(r.left)} — их можно потратить на что хочется.`
            : 'На эту сумму всю неделю не закрыть. Мы взяли то, что даёт больше всего калорий и белка, включая животный, на каждый рубль.'),
        weekRows(r),
        h('p', { class: 'details-line' }, `Калории: ${daysText(r.days.kcal)}. Белок: ${daysText(r.days.prot)}. Животный белок: ${daysText(r.days.anim)}.`),
        groupsDetails(r, profile));
    }
  }

  function daysRows(r, base) {
    const max = Math.max(r.days.min, base.days.min);
    const count = Math.max(1, Math.ceil(max - 1e-9));
    return h('div', { class: 'cells-rows' },
      h('div', { class: 'cells-row' }, h('span', null, 'Этот список'), cells(r.days.min, count), h('span', { class: 'vh' }, daysText(r.days.min))),
      h('div', { class: 'cells-row' }, h('span', null, 'Обычный набор'), cells(base.days.min, count, true), h('span', { class: 'vh' }, daysText(base.days.min))));
  }
  function weekRows(r) {
    return h('div', { class: 'cells-rows' },
      h('div', { class: 'cells-row' }, h('span', null, 'Этот список'), cells(Math.min(r.days.min, 7), 7), h('span', { class: 'vh' }, daysText(Math.min(r.days.min, 7)) + ' из 7')));
  }

  function groupsDetails(r, profile) {
    const ppl = persons(profile);
    const rows = TABLE_ORDER.filter((g) => g !== 'sugar_sweets').map((g) => {
      const inList = r.lines.filter((l) => l.item.group === g).reduce((a, l) => a + l.item.weight_g * l.qty, 0);
      const cap = groupNorm(data.norms.food_groups.groups, g, profile, 7);
      return h('tr', null,
        h('td', null, GROUP_NAMES[g]),
        h('td', { class: 'n' }, inList ? grams(inList) : '—'),
        h('td', { class: 'n' }, Number.isFinite(cap) ? grams(cap) : 'нет нормы'));
    });
    return h('details', { class: 'groups' },
      h('summary', null, 'Что в списке по группам продуктов', icon.chevron()),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', null, 'Группа'), h('th', { class: 'n' }, 'В списке'), h('th', { class: 'n' }, 'Рекомендуется на 7 дней'))),
        h('tbody', null, rows))),
      h('p', { class: 'hint' }, `Рекомендации — по приказу Минздрава № 614${ppl > 1 ? `, на ${ppl} ${plural(ppl, ['человека', 'человека', 'человек'])}` : ''}; для молочного — вес самих продуктов. Это ориентир, а не обязательная норма.`));
  }

  // ---------- Список ----------
  function renderList(r, prevIds) {
    list.removeAttribute('aria-busy');
    const rows = r.lines.map((l) => row(l, prevIds && !prevIds.has(l.item.id + '*' + l.qty)));
    put(list, ...rows);
  }

  function row(l, fresh) {
    const it = l.item, n = splitName(it), done = state.k[it.id] === l.qty;
    const note = priceNote(it);
    const label = `${n.title}, ${n.size}, ${l.qty} ${plural(l.qty, PIECE)} по ${rub(it.price_rub).replace('₽', 'рублей')}`;
    const cb = h('input', { type: 'checkbox', name: 'taken', value: it.id, 'aria-label': label });
    cb.checked = done;
    const shelfBtn = h('button', { type: 'button', class: 'textbtn shelf-btn', 'aria-label': `Нет на полке: ${n.title}` }, 'Нет на полке');
    const li = h('li', { class: 'row' + (done ? ' is-done' : '') + (fresh ? ' is-fresh' : ''), dataset: { id: it.id } },
      h('label', { class: 'row-label' },
        h('span', { class: 'chk-zone' }, cb, h('span', { class: 'chk-box' }, icon.check())),
        h('span', { class: 'r-name' }, n.title),
        h('span', { class: 'r-qty', 'aria-hidden': 'true' }, `×${l.qty}`),
        h('span', { class: 'r-meta' }, metaLine(n), note ? h('span', { class: 'r-basis' }, note) : null),
        h('span', { class: 'r-each' }, 'по ', rub(it.price_rub)),
        h('span', { class: 'r-contrib' }, contribution(it, l.qty))),
      shelfBtn);
    shelfBtn.hidden = done;
    cb.addEventListener('change', () => {
      if (cb.checked) state.k[it.id] = l.qty; else delete state.k[it.id];
      li.classList.toggle('is-done', cb.checked);
      shelfBtn.hidden = cb.checked;
      writeUrl({ s, b: state.b === cfg.def ? null : state.b, p: s === 'nedelya' && state.p !== 'adult' ? URL_BY_PROFILE[state.p] : null, x: state.x, k: state.k });
    });
    shelfBtn.addEventListener('click', () => notOnShelf(l));
    return li;
  }

  function notOnShelf(l) {
    const before = state.result;
    const oldTitle = splitName(l.item).title;
    state.x = [...state.x, l.item.id];
    const r = recompute({ silent: true, now: true });
    const oldIds = new Set(before.lines.map((x) => x.item.id));
    const added = r.lines.filter((x) => !oldIds.has(x.item.id)).map((x) => `«${splitName(x.item).title}»`);
    const msg = added.length
      ? `Убрали «${oldTitle}». Вместо него — ${added.join(' и ')}.`
      : `Убрали «${oldTitle}». На оставшиеся ${rub(Math.max(0, state.b - Object.entries(state.k).reduce((a, [id, q]) => a + (data.items.find((i) => i.id === id)?.price_rub || 0) * q, 0)))} замены не нашлось.`;
    const notice = h('div', { class: 'notice' }, h('span', null, msg),
      h('button', { type: 'button', class: 'textbtn', onclick: () => {
        state.x = state.x.filter((id) => id !== l.item.id);
        notice.remove();
        recompute();
      } }, 'Вернуть'));
    put(notices, notice);
    announce(msg);
  }

  // ---------- Сравнение (короб) ----------
  function renderCompare(r, base, cmp) {
    const items = base.lines.map((l) => h('li', null,
      h('span', null, `${plainName(l.item)} ×${l.qty}`),
      h('span', null, rub(l.item.price_rub * l.qty))));
    put(compareSection, 
      h('h2', { id: 'cmp-h' }, 'С чем сравниваем'),
      h('p', null, `Обычный набор — то, что кладут в короб по официальному списку акции: ${baselineLabel(base.categories)}, по одной недорогой упаковке на ${rub0(base.basket.budget_rub)}. Его состав зафиксирован, цены из того же снимка, поэтому сравнение можно проверить.` +
        (base.scaled ? ` Для суммы ${rub0(state.b)} берём набор на ${rub0(base.basket.budget_rub)} и пересчитываем дни пропорционально сумме.` : '')),
      h('div', { class: 'phone-only' },
        state.pairForPhone(),
        daysRows(r, base),
        h('p', { class: 'details-line' }, detailsLine(r, base)),
        cmp.claim && claimHolds(base) ? h('p', { class: 'claim' }, CLAIM_TEXT(base)) : null),
      h('ul', { class: 'compare-list' }, items,
        h('li', { class: 'sum' }, h('span', null, 'Итого'), h('span', null, rub(base.rawCost)))),
      h('p', null, h('a', { href: './kak-schitaem.html#sravnenie' }, 'Как устроено сравнение')));
  }

  // ---------- Отправка ----------
  function shareLink() {
    const u = new URL(location.href);
    u.searchParams.delete('k');
    return u.toString();
  }
  function daysSentence(r, profile) {
    if (s === 'nedelya') return `Калорий и белка, включая животный, — на ${daysText(Math.min(r.days.min, 7))} из 7.`;
    const base = baselineFor(data.baseline, data.items, profile, state.b);
    const cmp = comparison(r, base);
    return `Калорий и белка, включая животный, — на ${daysText(r.days.min)} ${PROFILE_DATIVE[profile.id]}.` +
      (cmp.claim ? ` Обычный набор (${baselineLabel(base.categories)}) на те же деньги — на ${daysText(base.days.min)}.` : '');
  }
  function shareTextFor() {
    const r = state.result, profile = profiles[state.p];
    const lines = r.lines.map((l) => `☐ ${plainName(l.item)} — ${l.qty} шт. по ${rub(l.item.price_rub)}${priceNote(l.item) ? ' (' + priceNote(l.item) + ')' : ''}`);
    return [T.shareHead(state.b, profile), ...lines, `Итого: ${rub(r.cost)}`, daysSentence(r, profile), priceDateLine(data, r.lines, true), shareLink()].join('\n');
  }
  async function shareList(useShare) {
    if (!state.result || !state.result.lines.length) return;
    const text = shareTextFor();
    if (useShare) {
      try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
    }
    copyText(text, copyHost);
  }

  recompute({ silent: true });
}

const CLAIM_TEXT = (base) => `В обычном наборе хватает калорий и растительного белка: крупа и макароны дают их много на каждый рубль. Животного белка — из рыбы, мяса, молока — в нём ${base.days.anim > 0 ? 'мало' : 'нет совсем'}, а в продуктовой помощи его обычно не хватает сильнее всего. Поэтому список собран так, чтобы его было больше. Крупа и макароны в коробе тоже пригодятся: этот список о том, что к ним добавить.`;

/** Абзац о том, чего мало в обычном наборе, говорим, только если данные это показывают. */
function claimHolds(base) {
  return base.days.anim < base.days.kcal && base.days.anim < base.days.prot;
}

function detailsLine(r, base) {
  return `Калории: ${daysText(r.days.kcal)} у этого списка и ${daysText(base.days.kcal)} у обычного набора. ` +
    `Белок: ${daysText(r.days.prot)} и ${daysText(base.days.prot)}. Животный белок: ${daysText(r.days.anim)} и ${daysText(base.days.anim)}.`;
}

function canShare() {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function' && window.matchMedia('(pointer: coarse)').matches;
}

/** Проверка своей суммы: целые рубли в диапазоне. */
export function validateSum(raw, cfg, s) {
  const str = String(raw ?? '').replace(/[\s  ]/g, '').replace(/₽|руб\.?$/i, '');
  if (!/^\d+$/.test(str)) return { ok: false, kind: 'nan', text: 'Введите сумму цифрами, например 250.' };
  const value = Number(str);
  if (value < cfg.min) return { ok: false, kind: 'min', value, text: `Минимальная сумма — ${rub0(cfg.min)}.` };
  if (value > cfg.max) {
    return { ok: false, kind: 'max', value, text: s === 'korob' ? `В коробе считаем суммы до ${rub0(cfg.max)}. Для больших сумм есть расчёт наборов.` : `Максимальная сумма — ${rub0(cfg.max)}.` };
  }
  return { ok: true, value };
}
