#!/usr/bin/env python3
"""Делает боевые HTML-шаблоны для демо-проектов из стоковой библиотеки RuSender.

    python3 scripts/make_templates.py ~/Downloads/template.xlsx

Берёт готовый шаблон RuSender, перекрашивает под палитру проекта, меняет тексты,
ссылки и контакты. Вёрстка остаётся как есть — это настоящие письма с MSO-условиями,
и трогать их структуру не надо.

Картинки остаются на CDN RuSender: это их собственные стоковые ассеты, они реально
загружаются. Перед реальной отправкой их надо заменить на свои — об этом написано
в шапке каждого получившегося файла.
"""
import sys, re, zipfile, pathlib, collections
import xml.etree.ElementTree as ET

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
ROOT = pathlib.Path(__file__).resolve().parent.parent

# Общие замены — стоковые контакты и подписи есть почти во всех шаблонах
COMMON = [
    ('г. Москва, ул. Тверская 1', '{{address}}'),
    ('г. Москва, Тверская 1', '{{address}}'),
    ('+7(123) 456 78 90', '{{phone}}'),
    ('+7 (123) 456 78 90', '{{phone}}'),
    ('site@mail.ru', '{{support_email}}'),
    ('M Y S I T E . R U', '{{site_label}}'),
    ('НАЗВАНИЕ КОМПАНИИ', '{{brand}}'),
    ('ВАШ САЙТ', '{{site_label}}'),
    ('COMPANY', '{{brand}}'),
    ('C O M P A N Y', '{{brand}}'),
]


A = 'https://assets.unlayer.rusender.ru/projects/88680/'
IMG = {
    # порядок важен: первая картинка обычно попадает в маленький слот логотипа,
    # вторая — в большую шапку. Самое выигрышное фото ставим вторым.
    'flowers':   [A+'1672147199080-violet-flower-decoration-background.jpg',
                  A+'1708070721954-tulips-bouquet-and-gift.jpg',
                  A+'1670494495700-high-angle-rose-book-bedroom%20(1).jpg'],
    'travel':    [A+'1670505761844-beautiful-tropical-beach-sea-with-chair-blue-sky.jpg',
                  A+'1667771530661-set-cottages-ocean-blue-sky_181624-34915.jpg',
                  A+'1670505803322-landscape-morning-fog-mountains-with-hot-air-balloons-sunrise.jpg'],
    'food':      [A+'1668685183619-565847.jpg', A+'1668685513864-199408.jpg',
                  A+'1667900630047-healthy-food.png'],
    'logistics': [A+'1669809800354-7350612_524.jpg', A+'1669809912843-20289247_6226284.jpg',
                  A+'1669810425283-free-icon-lorry-530454.png'],
    'media':     [A+'1664139552323-blog-1.png', A+'1664139560665-blog-2.png',
                  A+'1664140053635-blog-3.png'],
    'saas':      [A+'1665674951544-11668800_20945373.png',
                  A+'1669128432867-Screenshot_221.png', A+'1669128648665-Screenshot_222.png'],
    'finance':   [A+'1669055393353-businessman-reading-contract-closeup.jpg',
                  A+'1669104697002-paper.png', A+'1669055551198-signing-business-contracts.jpg'],
    'clinic':    [A+'1671548779195-29097.png',
                  A+'1671357839642-free-icon-insurance-4460487.png',
                  A+'1671357626428-free-icon-support-1067566.png'],
    'fitness':   [A+'1669796765836-27828923_7368089.jpg',
                  A+'1663101556586-Newsletter-cuate.png'],
    'school':    [A+'1669127024809-7732666_5293.jpg', A+'1723209633868-466717.png',
                  A+'1669124874380-free-icon-education-4696565.png'],
    'game':      [A+'1728999395447-82571572011522517.png',
                  A+'1728987591230-cute-halloween-concept-with-copy-space%201.png'],
}

SPEC = {
    'rusender': dict(stock=19, file='product-update.html', name='Продуктовое обновление',
        images='saas', accents=['#4b4afb', '#191942'],
        vars={'brand': 'RuSender', 'address': 'Москва', 'phone': '+7 (000) 000 00 00',
              'support_email': 'support@rusender.example', 'site_label': 'R U S E N D E R . E X A M P L E'},
        site='https://rusender.example',
        texts=[('Обновление функционала', 'Обновления сентября'),
               ('ПЕРЕЙТИ НА САЙТ', 'ЧТО ИЗМЕНИЛОСЬ'),
               ('О КОМПАНИИ', 'ВОЗМОЖНОСТИ'), ('УСЛУГИ', 'ТАРИФЫ'), ('КОНТАКТЫ', 'ПОДДЕРЖКА'),
               ('Сайт рыбатекст поможет дизайнеру, верстальщику, вебмастеру сгенерировать несколько абзацев',
                'Главное обновление месяца — MCP-сервер: рассылками теперь может заниматься ИИ-ассистент по команде в чате. Заодно поправили мелкие ошибки в интерфейсе.')]),

    'shop-rosa': dict(stock=21, file='promo-bouquets.html', name='Подборка букетов',
        images='flowers',
        accents=['#b5495b', '#2f2a28'],
        vars={'brand': 'Роза', 'address': 'Доставка по городу', 'phone': '+7 (000) 000 00 00',
              'support_email': 'hello@rosa.example', 'site_label': 'R O S A . E X A M P L E'},
        site='https://rosa.example',
        texts=[('ТЕАТР "ЛИРИЧЕСКИЙ ВЗЛЕТ"', 'РОЗА · ДОСТАВКА ЦВЕТОВ'),
               ('Дорогие наши зрители!', 'Здравствуйте!'),
               ('Мы ценим вашу верность и хотим поблагодарить вас за то, что выбираете наш театр',
                'Собрали три букета недели. Все на плотных стеблях — такие держатся дольше обычных пяти-шести дней.'),
               ('Специально для вас, у нас есть отличная новость. Мы дарим вам промокод, которы',
                'Кустовые розы с гипсофилой стоят до десяти дней, ирисы с эвкалиптом — около недели. А самый выносливый вариант, альстромерии с зеленью, '),
               ('скидку в размере 15%', 'держится до двух недель'),
               ('на билеты к нашим предстоящим представлениям.', ' — если менять воду раз в три дня.'),
               ('Получить промокод', 'Смотреть букеты'),
               ('Для использования промокода, просто перейдите на наш сайт или обратитесь в наш',
                'Доставляем по городу за два часа с момента заказа. Букет приедет свежим — считать дни можно с порога.')]),

    'saas-taskly': dict(stock=32, file='changelog.html', name='Письмо от команды',
        images='saas', accents=['#2f6feb', '#0f172a'],
        vars={'brand': 'Taskly', 'address': 'Команда Taskly', 'phone': '',
              'support_email': 'support@taskly.example', 'site_label': 'T A S K L Y'},
        site='https://taskly.example',
        texts=[('Ваш главный заголовок', 'Что изменилось в Taskly за месяц'),
               ('Перейти на сайт', 'Открыть changelog'),
               ('В первом блоке советуем вам давать самое важное сообщение', 'Собрали изменения за сентябрь. Главное — импорт из Jira и новые роли доступа: теперь можно выдать просмотр без права редактировать.'),
               ('Подумайте, какой цели вы хотите добиться своим письмом', 'Ломающих изменений в этом релизе нет. Если что-то отвалилось — напишите, разберёмся в тот же день.'),
               ('Если у вас разные подписчики, которым нужно писать по разному - лучше разделите аудитории и пошлите каждой свое письмо.', 'Полный список правок — в changelog на сайте.'),
               ('Вход', 'Войти'), ('Возможности', 'Что нового'), ('Документация', 'Документация'),
               ('телеграм-комьюнити', 'чат поддержки')]),

    'saas-taskly-en': dict(slug='saas-taskly', stock=32, file='changelog-en.html',
        name='Team letter (EN)', images='saas',
        accents=['#2f6feb', '#0f172a'],
        vars={'brand': 'Taskly', 'address': 'Taskly Team', 'phone': '',
              'support_email': 'support@taskly.example', 'site_label': 'T A S K L Y'},
        site='https://taskly.example',
        texts=[('Ваш главный заголовок', 'What changed in Taskly this month'),
               ('Перейти на сайт', 'Open the changelog'),
               ('Вход', 'Log in'), ('Возможности', "What's new"), ('Документация', 'Docs'),
               ('телеграм-комьюнити', 'support chat'),
               ('По всем вопросам пишите', 'Questions? Write to'),
               ('на почту', 'our team'),
               ('Отписаться от рассылки', 'Unsubscribe'),
               ('В первом блоке советуем вам давать самое важное сообщение',
                'Here is what shipped in September. The big one is Jira import: it moves issues, statuses, comments and attachments.'),
               ('Подумайте, какой цели вы хотите добиться своим письмом',
                'No breaking changes this time. If something looks off, write to us and we will sort it out the same day.'),
               ('Если у вас разные подписчики, которым нужно писать по разному - лучше разделите аудитории и пошлите каждой свое письмо.',
                'The full list of changes is in the changelog.')]),

    'school-lingvo': dict(stock=23, file='course-intake.html', name='Набор на поток',
        images='school', accents=['#1f7a5c', '#123b2c'],
        vars={'brand': 'Лингво', 'address': 'Онлайн', 'phone': '',
              'support_email': 'hello@lingvo.example', 'site_label': 'L I N G V O'},
        site='https://lingvo.example',
        texts=[('ПРИГЛАШЕНИЕ', 'НАБОР ОТКРЫТ'),
               ('НАЗВАНИЕ МЕРОПРИЯТИЯ', 'ОКТЯБРЬСКИЙ ПОТОК'),
               ('ДАТА И МЕСТО', 'СТАРТ И ФОРМАТ'),
               ('30 декабря', '6 октября'),
               ('Онлайн регистрация', 'Записаться на поток'),
               ('Расскажите  о мероприятии.', 'Группы по 8 человек, два занятия в неделю.'),
               ('Почему подписчики должны его посетить?', 'Уровень определяем на бесплатном уроке.'),
               ('Какую выгоду они получат?', 'Честно говорим, сколько это займёт.')]),

    'clinic-vita': dict(stock=16, file='clinic-news.html', name='Письмо клиники',
        images='clinic', accents=['#0f7ea8', '#123f52'],
        vars={'brand': 'Клиника Вита', 'address': 'Шесть центров в городе',
              'phone': '+7 (000) 000 00 00', 'support_email': 'info@vita-clinic.example',
              'site_label': 'V I T A - C L I N I C'},
        site='https://vita-clinic.example',
        texts=[('Заголовок', 'Открылся центр на Парковой'),
               ('УЗНАТЬ БОЛЬШЕ', 'ПОСМОТРЕТЬ РАСПИСАНИЕ'),
               ('В первом блоке советуем вам давать самое важное сообщение, которое вы  хотите донести до',
                'Шестой центр сети работает с понедельника: терапия, УЗИ, забор анализов, диспансеризация. Записаться можно на сайте или по телефону регистратуры.'),
               ('Подумайте, какой цели вы хотите добиться своим письмом. Не смешивайте в одном письме раз',
                'Часы работы: будни с 8:00 до 21:00, суббота с 9:00 до 18:00. Диспансеризацию проводим по предварительной записи, она занимает около двух часов.')]),

    'fitness-volna': dict(stock=45, file='club-schedule.html', name='Расписание клуба',
        images='fitness', accents=['#e8541f', '#1c2630'],
        vars={'brand': 'Волна', 'address': 'Четыре клуба в городе', 'phone': '+7 (000) 000 00 00',
              'support_email': 'club@volna-fit.example', 'site_label': 'V O L N A'},
        site='https://volna-fit.example',
        texts=[('Специальная акция', 'Расписание на октябрь'),
               ('для наших подписчиков', 'что изменилось в клубах'),
               ('Это отличный шаблон для маркетингового предложения. Опишите его кратко в этом абзаце.',
                'Добавили утренние групповые в будни и перенесли аквааэробику на вечер. Абонементы и заморозка работают как раньше.'),
               ('Классное преимущество', 'Утренние группы'),
               ('Потрясающее отличие', 'Аквааэробика в 19:00'),
               ('Немного эксклюзивности', 'Новый зал функционала'),
               ('А тут можно рассказать об акции подробнее', 'Утренние группы идут с 7:30 в будни — удобно до работы. Аквааэробика переехала на 19:00, бассейн в это время свободнее.'),
               ('Отлично, теперь самое время, чтоб подписчики нажали на кнопку!', 'Полное расписание по всем четырём клубам — на сайте и в приложении.'),
               ('ПОСМОТРЕТЬ НА СУПЕРПРЕДЛОЖЕНИЕ!', 'ОТКРЫТЬ РАСПИСАНИЕ')]),

    'media-kontur': dict(stock=49, file='daily-digest.html', name='Ежедневный дайджест',
        images='media', accents=['#c8102e', '#111827'],
        vars={'brand': 'Контур', 'address': 'Ежедневно в 8:00', 'phone': '',
              'support_email': 'daily@kontur-media.example', 'site_label': 'K O N T U R'},
        site='https://kontur-media.example',
        texts=[('Заголовок', 'Главное за понедельник'),
               ('УЗНАТЬ БОЛЬШЕ', 'ЧИТАТЬ ВЫПУСК'),
               ('В первом блоке советуем вам давать самое важное сообщение, которое вы  хотите донести до',
                'Ставка сохранена, но сигнал в пресс-релизе стал мягче. Рынок читает это как подготовку к снижению в следующем квартале.'),
               ('Подумайте, какой цели вы хотите добиться своим письмом. Не смешивайте в одном письме раз',
                'Нефть прибавила за день — причина не в спросе, а в перебоях с поставками. Плюс два закона вступили в силу: по маркировке и по отчётности для малого бизнеса.')]),

    'logist-tochka': dict(stock=44, file='b2b-offer.html', name='Письмо клиентам',
        images='logistics', accents=['#17436b', '#0d2438'],
        vars={'brand': 'Точка Логистика', 'address': 'Россия и СНГ', 'phone': '+7 (000) 000 00 00',
              'support_email': 'sales@tochka-log.example', 'site_label': 'T O C H K A - L O G'},
        site='https://tochka-log.example',
        texts=[('Заголовок', 'Новое направление: Казахстан'),
               ('УЗНАТЬ БОЛЬШЕ', 'РАССЧИТАТЬ ДОСТАВКУ'),
               ('В первом блоке советуем вам давать самое важное сообщение, которое вы  хотите донести до',
                'Возим сборные грузы в Алматы, Астану и Караганду. Сроки 6–8 дней, минимальная партия 50 кг.'),
               ('Подумайте, какой цели вы хотите добиться своим письмом. Не смешивайте в одном письме раз',
                'Тариф считается от фактического веса или объёма — берём большее. Точную стоимость по вашему маршруту посчитает менеджер в течение рабочего дня.')]),

    'game-pixelfox': dict(stock=1, file='season-event.html', name='Событие сезона',
        images='game', accents=['#7b2ff7', '#160b2a'],
        vars={'brand': 'PixelFox', 'address': 'В игре', 'phone': '',
              'support_email': 'game@pixelfox.example', 'site_label': 'P I X E L F O X'},
        site='https://pixelfox.example',
        texts=[('ПРИГЛАШАЕМ НА ВЕЧЕРИНКУ', 'НОВЫЙ СЕЗОН НАЧАЛСЯ'),
               ('в честь Хэллоуина!', 'Лисья тропа'),
               ('Дата:', 'Идёт до: '), ('31.10.2024', '12 октября'),
               ('Время:', 'Награда: '), ('21:00-06:00', 'сезонный скин'),
               ('Адрес:', 'Где: '),
               ('Регистрация', 'Играть'),
               ('О нас', 'Игра'), ('Мероприятия', 'События'), ('Контакты', 'Поддержка'),
               ('Пусть эта ночь наполнится чудесами и искрящимся весельем,',
                'Три новых режима, переработанный баланс навыков и события по выходным.'),
               ('а каждый момент принесет радость. 🎃', 'Заходите — прогресс сохранился. 🦊')]),

    'travel-marshrut': dict(stock=42, file='tour-selection.html', name='Подборка туров',
        images='travel', accents=['#0e8f7e', '#10352f'],
        vars={'brand': 'Маршрут', 'address': 'Подбор туров', 'phone': '+7 (000) 000 00 00',
              'support_email': 'travel@marshrut.example', 'site_label': 'M A R S H R U T'},
        site='https://marshrut.example',
        texts=[('Новогодняя распродажа 📢', 'Куда лететь в ноябре ✈️'),
               ('Самое волшебное время года приближается, и мы рады объявить о старте нашей ежегодной Нов',
                'Собрали направления, где в ноябре тепло, а цены ещё не выросли к новогодним. Подборка сделана сегодня — цены актуальны на момент отправки.'),
               ('Начинаем обратный отсчет!', 'Цены на сегодня'),
               ('Что мы подготовили для вас?', 'Что в подборке'),
               ('Скидки до 50% на избранные товары!', 'Семь направлений без визы'),
               ('Особые предложения и подарки', 'Вылеты в ближайшие три недели'),
               ('Бесплатная доставка при заказе на сумму от 3000руб.', 'Цены обновляются каждый день'),
               ('Перейти на сайт', 'Смотреть подборку')]),

    'food-bystro': dict(stock=10, file='menu-week.html', name='Меню недели',
        images='food', accents=['#e4572e', '#2b1b16'],
        vars={'brand': 'Быстро', 'address': 'Доставка 30 минут', 'phone': '+7 (000) 000 00 00',
              'support_email': 'order@bystro-food.example', 'site_label': 'B Y S T R O'},
        site='https://bystro-food.example',
        texts=[('YOUR', 'БЫ'), ('SHOP', 'СТРО'),
               ('Добрый день!', 'Новое в меню на этой неделе'),
               ('Мы надеемся, что вам понравилась ваша недавняя покупка.  Вы можете оставить отзыв,  ваш ',
                'Вернули сырники по старой цене и добавили три обеда до 400 рублей. Доставка по-прежнему 30 минут по городу.'),
               ('Оставьте отзыв', 'Посмотреть меню'),
               ('Наименование товара', 'Обед дня'),
               ('Напишите отзыв о товаре, описав его преимущества и недостатки.  Посоветовали бы этот тов',
                'Суп, горячее и салат — 390 рублей. Меняется каждый день, смотрите в приложении или на сайте.'),
               ('Написать отзыв', 'Заказать')]),

    'fin-schet': dict(stock=54, file='deadline-reminder.html', name='Напоминание о сроке',
        images='finance', accents=['#1d4e89', '#10233d'],
        vars={'brand': 'Счёт', 'address': 'Бухгалтерия для ИП', 'phone': '',
              'support_email': 'team@schet.example', 'site_label': 'S C H E T'},
        site='https://schet.example',
        texts=[('Добро пожаловать на наш сайт', 'Взносы за 2026 год — до 31 декабря'),
               ('В начале письма советуем вам давать самое важное сообщение, которое вы',
                'Фиксированные взносы платят все ИП, пока статус не закрыт,'),
               ('хотите донести', 'независимо от дохода.'),
               ('перешел на сайт', 'перейти к взносам'),
               ('Подумайте, какой цели вы хотите добиться своим письмом', 'Сумма на 2026 год — 53 658 ₽. Если доход превысит 300 000 ₽, сверху добавится 1% с превышения, но этот платёж уже до 1 июля следующего года.'),
               ('Помните', 'Важно'),
               ('до своих подписчиков. Определитесь, каким тоном вы хотите говорить со своими подписчиками', 'Заплатить можно одним платежом или частями в течение года — сервис показывает остаток.'),
               ('Главное - не злоупотреблять этим приемом)', 'Если вы уже платили частями, проверьте остаток в разделе «Налоги и взносы»: там видно, сколько осталось до конца года.'),
               ('Проверьте, нет ли ошибок и опечаток в тексте', 'Реквизиты подставятся сами — вручную ничего вводить не нужно.'),
               ('Проверьте, правильно ли вы расставили запятые', 'Если ИП закрыто в середине года, взносы считаются пропорционально отработанным дням.'),
               ('Кстати, упрощать и сокращать текст - это отличный подход', 'Второй платёж — 1% с дохода свыше 300 000 ₽ — идёт до 1 июля следующего года, про него напомним отдельно.'),
               ('Плохо ли писать вот такие длинные тексты?', 'Вопросы по вашей ситуации — в поддержку из личного кабинета, отвечаем в течение рабочего дня.'),
               (', что грамотность - очень важна. Письмо с ошибками сразу снижает доверие к вам.', ': взносы платят даже при нулевом доходе, пока ИП не закрыто.'),
               ('Помните', 'Важно')]),
}


def load_stock(xlsx):
    with zipfile.ZipFile(xlsx) as z:
        data = z.read('xl/worksheets/sheet1.xml')
    root = ET.fromstring(data)
    sd = root.find(f'{NS}sheetData')
    out = []
    for r in sd.findall(f'{NS}row'):
        cells = {}
        for c in r.findall(f'{NS}c'):
            col = re.match(r'[A-Z]+', c.get('r')).group(0)
            if c.get('t') == 'inlineStr':
                isx = c.find(f'{NS}is')
                v = ''.join(x.text or '' for x in isx.iter(f'{NS}t'))
            else:
                vv = c.find(f'{NS}v')
                v = vv.text if vv is not None else ''
            cells[col] = v or ''
        out.append(cells)
    return out[1:]  # без заголовка


def is_neutral(hexcol):
    r, g, b = (int(hexcol[i:i + 2], 16) for i in (1, 3, 5))
    return max(r, g, b) - min(r, g, b) < 24


def detect_accents(html, limit=2):
    cnt = collections.Counter(c.lower() for c in re.findall(r'#[0-9a-fA-F]{6}\b', html))
    return [c for c, _ in cnt.most_common() if not is_neutral(c)][:limit]


def adapt(html, spec):
    src = detect_accents(html, len(spec['accents']))
    mapping = {}
    for old, new in zip(src, spec['accents']):
        mapping[old] = new
    for old, new in mapping.items():
        html = re.sub(re.escape(old), new, html, flags=re.I)

    # Замена работает по текстовым узлам целиком: в стоке встречаются неразрывные
    # пробелы и переносы, из-за которых подстрока не находится, а частичная замена
    # оставляет обрывок чужого текста.
    def norm(s):
        return re.sub(r'[\s\u00a0]+', ' ', s).strip()

    # короткие стоковые контакты — подстрокой: они сидят внутри узлов с другим текстом
    for a, b in COMMON:
        html = re.sub(r'[\s\u00a0]+'.join(map(re.escape, a.split())), b, html)

    pairs = [(norm(a), b) for a, b in spec['texts']]

    def repl_node(m):
        inner = m.group(1)
        n = norm(inner)
        if not n:
            return m.group(0)
        for a, b in pairs:
            if n == a or (len(a) > 24 and n.startswith(a)) or (len(a) > 40 and a in n):
                return '>' + b + '<'
        return m.group(0)

    html = re.sub(r'>([^<>]+)<', repl_node, html)

    # картинки: неиконочные меняем на тематические из той же библиотеки RuSender,
    # по кругу. Иконки соцсетей и таймеры не трогаем — они служебные.
    pool = IMG.get(spec.get('images'), [])
    if pool:
        # Картинки в письмах Unlayer встречаются в трёх местах: src="...",
        # background-image: url(...) и VML для Outlook. Меняем по всему документу,
        # иначе в фоне остаются чужие изображения.
        found = []
        for m in re.finditer(r'https?://(?:assets\.unlayer|cdn\.tools\.unlayer|unlayer-rusender)[^"\'\s)]+', html):
            u = m.group(0)
            if '/social/icons/' in u or 'countdown' in u:
                continue
            if u not in found:
                found.append(u)
        for i, u in enumerate(found):
            html = html.replace(u, pool[i % len(pool)])

    # Ссылки. В стоковых шаблонах остаётся четыре вида заглушек, и все четыре
    # попадают в письмо, если их не тронуть:
    #   href=""                     — пустая ссылка на кнопке или иконке
    #   mailto:https://email.com/   — сломанный mailto из стока
    #   mailto:john@doe.com         — адрес-пример
    #   https://telegram.org/       — иконка соцсети ведёт на сам сервис, а не на ваш профиль
    EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
    # адреса-заглушки из стока: формально валидные, но подставлять их в письмо нельзя
    FAKE_MAIL = re.compile(r'(john@doe|example@|@example\.|test@|noreply@mail\.ru|@email\.com)', re.I)
    SOCIAL = ('telegram.org', 'whatsapp.com', 'youtube.com', 'vk.com', 'ok.ru',
              't.me', 'instagram.com', 'facebook.com', 'twitter.com')

    def fix_link(m):
        url = m.group(1).strip()
        if url.startswith('{{') or 'unlayer' in url:
            return m.group(0)
        if not url or url == '#':
            return f'href="{spec["site"]}"'
        if url.startswith('mailto:'):
            addr = url[7:].rstrip('/')
            ok = EMAIL_RE.match(addr) and not FAKE_MAIL.search(addr)
            return m.group(0) if ok else f'href="mailto:{spec["vars"]["support_email"]}"'
        if url.startswith('tel:'):
            return m.group(0)
        if any(s in url for s in SOCIAL):
            # профиля проекта в соцсети у нас нет — ведём на сайт и говорим об этом в шапке
            return f'href="{spec["site"]}"'
        return f'href="{spec["site"]}"'

    html = re.sub(r'href="([^"]*)"', fix_link, html)

    # подставляем значения вместо служебных плейсхолдеров, кроме unsubscribe_url
    for k, v in spec['vars'].items():
        html = html.replace('{{' + k + '}}', v)

    # Таймер обратного отсчёта из новогоднего шаблона: картинка с зашитой чужой датой.
    # В любом другом письме он показывает нули или считает до неизвестно чего.
    html = re.sub(r'<img[^>]*countdown[^>]*>', '', html, flags=re.I)

    # alt-тексты. Названия соцсетей и generic-подписи иконок оставляем, всё остальное
    # осталось от стока и описывает картинку, которой в письме уже нет.
    KEEP_ALT = {'telegram', 'whatsapp', 'youtube', 'email', 'skype', 'instagram', 'vk',
                'facebook', 'twitter', 'логотип', 'календарь', 'информация', 'товар',
                'покупки', 'письмо', 'почта'}

    def fix_alt(m):
        val = m.group(1).strip()
        if not val or val.lower() in KEEP_ALT:
            return m.group(0)
        return f'alt="{spec["vars"]["brand"]}"'
    html = re.sub(r'alt="([^"]*)"', fix_alt, html)

    # <title> письма: в стоке он пустой или чужой
    html = re.sub(r'<title>[^<]*</title>', f'<title>{spec["name"]}</title>', html, count=1)

    header = (
        '<!--\n'
        f'  Шаблон демо-проекта: {spec["name"]}\n'
        '  Основа: стандартный шаблон RuSender, адаптирован под палитру и тексты проекта.\n'
        '\n'
        '  Это законченное письмо, а не бланк. Для новой рассылки берут его вёрстку\n'
        '  и подставляют свой текст, сохраняя результат отдельным файлом — этот\n'
        '  остаётся базой для следующих писем.\n'
        '\n'
        '  Перед реальной отправкой заменить:\n'
        '    - картинки: сейчас ведут на CDN RuSender (стоковые ассеты);\n'
        f'    - ссылки: все ведут на {spec["site"]}, проставьте настоящие адреса страниц;\n'
        '    - иконки соцсетей: ведут на сайт проекта, поставьте свои профили.\n'
        '\n'
        '  Ссылка отписки {{unsubscribe_url}} оставлена как есть — её подставляет сервис.\n'
        '-->\n')
    return header + html, mapping


def leftovers(stock_html, out_html, minlen=40):
    """Текстовые узлы, которые остались от стокового шаблона нетронутыми.

    Точная проверка: сравниваем видимый текст оригинала и результата.
    Всё, что длиннее minlen и совпало дословно, — это рыба, которую забыли заменить.
    """
    def nodes(h):
        h = re.sub(r'<!--.*?-->', '', h, flags=re.S)
        h = re.sub(r'<(style|script)[^>]*>.*?</\1>', '', h, flags=re.S | re.I)
        out = []
        for m in re.finditer(r'>([^<>]+)<', h):
            s = re.sub(r'[\s\u00a0]+', ' ', m.group(1)).strip()
            if len(s) >= minlen and '{' not in s:
                out.append(s)
        return out
    OK = ('Если вы не хотите больше получать наши письма',
          'Вы получили это письмо, потому что подписались на рассылку')
    same = set(nodes(stock_html)) & set(nodes(out_html))
    return sorted(s for s in same if not s.startswith(OK))


def main():
    if len(sys.argv) < 2:
        print('Использование: python3 scripts/make_templates.py <путь к template.xlsx>')
        sys.exit(2)
    stock = load_stock(sys.argv[1])
    print(f'{"проект":18}{"шаблон":26}{"перекрас":32}{"замен":>6}')
    for slug, spec in SPEC.items():
        row = stock[spec['stock'] - 1]
        html = row.get('BN', '')
        if not html.rstrip().endswith('</html>'):
            print(f'  {slug}: шаблон {spec["stock"]} обрезан в xlsx, пропускаю')
            continue
        out, mapping = adapt(html, spec)
        dst = ROOT / 'projects' / spec.get('slug', slug) / 'templates' / spec['file']
        dst.parent.mkdir(parents=True, exist_ok=True)
        dst.write_text(out, encoding='utf-8')
        recolor = ' '.join(f'{a}→{b}' for a, b in mapping.items())
        left = leftovers(html, out)
        mark = '' if not left else f'  ⚠ рыбы осталось: {len(left)}'
        print(f'{slug:18}{spec["file"]:26}{recolor:32}{len(spec["texts"]):>6}{mark}')
        for s in left:
            print(f'      {s[:112]}')
    print('\nГотово. Проверьте глазами: scripts/preview-templates.sh')


if __name__ == '__main__':
    main()
