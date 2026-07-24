const puppeteer = require('d:/Jasons Web/node_modules/puppeteer');
const URL = process.env.CONTENT_URL || 'http://localhost:4619/content';
const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

function programFor(uid, audience) {
  const dow = new Date().getDay(), o = (dow + 2) % 7, a = (dow + 4) % 7;
  return { v: 2, uid, path: 'quick', setupDone: true, startDate: ymd(new Date()), dayZeroDone: true, levelIdx: 0, appWeekday: a,
    answered: { audience, outcome: 'get strong again', core: 'strength first', voice: 'blunt', mistake1: 'do endless cardio', mistake2: 'skip protein', mistake3: 'program-hop', turning_point: 'built a system', has_proof: 'client', proofName: 'J.', proofResult: 'down 24 lbs', proofBelief: 'no time', objection: 'no time', days: { days: [dow, o, a].sort((x, y) => x - y) } },
    overrides: {}, checkins: {}, storiesDone: {}, editLog: [], postStats: {}, personalTakes: {}, reminderTime: '18:00', lastPack: 0, answered_meta: {}, draft: null, updatedAt: Date.now() };
}

async function mkPage(b, user, profileStore) {
  const p = await b.newPage();
  p._errs = []; p.on('pageerror', e => p._errs.push(e.message.slice(0, 100)));
  await p.setViewport({ width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.setRequestInterception(true);
  p.on('request', req => {
    const u = req.url();
    if (u.includes('/api/auth/me')) return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ user, impersonation: null }) });
    if (u.endsWith('/api/profile') && req.method() === 'GET') return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ profile: { profile: profileStore.data } }) });
    if (u.endsWith('/api/profile')) { try { const bd = JSON.parse(req.postData() || '{}'); if (bd.profile) Object.assign(profileStore.data, bd.profile); } catch (e) {} return req.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' }); }
    req.continue();
  });
  return p;
}

(async () => {
  const b = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const results = [];
  const ok = (name, cond, detail) => { results.push((cond ? 'PASS' : 'FAIL') + '  ' + name + (detail ? '  → ' + detail : '')); };

  // ============ TEST 1: cross-account bleed (A → B) ============
  {
    const storeA = { data: { content_program_v2: programFor('userA', 'men over 30') } };
    const userA = { id: 'userA', username: 'trainerA', displayName: 'Trainer A', isTrainer: true, trainer: { active: true } };
    let p = await mkPage(b, userA, storeA);
    await p.goto(URL, { waitUntil: 'networkidle2' });
    // simulate legacy contaminated storage: un-keyed key with A's program
    await p.evaluate((prog) => { localStorage.clear(); localStorage.setItem('ode_content_program_v2', JSON.stringify(prog)); }, programFor('userA', 'men over 30'));
    await p.reload({ waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1200));
    await p.close();
    // now user B, same "browser" (same localStorage would persist — emulate by rebuilding contaminated state then loading as B with EMPTY profile)
    const storeB = { data: {} };
    const userB = { id: 'userB', username: 'trainerB', displayName: 'Trainer B', isTrainer: true, trainer: { active: true } };
    p = await mkPage(b, userB, storeB);
    await p.goto(URL, { waitUntil: 'networkidle2' });
    await p.evaluate((prog) => { localStorage.clear(); localStorage.setItem('ode_content_program_v2', JSON.stringify(prog)); localStorage.setItem('ode_content_program_v2:userA', JSON.stringify(prog)); }, programFor('userA', 'men over 30'));
    await p.reload({ waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1200));
    const bleed = await p.evaluate(() => ({
      dom: document.body.innerHTML.indexOf('men over 30') !== -1 || document.body.innerHTML.indexOf('trainerA') !== -1,
      unkeyed: localStorage.getItem('ode_content_program_v2') !== null,
      foreignKey: localStorage.getItem('ode_content_program_v2:userA') !== null,
      // A fresh TRAINER now sees the upgrade interstitial; a non-trainer would
      // see the path chooser. Either is an empty program (no bleed).
      seesGate: /Two ways to start/.test(document.getElementById('cp-root').innerText) || /upgraded onboarding/.test(document.getElementById('cp-root').innerText)
    }));
    ok('0.1 B sees empty program (interstitial/chooser, no bleed)', bleed.seesGate);
    ok('0.1 no A strings in B DOM', !bleed.dom);
    ok('0.1 un-keyed key deleted', !bleed.unkeyed);
    ok('0.1 foreign per-user key deleted', !bleed.foreignKey);
    await p.close();
  }

  // ============ TEST 2: redo draft — abandon keeps live program ============
  {
    const store = { data: { content_program_v2: programFor('userC', 'men over 30') } };
    const userC = { id: 'userC', username: 'trainerC', displayName: 'Trainer C', isTrainer: true, trainer: { active: true } };
    let p = await mkPage(b, userC, store);
    await p.goto(URL, { waitUntil: 'networkidle2' }); await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1200));
    // start redo
    await p.evaluate(() => { const btn = [...document.querySelectorAll('.cp-btn')].find(x => /Redo my program/.test(x.textContent)); btn && btn.click(); });
    await new Promise(r => setTimeout(r, 400));
    await p.evaluate(() => { const btn = [...document.querySelectorAll('.cp-pathopt .cp-btn')].find(x => /quick/i.test(x.textContent)); btn && btn.click(); });
    await new Promise(r => setTimeout(r, 400));
    // advance: intro → Q1, change audience to something new
    await p.evaluate(() => { const btn = [...document.querySelectorAll('.cp-sticky .cp-btn')].find(x => /Continue/.test(x.textContent)); btn && btn.click(); });
    await new Promise(r => setTimeout(r, 300));
    await p.evaluate(() => { const el2 = document.querySelector('.cp-qinput input'); if (el2) { el2.value = 'women over 50'; el2.dispatchEvent(new Event('input', { bubbles: true })); } });
    await new Promise(r => setTimeout(r, 100));
    await p.evaluate(() => { const btn = [...document.querySelectorAll('.cp-sticky .cp-btn')].find(x => /Next/.test(x.textContent)); btn && btn.click(); });
    await new Promise(r => setTimeout(r, 300));
    const liveDuringRedo = await p.evaluate(() => window.__cpTest.getState().answered.audience);
    ok('0.2 live program untouched during redo', liveDuringRedo === 'men over 30', 'live audience=' + liveDuringRedo);
    // reload mid-redo → resumes questionnaire
    await p.reload({ waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 1200));
    const afterReload = await p.evaluate(() => ({ isQ: !!document.querySelector('.cp-qh') || !!document.querySelector('.cp-title'), banner: /redo in progress/i.test(document.getElementById('cp-root').innerText) }));
    ok('0.2 reload mid-redo resumes questionnaire', afterReload.isQ);
    ok('0.2 redo banner with Continue/Discard', afterReload.banner);
    // discard → dashboard with ORIGINAL program
    await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === 'Discard'); btn && btn.click(); });
    await new Promise(r => setTimeout(r, 300));
    await p.evaluate(() => { const btn = [...document.querySelectorAll('#cp-modal .cp-btn-primary')].find(x => /Discard the redo/.test(x.textContent)); btn && btn.click(); });
    await new Promise(r => setTimeout(r, 500));
    const afterDiscard = await p.evaluate(() => ({ dash: !!document.querySelector('.cp-today'), audience: window.__cpTest.getState().answered.audience, draft: window.__cpTest.getState().draft }));
    ok('0.2 discard → dashboard, original intact', afterDiscard.dash && afterDiscard.audience === 'men over 30' && !afterDiscard.draft, 'audience=' + afterDiscard.audience);
    await p.close();
  }

  // ============ TEST 3: voice mapping + audience_short generator behavior ============
  {
    const store = { data: {} };
    const userD = { id: 'userD', username: 'trainerD', displayName: 'Trainer D', isTrainer: true, trainer: { active: true } };
    const p = await mkPage(b, userD, store);
    await p.goto(URL, { waitUntil: 'networkidle2' }); await p.evaluate(() => localStorage.clear());
    await p.reload({ waitUntil: 'networkidle2' }); await new Promise(r => setTimeout(r, 800));
    const vk = await p.evaluate(() => {
      const T = window.__cpTest; const out = {};
      ['blunt', 'warm', 'funny', 'technical'].forEach(v => { T.setProfile({ answered: { voice: v } }); out[v] = T.voiceKey(); });
      T.setProfile({ answered: { voice: 'direct' } }); out.legacy_direct = T.voiceKey();
      return out;
    });
    ok('1.1 voice maps to own key', vk.blunt === 'blunt' && vk.warm === 'warm' && vk.funny === 'funny' && vk.technical === 'technical', JSON.stringify(vk));
    ok('1.1 legacy direct → blunt', vk.legacy_direct === 'blunt');
    // audience_short: long audience + short → hooks use short, guard stops collapsing
    const hooks = await p.evaluate(() => {
      const T = window.__cpTest;
      const long = 'men over 35, mostly desk-job guys who used to be athletes';
      T.setProfile({ answered: { audience: long, audience_short: 'men over 35', voice: 'blunt', mistake1: 'do endless cardio', outcome: 'get strong again' }, setupDone: true, dayZeroDone: true });
      const withShort = [0, 1, 2, 3, 4, 5].map(i => T.hookLine(i, 'do endless cardio'));
      T.setProfile({ answered: { audience: long, voice: 'blunt', mistake1: 'do endless cardio', outcome: 'get strong again' }, setupDone: true, dayZeroDone: true });
      const noShort = [0, 1, 2, 3].map(i => T.hookLine(i, 'do endless cardio'));
      return { withShort, noShort };
    });
    const shortUsed = hooks.withShort.some(h => h.includes('men over 35') && !h.includes('desk-job'));
    const collapsed = new Set(hooks.withShort).size;
    ok('1.2 hooks use audience_short inline', shortUsed, hooks.withShort[0]);
    ok('1.2 guard no longer collapses (distinct hooks)', collapsed >= 4, collapsed + ' distinct of 6');
    await p.close();
  }


  // ============ TEST 4 (addendum C+D): seeded demo — praised features stay ============
  {
    const uid='demoT'; const prog=programFor(uid,'men over 35');
    for(let i=12;i>=1;i--){ const d=new Date(); d.setDate(d.getDate()-i); const k=ymd(d);
      prog.checkins[k]={posted:true,stories:'yes',reason:''}; }
    prog.startDate=(()=>{const d=new Date(); d.setDate(d.getDate()-13); return ymd(d);})();
    prog.personalTakes={'soreness-means-it-worked':'Soreness means new, not effective.'};
    const store={data:{content_program_v2:prog}};
    const user={id:uid,username:'demotrainer',displayName:'Demo Trainer',isTrainer:true,trainer:{active:true,fullName:'Marcus Reyes'}};
    const p=await mkPage(b,user,store);
    await p.goto(URL,{waitUntil:'networkidle2'}); await p.evaluate(()=>localStorage.clear());
    await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,1400));
    const d=await p.evaluate(()=>{const root=document.getElementById('cp-root'); const t=root.innerText;
      return { badge:/135|225|315|405/.test(t)&&/Bar work|Working sets|Heavy|Max effort/.test(t),
        strip:document.querySelectorAll('.cp-day-cell').length===14,
        stories:document.querySelectorAll('.cp-story').length>=5,
        humanStory:/Up\. Moving\. Before the day gets a vote\.|5:40|First one in again/.test(t),
        compliance:/\d+%/.test(t), streakShown:/Streak: \d+/.test(t),
        ctaName:/Marcus Reyes/.test(t),
        objObj:/\[object Object\]|undefined/.test(t) };});
    ok('C seeded dashboard renders level badge', d.badge);
    ok('D 14-day strip intact', d.strip);
    ok('D 5 story slots render', d.stories);
    ok('D human story line intact', d.humanStory);
    ok('C compliance % + streak show with data', d.compliance && d.streakShown);
    ok('0.4 CTA uses full name (Marcus Reyes)', d.ctaName);
    ok('no bad tokens on seeded dashboard', !d.objObj);
    await p.evaluate(()=>{const c=[...document.querySelectorAll('.cp-day-cell.editable')][0]; c&&c.click();});
    await new Promise(r=>setTimeout(r,300));
    await p.evaluate(()=>{const s2=[...document.querySelectorAll('#cp-modal .cp-btn-primary')].find(x=>/Save this day/.test(x.textContent)); s2&&s2.click();});
    await new Promise(r=>setTimeout(r,200));
    const reasonReq=await p.evaluate(()=>/why|required|one line/i.test((document.querySelector('#cp-modal .cp-err')||{}).textContent||''));
    ok('D edit-future-day requires a reason', reasonReq);
    const mob=await p.evaluate(()=>{
      const vis=el=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0;};
      const own=[...document.querySelectorAll('#cp-root a,#cp-root button,#cp-root input,#cp-root textarea')].filter(vis);
      const small=own.filter(el=>{const r=el.getBoundingClientRect();return r.height<44;}).length;
      const tiny=[...document.querySelectorAll('#cp-root input,#cp-root textarea')].filter(vis).filter(el=>parseFloat(getComputedStyle(el).fontSize)<16).length;
      return {small,tiny,over:document.documentElement.scrollWidth>document.documentElement.clientWidth};});
    ok('P3 content-owned controls >=44px @375', mob.small===0, mob.small+' small');
    ok('P3 content inputs >=16px @375', mob.tiny===0);
    ok('P3 no horizontal overflow @375', !mob.over);
    await p.close();
  }


  // ============ TEST 5 (v11): Hook Day gating + validation + rotation ============
  {
    const store={data:{}}; const user={id:'hk1',username:'hooktrainer',displayName:'Hook T',isTrainer:true,trainer:{active:true}};
    const p=await mkPage(b,user,store);
    await p.goto(URL,{waitUntil:'networkidle2'}); await p.evaluate(()=>localStorage.clear());
    await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,700));
    const hk=await p.evaluate(()=>{
      const T=window.__cpTest; const today=T.today();
      const dow=new Date().getDay(); // local, matches parseYmd semantics
      T.setProfile({ answered:{audience:'men over 35',voice:'blunt',mistake1:'do endless cardio',days:{days:[dow]}}, setupDone:true, dayZeroDone:true, levelIdx:0, hookDay:dow });
      const at135=T.isHookDay(today,'mistake');
      T.setProfile({ answered:{audience:'men over 35',voice:'blunt',mistake1:'do endless cardio',days:{days:[dow]}}, setupDone:true, dayZeroDone:true, levelIdx:1, hookDay:dow, appWeekday:(dow+3)%7 });
      const at225=T.isHookDay(today,'mistake');
      const rejYou=T.validTrainerHook('you are doing cardio wrong');
      const rejNoGroup=T.validTrainerHook('most people are stuck on cardio forever');
      const okHook=T.validTrainerHook('men over 35 are stuck because they do endless cardio');
      const st=window.__cpTest.getState();
      st.overrides={}; st.overrides[today]={type:'mistake',reason:'t'};
      st.hookChoices={}; st.hookChoices[today]={source:'trainer',text:'men over 35: the cardio trap',trainerHookId:7};
      const sc=T.scriptFor(today);
      return {at135,at225,rejYou:!!rejYou,rejNoGroup:!!rejNoGroup,okHook:okHook===''||okHook===undefined,choiceUsed:sc.hook==='men over 35: the cardio trap',src:sc.hookSource,hid:sc.trainerHookId};
    });
    ok('v11 Hook Day locked at 135', !hk.at135);
    ok('v11 Hook Day unlocked at 225+', hk.at225);
    ok('v11 "you" hook rejected', hk.rejYou);
    ok('v11 no-group hook rejected', hk.rejNoGroup);
    ok('v11 valid group hook accepted', hk.okHook);
    ok('v11 chosen trainer hook overrides + stamps source', hk.choiceUsed && hk.src==='trainer' && hk.hid===7, JSON.stringify({src:hk.src}));
    await p.close();
  }


  // ============ TEST 6 (v11 Part 1): voices, profanity gate, pinned story ============
  {
    const store={data:{}}; const user={id:'vc1',username:'voicet',displayName:'Voice T',isTrainer:true,trainer:{active:true}};
    const p=await mkPage(b,user,store);
    await p.goto(URL,{waitUntil:'networkidle2'}); await p.evaluate(()=>localStorage.clear());
    await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,700));
    const v=await p.evaluate(()=>{
      const T=window.__cpTest; const today=T.today();
      function prof(voice,profanity){ T.setProfile({answered:{audience:'men over 35',voice:voice,profanity:profanity,mistake1:'do endless cardio',days:{days:[1,3,5]}},setupDone:true,dayZeroDone:true});
        // h_not_lazy is index 5 in the hooks array
        return T.hookLine(5,'do endless cardio'); }
      const cleanBlunt=prof('blunt','no');
      const dirtyBlunt=prof('blunt','some');
      const dirtyWarm=prof('warm','freely');
      // pinned story line: blunt morning slot
      T.setProfile({answered:{audience:'men over 35',voice:'blunt',core:'strength first',days:{days:[1,3,5]}},setupDone:true,dayZeroDone:true});
      const stories=T.storiesFor(today).map(x=>x.line).join(' | ');
      T.setProfile({answered:{audience:'men over 35',voice:'warm',core:'strength first',days:{days:[1,3,5]}},setupDone:true,dayZeroDone:true});
      const storiesWarm=T.storiesFor(today).map(x=>x.line).join(' | ');
      // reframe question identical across voices
      function reframe(voice){ T.setProfile({answered:{audience:'men over 35',voice:voice,days:{days:[1,3,5]}},setupDone:true,dayZeroDone:true,overrides:{[today]:{type:'reframe',reason:'t'}}}); const sc=T.scriptFor(today); return sc.hook||''; }
      const rb=reframe('blunt'), rt=reframe('technical');
      const q='would you be happy?';
      return { cleanBlunt, dirtyBlunt, dirtyWarm,
        profWorks: dirtyBlunt.indexOf('shit')!==-1 && cleanBlunt.indexOf('shit')===-1 && dirtyWarm.indexOf('shit')===-1,
        pinned: /Up\. Moving\. Before the day gets a vote\./.test(stories),
        storiesDiffer: stories!==storiesWarm,
        reframeSameQ: rb.indexOf(q)!==-1 && rt.indexOf(q)!==-1 && rb!==rt };
    });
    ok('v11p1 profanity only on sometimes/freely + blunt/funny', v.profWorks, JSON.stringify({clean:v.cleanBlunt.slice(0,40),dirty:v.dirtyBlunt.slice(0,40)}));
    ok('v11p1 pinned line survives: "Up. Moving…"', v.pinned);
    ok('v11p1 stories differ across voices', v.storiesDiffer);
    ok('v11p1 reframe question identical, follow-through varies', v.reframeSameQ);
    await p.close();
  }


  // ============ TEST 7 (v12): field-state invariants, name unification, pronouns ============
  {
    const uid='v12t'; const prog=programFor(uid,'men over 30');
    prog.answered.turning_point='blew out my back at 38 and had to learn to move again';
    prog.answered.proof_pronoun='he'; prog.answered.proofName='Dave';
    const store={data:{content_program_v2:prog}};
    const user={id:uid,username:'handle12',displayName:'handle12',isTrainer:true,trainer:{active:true,fullName:'Marcus Delgado'}};
    const p=await mkPage(b,user,store);
    await p.goto(URL,{waitUntil:'networkidle2'}); await p.evaluate(()=>localStorage.clear());
    await p.reload({waitUntil:'networkidle2'}); await new Promise(r=>setTimeout(r,1200));
    // 3 — signup handle in ZERO generated strings across a week + pins
    const gen=await p.evaluate(()=>{
      const T=window.__cpTest; const start=T.today(); const chunks=[];
      for(let i=0;i<7;i++){ const s=T.scriptFor(T.addDays(start,i)); chunks.push(s.hook||'',s.cta||''); (s.beats||[]).forEach(b2=>chunks.push(b2.job)); }
      T.storiesFor(start).forEach(x=>chunks.push(x.line));
      chunks.push(T.ctaText());
      return chunks.join(' || ');
    });
    ok('v12 3 signup handle in zero generated strings', gen.indexOf('handle12')===-1);
    ok('v12 3 full name present in CTA', /Marcus Delgado/.test(gen));
    // 4 — pronoun: he-client → win hook says he/was, not they/were
    const win=await p.evaluate(()=>{
      const T=window.__cpTest; const start=T.today(); const st=window.__cpTest.getState();
      st.overrides={}; st.overrides[start]={type:'win',reason:'t'};
      return T.scriptFor(start).hook||'';
    });
    ok('v12 4 named he-client uses he/was in win hook', /\bhe was\b|\bhe walked\b|\bhe believed\b/i.test(win) && !/\bthey were\b/i.test(win), win.slice(0,70));
    // 1/2 — redo field invariants with REAL keyboard
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('.cp-btn')].find(x=>/Redo my program/.test(x.textContent)); btn&&btn.click();});
    await new Promise(r=>setTimeout(r,300));
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('.cp-pathopt .cp-btn')].find(x=>/quick/i.test(x.textContent)); btn&&btn.click();});
    await new Promise(r=>setTimeout(r,300));
    await p.evaluate(()=>{const btn=[...document.querySelectorAll('.cp-sticky .cp-btn')].find(x=>/Continue/.test(x.textContent)); btn&&btn.click();});
    await new Promise(r=>setTimeout(r,300));
    const disp=await p.evaluate(()=>{const el2=document.querySelector('.cp-qinput input'); return el2?el2.value:null;});
    ok('v12 1 redo field DISPLAYS the stored answer', disp==='men over 30', JSON.stringify(disp));
    await p.focus('.cp-qinput input');
    await p.keyboard.down('Control'); await p.keyboard.press('a'); await p.keyboard.up('Control');
    await p.keyboard.type('women over 50',{delay:15});
    await new Promise(r=>setTimeout(r,750));
    const typed=await p.evaluate(()=>{const el2=document.querySelector('.cp-qinput input'); const st=window.__cpTest.getState(); return {field:el2.value,draft:st.draft&&st.draft.answers.audience};});
    ok('v12 1 typed replacement stores EXACTLY what was typed', typed.field==='women over 50'&&typed.draft==='women over 50', JSON.stringify(typed));
    ok('v12 2 no prefix characters that were not typed', !/^[a-z]women/.test(typed.field));
    await p.close();
  }

  console.log(results.join('\n'));
  const fails = results.filter(r => r.startsWith('FAIL')).length;
  console.log('\n' + (fails ? fails + ' FAILURES' : 'ALL PASS'));
  await b.close();
  process.exit(fails ? 1 : 0);
})();
