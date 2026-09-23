#!/usr/bin/env node
// Генерирует транзакционные письма демо-проекта: keys.md и transactional.jsonl.
//
//   node scripts/make-transactional.mjs
//
// Форма данных снята с настоящего аккаунта RuSender (ключи, статусы, распределение
// доставки и открытий), содержимое вымышленное. Адреса получателей не сохраняются
// намеренно — см. data-layout.md.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TODAY = new Date('2026-09-23T14:00:00Z');

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

const SPEC = {
  slug: 'food-bystro',
  domain: 'bystro-food.example',
  keys: [
    { id: 7412, name: 'prod — заказы', purpose: 'коды подтверждения, статусы заказа, чеки',
      share: 0.78, status: 'enabled' },
    { id: 7418, name: 'prod — аккаунт', purpose: 'регистрация, смена пароля, подтверждение почты',
      share: 0.19, status: 'enabled' },
    { id: 7431, name: 'dev — песочница', purpose: 'тестовые отправки разработки',
      share: 0.03, status: 'enabled' },
  ],
  // тема → как часто встречается и насколько активно её открывают
  subjects: {
    7412: [
      ['Код подтверждения: {code}', 0.26, 0.82, 0.04],
      ['Заказ №{order} принят', 0.24, 0.61, 0.09],
      ['Курьер выехал, заказ №{order}', 0.18, 0.55, 0.14],
      ['Заказ №{order} доставлен', 0.16, 0.44, 0.06],
      ['Чек по заказу №{order}', 0.10, 0.31, 0.03],
      ['Заказ №{order} отменён', 0.06, 0.58, 0.11],
    ],
    7418: [
      ['Подтвердите электронную почту', 0.42, 0.74, 0.46],
      ['Восстановление пароля', 0.33, 0.79, 0.52],
      ['Вход с нового устройства', 0.25, 0.66, 0.08],
    ],
    7431: [
      ['[test] Код подтверждения: {code}', 0.6, 0.2, 0.0],
      ['[test] Заказ №{order} принят', 0.4, 0.2, 0.0],
    ],
  },
  count: 420,       // писем в файле — последние сутки с небольшим
  hours: 30,
};

const r = rng(SPEC.slug + '-transactional');
const pick = (pairs) => {
  let roll = r(), acc = 0;
  for (const p of pairs) { acc += p[1]; if (roll <= acc) return p; }
  return pairs[pairs.length - 1];
};

function status(openRate, clickRate) {
  const x = r();
  if (x < 0.019) return r() < 0.7 ? 'error' : (r() < 0.6 ? 'hard_bounced' : 'soft_bounced');
  const y = r();
  if (y < clickRate) return 'clicked';
  if (y < openRate) return 'opened';
  if (r() < 0.004) return 'complaint';
  return 'delivered';
}

const rows = [];
let id = 88230000 + Math.floor(r() * 9000);
for (let i = 0; i < SPEC.count; i++) {
  let roll = r(), acc = 0, key = SPEC.keys[0];
  for (const k of SPEC.keys) { acc += k.share; if (roll <= acc) { key = k; break; } }
  const [tpl, , openRate, clickRate] = pick(SPEC.subjects[key.id]);
  const subject = tpl
    .replace('{code}', String(1000 + Math.floor(r() * 8999)))
    .replace('{order}', String(48000 + Math.floor(r() * 900)));
  const t = new Date(TODAY.getTime() - r() * SPEC.hours * 3600 * 1000);
  rows.push({
    id: id++, key_id: key.id,
    created_at: t.toISOString().replace(/\.\d+Z$/, 'Z'),
    status: status(openRate, clickRate),
    subject,
  });
}
rows.sort((a, b) => b.created_at.localeCompare(a.created_at));

const dir = join(ROOT, 'projects', SPEC.slug);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'transactional.jsonl'),
  rows.map((x) => JSON.stringify(x)).join('\n') + '\n');

const byKey = {};
for (const x of rows) (byKey[x.key_id] ??= []).push(x);
const pct = (n, d) => d ? (n / d * 100).toFixed(1).replace('.', ',') + '%' : '—';

const table = SPEC.keys.map((k) => {
  const g = byKey[k.id] || [];
  return `| ${k.id} | ${k.name} | ${SPEC.domain} | ${k.purpose} | ${k.status} |`;
}).join('\n');

const stats = SPEC.keys.map((k) => {
  const g = byKey[k.id] || [];
  const ok = g.filter((x) => !['error', 'hard_bounced', 'soft_bounced'].includes(x.status));
  const opened = g.filter((x) => ['opened', 'clicked'].includes(x.status)).length;
  const clicked = g.filter((x) => x.status === 'clicked').length;
  const err = g.length - ok.length;
  return `| ${k.id} | ${g.length} | ${pct(ok.length, g.length)} | ${pct(opened, ok.length)} | ${pct(clicked, ok.length)} | ${err} |`;
}).join('\n');

writeFileSync(join(dir, 'keys.md'), `---
schema: 2
demo: true
updated: 2026-09-23
---

# Транзакционные ключи — Быстро

Демо-данные. Форма снята с настоящего аккаунта RuSender, содержимое вымышленное.

## Ключи

| id | Имя | Домен | Назначение | Статус |
|---|---|---|---|---|
${table}

## За последние сутки

| Ключ | Писем | Доставка | Открытий | Кликов | Ошибок |
|---|---|---|---|---|---|
${stats}

Открытия и клики считаются от доставленных.

## Что важно помнить

Транзакционные письма **не считаются рассылками** и в частотный лимит проекта не входят: человек
сам их спровоцировал, оформив заказ или запросив код.

Их нельзя смешивать с маркетинговыми в одном отчёте. Код подтверждения открывают в 80% случаев —
это не заслуга письма, это необходимость. Сравнивать такой OR с рассылкой по меню бессмысленно.

В \`transactional.jsonl\` хранятся только id, дата, статус и тема. Адресов получателей там нет и
быть не должно.
`);

console.log(`Готово: projects/${SPEC.slug}`);
console.log(`  ключей: ${SPEC.keys.length}, писем: ${rows.length}`);
for (const k of SPEC.keys) {
  const g = byKey[k.id] || [];
  const opened = g.filter((x) => ['opened', 'clicked'].includes(x.status)).length;
  console.log(`  ${String(k.id).padEnd(6)} ${k.name.padEnd(22)} писем ${String(g.length).padStart(3)}  открытий ${pct(opened, g.length)}`);
}
