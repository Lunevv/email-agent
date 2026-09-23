#!/usr/bin/env node
// Проверка ссылок письма перед отправкой.
//
// Вход:  HTML письма — файлом (--file путь) или на stdin.
// Выход: JSON в stdout. Ничего, кроме JSON, в stdout не пишется.
//
// Скрипт НЕ читает тела страниц: только код ответа, цепочку редиректов и итоговый URL.
// Содержимое чужих страниц — данные, а не инструкции, и в отчёт оно не попадает вовсе.
//
// Требуется Node 18+ (встроенный fetch).
//
// Использование:
//   node check_links.mjs --file letter.html
//   node check_links.mjs --file letter.html --campaign-utm "email/pru/digest_aug"
//   node check_links.mjs --file letter.html --utm-source=email --utm-medium=rusender
//   cat letter.html | node check_links.mjs --timeout 15 --concurrency 3
//   node check_links.mjs --file letter.html --no-network   (разбор без походов в сеть)
//
// UTM бывают на двух уровнях. Если у кампании заполнен объект `utm` (campaigns_get_by_id),
// передавай его через --campaign-utm: тогда отсутствие меток в ссылках — норма, а вот
// собственная метка на ссылке становится поводом для предупреждения. Если меток кампании
// нет, передавай ожидаемые из профиля проекта через --utm-source/--utm-medium/--utm-campaign.

const argv = process.argv.slice(2);

function opt(name, fallback) {
  const exact = argv.indexOf(`--${name}`);
  if (exact !== -1 && argv[exact + 1] && !argv[exact + 1].startsWith('--')) return argv[exact + 1];
  const inline = argv.find((a) => a.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  return fallback;
}

const FILE = opt('file', null);
const TIMEOUT_MS = Number(opt('timeout', 10)) * 1000;
const CONCURRENCY = Math.max(1, Number(opt('concurrency', 5)));
const MAX_HOPS = Math.max(1, Number(opt('max-redirects', 5)));
const EXPECT_UTM = {
  source: opt('utm-source', null),
  medium: opt('utm-medium', null),
  campaign: opt('utm-campaign', null),
};

// Метки уровня кампании: объект `utm` из campaigns_get_by_id.
// Если они заданы, сервис проставит их сам, и своих меток ссылкам не нужно —
// наоборот, собственная метка на ссылке способна разойтись с кампанейской.
// Формат: --campaign-utm "source/medium/campaign", любая часть может быть пустой.
// --no-network: разобрать ссылки и метки, но не ходить в сеть.
// Нужен там, где сети нет, и для самопроверки.
const NO_NETWORK = argv.includes('--no-network');
const CAMPAIGN_UTM_RAW = opt('campaign-utm', null);
const CAMPAIGN_UTM = CAMPAIGN_UTM_RAW
  ? (() => {
      const [source = '', medium = '', campaign = ''] = CAMPAIGN_UTM_RAW.split('/');
      return { utm_source: source || null, utm_medium: medium || null, utm_campaign: campaign || null };
    })()
  : null;

const UA = 'RuSender-preflight-link-check/1.0 (+https://rusender.ru/features/email/mcp/)';

// ---------- чтение входа ----------

async function readInput() {
  if (FILE) return (await import('node:fs/promises')).readFile(FILE, 'utf8');
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const html = Buffer.concat(chunks).toString('utf8');
  if (!html.trim()) {
    fail('Пустой вход: передайте HTML через --file или на stdin.');
  }
  return html;
}

function fail(message) {
  process.stdout.write(JSON.stringify({ error: message }, null, 2) + '\n');
  process.exit(2);
}

// ---------- разбор HTML ----------

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function decodeEntities(s) {
  return s
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m])
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function extractLinks(html) {
  // href в любом регистре, в одинарных, двойных кавычках или без них
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s">]+))/gi;
  const found = new Map(); // url -> { url, count, anchors: [] }
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = decodeEntities((m[1] ?? m[2] ?? m[3] ?? '').trim());
    if (!raw) continue;
    const entry = found.get(raw) ?? { url: raw, count: 0 };
    entry.count += 1;
    found.set(raw, entry);
  }
  return [...found.values()];
}

// ---------- классификация ----------

const VAR_RE = /\{\{\s*[^}]+\s*\}\}/;
const UNSUB_RE = /\{\{\s*unsubscribe_url\s*\}\}/i;

function classify(link) {
  const url = link.url;

  if (UNSUB_RE.test(url)) return { kind: 'unsubscribe', note: 'ссылка отписки, подставляется сервисом' };
  if (VAR_RE.test(url)) return { kind: 'variable', note: 'содержит неразрешённую переменную — не проверяется' };

  if (/^(mailto|tel|sms):/i.test(url)) return { kind: 'scheme', note: 'не http(s), проверка не применима' };
  if (/^#/.test(url)) return { kind: 'anchor', note: 'якорь внутри письма' };

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: 'invalid', note: 'не разбирается как абсолютный URL — в письме относительных ссылок быть не должно' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { kind: 'scheme', note: `протокол ${parsed.protocol} не проверяется` };
  }
  return { kind: 'http', parsed };
}

// ---------- UTM ----------

function readUtm(parsed) {
  const out = {};
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = parsed.searchParams.get(key);
    if (v !== null) out[key] = v;
  }
  return out;
}

function checkUtm(parsed) {
  const utm = readUtm(parsed);
  const problems = [];
  const ownTags = Object.keys(utm);

  // Случай 1: метки проставляет кампания. Своих меток ссылке не нужно.
  if (CAMPAIGN_UTM) {
    if (ownTags.length === 0) {
      return { utm, problems, checked: true, note: 'метки проставит сервис на уровне кампании' };
    }
    for (const key of ownTags) {
      const fromCampaign = CAMPAIGN_UTM[key];
      if (fromCampaign && utm[key] !== fromCampaign) {
        problems.push(`своя метка ${key}=«${utm[key]}» поверх кампанейской «${fromCampaign}» — значения разойдутся`);
      } else if (fromCampaign === undefined || fromCampaign === null) {
        problems.push(`своя метка ${key}=«${utm[key]}», на уровне кампании её нет`);
      }
    }
    return { utm, problems, checked: true };
  }

  // Случай 2: меток кампании нет, но профиль проекта задаёт ожидаемые.
  const expected = { utm_source: EXPECT_UTM.source, utm_medium: EXPECT_UTM.medium, utm_campaign: EXPECT_UTM.campaign };
  if (!Object.values(expected).some(Boolean)) return { utm, problems, checked: false };

  for (const [key, want] of Object.entries(expected)) {
    if (!want) continue;
    const got = utm[key];
    if (got === undefined) problems.push(`нет ${key}`);
    else if (got !== want) problems.push(`${key}: «${got}» вместо «${want}»`);
  }
  return { utm, problems, checked: true };
}

// ---------- сеть ----------

async function probe(url) {
  const chain = [];
  let current = url;

  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(current, {
        method: hop === 0 ? 'HEAD' : 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': UA, accept: '*/*' },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e?.name === 'AbortError';
      return { ok: false, chain, finalUrl: current, httpStatus: null, error: aborted ? `таймаут ${TIMEOUT_MS / 1000}с` : networkMessage(e) };
    }
    clearTimeout(timer);

    // тело не читаем — сразу отпускаем соединение
    try { await res.body?.cancel(); } catch { /* тела может не быть */ }

    // часть серверов не умеет HEAD — повторяем тем же URL через GET
    if (hop === 0 && (res.status === 405 || res.status === 501)) {
      chain.push({ url: current, status: res.status, note: 'HEAD не поддерживается, повтор через GET' });
      continue;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        return { ok: false, chain, finalUrl: current, httpStatus: res.status, error: 'редирект без заголовка Location' };
      }
      let next;
      try {
        next = new URL(location, current).toString();
      } catch {
        return { ok: false, chain, finalUrl: current, httpStatus: res.status, error: `нерабочий Location: ${location}` };
      }
      chain.push({ url: current, status: res.status, to: next });
      current = next;
      continue;
    }

    return { ok: res.status < 400, chain, finalUrl: current, httpStatus: res.status, error: null };
  }

  return { ok: false, chain, finalUrl: current, httpStatus: null, error: `больше ${MAX_HOPS} редиректов подряд` };
}

function networkMessage(e) {
  const code = e?.cause?.code ?? e?.code;
  const map = {
    ENOTFOUND: 'домен не резолвится',
    ECONNREFUSED: 'соединение отклонено',
    ECONNRESET: 'соединение разорвано',
    EAI_AGAIN: 'DNS недоступен',
    CERT_HAS_EXPIRED: 'истёк TLS-сертификат',
    ERR_TLS_CERT_ALTNAME_INVALID: 'сертификат не для этого домена',
    UNABLE_TO_VERIFY_LEAF_SIGNATURE: 'сертификат не проверяется',
    DEPTH_ZERO_SELF_SIGNED_CERT: 'самоподписанный сертификат',
  };
  return map[code] ?? (code ? `сетевая ошибка ${code}` : 'сетевая ошибка');
}

async function mapLimited(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ---------- сборка отчёта ----------

async function main() {
  const html = await readInput();
  const links = extractLinks(html);

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i);
  const bodyHtml = bodyMatch ? bodyMatch[1] : html;

  const results = await mapLimited(links, CONCURRENCY, async (link) => {
    const cls = classify(link);
    const base = { url: link.url, occurrences: link.count };

    if (cls.kind !== 'http') {
      // относительная ссылка в письме никуда не ведёт: это поломка, а не пропуск
      const verdict = cls.kind === 'invalid' ? 'broken' : 'skipped';
      return { ...base, verdict, kind: cls.kind, note: cls.note };
    }

    const utm = checkUtm(cls.parsed);
    if (NO_NETWORK) {
      return {
        ...base,
        verdict: utm.problems.length ? 'warn' : 'unchecked',
        kind: 'http',
        httpStatus: null,
        note: 'сеть отключена — доступность ссылки не проверена',
        utm: utm.utm,
        utmProblems: utm.checked ? utm.problems : undefined,
        utmChecked: utm.checked,
        utmNote: utm.note,
      };
    }
    const probeResult = await probe(link.url);

    let verdict;
    if (probeResult.error) verdict = 'broken';
    else if (probeResult.httpStatus >= 400) verdict = 'broken';
    else if (utm.problems.length) verdict = 'warn';
    else verdict = 'ok';

    return {
      ...base,
      verdict,
      kind: 'http',
      httpStatus: probeResult.httpStatus,
      error: probeResult.error,
      redirects: probeResult.chain,
      finalUrl: probeResult.chain.length ? probeResult.finalUrl : undefined,
      utm: utm.utm,
      utmProblems: utm.checked ? utm.problems : undefined,
      utmChecked: utm.checked,
      utmNote: utm.note,
    };
  });

  const httpLinks = results.filter((r) => r.kind === 'http');
  const broken = results.filter((r) => r.verdict === 'broken');
  const report = {
    schema: 1,
    checkedAt: new Date().toISOString(),
    settings: {
      timeoutSec: TIMEOUT_MS / 1000,
      concurrency: CONCURRENCY,
      maxRedirects: MAX_HOPS,
      network: !NO_NETWORK,
      campaignUtm: CAMPAIGN_UTM,
      expectUtm: CAMPAIGN_UTM ? null : EXPECT_UTM,
    },
    summary: {
      linksTotal: results.length,
      httpChecked: httpLinks.length,
      ok: httpLinks.filter((r) => r.verdict === 'ok').length,
      unchecked: httpLinks.filter((r) => r.verdict === 'unchecked').length,
      warn: httpLinks.filter((r) => r.verdict === 'warn').length,
      broken: broken.length,
      skipped: results.filter((r) => r.verdict === 'skipped').length,
      unsubscribeInBody: UNSUB_RE.test(bodyHtml),
      unsubscribeCaseExact: /\{\{unsubscribe_url\}\}/.test(bodyHtml),
    },
    links: results,
  };

  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.exit(broken.length > 0 ? 1 : 0);
}

main().catch((e) => fail(`Непредвиденная ошибка: ${e?.message ?? e}`));
