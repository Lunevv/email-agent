#!/usr/bin/env node
// Сводка по всем проектам сразу: что ушло, как отработало, что требует внимания.
//
//   node overview.mjs                 — таблица для человека
//   node overview.mjs --json          — то же машиночитаемо
//   node overview.mjs --dir <путь>    — явно указать корень памяти
//
// Считает арифметику по файлам: медианы серий, окна частотных лимитов, возраст
// черновиков. Модели остаётся объяснить, что с этим делать.
//
// Ничего не меняет и в сеть не ходит.

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const AS_JSON = argv.includes('--json');
const dirArg = argv.indexOf('--dir');
const TODAY = new Date();

function memoryRoot() {
  if (dirArg !== -1 && argv[dirArg + 1]) return argv[dirArg + 1];
  for (const c of ['projects.live', 'projects']) if (existsSync(c)) return c;
  return null;
}

const root = memoryRoot();
if (!root) {
  console.error('Папки с проектами нет. Ожидались projects.live/ или projects/ в текущей папке.');
  process.exit(2);
}

const days = (a, b) => Math.round((a - b) / 86400000);
const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '');
    // frequency_cap пишут двумя способами: блоком и одной строкой
    const capBlock = line.match(/^\s+(sends|days):\s*(\d+)/);
    if (capBlock) out[`cap_${capBlock[1]}`] = Number(capBlock[2]);
    const capInline = line.match(/^frequency_cap:\s*\{[^}]*sends:\s*(\d+)[^}]*days:\s*(\d+)/);
    if (capInline) { out.cap_sends = Number(capInline[1]); out.cap_days = Number(capInline[2]); }
  }
  return out;
}

const report = [];

for (const slug of readdirSync(root).sort()) {
  const dir = join(root, slug);
  if (!statSync(dir).isDirectory()) continue;
  const profPath = join(dir, 'PROFILE.md');
  if (!existsSync(profPath)) continue;

  const prof = frontmatter(readFileSync(profPath, 'utf8'));
  const item = {
    slug, name: prof.name || slug, demo: prof.demo === 'true',
    lastSend: null, daysAgo: null, or: null, medianOr: null, seriesN: 0,
    flags: [],
  };

  // --- история
  const histPath = join(dir, 'history.jsonl');
  const rows = existsSync(histPath)
    ? readFileSync(histPath, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l))
    : [];
  const sent = rows.filter((r) => r.sent_at && r.audience?.role !== 'test')
    .sort((a, b) => a.sent_at.localeCompare(b.sent_at));

  if (sent.length) {
    const last = sent[sent.length - 1];
    item.lastSend = last.sent_at.slice(0, 10);
    item.daysAgo = days(TODAY, new Date(last.sent_at));
    item.subject = last.subject;
    item.or = last.or;

    // серия: те же kind + role + lang, за полгода, без самой разбираемой
    const cutoff = new Date(TODAY); cutoff.setMonth(cutoff.getMonth() - 6);
    const series = sent.filter((r) =>
      r.campaign_id !== last.campaign_id &&
      r.audience.kind === last.audience.kind &&
      r.audience.role === last.audience.role &&
      (r.audience.lang || 'ru') === (last.audience.lang || 'ru') &&
      r.delivered >= 500 && r.or !== null && new Date(r.sent_at) >= cutoff);
    const ors = series.map((r) => r.or);
    item.seriesN = series.length;
    item.medianOr = median(ors);
    if (ors.length >= 3) {
      const lo = Math.min(...ors), hi = Math.max(...ors);
      item.homogeneous = hi / lo < 2;
      if (!item.homogeneous) item.flags.push({ level: 'note', text: 'серия неоднородна, медиана слабый ориентир' });
      if (item.or !== null && item.medianOr && item.or < item.medianOr * 0.85) {
        item.flags.push({ level: 'warn', text: `OR ниже медианы серии на ${Math.round((1 - item.or / item.medianOr) * 100)}%` });
      }
    } else if (ors.length) {
      item.flags.push({ level: 'note', text: `сопоставимых рассылок всего ${ors.length}, сравнивать рано` });
    }

    // --- частотный лимит по спискам последней отправки
    const capDays = prof.cap_days || 7, capSends = prof.cap_sends || 2;
    const winStart = new Date(TODAY); winStart.setDate(winStart.getDate() - capDays);
    for (const listId of last.audience.list_ids || []) {
      const inWindow = sent.filter((r) => new Date(r.sent_at) >= winStart &&
        (r.audience.list_ids || []).includes(listId));
      if (inWindow.length >= capSends) {
        // сам по себе выбранный лимит — состояние, а не проблема: человек просто
        // недавно писал. Проблемой он становится, когда рядом лежит готовый черновик.
        item.capReached = { used: inWindow.length, of: capSends, days: capDays, listId };
      }
    }

    // --- пауза: сравниваем с обычным ритмом проекта
    const gaps = [];
    for (let i = 1; i < sent.length; i++) gaps.push(days(new Date(sent[i].sent_at), new Date(sent[i - 1].sent_at)));
    const typical = median(gaps.filter((g) => g > 0));
    if (typical && item.daysAgo > typical * 3 && item.daysAgo > 14) {
      item.flags.push({ level: 'warn', text: `пауза ${item.daysAgo} дн. при обычных ${Math.round(typical)}` });
    }
  } else {
    item.flags.push({ level: 'note', text: 'истории нет' });
  }

  // --- черновики
  const lettersDir = join(dir, 'letters');
  if (existsSync(lettersDir)) {
    for (const f of readdirSync(lettersDir)) {
      if (!f.startsWith('DRAFT-')) continue;
      const text = readFileSync(join(lettersDir, f), 'utf8');
      const created = (text.match(/^created_at:\s*(\S+)/m) || [])[1];
      const age = created ? days(TODAY, new Date(created)) : null;
      item.flags.push({ level: age !== null && age > 7 ? 'warn' : 'note',
        text: `черновик ${f}${age !== null ? `, ${age} дн.` : ''}` });
    }
  }

  // --- лимит: во что он превращается
  if (item.capReached) {
    const c = item.capReached;
    const hasDraft = item.flags.some((f) => f.text.startsWith('черновик'));
    item.flags.push({
      level: hasDraft ? 'warn' : 'note',
      text: hasDraft
        ? `черновик готов, но лимит выбран: ${c.used} из ${c.of} за ${c.days} дн.`
        : `лимит выбран: ${c.used} из ${c.of} за ${c.days} дн.`,
    });
  }

  // --- открытые гипотезы
  const notesPath = join(dir, 'notes.md');
  if (existsSync(notesPath)) {
    const open = (readFileSync(notesPath, 'utf8').match(/^- Статус:\s*открыта/gm) || []).length;
    if (open) item.flags.push({ level: 'note', text: `${open} открыт${open === 1 ? 'ая гипотеза' : 'ых гипотез'} без проверки` });
  }

  report.push(item);
}

// сортировка: сначала то, что требует внимания
const weight = (i) => i.flags.some((f) => f.level === 'warn') ? 0 : (i.flags.length ? 1 : 2);
report.sort((a, b) => weight(a) - weight(b) || (a.daysAgo ?? 9999) - (b.daysAgo ?? 9999));

if (AS_JSON) {
  console.log(JSON.stringify({ root, generatedAt: TODAY.toISOString(), projects: report }, null, 2));
} else {
  const pct = (x) => x === null || x === undefined ? '—' : (x * 100).toFixed(1).replace('.', ',') + '%';
  // ширина колонки под самое длинное имя, чтобы ничего не резалось посередине слова
  const short = (p) => p.name.split(/\s+[—-]\s+/)[0];
  const W = Math.max(12, ...report.map((p) => short(p).length));
  const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - String(s).length));

  console.log(`\nПамять: ${root}${report.some((p) => p.demo) ? '   демо-набор' : ''}`);
  console.log(`Проектов: ${report.length}   требуют внимания: ${report.filter((p) => p.flags.some((f) => f.level === 'warn')).length}\n`);
  console.log(pad('ПРОЕКТ', W + 2) + pad('ОТПРАВКА', 14) + pad('OR', 9) + pad('МЕДИАНА', 10) + 'СЕРИЯ');
  console.log('─'.repeat(W + 2 + 14 + 9 + 10 + 6));

  for (const p of report) {
    const when = p.daysAgo === null ? '—'
      : p.daysAgo === 0 ? 'сегодня' : p.daysAgo === 1 ? 'вчера' : `${p.daysAgo} дн. назад`;
    const warns = p.flags.filter((f) => f.level === 'warn');
    const notes = p.flags.filter((f) => f.level === 'note');
    const mark = warns.length ? '!' : ' ';
    console.log(mark + ' ' + pad(short(p), W) + pad(when, 14) + pad(pct(p.or), 9)
      + pad(pct(p.medianOr), 10) + (p.seriesN || '—'));
    for (const f of warns) console.log('    · ' + f.text);
    for (const f of notes) console.log('      ' + f.text);
    if (warns.length || notes.length) console.log('');
  }
}
