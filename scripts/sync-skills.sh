#!/usr/bin/env bash
# Тянет готовые навыки RuSender из upstream в skills/ и фиксирует версии в SKILLS.lock.
#
#   ./scripts/sync-skills.sh          — показать, что изменилось (ничего не трогает)
#   ./scripts/sync-skills.sh --apply  — обновить копии и переписать SKILLS.lock
#
# Наши собственные навыки (см. OWN ниже) не трогаются никогда.
set -euo pipefail

REPO="Rusender/rusender-mcp"
BRANCH="master"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK="$ROOT/SKILLS.lock"
APPLY=0
[[ "${1:-}" == "--apply" ]] && APPLY=1

OWN=(rusender-agent rusender-preflight rusender-results)
is_own() { local n="$1"; for o in "${OWN[@]}"; do [[ "$o" == "$n" ]] && return 0; done; return 1; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "Источник: https://github.com/$REPO ($BRANCH)"
# git ls-remote вместо REST API: не упирается в лимит анонимных запросов и не требует токена
SHA="$(git ls-remote "https://github.com/$REPO.git" "refs/heads/$BRANCH" | cut -f1)"
[[ -n "$SHA" ]] || { echo "Не удалось получить коммит $BRANCH в $REPO"; exit 1; }
echo "Коммит:   $SHA"
echo

curl -fsSL "https://codeload.github.com/$REPO/tar.gz/$SHA" | tar -xz -C "$TMP"
SRC="$TMP/$(basename "$REPO")-$SHA/skills"
[[ -d "$SRC" ]] || { echo "Не нашёл skills/ в архиве"; exit 1; }

changed=0; added=0; same=0
{ [[ $APPLY -eq 1 ]] && printf '# Навыки, скопированные из %s\n# Обновляется через scripts/sync-skills.sh --apply\ncommit %s\nsynced %s\n\n' "$REPO" "$SHA" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$LOCK"; } || true

for dir in "$SRC"/*/; do
  name="$(basename "$dir")"
  if is_own "$name"; then echo "  пропуск $name (наш навык)"; continue; fi
  dest="$ROOT/skills/$name"
  if [[ ! -d "$dest" ]]; then
    state="НОВЫЙ"; added=$((added+1))
  elif diff -rq "$dir" "$dest" >/dev/null 2>&1; then
    state="без изменений"; same=$((same+1))
  else
    state="ИЗМЕНИЛСЯ"; changed=$((changed+1))
  fi
  printf '  %-34s %s\n' "$name" "$state"
  if [[ $APPLY -eq 1 ]]; then
    rm -rf "$dest"; mkdir -p "$dest"; cp -R "$dir." "$dest/"
    ver="$(grep -m1 -E '^\s*version:' "$dest/SKILL.md" 2>/dev/null | sed 's/.*version:[[:space:]]*//' || true)"
    printf '%s %s\n' "$name" "${ver:-—}" >> "$LOCK"
  fi
done

echo
if [[ $APPLY -eq 1 ]]; then
  echo "Обновлено. Новых: $added, изменившихся: $changed, без изменений: $same. Версии — в SKILLS.lock."
else
  echo "Новых: $added, изменившихся: $changed, без изменений: $same."
  [[ $((added+changed)) -gt 0 ]] && echo "Чтобы применить: ./scripts/sync-skills.sh --apply"
fi
