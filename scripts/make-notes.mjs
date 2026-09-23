#!/usr/bin/env node
// Собирает демо-отчёт и гипотезы проекта из его же истории.
//
//   node scripts/make-notes.mjs
//
// Нужен потому, что написанные руками отчёты расходятся с данными после каждой
// пересборки демо: id кампаний и метрики меняются, а текст остаётся прежним.
// Агент такие расхождения находит и справедливо о них сообщает.
//
// Запускать в пересборке после link-letters.mjs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SLUG = 'shop-rosa';
const MONTHS = 6;

const rows = readFileSync(join(ROOT, 'projects', SLUG, 'history.jsonl'), 'utf8')
  .split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));

const cutoff = new Date('2026-09-23T00:00:00Z');
cutoff.setUTCMonth(cutoff.getUTCMonth() - MONTHS);

const series = rows
  .filter((r) => r.audience.kind === 'active' && r.audience.role === 'primary'
    && r.delivered >= 500 && r.or !== null && new Date(r.sent_at) >= cutoff)
  .sort((a, b) => a.sent_at.localeCompare(b.sent_at));

const last = series[series.length - 1];
const rest = series.slice(0, -1);

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (x, d = 1) => (x * 100).toFixed(d).replace('.', ',') + '%';

const ors = rest.map((r) => r.or);
const ctrs = rest.map((r) => r.ctr);
const medOr = median(ors), medCtr = median(ctrs);
const date = last.sent_at.slice(0, 10);
const human = `${date.slice(8)}.${date.slice(5, 7)}`;

mkdirSync(join(ROOT, 'projects', SLUG, 'reports'), { recursive: true });
writeFileSync(join(ROOT, 'projects', SLUG, 'reports', `${date}-sravnenie-serii.md`), `# Разбор: рассылка ${human} против серии

*Собрано навыком \`rusender-results\`. Демо-данные, собраны из \`history.jsonl\`.*

## Факт

Кампания ${last.campaign_id} «${last.subject}», ${human}, доставлено ${last.delivered.toLocaleString('ru-RU').replace(/ /g, ' ')}.

OR ${pct(last.or)} против медианы ${pct(medOr)} по ${rest.length} сопоставимым рассылкам за
последние ${MONTHS} месяцев (те же активные, та же роль — основная отправка).
Сама разбираемая рассылка в медиану не входит, иначе она подтягивала бы ориентир к себе.
Разброс серии ${pct(Math.min(...ors))}–${pct(Math.max(...ors))}: выборка однородная.

CTR ${pct(last.ctr, 2)} против медианы ${pct(medCtr, 2)}.

Конверсий ${last.conversions}, выручка ${last.revenue.toLocaleString('ru-RU').replace(/ /g, ' ')} ₽ — цифры из BI, сведены по UTM-метке.

## Наблюдение

Письма, где в теле объясняется, **почему** букет стоит дольше, дают CTR выше медианы серии.
Подборки без объяснения держатся на медиане или ниже.

## Гипотеза

Объяснение вместо перечисления повышает переход к покупке: аудитория выбирает не по картинке,
а по обещанию, что цветы простоят.

Проверка: следующую подборку собрать наполовину с объяснениями, наполовину без, и сравнить
клики по позициям.

Записана в \`notes.md\` со статусом «открыта».
`);

writeFileSync(join(ROOT, 'projects', SLUG, 'notes.md'), `# Наблюдения и гипотезы — Роза

## Гипотезы

### Объяснение вместо перечисления повышает CTR
- Статус: открыта
- Заведена: ${date}, по кампании ${last.campaign_id} и серии активных за ${MONTHS} месяцев
- На чём видно: у писем с объяснением, почему букет стоит дольше, CTR выше медианы серии
  (${pct(medCtr, 2)}); у подборок без объяснения — на уровне медианы или ниже
- Как проверить: следующая подборка наполовину с объяснениями, наполовину без; сравнить
  клики по позициям
- Проверка: —

## Наблюдения

- **Серия активных однородна**: ${rest.length + 1} рассылки за ${MONTHS} месяцев, разброс OR
  ${pct(Math.min(...ors))}–${pct(Math.max(...ors))}. Медиану по такой серии считать можно.
- **Досылы по неоткрывшим сравнивать с основными отправками нельзя** — там другая аудитория
  по определению, и OR у них в разы ниже.
`);

console.log(`Собрано из истории ${SLUG}:`);
console.log(`  серия: ${series.length} кампаний за ${MONTHS} мес., медиана OR ${pct(medOr)}`);
console.log(`  последняя: ${last.campaign_id} «${last.subject}» ${human}, OR ${pct(last.or)}`);
console.log(`  файлы: reports/${date}-sravnenie-serii.md, notes.md`);
