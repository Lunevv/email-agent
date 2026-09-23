#!/usr/bin/env node
// Делает из боевой папки проекта демо-версию: те же формы, другие цифры.
//
//   node scripts/anonymize.mjs projects.live/rusender projects/rusender
//   node scripts/anonymize.mjs projects.live/rusender projects/rusender --seed 42
//
// Что меняется: id (кампаний, списков, шаблонов, отправителя), размеры баз, все метрики.
// Что остаётся: структура файлов, названия, даты, тексты, соотношения между метриками.
// Конверсии и выручку не трогает — их проставляет add-conversions.mjs после.
//
// Генератор детерминированный: одинаковый seed даёт одинаковый результат, поэтому
// демо-набор воспроизводим и его не надо вычитывать заново после каждого прогона.
//
// ВАЖНО: цифры внутри прозы (в PROFILE.md, lists.md, log.md) скрипт не трогает —
// он их находит и печатает списком, чтобы вы прошли по ним глазами.

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const [src, dst, ...rest] = process.argv.slice(2);
if (!src || !dst) {
  console.error('Использование: node scripts/anonymize.mjs <откуда> <куда> [--seed N]');
  process.exit(2);
}
const seedArg = rest.indexOf('--seed');
const SEED = seedArg !== -1 ? Number(rest[seedArg + 1]) : 20260923;

// --- детерминированный генератор (mulberry32)
let _s = SEED >>> 0;
const rnd = () => {
  _s |= 0; _s = (_s + 0x6D2B79F5) | 0;
  let t = Math.imul(_s ^ (_s >>> 15), 1 | _s);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rnd() * (b - a);
const jitter = (v, pct) => Math.max(1, Math.round(v * between(1 - pct, 1 + pct)));

// --- карта id: одинаковый старый id всегда даёт один и тот же новый
const maps = new Map();
function remap(kind, id) {
  if (id === null || id === undefined) return id;
  if (!maps.has(kind)) maps.set(kind, new Map());
  const m = maps.get(kind);
  if (!m.has(id)) {
    const base = { campaign: 200000, list: 50000, template: 300000, sender: 9000, segment: 20000 }[kind] ?? 1000;
    m.set(id, base + Math.floor(between(100, 9000)));
  }
  return m.get(id);
}

mkdirSync(dst, { recursive: true });
for (const sub of ['letters', 'templates', 'reports']) mkdirSync(join(dst, sub), { recursive: true });

// --- history.jsonl: id и метрики
let histCount = 0;
const histPath = join(src, 'history.jsonl');
if (existsSync(histPath)) {
  const out = [];
  for (const line of readFileSync(histPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    r.campaign_id = remap('campaign', r.campaign_id);
    r.template_id = remap('template', r.template_id);
    const a = r.audience;
    a.list_ids = (a.list_ids || []).map((i) => remap('list', i));
    a.segment_id = remap('segment', a.segment_id);

    // метрики: двигаем доставку, потом пересобираем всё от неё, сохраняя правдоподобие
    const delivered = jitter(r.delivered || 0, 0.25);
    const orRate = r.or === null ? null : Math.min(0.95, Math.max(0.005, r.or * between(0.8, 1.25)));
    const ctorRate = r.ctor === null ? null : Math.min(0.6, Math.max(0.002, r.ctor * between(0.75, 1.3)));
    const open = orRate === null ? 0 : Math.round(delivered * orRate);
    const click = ctorRate === null ? 0 : Math.round(open * ctorRate);

    a.recipients = Math.round(delivered * between(1.005, 1.03));
    if (a.excluded) a.excluded = jitter(a.excluded, 0.3);
    r.delivered = delivered;
    r.open = open;
    r.click = click;
    r.unsub = Math.round(delivered * between(0.0005, 0.004));
    r.complaint = Math.round(delivered * between(0, 0.0004));
    r.or = delivered ? Number((open / delivered).toFixed(4)) : null;
    r.ctr = delivered ? Number((click / delivered).toFixed(4)) : null;
    r.ctor = open ? Number((click / open).toFixed(4)) : null;
    out.push(JSON.stringify(r));
    histCount++;
  }
  writeFileSync(join(dst, 'history.jsonl'), out.join('\n') + '\n');
}

// --- текстовые файлы: подменяем известные id, помечаем demo, остальное оставляем
const numbersToReview = [];
for (const name of ['PROFILE.md', 'lists.md', 'notes.md', 'log.md']) {
  const p = join(src, name);
  if (!existsSync(p)) continue;
  let t = readFileSync(p, 'utf8');

  // id отправителя во фронтматтере профиля
  t = t.replace(/^(\s*id:\s*)(\d+)$/m, (_, pre, id) => pre + remap('sender', Number(id)));

  // подменяем те id, что уже встречались в истории — чтобы файлы остались согласованными
  for (const [kind, m] of maps) {
    for (const [oldId, newId] of m) {
      t = t.replaceAll(String(oldId), String(newId));
    }
  }
  if (name === 'PROFILE.md' && !/^demo:\s*true/m.test(t)) {
    t = t.replace(/^schema:\s*(\d+)$/m, 'schema: $1\ndemo: true');
    t = t.replace(/^---\n/, '---\n');
  }
  writeFileSync(join(dst, name), t);

  // что осталось из чисел — на ручной просмотр
  t.split('\n').forEach((line, i) => {
    const m = line.match(/\b\d[\d\s]{3,}\b/g);
    if (m) numbersToReview.push(`${name}:${i + 1}  ${line.trim().slice(0, 96)}`);
  });
}

// --- вложенные папки копируем как есть
for (const sub of ['letters', 'templates']) {
  const from = join(src, sub);
  if (!existsSync(from)) continue;
  for (const f of readdirSync(from)) {
    if (statSync(join(from, f)).isFile()) copyFileSync(join(from, f), join(dst, sub, f));
  }
}

console.log(`Готово: ${src} → ${dst}`);
console.log(`  seed: ${SEED} (тот же seed — тот же результат)`);
console.log(`  кампаний в истории: ${histCount}`);
for (const [kind, m] of maps) console.log(`  переназначено ${kind}: ${m.size}`);

if (numbersToReview.length) {
  console.log(`\nЧисла в прозе, которые скрипт НЕ менял — просмотрите глазами (${numbersToReview.length}):`);
  for (const l of numbersToReview.slice(0, 25)) console.log('  ' + l);
  if (numbersToReview.length > 25) console.log(`  … и ещё ${numbersToReview.length - 25}`);
}
