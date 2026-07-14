# Spider Graph Research Mega-Prompt

Paste everything below into a research bot with web access. Written 2026-07-12.

---

You are a research analyst for a fitness app. Your job: answer 50 design questions using REAL, verifiable published sources, and bring back the exact numbers and tables listed at the end. You have web access — use it. Do not answer from memory alone.

## CONTEXT — THE APP AND THE SPIDER GRAPH

The app (Stryve / RiseForIt) gamifies fitness with a 6-axis spider graph, each axis scored 0–100:

1. **Strength** — lifting performance
2. **Cardio** — aerobic fitness and weekly cardio volume
3. **Consistency** — showing up: workouts, daily check-ins, logging
4. **Nutrition** — eating on plan: calories, protein, logged meals
5. **Recovery** — sleep and rest management
6. **Progress** — measurable movement toward the user's stated goal (weight trend, measurements, lift progression)

The graph IS the rank. Users hold a rank (King > Knight > specialist classes Berserker/Ranger/Mage > Squire > Peasant) based on absolute score gates — **unlimited people can hold any rank**; there are no leaderboard seats. Design intent: **King must be brutally hard** (sustained top ~0.5–1% behavior + performance across ALL six axes for 8+ weeks), Knight hard (~top 10%), and it gets easier going down. Everyone starts a Peasant.

Data the app already has per user: onboarding answers (gender, age, height, weight, goals, activity habits), daily check-ins (weight, sleep hours, meals-on-plan, water, stress, steps, measurements), completed workouts from its own training programs (sets/reps/weights logged), and OAuth integrations with **Strava and Fitbit**. Stats currently grow from a rolling 14-day activity window and decay when idle.

**Core fairness principle:** scores are relative to the person's own potential — a 135-lb woman benching 180 must outscore a 250-lb man benching 315. Every performance axis must be normalized by **sex, age, and bodyweight**. On top of the normalized standard sits a second layer: improvement vs. the user's own baseline ("best self"), so progress counts even when absolute numbers are modest.

**Anti-cheat / verification ideas under consideration (evaluate them):**
- A daily alarm that rings for ~3 minutes on the site/app, then auto-dismisses; missing it costs the day's consistency mark.
- GPS ping: user within X distance of their gym = verified session (owner proposed 0.5 miles — sanity-check that radius against GPS accuracy and urban gym density).
- Workout plausibility timer: each generated workout has a projected duration from its sets/reps/rest; finishing a 45-minute workout in 10 seconds voids the points. Forgetting to submit until later should NOT void it.
- Trust ladder instead of binary voiding: device-verified data earns ×1.0 credit, plausible self-report ×~0.7, implausible ×0.

## RULES OF EVIDENCE

- Every numeric claim needs a source: **author/organization, year, title, and working URL**. Primary sources (peer-reviewed papers, official guidelines, raw datasets) beat blogs. Reputable secondary sources (Stronger by Science, ExRx, Examine) are acceptable when they cite primaries — link both.
- If a source is paywalled, say so and find the abstract or an open-access mirror.
- If the evidence is genuinely thin (e.g., streak psychology in fitness apps), say "evidence is thin" and give the best available plus your reasoned recommendation, clearly labeled as opinion.
- Never invent table values. If you cannot find a number, mark it MISSING rather than guessing.
- When sources disagree, present both and recommend one with reasoning.

## THE 50 QUESTIONS

### A — Profile & normalization
1. Which profile fields are mandatory to normalize scores (sex, age, bodyweight, height, training age), and what does each axis actually need?
2. What bodyweight adjustment should strength use: multiple-of-bodyweight bands, allometric scaling (load ÷ BW^0.67), or competition coefficients (DOTS / IPF GL)? Which is most defensible for a consumer app?
3. What are the female:male strength ratios PER LIFT (bench vs squat vs deadlift — they differ; one global factor is wrong)?
4. What age adjustment curve applies — masters coefficients above ~40, junior scaling under ~20 — and roughly how much per year?
5. How should training age be estimated from onboarding + logs, and should it change score targets or only expected climb speed?
6. Bodyweight source of truth — onboarding vs latest weigh-in; how stale before strength scores freeze?
7. Does height matter to any axis, or can it be dropped from scoring?
8. What guardrails for under-18s, pregnancy, and injury flags — cap, annotate, or exclude from rank gates?

### B — Strength
9. Which lifts form the strength signal (big 3 + OHP?), and how do dumbbell/machine movements convert for users who never barbell train?
10. Which 1RM estimator for logged sets (Epley vs Brzycki), and past what rep count does estimation become unreliable?
11. Which percentile tables become canon: OpenPowerlifting-derived percentiles, StrengthLevel crowdsourced tables, or ExRx/Kilgore bands — by sex × bodyweight × age?
12. Where should the 0/25/50/75/100 anchors sit on those tables (e.g., 50 = intermediate, 100 = 99th percentile for the user's demographic)?
13. What split between absolute-standard points and improvement-vs-own-baseline points (evaluate 60/40)?
14. How should bodyweight change interact with the score (cutting user: absolute lifts dip, relative strength holds — which wins)?
15. Should self-reported PRs count, and what rate-of-change cap flags fakes (e.g., +15% 1RM in a week)?
16. How many strength sessions/week keep the score live vs stale-and-decaying?

### C — Cardio
17. Canonical cardio metric: estimated VO2max, weekly minutes-at-intensity, benchmark times, or a composite?
18. Which self-administered field tests should the app support (Cooper 12-min, 1.5-mile run, Rockport 1-mile walk) and what are their sex/age norm tables?
19. How should Strava/Fitbit data convert into the metric — HR zones when available, pace when not, steps only as weak fallback (currently 8,000 steps = 1 cardio credit)?
20. Where do WHO volume anchors sit on 0–100 (is 150 min/week moderate = 50 points? 300+ = 75?)?
21. Without HR data, how is intensity graded — pace tables, session-RPE, MET values per activity?
22. Which VO2max percentile grid to normalize against (FRIEND registry / ACSM), sliced by sex and age decade?
23. Should resting HR / HRV contribute cardio points when a wearable exists, and at what weight?

### D — Consistency (in the context of this app)
24. What is an "active day": workout, check-in, meal log, cardio — equal or weighted credit, and what minimum bar makes the day count?
25. Should consistency measure adherence-to-own-plan (3 of 3 scheduled) or raw frequency (5 days regardless)? What does adherence literature actually measure?
26. For the daily alarm check-in idea: what grace window and time flexibility does habit/prompt research support before it becomes churn-inducing?
27. For GPS gym validation: what geofence radius is defensible given real GPS accuracy and urban gym density (evaluate the proposed 0.5 mi vs something like 150–250 m + minimum dwell time), and what fallback hierarchy covers home-gym users and disabled trackers?
28. For the workout plausibility timer: what published rest-interval and rep-tempo norms parameterize a minimum-plausible-duration formula (sets × (reps × rep time + rest)), and what threshold should void (e.g., <40% of projected)? How long a late-submission window still earns credit?
29. Streak mechanics: do earned freezes (sick/vacation) preserve motivation without making the stat gameable — what does loss-aversion/gamification evidence say?
30. What rolling window should the stat live on (7/14/28 days; currently 14) and should recent days weigh more?
31. What anchors 100 (e.g., ~95% of planned days for 8+ weeks) vs 50 (~65%)?

### E — Nutrition (in the context of the app's logging)
32. What makes a day "on plan": calories within ±10%, protein floor hit, merely logged — or tiered credit?
33. Exact protein targets by goal and sex (evidence range 1.6–2.2 g/kg; higher per lean mass when cutting) — recommend specific numbers per goal.
34. Which BMR formula (Mifflin-St Jeor?) plus activity multipliers set calorie targets, and how wide an adherence band is defensible?
35. Should diet QUALITY (protein distribution, fiber, whole-food share) enter the stat, or adherence only?
36. How many logged days/week does self-monitoring research say predicts outcomes — the anchor for partial-week credit?
37. How to detect junk logging — identical daily entries, calories impossible against the bodyweight trend (cross-check with the Progress axis)?

### F — Recovery
38. How should sleep duration (7–9 h), sleep regularity (bedtime variance), and self-rated restedness each weigh within the axis?
39. Which automatic sources first: Health Connect (Android) / HealthKit (iOS) as aggregators vs direct Fitbit, plus open-source paths (Sleep as Android export, Gadgetbridge) — and what data fields does each expose?
40. Is a manual morning check-in (hours + rested 1–5) scientifically defensible — anchored to the Perceived Recovery Status scale?
41. HRV: include or not — and if so, how many days of rMSSD establish a personal baseline before it scores?
42. Should the axis reward planned rest and punish 7-day/week grinding — on what training-load evidence (ACWR, session-RPE)?
43. Does wake-time regularity (the alarm doubles as this signal) belong to Recovery or Consistency, and what does Sleep Regularity Index research support?

### G — Progress
44. Which evidence streams count — bodyweight trend toward goal, tape measurements, lift progression (volume load), photos — and at what weights?
45. Realistic-rate anchors: muscle gain %BW/month by training age, fat loss %BW/week — and should MATCHING the realistic rate score higher than exceeding it (crash-cut protection)?
46. How does a maintenance goal score, where a flat trend IS success?
47. How to separate signal from scale noise — trend weighting (7-day EMA?), and minimum logging cadence before the axis moves?

### H — Ranks, decay, integrity
48. Rank gates: what per-axis floors + overall averages make King ≈ sustained top ~0.5–1%, Knight ≈ top ~10%, Squire reachable in weeks — expressed as absolute 0–100 numbers, unlimited holders?
49. Decay: what does detraining research say per axis (strength retention vs VO2max loss vs habit collapse when idle), mapped to per-axis grace days + decay rates?
50. The trust ladder: which signals are device-verifiable per axis, and what credit multiplier should each tier earn so verification raises ceilings without gatekeeping beginners?

## SEARCH PROMPTS TO RUN

Run these as web searches (adapt freely; follow citations backward to primaries):

**Strength standards & normalization**
- "OpenPowerlifting data download CSV" (openpowerlifting.org — get the raw dataset link)
- "strength standards by bodyweight age sex bench squat deadlift strengthlevel"
- "ExRx strength standards Kilgore untrained novice intermediate advanced elite"
- "IPF GL points formula coefficients 2020" and "DOTS formula powerlifting coefficients"
- "McCulloch age coefficients masters powerlifting table"
- "female male strength difference upper lower body meta-analysis"
- "allometric scaling strength bodyweight exponent 0.67"
- "Epley Brzycki 1RM formula accuracy rep range study"

**Cardio**
- "FRIEND registry VO2max reference standards Kaminsky"
- "ACSM cardiorespiratory fitness percentile table age sex"
- "Cooper 12 minute run test norms table age sex"
- "Rockport one mile walk test VO2max equation validation"
- "WHO physical activity guidelines 2020 150 300 minutes"
- "Compendium of Physical Activities 2024 MET values"
- "resting heart rate norms age sex percentile"

**Nutrition**
- "Morton 2018 protein meta-analysis British Journal Sports Medicine 1.62"
- "ISSN position stand protein exercise 2017"
- "Helms macronutrient recommendations natural bodybuilding contest preparation"
- "Mifflin St Jeor equation validation accuracy"
- "dietary self-monitoring frequency weight loss Burke systematic review"
- "food logging adherence app days per week outcomes study"

**Recovery / sleep**
- "National Sleep Foundation sleep duration recommendations Hirshkowitz 2015"
- "AASM consensus recommended sleep amount adults Watson 2015"
- "sleep regularity index mortality Windred 2024"
- "perceived recovery status scale Laurent 2011"
- "HRV rMSSD 7 day rolling average baseline Plews smallest worthwhile change"
- "acute chronic workload ratio critique Gabbett injury"
- "session RPE training load Foster method"
- "Health Connect sleep data types documentation" / "HealthKit sleep analysis stages API" / "Fitbit Web API sleep endpoint" / "Gadgetbridge supported devices data" / "Sleep as Android export format"

**Progress rates**
- "Lyle McDonald muscle gain rate model year of training"
- "Alan Aragon muscle gain rate percentage bodyweight monthly"
- "Garthe 2011 weight loss rate athletes lean mass performance"
- "daily body weight fluctuation variability study percent"
- "trend weight exponential moving average Hacker's Diet"

**Consistency / behavior / anti-cheat**
- "Lally 2010 habit formation 66 days automaticity"
- "exercise adherence dropout 50 percent six months Dishman"
- "gamification streaks loss aversion fitness app retention study"
- "Duolingo streak freeze retention design"
- "implementation intentions exercise prompts meta-analysis"
- "Android geofencing API radius accuracy recommendations minimum"
- "GPS accuracy smartphone urban meters study"
- "rest interval between sets hypertrophy strength de Salles review"
- "Schoenfeld rest interval study 1 minute 3 minutes"
- "repetition duration tempo average seconds resistance training"
- "detraining strength loss timeline weeks study" and "VO2max detraining 2 4 weeks percent decline"

## WHAT TO DELIVER BACK

Part 1 — **Answers**: every one of the 50 questions answered in 2–6 sentences, each with a concrete recommended number/rule and its citations (title, author/org, year, URL).

Part 2 — **Data tables** (markdown or CSV; include source URL per table; mark gaps MISSING):
1. `strength_standards` — sex × age band × bodyweight (lb, 90–310 in ~20-lb steps) × lift (squat/bench/deadlift/OHP) → values at the 5 anchor levels or percentiles (p20/p50/p80/p95/p99).
2. `age_coefficients` — age → strength multiplier (masters + junior).
3. `bw_adjustment` — DOTS or IPF-GL constants for men and women, with the formula written out.
4. `female_male_ratios` — per-lift ratio with source.
5. `cardio_norms` — sex × age decade → VO2max percentiles (p20–p95) + Cooper 12-min distance bands + weekly-minutes anchors.
6. `met_values` — 20 most common cardio activities → MET.
7. `nutrition_targets` — per goal (cut/maintain/gain) × sex → protein g/kg, calorie band %, logging-days threshold.
8. `sleep_bands` — age band → recommended hours + regularity metric recommendation.
9. `progress_rates` — training age → realistic muscle gain %BW/month; safe fat loss %BW/week; daily scale noise %.
10. `duration_model` — rest seconds by exercise type/intensity + average rep duration, assembled into a minimum-plausible-workout-duration formula.
11. `decay_model` — per axis: grace days + points/day decay, each justified by a detraining citation.
12. `rank_gates_proposal` — per rank: required per-axis floor + average + sustain weeks, with the population-% reasoning.
13. `trust_ladder` — per axis: verifiable signals available, and recommended credit multiplier per verification tier.
14. `integration_notes` — for Health Connect, HealthKit, Fitbit API, Strava API, Sleep as Android, Gadgetbridge: what sleep/activity fields exist, auth model, rate limits, export format.

Part 3 — **Red flags**: anywhere the app's current ideas conflict with evidence (e.g., 0.5-mile geofence too wide, alarm too punishing), say so bluntly and propose the fix.
