# RuSender: дашборд-отчёт по A/B-тесту

**Версия:** 1.0.0 · **Лицензия:** MIT · Требует подключённого MCP-коннектора
[RuSender](https://rusender.ru/features/email/mcp/)

Собирает готовый визуальный дашборд-отчёт по A/B-тесту рассылки RuSender: по id кампании тянет из MCP всю статистику (итоги, воронку, варианты тем с победителем, разбивку по почтовым системам, матрицу «тема × провайдер», клики по ссылкам) и публикует красивый адаптивный HTML-артефакт для отчёта.

## Установка

```bash
cp -r rusender-ab-report ~/.claude/skills/      # Claude Code, личные навыки
cp -r rusender-ab-report .claude/skills/        # Claude Code, навыки проекта
```

Для claude.ai запакуйте папку в ZIP и загрузите в `Settings → Capabilities → Skills`.
Готовый архив: [rusender-ab-report.zip](https://rusender.ru/wp-content/uploads/2026/08/rusender-ab-report.zip)

## Как вызвать

Навык срабатывает сам, когда запрос попадает в его сценарий. Можно вызвать и явно:
`/rusender-ab-report`.

Подробная инструкция с примерами:
https://rusender.ru/features/email/mcp/skill-ab/

## Что внутри

```
rusender-ab-report/
├── SKILL.md
├── assets/dashboard-template.html
```

Полный сценарий работы и правила оформления — в [SKILL.md](SKILL.md).
