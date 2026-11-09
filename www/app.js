(function(){
'use strict';
var $app=document.getElementById('app'), $sheet=document.getElementById('sheetRoot'), $toast=document.getElementById('toast');
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var uid=function(){try{return crypto.randomUUID();}catch(e){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});}};
var COLL=['members','entries','rewards','redemptions','tasks','family'];
var S={}, ready={};
COLL.forEach(function(c){S[c]=[];});
var store=null, sb=null, slow=false, dirty=false, booted=false, bootError='', offline=false, welcomeMode='join', familyId=null, rt=null, poll=null, refreshTimer=null;
var CFG=window.PF_CONFIG||{};
var TABLE={members:'members',entries:'entries',rewards:'rewards',redemptions:'redemptions',tasks:'tasks',family:'families'};
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
var balance=function(id){return total(id)-spent(id);};
var waiting=function(id){return sum(S.entries.filter(function(e){return e.memberId===id&&e.status==='pending';}),function(e){return e.points;});};
var pendingCount=function(){return S.entries.filter(function(e){return e.status==='pending';}).length+S.redemptions.filter(function(r){return r.status==='pending';}).length;};
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
function avatar(m,cls){
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
  users:svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5a5 5 0 0 1 4.5 5"/>')
};

/* ---------- views ---------- */
function banners(){
  var h='';
  if(offline) h+='<p class="note">Pas de connexion : les données affichées peuvent ne pas être à jour.</p>';
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
  return '<header class="topbar">'+avatar(m,'lg')+'<div class="who"><div class="hi">Salut '+esc(m.name)+'</div><div class="muted small">'+(isAdult(m)?'Adulte':'Enfant')+'</div></div><button class="btn small" data-act="logout">Quitter</button></header>';
}
function tabsFor(m){
  var t=[['home','Accueil',ICON.home]];
  if(isAdult(m)) t.push(['approve','À valider',ICON.check]);
  t.push(['rank','Classement',ICON.trophy],['rewards','Récompenses',ICON.gift]);
  if(isAdult(m)) t.push(['family','Famille',ICON.users]);
  return t;
}
function tabbar(m){
  var pc=pendingCount();
  return '<nav class="tabbar" aria-label="Navigation"><div class="tabs">'+tabsFor(m).map(function(t){
    return '<button class="tab" data-act="tab" data-tab="'+t[0]+'"'+(tab===t[0]?' aria-current="page"':'')+'>'+t[2]+'<span>'+t[1]+'</span>'+(t[0]==='approve'&&pc?'<span class="badge">'+pc+'</span>':'')+'</button>';
  }).join('')+'</div></nav>';
}
function historyItems(mid){
  var e=S.entries.filter(function(x){return x.memberId===mid;}).map(function(x){return {kind:'entries',id:x.id,label:x.label,pts:x.points,status:x.status,ts:x.ts||0};});
  var r=S.redemptions.filter(function(x){return x.memberId===mid;}).map(function(x){return {kind:'redemptions',id:x.id,label:'Récompense : '+x.label,pts:-x.cost,status:x.status,ts:x.ts||0};});
  return e.concat(r).sort(function(a,b){return b.ts-a.ts;});
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
    if(opts.del){
      del = (sheet&&sheet.confirm===key)
        ? '<div class="mactions"><button class="btn small danger" data-act="delgo" data-kind="'+it.kind+'" data-id="'+esc(it.id)+'">Supprimer</button><button class="btn small" data-act="delcancel">Annuler</button></div>'
        : '<button class="link bad" data-act="delask" data-kind="'+it.kind+'" data-id="'+esc(it.id)+'">Supprimer</button>';
    }
    return '<li><div class="hrow"><div class="hmain"><div class="hlabel">'+esc(it.label)+'</div><div class="hmeta"><span>'+ago(it.ts)+'</span>'+statusPill(it.status)+(opts.del?del:'')+'</div></div><div class="hpts '+cls+'">'+sg(it.pts)+'</div></div></li>';
  }).join('')+'</ul>';
}
function homeSelf(m){
  var bal=balance(m.id), wait=waiting(m.id);
  var rs=S.rewards.slice().sort(function(a,b){return a.cost-b.cost;});
  var next=rs.find(function(r){return r.cost>bal;});
  var goal='';
  if(!rs.length) goal='<p class="muted small">Les adultes n’ont pas encore ajouté de récompenses.</p>';
  else if(next) goal='<div class="goal"><div class="goal-top"><span>Prochaine récompense : <strong>'+esc(next.label)+'</strong></span><strong class="tnum">encore '+(next.cost-bal)+'</strong></div><div class="bar"><i style="width:'+Math.max(0,Math.min(100,bal/next.cost*100))+'%"></i></div></div>';
  else goal='<div class="goal"><p>Tu as assez de points pour toutes les récompenses.</p></div>';
  return '<section class="card hero"><div class="eyebrow">Tes points</div><div class="big">'+bal+'</div>'+
    (wait>0?'<p class="muted small">+'+wait+' '+ptsWord(wait)+' en attente de validation</p>':'')+goal+
    '<button class="btn primary block" data-act="openEarn">Gagner des points</button></section>'+
    '<section class="card"><h3>Mon historique</h3>'+historyHtml(m.id,{limit:15})+'</section>';
}
function homeAdult(m){
  var pc=pendingCount();
  var ms=S.members.slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);});
  var out='';
  if(pc) out+='<button class="alert" data-act="tab" data-tab="approve"><strong>'+pc+' à valider</strong><span>Voir les demandes</span></button>';
  out+='<section class="card"><div class="section-title"><h3>La famille</h3><span class="muted small">Touche un nom pour voir le détail</span></div><ul class="list">'+
    ms.map(function(x){
      var wt=waiting(x.id);
      return '<li><div class="mrow"><button class="open" data-act="member" data-id="'+esc(x.id)+'">'+avatar(x)+'<span class="mmain"><span class="hlabel">'+esc(x.name)+'</span><br><span class="muted small">'+(wt?'+'+wt+' en attente':(isAdult(x)?'Adulte':'Enfant'))+'</span></span><span class="bal">'+balance(x.id)+'</span></button>'+
      '<div class="mactions"><button class="btn stepbtn" data-act="adjust" data-id="'+esc(x.id)+'" data-sign="1" aria-label="Ajouter des points à '+esc(x.name)+'">+</button><button class="btn stepbtn" data-act="adjust" data-id="'+esc(x.id)+'" data-sign="-1" aria-label="Retirer des points à '+esc(x.name)+'">−</button></div></div></li>';
    }).join('')+'</ul></section>';
  return out;
}
function approveView(){
  var es=S.entries.filter(function(e){return e.status==='pending';}).sort(function(a,b){return a.ts-b.ts;});
  var rs=S.redemptions.filter(function(r){return r.status==='pending';}).sort(function(a,b){return a.ts-b.ts;});
  if(!es.length&&!rs.length) return '<section class="card empty"><h3>Rien à valider</h3><p>Les demandes de points et de récompenses apparaîtront ici.</p></section>';
  function row(kind,x,label,pts){
    var m=mById(x.memberId); if(!m) return '';
    return '<li><div class="arow" style="flex-wrap:wrap">'+avatar(m)+'<div class="hmain"><div class="hlabel">'+esc(label)+'</div><div class="hmeta"><span>'+esc(m.name)+'</span><span>'+ago(x.ts||0)+'</span></div></div><div class="hpts '+(pts>0?'plus':'minus')+'">'+sg(pts)+'</div>'+
    (x.photo?photoBox(x.id):'')+
    '<div class="mactions" style="width:100%;justify-content:flex-end"><button class="btn small" data-act="decide" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-v="rejected">Refuser</button><button class="btn small primary" data-act="decide" data-kind="'+kind+'" data-id="'+esc(x.id)+'" data-v="approved">Valider</button></div></div></li>';
  }
  var out='';
  if(es.length) out+='<section class="card"><h3>Points demandés</h3><ul class="list">'+es.map(function(e){return row('entries',e,e.label,e.points);}).join('')+'</ul></section>';
  if(rs.length) out+='<section class="card"><h3>Récompenses demandées</h3><ul class="list">'+rs.map(function(r){return row('redemptions',r,r.label,-r.cost);}).join('')+'</ul></section>';
  return out;
}
function rankView(m){
  var rows=S.members.map(function(x){return {m:x,s:periodScore(x.id,rankPeriod)};}).sort(function(a,b){return b.s-a.s||a.m.name.localeCompare(b.m.name,'fr');});
  var rank=0, prev=null;
  rows.forEach(function(r,i){ if(r.s!==prev){rank=i+1;prev=r.s;} r.rank=rank; });
  var allZero=rows.every(function(r){return r.s===0;});
  var labels={week:'Points gagnés cette semaine',month:'Points gagnés ce mois-ci',all:'Points gagnés depuis le début'};
  var seg='<div class="seg" role="group" aria-label="Période">'+[['week','Semaine'],['month','Mois'],['all','Total']].map(function(p){return '<button class="o" data-act="rank" data-p="'+p[0]+'" aria-pressed="'+(rankPeriod===p[0])+'">'+p[1]+'</button>';}).join('')+'</div>';
  return '<section class="card" style="display:flex;flex-direction:column;gap:12px"><h2>Classement</h2>'+seg+'<p class="muted small">'+labels[rankPeriod]+'</p>'+
    (allZero?'<p class="note">Personne n’a encore de points sur cette période.</p>':'')+
    '<ul class="list">'+rows.map(function(r){
      var me=r.m.id===m.id;
      return '<li><div class="rrow'+(r.rank===1&&r.s>0?' first':'')+(me?' me':'')+'"><span class="rnk">'+(allZero?'–':r.rank)+'</span>'+avatar(r.m)+'<span class="rname">'+esc(r.m.name)+(me?' (toi)':'')+'</span><span class="rpts">'+r.s+'</span></div></li>';
    }).join('')+'</ul></section>';
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
  $app.innerHTML=topbar(m)+'<main>'+banners()+body+'</main>'+tabbar(m);
  if(tab==='approve') loadPhotos();
  if(sheet&&sheet.type==='member') renderSheet();
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
    return '<div style="display:flex;gap:12px;align-items:center">'+avatar(m,'lg')+'<div><h2 style="padding:0">'+esc(m.name)+'</h2><span class="muted small">'+(isAdult(m)?'Adulte':'Enfant')+'</span></div></div>'+
    '<div class="hero"><div class="eyebrow">Points disponibles</div><div class="big" style="font-size:64px">'+balance(m.id)+'</div><p class="muted small">Total gagné : '+total(m.id)+' · dépensé : '+spent(m.id)+'</p></div>'+
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
  if(s.type==='editMember'){
    var em=mById(s.id); if(!em) return '';
    var adults=S.members.filter(isAdult).length;
    var blocked=em.id===sess||(isAdult(em)&&adults<2);
    var dm=blocked?'<p class="muted small">'+(em.id===sess?'Tu ne peux pas supprimer ton propre profil.':'Il faut garder au moins un adulte.')+'</p>':(s.confirm?'<p class="muted small">Tous les points de '+esc(em.name)+' seront supprimés.</p><div class="mactions"><button type="button" class="btn danger" style="flex:1" data-act="memberDelGo">Supprimer</button><button type="button" class="btn" style="flex:1" data-act="delcancel">Annuler</button></div>':'<button type="button" class="btn danger block" data-act="delaskThing">Supprimer ce membre</button>');
    return '<h2>Modifier '+esc(em.name)+'</h2><form data-form="editMember" data-id="'+esc(em.id)+'"><div class="field"><label for="f-name">Prénom</label><input id="f-name" name="name" type="text" maxlength="30" autocomplete="off" required value="'+esc(em.name)+'"></div>'+
    '<div class="field"><span class="lbl">Rôle</span><div class="seg"><label><input type="radio" name="role" value="child"'+(isAdult(em)?'':' checked')+'><span>Enfant</span></label><label><input type="radio" name="role" value="adult"'+(isAdult(em)?' checked':'')+'><span>Adulte</span></label></div></div>'+
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
  if(s.type!=='member'&&s.type!=='redeem'){
    setTimeout(function(){ var i=$sheet.querySelector('input:not([type=radio]):not([hidden]),select'); if(i) i.focus(); },60);
  }
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
    case 'copyCode':
      var cd=fam()&&fam().code; if(!cd) break;
      try{ await navigator.clipboard.writeText(fmtCode(cd)); toast('Code copié.'); }catch(e){ toast('Code : '+fmtCode(cd)); }
      break;
    case 'closeSheet': closeSheet(); break;
    case 'openEarn': earnPhoto=null; openSheet({type:'earn'}); break;
    case 'photo': openSheet({type:'photo',id:ds.id}); break;
    case 'adjust': openSheet({type:'adjust',id:ds.id,sign:ds.sign}); break;
    case 'member': openSheet({type:'member',id:ds.id}); break;
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
  members:function(r){return {id:r.id,name:r.name,role:r.role,hue:r.hue,ts:Date.parse(r.created_at)};},
  tasks:function(r){return {id:r.id,label:r.label,points:r.points,ts:Date.parse(r.created_at)};},
  rewards:function(r){return {id:r.id,label:r.label,cost:r.cost,ts:Date.parse(r.created_at)};},
  entries:function(r){return {id:r.id,memberId:r.member_id,taskId:r.task_id,label:r.label,points:r.points,status:r.status,photo:!!r.photo_path,ts:Date.parse(r.created_at),decidedTs:r.decided_at?Date.parse(r.decided_at):null};},
  redemptions:function(r){return {id:r.id,memberId:r.member_id,rewardId:r.reward_id,label:r.label,cost:r.cost,status:r.status,ts:Date.parse(r.created_at),decidedTs:r.decided_at?Date.parse(r.decided_at):null};},
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
  ['members','entries','rewards','redemptions','tasks'].forEach(function(t){
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
  setTimeout(function(){ if(sess&&!allReady()){ slow=true; render(); } },10000);
}
boot();
})();
