# RuSender: дашборд-обзор аккаунта

**Версия:** 1.15.0 · **Лицензия:** MIT · Требует подключённого MCP-коннектора
[RuSender](https://rusender.ru/features/email/mcp/)

Собирает визуальный дашборд-обзор аккаунта RuSender: здоровье базы контактов, объёмы отправок, инфраструктура (домены, отправители, ключи, вебхуки, списки, сегменты, шаблоны, цепочки), лучшие отдельные рассылки и фактические проблемы конфигурации.

## Установка

```bash
cp -r rusender-account-report ~/.claude/skills/      # Claude Code, личные навыки
cp -r rusender-account-report .claude/skills/        # Claude Code, навыки проекта
```

Для claude.ai запакуйте папку в ZIP и загрузите в `Settings → Capabilities → Skills`.
Готовый архив: [rusender-account-report.zip](https://rusender.ru/wp-content/uploads/2026/08/rusender-account-report.zip)

## Как вызвать

Навык срабатывает сам, когда запрос попадает в его сценарий. Можно вызвать и явно:
`/rusender-account-report`.

Подробная инструкция с примерами:
https://rusender.ru/features/email/mcp/skill-account-analyst/

## Что внутри

```
rusender-account-report/
├── SKILL.md
├── assets/dashboard-template.html
├── references/palette.md
```

Полный сценарий работы и правила оформления — в [SKILL.md](SKILL.md).
