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
      tasks: [
        { id: 'link', title: 'Set up your link', body: 'Gear icon on your coach page → copy your link → put it in your bio (or Linktree, or shorten it at tinyurl.com first).' },
        { id: 'profile', title: 'Fix your profile', body: 'Bio line, a clear face photo, link visible.', bioLine: true },
        { id: 'pins', title: 'Record & pin three videos', body: 'Scripts are below. Film them, pin all three to the top of your profile.', pins: true },
        { id: 'guide', title: 'Read the filming guide', body: 'Two minutes. Vertical, good light, talk to one person, first line is the hook.' }
      ]
    }
  };

  try { window.RiseContentConfig = CFG; } catch (e) {}
})();
