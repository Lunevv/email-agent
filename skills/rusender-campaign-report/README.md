# RuSender: дашборд-отчёт по рассылке (обычной)

**Версия:** 1.0.0 · **Лицензия:** MIT · Требует подключённого MCP-коннектора
[RuSender](https://rusender.ru/features/email/mcp/)

Собирает визуальный дашборд-отчёт по обычной (не A/B) рассылке RuSender: по id кампании тянет из MCP итоги, воронку, динамику открытий по дням, разбивку по почтовым системам, клики по ссылкам и панель доставляемости/рисков (ошибки, отписки, жалобы) — и публикует адаптивный HTML-артефакт.

## Установка

```bash
cp -r rusender-campaign-report ~/.claude/skills/      # Claude Code, личные навыки
cp -r rusender-campaign-report .claude/skills/        # Claude Code, навыки проекта
```

Для claude.ai запакуйте папку в ZIP и загрузите в `Settings → Capabilities → Skills`.
Готовый архив: [rusender-campaign-report.zip](https://rusender.ru/wp-content/uploads/2026/08/rusender-campaign-report.zip)

## Как вызвать

Навык срабатывает сам, когда запрос попадает в его сценарий. Можно вызвать и явно:
`/rusender-campaign-report`.

Подробная инструкция с примерами:
https://rusender.ru/features/email/mcp/skill-campaign-report/

## Что внутри

```
rusender-campaign-report/
├── SKILL.md
├── assets/dashboard-template.html
```

Полный сценарий работы и правила оформления — в [SKILL.md](SKILL.md).
