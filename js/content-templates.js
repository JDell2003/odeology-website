/* RiseForIt — Content Program template library (riseforit_content_templates_v1
   + riseforit_voice_variants_v1 merged).
   Skeleton + BEATS, never a word-for-word middle. Variables fill from the
   questionnaire. Voice variants live on hooks, post-type openers, the CTA and
   story slots; beats stay constant across voices. hooks_profanity variants
   serve ONLY when the trainer's profanity answer is sometimes/freely, and only
   on blunt/funny. The reframe question is IDENTICAL across voices by design —
   only the follow-through varies. Edit freely — the generator reads whatever
   is here. */
(function () {
  'use strict';
  var LIB = {
  "version": "1.0",
  "hooks": [
    {
      "id": "h_group_stuck",
      "pattern": "Most {audience} are stuck because they {mistake}.",
      "voices": {
        "blunt": "Most {audience} are stuck. One reason: they {mistake}.",
        "warm": "If you're one of the {audience} who feels stuck, there's usually one thing behind it — {mistake}.",
        "funny": "{audience} have a favorite way to stay stuck, and it's {mistake}.",
        "technical": "When {audience} plateau, the most common cause is simple: they {mistake}."
      }
    },
    {
      "id": "h_three_mistakes",
      "pattern": "Three mistakes I see {audience} make every week.",
      "voices": {
        "blunt": "Three mistakes. Every one of the {audience} I meet makes them.",
        "warm": "There are three small things I watch {audience} trip over — and every one is fixable.",
        "funny": "I could set my watch by the three mistakes {audience} make. Let's ruin that.",
        "technical": "Three recurring errors explain most stalled progress in {audience}. In order:"
      }
    },
    {
      "id": "h_nobody_tells",
      "pattern": "Nobody tells {audience} this, but the reason nothing’s changing is simple: they {mistake}.",
      "voices": {
        "blunt": "Nobody tells {audience} this. So I will: {mistake} is why nothing's changing.",
        "warm": "Somebody should have told you this a long time ago — {mistake} is what's been holding you back.",
        "funny": "There's a thing nobody tells {audience}, mostly because it doesn't sell supplements: {mistake}.",
        "technical": "There's an unglamorous reason most {audience} don't progress, and it's {mistake}."
      }
    },
    {
      "id": "h_backwards",
      "pattern": "{audience} are doing this completely backwards.",
      "voices": {
        "blunt": "{audience} are doing this backwards. Completely.",
        "warm": "This is going to sound strange, but most {audience} have this one exactly backwards — and it's not their fault.",
        "funny": "{audience} have taken something simple and managed to do it in reverse. Impressive, honestly.",
        "technical": "The standard approach {audience} follow is inverted. Here's the correct order and why it matters."
      }
    },
    {
      "id": "h_year",
      "pattern": "If you’ve been the same weight for a year, this is usually why.",
      "voices": {
        "blunt": "Same weight for a year? There's one reason. Here it is.",
        "warm": "If the scale hasn't moved in a year, I promise it's not because you're broken. It's usually this.",
        "funny": "A year at the same weight isn't a plateau. It's a lifestyle. Let's break up with it.",
        "technical": "A twelve-month stall almost always has one identifiable cause. Here's how to find yours."
      }
    },
    {
      "id": "h_not_lazy",
      "pattern": "{audience} aren’t lazy. Their plan is wrong.",
      "voices": {
        "blunt": "{audience} aren't lazy. The plan's wrong. Big difference.",
        "warm": "You're not lazy. I mean it. The plan you were handed just wasn't built for you.",
        "funny": "Nobody's ever accused {audience} of being lazy at work. Funny how the gym gets blamed on willpower.",
        "technical": "Effort isn't the limiting variable for most {audience}. Program design is. The distinction matters."
      }
    },
    {
      "id": "h_everyone_says",
      "pattern": "Everyone tells {audience} the usual advice. That’s wrong, and here’s what it’s costing them.",
      "voices": {
        "blunt": "Everyone tells {audience} the same thing. It's wrong.",
        "warm": "You've probably heard this advice a hundred times. I need to tell you why it's been failing you.",
        "funny": "There's a piece of advice {audience} get constantly. It's wrong, and it's costing them a fortune in wasted months.",
        "technical": "The most repeated advice given to {audience} doesn't survive contact with the evidence. Here's what does."
      }
    },
    {
      "id": "h_skip",
      "pattern": "If {audience} want to {outcome}, this is the part everyone skips.",
      "voices": {
        "blunt": "Everybody skips this part. It's the part that works.",
        "warm": "There's one step almost everyone skips — and it's the exact one that would've changed everything.",
        "funny": "The part of the process {audience} skip is, naturally, the part that does all the work.",
        "technical": "There's a step most {audience} omit because it looks optional. It isn't — here's what it does."
      }
    },
    {
      "id": "h_week_three",
      "pattern": "The reason most {audience} quit at week three.",
      "voices": {
        "blunt": "Most {audience} quit at week three. One reason. Here it is.",
        "warm": "If you've quit around week three before, it wasn't you — it was this.",
        "funny": "Week three is where {audience} go to break up with the gym. Predictably.",
        "technical": "There's a specific point — around week three — where adherence collapses in {audience}. The cause is knowable."
      }
    },
    {
      "id": "h_dont_need",
      "pattern": "{audience} don’t need another program. They need to quit one habit: they {mistake}.",
      "voices": {
        "blunt": "{audience} don't need another program. They need to stop {mistake}.",
        "warm": "You don't need anything new. You need permission to stop {mistake} — that's the whole unlock.",
        "funny": "{audience} keep shopping for solutions to a problem called {mistake}. The store doesn't sell that.",
        "technical": "Adding more isn't the answer for {audience}. Removing one thing is: {mistake}."
      }
    },
    {
      "id": "h_paid_for",
      "pattern": "{audience} are paying for results they’ll never see. Here’s where the money’s going.",
      "voices": {
        "blunt": "{audience} are paying for results they'll never see. Here's where the money goes.",
        "warm": "I hate watching {audience} spend money on things that can't work. Let me save you some.",
        "funny": "{audience} are funding an entire industry built on them not getting results. Great business model. Terrible deal.",
        "technical": "Most of what {audience} spend money on has no mechanism for producing the result they want. Follow the money."
      }
    },
    {
      "id": "h_hardest",
      "pattern": "The hardest thing to tell {audience}: the habit they’re proudest of is the wrong target. They {mistake}.",
      "voices": {
        "blunt": "Hard truth for {audience}: {mistake} isn't discipline. It's the wrong target.",
        "warm": "This one's hard to hear, and I say it with love: {mistake} isn't discipline. It's aim.",
        "funny": "{audience} are out here white-knuckling {mistake} like it's a virtue. It's not. It's a wrong turn with good attendance.",
        "technical": "What {audience} call discipline is often just consistency at the wrong task. {mistake} is the example."
      }
    },
    {
      "id": "h_watched",
      "pattern": "I’ve watched hundreds of {audience} do this exact thing and get nowhere.",
      "voices": {
        "blunt": "I've watched hundreds of {audience} do this exact thing. It doesn't work.",
        "warm": "I've sat with hundreds of {audience} doing this exact thing, and I've watched it break their hearts every time.",
        "funny": "I've watched hundreds of {audience} run this exact play. Spoiler: nobody's scored yet.",
        "technical": "Across hundreds of {audience}, this pattern produces the same outcome every time. Here's the data of my own eyes."
      }
    },
    {
      "id": "h_scale",
      "pattern": "{audience} keep chasing a number on the scale. That was never the goal.",
      "voices": {
        "blunt": "{audience} chase the scale. Wrong number. Never was the goal.",
        "warm": "If you're watching the scale like a hawk — I get it. But that number was never really the goal.",
        "funny": "{audience} and their bathroom scale: the most toxic relationship in fitness.",
        "technical": "Bodyweight is a poor proxy for the outcome {audience} actually want. Here's the better metric."
      }
    },
    {
      "id": "h_looks_like",
      "pattern": "This is what it looks like six months in: they {mistake}.",
      "voices": {
        "blunt": "This is what {mistake} looks like six months in. Not pretty.",
        "warm": "Let me show you where {mistake} quietly leads, because nobody warns you at the start.",
        "funny": "Six months of {mistake} has a look. You've seen it. You might be wearing it.",
        "technical": "Here's the six-month trajectory of {mistake} — and the exact point where it diverges from progress."
      }
    },
    {
      "id": "h_two_types",
      "pattern": "There are two kinds of {audience}. One gets results. Here’s the difference.",
      "voices": {
        "blunt": "Two kinds of {audience}. One gets results. Here's the difference.",
        "warm": "There are two kinds of {audience}, and the difference between them is smaller than you'd think.",
        "funny": "There are two kinds of {audience}. One kind reads this and changes nothing. Don't be the control group.",
        "technical": "Split {audience} into two cohorts and one variable separates them. It isn't genetics."
      }
    },
    {
      "id": "h_used_to",
      "pattern": "I used to be one of the {audience} who {old_belief}. Here’s what changed.",
      "voices": {
        "blunt": "I used to believe {old_belief}. Cost me years.",
        "warm": "I used to believe {old_belief} too. I want to save you the years it cost me.",
        "funny": "I used to believe {old_belief}. Adorable. Anyway, here's what actually happened.",
        "technical": "I operated on {old_belief} for years. Here's the moment the model broke, and what replaced it."
      }
    },
    {
      "id": "h_honest",
      "pattern": "Here’s something most trainers won’t say to {audience}: {contrarian}.",
      "voices": {
        "blunt": "Something most trainers won't say: {contrarian}.",
        "warm": "Can I be honest with you? Most trainers won't say this: {contrarian}.",
        "funny": "Here's the thing trainers whisper to each other but won't post: {contrarian}.",
        "technical": "An unpopular position I'll defend with a straight face: {contrarian}."
      }
    },
    {
      "id": "h_cost",
      "pattern": "It’s not a small thing that they {mistake}. Here’s what it’s actually costing {audience}.",
      "voices": {
        "blunt": "{mistake} isn't small. Here's what it's actually costing you.",
        "warm": "I don't think anyone's ever shown you what {mistake} is really costing — so let me.",
        "funny": "{mistake} seems harmless. So did my last three group texts. Both are costing more than you think.",
        "technical": "Let's price out {mistake} — in months, in effort, in results you didn't get."
      }
    },
    {
      "id": "h_worked_for",
      "pattern": "The thing that worked for your friend probably won’t work for you. Here’s why.",
      "voices": {
        "blunt": "What worked for your friend won't work for you. Here's why.",
        "warm": "Your friend's results are real. And what got them there probably still won't work for you — here's why that's okay.",
        "funny": "Copying your friend's routine is a great plan, if you also copied their genetics, their sleep, and their coach.",
        "technical": "Individual response variance is why your friend's protocol doesn't transfer. Here's what does."
      }
    },
    {
      "id": "h_afford",
      "pattern": "{audience} say they can’t afford a trainer. Let’s do the math out loud.",
      "voices": {
        "blunt": "\"Can't afford a trainer.\" Let's do the math out loud.",
        "warm": "I hear \"I can't afford it\" a lot, and I never argue. I just do the math out loud, and it usually surprises people.",
        "funny": "\"Can't afford a trainer,\" says the man holding a twenty-dollar burrito bowl. Let's do some math together.",
        "technical": "Run the numbers on what {audience} already spend monthly, and the affordability argument inverts. Watch:"
      }
    },
    {
      "id": "h_myself",
      "pattern": "Every one of the {audience} who says they’ll do it themselves has already been doing it themselves. For years.",
      "voices": {
        "blunt": "\"I'll do it myself.\" You've been doing it yourself. For years.",
        "warm": "\"I'll do it myself\" — I respect it. But be honest: you've been doing it yourself for a while now. How's it going?",
        "funny": "\"I'll do it myself\" is a bold plan from someone currently on year four of doing it themselves.",
        "technical": "Self-directed training has a track record for most people — their own. The last few years are the data."
      }
    }
  ],
  "post_types": {
    "mistake": {
      "label": "The mistake",
      "length": "45–60 sec",
      "coaching_note": "If they can fix it from your video, they don’t need you. Reveal the problem, name the fix, stop there.",
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Hook — name the group and the mistake"
        },
        {
          "t": "0:05–0:20",
          "job": "What it’s costing them. Be specific — time, money, results."
        },
        {
          "t": "0:20–0:40",
          "job": "Why they’re stuck. It’s not effort. Nobody told them {core}."
        },
        {
          "t": "0:40–0:50",
          "job": "Hint the fix. Name what the fix IS. Do not explain how."
        },
        {
          "t": "0:50–1:00",
          "job": "CTA"
        }
      ],
      "seeds": [
        "Doing endless cardio thinking it burns fat, when all it leaves you with is loose skin and no shape.",
        "Four hours on the stairmaster because it feels like work. Effort isn’t the same as stimulus.",
        "Copying a friend who got results, not realizing their results came from nutrition or a coach — so you’re getting second-hand info filtered through someone else’s body.",
        "Refusing to count calories while tracking every dollar in the bank. Same skill, one goal apparently doesn’t deserve it.",
        "Losing 40 lbs and looking exactly the same, because the goal was never the weight.",
        "Fasting and drinking water to drop weight fast, building no muscle, and having nothing to keep it off with.",
        "Trying it yourself for two years, then quitting in week two of trying it yourself again.",
        "Pulling a workout off the internet and doing close-grip bench for triceps for six months.",
        "Program hopping every three weeks to “confuse the muscle.”",
        "Training seven days a week on five hours of sleep and calling it discipline.",
        "Eating clean and gaining fat, because chicken and almonds have calories too.",
        "Chasing soreness as the signal that it worked."
      ]
    },
    "myth": {
      "label": "What I believe",
      "length": "45–60 sec",
      "cadence": "Roughly monthly, plus their own {contrarian}",
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Say the thing most people won’t. State the myth, then reject it."
        },
        {
          "t": "0:05–0:20",
          "job": "Why everyone believes it. Be fair to it — that’s what makes you credible."
        },
        {
          "t": "0:20–0:40",
          "job": "What’s actually true, and the mechanism. Your take, your words."
        },
        {
          "t": "0:40–0:55",
          "job": "What changes for them if they get this right."
        },
        {
          "t": "0:55–1:00",
          "job": "CTA"
        }
      ],
      "library": [
        {
          "myth": "Soreness means it worked.",
          "truth": "Soreness means you did something unfamiliar, not something effective. Beginners are wrecked every session and grow slowly. Advanced lifters are rarely sore and grow steadily.",
          "kicker": "If soreness were the signal, the most sore people in the gym would look the best. Walk in and check."
        },
        {
          "myth": "Women shouldn’t lift heavy, they’ll get bulky.",
          "truth": "The look they’re describing — toned, tight, defined — is muscle. There’s nothing else it could be.",
          "kicker": "You can’t have definition without something underneath to define."
        },
        {
          "myth": "Eat clean and the results follow.",
          "truth": "You can get fat on chicken, rice and almonds. Clean eating is a moral category, not a physiological one.",
          "kicker": "It lets people feel disciplined while making zero progress."
        },
        {
          "myth": "Switch it up to confuse the muscle.",
          "truth": "Muscles don’t get confused. They get stronger or they don’t.",
          "kicker": "Program hopping is how people spend three years being mediocre at twelve exercises instead of strong at six."
        },
        {
          "myth": "Train harder, rest days are for beginners.",
          "truth": "You don’t grow in the gym, you grow between sessions. Training is the stimulus, recovery is the adaptation.",
          "kicker": "Seven days a week on five hours of sleep isn’t discipline. It’s damage with a good attitude."
        },
        {
          "myth": "Abs are made in the kitchen.",
          "truth": "Half true, and that half ruins people. You can diet down to visible ribs and still have no abs, because there’s no muscle there to see.",
          "kicker": "Abs are made in the gym and revealed in the kitchen. Everyone repeating this line skipped the first half."
        },
        {
          "myth": "You just need motivation.",
          "truth": "Motivation is a feeling. Feelings are weather. Nobody builds a body on weather.",
          "kicker": "If your plan requires you to feel good, you don’t have a plan."
        },
        {
          "myth": "Do what works for you.",
          "truth": "What “works for you” is usually what you’re willing to tolerate, not what produces results.",
          "kicker": "The individualization is in the details — your leverages, injuries, schedule. Not in whether progressive overload applies to you."
        },
        {
          "myth": "Weight loss is the goal.",
          "truth": "Nobody’s goal is a number. People chase weight because it’s the only thing they know how to measure.",
          "kicker": "Then they get there and wonder why nothing feels different."
        },
        {
          "myth": "Toning.",
          "truth": "Not a thing. There’s building muscle and there’s losing fat. Every toning program is one of those two, badly disguised.",
          "kicker": "Usually light weights and high reps that do neither well."
        },
        {
          "myth": "Fasted cardio burns more fat.",
          "truth": "It oxidizes more fat during the session and changes nothing over 24 hours. Total energy balance decides what you lose.",
          "kicker": "You woke up an hour early, felt virtuous, and got the same result — with less energy to train hard."
        },
        {
          "myth": "Machines are for beginners.",
          "truth": "Machines are stable, let you push closer to failure safely, and isolate what you’re trying to grow.",
          "kicker": "Free-weight purism is gym culture, not science. Nobody’s leg press is holding back their physique."
        },
        {
          "myth": "You can’t out-train a bad diet.",
          "truth": "Repeated by people who then out-train a bad diet for a decade. Diet drives fat loss — but the phrasing convinces beginners that training doesn’t matter until nutrition is perfect.",
          "kicker": "So they wait. And nutrition is never perfect. And they never start."
        },
        {
          "myth": "Get lean first, then build muscle.",
          "truth": "Backwards for most people. Getting lean with no muscle underneath is exactly the skinny-fat outcome they’re afraid of.",
          "kicker": "Build the thing first. Then take the covers off."
        },
        {
          "myth": "All you need is a calorie deficit.",
          "truth": "You’ll lose the weight and wonder why you look like a stick figure. A deficit plus the wrong training gives you a smaller version of the body you didn’t want.",
          "kicker": "Two people say “I want to lose weight” and mean completely different bodies."
        }
      ]
    },
    "reframe": {
      "label": "The question",
      "length": "45–60 sec",
      "cadence": "Every ~3 weeks",
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Ask the question cold. “If you weighed exactly the same, but looked like the person you want to look like — would you be happy?”"
        },
        {
          "t": "0:05–0:15",
          "job": "The answer is always yes. Say so."
        },
        {
          "t": "0:15–0:35",
          "job": "So the scale was never the goal. The goal is reshape. Weight is just the only thing they know how to measure."
        },
        {
          "t": "0:35–0:50",
          "job": "What actually produces reshape — and why the treadmill is a helping hand, not the main event."
        },
        {
          "t": "0:50–1:00",
          "job": "CTA"
        }
      ],
      "variants": [
        "The mirror question — would you be happy at the same weight, different shape?",
        "“I lost 40 lbs and I look exactly the same.” Congratulations. What was the goal?",
        "You’re not chasing a number, you’re chasing a feeling in the mirror. Those need different plans.",
        "Weight is a measurement, not a goal. Here’s the difference and why it matters."
      ]
    },
    "objection": {
      "label": "The reason people don’t start",
      "length": "45–60 sec",
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Say the objection out loud as the hook. Quote it."
        },
        {
          "t": "0:05–0:20",
          "job": "Be fair to it. Why people say it and why it feels true."
        },
        {
          "t": "0:20–0:45",
          "job": "Take it apart. Use the specific math or pattern."
        },
        {
          "t": "0:45–0:55",
          "job": "What it actually is underneath."
        },
        {
          "t": "0:55–1:00",
          "job": "CTA"
        }
      ],
      "library": [
        {
          "objection": "I’ll do it myself.",
          "counter": "You’ve been doing it yourself. For years. That’s the plan that produced where you are now. What people call self-belief here is usually motivation wearing discipline’s clothes."
        },
        {
          "objection": "I’ll just get a workout off the internet.",
          "counter": "You can, and you’ll get some results. You’ll also do close-grip bench for triceps for six months and wonder why nothing’s moved. You don’t hire a coach for the workout. You hire one so the workout fits you."
        },
        {
          "objection": "I can’t afford it.",
          "counter": "A bowl out is twenty bucks. Three times a week is sixty. That’s two hundred and forty a month, already leaving your account. The money exists — it’s allocated to the thing keeping you where you are."
        },
        {
          "objection": "Let me think about it.",
          "counter": "Almost always a money question in a timing costume. The honest version: if it were free, would you start tomorrow? If yes, it’s a budget problem — and budgets can be worked with."
        },
        {
          "objection": "My friend got great results on her own.",
          "counter": "Maybe. Or her results came from nutrition, a coach, or genetics — and what you’re getting is second-hand info, filtered through a body that isn’t yours."
        },
        {
          "objection": "I need to focus on school / work right now.",
          "counter": "You should. I also think you deserve to look in the mirror and see the person you want to be. Those aren’t competing — one of them takes four hours a week."
        },
        {
          "objection": "I already lost the weight on my own.",
          "counter": "You did, and it took real work. But if you fasted and starved your way there, you built no muscle and no system. The second you stop — and you will — it all comes back."
        },
        {
          "objection": "I don’t want to count calories.",
          "counter": "Do you know what’s in your bank account? Then you already do this. You track the thing you’re serious about. So which goal doesn’t deserve it?"
        }
      ]
    },
    "win": {
      "label": "The win",
      "length": "45–60 sec",
      "coaching_note": "Nobody cares that they lost 30 lbs. They care that someone exactly like them believed the same wrong thing and got past it.",
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Hook — lead with what they believed, not what they achieved. “When {proof_name} started, they were sure {proof_belief}.”"
        },
        {
          "t": "0:05–0:25",
          "job": "Where they were. What they’d tried and why it hadn’t worked."
        },
        {
          "t": "0:25–0:45",
          "job": "What changed in their head. This is the whole post."
        },
        {
          "t": "0:45–0:55",
          "job": "Then the result. Say it last, keep it short — {proof_result}."
        },
        {
          "t": "0:55–1:00",
          "job": "CTA"
        }
      ],
      "no_client_variant": {
        "label": "Your own progress",
        "framing": "You’re not the expert yet, you’re the one in the arena. “I’m figuring this out, come with me” builds more trust than pretending, and nobody can copy it off you.",
        "beats": [
          {
            "t": "0:00–0:05",
            "job": "What you believed back then that was wrong — {old_belief}."
          },
          {
            "t": "0:05–0:25",
            "job": "What that cost you. Be honest about the {before}."
          },
          {
            "t": "0:25–0:45",
            "job": "The moment it changed — {turning_point}."
          },
          {
            "t": "0:45–0:55",
            "job": "Where you are now, briefly — {own_result}. Not a flex, evidence."
          },
          {
            "t": "0:55–1:00",
            "job": "CTA"
          }
        ]
      }
    },
    "app": {
      "label": "The free tool",
      "length": "45–60 sec",
      "pinned": true,
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Hook aimed at people not ready to hire anyone. “Not everyone’s ready for a coach. That doesn’t mean you start with nothing.”"
        },
        {
          "t": "0:05–0:30",
          "job": "What it does: a free workout with the equipment you have, a nutrition plan, a grocery list in your budget, and it gamifies progress so you level up."
        },
        {
          "t": "0:30–0:45",
          "job": "Honest framing — a coach is still best. This is second best, and it’s free. Only catch is the onboarding takes a minute."
        },
        {
          "t": "0:45–1:00",
          "job": "CTA to the link"
        }
      ],
      "hook_variants": [
        "Not everyone’s ready to hire a coach. Here’s what I’d do instead.",
        "If you can’t afford a trainer right now, don’t do nothing. Do this.",
        "I built something free for {audience} who aren’t ready to work with me yet.",
        "Second best option for {audience}, and it costs nothing.",
        "You don’t need me to start. You do need a plan. Here’s a free one.",
        "Everyone asks me what to do if they can’t afford coaching. This is my honest answer."
      ]
    },
    "story": {
      "label": "Your story",
      "length": "45–75 sec",
      "beats": [
        {
          "t": "0:00–0:05",
          "job": "Start inside the moment, not with context. Put them in the room."
        },
        {
          "t": "0:05–0:30",
          "job": "What was going on and what you believed then."
        },
        {
          "t": "0:30–0:50",
          "job": "What broke that belief."
        },
        {
          "t": "0:50–1:05",
          "job": "How it shows up in how you coach now."
        },
        {
          "t": "1:05–1:15",
          "job": "CTA"
        }
      ],
      "seeds": [
        "{turning_point}",
        "{before}",
        "{old_belief}",
        "{why}"
      ]
    }
  },
  "stories_daily": {
    "count": 5,
    "framework": "Lead / Relate / Attack",
    "coaching_note": "Stories are where the money is and they’re free. Nobody buys off one post — they buy after watching you show up for weeks.",
    "slots": [
      {
        "n": 1,
        "type": "LEAD — morning",
        "job": "You’re up and moving. No speech.",
        "examples": [
          "Up. Moving. Before the day gets a vote.",
          "5:40. Nobody’s watching. That’s the point.",
          "First one in again."
        ],
        "examples_by_voice": {
          "blunt": [
            "Up. Moving. Before the day gets a vote.",
            "5:40. Nobody watching. That's the point.",
            "First one in. Again."
          ],
          "warm": [
            "Morning. Showing up for it — same as I'll ask of you.",
            "Early one today. Worth it every time.",
            "Up before the excuses are."
          ],
          "funny": [
            "Awake against my will. Training anyway.",
            "The alarm won. Rematch tomorrow.",
            "5:40am. My bed and I are no longer on speaking terms."
          ],
          "technical": [
            "Session one, fasted, logged.",
            "Morning block: done before decisions pile up.",
            "Trained first. Everything after is easier."
          ]
        }
      },
      {
        "n": 2,
        "type": "LEAD + RELATE — a thought",
        "job": "One thought tied to {core}. This is where {catchphrase} lives.",
        "examples": [
          "The thing I’m known for — {core} — isn’t a trick. It’s the part most people skip.",
          "Everyone wants the result. Almost nobody wants the boring version of it."
        ],
        "examples_by_voice": {
          "blunt": [
            "{core}. Not a trick. Just the part everyone skips.",
            "Everyone wants the result. Nobody wants the boring version of it."
          ],
          "warm": [
            "The thing I keep coming back to: {core}. It's simpler than anyone wants it to be.",
            "You don't need a perfect week. You need an okay one, repeated."
          ],
          "funny": [
            "{core}. Revolutionary stuff, I know. That'll be $200.",
            "The secret is boring. That's why it's still a secret."
          ],
          "technical": [
            "{core} — because the mechanism doesn't care about novelty.",
            "Consistency compounds. Intensity just spikes."
          ]
        }
      },
      {
        "n": 3,
        "type": "RELATE — progress",
        "job": "A client’s or your own. Show, don’t announce.",
        "examples": [
          "Watched a client hit a number today they didn’t think was possible. Reminder: it usually is.",
          "Six weeks ago this was their warm-up weight."
        ],
        "examples_by_voice": {
          "blunt": [
            "Client hit a number today they didn't think existed. It usually does.",
            "Six weeks ago this was their max. Now it's their warm-up."
          ],
          "warm": [
            "Watched someone surprise themselves today. Never gets old.",
            "Six weeks of showing up, and today it showed back up for them."
          ],
          "funny": [
            "Client PR'd today and tried to act casual about it. Failed completely.",
            "Six weeks ago this weight was 'absolutely not.' Today it was a warm-up. Funny how that works."
          ],
          "technical": [
            "Today's PR was built five weeks ago. That's how this works.",
            "Warm-up today = working set from week one. Progressive overload, doing its thing."
          ]
        }
      },
      {
        "n": 4,
        "type": "RELATE — right now",
        "job": "What you’re literally doing. Proof you live it.",
        "examples": [
          "Right now: doing the exact thing I tell {audience} to do. Leading from the front.",
          "Meal I’d tell a client to eat, eaten by me, in a car, like always."
        ],
        "examples_by_voice": {
          "blunt": [
            "Doing the exact thing I tell my people to do. Leading from the front.",
            "Same meal I'd hand a client. Eaten in a car. As usual."
          ],
          "warm": [
            "Practicing what I coach — wouldn't ask you for anything I don't do.",
            "Meal prep, gym bag, repeat. Living the plan I hand out."
          ],
          "funny": [
            "Eating the client meal plan in my car like a man with a vision.",
            "Currently doing my own homework. Trainer rules."
          ],
          "technical": [
            "N=1, running my own protocol. Data collection continues.",
            "Same plan I prescribe. Compliance: 100%. Location: parking lot."
          ]
        }
      },
      {
        "n": 5,
        "type": "ATTACK — the ask",
        "job": "The CTA. Same energy every day.",
        "examples": [
          "If you’re one of the {audience} ready to {outcome} — link’s in my bio. Drop your name.",
          "Two spots this month. Link in bio."
        ],
        "examples_by_voice": {
          "blunt": [
            "Ready? Link's in my bio. Drop your name.",
            "Two spots this month. Link in bio. Move."
          ],
          "warm": [
            "If any of this sounds like you, the link's in my bio — drop your name and I'll build you a plan.",
            "Whenever you're ready, the link's in my bio. I'll take it from there."
          ],
          "funny": [
            "Link's in my bio. It doesn't bite. Unlike leg day.",
            "You've watched twelve of these stories. Tap the link already."
          ],
          "technical": [
            "Next step is simple: link in bio, drop your name, I build the plan.",
            "The process starts with one tap. Link's in my bio."
          ]
        }
      }
    ]
  },
  "cta": {
    "locked": true,
    "note": "Same words every time. That’s what makes it stick.",
    "master": "I’m {name}. I help {audience} {outcome}. Drop your name at the link in my bio and I’ll build you a plan.",
    "voices": {
      "blunt": "I’m {name}. I help {audience} {outcome}. Link’s in my bio — drop your name and I’ll build you a plan.",
      "warm": "I’m {name}, and I help {audience} {outcome}. If that’s you, drop your name at the link in my bio and I’ll put a plan together for you.",
      "funny": "I’m {name}. I help {audience} {outcome}, mostly by telling them things they don’t want to hear. Link’s in my bio.",
      "technical": "I’m {name}. I help {audience} {outcome}. If you want the plan built around your situation, the link’s in my bio."
    }
  },
  "pins": {
    "pin1": {
      "label": "Who I am",
      "length": "60–75 sec",
      "beats": [
        {
          "t": "0:00–0:08",
          "job": "Who you are and who you help. Plain."
        },
        {
          "t": "0:08–0:30",
          "job": "Why you do this — {why}, {turning_point}. One line, not a memoir."
        },
        {
          "t": "0:30–0:50",
          "job": "What you believe about {core}."
        },
        {
          "t": "0:50–1:05",
          "job": "What you’ll be posting and why they should follow."
        },
        {
          "t": "1:05–1:15",
          "job": "CTA"
        }
      ]
    },
    "pin2": {
      "label": "What I believe",
      "length": "45–60 sec",
      "useType": "myth",
      "note": "Use the myth structure with their own {contrarian}. This is the one people remember. Don’t soften it."
    },
    "pin3": {
      "label": "Proof",
      "length": "45–60 sec",
      "useType": "win",
      "note": "Use the win structure, or the no-client variant."
    }
  },
  "briefs": {
    "mistake": {
      "job": "Show them something is wrong that they didn’t know was wrong.",
      "goal": "“Wait — I’ve been doing that for a year.”",
      "think": [
        "What is this actually costing them — time, money, or results?",
        "Why are they stuck? (It’s almost never that they’re lazy.)",
        "What’s the fix — and can you name it without teaching the whole thing?",
        "Who’s one client this describes exactly?",
        "How does this tie back to what you stand for?",
        "What would they swear they’re already doing right?"
      ]
    },
    "myth": {
      "job": "Say the thing most trainers won’t. Make them remember you for it.",
      "goal": "“Huh. I never thought about it that way.”",
      "think": [
        "Why does everyone believe this? (Be fair to it.)",
        "What’s actually true, and what’s the mechanism?",
        "What changes for them if they get this right?",
        "Where did you first realize the common advice was wrong?",
        "Who profits from them believing the myth?",
        "What’s the one-line version they’ll repeat to a friend?"
      ]
    },
    "reframe": {
      "job": "Shift the goal from a number to a feeling in the mirror.",
      "goal": "“Oh. The scale was never the point.”",
      "think": [
        "Ask the question cold — would they be happy at the same weight, different shape?",
        "Why is the answer always yes?",
        "What actually produces reshape?",
        "Where does the treadmill fit — helper, not main event?",
        "What number have they been chasing that never mattered?"
      ]
    },
    "objection": {
      "job": "Handle the reason they don’t start — in public, before it’s ever said on a call.",
      "goal": "“…he’s right, that is why I haven’t started.”",
      "think": [
        "Say it out loud — quote the objection.",
        "Why does it feel true? Be fair to it.",
        "What’s the specific math or pattern that takes it apart?",
        "What is it actually — underneath the excuse?",
        "Which client almost didn’t sign up for this exact reason?"
      ]
    },
    "win": {
      "job": "Proof. Not the result — the belief that changed.",
      "goal": "“Someone exactly like me thought that too, and got past it.”",
      "think": [
        "What did they believe that turned out to be wrong?",
        "Where were they, and what had they already tried?",
        "What changed in their head? (This is the whole post.)",
        "Say the result last — keep it short.",
        "Whose story is this, in one honest line?"
      ]
    },
    "app": {
      "job": "Catch the people who want results but aren’t ready to pay. Still leads.",
      "goal": "“I can start today, for free, no excuse left.”",
      "think": [
        "Who isn’t ready for a coach yet — and what would you tell them to do?",
        "What does the free app actually give them?",
        "Why is a coach still better — and why say so honestly?",
        "What’s the one-tap next step?"
      ]
    },
    "story": {
      "job": "Connection. Let them see the person before the plan.",
      "goal": "“He’s been where I am.”",
      "think": [
        "Start inside the moment — where were you, what were you feeling?",
        "What did you believe then?",
        "What broke that belief?",
        "How does it show up in how you coach now?"
      ]
    }
  },
  "quality_check": [
    "My hook names a group, not “you”",
    "One idea only",
    "I said the CTA out loud",
    "Under 60 seconds",
    "My link is in the caption and bio"
  ],
  "dm_response": {
    "note": "Don’t sell in the DMs. Get them to the link.",
    "text": "Appreciate you reaching out. Drop your name and number at {link} and I’ll get you on a quick call to see if I can help."
  },
  "hooks_profanity": {
    "h_not_lazy": {
      "blunt": "{audience} aren't lazy. The plan's shit. Big difference."
    },
    "h_year": {
      "funny": "A year at the same weight isn't a plateau. It's a damn lifestyle. Let's break up with it."
    },
    "h_paid_for": {
      "funny": "{audience} are funding an entire industry built on them not getting results. Hell of a business model. Terrible deal."
    },
    "h_myself": {
      "funny": "\"I'll do it myself\" is a bold-ass plan from someone on year four of doing it themselves."
    },
    "h_afford": {
      "blunt": "\"Can't afford a trainer.\" You found the money for everything else. Let's do the damn math."
    }
  },
  "post_type_voices": {
    "win": {
      "blunt": "When {proof_name} started, they were sure of one thing: {proof_belief}. They were wrong.",
      "warm": "I want to tell you about {proof_name} — because when they walked in, they believed exactly what you might believe right now: {proof_belief}.",
      "funny": "{proof_name} showed up certain that {proof_belief}. I love it when they're certain. Makes the next part better.",
      "technical": "{proof_name}'s starting assumption was {proof_belief}. Reasonable. Also wrong — and the interesting part is why."
    },
    "win_self": {
      "blunt": "I used to believe {old_belief}. Here's what it cost me.",
      "warm": "I believed {old_belief} for a long time, and I want to tell you what it cost — because I think you might believe it too.",
      "funny": "For years I believed {old_belief}, which explains a lot of photos from that era.",
      "technical": "My operating assumption for years was {old_belief}. Here's the full cost of that error, itemized."
    },
    "app": {
      "blunt": "Not ready to hire a coach? Fine. Don't start with nothing either.",
      "warm": "If hiring a coach isn't in the cards right now, that's completely okay — but please don't start with nothing.",
      "funny": "Not everyone's ready to hire a coach. Some of you have made that extremely clear. So here's plan B, and it's free.",
      "technical": "If coaching isn't accessible right now, the next-best option needs three things: a plan, tracking, and structure. This has all three, free."
    },
    "reframe": {
      "question": "If you weighed exactly the same as you do right now — but looked like the person you want to look like — would you be happy?",
      "blunt": "Everyone says yes. Every single one. So the scale was never the goal.",
      "warm": "Take a second with that. Almost everyone says yes — and that answer changes everything about what you should be doing.",
      "funny": "Everyone hesitates like it's a trick question, then says yes. It's not a trick. The scale's just been lying to you about what you want.",
      "technical": "The answer is nearly always yes — which means weight is a proxy metric, and you've been optimizing the proxy instead of the goal."
    }
  }
};
  try { window.RiseContentTemplates = LIB; } catch (e) {}
})();
