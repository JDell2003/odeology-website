/* ====================================================================
   THE KINGDOM — the leaderboard as a living world.
   --------------------------------------------------------------------
   One master video (videos/world/kingdom-crane.mp4, encoded all-keyframe:
   ffmpeg -i raw.mp4 -vf scale=1080:-2 -an -g 1 -crf 23 out.mp4) is a
   continuous camera descent: Thrones → Vanguard → Arena → Drill Yard →
   Streets. The video is sticky-fullscreen inside a tall scroll track and
   a rAF loop lerps scroll progress (0–1) into video.currentTime — scroll
   is the playhead, both directions.

   ENTRY CINEMATIC: on arrival the page plays the descent by animating
   scrollY down to the signed-in user's tier, easing to a stop there.
   Their rank + spider graph appear; nearby ranked players are clickable
   medallions whose profile cards (radar included) grow out of the chip.
   After the arrival — or the moment the user scrolls/touches — control
   is fully manual.
   ==================================================================== */
(function () {
    'use strict';

    /* ---------------- TUNING KNOBS ---------------- */
    var SMOOTHING = 0.11;      // scrub lag: lower = floatier, higher = tighter
    var TRACK_VH = 600;        // how much scrolling the full descent takes
    var PEERS_PER_TIER = 10;   // medallions shown per tier (kings get KINGS_SHOWN)
    var KINGS_SHOWN = 10;      // thrones medallions
    var NAV_SCROLL_MS = 1500;  // rail click: animate scroll so the camera rides
    var AUTO_BASE_MS = 5000;   // entry cinematic: minimum ride length
    var AUTO_MAX_MS = 15000;   // the ride never exceeds this
    var AUTO_FULL_MS = 7000;   // added time for a full top-to-bottom descent
    var VIDEO_FPS = 48;        // master video fps: manual seeks snap to frames
    var MAX_SCRUB_SPEED = 3.2; // manual scroll: max video-seconds per real second (keeps flicks smooth)
    var RIDE_EDGE_RATE = 1.7;  // ride speed leaving the thrones / arriving at your rank
    var RIDE_MAX_RATE = 4.5;   // ride cruise cap — higher starts to chop
    var SCENE_SRC = 'videos/world/kingdom-crane-hq.mp4'; // 48fps interpolated; kingdom-crane.mp4 = lighter 24fps fallback
    var DATA_URL = 'data/kingdom-leaderboard.json';
    // Zone ranges as fractions of the video (five equal clips = fifths).
    // pop = simulated citizens per tier (sums to 32,848 — steeper at the top)
    // win = the sub-range of each zone where callouts live (clips start/end
    // on wipe frames; the kings clip tilts down to the carpet at its end)
    var ZONES = [
        { id: 'kings', title: 'The Thrones', sub: 'Kings — the fifteen seats', from: 0.00, to: 0.20, icon: '♛', pop: 15, win: [0, 0.62] },
        { id: 'knights', title: 'The Vanguard', sub: 'Knights — one step below', from: 0.20, to: 0.40, icon: '♞', pop: 149, win: [0.16, 0.70] },
        { id: 'arena', title: 'The Arena', sub: 'Berserkers · Rangers · Mages', from: 0.40, to: 0.60, icon: '⚔', pop: 2431, win: [0.16, 0.80] },
        { id: 'squires', title: 'The Drill Yard', sub: 'Squires — learning the blade', from: 0.60, to: 0.80, icon: '⚑', pop: 7854, win: [0.16, 0.80] },
        { id: 'peasants', title: 'The Streets', sub: 'Peasants — where everyone begins', from: 0.80, to: 1.00, icon: '⚒', pop: 22399, win: [0.15, 1.01] }
    ];
    var CASTE_ZONE = { king: 'kings', knight: 'knights', berserker: 'arena', ranger: 'arena', mage: 'arena', arena: 'arena', squire: 'squires', peasant: 'peasants' };
    var ZONE_LABEL = { kings: 'King', knights: 'Knight', arena: 'Specialist', squires: 'Squire', peasants: 'Peasant' };
    var AXES = ['strength', 'cardio', 'consistency', 'nutrition', 'recovery', 'progress'];
    // Character anchors per zone: [x0,y0,x1,y1] in % of the video frame —
    // the top players get pinned to the actual figures in the footage.
    var ANCHORS = {
        // three keyframes per track (start / mid / end of the callout window),
        // read off the actual footage so the dot rides the character
        kings: [[50, 50, 50, 45, 50, 44], [23, 48, 29, 42, 30, 42], [74, 46, 69, 41, 67, 41]],
        knights: [[50, 36, 50, 56, 50, 58], [35.5, 37, 38, 57, 38, 58], [64.5, 37, 62.5, 57, 62.5, 58]],
        arena: [[48, 44, 42, 54, 34, 64], [35, 56, 21, 57, 12, 62], [68, 48, 80, 56, 72, 66]],
        squires: [[76, 44, 70, 44, 64, 46], [23, 42, 17, 42, 11, 44], [56, 64, 50, 66, 44, 68]],
        // one soul in the streets: the glowing hero — if the viewer is a
        // peasant, that hero IS them
        peasants: [[48, 44, 49, 42, 49, 36]]
    };
    var CALLOUT_WINDOW = [0.12, 0.88]; // sub-range of the zone where callouts show

    var track = document.getElementById('kingdom-track');
    if (!track) return;
    document.body.classList.add('kd-on');
    try { history.scrollRestoration = 'manual'; } catch (e) {}

    /* main.css puts overflow-x:hidden on html/body at phone widths, which
       silently KILLS position:sticky (body becomes the scrollport) — the
       stage never pinned on mobile. overflow-x:clip clips without creating
       a scroll container, so sticky survives. */
    try {
        document.documentElement.style.overflowX = 'clip';
        document.body.style.overflowX = 'clip';
    } catch (e) {}

    /* True full-bleed: the CSS 50%-50vw trick assumes a centered parent,
       but the pinned control panel offsets .lb-main (and it arrives late,
       after auth) — keep correcting until the track hugs the viewport. */
    function fitTrack() {
        var vw = document.documentElement.clientWidth;
        var rect = track.getBoundingClientRect();
        if (Math.abs(rect.left) < 1 && Math.abs(rect.width - vw) < 2) return;
        var margin = parseFloat(track.style.marginLeft) || 0;
        track.style.width = vw + 'px';
        track.style.marginLeft = (margin - rect.left) + 'px';
    }
    window.addEventListener('resize', function () { window.requestAnimationFrame(fitTrack); });
    window.setInterval(fitTrack, 500);

    /* ---------------- styles ---------------- */
    var css = [
        /* the descent owns the top of the page: no header above the world */
        'body.kd-on .lb-header{display:none;}',
        'body.kd-on .lb-main{padding-top:0;}',
        'body.kd-on{padding-top:0 !important;}',
        /* champion card below: the scene is the place their rank lives */
        '.lb-champion-stage.kd-tier{min-height:clamp(240px,38vw,400px);background-size:cover;background-position:center 32%;border-radius:14px;}',
        '.lb-champion-stage.kd-tier svg{visibility:hidden;position:absolute;inset:0;}',
        '#kingdom-track{position:relative;width:100vw;margin-left:calc(50% - 50vw);height:' + TRACK_VH + 'vh;background:#0d0910;padding:0 !important;margin-top:0 !important;}',
        '.kd-stage{margin:0 !important;}',
        '.kd-stage{position:sticky;top:0;height:100vh;height:100svh;width:100%;overflow:hidden;background:#0d0910;}',
        '.kd-stage video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}',
        /* loader */
        '.kd-loader{position:absolute;inset:0;z-index:8;display:grid;place-items:center;text-align:center;background:radial-gradient(80% 60% at 50% 30%,#241631,#0d0910);transition:opacity .6s ease;}',
        '.kd-loader.is-done{opacity:0;pointer-events:none;}',
        '.kd-loader .kd-load-crest{font-size:44px;color:#e0b34a;text-shadow:0 0 34px rgba(224,179,74,.6);animation:kdPulse 1.6s ease-in-out infinite;}',
        '@keyframes kdPulse{50%{transform:scale(1.12);text-shadow:0 0 54px rgba(224,179,74,.9)}}',
        '.kd-loader .kd-load-title{margin-top:12px;font:900 clamp(22px,4vw,34px)/1.1 "Cinzel Decorative","Playfair Display",Georgia,serif;color:#f4e4bd;}',
        '.kd-loader .kd-load-sub{margin-top:8px;font:700 11px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:rgba(244,228,189,.55);}',
        /* zone UI */
        '.kd-zoneui{position:absolute;inset:0;z-index:3;opacity:0;pointer-events:none;transition:opacity .18s linear;}',
        '.kd-zoneui.is-on{opacity:1;pointer-events:auto;}',
        '.kd-zh{position:absolute;top:calc(72px + 5vh);left:50%;transform:translateX(-50%);text-align:center;max-width:min(94vw,600px);padding:14px 24px 10px;border-radius:20px;background:radial-gradient(65% 130% at 50% 42%,rgba(10,6,12,.6),transparent 78%);pointer-events:none;}',
        '.kd-zh .kd-eyebrow{font:800 10px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.3em;text-transform:uppercase;color:#d9a93c;margin:0 0 7px;}',
        '.kd-zh h2{margin:0;font:900 clamp(22px,4.4vw,44px)/1.04 "Cinzel Decorative","Playfair Display",Georgia,serif;color:#f4e4bd;text-shadow:0 3px 20px rgba(0,0,0,.75);}',
        /* peer medallions: a quiet dock along the bottom of the scene */
        '.kd-peers{position:absolute;left:50%;bottom:9vh;transform:translateX(-50%);display:flex;gap:12px 14px;align-items:flex-end;justify-content:center;max-width:min(96vw,820px);flex-wrap:wrap;}',
        '.kd-peer{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;border:0;background:transparent;padding:0;transition:transform .18s ease;}',
        '.kd-peer:hover{transform:translateY(-5px);}',
        '.kd-ava{width:52px;height:52px;border-radius:999px;display:grid;place-items:center;background:radial-gradient(120% 120% at 30% 25%,#3a2740,#170f1c);border:2px solid rgba(217,169,60,.65);color:#ffd98f;font:900 15px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.02em;box-shadow:0 10px 26px rgba(0,0,0,.55);transition:border-color .18s ease,box-shadow .18s ease;}',
        '.kd-peer:hover .kd-ava{border-color:#e0b34a;box-shadow:0 12px 30px rgba(0,0,0,.6),0 0 22px rgba(224,179,74,.5);}',
        '.kd-peer small{max-width:86px;padding:3px 8px;border-radius:999px;background:rgba(10,6,12,.66);border:1px solid rgba(217,169,60,.35);color:#f4e4bd;font:700 9.5px/1.3 "Space Grotesk",system-ui,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.kd-peer small b{color:#d9a93c;}',
        '.kd-peer.kd-peer-first .kd-ava{width:62px;height:62px;border-color:#e0b34a;box-shadow:0 0 0 1px rgba(224,179,74,.4),0 14px 34px rgba(0,0,0,.65),0 0 34px rgba(224,179,74,.45);}',
        '.kd-peer.kd-peer-first::before{content:"♛";color:#ffd98f;font-size:14px;text-shadow:0 0 12px rgba(224,179,74,.8);}',
        '.kd-peer.kd-peer-you .kd-ava{border-color:#fff;box-shadow:0 0 0 2px #b98a2b,0 12px 30px rgba(0,0,0,.6),0 0 26px rgba(224,179,74,.6);}',
        /* callouts pinned to the characters in the footage */
        '.kd-callout{position:absolute;z-index:4;transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;cursor:pointer;border:0;background:transparent;padding:0;opacity:0;transition:opacity .3s ease;pointer-events:none;}',
        '.kd-callout.is-vis{pointer-events:auto;}',
        '.kd-co-chip{padding:5px 11px;border-radius:10px;background:rgba(10,6,12,.8);border:1.5px solid rgba(224,179,74,.75);color:#f4e4bd;font:800 11px/1.2 "Space Grotesk",system-ui,sans-serif;white-space:nowrap;box-shadow:0 8px 22px rgba(0,0,0,.5);}',
        '.kd-co-chip b{color:#ffd98f;}',
        '.kd-callout:hover .kd-co-chip{border-color:#ffd98f;box-shadow:0 8px 22px rgba(0,0,0,.6),0 0 18px rgba(224,179,74,.5);}',
        '.kd-co-stem{width:1.5px;height:24px;background:linear-gradient(180deg,rgba(224,179,74,.9),rgba(224,179,74,.15));}',
        '.kd-co-dot{width:9px;height:9px;border-radius:999px;border:2px solid #ffd98f;background:rgba(224,179,74,.35);box-shadow:0 0 12px rgba(224,179,74,.8);animation:kdDot 2.2s ease-in-out infinite;}',
        '@keyframes kdDot{50%{box-shadow:0 0 22px rgba(224,179,74,1)}}',
        '.kd-callout.kd-co-first .kd-co-chip::before{content:"♛ ";color:#ffd98f;}',
        '.kd-callout.kd-co-you .kd-co-chip{border-color:#fff;box-shadow:0 0 0 1.5px #b98a2b,0 8px 22px rgba(0,0,0,.6),0 0 22px rgba(224,179,74,.6);color:#fff;}',
        '.kd-callout.kd-co-you .kd-co-dot{border-color:#fff;background:rgba(255,255,255,.4);}',
        /* desktop: the shouted-out character carries their spider graph */
        '.kd-co-graph{display:block;padding:5px;border-radius:14px;background:rgba(10,6,12,.74);border:1.5px solid rgba(224,179,74,.55);box-shadow:0 10px 26px rgba(0,0,0,.55);margin-bottom:5px;}',
        '.kd-co-graph svg{display:block;}',
        '.kd-graph-ghost{position:fixed;z-index:7000;pointer-events:none;box-sizing:border-box;padding:5px;border-radius:14px;background:rgba(10,6,12,.74);border:1.5px solid rgba(224,179,74,.55);box-shadow:0 10px 26px rgba(0,0,0,.55);transition:left .9s cubic-bezier(.45,0,.2,1),top .9s cubic-bezier(.45,0,.2,1),width .9s cubic-bezier(.45,0,.2,1),height .9s cubic-bezier(.45,0,.2,1),opacity .32s ease;}',
        '.kd-callout.kd-co-you .kd-co-graph{border-color:#fff;box-shadow:0 0 0 1.5px #b98a2b,0 10px 26px rgba(0,0,0,.6);}',
        '.kd-callout:hover .kd-co-graph{border-color:#ffd98f;}',
        '.kd-co-chip{max-width:150px;overflow:hidden;text-overflow:ellipsis;}',
        /* zone population: heavier crowds the lower you go */
        '.kd-count{margin:7px 0 0;font:800 10.5px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,217,143,.85);text-shadow:0 2px 10px rgba(0,0,0,.85);}',
        '.kd-runnerups{font:800 9px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:rgba(244,228,189,.6);margin-bottom:7px;text-shadow:0 2px 8px rgba(0,0,0,.8);}',
        /* YOUR arrival card: rank + spider graph */
        '.kd-youcard{position:absolute;left:calc(var(--control-width, 0px) + 24px);bottom:24px;z-index:5;width:min(320px,86vw);border-radius:20px;border:1.5px solid rgba(217,169,60,.55);background:linear-gradient(170deg,rgba(20,12,22,.92),rgba(10,6,12,.94));box-shadow:0 26px 60px rgba(0,0,0,.6),0 0 40px rgba(224,179,74,.18);padding:16px 18px;color:#f4e4bd;font-family:"Space Grotesk",system-ui,sans-serif;opacity:0;transform:translateY(24px);transition:opacity .5s ease,transform .5s cubic-bezier(.2,.8,.3,1);pointer-events:none;}',
        '.kd-youcard.is-on{opacity:1;transform:none;pointer-events:auto;}',
        'body:not(.control-open):not(.control-collapsed) .kd-youcard{left:24px;}',
        '.kd-youcard .kd-you-kicker{font:800 9.5px/1 system-ui,sans-serif;letter-spacing:.26em;text-transform:uppercase;color:#d9a93c;}',
        '.kd-youcard .kd-you-rank{margin-top:5px;font:900 24px/1.1 "Playfair Display",Georgia,serif;color:#fff;}',
        '.kd-youcard .kd-you-sub{margin-top:3px;font:600 11.5px/1.5 "Space Grotesk",system-ui,sans-serif;color:rgba(244,228,189,.72);}',
        '.kd-youcard svg{display:block;margin:10px auto 2px;}',
        /* clicked-peer profile card: grows out of the avatar */
        '.kd-profile{position:fixed;z-index:6900;width:min(320px,90vw);border-radius:20px;border:1.5px solid rgba(217,169,60,.6);background:linear-gradient(170deg,rgba(22,13,24,.96),rgba(10,6,12,.97));box-shadow:0 30px 70px rgba(0,0,0,.65),0 0 46px rgba(224,179,74,.2);padding:18px;color:#f4e4bd;font-family:"Space Grotesk",system-ui,sans-serif;transform-origin:top left;transition:transform .38s cubic-bezier(.2,.8,.3,1),opacity .3s ease;}',
        '.kd-profile .kd-prof-head{display:flex;align-items:center;gap:12px;}',
        '.kd-profile .kd-ava{width:46px;height:46px;flex:0 0 46px;}',
        '.kd-profile .kd-prof-name{font:900 17px/1.2 "Playfair Display",Georgia,serif;color:#fff;}',
        '.kd-profile .kd-prof-sub{margin-top:2px;font:700 10.5px/1.4 "Space Grotesk",system-ui,sans-serif;color:#d9a93c;}',
        '.kd-profile svg{display:block;margin:12px auto 0;}',
        '.kd-profile .kd-prof-close{position:absolute;top:8px;right:10px;border:0;background:transparent;color:rgba(244,228,189,.6);font-size:18px;cursor:pointer;line-height:1;}',
        /* rail + depth + HUD */
        '.kd-rail{position:fixed;left:14px;top:50%;transform:translateY(-50%);z-index:40;display:flex;flex-direction:column;gap:10px;opacity:0;pointer-events:none;transition:opacity .3s ease;}',
        '.kd-rail.is-on{opacity:1;pointer-events:auto;}',
        '.kd-rail button{position:relative;width:44px;height:44px;border-radius:999px;border:1px solid rgba(217,169,60,.4);background:rgba(10,6,12,.6);color:rgba(244,228,189,.75);font-size:19px;cursor:pointer;backdrop-filter:blur(3px);transition:all .2s ease;display:grid;place-items:center;}',
        '.kd-rail button:hover{border-color:#e0b34a;color:#ffd98f;}',
        '.kd-rail button.is-active{background:#b98a2b;border-color:#e0b34a;color:#fff;box-shadow:0 0 20px rgba(224,179,74,.5);}',
        '.kd-rail .kd-rail-tip{position:absolute;left:52px;top:50%;transform:translateY(-50%);white-space:nowrap;padding:4px 10px;border-radius:8px;background:rgba(10,6,12,.85);color:#f4e4bd;font:700 10.5px/1.4 "Space Grotesk",system-ui,sans-serif;opacity:0;pointer-events:none;transition:opacity .15s ease;}',
        '.kd-rail button:hover .kd-rail-tip{opacity:1;}',
        '.kd-depth{position:fixed;right:14px;top:50%;transform:translateY(-50%);z-index:40;width:4px;height:min(46vh,420px);border-radius:999px;background:rgba(244,228,189,.15);opacity:0;transition:opacity .3s ease;}',
        '.kd-depth.is-on{opacity:1;}',
        '.kd-depth i{position:absolute;left:0;top:0;width:100%;border-radius:999px;background:linear-gradient(180deg,#ffd98f,#b98a2b);box-shadow:0 0 12px rgba(224,179,74,.6);}',
        '.kd-hud{position:absolute;right:16px;top:84px;z-index:4;padding:7px 14px;border-radius:999px;border:1px solid rgba(217,169,60,.35);background:rgba(10,6,12,.55);color:rgba(244,228,189,.8);font:800 10px/1 "Space Grotesk",system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;transition:opacity .5s ease;pointer-events:none;backdrop-filter:blur(3px);white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;}',
        '.kd-hud.is-off{opacity:0;}',
        /* ------- mobile ------- */
        '@media (max-width:700px){',
        '  .kd-zh{top:calc(60px + 6vh);padding:10px 14px 8px;border-radius:16px;}',
        '  .kd-zh .kd-eyebrow{font-size:8.5px;letter-spacing:.22em;}',
        '  .kd-count{font-size:8.5px;letter-spacing:.14em;}',
        /* runner-up medallions: one overlapping row pinned low — the video
           keeps the screen; tap any avatar for the full card */
        '  .kd-peers{bottom:128px;gap:0;max-width:96vw;flex-wrap:nowrap;}',
        '  .kd-peer{margin-left:-13px;}',
        '  .kd-peer:first-child{margin-left:0;}',
        '  .kd-ava{width:40px;height:40px;font-size:11px;border-width:1.5px;}',
        '  .kd-peer small{display:none;}',
        '  .kd-runnerups{display:none;}',
        '  .kd-co-chip{font-size:9px;padding:4px 8px;max-width:110px;}',
        '  .kd-co-stem{height:16px;}',
        '  .kd-co-graph{padding:4px;margin-bottom:4px;border-radius:12px;}',
        '  .kd-co-graph svg{width:80px;height:80px;}',
        '  .kd-hud{top:76px;right:10px;font-size:8.5px;padding:6px 10px;}',
        '  .kd-youcard{padding:12px 14px;}',
        '  .kd-youcard .kd-you-rank{font-size:19px;}',
        '  .kd-youcard svg{width:150px;height:150px;}',
        /* clear the site's mobile bottom dock (~64px) */
        '  .kd-rail{left:50%;top:auto;bottom:76px;transform:translateX(-50%);flex-direction:row;gap:8px;}',
        '  .kd-rail button{width:38px;height:38px;font-size:16px;}',
        '  .kd-rail .kd-rail-tip{display:none;}',
        '  .kd-depth{right:6px;height:34vh;}',
        '  .kd-youcard{left:50%;bottom:184px;transform:translate(-50%,24px);width:min(310px,92vw);}',
        '  .kd-youcard.is-on{transform:translate(-50%,0);}',
        '}',
        /* reduced motion: static zones, no cinematic */
        'body.kd-reduced #kingdom-track{height:auto;}',
        'body.kd-reduced .kd-stage{position:relative;height:52vh;height:52svh;}',
        'body.kd-reduced .kd-zoneui{position:relative;inset:auto;opacity:1;pointer-events:auto;padding:20px 0 26px;background:#140d18;display:flex;flex-direction:column;align-items:center;gap:14px;}',
        'body.kd-reduced .kd-zh,body.kd-reduced .kd-peers,body.kd-reduced .kd-youcard{position:static;transform:none;}',
        'body.kd-reduced .kd-hud,body.kd-reduced .kd-rail,body.kd-reduced .kd-depth{display:none;}'
    ].join('\n');
    var styleEl = document.createElement('style');
    styleEl.id = 'kd-style';
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ---------------- markup ---------------- */
    track.innerHTML =
        '<div class="kd-stage">' +
        '  <video muted playsinline preload="auto" src="' + SCENE_SRC + '"></video>' +
        ZONES.map(function (z) {
            return '<div class="kd-zoneui" data-zone="' + z.id + '" data-from="' + z.from + '" data-to="' + z.to + '">' +
                '<div class="kd-zh"><p class="kd-eyebrow">' + z.icon + ' ' + z.sub + '</p><h2>' + z.title + '</h2>' +
                '<p class="kd-count">' + z.pop.toLocaleString() + ' of 32,848 hold this rank</p></div>' +
                '<div class="kd-peers" data-peers></div>' +
                '</div>';
        }).join('') +
        '  <div class="kd-youcard" id="kd-youcard"></div>' +
        '  <div class="kd-hud" id="kd-hud">( descending to your rank… )</div>' +
        '  <div class="kd-loader" id="kd-loader">' +
        '     <div><div class="kd-load-crest">♛</div>' +
        '     <div class="kd-load-title">Raising the Kingdom</div>' +
        '     <div class="kd-load-sub">Then the realm carries you to your rank</div></div>' +
        '  </div>' +
        '</div>';
    var rail = document.createElement('div');
    rail.className = 'kd-rail';
    rail.innerHTML = ZONES.map(function (z) {
        return '<button type="button" data-kd-zone="' + z.id + '" aria-label="' + z.title + '">' + z.icon +
            '<span class="kd-rail-tip">' + z.title + '</span></button>';
    }).join('');
    document.body.appendChild(rail);
    var depth = document.createElement('div');
    depth.className = 'kd-depth';
    depth.innerHTML = '<i style="height:0%"></i>';
    document.body.appendChild(depth);
    fitTrack();

    var video = track.querySelector('video');
    // The 48fps HQ master is too big for the git repo (GitHub 100MB cap), so
    // production may only ship the lighter 24fps encode — fall back to it.
    video.addEventListener('error', function onSceneError() {
        video.removeEventListener('error', onSceneError);
        if (video.src.indexOf('kingdom-crane-hq') !== -1) {
            video.src = SCENE_SRC.replace('kingdom-crane-hq', 'kingdom-crane');
            try { video.load(); } catch (e) {}
        }
    });
    var loader = document.getElementById('kd-loader');
    var hud = document.getElementById('kd-hud');
    var youCard = document.getElementById('kd-youcard');
    var zoneEls = Array.prototype.slice.call(track.querySelectorAll('.kd-zoneui'));
    var depthFill = depth.querySelector('i');
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) document.body.classList.add('kd-reduced');

    /* ---------------- players + you ---------------- */
    function seeded(str) {
        var h = 2166136261;
        for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
        return function () { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return ((h ^= h >>> 16) >>> 0) / 4294967296; };
    }
    var TIER_STAT_BASE = { kings: [82, 96], knights: [66, 84], arena: [46, 74], squires: [34, 52], peasants: [12, 34] };
    function statsFor(p, zoneId, isYou) {
        var rnd = seeded(String(p.name) + '#' + String(p.rank || '') + zoneId);
        var base = p.stats;
        if (!base) {
            var range = TIER_STAT_BASE[zoneId] || TIER_STAT_BASE.peasants;
            base = {};
            AXES.forEach(function (k) { base[k] = Math.round(range[0] + rnd() * (range[1] - range[0])); });
        }
        if (isYou) return base;
        // every athlete gets a distinct shape — bots share templates, so a
        // seeded per-name skew keeps two neighbors from ever matching
        var out = {};
        AXES.forEach(function (k) {
            var v = (Number(base[k]) || 0) + (rnd() - 0.5) * 22;
            out[k] = Math.round(Math.max(5, Math.min(98, v)));
        });
        return out;
    }
    function initialsOf(name) {
        var parts = String(name).trim().split(/\s+/);
        return ((parts[0] || 'A')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
    }
    function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;'); }

    var players = null; // [{name, rank, score, zone, stats}]
    var you = null;     // {name, rank, zone, stats, score}

    function normalizeBoard(rows) {
        return rows.filter(function (r) { return !r.__gap; }).map(function (r) {
            var zone = CASTE_ZONE[String(r.__caste || r.tier || '').toLowerCase()] || 'peasants';
            return { name: r.displayName || r.name || r.username || 'Wanderer', rank: r.rank || 0, score: r.points || r.score || 0, zone: zone, stats: r.__stats || r.stats || null };
        });
    }
    function fallbackPlayers() {
        var names = ['Aldric', 'Berenice', 'Cassian', 'Darian', 'Elowen', 'Fenwick', 'Gisela', 'Hadrian', 'Isolde', 'Jorund', 'Katarin', 'Leofric', 'Maren', 'Nikolas', 'Odalys', 'Percival', 'Quinlan', 'Rosalind', 'Sigmund', 'Theodric'];
        var tiers = [['kings', 15], ['knights', 10], ['arena', 10], ['squires', 10], ['peasants', 12]];
        var out = [];
        var score = 9800;
        var rank = 1;
        tiers.forEach(function (t) {
            for (var i = 0; i < t[1]; i++) {
                out.push({ name: names[(out.length * 7 + 3) % names.length] + ' the ' + ['Bold', 'Iron', 'Swift', 'Quiet', 'Stern', 'Grim', 'Bright'][(out.length * 5) % 7], rank: rank++, score: score, zone: t[0], stats: null });
                score -= 41 + ((out.length * 13) % 37);
            }
        });
        return out;
    }
    function resolveYou() {
        if (window.__kingdomYou) {
            var y = window.__kingdomYou;
            return { name: y.name || 'You', rank: y.rank || 0, zone: CASTE_ZONE[String(y.caste || '').toLowerCase()] || 'peasants', stats: y.stats || null, score: y.score || 0 };
        }
        // fallback: derive the tier from the identity stats
        try {
            var stats = JSON.parse(localStorage.getItem('ovIdentityStats'));
            if (stats) {
                var sum = 0;
                AXES.forEach(function (k) { sum += Number(stats[k]) || 0; });
                var avg = sum / AXES.length;
                var zone = avg >= 82 ? 'kings' : avg >= 68 ? 'knights' : avg >= 50 ? 'arena' : avg >= 35 ? 'squires' : 'peasants';
                return { name: 'You', rank: 0, zone: zone, stats: stats, score: 0 };
            }
        } catch (e) {}
        return { name: 'You', rank: 0, zone: 'peasants', stats: null, score: 0 };
    }
    function adoptData() {
        if (window.__kingdomBoard && window.__kingdomBoard.length) {
            players = normalizeBoard(window.__kingdomBoard);
            you = resolveYou();
            renderPeers();
            renderYouCard();
            return true;
        }
        return false;
    }
    window.addEventListener('kingdom:data', adoptData);
    if (!adoptData()) {
        fetch(DATA_URL, { credentials: 'include' })
            .then(function (r) { if (!r.ok) throw new Error('no data'); return r.json(); })
            .then(function (json) {
                if (players) return; // board arrived first
                var rows = (Array.isArray(json) ? json : (json.players || [])).map(function (p, i) {
                    return { name: p.name, rank: i + 1, score: p.score || 0, zone: CASTE_ZONE[String(p.tier || '').toLowerCase()] || 'peasants', stats: p.stats || null };
                });
                players = rows;
                you = resolveYou();
                renderPeers();
                renderYouCard();
            })
            .catch(function () {
                if (players) return;
                players = fallbackPlayers();
                you = resolveYou();
                renderPeers();
                renderYouCard();
            });
    }

    /* ---------------- radar (spider graph) ---------------- */
    function radarSVG(stats, size, opts) {
        opts = opts || {};
        var R = size * 0.36;
        var cx = size / 2, cy = size / 2 + 2;
        var pt = function (i, v) {
            var a = (Math.PI * 2 * i) / AXES.length - Math.PI / 2;
            return [(cx + Math.cos(a) * R * (v / 100)).toFixed(1), (cy + Math.sin(a) * R * (v / 100)).toFixed(1)];
        };
        var rings = [33, 66, 100].map(function (g) {
            return '<polygon points="' + AXES.map(function (_, i) { return pt(i, g).join(','); }).join(' ') + '" fill="none" stroke="rgba(217,169,60,.28)" stroke-width="1"/>';
        }).join('');
        var spokes = AXES.map(function (_, i) {
            var p = pt(i, 100);
            return '<line x1="' + cx + '" y1="' + cy + '" x2="' + p[0] + '" y2="' + p[1] + '" stroke="rgba(217,169,60,.18)" stroke-width="1"/>';
        }).join('');
        var shape = '<polygon points="' + AXES.map(function (k, i) { return pt(i, Math.max(4, Number(stats[k]) || 0)).join(','); }).join(' ') + '" fill="rgba(224,179,74,.3)" stroke="#e0b34a" stroke-width="2"/>';
        var labels = opts.labels === false ? '' : AXES.map(function (k, i) {
            var p = pt(i, 128);
            return '<text x="' + p[0] + '" y="' + p[1] + '" text-anchor="middle" font-size="8.5" font-weight="800" fill="rgba(244,228,189,.62)" font-family="Space Grotesk,system-ui,sans-serif">' + k.slice(0, 4).toUpperCase() + '</text>';
        }).join('');
        return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' + rings + spokes + shape + labels + '</svg>';
    }

    /* ---------------- peers dock (per zone) ---------------- */
    function peersFor(zoneId) {
        var list = (players || []).filter(function (p) { return p.zone === zoneId; });
        list.sort(function (a, b) { return (a.rank || 1e9) - (b.rank || 1e9); });
        var max = zoneId === 'kings' ? KINGS_SHOWN : PEERS_PER_TIER;
        return list.slice(0, max);
    }
    var calloutReg = {}; // zoneId -> [{el, player, a:[x0,y0,x1,y1]}]
    function renderPeers() {
        calloutReg = {};
        zoneEls.forEach(function (el) {
            var zoneId = el.getAttribute('data-zone');
            var host = el.querySelector('[data-peers]');
            var list = peersFor(zoneId);
            // the best performers get pinned to the characters in the scene;
            // everyone else holds the bottom dock as honorary runners-up
            var anchors = ANCHORS[zoneId] || [];
            var youHere = you && you.rank && you.zone === zoneId;
            var callN = Math.min(anchors.length, 3, Math.max(list.length, youHere ? 1 : 0));
            var starred = list.slice(0, callN);
            // The viewer always has a body in their own tier: if they are
            // not already among the starred, they take the last callout slot
            // (the only slot, in the streets — that hero represents THEM).
            if (youHere && callN > 0 && !starred.some(function (p) { return p.rank === you.rank; })) {
                var youP = list.filter(function (p) { return p.rank === you.rank; })[0]
                    || { name: you.name || 'You', rank: you.rank, score: you.score || 0, zone: zoneId, stats: you.stats };
                starred[callN - 1] = youP;
            }
            var dock = list.filter(function (p) {
                return !starred.some(function (sp) { return sp.rank === p.rank; });
            });
            Array.prototype.forEach.call(el.querySelectorAll('.kd-callout'), function (c) { c.remove(); });
            var oldTag = el.querySelector('.kd-runnerups');
            if (oldTag) oldTag.remove();
            calloutReg[zoneId] = starred.map(function (p, i) {
                var isYou = youHere && p.rank === you.rank;
                var c = document.createElement('button');
                c.type = 'button';
                c.className = 'kd-callout' + (i === 0 && zoneId === 'kings' ? ' kd-co-first' : '') + (isYou ? ' kd-co-you' : '');
                var label = isYou ? 'YOU' : esc(String(p.name));
                // the character's spider graph rides the tag; yours disappears
                // from the tag once it has handed off to the corner card
                var graph = (isYou && youHandoff) ? '' : '<span class="kd-co-graph">' + radarSVG(statsFor(p, zoneId, isYou), 92, { labels: false }) + '</span>';
                c.innerHTML = graph + '<span class="kd-co-chip"><b>#' + (p.rank || i + 1) + '</b> ' + label + '</span>' +
                    '<span class="kd-co-stem"></span><span class="kd-co-dot"></span>';
                c.addEventListener('click', function (ev) { ev.stopPropagation(); openProfile(p, zoneId, c); });
                el.appendChild(c);
                return { el: c, player: p, a: anchors[i] };
            });
            if (callN > 0 && dock.length) {
                var tag = document.createElement('div');
                tag.className = 'kd-runnerups';
                tag.textContent = 'Honorary runners-up';
                host.parentElement.insertBefore(tag, host);
            }
            host.innerHTML = dock.map(function (p, i) {
                var isYou = you && you.zone === zoneId && you.rank && p.rank === you.rank;
                return '<button type="button" class="kd-peer' + (isYou ? ' kd-peer-you' : '') + '" data-peer="' + i + '">' +
                    '<span class="kd-ava">' + esc(initialsOf(p.name)) + '</span>' +
                    '<small><b>#' + (p.rank || i + 1) + '</b> ' + esc(String(p.name)) + '</small></button>';
            }).join('');
            Array.prototype.forEach.call(host.querySelectorAll('.kd-peer'), function (btn, i) {
                btn.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    openProfile(dock[i], zoneId, btn);
                });
            });
        });
    }

    /* map a source-frame % point through the cover-crop onto the stage */
    var stageEl = track.querySelector('.kd-stage');
    function coverPoint(xPct, yPct) {
        var w = stageEl.clientWidth || 16;
        var h = stageEl.clientHeight || 9;
        var vw = video.videoWidth || 1280;
        var vh = video.videoHeight || 720;
        var sc = Math.max(w / vw, h / vh);
        var pw = vw * sc, ph = vh * sc;
        return { x: (w - pw) / 2 + (xPct / 100) * pw, y: (h - ph) / 2 + (yPct / 100) * ph };
    }
    /* callouts ride their character through the zone, then fade before the
       scene hands over to the next one */
    function updateCallouts(p) {
        ZONES.forEach(function (z) {
            var regs = calloutReg[z.id];
            if (!regs || !regs.length) return;
            var kz = (p - z.from) / (z.to - z.from);
            var lo = z.win[0], hi = z.win[1];
            var fadeIn = lo <= 0 ? 1 : (kz - lo) / 0.06;
            var fadeOut = hi >= 1 ? 1 : (hi - kz) / 0.06;
            var fade = Math.max(0, Math.min(1, fadeIn, fadeOut));
            if (kz < Math.max(0, lo) - 0.001 || kz > Math.min(1, hi) + 0.001) fade = 0;
            // progress through the callout window drives the 3-point track
            var kw = Math.max(0, Math.min(1, (kz - Math.max(0, lo)) / (Math.min(1, hi) - Math.max(0, lo))));
            regs.forEach(function (r) {
                if (fade <= 0) { r.el.style.opacity = '0'; r.el.classList.remove('is-vis'); return; }
                var a = r.a;
                var x, y;
                if (kw < 0.5) {
                    var k1 = kw / 0.5;
                    x = a[0] + (a[2] - a[0]) * k1;
                    y = a[1] + (a[3] - a[1]) * k1;
                } else {
                    var k2 = (kw - 0.5) / 0.5;
                    x = a[2] + (a[4] - a[2]) * k2;
                    y = a[3] + (a[5] - a[3]) * k2;
                }
                var pt = coverPoint(x, y);
                // cover-cropped away on this screen (portrait phones) -> hide
                var w = stageEl.clientWidth || 0;
                if (pt.x < 26 || pt.x > w - 26) { r.el.style.opacity = '0'; r.el.classList.remove('is-vis'); return; }
                r.el.style.left = pt.x.toFixed(1) + 'px';
                r.el.style.top = pt.y.toFixed(1) + 'px';
                r.el.style.opacity = String(fade);
                r.el.classList.add('is-vis');
            });
        });
    }

    /* profile card grows out of the clicked avatar */
    var profileEl = null;
    function closeProfile() {
        if (!profileEl) return;
        var el = profileEl;
        profileEl = null;
        el.style.opacity = '0';
        window.setTimeout(function () { el.remove(); }, 280);
    }
    function openProfile(p, zoneId, chipBtn) {
        closeProfile();
        var isYou = you && you.rank && p.rank === you.rank && you.zone === zoneId;
        var stats = statsFor(p, zoneId, isYou);
        var card = document.createElement('div');
        card.className = 'kd-profile';
        card.innerHTML =
            '<button type="button" class="kd-prof-close" aria-label="Close">×</button>' +
            '<div class="kd-prof-head">' +
            '  <span class="kd-ava">' + esc(initialsOf(p.name)) + '</span>' +
            '  <div><div class="kd-prof-name">' + esc(p.name) + '</div>' +
            '  <div class="kd-prof-sub">' + (ZONES.filter(function (z) { return z.id === zoneId; })[0] || ZONES[4]).icon + ' ' + ZONE_LABEL[zoneId] + ' · Rank #' + Number(p.rank || 0).toLocaleString() + (p.score ? ' · ' + Number(p.score).toLocaleString() + ' pts' : '') + '</div></div>' +
            '</div>' + radarSVG(stats, 208);
        document.body.appendChild(card);
        // position near the chip, clamped to the viewport; grow from the avatar
        var r = chipBtn.getBoundingClientRect();
        var w = Math.min(320, window.innerWidth * 0.9);
        var left = Math.max(10, Math.min(window.innerWidth - w - 10, r.left + r.width / 2 - w / 2));
        var top = r.top - 8 - 316;
        if (top < 10) top = Math.min(window.innerHeight - 330, r.bottom + 10);
        card.style.left = left + 'px';
        card.style.top = Math.max(10, top) + 'px';
        card.style.transform = 'scale(.2) translateY(' + (r.top - top) + 'px)';
        card.style.opacity = '0';
        requestAnimationFrame(function () {
            card.style.transform = 'scale(1) translateY(0)';
            card.style.opacity = '1';
        });
        card.querySelector('.kd-prof-close').addEventListener('click', closeProfile);
        profileEl = card;
    }
    document.addEventListener('click', function (ev) {
        if (profileEl && !(ev.target.closest && (ev.target.closest('.kd-profile') || ev.target.closest('.kd-peer')))) closeProfile();
    });

    /* ---------------- YOUR card ---------------- */
    function renderYouCard() {
        if (!you) return;
        var zone = ZONES.filter(function (z) { return z.id === you.zone; })[0] || ZONES[4];
        var stats = you.stats || statsFor({ name: 'you' }, you.zone, true);
        youCard.innerHTML =
            '<div class="kd-you-kicker">' + zone.icon + ' Your place in the realm</div>' +
            '<div class="kd-you-rank">' + (you.rank ? '#' + Number(you.rank).toLocaleString() + ' ' : '') + ZONE_LABEL[you.zone] + '</div>' +
            '<div class="kd-you-sub">' + zone.title + ' · tap a medallion to inspect a rival\'s graph</div>' +
            radarSVG(stats, 216);
    }

    /* Your graph shows on your medallion first; after a beat it flies down
       into the corner card, so both are never up at the same time. */
    var youHandoff = false;
    var youHandoffTimer = null;
    function youCalloutGraph() {
        var regs = (you && calloutReg[you.zone]) || [];
        for (var i = 0; i < regs.length; i++) {
            if (regs[i].el.classList.contains('kd-co-you')) return regs[i].el.querySelector('.kd-co-graph');
        }
        return null;
    }
    function runYouHandoff() {
        youHandoffTimer = null;
        if (youHandoff) return;
        youHandoff = true;
        var graphEl = youCalloutGraph();
        var from = graphEl && graphEl.getBoundingClientRect();
        youCard.classList.add('is-on');
        var target = youCard.querySelector('svg');
        if (!graphEl || !target || !from || !from.width) {
            if (graphEl) graphEl.style.display = 'none';
            return;
        }
        target.style.opacity = '0';
        // let the card finish sliding in (.5s) before measuring its graph slot
        window.setTimeout(function () {
            var to = target.getBoundingClientRect();
            var ghost = document.createElement('span');
            ghost.className = 'kd-graph-ghost';
            ghost.innerHTML = graphEl.innerHTML;
            var gsvg = ghost.querySelector('svg');
            if (gsvg) { gsvg.style.width = '100%'; gsvg.style.height = '100%'; }
            ghost.style.left = from.left + 'px';
            ghost.style.top = from.top + 'px';
            ghost.style.width = from.width + 'px';
            ghost.style.height = from.height + 'px';
            document.body.appendChild(ghost);
            graphEl.style.display = 'none';
            requestAnimationFrame(function () {
                ghost.style.left = to.left + 'px';
                ghost.style.top = to.top + 'px';
                ghost.style.width = to.width + 'px';
                ghost.style.height = to.height + 'px';
            });
            window.setTimeout(function () {
                target.style.opacity = '';
                ghost.style.opacity = '0';
                window.setTimeout(function () { ghost.remove(); }, 320);
            }, 900);
        }, 560);
    }

    /* ---------------- the scrub engine ---------------- */
    var duration = 0;
    var current = 0;
    var rafId = 0;
    var running = false;
    var lastMoveAt = 0;
    var loaderDone = false;
    var arrived = false;    // entry cinematic finished (or skipped)
    var autoAnim = null;    // active cinematic scroll animation
    var riding = false;     // native-playback ride in progress

    function trackMetrics() {
        var rect = track.getBoundingClientRect();
        return { top: window.scrollY + rect.top, scrollable: rect.height - window.innerHeight };
    }
    function progress() {
        var rect = track.getBoundingClientRect();
        var scrollable = rect.height - window.innerHeight;
        if (scrollable <= 0) return 0;
        return Math.max(0, Math.min(1, -rect.top / scrollable));
    }
    function youTargetProgress() {
        var zone = ZONES.filter(function (z) { return z.id === (you ? you.zone : 'peasants'); })[0] || ZONES[4];
        return zone.from + (zone.to - zone.from) * 0.45; // settle mid-zone
    }

    function applyZones(p) {
        var activeZone = '';
        zoneEls.forEach(function (el) {
            var from = Number(el.getAttribute('data-from'));
            var to = Number(el.getAttribute('data-to'));
            el.classList.toggle('is-on', p >= from - 0.015 && p <= to + 0.015);
            if (p >= from && p < to) activeZone = el.getAttribute('data-zone');
        });
        if (p >= 1) activeZone = ZONES[ZONES.length - 1].id;
        Array.prototype.forEach.call(rail.querySelectorAll('button'), function (b) {
            b.classList.toggle('is-active', b.getAttribute('data-kd-zone') === activeZone);
        });
        depthFill.style.height = (p * 100).toFixed(2) + '%';
        updateCallouts(p);
        // your card lives in your zone once the cinematic has arrived — but
        // the medallion graph gets its moment first, then hands off to it
        if (arrived && you) {
            if (activeZone !== you.zone) {
                youCard.classList.remove('is-on');
                if (youHandoffTimer) { window.clearTimeout(youHandoffTimer); youHandoffTimer = null; }
            } else if (youHandoff) {
                youCard.classList.add('is-on');
            } else if (!youHandoffTimer) {
                youHandoffTimer = window.setTimeout(runYouHandoff, 2800);
            }
        }
    }

    var lastSeekFrame = -1;
    var lastTickAt = 0;
    var lastSeekIssuedAt = 0;
    var REVERSE_SPEED_SCALE = 0.8; // reverse decode is heavier; cap upward scrubs a touch lower
    var SEEK_STALL_MS = 250;       // if a seek hangs this long, stop waiting on it
    function tick() {
        rafId = requestAnimationFrame(tick);
        var p = progress();
        // The zone UI and character callouts follow the FRAME ON SCREEN
        // (the video playhead), not the scroll — on fast scrolls the seek
        // lags the scrollbar, and scroll-driven tags were appearing over
        // people who weren't in frame yet.
        var pv = (!reduced && duration)
            ? Math.max(0, Math.min(1, video.currentTime / Math.max(0.001, duration - 0.08)))
            : p;
        applyZones(pv);
        if (reduced) return;
        if (!duration) return;
        if (riding) { current = video.currentTime; return; } // native playback owns the ride
        var now = performance.now();
        var dt = lastTickAt ? Math.min(0.1, (now - lastTickAt) / 1000) : 0.016;
        lastTickAt = now;
        // never park exactly on the end: an 'ended' video restarts from 0 on play()
        var target = Math.min(p * duration, duration - 0.08);
        var prev = current;
        var stepv = (target - current) * SMOOTHING;
        var maxStep = MAX_SCRUB_SPEED * dt;
        if (stepv < 0) maxStep *= REVERSE_SPEED_SCALE;
        if (stepv > maxStep) stepv = maxStep; else if (stepv < -maxStep) stepv = -maxStep;
        current += stepv;
        if (Math.abs(current - prev) > 0.0008) {
            lastMoveAt = performance.now();
            // snap seeks to frame boundaries — re-seeking mid-frame makes
            // the decoder churn; one seek per frame of content is butter.
            // COALESCE: never queue a seek on top of one still decoding
            // (fast flicks were backlogging the decoder and hitching) —
            // `current` keeps integrating, so when the decoder frees up the
            // next tick seeks straight to the latest position.
            var f = Math.round(current * VIDEO_FPS);
            var seekBusy = video.seeking && (now - lastSeekIssuedAt) < SEEK_STALL_MS;
            if (f !== lastSeekFrame && !seekBusy) {
                lastSeekFrame = f;
                lastSeekIssuedAt = now;
                try { video.currentTime = f / VIDEO_FPS; } catch (e) { /* seek race */ }
            }
        }
        hud.classList.toggle('is-off', !autoAnim && performance.now() - lastMoveAt < 900);
    }
    function start() { if (!running) { running = true; rafId = requestAnimationFrame(tick); } }
    function stop() { running = false; cancelAnimationFrame(rafId); }

    /* Some mobile decoders won't paint a frame from currentTime seeks alone
       while the video has never "played" — a muted 1-frame play/pause tap
       whenever the camera rests forces the frame onto the screen. */
    var lastNudge = 0;
    function paintNudge() {
        if (reduced || document.hidden || riding) return; // never pause the ride
        if (video.ended || (duration && video.currentTime >= duration - 0.08)) return; // play() on an ended video rewinds to 0
        var now = performance.now();
        if (now - lastNudge < 1000) return;
        lastNudge = now;
        try {
            var pr = video.play();
            if (pr && pr.then) pr.then(function () { video.pause(); }).catch(function () {});
            else video.pause();
        } catch (e) {}
    }
    window.setInterval(function () {
        if (loaderDone && !document.hidden && performance.now() - lastMoveAt > 1100) paintNudge();
    }, 1200);

    /* ---------------- entry cinematic: ride to your rank ---------------- */
    function jumpTo(y) {
        // behavior:'instant' sidesteps the site-wide scroll-behavior:smooth,
        // which would otherwise turn every per-frame scroll into a fight
        try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); }
        catch (e) { window.scrollTo(0, y); }
    }
    function animateScroll(targetY, ms, ease, done) {
        var startY = window.scrollY;
        var t0 = performance.now();
        var token = {};
        autoAnim = token;
        var step = function (now) {
            if (autoAnim !== token) return; // superseded
            var k = Math.min(1, (now - t0) / ms);
            jumpTo(startY + (targetY - startY) * ease(k));
            if (k < 1) requestAnimationFrame(step);
            else { autoAnim = null; if (done) done(); }
        };
        requestAnimationFrame(step);
    }
    var easeInOutCubic = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
    var easeOutCubic = function (x) { return 1 - Math.pow(1 - x, 3); };
    // Jason: the entry ride is NOT user-controllable — input is locked
    // until the camera arrives at their rank.
    var lockEvents = ['wheel', 'touchmove', 'keydown'];
    var lockKeys = { ' ': 1, ArrowUp: 1, ArrowDown: 1, PageUp: 1, PageDown: 1, Home: 1, End: 1 };
    function blockInput(ev) {
        if (arrived) return;
        if (ev.type === 'keydown' && !lockKeys[ev.key]) return;
        ev.preventDefault();
    }
    function lockScroll(on) {
        lockEvents.forEach(function (n) {
            if (on) window.addEventListener(n, blockInput, { passive: false });
            else window.removeEventListener(n, blockInput, { passive: false });
        });
    }
    function finishArrival(skipped) {
        if (arrived) return;
        arrived = true;
        riding = false;
        lockScroll(false);
        try { if (!video.paused) video.pause(); } catch (e) {}
        // hand the scrub engine a clean baseline so there is no first-scroll jump
        current = video.currentTime;
        lastSeekFrame = Math.round(current * VIDEO_FPS);
        hud.textContent = '( scroll — you are the camera )';
        applyZones(progress());
        // the medallion graph gets its moment first — applyZones (just above)
        // scheduled the handoff that flies it into the corner card
        if (youHandoff) youCard.classList.add('is-on');
        paintNudge();
    }
    /* The entry ride PLAYS the video natively (a decoder playing forward is
       perfectly smooth — per-frame seeking is what reads as chop) and the
       page scroll follows the video. playbackRate bends along an
       ease-in-out curve: leaves the thrones slowly, cruises the middle
       ranks, drifts to a stop at theirs. */
    var easeInOutSine = function (x) { return -(Math.cos(Math.PI * x) - 1) / 2; };
    function startCinematic() {
        if (arrived || reduced) { finishArrival(false); return; }
        var m = trackMetrics();
        jumpTo(Math.max(0, m.top)); // every reload begins at the thrones
        var p = youTargetProgress();
        hud.textContent = '( descending to your rank… )';
        hud.classList.remove('is-off');
        lockScroll(true);
        var rideMs = Math.min(AUTO_MAX_MS, AUTO_BASE_MS + AUTO_FULL_MS * p);
        var fallback = function () {
            riding = false;
            animateScroll(m.top + m.scrollable * p, rideMs, easeInOutCubic, function () { finishArrival(false); });
        };
        if (!duration) { fallback(); return; }
        var targetT = p * duration;
        // Sine rate curve paced by CONTENT progress: average of peak·sin is
        // peak·2/π, so this peak makes the whole ride last ≈ rideMs while
        // leaving slowly, cruising the middle, and drifting in at the end.
        var avgRate = targetT / (rideMs / 1000);
        // trapezoid: ramp up over the first 18% of content, cruise, ramp down
        // over the last 18% — edges stay lively, the middle stays watchable
        var cruise = Math.min(RIDE_MAX_RATE, Math.max(avgRate * 1.18, RIDE_EDGE_RATE + 0.5));
        var token = {};
        autoAnim = token;
        riding = true;
        try { video.currentTime = 0; } catch (e) {}
        var pr = video.play();
        if (pr && pr.catch) pr.catch(function () { if (autoAnim === token) { autoAnim = null; fallback(); } });
        var step = function () {
            if (autoAnim !== token) return;
            var t = video.currentTime;
            var kc = Math.min(1, t / targetT);
            var edge = 0.18;
            var shape = kc < edge ? kc / edge : kc > 1 - edge ? (1 - kc) / edge : 1;
            video.playbackRate = RIDE_EDGE_RATE + (cruise - RIDE_EDGE_RATE) * Math.max(0, Math.min(1, shape));
            // the page rides the video
            jumpTo(m.top + (t / duration) * m.scrollable);
            if (t >= targetT - 0.06) {
                autoAnim = null;
                riding = false;
                video.pause();
                video.playbackRate = 1;
                jumpTo(m.top + (video.currentTime / duration) * m.scrollable);
                finishArrival(false);
                return;
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    /* ---------------- loading ---------------- */
    video.addEventListener('loadedmetadata', function () { duration = video.duration || 0; });
    function finishLoader() {
        if (loaderDone) return;
        loaderDone = true;
        loader.classList.add('is-done');
        rail.classList.add('is-on');
        depth.classList.add('is-on');
        try { video.currentTime = 0.001; } catch (e) {}
        window.setTimeout(startCinematic, 350);
    }
    video.addEventListener('canplaythrough', finishLoader);
    video.addEventListener('error', function () {
        loader.querySelector('.kd-load-title').textContent = 'The Kingdom is being painted';
        loader.querySelector('.kd-load-sub').textContent = 'videos/world/kingdom-crane.mp4 missing — ranks still work below';
        window.setTimeout(finishLoader, 1200);
    });
    window.setTimeout(function () { if (video.readyState >= 3) finishLoader(); }, 4000);
    window.setTimeout(function () { if (video.readyState >= 2) finishLoader(); }, 8000);

    document.addEventListener('visibilitychange', function () {
        if (document.hidden) stop(); else start();
    });
    start();

    /* ---------------- rank rail ---------------- */
    function scrollToZone(zoneId) {
        var z = ZONES.filter(function (x) { return x.id === zoneId; })[0];
        if (!z) return;
        if (!arrived) return; // the entry ride cannot be interrupted
        var m = trackMetrics();
        animateScroll(m.top + (z.from + 0.02) * m.scrollable, NAV_SCROLL_MS, easeInOutCubic, function () { hud.textContent = '( scroll — you are the camera )'; });
    }
    rail.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('[data-kd-zone]') : null;
        if (b) scrollToZone(b.getAttribute('data-kd-zone'));
    });

    try {
        var vis = new IntersectionObserver(function (es) {
            es.forEach(function (e) {
                rail.classList.toggle('is-on', e.isIntersecting && loaderDone);
                depth.classList.toggle('is-on', e.isIntersecting && loaderDone);
            });
        }, { threshold: 0.02 });
        vis.observe(track);
    } catch (e) {}

    window.KingdomWorld = {
        scrollToZone: scrollToZone,
        openProfile: openProfile,
        startCinematic: startCinematic,
        ZONES: ZONES
    };
})();
