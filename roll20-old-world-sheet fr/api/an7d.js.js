// AN7D — Core Dice Roller (placeholder)
on('ready', ()=> log('AN7D API ready'));
// ==========================
// AN7D — Dice Roller (compact v3.2) — cache le header du chat
// ==========================
(() => {
  'use strict';
  on('ready', ()=> log('AN7D compact v3.2 ready'));

  // CONFIG
  const HEADER_MODE = 'blank';        // 'actor' ou 'blank' (blank = sans orateur)
  const HIDE_CHAT_HEADER = true;      // remonte la carte pour recouvrir la ligne du chat
  const CHAT_HEADER_SHIFT = -24;      // ajuster -18 à -28 px selon votre thème Roll20

  const THEME = {
    bg:'#efe9dd', ink:'#1d1a16', head1:'#7b1e1e', head2:'#5e1414',
    gold:'#c4a567', line:'#b79f7a', success:'#185b3a', mixed:'#8a6d00', fail:'#7b1e1e', violet:'#6c2bbf'
  };

  // ---- utils ----
  const clampInt = (v,min,max)=> Math.max(min, Math.min(max, parseInt(v,10) || 0));
  const parseArgs = (content)=>{
    const out = { _:[] }, parts = content.trim().split(/\s+--/);
    parts.forEach((chunk, idx)=>{
      if (idx===0){ const tail = chunk.replace(/^![^\s]+\s*/,'').trim(); if (tail) out._.push(tail); return; }
      const m = chunk.match(/^([a-zA-Z0-9_\-]+)(?:\s+(.+))?$/); if (!m) return;
      const k = m[1].toLowerCase(); const v = (m[2]||'').trim(); out[k] = v==='' ? true : v;
    });
    return out;
  };
  const getCharById = (cid)=> { try{ return getObj('character', cid) || null; }catch(e){ return null; } };
  const getAttrsAsync = (cid, names)=> { const r={}; names.forEach(n=> r[n]=getAttrByName(cid,n)||'0'); return Promise.resolve(r); };

  const d10 = ()=> (1+Math.floor(Math.random()*10));
  const onePassReroll = (arr, fn)=> arr.map(v=> fn(v) ? d10() : v);
  const countSuccesses = (arr, thr)=> arr.reduce((n,v)=> n + (v<=thr?1:0), 0);

  // ---- rendu compact (styles en 1 seule ligne) ----
  const renderCard = ({actorName, label, pool, thr, bonus, mode, baseRolls, finalRolls, successes, incantViolet=false})=>{
    const upshift = (HIDE_CHAT_HEADER && HEADER_MODE==='blank') ? `${CHAT_HEADER_SHIFT}px 0 0 0` : '0';
    const chip = (html,full=false,big=false)=>`<div style="display:inline-block;${full?'width:100%;':''}padding:${big?'10px 14px':'6px 10px'};border:1px solid ${THEME.line};${big?'border-radius:12px;':'border-radius:999px;'}background:#fff;font-weight:900;${big?'font-size:18px;':''}line-height:1;">${html}</div>`;
    const row  = (inner)=> `<div style="display:flex;gap:8px;flex-wrap:wrap;margin:4px 0 0;">${inner}</div>`;
    const dieTile = (v,{success=false,fail=false,violet=false}={})=>{
      let bg='#fff', br=THEME.line, col=THEME.ink;
      if (success){ bg='#e7f3ec'; br=THEME.success; col=THEME.success; }
      if (fail){    bg='#f7e7e7'; br=THEME.fail;    col=THEME.fail;    }
      if (violet){  bg='#efe7ff'; br=THEME.violet;  col=THEME.violet;  }
      return `<div style="display:inline-block;min-width:28px;padding:6px 8px;margin:2px;border:1px solid ${br};border-radius:8px;background:${bg};font-weight:800;text-align:center;">${v}</div>`;
    };
    const baseRow  = baseRolls.map(v=> dieTile(v,{success:v<=thr,fail:v>thr,violet:incantViolet&&v===9})).join('');
    const finalRow = finalRolls.map(v=> dieTile(v,{success:v<=thr,fail:v>thr,violet:incantViolet&&v===9})).join('');
    const rerolled = baseRolls.some((v,i)=> v!==finalRolls[i]);
    const ocTxt = successes<=0 ? 'Échec' : successes===1 ? 'Succès mitigé' : 'Succès complet';
    const ocCol = successes<=0 ? THEME.fail : successes===1 ? THEME.mixed : THEME.success;

    return (
      `<div style="background:${THEME.bg};border:1px solid ${THEME.line};border-radius:10px;overflow:hidden;padding:6px 8px;margin:${upshift};">
        ${row( chip(`${actorName||'PNJ'}`, true, true) )}
        ${row( chip(`${(label||'Test').toUpperCase()}`, true, true) )}
        ${row( chip(`<b>Action</b> : ${label||'Test'}`) + chip(`<b>Pool</b> : ${pool}`) )}
        ${row( chip(`<b>Seuil</b> : ${thr}`) + chip(`<b>Bonus</b> : ${bonus>=0?'+':''}${bonus}`) + chip(`<b>Mode</b> : ${mode}`) )}
        <div style="margin:4px 0 0;">${baseRow || '<em>Aucun dé</em>'}</div>
        ${rerolled ? `<div style="margin:2px 0 2px;">${finalRow}</div>` : ''}
        <div style="margin-top:6px;padding:12px;border:2px solid ${ocCol};border-radius:12px;background:#fff;font-weight:900;color:${ocCol};text-align:center;font-size:18px;">${ocTxt} — ${successes} succès</div>
      </div>`
    );
  };

  const postToChat = ({html, cid})=>{
    if (HEADER_MODE === 'actor' && cid){
      sendChat(`character|${cid}`, '/direct ' + html, null, {noarchive:true});
    } else {
      // nom vraiment vide (évite les ":" parasites) + /direct
      sendChat('', '/direct ' + html, null, {noarchive:true});
    }
  };

  // ---- coeur des jets PJ ----
  const runAn7d = async ({cid, carac, skill, label='Test', mode='standard', bonus=0, incantation=false})=>{
    const c = getCharById(cid); if (!c) throw new Error('Personnage introuvable (cid).');
    const names = []; if (carac) names.push(carac); if (skill) names.push(skill);
    const vals = await getAttrsAsync(cid, names);
    const caracVal = parseInt(vals[carac]||'0',10)||0;
    const skillVal = parseInt(vals[skill]||'0',10)||0;
    const pool = Math.max(0, caracVal + clampInt(bonus,-99,99));
    const thr  = Math.max(0, Math.min(10, skillVal));
    const baseRolls = Array.from({length: pool}, d10);
    let finalRolls = baseRolls;
    if (mode==='glorieux')     finalRolls = onePassReroll(baseRolls, v=> v>thr);
    else if (mode==='funeste') finalRolls = onePassReroll(baseRolls, v=> v<=thr);
    const successes = countSuccesses(finalRolls, thr);
    return { actorName:c.get('name'), label, pool, thr, bonus:clampInt(bonus,-99,99), mode, baseRolls, finalRolls, successes, incantViolet:incantation };
  };

  // ---- commandes ----
  on('chat:message', async (msg)=>{
    if (msg.type !== 'api') return;
    try{
      if (msg.content.startsWith('!an7d-ping')){
        postToChat({html:`<div style="background:${THEME.bg};border:1px solid ${THEME.line};border-radius:8px;padding:6px 8px;"><b>API OK</b> — AN7D v3.2.</div>`});
        return;
      }

      if (msg.content.startsWith('!an7d-incantation')){
        const a = parseArgs(msg.content);
        const cid   = a.cid || a.character || a.char || '';
        const label = a.label || 'Incantation';
        const mode  = (a.mode||'standard').toLowerCase();
        const bonus = clampInt(a.bonus||0,-99,99);
        if (!cid){ sendChat('GM', `/w "${msg.who}" Erreur : ajoute --cid @{character_id}`); return; }
        const data = await runAn7d({cid, carac:'i', skill:'volonte', label, mode, bonus, incantation:true});
        postToChat({html:renderCard(data), cid});
        return;
      }

      if (msg.content.startsWith('!an7d-code')){
        const parseXdY = (s)=>{ const m=String(s||'').trim().match(/^(\d+)\s*[dD]\s*(\d+)$/); if(!m) return null;
          return { pool: Math.max(0, parseInt(m[1],10)||0), thr: Math.max(0, Math.min(10, parseInt(m[2],10)||0)) }; };
        const a = parseArgs(msg.content);
        const cid   = a.cid || a.character || a.char || '';
        const label = a.label || 'Test PNJ';
        const code  = a.code  || '1D1';
        const mode  = (a.mode||'standard').toLowerCase();
        const bonus = clampInt(a.bonus||0,-99,99);
        if (!cid){ sendChat('GM', `/w "${msg.who}" Erreur : ajoute --cid @{character_id}`); return; }
        const p = parseXdY(code); if(!p){ sendChat('GM', `/w "${msg.who}" Code invalide (XdY)`); return; }
        const pool = Math.max(0, p.pool + bonus);
        const thr  = p.thr;
        const base = Array.from({length: pool}, d10);
        let final = base;
        if (mode==='glorieux') final = onePassReroll(base, v=> v>thr);
        else if (mode==='funeste') final = onePassReroll(base, v=> v<=thr);
        const succ = countSuccesses(final, thr);
        const c    = getCharById(cid);
        postToChat({
          html:renderCard({
            actorName: c ? c.get('name') : 'PNJ',
            label, pool, thr, bonus:clampInt(bonus,-99,99), mode,
            baseRolls: base, finalRolls: final, successes: succ
          }),
          cid
        });
        return;
      }

      if (msg.content.startsWith('!an7d')){
        const a = parseArgs(msg.content);
        const cid   = a.cid || a.character || a.char || '';
        const carac = (a.carac||'').toLowerCase();
        const skill = (a.skill||'').toLowerCase();
        const label = a.label || 'Test';
        const mode  = (a.mode||'standard').toLowerCase();
        const bonus = clampInt(a.bonus||0,-99,99);
        if (!cid){ sendChat('GM', `/w "${msg.who}" Erreur : ajoute --cid @{character_id}`); return; }
        if (!carac || !skill){ sendChat('GM', `/w "${msg.who}" Erreur : manque --carac / --skill`); return; }
        const data = await runAn7d({cid, carac, skill, label, mode, bonus});
        postToChat({html:renderCard(data), cid});
        return;
      }

    }catch(err){
      sendChat('GM', `/w "${msg.who}" Erreur AN7D : ${err.message||err}`);
    }
  });
})();
