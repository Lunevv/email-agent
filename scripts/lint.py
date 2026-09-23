#!/usr/bin/env python3
"""Структурная проверка навыков: фронтматтер, ссылки на файлы, копии контракта."""
import pathlib, re, hashlib, sys

errors, notes = [], []
root = pathlib.Path(__file__).resolve().parent.parent
skills = root / 'skills'
OWN = ['rusender-agent', 'rusender-preflight', 'rusender-results']

# у наших навыков контракт памяти должен быть идентичным
h = {p: hashlib.md5(p.read_bytes()).hexdigest()
     for p in sorted(skills.glob('*/references/data-layout.md'))}
if len(set(h.values())) > 1:
    errors.append('копии data-layout.md разошлись: ' + ', '.join(p.parent.parent.name for p in h))
elif h:
    notes.append(f'data-layout.md: {len(h)} идентичных копий')

for skill in sorted(p for p in skills.iterdir() if p.is_dir()):
    sm = skill / 'SKILL.md'
    if not sm.exists():
        errors.append(f'{skill.name}: нет SKILL.md'); continue
    text = sm.read_text()
    fm = re.match(r'^---\n(.*?)\n---\n', text, re.S)
    if not fm:
        errors.append(f'{skill.name}: нет фронтматтера'); continue
    body = fm.group(1)
    m = re.search(r'^name:\s*(\S+)', body, re.M)
    if not m or m.group(1) != skill.name:
        errors.append(f'{skill.name}: name во фронтматтере не совпадает с папкой')
    d = re.search(r'^description:\s*(?:>-|\|)?\s*\n((?:\s+.*\n)+)', body, re.M)
    desc = ' '.join(l.strip() for l in d.group(1).splitlines()) if d else ''
    if not desc:
        one = re.search(r'^description:\s*(.+)$', body, re.M)
        desc = one.group(1) if one else ''
    if not desc:
        errors.append(f'{skill.name}: пустое description')
    elif len(desc) > 1024:
        errors.append(f'{skill.name}: description {len(desc)} > 1024')
    # ссылки на собственные файлы навыка
    for md in skill.rglob('*.md'):
        for ref in re.finditer(r'`((?:references|scripts|assets)/[\w./-]+)`', md.read_text()):
            if not (skill / ref.group(1)).exists():
                errors.append(f'{md.relative_to(root)}: ссылка на несуществующий {ref.group(1)}')

for name in OWN:
    if not (skills / name).exists():
        errors.append(f'нет нашего навыка {name}')

notes.append(f'навыков: {len([p for p in skills.iterdir() if p.is_dir()])}')
print('\n'.join('  · ' + n for n in notes))
if errors:
    print('\nОШИБКИ:'); print('\n'.join('  ✗ ' + e for e in errors)); sys.exit(1)
print('\n✓ структура в порядке')
