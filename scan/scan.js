// Scan company career boards, filter by location + keywords, write jobs.csv.
// Providers: everything ats-jobs supports, plus SAP SuccessFactors career sites.
// Usage: npm run scan [-- other-config.json]   (config path is relative to scan/)
const fs = require('node:fs');
const path = require('node:path');
const { getJobs } = require('..');

const DIR = __dirname;
const config = JSON.parse(fs.readFileSync(path.resolve(DIR, process.argv[2] || 'config.json'), 'utf8'));
const OUT_CSV = path.join(DIR, 'jobs.csv');
const SEEN_FILE = path.join(DIR, 'seen.json');
const UA = 'job-scan (personal job search)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const decode = (s) => s
  .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const stripTags = (html) => decode(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function getText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// SuccessFactors Career Site Builder: /search/ returns an HTML table (25 rows a page);
// descriptions live on each job page.
async function fetchSuccessFactors(c) {
  const jobs = [];
  for (let start = 0; ; start += 25) {
    const url = `${c.baseUrl}/search/?q=${encodeURIComponent(c.query || '')}&locationsearch=${encodeURIComponent(c.locationSearch || '')}&startrow=${start}`;
    const rows = [...(await getText(url)).matchAll(/<tr class="data-row">([\s\S]*?)<\/tr>/g)].map((m) => m[1]);
    for (const row of rows) {
      const href = row.match(/href="([^"]+)"[^>]*class="jobTitle-link"|class="jobTitle-link"[^>]*href="([^"]+)"/);
      const link = href && (href[1] || href[2]);
      if (!link) continue;
      // Paging isn't stable, so the same job can show up on two pages.
      const jobId = link.match(/\/(\d+)\/?$/)?.[1] || link;
      if (jobs.some((j) => j.jobId === jobId)) continue;
      jobs.push({
        jobId,
        company: c.name,
        source: 'successfactors',
        title: stripTags(row.match(/class="jobTitle-link"[^>]*>([\s\S]*?)<\/a>/)?.[1] || ''),
        location: stripTags(row.match(/class="colLocation[^>]*>([\s\S]*?)<\/td>/)?.[1] || ''),
        postedText: stripTags(row.match(/class="colDate[^>]*>([\s\S]*?)<\/td>/)?.[1] || ''),
        jobUrl: new URL(link, c.baseUrl).href,
        description: '',
      });
    }
    if (rows.length < 25) break;
    await sleep(500);
  }
  for (const job of jobs) {
    try {
      const html = await getText(job.jobUrl);
      const i = html.indexOf('class="jobdescription"');
      if (i >= 0) {
        const rest = html.slice(i);
        const end = rest.search(/class="joblayouttoken|<\/article>|class="applylink/);
        job.description = stripTags(rest.slice(rest.indexOf('>') + 1, end > 0 ? end : 20000));
      }
      const posted = html.match(/itemprop="datePosted" content="([^"]+)"/)?.[1];
      if (posted && !isNaN(Date.parse(posted))) job.publishedAt = new Date(posted).toISOString();
    } catch (e) {
      console.warn(`  description failed: ${job.title}: ${e.message}`);
    }
    await sleep(300);
  }
  return jobs;
}

async function fetchCompany(c) {
  if (c.provider === 'successfactors') return fetchSuccessFactors(c);
  return getJobs(c.provider, c.slug, { company: c.name, userAgent: UA });
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (terms) => terms.map((t) => ({ term: t, re: new RegExp(`(^|[^A-Za-z0-9])${escapeRe(t)}($|[^A-Za-z0-9])`, 'i') }));
const locRes = wordRe(config.locations || []);
const kwRes = wordRe(config.keywords || []);

function matches(job) {
  const locOk = !locRes.length || job.remote && config.includeRemote || locRes.some(({ re }) => re.test(job.location || ''));
  const haystack = (config.matchIn || ['title', 'description']).map((f) => job[f] || '').join(' \n ');
  const hits = kwRes.filter(({ re }) => re.test(haystack)).map(({ term }) => term);
  const titleHits = kwRes.filter(({ re }) => re.test(job.title || '')).map(({ term }) => term);
  return { ok: locOk && (!kwRes.length || hits.length > 0), hits, titleHits };
}

const csvCell = (v) => {
  const s = v == null ? '' : String(v).replace(/\r?\n/g, ' ');
  return /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

(async () => {
  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf8')); } catch { /* first run */ }
  const now = new Date().toISOString();
  const rows = [];
  let total = 0;

  for (const c of config.companies) {
    process.stdout.write(`${c.name} (${c.provider})... `);
    try {
      const jobs = await fetchCompany(c);
      total += jobs.length;
      let kept = 0;
      for (const job of jobs) {
        const m = matches(job);
        if (!m.ok) continue;
        const key = `${job.source}:${c.name}:${job.jobId}`;
        const isNew = !seen[key];
        if (isNew) seen[key] = now;
        rows.push({ ...job, key, isNew, firstSeen: seen[key], hits: m.hits, titleHits: m.titleHits });
        kept++;
      }
      console.log(`${jobs.length} jobs, ${kept} match`);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }

  // Title matches first (stronger signal), then newest.
  rows.sort((a, b) => (b.titleHits.length > 0) - (a.titleHits.length > 0) || b.isNew - a.isNew || String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
  const header = ['is_new', 'company', 'title', 'location', 'posted', 'matched_in_title', 'matched_keywords', 'url', 'first_seen', 'description_snippet'];
  const lines = rows.map((r) => [
    r.isNew ? 'NEW' : '', r.company, r.title, r.location, (r.publishedAt || r.postedText || '').slice(0, 10),
    r.titleHits.join('; '), r.hits.join('; '), r.jobUrl || r.applyUrl, r.firstSeen.slice(0, 10), (r.description || '').slice(0, 300),
  ].map(csvCell).join(','));
  fs.writeFileSync(OUT_CSV, '﻿' + [header.join(','), ...lines].join('\r\n') + '\r\n', 'utf8');
  fs.writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 1));
  console.log(`\n${total} jobs scanned, ${rows.length} matched (${rows.filter((r) => r.isNew).length} new) -> ${OUT_CSV}`);
})();
