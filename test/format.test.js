import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysText, daysParts, plural, ITEM, PIECE, rub, rub0, dateLong, dateShort } from '../js/format.js';

const norm = (s) => s.replace(/[  ]/g, ' ');

test('дни: склонение и округление вниз', () => {
  assert.equal(daysText(1), '1 день');
  assert.equal(daysText(2), '2 дня');
  assert.equal(daysText(5), '5 дней');
  assert.equal(daysText(3.8), '3,8 дня');
  assert.equal(daysText(3.89), '3,8 дня', 'вниз, а не к ближайшему');
  assert.equal(daysText(1.04), '1 день');
  assert.equal(daysText(21), '21 день');
  assert.equal(daysText(10.9), '10 дней', 'от 10 — целое вниз');
  assert.equal(daysText(0.05), 'меньше 0,1 дня');
  assert.equal(daysText(0), '0 дней');
  assert.deepEqual(daysParts(3.8), { num: '3,8', unit: 'дня', value: 3.8, less: false });
});

test('счётные слова', () => {
  assert.equal(plural(1, ITEM), 'товар');
  assert.equal(plural(3, ITEM), 'товара');
  assert.equal(plural(5, ITEM), 'товаров');
  assert.equal(plural(11, ITEM), 'товаров');
  assert.equal(plural(22, ITEM), 'товара');
  assert.equal(plural(2, PIECE), 'штуки');
});

test('деньги и даты', () => {
  assert.equal(norm(rub(287.6)), '287,60 ₽');
  assert.equal(norm(rub(1250)), '1 250,00 ₽');
  assert.equal(norm(rub0(50000)), '50 000 ₽');
  assert.ok(rub(5).includes(' ₽'), 'неразрывный пробел перед ₽');
  assert.equal(dateLong('2026-10-07'), '7 октября 2026');
  assert.equal(dateShort('2026-10-07'), '07.10.2026');
});
