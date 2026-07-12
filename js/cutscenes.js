/* ====================================================================
   RiseForIt — CUTSCENES
   --------------------------------------------------------------------
   Fullscreen video cutscenes with event triggers:
     - intro.mp4 plays once, on the first overview visit after onboarding
     - promotion-<rank>.mp4 / demotion-<rank>.mp4 play when the identity
       engine's rank (window.OdeIdentity.pickType over ovIdentityStats)
       differs from the last rank the user was shown
   Videos live in /videos (see CUTSCENES below). 16:9 and 9:16 sources
   are both fine: the overlay uses object-fit: cover, so the frame is
   cropped — never squashed — on any screen.

   Everyone gets a Skip button 4 seconds in (bottom right). Owners get a
   "Cutscenes" entry injected into the control panel's OWNER section to
   preview/trigger any scene and reset the triggers for testing.

   localStorage:
     ode_intro_seen_v1      — intro already played
     ode_last_seen_rank_v1  — rank id the user last saw (promo/demo diff)
   ==================================================================== */
(function () {
    'use strict';

    var VIDEO_BASE = 'videos/';
    var SKIP_DELAY_MS = 4000;

    /* Background loops: one per rank + band. The band is picked from the
       average of the six stats, so a strong Peasant sees a different camp
       than a weak one. Thresholds are tuned to the engine's tier ranges. */
    var BACKGROUNDS = {
        peasant: [
            { band: 'weak', file: 'bg-peasant-weak.mp4', maxAvg: 18 },
            { band: 'normal', file: 'bg-peasant-normal.mp4', maxAvg: 27 },
            { band: 'strong', file: 'bg-peasant-strong.mp4', maxAvg: 999 }
        ],
        squire: [
            { band: 'weak', file: 'bg-squire-weak.mp4', maxAvg: 41 },
            { band: 'regular', file: 'bg-squire-regular.mp4', maxAvg: 47 },
            { band: 'strong', file: 'bg-squire-strong.mp4', maxAvg: 999 }
        ],
        mage: [
            { band: 'bad', file: 'bg-mage-bad.mp4', maxAvg: 58 },
            { band: 'good', file: 'bg-mage-good.mp4', maxAvg: 999 }
        ],
        ranger: [
            { band: 'weak', file: 'bg-ranger-weak.mp4', maxAvg: 58 },
            { band: 'strong', file: 'bg-ranger-strong.mp4', maxAvg: 999 }
        ],
        berserker: [
            { band: 'bad', file: 'bg-berserker-bad.mp4', maxAvg: 58 },
            { band: 'good', file: 'bg-berserker-good.mp4', maxAvg: 999 }
        ],
        knight: [
            { band: 'bad', file: 'bg-knight-bad.mp4', maxAvg: 77 },
            { band: 'good', file: 'bg-knight-good.mp4', maxAvg: 999 }
        ],
        king: [
            { band: 'regular', file: 'bg-king-regular.mp4', maxAvg: 999 }
        ]
    };

    var CUTSCENES = [
        { id: 'intro', file: 'intro.mp4', label: 'Intro — welcome to the app', kind: 'Intro' },
        { id: 'promotion-squire', file: 'promotion-squire.mp4', label: 'Peasant → Squire', kind: 'Promotions' },
        { id: 'promotion-mage', file: 'promotion-mage.mp4', label: 'Squire → Mage', kind: 'Promotions' },
        { id: 'promotion-ranger', file: 'promotion-ranger.mp4', label: 'Squire → Ranger', kind: 'Promotions' },
        { id: 'promotion-berserker', file: 'promotion-berserker.mp4', label: 'Squire → Berserker', kind: 'Promotions' },
        { id: 'promotion-knight', file: 'promotion-knight.mp4', label: 'Mage / Ranger / Berserker → Knight', kind: 'Promotions' },
        { id: 'promotion-king', file: 'promotion-king.mp4', label: 'Knight → King', kind: 'Promotions' },
        { id: 'demotion-peasant', file: 'demotion-peasant.mp4', label: 'Squire → Peasant', kind: 'Demotions' },
        { id: 'demotion-squire', file: 'demotion-squire.mp4', label: 'Knight → Squire', kind: 'Demotions' },
        { id: 'demotion-knight', file: 'demotion-knight.mp4', label: 'King → Knight', kind: 'Demotions' }
    ];
    // Backgrounds join the registry so the owner manager can preview them.
    Object.keys(BACKGROUNDS).forEach(function (rank) {
        BACKGROUNDS[rank].forEach(function (bg) {
            CUTSCENES.push({
                id: 'bg-' + rank + '-' + bg.band,
                file: bg.file,
                label: rank.charAt(0).toUpperCase() + rank.slice(1) + ' — ' + bg.band + ' loop',
                kind: 'Background',
                loop: true
            });
        });
    });
    // Ladder height per rank id — used to tell promotion from demotion.
    var TIER = { peasant: 0, squire: 1, mage: 2, ranger: 2, berserker: 2, knight: 3, king: 4 };

    var byId = function (id) {
        for (var i = 0; i < CUTSCENES.length; i++) { if (CUTSCENES[i].id === id) return CUTSCENES[i]; }
        return null;
    };

    /* ---------- text style presets (shared: editor picks, player renders).
       Each is themed to a scene family; recommendStylesFor() maps a scene
       id to the presets that fit its mood. ---------- */
    var TEXT_STYLES = {
        plain: { label: 'Plain White', css: 'color:#fff;font-weight:800;' },
        berserker: { label: 'Berserker Rage', css: 'color:#ff3b2f;font-weight:900;font-size:1.6em;text-transform:uppercase;letter-spacing:.04em;text-shadow:0 4px 18px rgba(180,0,0,.85),0 0 6px #000;' },
        royal: { label: 'Royal Decree', css: 'color:#f2d38a;font-family:"Playfair Display",serif;font-weight:700;font-size:1.3em;letter-spacing:.12em;text-shadow:0 2px 12px rgba(0,0,0,.85);' },
        knight: { label: "Knight's Oath", css: 'color:#e8ecf2;font-weight:900;font-size:1.25em;-webkit-text-stroke:1.5px #1a2430;text-shadow:0 3px 10px rgba(0,0,0,.75);' },
        mage: { label: 'Mage Whisper', css: 'color:#cba6ff;font-style:italic;font-weight:700;text-shadow:0 0 16px rgba(150,80,255,.95),0 2px 6px #000;' },
        ranger: { label: 'Ranger Wind', css: 'color:#9fe3a1;font-weight:700;font-style:italic;text-shadow:0 2px 10px rgba(0,60,20,.85);' },
        peasant: { label: 'Peasant Humble', css: 'color:#e9dfca;font-weight:600;text-shadow:0 2px 8px rgba(0,0,0,.85);' },
        fallen: { label: 'Fallen (demotion)', css: 'color:#9aa0a8;font-weight:800;letter-spacing:.06em;text-shadow:0 2px 10px #000;filter:grayscale(1);' },
        warning: { label: 'Warning', css: 'color:#ffd23f;font-weight:900;text-transform:uppercase;text-shadow:0 2px 0 #000,0 4px 12px rgba(0,0,0,.85);' },
        story: { label: 'Storybook', css: 'color:#fdf6e3;font-family:"Playfair Display",serif;font-style:italic;font-size:1.2em;text-shadow:0 2px 10px rgba(0,0,0,.8);' }
    };

    function recommendStylesFor(sceneId) {
        var id = String(sceneId || '');
        var rankStyle = id.indexOf('berserker') >= 0 ? 'berserker'
            : id.indexOf('king') >= 0 ? 'royal'
            : id.indexOf('knight') >= 0 ? 'knight'
            : id.indexOf('mage') >= 0 ? 'mage'
            : id.indexOf('ranger') >= 0 ? 'ranger'
            : id.indexOf('peasant') >= 0 ? 'peasant'
            : id.indexOf('squire') >= 0 ? 'story'
            : '';
        // Demotions are somber no matter which rank you land on.
        if (id.indexOf('demotion') >= 0) return ['fallen', rankStyle || 'warning'];
        if (id.indexOf('intro') >= 0) return ['story', 'royal'];
        if (rankStyle) return [rankStyle, rankStyle === 'berserker' ? 'warning' : 'story'];
        return ['plain', 'story'];
    }

    /* ---------- built-in scene copy (auto text overlays).
       Promotions/demotions: the kicker word fades out, then the rank title
       lands with a short punchy phrase (random each play — impactful, not
       detailed). Lateral moves (squire -> mage/ranger/berserker) explain
       WHY the stats sent them that way. ---------- */
    var SCENE_COPY = {
        'intro': { kicker: 'RISEFORIT', title: 'Every King was once a Peasant', phrases: [
            'Your story starts at the bottom. That is the point.',
            'The village does not know your name yet.',
            'No stats. No titles. Nothing but a first workout.'
        ] },
        'promotion-squire': { kicker: 'PROMOTION', title: 'Squire', phrases: [
            'You kept showing up. The grind noticed.',
            'Consistency bought your first title.',
            'The village stopped walking past you.',
            'One rank up. Ten thousand reps to go.'
        ] },
        'promotion-mage': { kicker: 'PROMOTION', title: 'Mage', lateral: true, phrases: [
            'Your recovery and nutrition outscored everything else. The quiet stats chose your path.',
            'You heal faster than you fight — sleep, food, discipline. That is a Mage.',
            'Power built in the kitchen and the bed, not the pit. The order noticed.',
            'Your chart is calm where others spike. Control is your highest stat.'
        ] },
        'promotion-ranger': { kicker: 'PROMOTION', title: 'Ranger', lateral: true, phrases: [
            'Cardio towers over every other stat on your graph. The trail picked you.',
            'All engine. You outlasted everyone who out-lifted you.',
            'Your endurance was the loudest number on the chart. Rangers run on exactly that.',
            'Miles over muscle — your stats made this choice before you did.'
        ] },
        'promotion-berserker': { kicker: 'PROMOTION', title: 'Berserker', lateral: true, phrases: [
            'No cardio. All strength. Your chart red-lines in one direction — this one.',
            'Strength dwarfs everything else you logged. Berserkers aren’t balanced, they’re committed.',
            'You picked heavy things up until a title fell out. The iron chose you back.',
            'One stat carried you here, and it’s the one that breaks doors.'
        ] },
        'promotion-knight': { kicker: 'PROMOTION', title: 'Knight', phrases: [
            'Strength, engine, discipline — a complete fighter.',
            'No weak stat left to mock. That is rare.',
            'You earned armor the only way it is sold: everywhere at once.'
        ] },
        'promotion-king': { kicker: 'PROMOTION', title: 'King', phrases: [
            'Nothing left to prove. Everything left to defend.',
            'The top of the pyramid. The wind is cold up here.',
            'Every peasant in the arena is coming for this.'
        ] },
        'demotion-peasant': { kicker: 'DEMOTION', title: 'Peasant', phrases: [
            'You couldn’t handle carrying a title.',
            'The streak broke. So did the rank.',
            'Back to the mud. It remembers you.',
            'Titles are rented. The rent was due.'
        ] },
        'demotion-squire': { kicker: 'DEMOTION', title: 'Squire', phrases: [
            'Knighthood demands upkeep. You stopped paying.',
            'The armor got heavy the moment you rested.',
            'You held the line — then you let go of it.'
        ] },
        'demotion-knight': { kicker: 'DEMOTION', title: 'Knight', phrases: [
            'The crown slipped. Kings never get to rest.',
            'The throne only counts what you did this week.',
            'Still elite. No longer untouchable.'
        ] }
    };

    /* Idle loop screens: the small print is about MENTALITY — you are in
       this state because of where your head is at, not your muscles.
       tone: low = shock them awake, mid = push, high = pride. */
    var BG_COPY = {
        'bg-peasant-weak': { title: 'Peasant', tone: 'low', subs: [
            'You stopped trying — not loudly, quietly. The kind nobody sees but the mirror.',
            'Barely moving because barely trying. This village is a mental state.',
            'You’re not stuck here. You’re staying here. There’s a difference.'
        ] },
        'bg-peasant-normal': { title: 'Peasant', tone: 'mid', subs: [
            'You do the minimum and call it a start. Fine — starts are supposed to end.',
            'Half-in. The village can tell.',
            'Showing up sometimes is still a decision to stay a peasant.'
        ] },
        'bg-peasant-strong': { title: 'Peasant', tone: 'high', subs: [
            'This is what trying looks like. Keep it and the fields lose you.',
            'Too strong for the village. The next rank is already staring at you.'
        ] },
        'bg-squire-weak': { title: 'Squire', tone: 'low', subs: [
            'You earned the title, then relaxed. That’s how squires become peasants again.',
            'The promotion was a beginning. You’ve been treating it like a finish line.'
        ] },
        'bg-squire-regular': { title: 'Squire', tone: 'mid', subs: [
            'Steady hands, steady habits. Now decide who you become: mind, miles, or muscle.',
            'Solid. Unremarkable. The next move is a choice, not an accident.'
        ] },
        'bg-squire-strong': { title: 'Squire', tone: 'high', subs: [
            'The training yard is getting too small for you. Everyone can see it.',
            'You outgrew the title before the title noticed.'
        ] },
        'bg-mage-bad': { title: 'Mage', tone: 'low', subs: [
            'You know exactly what to do. You’ve just stopped doing it.',
            'All that discipline, gathering dust. Knowledge without reps is a spell that fizzles.'
        ] },
        'bg-mage-good': { title: 'Mage', tone: 'high', subs: [
            'Sleep, food, recovery — mastered quietly, like everything you do.',
            'Power built the quiet way. Nobody saw the work. Everyone sees the result.'
        ] },
        'bg-ranger-weak': { title: 'Ranger', tone: 'low', subs: [
            'An engine only exists while it runs. You stopped running.',
            'The trail didn’t disappear. You just stopped walking it.'
        ] },
        'bg-ranger-strong': { title: 'Ranger', tone: 'high', subs: [
            'All engine, endless miles. Nobody outlasts you.',
            'Everyone else is resting. You never learned how.'
        ] },
        'bg-berserker-bad': { title: 'Berserker', tone: 'low', subs: [
            'Strong hands, sloppy habits. Rage is not a plan.',
            'You lift like it matters and live like it doesn’t.'
        ] },
        'bg-berserker-good': { title: 'Berserker', tone: 'high', subs: [
            'No cardio. All strength. The iron respects the honesty.',
            'You picked one thing and became terrifying at it.'
        ] },
        'bg-knight-bad': { title: 'Knight', tone: 'low', subs: [
            'The armor got comfortable. Standards slip one skipped session at a time.',
            'You’re coasting on who you used to be. Knights are judged on this week.'
        ] },
        'bg-knight-good': { title: 'Knight', tone: 'high', subs: [
            'Every stat held. That isn’t luck — that’s character.',
            'Balanced everywhere because you refuse to hide anywhere.'
        ] },
        'bg-king-regular': { title: 'King', tone: 'high', subs: [
            'The crown weighs exactly what your habits weigh. Keep both.',
            'The top of the pyramid. Everyone below is coming for it.'
        ] }
    };

    /* ---------- personalized stings: their own onboarding answers, said
       back to them (ode_identity_profile_v1 from the client quiz). Low
       tone hits where it hurts; high tone gives it back as pride. Injury/
       financial answers are never used against anyone. ---------- */
    function profileAnswers() {
        try {
            var p = JSON.parse(localStorage.getItem('ode_identity_profile_v1'));
            return (p && p.answers) || {};
        } catch (e) { return {}; }
    }
    function answerFlags() {
        var a = profileAnswers();
        var has = function (field, val) {
            var v = a[field];
            return Array.isArray(v) ? v.indexOf(val) >= 0 : v === val;
        };
        var eventName = (a.event && a.event !== 'No events any time soon')
            ? (a.event === 'Other' ? 'the day you circled' : 'the ' + String(a.event).toLowerCase())
            : '';
        return {
            Ev: eventName ? eventName.charAt(0).toUpperCase() + eventName.slice(1) : '',
            ev: eventName,
            breakup: has('weightEvents', 'Divorce or breakup'),
            work: has('weightEvents', 'Work pressure'),
            family: has('weightEvents', 'Busy family life'),
            unsure: has('confidence', 'I’m still really unsure') || has('confidence', "I'm still really unsure"),
            believe: has('confidence', 'I believe I can do it!'),
            slip: Number(a.agree4) >= 4,
            slipResults: Number(a.agree1) >= 4,
            rConf: has('mainReason', 'Become more confident in my body'),
            rEnergy: has('mainReason', 'Feel healthier and more energetic')
        };
    }

    /* Every scene speaks with its OWN voice: the personalized lines below are
       written per scene — a line that shows under the Peasant loop can never
       show under the Mage loop, a promotion, or the ceremony. All of them are
       still built from the user's own onboarding answers. Injury/financial
       answers are never used against anyone. */
    var SCENE_VOICE = {
        'bg-peasant-weak': function (c) {
            var L = [];
            if (c.slip) L.push('This is the exact slip you warned us about. The village watched it happen.', '“Try for a bit, then slip back” — your words, currently starring you.');
            if (c.unsure) L.push('You said you weren’t sure you could do this. The village mud agrees today.');
            if (c.work) L.push('Work pressure, you said. The knight walking past has a job too.');
            if (c.breakup) L.push('You said the breakup would light a fire. The village hasn’t seen smoke.');
            if (c.Ev) L.push(c.Ev + ' gets closer every session you skip. The Streets don’t care.');
            return L;
        },
        'bg-peasant-normal': function (c) {
            var L = [];
            if (c.slip) L.push('This is usually the week your slip-back arrives. Not this time. Keep walking.', 'Half-effort is where your old pattern sneaks in. Guard this streak.');
            if (c.believe) L.push('“I believe I can do it” — the market is starting to believe it too.');
            if (c.rEnergy) L.push('The energy you came for is arriving in small change. Collect the rest.');
            if (c.Ev) L.push(c.Ev + ' is coming. This pace gets you there — barely. Push.');
            return L;
        },
        'bg-peasant-strong': function (c) {
            var L = [];
            if (c.slip) L.push('Your old pattern was try-then-slip. The village is watching you break it in public.');
            if (c.believe) L.push('You called your shot at onboarding. The Drill Yard heard it.');
            if (c.unsure) L.push('The person who typed “really unsure” would not recognize this week.');
            if (c.Ev) L.push(c.Ev + ' is about to meet the strongest peasant this village ever produced.');
            return L;
        },
        'bg-squire-weak': function (c) {
            var L = [];
            if (c.slip) L.push('Squire is where your slip-back gets expensive. It costs the title.');
            if (c.work) L.push('“Work got busy.” The yard opens before your shift and closes after it.');
            if (c.rConf) L.push('You wanted to feel confident in your body. It isn’t hiding in skipped drills.');
            if (c.breakup) L.push('You promised the breakup would build a new you. The yard hasn’t met them yet.');
            return L;
        },
        'bg-squire-regular': function (c) {
            var L = [];
            if (c.Ev) L.push(c.Ev + ' will ask which path you chose. Have an answer ready.');
            if (c.slip) L.push('Steady is exactly how you beat your slip-back. Boring is the cure.');
            if (c.believe) L.push('Belief got you the title. Reps decide the path.');
            return L;
        },
        'bg-squire-strong': function (c) {
            var L = [];
            if (c.unsure) L.push('“Really unsure” typed the answers. A specialist-in-waiting is reading them.');
            if (c.slip) L.push('The old you slipped right about here. The new you is picking a specialty instead.');
            if (c.Ev) L.push(c.Ev + ' might get a specialist instead of a squire. Keep pushing.');
            return L;
        },
        'bg-mage-bad': function (c) {
            var L = [];
            if (c.slipResults) L.push('“Results never stick.” Spells don’t either, when you stop casting.');
            if (c.work) L.push('Work drained the mana, you said. The circle trains tired mages daily.');
            if (c.rEnergy) L.push('You came for energy. Mages brew it in bed and kitchen — the rooms you’re ignoring.');
            return L;
        },
        'bg-mage-good': function (c) {
            var L = [];
            if (c.slipResults) L.push('You said results never stick. Your chart is covered in ones that did.');
            if (c.believe) L.push('Quiet belief, quiet work. The loudest chart in the circle.');
            if (c.Ev) L.push(c.Ev + ' arrives to find a mage in full control. As planned.');
            return L;
        },
        'bg-ranger-weak': function (c) {
            var L = [];
            if (c.slip) L.push('The trail is where your slip-back goes to hide. Run it down.');
            if (c.rEnergy) L.push('You wanted your energy back. It’s out on the trail you keep skipping.');
            if (c.work) L.push('“No time to run.” The sun rises before every job you’ve ever had.');
            return L;
        },
        'bg-ranger-strong': function (c) {
            var L = [];
            if (c.slip) L.push('Your old pattern couldn’t run this far. You outpaced it.');
            if (c.believe) L.push('You believed, then laced up every dawn since. That’s the whole trick.');
            if (c.Ev) L.push(c.Ev + ' should be scared of your engine.');
            return L;
        },
        'bg-berserker-bad': function (c) {
            var L = [];
            if (c.slip) L.push('Rage lifts, rage quits — that’s your slip-back wearing war paint.');
            if (c.work) L.push('Work pressure didn’t shrink the bar. Skipping did.');
            if (c.rConf) L.push('You wanted a body you’re confident in. The pit builds it — attendance required.');
            return L;
        },
        'bg-berserker-good': function (c) {
            var L = [];
            if (c.slip) L.push('The slip-back knocked. It heard deadlifts and left.');
            if (c.believe) L.push('“I can do it” — the bar keeps agreeing with you.');
            if (c.Ev) L.push(c.Ev + ' gets the strong version of you. No refunds.');
            return L;
        },
        'bg-knight-bad': function (c) {
            var L = [];
            if (c.slip) L.push('Knights fall to the same slip you warned us about. Armor doesn’t stop habits.');
            if (c.family) L.push('Busy family life is real. So is the knight they deserve at full strength.');
            if (c.work) L.push('The realm’s other knights work too. Their standards didn’t clock out.');
            return L;
        },
        'bg-knight-good': function (c) {
            var L = [];
            if (c.slipResults) L.push('“Results slip away from me.” Not from a knight who audits every stat weekly.');
            if (c.believe) L.push('Belief plus a balanced chart — that’s how armor gets earned.');
            if (c.Ev) L.push(c.Ev + ' will be guarded by a full-stat knight. Lucky calendar.');
            return L;
        },
        'bg-king-regular': function (c) {
            var L = [];
            if (c.slip) L.push('Your old slip-back would never have survived the climb you just made. Stay lethal.');
            if (c.unsure) L.push('“Really unsure” — that’s what this crown was built out of. Remember it.');
            if (c.believe) L.push('You believed it before anyone had a reason to. Kings start that way.');
            if (c.Ev) L.push(c.Ev + ' gets attended by a King now. Different story.');
            return L;
        },
        'promotion-squire': function (c) {
            var L = [];
            if (c.slip) L.push('The pattern said you’d quit by now. The title in front of you says otherwise.');
            if (c.unsure) L.push('“Still really unsure” — signed, the person who just got promoted.');
            if (c.believe) L.push('You believed it at question one. The rank just caught up.');
            if (c.breakup) L.push('They ended it. You started this. First title’s yours.');
            if (c.Ev) L.push(c.Ev + ' just got a better guest: a squire.');
            return L;
        },
        'promotion-knight': function (c) {
            var L = [];
            if (c.slip) L.push('Try-then-slip died somewhere in specialist training. A knight buried it.');
            if (c.believe) L.push('Belief was your first stat. The other six just caught up.');
            if (c.Ev) L.push(c.Ev + ' will need armor polish. You’re arriving as a knight.');
            return L;
        },
        'promotion-king': function (c) {
            var L = [];
            if (c.unsure) L.push('From “really unsure” to the throne. Save the screenshot.');
            if (c.slip) L.push('The slip-back never made it past knight. The crown never met it.');
            if (c.believe) L.push('“I believe I can do it.” It. Was. This.');
            if (c.Ev) L.push(c.Ev + ' is a royal appearance now.');
            return L;
        },
        'demotion-peasant': function (c) {
            var L = [];
            if (c.slip) L.push('“I try for a bit, then I slip back.” The mud kept your spot warm.');
            if (c.work) L.push('Work pressure won this round. The village saw the whole thing.');
            if (c.unsure) L.push('You weren’t sure you could do this. Today the doubt scored a point.');
            if (c.breakup) L.push('The comeback story stalled. The village remembers how it starts, though.');
            return L;
        },
        'demotion-squire': function (c) {
            var L = [];
            if (c.slip) L.push('Knighthood met your slip-back pattern. The pattern won this month.');
            if (c.believe) L.push('“I believe I can do it” — you did it once. That’s how you know the way back.');
            if (c.Ev) L.push(c.Ev + ' is still coming. It takes a squire or a knight — your call.');
            return L;
        },
        'demotion-knight': function (c) {
            var L = [];
            if (c.slip) L.push('Even the throne couldn’t shield the old slip. It found you at the top.');
            if (c.work) L.push('The crown lost to a calendar. Kings have schedules too — winning ones.');
            if (c.Ev) L.push(c.Ev + ' expected a king. Give it one again.');
            return L;
        },
        'ceremony-promotion': function (c) {
            var L = [];
            if (c.slip) L.push('Your slip-back pattern didn’t survive this graph.');
            if (c.believe) L.push('You said you could. The web just grew to prove it.');
            if (c.unsure) L.push('Unsure then. Measured now. Look at the shape of it.');
            if (c.breakup) L.push('Built from the pieces — and the web shows every rep of it.');
            if (c.Ev) L.push(c.Ev + ' will meet this exact graph. Bigger by then.');
            return L;
        },
        'ceremony-demotion': function (c) {
            var L = [];
            if (c.slip) L.push('The slip you warned us about is drawn right there in the shrink.');
            if (c.work) L.push('Work pressure shrank the web. The web forgives fast workers.');
            if (c.unsure) L.push('The doubt got a vote today. Tomorrow’s session takes it back.');
            if (c.Ev) L.push(c.Ev + ' doesn’t move. Rebuild the web before it arrives.');
            return L;
        }
    };
    function personalLines(sceneId) {
        var v = SCENE_VOICE[sceneId];
        if (!v) return [];
        try { return v(answerFlags()) || []; } catch (e) { return []; }
    }
    /* Line pickers: personal stings mixed with stock copy, weighted toward
       the personal ones, and never the same line twice in a row. */
    var lastLineShown = '';
    function pickLine(stings, stock) {
        var pool = stings.length
            ? stings.concat(stings, stock)   // stings weighted 2:1
            : stock;
        var line = pool[Math.floor(Math.random() * pool.length)] || '';
        if (pool.length > 1 && line === lastLineShown) {
            line = pool[(pool.indexOf(line) + 1 + Math.floor(Math.random() * (pool.length - 1))) % pool.length];
        }
        lastLineShown = line;
        return line;
    }
    function bgSubFor(sceneId) {
        var entry = BG_COPY[sceneId];
        if (!entry) return null;
        return { title: entry.title, sub: pickLine(personalLines(sceneId), entry.subs) };
    }

    /* Renders the built-in kicker -> title + phrase sequence over a playing
       cutscene. Time-driven off the video so it scales to any clip length;
       sizes are clamp()ed so it reads on mobile and desktop. */
    function attachCineCopy(video, host, scene) {
        // Background loops show their idle-screen copy (title + small print)
        // so Play All previews exactly what the overview overlay renders.
        if (scene.kind === 'Background') {
            var bg = bgSubFor(scene.id);
            if (!bg) return function () {};
            var bgEl = document.createElement('div');
            bgEl.className = 'rf-bg-title';
            bgEl.style.opacity = '1';
            bgEl.innerHTML = '<strong>' + bg.title + '</strong><span>' + bg.sub + '</span>';
            host.appendChild(bgEl);
            return function () { bgEl.remove(); };
        }
        var copy = SCENE_COPY[scene.id];
        if (!copy) return function () {};
        // Promotions speak with pride, demotions go for the throat — their
        // own onboarding answers outrank the stock phrases. LATERAL moves
        // are the exception: the line under the title always explains WHY
        // their stats fit this class, never a random sting.
        var stings = copy.lateral ? [] : personalLines(scene.id);
        var phrase = pickLine(stings, copy.phrases);
        var box = document.createElement('div');
        box.className = 'rf-cine';
        box.innerHTML =
            '<div class="rf-cine-kicker' + (copy.kicker === 'DEMOTION' ? ' is-demotion' : '') + '">' + copy.kicker + '</div>' +
            '<div class="rf-cine-main">' +
            '  <div class="rf-cine-title' + (copy.kicker === 'DEMOTION' ? ' is-demotion' : '') + '">' + copy.title + '</div>' +
            '  <div class="rf-cine-phrase">' + phrase + '</div>' +
            '</div>';
        host.appendChild(box);
        var kicker = box.querySelector('.rf-cine-kicker');
        var main = box.querySelector('.rf-cine-main');
        var tick = function () {
            var t = video.currentTime;
            var dur = video.duration || 15;
            // kicker: 0.4s fade in, gone by 2.6s; title+phrase: 2.8s -> near end
            kicker.style.opacity = String(Math.max(0, Math.min(1, Math.min((t - 0.4) / 0.6, (2.6 - t) / 0.5))));
            var endFade = Math.max(3.5, dur - 0.9);
            main.style.opacity = String(Math.max(0, Math.min(1, Math.min((t - 2.8) / 0.8, (endFade - t) / 0.9))));
        };
        tick();
        video.addEventListener('timeupdate', tick);
        return function () {
            video.removeEventListener('timeupdate', tick);
            box.remove();
        };
    }

    /* Mock of the site chrome (navbar, radar dock, control panel/fab) so a
       preview shows how the page actually sits over the video. */
    function buildSiteMock(mode) {
        var el = document.createElement('div');
        el.className = 'rf-sitemock ' + (mode === 'mobile' ? 'is-mobile' : 'is-desktop');
        var radar = '<div class="rf-sm-radar"><svg viewBox="0 0 44 40">' +
            '<polygon points="22,3 39,12 39,28 22,37 5,28 5,12" fill="none" stroke="rgba(140,110,70,.45)"></polygon>' +
            '<polygon points="22,9.4 33.2,15 33.2,25 22,30.6 10.8,25 10.8,15" fill="none" stroke="rgba(140,110,70,.35)"></polygon>' +
            '<polygon points="22,15.7 27.4,18.4 27.4,21.6 22,24.3 16.6,21.6 16.6,18.4" fill="rgba(197,141,79,.55)" stroke="#b9782d"></polygon>' +
            '</svg><small>&#9874; Peasant &middot; #30,089</small></div>';
        el.innerHTML =
            '<div class="rf-sm-veil"></div>' +
            '<div class="rf-sm-nav"><b>Rise<i>For</i>It.</b>' +
            (mode === 'mobile' ? '' : '<span class="rf-sm-links">Home&nbsp;&nbsp;&nbsp;Macro Calculator&nbsp;&nbsp;&nbsp;Training&nbsp;&nbsp;&nbsp;Dashboard</span>') +
            '<u>ODeology_</u></div>' +
            (mode === 'mobile' ? '' : '<div class="rf-sm-panel"></div>') +
            radar +
            (mode === 'mobile' ? '<div class="rf-sm-fab">CONTROL<br>PANEL</div><div class="rf-sm-dock"></div>' : '');
        return el;
    }

    /* One-time banner on the idle loop right after a promotion/demotion:
       shows at the top for a moment, then fades away. */
    function showRankBanner(scene) {
        var copy = SCENE_COPY[scene.id];
        if (!copy || scene.kind === 'Intro') return;
        ensureStyles();
        var el = document.createElement('div');
        el.className = 'rf-rank-banner' + (copy.kicker === 'DEMOTION' ? ' is-demotion' : '');
        el.innerHTML = '<small>' + (copy.kicker === 'DEMOTION' ? 'Demoted' : 'Promoted') + '</small><strong>' + copy.title + '</strong>';
        document.body.appendChild(el);
        window.setTimeout(function () { el.classList.add('is-on'); }, 60);
        window.setTimeout(function () { el.classList.remove('is-on'); }, 2800);
        window.setTimeout(function () { el.remove(); }, 3900);
    }

    /* Lateral moves (specialist <-> specialist, or dropping back to squire
       from a specialist) get no ceremony — just a quiet banner on the next
       visit. */
    function showLateralBanner(rankId) {
        ensureStyles();
        var names = { peasant: 'Peasant', squire: 'Squire', mage: 'Mage', ranger: 'Ranger', berserker: 'Berserker', knight: 'Knight', king: 'King' };
        var el = document.createElement('div');
        el.className = 'rf-rank-banner';
        el.innerHTML = '<small>Path changed</small><strong>You now walk as a ' + (names[rankId] || rankId) + '</strong>';
        document.body.appendChild(el);
        window.setTimeout(function () { el.classList.add('is-on'); }, 60);
        window.setTimeout(function () { el.classList.remove('is-on'); }, 3400);
        window.setTimeout(function () { el.remove(); }, 4500);
    }

    /* ---------- rank ceremony: after a promotion/demotion cutscene fades
       to black, the user's spider graph fades in where they USED to be,
       grows to where they got to, and a note tailored from their own
       onboarding answers lands underneath. Tap (or 9s) continues. ---------- */
    function showCeremony(overlay, kind, onFinish, o) {
        o = o || {};
        var axes = (window.OdeIdentity && window.OdeIdentity.AXES) || [
            { key: 'strength', label: 'Strength' }, { key: 'cardio', label: 'Cardio' },
            { key: 'consistency', label: 'Consistency' }, { key: 'nutrition', label: 'Nutrition' },
            { key: 'recovery', label: 'Recovery' }, { key: 'progress', label: 'Progress' }
        ];
        var readStats = function (key) {
            try {
                var raw = JSON.parse(localStorage.getItem(key) || 'null');
                if (!raw) return null;
                var out = {};
                for (var i = 0; i < axes.length; i++) {
                    var v = Number(raw[axes[i].key]);
                    if (!isFinite(v)) return null;
                    out[axes[i].key] = Math.max(0, Math.min(100, v));
                }
                return out;
            } catch (e) { return null; }
        };
        var cur, prev;
        if (o.preview) {
            // Manual trigger = simulation: fake stats at the minimum the
            // target rank needs, morphing from the rank on the other side
            // of the move — so the animation is always fully visible.
            var SIM_AVG = { peasant: 24, squire: 35, ranger: 50, berserker: 50, mage: 50, knight: 68, king: 82 };
            var BELOW = { squire: 'peasant', ranger: 'squire', berserker: 'squire', mage: 'squire', knight: 'mage', king: 'knight' };
            var ABOVE = { peasant: 'squire', squire: 'knight', knight: 'king' };
            var SHAPE = { strength: 1.16, cardio: 0.88, consistency: 1.12, nutrition: 0.84, recovery: 0.94, progress: 1.06 };
            var mkStats = function (rankId) {
                var avg = SIM_AVG[rankId] != null ? SIM_AVG[rankId] : 35;
                var st = {};
                axes.forEach(function (a) {
                    st[a.key] = Math.max(4, Math.min(98, Math.round(avg * (SHAPE[a.key] || 1))));
                });
                return st;
            };
            var target = String(o.sceneId || '').split('-')[1] || 'squire';
            var other = kind === 'demotion' ? (ABOVE[target] || 'squire') : (BELOW[target] || 'peasant');
            cur = mkStats(target);
            prev = mkStats(other);
        } else {
            cur = readStats('ovIdentityStats');
            prev = readStats('ovIdentityStatsPrev');
            if (!cur) { onFinish(); return; }
            // No previous shape saved, or it's basically identical to today's
            // (points settle overnight) — synthesize a drift so the climb or
            // drop actually reads on screen.
            var maxDelta = 0;
            if (prev) {
                axes.forEach(function (a) { maxDelta = Math.max(maxDelta, Math.abs(cur[a.key] - prev[a.key])); });
            }
            if (!prev || maxDelta < 3) {
                prev = {};
                var drift = kind === 'demotion' ? 8 : -10;
                axes.forEach(function (a) { prev[a.key] = Math.max(0, Math.min(100, cur[a.key] + drift)); });
            }
        }
        var name = '';
        try {
            var hint = JSON.parse(localStorage.getItem('ode_auth_user_hint_v1') || 'null');
            var u = hint && hint.user;
            name = (u && (u.displayName || u.username)) || '';
        } catch (e) {}
        var pool = personalLines(kind === 'promotion' ? 'ceremony-promotion' : 'ceremony-demotion');
        var fallback = kind === 'promotion'
            ? 'Earned, not given. Keep stacking days like these.'
            : 'Ranks come back the same way they left — one day at a time.';
        var sting = pool.length ? pool[Math.floor(Math.random() * pool.length)] : fallback;

        var size = 330, c = size / 2, rr = size / 2 - 42;
        var pt = function (i, v) {
            var ang = (Math.PI * 2 * i) / axes.length - Math.PI / 2;
            return [(c + Math.cos(ang) * rr * (v / 100)), (c + Math.sin(ang) * rr * (v / 100))];
        };
        var poly = function (stats) {
            return axes.map(function (a, i) { return pt(i, stats[a.key]).map(function (n) { return n.toFixed(1); }).join(','); }).join(' ');
        };
        var rings = [25, 50, 75, 100].map(function (g) {
            return '<polygon class="rfc-ring" points="' + axes.map(function (a, i) { return pt(i, g).map(function (n) { return n.toFixed(1); }).join(','); }).join(' ') + '"/>';
        }).join('');
        var spokes = axes.map(function (a, i) {
            var e = pt(i, 100);
            return '<line class="rfc-spoke" x1="' + c + '" y1="' + c + '" x2="' + e[0].toFixed(1) + '" y2="' + e[1].toFixed(1) + '"/>';
        }).join('');
        var labels = axes.map(function (a, i) {
            var l = pt(i, 118);
            var v = pt(i, 132);
            return '<text class="rfc-label" x="' + l[0].toFixed(1) + '" y="' + l[1].toFixed(1) + '">' + a.label + '</text>'
                + '<text class="rfc-val" data-rfc-axis="' + a.key + '" x="' + v[0].toFixed(1) + '" y="' + v[1].toFixed(1) + '">'
                + '<tspan data-rfc-val="' + a.key + '"></tspan>'
                + '<tspan class="rfc-delta" data-rfc-delta="' + a.key + '" dx="3"></tspan>'
                + '</text>';
        }).join('');

        var el = document.createElement('div');
        el.className = 'rf-ceremony';
        el.innerHTML =
            '<div class="rf-ceremony-inner">' +
            '  <p class="rf-ceremony-kicker' + (kind === 'demotion' ? ' is-demotion' : '') + '">' + (kind === 'demotion' ? 'Where you stand now' : 'How far you climbed') + '</p>' +
            '  <svg viewBox="0 0 ' + size + ' ' + size + '">' + rings + spokes +
            '    <polygon class="rfc-prev" points="' + poly(prev) + '"/>' +
            '    <polygon class="rfc-cur" points="' + poly(prev) + '"/>' + labels +
            '  </svg>' +
            '  <p class="rf-ceremony-note"></p>' +
            '  <span class="rf-ceremony-hint">Tap to continue</span>' +
            '</div>';
        var noteEl = el.querySelector('.rf-ceremony-note');
        if (name) {
            var bEl = document.createElement('b');
            bEl.textContent = name;
            noteEl.appendChild(bEl);
            noteEl.appendChild(document.createTextNode(' — ' + sting));
        } else {
            noteEl.textContent = sting;
        }
        overlay.appendChild(el);
        window.requestAnimationFrame(function () { el.classList.add('is-on'); });

        // Stage 1: hold on yesterday's shape so it registers as "the old you".
        // Stage 2: the polygon grows to today's shape while the numbers count
        // up in green (down in red), then the +N deltas pop in.
        var curPoly = el.querySelector('.rfc-cur');
        var valEls = {}, axisEls = {}, deltaEls = {};
        axes.forEach(function (a) {
            valEls[a.key] = el.querySelector('[data-rfc-val="' + a.key + '"]');
            axisEls[a.key] = el.querySelector('[data-rfc-axis="' + a.key + '"]');
            deltaEls[a.key] = el.querySelector('[data-rfc-delta="' + a.key + '"]');
            if (valEls[a.key]) valEls[a.key].textContent = Math.round(prev[a.key]);
        });
        var HOLD = 1500;
        var DURATION = 2100;
        var animStart = null;
        var tick = function (ts) {
            if (!animStart) animStart = ts;
            var f = Math.min(1, (ts - animStart) / DURATION);
            var e2 = 1 - Math.pow(1 - f, 3);
            var mix = {};
            axes.forEach(function (a) {
                mix[a.key] = prev[a.key] + (cur[a.key] - prev[a.key]) * e2;
                if (valEls[a.key]) valEls[a.key].textContent = Math.round(mix[a.key]);
            });
            curPoly.setAttribute('points', poly(mix));
            if (f < 1) { window.requestAnimationFrame(tick); return; }
            // Landed: pulse the shape and reveal the +N / -N deltas.
            curPoly.classList.add('is-done');
            axes.forEach(function (a) {
                var d = Math.round(cur[a.key]) - Math.round(prev[a.key]);
                if (d && deltaEls[a.key]) {
                    deltaEls[a.key].textContent = (d > 0 ? '+' : '−') + Math.abs(d);
                    deltaEls[a.key].classList.add('is-show');
                }
            });
        };
        window.setTimeout(function () {
            axes.forEach(function (a) {
                var d = Math.round(cur[a.key]) - Math.round(prev[a.key]);
                if (d > 0 && axisEls[a.key]) axisEls[a.key].classList.add('is-up');
                if (d < 0 && axisEls[a.key]) axisEls[a.key].classList.add('is-down');
            });
            window.requestAnimationFrame(tick);
        }, HOLD);

        var left = false;
        var leave = function () {
            if (left) return;
            left = true;
            el.classList.remove('is-on');
            window.setTimeout(onFinish, 750);
        };
        el.addEventListener('click', leave);
        window.setTimeout(leave, 11500);
    }

    /* ---------- source<->frame coordinate mapping.
       Text/tracker/lasso coordinates are stored as % of the VIDEO SOURCE
       frame, so one cutout/position works for both the desktop and the
       mobile crop. paintedRect() computes where the source frame actually
       paints inside a cover-fit box with objectPosition + scale applied. */
    function paintedRect(frameW, frameH, vw, vh, pos) {
        // pos = {tx,ty (translate, % of frame), scaleX, scaleY}. The video is
        // cover-fit centered, scaled about center, then translated — so
        // repositioning always works, even with no crop slack.
        pos = pos || {};
        var sX = Number(pos.scaleX) || 1;
        var sY = Number(pos.scaleY) || 1;
        var tx = (Number(pos.tx) || 0) / 100 * frameW;
        var ty = (Number(pos.ty) || 0) / 100 * frameH;
        var s0 = Math.max(frameW / vw, frameH / vh);
        var cw = vw * s0;
        var ch = vh * s0;
        var ox = (frameW - cw) / 2;
        var oy = (frameH - ch) / 2;
        var cx = frameW / 2;
        var cy = frameH / 2;
        return {
            left: cx + (ox - cx) * sX + tx,
            top: cy + (oy - cy) * sY + ty,
            width: cw * sX,
            height: ch * sY
        };
    }
    function sourceToFramePct(sxPct, syPct, frameW, frameH, vw, vh, pos) {
        var r = paintedRect(frameW, frameH, vw, vh, pos);
        return {
            x: ((r.left + (sxPct / 100) * r.width) / frameW) * 100,
            y: ((r.top + (syPct / 100) * r.height) / frameH) * 100
        };
    }

    /* Renders the video as the FULL cover-fit source rect (element sized to
       paintedRect, object-fit:fill) instead of a frame-sized cover window.
       This makes repositioning slide the crop across the source — panning a
       16:9 video inside a 9:16 frame reveals what the default crop left
       off-screen, instead of cutting the frame and exposing black edges.
       The frame parent must be positioned with overflow:hidden. */
    function applyVideoPosition(video, frameW, frameH, pos) {
        pos = pos || {};
        var vw = video.videoWidth || 16;
        var vh = video.videoHeight || 9;
        var s0 = Math.max(frameW / vw, frameH / vh);
        var cw = vw * s0;
        var ch = vh * s0;
        video.style.position = 'absolute';
        video.style.left = (((frameW - cw) / 2) / frameW * 100).toFixed(4) + '%';
        video.style.top = (((frameH - ch) / 2) / frameH * 100).toFixed(4) + '%';
        video.style.width = (cw / frameW * 100).toFixed(4) + '%';
        video.style.height = (ch / frameH * 100).toFixed(4) + '%';
        video.style.maxWidth = 'none';
        video.style.maxHeight = 'none';
        video.style.objectFit = 'fill';
        video.style.objectPosition = '50% 50%';
        video.style.transformOrigin = 'center center';
        // pos.tx/ty are % of the FRAME; CSS translate % resolves against
        // the element (the cover rect), so convert.
        var txe = (Number(pos.tx) || 0) * frameW / cw;
        var tye = (Number(pos.ty) || 0) * frameH / ch;
        video.style.transform = 'translate(' + txe.toFixed(3) + '%, ' + tye.toFixed(3) + '%)'
            + ' scale(' + (Number(pos.scaleX) || 1) + ',' + (Number(pos.scaleY) || 1) + ')';
    }

    /* ---------- auto character detection (rough, fast).
       Samples a few frames on a tiny canvas and finds the centroid of
       motion + visual saliency — the glowing, moving main character wins.
       Rough is fine: it centers the crop, and the owner can override it
       in the editor. Returns {x,y} in SOURCE % via cb, or null. */
    function analyzeFocus(video, cb) {
        try {
            var W = 48, H = 27;
            var canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            var ctx = canvas.getContext('2d', { willReadFrequently: true });
            var frames = [];
            var grab = function () {
                try {
                    ctx.drawImage(video, 0, 0, W, H);
                    frames.push(ctx.getImageData(0, 0, W, H).data);
                } catch (e) { /* not ready */ }
            };
            var finish = function () {
                if (!frames.length) { cb(null); return; }
                var n = W * H;
                var luma = new Float32Array(n);
                var motion = new Float32Array(n);
                var f0 = frames[0];
                var mean = 0;
                for (var i = 0; i < n; i++) {
                    var l = 0.299 * f0[i * 4] + 0.587 * f0[i * 4 + 1] + 0.114 * f0[i * 4 + 2];
                    luma[i] = l;
                    mean += l;
                }
                mean /= n;
                for (var f = 1; f < frames.length; f++) {
                    var a = frames[f - 1];
                    var b = frames[f];
                    for (var j = 0; j < n; j++) {
                        motion[j] += Math.abs(b[j * 4] - a[j * 4]) + Math.abs(b[j * 4 + 1] - a[j * 4 + 1]);
                    }
                }
                var sw = 0, sx = 0, sy = 0;
                for (var k = 0; k < n; k++) {
                    // saliency = brightness deviation; motion dominates when present
                    var wgt = Math.abs(luma[k] - mean) + motion[k] * 2.5;
                    wgt = wgt * wgt; // sharpen so strong signals dominate
                    sw += wgt;
                    sx += wgt * (k % W);
                    sy += wgt * Math.floor(k / W);
                }
                if (!sw) { cb(null); return; }
                cb({ x: (sx / sw + 0.5) / W * 100, y: (sy / sw + 0.5) / H * 100 });
            };
            var left = 5;
            var step = function () {
                grab();
                left -= 1;
                if (left <= 0) { finish(); return; }
                window.setTimeout(step, 350);
            };
            step();
        } catch (e) { cb(null); }
    }

    /* Translate (+ zoom only when needed) that puts a source-space focus
       point at frame center. Panning uses the cover overhang first — the
       hidden part of the source slides into view; zoom kicks in only when
       an axis has no slack left (capped — a far-off focus gets a gentle
       nudge, not a crazy zoom). */
    function autoCenterPos(focus, frameW, frameH, vw, vh) {
        var base = paintedRect(frameW, frameH, vw, vh, { tx: 0, ty: 0, scaleX: 1, scaleY: 1 });
        var fx = base.left + (focus.x / 100) * base.width;
        var fy = base.top + (focus.y / 100) * base.height;
        var dx = frameW / 2 - fx;
        // Aim slightly below frame center: the detected centroid is the
        // character's torso, so this leaves headroom instead of clipping.
        var dy = frameH * 0.55 - fy;
        // Focus lands at center when shift t = s*d (scale about center);
        // coverage per axis: s*(painted/2 - |d|) >= frame/2.
        var sx = Math.abs(dx) < base.width / 2 ? (frameW / 2) / (base.width / 2 - Math.abs(dx)) : 2;
        var sy = Math.abs(dy) < base.height / 2 ? (frameH / 2) / (base.height / 2 - Math.abs(dy)) : 2;
        // Round UP so the stored 2-decimal scale still satisfies coverage,
        // and derive the clamp + shift from that same rounded value.
        var s = Math.ceil(Math.min(1.6, Math.max(1, sx, sy)) * 100) / 100;
        var mx = Math.max(0, (base.width * s - frameW) / (2 * s));
        var my = Math.max(0, (base.height * s - frameH) / (2 * s));
        dx = Math.max(-mx, Math.min(mx, dx));
        dy = Math.max(-my, Math.min(my, dy));
        return {
            tx: (dx * s / frameW) * 100,
            ty: (dy * s / frameH) * 100,
            scale: s
        };
    }

    /* Default behavior: a video with NO saved position auto-centers on the
       detected character (smooth drift, not a snap). Manual positions from
       the editor always win. */
    function autoPositionVideo(video) {
        var frameDims = function () {
            var host = video.parentElement;
            var r = host ? host.getBoundingClientRect() : null;
            return { w: (r && r.width) || window.innerWidth || 16, h: (r && r.height) || window.innerHeight || 9 };
        };
        var run = function () {
            var f = frameDims();
            // Base render as the full cover rect first (centered, no shift).
            applyVideoPosition(video, f.w, f.h, {});
            analyzeFocus(video, function (focus) {
                if (!focus) return;
                var vw = video.videoWidth || 16;
                var vh = video.videoHeight || 9;
                var pos = autoCenterPos(focus, f.w, f.h, vw, vh);
                video.style.transition = 'transform 0.8s ease';
                applyVideoPosition(video, f.w, f.h, { tx: pos.tx, ty: pos.ty, scaleX: pos.scale, scaleY: pos.scale });
            });
        };
        if (video.readyState >= 2) window.setTimeout(run, 350);
        else video.addEventListener('loadeddata', function () { window.setTimeout(run, 350); }, { once: true });
    }

    /* ---------- styles (injected so no page needs a new stylesheet) ---------- */
    var STYLE = [
        '.rf-cutscene{position:fixed;inset:0;z-index:6000;background:#000;display:grid;place-items:center;}',
        '.rf-cutscene{overflow:hidden;container-type:inline-size;}',
        '.rf-cutscene video{width:100%;height:100%;object-fit:cover;object-position:center;}',
        /* 9:16 preview frame for the "mobile pass" in Play All. It is its own
           container so all overlay text sizes in cqw scale to the FRAME —
           not the desktop viewport — and never hang off the phone. */
        '.rf-cutscene-frame{position:relative;height:100%;aspect-ratio:9/16;max-width:100%;overflow:hidden;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,0.14);container-type:inline-size;}',
        '.rf-cutscene-tag{position:absolute;left:20px;top:18px;z-index:3;padding:8px 14px;border-radius:999px;background:rgba(0,0,0,0.62);border:1px solid rgba(255,255,255,0.25);color:#fff;font:700 12px/1.3 "Space Grotesk",system-ui,sans-serif;max-width:min(70vw,460px);backdrop-filter:blur(4px);}',
        '.rf-cutscene-tag b{color:#ffb244;}',
        /* Play All / preview controls */
        '.rf-cutscene-nav{position:absolute;left:50%;bottom:20px;transform:translateX(-50%);z-index:3;display:flex;gap:8px;}',
        '.rf-cutscene-nav button{padding:11px 18px;border:1px solid rgba(255,255,255,0.45);border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;font:800 13px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.06em;cursor:pointer;backdrop-filter:blur(4px);}',
        '.rf-cutscene-nav button:hover{background:rgba(255,255,255,0.18);}',
        '.rf-cutscene-nav button.is-exit{border-color:rgba(255,120,100,0.6);color:#ffb3a6;}',
        '.rf-cutscene-site-btn{position:absolute;right:20px;top:18px;z-index:3;padding:9px 16px;border:1px solid rgba(255,255,255,0.4);border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;font:800 12px/1 "Space Grotesk",system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(4px);}',
        '.rf-cutscene-site-btn.is-on{background:#b9782d;border-color:#b9782d;}',
        /* site mock: how the page chrome sits over the video */
        '.rf-sitemock{position:absolute;inset:0;pointer-events:none;z-index:2;font-family:"Space Grotesk",system-ui,sans-serif;}',
        '.rf-sitemock .rf-sm-veil{position:absolute;inset:0;background:rgba(250,247,243,0.07);}',
        '.rf-sitemock .rf-sm-nav{position:absolute;top:0;left:0;right:0;height:7.5%;min-height:34px;background:#f7f3ea;display:flex;align-items:center;justify-content:space-between;padding:0 4%;color:#241a12;}',
        '.rf-sitemock .rf-sm-nav b{font-size:clamp(11px,3.4cqw,17px);}',
        '.rf-sitemock .rf-sm-nav b i{color:#b9782d;font-style:normal;}',
        '.rf-sitemock .rf-sm-nav u{text-decoration:none;font-weight:800;font-size:clamp(9px,2.6cqw,13px);}',
        '.rf-sitemock .rf-sm-links{font-size:clamp(9px,1.1cqw,13px);font-weight:700;color:#443628;}',
        '.rf-sitemock .rf-sm-panel{position:absolute;top:7.5%;bottom:0;left:0;width:17%;min-width:120px;background:rgba(24,20,16,0.94);}',
        '.rf-sitemock .rf-sm-radar{position:absolute;left:4%;bottom:16%;width:clamp(90px,32cqw,150px);background:rgba(255,255,255,0.94);border-radius:12px;padding:8px 8px 6px;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,0.3);}',
        '.rf-sitemock.is-desktop .rf-sm-radar{left:calc(17% + 2%);bottom:5%;width:clamp(110px,12cqw,170px);}',
        '.rf-sitemock .rf-sm-radar small{display:block;margin-top:2px;font-size:clamp(8px,2.2cqw,11px);font-weight:800;color:#241a12;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.rf-sitemock .rf-sm-fab{position:absolute;left:4%;bottom:6.5%;width:clamp(44px,13cqw,64px);height:clamp(44px,13cqw,64px);border-radius:999px;background:#151210;color:#fff;font-size:clamp(6px,1.7cqw,8.5px);font-weight:800;display:grid;place-items:center;text-align:center;letter-spacing:.06em;}',
        '.rf-sitemock .rf-sm-dock{position:absolute;left:0;right:0;bottom:0;height:5.5%;min-height:26px;background:#f7f3ea;border-top:1px solid rgba(36,26,18,0.12);}',
        /* built-in kicker -> title + phrase copy */
        '.rf-cine{position:absolute;inset:0;pointer-events:none;z-index:2;display:grid;place-items:start center;padding-top:14%;text-align:center;}',
        '.rf-cine-kicker{grid-area:1/1;font:900 clamp(20px,7cqw,64px)/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.18em;text-indent:.18em;color:#ffd98f;text-transform:uppercase;text-shadow:0 4px 26px rgba(0,0,0,0.85),0 0 40px rgba(255,178,68,0.35);opacity:0;max-width:96%;}',
        '.rf-cine-kicker.is-demotion{color:#c7ccd4;filter:grayscale(0.4);text-shadow:0 4px 26px rgba(0,0,0,0.9);}',
        '.rf-cine-main{grid-area:1/1;opacity:0;max-width:92%;}',
        '.rf-cine-title{font:900 clamp(30px,11cqw,110px)/1.05 "Cinzel Decorative","Playfair Display",Georgia,serif;color:#f7e7c3;letter-spacing:.02em;text-shadow:0 6px 34px rgba(0,0,0,0.9),0 0 60px rgba(255,178,68,0.28);}',
        '.rf-cine-title.is-demotion{color:#aeb4bd;text-shadow:0 6px 34px rgba(0,0,0,0.95);}',
        '.rf-cine-phrase{margin:12px auto 0;font:600 clamp(13px,3.4cqw,21px)/1.45 "Space Grotesk",system-ui,sans-serif;color:rgba(255,255,255,0.94);text-shadow:0 2px 14px rgba(0,0,0,0.9);max-width:32ch;}',
        /* one-time promoted/demoted banner over the idle loop */
        '.rf-cine-fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity 1.1s ease;z-index:5;pointer-events:none;}',
        '.rf-cine-fade.is-on{opacity:1;}',
        '.rf-ceremony{position:absolute;inset:0;z-index:6;background:#000;display:grid;place-items:center;opacity:0;transition:opacity .8s ease;cursor:pointer;}',
        '.rf-ceremony.is-on{opacity:1;}',
        '.rf-ceremony-inner{display:grid;gap:20px;justify-items:center;padding:24px;max-width:600px;text-align:center;}',
        '.rf-ceremony-kicker{color:#e5b070;font:800 12px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.28em;text-transform:uppercase;margin:0;}',
        '.rf-ceremony-kicker.is-demotion{color:#ff9d7d;}',
        '.rf-ceremony svg{width:min(330px,70vw);height:auto;overflow:visible;}',
        '.rf-ceremony-note{margin:0;color:#f2ece2;font:700 clamp(14px,2.1vw,17px)/1.6 "Space Grotesk",system-ui,sans-serif;max-width:540px;}',
        '.rf-ceremony-note b{color:#e5b070;}',
        '.rf-ceremony-hint{color:rgba(242,236,226,.4);font:700 10.5px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;}',
        '.rfc-ring{fill:none;stroke:rgba(217,161,92,.15);}',
        '.rfc-spoke{stroke:rgba(217,161,92,.1);}',
        '.rfc-prev{fill:rgba(217,161,92,.07);stroke:rgba(217,161,92,.45);stroke-dasharray:5 4;stroke-width:2;}',
        '.rfc-cur{fill:rgba(217,161,92,.2);stroke:#d9a15c;stroke-width:2.5;stroke-linejoin:round;}',
        '.rfc-label{fill:rgba(242,236,226,.72);font:700 10px "Space Grotesk",system-ui,sans-serif;text-anchor:middle;}',
        '.rfc-val{fill:#e5b070;font:800 11px "Space Grotesk",system-ui,sans-serif;text-anchor:middle;transition:fill .5s ease;}',
        '.rfc-val.is-up{fill:#7fe08f;}',
        '.rfc-val.is-down{fill:#f0876e;}',
        '.rfc-delta{font:800 8.5px "Space Grotesk",system-ui,sans-serif;opacity:0;transition:opacity .5s ease;}',
        '.rfc-delta.is-show{opacity:1;}',
        '.rfc-cur.is-done{animation:rfcPop .8s ease;}',
        '@keyframes rfcPop{0%{stroke-width:2.5;}40%{stroke-width:5.5;fill:rgba(217,161,92,.34);}100%{stroke-width:2.5;}}',
        '.rf-rank-banner{position:fixed;top:76px;left:50%;transform:translate(-50%,-14px);z-index:6500;text-align:center;pointer-events:none;opacity:0;transition:opacity .8s ease,transform .8s ease;}',
        '.rf-rank-banner.is-on{opacity:1;transform:translate(-50%,0);}',
        '.rf-rank-banner small{display:block;font:800 11px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;color:#b9782d;text-shadow:0 1px 6px rgba(0,0,0,0.35);}',
        '.rf-rank-banner strong{display:block;margin-top:4px;font:900 clamp(28px,5vw,52px)/1 "Cinzel Decorative","Playfair Display",Georgia,serif;color:#f7e7c3;text-shadow:0 4px 22px rgba(0,0,0,0.75),0 0 34px rgba(255,178,68,0.3);}',
        '.rf-rank-banner.is-demotion small{color:#8b929c;}',
        '.rf-rank-banner.is-demotion strong{color:#c3c8cf;text-shadow:0 4px 22px rgba(0,0,0,0.85);}',
        '.rf-cutscene-skip{position:absolute;right:20px;bottom:20px;z-index:2;padding:11px 22px;border:1px solid rgba(255,255,255,0.45);border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;font:800 13px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .35s ease;backdrop-filter:blur(4px);}',
        '.rf-cutscene-skip.is-visible{opacity:1;pointer-events:auto;}',
        '.rf-cutscene-skip:hover{background:rgba(255,255,255,0.18);}',
        '.rf-cutscene-sound{position:absolute;left:20px;bottom:20px;z-index:2;padding:11px 18px;border:1px solid rgba(255,255,255,0.45);border-radius:999px;background:rgba(0,0,0,0.55);color:#fff;font:700 13px/1 "Space Grotesk",system-ui,sans-serif;cursor:pointer;backdrop-filter:blur(4px);}',
        '.rf-cutscene-mgr{position:fixed;inset:0;z-index:5900;background:rgba(8,6,4,0.66);display:grid;place-items:center;padding:18px;}',
        '.rf-cutscene-mgr-card{width:min(560px,100%);max-height:86vh;overflow:auto;background:#fdf9f0;border-radius:22px;padding:22px;box-shadow:0 40px 110px rgba(0,0,0,0.5);font-family:"Space Grotesk",system-ui,sans-serif;color:#241a12;}',
        '.rf-cutscene-mgr-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;}',
        '.rf-cutscene-mgr-head h3{margin:0;font-size:20px;}',
        '.rf-cutscene-mgr-close{border:0;background:transparent;font-size:22px;cursor:pointer;color:#6f6257;line-height:1;padding:4px 8px;border-radius:999px;}',
        '.rf-cutscene-mgr-close:hover{background:rgba(36,26,18,0.08);}',
        '.rf-cutscene-mgr-sub{margin:0 0 14px;font-size:12.5px;color:#6f6257;}',
        '.rf-cutscene-mgr h4{margin:16px 0 8px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#8a6330;}',
        '.rf-cutscene-mgr-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid rgba(36,26,18,0.1);border-radius:14px;background:#fff;margin-bottom:8px;}',
        '.rf-cutscene-mgr-row span{font-size:13.5px;font-weight:600;}',
        '.rf-cutscene-mgr-row small{display:block;font-size:11px;color:#a53c33;font-weight:700;}',
        '.rf-cutscene-mgr-row button{border:0;border-radius:999px;background:#33241a;color:#fff;font:800 12px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.06em;padding:9px 18px;cursor:pointer;}',
        '.rf-cutscene-mgr-row button:disabled{background:#b3a99e;cursor:default;}',
        '.rf-cutscene-mgr-playall{display:block;width:100%;margin-top:16px;border:0;border-radius:999px;background:#b9782d;color:#fff;font:800 13px/1.3 "Space Grotesk",system-ui,sans-serif;padding:13px 18px;cursor:pointer;box-shadow:0 10px 26px rgba(120,70,10,0.35);}',
        '.rf-cutscene-mgr-playall:hover{background:#a4681f;}',
        '.rf-cutscene-mgr-reset{margin-top:12px;border:1.5px solid rgba(36,26,18,0.3);border-radius:999px;background:transparent;color:#241a12;font:800 12px/1 "Space Grotesk",system-ui,sans-serif;padding:9px 18px;cursor:pointer;}',
        '.rf-cutscene-textwrap{position:absolute;inset:0;z-index:2;pointer-events:none;}',
        '.rf-cutscene-text{position:absolute;transform:translate(-50%,-50%);color:#fff;font:800 clamp(18px,4vw,34px)/1.25 "Space Grotesk",system-ui,sans-serif;text-shadow:0 2px 14px rgba(0,0,0,0.65);text-align:center;max-width:80%;pointer-events:none;}',
        '.rf-cbox{position:absolute;transform:translate(-50%,-50%);pointer-events:none;z-index:2;display:none;}',
        '.rf-cbox img{display:block;width:100%;height:auto;}',
        '.rf-cbox-tint{position:absolute;inset:0;pointer-events:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;}',
        '.rf-cbox.is-default{background:#f6eed3;border:3px solid #1a1410;border-radius:5px;box-shadow:3px 3px 0 rgba(10,8,6,0.5);}',
        '.rf-cbox-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-family:"Press Start 2P","Space Grotesk",monospace;font-weight:400;color:#1a1208;padding:8px 10px;line-height:1.7;word-break:break-word;}',
        '.rf-cbox.is-default.has-text{height:auto !important;display:flex;}',
        '.rf-cbox.is-default.has-text .rf-cbox-text{position:static;}',
        '.rf-cbox-tail{position:absolute;width:11px;height:11px;background:#f6eed3;border:3px solid #1a1410;transform:rotate(45deg);display:none;}',
        '.rf-cbox.is-default.has-text .rf-cbox-tail{display:block;}',
        '.rf-cbox[data-tail=bottom] .rf-cbox-tail{bottom:-7px;left:50%;margin-left:-6px;border-top:0;border-left:0;}',
        '.rf-cbox[data-tail=top] .rf-cbox-tail{top:-7px;left:50%;margin-left:-6px;border-bottom:0;border-right:0;}',
        '.rf-cbox[data-tail=left] .rf-cbox-tail{left:-7px;top:50%;margin-top:-6px;border-top:0;border-right:0;}',
        '.rf-cbox[data-tail=right] .rf-cbox-tail{right:-7px;top:50%;margin-top:-6px;border-bottom:0;border-left:0;}',
        '.rf-cutscene-mgr-actions{display:flex;gap:6px;flex:0 0 auto;}',
        '.rf-cutscene-mgr-row button.is-alt{background:transparent;border:1.5px solid rgba(36,26,18,0.3);color:#241a12;}',
        '.rf-bg-video{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;}',
        '.rf-bg-video video{width:100%;height:100%;object-fit:cover;object-position:center;}',
        '.rf-bg-veil{position:absolute;inset:0;background:rgba(15,11,8,var(--rf-veil-alpha,0.78));}',
        /* idle-loop rank title + small print; fades out with the scroll veil */
        '.rf-bg-title{position:absolute;top:74px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;max-width:min(92cqw,720px);width:max-content;opacity:clamp(0, calc((0.5 - var(--rf-veil-alpha, 0.8)) / 0.42), 1);}',
        /* cqw: sizes track the nearest container (the 9:16 preview frame in
           Play All) and fall back to the viewport on the live page. */
        '.rf-bg-title strong{display:block;font:900 clamp(34px,11cqw,96px)/1.02 "Cinzel Decorative","Playfair Display",Georgia,serif;letter-spacing:.04em;color:#f7e7c3;text-shadow:0 5px 28px rgba(0,0,0,0.85),0 0 52px rgba(255,178,68,0.4);max-width:96%;margin:0 auto;}',
        ':root[data-theme="light"] .rf-bg-title strong{color:#fdf4de;text-shadow:0 5px 28px rgba(30,18,6,0.9),0 0 52px rgba(120,70,10,0.45);}',
        '.rf-bg-title span{display:block;margin-top:10px;font:700 clamp(12px,3vw,17px)/1.55 "Space Grotesk",system-ui,sans-serif;letter-spacing:.02em;color:rgba(255,252,244,0.96);text-shadow:0 2px 14px rgba(0,0,0,0.95),0 0 26px rgba(0,0,0,0.6);max-width:30ch;margin-left:auto;margin-right:auto;}',
        '.rf-cutscene-frame .rf-bg-title span{font-size:clamp(11px,3.4cqw,17px);}',
        ':root[data-theme="light"] .rf-bg-veil{background:rgba(250,247,243,var(--rf-veil-alpha,0.86));}',
        'html:has(body.rf-has-bg-video){background:transparent;}',
        'body.rf-has-bg-video{background:transparent !important;}',
        'body.rf-has-bg-video .grain{opacity:0.35;}'
    ].join('');

    function ensureStyles() {
        // Storybook display face for rank titles (loop overlay + cutscenes).
        if (!document.getElementById('rf-cine-font')) {
            var font = document.createElement('link');
            font.id = 'rf-cine-font';
            font.rel = 'stylesheet';
            font.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&display=swap';
            document.head.appendChild(font);
        }
        // 16-bit pixel face for NPC comment boxes.
        if (!document.getElementById('rf-pixel-font')) {
            var pfont = document.createElement('link');
            pfont.id = 'rf-pixel-font';
            pfont.rel = 'stylesheet';
            pfont.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(pfont);
        }
        if (document.getElementById('rf-cutscene-styles')) return;
        var el = document.createElement('style');
        el.id = 'rf-cutscene-styles';
        el.textContent = STYLE;
        document.head.appendChild(el);
    }

    /* ---------- edit layer (cuts / text / audio / tracker nodes) ----------
       Owner edits from the cutscene editor are stored server-side per file
       and applied at playback — originals are never re-encoded. */
    var metaCache = null;

    function fetchMeta() {
        if (metaCache) return Promise.resolve(metaCache);
        return fetch('/api/training/cutscene-meta', { credentials: 'include' })
            .then(function (resp) { return resp.json(); })
            .then(function (json) {
                metaCache = (json && json.meta) || {};
                return metaCache;
            })
            .catch(function () { metaCache = {}; return metaCache; });
    }

    function invalidateMeta() { metaCache = null; }

    /* Applies segments (play order with skips), text overlays and audio cues
       to a playing <video> inside `host`. Returns a cleanup function. */
    function applyEditLayer(video, host, meta, layerOpts) {
        if (!meta) return function () {};
        layerOpts = layerOpts || {};
        // Per-mode crop position: the owner repositions the frame separately
        // for desktop (16:9) and mobile (9:16) in the editor. Positioning is
        // measured off the HOST box, so a simulated 9:16 frame on a desktop
        // screen renders exactly like a real phone.
        var posMode = layerOpts.mode
            || (window.innerHeight > window.innerWidth ? 'mobile' : 'desktop');
        var hostDims = function () {
            var r = host.getBoundingClientRect();
            return { w: r.width || window.innerWidth || 16, h: r.height || window.innerHeight || 9 };
        };
        var repositionCrop = function () {};
        if (meta.position && typeof meta.position === 'object') {
            var savedPos = meta.position[posMode];
            if (savedPos) {
                repositionCrop = function () {
                    var d = hostDims();
                    applyVideoPosition(video, d.w, d.h, savedPos);
                };
                if (video.videoWidth) repositionCrop();
                else video.addEventListener('loadedmetadata', repositionCrop, { once: true });
                window.addEventListener('resize', repositionCrop);
            }
        }
        var segments = Array.isArray(meta.segments) && meta.segments.length ? meta.segments : null;
        var texts = Array.isArray(meta.texts) ? meta.texts : [];
        var audio = Array.isArray(meta.audio) ? meta.audio : [];
        var masks = Array.isArray(meta.masks) ? meta.masks : [];
        var trackers = Array.isArray(meta.trackers) ? meta.trackers : [];
        // Desktop and mobile are separate layouts: only play the comment
        // boxes made for the mode we're rendering in (legacy = desktop).
        var comments = (Array.isArray(meta.comments) ? meta.comments : []).filter(function (c) {
            return (c.mode === 'mobile' ? 'mobile' : 'desktop') === posMode;
        });
        var segIndex = 0;
        var audioEls = [];
        var cropPos = (meta.position && meta.position[posMode]) || { x: 50, y: 50, scaleX: 1, scaleY: 1 };
        var textEls = texts.map(function (t) {
            // Wrapper covers the frame; when the text hides behind a lasso
            // cutout, an even-odd clip-path cuts the character's outline out
            // of the wrapper so the text appears to pass behind them.
            var wrap = document.createElement('div');
            wrap.className = 'rf-cutscene-textwrap';
            var el = document.createElement('div');
            el.className = 'rf-cutscene-text';
            el.textContent = String(t.text || '');
            var preset = TEXT_STYLES[t.style];
            if (preset) el.style.cssText += preset.css;
            el.style.display = 'none';
            wrap.appendChild(el);
            host.appendChild(wrap);
            return { conf: t, el: el, wrap: wrap };
        });
        var positionTexts = function () {
            var vw = video.videoWidth || 16;
            var vh = video.videoHeight || 9;
            var rect = host.getBoundingClientRect();
            var fw = rect.width || window.innerWidth;
            var fh = rect.height || window.innerHeight;
            textEls.forEach(function (entry) {
                var t = entry.conf;
                var p = sourceToFramePct(Number(t.x) || 50, Number(t.y) || 50, fw, fh, vw, vh, cropPos);
                entry.el.style.left = p.x + '%';
                entry.el.style.top = p.y + '%';
                var mask = t.behindMask ? masks.filter(function (m) { return m.id === t.behindMask; })[0] : null;
                if (mask && mask.points && mask.points.length > 2) {
                    var poly = mask.points.map(function (pt) {
                        var fp = sourceToFramePct(pt.x, pt.y, fw, fh, vw, vh, cropPos);
                        return fp.x.toFixed(2) + '% ' + fp.y.toFixed(2) + '%';
                    }).join(',');
                    entry.wrap.style.clipPath = 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' + poly + ')';
                } else {
                    entry.wrap.style.clipPath = '';
                }
            });
        };
        // Comment boxes: PNG cards pinned to a moving tracker node.
        // Hand-recorded node paths are jittery — a small moving average
        // smooths the ride without changing the route.
        var smoothTrackPoints = function (points) {
            if (!points || points.length < 5) return points || [];
            return points.map(function (p, i) {
                var x = 0, y = 0, n = 0;
                for (var k = -2; k <= 2; k++) {
                    var q = points[Math.min(points.length - 1, Math.max(0, i + k))];
                    x += q.x; y += q.y; n += 1;
                }
                return { t: p.t, x: x / n, y: y / n };
            });
        };
        var trackerPointAt = function (points, t) {
            if (!points || !points.length) return null;
            if (t < points[0].t - 0.3 || t > points[points.length - 1].t + 0.3) return null;
            for (var i = 0; i < points.length - 1; i++) {
                var a = points[i];
                var b = points[i + 1];
                if (t >= a.t && t <= b.t) {
                    var f = (b.t - a.t) > 0 ? (t - a.t) / (b.t - a.t) : 0;
                    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
                }
            }
            return t < points[0].t ? points[0] : points[points.length - 1];
        };
        var commentEls = comments.map(function (c) {
            var el = document.createElement('div');
            el.className = 'rf-cbox' + (c.png ? '' : ' is-default');
            if (c.png) {
                var img = document.createElement('img');
                img.src = c.png;
                el.appendChild(img);
                var tintEl = document.createElement('div');
                tintEl.className = 'rf-cbox-tint';
                tintEl.style.webkitMaskImage = 'url("' + c.png + '")';
                tintEl.style.maskImage = 'url("' + c.png + '")';
                tintEl.style.background = c.tint || '#d9a15c';
                tintEl.style.opacity = String(Math.max(0, Math.min(1, Number(c.tintAmt) || 0)));
                el.appendChild(tintEl);
            }
            var textEl = document.createElement('div');
            textEl.className = 'rf-cbox-text';
            el.appendChild(textEl);
            var tailEl = document.createElement('div');
            tailEl.className = 'rf-cbox-tail';
            el.appendChild(tailEl);
            host.appendChild(el);
            var tr = trackers.filter(function (x) { return x.id === c.trackerId; })[0] || null;
            return {
                conf: c, el: el, textEl: textEl, activeLine: '',
                tracker: tr ? { id: tr.id, points: smoothTrackPoints(tr.points) } : null
            };
        });
        // Each loop pass rolls the dice per NPC. House rules:
        //  - after speaking, an NPC rests for a RANDOM 1-3 passes (cooldown)
        //  - an NPC must say 2 other lines before repeating one
        //  - never more than 2 comments share the screen at the same time
        var rollCommentCycle = function () {
            var candidates = [];
            commentEls.forEach(function (entry) {
                var c = entry.conf;
                entry.activeLine = null;
                if (entry.cooldownLeft == null) entry.cooldownLeft = 0;
                if (!entry.recent) entry.recent = [];
                if (entry.cooldownLeft > 0) { entry.cooldownLeft -= 1; return; }
                var chance = c.chance != null ? Math.max(0, Math.min(1, Number(c.chance))) : 1;
                if (Math.random() >= chance) return;
                var lines = (Array.isArray(c.lines) ? c.lines : []).filter(Boolean);
                if (!lines.length) { candidates.push({ entry: entry, line: '', idx: null }); return; }
                // Skip the last 2 lines said; degrade gracefully for NPCs
                // with only one or two lines.
                var avail = lines.map(function (l, i) { return i; })
                    .filter(function (i) { return entry.recent.indexOf(i) === -1; });
                if (!avail.length) {
                    var last = entry.recent[entry.recent.length - 1];
                    avail = lines.map(function (l, i) { return i; }).filter(function (i) { return i !== last; });
                }
                if (!avail.length) avail = lines.map(function (l, i) { return i; });
                var idx = avail[Math.floor(Math.random() * avail.length)];
                candidates.push({ entry: entry, line: lines[idx], idx: idx });
            });
            // Cap: accept in random order, refusing anyone whose window
            // could put a 3rd box on screen at the same moment.
            candidates.sort(function () { return Math.random() - 0.5; });
            var accepted = [];
            candidates.forEach(function (cand) {
                var s = Number(cand.entry.conf.start) || 0;
                var e = Number(cand.entry.conf.end) || 9999;
                var overlapping = accepted.filter(function (a) { return s < a.e && e > a.s; });
                if (overlapping.length >= 2) return; // sits this pass out
                accepted.push({ s: s, e: e });
                cand.entry.activeLine = cand.line;
                if (cand.idx != null) {
                    cand.entry.recent.push(cand.idx);
                    if (cand.entry.recent.length > 2) cand.entry.recent.shift();
                }
                cand.entry.cooldownLeft = 1 + Math.floor(Math.random() * 3);
            });
        };
        rollCommentCycle();
        // Keep-out zone: comments must never sit on top of the main
        // character (the tracker labeled main/hero/player, when present).
        var heroPoints = (function () {
            var tr = trackers.filter(function (x) { return /main|hero|player/i.test(String(x.label || '')); })[0];
            return tr ? smoothTrackPoints(tr.points) : null;
        })();
        var lastCycleT = 0;
        // The ambient loop renders BEHIND the site chrome — navbar on top,
        // control panel on the left, fab dock at the bottom on phones. Boxes
        // must never park under them. (Story cutscenes render above the
        // chrome, so they skip this.) Re-measured at most 4x/second.
        var uiSafe = { top: 0, left: 0, right: 0, bottom: 0, at: 0 };
        var measureUiSafe = function (rect) {
            if (!layerOpts.avoidChrome) return uiSafe;
            var now = (window.performance && performance.now()) || Date.now();
            if (now - uiSafe.at < 250) return uiSafe;
            uiSafe.at = now;
            uiSafe.top = 0; uiSafe.left = 0; uiSafe.right = 0; uiSafe.bottom = 0;
            var pad = 8;
            var visRect = function (el) {
                if (!el) return null;
                var r = el.getBoundingClientRect();
                if (!r.width || !r.height) return null;
                var cs = window.getComputedStyle(el);
                if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return null;
                return r;
            };
            var nav = visRect(document.querySelector('.navbar'));
            if (nav && nav.bottom > rect.top && nav.top < rect.top + rect.height * 0.5) {
                uiSafe.top = Math.max(0, nav.bottom - rect.top + pad);
            }
            var cp = visRect(document.getElementById('control-panel'));
            if (cp && cp.right > rect.left && cp.left <= rect.left + 60) {
                uiSafe.left = Math.max(0, cp.right - rect.left + pad);
            }
            var dock = visRect(document.getElementById('control-mobile-fab-dock'));
            if (dock && dock.top < rect.bottom && dock.bottom > rect.bottom - rect.height * 0.5) {
                uiSafe.bottom = Math.max(0, rect.bottom - dock.top + pad);
            }
            return uiSafe;
        };
        var positionComments = function (t) {
            if (!commentEls.length) return;
            // Loop wrap (or big backwards seek) = a new pass: re-roll who talks.
            if (t < lastCycleT - 1.5) rollCommentCycle();
            lastCycleT = t;
            var vw = video.videoWidth || 16;
            var vh = video.videoHeight || 9;
            var rect = host.getBoundingClientRect();
            var fw = rect.width || window.innerWidth;
            var fh = rect.height || window.innerHeight;
            var safe = measureUiSafe(rect);
            commentEls.forEach(function (entry) {
                var c = entry.conf;
                var free = c.trackerId === '*';
                var pt = free ? { x: 0, y: 0 } : (entry.tracker ? trackerPointAt(entry.tracker.points, t) : null);
                var end = Number(c.end) || 9999;
                var on = pt && t >= (Number(c.start) || 0) && t <= end;
                if (on && entry.activeLine === null) on = false; // sitting this pass out
                if (!on) { entry.el.style.display = 'none'; return; }
                var ax = free ? (Number(c.dx) || 50) : pt.x + (Number(c.dx) || 0);
                var ay = free ? (Number(c.dy) || 40) : pt.y + (Number(c.dy) || 0);
                var p = sourceToFramePct(ax, ay, fw, fh, vw, vh, cropPos);
                var pr = sourceToFramePct(ax + (Number(c.w) || 20), ay, fw, fh, vw, vh, cropPos);
                var wpx = Math.max(18, ((pr.x - p.x) / 100) * fw);
                // Keep the whole box inside the frame even if the node drifts
                // to the edge.
                var halfXPct = ((wpx / 2 + 8) / fw) * 100;
                var boxH = entry.el.offsetHeight || wpx * 0.4;
                var halfYPct = ((boxH / 2 + 8) / fh) * 100;
                var minX = (safe.left / fw) * 100 + halfXPct;
                var maxX = 100 - (safe.right / fw) * 100 - halfXPct;
                var minY = (safe.top / fh) * 100 + halfYPct;
                var maxY = 100 - (safe.bottom / fh) * 100 - halfYPct;
                var cx = Math.max(minX, Math.min(maxX, p.x));
                var cy = Math.max(minY, Math.min(maxY, p.y));
                // Never cover the main character: if the box drifts into the
                // hero's zone, lift it above his head, or slide it aside when
                // there is no headroom.
                if (heroPoints) {
                    var hp = trackerPointAt(heroPoints, t);
                    if (hp) {
                        var hf = sourceToFramePct(hp.x, hp.y, fw, fh, vw, vh, cropPos);
                        var hx = (hf.x / 100) * fw;
                        var hy = (hf.y / 100) * fh;
                        var bx = (cx / 100) * fw;
                        var by = (cy / 100) * fh;
                        var rad = fw * 0.09;
                        var nx = Math.max(bx - wpx / 2, Math.min(bx + wpx / 2, hx));
                        var ny = Math.max(by - boxH / 2, Math.min(by + boxH / 2, hy));
                        if (Math.hypot(nx - hx, ny - hy) < rad) {
                            var upY = hy - rad - boxH / 2 - 6;
                            if (upY - boxH / 2 > safe.top + 8) {
                                by = upY;
                            } else {
                                var side = bx >= hx ? 1 : -1;
                                bx = hx + side * (rad + wpx / 2 + 8);
                                bx = Math.max(safe.left + wpx / 2 + 8, Math.min(fw - safe.right - wpx / 2 - 8, bx));
                            }
                            cx = (bx / fw) * 100;
                            cy = Math.max(minY, Math.min(maxY, (by / fh) * 100));
                        }
                    }
                }
                entry.el.style.display = 'block';
                entry.el.style.left = cx + '%';
                entry.el.style.top = cy + '%';
                entry.el.style.width = wpx + 'px';
                var line = entry.activeLine || '';
                if (entry.textEl.textContent !== line) entry.textEl.textContent = line;
                entry.textEl.style.fontSize = Math.round(Math.max(7, Math.min(11, wpx * 0.048))) + 'px';
                entry.el.classList.toggle('has-text', Boolean(line));
                if (!c.png && !line) entry.el.style.height = Math.max(14, wpx * 0.26) + 'px';
                // Tail points from the box toward the tracked character.
                if (!free && !c.png && line && pt) {
                    var tp = sourceToFramePct(pt.x, pt.y, fw, fh, vw, vh, cropPos);
                    var ddx = tp.x - cx;
                    var ddy = tp.y - cy;
                    entry.el.setAttribute('data-tail', Math.abs(ddy) * (fh / fw) >= Math.abs(ddx)
                        ? (ddy >= 0 ? 'bottom' : 'top')
                        : (ddx >= 0 ? 'right' : 'left'));
                } else {
                    entry.el.removeAttribute('data-tail');
                }
                entry.el.style.opacity = String(Math.max(0.1, Math.min(1, c.opacity != null ? Number(c.opacity) : 1)));
                entry.el.style.transform = 'translate(-50%,-50%)' + (c.flip ? ' scaleX(-1)' : '');
            });
        };
        // Comment boxes ride a moving point — timeupdate only fires ~4x/s,
        // so drive their motion with rAF for smooth travel.
        var commentRaf = 0;
        if (commentEls.length) {
            var commentTick = function () {
                positionComments(video.currentTime);
                commentRaf = requestAnimationFrame(commentTick);
            };
            commentRaf = requestAnimationFrame(commentTick);
        }
        if (video.readyState >= 1) positionTexts();
        video.addEventListener('loadedmetadata', positionTexts);
        window.addEventListener('resize', positionTexts);

        if (segments && segments[0] && Number(segments[0].from) > 0.05) {
            try { video.currentTime = Number(segments[0].from) || 0; } catch (e) {}
        }

        var onTime = function () {
            var t = video.currentTime;
            if (segments) {
                var seg = segments[segIndex];
                if (seg) video.playbackRate = Number(seg.speed) || 1;
                if (seg && t >= Number(seg.to)) {
                    segIndex += 1;
                    if (segIndex >= segments.length) {
                        if (video.loop) {
                            segIndex = 0;
                            try { video.currentTime = Number(segments[0].from) || 0; } catch (e) {}
                        } else {
                            video.pause();
                            video.dispatchEvent(new Event('ended'));
                        }
                    } else {
                        try { video.currentTime = Number(segments[segIndex].from) || 0; } catch (e) {}
                    }
                }
            }
            textEls.forEach(function (entry) {
                var c = entry.conf;
                var start = Number(c.start || 0);
                var end = Number(c.end || 0);
                var on = t >= start && t <= end;
                entry.el.style.display = on ? 'block' : 'none';
                if (on) {
                    // Fade effects: opacity ramps at the edges of the window.
                    var fi = Math.max(0, Number(c.fadeIn) || 0);
                    var fo = Math.max(0, Number(c.fadeOut) || 0);
                    var alpha = 1;
                    if (fi > 0 && t < start + fi) alpha = Math.min(alpha, (t - start) / fi);
                    if (fo > 0 && t > end - fo) alpha = Math.min(alpha, (end - t) / fo);
                    entry.el.style.opacity = String(Math.max(0, Math.min(1, alpha)));
                }
            });
            audio.forEach(function (cue, i) {
                if (audioEls[i] || t < Number(cue.at || 0)) return;
                var a = new Audio(VIDEO_BASE + String(cue.file || ''));
                a.volume = Math.max(0, Math.min(1, Number(cue.volume != null ? cue.volume : 1)));
                a.play().catch(function () {});
                audioEls[i] = a;
            });
            positionComments(t);
        };
        video.addEventListener('timeupdate', onTime);
        return function cleanup() {
            video.removeEventListener('timeupdate', onTime);
            video.removeEventListener('loadedmetadata', positionTexts);
            window.removeEventListener('resize', positionTexts);
            window.removeEventListener('resize', repositionCrop);
            audioEls.forEach(function (a) { if (a) { a.pause(); } });
            textEls.forEach(function (entry) { entry.wrap.remove(); });
            commentEls.forEach(function (entry) { entry.el.remove(); });
            if (commentRaf) cancelAnimationFrame(commentRaf);
        };
    }

    /* ---------- playback ---------- */
    var activeOverlay = null;

    function play(id, opts) {
        opts = opts || {};
        var scene = byId(id);
        if (!scene || activeOverlay) { if (opts.onDone) opts.onDone(); return; }
        ensureStyles();

        // "mobile" on a landscape screen renders inside a centered 9:16
        // frame (Play All's mobile pass); otherwise the frame is fullscreen.
        var simMobile = opts.mode === 'mobile' && window.innerWidth > window.innerHeight;
        var overlay = document.createElement('div');
        overlay.className = 'rf-cutscene';
        overlay.innerHTML =
            (simMobile
                ? '<div class="rf-cutscene-frame"><video playsinline preload="auto" src="' + VIDEO_BASE + scene.file + '"></video></div>'
                : '<video playsinline preload="auto" src="' + VIDEO_BASE + scene.file + '"></video>') +
            (opts.label ? '<div class="rf-cutscene-tag">' + opts.label + '</div>' : '') +
            (opts.preview ? '<button type="button" class="rf-cutscene-site-btn">&#128444; Site overlay</button>' : '') +
            ((opts.onBack || opts.onExit)
                ? '<div class="rf-cutscene-nav">' +
                  (opts.onBack ? '<button type="button" data-rf-nav="back">&#9198; Back</button>' : '') +
                  '<button type="button" data-rf-nav="pause">&#10074;&#10074; Pause</button>' +
                  (opts.onExit ? '<button type="button" class="is-exit" data-rf-nav="exit">&#10005; Exit</button>' : '') +
                  '</div>'
                : '') +
            '<button type="button" class="rf-cutscene-skip">Skip &rarr;</button>';
        document.body.appendChild(overlay);
        activeOverlay = overlay;

        var frame = overlay.querySelector('.rf-cutscene-frame') || overlay;
        var video = overlay.querySelector('video');
        var skip = overlay.querySelector('.rf-cutscene-skip');
        if (scene.loop && !opts.noLoop) video.loop = true; // background previews loop until skipped
        var finished = false;
        var cleanupEdit = function () {};
        var cleanupCine = attachCineCopy(video, frame, scene);
        fetchMeta().then(function (meta) {
            if (finished) return;
            if (meta[scene.file]) {
                cleanupEdit = applyEditLayer(video, frame, meta[scene.file], { mode: opts.mode });
            }
            if (!meta[scene.file] || !meta[scene.file].position) autoPositionVideo(video);
        });

        var ceremonyShown = false;
        var done = function () {
            if (finished) return;
            finished = true;
            cleanupEdit();
            cleanupCine();
            overlay.remove();
            activeOverlay = null;
            if (!opts.noBanner && !ceremonyShown && (scene.kind === 'Promotions' || scene.kind === 'Demotions')) {
                showRankBanner(scene);
            }
            if (opts.onDone) opts.onDone();
        };

        // Ending flow for story scenes: hold the last frame, fade to black,
        // then (promotion/demotion only) run the spider-graph ceremony.
        // Intro just fades out. Backgrounds and skips keep the fast exit.
        var endFlowRan = false;
        var endFlow = function () {
            if (finished || endFlowRan) return;
            endFlowRan = true;
            var storyKind = scene.kind === 'Promotions' ? 'promotion'
                : scene.kind === 'Demotions' ? 'demotion'
                : scene.kind === 'Intro' ? 'intro' : null;
            if (!storyKind) { done(); return; }
            try { video.pause(); } catch (e) {}
            var fade = document.createElement('div');
            fade.className = 'rf-cine-fade';
            frame.appendChild(fade);
            window.requestAnimationFrame(function () { fade.classList.add('is-on'); });
            window.setTimeout(function () {
                if (finished) return;
                if (storyKind === 'intro') { done(); return; }
                ceremonyShown = true;
                showCeremony(frame, storyKind, done, { preview: !!opts.preview, sceneId: scene.id });
            }, 1250);
        };

        // Skip appears for everyone after 4 seconds (immediately in previews).
        window.setTimeout(function () { skip.classList.add('is-visible'); }, opts.preview ? 300 : SKIP_DELAY_MS);
        skip.addEventListener('click', done);
        video.addEventListener('ended', endFlow);
        video.addEventListener('error', done); // missing/broken file: never trap the user

        // Preview controls: Back / Pause / Exit so nobody is ever stuck.
        var nav = overlay.querySelector('.rf-cutscene-nav');
        if (nav) {
            nav.addEventListener('click', function (ev) {
                var b = ev.target.closest ? ev.target.closest('[data-rf-nav]') : null;
                if (!b) return;
                var action = b.getAttribute('data-rf-nav');
                if (action === 'pause') {
                    if (video.paused) { video.play().catch(function () {}); b.innerHTML = '&#10074;&#10074; Pause'; }
                    else { video.pause(); b.innerHTML = '&#9654; Resume'; }
                    return;
                }
                // back/exit close this scene WITHOUT firing onDone (= next)
                if (finished) return;
                finished = true;
                cleanupEdit();
                cleanupCine();
                overlay.remove();
                activeOverlay = null;
                if (action === 'back' && opts.onBack) opts.onBack();
                else if (action === 'exit' && opts.onExit) opts.onExit();
            });
        }
        // Site overlay toggle: drop the page chrome mock over the video.
        var siteBtn = overlay.querySelector('.rf-cutscene-site-btn');
        if (siteBtn) {
            var mock = null;
            siteBtn.addEventListener('click', function () {
                if (mock) { mock.remove(); mock = null; siteBtn.classList.remove('is-on'); return; }
                mock = buildSiteMock(simMobile || window.innerHeight > window.innerWidth ? 'mobile' : 'desktop');
                frame.appendChild(mock);
                siteBtn.classList.add('is-on');
            });
        }

        // Try with sound; if the browser blocks it, fall back to muted with
        // a tap-for-sound control.
        var attempt = video.play();
        if (attempt && typeof attempt.catch === 'function') {
            attempt.catch(function () {
                video.muted = true;
                var soundBtn = document.createElement('button');
                soundBtn.type = 'button';
                soundBtn.className = 'rf-cutscene-sound';
                soundBtn.textContent = '🔊 Tap for sound';
                soundBtn.addEventListener('click', function () {
                    video.muted = false;
                    soundBtn.remove();
                });
                overlay.appendChild(soundBtn);
                video.play().catch(done);
            });
        }
    }

    /* Play everything in story order — from the start of the game up the
       ladder, rank by rank (promotion in, demotions onto it, then its idle
       loops), each scene twice: the desktop pass, then the mobile (9:16)
       pass — so both crops get checked before moving on. Skip = next. */
    function playAll() {
        var ladder = ['peasant', 'squire', 'mage', 'ranger', 'berserker', 'knight', 'king'];
        var order = [];
        var add = function (scene) { if (scene) order.push(scene); };
        add(byId('intro'));
        ladder.forEach(function (rank) {
            add(byId('promotion-' + rank));
            add(byId('demotion-' + rank));
            (BACKGROUNDS[rank] || []).forEach(function (bg) {
                add(byId('bg-' + rank + '-' + bg.band));
            });
        });
        var queue = [];
        order.forEach(function (scene) {
            queue.push({ scene: scene, mode: 'desktop' });
            queue.push({ scene: scene, mode: 'mobile' });
        });
        var i = 0;
        var show = function () {
            if (i < 0) i = 0;
            if (i >= queue.length) return;
            var item = queue[i];
            play(item.scene.id, {
                mode: item.mode,
                noLoop: true,
                noBanner: true,
                preview: true,
                label: '<b>' + (i + 1) + '/' + queue.length + '</b> · ' + item.scene.label + ' · <b>' + item.mode.toUpperCase() + '</b>',
                onDone: function () { i += 1; show(); },
                onBack: function () { i -= 1; show(); },
                onExit: function () { /* queue abandoned */ }
            });
        };
        show();
    }

    /* ---------- automatic triggers (overview page only) ---------- */
    function currentIdentity() {
        try {
            if (!window.OdeIdentity) return null;
            var stats = window.OdeIdentity.readStoredStats ? window.OdeIdentity.readStoredStats('ovIdentityStats') : null;
            if (!stats) return null;
            var type = window.OdeIdentity.pickType(stats);
            if (!type) return null;
            var keys = ['strength', 'cardio', 'consistency', 'nutrition', 'recovery', 'progress'];
            var sum = 0;
            keys.forEach(function (k) { sum += Number(stats[k]) || 0; });
            return { rank: type.id, avg: sum / keys.length };
        } catch (e) { return null; }
    }

    function currentRankId() {
        var identity = currentIdentity();
        return identity ? identity.rank : null;
    }

    /* ---------- ambient background loop (overview page) ---------- */
    function pickBackgroundFile(identity) {
        var bands = identity && BACKGROUNDS[identity.rank];
        if (!bands || !bands.length) return null;
        for (var i = 0; i < bands.length; i++) {
            if (identity.avg <= bands[i].maxAvg) return bands[i].file;
        }
        return bands[bands.length - 1].file;
    }

    function initBackgroundLoop() {
        if (!document.body.classList.contains('overview-page')) return;
        if (document.querySelector('.rf-bg-video')) return;
        try {
            if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
            if (navigator.connection && navigator.connection.saveData) return;
        } catch (e) {}
        var identity = currentIdentity();
        var file = pickBackgroundFile(identity);
        if (!file) return;
        ensureStyles();
        var bgScene = null;
        for (var bi = 0; bi < CUTSCENES.length; bi++) {
            if (CUTSCENES[bi].file === file) { bgScene = CUTSCENES[bi]; break; }
        }
        var bgCopy = bgScene ? bgSubFor(bgScene.id) : null;
        var layer = document.createElement('div');
        layer.className = 'rf-bg-video';
        layer.setAttribute('aria-hidden', 'true');
        layer.innerHTML = '<video muted loop autoplay playsinline preload="metadata" src="' + VIDEO_BASE + file + '"></video><div class="rf-bg-veil"></div>'
            // Rank title in fancy letters + small print on why they are the
            // way they are; opacity is tied to the scroll veil, so it owns
            // the art at the top and disappears as content arrives.
            + (bgCopy ? '<div class="rf-bg-title"><strong>' + bgCopy.title + '</strong><span>' + bgCopy.sub + '</span></div>' : '');
        document.body.insertBefore(layer, document.body.firstChild);
        document.body.classList.add('rf-has-bg-video');
        var video = layer.querySelector('video');
        video.addEventListener('error', function () {
            layer.remove();
            document.body.classList.remove('rf-has-bg-video');
        });
        fetchMeta().then(function (meta) {
            // Segments/text apply to the ambient loop too; audio cues are
            // skipped here (background must stay silent).
            var m = meta[file];
            if (m) applyEditLayer(video, layer, { segments: m.segments, texts: m.texts, audio: [], masks: m.masks, trackers: m.trackers, comments: m.comments, position: m.position }, { avoidChrome: true });
            if (!m || !m.position) autoPositionVideo(video);
        });
        video.play().catch(function () { /* muted autoplay is normally allowed */ });
    }

    function runAutoTriggers() {
        if (!document.body.classList.contains('overview-page')) return;
        var onboarded = false;
        try { onboarded = localStorage.getItem('ode_onboarding_done_v1') === '1'; } catch (e) {}
        if (!onboarded) return;

        var rank = currentRankId();

        // 1) Intro: once, on the first overview visit after onboarding.
        var introSeen = false;
        try { introSeen = localStorage.getItem('ode_intro_seen_v1') === '1'; } catch (e) {}
        if (!introSeen) {
            try { localStorage.setItem('ode_intro_seen_v1', '1'); } catch (e) {}
            // Baseline the rank silently so the intro visit never also
            // fires a promotion scene.
            if (rank) { try { localStorage.setItem('ode_last_seen_rank_v1', rank); } catch (e) {} }
            play('intro');
            return;
        }

        // 2) Promotion / demotion: rank differs from the last one shown.
        if (!rank) return;
        var lastSeen = '';
        try { lastSeen = localStorage.getItem('ode_last_seen_rank_v1') || ''; } catch (e) {}
        if (!lastSeen) {
            try { localStorage.setItem('ode_last_seen_rank_v1', rank); } catch (e) {}
            return;
        }
        if (lastSeen === rank) return;
        try { localStorage.setItem('ode_last_seen_rank_v1', rank); } catch (e) {}
        // Lateral moves get no ceremony: specialist <-> specialist swaps, or
        // sliding back to squire from a specialist path. Quiet banner only.
        var sameTier = TIER[rank] != null && TIER[rank] === TIER[lastSeen];
        var specialistToSquire = rank === 'squire' && TIER[lastSeen] === 2;
        if (sameTier || specialistToSquire) {
            showLateralBanner(rank);
            return;
        }
        var direction = (TIER[rank] != null && TIER[lastSeen] != null && TIER[rank] < TIER[lastSeen]) ? 'demotion' : 'promotion';
        var scene = byId(direction + '-' + rank);
        if (scene) play(scene.id);
    }

    /* ---------- owner manager panel ---------- */
    function openManager() {
        ensureStyles();
        var existing = document.querySelector('.rf-cutscene-mgr');
        if (existing) { existing.remove(); return; }
        var kinds = ['Background', 'Intro', 'Promotions', 'Demotions'];
        var wrap = document.createElement('div');
        wrap.className = 'rf-cutscene-mgr';
        wrap.innerHTML =
            '<div class="rf-cutscene-mgr-card">' +
            '  <div class="rf-cutscene-mgr-head"><h3>Cutscenes</h3><button type="button" class="rf-cutscene-mgr-close" aria-label="Close">&times;</button></div>' +
            '  <p class="rf-cutscene-mgr-sub">Owner preview: trigger any scene exactly as users see it (Skip appears after 4s).</p>' +
            '<h4>Daily recap</h4>' +
            '<div class="rf-cutscene-mgr-row"><span>Yesterday recap — radar morph + did/didn&rsquo;t list</span>' +
            '<span class="rf-cutscene-mgr-actions">' +
            '<button type="button" data-rf-recap>Trigger</button>' +
            '</span></div>' +
            kinds.map(function (kind) {
                var items = CUTSCENES.filter(function (c) { return c.kind === kind; });
                if (!items.length) return '';
                return '<h4>' + kind + '</h4>' + items.map(function (c) {
                    return '<div class="rf-cutscene-mgr-row"><span>' + c.label + '</span>' +
                        '<span class="rf-cutscene-mgr-actions">' +
                        '<button type="button" data-rf-play="' + c.id + '">Trigger</button>' +
                        '<button type="button" class="is-alt" data-rf-edit="' + c.id + '">Edit</button>' +
                        '<button type="button" class="is-alt" data-rf-replace="' + c.id + '">Replace</button>' +
                        '</span></div>';
                }).join('');
            }).join('') +
            '  <button type="button" class="rf-cutscene-mgr-playall" data-rf-playall>&#9654; Play all — story order, desktop then mobile (Skip = next)</button>' +
            '  <button type="button" class="rf-cutscene-mgr-reset" data-rf-reset>Reset triggers (intro + rank memory)</button>' +
            '</div>';
        document.body.appendChild(wrap);
        wrap.addEventListener('click', function (event) {
            var t = event.target;
            if (t.classList.contains('rf-cutscene-mgr-close') || t === wrap) { wrap.remove(); return; }
            var recapBtn = t.closest ? t.closest('[data-rf-recap]') : null;
            if (recapBtn) {
                wrap.remove();
                if (window.OdeDailyRecap && window.OdeDailyRecap.preview) window.OdeDailyRecap.preview();
                return;
            }
            var playBtn = t.closest ? t.closest('[data-rf-play]') : null;
            if (playBtn) { wrap.remove(); play(playBtn.getAttribute('data-rf-play'), { preview: true }); return; }
            if (t.closest && t.closest('[data-rf-playall]')) { wrap.remove(); playAll(); return; }
            var editBtn = t.closest ? t.closest('[data-rf-edit]') : null;
            if (editBtn) {
                var editScene = byId(editBtn.getAttribute('data-rf-edit'));
                if (editScene) { wrap.remove(); openEditor(editScene); }
                return;
            }
            var replaceBtn = t.closest ? t.closest('[data-rf-replace]') : null;
            if (replaceBtn) {
                var repScene = byId(replaceBtn.getAttribute('data-rf-replace'));
                if (repScene) replaceVideo(repScene, replaceBtn);
                return;
            }
            if (t.closest && t.closest('[data-rf-reset]')) {
                try {
                    localStorage.removeItem('ode_intro_seen_v1');
                    localStorage.removeItem('ode_last_seen_rank_v1');
                } catch (e) {}
                t.textContent = 'Triggers reset ✓';
            }
        });
    }

    function injectOwnerButton() {
        var section = document.getElementById('control-owner-section');
        if (!section || document.getElementById('control-owner-cutscenes-btn')) return;
        var btn = document.createElement('button');
        btn.className = 'control-link';
        btn.id = 'control-owner-cutscenes-btn';
        btn.type = 'button';
        btn.innerHTML = '<span class="icon"><svg viewBox="0 0 24 24" style="fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;"><rect x="4" y="5.5" width="16" height="13" rx="2.5"></rect><path d="m10.5 9.5 4.5 2.5-4.5 2.5v-5Z"></path></svg></span><span class="text">Cutscenes</span>';
        btn.addEventListener('click', openManager);
        section.appendChild(btn);
    }

    /* Replace: upload a new file over the same name (owner asset route). */
    function replaceVideo(scene, btn) {
        var input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/mp4,video/webm';
        input.addEventListener('change', function () {
            var file = input.files && input.files[0];
            if (!file) return;
            var original = btn.textContent;
            btn.textContent = 'Uploading…';
            btn.disabled = true;
            fetch('/api/training/cutscene-asset?name=' + encodeURIComponent(scene.file), {
                method: 'PUT',
                credentials: 'include',
                body: file
            }).then(function (resp) { return resp.json(); }).then(function (json) {
                btn.disabled = false;
                btn.textContent = json && json.ok ? 'Replaced ✓' : 'Failed';
                window.setTimeout(function () { btn.textContent = original; }, 2500);
            }).catch(function () {
                btn.disabled = false;
                btn.textContent = 'Failed';
                window.setTimeout(function () { btn.textContent = original; }, 2500);
            });
        });
        input.click();
    }

    /* Editor loads on demand — it's an owner tool, users never download it. */
    function openEditor(scene) {
        ensureStyles();
        var start = function () {
            window.RiseCutsceneEditor.open(scene, {
                videoBase: VIDEO_BASE,
                loadMeta: function () {
                    return fetchMeta().then(function (meta) { return meta[scene.file] || {}; });
                },
                saveMeta: function (meta) {
                    return fetch('/api/training/cutscene-meta', {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ file: scene.file, meta: meta })
                    }).then(function (resp) { return resp.json(); }).then(function (json) {
                        invalidateMeta();
                        return Boolean(json && json.ok);
                    });
                },
                uploadAsset: function (file, name) {
                    return fetch('/api/training/cutscene-asset?name=' + encodeURIComponent(name), {
                        method: 'PUT', credentials: 'include', body: file
                    }).then(function (resp) { return resp.json(); });
                },
                neighbors: (function () {
                    var i = CUTSCENES.indexOf(scene);
                    return {
                        prev: i > 0 ? CUTSCENES[i - 1] : null,
                        next: i >= 0 && i < CUTSCENES.length - 1 ? CUTSCENES[i + 1] : null
                    };
                })(),
                openScene: openEditor
            });
        };
        if (window.RiseCutsceneEditor) { start(); return; }
        var el = document.createElement('script');
        el.src = 'js/cutscene-editor.js?v=2026-07-12-editor-24';
        el.addEventListener('load', start);
        document.head.appendChild(el);
    }

    window.RiseCutscenes = {
        play: play,
        playAll: playAll,
        openManager: openManager,
        list: CUTSCENES,
        fetchMeta: fetchMeta,
        invalidateMeta: invalidateMeta,
        TEXT_STYLES: TEXT_STYLES,
        recommendStylesFor: recommendStylesFor,
        paintedRect: paintedRect,
        sourceToFramePct: sourceToFramePct,
        applyVideoPosition: applyVideoPosition,
        analyzeFocus: analyzeFocus,
        autoCenterPos: autoCenterPos
    };

    var init = function () {
        injectOwnerButton();
        // Give the identity engine's page-load refresh a beat to settle
        // before reading the rank.
        window.setTimeout(function () {
            runAutoTriggers();
            initBackgroundLoop();
        }, 400);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
