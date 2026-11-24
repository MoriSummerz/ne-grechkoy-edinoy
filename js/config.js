// Единственное место с адресом сайта. После публикации поменять здесь и перегенерировать QR:
//   node tools-site/make-qr.mjs
export const SITE_URL = 'https://morisummerz.github.io/ne-grechkoy-edinoy/';

// Адрес репозитория выводится из адреса GitHub Pages: https://<владелец>.github.io/<репозиторий>/.
const m = SITE_URL.match(/^https:\/\/([^.]+)\.github\.io\/([^/]+)\/?/);
export const REPO_URL = m ? `https://github.com/${m[1]}/${m[2]}` : SITE_URL;

// Короб и один набор — до 3 000 ₽: дороже по правилам (8 товаров, до 3 штук каждого) почти ничего не добавить,
// и деньги остались бы непотраченными. Для больших сумм — расчёт нескольких наборов.
export const VIEWS = {
  korob: { presets: [150, 300, 500], def: 300, min: 50, max: 3000 },
  nedelya: { presets: [1000, 2000, 3000], def: 2000, min: 300, max: 10000 },
  nabory: { def: 50000, min: 1000, max: 10000000, defN: 100, minN: 1, maxN: 10000, defAdd: 100, maxPerSet: 3000 },
};
