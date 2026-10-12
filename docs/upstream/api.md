# PoliAule - Public Data API

> [!NOTE]
> Historical: this describes the pre-migration vanilla-JS/Cloudflare Pages frontend (SummaCristian/PoliAule). See the root `README.md` and `docs/migration.md` for this repo's current React/TanStack architecture and GitHub Pages deployment.

PoliAule pre-fetches classroom occupancy data from Politecnico di Milano every morning and hourly during the day, and serves it through a small versioned REST API backed by Cloudflare Workers + R2. These endpoints are publicly accessible. If you want to build something on top of PoliMi classroom data, you can use them directly instead of scraping Politecnico yourself.

> [!IMPORTANT]
> PoliAule's API now has a new home!
> If you were using it before August 2026 (v1.0.0), the old URLs won't work anymore.
>
> Please update to the new ones, and sorry for the disruption. Please note that the new URLs provide feature parity with the previous ones, just relocated. The URL format has slightly changed as well, but the REST architecture remains the same

---

## Endpoints

All endpoints are under `https://api.poliaule.com` and require no authentication. A separate `https://api-beta.poliaule.com` serves the beta deployment with the same response shapes, though it may include in-progress changes.

### Static classroom metadata

```
GET /v1/classrooms
```

Returns the full list of campuses, buildings, and classrooms with their static attributes (name, location, features, seat count) and the flags that say whether a place or room can be used (`secondary`, `eventsOnly`, `noSchedule`, see the schema below). This data changes rarely and can be cached aggressively.

### Available dates

```
GET /v1/occupations
```

Returns the list of dates for which occupancy data currently exists. Fetch this first to know which dates are available before requesting individual dates. A `generated_at` timestamp is also included to indicate when the last fetch occurred and how fresh the data is. Use this one for freshness: each day's own `generated_at` (below) only moves when that day's data changes.

```json
{
  "generated_at": "2026-04-29T05:54:14.317071",
  "dates": ["20260429", "20260430", "20260501", "20260502", "20260503", "20260504", "20260505"]
}
```

### Daily occupancy

```
GET /v1/occupations/:date
```

Returns occupancy slots for all classrooms on a given date. `:date` is `YYYY-MM-DD` (e.g. `/v1/occupations/2026-04-29`).

Up to 7 dates are available at any time, covering today through the next 6 days. Data is regenerated early each morning (around 3 AM UTC) and then hourly during the day, roughly 07:00 to 20:00 Italian time. A date is skipped (no data generated) if it falls in a university holiday period, or if every building is closed that weekday according to `/v1/opening-hours` below.

### Building opening hours

```
GET /v1/opening-hours
```

Returns per-building opening hours, campus-wide defaults, and holiday closure periods, scraped weekly from PoliMi's official opening-hours page. Use this to know when a specific building (not just a specific room's booked slots) is actually open.

```json
{
  "generated_at": "2026-07-30T11:58:36.196790",
  "source_url": "https://www.polimi.it/campus-e-servizi/spazi-e-aule-studio/orari-di-apertura-edifici",
  "holiday_periods": [
    { "start": "2026-08-10", "end": "2026-08-21" }
  ],
  "buildings": {
    "21": { "mon_fri": ["07:30", "20:30"], "sat": ["08:00", "14:00"], "sun": null }
  },
  "campus_defaults": {
    "MIA01": { "mon_fri": ["07:00", "21:00"], "sat": ["07:00", "20:00"], "sun": null }
  },
  "default_hours": { "mon_fri": ["07:15", "20:15"], "sat": null, "sun": null }
}
```

To resolve a given building's hours: look it up in `buildings` by its number/code (the leading alphanumeric token of its `name` in `classrooms.json`, e.g. `"32.1"` → `"32"`); if not found, look up its campus `id` in `campus_defaults`; if that's also missing, use `default_hours`. `null` for `sat`/`sun` means closed that day.

### Classroom photos

```
GET /v1/photos/:id
```

Returns the classroom's photo as a JPEG image. `:id` is the classroom's stable `id` from `/v1/classrooms` (not PoliMi's internal `idfoto`). Only classrooms with a non-null `idfoto` have a photo; requesting any other id returns 404. Photos are re-fetched from PoliMi once a month, so responses are cacheable for a long time (`Cache-Control: public, max-age=2592000, immutable`).

---

## Response schemas

### `/v1/classrooms`

```
[                                   ← array of campuses
  {
    id:        string               // e.g. "MIA01"
    name:      string               // short display name, e.g. "Leonardo"
    slug:      string               // URL-safe identifier, e.g. "leonardo"
    city:      string               // e.g. "Milan"
    group:     string | undefined   // group within the city, e.g. "Città Studi" or "Bovisa" - omitted for single-campus cities
    lat:       number               // intended map centre for the campus
    long:      number
    secondary: true | undefined     // only present when true: nothing to book here (no classrooms, or only eventsOnly ones)
    zoom:      number | undefined   // map zoom for campuses whose buildings are too far apart for the default; omitted otherwise
    buildings: [
      {
        name:       string
        altName:    string | null
        address:    string
        lat:        number
        long:       number
        idEdificio: number | null
        secondary:  true | undefined   // only present when true: no classrooms, or only eventsOnly ones
        classrooms: [
          {
            id:                number   // stable room identifier
            name:              string   // e.g. "2.0.1"
            floor:             number | null   // parsed from name (X.Y.Z -> Y); null if not resolvable
            seats:             number | null
            accessible_seats:  number | null
            workstations:      number | null
            idfoto:            number | null   // photo reference
            eventsOnly:        true | undefined   // only present when true: usually closed outside official events (aule magne, auditoriums, department rooms, labs)
            noSchedule:        true | undefined   // only present when true: on neither PoliMi's occupancy page nor its REST API, so its occupancy is usually null
            features: [
              {
                id: number
                it: string   // feature name in Italian
                en: string   // feature name in English
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### `/v1/occupations/:date`

Same structure as `/v1/classrooms`, with a top-level metadata wrapper and an `occupancy` field added to each classroom. All campuses are present, including those with no classrooms (their buildings have an empty `classrooms` array). Campus-level metadata fields (`slug`, `city`, `group`, `zoom`) are **not** included here; fetch `/v1/classrooms` for those. The `secondary` (campus, building) and `eventsOnly` / `noSchedule` (classroom) flags are copied over from `/v1/classrooms`.

```
{
  generated_at: string   // ISO 8601 timestamp (UTC) of when this day's data last changed; an hourly run that finds
                         // nothing new keeps it, so the file and its ETag stay the same (a 304 for If-None-Match)
  date:         string   // "YYYYMMDD"
  campuses: [
    {
      id:        string  // campus identifier
      name:      string  // short display name
      lat:       number
      long:      number
      buildings: [       // same building/classroom fields as classrooms.json
        {
          ...
          classrooms: [
            {
              ...             // includes `floor`, as in /v1/classrooms
              occupancy: [   // list of BOOKED time slots (not free slots), or null when the schedule is unknown (see below)
                {
                  inizio: string        // start time, "HH:MM"
                  fine:   string        // end time,   "HH:MM"

                  // The fields below are scraped separately from onlineservices.polimi.it
                  // and merged in by start/end time; a slot keeps only inizio/fine when the
                  // scrape didn't cover it (network error, unrecognized campus, parse failure).
                  category:     string | undefined         // "COURSE" | "EXAM" | "OTHER"
                  idrichiesta:  number | undefined          // Polimi's internal booking id

                  // category === "COURSE" or "EXAM" only:
                  course:       string | undefined
                  code:         number | undefined          // course code, e.g. 54324
                  professors:   string[] | undefined
                  section:      string | undefined          // e.g. "Sez. A", only present for multi-section courses

                  // category === "OTHER" only (exams, events, tutoring, maintenance, ...):
                  raw:          string | undefined          // the unparsed scraped name
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

Each entry in `occupancy` represents a time slot in which the classroom is **not available** (booked or in use). A classroom with an empty `occupancy` array is free for the entire day.

`occupancy` can also be `null`, which means the schedule is **unknown**, not that the room is free. It happens when no source has the room (classrooms flagged `noSchedule`, with no page row) or when the REST fallback for it failed. Never treat `null` as an empty schedule: exclude such rooms from "free room" results and show them as "schedule not available". Older data wrote these failures as `[]`.

### Flags and what to do with them

| Flag | Where | Meaning | For a "free classrooms" feature |
|---|---|---|---|
| `secondary` | campus, building | Nothing to book there | Skip it (it can still go on a map) |
| `eventsOnly` | classroom | Generally closed outside official events | Never offer it as available |
| `noSchedule` | classroom | No schedule source, `occupancy` is `null` unless a page row appears | Skip it, status unknown |

Flags only appear when true, so treat a missing flag as `false`. Treat every field added since v1 as optional: older data doesn't have it.

---

## Known campuses

| ID | Name | Slug | City | Group |
|---|---|---|---|---|
| `MIA01` | Leonardo | `leonardo` | Milano | Città Studi |
| `MIA06` | Colombo | `colombo` | Milano | Città Studi |
| `MIB01` | La Masa | `la-masa` | Milano | Bovisa |
| `MIB02` | Durando | `durando` | Milano | Bovisa |
| `CRG02` | Cremona | `cremona` | Cremona | — |
| `LCF04` | Lecco | `lecco` | Lecco | — |
| `MNG01` | Mantova | `mantova` | Mantova | — |
| `PCL01` | Piacenza | `piacenza` | Piacenza | — |
| `MIA05` | Mancinelli | `mancinelli` | Milano | Città Studi |
| `MIF01` | Tortona | `tortona` | Milano | — |
| `MIC` | Residenze | `residenze` | Milano | Servizi |
| `MID01` | Sesto Ulteriano | `sesto-ulteriano` | Sesto Ulteriano | — |
| `COE04` | Como | `como` | Como | — |
| `GEM01` | Genova | `genova` | Genova | — |

`MIA05`, `MIF01`, `MIC`, `MID01`, `COE04` and `GEM01` are `secondary`: they have no bookable classrooms. `MIC`, `COE04` and `GEM01` also carry a `zoom` (10.5, 14.9, 13.5).

---

## Known room features

| ID | English label |
|---|---|
| `4` | Video projector |
| `5` | Radio microphone |
| `6` | Dimmable (blinds) |
| `7` | Wired desk |
| `142` | Seats with electric socket |
| `223` | Videoconference / meeting |

---

## Security & data safety

### What we do on our end

String fields in the occupancy files pass through a tag-stripping step before being written. Any `<...>` sequences that the upstream Polimi API might return are removed at ingestion time, so the files you receive will never contain raw HTML tags.

### What you should do on your end

**Tag stripping is not a substitute for output escaping.** Stripping tags removes the most obvious attack shape, but a determined payload can survive in other forms (e.g. attribute injection, URL schemes). If you render any string field from these files into an HTML page, escape it at the point of rendering.

**JavaScript**

```js
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// Safe:
el.innerHTML = `<span>${escapeHtml(classroom.name)}</span>`;

// Also safe (no escaping needed — textContent never parses HTML):
el.textContent = classroom.name;
```

**Python**

```python
import html

# Safe:
snippet = f"<span>{html.escape(classroom['name'])}</span>"
```

**URLs in href / src attributes**

The `features` array does not contain URLs. If you ever construct links from field values, validate that the URL uses `https:` before placing it in an `href` or `src` attribute — a value like `javascript:…` is syntactically valid in those attributes and will execute on click.

```js
function safeUrl(url) {
  try { return new URL(url).protocol === 'https:' ? url : '#'; }
  catch { return '#'; }
}
```

---

## Usage notes

- **CORS**: the API is served by a Cloudflare Worker and is accessible from any origin via `fetch()`.
- **Caching**: occupancy data is regenerated hourly during the day. Cache responses for up to an hour on your side to stay reasonably fresh without hammering the API.
- **Missing dates**: if a given date returns 404, the date was skipped (every building closed that weekday, or a holiday) or the scheduled job has not run yet.
- **Null fields**: optional fields (`idfoto`, `workstations`, `accessible_seats`, etc.) may be `null` if Politecnico did not provide them for a given room. `occupancy` is different: `null` there means the schedule is unknown, not free (see above).
- **Freshness**: use `generated_at` from `/v1/occupations`. A day file's own `generated_at` only changes when that day's data does, so it can be old on fresh data.

---

## Example: finding free rooms

```js
const date = '2026-04-29';
const res = await fetch(`https://api.poliaule.com/v1/occupations/${date}`);
const { campuses } = await res.json();

const campus = campuses.find(c => c.id === 'MIA01');

for (const building of campus.buildings) {
  if (campus.secondary || building.secondary) continue; // nothing to book there
  for (const classroom of building.classrooms) {
    // occupancy === null means unknown, not free
    const isFullyFree = Array.isArray(classroom.occupancy) && classroom.occupancy.length === 0;
    if (isFullyFree && !classroom.eventsOnly) console.log(classroom.name, '- free all day');
  }
}
```
