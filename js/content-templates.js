/* RiseForIt — Content Program template library.
   NO AI. Every line is a fixed template with {variables} slotted in from the
   trainer's questionnaire answers. Add/edit templates here freely — nothing in
   the engine is hard-coded to a specific template, it just cycles these arrays.

   Slots available in templates:
     {audience} {outcome} {core} {support1} {support2}
     {mistake1} {mistake2} {mistake3} {mistake}  (cycling mistake)
     {story} {proofName} {proofResult} {objection} {name} {link}

   RULES baked into the copy:
   - Hooks name the GROUP ({audience}), never "you".
   - Win posts lead with the wrong belief, not the number.
   - Mistake posts reveal the problem, hint the fix, never hand it over.
   - The CTA is the same every time (see CTA below) — that repetition is the point.
*/
(function () {
  'use strict';

  var LIB = {
    // ---- HOOKS (≥15). Always name the group. Used to open Mistake posts and
    // shown in the UI to teach the rule. {mistake} cycles mistake1/2/3/4+. ----
    hooks: [
      'Most {audience} are stuck because {mistake}.',
      'Three mistakes I see {audience} make every single week.',
      '{audience} think {mistake} is helping. It’s doing the opposite.',
      'Nobody tells {audience} this, but {mistake} is why nothing’s changing.',
      'If {audience} want to {outcome}, this is the part everyone skips.',
      'The reason most {audience} quit at week three.',
      '{audience} don’t need more discipline. They need to stop {mistake}.',
      'Every week I watch {audience} do {mistake} and wonder why it’s not working.',
      'The hardest truth for {audience}: {mistake} is the whole problem.',
      '{audience} keep chasing the wrong thing. It’s {mistake}.',
      'This is why {audience} stay exactly where they are for years.',
      '{audience} were never taught this, so they keep doing {mistake}.',
      'If you train {audience}, you’ve seen {mistake} a hundred times.',
      'The one habit quietly holding {audience} back: {mistake}.',
      '{audience} think they need more. They actually need to fix {mistake}.',
      'What no one says out loud to {audience} about {mistake}.',
      '{audience} could {outcome} a lot faster if they stopped {mistake}.'
    ],

    // ---- WIN posts (≥15). Belief-first. Full script bodies; the engine adds
    // the CTA. Lead with what {proofName} believed that was wrong. ----
    win: [
      '{proofName} was sure they’d tried everything.\nThey hadn’t — they’d just never fixed {mistake1}.\nOnce that clicked, the work finally started paying off.\nThe result: {proofResult}.',
      'When {proofName} started, they thought {mistake2} was normal.\nIt wasn’t. It was the thing quietly stalling them.\nWe changed one habit, not ten.\n{proofResult}. That’s it. That’s the whole story.',
      '{proofName} told me they “just didn’t have the genetics.”\nWhat they didn’t have was a plan built around {core}.\nWe fixed that first.\n{proofResult}.',
      '{proofName} believed they had to be perfect or it didn’t count.\nThat belief was the problem.\nWe traded perfect for consistent.\n{proofResult}.',
      'Everyone told {proofName} to do more.\nI told them to do less, but do it around {core}.\n{proofResult} — and they’re not burnt out.',
      '{proofName} thought the scale was the scoreboard.\nIt never was.\nWhen they started measuring the right things, everything moved.\n{proofResult}.',
      '{proofName} was one bad week from quitting for good.\nThe fix wasn’t motivation. It was removing {mistake3}.\n{proofResult}.',
      'For years {proofName} assumed {outcome} wasn’t for people like them.\nIt is. It always was.\nThey just needed the right first step.\n{proofResult}.',
      '{proofName} kept restarting every Monday.\nThe restart was the trap.\nWe built something they didn’t need to restart.\n{proofResult}.',
      '{proofName} thought discipline was the missing piece.\nIt wasn’t. Their plan was fighting them.\nWe made the plan fit their life instead.\n{proofResult}.',
      'The day {proofName} stopped chasing {mistake1}, things finally changed.\nNot overnight. But steadily, and for good.\n{proofResult}.',
      '{proofName} came to me exhausted from trying.\nThe answer was fewer moving parts, built on {support1}.\n{proofResult}.',
      '{proofName} didn’t believe me at first.\nSix weeks in, the mirror did the convincing.\n{proofResult}.',
      'What changed for {proofName} wasn’t effort — they always had effort.\nIt was direction. We pointed it at {core}.\n{proofResult}.',
      '{proofName} was doing everything “right” and going nowhere.\nTurns out “right” online and right for them were two different things.\n{proofResult}.',
      '{proofName} thought they’d left it too late.\nThey hadn’t. The body responds at any age when the plan is honest.\n{proofResult}.'
    ],

    // ---- MISTAKE posts (≥15). Body after the hook. Reveal → cost → why stuck
    // (tie to {core}) → HINT the fix, never give it. Engine adds hook + CTA. ----
    mistake: [
      'Here’s what it’s actually costing: months of effort with nothing to show.\nThey stay stuck because no one connected it to {core}.\nThe fix is simpler than they think — and it’s the first thing I change.',
      'It feels productive, which is exactly why it’s dangerous.\nThe real issue ties straight back to {core}.\nOnce you see it, you can’t unsee it — and it takes about a week to fix.',
      'This one quietly wastes the effort they’re already putting in.\nThey’re stuck because they’re solving the wrong problem.\nThe fix starts with {core}, not with doing more.',
      'It’s the reason the scale won’t move even when they’re “being good.”\nThe missing piece is {core}.\nSmall change, big difference — but you have to know where to look.',
      'Every week they do this, they set themselves back without noticing.\nThe root of it is {core}.\nThe fix isn’t harder work. It’s the opposite.',
      'This is why they plateau and blame themselves.\nIt’s not them. It’s that nobody built their plan around {core}.\nThat’s the first thing worth fixing.',
      'It looks like the healthy choice. It’s the one holding them back.\nThe reason is {core}.\nThere’s a cleaner way — and it’s not what the internet told them.',
      'They think this is the part that’s working. It’s the part that isn’t.\nStuck comes down to {core}.\nThe fix is one adjustment, not a whole overhaul.',
      'This costs them the one thing they can’t get back: time.\nAnd it all traces to {core}.\nThe good news — it’s fixable fast once you name it.',
      'It’s the habit that feels like discipline but acts like a brake.\nThe real lever is {core}.\nThat’s where I’d start, not where most people do.',
      'Doing this is why “eating clean” still isn’t working for them.\nThe answer is {core}.\nThere’s a smarter first move — and it’s not another diet.',
      'This keeps them busy and gets them nowhere.\nThe thing they’re missing is {core}.\nOnce that’s in place, the rest gets a lot easier.',
      'It’s the reason motivation keeps running out on them.\nMotivation was never the problem — {core} was.\nFix that and you stop needing willpower.',
      'They’ve been told this is what serious people do. It isn’t.\nThe real work is {core}.\nStart there and the results start showing up.',
      'This is the quiet reason they keep starting over.\nThe pattern breaks when you build around {core}.\nThat’s the shift — and it’s not complicated.',
      'It drains their week and leaves them frustrated by Friday.\nUnderneath it all is {core}.\nThe fix is the first thing I’d hand them — in the right order.'
    ],

    // ---- APP posts (≥12). Lead magnet, one day/week. Full script bodies.
    // Point at the free app + {link}. Engine adds CTA. ----
    app: [
      'If {audience} want to {outcome}, start here — for free.\nI put my people on this app before they ever pay me a dollar.\nIt builds them a plan, tracks the basics, and keeps them honest.\nGrab it at the link. No card, no catch.',
      'The fastest way for {audience} to {outcome} without guessing?\nThe free app I give every one of my clients.\nIt handles the plan so they can just show up.\nLink’s below — it’s genuinely free.',
      'Before {audience} spend a cent, I want them on this.\nIt’s the free app that gets them moving toward {outcome} today.\nWorkouts, food, progress — in one place.\nTap the link and start.',
      'Most {audience} overcomplicate the start. This removes that.\nThe free app I use with clients gives them the first plan instantly.\nNo more “where do I even begin.”\nIt’s free at the link.',
      '{audience} don’t need me to begin. They need a starting point.\nThat’s exactly what this free app is.\nIt maps out {outcome} step by step.\nGrab it below.',
      'I’d rather {audience} start free and win small than pay and quit.\nSo here’s the app I put everyone on first.\nIt does the planning for them.\nLink’s in bio — free.',
      'If you’re one of the {audience} who keeps meaning to start, this is your nudge.\nThe free app builds your first week for you.\n{outcome} starts with one tap.\nIt’s at the link.',
      'The free tool I give {audience} to {outcome}:\nA plan, a tracker, and a reason to show up daily.\nNo cost, no pitch.\nStart at the link.',
      'Every client of mine starts on this app. Now {audience} can too, free.\nIt takes the thinking out of week one.\nThat’s usually the week people quit.\nLink below.',
      '{audience} ask me where to start. This is the honest answer.\nThe free app that’s built for exactly this.\nIt points them straight at {outcome}.\nTap the link.',
      'No budget yet? Good — {audience} can still start today.\nThis free app gives them the plan I’d hand a paying client.\nUse it as long as you want.\nIt’s at the link.',
      'The lowest-risk first step for {audience} to {outcome}:\nDownload the free app, let it build your plan, show up.\nThat’s the whole ask.\nLink’s below.',
      'I built my coaching around this free app for a reason.\nIt gets {audience} results before we ever talk money.\nStart there.\nLink in bio.'
    ],

    // ---- STORY slots. 5 a day: Lead / Relate / Attack. Each slot cycles its
    // variants. {audience} {core} {story} {outcome} {link} slot in. ----
    stories: {
      // 1 — Morning: up and moving (Lead)
      lead_morning: [
        'Up. Moving. Before the day gets a vote.',
        'Alarm went off, feet hit the floor. That’s the whole win before 6am.',
        'Nobody’s watching this early. That’s exactly why it counts.',
        'First thing done. Everything after this is easier.',
        'Morning. Coffee. Work. In that order.'
      ],
      // 2 — A thought, tied to {core} (Lead + Relate)
      lead_thought: [
        'The thing I’m known for — {core} — isn’t a trick. It’s just the part most people skip.',
        'If you only fixed one thing this month, make it {core}. Everything else follows.',
        'Most {audience} chase the flashy stuff. The boring answer is {core}.',
        'I keep coming back to {core} because it’s the piece that actually moves people.',
        'You don’t need more information. You need {core}, done consistently.'
      ],
      // 3 — A client or your own progress (Relate)
      relate_progress: [
        'Watched a client hit a number today they didn’t think was possible. Reminder: it usually is.',
        'What changed for me: {story}. Now I help {audience} do the same.',
        'One of my people just strung together their best week. Not perfect — consistent.',
        'Progress from someone I coach this week. Quiet, steady, real.',
        '{story}. That’s the whole reason I do this.'
      ],
      // 4 — What you're literally doing right now (Relate)
      relate_now: [
        'Right now: doing the exact thing I tell {audience} to do. Leading from the front.',
        'Mid-session. This is the work. No shortcut version of it.',
        'This is what “show up” actually looks like on a normal Tuesday.',
        'Not motivated today. Doing it anyway. That’s the skill.',
        'Filming this between sets because {audience} deserve to see the boring reps too.'
      ],
      // 5 — The ask (Attack)
      attack_ask: [
        'If you’re one of the {audience} who’s ready to {outcome} — link’s in my bio. Drop your name.',
        'Done watching from the sidelines? Link’s in my bio. I’ll build you a plan.',
        'You’ve seen me show up. Your move. Link in bio.',
        'Most {audience} won’t tap the link. If you’re not most, it’s in my bio.',
        'Want me in your corner? Link’s in my bio. Name + go.'
      ]
    },

    // ---- The CTA. LOCKED. Same words every post. Not editable by the trainer. ----
    cta: 'I’m {name}. I help {audience} {outcome}. Drop your name at the link in my bio and I’ll build you a plan.',

    // Coaching prompts shown above each generated script (why it's built this way).
    prompts: {
      win: 'Don’t lead with the number. Lead with what they believed that was wrong. The number is the last thing you say.',
      mistake: 'Reveal the problem. Don’t solve it. If they can fix it from your video, they don’t need you.',
      app: 'This is the free door. You’re not selling — you’re giving people who aren’t ready to pay a way to start.',
      hook: 'This works because it names a group, not a person. “Men over 30 are getting fat” gets watched. “You’re fat” gets scrolled.',
      stories: 'Stories are where the money is and they’re free. Nobody buys off one post — they buy after watching you show up for weeks.',
      cta: 'Same words every time. That’s what makes it stick.'
    }
  };

  try { window.RiseContentTemplates = LIB; } catch (e) {}
})();
