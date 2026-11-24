import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLine, parseList, parseWeight, matchItem } from '../js/paste.js';

const items = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url))).items;

test('количество в строке', () => {
  assert.deepEqual(parseLine('Макароны 450 г — 2'), { text: 'Макароны 450 г — 2', name: 'Макароны 450 г', qty: 2 });
  assert.equal(parseLine('Гречка - 3').qty, 3);
  assert.equal(parseLine('Тушёнка x4').qty, 4);
  assert.equal(parseLine('Тушёнка × 4').qty, 4);
  assert.equal(parseLine('Сахар 1 кг 2 шт').qty, 2);
  assert.equal(parseLine('Сахар 1 кг').qty, 1, 'вес — не количество');
  assert.equal(parseLine('Масло подсолнечное').qty, 1);
});

test('вес из строки', () => {
  assert.equal(parseWeight('Макароны 450 г'), 450);
  assert.equal(parseWeight('Масло 0,9 л'), 900);
  assert.equal(parseWeight('Сахар 1кг'), 1000);
  assert.equal(parseWeight('Гречка'), null);
});

test('сопоставление с каталогом', () => {
  const g = matchItem('Гречка 900 г', items);
  assert.ok(g && /греч/i.test(g.name), g && g.name);
  const m = matchItem('Макароны 450 г', items);
  assert.ok(m && /макарон/i.test(m.name), m && m.name);
  assert.equal(matchItem('Пылесос Bosch', items), null);
  assert.equal(matchItem('', items), null);
  const list = parseList('Гречка — 2\n\nНепонятная штука\nЧай чёрный 25 пак — 1', items);
  assert.equal(list.length, 3);
  assert.equal(list[0].qty, 2);
  assert.equal(list[1].item, null);
  assert.ok(list[2].item && /чай/i.test(list[2].item.name));
});

test('списки, как их пишут на самом деле: «тушёнка», «2 банки», голое число в конце', () => {
  assert.equal(parseLine('Сайра 2 банки').qty, 2);
  assert.equal(parseLine('Консервы рыбные в томате 2').qty, 2);
  assert.equal(parseLine('Геркулес 500').qty, 1, 'голое число больше 50 — это не количество');
  assert.match(matchItem('Тушёнка говяжья 338 г', items).name, /Говядина.*тушен/i);
  assert.match(matchItem('Масло подсолнечное 1л', items).name, /1л/, 'литр в названии важнее массы масла в граммах');
  assert.match(matchItem('Макароны рожки 450 гр', items).name, /Рожки/);
});
