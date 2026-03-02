# Client Q&A: Baywood / Facility Analytics

Answers to common questions about data freshness, PCC integrations, alerts, and criteria.

---

## 1. How real time is the Baywood data?

**Data is refreshed on a schedule, not live.**

- **Sync schedule:** Automated sync runs **4 times per day** (3:00, 9:00, 15:00, and 21:00 UTC) via Vercel Cron.
- **Per run:** Up to **50 patients** across all facilities are synced per run, chosen by “stalest first” (never-synced or oldest `last_synced_at`).
- **Staleness rule:** A patient is skipped if they were synced within the last **20 hours**, so we don’t re-sync the same people every run.
- **Practical effect:** For Baywood, a given patient’s data is typically no older than **about 6 hours** between cron runs, and often fresher when they’re in the “stalest 50” that run. It is **batch near–real-time**, not second-by-second real-time. There is no live push from PCC today.

---

## 2. What PCC integrations are you still missing?

**Currently integrated (11 PCC resources):**

| Resource            | Purpose |
|---------------------|--------|
| DIAGNOSTICREPORTS   | Labs (Hgb, Alb, etc.) |
| OBSERVATIONS        | Vitals (BP, blood sugar, pain, weight) |
| CONDITIONS          | Active diagnoses (ICD-10) |
| MEDICATIONS         | Active meds and directions |
| CAREPLANS           | Care plan focuses |
| ASSESSMENTS         | Assessment scores (e.g. MDS, fall risk) |
| ADTRECORD           | Location, room, bed, admit date |
| PROGRESSNOTES       | Progress note text (stored; see Q4) |
| ALLERGIES           | Allergies |
| IMMUNIZATIONS       | Immunizations |
| COVERAGES           | Insurance/coverage |

**What we’re not pulling today:**  
We only request the 11 resources above from the consumer service. If PCC (or your consumer API) exposes other resources (e.g. procedures, encounters, referrals, documents, orders), those are **not** integrated yet and can be added when needed.

---

## 3. Are real-time alerts live?

**Alerts are “live” in the UI but driven by the last sync/analysis, not by push.**

- **Notification bell:** Shows **critical** and **high** rule-based findings from the **last 24 hours** (from `analysis_results`).
- **Source:** Alerts are generated when the **scheduled sync + analysis** runs (same 4x-daily cron). There is no real-time event stream from PCC.
- **Summary:** Alerts are **current as of the last run** (e.g. after the 9:00 UTC run, you see alerts from that run until the next). So they are “live” when you open the app, but they are **batch-refresh alerts**, not instant push notifications.

---

## 4. Are you pulling progress notes? If so, how is the criteria being applied?

**Yes, we pull and store progress notes.**

- **Sync:** PROGRESSNOTES are fetched from PCC and stored in:
  - `progress_notes` (metadata: id, type, date, etc.)
  - `progress_note_sections` (section name + text, with full-text search).
- **Criteria today:** Progress note **text is not used** in the current scoring/criteria. The analysis engine (rule-based + AI) uses:
  - Labs (DIAGNOSTICREPORTS)
  - Conditions, medications, care plans, assessments
  - Vitals (OBSERVATIONS)
  - ADT (room, admit date)
- **Conclusion:** Progress notes are **available in the database** for future use (e.g. care gaps, NLP, protocol mapping). Criteria are **not** currently applied to progress note content; that is planned (e.g. care-gaps page) but not implemented.

---

## 5. What data sources are you missing that I'm not asking about?

- **Progress notes in criteria:** Stored but not yet used in risk/criteria logic (see Q4).
- **Real-time push:** No event or push feed from PCC; all updates are on the 4x-daily sync.
- **Other PCC resources:** Only the 11 listed in Q2 are integrated; any other PCC (or consumer API) resources would need to be added.
- **External lab feeds:** Labs are only from PCC (DIAGNOSTICREPORTS). Direct lab feeds or other lab systems are not connected.
- **Instant alerts:** Alerts are batch-based (after each cron run), not triggered the moment something changes in PCC.
- **Patient discovery:** New patients are added via a separate process (e.g. BI DB / admin sync), not automatically discovered from PCC in real time.

---

*Generated from the current codebase and sync/analysis design. Last updated: Feb 2025.*
