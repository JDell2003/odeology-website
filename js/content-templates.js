/* RiseForIt — Content Program template library (riseforit_content_templates_v1).
   Skeleton + BEATS, never a word-for-word middle. Variables fill from the
   questionnaire. Voice variants apply to hook + CTA phrasing only; beats stay
   constant across voices. Edit freely — the generator reads whatever is here. */
(function () {
  'use strict';
  var LIB = {
    version: '1.0',

    hooks: [
      { id: 'h_group_stuck', pattern: 'Most {audience} are stuck because {mistake}.', voices: {
        blunt: 'Most {audience} are stuck because {mistake}.',
        warm: 'If you’re one of the {audience} who’s been stuck, it’s usually this: {mistake}.',
        funny: '{audience} have a favorite way to waste a year, and it’s {mistake}.',
        technical: 'There’s one reason most {audience} plateau, and it’s {mistake}.'
      } },
      { id: 'h_three_mistakes', pattern: 'Three mistakes I see {audience} make every week.' },
      { id: 'h_nobody_tells', pattern: 'Nobody tells {audience} this, but {mistake} is why nothing’s changing.' },
      { id: 'h_backwards', pattern: '{audience} are doing this completely backwards.' },
      { id: 'h_year', pattern: 'If you’ve been the same weight for a year, this is usually why.' },
      { id: 'h_not_lazy', pattern: '{audience} aren’t lazy. Their plan is wrong. Here’s the difference.' },
      { id: 'h_everyone_says', pattern: 'Everyone tells {audience} the usual advice. That’s wrong, and here’s what it’s costing them.' },
      { id: 'h_skip', pattern: 'If {audience} want to {outcome}, this is the part everyone skips.' },
      { id: 'h_week_three', pattern: 'The reason most {audience} quit at week three.' },
      { id: 'h_dont_need', pattern: '{audience} don’t need another program. They need to stop {mistake}.' },
      { id: 'h_paid_for', pattern: '{audience} are paying for results they’ll never see. Here’s where the money’s going.' },
      { id: 'h_hardest', pattern: 'The hardest thing to tell {audience} is that {mistake} isn’t discipline. It’s the wrong target.' },
      { id: 'h_watched', pattern: 'I’ve watched hundreds of {audience} do this exact thing and get nowhere.' },
      { id: 'h_scale', pattern: '{audience} keep chasing a number on the scale. That was never the goal.' },
      { id: 'h_looks_like', pattern: 'This is what {mistake} actually looks like six months in.' },
      { id: 'h_two_types', pattern: 'There are two kinds of {audience}. One gets results. Here’s the difference.' },
      { id: 'h_used_to', pattern: 'I used to be one of the {audience} who {old_belief}. Here’s what changed.' },
      { id: 'h_honest', pattern: 'Here’s something most trainers won’t say to {audience}: {contrarian}.' },
      { id: 'h_cost', pattern: '{mistake} isn’t a small thing. Here’s what it’s actually costing {audience}.' },
      { id: 'h_worked_for', pattern: 'The thing that worked for your friend probably won’t work for you. Here’s why.' },
      { id: 'h_afford', pattern: '{audience} say they can’t afford a trainer. Let’s do the math out loud.' },
      { id: 'h_myself', pattern: 'Every one of the {audience} who says they’ll do it themselves has already been doing it themselves. For years.' }
    ],

    post_types: {
      mistake: {
        label: 'The mistake', length: '45–60 sec',
        coaching_note: 'If they can fix it from your video, they don’t need you. Reveal the problem, name the fix, stop there.',
        beats: [
          { t: '0:00–0:05', job: 'Hook — name the group and the mistake' },
          { t: '0:05–0:20', job: 'What it’s costing them. Be specific — time, money, results.' },
          { t: '0:20–0:40', job: 'Why they’re stuck. It’s not effort. Nobody told them {core}.' },
          { t: '0:40–0:50', job: 'Hint the fix. Name what the fix IS. Do not explain how.' },
          { t: '0:50–1:00', job: 'CTA' }
        ],
        seeds: [
          'Doing endless cardio thinking it burns fat, when all it leaves you with is loose skin and no shape.',
          'Four hours on the stairmaster because it feels like work. Effort isn’t the same as stimulus.',
          'Copying a friend who got results, not realizing their results came from nutrition or a coach — so you’re getting second-hand info filtered through someone else’s body.',
          'Refusing to count calories while tracking every dollar in the bank. Same skill, one goal apparently doesn’t deserve it.',
          'Losing 40 lbs and looking exactly the same, because the goal was never the weight.',
          'Fasting and drinking water to drop weight fast, building no muscle, and having nothing to keep it off with.',
          'Trying it yourself for two years, then quitting in week two of trying it yourself again.',
          'Pulling a workout off the internet and doing close-grip bench for triceps for six months.',
          'Program hopping every three weeks to “confuse the muscle.”',
          'Training seven days a week on five hours of sleep and calling it discipline.',
          'Eating clean and gaining fat, because chicken and almonds have calories too.',
          'Chasing soreness as the signal that it worked.'
        ]
      },
      myth: {
        label: 'What I believe', length: '45–60 sec', cadence: 'Roughly monthly, plus their own {contrarian}',
        beats: [
          { t: '0:00–0:05', job: 'Say the thing most people won’t. State the myth, then reject it.' },
          { t: '0:05–0:20', job: 'Why everyone believes it. Be fair to it — that’s what makes you credible.' },
          { t: '0:20–0:40', job: 'What’s actually true, and the mechanism. Your take, your words.' },
          { t: '0:40–0:55', job: 'What changes for them if they get this right.' },
          { t: '0:55–1:00', job: 'CTA' }
        ],
        library: [
          { myth: 'Soreness means it worked.', truth: 'Soreness means you did something unfamiliar, not something effective. Beginners are wrecked every session and grow slowly. Advanced lifters are rarely sore and grow steadily.', kicker: 'If soreness were the signal, the most sore people in the gym would look the best. Walk in and check.' },
          { myth: 'Women shouldn’t lift heavy, they’ll get bulky.', truth: 'The look they’re describing — toned, tight, defined — is muscle. There’s nothing else it could be.', kicker: 'You can’t have definition without something underneath to define.' },
          { myth: 'Eat clean and the results follow.', truth: 'You can get fat on chicken, rice and almonds. Clean eating is a moral category, not a physiological one.', kicker: 'It lets people feel disciplined while making zero progress.' },
          { myth: 'Switch it up to confuse the muscle.', truth: 'Muscles don’t get confused. They get stronger or they don’t.', kicker: 'Program hopping is how people spend three years being mediocre at twelve exercises instead of strong at six.' },
          { myth: 'Train harder, rest days are for beginners.', truth: 'You don’t grow in the gym, you grow between sessions. Training is the stimulus, recovery is the adaptation.', kicker: 'Seven days a week on five hours of sleep isn’t discipline. It’s damage with a good attitude.' },
          { myth: 'Abs are made in the kitchen.', truth: 'Half true, and that half ruins people. You can diet down to visible ribs and still have no abs, because there’s no muscle there to see.', kicker: 'Abs are made in the gym and revealed in the kitchen. Everyone repeating this line skipped the first half.' },
          { myth: 'You just need motivation.', truth: 'Motivation is a feeling. Feelings are weather. Nobody builds a body on weather.', kicker: 'If your plan requires you to feel good, you don’t have a plan.' },
          { myth: 'Do what works for you.', truth: 'What “works for you” is usually what you’re willing to tolerate, not what produces results.', kicker: 'The individualization is in the details — your leverages, injuries, schedule. Not in whether progressive overload applies to you.' },
          { myth: 'Weight loss is the goal.', truth: 'Nobody’s goal is a number. People chase weight because it’s the only thing they know how to measure.', kicker: 'Then they get there and wonder why nothing feels different.' },
          { myth: 'Toning.', truth: 'Not a thing. There’s building muscle and there’s losing fat. Every toning program is one of those two, badly disguised.', kicker: 'Usually light weights and high reps that do neither well.' },
          { myth: 'Fasted cardio burns more fat.', truth: 'It oxidizes more fat during the session and changes nothing over 24 hours. Total energy balance decides what you lose.', kicker: 'You woke up an hour early, felt virtuous, and got the same result — with less energy to train hard.' },
          { myth: 'Machines are for beginners.', truth: 'Machines are stable, let you push closer to failure safely, and isolate what you’re trying to grow.', kicker: 'Free-weight purism is gym culture, not science. Nobody’s leg press is holding back their physique.' },
          { myth: 'You can’t out-train a bad diet.', truth: 'Repeated by people who then out-train a bad diet for a decade. Diet drives fat loss — but the phrasing convinces beginners that training doesn’t matter until nutrition is perfect.', kicker: 'So they wait. And nutrition is never perfect. And they never start.' },
          { myth: 'Get lean first, then build muscle.', truth: 'Backwards for most people. Getting lean with no muscle underneath is exactly the skinny-fat outcome they’re afraid of.', kicker: 'Build the thing first. Then take the covers off.' },
          { myth: 'All you need is a calorie deficit.', truth: 'You’ll lose the weight and wonder why you look like a stick figure. A deficit plus the wrong training gives you a smaller version of the body you didn’t want.', kicker: 'Two people say “I want to lose weight” and mean completely different bodies.' }
        ]
      },
      reframe: {
        label: 'The question', length: '45–60 sec', cadence: 'Every ~3 weeks',
        beats: [
          { t: '0:00–0:05', job: 'Ask the question cold. “If you weighed exactly the same, but looked like the person you want to look like — would you be happy?”' },
          { t: '0:05–0:15', job: 'The answer is always yes. Say so.' },
          { t: '0:15–0:35', job: 'So the scale was never the goal. The goal is reshape. Weight is just the only thing they know how to measure.' },
          { t: '0:35–0:50', job: 'What actually produces reshape — and why the treadmill is a helping hand, not the main event.' },
          { t: '0:50–1:00', job: 'CTA' }
        ],
        variants: [
          'The mirror question — would you be happy at the same weight, different shape?',
          '“I lost 40 lbs and I look exactly the same.” Congratulations. What was the goal?',
          'You’re not chasing a number, you’re chasing a feeling in the mirror. Those need different plans.',
          'Weight is a measurement, not a goal. Here’s the difference and why it matters.'
        ]
      },
      objection: {
        label: 'The reason people don’t start', length: '45–60 sec',
        beats: [
          { t: '0:00–0:05', job: 'Say the objection out loud as the hook. Quote it.' },
          { t: '0:05–0:20', job: 'Be fair to it. Why people say it and why it feels true.' },
          { t: '0:20–0:45', job: 'Take it apart. Use the specific math or pattern.' },
          { t: '0:45–0:55', job: 'What it actually is underneath.' },
          { t: '0:55–1:00', job: 'CTA' }
        ],
        library: [
          { objection: 'I’ll do it myself.', counter: 'You’ve been doing it yourself. For years. That’s the plan that produced where you are now. What people call self-belief here is usually motivation wearing discipline’s clothes.' },
          { objection: 'I’ll just get a workout off the internet.', counter: 'You can, and you’ll get some results. You’ll also do close-grip bench for triceps for six months and wonder why nothing’s moved. You don’t hire a coach for the workout. You hire one so the workout fits you.' },
          { objection: 'I can’t afford it.', counter: 'A bowl out is twenty bucks. Three times a week is sixty. That’s two hundred and forty a month, already leaving your account. The money exists — it’s allocated to the thing keeping you where you are.' },
          { objection: 'Let me think about it.', counter: 'Almost always a money question in a timing costume. The honest version: if it were free, would you start tomorrow? If yes, it’s a budget problem — and budgets can be worked with.' },
          { objection: 'My friend got great results on her own.', counter: 'Maybe. Or her results came from nutrition, a coach, or genetics — and what you’re getting is second-hand info, filtered through a body that isn’t yours.' },
          { objection: 'I need to focus on school / work right now.', counter: 'You should. I also think you deserve to look in the mirror and see the person you want to be. Those aren’t competing — one of them takes four hours a week.' },
          { objection: 'I already lost the weight on my own.', counter: 'You did, and it took real work. But if you fasted and starved your way there, you built no muscle and no system. The second you stop — and you will — it all comes back.' },
          { objection: 'I don’t want to count calories.', counter: 'Do you know what’s in your bank account? Then you already do this. You track the thing you’re serious about. So which goal doesn’t deserve it?' }
        ]
      },
      win: {
        label: 'The win', length: '45–60 sec',
        coaching_note: 'Nobody cares that they lost 30 lbs. They care that someone exactly like them believed the same wrong thing and got past it.',
        beats: [
          { t: '0:00–0:05', job: 'Hook — lead with what they believed, not what they achieved. “When {proof_name} started, they were sure {proof_belief}.”' },
          { t: '0:05–0:25', job: 'Where they were. What they’d tried and why it hadn’t worked.' },
          { t: '0:25–0:45', job: 'What changed in their head. This is the whole post.' },
          { t: '0:45–0:55', job: 'Then the result. Say it last, keep it short — {proof_result}.' },
          { t: '0:55–1:00', job: 'CTA' }
        ],
        no_client_variant: {
          label: 'Your own progress',
          framing: 'You’re not the expert yet, you’re the one in the arena. “I’m figuring this out, come with me” builds more trust than pretending, and nobody can copy it off you.',
          beats: [
            { t: '0:00–0:05', job: 'What you believed back then that was wrong — {old_belief}.' },
            { t: '0:05–0:25', job: 'What that cost you. Be honest about the {before}.' },
            { t: '0:25–0:45', job: 'The moment it changed — {turning_point}.' },
            { t: '0:45–0:55', job: 'Where you are now, briefly — {own_result}. Not a flex, evidence.' },
            { t: '0:55–1:00', job: 'CTA' }
          ]
        }
      },
      app: {
        label: 'The free tool', length: '45–60 sec', pinned: true,
        beats: [
          { t: '0:00–0:05', job: 'Hook aimed at people not ready to hire anyone. “Not everyone’s ready for a coach. That doesn’t mean you start with nothing.”' },
          { t: '0:05–0:30', job: 'What it does: a free workout with the equipment you have, a nutrition plan, a grocery list in your budget, and it gamifies progress so you level up.' },
          { t: '0:30–0:45', job: 'Honest framing — a coach is still best. This is second best, and it’s free. Only catch is the onboarding takes a minute.' },
          { t: '0:45–1:00', job: 'CTA to the link' }
        ],
        hook_variants: [
          'Not everyone’s ready to hire a coach. Here’s what I’d do instead.',
          'If you can’t afford a trainer right now, don’t do nothing. Do this.',
          'I built something free for {audience} who aren’t ready to work with me yet.',
          'Second best option for {audience}, and it costs nothing.',
          'You don’t need me to start. You do need a plan. Here’s a free one.',
          'Everyone asks me what to do if they can’t afford coaching. This is my honest answer.'
        ]
      },
      story: {
        label: 'Your story', length: '45–75 sec',
        beats: [
          { t: '0:00–0:05', job: 'Start inside the moment, not with context. Put them in the room.' },
          { t: '0:05–0:30', job: 'What was going on and what you believed then.' },
          { t: '0:30–0:50', job: 'What broke that belief.' },
          { t: '0:50–1:05', job: 'How it shows up in how you coach now.' },
          { t: '1:05–1:15', job: 'CTA' }
        ],
        seeds: ['{turning_point}', '{before}', '{old_belief}', '{why}']
      }
    },

    stories_daily: {
      count: 5, framework: 'Lead / Relate / Attack',
      coaching_note: 'Stories are where the money is and they’re free. Nobody buys off one post — they buy after watching you show up for weeks.',
      slots: [
        { n: 1, type: 'LEAD — morning', job: 'You’re up and moving. No speech.', examples: ['Up. Moving. Before the day gets a vote.', '5:40. Nobody’s watching. That’s the point.', 'First one in again.'] },
        { n: 2, type: 'LEAD + RELATE — a thought', job: 'One thought tied to {core}. This is where {catchphrase} lives.', examples: ['The thing I’m known for — {core} — isn’t a trick. It’s the part most people skip.', 'Everyone wants the result. Almost nobody wants the boring version of it.'] },
        { n: 3, type: 'RELATE — progress', job: 'A client’s or your own. Show, don’t announce.', examples: ['Watched a client hit a number today they didn’t think was possible. Reminder: it usually is.', 'Six weeks ago this was their warm-up weight.'] },
        { n: 4, type: 'RELATE — right now', job: 'What you’re literally doing. Proof you live it.', examples: ['Right now: doing the exact thing I tell {audience} to do. Leading from the front.', 'Meal I’d tell a client to eat, eaten by me, in a car, like always.'] },
        { n: 5, type: 'ATTACK — the ask', job: 'The CTA. Same energy every day.', examples: ['If you’re one of the {audience} ready to {outcome} — link’s in my bio. Drop your name.', 'Two spots this month. Link in bio.'] }
      ]
    },

    cta: {
      locked: true, note: 'Same words every time. That’s what makes it stick.',
      master: 'I’m {name}. I help {audience} {outcome}. Drop your name at the link in my bio and I’ll build you a plan.',
      voices: {
        blunt: 'I’m {name}. I help {audience} {outcome}. Link’s in my bio — drop your name and I’ll build you a plan.',
        warm: 'I’m {name}, and I help {audience} {outcome}. If that’s you, drop your name at the link in my bio and I’ll put a plan together for you.',
        funny: 'I’m {name}. I help {audience} {outcome}, mostly by telling them things they don’t want to hear. Link’s in my bio.',
        technical: 'I’m {name}. I help {audience} {outcome}. If you want the plan built around your situation, the link’s in my bio.'
      }
    },

    pins: {
      pin1: { label: 'Who I am', length: '60–75 sec', beats: [
        { t: '0:00–0:08', job: 'Who you are and who you help. Plain.' },
        { t: '0:08–0:30', job: 'Why you do this — {why}, {turning_point}. One line, not a memoir.' },
        { t: '0:30–0:50', job: 'What you believe about {core}.' },
        { t: '0:50–1:05', job: 'What you’ll be posting and why they should follow.' },
        { t: '1:05–1:15', job: 'CTA' }
      ] },
      pin2: { label: 'What I believe', length: '45–60 sec', useType: 'myth', note: 'Use the myth structure with their own {contrarian}. This is the one people remember. Don’t soften it.' },
      pin3: { label: 'Proof', length: '45–60 sec', useType: 'win', note: 'Use the win structure, or the no-client variant.' }
    },

    quality_check: [
      'My hook names a group, not “you”',
      'One idea only',
      'I said the CTA out loud',
      'Under 60 seconds',
      'My link is in the caption and bio'
    ],

    dm_response: {
      note: 'Don’t sell in the DMs. Get them to the link.',
      text: 'Appreciate you reaching out. Drop your name and number at {link} and I’ll get you on a quick call to see if I can help.'
    }
  };

  try { window.RiseContentTemplates = LIB; } catch (e) {}
})();
