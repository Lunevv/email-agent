#!/usr/bin/env bash
# Проверка перед публикацией: не утекает ли наружу то, чего не должно.
#
#   ./scripts/check-release.sh
#
# Запускать перед каждым пушем в публичный репозиторий. Проверяет и рабочее
# дерево, и всю историю коммитов: данные, попавшие в коммит один раз, остаются
# в истории навсегда, даже если файл потом удалить.
set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
fail=0
say() { printf '\n%s\n' "$1"; }
bad() { echo "  ПРОВАЛ: $1"; fail=$((fail+1)); }
ok()  { echo "  ок: $1"; }

# Вендоренные навыки RuSender уже опубликованы в их репозитории — их демо-данные
# проверять не надо, это не наша утечка.
OURS='^(skills/rusender-(agent|preflight|results)/|scripts/|projects/|docs/|routines/|README|AGENTS|\.gitignore)'
ours() { git ls-files | grep -E "$OURS"; }

say "1. Боевые данные аккаунта"
if git ls-files | grep -q 'projects\.live'; then bad "projects.live в индексе"; else ok "нет в индексе"; fi
if git log --all --pretty=format: --name-only 2>/dev/null | sort -u | grep -q 'projects\.live'; then
  bad "projects.live встречается в истории коммитов — нужен git filter-repo"
else ok "нет в истории коммитов"; fi

say "2. Реальные адреса в наших файлах"
found=$(ours | xargs grep -ohE '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}' 2>/dev/null \
  | sort -u | grep -vE '\.(example|invalid|test|localhost)$|@example\.|john@doe|site@mail\.ru' || true)
if [ -n "$found" ]; then
  bad "адреса не на вымышленных доменах:"; echo "$found" | sed 's/^/      /'
else ok "только вымышленные домены"; fi

say "3. Ключи, токены, пароли"
keys=$(ours | xargs grep -nEi '(api[_-]?key|secret|token|password|bearer)\s*[:=]\s*["'"'"']?[A-Za-z0-9_\-]{12,}' 2>/dev/null || true)
if [ -n "$keys" ]; then bad "похоже на секрет:"; echo "$keys" | sed 's/^/      /' | head -5
else ok "не найдено"; fi

say "4. Демо-профили помечены как демо"
miss=$(for p in projects/*/PROFILE.md; do grep -Lq 'demo: true' "$p" 2>/dev/null && echo "$p"; done || true)
n=$(ls projects/*/PROFILE.md 2>/dev/null | wc -l | tr -d ' ')
d=$(grep -l 'demo: true' projects/*/PROFILE.md 2>/dev/null | wc -l | tr -d ' ')
if [ "$n" = "$d" ]; then ok "$d из $n"; else bad "$d из $n помечены demo: true"; fi

say "5. Персональные данные в файлах памяти"
pd=$(grep -rlE '"(toEmail|recipient|fromEmail|contactEmail)"' projects/ 2>/dev/null || true)
if [ -n "$pd" ]; then bad "поля с адресами получателей:"; echo "$pd" | sed 's/^/      /'
else ok "адресов получателей нет"; fi

say "6. Что уйдёт в публикацию"
echo "  файлов: $(git ls-files | wc -l | tr -d ' '), объём: $(git ls-files -z | xargs -0 du -ch 2>/dev/null | tail -1 | cut -f1)"

echo
if [ $fail -eq 0 ]; then echo "Публиковать можно."; else echo "Провалов: $fail. Публиковать нельзя."; fi
exit $fail
