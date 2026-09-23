#!/usr/bin/env node
// Проставляет демо-проектам конверсии и выручку.
//
//   node scripts/add-conversions.mjs
//
// В реальности эти поля приходят из BI и сопоставляются с кампанией по utm_campaign —
// сам агент к BI не подключён и добыть их не может. Здесь они синтезируются, чтобы демо
// показывало полную картину.
//
// Запускать после make-demo.mjs и anonymize.mjs: они перезаписывают history.jsonl.
//
// Проектов без продаж скрипт не трогает: у медиа с рекламной моделью конверсий нет вовсе,
// и это нормальное состояние, а не пробел в данных.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// средний чек в рублях и доля кликов, доходящая до покупки
const MODEL = {
  'shop-rosa':       { check: 3500,  rate: [0.10, 0.18], unit: 'заказ' },
  'food-bystro':     { check: 900,   rate: [0.14, 0.24], unit: 'заказ' },
  'game-pixelfox':   { check: 690,   rate: [0.06, 0.13], unit: 'покупка' },
  'travel-marshrut': { check: 5200,  rate: [0.02, 0.05], unit: 'бронирование, комиссия' },
  'school-lingvo':   { check: 18000, rate: [0.03, 0.07], unit: 'оплата курса' },
  'fitness-volna':   { check: 9500,  rate: [0.05, 0.11], unit: 'абонемент' },
  'clinic-vita':     { check: 4200,  rate: [0.07, 0.14], unit: 'запись на приём' },
  'saas-taskly':     { check: 2400,  rate: [0.04, 0.09], unit: 'подписка' },
  'fin-schet':       { check: 7900,  rate: [0.06, 0.12], unit: 'подписка' },
  'rusender':        { check: 3200,  rate: [0.05, 0.10], unit: 'подписка' },
  'logist-tochka':   { check: 84000, rate: [0.03, 0.08], unit: 'заявка' },
  // media-kontur намеренно отсутствует: рекламная модель, конверсий нет
};

function rng(seed) {
  let h = 2166136261;
  for (const ch of seed) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let touched = 0;
console.log(`${'проект'.padEnd(18)}${'кампаний'.padStart(9)}${'конверсий'.padStart(11)}${'выручка, ₽'.padStart(14)}`);

for (const [slug, m] of Object.entries(MODEL)) {
  const path = join(ROOT, 'projects', slug, 'history.jsonl');
  if (!existsSync(path)) continue;
  const r = rng(slug + '-conversions');
  const out = [];
  let totalConv = 0, totalRev = 0, n = 0;

  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const row = JSON.parse(line);

    // тестовые отправки в деньги не конвертируются
    if (row.audience.role === 'test' || !row.click) {
      delete row.conversions; delete row.revenue;
      out.push(JSON.stringify(row));
      continue;
    }

    const rate = m.rate[0] + r() * (m.rate[1] - m.rate[0]);
    const conv = Math.round(row.click * rate);
    // средний чек гуляет ±25% от кампании к кампании
    const check = Math.round(m.check * (0.75 + r() * 0.5));
    const rev = conv * check;

    row.conversions = conv;
    row.revenue = rev;
    totalConv += conv; totalRev += rev; n++;
    out.push(JSON.stringify(row));
  }

  writeFileSync(path, out.join('\n') + '\n');
  touched++;
  const fmt = (x) => x.toLocaleString('ru-RU').replace(/ /g, ' ');
  console.log(`${slug.padEnd(18)}${String(n).padStart(9)}${fmt(totalConv).padStart(11)}${fmt(totalRev).padStart(14)}`);
}

console.log(`\nПроектов обработано: ${touched}`);
console.log('media-kontur пропущен намеренно: рекламная модель, конверсий нет.');
