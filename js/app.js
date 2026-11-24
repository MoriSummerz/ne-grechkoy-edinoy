// Точка входа index.html: читаем адрес, грузим данные, показываем нужный вид.
import { loadData } from './data.js';
import { readParams, markNav, fillFooter } from './shell.js';
import { h } from './dom.js';
import { mountList } from './lists.js';

const TITLES = {
  korob: 'Что положить в короб «Корзины доброты» — Не гречкой единой',
  nedelya: 'Покупки на неделю по сертификату — Не гречкой единой',
  nabory: 'Состав продуктовых наборов — Не гречкой единой',
};

async function main() {
  const params = readParams();
  document.title = TITLES[params.s];
  markNav(params.s);
  const root = document.getElementById('app');
  root.setAttribute('aria-busy', 'true');
  let data;
  try {
    data = await loadData();
  } catch (e) {
    root.removeAttribute('aria-busy');
    root.replaceChildren(h('div', { class: 'state', role: 'alert' },
      h('p', null, 'Не загрузился каталог товаров. Проверьте интернет и обновите страницу.'),
      h('button', { type: 'button', class: 'btn', onclick: () => location.reload() }, 'Обновить страницу')));
    console.warn(e);
    return;
  }
  fillFooter(data);
  root.removeAttribute('aria-busy');
  if (params.s === 'nabory') {
    const { mountNabory } = await import('./nabory.js');
    mountNabory(root, data, params);
  } else {
    mountList(root, data, params);
  }
}

main();
