#!/usr/bin/env node
// Связывает письма в letters/ с кампаниями в history.jsonl.
//
//   node scripts/link-letters.mjs
//
// Ищет кампанию по теме письма (subject во фронтматтере), проставляет её id и дату
// в письмо и путь к письму в поле letter соответствующей строки истории.
//
// Запускать последним в пересборке демо: make-demo и anonymize переписывают id кампаний,
// и без этого связи рвутся.

import { readFileSync, writeFileSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { join, basename } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const projects = readdirSync(join(ROOT, 'projects'), { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name);

let linked = 0, missed = [];

for (const slug of projects) {
  const dir = join(ROOT, 'projects', slug);
  const histPath = join(dir, 'history.jsonl');
  const lettersDir = join(dir, 'letters');
  if (!existsSync(histPath) || !existsSync(lettersDir)) continue;

  const rows = readFileSync(histPath, 'utf8').split('\n')
    .filter((l) => l.trim()).map((l) => JSON.parse(l));
  for (const r of rows) delete r.letter;

  for (const file of readdirSync(lettersDir).filter((f) => f.endsWith('.md'))) {
    const path = join(lettersDir, file);
    let text = readFileSync(path, 'utf8');
    // черновики не связываются: они ещё не отправлялись, кампании в истории нет
    if (file.startsWith('DRAFT-') || /^status:\s*draft/m.test(text)) continue;

    const subj = (text.match(/^subject:\s*"?([^"\n]+?)"?\s*$/m) || [])[1];
    const lang = (text.match(/^lang:\s*(\S+)/m) || [])[1];
    if (!subj) { missed.push(`${slug}/${file}: нет subject`); continue; }

    const matches = rows.filter((r) =>
      r.subject === subj &&
      r.audience.role === 'primary' &&
      (!lang || (r.audience.lang || 'ru') === lang));

    if (!matches.length) { missed.push(`${slug}/${file}: «${subj}» не найдена в истории`); continue; }
    const row = matches[matches.length - 1];
    const date = row.sent_at.slice(0, 10);

    text = text.replace(/^campaign_id:.*$/m, `campaign_id: ${row.campaign_id}`)
               .replace(/^sent_at:.*$/m, `sent_at: ${date}`);

    // имя файла держим в соответствии с датой отправки
    const tail = basename(file).replace(/^\d{4}-\d{2}-\d{2}-/, '');
    const want = join(lettersDir, `${date}-${tail}`);
    writeFileSync(path, text);
    if (want !== path) renameSync(path, want);

    row.letter = `letters/${date}-${tail}`;
    linked++;
  }

  writeFileSync(histPath, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

console.log(`Связано писем: ${linked}`);
if (missed.length) {
  console.log('\nНе связаны:');
  for (const m of missed) console.log('  ' + m);
}
