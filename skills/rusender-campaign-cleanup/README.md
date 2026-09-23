# RuSender: наводим порядок в рассылках

**Версия:** 1.0.0 · **Лицензия:** MIT · Требует подключённого MCP-коннектора
[RuSender](https://rusender.ru/features/email/mcp/)

Наводит порядок в списке рассылок RuSender: спрашивает у пользователя, что именно убрать в архив — заблокированные системой рассылки, отклонённые модератором или и то, и другое, — находит подходящие кампании, показывает их списком и после подтверждения архивирует.

## Установка

```bash
cp -r rusender-campaign-cleanup ~/.claude/skills/      # Claude Code, личные навыки
cp -r rusender-campaign-cleanup .claude/skills/        # Claude Code, навыки проекта
```

Для claude.ai запакуйте папку в ZIP и загрузите в `Settings → Capabilities → Skills`.
Готовый архив: [rusender-campaign-cleanup.zip](https://rusender.ru/wp-content/uploads/2026/08/rusender-campaign-cleanup.zip)

## Как вызвать

Навык срабатывает сам, когда запрос попадает в его сценарий. Можно вызвать и явно:
`/rusender-campaign-cleanup`.

Подробная инструкция с примерами:
https://rusender.ru/features/email/mcp/skill-cleanup/

## Что внутри

```
rusender-campaign-cleanup/
├── SKILL.md
├── references/statuses.md
```

Полный сценарий работы и правила оформления — в [SKILL.md](SKILL.md).
