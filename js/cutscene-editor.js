/* ====================================================================
   RiseForIt — CUTSCENE EDITOR (owner tool, lazy-loaded)
   --------------------------------------------------------------------
   CapCut-style, but NON-DESTRUCTIVE: nothing re-encodes. Edits are an
   overlay the player applies at runtime and save to the server via the
   callbacks handed in from js/cutscenes.js.

   Meta shape saved per video:
     segments: [{from,to,speed}]      play order; speed 0.25..2 per clip
     texts:    [{id,text,start,end,x,y,style,fadeIn,fadeOut,behindMask}]
     audio:    [{file,at,volume}]
     trackers: [{id,label,points:[{t,x,y}]}]
     masks:    [{id,label,t,points:[{x,y}]}]   lasso outlines
     position: {desktop:{x,y,scaleX,scaleY}, mobile:{...}}  crop+zoom per mode

   COORDINATES: text/tracker/lasso x,y are % of the VIDEO SOURCE frame —
   one cutout or text position works in BOTH the desktop and mobile crop.

   Controls:
     Space play/pause · Ctrl+B split · Ctrl+C/V copy/paste · Delete clip
     Ctrl+Z undo · Ctrl+Shift+Z / Ctrl+Y redo · Esc close/cancel tool
     Drag video = reposition crop (per view mode); corner handles resize
     freeform (Ctrl = keep aspect), edge handles always keep aspect.
     Main lane: drag scrubs, hover shows a live preview thumbnail.
     Text lane: drag block = retime, drag block edges = duration,
     click block = style popup.
   ==================================================================== */
(function () {
    'use strict';

    var SHARED = window.RiseCutscenes || {};
    var TEXT_STYLES = SHARED.TEXT_STYLES || { plain: { label: 'Plain White', css: 'color:#fff;font-weight:800;' } };
    var recommendStylesFor = SHARED.recommendStylesFor || function () { return ['plain']; };
    var paintedRect = SHARED.paintedRect || function (fw, fh) { return { left: 0, top: 0, width: fw, height: fh }; };

    var STYLE = [
        '.rfe{position:fixed;inset:0;z-index:6500;background:#0c0a08;display:flex;flex-direction:column;font-family:"Space Grotesk",system-ui,sans-serif;color:#f2ece2;}',
        '.rfe-top{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 16px;background:#161210;border-bottom:1px solid rgba(255,255,255,0.08);flex-wrap:wrap;}',
        '.rfe-top strong{font-size:14px;}',
        '.rfe-tools{display:flex;gap:6px;flex-wrap:wrap;}',
        '.rfe-btn{border:1px solid rgba(255,255,255,0.18);border-radius:999px;background:rgba(255,255,255,0.06);color:#f2ece2;font:700 12px/1 "Space Grotesk",system-ui,sans-serif;padding:9px 14px;cursor:pointer;white-space:nowrap;}',
        '.rfe-btn:hover{background:rgba(255,255,255,0.14);}',
        '.rfe-btn.is-primary{background:#d9a15c;border-color:#d9a15c;color:#161005;}',
        '.rfe-btn.is-on{background:#d9a15c;border-color:#d9a15c;color:#161005;}',
        '.rfe-btn.is-live{background:#c0392b;border-color:#c0392b;color:#fff;animation:rfePulse 1s ease-in-out infinite;}',
        '@keyframes rfePulse{50%{opacity:.65;}}',
        '.rfe-stage{position:relative;flex:1;min-height:0;display:grid;place-items:center;background:#000;touch-action:none;overflow:hidden;}',
        '.rfe-frame{position:relative;height:96%;aspect-ratio:16/9;max-width:96%;overflow:hidden;border-radius:6px;box-shadow:0 0 0 1px rgba(255,255,255,0.12);}',
        '.rfe-frame.is-mobile{aspect-ratio:9/16;}',
        '.rfe-frame video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:50% 50%;cursor:move;}',
        '.rfe-layer{position:absolute;inset:0;pointer-events:none;z-index:5;}',
        '.rfe-textwrap{position:absolute;inset:0;pointer-events:none;}',
        '.rfe-handle{position:absolute;width:20px;height:20px;border-radius:5px;background:#d9a15c;border:2px solid #161005;z-index:6;touch-action:none;box-shadow:0 2px 8px rgba(0,0,0,0.5);}',
        '.rfe-handle[data-h=nw]{left:4px;top:4px;cursor:nwse-resize;}',
        '.rfe-handle[data-h=n]{left:calc(50% - 10px);top:4px;cursor:ns-resize;}',
        '.rfe-handle[data-h=ne]{right:4px;top:4px;cursor:nesw-resize;}',
        '.rfe-handle[data-h=e]{right:4px;top:calc(50% - 10px);cursor:ew-resize;}',
        '.rfe-handle[data-h=se]{right:4px;bottom:4px;cursor:nwse-resize;}',
        '.rfe-handle[data-h=s]{left:calc(50% - 10px);bottom:4px;cursor:ns-resize;}',
        '.rfe-handle[data-h=sw]{left:4px;bottom:4px;cursor:nesw-resize;}',
        '.rfe-handle[data-h=w]{left:4px;top:calc(50% - 10px);cursor:ew-resize;}',
        '.rfe-site{position:absolute;inset:0;pointer-events:none;z-index:3;display:none;font-family:"Space Grotesk",system-ui,sans-serif;}',
        '.rfe-site-veil{position:absolute;inset:0;background:rgba(250,247,243,0.07);}',
        '.rfe-site-nav{position:absolute;left:0;right:0;top:0;height:8%;min-height:26px;background:rgba(250,247,243,0.97);display:flex;align-items:center;justify-content:space-between;padding:0 3%;color:#1b120c;font-weight:800;font-size:clamp(8px,1.2vw,14px);box-shadow:0 1px 6px rgba(0,0,0,0.15);}',
        '.rfe-site-nav b i{color:#e7a34d;font-style:normal;}',
        '.rfe-site-nav span{font-weight:700;opacity:.85;font-size:.85em;}',
        '.rfe-site-panel{position:absolute;left:0;top:8%;bottom:0;width:21%;background:rgba(18,14,11,0.95);padding:2% 1.2%;display:flex;flex-direction:column;gap:2.5%;overflow:hidden;}',
        '.rfe-site-panel u{text-decoration:none;color:rgba(242,236,226,0.4);font-size:clamp(5px,0.62vw,9px);font-weight:800;letter-spacing:.14em;margin-top:2%;}',
        '.rfe-site-panel i{font-style:normal;display:block;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:rgba(242,236,226,0.9);font-size:clamp(6px,0.8vw,11px);font-weight:700;padding:4.5% 7%;}',
        '.rfe-site-panel i.is-active{border-color:rgba(217,161,92,0.8);background:rgba(217,161,92,0.14);}',
        '.rfe-site-dock{position:absolute;left:0;right:0;bottom:0;height:7%;min-height:22px;background:rgba(250,247,243,0.97);display:flex;align-items:center;justify-content:space-around;box-shadow:0 -1px 6px rgba(0,0,0,0.15);}',
        '.rfe-site-dock span{width:6%;aspect-ratio:1;max-height:60%;border-radius:22%;background:rgba(27,18,12,0.45);}',
        '.rfe-site-dock span.is-active{background:#c37b25;}',
        '.rfe-site-fab{position:absolute;left:3.5%;bottom:9%;width:17%;aspect-ratio:1;border-radius:999px;background:#111;color:#fff;display:grid;place-items:center;text-align:center;font-weight:800;font-size:clamp(5px,1.6vw,10px);line-height:1.25;box-shadow:0 6px 18px rgba(0,0,0,0.4);}',
        '.rfe-site-radar{position:absolute;left:3.5%;bottom:24%;width:36%;background:rgba(255,255,255,0.92);border-radius:10px;padding:2.5%;box-shadow:0 6px 24px rgba(0,0,0,0.2);text-align:center;}',
        '.rfe-site-radar.is-desktop{left:23%;bottom:4%;width:17%;}',
        '.rfe-site-radar svg{width:100%;height:auto;display:block;}',
        '.rfe-site-radar em{display:block;font-style:normal;font-weight:800;font-size:clamp(6px,0.9vw,11px);color:#1b120c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
        '.rfe-lasso-svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:4;}',
        '.rfe-lasso-svg path{fill:rgba(217,161,92,0.18);stroke:#d9a15c;stroke-width:2;stroke-dasharray:6 4;}',
        '.rfe-text{position:absolute;transform:translate(-50%,-50%);color:#fff;font:800 clamp(16px,3vw,30px)/1.25 "Space Grotesk",system-ui,sans-serif;text-shadow:0 2px 14px rgba(0,0,0,0.7);cursor:grab;user-select:none;padding:4px 8px;border:1px dashed transparent;text-align:center;max-width:80%;pointer-events:auto;}',
        '.rfe-text.is-active{border-color:rgba(217,161,92,0.8);}',
        '.rfe-dot{position:absolute;width:22px;height:22px;border-radius:999px;border:3px solid #d9a15c;background:rgba(217,161,92,0.35);transform:translate(-50%,-50%);pointer-events:none;box-shadow:0 0 14px rgba(217,161,92,0.8);display:none;z-index:4;}',
        '.rfe-dot.is-rec{border-color:#c0392b;box-shadow:0 0 16px rgba(192,57,43,0.9);}',
        '.rfe-hint{position:absolute;left:50%;top:14px;transform:translateX(-50%);background:rgba(0,0,0,0.72);border:1px solid rgba(255,255,255,0.2);border-radius:999px;padding:8px 16px;font-size:12.5px;display:none;z-index:5;text-align:center;}',
        '.rfe-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:8;width:54px;height:54px;border-radius:999px;border:1px solid rgba(255,255,255,0.3);background:rgba(0,0,0,0.55);color:#fff;font-size:32px;line-height:1;cursor:pointer;backdrop-filter:blur(4px);display:grid;place-items:center;padding:0 0 5px;transition:background .15s ease,border-color .15s ease;}',
        '.rfe-nav:hover{background:rgba(217,161,92,0.4);border-color:#d9a15c;}',
        '.rfe-nav-prev{left:16px;}',
        '.rfe-nav-next{right:16px;}',
        '.rfe-nav small{position:absolute;top:calc(100% + 6px);left:50%;transform:translateX(-50%);font-size:10.5px;line-height:1.2;color:rgba(242,236,226,0.85);background:rgba(0,0,0,0.72);border-radius:8px;padding:4px 9px;white-space:nowrap;opacity:0;pointer-events:none;transition:opacity .15s ease;}',
        '.rfe-nav:hover small{opacity:1;}',
        '.rfe-marker{position:absolute;transform:translate(-50%,-50%);pointer-events:none;font-size:10px;font-weight:800;color:#fff;background:rgba(51,36,26,0.85);border:2px solid #d9a15c;border-radius:999px;padding:3px 8px;white-space:nowrap;}',
        '.rfe-cbox{position:absolute;transform:translate(-50%,-50%);pointer-events:auto;cursor:grab;z-index:5;display:none;touch-action:none;}',
        '.rfe-cbox img{display:block;width:100%;height:auto;-webkit-user-drag:none;user-select:none;pointer-events:none;}',
        '.rfe-cbox-tint{position:absolute;inset:0;pointer-events:none;-webkit-mask-size:100% 100%;mask-size:100% 100%;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;}',
        '.rfe-cbox.is-default{background:#f6eed3;border:3px solid #1a1410;border-radius:5px;box-shadow:3px 3px 0 rgba(10,8,6,0.5);}',
        '.rfe-cbox-tail{position:absolute;width:11px;height:11px;background:#f6eed3;border:3px solid #1a1410;transform:rotate(45deg);display:none;pointer-events:none;}',
        '.rfe-cbox.is-default.has-text .rfe-cbox-tail{display:block;}',
        '.rfe-cbox[data-tail=bottom] .rfe-cbox-tail{bottom:-7px;left:50%;margin-left:-6px;border-top:0;border-left:0;}',
        '.rfe-cbox[data-tail=top] .rfe-cbox-tail{top:-7px;left:50%;margin-left:-6px;border-bottom:0;border-right:0;}',
        '.rfe-cbox[data-tail=left] .rfe-cbox-tail{left:-7px;top:50%;margin-top:-6px;border-top:0;border-right:0;}',
        '.rfe-cbox[data-tail=right] .rfe-cbox-tail{right:-7px;top:50%;margin-top:-6px;border-bottom:0;border-left:0;}',
        '.rfe-cbox.is-selected{outline:2px dashed #d9a15c;outline-offset:3px;}',
        '.rfe-cbox-size{position:absolute;right:-9px;bottom:-9px;width:18px;height:18px;border-radius:5px;background:#d9a15c;border:2px solid #161005;cursor:nwse-resize;touch-action:none;display:none;box-shadow:0 2px 8px rgba(0,0,0,0.5);}',
        '.rfe-cbox.is-selected .rfe-cbox-size{display:block;}',
        '.rfe-cpanel{position:fixed;right:16px;top:64px;z-index:7100;width:280px;min-width:240px;min-height:220px;background:#221b15;border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:12px 14px 14px;display:none;gap:9px;max-height:calc(100vh - 80px);overflow:auto;resize:both;box-shadow:0 18px 50px rgba(0,0,0,0.6);}',
        '.rfe-cpanel.is-open{display:grid;align-content:start;}',
        '.rfe-cpanel.is-dropping{outline:2px dashed #d9a15c;outline-offset:-4px;}',
        '.rfe-cpanel h4{margin:0 0 2px;font-size:13px;display:flex;justify-content:space-between;align-items:center;cursor:move;user-select:none;padding:2px 0;}',
        '.rfe-cpanel h4 button{border:1px solid rgba(255,255,255,0.25);border-radius:999px;background:rgba(255,255,255,0.08);color:#f2ece2;font-size:14px;line-height:1;cursor:pointer;padding:5px 9px;}',
        '.rfe-cpanel h4 button:hover{background:rgba(255,255,255,0.18);}',
        '.rfe-cpanel select option{background:#221b15;color:#f2ece2;}',
        '.rfe-cpanel label{display:grid;gap:4px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:rgba(242,236,226,0.55);font-weight:800;}',
        '.rfe-cpanel select,.rfe-cpanel input[type=number]{border:1px solid rgba(255,255,255,0.18);border-radius:8px;background:rgba(255,255,255,0.06);color:#f2ece2;font:700 12px "Space Grotesk",system-ui,sans-serif;padding:7px 9px;}',
        '.rfe-cpanel textarea{border:1px solid rgba(255,255,255,0.18);border-radius:8px;background:rgba(255,255,255,0.06);color:#f2ece2;font:600 12px/1.5 "Space Grotesk",system-ui,sans-serif;padding:7px 9px;resize:vertical;min-height:64px;}',
        '.rfe-cbox-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;font-family:"Press Start 2P","Space Grotesk",monospace;font-weight:400;color:#1a1208;padding:8px 10px;line-height:1.7;pointer-events:none;word-break:break-word;}',
        '.rfe-cbox.is-default.has-text{height:auto !important;display:flex;}',
        '.rfe-cbox.is-default.has-text .rfe-cbox-text{position:static;}',
        '.rfe-cpanel input[type=range]{width:100%;accent-color:#d9a15c;}',
        '.rfe-cpanel input[type=color]{width:100%;height:32px;border:1px solid rgba(255,255,255,0.18);border-radius:8px;background:rgba(255,255,255,0.06);padding:2px;}',
        '.rfe-cpanel .rfe-cp-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
        '.rfe-cpanel .rfe-cp-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;font-weight:700;color:#f2ece2;}',
        '.rfe-cpanel .rfe-cp-del{border:1px solid rgba(255,120,90,0.5);border-radius:999px;background:none;color:#ff9d7d;font:700 11.5px "Space Grotesk",system-ui,sans-serif;padding:8px;cursor:pointer;}',
        '.rfe-cpanel .rfe-cp-note{font-size:10.5px;color:rgba(242,236,226,0.5);line-height:1.45;}',
        '.rfe-divider{flex:0 0 auto;height:16px;background:#161210;border-top:1px solid rgba(255,255,255,0.08);display:grid;place-items:center;cursor:ns-resize;touch-action:none;user-select:none;}',
        '.rfe-divider i{width:64px;height:5px;border-radius:999px;background:rgba(255,255,255,0.28);pointer-events:none;transition:background .15s ease;}',
        '.rfe-divider:hover i,.rfe-divider.is-dragging i{background:#d9a15c;}',
        '.rfe-bottom{background:#161210;padding:6px 16px 14px;display:grid;gap:8px;max-height:46vh;overflow:auto;flex:0 0 auto;}',
        '.rfe-transport{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
        '.rfe-time{font-size:12px;color:rgba(242,236,226,0.7);min-width:96px;}',
        '.rfe-lanes{position:relative;display:grid;gap:4px;}',
        '.rfe-lane-label{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:rgba(242,236,226,0.45);margin:0;}',
        '.rfe-lane{position:relative;border-radius:9px;background:rgba(255,255,255,0.05);}',
        '.rfe-lane-text{min-height:30px;transition:height .15s ease;}',
        '.rfe-lane-main{height:46px;display:flex;gap:2px;padding:4px;cursor:pointer;}',
        '.rfe-textblock{position:absolute;height:24px;border-radius:7px;background:linear-gradient(180deg,#3f6f9e,#2c4f73);border:2px solid transparent;color:#fff;font:700 10px/20px "Space Grotesk",system-ui,sans-serif;padding:0 10px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;cursor:grab;min-width:26px;touch-action:none;}',
        '.rfe-textblock.is-selected{border-color:#8fc1ee;}',
        '.rfe-textblock::before,.rfe-textblock::after{content:"";position:absolute;top:0;bottom:0;width:8px;cursor:ew-resize;}',
        '.rfe-textblock::before{left:0;border-left:3px solid rgba(255,255,255,0.55);border-radius:7px 0 0 7px;}',
        '.rfe-textblock::after{right:0;border-right:3px solid rgba(255,255,255,0.55);border-radius:0 7px 7px 0;}',
        '.rfe-seg{position:relative;height:100%;border-radius:7px;background:linear-gradient(180deg,#7a5326,#5b3d1c);border:2px solid transparent;min-width:8px;display:flex;align-items:center;justify-content:center;gap:6px;color:#fff;font:700 10px/1 "Space Grotesk",system-ui,sans-serif;overflow:hidden;}',
        '.rfe-seg.is-selected{border-color:#d9a15c;background:linear-gradient(180deg,#d9a15c,#b9782d);color:#161005;}',
        '.rfe-seg.is-dragging{opacity:0.75;z-index:6;box-shadow:0 6px 18px rgba(0,0,0,0.55);cursor:grabbing;}',
        '.rfe-seg{cursor:grab;}',
        '.rfe-seg small{font-weight:800;background:rgba(0,0,0,0.35);border-radius:999px;padding:2px 6px;color:#ffd9a1;}',
        '.rfe-seg.is-selected small{background:rgba(0,0,0,0.25);color:#fff;}',
        '.rfe-playhead{position:absolute;top:-4px;bottom:-4px;width:2px;background:#fff;pointer-events:auto;cursor:ew-resize;box-shadow:0 0 8px rgba(255,255,255,0.7);z-index:3;}',
        '.rfe-playhead::before{content:"";position:absolute;top:-8px;left:50%;transform:translateX(-50%);width:16px;height:16px;border-radius:999px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.6);}',
        '.rfe-playhead::after{content:"";position:absolute;inset:-8px -7px;}',
        '.rfe-peek{position:fixed;z-index:7000;width:180px;border-radius:10px;overflow:hidden;box-shadow:0 10px 30px rgba(0,0,0,0.7);border:1px solid rgba(255,255,255,0.25);display:none;pointer-events:none;background:#000;}',
        '.rfe-peek video{display:block;width:100%;height:auto;}',
        '.rfe-peek span{position:absolute;left:6px;bottom:4px;font:800 11px/1 "Space Grotesk",system-ui,sans-serif;color:#fff;text-shadow:0 1px 4px #000;}',
        '.rfe-speed{position:absolute;right:16px;bottom:calc(46vh + 10px);z-index:6;background:#221b15;border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:14px;display:none;gap:8px;width:250px;}',
        '.rfe-speed.is-open{display:grid;}',
        '.rfe-speed strong{font-size:12px;}',
        '.rfe-speed input[type=range]{width:100%;accent-color:#d9a15c;}',
        '.rfe-speed-presets{display:flex;gap:6px;flex-wrap:wrap;}',
        '.rfe-style{position:fixed;right:20px;top:70px;z-index:7100;width:300px;min-width:240px;min-height:200px;background:#1d1712;border:1px solid rgba(255,255,255,0.16);border-radius:14px;box-shadow:0 24px 60px rgba(0,0,0,0.7);display:none;flex-direction:column;resize:both;overflow:auto;}',
        '.rfe-style.is-open{display:flex;}',
        '.rfe-style-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#241c15;cursor:move;border-radius:14px 14px 0 0;font-size:12.5px;font-weight:800;}',
        '.rfe-style-head button{border:0;background:transparent;color:rgba(242,236,226,0.7);font-size:17px;cursor:pointer;}',
        '.rfe-style-body{padding:12px;display:grid;gap:9px;font-size:12px;}',
        '.rfe-style-body label{display:grid;gap:3px;color:rgba(242,236,226,0.6);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;}',
        '.rfe-style-body input,.rfe-style-body select{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:7px;color:#f2ece2;padding:7px 9px;font-size:12.5px;font-family:inherit;}',
        '.rfe-style-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px;}',
        '.rfe-style h6{margin:4px 0 0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#d9a15c;}',
        '.rfe-style-presets{display:flex;flex-wrap:wrap;gap:6px;}',
        '.rfe-style-chip{border:1px solid rgba(255,255,255,0.2);border-radius:999px;background:rgba(255,255,255,0.05);padding:7px 11px;font-size:11px;cursor:pointer;color:#fff;}',
        '.rfe-style-chip.is-active{border-color:#d9a15c;background:rgba(217,161,92,0.2);}',
        '.rfe-style-del{margin-top:4px;border:1px solid rgba(255,120,100,0.5);background:transparent;color:#ff8f7d;border-radius:999px;padding:8px;font:800 11px/1 "Space Grotesk",system-ui,sans-serif;cursor:pointer;}',
        '.rfe-rows h5{margin:6px 0 4px;font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;color:#d9a15c;}',
        '.rfe-row{display:flex;align-items:center;gap:8px;font-size:12px;padding:6px 10px;border-radius:9px;background:rgba(255,255,255,0.05);margin-bottom:4px;flex-wrap:wrap;}',
        '.rfe-row input[type=number]{width:64px;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.15);border-radius:6px;color:#f2ece2;padding:4px 6px;font-size:12px;}',
        '.rfe-row .rfe-x{margin-left:auto;border:0;background:transparent;color:rgba(242,236,226,0.6);cursor:pointer;font-size:15px;}',
        '.rfe-row .rfe-x:hover{color:#ff8f7d;}',
        '.rfe-status{font-size:12px;color:#8fd19a;min-height:16px;}'
    ].join('');

    function ensureStyles() {
        if (!document.getElementById('rf-pixel-font')) {
            var pfont = document.createElement('link');
            pfont.id = 'rf-pixel-font';
            pfont.rel = 'stylesheet';
            pfont.href = 'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap';
            document.head.appendChild(pfont);
        }
        if (document.getElementById('rfe-styles')) return;
        var el = document.createElement('style');
        el.id = 'rfe-styles';
        el.textContent = STYLE;
        document.head.appendChild(el);
    }

    var fmt = function (t) {
        t = Math.max(0, Number(t) || 0);
        var m = Math.floor(t / 60);
        var s = (t % 60).toFixed(1);
        return m + ':' + (Number(s) < 10 ? '0' : '') + s;
    };
    var uid = function () { return Math.random().toString(36).slice(2, 9); };
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

    function open(scene, api) {
        ensureStyles();
        if (document.querySelector('.rfe')) return;

        var state = {
            segments: [], texts: [], audio: [], trackers: [], masks: [], comments: [],
            position: { desktop: { tx: 0, ty: 0, scaleX: 1, scaleY: 1 }, mobile: { tx: 0, ty: 0, scaleX: 1, scaleY: 1 } }
        };
        var duration = 0;
        var selectedSeg = -1;
        var selectedText = '';
        var lastSel = '';        // 'seg' | 'text' — what Delete acts on
        var clipboard = null;
        var viewMode = 'desktop';
        var siteMock = scene.kind === 'Background';
        var editorZoom = 1;      // view zoom (scroll wheel), NOT the crop
        var tracker = { mode: 'off', points: [], raf: 0, lastX: 50, lastY: 50 };
        var lasso = { on: false, points: [], lastClickAt: 0 };
        var reposition = null;
        var resizing = null;

        var root = document.createElement('div');
        root.className = 'rfe';
        root.innerHTML =
            '<div class="rfe-top">' +
            '  <strong>Edit — ' + scene.label + '</strong>' +
            '  <div class="rfe-tools">' +
            '    <button class="rfe-btn" data-a="viewmode">📱 Mobile view</button>' +
            '    <button class="rfe-btn" data-a="sitemock">🖼 Site overlay</button>' +
            '    <button class="rfe-btn" data-a="autopos">🎯 Auto position</button>' +
            '    <button class="rfe-btn" data-a="split">Split (Ctrl+B)</button>' +
            '    <button class="rfe-btn" data-a="copy">Copy</button>' +
            '    <button class="rfe-btn" data-a="paste">Paste</button>' +
            '    <button class="rfe-btn" data-a="delseg">Remove part</button>' +
            '    <button class="rfe-btn" data-a="speed">Speed</button>' +
            '    <button class="rfe-btn" data-a="text">+ Text</button>' +
            '    <button class="rfe-btn" data-a="audio">+ Music / SFX</button>' +
            '    <button class="rfe-btn" data-a="tracker">Tracker node</button>' +
            '    <button class="rfe-btn" data-a="comment">+ Comment box</button>' +
            '    <button class="rfe-btn" data-a="lasso">Lasso cutout</button>' +
            '    <button class="rfe-btn is-primary" data-a="save">Save</button>' +
            '    <button class="rfe-btn" data-a="close">Close</button>' +
            '  </div>' +
            '</div>' +
            '<div class="rfe-stage">' +
            '  <div class="rfe-frame">' +
            '    <video src="' + api.videoBase + scene.file + '" playsinline preload="auto"></video>' +
            '    <div class="rfe-site"></div>' +
            '    <svg class="rfe-lasso-svg"></svg>' +
            '    <div class="rfe-layer"></div>' +
            ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map(function (h) { return '<div class="rfe-handle" data-h="' + h + '"></div>'; }).join('') +
            '  </div>' +
            '  <div class="rfe-dot"></div>' +
            '  <div class="rfe-hint"></div>' +
            '</div>' +
            '<div class="rfe-speed" data-speed-pop>' +
            '  <strong>Clip speed: <span data-speed-val>1.00x</span></strong>' +
            '  <input type="range" min="0.25" max="2" step="0.05" value="1" data-speed-range>' +
            '  <div class="rfe-speed-presets">' +
            '    <button class="rfe-btn" data-speed-set="0.25">0.25x</button>' +
            '    <button class="rfe-btn" data-speed-set="0.5">0.5x</button>' +
            '    <button class="rfe-btn" data-speed-set="1">1x</button>' +
            '    <button class="rfe-btn" data-speed-set="1.5">1.5x</button>' +
            '    <button class="rfe-btn" data-speed-set="2">2x</button>' +
            '  </div>' +
            '  <span style="font-size:11px;color:rgba(242,236,226,0.55)">Applies to the selected clip (or the only clip).</span>' +
            '</div>' +
            '<div class="rfe-style" data-style-pop>' +
            '  <div class="rfe-style-head" data-style-drag><span>Text style</span><button type="button" data-style-close>&times;</button></div>' +
            '  <div class="rfe-style-body">' +
            '    <label>Text<input type="text" data-st="text"></label>' +
            '    <div class="rfe-style-grid2">' +
            '      <label>From (s)<input type="number" step="0.1" min="0" data-st="start"></label>' +
            '      <label>To (s)<input type="number" step="0.1" min="0" data-st="end"></label>' +
            '      <label>Fade in (s)<input type="number" step="0.1" min="0" max="5" data-st="fadeIn"></label>' +
            '      <label>Fade out (s)<input type="number" step="0.1" min="0" max="5" data-st="fadeOut"></label>' +
            '      <label>Size (x)<input type="number" step="0.1" min="0.3" max="4" data-st="size"></label>' +
            '    </div>' +
            '    <label>Behind cutout<select data-st="behindMask"><option value="">None (in front)</option></select></label>' +
            '    <h6>Recommended for this scene</h6>' +
            '    <div class="rfe-style-presets" data-style-reco></div>' +
            '    <h6>All styles</h6>' +
            '    <div class="rfe-style-presets" data-style-all></div>' +
            '    <button class="rfe-style-del" data-style-delete>Delete this text</button>' +
            '  </div>' +
            '</div>' +
            '<div class="rfe-cpanel" data-cpanel>' +
            '  <h4>Comment box <button type="button" data-cp-close aria-label="Close">&times;</button></h4>' +
            '  <label>Attached to tracker<select data-cp="trackerId"></select></label>' +
            '  <label>Lines — one per row; a random one shows each loop<textarea data-cp="lines" rows="4" placeholder="Barely any cardio. Barely trying.\nEww. Are those... excuses?"></textarea></label>' +
            '  <label>Speak chance per loop <span data-cp-chance-val style="text-transform:none;letter-spacing:0;color:#d9a15c"></span><input type="range" min="0" max="1" step="0.05" data-cp="chance"></label>' +
            '  <button class="rfe-btn" data-cp-png>Import PNG…</button>' +
            '  <label>Width (% of frame) <input type="range" min="4" max="70" step="0.5" data-cp="w"></label>' +
            '  <label>Tint color<input type="color" data-cp="tint"></label>' +
            '  <label>Tint strength <input type="range" min="0" max="1" step="0.05" data-cp="tintAmt"></label>' +
            '  <label>Opacity <input type="range" min="0.1" max="1" step="0.05" data-cp="opacity"></label>' +
            '  <div class="rfe-cp-row"><span>Flip horizontally</span><input type="checkbox" data-cp="flip"></div>' +
            '  <div class="rfe-cp-grid2">' +
            '    <label>From (s)<input type="number" step="0.1" min="0" data-cp="start"></label>' +
            '    <label>To (s)<input type="number" step="0.1" min="0" data-cp="end"></label>' +
            '  </div>' +
            '  <button class="rfe-btn" data-cp-styleall>Match all boxes to this style</button>' +
            '  <span class="rfe-cp-note">Drag the box on the video to set where it sits relative to its tracker node — it follows the node as it moves. Hit Save (top bar) to publish.</span>' +
            '  <button class="rfe-cp-del" data-cp-delete>Delete this comment box</button>' +
            '</div>' +
            '<div class="rfe-peek"><video muted playsinline preload="auto" src="' + api.videoBase + scene.file + '"></video><span></span></div>' +
            '<div class="rfe-divider" data-divider title="Drag to resize the timeline / history section"><i></i></div>' +
            '<div class="rfe-bottom">' +
            '  <div class="rfe-transport">' +
            '    <button class="rfe-btn" data-a="playpause">Play</button>' +
            '    <span class="rfe-time">0:00.0 / 0:00.0</span>' +
            '    <span class="rfe-status"></span>' +
            '  </div>' +
            '  <div class="rfe-lanes">' +
            '    <p class="rfe-lane-label">Text</p>' +
            '    <div class="rfe-lane rfe-lane-text"></div>' +
            '    <p class="rfe-lane-label">Main</p>' +
            '    <div class="rfe-lane rfe-lane-main"><div class="rfe-playhead" style="left:4px"></div></div>' +
            '  </div>' +
            '  <div class="rfe-rows"></div>' +
            '</div>';
        document.body.appendChild(root);

        var video = root.querySelector('.rfe-frame video');
        var stage = root.querySelector('.rfe-stage');

        // Draggable divider: pull up/down to trade space between the video
        // stage and the timeline/history section. Remembered across opens.
        (function () {
            var divider = root.querySelector('[data-divider]');
            var bottom = root.querySelector('.rfe-bottom');
            var applyH = function (h) {
                h = Math.max(70, Math.min(Math.round(window.innerHeight * 0.8), Math.round(h)));
                bottom.style.maxHeight = h + 'px';
                bottom.style.height = h + 'px';
                return h;
            };
            var savedH = 0;
            try { savedH = Number(localStorage.getItem('rfeBottomH')) || 0; } catch (e) {}
            if (savedH) applyH(savedH);
            divider.addEventListener('pointerdown', function (ev) {
                ev.preventDefault();
                divider.classList.add('is-dragging');
                divider.setPointerCapture(ev.pointerId);
                var startY = ev.clientY;
                var startH = bottom.getBoundingClientRect().height;
                var lastH = startH;
                var move = function (e2) { lastH = applyH(startH + (startY - e2.clientY)); };
                var up = function () {
                    divider.classList.remove('is-dragging');
                    divider.removeEventListener('pointermove', move);
                    divider.removeEventListener('pointerup', up);
                    try { localStorage.setItem('rfeBottomH', String(lastH)); } catch (e) {}
                };
                divider.addEventListener('pointermove', move);
                divider.addEventListener('pointerup', up);
            });
        })();

        // Mid-screen ‹ › arrows: hop straight to the previous / next scene
        // in the registry without going back through the manager.
        var neighbors = api.neighbors || {};
        ['prev', 'next'].forEach(function (dir) {
            var target = neighbors[dir];
            if (!target || !api.openScene) return;
            var b = document.createElement('button');
            b.type = 'button';
            b.className = 'rfe-nav rfe-nav-' + dir;
            b.innerHTML = (dir === 'prev' ? '&#8249;' : '&#8250;')
                + '<small>' + (dir === 'prev' ? '&#8249; ' : '') + target.label + (dir === 'next' ? ' &#8250;' : '') + '</small>';
            b.addEventListener('click', function () {
                destroy();
                api.openScene(target);
            });
            stage.appendChild(b);
        });
        var frame = root.querySelector('.rfe-frame');
        var layer = root.querySelector('.rfe-layer');
        var lassoSvg = root.querySelector('.rfe-lasso-svg');
        var dot = root.querySelector('.rfe-dot');
        var hint = root.querySelector('.rfe-hint');
        var laneText = root.querySelector('.rfe-lane-text');
        var laneMain = root.querySelector('.rfe-lane-main');
        var playhead = root.querySelector('.rfe-playhead');
        var timeEl = root.querySelector('.rfe-time');
        var statusEl = root.querySelector('.rfe-status');
        var rowsEl = root.querySelector('.rfe-rows');
        var playBtn = root.querySelector('[data-a="playpause"]');
        var trackerBtn = root.querySelector('[data-a="tracker"]');
        var lassoBtn = root.querySelector('[data-a="lasso"]');
        var viewBtn = root.querySelector('[data-a="viewmode"]');
        var speedPop = root.querySelector('[data-speed-pop]');
        var speedRange = root.querySelector('[data-speed-range]');
        var speedVal = root.querySelector('[data-speed-val]');
        var stylePop = root.querySelector('[data-style-pop]');
        var peek = root.querySelector('.rfe-peek');
        var peekVideo = peek.querySelector('video');
        var peekLabel = peek.querySelector('span');

        var setStatus = function (text, bad) {
            statusEl.textContent = text || '';
            statusEl.style.color = bad ? '#ff8f7d' : '#8fd19a';
        };

        /* ---- undo / redo ---- */
        var history = [];
        var redoStack = [];
        var inputSnapshotArmed = false;
        var snapshot = function () { return JSON.stringify(state); };
        var pushHistory = function () {
            history.push(snapshot());
            if (history.length > 60) history.shift();
            redoStack.length = 0;
        };
        var restore = function (snap) {
            try {
                var data = JSON.parse(snap);
                ['segments', 'texts', 'audio', 'trackers', 'masks', 'comments'].forEach(function (k) { state[k] = data[k] || []; });
                state.position = data.position || state.position;
                selectedSeg = -1;
                closeStylePopup();
                remountTexts();
                remountMarkers();
                remountCboxes();
                applyPosition();
                renderLanes();
                renderRows();
                renderOverlays(video.currentTime);
            } catch (e) { /* ignore */ }
        };
        var undo = function () {
            if (!history.length) { setStatus('Nothing to undo.', true); return; }
            redoStack.push(snapshot());
            restore(history.pop());
            setStatus('Undone.');
        };
        var redo = function () {
            if (!redoStack.length) { setStatus('Nothing to redo.', true); return; }
            history.push(snapshot());
            restore(redoStack.pop());
            setStatus('Redone.');
        };
        var armInputSnapshot = function () {
            if (inputSnapshotArmed) return;
            pushHistory();
            inputSnapshotArmed = true;
            window.setTimeout(function () { inputSnapshotArmed = false; }, 900);
        };

        /* ---- auto-save: every edit persists itself after a short pause.
           Armed only once the saved meta has loaded, so an empty editor
           can't clobber a real save. The manual Save button still works. ---- */
        var savePayload = function () {
            return {
                segments: state.segments, texts: state.texts, audio: state.audio,
                trackers: state.trackers, masks: state.masks, comments: state.comments, position: state.position
            };
        };
        var lastSavedSnap = null;
        var autoSaveTimer = null;
        var autoSaving = false;
        var scheduleAutoSave = function () {
            if (lastSavedSnap === null) return;
            if (autoSaveTimer) window.clearTimeout(autoSaveTimer);
            autoSaveTimer = window.setTimeout(runAutoSave, 1400);
        };
        var runAutoSave = function () {
            autoSaveTimer = null;
            if (lastSavedSnap === null) return;
            if (autoSaving) { scheduleAutoSave(); return; }
            var snap = snapshot();
            if (snap === lastSavedSnap) return;
            autoSaving = true;
            setStatus('Auto-saving…');
            api.saveMeta(savePayload()).then(function (ok) {
                autoSaving = false;
                if (ok) {
                    lastSavedSnap = snap;
                    setStatus('Auto-saved — players use this immediately.');
                    if (snapshot() !== snap) scheduleAutoSave(); // edits landed mid-save
                } else {
                    setStatus('Auto-save failed — retrying.', true);
                    scheduleAutoSave();
                }
            }).catch(function () {
                autoSaving = false;
                setStatus('Auto-save failed — retrying.', true);
                scheduleAutoSave();
            });
        };
        // Nearly every mutation snapshots into history first — ride that.
        var pushHistoryBase = pushHistory;
        pushHistory = function () { pushHistoryBase(); scheduleAutoSave(); };
        // Safety net for changes that bypass history (drag tails, undo/redo).
        var autoSavePoll = window.setInterval(function () {
            if (lastSavedSnap !== null && !autoSaving && !autoSaveTimer && snapshot() !== lastSavedSnap) scheduleAutoSave();
        }, 4000);

        /* ---- geometry: client -> frame% -> SOURCE% ---- */
        function frameRect() { return frame.getBoundingClientRect(); }
        function clientToFramePct(clientX, clientY) {
            var r = frameRect();
            return { x: clamp(((clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((clientY - r.top) / r.height) * 100, 0, 100) };
        }
        function framePctToSource(fx, fy) {
            var r = frameRect();
            var p = paintedRect(r.width, r.height, video.videoWidth || 16, video.videoHeight || 9, state.position[viewMode]);
            return {
                x: clamp((((fx / 100) * r.width) - p.left) / p.width * 100, -50, 150),
                y: clamp((((fy / 100) * r.height) - p.top) / p.height * 100, -50, 150)
            };
        }
        function sourceToFramePx(sx, sy) {
            var r = frameRect();
            var p = paintedRect(r.width, r.height, video.videoWidth || 16, video.videoHeight || 9, state.position[viewMode]);
            return { left: p.left + (sx / 100) * p.width, top: p.top + (sy / 100) * p.height };
        }
        function clientToSource(clientX, clientY) {
            var f = clientToFramePct(clientX, clientY);
            return framePctToSource(f.x, f.y);
        }

        /* ---- view mode / crop / resize / site overlay / view zoom ---- */
        function applyPosition() {
            var pos = state.position[viewMode];
            if (SHARED.applyVideoPosition) {
                // Render the full cover-fit source rect so panning slides the
                // crop across the source (revealing off-screen content)
                // instead of cutting the frame — matches the player exactly.
                var r = frameRect();
                SHARED.applyVideoPosition(video, r.width || 16, r.height || 9, pos);
            } else {
                video.style.objectPosition = '50% 50%';
                video.style.transformOrigin = 'center center';
                video.style.transform = 'translate(' + (Number(pos.tx) || 0) + '%, ' + (Number(pos.ty) || 0) + '%) '
                    + 'scale(' + (Number(pos.scaleX) || 1) + ',' + (Number(pos.scaleY) || 1) + ')';
            }
            renderOverlays(video.currentTime);
        }
        function renderSiteMock() {
            // Mirrors the overview page SCROLLED TO THE TOP (showcase state):
            // near-clear veil, radar dock bottom-left, chrome that actually
            // sits over the video. The hero card is invisible up there, so
            // it is not shown.
            var site = frame.querySelector('.rfe-site');
            if (!siteMock) { site.innerHTML = ''; site.style.display = 'none'; return; }
            site.style.display = 'block';
            var radarCard = '<svg viewBox="0 0 44 40">' +
                '<polygon points="22,3 39,12 39,28 22,37 5,28 5,12" fill="none" stroke="rgba(140,110,70,.45)"></polygon>' +
                '<polygon points="22,9.4 33.2,15 33.2,25 22,30.6 10.8,25 10.8,15" fill="none" stroke="rgba(140,110,70,.35)"></polygon>' +
                '<polygon points="22,15.7 27.4,18.4 27.4,21.6 22,24.3 16.6,21.6 16.6,18.4" fill="rgba(197,141,79,.55)" stroke="#b9782d"></polygon>' +
                '</svg><em>⚒ Peasant · #30,089</em>';
            var panelRow = function (label, active) {
                return '<i class="' + (active ? 'is-active' : '') + '">' + label + '</i>';
            };
            site.innerHTML = viewMode === 'mobile'
                ? '<div class="rfe-site-veil"></div>' +
                  '<div class="rfe-site-nav"><b>Rise<i>F</i>orIt.</b><span>ODeology_</span></div>' +
                  '<div class="rfe-site-radar">' + radarCard + '</div>' +
                  '<div class="rfe-site-fab">CONTROL<br>PANEL</div>' +
                  '<div class="rfe-site-dock"><span></span><span></span><span class="is-active"></span><span></span><span></span></div>'
                : '<div class="rfe-site-veil"></div>' +
                  '<div class="rfe-site-nav"><b>Rise<i>F</i>orIt.</b><span>Home&nbsp;&nbsp;&nbsp;Macro Calculator&nbsp;&nbsp;&nbsp;Training&nbsp;&nbsp;&nbsp;Dashboard</span><span>ODeology_</span></div>' +
                  '<div class="rfe-site-panel">' +
                  '  <u>ACCOUNT</u>' + panelRow('Account') + panelRow('Quick tour') +
                  '  <u>DASH</u>' + panelRow('Dash') +
                  '  <u>TRAINING PORTAL</u>' + panelRow('Overview', true) + panelRow('Training Program') + panelRow('Grocery Calendar') + panelRow('Coaches page') +
                  '  <u>COMMUNITY</u>' + panelRow('Leaderboard') + panelRow('Messages') +
                  '</div>' +
                  '<div class="rfe-site-radar is-desktop">' + radarCard + '</div>';
        }
        function setSiteMock(on) {
            siteMock = on;
            root.querySelector('[data-a="sitemock"]').classList.toggle('is-on', on);
            renderSiteMock();
        }
        function setViewMode(mode) {
            viewMode = mode;
            frame.classList.toggle('is-mobile', mode === 'mobile');
            viewBtn.classList.toggle('is-on', mode === 'mobile');
            viewBtn.textContent = mode === 'mobile' ? '🖥 Desktop view' : '📱 Mobile view';
            setEditorZoom(1, null);
            applyPosition();
            renderSiteMock();
            // Desktop and mobile carry their own tracker nodes and comment
            // boxes — swap what's shown and drop any cross-view selection.
            if (typeof closeCPanel === 'function') closeCPanel();
            renderRows();
            renderOverlays(video.currentTime);
            setStatus(mode === 'mobile'
                ? 'Mobile (9:16) — this view has its OWN tracker nodes and comment boxes, separate from desktop.'
                : 'Desktop (16:9) — this view has its OWN tracker nodes and comment boxes, separate from mobile.');
        }
        // Free positioning: drag moves the video itself (translate), so it
        // always responds — no crop slack required.
        video.addEventListener('pointerdown', function (ev) {
            if (tracker.mode !== 'off' || lasso.on) return;
            ev.preventDefault();
            armInputSnapshot();
            var pos = state.position[viewMode];
            reposition = { startX: ev.clientX, startY: ev.clientY, baseX: Number(pos.tx) || 0, baseY: Number(pos.ty) || 0 };
            video.setPointerCapture(ev.pointerId);
        });
        video.addEventListener('pointermove', function (ev) {
            if (!reposition) return;
            var r = frameRect();
            var pos = state.position[viewMode];
            pos.tx = clamp(reposition.baseX + ((ev.clientX - reposition.startX) / r.width) * 100, -120, 120);
            pos.ty = clamp(reposition.baseY + ((ev.clientY - reposition.startY) / r.height) * 100, -120, 120);
            applyPosition();
        });
        video.addEventListener('pointerup', function () { reposition = null; });

        /* View zoom: scroll wheel over the stage zooms YOUR view (for
           precise lassos); over a text it resizes that text instead. */
        function setEditorZoom(z, originClient) {
            editorZoom = clamp(z, 1, 4);
            if (editorZoom <= 1.001) {
                frame.style.transform = '';
                frame.style.transformOrigin = '';
                editorZoom = 1;
                return;
            }
            if (originClient) {
                var r = frame.getBoundingClientRect();
                // Convert to the untransformed box so the origin sticks.
                var baseW = r.width / (frame.__lastZoom || 1);
                var baseH = r.height / (frame.__lastZoom || 1);
                frame.style.transformOrigin =
                    clamp((originClient.x - r.left) / r.width, 0, 1) * baseW + 'px ' +
                    clamp((originClient.y - r.top) / r.height, 0, 1) * baseH + 'px';
            }
            frame.style.transform = 'scale(' + editorZoom + ')';
            frame.__lastZoom = editorZoom;
        }
        stage.addEventListener('wheel', function (ev) {
            ev.preventDefault();
            var overText = ev.target.closest && ev.target.closest('.rfe-text');
            if (overText) {
                var id = overText.getAttribute('data-text');
                var txt = state.texts.filter(function (x) { return x.id === id; })[0];
                if (!txt) return;
                armInputSnapshot();
                txt.size = clamp((Number(txt.size) || 1) * (ev.deltaY < 0 ? 1.08 : 0.93), 0.3, 4);
                renderOverlays(video.currentTime);
                setStatus('Text size ' + txt.size.toFixed(2) + 'x (scroll over the text to resize).');
                return;
            }
            setEditorZoom(editorZoom * (ev.deltaY < 0 ? 1.15 : 0.87), { x: ev.clientX, y: ev.clientY });
            setStatus(editorZoom > 1 ? 'View zoom ' + editorZoom.toFixed(1) + 'x — scroll down to zoom out.' : '');
        }, { passive: false });

        root.querySelectorAll('.rfe-handle').forEach(function (handle) {
            handle.addEventListener('pointerdown', function (ev) {
                if (tracker.mode !== 'off' || lasso.on) return;
                ev.preventDefault();
                ev.stopPropagation();
                armInputSnapshot();
                var pos = state.position[viewMode];
                resizing = { h: handle.getAttribute('data-h'), startX: ev.clientX, startY: ev.clientY, baseX: Number(pos.scaleX) || 1, baseY: Number(pos.scaleY) || 1 };
                handle.setPointerCapture(ev.pointerId);
            });
            handle.addEventListener('pointermove', function (ev) {
                if (!resizing) return;
                var r = frameRect();
                var h = resizing.h;
                var dirX = h.indexOf('e') >= 0 ? 1 : h.indexOf('w') >= 0 ? -1 : 0;
                var dirY = h.indexOf('s') >= 0 ? 1 : h.indexOf('n') >= 0 ? -1 : 0;
                var fx = 1 + (dirX * (ev.clientX - resizing.startX) / r.width) * 2;
                var fy = 1 + (dirY * (ev.clientY - resizing.startY) / r.height) * 2;
                var pos = state.position[viewMode];
                var isCorner = dirX !== 0 && dirY !== 0;
                if (!isCorner || ev.ctrlKey || ev.metaKey) {
                    var f = isCorner ? Math.max(fx, fy) : (dirX !== 0 ? fx : fy);
                    pos.scaleX = clamp(resizing.baseX * f, 0.4, 3);
                    pos.scaleY = clamp(resizing.baseY * f, 0.4, 3);
                } else {
                    pos.scaleX = clamp(resizing.baseX * fx, 0.4, 3);
                    pos.scaleY = clamp(resizing.baseY * fy, 0.4, 3);
                }
                applyPosition();
                setStatus('Scale ' + pos.scaleX.toFixed(2) + 'x / ' + pos.scaleY.toFixed(2) + 'x (' + viewMode + ')' + (isCorner && !(ev.ctrlKey || ev.metaKey) ? ' — hold Ctrl to lock aspect' : ''));
            });
            handle.addEventListener('pointerup', function () { resizing = null; });
        });

        /* ---- auto position: detect the main character (motion + glow
           saliency) and center BOTH crops on them. Rough by design — drag
           to fine-tune afterwards; Save persists it for every player. ---- */
        function doAutoPosition() {
            if (!SHARED.analyzeFocus) { setStatus('Auto-detect unavailable.', true); return; }
            var wasPaused = video.paused;
            var wasMuted = video.muted;
            video.muted = true;
            if (wasPaused) video.play().catch(function () {});
            setStatus('Detecting the main character…');
            SHARED.analyzeFocus(video, function (focus) {
                if (wasPaused) video.pause();
                video.muted = wasMuted;
                if (!focus) { setStatus('Could not detect — position manually.', true); return; }
                armInputSnapshot();
                var vw = video.videoWidth || 16;
                var vh = video.videoHeight || 9;
                var d = SHARED.autoCenterPos(focus, 160, 90, vw, vh);
                var m = SHARED.autoCenterPos(focus, 90, 160, vw, vh);
                state.position.desktop.tx = d.tx;
                state.position.desktop.ty = d.ty;
                state.position.desktop.scaleX = d.scale || 1;
                state.position.desktop.scaleY = d.scale || 1;
                state.position.mobile.tx = m.tx;
                state.position.mobile.ty = m.ty;
                state.position.mobile.scaleX = m.scale || 1;
                state.position.mobile.scaleY = m.scale || 1;
                applyPosition();
                setStatus('Auto-positioned for desktop + mobile — drag to fine-tune, then Save.');
            });
        }

        /* ---- segments ---- */
        function totalPlayable() {
            return state.segments.reduce(function (sum, s) { return sum + Math.max(0, s.to - s.from); }, 0);
        }
        function srcToPlayedFrac(t) {
            var total = totalPlayable() || 1;
            var played = 0;
            for (var i = 0; i < state.segments.length; i++) {
                var seg = state.segments[i];
                if (t > seg.to) { played += seg.to - seg.from; continue; }
                if (t >= seg.from) played += t - seg.from;
                break;
            }
            return clamp(played / total, 0, 1);
        }
        function playedFracToSrc(frac) {
            var target = totalPlayable() * clamp(frac, 0, 1);
            var acc = 0;
            for (var i = 0; i < state.segments.length; i++) {
                var len = state.segments[i].to - state.segments[i].from;
                if (target <= acc + len) return state.segments[i].from + (target - acc);
                acc += len;
            }
            return state.segments.length ? state.segments[state.segments.length - 1].to : 0;
        }
        function segAtTime(t) {
            for (var i = 0; i < state.segments.length; i++) {
                if (t >= state.segments[i].from - 0.01 && t <= state.segments[i].to + 0.01) return i;
            }
            return -1;
        }
        // The playing clip is tracked by INDEX, not re-derived from time —
        // timeupdate only fires ~4x/sec, so playback overshoots cut points
        // and time-based lookup lands in a removed zone and restarts.
        var playSegIdx = 0;
        function syncPlayIdx(t) {
            var cur = segAtTime(t);
            if (cur >= 0) { playSegIdx = cur; return; }
            // Inside a removed part: queue the next kept part ahead of t.
            for (var i = 0; i < state.segments.length; i++) {
                if (state.segments[i].from >= t - 0.02) { playSegIdx = i; return; }
            }
            playSegIdx = 0;
        }
        function targetSegIndex() {
            if (selectedSeg >= 0) return selectedSeg;
            if (state.segments.length === 1) return 0;
            return -1;
        }
        function splitAtPlayhead() {
            var t = video.currentTime;
            var i = segAtTime(t);
            if (i < 0) { setStatus('Playhead is inside a removed part.', true); return; }
            var seg = state.segments[i];
            if (t - seg.from < 0.15 || seg.to - t < 0.15) { setStatus('Too close to a cut point.', true); return; }
            pushHistory();
            state.segments.splice(i, 1, { from: seg.from, to: t, speed: seg.speed || 1 }, { from: t, to: seg.to, speed: seg.speed || 1 });
            selectedSeg = i;
            renderLanes();
            setStatus('Split at ' + fmt(t) + '.');
        }
        function removeSelected() {
            if (selectedSeg < 0 || state.segments.length <= 1) { setStatus('Select a part first (one must remain).', true); return; }
            pushHistory();
            state.segments.splice(selectedSeg, 1);
            selectedSeg = -1;
            renderLanes();
            setStatus('Part removed — it will be skipped at playback.');
        }
        function deleteText(id) {
            var txt = state.texts.filter(function (x) { return x.id === id; })[0];
            if (!txt) return;
            pushHistory();
            state.texts = state.texts.filter(function (x) { return x.id !== id; });
            var wrap = layer.querySelector('[data-textwrap="' + id + '"]');
            if (wrap) wrap.remove();
            if (selectedText === id) { selectedText = ''; closeStylePopup(); }
            renderLanes();
            setStatus('Text deleted.');
        }
        // Delete removes whatever you selected LAST — a text block or a clip.
        function deleteSelected() {
            if (lastSel === 'text' && selectedText) { deleteText(selectedText); return; }
            removeSelected();
        }
        function copySeg() {
            if (selectedSeg < 0) { setStatus('Select a part to copy.', true); return; }
            var s = state.segments[selectedSeg];
            clipboard = { from: s.from, to: s.to, speed: s.speed || 1 };
            setStatus('Copied ' + fmt(clipboard.from) + ' → ' + fmt(clipboard.to) + '.');
        }
        function pasteSeg() {
            if (!clipboard) { setStatus('Nothing copied yet.', true); return; }
            pushHistory();
            var at = selectedSeg >= 0 ? selectedSeg + 1 : state.segments.length;
            state.segments.splice(at, 0, { from: clipboard.from, to: clipboard.to, speed: clipboard.speed });
            selectedSeg = at;
            renderLanes();
            setStatus('Pasted — that part plays twice now.');
        }
        function applySpeedToTarget(speed) {
            var i = targetSegIndex();
            if (i < 0) { setStatus('Select a clip first to set its speed.', true); return; }
            armInputSnapshot();
            state.segments[i].speed = Math.round(clamp(speed, 0.25, 2) * 100) / 100;
            speedVal.textContent = state.segments[i].speed.toFixed(2) + 'x';
            speedRange.value = String(state.segments[i].speed);
            renderLanes();
        }

        /* ---- lanes ---- */
        function textRowsLayout() {
            // Greedy row packing so overlapping texts stack instead of overlap.
            var sorted = state.texts.slice().sort(function (a, b) { return a.start - b.start; });
            var rows = [];
            var rowOf = {};
            sorted.forEach(function (t) {
                var placed = false;
                for (var i = 0; i < rows.length; i++) {
                    if (t.start >= rows[i] - 0.05) { rows[i] = t.end; rowOf[t.id] = i; placed = true; break; }
                }
                if (!placed) { rows.push(t.end); rowOf[t.id] = rows.length - 1; }
            });
            return { rowOf: rowOf, rowCount: Math.max(1, rows.length) };
        }
        function renderLanes() {
            // Cuts, removals, pastes and undo all reshuffle segment indices —
            // re-anchor the playback walker every time the lane rebuilds.
            syncPlayIdx(video.currentTime);
            laneMain.querySelectorAll('.rfe-seg').forEach(function (el) { el.remove(); });
            var total = totalPlayable() || 1;
            state.segments.forEach(function (seg, i) {
                var el = document.createElement('div');
                el.className = 'rfe-seg' + (i === selectedSeg ? ' is-selected' : '');
                el.style.flexGrow = String(Math.max(0.02, (seg.to - seg.from) / total));
                el.title = fmt(seg.from) + ' → ' + fmt(seg.to);
                el.setAttribute('data-seg', String(i));
                var speed = Number(seg.speed) || 1;
                var name = seg.label ? seg.label : 'Clip ' + (i + 1);
                el.innerHTML = '<span>' + name.replace(/</g, '&lt;') + '</span>' + (speed !== 1 ? '<small>' + speed + 'x</small>' : '');
                laneMain.insertBefore(el, playhead);
            });
            var layout = textRowsLayout();
            laneText.style.height = (layout.rowCount * 28 + 4) + 'px';
            laneText.innerHTML = '';
            state.texts.forEach(function (txt, i) {
                var el = document.createElement('div');
                el.className = 'rfe-textblock' + (txt.id === selectedText ? ' is-selected' : '');
                var l = srcToPlayedFrac(txt.start) * 100;
                var r = srcToPlayedFrac(txt.end) * 100;
                el.style.left = l + '%';
                el.style.width = Math.max(2.5, r - l) + '%';
                el.style.top = (3 + (layout.rowOf[txt.id] || 0) * 28) + 'px';
                el.textContent = 'Text ' + (i + 1) + ': ' + txt.text;
                el.setAttribute('data-textblock', txt.id);
                laneText.appendChild(el);
            });
        }

        /* ---- playback walker: runs at rAF (~60fps), NOT timeupdate —
           timeupdate only fires ~4x/sec, so playback overshoots a cut
           point by up to a quarter second and boundary handling turns
           into guesswork (looped/paused clips). At 60fps the overshoot
           is a frame at most. ---- */
        var lastWalkT = -1;
        function walkerTick() {
            var t = video.currentTime;
            var seg = state.segments[playSegIdx];
            if (!seg) { syncPlayIdx(t); seg = state.segments[playSegIdx]; }
            if (seg) video.playbackRate = Number(seg.speed) || 1;
            if (!video.paused && seg && !video.seeking) {
                if (t < seg.from - 0.3 || t > seg.to + 0.3) {
                    // Scrubbed somewhere else entirely — re-anchor there.
                    syncPlayIdx(t);
                    var landed = state.segments[playSegIdx];
                    if (segAtTime(t) < 0 && landed) video.currentTime = landed.from;
                } else if (t >= seg.to - 0.02) {
                    var next = playSegIdx + 1;
                    if (next >= state.segments.length) {
                        video.pause();
                        playBtn.textContent = 'Play';
                        playSegIdx = 0;
                    } else {
                        playSegIdx = next;
                        video.currentTime = state.segments[next].from;
                    }
                }
            }
            if (Math.abs(t - lastWalkT) > 0.02) {
                lastWalkT = t;
                timeEl.textContent = fmt(t) + ' / ' + fmt(duration);
                playhead.style.left = 'calc(' + (srcToPlayedFrac(t) * 100) + '% )';
                renderOverlays(t);
            }
        }
        var walkerRaf = requestAnimationFrame(function tick() {
            walkerTick();
            walkerRaf = requestAnimationFrame(tick);
        });
        video.addEventListener('ended', function () {
            playBtn.textContent = 'Play';
            playSegIdx = 0;
        });
        video.addEventListener('seeked', function () {
            // Manual scrubs (playhead drag, timeline click) re-anchor the
            // walker; segment-advance seeks land inside their own segment,
            // so this is a no-op for them.
            var t = video.currentTime;
            var seg = state.segments[playSegIdx];
            if (!seg || t < seg.from - 0.05 || t > seg.to + 0.05) syncPlayIdx(t);
        });

        /* ---- overlays (texts with styles/fades/masks, markers, lasso) ---- */
        function textElFor(id) { return layer.querySelector('[data-text="' + id + '"]'); }
        function remountTexts() {
            layer.querySelectorAll('.rfe-textwrap').forEach(function (el) { el.remove(); });
            state.texts.forEach(mountText);
        }
        function remountMarkers() {
            layer.querySelectorAll('[data-marker]').forEach(function (el) { el.remove(); });
            state.trackers.forEach(mountMarker);
        }
        function applyTextStyle(el, txt) {
            el.removeAttribute('style');
            el.style.display = 'none';
            var preset = TEXT_STYLES[txt.style];
            if (preset) el.style.cssText += preset.css;
        }
        function mountText(txt) {
            var wrap = document.createElement('div');
            wrap.className = 'rfe-textwrap';
            wrap.setAttribute('data-textwrap', txt.id);
            var el = document.createElement('div');
            el.className = 'rfe-text';
            el.setAttribute('data-text', txt.id);
            el.textContent = txt.text;
            applyTextStyle(el, txt);
            el.addEventListener('pointerdown', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                armInputSnapshot();
                selectedText = txt.id;
                lastSel = 'text';
                el.classList.add('is-active');
                el.setPointerCapture(ev.pointerId);
                var moveIt = function (e2) {
                    var s = clientToSource(e2.clientX, e2.clientY);
                    txt.x = Math.round(s.x * 10) / 10;
                    txt.y = Math.round(s.y * 10) / 10;
                    renderOverlays(video.currentTime);
                };
                var upIt = function () {
                    el.classList.remove('is-active');
                    el.removeEventListener('pointermove', moveIt);
                    el.removeEventListener('pointerup', upIt);
                };
                el.addEventListener('pointermove', moveIt);
                el.addEventListener('pointerup', upIt);
            });
            wrap.appendChild(el);
            layer.appendChild(wrap);
        }
        function mountMarker(tr) {
            var el = document.createElement('div');
            el.className = 'rfe-marker';
            el.setAttribute('data-marker', tr.id);
            el.textContent = tr.label;
            el.style.display = 'none';
            layer.appendChild(el);
        }

        /* ---- comment boxes: PNG cards pinned to a tracker node ---- */
        var cPanel = root.querySelector('[data-cpanel]');
        var selectedComment = '';
        function commentById(id) { return state.comments.filter(function (c) { return c.id === id; })[0] || null; }
        function trackerById(id) { return state.trackers.filter(function (tr) { return tr.id === id; })[0] || null; }
        // Desktop and mobile are separate layouts: every tracker node and
        // comment box belongs to the view it was created in. Older saves
        // (no mode field) count as desktop.
        function modeOf(x) { return x && x.mode === 'mobile' ? 'mobile' : 'desktop'; }
        function modeTrackers() { return state.trackers.filter(function (tr) { return modeOf(tr) === viewMode; }); }
        // Display smoothing: hand-recorded paths are jittery, so markers and
        // comment boxes ride a moving-average of the points. The RAW points
        // stay in the data (saving never bakes the smoothing in).
        var smoothCache = {};
        function smoothPts(tr) {
            var cached = smoothCache[tr.id];
            if (cached && cached.n === tr.points.length) return cached.pts;
            var pts = tr.points;
            if (pts && pts.length >= 5) {
                pts = tr.points.map(function (p, i) {
                    var x = 0, y = 0, n = 0;
                    for (var k = -2; k <= 2; k++) {
                        var q = tr.points[Math.min(tr.points.length - 1, Math.max(0, i + k))];
                        x += q.x; y += q.y; n += 1;
                    }
                    return { t: p.t, x: x / n, y: y / n };
                });
            }
            smoothCache[tr.id] = { n: tr.points.length, pts: pts || [] };
            return smoothCache[tr.id].pts;
        }
        // New boxes must land INSIDE the visible crop (the mobile 9:16 window
        // shows only part of the source frame) so they can always be grabbed.
        function keepBoxInView(c) {
            var tt = Math.max(Number(c.start) || 0, Math.min(Number(c.end) || duration, video.currentTime));
            var anchor = commentAnchor(c, tt);
            if (!anchor) return;
            var tl = framePctToSource(5, 8);
            var br = framePctToSource(95, 92);
            var halfW = (Number(c.w) || 20) / 2;
            var x0 = Math.min(tl.x, br.x) + halfW;
            var x1 = Math.max(tl.x, br.x) - halfW;
            var y0 = Math.min(tl.y, br.y);
            var y1 = Math.max(tl.y, br.y);
            var ax = clamp(anchor.x, Math.min(x0, x1), Math.max(x0, x1));
            var ay = clamp(anchor.y, y0, y1);
            if (ax === anchor.x && ay === anchor.y) return;
            if (c.trackerId === '*') {
                c.dx = Math.round(ax * 10) / 10;
                c.dy = Math.round(ay * 10) / 10;
            } else {
                c.dx = Math.round(((Number(c.dx) || 0) + ax - anchor.x) * 10) / 10;
                c.dy = Math.round(((Number(c.dy) || 0) + ay - anchor.y) * 10) / 10;
            }
        }
        function commentAnchor(c, t) {
            // '*' = "All — free position": not pinned to a node, dx/dy are
            // absolute source coordinates and the box can sit anywhere.
            if (c.trackerId === '*') return { x: Number(c.dx) || 50, y: Number(c.dy) || 40 };
            var tr = trackerById(c.trackerId);
            if (!tr || !tr.points.length) return null;
            var pt = pointAt(smoothPts(tr), t);
            if (!pt) return null;
            return { x: pt.x + (Number(c.dx) || 0), y: pt.y + (Number(c.dy) || 0), nodeX: pt.x, nodeY: pt.y };
        }
        function remountCboxes() {
            layer.querySelectorAll('[data-cbox]').forEach(function (el) { el.remove(); });
            state.comments.forEach(mountCbox);
        }
        function mountCbox(c) {
            var el = document.createElement('div');
            el.className = 'rfe-cbox' + (c.png ? '' : ' is-default');
            el.setAttribute('data-cbox', c.id);
            if (c.png) {
                var img = document.createElement('img');
                img.src = c.png;
                el.appendChild(img);
                var tintEl = document.createElement('div');
                tintEl.className = 'rfe-cbox-tint';
                tintEl.style.webkitMaskImage = 'url("' + c.png + '")';
                tintEl.style.maskImage = 'url("' + c.png + '")';
                el.appendChild(tintEl);
            }
            var textEl = document.createElement('div');
            textEl.className = 'rfe-cbox-text';
            el.appendChild(textEl);
            var tailEl = document.createElement('div');
            tailEl.className = 'rfe-cbox-tail';
            el.appendChild(tailEl);
            // Corner handle: resize the box right on the video.
            var sizeHandle = document.createElement('div');
            sizeHandle.className = 'rfe-cbox-size';
            el.appendChild(sizeHandle);
            sizeHandle.addEventListener('pointerdown', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                armInputSnapshot();
                selectComment(c.id);
                sizeHandle.setPointerCapture(ev.pointerId);
                var move = function (e2) {
                    var s = clientToSource(e2.clientX, e2.clientY);
                    var a = commentAnchor(c, video.currentTime);
                    if (a) c.w = Math.round(clamp((s.x - a.x) * 2, 4, 90) * 10) / 10;
                    renderOverlays(video.currentTime);
                    var wInput = cPanel.querySelector('[data-cp="w"]');
                    if (wInput) wInput.value = c.w;
                };
                var up = function () {
                    sizeHandle.removeEventListener('pointermove', move);
                    sizeHandle.removeEventListener('pointerup', up);
                };
                sizeHandle.addEventListener('pointermove', move);
                sizeHandle.addEventListener('pointerup', up);
            });
            el.addEventListener('pointerdown', function (ev) {
                if (ev.target === sizeHandle) return;
                ev.preventDefault();
                ev.stopPropagation();
                armInputSnapshot();
                selectComment(c.id);
                el.setPointerCapture(ev.pointerId);
                var move = function (e2) {
                    var s = clientToSource(e2.clientX, e2.clientY);
                    if (c.trackerId === '*') {
                        c.dx = Math.round(s.x * 10) / 10;
                        c.dy = Math.round(s.y * 10) / 10;
                    } else {
                        var tr = trackerById(c.trackerId);
                        var pt = tr ? pointAt(tr.points, video.currentTime) : null;
                        if (pt) {
                            c.dx = Math.round((s.x - pt.x) * 10) / 10;
                            c.dy = Math.round((s.y - pt.y) * 10) / 10;
                        }
                    }
                    renderOverlays(video.currentTime);
                };
                var up = function () {
                    el.removeEventListener('pointermove', move);
                    el.removeEventListener('pointerup', up);
                };
                el.addEventListener('pointermove', move);
                el.addEventListener('pointerup', up);
            });
            // Drop a PNG straight onto the box.
            el.addEventListener('dragover', function (ev) { ev.preventDefault(); });
            el.addEventListener('drop', function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                importPngFile(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0], c);
            });
            layer.appendChild(el);
        }
        function importPngFile(file, c) {
            if (!file || !c) return;
            if (!/^image\//.test(file.type || '')) { setStatus('Drop an image file (PNG works best).', true); return; }
            if (file.size > 1_600_000) { setStatus('Image too big — keep it under 1.5 MB.', true); return; }
            var reader = new FileReader();
            reader.onload = function () {
                pushHistory();
                c.png = String(reader.result || '');
                remountCboxes();
                renderOverlays(video.currentTime);
                setStatus('Image applied to the comment box.');
            };
            reader.readAsDataURL(file);
        }
        function selectComment(id) {
            selectedComment = id;
            syncCPanel();
            cPanel.classList.add('is-open');
            renderOverlays(video.currentTime);
        }
        function closeCPanel() {
            selectedComment = '';
            cPanel.classList.remove('is-open');
            renderOverlays(video.currentTime);
        }
        function syncCPanel() {
            var c = commentById(selectedComment);
            if (!c) return;
            var sel = cPanel.querySelector('[data-cp="trackerId"]');
            var trs = modeTrackers();
            sel.innerHTML = (trs.length > 1 ? '<option value="__all__">All — one box on every tracker</option>' : '')
                + '<option value="*"' + (c.trackerId === '*' ? ' selected' : '') + '>Free — not attached (whole clip)</option>'
                + trs.map(function (tr) {
                    return '<option value="' + tr.id + '"' + (tr.id === c.trackerId ? ' selected' : '') + '>' + tr.label + '</option>';
                }).join('');
            if (c.trackerId !== '*') sel.value = c.trackerId;
            cPanel.querySelector('[data-cp="lines"]').value = (c.lines || []).join('\n');
            var chanceVal = c.chance != null ? Number(c.chance) : 1;
            cPanel.querySelector('[data-cp="chance"]').value = chanceVal;
            cPanel.querySelector('[data-cp-chance-val]').textContent = Math.round(chanceVal * 100) + '%';
            cPanel.querySelector('[data-cp="w"]').value = Number(c.w) || 20;
            cPanel.querySelector('[data-cp="tint"]').value = c.tint || '#d9a15c';
            cPanel.querySelector('[data-cp="tintAmt"]').value = Number(c.tintAmt) || 0;
            cPanel.querySelector('[data-cp="opacity"]').value = c.opacity != null ? Number(c.opacity) : 1;
            cPanel.querySelector('[data-cp="flip"]').checked = Boolean(c.flip);
            cPanel.querySelector('[data-cp="start"]').value = Number(c.start) || 0;
            cPanel.querySelector('[data-cp="end"]').value = Number(c.end) || 0;
        }
        cPanel.addEventListener('input', function (ev) {
            var key = ev.target.getAttribute && ev.target.getAttribute('data-cp');
            var c = commentById(selectedComment);
            if (!key || !c) return;
            armInputSnapshot();
            if (key === 'flip') c.flip = ev.target.checked;
            else if (key === 'lines') {
                c.lines = String(ev.target.value || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
                renderOverlays(video.currentTime);
                return;
            }
            else if (key === 'chance') {
                c.chance = Number(ev.target.value);
                cPanel.querySelector('[data-cp-chance-val]').textContent = Math.round(c.chance * 100) + '%';
                return;
            }
            else if (key === 'trackerId' && ev.target.value === '__all__') {
                // "All": spawn one independent copy of this box on EVERY
                // tracker node (skipping trackers that already have one),
                // so each can be dragged and styled separately.
                pushHistory();
                var made = 0;
                modeTrackers().forEach(function (tr) {
                    if (tr.id === c.trackerId) return;
                    var taken = state.comments.some(function (x) { return x.trackerId === tr.id; });
                    if (taken) return;
                    var pts = tr.points || [];
                    var copy = {
                        id: uid(), trackerId: tr.id, mode: viewMode,
                        dx: Number(c.dx) || 6, dy: Number(c.dy) || -12, w: Number(c.w) || 20,
                        png: c.png || '', tint: c.tint || '#d9a15c', tintAmt: Number(c.tintAmt) || 0,
                        opacity: c.opacity != null ? Number(c.opacity) : 1, flip: Boolean(c.flip),
                        start: Math.round((pts[0] ? pts[0].t : 0) * 10) / 10,
                        end: Math.round((pts.length ? pts[pts.length - 1].t : duration) * 10) / 10
                    };
                    keepBoxInView(copy);
                    state.comments.push(copy);
                    mountCbox(copy);
                    made += 1;
                });
                syncCPanel();
                renderRows();
                renderOverlays(video.currentTime);
                setStatus(made
                    ? 'Added ' + made + ' box' + (made === 1 ? '' : 'es') + ' — one per tracker, drag each one individually.'
                    : 'Every tracker already has a comment box.');
                return;
            }
            else if (key === 'trackerId') {
                var was = c.trackerId;
                c.trackerId = ev.target.value;
                if (c.trackerId === '*') {
                    // Convert the node-relative offset into a free position.
                    var tr0 = trackerById(was);
                    var pt0 = tr0 ? pointAt(tr0.points, video.currentTime) : null;
                    c.dx = Math.round(((pt0 ? pt0.x : 50) + (Number(c.dx) || 0)) * 10) / 10;
                    c.dy = Math.round(((pt0 ? pt0.y : 40) + (Number(c.dy) || 0)) * 10) / 10;
                    c.start = 0;
                    c.end = Math.round(duration * 10) / 10;
                } else if (was === '*') {
                    var trN = trackerById(c.trackerId);
                    if (trN && trN.points.length) {
                        var ptN = pointAt(trN.points, video.currentTime) || trN.points[0];
                        c.dx = Math.round(((Number(c.dx) || 50) - ptN.x) * 10) / 10;
                        c.dy = Math.round(((Number(c.dy) || 40) - ptN.y) * 10) / 10;
                        c.start = Math.round(trN.points[0].t * 10) / 10;
                        c.end = Math.round(trN.points[trN.points.length - 1].t * 10) / 10;
                    }
                }
                keepBoxInView(c);
                syncCPanel();
            }
            else if (key === 'tint') c.tint = ev.target.value;
            else c[key] = Number(ev.target.value);
            renderOverlays(video.currentTime);
        });
        cPanel.querySelector('[data-cp-close]').addEventListener('click', closeCPanel);
        // Copy this box's LOOK (art, tint, size, opacity, flip) onto every
        // other comment box — positions, trackers and timing stay untouched.
        cPanel.querySelector('[data-cp-styleall]').addEventListener('click', function () {
            var c = commentById(selectedComment);
            if (!c) return;
            var others = state.comments.filter(function (x) { return x.id !== c.id; });
            if (!others.length) { setStatus('No other boxes to style yet.', true); return; }
            pushHistory();
            others.forEach(function (x) {
                x.png = c.png || '';
                x.tint = c.tint || '#d9a15c';
                x.tintAmt = Number(c.tintAmt) || 0;
                x.w = Number(c.w) || 20;
                x.opacity = c.opacity != null ? Number(c.opacity) : 1;
                x.flip = Boolean(c.flip);
            });
            remountCboxes();
            renderOverlays(video.currentTime);
            setStatus('Styled ' + others.length + ' other box' + (others.length === 1 ? '' : 'es') + ' to match this one.');
        });
        // Drag the panel around by its header.
        cPanel.querySelector('h4').addEventListener('pointerdown', function (ev) {
            if (ev.target.closest('button')) return;
            ev.preventDefault();
            var r0 = cPanel.getBoundingClientRect();
            cPanel.style.left = r0.left + 'px';
            cPanel.style.top = r0.top + 'px';
            cPanel.style.right = 'auto';
            var sx = ev.clientX - r0.left;
            var sy = ev.clientY - r0.top;
            var h4 = ev.currentTarget;
            h4.setPointerCapture(ev.pointerId);
            var move = function (e2) {
                cPanel.style.left = Math.max(0, Math.min(window.innerWidth - 120, e2.clientX - sx)) + 'px';
                cPanel.style.top = Math.max(0, Math.min(window.innerHeight - 60, e2.clientY - sy)) + 'px';
            };
            var up = function () {
                h4.removeEventListener('pointermove', move);
                h4.removeEventListener('pointerup', up);
            };
            h4.addEventListener('pointermove', move);
            h4.addEventListener('pointerup', up);
        });
        // Drag a PNG file anywhere onto the panel.
        cPanel.addEventListener('dragover', function (ev) { ev.preventDefault(); cPanel.classList.add('is-dropping'); });
        cPanel.addEventListener('dragleave', function () { cPanel.classList.remove('is-dropping'); });
        cPanel.addEventListener('drop', function (ev) {
            ev.preventDefault();
            cPanel.classList.remove('is-dropping');
            importPngFile(ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0], commentById(selectedComment));
        });
        cPanel.querySelector('[data-cp-delete]').addEventListener('click', function () {
            var c = commentById(selectedComment);
            if (!c) return;
            pushHistory();
            state.comments = state.comments.filter(function (x) { return x.id !== c.id; });
            remountCboxes();
            renderRows();
            closeCPanel();
            setStatus('Comment box deleted.');
        });
        cPanel.querySelector('[data-cp-png]').addEventListener('click', function () {
            var c = commentById(selectedComment);
            if (!c) return;
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/png,image/webp,image/jpeg';
            input.addEventListener('change', function () {
                importPngFile(input.files && input.files[0], c);
            });
            input.click();
        });
        function renderOverlays(t) {
            state.texts.forEach(function (txt) {
                var el = textElFor(txt.id);
                var wrap = layer.querySelector('[data-textwrap="' + txt.id + '"]');
                if (!el || !wrap) return;
                var pos = sourceToFramePx(Number(txt.x) || 50, Number(txt.y) || 50);
                el.style.left = pos.left + 'px';
                el.style.top = pos.top + 'px';
                el.style.transform = 'translate(-50%,-50%) scale(' + (Number(txt.size) || 1) + ')';
                var on = t >= txt.start && t <= txt.end;
                el.style.display = on ? 'block' : 'none';
                if (on) {
                    var fi = Math.max(0, Number(txt.fadeIn) || 0);
                    var fo = Math.max(0, Number(txt.fadeOut) || 0);
                    var alpha = 1;
                    if (fi > 0 && t < txt.start + fi) alpha = Math.min(alpha, (t - txt.start) / fi);
                    if (fo > 0 && t > txt.end - fo) alpha = Math.min(alpha, (txt.end - t) / fo);
                    el.style.opacity = String(clamp(alpha, 0, 1));
                }
                var mask = txt.behindMask ? state.masks.filter(function (m) { return m.id === txt.behindMask; })[0] : null;
                if (mask && mask.points.length > 2) {
                    var r = frameRect();
                    var poly = mask.points.map(function (p) {
                        var fp = sourceToFramePx(p.x, p.y);
                        return ((fp.left / r.width) * 100).toFixed(2) + '% ' + ((fp.top / r.height) * 100).toFixed(2) + '%';
                    }).join(',');
                    wrap.style.clipPath = 'polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ' + poly + ')';
                } else {
                    wrap.style.clipPath = '';
                }
            });
            state.trackers.forEach(function (tr) {
                var el = layer.querySelector('[data-marker="' + tr.id + '"]');
                if (!el) return;
                if (modeOf(tr) !== viewMode) { el.style.display = 'none'; return; }
                var pt = pointAt(smoothPts(tr), t);
                if (!pt) { el.style.display = 'none'; return; }
                var pos = sourceToFramePx(pt.x, pt.y);
                el.style.display = 'block';
                el.style.left = pos.left + 'px';
                el.style.top = pos.top + 'px';
            });
            state.comments.forEach(function (c) {
                var el = layer.querySelector('[data-cbox="' + c.id + '"]');
                if (!el) return;
                if (modeOf(c) !== viewMode) { el.style.display = 'none'; return; }
                var a = commentAnchor(c, t);
                var end = Number(c.end) || duration || 9999;
                var on = a && t >= (Number(c.start) || 0) && t <= end;
                if (!on) { el.style.display = 'none'; return; }
                var pos = sourceToFramePx(a.x, a.y);
                var wpx = Math.max(20, sourceToFramePx(a.x + (Number(c.w) || 20), a.y).left - pos.left);
                // Clamp into the visible frame like the live player does.
                var fr = frameRect();
                var boxH = el.offsetHeight || wpx * 0.4;
                var cxPx = Math.max(wpx / 2 + 8, Math.min(fr.width - wpx / 2 - 8, pos.left));
                var cyPx = Math.max(boxH / 2 + 8, Math.min(fr.height - boxH / 2 - 8, pos.top));
                el.style.display = 'block';
                el.style.left = cxPx + 'px';
                el.style.top = cyPx + 'px';
                el.style.width = wpx + 'px';
                el.style.opacity = String(clamp(c.opacity != null ? Number(c.opacity) : 1, 0.1, 1));
                el.style.transform = 'translate(-50%,-50%)' + (c.flip ? ' scaleX(-1)' : '');
                // Editor preview always shows the FIRST line so positioning is
                // stable; the live player rotates lines randomly per loop.
                var line0 = (c.lines && c.lines.length) ? c.lines[0] : '';
                var textEl = el.querySelector('.rfe-cbox-text');
                if (textEl) {
                    textEl.textContent = line0;
                    textEl.style.fontSize = Math.round(Math.max(7, Math.min(11, wpx * 0.048))) + 'px';
                }
                el.classList.toggle('has-text', Boolean(line0));
                if (!c.png && !line0) el.style.height = Math.max(16, wpx * 0.26) + 'px';
                // Tail aims from the box back at the tracked character.
                if (c.trackerId !== '*' && !c.png && line0 && a.nodeX != null) {
                    var np = sourceToFramePx(a.nodeX, a.nodeY);
                    var ddx = np.left - cxPx;
                    var ddy = np.top - cyPx;
                    el.setAttribute('data-tail', Math.abs(ddy) >= Math.abs(ddx)
                        ? (ddy >= 0 ? 'bottom' : 'top')
                        : (ddx >= 0 ? 'right' : 'left'));
                } else {
                    el.removeAttribute('data-tail');
                }
                var tintEl = el.querySelector('.rfe-cbox-tint');
                if (tintEl) {
                    tintEl.style.background = c.tint || '#d9a15c';
                    tintEl.style.opacity = String(clamp(Number(c.tintAmt) || 0, 0, 1));
                }
                el.classList.toggle('is-selected', selectedComment === c.id);
            });
            renderMasks(t);
        }
        function renderMasks(t) {
            if (lasso.drawing) return;
            var near = state.masks.filter(function (m) { return Math.abs((m.t || 0) - t) < 0.6; });
            lassoSvg.innerHTML = near.map(function (m) {
                var d = m.points.map(function (p, i) {
                    var pos = sourceToFramePx(p.x, p.y);
                    return (i ? 'L' : 'M') + pos.left.toFixed(1) + ' ' + pos.top.toFixed(1);
                }).join(' ') + ' Z';
                return '<path d="' + d + '"></path>';
            }).join('');
        }
        function pointAt(points, t) {
            if (!points.length) return null;
            if (t < points[0].t - 0.3 || t > points[points.length - 1].t + 0.3) return null;
            for (var i = 0; i < points.length - 1; i++) {
                var a = points[i];
                var b = points[i + 1];
                if (t >= a.t && t <= b.t) {
                    var k = (t - a.t) / Math.max(0.001, b.t - a.t);
                    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
                }
            }
            return points[t <= points[0].t ? 0 : points.length - 1];
        }

        /* ---- style popup ---- */
        function currentText() {
            return state.texts.filter(function (x) { return x.id === selectedText; })[0] || null;
        }
        function openStylePopup(id) {
            selectedText = id;
            lastSel = 'text';
            var txt = currentText();
            if (!txt) return;
            renderLanes();
            var maskSel = stylePop.querySelector('[data-st="behindMask"]');
            maskSel.innerHTML = '<option value="">None (in front)</option>' + state.masks.map(function (m) {
                return '<option value="' + m.id + '"' + (txt.behindMask === m.id ? ' selected' : '') + '>Behind: ' + m.label + '</option>';
            }).join('');
            stylePop.querySelector('[data-st="text"]').value = txt.text;
            stylePop.querySelector('[data-st="start"]').value = txt.start;
            stylePop.querySelector('[data-st="end"]').value = txt.end;
            stylePop.querySelector('[data-st="fadeIn"]').value = txt.fadeIn || 0;
            stylePop.querySelector('[data-st="fadeOut"]').value = txt.fadeOut || 0;
            stylePop.querySelector('[data-st="size"]').value = Number(txt.size) || 1;
            var reco = recommendStylesFor(scene.id);
            var chip = function (key) {
                return '<button type="button" class="rfe-style-chip' + (txt.style === key ? ' is-active' : '') + '" data-style-pick="' + key + '" style="' + TEXT_STYLES[key].css.replace(/"/g, '&quot;') + ';font-size:11px;">' + TEXT_STYLES[key].label + '</button>';
            };
            stylePop.querySelector('[data-style-reco]').innerHTML = reco.filter(function (k) { return TEXT_STYLES[k]; }).map(chip).join('');
            stylePop.querySelector('[data-style-all]').innerHTML = Object.keys(TEXT_STYLES).map(chip).join('');
            stylePop.classList.add('is-open');
        }
        function closeStylePopup() {
            stylePop.classList.remove('is-open');
        }
        stylePop.addEventListener('input', function (ev) {
            var txt = currentText();
            var key = ev.target.getAttribute && ev.target.getAttribute('data-st');
            if (!txt || !key) return;
            armInputSnapshot();
            if (key === 'text') {
                txt.text = ev.target.value;
                var el = textElFor(txt.id);
                if (el) el.textContent = txt.text;
            } else if (key === 'behindMask') {
                txt.behindMask = ev.target.value;
            } else {
                txt[key] = Number(ev.target.value) || 0;
            }
            renderLanes();
            renderOverlays(video.currentTime);
        });
        stylePop.addEventListener('change', function (ev) {
            if (ev.target.getAttribute && ev.target.getAttribute('data-st') === 'behindMask') {
                var txt = currentText();
                if (!txt) return;
                armInputSnapshot();
                txt.behindMask = ev.target.value;
                renderOverlays(video.currentTime);
            }
        });
        stylePop.addEventListener('click', function (ev) {
            var t = ev.target;
            if (t.hasAttribute && t.hasAttribute('data-style-close')) { closeStylePopup(); return; }
            var pick = t.closest ? t.closest('[data-style-pick]') : null;
            if (pick) {
                var txt = currentText();
                if (!txt) return;
                armInputSnapshot();
                txt.style = pick.getAttribute('data-style-pick');
                var el = textElFor(txt.id);
                if (el) { applyTextStyle(el, txt); }
                openStylePopup(txt.id); // refresh active chip
                renderOverlays(video.currentTime);
                return;
            }
            if (t.hasAttribute && t.hasAttribute('data-style-delete')) {
                if (selectedText) deleteText(selectedText);
                return;
            }
        });
        // Drag the popup by its header.
        (function () {
            var dragHead = stylePop.querySelector('[data-style-drag]');
            dragHead.addEventListener('pointerdown', function (ev) {
                if (ev.target.hasAttribute('data-style-close')) return;
                ev.preventDefault();
                var r = stylePop.getBoundingClientRect();
                var ox = ev.clientX - r.left;
                var oy = ev.clientY - r.top;
                var move = function (e) {
                    stylePop.style.left = (e.clientX - ox) + 'px';
                    stylePop.style.top = (e.clientY - oy) + 'px';
                    stylePop.style.right = 'auto';
                };
                var up = function () {
                    window.removeEventListener('pointermove', move);
                    window.removeEventListener('pointerup', up);
                };
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up);
            });
        })();

        /* ---- tracker recording (source coords) ---- */
        function setTrackerMode(mode) {
            tracker.mode = mode;
            dot.style.display = mode === 'off' ? 'none' : 'block';
            dot.classList.toggle('is-rec', mode === 'recording');
            trackerBtn.classList.toggle('is-live', mode !== 'off');
            trackerBtn.textContent = mode === 'off' ? 'Tracker node' : (mode === 'armed' ? 'Tap to start' : 'Tap to stop');
            hint.style.display = (mode === 'off' && !lasso.on) ? 'none' : 'block';
            if (mode !== 'off') {
                hint.textContent = mode === 'armed'
                    ? 'Move the dot onto your target, then tap/click to START recording.'
                    : 'Recording… follow the target. Tap/click to STOP.';
            }
        }
        stage.addEventListener('pointermove', function (ev) {
            if (tracker.mode === 'off') return;
            var s = stage.getBoundingClientRect();
            dot.style.left = (ev.clientX - s.left) + 'px';
            dot.style.top = (ev.clientY - s.top) + 'px';
            var src = clientToSource(ev.clientX, ev.clientY);
            tracker.lastX = src.x;
            tracker.lastY = src.y;
        });
        stage.addEventListener('pointerdown', function (ev) {
            if (tracker.mode === 'off') return;
            ev.preventDefault();
            var s = stage.getBoundingClientRect();
            dot.style.left = (ev.clientX - s.left) + 'px';
            dot.style.top = (ev.clientY - s.top) + 'px';
            var src = clientToSource(ev.clientX, ev.clientY);
            tracker.lastX = src.x;
            tracker.lastY = src.y;
            if (tracker.mode === 'armed') {
                tracker.points = [];
                setTrackerMode('recording');
                video.play().catch(function () {});
                playBtn.textContent = 'Pause';
                var sample = function () {
                    if (tracker.mode !== 'recording') return;
                    var last = tracker.points[tracker.points.length - 1];
                    var t = Math.round(video.currentTime * 100) / 100;
                    if (!last || t - last.t >= 0.08) {
                        tracker.points.push({ t: t, x: Math.round(tracker.lastX * 10) / 10, y: Math.round(tracker.lastY * 10) / 10 });
                    }
                    tracker.raf = requestAnimationFrame(sample);
                };
                tracker.raf = requestAnimationFrame(sample);
            } else if (tracker.mode === 'recording') {
                cancelAnimationFrame(tracker.raf);
                video.pause();
                playBtn.textContent = 'Play';
                var label = window.prompt('Name this tracker node (e.g. "knight", "peasant with cart"):', '');
                if (label && tracker.points.length > 1) {
                    pushHistory();
                    var tr = { id: uid(), label: String(label).trim().slice(0, 40), points: tracker.points.slice(), mode: viewMode };
                    state.trackers.push(tr);
                    mountMarker(tr);
                    renderRows();
                    setStatus('Tracker "' + tr.label + '" saved for ' + viewMode + ' view (' + tr.points.length + ' points). Don’t forget Save.');
                } else {
                    setStatus('Tracker discarded.', true);
                }
                setTrackerMode('off');
            }
        });

        /* ---- lasso cutout: CLICK to drop points, DOUBLE-CLICK to close.
           Source coords, so one cutout works in both view modes. Zoom the
           view (scroll wheel) first for pixel-accurate outlines. ---- */
        function setLasso(on) {
            lasso.on = on;
            lasso.points = [];
            lasso.lastClickAt = 0;
            lassoBtn.classList.toggle('is-on', on);
            hint.style.display = (on || tracker.mode !== 'off') ? 'block' : 'none';
            if (!on) lassoSvg.innerHTML = '';
            if (on) {
                video.pause();
                playBtn.textContent = 'Play';
                hint.textContent = 'Lasso: click to drop points around the character. DOUBLE-CLICK to close the shape. Scroll to zoom in for accuracy. Esc cancels.';
            }
        }
        function drawLassoPreview(cursorSrc) {
            var pts = lasso.points.slice();
            if (cursorSrc) pts.push(cursorSrc);
            if (!pts.length) { lassoSvg.innerHTML = ''; return; }
            var d = pts.map(function (p, i) {
                var pos = sourceToFramePx(p.x, p.y);
                return (i ? 'L' : 'M') + pos.left.toFixed(1) + ' ' + pos.top.toFixed(1);
            }).join(' ') + (lasso.points.length > 1 ? '' : '');
            lassoSvg.innerHTML = '<path d="' + d + '"></path>' + lasso.points.map(function (p) {
                var pos = sourceToFramePx(p.x, p.y);
                return '<circle cx="' + pos.left.toFixed(1) + '" cy="' + pos.top.toFixed(1) + '" r="3.5" fill="#d9a15c" stroke="#161005"></circle>';
            }).join('');
        }
        function closeLasso() {
            if (lasso.points.length < 3) {
                setStatus('Need at least 3 points — keep clicking around the character.', true);
                return;
            }
            var label = window.prompt('Name this cutout (e.g. "main character"):', 'main character');
            if (label) {
                pushHistory();
                state.masks.push({ id: uid(), label: String(label).trim().slice(0, 40), t: Math.round(video.currentTime * 100) / 100, points: lasso.points.slice() });
                renderRows();
                setStatus('Cutout "' + label + '" saved at ' + fmt(video.currentTime) + ' — works in both desktop and mobile.');
            }
            setLasso(false);
            renderOverlays(video.currentTime);
        }
        stage.addEventListener('pointerdown', function (ev) {
            if (!lasso.on || tracker.mode !== 'off') return;
            ev.preventDefault();
            ev.stopPropagation();
            var now = Date.now();
            var src = clientToSource(ev.clientX, ev.clientY);
            var first = lasso.points[0];
            var last = lasso.points[lasso.points.length - 1];
            var nearFirst = first && Math.abs(first.x - src.x) < 2.5 && Math.abs(first.y - src.y) < 2.5;
            var nearLast = last && Math.abs(last.x - src.x) < 2.5 && Math.abs(last.y - src.y) < 2.5;
            // Close on: fast double-click, clicking the same spot twice, or
            // clicking back on the first point.
            if (lasso.points.length >= 3 && ((now - lasso.lastClickAt < 350) || nearFirst || nearLast)) {
                closeLasso();
                return;
            }
            lasso.lastClickAt = now;
            lasso.points.push({ x: Math.round(src.x * 10) / 10, y: Math.round(src.y * 10) / 10 });
            drawLassoPreview(null);
        }, true);
        stage.addEventListener('pointermove', function (ev) {
            if (!lasso.on || !lasso.points.length) return;
            drawLassoPreview(clientToSource(ev.clientX, ev.clientY));
        });

        /* ---- rows (audio / trackers / masks only; texts live in the lane) ---- */
        function renderRows() {
            var html = '';
            if (state.audio.length) {
                html += '<h5>Music / SFX</h5>' + state.audio.map(function (a, i) {
                    return '<div class="rfe-row"><span>' + a.file + '</span>' +
                        'at <input type="number" step="0.1" min="0" value="' + a.at + '" data-af="' + i + ':at">' +
                        'vol <input type="number" step="0.1" min="0" max="1" value="' + a.volume + '" data-af="' + i + ':volume">' +
                        '<button class="rfe-x" data-del-audio="' + i + '">&times;</button></div>';
                }).join('');
            }
            var myTrackers = state.trackers.filter(function (tr) { return modeOf(tr) === viewMode; });
            var otherTrackers = state.trackers.length - myTrackers.length;
            if (myTrackers.length || otherTrackers) {
                html += '<h5>Tracker nodes — ' + viewMode + ' view' +
                    (otherTrackers ? ' <em style="font-style:normal;opacity:.55">(' + otherTrackers + ' more in the other view)</em>' : '') + '</h5>'
                    + myTrackers.map(function (tr) {
                        return '<div class="rfe-row"><span><strong>' + tr.label + '</strong> — ' + tr.points.length + ' points, ' +
                            fmt(tr.points[0].t) + ' → ' + fmt(tr.points[tr.points.length - 1].t) + '</span>' +
                            '<button class="rfe-x" data-del-tracker="' + tr.id + '">&times;</button></div>';
                    }).join('');
            }
            if (state.masks.length) {
                html += '<h5>Lasso cutouts</h5>' + state.masks.map(function (m) {
                    return '<div class="rfe-row"><span><strong>' + m.label + '</strong> — outline at ' + fmt(m.t) + ' (' + m.points.length + ' points)</span>' +
                        '<button class="rfe-x" data-del-mask="' + m.id + '">&times;</button></div>';
                }).join('');
            }
            var myComments = state.comments.filter(function (c) { return modeOf(c) === viewMode; });
            var otherComments = state.comments.length - myComments.length;
            if (myComments.length || otherComments) {
                html += '<h5>Comment boxes — ' + viewMode + ' view' +
                    (otherComments ? ' <em style="font-style:normal;opacity:.55">(' + otherComments + ' more in the other view)</em>' : '') + '</h5>'
                    + myComments.map(function (c) {
                        var tr = state.trackers.filter(function (x) { return x.id === c.trackerId; })[0];
                        var where = c.trackerId === '*' ? 'free position' : (tr ? tr.label : '(missing tracker)');
                        var boxLabel = (c.lines && c.lines.length)
                            ? '“' + c.lines[0].slice(0, 30) + (c.lines[0].length > 30 ? '…' : '') + '”' + (c.lines.length > 1 ? ' +' + (c.lines.length - 1) : '')
                            : (c.png ? 'PNG box' : 'Blank box');
                        return '<div class="rfe-row"><span><strong>' + boxLabel + '</strong> on ' +
                            where + ', ' + fmt(c.start) + ' → ' + fmt(c.end) + '</span>' +
                            '<button class="rfe-btn" data-edit-comment="' + c.id + '" style="padding:5px 10px;font-size:10.5px">Edit</button>' +
                            '<button class="rfe-x" data-del-comment="' + c.id + '">&times;</button></div>';
                    }).join('');
            }
            rowsEl.innerHTML = html;
        }

        /* ---- toolbar / rows events ---- */
        root.addEventListener('click', function (ev) {
            var t = ev.target;
            var a = t.getAttribute && t.getAttribute('data-a');
            if (a === 'close') { destroy(); return; }
            if (a === 'playpause') {
                if (video.paused) {
                    var pt = video.currentTime;
                    syncPlayIdx(pt);
                    var pseg = state.segments[playSegIdx];
                    if (pseg && (segAtTime(pt) < 0 || pt >= pseg.to - 0.02)) {
                        // Playhead sits in a removed part (or at a clip's very
                        // end): start from the next kept part, not a dead zone.
                        if (segAtTime(pt) < 0) video.currentTime = pseg.from;
                        else if (playSegIdx + 1 < state.segments.length) {
                            playSegIdx += 1;
                            video.currentTime = state.segments[playSegIdx].from;
                        } else {
                            playSegIdx = 0;
                            video.currentTime = state.segments[0].from;
                        }
                    }
                    video.play().catch(function () {});
                    playBtn.textContent = 'Pause';
                } else {
                    video.pause();
                    playBtn.textContent = 'Play';
                }
                return;
            }
            if (a === 'viewmode') { setViewMode(viewMode === 'mobile' ? 'desktop' : 'mobile'); return; }
            if (a === 'sitemock') { setSiteMock(!siteMock); return; }
            if (a === 'autopos') { doAutoPosition(); return; }
            if (a === 'split') { splitAtPlayhead(); return; }
            if (a === 'copy') { copySeg(); return; }
            if (a === 'paste') { pasteSeg(); return; }
            if (a === 'delseg') { removeSelected(); return; }
            if (a === 'speed') {
                var i = targetSegIndex();
                if (i < 0) { setStatus('Select a clip first to set its speed.', true); return; }
                var cur = Number(state.segments[i].speed) || 1;
                speedRange.value = String(cur);
                speedVal.textContent = cur.toFixed(2) + 'x';
                speedPop.classList.toggle('is-open');
                return;
            }
            if (t.hasAttribute && t.hasAttribute('data-speed-set')) { applySpeedToTarget(Number(t.getAttribute('data-speed-set'))); return; }
            if (a === 'text') {
                pushHistory();
                var reco = recommendStylesFor(scene.id);
                var txt = {
                    id: uid(), text: 'Your text',
                    start: Math.round(video.currentTime * 10) / 10,
                    end: Math.round((video.currentTime + 3) * 10) / 10,
                    x: 50, y: 25,
                    style: reco[0] && TEXT_STYLES[reco[0]] ? reco[0] : 'plain',
                    fadeIn: 0.3, fadeOut: 0.3, behindMask: ''
                };
                state.texts.push(txt);
                mountText(txt);
                renderLanes();
                renderOverlays(video.currentTime);
                openStylePopup(txt.id);
                setStatus('Text added to the Text lane — drag it on the video, drag its block to retime, edges to stretch.');
                return;
            }
            if (a === 'audio') {
                var input = document.createElement('input');
                input.type = 'file';
                input.accept = 'audio/*';
                input.addEventListener('change', function () {
                    var file = input.files && input.files[0];
                    if (!file) return;
                    var clean = 'sfx-' + Date.now().toString(36) + '-' + file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-').slice(-40);
                    setStatus('Uploading audio…');
                    api.uploadAsset(file, clean).then(function (json) {
                        if (!json || !json.ok) { setStatus('Audio upload failed.', true); return; }
                        pushHistory();
                        state.audio.push({ file: clean, at: Math.round(video.currentTime * 10) / 10, volume: 1 });
                        renderRows();
                        setStatus('Audio added at the playhead.');
                    }).catch(function () { setStatus('Audio upload failed.', true); });
                });
                input.click();
                return;
            }
            if (a === 'tracker') { setLasso(false); setTrackerMode(tracker.mode === 'off' ? 'armed' : 'off'); return; }
            if (a === 'comment') {
                setTrackerMode('off');
                setLasso(false);
                pushHistory();
                var myTrs = modeTrackers();
                var tr0 = myTrs.length ? myTrs[myTrs.length - 1] : null;
                var pts0 = tr0 ? tr0.points : [];
                var newC = tr0
                    ? {
                        id: uid(), trackerId: tr0.id, mode: viewMode, dx: 6, dy: -12, w: 20,
                        png: '', tint: '#d9a15c', tintAmt: 0, opacity: 1, flip: false,
                        start: Math.round((pts0[0] ? pts0[0].t : 0) * 10) / 10,
                        end: Math.round((pts0.length ? pts0[pts0.length - 1].t : duration) * 10) / 10
                    }
                    : {
                        id: uid(), trackerId: '*', mode: viewMode, dx: 50, dy: 35, w: 20,
                        png: '', tint: '#d9a15c', tintAmt: 0, opacity: 1, flip: false,
                        start: 0, end: Math.round(duration * 10) / 10
                    };
                keepBoxInView(newC);
                state.comments.push(newC);
                mountCbox(newC);
                if (video.currentTime < newC.start || video.currentTime > newC.end) {
                    video.addEventListener('seeked', function () { renderOverlays(video.currentTime); }, { once: true });
                    try { video.currentTime = newC.start + 0.05; } catch (e3) {}
                }
                selectComment(newC.id);
                renderRows();
                setStatus(tr0
                    ? 'Comment box added on "' + tr0.label + '" — drag it, resize by the corner handle, drop a PNG on it.'
                    : 'Free comment box added — drag it, resize by the corner handle, drop a PNG on it.');
                return;
            }
            if (a === 'lasso') { setTrackerMode('off'); setLasso(!lasso.on); return; }
            if (a === 'save') {
                setStatus('Saving…');
                var snapNow = snapshot();
                api.saveMeta(savePayload()).then(function (ok) {
                    if (ok) lastSavedSnap = snapNow;
                    setStatus(ok ? 'Saved — players use this immediately.' : 'Save failed.', !ok);
                }).catch(function () { setStatus('Save failed.', true); });
                return;
            }
            var segEl = t.closest ? t.closest('[data-seg]') : null;
            if (segEl) {
                // After a reorder-drag the browser still fires a click on the
                // (now stale) element — its old index must not clobber the
                // selection the drop just set.
                if (suppressSegClick) { suppressSegClick = false; return; }
                selectedSeg = Number(segEl.getAttribute('data-seg'));
                lastSel = 'seg';
                renderLanes();
                return;
            }
            if (t.hasAttribute && t.hasAttribute('data-del-audio')) { pushHistory(); state.audio.splice(Number(t.getAttribute('data-del-audio')), 1); renderRows(); return; }
            if (t.hasAttribute && t.hasAttribute('data-del-tracker')) {
                var id2 = t.getAttribute('data-del-tracker');
                pushHistory();
                state.trackers = state.trackers.filter(function (x) { return x.id !== id2; });
                var el2 = layer.querySelector('[data-marker="' + id2 + '"]');
                if (el2) el2.remove();
                renderRows();
                return;
            }
            if (t.hasAttribute && t.hasAttribute('data-del-mask')) {
                var id3 = t.getAttribute('data-del-mask');
                pushHistory();
                state.masks = state.masks.filter(function (x) { return x.id !== id3; });
                lassoSvg.innerHTML = '';
                renderRows();
                renderOverlays(video.currentTime);
                return;
            }
            if (t.hasAttribute && t.hasAttribute('data-edit-comment')) {
                var cid = t.getAttribute('data-edit-comment');
                var cSel = commentById(cid);
                if (cSel && (video.currentTime < cSel.start || video.currentTime > cSel.end)) {
                    video.addEventListener('seeked', function () { renderOverlays(video.currentTime); }, { once: true });
                    try { video.currentTime = cSel.start + 0.05; } catch (e4) {}
                }
                selectComment(cid);
                return;
            }
            if (t.hasAttribute && t.hasAttribute('data-del-comment')) {
                var id4 = t.getAttribute('data-del-comment');
                pushHistory();
                state.comments = state.comments.filter(function (x) { return x.id !== id4; });
                remountCboxes();
                if (selectedComment === id4) closeCPanel();
                renderRows();
                renderOverlays(video.currentTime);
                return;
            }
        });

        speedRange.addEventListener('input', function () { applySpeedToTarget(Number(speedRange.value)); });

        root.addEventListener('input', function (ev) {
            var af = ev.target.getAttribute && ev.target.getAttribute('data-af');
            if (af) {
                armInputSnapshot();
                var ap = af.split(':');
                var cue = state.audio[Number(ap[0])];
                if (cue) cue[ap[1]] = Number(ev.target.value) || 0;
            }
        });

        /* ---- Main lane: double-click a clip to rename it ---- */
        laneMain.addEventListener('dblclick', function (ev) {
            var segEl = ev.target.closest ? ev.target.closest('[data-seg]') : null;
            if (!segEl) return;
            var i = Number(segEl.getAttribute('data-seg'));
            var seg = state.segments[i];
            if (!seg) return;
            var name = window.prompt('Rename this clip:', seg.label || ('Clip ' + (i + 1)));
            if (name === null) return;
            armInputSnapshot();
            seg.label = String(name).trim().slice(0, 30);
            renderLanes();
        });

        /* ---- Main lane: clips select + drag-to-reorder; scrubbing happens
           on the empty lane or the playhead only. Clicking a clip must NOT
           seek — that read as "restarts my video" when clicking Clip 1. ---- */
        var suppressSegClick = false;
        function beginSegDrag(ev, segEl) {
            ev.preventDefault();
            var idx = Number(segEl.getAttribute('data-seg'));
            selectedSeg = idx;
            lastSel = 'seg';
            laneMain.querySelectorAll('.rfe-seg').forEach(function (el) { el.classList.remove('is-selected'); });
            segEl.classList.add('is-selected');
            var startX = ev.clientX;
            var started = false;
            var move = function (e) {
                var dx = e.clientX - startX;
                if (!started && Math.abs(dx) < 6) return;
                if (!started) { started = true; segEl.classList.add('is-dragging'); }
                segEl.style.transform = 'translateX(' + dx + 'px)';
            };
            var up = function (e) {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                if (!started) {
                    // Plain click: jump playback right to the clicked spot —
                    // paused shows that frame (live preview), playing keeps
                    // playing from there. Selection was applied on press.
                    var lr = laneMain.getBoundingClientRect();
                    var st = playedFracToSrc((e.clientX - lr.left) / lr.width);
                    video.currentTime = st;
                    syncPlayIdx(st);
                    return;
                }
                suppressSegClick = true;
                segEl.classList.remove('is-dragging');
                segEl.style.transform = '';
                // Drop position = how many OTHER clips sit left of the pointer.
                var others = Array.prototype.filter.call(laneMain.querySelectorAll('.rfe-seg'), function (el) { return el !== segEl; });
                var insert = others.length;
                for (var i = 0; i < others.length; i++) {
                    var r = others[i].getBoundingClientRect();
                    if (e.clientX < r.left + r.width / 2) { insert = i; break; }
                }
                if (insert === idx) { renderLanes(); return; }
                pushHistory();
                var seg = state.segments.splice(idx, 1)[0];
                state.segments.splice(insert, 0, seg);
                selectedSeg = insert;
                renderLanes();
                setStatus('Clip moved — parts play left to right.');
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        }
        laneMain.addEventListener('pointerdown', function (ev) {
            var isPlayhead = ev.target.closest && ev.target.closest('.rfe-playhead');
            var segEl = !isPlayhead && ev.target.closest ? ev.target.closest('[data-seg]') : null;
            if (segEl) { beginSegDrag(ev, segEl); return; }
            var move = function (e) {
                var r = laneMain.getBoundingClientRect();
                video.currentTime = playedFracToSrc((e.clientX - r.left) / r.width);
            };
            move(ev);
            var up = function () {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });
        var peekSeekPending = 0;
        laneMain.addEventListener('mousemove', function (ev) {
            if (ev.buttons) { peek.style.display = 'none'; return; }
            var r = laneMain.getBoundingClientRect();
            var srcT = playedFracToSrc((ev.clientX - r.left) / r.width);
            peek.style.display = 'block';
            peek.style.left = clamp(ev.clientX - 90, 8, window.innerWidth - 190) + 'px';
            peek.style.top = (r.top - 120) + 'px';
            peekLabel.textContent = fmt(srcT);
            var now = Date.now();
            if (now - peekSeekPending > 90) {
                peekSeekPending = now;
                try { peekVideo.currentTime = srcT; } catch (e) { /* not ready yet */ }
            }
        });
        laneMain.addEventListener('mouseleave', function () { peek.style.display = 'none'; });

        /* ---- Text lane: drag to retime, edge-drag to stretch, click for styles ---- */
        laneText.addEventListener('pointerdown', function (ev) {
            var block = ev.target.closest ? ev.target.closest('[data-textblock]') : null;
            if (!block) return;
            ev.preventDefault();
            var id = block.getAttribute('data-textblock');
            var txt = state.texts.filter(function (x) { return x.id === id; })[0];
            if (!txt) return;
            selectedText = id;
            lastSel = 'text';
            renderLanes();
            block = laneText.querySelector('[data-textblock="' + id + '"]');
            var br = block.getBoundingClientRect();
            var zone = ev.clientX - br.left < 9 ? 'left' : br.right - ev.clientX < 9 ? 'right' : 'move';
            var startX = ev.clientX;
            var origStart = txt.start;
            var origEnd = txt.end;
            var moved = false;
            var snapArmed = false;
            var move = function (e) {
                var dx = e.clientX - startX;
                if (Math.abs(dx) > 3) moved = true;
                if (!moved) return;
                if (!snapArmed) { armInputSnapshot(); snapArmed = true; }
                var r = laneText.getBoundingClientRect();
                var dt = (dx / r.width) * (totalPlayable() || 1);
                if (zone === 'move') {
                    var dur = origEnd - origStart;
                    txt.start = Math.max(0, Math.round((origStart + dt) * 10) / 10);
                    txt.end = Math.round((txt.start + dur) * 10) / 10;
                } else if (zone === 'left') {
                    txt.start = clamp(Math.round((origStart + dt) * 10) / 10, 0, origEnd - 0.2);
                } else {
                    txt.end = Math.max(txt.start + 0.2, Math.round((origEnd + dt) * 10) / 10);
                }
                renderLanes();
            };
            var up = function () {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                if (!moved) openStylePopup(id);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });

        /* ---- keyboard ---- */
        var onKey = function (ev) {
            var mod = ev.ctrlKey || ev.metaKey;
            if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
            if (mod && (ev.key === 'z' || ev.key === 'Z') && ev.shiftKey) { ev.preventDefault(); redo(); }
            else if (mod && (ev.key === 'z' || ev.key === 'Z')) { ev.preventDefault(); undo(); }
            else if (mod && (ev.key === 'y' || ev.key === 'Y')) { ev.preventDefault(); redo(); }
            else if (mod && (ev.key === 'b' || ev.key === 'B')) { ev.preventDefault(); splitAtPlayhead(); }
            else if (mod && (ev.key === 'c' || ev.key === 'C')) { ev.preventDefault(); copySeg(); }
            else if (mod && (ev.key === 'v' || ev.key === 'V')) { ev.preventDefault(); pasteSeg(); }
            else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); deleteSelected(); }
            else if (ev.key === ' ') { ev.preventDefault(); playBtn.click(); }
            else if (ev.key === 'Escape') {
                if (stylePop.classList.contains('is-open')) closeStylePopup();
                else if (lasso.on) setLasso(false);
                else if (tracker.mode !== 'off') setTrackerMode('off');
                else destroy();
            }
        };
        window.addEventListener('keydown', onKey);

        function destroy() {
            cancelAnimationFrame(tracker.raf);
            cancelAnimationFrame(walkerRaf);
            window.removeEventListener('keydown', onKey);
            // Flush any unsaved edits so closing never loses work.
            window.clearInterval(autoSavePoll);
            if (autoSaveTimer) window.clearTimeout(autoSaveTimer);
            if (lastSavedSnap !== null && snapshot() !== lastSavedSnap) {
                try { api.saveMeta(savePayload()); } catch (e) {}
            }
            video.pause();
            root.remove();
        }

        /* ---- boot ---- */
        video.addEventListener('loadedmetadata', function () {
            duration = video.duration || 0;
            api.loadMeta().then(function (meta) {
                state.segments = Array.isArray(meta.segments) && meta.segments.length
                    ? meta.segments.map(function (s) { return { from: Number(s.from) || 0, to: Number(s.to) || duration, speed: Number(s.speed) || 1, label: s.label || '' }; })
                    : [{ from: 0, to: duration, speed: 1, label: '' }];
                // Sanitize saved cuts: clamp into the video and drop
                // zero-length slivers — a bad part makes playback stall.
                state.segments = state.segments.map(function (s) {
                    return { from: clamp(s.from, 0, duration), to: clamp(s.to, 0, duration), speed: s.speed, label: s.label };
                }).filter(function (s) { return s.to - s.from >= 0.05; });
                if (!state.segments.length) state.segments = [{ from: 0, to: duration, speed: 1, label: '' }];
                state.texts = (meta.texts || []).map(function (t) {
                    return {
                        id: t.id || uid(), text: t.text || '', start: Number(t.start) || 0, end: Number(t.end) || 0,
                        x: Number(t.x) || 50, y: Number(t.y) || 50,
                        size: Number(t.size) || 1,
                        style: t.style && TEXT_STYLES[t.style] ? t.style : 'plain',
                        fadeIn: Number(t.fadeIn) || 0, fadeOut: Number(t.fadeOut) || 0,
                        behindMask: t.behindMask || ''
                    };
                });
                state.audio = (meta.audio || []).map(function (a) { return { file: a.file || '', at: Number(a.at) || 0, volume: a.volume != null ? Number(a.volume) : 1 }; });
                state.trackers = (meta.trackers || []).map(function (tr) { return { id: tr.id || uid(), label: tr.label || 'node', points: tr.points || [], mode: tr.mode === 'mobile' ? 'mobile' : 'desktop' }; });
                state.masks = (meta.masks || []).map(function (m) { return { id: m.id || uid(), label: m.label || 'cutout', t: Number(m.t) || 0, points: m.points || [] }; });
                state.comments = (meta.comments || []).map(function (c) {
                    return {
                        id: c.id || uid(), trackerId: c.trackerId || '', mode: c.mode === 'mobile' ? 'mobile' : 'desktop',
                        dx: Number(c.dx) || 0, dy: Number(c.dy) || 0, w: Number(c.w) || 20,
                        png: c.png || '', tint: c.tint || '#d9a15c', tintAmt: Number(c.tintAmt) || 0,
                        opacity: c.opacity != null ? Number(c.opacity) : 1, flip: Boolean(c.flip),
                        lines: Array.isArray(c.lines) ? c.lines.filter(Boolean) : [],
                        chance: c.chance != null ? Math.max(0, Math.min(1, Number(c.chance))) : 1,
                        start: Number(c.start) || 0, end: Number(c.end) || 0
                    };
                });
                state.position = meta.position && typeof meta.position === 'object'
                    ? {
                        desktop: Object.assign({ tx: 0, ty: 0, scaleX: 1, scaleY: 1 }, meta.position.desktop || {}),
                        mobile: Object.assign({ tx: 0, ty: 0, scaleX: 1, scaleY: 1 }, meta.position.mobile || {})
                    }
                    : { desktop: { tx: 0, ty: 0, scaleX: 1, scaleY: 1 }, mobile: { tx: 0, ty: 0, scaleX: 1, scaleY: 1 } };
                remountTexts();
                remountMarkers();
                remountCboxes();
                applyPosition();
                renderLanes();
                renderRows();
                lastSavedSnap = snapshot(); // arm auto-save against the loaded state
                timeEl.textContent = fmt(0) + ' / ' + fmt(duration);
                // Basic = auto: if nothing was ever positioned, detect and
                // center the character automatically (override by dragging).
                var pd = state.position.desktop;
                var pm = state.position.mobile;
                if (!pd.tx && !pd.ty && !pm.tx && !pm.ty && pd.scaleX === 1 && pd.scaleY === 1) {
                    window.setTimeout(doAutoPosition, 700);
                }
            });
        });
        video.addEventListener('error', function () { setStatus('Could not load the video file.', true); });
        setViewMode('desktop');
        setSiteMock(siteMock);
    }

    window.RiseCutsceneEditor = { open: open };
})();
