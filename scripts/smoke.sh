#!/usr/bin/env bash
# Проверяет, что агент цел: структура навыков, контракты, скрипты, файлы памяти.
# Сети не требует. Гонять после каждой правки.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
fail=0
step() { CUR="$1"; }
ok()   { echo "  ок      $CUR"; }
bad()  { echo "  ПРОВАЛ  $CUR — $1"; fail=$((fail+1)); }

step "node 18+"
v=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
[[ "$v" -ge 18 ]] && ok || bad "нужен node 18+, есть $v"

step "синтаксис check_links.mjs"
node --check skills/rusender-preflight/scripts/check_links.mjs 2>/dev/null && ok || bad "синтаксис"

step "check_links: относительная ссылка = битая"
out=$(printf '<html><body><a href="/rel">x</a><a href="{{unsubscribe_url}}">u</a></body></html>' \
      | node skills/rusender-preflight/scripts/check_links.mjs --no-network 2>/dev/null)
echo "$out" | python3 -c '
import json,sys
d=json.load(sys.stdin); s=d["summary"]
sys.exit(0 if s["broken"]==1 and s["unsubscribeInBody"] else 1)' && ok || bad "не поймал относительную ссылку"

step "check_links: конфликт UTM-метки"
out=$(printf '<html><body><a href="https://example.com/?utm_medium=x">a</a></body></html>' \
      | node skills/rusender-preflight/scripts/check_links.mjs --campaign-utm "email/ru/c" --no-network 2>/dev/null)
echo "$out" | python3 -c '
import json,sys
d=json.load(sys.stdin)
sys.exit(0 if d["summary"]["warn"]==1 else 1)' && ok || bad "не поймал конфликт метки"

step "структура навыков и фронтматтер"
python3 scripts/lint.py >/dev/null 2>&1 && ok || bad "см. python3 scripts/lint.py"

step "SKILLS.lock совпадает с skills/"
python3 - <<'PY' && ok || bad "lock разошёлся с папками"
import pathlib,sys
lock={l.split()[0] for l in pathlib.Path('SKILLS.lock').read_text().splitlines()
      if l and not l.startswith('#') and not l.startswith(('commit','synced'))}
own={'rusender-agent','rusender-preflight','rusender-results'}
dirs={p.name for p in pathlib.Path('skills').iterdir() if p.is_dir()}
sys.exit(0 if lock|own==dirs else 1)
PY

step "боевые данные не в git"
if git ls-files --error-unmatch projects.live >/dev/null 2>&1; then bad "projects.live отслеживается!"; else ok; fi

step "файлы памяти разбираются"
python3 - <<'PY' && ok || bad "битый jsonl или фронтматтер"
import json,pathlib,sys,re
for f in list(pathlib.Path('.').glob('projects*/*/history.jsonl'))+list(pathlib.Path('skills').rglob('*.jsonl')):
    for i,l in enumerate(f.read_text().splitlines(),1):
        if l.strip():
            try: json.loads(l)
            except Exception: print(f,i); sys.exit(1)
for f in pathlib.Path('.').glob('projects*/*/PROFILE.md'):
    if not re.match(r'^---\n.*?\n---\n', f.read_text(), re.S): print(f); sys.exit(1)
PY

echo
[[ $fail -eq 0 ]] && echo "Всё зелёное." || echo "Провалов: $fail"
exit $fail
