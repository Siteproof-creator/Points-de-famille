(function(){
'use strict';
var $app=document.getElementById('app'), $sheet=document.getElementById('sheetRoot'), $toast=document.getElementById('toast');
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var uid=function(){try{return crypto.randomUUID();}catch(e){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});}};
var COLL=['members','entries','rewards','redemptions','tasks','family','pots','potMembers','potRewards'];
var S={}, ready={};
COLL.forEach(function(c){S[c]=[];});
var store=null, sb=null, slow=false, dirty=false, booted=false, bootError='', offline=false, welcomeMode='join', familyId=null, rt=null, poll=null, refreshTimer=null;
var CFG=window.PF_CONFIG||{};
var TABLE={members:'members',entries:'entries',rewards:'rewards',redemptions:'redemptions',tasks:'tasks',family:'families',pots:'pots',potMembers:'pot_members',potRewards:'pot_rewards'};
var JOIN_ERR={bad_code:'Code de famille incorrect.',no_profile:'Aucun profil à ce prénom. Demande à un adulte de t’ajouter dans l’onglet Famille.',throttled:'Trop d’essais. Réessaie dans quelques minutes.',not_signed_in:'Connexion impossible. Réessaie.'};
var sess=null, tab='home', rankPeriod='week', sheet=null, toastTimer=null;
var photoCache={}, photoLoading={}, earnPhoto=null;
var HUES=[168,22,205,340,48,262,120,0];

/* ---------- helpers ---------- */
var mById=function(id){return S.members.find(function(m){return m.id===id;});};
var isAdult=function(m){return !!m && m.role==='adult';};
var sum=function(a,f){return a.reduce(function(t,x){return t+f(x);},0);};
var total=function(id){return sum(S.entries.filter(function(e){return e.memberId===id&&e.status==='approved';}),function(e){return e.points;});};
var spent=function(id){return sum(S.redemptions.filter(function(r){return r.memberId===id&&r.status!=='rejected';}),function(r){return r.cost;});};
var balance=function(id){return total(id)-spent(id)-locked(id);};
var waiting=function(id){return sum(S.entries.filter(function(e){return e.memberId===id&&e.status==='pending';}),function(e){return e.points;});};
var pendingCount=function(){return S.entries.filter(function(e){return e.status==='pending';}).length+S.redemptions.filter(function(r){return r.status==='pending';}).length+S.pots.filter(function(p){return potLive(p)&&(p.status==='pending'||p.status==='claiming');}).length;};
var sg=function(n){return n>0?'+'+n:n<0?'−'+Math.abs(n):'0';};
var ptsWord=function(n){return Math.abs(n)>1?'points':'point';};
function periodStart(p){
  var d=new Date(); d.setHours(0,0,0,0);
  if(p==='week'){ d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); }
  if(p==='month'){ d.setDate(1); return d.getTime(); }
  return 0;
}
function periodScore(id,p){
  var t=periodStart(p);
  return sum(S.entries.filter(function(e){return e.memberId===id&&e.status==='approved'&&(e.decidedTs||e.ts||0)>=t;}),function(e){return e.points;});
}
function ago(ts){
  var s=(Date.now()-ts)/1000;
  if(s<60) return "à l'instant";
  if(s<3600) return 'il y a '+Math.floor(s/60)+' min';
  if(s<86400) return 'il y a '+Math.floor(s/3600)+' h';
  return new Date(ts).toLocaleDateString('fr-FR',{day:'numeric',month:'short'});
}
/* ---------- avatars personnalisés ---------- */
var AV={
  bg:['#bfe9dc','#ffd9b3','#cfe0ff','#ffc8dd','#fff0a6','#dcd0ff','#c9f0a8','#e6e6ea'],
  skin:['#fde0c8','#f5c6a0','#e0a878','#c68642','#8d5524','#5a3a22'],
  hairc:['#2b1d14','#5a3825','#b5651d','#e8b84a','#c0392b','#8e8e93','#3b82f6','#ec4899'],
  outc:['#e74c3c','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#374151'],
  hair:['Chauve','Courts','Pointus','Longs','Carré','Afro','Chignon','Queue','Couettes'],
  eyes:['Ronds','Contents','Grands'],
  mouth:['Sourire','Grand sourire','Sérieux'],
  outfit:['T-shirt','Capuche','Rayures','Chemise','Héros','Salopette'],
  acc:['Aucun','Lunettes','Soleil','Casquette','Nœud','Couronne','Boucles','Taches']
};
var AV_DEF={b:0,s:1,h:1,hc:1,e:0,m:0,o:0,oc:1,a:0};
function avParse(v){
  if(!v||v.charAt(0)!=='{') return null;
  try{ var o=JSON.parse(v), r={}; Object.keys(AV_DEF).forEach(function(k){ var n=o[k]|0; r[k]=n<0?0:n; }); return r; }catch(x){ return null; }
}
function avLimit(c){
  return {b:c.b%AV.bg.length,s:c.s%AV.skin.length,h:c.h%AV.hair.length,hc:c.hc%AV.hairc.length,e:c.e%AV.eyes.length,m:c.m%AV.mouth.length,o:c.o%AV.outfit.length,oc:c.oc%AV.outc.length,a:c.a%AV.acc.length};
}
function avSvg(cfg){
  var c=avLimit(cfg), sk=AV.skin[c.s], hc=AV.hairc[c.hc], oc=AV.outc[c.oc], ink='#2a1f1a', back='', front='', body='', face='', acc='';
  var fringe='<path d="M29 42Q30 25 50 24Q70 25 71 42Q60 32 50 34Q40 32 29 42Z" fill="'+hc+'"/>';
  var cap='<path d="M29 41Q30 22 50 22Q70 22 71 41Q60 33 50 33Q40 33 29 41Z" fill="'+hc+'"/>';
  switch(c.h){
    case 1: front=cap; break;
    case 2: front='<path d="M29 42L31 24L39 32L44 18L50 30L57 18L61 32L69 24L71 42Q62 32 50 33Q38 32 29 42Z" fill="'+hc+'"/>'; break;
    case 3: back='<path d="M27 44Q24 16 50 18Q76 16 73 44L76 80Q64 84 62 70L38 70Q36 84 24 80Z" fill="'+hc+'"/>'; front=fringe; break;
    case 4: back='<path d="M26 46Q23 16 50 17Q77 16 74 46L74 62Q72 66 66 62L34 62Q28 66 26 62Z" fill="'+hc+'"/>'; front=fringe; break;
    case 5: back='<g fill="'+hc+'"><circle cx="30" cy="34" r="10"/><circle cx="40" cy="24" r="11"/><circle cx="52" cy="22" r="11"/><circle cx="63" cy="25" r="11"/><circle cx="72" cy="36" r="10"/><circle cx="27" cy="46" r="7"/><circle cx="73" cy="46" r="7"/></g>'; front='<path d="M31 40Q50 27 69 40Q50 33 31 40Z" fill="'+hc+'"/>'; break;
    case 6: back='<circle cx="50" cy="16" r="9" fill="'+hc+'"/>'; front=cap; break;
    case 7: back='<path d="M68 38Q88 36 83 64Q80 72 74 63Q79 48 66 46Z" fill="'+hc+'"/>'; front=cap; break;
    case 8: back='<circle cx="22" cy="54" r="9" fill="'+hc+'"/><circle cx="78" cy="54" r="9" fill="'+hc+'"/>'; front=cap+'<circle cx="29" cy="46" r="2.5" fill="'+oc+'"/><circle cx="71" cy="46" r="2.5" fill="'+oc+'"/>'; break;
  }
  switch(c.o){
    case 0: body='<path d="M14 100Q16 76 38 74L62 74Q84 76 86 100Z" fill="'+oc+'"/><path d="M42 74Q50 82 58 74Z" fill="'+sk+'"/>'; break;
    case 1: body='<path d="M14 100Q16 76 38 74L62 74Q84 76 86 100Z" fill="'+oc+'"/><path d="M33 76Q50 92 67 76Q60 70 50 70Q40 70 33 76Z" fill="#000" opacity=".22"/><path d="M42 74Q50 82 58 74Z" fill="'+sk+'"/><path d="M45 81L45 93M55 81L55 93" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'; break;
    case 2: body='<path d="M14 100Q16 76 38 74L62 74Q84 76 86 100Z" fill="'+oc+'"/><path d="M20 84L80 84M17 92L83 92" stroke="#fff" stroke-width="3" opacity=".7"/><path d="M42 74Q50 82 58 74Z" fill="'+sk+'"/>'; break;
    case 3: body='<path d="M14 100Q16 76 38 74L62 74Q84 76 86 100Z" fill="'+oc+'"/><path d="M42 74L50 87L43 90Z M58 74L50 87L57 90Z" fill="#fff"/><circle cx="50" cy="93" r="1.6" fill="#fff"/>'; break;
    case 4: body='<path d="M14 100Q16 76 38 74L62 74Q84 76 86 100Z" fill="'+oc+'"/><path d="M42 74Q50 82 58 74Z" fill="'+sk+'"/><path d="M50 83L57 90L50 97L43 90Z" fill="#fbbf24"/>'; break;
    case 5: body='<path d="M14 100Q16 76 38 74L62 74Q84 76 86 100Z" fill="#f4f4f6"/><path d="M36 74L42 74L42 86L58 86L58 74L64 74L64 100L36 100Z" fill="'+oc+'"/><path d="M42 74Q50 82 58 74Z" fill="'+sk+'"/>'; break;
  }
  var eyes=[
    '<circle cx="42" cy="47" r="2.6" fill="'+ink+'"/><circle cx="58" cy="47" r="2.6" fill="'+ink+'"/>',
    '<path d="M37.5 48Q42 42 46.5 48M53.5 48Q58 42 62.5 48" fill="none" stroke="'+ink+'" stroke-width="2.4" stroke-linecap="round"/>',
    '<circle cx="42" cy="47" r="4.6" fill="#fff"/><circle cx="58" cy="47" r="4.6" fill="#fff"/><circle cx="42.6" cy="47.6" r="2.6" fill="'+ink+'"/><circle cx="58.6" cy="47.6" r="2.6" fill="'+ink+'"/>'
  ][c.e];
  var mouth=[
    '<path d="M42 56Q50 63 58 56" fill="none" stroke="'+ink+'" stroke-width="2.4" stroke-linecap="round"/>',
    '<path d="M41 55Q50 68 59 55Z" fill="#7a2a2a"/><path d="M45 61Q50 64 55 61Q50 59 45 61Z" fill="#e46f78"/>',
    '<path d="M45 58L55 58" stroke="'+ink+'" stroke-width="2.4" stroke-linecap="round"/>'
  ][c.m];
  var cheeks='<circle cx="37" cy="54" r="3.6" fill="#ff7a90" opacity=".3"/><circle cx="63" cy="54" r="3.6" fill="#ff7a90" opacity=".3"/>';
  switch(c.a){
    case 1: acc='<g fill="none" stroke="'+ink+'" stroke-width="2"><circle cx="42" cy="47" r="7.5"/><circle cx="58" cy="47" r="7.5"/><path d="M49.5 47L50.5 47"/></g>'; break;
    case 2: acc='<g fill="'+ink+'"><rect x="33" y="41" width="15" height="10" rx="4"/><rect x="52" y="41" width="15" height="10" rx="4"/></g><path d="M48 45L52 45" stroke="'+ink+'" stroke-width="2"/>'; break;
    case 3: acc='<path d="M28 38Q30 17 50 17Q70 17 72 38Z" fill="'+oc+'"/><path d="M62 36L86 38Q88 43 79 43L60 42Z" fill="'+oc+'"/><path d="M28 38L72 38" stroke="#000" opacity=".18" stroke-width="2"/>'; break;
    case 4: acc='<g fill="'+oc+'"><path d="M66 27L54 20L54 34Z"/><path d="M66 27L78 20L78 34Z"/><circle cx="66" cy="27" r="3.8"/></g>'; break;
    case 5: acc='<path d="M36 29L38 14L44 22L50 12L56 22L62 14L64 29Z" fill="#fbbf24" stroke="#d99a06" stroke-width="1.4" stroke-linejoin="round"/>'; break;
    case 6: acc='<circle cx="29" cy="55" r="2.8" fill="#fbbf24"/><circle cx="71" cy="55" r="2.8" fill="#fbbf24"/>'; break;
    case 7: acc='<g fill="#a5683c" opacity=".7"><circle cx="38" cy="54" r="1"/><circle cx="42" cy="56" r="1"/><circle cx="36" cy="57" r="1"/><circle cx="62" cy="54" r="1"/><circle cx="58" cy="56" r="1"/><circle cx="64" cy="57" r="1"/></g>'; break;
  }
  return '<svg viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" fill="'+AV.bg[c.b]+'"/>'+back+
    '<rect x="43" y="62" width="14" height="16" fill="'+sk+'"/>'+body+
    '<ellipse cx="29.5" cy="50" rx="3.4" ry="5" fill="'+sk+'"/><ellipse cx="70.5" cy="50" rx="3.4" ry="5" fill="'+sk+'"/>'+
    '<ellipse cx="50" cy="46" rx="21" ry="24" fill="'+sk+'"/>'+front+eyes+cheeks+mouth+acc+'</svg>';
}
function avatar(m,cls){
  var v=m.avatar||'', cfg=avParse(v);
  if(cfg) return '<span class="avatar pic '+(cls||'')+'">'+avSvg(cfg)+'</span>';
  if(v.indexOf('data:image/jpeg;base64,')===0) return '<span class="avatar pic '+(cls||'')+'"><img alt="" src="'+esc(v)+'"></span>';
  var h=HUES[(m.hue||0)%HUES.length];
  return '<span class="avatar '+(cls||'')+'" style="--h:'+h+'">'+esc((m.name||'?').trim().charAt(0).toUpperCase())+'</span>';
}
function statusPill(s){ return '<span class="pill '+s+'">'+({pending:'En attente',approved:'Validé',rejected:'Refusé'}[s]||s)+'</span>'; }
function toast(msg){ $toast.textContent=msg; $toast.hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(function(){$toast.hidden=true;},3200); }
async function w(fn){
  try{ await fn(); scheduleRefresh(); return true; }
  catch(e){
    var msg=e&&e.message?String(e.message):'';
    if(e&&e.code==='P0001') toast(msg);
    else if(e&&(e.code==='42501'||e.code==='PGRST301')) toast("Tu n'as pas le droit de faire cela.");
    else if(!navigator.onLine) toast('Pas de connexion. Réessaie.');
    else toast("Impossible d'enregistrer. Réessaie.");
    return false;
  }
}
var norm=function(s){return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/\s+/g,' ').trim();};
var normCode=function(s){return String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');};
var fmtCode=function(c){return c?String(c).slice(0,3)+'-'+String(c).slice(3):'';};
var fam=function(){return S.family.find(function(f){return f.id==='main';});};
function newCode(){
  var a='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', s='', r=new Uint8Array(6);
  try{ crypto.getRandomValues(r); }catch(e){ for(var k=0;k<6;k++) r[k]=Math.floor(Math.random()*256); }
  for(var i=0;i<6;i++) s+=a.charAt(r[i]%a.length);
  return s;
}
function rerender(){ var a=document.activeElement; if(a&&a!==document.body&&a.blur) a.blur(); dirty=false; render(); }

/* ---------- photos (stored in their own collection, read only when an adult opens the request) ---------- */
function squarePhoto(file,size){
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var c=document.createElement('canvas'); c.width=c.height=size;
      var m=Math.min(img.width,img.height), sx=(img.width-m)/2, sy=(img.height-m)/2;
      var cx=c.getContext('2d'); cx.fillStyle='#fff'; cx.fillRect(0,0,size,size);
      cx.drawImage(img,sx,sy,m,m,0,0,size,size);
      var q=.82, d=c.toDataURL('image/jpeg',q);
      while(d.length>45000&&q>.4){ q-=.1; d=c.toDataURL('image/jpeg',q); }
      URL.revokeObjectURL(url);
      if(d.length>55000) rej(new Error('big')); else res(d);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error('read')); };
    img.src=url;
  });
}
function compressPhoto(file){
  return new Promise(function(res,rej){
    var url=URL.createObjectURL(file), img=new Image();
    img.onload=function(){
      var d='', sizes=[720,560,420];
      for(var s=0;s<sizes.length;s++){
        var sc=Math.min(1,sizes[s]/Math.max(img.width,img.height)), c=document.createElement('canvas');
        c.width=Math.max(1,Math.round(img.width*sc)); c.height=Math.max(1,Math.round(img.height*sc));
        c.getContext('2d').drawImage(img,0,0,c.width,c.height);
        var q=.72; d=c.toDataURL('image/jpeg',q);
        while(d.length>180000&&q>.4){ q-=.1; d=c.toDataURL('image/jpeg',q); }
        if(d.length<=180000) break;
      }
      URL.revokeObjectURL(url);
      if(d.length>230000) rej(new Error('big')); else res(d);
    };
    img.onerror=function(){ URL.revokeObjectURL(url); rej(new Error('read')); };
    img.src=url;
  });
}
function photoImg(id,d){
  return d?'<button class="phimg" data-act="photo" data-id="'+esc(id)+'" aria-label="Agrandir la photo"><img alt="Photo envoyée" src="'+d+'"></button>':'<span class="muted small">Photo introuvable.</span>';
}
function photoBox(id){
  var c=photoCache[id];
  return '<div class="phbox" data-photo="'+esc(id)+'">'+(c!==undefined?photoImg(id,c):'<span class="muted small">Chargement de la photo…</span>')+'</div>';
}
function loadPhotos(){
  $app.querySelectorAll('.phbox').forEach(function(el){
    var id=el.dataset.photo; if(photoCache[id]!==undefined||photoLoading[id]) return;
    photoLoading[id]=true;
    store.collection('photos').doc(id).get().then(function(sn){
      photoCache[id]=sn.exists?((sn.data()||{}).data||''):'';
    }).catch(function(){ photoCache[id]=undefined; }).then(function(){
      delete photoLoading[id];
      document.querySelectorAll('.phbox').forEach(function(b){
        if(b.dataset.photo===id) b.innerHTML=photoCache[id]!==undefined?photoImg(id,photoCache[id]):'<span class="muted small">Impossible de charger la photo.</span>';
      });
    });
  });
}
function dropPhoto(id){
  delete photoCache[id];
  try{ store.collection('photos').doc(id).delete().catch(function(){}); }catch(e){}
}
var allReady=function(){return COLL.every(function(c){return ready[c];});};

/* ---------- icons ---------- */
function svg(p){ return '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg>'; }
var ICON={
  home:svg('<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  check:svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
  trophy:svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4"/><path d="M12 13v4M8 20h8M10 17h4"/>'),
  gift:svg('<rect x="3" y="8" width="18" height="4"/><path d="M5 12v8h14v-8M12 8v12"/><path d="M12 8c-2 0-4-1-4-3s3-2 4 1c1-3 4-3 4-1s-2 3-4 3z"/>'),
  user:svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  users:svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>')
};

/* ---------- views ---------- */
function banners(){
  var h='';
  if(offline) h+='<p class="note">Pas de connexion : les données affichées peuvent ne pas être à jour.</p>';
  h+=pushBanner();
  return h;
}
function loadingHtml(){
  return '<div class="center"><div class="spinner"></div><p>Connexion à la famille…</p>'+(slow?'<p class="muted small">Les données mettent du temps à arriver. Vérifie ta connexion.</p>':'')+'</div>';
}
function errorHtml(){
  return '<div class="center"><h2>Connexion impossible</h2><p class="muted">'+esc(bootError)+'</p><button class="btn primary" data-act="retry">Réessayer</button></div>';
}
function welcomeHtml(){
  var join=welcomeMode==='join';
  var form=join
   ? '<form data-form="join" class="card"><div class="field"><label for="f-name">Ton prénom</label><input id="f-name" name="name" type="text" maxlength="30" autocomplete="off" required></div>'+
     '<div class="field"><label for="f-code">Code de la famille</label><input id="f-code" name="code" type="text" maxlength="8" autocomplete="off" autocapitalize="characters" required placeholder="ABC-123"></div>'+
     '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Rejoindre</button></form>'
   : '<form data-form="setup" class="card"><div class="field"><label for="f-name">Ton prénom</label><input id="f-name" name="name" type="text" maxlength="30" autocomplete="off" required></div>'+
     '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Créer la famille</button></form>';
  var seg='<div class="seg" role="group" aria-label="Choix"><button class="o" data-act="welcome" data-m="join" aria-pressed="'+join+'">Rejoindre</button><button class="o" data-act="welcome" data-m="create" aria-pressed="'+(!join)+'">Créer une famille</button></div>';
  var intro=join
   ? 'Entre ton prénom et le code de la famille. Tu retrouves ton profil tel qu’un adulte l’a créé, enfant ou adulte.'
   : 'Crée la famille avec ton prénom. Un code de famille est généré pour que les autres rejoignent depuis leur téléphone.';
  var priv=CFG.privacyUrl?'<p class="small muted"><a class="link" href="'+esc(CFG.privacyUrl)+'" target="_blank" rel="noopener">Politique de confidentialité</a></p>':'';
  return '<div class="intro"><h1 style="font-size:34px;font-weight:800">Points de famille</h1><p class="muted">'+intro+'</p>'+banners()+seg+form+priv+'</div>';
}
function topbar(m){
  return '<header class="topbar"><button class="avbtn" data-act="avatarEdit" data-id="'+esc(m.id)+'" aria-label="Changer mon avatar">'+avatar(m,'lg')+'</button><div class="who"><div class="hi">Salut '+esc(m.name)+'</div><div class="muted small">'+(isAdult(m)?'Adulte':'Enfant')+'</div></div><button class="btn small" data-act="logout">Quitter</button></header>';
}
function tabsFor(m){
  var t=[['home','Accueil',ICON.home]];
  if(isAdult(m)) t.push(['approve','À valider',ICON.check]);
  t.push(['rank','Classement',ICON.trophy],['rewards','Récompenses',ICON.gift]);
  if(isAdult(m)) t.push(['family','Famille',ICON.users]); else t.push(['me','Moi',ICON.user]);
  return t;
}
function tabbar(m){
  var pc=pendingCount();
  return '<nav class="tabbar" aria-label="Navigation"><div class="tabs n'+tabsFor(m).length+'">'+tabsFor(m).map(function(t){
    return '<button class="tab" data-act="tab" data-tab="'+t[0]+'"'+(tab===t[0]?' aria-current="page"':'')+'>'+t[2]+'<span>'+t[1]+'</span>'+(t[0]==='approve'&&pc?'<span class="badge">'+pc+'</span>':'')+'</button>';
  }).join('')+'</div></nav>';
}
function historyItems(mid){
  var e=S.entries.filter(function(x){return x.memberId===mid;}).map(function(x){return {kind:'entries',id:x.id,label:x.label,pts:x.points,status:x.status,ts:x.ts||0};});
  var r=S.redemptions.filter(function(x){return x.memberId===mid;}).map(function(x){return {kind:'redemptions',id:x.id,label:'Récompense : '+x.label,pts:-x.cost,status:x.status,ts:x.ts||0,used:!!x.usedTs};});
  var c=[];
  S.potMembers.forEach(function(x){
    if(x.memberId!==mid||x.status!=='in') return;
    var p=potById(x.potId); if(!p||!potLive(p)) return;
    c.push({kind:'pots',id:p.id,label:'Cagnotte : '+p.name,pts:-x.amount,status:p.status==='done'?'approved':'pending',ts:p.ts||0,potDone:p.status==='done'});
  });
  return e.concat(r).concat(c).sort(function(a,b){return b.ts-a.ts;});
}
function historyHtml(mid,opts){
  opts=opts||{};
  var items=historyItems(mid);
  if(opts.limit) items=items.slice(0,opts.limit);
  if(!items.length) return '<p class="muted">Aucun point pour l’instant.</p>';
  return '<ul class="list">'+items.map(function(it){
    var key=it.kind+':'+it.id;
    var cls=it.status==='rejected'?'off':(it.pts>0?'plus':'minus');
    var del='';
    if(opts.del&&it.kind!=='pots'){
      del = (sheet&&sheet.confirm===key)
        ? '<div class="mactions"><button class="btn small danger" data-act="delgo" data-kind="'+it.kind+'" data-id="'+esc(it.id)+'">Supprimer</button><button class="btn small" data-act="delcancel">Annuler</button></div>'
        : '<button class="link bad" data-act="delask" data-kind="'+it.kind+'" data-id="'+esc(it.id)+'">Supprimer</button>';
    }
    return '<li><div class="hrow"><div class="hmain"><div class="hlabel">'+esc(it.label)+'</div><div class="hmeta"><span>'+ago(it.ts)+'</span>'+(it.kind==='pots'?'<span class="pill '+(it.potDone?'approved':'pending')+'">'+(it.potDone?'Dépensé':'Mis de côté')+'</span>':it.kind==='redemptions'&&it.status==='approved'?'<span class="pill '+(it.used?'approved':'pending')+'">'+(it.used?'Récupérée':'À récupérer')+'</span>':statusPill(it.status))+(opts.del?del:'')+'</div></div><div class="hpts '+cls+'">'+sg(it.pts)+'</div></div></li>';
  }).join('')+'</ul>';
}
function lastGains(mid,n){
  return S.entries.filter(function(x){return x.memberId===mid&&x.status==='approved'&&x.points>0;}).sort(function(a,b){return (b.decidedTs||b.ts||0)-(a.decidedTs||a.ts||0);}).slice(0,n);
}
function memberReadOnly(m){
  var items=lastGains(m.id,5);
  var list=items.length?'<ul class="list">'+items.map(function(x){
    return '<li><div class="hrow"><div class="hmain"><div class="hlabel">'+esc(x.label)+'</div><div class="hmeta"><span>'+ago(x.decidedTs||x.ts||0)+'</span></div></div><div class="hpts plus">'+sg(x.points)+'</div></div></li>';
  }).join('')+'</ul>':'<p class="muted">Aucun point gagné pour l’instant.</p>';
  return '<div style="display:flex;gap:12px;align-items:center">'+avatar(m,'lg')+'<div><h2 style="padding:0">'+esc(m.name)+(m.id===sess?' (toi)':'')+'</h2><span class="muted small">'+(isAdult(m)?'Adulte':'Enfant')+'</span></div></div>'+
    '<div class="hero"><div class="eyebrow">Points disponibles</div><div class="big" style="font-size:64px">'+balance(m.id)+'</div></div>'+
    '<h3>Derniers points gagnés</h3>'+list;
}
function prizeCards(m){
  return S.redemptions.filter(function(r){return r.memberId===m.id&&r.status==='approved'&&!r.usedTs;}).sort(function(a,b){return (a.decidedTs||0)-(b.decidedTs||0);}).map(function(r){
    return '<section class="card prize"><div class="eyebrow">Bravo !</div><div class="prize-title">'+esc(r.label)+'</div><p class="muted small">Ta récompense est validée. Appuie sur le bouton quand tu l’as eue.</p><button class="btn primary block" data-act="rewardUsed" data-id="'+esc(r.id)+'">Récupérée</button></section>';
  }).join('');
}
function homeSelf(m){
  var bal=balance(m.id), wait=waiting(m.id);
  var rs=S.rewards.slice().sort(function(a,b){return a.cost-b.cost;});
  var next=rs.find(function(r){return r.cost>bal;});
  var chosen=m.goalId&&rs.find(function(r){return r.id===m.goalId;});
  if(chosen&&chosen.cost>bal) next=chosen;
  var goal='';
  if(!rs.length) goal='<p class="muted small">Les adultes n’ont pas encore ajouté de récompenses.</p>';
  else if(next) goal='<div class="goal"><div class="goal-top"><span>'+(chosen&&next===chosen?'Mon objectif':'Prochaine récompense')+' : <strong>'+esc(next.label)+'</strong></span><strong class="tnum">encore '+(next.cost-bal)+'</strong></div><div class="bar"><i style="width:'+Math.max(0,Math.min(100,bal/next.cost*100))+'%"></i></div></div>';
  else goal='<div class="goal"><p>Tu as assez de points pour toutes les récompenses.</p></div>';
  return '<section class="card hero"><div class="eyebrow">Tes points</div><div class="big">'+bal+'</div>'+
    (wait>0?'<p class="muted small">+'+wait+' '+ptsWord(wait)+' en attente de validation</p>':'')+goal+
    '<button class="btn primary block" data-act="openEarn">Gagner des points</button>'+
    '<button class="btn block" data-act="potNew">Regrouper nos points</button></section>'+
    prizeCards(m)+potsSection(m);
}

/* ---------- onglet « Moi » (enfants) ---------- */
var LEVELS=[[0,'Apprenti'],[25,'Courageux'],[75,'Costaud'],[150,'Champion'],[300,'Légende']];
function dayKey(ts){ var d=new Date(ts); return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(); }
function gainDays(id){
  var o={}; S.entries.forEach(function(e){ if(e.memberId===id&&e.status==='approved'&&e.points>0) o[dayKey(e.decidedTs||e.ts||0)]=1; });
  return o;
}
function streaks(id){
  var days=gainDays(id), keys=Object.keys(days);
  if(!keys.length) return {cur:0,best:0};
  var DAY=86400000, now=new Date(); now.setHours(12,0,0,0);
  var cur=0, t=now.getTime();
  if(!days[dayKey(t)]) t-=DAY;
  while(days[dayKey(t)]){ cur++; t-=DAY; }
  var list=keys.map(function(k){var a=k.split('-');return new Date(+a[0],+a[1]-1,+a[2],12).getTime();}).sort(function(a,b){return a-b;});
  var best=1, run=1;
  for(var i=1;i<list.length;i++){ run=Math.round((list[i]-list[i-1])/DAY)===1?run+1:1; if(run>best) best=run; }
  return {cur:cur,best:Math.max(best,cur)};
}
function lifetime(id){ return sum(S.entries.filter(function(e){return e.memberId===id&&e.status==='approved'&&e.points>0;}),function(e){return e.points;}); }
function levelOf(pts){ var i=0; LEVELS.forEach(function(l,k){ if(pts>=l[0]) i=k; }); return i; }
function badgesOf(m){
  var gains=S.entries.filter(function(e){return e.memberId===m.id&&e.status==='approved'&&e.points>0;});
  var st=streaks(m.id), life=lifetime(m.id);
  var rew=S.redemptions.some(function(r){return r.memberId===m.id&&r.status==='approved';});
  var team=S.potMembers.some(function(x){return x.memberId===m.id&&x.status==='in';});
  return [
    ['★','Première tâche','Gagne ton premier point.',gains.length>=1],
    ['10','10 tâches','Fais valider 10 tâches.',gains.length>=10],
    ['100','100 points','Gagne 100 points en tout.',life>=100],
    ['3j','Série de 3 jours','Gagne des points 3 jours de suite.',st.best>=3],
    ['7j','Série de 7 jours','Gagne des points 7 jours de suite.',st.best>=7],
    ['✓','Première récompense','Obtiens ta première récompense.',rew],
    ['♥','Esprit d’équipe','Participe à une cagnotte.',team]
  ];
}
function levelCard(m){
  var life=lifetime(m.id), li=levelOf(life), nx=LEVELS[li+1];
  return '<section class="card me-level"><div class="eyebrow">Niveau '+(li+1)+'</div><div class="me-title">'+LEVELS[li][1]+'</div>'+
    (nx?'<div class="bar"><i style="width:'+Math.max(0,Math.min(100,(life-LEVELS[li][0])/(nx[0]-LEVELS[li][0])*100))+'%"></i></div><p class="muted small">Encore '+(nx[0]-life)+' '+ptsWord(nx[0]-life)+' pour devenir « '+nx[1]+' »</p>'
        :'<p class="muted small">Niveau maximum atteint, bravo !</p>')+'</section>';
}
function objectiveCard(m){
  var rs=S.rewards.slice().sort(function(a,b){return a.cost-b.cost;});
  var g=m.goalId&&rs.find(function(r){return r.id===m.goalId;}), bal=balance(m.id), obj;
  if(g){
    obj='<div class="goal-top"><span><strong>'+esc(g.label)+'</strong></span><strong class="tnum">'+(bal>=g.cost?'Tu peux l’avoir !':bal+' / '+g.cost)+'</strong></div><div class="bar"><i style="width:'+Math.max(0,Math.min(100,bal/g.cost*100))+'%"></i></div>'+
      '<button class="link" data-act="goalClear">Retirer mon objectif</button>';
  } else if(rs.length){
    obj='<p class="muted small">Choisis la récompense que tu veux atteindre.</p><div class="chips2">'+rs.map(function(r){return '<button class="btn small" data-act="goalSet" data-id="'+esc(r.id)+'">'+esc(r.label)+' · '+r.cost+'</button>';}).join('')+'</div>';
  } else obj='<p class="muted small">Il n’y a pas encore de récompenses.</p>';
  return '<section class="card"><h3>Mon objectif</h3>'+obj+'</section>';
}
function meHeader(m){
  var life=lifetime(m.id);
  return '<section class="card" style="display:flex;gap:12px;align-items:center">'+avatar(m,'lg')+'<div style="flex:1;min-width:0"><h2 style="padding:0">'+esc(m.name)+'</h2><span class="muted small">'+life+' '+ptsWord(life)+' gagnés en tout</span></div><button class="btn small" data-act="avatarEdit" data-id="'+esc(m.id)+'">Mon avatar</button></section>';
}
function meView(m){
  var st=streaks(m.id);
  var strk='<section class="card me-streak"><div class="eyebrow">Série</div><div class="me-title">'+st.cur+' '+(st.cur>1?'jours':'jour')+' de suite</div><p class="muted small">'+(st.cur?'Continue, gagne des points aujourd’hui !':'Gagne des points aujourd’hui pour lancer ta série.')+' Record : '+st.best+' '+(st.best>1?'jours':'jour')+'.</p></section>';
  var bd=badgesOf(m), got=bd.filter(function(b){return b[3];}).length;
  var badges='<section class="card"><h3>Badges <span class="muted small">'+got+' / '+bd.length+'</span></h3><div class="badges">'+bd.map(function(b){
    return '<div class="bdg'+(b[3]?' on':'')+'"><div class="bdg-i">'+b[0]+'</div><div class="bdg-t">'+b[1]+'</div><div class="bdg-h">'+(b[3]?'Obtenu':b[2])+'</div></div>';
  }).join('')+'</div></section>';
  return meHeader(m)+levelCard(m)+strk+objectiveCard(m)+badges+
    '<section class="card"><h3>Mon historique</h3>'+historyHtml(m.id,{limit:30})+'</section>';
}
function meAdult(m){
  return '<div class="section-title" style="margin-top:6px"><h3>Toi</h3></div>'+meHeader(m)+levelCard(m)+objectiveCard(m)+
    '<section class="card"><h3>Mon historique</h3>'+historyHtml(m.id,{limit:10})+'</section>';
}
function todoItems(){
  var it=[];
  S.entries.filter(function(e){return e.status==='pending';}).sort(function(a,b){return a.ts-b.ts;}).forEach(function(e){
    var x=mById(e.memberId); if(!x) return;
    it.push({who:x,t:e.label,s:x.name+' · demande de points',pts:e.points,btn:'<button class="btn small primary" data-act="tab" data-tab="approve">Voir</button>'});
  });
  S.redemptions.filter(function(r){return r.status==='pending';}).sort(function(a,b){return a.ts-b.ts;}).forEach(function(r){
    var x=mById(r.memberId); if(!x) return;
    it.push({who:x,t:r.label,s:x.name+' · demande de récompense',pts:-r.cost,btn:'<button class="btn small primary" data-act="tab" data-tab="approve">Voir</button>'});
  });
  S.pots.filter(function(p){return potLive(p)&&p.status==='pending';}).forEach(function(p){
    var x=mById(p.createdBy);
    it.push({who:x,t:'Cagnotte « '+p.name+' »',s:(x?x.name+' · ':'')+'à valider',btn:'<button class="btn small primary" data-act="pot" data-id="'+esc(p.id)+'">Voir</button>'});
  });
  S.pots.filter(function(p){return potLive(p)&&p.status==='claiming';}).forEach(function(p){
    var x=mById(p.createdBy);
    it.push({who:x,t:'Cagnotte « '+p.name+' »',s:'Choix à valider : '+(p.chosenLabel||''),btn:'<button class="btn small primary" data-act="pot" data-id="'+esc(p.id)+'">Voir</button>'});
  });
  S.redemptions.filter(function(r){return r.status==='approved'&&!r.usedTs;}).sort(function(a,b){return (a.decidedTs||0)-(b.decidedTs||0);}).forEach(function(r){
    var x=mById(r.memberId); if(!x) return;
    it.push({who:x,t:r.label,s:x.name+' attend sa récompense',btn:'<button class="btn small" data-act="rewardUsed" data-id="'+esc(r.id)+'">Remise</button>'});
  });
  return it;
}
function homeAdult(m){
  var ms=S.members.slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);});
  var items=todoItems(), shown=items.slice(0,6);
  var out='<section class="card todo"><div class="section-title"><h3>À faire</h3>'+(items.length?'<span class="pill pending">'+items.length+'</span>':'')+'</div>';
  if(!items.length) out+='<p class="muted small" style="margin-top:6px">Tout est à jour. Rien n’attend ta validation.</p>';
  else {
    out+='<ul class="list">'+shown.map(function(x){
      return '<li><div class="trow">'+(x.who?avatar(x.who):'')+'<div class="tx">'+esc(x.t)+'<small>'+esc(x.s)+'</small></div>'+(x.pts?'<span class="hpts '+(x.pts>0?'plus':'minus')+'">'+sg(x.pts)+'</span>':'')+x.btn+'</div></li>';
    }).join('')+'</ul>';
    if(items.length>shown.length) out+='<button class="link" data-act="tab" data-tab="approve">Voir les '+(items.length-shown.length)+' autres</button>';
  }
  out+='</section>';
  out+=potsSection(m);
  out+='<section class="card"><div class="section-title"><h3>La famille</h3><span class="muted small">Touche un nom pour le détail</span></div><div class="chips2">'+
    ms.map(function(x){
      var wt=waiting(x.id);
      return '<button class="pc" data-act="member" data-id="'+esc(x.id)+'" aria-label="'+esc(x.name)+', '+balance(x.id)+' points">'+avatar(x)+'<span>'+esc(x.name)+'</span><b>'+balance(x.id)+'</b>'+(wt?'<small class="muted">+'+wt+'</small>':'')+'</button>';
    }).join('')+'</div></section>';
  return out;
}
function approveView(){
  var es=S.entries.filter(function(e){return e.status==='pending';}).sort(function(a,b){return a.ts-b.ts;});
  var rs=S.redemptions.filter(function(r){return r.status==='pending';}).sort(function(a,b){return a.ts-b.ts;});
  var ps=S.pots.filter(function(p){return potLive(p)&&p.status==='pending';}).sort(function(a,b){return a.ts-b.ts;});
  var cs=S.pots.filter(function(p){return potLive(p)&&p.status==='claiming';}).sort(function(a,b){return a.ts-b.ts;});
  if(!es.length&&!rs.length&&!ps.length&&!cs.length) return '<section class="card empty"><h3>Rien à valider</h3><p>Les demandes de points, de récompenses et de cagnottes apparaîtront ici.</p></section>';
  function potRow(p,claim){
    var cr=mById(p.createdBy), inv=S.potMembers.filter(function(x){return x.potId===p.id;}).length-1;
    var info=claim?('Choix : <strong>'+esc(p.chosenLabel||'')+'</strong> ('+(p.chosenCost||0)+' pts)'):('Invite '+inv+' '+(inv>1?'personnes':'personne')+' · '+potTotal(p)+' pts mis par '+esc(cr?cr.name:'?'));
    return '<li><div class="arow" style="flex-wrap:wrap">'+(cr?avatar(cr):'')+'<div class="hmain"><div class="hlabel">'+esc(p.name)+'</div><div class="hmeta"><span>'+info+'</span></div></div>'+
    '<div class="mactions" style="width:100%;justify-content:flex-end"><button class="btn small" data-act="'+(claim?'potClaimNo':'potRefuse')+'" data-id="'+esc(p.id)+'">Refuser</button><button class="btn small" data-act="pot" data-id="'+esc(p.id)+'">Voir</button><button class="btn small primary" data-act="'+(claim?'potClaimOk':'potApprove')+'" data-id="'+esc(p.id)+'">Valider</button></div></div></li>';
  }
  function row(kind,x,label,pts){
    var m=mById(x.memberId); if(!m) return '';
    return '<li><div class="arow" style="flex-wrap:wrap">'+avatar(m)+'<div class="hmain"><div class="hlabel">'+esc(label)+'</div><div class="hmeta"><span>'+esc(m.name)+'</span><span>'+ago(x.ts||0)+'</span></div></div><div class="hpts '+(pts>0?'plus':'minus')+'">'+sg(pts)+'</div>'+
    (x.photo?photoBox(x.id):'')+
    '<div class="mactions" style="width:100%;justify-content:flex-end"><button class="btn small" data-act="decide" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-v="rejected">Refuser</button><button class="btn small primary" data-act="decide" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-v="approved">Valider</button></div></div></li>';
  }
  var out='';
  if(es.length) out+='<section class="card"><h3>Points demandés</h3><ul class="list">'+es.map(function(e){return row('entries',e,e.label,e.points);}).join('')+'</ul></section>';
  if(ps.length) out+='<section class="card"><h3>Cagnottes à valider</h3><ul class="list">'+ps.map(function(p){return potRow(p,false);}).join('')+'</ul></section>';
  if(cs.length) out+='<section class="card"><h3>Choix de cagnotte à valider</h3><ul class="list">'+cs.map(function(p){return potRow(p,true);}).join('')+'</ul></section>';
  if(rs.length) out+='<section class="card"><h3>Récompenses demandées</h3><ul class="list">'+rs.map(function(r){return row('redemptions',r,r.label,-r.cost);}).join('')+'</ul></section>';
  return out;
}
function prevStart(p){
  var d=new Date(periodStart(p));
  if(p==='week') d.setDate(d.getDate()-7);
  else if(p==='month') d.setMonth(d.getMonth()-1);
  return d.getTime();
}
function scoreBetween(id,from,to){
  return sum(S.entries.filter(function(e){var t=e.decidedTs||e.ts||0;return e.memberId===id&&e.status==='approved'&&t>=from&&t<to;}),function(e){return e.points;});
}
function rankRows(scoreOf){
  var rows=S.members.map(function(x){return {m:x,s:scoreOf(x.id)};}).sort(function(a,b){return b.s-a.s||a.m.name.localeCompare(b.m.name,'fr');});
  var rank=0, prev=null;
  rows.forEach(function(r,i){ if(r.s!==prev){rank=i+1;prev=r.s;} r.rank=rank; });
  return rows;
}
function rankView(m){
  var rows=rankRows(function(id){return periodScore(id,rankPeriod);});
  var allZero=rows.every(function(r){return r.s===0;});
  var prevRank={}, hasPrev=false;
  if(rankPeriod!=='all'){
    var ps=prevStart(rankPeriod), pe=periodStart(rankPeriod);
    var pr=rankRows(function(id){return scoreBetween(id,ps,pe);});
    hasPrev=pr.some(function(r){return r.s>0;});
    pr.forEach(function(r){prevRank[r.m.id]=r.rank;});
  }
  var labels={week:'Points gagnés cette semaine',month:'Points gagnés ce mois-ci',all:'Points gagnés depuis le début'};
  var champWord={week:'de la semaine',month:'du mois',all:'de tous les temps'}[rankPeriod];
  var seg='<div class="seg" role="group" aria-label="Période">'+[['week','Semaine'],['month','Mois'],['all','Total']].map(function(p){return '<button class="o" data-act="rank" data-p="'+p[0]+'" aria-pressed="'+(rankPeriod===p[0])+'">'+p[1]+'</button>';}).join('')+'</div>';
  var scored=rows.filter(function(r){return r.s>0;});
  var champs=scored.filter(function(r){return r.rank===1;});
  var crown=champs.length?'<div style="text-align:center"><span class="crown">Champion '+champWord+' : '+champs.map(function(r){return esc(r.m.name);}).join(' et ')+'</span></div>':'';
  var usePodium=scored.length>=2, podRows=[], rest=rows;
  var podHtml='';
  if(usePodium){
    podRows=scored.slice(0,3); rest=rows.filter(function(r){return podRows.indexOf(r)<0;});
    var order=podRows.length===3?[podRows[1],podRows[0],podRows[2]]:[podRows[1],podRows[0]];
    podHtml='<div class="podium">'+order.map(function(r){
      var cls=r.rank===1?'g':(r.rank===2?'s':'b'), me=r.m.id===m.id;
      return '<button class="pod '+cls+'" data-act="member" data-id="'+esc(r.m.id)+'">'+avatar(r.m)+'<span class="rname">'+esc(r.m.name)+(me?' (toi)':'')+'</span><span class="blk">'+r.rank+'</span><span class="pts">'+r.s+'</span></button>';
    }).join('')+'</div>';
  }
  function trend(r){
    if(!hasPrev) return '';
    var d=(prevRank[r.m.id]||rows.length)-r.rank;
    return d>0?'<span class="up">▲ '+d+'</span>':(d<0?'<span class="dn">▼ '+(-d)+'</span>':'<span class="eq">=</span>');
  }
  return '<section class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Classement</h2>'+seg+'<p class="muted small">'+labels[rankPeriod]+'</p>'+
    (allZero?'<p class="note">Personne n’a encore de points sur cette période.</p>':crown+podHtml)+
    (rest.length?'<ul class="list">'+rest.map(function(r){
      var me=r.m.id===m.id;
      return '<li><button class="rrow'+(r.rank===1&&r.s>0?' first':'')+(me?' me':'')+'" data-act="member" data-id="'+esc(r.m.id)+'"><span class="rnk">'+(allZero?'–':r.rank)+'</span>'+avatar(r.m)+'<span class="rname">'+esc(r.m.name)+(me?' (toi)':'')+'</span>'+trend(r)+'<span class="rpts">'+r.s+'</span></button></li>';
    }).join('')+'</ul>':'')+'</section>';
}
function rewardsView(m){
  var bal=balance(m.id), adult=isAdult(m);
  var rs=S.rewards.slice().sort(function(a,b){return a.cost-b.cost||a.label.localeCompare(b.label,'fr');});
  var head='<div class="section-title"><h2>Récompenses</h2><span class="muted">'+bal+' '+ptsWord(bal)+'</span></div>';
  var add=adult?'<button class="btn primary block" data-act="rewardEdit">Ajouter une récompense</button>':'';
  if(!rs.length){
    var sug=adult?'<p class="muted small">Idées pour commencer :</p><div class="chips"><button class="chip" data-act="rewardSuggest" data-label="Choisir le film du soir">Choisir le film du soir</button><button class="chip" data-act="rewardSuggest" data-label="Plus d’argent de poche">Plus d’argent de poche</button></div>':'';
    return head+'<section class="card empty"><h3>Aucune récompense</h3><p>'+(adult?'Ajoute ce que les points permettent d’obtenir et le nombre de points nécessaires.':'Les adultes vont bientôt en ajouter.')+'</p>'+sug+'</section>'+add;
  }
  return head+rs.map(function(r){
    var mine=S.redemptions.some(function(x){return x.memberId===m.id&&x.rewardId===r.id&&x.status==='pending';});
    var can=bal>=r.cost;
    var act=mine?'<span class="pill pending">En attente</span>':(can?'<button class="btn primary small" data-act="redeemAsk" data-id="'+esc(r.id)+'">'+(adult?'Utiliser':'Demander')+'</button>':'<span class="muted small">Encore '+(r.cost-bal)+' '+ptsWord(r.cost-bal)+'</span>');
    return '<section class="card reward"><div class="reward-top"><h3>'+esc(r.label)+'</h3><span class="cost">'+r.cost+'</span></div><div class="bar"><i style="width:'+Math.max(0,Math.min(100,bal/r.cost*100))+'%"></i></div><div class="reward-bottom">'+act+(adult?'<button class="link" data-act="rewardEdit" data-id="'+esc(r.id)+'">Modifier</button>':'')+'</div></section>';
  }).join('')+add;
}
function familyView(){
  var ms=S.members.slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);});
  var ts=S.tasks.slice().sort(function(a,b){return a.label.localeCompare(b.label,'fr');});
  var out='';
  var f=fam();
  if(f&&f.code) out+='<section class="card code"><div class="eyebrow">Code de la famille</div><div class="codebig">'+esc(fmtCode(f.code))+'</div><p class="muted small">Sur un autre appareil, ouvre le lien de l’application, puis entre ton prénom avec ce code. Le profil (adulte ou enfant) est celui que tu as créé ci-dessous.</p><div class="mactions"><button class="btn small" data-act="copyCode">Copier le code</button></div></section>';
  if(ms.length<2) out+='<p class="note">Ajoute maintenant les enfants avec leur prénom. Ils rejoindront ensuite avec ce même prénom et le code.</p>';
  out+='<section class="card"><div class="section-title"><h3>Membres</h3></div><ul class="list">'+ms.map(function(x){
    return '<li><div class="mrow">'+avatar(x)+'<div class="mmain"><div class="hlabel">'+esc(x.name)+'</div><div class="muted small">'+(isAdult(x)?'Adulte':'Enfant')+'</div></div><button class="link" data-act="editMember" data-id="'+esc(x.id)+'">Modifier</button></div></li>';
  }).join('')+'</ul><button class="btn block" style="margin-top:8px" data-act="addMember">Ajouter un membre</button></section>';
  var me0=mById(sess); if(me0) out+=meAdult(me0);
  out+='<section class="card"><div class="section-title"><h3>Tâches types</h3></div><p class="muted small" style="margin-top:4px">Les enfants choisissent parmi ces tâches et envoient une photo. Les points sont ceux que tu fixes ici.</p>'+
    (ts.length?'<ul class="list">'+ts.map(function(t){return '<li><div class="mrow"><div class="mmain"><div class="hlabel">'+esc(t.label)+'</div></div><span class="hpts plus">'+sg(t.points)+'</span><button class="link" data-act="taskEdit" data-id="'+esc(t.id)+'">Modifier</button></div></li>';}).join('')+'</ul>':'')+
    '<button class="btn block" style="margin-top:8px" data-act="taskEdit">Ajouter une tâche</button></section>';
  out+='<section class="card"><h3>Application</h3>'+(CFG.privacyUrl?'<p style="margin:6px 0"><a class="link" href="'+esc(CFG.privacyUrl)+'" target="_blank" rel="noopener">Politique de confidentialité</a></p>':'')+'<p class="muted small" style="margin-bottom:10px">Supprime définitivement la famille, les profils, les points et les photos sur tous les appareils.</p><button class="btn danger block" data-act="deleteFamilyAsk">Supprimer la famille et ses données</button></section>';
  return out;
}
function render(){
  var a=document.activeElement;
  if(a&&$app.contains(a)&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)){ dirty=true; return; }
  dirty=false;
  if(bootError){ $app.innerHTML=errorHtml(); return; }
  if(!booted){ $app.innerHTML=loadingHtml(); return; }
  if(!sess){ $app.innerHTML=welcomeHtml(); return; }
  var m=mById(sess);
  if(!allReady()||!m){ $app.innerHTML=loadingHtml(); return; }
  var tabs=tabsFor(m).map(function(t){return t[0];});
  if(tabs.indexOf(tab)<0) tab='home';
  var body='';
  if(tab==='home') body=isAdult(m)?homeAdult(m):homeSelf(m);
  else if(tab==='approve') body=approveView();
  else if(tab==='rank') body=rankView(m);
  else if(tab==='rewards') body=rewardsView(m);
  else if(tab==='family') body=familyView();
  else if(tab==='me') body=meView(m);
  if(tab==='home') body+=pushCard();
  $app.innerHTML=topbar(m)+'<main>'+banners()+body+'</main>'+tabbar(m);
  if(tab==='approve') loadPhotos();
  if(sheet&&(sheet.type==='member'||sheet.type==='pot')) renderSheet();
}
document.addEventListener('focusout',function(){ if(dirty) setTimeout(render,80); });

/* ---------- sheets ---------- */
function chips(list,ptsKey){
  if(!list.length) return '';
  return '<div class="chips">'+list.map(function(t){return '<button type="button" class="chip" data-act="preset" data-label="'+esc(t.label)+'" data-pts="'+t[ptsKey]+'">'+esc(t.label)+' · '+t[ptsKey]+'</button>';}).join('')+'</div>';
}
function sortedTasks(){ return S.tasks.slice().sort(function(a,b){return a.label.localeCompare(b.label,'fr');}); }
function sheetBody(){
  var s=sheet;
  if(s.type==='earn'){
    var tl=sortedTasks();
    if(!tl.length) return '<h2>Gagner des points</h2><p class="muted">Aucune tâche n’a encore été ajoutée. Demande à un adulte d’en créer dans l’onglet Famille.</p>';
    return '<h2>Gagner des points</h2><p class="muted">Choisis la tâche que tu as faite, prends une photo, puis envoie-la. Un adulte valide tes points.</p>'+
    '<form data-form="earn"><div class="field"><span class="lbl">Ta tâche</span><div class="tasklist">'+tl.map(function(t){return '<label class="taskopt"><input type="radio" name="task" value="'+esc(t.id)+'"><span class="tbody"><span>'+esc(t.label)+'</span><strong>+'+t.points+'</strong></span></label>';}).join('')+'</div></div>'+
    '<div class="field"><span class="lbl">Photo</span><div class="photoprev" id="photoPrev" hidden></div><label class="btn block photobtn" for="f-photo"><input id="f-photo" type="file" accept="image/*" capture="environment"><span id="photoLbl">Prendre une photo</span></label></div>'+
    '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Envoyer à l’adulte</button></form>';
  }
  var ps2=potSheetBody(s); if(ps2!==null) return ps2;
  if(s.type==='deleteFamily'){
    return '<h2>Supprimer la famille</h2><p>Tous les profils, points, tâches, récompenses et photos seront supprimés pour toujours, sur tous les appareils.</p><form data-form="deleteFamily"><div class="field"><label for="f-confirm">Écris SUPPRIMER pour confirmer</label><input id="f-confirm" name="confirm" type="text" autocomplete="off" autocapitalize="characters"></div><p class="err" id="err" role="alert"></p><button class="btn danger block" type="submit">Supprimer définitivement</button></form>';
  }
  if(s.type==='photo'){
    var pd=photoCache[s.id];
    return pd?'<h2>Photo</h2><img class="bigphoto" alt="Photo envoyée" src="'+pd+'">':'';
  }
  if(s.type==='adjust'){
    var opts=S.members.slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);}).map(function(x){return '<option value="'+esc(x.id)+'"'+(x.id===s.id?' selected':'')+'>'+esc(x.name)+'</option>';}).join('');
    return '<h2>Modifier les points</h2>'+chips(sortedTasks(),'points')+
    '<form data-form="adjust"><div class="field"><label for="f-member">Pour</label><select id="f-member" name="member">'+opts+'</select></div>'+
    '<div class="field"><span class="lbl">Action</span><div class="seg"><label><input type="radio" name="sign" value="1"'+(s.sign!=='-1'?' checked':'')+'><span>Ajouter</span></label><label><input type="radio" name="sign" value="-1"'+(s.sign==='-1'?' checked':'')+'><span>Retirer</span></label></div></div>'+
    '<div class="field"><label for="f-pts">Points</label><input id="f-pts" name="points" type="number" inputmode="numeric" min="1" max="1000" required></div>'+
    '<div class="field"><label for="f-label">Motif</label><input id="f-label" name="label" type="text" maxlength="80" autocomplete="off" required placeholder="Ex. : Vaisselle faite"></div>'+
    '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Enregistrer</button></form>';
  }
  if(s.type==='member'){
    var m=mById(s.id); if(!m) return '';
    var viewer=mById(sess);
    if(!viewer||!isAdult(viewer)) return memberReadOnly(m);
    return '<div style="display:flex;gap:12px;align-items:center">'+avatar(m,'lg')+'<div><h2 style="padding:0">'+esc(m.name)+'</h2><span class="muted small">'+(isAdult(m)?'Adulte':'Enfant')+'</span></div></div>'+
    '<div class="hero"><div class="eyebrow">Points disponibles</div><div class="big" style="font-size:64px">'+balance(m.id)+'</div><p class="muted small">Total gagné : '+total(m.id)+' · dépensé : '+spent(m.id)+(locked(m.id)?' · en cagnotte : '+locked(m.id):'')+'</p></div>'+
    '<div class="mactions"><button class="btn primary" style="flex:1" data-act="adjust" data-id="'+esc(m.id)+'" data-sign="1">Ajouter</button><button class="btn" style="flex:1" data-act="adjust" data-id="'+esc(m.id)+'" data-sign="-1">Retirer</button></div>'+
    '<h3>Historique</h3>'+historyHtml(m.id,{del:true});
  }
  if(s.type==='redeem'){
    var r=S.rewards.find(function(x){return x.id===s.id;}); var me=mById(sess); if(!r||!me) return '';
    var ad=isAdult(me);
    return '<h2>'+esc(r.label)+'</h2><p>'+(ad?'Utiliser':'Demander')+' cette récompense pour <strong>'+r.cost+' '+ptsWord(r.cost)+'</strong> ?</p><p class="muted small">'+(ad?'Les points seront retirés tout de suite.':'Les points sont mis de côté en attendant la réponse d’un adulte.')+'</p><div class="mactions"><button class="btn" style="flex:1" data-act="closeSheet">Annuler</button><button class="btn primary" style="flex:1" data-act="redeemGo">Confirmer</button></div>';
  }
  if(s.type==='reward'){
    var rw=s.id?S.rewards.find(function(x){return x.id===s.id;}):null;
    var del=rw?(s.confirm?'<div class="mactions"><button type="button" class="btn danger" style="flex:1" data-act="rewardDelGo">Supprimer</button><button type="button" class="btn" style="flex:1" data-act="delcancel">Annuler</button></div>':'<button type="button" class="btn danger block" data-act="delaskThing">Supprimer cette récompense</button>'):'';
    return '<h2>'+(rw?'Modifier la récompense':'Nouvelle récompense')+'</h2><form data-form="reward" data-id="'+(rw?esc(rw.id):'')+'"><div class="field"><label for="f-label">Nom</label><input id="f-label" name="label" type="text" maxlength="60" autocomplete="off" required value="'+esc(rw?rw.label:(s.label||''))+'"></div>'+
    '<div class="field"><label for="f-cost">Points nécessaires</label><input id="f-cost" name="cost" type="number" inputmode="numeric" min="1" max="100000" required value="'+(rw?rw.cost:'')+'"></div><p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Enregistrer</button>'+del+'</form>';
  }
  if(s.type==='task'){
    var t=s.id?S.tasks.find(function(x){return x.id===s.id;}):null;
    var dt=t?(s.confirm?'<div class="mactions"><button type="button" class="btn danger" style="flex:1" data-act="taskDelGo">Supprimer</button><button type="button" class="btn" style="flex:1" data-act="delcancel">Annuler</button></div>':'<button type="button" class="btn danger block" data-act="delaskThing">Supprimer cette tâche</button>'):'';
    return '<h2>'+(t?'Modifier la tâche':'Nouvelle tâche')+'</h2><form data-form="task" data-id="'+(t?esc(t.id):'')+'"><div class="field"><label for="f-label">Tâche</label><input id="f-label" name="label" type="text" maxlength="60" autocomplete="off" required value="'+esc(t?t.label:'')+'"></div>'+
    '<div class="field"><label for="f-pts">Points accordés</label><input id="f-pts" name="points" type="number" inputmode="numeric" min="1" max="1000" required value="'+(t?t.points:'')+'"></div><p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Enregistrer</button>'+dt+'</form>';
  }
  if(s.type==='addMember'){
    return '<h2>Ajouter un membre</h2><form data-form="addMember"><div class="field"><label for="f-name">Prénom</label><input id="f-name" name="name" type="text" maxlength="30" autocomplete="off" required></div>'+
    '<div class="field"><span class="lbl">Rôle</span><div class="seg"><label><input type="radio" name="role" value="child" checked><span>Enfant</span></label><label><input type="radio" name="role" value="adult"><span>Adulte</span></label></div><span class="muted small">Le rôle décide ce que la personne pourra faire quand elle rejoindra avec son prénom et le code de famille.</span></div>'+
    '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Ajouter</button></form>';
  }
  if(s.type==='avatar'){
    var am=mById(s.id); if(!am) return '';
    var cfg=s.cfg, prevM={name:am.name,hue:am.hue,avatar:s.photo||(cfg?JSON.stringify(cfg):null)};
    var row=function(label,key,list,kind){
      return '<div class="field"><span class="lbl">'+label+'</span><div class="avrow">'+list.map(function(x,i){
        var on=cfg&&cfg[key]===i;
        if(kind==='dot') return '<button type="button" class="avdot'+(on?' on':'')+'" style="background:'+x+'" data-act="avOpt" data-k="'+key+'" data-i="'+i+'" aria-label="Couleur '+(i+1)+'"></button>';
        var t=avLimit(Object.assign({},cfg||AV_DEF)); t[key]=i;
        return '<button type="button" class="avopt'+(on?' on':'')+'" data-act="avOpt" data-k="'+key+'" data-i="'+i+'"><span class="avatar">'+avSvg(t)+'</span><span>'+esc(x)+'</span></button>';
      }).join('')+'</div></div>';
    };
    var ctrl=cfg?(row('Peau','s',AV.skin,'dot')+row('Coiffure','h',AV.hair)+row('Couleur des cheveux','hc',AV.hairc,'dot')+row('Yeux','e',AV.eyes)+row('Bouche','m',AV.mouth)+row('Habit','o',AV.outfit)+row('Couleur de l’habit','oc',AV.outc,'dot')+row('Accessoire','a',AV.acc)+row('Fond','b',AV.bg,'dot')):
      '<p class="muted small">'+(s.photo?'Tu utilises une photo. Tu peux aussi créer un avatar.':'Ton profil affichera la première lettre du prénom. Tu peux créer un avatar ou ajouter une photo.')+'</p>';
    return '<h2>Avatar de '+esc(am.name)+'</h2><div class="avprev">'+avatar(prevM,'xl')+'</div>'+
      '<div class="avtop"><button type="button" class="btn small'+(cfg?' primary':'')+'" data-act="avMode" data-mode="avatar">Créer un avatar</button>'+
      '<label class="btn small'+(s.photo?' primary':'')+'" for="f-avphoto">Utiliser une photo</label><input id="f-avphoto" type="file" accept="image/*" hidden>'+
      '<button type="button" class="btn small" data-act="avMode" data-mode="letter">Juste la lettre</button></div>'+ctrl+
      '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="button" data-act="avSave">Enregistrer</button>';
  }
  if(s.type==='editMember'){
    var em=mById(s.id); if(!em) return '';
    var adults=S.members.filter(isAdult).length;
    var blocked=em.id===sess||(isAdult(em)&&adults<2);
    var dm=blocked?'<p class="muted small">'+(em.id===sess?'Tu ne peux pas supprimer ton propre profil.':'Il faut garder au moins un adulte.')+'</p>':(s.confirm?'<p class="muted small">Tous les points de '+esc(em.name)+' seront supprimés.</p><div class="mactions"><button type="button" class="btn danger" style="flex:1" data-act="memberDelGo">Supprimer</button><button type="button" class="btn" style="flex:1" data-act="delcancel">Annuler</button></div>':'<button type="button" class="btn danger block" data-act="delaskThing">Supprimer ce membre</button>');
    return '<h2>Modifier '+esc(em.name)+'</h2><form data-form="editMember" data-id="'+esc(em.id)+'"><div class="field"><label for="f-name">Prénom</label><input id="f-name" name="name" type="text" maxlength="30" autocomplete="off" required value="'+esc(em.name)+'"></div>'+
    '<div class="field"><span class="lbl">Rôle</span><div class="seg"><label><input type="radio" name="role" value="child"'+(isAdult(em)?'':' checked')+'><span>Enfant</span></label><label><input type="radio" name="role" value="adult"'+(isAdult(em)?' checked':'')+'><span>Adulte</span></label></div></div>'+
    '<button type="button" class="btn block" data-act="avatarEdit" data-id="'+esc(em.id)+'">Changer l’avatar</button>'+
    '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Enregistrer</button>'+dm+'</form>';
  }
  return '';
}
function renderSheet(){
  if(!sheet){ $sheet.innerHTML=''; return; }
  var b=sheetBody();
  if(!b){ sheet=null; $sheet.innerHTML=''; return; }
  $sheet.innerHTML='<div class="backdrop" data-act="closeSheet"></div><div class="sheet" role="dialog" aria-modal="true"><button class="close" data-act="closeSheet" aria-label="Fermer">×</button>'+b+'</div>';
}
function openSheet(s){
  sheet=s; renderSheet();
  if(s.type!=='member'&&s.type!=='redeem'&&s.type!=='pot'){
    setTimeout(function(){ var i=$sheet.querySelector('input:not([type=radio]):not([hidden]),select'); if(i) i.focus(); },60);
  }
}
function avRender(){
  var sc=$sheet.querySelector('.sheet'), top=sc?sc.scrollTop:0;
  renderSheet();
  sc=$sheet.querySelector('.sheet'); if(sc) sc.scrollTop=top;
}
function closeSheet(){ sheet=null; renderSheet(); }

/* ---------- actions ---------- */
async function decide(kind,id,status){
  var en=kind==='entries'?S.entries.find(function(e){return e.id===id;}):null;
  var ok=await w(function(){return store.collection(kind).doc(id).update({status:status,decidedBy:sess,decidedTs:Date.now()});});
  if(ok){ toast(status==='approved'?'Validé.':'Refusé.'); if(en&&en.photo) dropPhoto(id); }
}
async function act(name,ds){
  var m=mById(sess);
  switch(name){
    case 'tab': tab=ds.tab; render(); window.scrollTo(0,0); break;
    case 'logout': await leaveFamily(); break;
    case 'welcome': welcomeMode=ds.m; rerender(); break;
    case 'retry': bootError=''; booted=false; render(); boot(); break;
    case 'deleteFamilyAsk': openSheet({type:'deleteFamily'}); break;
    case 'pushOn': await pushEnable(); break;
    case 'pushOff': await pushDisable(); break;
    case 'pushLater': pushSnooze(); render(); break;
    case 'copyCode':
      var cd=fam()&&fam().code; if(!cd) break;
      try{ await navigator.clipboard.writeText(fmtCode(cd)); toast('Code copié.'); }catch(e){ toast('Code : '+fmtCode(cd)); }
      break;
    case 'closeSheet': closeSheet(); break;
    case 'openEarn': earnPhoto=null; openSheet({type:'earn'}); break;
    case 'photo': openSheet({type:'photo',id:ds.id}); break;
    case 'adjust': openSheet({type:'adjust',id:ds.id,sign:ds.sign}); break;
    case 'member': openSheet({type:'member',id:ds.id}); break;
    case 'potNew': openSheet({type:'potNew'}); break;
    case 'pot': openSheet({type:'pot',id:ds.id}); break;
    case 'potJoin': openSheet({type:'potAmount',id:ds.id,mode:'join'}); break;
    case 'potAdd': openSheet({type:'potAmount',id:ds.id,mode:'add'}); break;
    case 'potDecline': await potRpc('respond_pot',{p_pot:ds.id,p_accept:false,p_amount:0},'Tu ne participes pas à cette cagnotte.'); break;
    case 'potLeave': if(await potRpc('leave_pot',{p_pot:ds.id},'Tes points te sont rendus.')) closeSheet(); break;
    case 'potCancelAsk': sheet.confirm=true; renderSheet(); break;
    case 'potCancelGo': if(await potRpc('cancel_pot',{p_pot:ds.id},'Cagnotte annulée. Les points sont rendus.')) closeSheet(); break;
    case 'potApprove': await potRpc('approve_pot',{p_pot:ds.id,p_ok:true},'Cagnotte validée.'); break;
    case 'potRefuse': await potRpc('approve_pot',{p_pot:ds.id,p_ok:false},'Cagnotte refusée.'); break;
    case 'potClaimOk': await potRpc('decide_pot_claim',{p_pot:ds.id,p_ok:true},'Cagnotte réussie !'); break;
    case 'potClaimNo': await potRpc('decide_pot_claim',{p_pot:ds.id,p_ok:false},'Choix refusé.'); break;
    case 'potChoose': await potRpc('choose_pot_reward',{p_pot:sheet.id,p_reward:ds.id},isAdult(m)?'Cagnotte réussie !':'Envoyé à un adulte pour validation.'); break;
    case 'potRewardEdit': openSheet({type:'potReward',pot:ds.pot,id:ds.id||null}); break;
    case 'potRewardDelGo':
      if(await potRpc('delete_pot_reward',{p_pot:sheet.pot,p_id:sheet.id},'Récompense supprimée.')) openSheet({type:'pot',id:sheet.pot});
      break;
    case 'potUsed': await potRpc('mark_pot_used',{p_pot:ds.id},'Parfait, c’est noté.'); break;
    case 'avatarEdit': {
      var am0=mById(ds.id); if(!am0) break;
      var c0=avParse(am0.avatar), ph0=(am0.avatar&&!c0&&am0.avatar.indexOf('data:image/jpeg;base64,')===0)?am0.avatar:null;
      openSheet({type:'avatar',id:ds.id,cfg:c0?avLimit(c0):(ph0?null:Object.assign({},AV_DEF,{b:(am0.hue||0)%AV.bg.length})),photo:ph0});
      break; }
    case 'avMode':
      if(ds.mode==='avatar'){ sheet.cfg=sheet.cfg||Object.assign({},AV_DEF); sheet.photo=null; }
      else { sheet.cfg=null; sheet.photo=null; sheet.letter=true; }
      avRender(); break;
    case 'avOpt':
      if(sheet&&sheet.cfg){ sheet.cfg[ds.k]=parseInt(ds.i,10); sheet.photo=null; avRender(); }
      break;
    case 'avSave': {
      var val=sheet.photo||(sheet.cfg?JSON.stringify(sheet.cfg):null), aid=sheet.id;
      if(await w(async function(){ dbErr(await sb.rpc('set_avatar',{p_member:aid,p_avatar:val})); })){ closeSheet(); toast('Avatar enregistré !'); }
      break; }
    case 'goalSet':
      if(await w(async function(){ dbErr(await sb.rpc('set_goal',{p_reward:ds.id})); })) toast('Objectif choisi !');
      break;
    case 'goalClear':
      await w(async function(){ dbErr(await sb.rpc('set_goal',{p_reward:null})); });
      break;
    case 'rewardUsed':
      if(await w(async function(){ dbErr(await sb.rpc('mark_reward_used',{p_id:ds.id})); })) toast('Parfait, c’est noté.');
      break;
    case 'delask': sheet.confirm=ds.kind+':'+ds.id; renderSheet(); break;
    case 'delcancel': if(sheet){ sheet.confirm=null; renderSheet(); } break;
    case 'delgo':
      var den=ds.kind==='entries'?S.entries.find(function(e){return e.id===ds.id;}):null;
      var ok=await w(function(){return store.collection(ds.kind).doc(ds.id).delete();});
      if(ok&&den&&den.photo) dropPhoto(ds.id);
      if(sheet) sheet.confirm=null;
      if(ok) toast('Supprimé.');
      break;
    case 'decide': decide(ds.kind,ds.id,ds.v); break;
    case 'rank': rankPeriod=ds.p; render(); break;
    case 'redeemAsk': openSheet({type:'redeem',id:ds.id}); break;
    case 'redeemGo':
      var r=S.rewards.find(function(x){return x.id===sheet.id;});
      if(!r||!m) break;
      if(balance(m.id)<r.cost){ toast('Pas assez de points.'); closeSheet(); break; }
      var auto=isAdult(m), now=Date.now();
      var ok2=await w(function(){return store.collection('redemptions').doc(uid()).set({memberId:m.id,rewardId:r.id,label:r.label,cost:r.cost,status:auto?'approved':'pending',ts:now,decidedBy:auto?m.id:null,decidedTs:auto?now:null});});
      if(ok2){ closeSheet(); toast(auto?'Récompense utilisée.':'Demande envoyée aux adultes.'); }
      break;
    case 'rewardEdit': openSheet({type:'reward',id:ds.id||null}); break;
    case 'rewardSuggest': openSheet({type:'reward',id:null,label:ds.label}); break;
    case 'taskEdit': openSheet({type:'task',id:ds.id||null}); break;
    case 'addMember': openSheet({type:'addMember'}); break;
    case 'editMember': openSheet({type:'editMember',id:ds.id}); break;
    case 'delaskThing': sheet.confirm=true; renderSheet(); break;
    case 'rewardDelGo':
      if(await w(function(){return store.collection('rewards').doc(sheet.id).delete();})){ closeSheet(); toast('Récompense supprimée.'); }
      break;
    case 'taskDelGo':
      if(await w(function(){return store.collection('tasks').doc(sheet.id).delete();})){ closeSheet(); toast('Tâche supprimée.'); }
      break;
    case 'memberDelGo':
      var mid=sheet.id, good=true;
      var es=S.entries.filter(function(e){return e.memberId===mid;}), rs=S.redemptions.filter(function(x){return x.memberId===mid;});
      for(var i=0;i<es.length&&good;i++){ var eid=es[i].id; good=await w(function(){return store.collection('entries').doc(eid).delete();}); if(good&&es[i].photo) dropPhoto(eid); }
      for(var j=0;j<rs.length&&good;j++){ var rid=rs[j].id; good=await w(function(){return store.collection('redemptions').doc(rid).delete();}); }
      if(good) good=await w(function(){return store.collection('members').doc(mid).delete();});
      if(good){ closeSheet(); toast('Membre supprimé.'); }
      break;
    case 'preset':
      var l=document.getElementById('f-label'), p=document.getElementById('f-pts');
      if(l) l.value=ds.label; if(p) p.value=ds.pts;
      break;
  }
}
document.addEventListener('click',function(e){
  var el=e.target.closest('[data-act]'); if(!el) return;
  if(el.tagName==='INPUT') return;
  act(el.dataset.act,el.dataset);
});
document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&sheet) closeSheet(); });
document.addEventListener('change',async function(e){
  var el=e.target; if(el&&el.name==='task'){ var er0=document.getElementById('err'); if(er0) er0.textContent=''; return; }
  if(el&&el.id==='f-avphoto'&&el.files&&el.files[0]&&sheet&&sheet.type==='avatar'){
    try{ sheet.photo=await squarePhoto(el.files[0],160); sheet.cfg=null; avRender(); }
    catch(x){ toast('Impossible de lire cette photo. Essaie-en une autre.'); }
    return;
  }
  if(!el||el.id!=='f-photo'||!el.files||!el.files[0]) return;
  var er=document.getElementById('err'); if(er) er.textContent='';
  try{ earnPhoto=await compressPhoto(el.files[0]); }
  catch(x){ earnPhoto=null; toast('Impossible de lire cette photo. Essaie-en une autre.'); }
  var pv=document.getElementById('photoPrev');
  if(pv){ pv.innerHTML=earnPhoto?'<img alt="Aperçu de ta photo" src="'+earnPhoto+'">':''; pv.hidden=!earnPhoto; }
  var lb=document.getElementById('photoLbl'); if(lb) lb.textContent=earnPhoto?'Reprendre la photo':'Prendre une photo';
});

/* ---------- forms ---------- */
async function createMember(name,role){
  var data={name:name,role:role,hue:S.members.length%HUES.length,ts:Date.now()};
  var id=uid();
  var ok=await w(function(){return store.collection('members').doc(id).set(data);});
  return ok?id:null;
}
document.addEventListener('submit',async function(e){
  e.preventDefault();
  var form=e.target, kind=form.dataset.form; if(!kind) return;
  var fd=new FormData(form);
  var g=function(k){return String(fd.get(k)||'').trim();};
  var err=function(msg){ var el=document.getElementById('err'); if(el) el.textContent=msg; };
  var btn=form.querySelector('button[type=submit]'); if(btn) btn.disabled=true;
  var done=function(){ if(btn) btn.disabled=false; };
  var n=parseInt(g('points')||g('cost'),10), label=g('label'), now=Date.now();
  try{
    if(kind==='setup'){
      var name=g('name');
      if(!name){ err('Entre ton prénom.'); return; }
      var cres=await sb.rpc('create_family',{p_name:name});
      if(cres.error){ err(cres.error.code==='P0001'?cres.error.message:'Impossible de créer la famille. Vérifie ta connexion.'); return; }
      await afterLink('family');
      toast('Famille créée. Voici ton code.');
    }
    else if(kind==='potNew'){
      var pn=g('name'), pa=parseInt(g('amount'),10), inv=fd.getAll('inv'), dl=g('deadline');
      if(!pn){ err('Donne un nom à la cagnotte.'); return; }
      if(!inv.length){ err('Invite au moins une personne.'); return; }
      if(!(pa>=1)){ err('Mets au moins 1 point.'); return; }
      var dlIso=null; if(dl){ var dd=new Date(dl+'T23:59:00'); if(isNaN(dd.getTime())||dd.getTime()<=Date.now()){ err('La date limite doit être dans le futur.'); return; } dlIso=dd.toISOString(); }
      var pr=await sb.rpc('create_pot',{p_name:pn,p_invitees:inv,p_amount:pa,p_deadline:dlIso});
      if(pr.error){ err(pr.error.code==='P0001'?pr.error.message:'Impossible de créer la cagnotte. Vérifie ta connexion.'); return; }
      scheduleRefresh(); closeSheet(); toast(isAdult(mById(sess))?'Cagnotte créée. Les invités sont prévenus.':'Envoyé à un adulte pour validation.');
    }
    else if(kind==='potAmount'){
      var am=parseInt(g('amount'),10), mode=form.dataset.mode, pid=form.dataset.id;
      if(!(am>=1)){ err('Mets au moins 1 point.'); return; }
      var ar=mode==='join'?await sb.rpc('respond_pot',{p_pot:pid,p_accept:true,p_amount:am}):await sb.rpc('add_to_pot',{p_pot:pid,p_amount:am});
      if(ar.error){ err(ar.error.code==='P0001'?ar.error.message:'Impossible pour le moment. Vérifie ta connexion.'); return; }
      scheduleRefresh(); openSheet({type:'pot',id:pid}); toast(mode==='join'?'Tu participes à la cagnotte.':'Points ajoutés.');
    }
    else if(kind==='potReward'){
      var potId=form.dataset.pot, rwId=form.dataset.id||null;
      if(!label){ err('Donne un nom à la récompense.'); return; }
      if(!(n>=1)){ err('Entre le nombre de points nécessaires.'); return; }
      var rr=await sb.rpc('save_pot_reward',{p_pot:potId,p_id:rwId,p_label:label,p_cost:n});
      if(rr.error){ err(rr.error.code==='P0001'?rr.error.message:'Impossible pour le moment. Vérifie ta connexion.'); return; }
      scheduleRefresh(); openSheet({type:'pot',id:potId}); toast('Récompense enregistrée.');
    }
    else if(kind==='join'){
      var jr=await sb.rpc('join_family',{p_name:g('name'),p_code:g('code')});
      if(jr.error){ err('Impossible de rejoindre pour le moment. Vérifie ta connexion.'); return; }
      var jd=jr.data||{};
      if(!jd.ok){ err(JOIN_ERR[jd.error]||'Impossible de rejoindre.'); return; }
      await afterLink('home');
    }
    else if(kind==='deleteFamily'){
      if(norm(g('confirm'))!=='supprimer'){ err('Écris SUPPRIMER pour confirmer.'); return; }
      if(await deleteFamilyData()){ closeSheet(); rerender(); toast('Famille supprimée.'); }
    }
    else if(kind==='earn'){
      var tk=S.tasks.find(function(x){return x.id===g('task');});
      if(!tk){ err('Choisis la tâche que tu as faite.'); return; }
      if(!earnPhoto){ err('Prends une photo de ce que tu as fait.'); return; }
      var eid=uid(), pdata=earnPhoto;
      if(!(await w(function(){return store.collection('photos').doc(eid).set({data:pdata,memberId:sess,ts:now});}))) return;
      if(await w(function(){return store.collection('entries').doc(eid).set({memberId:sess,label:tk.label,points:tk.points,taskId:tk.id,photo:true,status:'pending',createdBy:sess,ts:now});})){ earnPhoto=null; closeSheet(); toast('Envoyé. Un adulte va le valider.'); }
      else dropPhoto(eid);
    }
    else if(kind==='adjust'){
      var mem=g('member'), sign=g('sign')==='-1'?-1:1;
      if(!mById(mem)){ err('Choisis une personne.'); return; }
      if(!label){ err('Ajoute un motif.'); return; }
      if(!(n>=1&&n<=1000)){ err('Entre un nombre de points entre 1 et 1000.'); return; }
      if(await w(function(){return store.collection('entries').doc(uid()).set({memberId:mem,label:label,points:sign*n,status:'approved',createdBy:sess,ts:now,decidedBy:sess,decidedTs:now});})){ closeSheet(); toast(sg(sign*n)+' '+ptsWord(n)+' pour '+mById(mem).name+'.'); }
    }
    else if(kind==='reward'){
      if(!label){ err('Donne un nom à la récompense.'); return; }
      if(!(n>=1)){ err('Entre le nombre de points nécessaires.'); return; }
      var rid=form.dataset.id||uid(), old=S.rewards.find(function(x){return x.id===rid;});
      if(await w(function(){return store.collection('rewards').doc(rid).set({label:label,cost:n,ts:old?old.ts:now});})){ closeSheet(); toast('Récompense enregistrée.'); }
    }
    else if(kind==='task'){
      if(!label){ err('Donne un nom à la tâche.'); return; }
      if(!(n>=1&&n<=1000)){ err('Entre un nombre de points entre 1 et 1000.'); return; }
      var tid=form.dataset.id||uid(), ot=S.tasks.find(function(x){return x.id===tid;});
      if(await w(function(){return store.collection('tasks').doc(tid).set({label:label,points:n,ts:ot?ot.ts:now});})){ closeSheet(); toast('Tâche enregistrée.'); }
    }
    else if(kind==='addMember'){
      var nm=g('name'), role=g('role')==='adult'?'adult':'child';
      if(!nm){ err('Entre un prénom.'); return; }
      if(S.members.some(function(x){return norm(x.name)===norm(nm);})){ err('Ce prénom existe déjà dans la famille.'); return; }
      if(await createMember(nm,role)){ closeSheet(); toast(nm+' peut rejoindre avec le code de famille.'); }
    }
    else if(kind==='editMember'){
      var em=mById(form.dataset.id); if(!em){ closeSheet(); return; }
      var nn=g('name'), nr=g('role')==='adult'?'adult':'child';
      if(!nn){ err('Entre un prénom.'); return; }
      if(S.members.some(function(x){return x.id!==em.id&&norm(x.name)===norm(nn);})){ err('Ce prénom existe déjà dans la famille.'); return; }
      if(nr!==em.role&&isAdult(em)&&(em.id===sess||S.members.filter(isAdult).length<2)){ err(em.id===sess?'Tu ne peux pas changer ton propre rôle.':'Il faut garder au moins un adulte.'); return; }
      var upd={name:nn,role:nr};
      if(await w(function(){return store.collection('members').doc(em.id).update(upd);})){ closeSheet(); toast('Enregistré.'); }
    }
  } finally { done(); }
});

/* ---------- data (Supabase) ---------- */
var fromRow={
  members:function(r){return {id:r.id,name:r.name,role:r.role,hue:r.hue,goalId:r.goal_reward_id||null,avatar:r.avatar||null,ts:Date.parse(r.created_at)};},
  tasks:function(r){return {id:r.id,label:r.label,points:r.points,ts:Date.parse(r.created_at)};},
  rewards:function(r){return {id:r.id,label:r.label,cost:r.cost,ts:Date.parse(r.created_at)};},
  entries:function(r){return {id:r.id,memberId:r.member_id,taskId:r.task_id,label:r.label,points:r.points,status:r.status,photo:!!r.photo_path,ts:Date.parse(r.created_at),decidedTs:r.decided_at?Date.parse(r.decided_at):null};},
  redemptions:function(r){return {id:r.id,memberId:r.member_id,rewardId:r.reward_id,label:r.label,cost:r.cost,status:r.status,ts:Date.parse(r.created_at),decidedTs:r.decided_at?Date.parse(r.decided_at):null,usedTs:r.used_at?Date.parse(r.used_at):null};},
  pots:function(r){return {id:r.id,name:r.name,createdBy:r.created_by,status:r.status,deadline:r.deadline?Date.parse(r.deadline):null,chosenId:r.chosen_reward_id,chosenLabel:r.chosen_label,chosenCost:r.chosen_cost,ts:Date.parse(r.created_at),usedTs:r.used_at?Date.parse(r.used_at):null};},
  potMembers:function(r){return {id:r.pot_id+':'+r.member_id,potId:r.pot_id,memberId:r.member_id,status:r.status,amount:r.amount};},
  potRewards:function(r){return {id:r.id,potId:r.pot_id,label:r.label,cost:r.cost,ts:Date.parse(r.created_at)};},
  family:function(r){return {id:'main',code:r.code};}
};
function dbErr(r){ if(r&&r.error) throw r.error; return r; }
function makeStore(){
  var path=function(id){return familyId+'/'+id+'.jpg';};
  function dataUrlToBlob(u){
    var p=u.split(','), mime=(p[0].match(/:(.*?);/)||[])[1]||'image/jpeg', bin=atob(p[1]), arr=new Uint8Array(bin.length);
    for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    return new Blob([arr],{type:mime});
  }
  function blobToDataUrl(b){ return new Promise(function(res,rej){ var fr=new FileReader(); fr.onload=function(){res(fr.result);}; fr.onerror=rej; fr.readAsDataURL(b); }); }
  var rowOut={
    members:function(id,d){return {id:id,family_id:familyId,name:d.name,role:d.role,hue:d.hue||0};},
    tasks:function(id,d){return {id:id,family_id:familyId,label:d.label,points:d.points};},
    rewards:function(id,d){return {id:id,family_id:familyId,label:d.label,cost:d.cost};},
    entries:function(id,d){return {id:id,family_id:familyId,member_id:d.memberId,task_id:d.taskId||null,label:d.label,points:d.points,status:d.status||'pending',photo_path:d.photo?path(id):null};},
    redemptions:function(id,d){return {id:id,family_id:familyId,member_id:d.memberId,reward_id:d.rewardId,label:d.label,cost:d.cost,status:d.status||'pending'};}
  };
  var upsertable={tasks:true,rewards:true};
  return {collection:function(name){ return {doc:function(id){ return {
    set:async function(d){
      if(name==='photos'){
        var up=await sb.storage.from('photos').upload(path(id),dataUrlToBlob(d.data),{contentType:'image/jpeg',upsert:false});
        if(up.error) throw up.error;
        return;
      }
      var q=sb.from(TABLE[name]), row=rowOut[name](id,d);
      dbErr(await (upsertable[name]?q.upsert(row):q.insert(row)));
    },
    update:async function(d){
      var patch=name==='members'?{name:d.name,role:d.role}:{status:d.status};
      dbErr(await sb.from(TABLE[name]).update(patch).eq('id',id));
    },
    delete:async function(){
      if(name==='photos'){
        await sb.storage.from('photos').remove([path(id)]);
        await sb.from('entries').update({photo_path:null}).eq('id',id);
        return;
      }
      dbErr(await sb.from(TABLE[name]).delete().eq('id',id));
    },
    get:async function(){
      var dl=await sb.storage.from('photos').download(path(id));
      if(dl.error||!dl.data) return {exists:false,data:function(){return null;}};
      var u=await blobToDataUrl(dl.data);
      return {exists:true,data:function(){return {data:u};}};
    }
  };}};}};
}
async function refreshLink(){
  var r=await sb.from('member_users').select('member_id,family_id').maybeSingle();
  if(r.error) throw r.error;
  sess=r.data?r.data.member_id:null;
  familyId=r.data?r.data.family_id:null;
}
function resetData(){
  COLL.forEach(function(c){S[c]=[];ready[c]=false;});
  photoCache={}; photoLoading={}; sess=null; familyId=null; tab='home';
}
async function loadAll(){
  if(!sb||!sess) return;
  try{
    var res=await Promise.all(COLL.map(function(n){return sb.from(TABLE[n]).select('*');}));
    res.forEach(function(r){ if(r.error) throw r.error; });
    COLL.forEach(function(n,i){ S[n]=res[i].data.map(fromRow[n]); ready[n]=true; });
    offline=false;
    if(!S.members.some(function(m){return m.id===sess;})){
      await refreshLink();
      if(!sess){ stopData(); resetData(); closeSheet(); }
    }
  }catch(e){ offline=true; }
  render();
}
function scheduleRefresh(){ clearTimeout(refreshTimer); refreshTimer=setTimeout(loadAll,250); }
function onVisible(){ if(document.visibilityState==='visible') loadAll(); }
function startData(){
  if(rt||!sb) return;
  rt=sb.channel('pf-'+familyId);
  ['members','entries','rewards','redemptions','tasks','pots','pot_members','pot_rewards'].forEach(function(t){
    rt.on('postgres_changes',{event:'*',schema:'public',table:t},scheduleRefresh);
  });
  rt.subscribe();
  poll=setInterval(loadAll,30000);
  document.addEventListener('visibilitychange',onVisible);
}
function stopData(){
  if(rt){ try{ sb.removeChannel(rt); }catch(e){} rt=null; }
  clearInterval(poll); poll=null;
  document.removeEventListener('visibilitychange',onVisible);
}
async function afterLink(t){
  await refreshLink();
  tab=t||'home';
  if(sess){ startData(); await loadAll(); }
  rerender();
  pushRefreshState(); pushSync();
}
async function leaveFamily(){
  var r=await sb.rpc('leave_family');
  if(r.error){ toast('Impossible de quitter sans connexion.'); return; }
  stopData(); resetData(); closeSheet(); rerender();
}
async function deleteFamilyData(){
  try{
    var fid=familyId, lst=await sb.storage.from('photos').list(fid,{limit:1000});
    if(lst.data&&lst.data.length) await sb.storage.from('photos').remove(lst.data.map(function(x){return fid+'/'+x.name;}));
  }catch(e){}
  var r=await sb.rpc('delete_family');
  if(r.error){ toast(r.error.code==='P0001'?r.error.message:"Impossible de supprimer la famille. Réessaie."); return false; }
  stopData(); resetData();
  return true;
}
/* ---------- cagnottes : regrouper des points ---------- */
var POT_OPEN=['pending','active','claiming'];
function potLive(p){ return p.status==='done'||(POT_OPEN.indexOf(p.status)>=0&&(!p.deadline||p.deadline>Date.now())); }
function potExpired(p){ return POT_OPEN.indexOf(p.status)>=0&&!!p.deadline&&p.deadline<=Date.now(); }
function potById(id){ return S.pots.find(function(p){return p.id===id;}); }
function pmOf(p,mid){ return S.potMembers.find(function(x){return x.potId===p.id&&x.memberId===mid;}); }
function potIn(p){ return S.potMembers.filter(function(x){return x.potId===p.id&&x.status==='in';}); }
function potTotal(p){ return sum(potIn(p),function(x){return x.amount;}); }
function potRewardsOf(p){ return S.potRewards.filter(function(r){return r.potId===p.id;}).sort(function(a,b){return a.cost-b.cost||a.label.localeCompare(b.label,'fr');}); }
function locked(id){
  var t=0;
  S.potMembers.forEach(function(x){ if(x.memberId!==id||x.status!=='in') return; var p=potById(x.potId); if(p&&potLive(p)) t+=x.amount; });
  return t;
}
function potStatusText(p){
  if(potExpired(p)) return 'Expirée';
  return {pending:'En attente d’un adulte',active:'En cours',claiming:'Choix à valider',done:'Terminée',cancelled:'Annulée'}[p.status]||p.status;
}
function dateFr(ts){ return new Date(ts).toLocaleDateString('fr-FR',{day:'numeric',month:'long'}); }
async function potRpc(fn,args,okMsg){
  var ok=await w(async function(){ dbErr(await sb.rpc(fn,args)); });
  if(ok&&okMsg) toast(okMsg);
  return ok;
}
function potVisible(p,m){
  if(!potLive(p)||p.status==='done'||p.status==='cancelled') return false;
  if(p.status==='pending') return isAdult(m)||p.createdBy===m.id;
  var mine=pmOf(p,m.id);
  return isAdult(m)||(mine&&mine.status!=='declined')||false;
}
function potInvites(m){
  return S.pots.filter(function(p){var x=pmOf(p,m.id);return x&&x.status==='invited'&&p.status==='active'&&potLive(p);}).map(function(p){
    var cr=mById(p.createdBy);
    return '<section class="card invite"><div class="eyebrow">Invitation</div><div class="prize-title" style="font-size:24px">'+esc(p.name)+'</div><p class="muted small">'+esc(cr?cr.name:'Quelqu’un')+' t’invite à regrouper des points. Tu choisis combien tu mets.</p><div class="mactions"><button class="btn" style="flex:1" data-act="potDecline" data-id="'+esc(p.id)+'">Non merci</button><button class="btn primary" style="flex:1" data-act="potJoin" data-id="'+esc(p.id)+'">Participer</button></div></section>';
  }).join('');
}
function potPrizes(m){
  return S.pots.filter(function(p){var x=pmOf(p,m.id);return p.status==='done'&&!p.usedTs&&x&&x.status==='in';}).map(function(p){
    return '<section class="card prize"><div class="eyebrow">Bravo ! Cagnotte réussie</div><div class="prize-title">'+esc(p.chosenLabel||p.name)+'</div><p class="muted small">'+esc(p.name)+'. Appuie sur le bouton quand vous l’avez eue.</p><button class="btn primary block" data-act="potUsed" data-id="'+esc(p.id)+'">Récupérée</button></section>';
  }).join('');
}
function potProgress(p){
  var t=potTotal(p), rw=potRewardsOf(p), target=rw.length?rw[0].cost:0;
  return {total:t,target:target,pct:target?Math.max(0,Math.min(100,t/target*100)):0};
}
function potsSection(m){
  var adult=isAdult(m);
  var list=S.pots.filter(function(p){return potVisible(p,m);}).sort(function(a,b){return b.ts-a.ts;});
  var h=potInvites(m)+potPrizes(m);
  if(!adult&&!list.length) return h;
  h+='<section class="card"><div class="section-title"><h3>Cagnottes</h3>'+(adult?'<button class="btn small primary" data-act="potNew">Regrouper nos points</button>':'')+'</div>';
  if(!list.length) h+='<p class="muted small" style="margin-top:6px">Regroupez des points pour viser une plus grosse récompense.</p>';
  else h+='<ul class="list">'+list.map(function(p){
    var pr=potProgress(p), cr=mById(p.createdBy);
    return '<li><div class="potitem"><button class="open potopen" data-act="pot" data-id="'+esc(p.id)+'"><span class="mmain"><span class="hlabel">'+esc(p.name)+'</span><br><span class="muted small">'+potStatusText(p)+(cr?' · '+esc(cr.name):'')+(p.deadline?' · jusqu’au '+dateFr(p.deadline):'')+'</span></span><span class="bal">'+pr.total+'</span></button>'+
    '<div class="bar"><i style="width:'+pr.pct+'%"></i></div>'+(pr.target?'<p class="muted small" style="margin:4px 0 0">Première récompense : '+pr.target+' pts</p>':'')+'</div></li>';
  }).join('')+'</ul>';
  return h+'</section>';
}
function potSheetBody(s){
  var me=mById(sess);
  if(s.type==='potNew'){
    if(!me) return '';
    var others=S.members.filter(function(x){return x.id!==me.id;}).sort(function(a,b){return (a.ts||0)-(b.ts||0);});
    if(!others.length) return '<h2>Regrouper nos points</h2><p class="muted">Il faut au moins une autre personne dans la famille.</p>';
    var bal=balance(me.id);
    if(bal<1) return '<h2>Regrouper nos points</h2><p class="muted">Tu n’as pas encore de points à mettre dans une cagnotte.</p>';
    return '<h2>Regrouper nos points</h2><p class="muted">Mettez des points en commun pour viser une plus grosse récompense. Chacun choisit combien il met.</p>'+
    '<form data-form="potNew"><div class="field"><label for="f-name">Nom de la cagnotte</label><input id="f-name" name="name" type="text" maxlength="60" autocomplete="off" required placeholder="Ex. : Sortie au parc"></div>'+
    '<div class="field"><span class="lbl">Invités</span><div class="tasklist">'+others.map(function(x){return '<label class="taskopt"><input type="checkbox" name="inv" value="'+esc(x.id)+'" checked><span class="tbody"><span>'+esc(x.name)+'</span></span></label>';}).join('')+'</div></div>'+
    '<div class="field"><label for="f-amount">Tes points dans la cagnotte (tu en as '+bal+')</label><input id="f-amount" name="amount" type="number" inputmode="numeric" min="1" max="'+bal+'" required></div>'+
    '<div class="field"><label for="f-deadline">Date limite (facultatif)</label><input id="f-deadline" name="deadline" type="date"><span class="muted small">Sans date, la cagnotte reste ouverte jusqu’à ce qu’elle soit utilisée ou annulée.</span></div>'+
    (isAdult(me)?'':'<p class="muted small">Un adulte devra valider la cagnotte avant qu’elle démarre.</p>')+
    '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Créer la cagnotte</button></form>';
  }
  if(s.type==='potAmount'){
    var p=potById(s.id); if(!p||!me) return '';
    var bl=balance(me.id);
    if(bl<1) return '<h2>'+esc(p.name)+'</h2><p class="muted">Tu n’as pas de points disponibles pour le moment.</p><button class="btn block" data-act="pot" data-id="'+esc(p.id)+'">Retour</button>';
    return '<h2>'+(s.mode==='join'?'Participer':'Ajouter des points')+'</h2><p class="muted">'+esc(p.name)+'. Tu as <strong>'+bl+'</strong> '+ptsWord(bl)+' disponibles. Tu choisis combien tu mets, pas besoin de tout donner.</p>'+
    '<form data-form="potAmount" data-id="'+esc(p.id)+'" data-mode="'+esc(s.mode)+'"><div class="field"><label for="f-amount">Points à mettre</label><input id="f-amount" name="amount" type="number" inputmode="numeric" min="1" max="'+bl+'" required></div><p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Confirmer</button></form>';
  }
  if(s.type==='potReward'){
    var pp=potById(s.pot); if(!pp) return '';
    var rw=s.id?S.potRewards.find(function(x){return x.id===s.id;}):null;
    var del=rw?(s.confirm?'<div class="mactions"><button type="button" class="btn danger" style="flex:1" data-act="potRewardDelGo">Supprimer</button><button type="button" class="btn" style="flex:1" data-act="delcancel">Annuler</button></div>':'<button type="button" class="btn danger block" data-act="delaskThing">Supprimer cette récompense</button>'):'';
    return '<h2>'+(rw?'Modifier la récompense':'Nouvelle récompense')+'</h2><p class="muted small">'+esc(pp.name)+'</p><form data-form="potReward" data-pot="'+esc(pp.id)+'" data-id="'+(rw?esc(rw.id):'')+'"><div class="field"><label for="f-label">Nom</label><input id="f-label" name="label" type="text" maxlength="80" autocomplete="off" required value="'+esc(rw?rw.label:'')+'"></div>'+
    '<div class="field"><label for="f-cost">Points nécessaires</label><input id="f-cost" name="cost" type="number" inputmode="numeric" min="1" max="1000000" required value="'+(rw?rw.cost:'')+'"></div><p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Enregistrer</button>'+del+'</form>';
  }
  if(s.type==='pot'){
    var q=potById(s.id); if(!q||!me) return '';
    var adult=isAdult(me), mine=pmOf(q,me.id), isCr=q.createdBy===me.id, live=potLive(q), open=live&&POT_OPEN.indexOf(q.status)>=0;
    var tot=potTotal(q), rws=potRewardsOf(q), cr=mById(q.createdBy);
    var h='<h2>'+esc(q.name)+'</h2><p class="muted small">'+potStatusText(q)+(cr?' · créée par '+esc(cr.name):'')+(q.deadline?' · jusqu’au '+dateFr(q.deadline):'')+'</p>';
    h+='<div class="hero"><div class="eyebrow">'+(q.status==='done'?'Points dépensés':'Points regroupés')+'</div><div class="big" style="font-size:56px">'+(q.status==='done'?(q.chosenCost||tot):tot)+'</div></div>';
    if(q.status==='done') h+='<p><strong>Récompense obtenue :</strong> '+esc(q.chosenLabel||'')+'</p>';
    if(q.status==='claiming') h+='<p class="note">Choix en attente de validation : <strong>'+esc(q.chosenLabel||'')+'</strong> ('+(q.chosenCost||0)+' pts)</p>';
    if(q.status==='pending') h+='<p class="note">En attente de la validation d’un adulte avant de démarrer.</p>';
    if(q.status==='cancelled') h+='<p class="note">Cagnotte annulée, les points ont été rendus.</p>';
    if(potExpired(q)) h+='<p class="note">La date limite est passée, les points ont été rendus.</p>';
    var pms=S.potMembers.filter(function(x){return x.potId===q.id;}).sort(function(a,b){var o={in:0,invited:1,declined:2};return (o[a.status]-o[b.status])||(b.amount-a.amount);});
    h+='<h3>Participants</h3><ul class="list">'+pms.map(function(x){
      var mm=mById(x.memberId); if(!mm) return '';
      return '<li><div class="hrow">'+avatar(mm)+'<div class="hmain"><div class="hlabel">'+esc(mm.name)+(mm.id===me.id?' (toi)':'')+'</div><div class="hmeta"><span>'+({in:'participe',invited:'invité(e)',declined:'ne participe pas'}[x.status])+'</span></div></div><div class="hpts plus">'+(x.status==='in'?x.amount:'')+'</div></div></li>';
    }).join('')+'</ul>';
    if(q.status!=='done'&&q.status!=='cancelled'){
      h+='<h3>Récompenses possibles</h3>';
      if(!rws.length) h+='<p class="muted small">'+(adult?'Ajoute les récompenses possibles et leur coût.':'Un adulte va ajouter les récompenses possibles.')+'</p>';
      else h+='<ul class="list">'+rws.map(function(r){
        var canPick=open&&q.status==='active'&&tot>=r.cost&&(adult||isCr);
        return '<li><div class="potrw"><div class="reward-top"><strong class="hlabel">'+esc(r.label)+'</strong><span class="cost">'+r.cost+'</span></div><div class="bar"><i style="width:'+Math.max(0,Math.min(100,tot/r.cost*100))+'%"></i></div><div class="reward-bottom">'+
        (canPick?'<button class="btn small primary" data-act="potChoose" data-id="'+esc(r.id)+'">Choisir</button>':(open&&q.status==='active'&&tot<r.cost?'<span class="muted small">Encore '+(r.cost-tot)+' '+ptsWord(r.cost-tot)+'</span>':'<span></span>'))+
        (adult&&open&&(q.status==='active'||q.status==='pending')?'<button class="link" data-act="potRewardEdit" data-pot="'+esc(q.id)+'" data-id="'+esc(r.id)+'">Modifier</button>':'')+'</div></div></li>';
      }).join('')+'</ul>';
      if(adult&&open&&(q.status==='active'||q.status==='pending')) h+='<button class="btn block" data-act="potRewardEdit" data-pot="'+esc(q.id)+'">Ajouter une récompense</button>';
    }
    var acts='';
    if(open&&adult&&q.status==='pending') acts+='<div class="mactions"><button class="btn" style="flex:1" data-act="potRefuse" data-id="'+esc(q.id)+'">Refuser</button><button class="btn primary" style="flex:1" data-act="potApprove" data-id="'+esc(q.id)+'">Valider</button></div>';
    if(open&&adult&&q.status==='claiming') acts+='<div class="mactions"><button class="btn" style="flex:1" data-act="potClaimNo" data-id="'+esc(q.id)+'">Refuser le choix</button><button class="btn primary" style="flex:1" data-act="potClaimOk" data-id="'+esc(q.id)+'">Valider le choix</button></div>';
    if(open&&q.status==='active'&&mine&&mine.status==='invited') acts+='<div class="mactions"><button class="btn" style="flex:1" data-act="potDecline" data-id="'+esc(q.id)+'">Non merci</button><button class="btn primary" style="flex:1" data-act="potJoin" data-id="'+esc(q.id)+'">Participer</button></div>';
    if(open&&q.status==='active'&&mine&&mine.status==='in'){
      acts+='<button class="btn primary block" data-act="potAdd" data-id="'+esc(q.id)+'">Ajouter des points</button>';
      if(!isCr) acts+='<button class="btn block" data-act="potLeave" data-id="'+esc(q.id)+'">Retirer mes points</button>';
    }
    if(q.status==='done'&&!q.usedTs&&(adult||(mine&&mine.status==='in'))) acts+='<button class="btn primary block" data-act="potUsed" data-id="'+esc(q.id)+'">Récupérée</button>';
    if(open&&(adult||isCr)){
      acts+=s.confirm?'<p class="muted small">Les points de tout le monde seront rendus.</p><div class="mactions"><button class="btn danger" style="flex:1" data-act="potCancelGo" data-id="'+esc(q.id)+'">Annuler la cagnotte</button><button class="btn" style="flex:1" data-act="delcancel">Garder</button></div>':'<button class="btn danger block" data-act="potCancelAsk">Annuler la cagnotte</button>';
    }
    return h+(acts?'<div class="potacts">'+acts+'</div>':'');
  }
  return null;
}

/* ---------- notifications (web push) ---------- */
var pushState='', pushBusy=false, pushSnoozed=false;
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1); }
function isStandalone(){ try{ return navigator.standalone===true||(window.matchMedia&&matchMedia('(display-mode: standalone)').matches); }catch(e){ return false; } }
function pushCapable(){ return !!(CFG.vapidPublicKey&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window); }
function b64ToBytes(str){ str=str.replace(/-/g,'+').replace(/_/g,'/'); while(str.length%4) str+='='; var bin=atob(str), a=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i); return a; }
function pushSnoozedNow(){
  if(pushSnoozed) return true;
  try{ var t=+localStorage.getItem('pf-push-later'); return !!t&&Date.now()-t<3*86400000; }catch(e){ return false; }
}
function pushSnooze(){ pushSnoozed=true; try{ localStorage.setItem('pf-push-later',String(Date.now())); }catch(e){} }
async function pushRefreshState(){
  var st='';
  if(!CFG.vapidPublicKey) st='';
  else if(isIOS()&&!isStandalone()) st='install';
  else if(!pushCapable()) st='';
  else if(Notification.permission==='denied') st='denied';
  else {
    try{
      var reg=await navigator.serviceWorker.getRegistration();
      var sub=reg?await reg.pushManager.getSubscription():null;
      st=(Notification.permission==='granted'&&sub)?'on':'off';
    }catch(e){ st='off'; }
  }
  if(st!==pushState){ pushState=st; render(); }
}
async function pushSave(sub){
  var j=sub.toJSON();
  var r=await sb.rpc('save_push_subscription',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth});
  if(r.error) throw r.error;
}
/* Rattache l'appareil au profil actuel (après avoir rejoint ou changé de famille). */
async function pushSync(){
  try{
    if(!sess||!pushCapable()||Notification.permission!=='granted') return;
    var reg=await navigator.serviceWorker.getRegistration();
    var sub=reg?await reg.pushManager.getSubscription():null;
    if(sub) await pushSave(sub);
  }catch(e){}
}
async function pushEnable(){
  if(pushBusy) return;
  pushBusy=true;
  try{
    var perm=await Notification.requestPermission();
    if(perm!=='granted'){ toast(perm==='denied'?'Notifications refusées. Tu peux les autoriser dans les Réglages du téléphone.':'Notifications non activées.'); return; }
    var reg=await navigator.serviceWorker.getRegistration();
    if(!reg) reg=await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    var sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToBytes(CFG.vapidPublicKey)});
    await pushSave(sub);
    toast('Notifications activées.');
  }catch(e){
    toast("Impossible d’activer les notifications. Réessaie.");
  }finally{
    pushBusy=false; await pushRefreshState(); render();
  }
}
async function pushDisable(){
  try{
    var reg=await navigator.serviceWorker.getRegistration();
    var sub=reg?await reg.pushManager.getSubscription():null;
    if(sub){
      try{ await sb.rpc('delete_push_subscription',{p_endpoint:sub.endpoint}); }catch(e){}
      await sub.unsubscribe();
    }
    toast('Notifications désactivées.');
  }catch(e){ toast('Impossible de désactiver pour le moment.'); }
  await pushRefreshState(); render();
}
function pushBannerShown(){ return !!sess&&!pushSnoozedNow()&&(pushState==='off'||pushState==='install'); }
function pushBanner(){
  if(!pushBannerShown()) return '';
  if(pushState==='off') return '<section class="card pushcard"><h3>Notifications</h3><p class="muted small" style="margin:4px 0 10px">Reçois une alerte quand une demande arrive ou qu’elle est validée.</p><div class="mactions"><button class="btn primary small" data-act="pushOn">Activer</button><button class="btn small" data-act="pushLater">Plus tard</button></div></section>';
  return '<p class="note">Pour recevoir des notifications sur iPhone, ajoute d’abord l’application à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), puis ouvre-la depuis son icône. <button class="link" data-act="pushLater">Masquer</button></p>';
}
function pushCard(){
  if(!pushState||pushBannerShown()) return '';
  var h='<section class="card"><h3>Notifications</h3>';
  if(pushState==='on') h+='<p class="muted small" style="margin:4px 0 10px">Activées sur cet appareil.</p><button class="btn small" data-act="pushOff">Désactiver</button>';
  else if(pushState==='denied') h+='<p class="muted small" style="margin:4px 0 0">Bloquées pour cette application. Autorise-les dans les Réglages du téléphone, rubrique Notifications.</p>';
  else if(pushState==='install') h+='<p class="muted small" style="margin:4px 0 0">Sur iPhone, ajoute l’application à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil ») et ouvre-la depuis son icône pour activer les notifications.</p>';
  else h+='<p class="muted small" style="margin:4px 0 10px">Désactivées sur cet appareil.</p><button class="btn primary small" data-act="pushOn">Activer</button>';
  return h+'</section>';
}
async function boot(){
  render();
  if(!window.supabase||!CFG.supabaseUrl||!CFG.supabaseKey){ bootError='La configuration de l’application est incomplète.'; booted=true; render(); return; }
  try{
    if(!sb) sb=window.supabase.createClient(CFG.supabaseUrl,CFG.supabaseKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
    store=makeStore();
    var gs=await sb.auth.getSession();
    if(!gs.data||!gs.data.session){
      var si=await sb.auth.signInAnonymously();
      if(si.error) throw si.error;
    }
    await refreshLink();
  }catch(e){
    bootError=(e&&e.code==='anonymous_provider_disabled')
      ? 'La connexion anonyme n’est pas activée dans Supabase (Authentication, Sign In / Providers).'
      : (navigator.onLine?'Impossible de joindre le serveur. Réessaie dans un instant.':'Pas de connexion internet.');
    booted=true; render(); return;
  }
  booted=true;
  if(sess){ startData(); await loadAll(); }
  render();
  pushRefreshState(); pushSync();
  setTimeout(function(){ if(sess&&!allReady()){ slow=true; render(); } },10000);
}
boot();
})();
