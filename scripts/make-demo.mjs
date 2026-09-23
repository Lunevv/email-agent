#!/usr/bin/env node
// Собирает демо-проекты из scripts/demo-spec.json: history.jsonl, lists.md, log.md, notes.md.
// PROFILE.md не трогает — профили пишутся руками, это читаемая часть демо.
// Конверсии и выручку не проставляет: они приходят из BI, их добавляет add-conversions.mjs.
//
//   node scripts/make-demo.mjs            — собрать всё
//   node scripts/make-demo.mjs shop-rosa  — только один проект
//
// Детерминированно: один и тот же seed даёт тот же результат, демо-набор воспроизводим.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const spec = JSON.parse(readFileSync(join(ROOT, 'scripts/demo-spec.json'), 'utf8'));
const only = process.argv[2];
const TODAY = new Date('2026-09-23T00:00:00Z');

function rngFor(seedStr) {
  let h = 2166136261;
  for (const ch of seedStr) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const fmt = (n) => n.toLocaleString('ru-RU').replace(/ /g, ' ');

let made = 0;
for (const p of spec.projects) {
  if (only && p.slug !== only) continue;
  const rnd = rngFor(p.slug);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);

  const dir = join(ROOT, 'projects', p.slug);
  for (const sub of ['letters', 'templates', 'reports']) mkdirSync(join(dir, sub), { recursive: true });

  // --- история: идём от сегодня назад с шагом cadenceDays
  const rows = [];
  let cid = 100000 + Math.floor(rnd() * 40000);
  let tid = 400000 + Math.floor(rnd() * 40000);
  let cursor = new Date(TODAY);
  cursor.setUTCDate(cursor.getUTCDate() - 2);
  const until = new Date(TODAY);
  until.setUTCMonth(until.getUTCMonth() - p.months);

  while (cursor > until) {
    // аудитория по заданным долям. Неосновные языки не выбираются сами:
    // они уходят парой к основному, в тот же день — см. ниже.
    const pickable = p.audiences.filter((a) => !a.lang || a.lang === (p.primaryLang || 'ru'));
    const total = pickable.reduce((s, a) => s + a.share, 0);
    let roll = rnd() * total, acc = 0, aud = pickable[0];
    for (const a of pickable) { acc += a.share; if (roll <= acc) { aud = a; break; } }

    const reach = Math.round(aud.size * aud.activeShare * between(0.92, 1.0));
    const orRate = between(aud.or[0], aud.or[1]);
    const ctorRate = between(aud.ctor[0], aud.ctor[1]);
    const delivered = Math.round(reach * between(0.975, 0.995));
    const open = Math.round(delivered * orRate);
    const click = Math.round(open * ctorRate);
    const d = new Date(cursor);
    const subjKey = aud.lang && aud.lang !== 'ru' ? `${aud.kind}.${aud.lang}` : aud.kind;
    const subject = pick(p.subjects[subjKey] || p.subjects[aud.kind] || ['Письмо']);

    const mk = (role, mult) => {
      const dl = Math.round(delivered * mult.d);
      const op = Math.round(dl * orRate * mult.or);
      const cl = Math.round(op * ctorRate * mult.ctor);
      const id = cid++;
      return {
        schema: 2, campaign_id: id, project: p.slug,
        name: `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCFullYear()).slice(2)} ${aud.alias} | ${subject}`,
        subject: role === 'followup'
          ? (aud.lang === 'en' ? `${subject} — you missed it` : `${subject} — вы не открыли`)
          : subject,
        sent_at: d.toISOString().replace(/\.\d+Z$/, 'Z'),
        as_of: TODAY.toISOString().replace(/\.\d+Z$/, 'Z'),
        audience: { list_ids: [aud.listId], segment_id: null, kind: aud.kind,
                    ...(aud.lang ? { lang: aud.lang } : {}), role,
                    recipients: Math.round(dl * between(1.005, 1.03)), excluded: null },
        delivered: dl, open: op, click: cl,
        unsub: Math.round(dl * between(0.0004, 0.0035)),
        complaint: Math.round(dl * between(0, 0.0004)),
        or: dl ? Number((op / dl).toFixed(4)) : null,
        ctr: dl ? Number((cl / dl).toFixed(4)) : null,
        ctor: op ? Number((cl / op).toFixed(4)) : null,
        template_id: tid++, letter: null, tags: ['regular'],
      };
    };

    rows.push(mk('primary', { d: 1, or: 1, ctor: 1 }));

    // тот же анонс на другом языке — в тот же день, отдельной кампанией
    for (const other of p.audiences) {
      if (!other.lang || other.lang === (p.primaryLang || 'ru')) continue;
      if (other.kind !== aud.kind) continue;
      const savedAud = aud;
      aud = other;
      const subjKeyOther = `${other.kind}.${other.lang}`;
      const subjOther = pick(p.subjects[subjKeyOther] || [subject]);
      const reachO = Math.round(other.size * other.activeShare * between(0.92, 1.0));
      const orO = between(other.or[0], other.or[1]);
      const ctorO = between(other.ctor[0], other.ctor[1]);
      const dlO = Math.round(reachO * between(0.975, 0.995));
      const opO = Math.round(dlO * orO);
      const clO = Math.round(opO * ctorO);
      rows.push({
        schema: 2, campaign_id: cid++, project: p.slug,
        name: `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCFullYear()).slice(2)} ${other.alias} | ${subjOther}`,
        subject: subjOther,
        sent_at: d.toISOString().replace(/\.\d+Z$/, 'Z'),
        as_of: TODAY.toISOString().replace(/\.\d+Z$/, 'Z'),
        audience: { list_ids: [other.listId], segment_id: null, kind: other.kind,
                    lang: other.lang, role: 'primary',
                    recipients: Math.round(dlO * between(1.005, 1.03)), excluded: null },
        delivered: dlO, open: opO, click: clO,
        unsub: Math.round(dlO * between(0.0004, 0.0035)),
        complaint: Math.round(dlO * between(0, 0.0004)),
        or: dlO ? Number((opO / dlO).toFixed(4)) : null,
        ctr: dlO ? Number((clO / dlO).toFixed(4)) : null,
        ctor: opO ? Number((clO / opO).toFixed(4)) : null,
        template_id: tid++, letter: null, tags: ['regular'],
      });
      aud = savedAud;
    }
    // досыл по неоткрывшим: аудитория меньше, открываемость в разы ниже
    if (rnd() < (p.followupShare || 0)) {
      const f = mk('followup', { d: 1 - orRate, or: 0.32, ctor: 0.8 });
      const fd = new Date(d); fd.setUTCDate(fd.getUTCDate() + 2);
      f.sent_at = fd.toISOString().replace(/\.\d+Z$/, 'Z');
      rows.push(f);
    }
    cursor.setUTCDate(cursor.getUTCDate() - Math.round(p.cadenceDays * between(0.7, 1.35)));
  }
  // Недавняя серия: несколько отправок по одной аудитории внутри частотного окна.
  // Нужна, чтобы в демо было на чём показать проверку пересечений — без неё
  // в последней неделе оказывается одна рассылка, и предупреждению не на что сработать.
  if (p.recentBurst) {
    const aud = p.audiences[p.recentBurst.audienceIndex || 0];
    for (const ago of p.recentBurst.daysAgo) {
      const d = new Date(TODAY);
      d.setUTCDate(d.getUTCDate() - ago);
      // выкидываем то, что генератор уже поставил на эту аудиторию в окне,
      // иначе получится каша из случайных и намеренных отправок
      const iso = d.toISOString().slice(0, 10);
      const reach = Math.round(aud.size * aud.activeShare * between(0.92, 1.0));
      const orR = between(aud.or[0], aud.or[1]);
      const ctorR = between(aud.ctor[0], aud.ctor[1]);
      const dl = Math.round(reach * between(0.975, 0.995));
      const op = Math.round(dl * orR);
      const cl = Math.round(op * ctorR);
      // тему берём ту, которой в окне ещё не было: два одинаковых заголовка
      // за три дня читаются как ошибка, а не как две рассылки
      const windowStart = new Date(TODAY);
      windowStart.setUTCDate(windowStart.getUTCDate() - 7);
      const usedRecently = new Set(rows
        .filter((r) => new Date(r.sent_at) >= windowStart)
        .map((r) => r.subject));
      const poolSubj = (p.subjects[aud.kind] || ['Письмо']).filter((x) => !usedRecently.has(x));
      const subj = p.recentBurst.subject
        || (poolSubj.length ? pick(poolSubj) : pick(p.subjects[aud.kind] || ['Письмо']));
      rows.push({
        schema: 2, campaign_id: cid++, project: p.slug,
        name: `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(2, 4)} ${aud.alias} | ${subj}`,
        subject: subj,
        sent_at: d.toISOString().replace(/\.\d+Z$/, 'Z'),
        as_of: TODAY.toISOString().replace(/\.\d+Z$/, 'Z'),
        audience: { list_ids: [aud.listId], segment_id: null, kind: aud.kind, role: 'primary',
                    recipients: Math.round(dl * between(1.005, 1.03)), excluded: null },
        delivered: dl, open: op, click: cl,
        unsub: Math.round(dl * between(0.0004, 0.0035)),
        complaint: Math.round(dl * between(0, 0.0004)),
        or: dl ? Number((op / dl).toFixed(4)) : null,
        ctr: dl ? Number((cl / dl).toFixed(4)) : null,
        ctor: op ? Number((cl / op).toFixed(4)) : null,
        template_id: tid++, letter: null, tags: ['regular'],
      });
    }
  }

  rows.sort((a, b) => a.sent_at.localeCompare(b.sent_at));
  writeFileSync(join(dir, 'history.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

  // --- lists.md
  const listRows = p.audiences.map((a) =>
    `| ${a.listId} | ${a.listName.replaceAll('|', '\\|')} | ${fmt(a.size)} | ${fmt(Math.round(a.size * a.activeShare))} | ${a.alias}${a.lang ? ' · ' + a.lang : ''} | ${(a.variables || []).join(', ') || '—'} |`
  ).join('\n');
  writeFileSync(join(dir, 'lists.md'), `---
schema: 2
demo: true
updated: 2026-09-23
---

# Аудитории проекта ${p.name}

Демо-данные. Контактов здесь нет и быть не должно — агент берёт их из сервиса в момент работы.

## Списки

| id | Имя | Контактов | Активных | Как называем | Переменные |
|---|---|---|---|---|---|
${listRows}

**Охват считается от активных**, а не от размера списка: отписавшиеся и недоступные адреса письмо
не получат, но в \`contactsCount\` они есть.

Колонка «Переменные» — поля, которые реально есть в списке. Подстановка, которой в колонке нет,
на отправке превратится в пустоту: preflight это ловит и останавливает.

## Частота

Профиль ограничивает отправки: не больше ${p.cap.sends} за ${p.cap.days} дней по одной аудитории.
Preflight проверяет это по истории и предлагает сегмент-исключение, если лимит выбран.
`);

  // --- log.md
  const last = rows.slice(-4);
  writeFileSync(join(dir, 'log.md'), `# Лог действий по проекту ${p.name}

## 2026-09-23
- 10:00 bootstrap — профиль заведён, аудиторий: ${p.audiences.length}
- 10:01 bootstrap — \`lists.md\` собран из списков проекта
- 10:02 bootstrap — \`history.jsonl\`: ${rows.length} кампаний за ${p.months} мес.
${last.map((r) => `- 10:0${last.indexOf(r) + 3} rusender-results — снимок по ${r.campaign_id}, OR ${(r.or * 100).toFixed(1).replace('.', ',')}%`).join('\n')}
`);

  if (!existsSync(join(dir, 'notes.md'))) {
    writeFileSync(join(dir, 'notes.md'), `# Наблюдения и гипотезы — ${p.name}

## Гипотезы

Пока пусто. Гипотезы появляются после разбора рассылок навыком \`rusender-results\`.
`);
  }

  const prim = rows.filter((r) => r.audience.role === 'primary');
  console.log(`  ${p.slug.padEnd(17)} кампаний ${String(rows.length).padStart(3)}  основных ${String(prim.length).padStart(3)}  досылов ${String(rows.length - prim.length).padStart(2)}  аудиторий ${p.audiences.length}`);
  made++;
}
console.log(`\nСобрано проектов: ${made}`);
