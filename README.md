# ats-jobs

Fetch and normalize public job listings from ten applicant-tracking systems into one shape.

Ashby · Lever · Greenhouse · Workable · Recruitee · Teamtailor · Pinpoint · SmartRecruiters · Workday · Keka

```sh
npm install ats-jobs
```

```js
const { getJobs, normalize } = require('ats-jobs');

// fetch + normalize
const jobs = await getJobs('lever', 'ro');

// or normalize data you fetched yourself (an array, or { jobs: [...] })
const same = normalize('lever', rawLeverArray, 'Ro');
```

Each job looks like:

```js
{ jobId, company, source, title, location, team, department, employmentType, remote,
  description, applyUrl, jobUrl, publishedAt, scrapedAt, compensationSummary,
  compensationMin, compensationMax, compensationCurrency, compensationInterval, contentHash }
```

## Slugs

The slug is the company's id on that vendor, e.g. `ro` in `jobs.lever.co/ro`.
Workday takes `tenant/wdHost/site` (`nvidia/wd5/NVIDIAExternalCareerSite`). Teamtailor boards in North America keep the region (`acme.na`).

## Options

`getJobs(provider, slug, { company, userAgent, timeoutMs, maxRetries, retryBaseMs })`. Failures throw `FetchError` (`.statusCode`, `.retryable`). 5xx, 429 and network errors are retried with backoff.

## Notes

- Descriptions are stripped to plain text and only `http(s)` URLs are kept.
- Optional: install `cities.json` (19 MB) to correct city typos; without it, cleaned city names are used as-is.
- SmartRecruiters returns at most 100 postings per board; Workday at most 200.
- Workday, Keka, Teamtailor and Pinpoint use unofficial endpoints that can change without notice.
- `npm run live` checks every provider against the real APIs.

MIT
