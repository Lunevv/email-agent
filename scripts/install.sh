#!/usr/bin/env bash
# Ставит навыки агента в Claude Code.
#
#   ./scripts/install.sh            — симлинки (разработка): правка в репозитории видна сразу
#   ./scripts/install.sh --copy     — копии (обычная установка)
#   ./scripts/install.sh --project  — в .claude/skills текущей папки вместо ~/.claude/skills
#   ./scripts/install.sh --remove   — убрать установленное
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE=link; DEST="$HOME/.claude/skills"
for a in "$@"; do
  case "$a" in
    --copy) MODE=copy ;;
    --remove) MODE=remove ;;
    --project) DEST="$PWD/.claude/skills" ;;
    *) echo "Неизвестный аргумент: $a"; exit 1 ;;
  esac
done

mkdir -p "$DEST"
n=0
for dir in "$ROOT"/skills/*/; do
  name="$(basename "$dir")"
  target="$DEST/$name"
  case "$MODE" in
    remove) [[ -e "$target" || -L "$target" ]] && { rm -rf "$target"; echo "  убран  $name"; n=$((n+1)); } ;;
    link)   rm -rf "$target"; ln -s "${dir%/}" "$target"; echo "  ссылка $name"; n=$((n+1)) ;;
    copy)   rm -rf "$target"; cp -R "${dir%/}" "$target"; echo "  копия  $name"; n=$((n+1)) ;;
  esac
done

echo
case "$MODE" in
  remove) echo "Убрано навыков: $n из $DEST" ;;
  link)   echo "Связано навыков: $n → $DEST"
          echo "Правки в репозитории подхватываются новой сессией без переустановки." ;;
  copy)   echo "Установлено навыков: $n → $DEST" ;;
esac
