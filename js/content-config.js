/* RiseForIt — Content Program config: the questionnaire schema, section intro
   cards, plate levels, and Day-Zero launch tasks. All editable data — the
   engine renders whatever is here. Two paths: 'quick' (load-bearing only) and
   'detailed' (everything). A quick question is also in detailed. */
(function () {
  'use strict';

  var CFG = {
    // ---- path chooser ----
    paths: {
      quick: { id: 'quick', name: 'Quick', count: 14, mins: '4 min', pitch: 'Gets you a working program today. Your posts will be solid but more general — they’ll sound like a good trainer, not specifically like you. You can upgrade anytime and everything regenerates.' },
      detailed: { id: 'detailed', name: 'Detailed', count: 28, mins: 'about 20 min', pitch: 'Your posts come out sounding like you actually talk, built on your story and what you believe. This is the one that works. Most people who skip it end up doing it later anyway.' }
    },

    // ---- section intro cards (shown before each section's questions) ----
    sections: {
      who: { title: 'Who you train', body: 'Speak to everyone and you connect with no one. The trainers who fill their calendar are the ones a specific person feels seen by.' },
      stand: { title: 'What you stand for', body: 'You’ll say the same few things for years. That’s not repetitive — that’s how anyone becomes known for anything. Nike didn’t become a basketball brand because Jordan wore them once. He wore them every night for years. Same with what you post.' },
      story: { title: 'Your story', body: 'Nobody buys the plan. They buy the person who already walked it. The part you’re hesitant to share is usually the part that lands.' },
      proof: { title: 'Proof', body: 'The result isn’t what makes a testimonial work. What makes it work is what they believed that turned out to be wrong.' },
      reality: { title: 'Your reality', body: 'We’re not giving you a program you’ll quit in three weeks. Answer these honestly and we’ll start you where you actually are.' },
      voice: { title: 'Your voice', body: 'You already know how to talk to a client on the gym floor. This is just making sure your posts sound like that.' }
    },

    // ---- questions (order matters). type: text | textarea | chips | choice | days ----
    questions: [
      // --- WHO ---
      { id: 'audience', section: 'who', path: 'quick', type: 'chips', label: 'Who do you train?', sub: 'Say it the way you’d describe them out loud.', blank: 'I train ___', softCap: 8, example: 'men over 30 who used to be athletes', lesson: 'Groups, not individuals. “Men over 30” gets watched. “You” gets scrolled.', why: 'Every hook you post names this group. If it’s vague or singular, the hooks fall flat. A specific group makes a specific person stop scrolling.', chips: ['men over 30', 'busy moms', 'beginners in their first year', 'guys who used to be athletes', 'women over 40', 'new lifters', 'shift workers', 'desk-job dads'], inputmode: 'text', validate: 'audience', required: true },
      { id: 'audience_short', section: 'who', path: 'quick', type: 'text', label: 'That’s good — but too long for a hook.', sub: 'Give me the short version. Three or four words. This is what goes in your hooks — the longer version still shows up in your material.', blank: 'I train ___', softCap: 4, example: 'men over 35', showIfSentence: 'audience', prefillFrom: 'audience', validate: 'audience', required: true },
      { id: 'outcome', section: 'who', path: 'quick', type: 'textarea', label: 'What do they get from working with you?', sub: 'Finish the sentence.', blank: 'My clients finally ___', softCap: 8, example: 'lose 30 lbs without giving up food they like', why: 'This is the promise in your CTA and your app posts. Say it the way they’d say it, not in coach-speak.', required: true },

      // --- STAND ---
      { id: 'core', section: 'stand', path: 'quick', type: 'text', label: 'What’s the ONE thing you want to be known for?', sub: 'Finish the sentence.', blank: 'I’m the trainer who ___', softCap: 8, example: 'eating enough protein', why: 'You’ll repeat this for years until people associate you with it. Pick the hill you’ll die on.', chips: ['eating enough protein', 'training with intent', 'strength before cardio', 'recovery and sleep', 'consistency over intensity'], required: true },
      { id: 'support1', section: 'stand', path: 'detailed', type: 'text', label: 'One thing that backs that up.', sub: 'A reason your one thing is right.', example: 'muscle is what keeps the weight off for good', required: true },
      { id: 'support2', section: 'stand', path: 'detailed', type: 'text', label: 'One more thing that backs it up.', sub: 'A second reason.', example: 'it’s the only diet lever that also kills cravings', required: true },
      { id: 'contrarian', section: 'stand', path: 'detailed', type: 'textarea', label: 'What do you believe that most trainers won’t say?', sub: 'Your contrarian take.', example: 'cardio is the least important thing you can do to lose fat', lesson: 'This is the single thing that’ll make you memorable instead of another fitness account.', why: 'The belief post runs about monthly and it’s the one people remember and repeat. It has to have an edge.', required: true },

      // --- STAND: the 3 mistakes ---
      { id: 'mistake1', section: 'stand', path: 'quick', type: 'chips', label: 'Something you constantly see them get wrong.', sub: 'Finish the sentence — mistake #1.', blank: 'Most of them ___', softCap: 8, example: 'they train hard and eat like they didn’t', lesson: 'Specific beats broad. “They train hard and eat like they didn’t” beats “they’re not consistent.”', why: 'Your Mistake posts cycle these for weeks. Specific ones make people feel called out — in a good way.', chips: ['train hard, eat like they didn’t', 'skip protein at breakfast', 'do endless cardio', 'cut calories too hard', 'program-hop every 3 weeks', 'never progress the weight', 'chase soreness not strength', 'skip sleep and wonder why'], required: true },
      { id: 'mistake2', section: 'stand', path: 'quick', type: 'chips', label: 'Another thing they get wrong.', sub: 'Finish the sentence — mistake #2.', blank: 'Most of them also ___', softCap: 8, example: 'they only train what they can see in the mirror', chips: ['only train the mirror muscles', 'weigh themselves daily and panic', 'go all-or-nothing', 'copy influencer workouts', 'never eat enough', 'do too much too soon', 'quit the week before it works'], required: true },
      { id: 'mistake3', section: 'stand', path: 'quick', type: 'chips', label: 'One more they get wrong.', sub: 'Finish the sentence — mistake #3.', blank: 'And a lot of them ___', softCap: 8, example: 'they wait to feel motivated', chips: ['wait to feel motivated', 'start over every Monday', 'compare week 1 to someone’s year 5', 'fear carbs', 'skip warm-ups then get hurt', 'train around an injury instead of fixing it'], required: true },

      // --- STORY ---
      { id: 'turning_point', section: 'story', path: 'quick', type: 'textarea', label: 'What changed for you? One line.', sub: 'Your turning point.', example: 'I stopped chasing motivation and built a system', why: 'This shows up across your stories. The honest version beats the polished one.', required: true },
      { id: 'before', section: 'story', path: 'detailed', type: 'textarea', label: 'What were you like before?', sub: 'Where you started. Don’t clean it up.', example: 'skinny-fat, tried every diet, gave up by February every year', required: true },
      { id: 'old_belief', section: 'story', path: 'detailed', type: 'textarea', label: 'What did you used to believe that was wrong?', sub: 'The lie you bought into.', example: 'that I needed more willpower', required: true },
      { id: 'why', section: 'story', path: 'detailed', type: 'textarea', label: 'Why do you do this?', sub: 'The real reason, not the interview answer.', example: 'I don’t want anyone to waste the decade I wasted', required: true },

      // --- PROOF (with no-clients branch) ---
      { id: 'has_proof', section: 'proof', path: 'quick', type: 'choice', label: 'Have you gotten someone a result yet?', sub: 'No clients yet? You’re the case study. Everything works the same — you just answer it about yourself.', choices: [{ v: 'client', label: 'Yes — I’ve helped a client' }, { v: 'self', label: 'Not yet — I’m my own proof' }], required: true },
      { id: 'proofName', section: 'proof', path: 'quick', type: 'text', label: 'Who did you get a result for?', sub: 'First name or initial is fine.', example: 'J.', showIf: { has_proof: 'client' }, required: true },
      { id: 'proof_pronoun', section: 'proof', path: 'quick', type: 'choice', label: 'How should we refer to them?', sub: 'One tap — it keeps their story reading right.', choices: [{ v: 'he', label: 'He / him' }, { v: 'she', label: 'She / her' }, { v: 'they', label: 'They / them' }], showIf: { has_proof: 'client' }, required: true },
      { id: 'proofResult', section: 'proof', path: 'quick', type: 'text', label: 'What was the result?', sub: 'The number is the least interesting part — but we still want it.', example: 'down 24 lbs in 12 weeks', lesson: 'The number is the least interesting part. What changed in their head is the story.', showIf: { has_proof: 'client' }, required: true },
      { id: 'proofBelief', section: 'proof', path: 'detailed', type: 'textarea', label: 'What did they believe that turned out to be wrong?', sub: 'This is the part that makes the testimonial land.', example: 'that they’d have to give up bread forever', showIf: { has_proof: 'client' }, required: true },
      // self-proof versions
      { id: 'selfResult', section: 'proof', path: 'quick', type: 'text', label: 'Where are you now?', sub: 'Your own result so far.', example: 'down 30 lbs and finally kept it off', showIf: { has_proof: 'self' }, required: true },

      // --- STAND: objection (its own post type) ---
      { id: 'objection', section: 'stand', path: 'quick', type: 'chips', label: 'When someone doesn’t sign up, what’s the reason?', sub: 'The thing in their head that stops them.', example: 'they think they don’t have time', chips: ['they think they don’t have time', 'they think they need to get fit first', 'they’ve been burned by a coach before', 'they think it’s too expensive', 'they don’t think it’ll work for them', 'they want to try alone first'], required: true },
      { id: 'objection2', section: 'stand', path: 'detailed', type: 'chips', label: 'One more reason people hesitate.', sub: 'A second objection.', example: 'they’re embarrassed about where they’re starting', chips: ['embarrassed about their starting point', 'tried everything, expect to fail again', 'too busy with kids', 'don’t want to give up drinking', 'think they’re too old', 'waiting for the “right time”'], required: true },
      { id: 'fear', section: 'story', path: 'detailed', type: 'chips', label: 'What are they secretly afraid of?', sub: 'Deeper than the objection.', example: 'that this is just who they are now', chips: ['that this is just who they are now', 'that they’ll never feel confident', 'that they’ll fail in front of people', 'that they’ve left it too late', 'that nothing works for them'], required: true },

      // --- VOICE ---
      { id: 'voice', section: 'voice', path: 'quick', type: 'choice', label: 'How do you talk?', sub: 'Pick the one closest to you.', choices: [{ v: 'blunt', label: 'Straight and blunt' }, { v: 'warm', label: 'Warm and encouraging' }, { v: 'funny', label: 'Funny and dry' }, { v: 'technical', label: 'Calm and technical' }], required: true },
      { id: 'profanity', section: 'voice', path: 'detailed', type: 'choice', label: 'Do you swear?', sub: 'We’ll match your posts to how you actually talk.', choices: [{ v: 'no', label: 'No' }, { v: 'some', label: 'Occasionally' }, { v: 'yes', label: 'Yes' }], required: true },
      { id: 'catchphrase', section: 'voice', path: 'detailed', type: 'text', label: 'Got a phrase you say a lot?', sub: 'A line that’s yours.', example: 'discipline is a love language', required: true },

      // --- REALITY (Section 6) ---
      { id: 'consistency', section: 'reality', path: 'quick', type: 'choice', label: 'How consistent have you been posting?', sub: 'Honestly.', choices: [{ v: 'never', label: 'Barely ever' }, { v: 'onoff', label: 'On and off' }, { v: 'regular', label: 'Pretty regular' }], required: true },
      { id: 'camera', section: 'reality', path: 'quick', type: 'choice', label: 'How do you feel on camera?', sub: 'No wrong answer.', choices: [{ v: 'hate', label: 'Hate it' }, { v: 'learning', label: 'Getting used to it' }, { v: 'comfortable', label: 'Comfortable' }], required: true },
      { id: 'time', section: 'reality', path: 'quick', type: 'choice', label: 'How much time can you give this a day?', sub: 'Be real — we’ll build to fit.', choices: [{ v: '10', label: '~10 min' }, { v: '20', label: '~20 min' }, { v: '30', label: '30+ min' }], required: true },
      { id: 'price', section: 'reality', path: 'detailed', type: 'choice', label: 'What do you charge (or plan to)?', sub: 'Ballpark per month.', choices: [{ v: 'low', label: 'Under $100' }, { v: 'mid', label: '$100–250' }, { v: 'high', label: '$250+' }], required: true },
      { id: 'days', section: 'reality', path: 'quick', type: 'days', label: 'How many days a week can you post?', sub: 'Start at 3 — you’ll add days later.', required: true }
    ],

    // ---- plate levels (posts = weekly posting volume the level requires) ----
    levels: [
      { plates: 1, weight: 135, name: 'Bar work', unlockDays: 0, posts: 3, desc: '3 posts/wk + 5 stories daily. Building the habit.' },
      { plates: 2, weight: 225, name: 'Working sets', unlockDays: 30, posts: 5, desc: 'You’re consistent now, so we add volume — 5 posts/wk + stories.' },
      { plates: 3, weight: 315, name: 'Heavy', unlockDays: 60, posts: 5, desc: '5 posts + stories + one long-form video a week. Long form is where trust gets built.' },
      { plates: 4, weight: 405, name: 'Max effort', unlockDays: 90, posts: 5, desc: 'Everything above, plus a weekly review: what’s working gets more, what isn’t gets cut.' }
    ],

    // ---- "Suggest for me" pools: templates with the same {variable} slots.
    // Hidden unless the composing answers in suggestNeeds exist (no generic filler). ----
    suggestNeeds: {
      outcome: ['audience'], support1: ['core'], support2: ['core'], contrarian: ['audience', 'core'],
      turning_point: [], before: [], old_belief: [], why: ['audience'], proofResult: [], proofBelief: [], selfResult: [], catchphrase: []
    },
    suggestions: {
      outcome: [
        'help {audience} finally {outcome}', 'get {audience} strong without living in the gym', 'help {audience} lose the fat and keep it off', 'get {audience} results without giving up the food they like',
        'help {audience} build a body they’re proud of, on a real schedule', 'get {audience} out of the start-and-stop cycle for good', 'help {audience} feel like themselves again', 'get {audience} their energy and confidence back',
        'help {audience} train around a busy life, not against it', 'get {audience} the first real progress they’ve had in years'
      ],
      core: [
        'eating enough protein', 'training with intent, not just sweating', 'getting stronger before doing more cardio', 'sleep and recovery being non-negotiable', 'consistency beating intensity',
        'lifting heavy and eating enough', 'building the habit before chasing the goal', 'progress over perfection', 'doing less, but doing it every week', 'strength as the foundation for everything else'
      ],
      support1: [
        '{core} is the one lever that actually moves the needle', 'nothing else works until {core} is handled', '{core} is what keeps the results after the diet ends', 'skip {core} and you’re just spinning your wheels',
        'every client who wins does {core} first', '{core} is boring, which is exactly why it works', 'the people stuck for years are the ones ignoring {core}'
      ],
      support2: [
        'it’s the piece the influencers never mention', 'it’s free and most people still skip it', 'it’s what separates the ones who keep it off', 'it works at any age and any starting point', 'it’s simple, not easy — that’s the point'
      ],
      contrarian: [
        '{audience} don’t need a new program, they need to nail {core}', 'most {audience} are training completely backwards', 'cardio is the least important thing {audience} can do', '{audience} don’t have a discipline problem, they have a {core} problem',
        'more workouts won’t save {audience} — {core} will', 'the fitness industry keeps {audience} busy so they never fix {core}', '{audience} are one honest habit away, and it’s {core}', 'motivation is a myth {audience} keep waiting on'
      ],
      turning_point: [
        'I stopped chasing motivation and built a system I could keep', 'I quit program-hopping and finally committed to one thing', 'I got honest about what I was actually eating', 'I stopped training for soreness and started training for progress',
        'I realized consistency beat every perfect week I ever had', 'I stopped hiding from the camera and started showing up', 'I fixed my sleep and everything else followed', 'I stopped doing what looked good and did what worked'
      ],
      before: [
        'skinny-fat, tried every diet, quit by February every year', 'strong in the gym but soft everywhere else', 'exhausted, out of shape, avoiding photos', 'in decent shape once, then life happened',
        'training hard and going nowhere for years', 'stuck in the start-over-every-Monday loop'
      ],
      old_belief: [
        'that I just needed more willpower', 'that cardio was the answer', 'that I had to be perfect or it didn’t count', 'that I didn’t have the genetics',
        'that being busy meant I couldn’t', 'that I’d already left it too late'
      ],
      why: [
        'I don’t want {audience} wasting the years I wasted', 'I know what it’s like to be where {audience} are, and I know the way out', 'someone did this for me and it changed my life', 'watching {audience} get their confidence back never gets old',
        'I’m tired of {audience} getting sold garbage that doesn’t work'
      ],
      proofResult: [
        'down 24 lbs in 12 weeks', 'lost 30 lbs and kept it off for a year', 'first pull-up at 45', 'off two medications after six months', 'down four pant sizes without a crash diet', 'stronger at 50 than they were at 30'
      ],
      proofBelief: [
        'that they’d have to give up bread forever', 'that they were too old to change', 'that they’d tried everything already', 'that they had no willpower', 'that it would take hours a day'
      ],
      selfResult: [
        'down 30 lbs and I’ve kept it off', 'stronger and leaner than I’ve ever been', 'off the blood-pressure meds', 'finally training in a way I can keep forever', 'more energy than I had in my twenties'
      ],
      catchphrase: [
        'discipline is a love language', 'boring works', 'you don’t need more, you need consistent', 'strong is the goal, lean is the byproduct', 'show up before you feel like it'
      ]
    },

    // ---- Day Zero launch tasks + pinned-video scripts ----
    dayZero: {
      pins: [
        { id: 'pin1', title: 'Who I am', len: '60–75 sec', beats: ['Who you are and who you help', 'Why you do this (your story, one line)', 'What you’ll be posting and why they should follow'],
          script: 'Hey — I’m {name}. I help {audience} {outcome}.\nI do this because {why}.\nOn this page I’m going to show up for {audience} — the mistakes I see, the wins my people get, and the stuff nobody tells you. If that’s you, stick around.' },
        { id: 'pin2', title: 'What I believe', len: '45–60 sec', beats: ['Your contrarian take — say it in the first 3 seconds', 'Why it’s true', 'What it means for them'],
          script: 'Here’s something most trainers won’t say: {contrarian}.\nI know that’s not what you’ve heard. But {core} is what actually moves the needle for {audience}.\nIf you’ve been doing the opposite and spinning your wheels — that’s why. Follow along and I’ll show you.' },
        { id: 'pin3', title: 'Proof', len: '45–60 sec', beats: ['What they believed that was wrong', 'What changed in their head', 'The result — last'],
          script: '{proofLead}\nWhat changed wasn’t effort — it was believing the right thing and building around {core}.\n{proofResultLine}\nThat’s what’s possible for {audience}. Link’s in my bio when you’re ready.' }
      ],

      // ---- The VSL: the one video that lives on their coach page, not their feed.
      // NOT a fourth pin. The three pins above go on their Instagram profile; this
      // one is horizontal, longer, and is the thing every link in bio points AT.
      // Rendered from THIS object (there is no LIB.pins entry for it), so unlike
      // the pins above, `beats` and `script` here are live — edit them freely.
      vsl: {
        id: 'vsl',
        title: 'The video on your page',
        len: '90 sec – 2 min',
        target: 'about 90 seconds',
        floor: '90 sec',
        // The route that actually exists, and the one that can't destroy their
        // page. "Edit" (not "Edit page") is what the button says on a coach
        // page; the canvas context menu is wired to the same upload the
        // template panel uses, and Done saves AND publishes in one step.
        where: 'Your coach page → Edit → right-click the spot where you want the video (double-tap on a phone) → Add video → pick your file → Done. Done saves and publishes in one step.',
        hook: 'This is for {audience}.',
        hookAlt: 'This one’s for the people I train.',
        note: 'Different rules from your feed videos. Turn the phone sideways, set the camera to 720p, and talk for about a minute and a half — assume they can hear you, they pressed play on purpose. Everything in the filming guide about light, eye level and talking to one person still applies.',
        // No stopwatch per beat, on purpose. A trainer who times their first
        // line against a 12-second window and lands on 24 concludes they got it
        // wrong on take one — which is the exact moment they put the phone down.
        // `needs` = drop this beat entirely if that answer was never given.
        beats: [
          { label: 'Who it’s for', job: 'Say who it’s for and name the thing they’re stuck on. No hello, no name yet, no “welcome to my page”.' },
          { label: 'Who you are', job: 'One number — how long, how many. Then the thing you did it without. The “without” is what stops it sounding like a brag.' },
          { label: 'Your story', job: 'One scene from your own story. A place and a time, not a summary. Ends on the line that changed it.' },
          { label: 'What you believe', needs: 'contrarian', job: 'What you believe that most trainers won’t say, and the one thing everything you do is built on.' },
          { label: 'Proof', job: 'Proof. What they believed that was wrong, first. The number last — it lands harder there.' },
          { label: 'What happens', job: 'What actually happens week to week. This is the part they came to the page for. Be boring and specific.' },
          { label: 'Who it’s not for', job: 'Who it’s not for, then the reason people hesitate and what’s under it.' },
          { label: 'What to do', job: 'One instruction. Say it once, then say what happens after they do it.' }
        ],
        // Exactly 8 blocks separated by a blank line, index-aligned to `beats`.
        // ___ is a blank THEY fill from the questions below. {braces} we fill.
        script:
          'This is for {audience}. If that’s not you, this one’s going to waste your time.\n' +
          'Most of the people who come to me are stuck in the same place — {mistake1}.\n' +
          'Give me the rest of this video and I’ll show you exactly what I do about it.\n\n' +
          'I’m {name}. I’ve been training people for ___ years, and I’ve worked with about ___ of them.\n' +
          'And I’ve done all of it without ___.\n\n' +
          'I’m not coming at this from the outside. A few years ago I was {before}.\n' +
          'Then ___.\n' +
          'That was when {turning_point}.\n' +
          'It’s the reason I still do this — {why}.\n\n' +
          'Here’s what I believe, and most trainers won’t say it out loud: {contrarian}.\n' +
          'That’s the lever for {audience}. Everything I do with a client is built on it — the rest is noise.\n\n' +
          '{proofLead}\n' +
          'That belief was the problem. Not effort, not willpower — the belief.\n' +
          'Once that changed, the rest followed.\n' +
          '{proofResultLine}\n\n' +
          'So here’s what actually happens if we work together.\n' +
          'In your first two weeks, ___.\n' +
          'After that it’s ___.\n' +
          'All of it is built around {core}, and all of it is pointed at one thing: my clients finally {outcome}.\n\n' +
          'This isn’t for everybody. If you’re someone who ___, I’m honestly not your guy.\n' +
          'Most people who don’t start tell me {objection}.\n' +
          'Underneath that it’s usually {fear} — and that’s the part I’d actually be working on with you.\n\n' +
          'If that sounds like what you’ve been after, use the form on this page and tell me where you’re starting.\n' +
          'Takes two minutes, and I’m the one who reads it.\n' +
          'Once you send it, ___.\n' +
          'That’s it. I’m {name} — talk soon.',
        // Swapped in for block 5 when has_proof === 'self' — the same fork pin3
        // already makes. Needed because on the self path {proofLead} degrades to a
        // bare “I’ve been exactly where you are.” and “That belief” refers to nothing.
        // {?id} is a SOFT slot: their own answer if they gave one, a blank if not.
        // Never a stand-in sentence — this one they say about themselves.
        scriptSelf:
          'Back when I started I was sure {?old_belief}.\n' +
          'That belief was the problem. Not effort, not willpower — the belief.\n' +
          'Once that changed, the rest followed.\n' +
          '{proofResultLine}',
        askIntro: 'Answer these out loud before you film. Four of them we already know — you’re just checking we got you right. The rest are the blanks in the script.',
        ask: [
          { q: 'We’ve got you down as training {audience}. Say that out loud once. If it’s not how you’d say it to their face, say it your way and use that instead.', beat: 1, from: 'audience_short' },
          { q: 'The mistake we put first is — {mistake1}. Is that the one you’d bring up to a stranger? If not, swap in one of your other two.', beat: 1, from: 'mistake1' },
          { q: 'How long have you been training people, and roughly how many have you worked with? Say the number even if it’s small — “about fifteen” is a number. Then finish this: “and I’ve done all of it without ___.”', beat: 2 },
          { q: 'You said your turning point was {turning_point}. Where were you when that landed? What day was it, what were you doing? Give me the room, not the lesson.', beat: 3, from: 'turning_point' },
          { q: 'Think about {proofName} — what did {p_they} actually say to you in the first week that told you {p_they} didn’t believe it would work? Their words, not yours.', beat: 5, from: 'proofBelief', only: 'client' },
          { q: 'Back when you thought this wouldn’t work for you either — what were you telling yourself? Say it the way you actually said it.', beat: 5, from: 'old_belief', only: 'self' },
          { q: 'Walk me through someone’s first two weeks with you. What do they get, and what day do they get it?', beat: 6 },
          { q: 'How do you and a client actually talk during the week — app, texts, calls? How often, and who starts it?', beat: 6 },
          { q: 'Finish this: “if you’re someone who ___, I’m not your guy.” Say the one that would annoy you on a call.', beat: 7 },
          { q: 'They send the form on your page. What happens next, and how fast do they hear from you? The real number, not the one you wish were true.', beat: 8 },
          { q: 'Say your price out loud the way you’d say it on a call, and what they get for it. Don’t want it on camera? Fine — but then the call has to cover it.', beat: 8, optional: true }
        ],
        mvpBeats: [1, 3, 5, 6, 8],
        // This is the DEFAULT version, not the fallback. Five beats, about 90
        // seconds, and it fits the page's 80MB upload limit at 720p with room
        // spare — which the full eight-beat version does not.
        mvpNote: 'Five beats — who it’s for, your story, your proof, what actually happens, what to do next. About 90 seconds, and it does the whole job. The other three beats are version two, next week, if you want them.',
        done: 'A sideways video of you, 90 seconds or longer, published on your page, that plays when you open your own link on your phone. Not good. Up.',
        allowed: [
          'Reading off notes just off camera. I do it in my own video and I say so out loud.',
          'Saying “um”. Starting a sentence again. Losing your place for a second.',
          'Gym noise, music in the background, someone walking behind you.',
          'No captions, no music, no B-roll, no intro animation. None of that sells anything.',
          'One take with one obvious cut in it.',
          'Your price said as a range, the way you’d say it on the phone.'
        ],
        skip: [
          'The years-and-numbers beat, if you haven’t got numbers yet. Go straight to your story.',
          'The belief beat, if the video that sent them here already made that argument.',
          'The who-it’s-not-for beat, if it feels arrogant on take one. Add it to version two.',
          'The price, if you’d rather cover it on the call.'
        ],
        never: [
          'Saying who it’s for in the first ten seconds. Skip that and the page reads as generic.',
          'One piece of proof, told belief-first.',
          'What actually happens week to week. It’s the single thing they came to the page to find out.',
          'One instruction at the end, said once.',
          'Being recognisably the same person as your reels. Same clothes, same gym, same voice. That’s a feature.'
        ],

        // ---- The lesson. Why this video exists and why a reel can’t do its job.
        // Plain prose, one string per paragraph — rewrite freely, nothing parses it.
        lesson: {
          title: 'Why this one is different',
          body: [
            'A reel gets someone to stop. This gets them to book. Different jobs — you can’t do the second one with the first.',
            'Every link you post sends people to one page. The first thing on that page should be you, talking to them. That’s the VSL. It stands for video sales letter, which sounds like something a man in a headset would sell you — ignore the name. It’s the conversation you’d have with someone who walked up to you on the gym floor and asked what you actually do.',
            'A reel has about three seconds to win a stranger who’s scrolling, so it gets one loud idea. Someone on your page has already stopped and already clicked. They want three answers: is this guy legit, what actually happens if I sign up, is this for someone like me. Without the video they read a headline, don’t find you anywhere on the page, and leave — that’s every reel you filmed this week, wasted at the last step. It’s one video, it works while you sleep, and you won’t want to redo it for a long while. Film it today, while the camera’s out and the light’s still good.'
          ]
        },

        // ---- Progress over perfection. Headings for the allowed/skip/never lists
        // above, plus the per-answer version and the closing line.
        progressTitle: 'Progress, not perfect. Here’s exactly what that buys you.',
        doneTitle: 'What “done” means',
        allowedTitle: 'You’re allowed to get all of this wrong',
        skipTitle: 'You can skip these entirely',
        neverTitle: 'These five carry the video — keep them',
        fitIntro: 'Built to fit how you answered:',
        // keys are the stored answer values for the `camera` and `time` questions.
        // None of these may end with "come back tomorrow" or "find a friend" —
        // the whole point is that they film it today, on their own, off the call.
        fit: {
          camera: {
            hate: 'Don’t film to a camera — prop the phone on a shelf, put the five beats on a sticky note next to the lens, and talk to the note. Stop the recording between beats if it helps; five short takes is still one video. Today, while you’re already annoyed enough to do it.',
            learning: 'Bullets on a sticky note next to the lens, and stop the recording between beats. Five short takes stitched together is still one video.',
            comfortable: 'Straight through, one take, don’t overthink it.'
          },
          time: {
            '10': 'The five-beat version — about 90 seconds. Read the beats once, then film. That’s the whole job at its minimum.',
            '20': 'Read the beats, say the questions out loud once, film. Twenty minutes covers all three — don’t split it across days, you’ll lose the thread.',
            '30': 'Film the five-beat version first so it’s done and uploaded. If you’ve still got time after that, open the full version and film that one too.'
          }
        },
        bar: 'A rough video of you on your page beats a perfect one you never filmed, and it beats no video by a mile. Three decent takes beat one perfect one that never gets uploaded.'
      },

      tasks: [
        { id: 'link', title: 'Set up your link', body: 'Gear icon on your coach page → copy your link → put it in your bio (or Linktree, or shorten it at tinyurl.com first).' },
        { id: 'profile', title: 'Fix your profile', body: 'Bio line, a clear face photo, link visible.', bioLine: true },
        { id: 'pins', title: 'Record & pin three videos', body: 'Scripts are below. Film them, pin all three to the top of your profile.', pins: true },
        { id: 'vsl', title: 'Record the video for your page', body: 'One video, about ninety seconds, phone sideways. It goes on your coach page — the page every link you just set up sends people to. Set the camera to 720p before you film: your page takes files up to 80MB, which is roughly two minutes at 720p and only eighty seconds at 1080p. Script and questions below.', vsl: true },
        { id: 'guide', title: 'Read the filming guide', body: 'Two minutes. Vertical, good light, talk to one person, first line is the hook.' }
      ]
    }
  };

  try { window.RiseContentConfig = CFG; } catch (e) {}
})();
