# scan

Scans company career boards for roles that match your locations and keywords, and writes them to `scan/jobs.csv`. No AI, no logins: it reads the public job-board endpoints the ATS vendors expose.

Supported: every provider in this library (Ashby, Lever, Greenhouse, Workable, Recruitee, Teamtailor, Pinpoint, SmartRecruiters, Workday, Keka) plus SAP SuccessFactors career sites.

## Run

From the repo root:

```sh
npm install
npm run scan                     # uses scan/config.json
npm run scan -- other.json       # or another config in scan/
```

## Config

```json
{
  "companies": [
    { "name": "ANZ", "provider": "successfactors", "baseUrl": "https://careers.anz.com", "locationSearch": "New Zealand" },
    { "name": "GitLab", "provider": "greenhouse", "slug": "gitlab" },
    { "name": "NVIDIA", "provider": "workday", "slug": "nvidia/wd5/NVIDIAExternalCareerSite" }
  ],
  "locations": ["New Zealand", "NZ", "Auckland", "Wellington"],
  "keywords": ["infrastructure", "cloud", "devops", "site reliability"],
  "matchIn": ["title", "description"],
  "includeRemote": false
}
```

- `slug` is the company's id in its careers URL, e.g. `gitlab` in `boards.greenhouse.io/gitlab`. Workday takes `tenant/wdHost/site`.
- `locations` and `keywords` are whole-word, case-insensitive. A job must match a location and at least one keyword. Leave a list empty to skip that filter.
- `includeRemote: true` also keeps remote jobs outside your locations.

## Output

`jobs.csv`: `is_new, company, title, location, posted, matched_in_title, matched_keywords, url, first_seen, description_snippet`. Title matches sort first, then new jobs.

`seen.json` remembers jobs from earlier runs, so `is_new` flags only jobs that weren't there last time. Delete it to start fresh.
