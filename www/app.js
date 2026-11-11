(function(){
'use strict';
var $app=document.getElementById('app'), $sheet=document.getElementById('sheetRoot'), $toast=document.getElementById('toast');
var esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
var uid=function(){try{return crypto.randomUUID();}catch(e){return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,function(c){var r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);});}};
var COLL=['members','entries','rewards','redemptions','tasks','family','pots','potMembers','potRewards','events'];
var S={}, ready={};
COLL.forEach(function(c){S[c]=[];});
var store=null, sb=null, slow=false, dirty=false, booted=false, bootError='', offline=false, welcomeMode='join', familyId=null, rt=null, poll=null, refreshTimer=null;
var CFG=window.PF_CONFIG||{};
var TABLE={members:'members',entries:'entries',rewards:'rewards',redemptions:'redemptions',tasks:'tasks',family:'families',pots:'pots',potMembers:'pot_members',potRewards:'pot_rewards',events:'events'};
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
/* ---------- avatars personnalisés (v2) ---------- */
var AV={
  bg:['#bfe9dc','#ffd9b3','#cfe0ff','#ffc8dd','#fff0a6','#dcd0ff','#c9f0a8','#e6e6ea','#a8d8f0','#f7b7a3','#d9cdb4','#3d4a5c'],
  skin:['#fbe3d0','#f6d0b3','#edb98f','#d9a074','#c08550','#a1683a','#7a4a2a','#4f3020'],
  hairc:['#1b1411','#3a2519','#5a3a24','#8a5a2b','#b5651d','#c8442b','#e3b04b','#f0d58a','#8e8e93','#e8e8ec','#3b82f6','#ec4899'],
  eyec:['#2b1b12','#5a3a22','#8a6a2b','#3f8f5a','#3b82c4','#7f8c99'],
  outc:['#e74c3c','#3b82f6','#1e3a5f','#10b981','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#2b2d33','#f4f4f6','#9ca3af','#8b5a2b'],
  face:['Ovale','Ronde','Allongé','Carré'],
  hair:['Chauve','Rasé','Courts','Raie de côté','Pointus','Toupet','Frange droite','Carré','Mi-longs plongeants','Longs lisses','Longs ondulés','Épaules','Afro','Bouclés','Locks','Chignon haut','Chignon bas','Queue de cheval','Couettes','Tresses','Queue haute','Crête','Dégarni','Dégradé'],
  brow:['Fins','Épais','Droits','Arqués','Froncés'],
  eyes:['Amande','Ronds','Grands','Contents','Mi-clos','Cils'],
  nose:['Petit','Rond','Pointu','Large'],
  mouth:['Sourire','Grand sourire','Sérieux','Coin','Langue','Surpris','Rouge'],
  beard:['Aucune','3 jours','Moustache','Bouc','Courte','Longue','Favoris'],
  outfit:['T-shirt','Col V','Polo','Capuche','Col roulé','Chemise','Cravate','Costume','Blouson','Marinière','Débardeur','Robe','Salopette','Héros','Maillot','Doudoune'],
  glasses:['Aucune','Rondes','Carrées','Soleil','Aviateur','Papillon'],
  hat:['Aucun','Casquette','Bonnet','Pompon','Serre-tête','Nœud','Couronne','Bandeau','Chapeau'],
  jew:['Aucun','Boucles','Anneaux','Collier','Casque','Écharpe'],
  extra:['Aucun','Taches','Joues roses','Grain de beauté']
};
var AVK={b:'bg',s:'skin',f:'face',h:'hair',hc:'hairc',eb:'brow',e:'eyes',ec:'eyec',n:'nose',m:'mouth',bd:'beard',o:'outfit',oc:'outc',g:'glasses',ha:'hat',j:'jew',x:'extra'};
var AV_DEF={b:0,s:1,f:0,h:2,hc:2,eb:0,e:0,ec:1,n:0,m:0,bd:0,o:0,oc:1,g:0,ha:0,j:0,x:0};
function avLimit(c){
  var r={v:2}; Object.keys(AVK).forEach(function(k){ var n=(c[k]|0), len=AV[AVK[k]].length; r[k]=n<0?0:n%len; }); return r;
}
function avParse(v){
  if(!v||v.charAt(0)!=='{') return null;
  try{
    var o=JSON.parse(v); if(!o||typeof o!=='object') return null;
    if(o.v!==2){
      var hm=[0,2,4,9,7,12,15,17,18], hcm=[0,2,4,6,5,8,10,11], em=[1,3,2], om=[0,3,9,5,13,12], ocm=[0,1,3,4,5,6,7,8], a=o.a|0;
      o={b:o.b,s:o.s,h:hm[o.h|0]||0,hc:hcm[o.hc|0]||0,e:em[o.e|0]||0,m:o.m,o:om[o.o|0]||0,oc:ocm[o.oc|0]||0,
         g:a===1?1:(a===2?3:0),ha:a===3?1:(a===4?5:(a===5?6:0)),j:a===6?1:0,x:a===7?1:0};
    }
    return avLimit(Object.assign({},AV_DEF,o));
  }catch(x){ return null; }
}
function avMix(a,b,t){
  var p=function(h){return [1,3,5].map(function(i){return parseInt(h.substr(i,2),16);});}, x=p(a), y=p(b);
  return '#'+x.map(function(v,i){ var n=Math.round(v+(y[i]-v)*t); return (n<16?'0':'')+n.toString(16); }).join('');
}
var avUid=0;
var AVF=[[20,16,68,8,6],[22,20,66,12,6],[18,14,72,7,5],[21,20,67,13,3]];
function avHair(i,H,sk){
  var D=avMix(H,'#000000',.28), L=avMix(H,'#ffffff',.3), bk='', fr='', hl=function(d){return '<path d="'+d+'" fill="none" stroke="'+L+'" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>';};
  var f=function(d,c){return '<path d="'+d+'" fill="'+(c||H)+'"/>';};
  var CAP='M26 46C24 24 37 16 50 16C63 16 76 24 74 46C72 38 69 33 64 30C58 34 42 34 36 30C31 33 28 38 26 46Z';
  var side='<path d="M27 46L28 56L32 54L33 44Z M73 46L72 56L68 54L67 44Z" fill="'+H+'"/>';
  switch(i){
    case 1: fr='<path d="'+CAP+'" fill="'+H+'" opacity=".35"/>'; break;
    case 2: fr=f(CAP)+hl('M38 20C46 16 56 16 64 21'); break;
    case 3: fr=f('M26 46C23 22 40 15 54 16C68 17 77 28 74 46C72 38 70 34 66 31C56 30 44 27 36 32C31 35 28 40 26 46Z')+'<path d="M44 17C46 24 43 28 38 31" fill="none" stroke="'+D+'" stroke-width="1.4"/>'+hl('M50 19C58 18 66 21 70 27'); break;
    case 4: fr=f('M26 46L27 26L35 33L40 14L47 28L52 10L57 28L65 14L67 33L73 26L74 46C72 38 69 33 64 31C58 34 42 34 36 31C31 34 28 40 26 46Z'); break;
    case 5: fr=f('M26 46C21 24 28 8 52 8C70 8 78 22 74 46C72 38 70 34 64 32C58 22 44 24 36 32C31 35 28 40 26 46Z')+hl('M36 18C44 10 58 10 68 18'); break;
    case 6: fr=f('M25 54C21 24 36 15 50 15C64 15 79 24 75 54C73 44 71 37 66 34L34 34C29 37 27 44 25 54Z')+hl('M36 20C46 16 56 16 66 20'); break;
    case 7: bk=f('M24 66C19 28 34 13 50 13C66 13 81 28 76 66C75 71 68 71 66 66L34 66C32 71 25 71 24 66Z'); fr=f('M27 46C26 24 40 17 50 17C62 17 75 24 73 46C69 36 62 31 50 31C38 31 31 36 27 46Z')+hl('M34 22C42 18 58 18 66 22'); break;
    case 8: bk=f('M24 82C18 30 34 13 50 13C66 13 82 30 76 82C70 82 66 76 66 68L34 68C34 76 30 82 24 82Z'); fr=f('M27 46C26 24 40 17 50 17C60 17 74 24 73 46C70 38 62 30 52 30C42 31 32 36 27 46Z')+f('M24 82L27 50L34 56C33 66 33 76 30 82Z')+f('M76 82L73 50L66 56C67 66 67 76 70 82Z'); break;
    case 9: bk=f('M23 96C17 34 33 12 50 12C67 12 83 34 77 96L66 96L66 70L34 70L34 96Z'); fr=f('M27 46C26 24 40 17 50 17C62 17 74 24 73 46C69 36 62 31 50 31C38 31 31 36 27 46Z')+f('M26 46C24 62 26 80 24 96L33 96C32 80 34 62 34 48Z')+f('M74 46C76 62 74 80 76 96L67 96C68 80 66 62 66 48Z')+hl('M31 60C30 74 30 84 29 92'); break;
    case 10: bk=f('M22 94C14 40 32 12 50 12C68 12 86 40 78 94C72 88 70 80 66 72L34 72C30 80 28 88 22 94Z'); fr=f('M27 46C26 24 40 17 50 17C62 17 74 24 73 46C69 36 62 31 50 31C38 31 31 36 27 46Z')+f('M26 46C22 58 28 66 24 76C22 84 26 90 22 94C32 92 34 84 32 76C30 66 34 58 34 48Z')+f('M74 46C78 58 72 66 76 76C78 84 74 90 78 94C68 92 66 84 68 76C70 66 66 58 66 48Z')+hl('M29 62C27 72 30 78 27 88'); break;
    case 11: bk=f('M24 76C18 32 34 13 50 13C66 13 82 32 76 76C72 80 68 76 66 70L34 70C32 76 28 80 24 76Z'); fr=f('M27 46C26 24 40 17 50 17C62 17 74 24 73 46C69 36 62 31 50 31C38 31 31 36 27 46Z')+f('M26 46C25 58 27 68 26 76L33 74C32 66 34 58 34 48Z')+f('M74 46C75 58 73 68 74 76L67 74C68 66 66 58 66 48Z'); break;
    case 12: bk='<ellipse cx="50" cy="36" rx="31" ry="28" fill="'+H+'"/><circle cx="25" cy="48" r="8" fill="'+H+'"/><circle cx="75" cy="48" r="8" fill="'+H+'"/>'; fr=f('M30 40C34 28 66 28 70 40C64 34 36 34 30 40Z')+'<g fill="'+D+'" opacity=".4"><circle cx="34" cy="26" r="2"/><circle cx="48" cy="18" r="2"/><circle cx="62" cy="22" r="2"/><circle cx="72" cy="34" r="2"/><circle cx="26" cy="38" r="2"/></g>'; break;
    case 13: bk=''; fr=f(CAP)+'<g fill="'+H+'"><circle cx="30" cy="30" r="7"/><circle cx="40" cy="22" r="7.5"/><circle cx="51" cy="19" r="7.5"/><circle cx="62" cy="22" r="7.5"/><circle cx="71" cy="30" r="7"/><circle cx="27" cy="42" r="5"/><circle cx="73" cy="42" r="5"/></g>'+hl('M38 18C44 14 56 14 62 18'); break;
    case 14: bk=f(CAP); fr=f(CAP)+'<g fill="'+H+'"><rect x="23" y="38" width="6" height="42" rx="3"/><rect x="30" y="42" width="5" height="40" rx="2.5"/><rect x="71" y="38" width="6" height="42" rx="3"/><rect x="65" y="42" width="5" height="40" rx="2.5"/></g><g stroke="'+D+'" stroke-width="1"><path d="M26 44L26 78M32.5 46L32.5 80M74 44L74 78M67.5 46L67.5 80"/></g>'; break;
    case 15: bk='<circle cx="50" cy="12" r="9" fill="'+H+'"/>'; fr=f(CAP)+'<path d="M42 12Q50 17 58 12" fill="none" stroke="'+D+'" stroke-width="1.4"/>'; break;
    case 16: bk='<circle cx="73" cy="62" r="8" fill="'+H+'"/>'; fr=f(CAP)+'<circle cx="70" cy="48" r="2.4" fill="#fbbf24"/>'; break;
    case 17: bk=f('M66 36C90 36 86 70 80 76C74 70 80 52 66 46Z'); fr=f(CAP)+'<rect x="68" y="38" width="5" height="9" rx="2" fill="#ec4899" transform="rotate(-30 70 42)"/>'; break;
    case 18: bk='<circle cx="19" cy="58" r="10" fill="'+H+'"/><circle cx="81" cy="58" r="10" fill="'+H+'"/>'; fr=f(CAP)+'<circle cx="26" cy="48" r="3" fill="#ec4899"/><circle cx="74" cy="48" r="3" fill="#ec4899"/>'; break;
    case 19: bk=''; fr=f(CAP)+['24','76'].map(function(x){return '<g fill="'+H+'"><ellipse cx="'+x+'" cy="54" rx="5" ry="5"/><ellipse cx="'+x+'" cy="64" rx="4.6" ry="5"/><ellipse cx="'+x+'" cy="74" rx="4.2" ry="5"/><ellipse cx="'+x+'" cy="84" rx="3.8" ry="5"/></g><circle cx="'+x+'" cy="91" r="2.6" fill="#ec4899"/>';}).join(''); break;
    case 20: bk=f('M58 18C70 0 90 6 86 30C84 40 80 40 78 34C82 22 72 14 64 22Z'); fr=f(CAP)+'<circle cx="64" cy="20" r="3" fill="#ec4899"/>'; break;
    case 21: fr='<path d="'+CAP+'" fill="'+H+'" opacity=".22"/>'+f('M43 32L43 8Q50 0 57 8L57 32Q50 28 43 32Z'); break;
    case 22: fr=f('M26 46C23 28 29 20 35 18C32 25 32 32 34 38C30 38 27 41 26 46Z')+f('M74 46C77 28 71 20 65 18C68 25 68 32 66 38C70 38 73 41 74 46Z')+'<path d="M38 22C46 18 54 18 62 22" fill="none" stroke="'+H+'" stroke-width="1.6" opacity=".7"/>'; break;
    case 23: fr='<path d="M27 42C26 24 38 18 50 18C62 18 74 24 73 42C70 34 62 29 50 29C38 29 30 34 27 42Z" fill="'+H+'"/><path d="M27 46C26 40 27 36 27 36C30 38 31 42 32 46Z M73 46C74 40 73 36 73 36C70 38 69 42 68 46Z" fill="'+H+'" opacity=".4"/>'; break;
  }
  return [bk,fr];
}
function avOutfit(i,sk,oc,sh){
  var BODY='M12 100C13 80 26 74 40 72L60 72C74 74 87 80 88 100Z', dk=avMix(oc,'#000000',.22), lt=avMix(oc,'#ffffff',.3), W='#f4f4f6';
  var fill=function(d,c,o){return '<path d="'+d+'" fill="'+c+'"'+(o?' opacity="'+o+'"':'')+'/>';};
  var base=fill(BODY,oc), neck='', top='';
  switch(i){
    case 0: neck=fill('M40 72Q50 83 60 72Z',sk)+'<path d="M40 72Q50 83 60 72" fill="none" stroke="'+dk+'" stroke-width="1.6"/>'; break;
    case 1: neck=fill('M41 72L50 88L59 72Z',sk)+'<path d="M41 72L50 88L59 72" fill="none" stroke="'+dk+'" stroke-width="1.6" stroke-linejoin="round"/>'; break;
    case 2: neck=fill('M42 72Q50 80 58 72Z',sk)+fill('M39 71L50 81L45 88L35 77Z',lt)+fill('M61 71L50 81L55 88L65 77Z',lt)+'<path d="M50 81L50 98" stroke="'+dk+'" stroke-width="1.4"/><circle cx="50" cy="87" r="1.2" fill="'+dk+'"/><circle cx="50" cy="93" r="1.2" fill="'+dk+'"/>'; break;
    case 3: top=fill('M32 76C36 94 64 94 68 76C62 68 38 68 32 76Z',dk)+fill('M40 72Q50 82 60 72Z',sk)+'<path d="M45 82L44 96M55 82L56 96" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>'; break;
    case 4: top=fill('M40 62L60 62L61 76Q50 80 39 76Z',oc)+'<path d="M40 68Q50 72 60 68M40 73Q50 77 60 73" fill="none" stroke="'+dk+'" stroke-width="1.2"/>'; break;
    case 5: base=fill(BODY,W); neck=fill('M43 72Q50 80 57 72Z',sk)+fill('M40 70L50 82L44 87L35 76Z','#fff')+fill('M60 70L50 82L56 87L65 76Z','#fff')+'<path d="M50 82L50 100" stroke="#cfd2d8" stroke-width="1.2"/><rect x="62" y="86" width="9" height="8" rx="1.5" fill="none" stroke="#cfd2d8"/>'; top=''; base=fill(BODY,oc)+fill('M40 70L50 82L44 87L35 76Z',W)+fill('M60 70L50 82L56 87L65 76Z',W)+'<path d="M50 82L50 100" stroke="'+dk+'" stroke-width="1.2"/><circle cx="50" cy="90" r="1.2" fill="'+W+'"/>'; neck=fill('M43 72Q50 80 57 72Z',sk); break;
    case 6: base=fill(BODY,W); neck=fill('M43 72Q50 80 57 72Z',sk); top=fill('M40 70L50 82L44 87L35 76Z','#fff')+fill('M60 70L50 82L56 87L65 76Z','#fff')+fill('M47 81L53 81L51.5 85L53 98L50 101L47 98L48.5 85Z',oc); break;
    case 7: base=fill(BODY,oc)+fill('M42 72L50 98L58 72Z',W); neck=fill('M44 72Q50 80 56 72Z',sk); top=fill('M38 72L48 100L30 100Z',dk)+fill('M62 72L52 100L70 100Z',dk)+fill('M47 78L53 78L51.8 83L53 94L50 97L47 94L48.2 83Z','#b23a48'); break;
    case 8: base=fill(BODY,oc)+fill('M44 72L50 90L56 72Z',W); neck=fill('M44 72Q50 79 56 72Z',sk); top=fill('M36 72L46 74L50 92L44 100L12 100C13 82 24 75 36 72Z',oc)+'<path d="M50 90L50 100" stroke="'+dk+'" stroke-width="1.6"/><path d="M38 74L47 76L50 90M62 74L53 76L50 90" fill="none" stroke="'+dk+'" stroke-width="1.4"/><path d="M20 90L36 90M80 90L64 90" stroke="'+dk+'" stroke-width="1.2"/>'; break;
    case 9: neck=fill('M40 72Q50 82 60 72Z',sk); top='<path d="M16 86L84 86M13 93L87 93M20 80L80 80" stroke="#fff" stroke-width="3" opacity=".8"/>'+fill('M40 72Q50 82 60 72Z',sk)+'<path d="M40 72Q50 82 60 72" fill="none" stroke="'+dk+'" stroke-width="1.4"/>'; break;
    case 10: base=fill(BODY,sk)+fill('M12 100C13 80 26 74 40 72L60 72C74 74 87 80 88 100Z','#000',.06); neck=''; top=fill('M28 100L33 82Q36 74 42 72L58 72Q64 74 67 82L72 100Z',oc)+fill('M42 72Q50 83 58 72Z',sk); break;
    case 11: base=fill(BODY,sk)+fill(BODY,'#000',.06); top=fill('M26 100L31 84Q34 76 38 78Q50 94 62 78Q66 76 69 84L74 100Z',oc)+'<g fill="#fff" opacity=".7"><circle cx="38" cy="92" r="1.6"/><circle cx="50" cy="97" r="1.6"/><circle cx="62" cy="92" r="1.6"/><circle cx="44" cy="86" r="1.4"/><circle cx="56" cy="86" r="1.4"/></g>'; break;
    case 12: base=fill(BODY,W); neck=fill('M42 72Q50 80 58 72Z',sk); top=fill('M35 72L41 72L41 85L59 85L59 72L65 72L65 100L35 100Z',oc)+'<circle cx="41" cy="86" r="1.6" fill="'+W+'"/><circle cx="59" cy="86" r="1.6" fill="'+W+'"/><rect x="45" y="89" width="10" height="7" rx="1.5" fill="none" stroke="'+dk+'"/>'; break;
    case 13: base='<path d="M10 100L8 80Q14 70 30 72L40 74L18 100Z M90 100L92 80Q86 70 70 72L60 74L82 100Z" fill="#d6334a"/>'+fill(BODY,oc); neck=fill('M42 72Q50 80 58 72Z',sk); top=fill('M50 82L58 91L50 100L42 91Z','#fbbf24')+'<path d="M50 86L52 90L56 91L52 93L50 97L48 93L44 91L48 90Z" fill="#d6334a"/>'; break;
    case 14: base=fill(BODY,oc)+fill('M12 100C13 86 17 80 24 76L28 98Z M88 100C87 86 83 80 76 76L72 98Z','#fff',.9); neck=fill('M42 72Q50 82 58 72Z',sk)+'<path d="M40 72Q50 84 60 72" fill="none" stroke="#fff" stroke-width="2.6"/>'; top='<text x="50" y="96" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="15" fill="#fff">7</text>'; break;
    case 15: base=fill(BODY,oc); top=fill('M36 66L64 66L66 78Q50 84 34 78Z',oc)+'<path d="M13 86Q50 92 87 86M12 94Q50 100 88 94" fill="none" stroke="'+dk+'" stroke-width="1.8"/><path d="M50 78L50 100" stroke="'+lt+'" stroke-width="1.6"/><path d="M36 66L34 78M64 66L66 78" stroke="'+dk+'" stroke-width="1.2"/>'; neck=''; break;
  }
  return {base:base,neck:neck,top:top};
}
function avSvg(cfg,vb){
  var c=avLimit(cfg), id='avc'+(avUid++), sk=AV.skin[c.s], skd=avMix(sk,'#000000',.2), H=AV.hairc[c.hc], oc=AV.outc[c.oc], ink='#2a1f1a', fd=AVF[c.f], w=fd[0], jw=fd[1], cy=fd[2], cw=fd[3], ch=fd[4];
  var L=50-w, R=50+w;
  var head='M'+L+' 44C'+L+' 29 '+(50-w*.55)+' 21 50 21C'+(50+w*.55)+' 21 '+R+' 29 '+R+' 44C'+R+' 56 '+(50+jw)+' '+(cy-2)+' '+(50+cw)+' '+cy+'Q50 '+(cy+ch)+' '+(50-cw)+' '+cy+'C'+(50-jw)+' '+(cy-2)+' '+L+' 56 '+L+' 44Z';
  var hr=avHair(c.h,H,sk), of=avOutfit(c.o,sk,oc), eyeW='#fffdfa', iris=AV.eyec[c.ec];
  var lip=avMix(sk,'#b8454a',.55), brow=avMix(H,'#000000',.15);
  var S=function(d,col,wd){return '<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="'+wd+'" stroke-linecap="round" stroke-linejoin="round"/>';};
  // yeux
  var eye=function(x){
    var s=x<50?-1:1, o='';
    switch(c.e){
      case 0: case 4: case 5:
        o='<path d="M'+(x-5.5)+' 46Q'+x+' 41.5 '+(x+5.5)+' 46Q'+x+' 49.6 '+(x-5.5)+' 46Z" fill="'+eyeW+'"/><circle cx="'+x+'" cy="45.8" r="2.9" fill="'+iris+'"/><circle cx="'+x+'" cy="45.8" r="1.3" fill="#120c08"/><circle cx="'+(x+1)+'" cy="44.8" r=".8" fill="#fff"/>'+S('M'+(x-5.5)+' 46Q'+x+' 41.2 '+(x+5.5)+' 46',ink,1.3);
        if(c.e===4) o+='<path d="M'+(x-5.7)+' 46Q'+x+' 41.4 '+(x+5.7)+' 46L'+(x+5.7)+' 44.6Q'+x+' 40 '+(x-5.7)+' 44.6Z" fill="'+avMix(sk,'#000000',.12)+'"/>'+S('M'+(x-5.5)+' 46Q'+x+' 43.6 '+(x+5.5)+' 46',ink,1.3);
        if(c.e===5) o+=S('M'+(x+s*5.4)+' 45.4L'+(x+s*7.6)+' 43.6M'+(x+s*4.6)+' 44.4L'+(x+s*6.4)+' 42',ink,1.1);
        break;
      case 1: o='<circle cx="'+x+'" cy="46" r="4.3" fill="'+eyeW+'"/><circle cx="'+x+'" cy="46.2" r="2.8" fill="'+iris+'"/><circle cx="'+x+'" cy="46.2" r="1.3" fill="#120c08"/><circle cx="'+(x+1)+'" cy="45.2" r=".8" fill="#fff"/>'+S('M'+(x-4.3)+' 45Q'+x+' 41 '+(x+4.3)+' 45',ink,1.2); break;
      case 2: o='<circle cx="'+x+'" cy="46" r="5.2" fill="'+eyeW+'"/><circle cx="'+x+'" cy="46.4" r="3.5" fill="'+iris+'"/><circle cx="'+x+'" cy="46.4" r="1.7" fill="#120c08"/><circle cx="'+(x+1.3)+'" cy="45" r="1.1" fill="#fff"/>'+S('M'+(x-5.2)+' 45Q'+x+' 40 '+(x+5.2)+' 45',ink,1.3); break;
      case 3: o=S('M'+(x-4.8)+' 47Q'+x+' 41 '+(x+4.8)+' 47',ink,2.2); break;
    }
    return o;
  };
  var bz=['M36 39.5Q41 37 46.5 38.5|M53.5 38.5Q59 37 64 39.5','M36 39Q41 36 46.5 38|M53.5 38Q59 36 64 39','M36 38.5L46.5 38|M53.5 38L64 38.5','M36 40.5Q41 34.5 46.5 38.5|M53.5 38.5Q59 34.5 64 40.5','M36 36L46.5 39.5|M53.5 39.5L64 36'][c.eb].split('|');
  var bw=c.eb===1?3:(c.eb===0?1.5:2.2);
  var eyebrows=S(bz[0],brow,bw)+S(bz[1],brow,bw);
  var nz=['<path d="M48 49Q47 54 47.6 55.4" fill="none" stroke="'+skd+'" stroke-width="1" opacity=".6" stroke-linecap="round"/>'+S('M47.4 56Q50 58 52.6 56',avMix(sk,'#000000',.36),1.3),
    '<ellipse cx="50" cy="55" rx="3.6" ry="3" fill="'+avMix(sk,'#ffffff',.1)+'" stroke="'+avMix(sk,'#000000',.2)+'" stroke-width="1"/>'+S('M47 57Q50 59 53 57',avMix(sk,'#000000',.36),1.2),
    S('M50 47L48.6 55.6Q50 57.6 51.4 55.6',avMix(sk,'#000000',.4),1.2),
    S('M48 50Q46 55 45.4 56.4Q50 59.4 54.6 56.4Q54 55 52 50',avMix(sk,'#000000',.32),1.2)][c.n];
  var my=60.5, mouth=[
    S('M43.5 '+my+'Q50 '+(my+5.5)+' 56.5 '+my,avMix(lip,'#000000',.2),1.8)+'<path d="M46 '+(my+3.2)+'Q50 '+(my+4.8)+' 54 '+(my+3.2)+'Q50 '+(my+6.6)+' 46 '+(my+3.2)+'Z" fill="'+lip+'" opacity=".55"/>',
    '<path d="M42 '+(my-1)+'Q50 '+(my+.4)+' 58 '+(my-1)+'Q56 '+(my+7)+' 50 '+(my+7)+'Q44 '+(my+7)+' 42 '+(my-1)+'Z" fill="#5b1f1f"/><path d="M43.4 '+(my-.4)+'Q50 '+(my+.8)+' 56.6 '+(my-.4)+'L56 '+(my+2.4)+'Q50 '+(my+3.4)+' 44 '+(my+2.4)+'Z" fill="#fff"/>',
    '<path d="M45 '+(my+1)+'L55 '+(my+1)+'" stroke="'+avMix(lip,'#000000',.2)+'" stroke-width="1.8" stroke-linecap="round"/><path d="M46.5 '+(my+2.2)+'Q50 '+(my+3.8)+' 53.5 '+(my+2.2)+'" fill="none" stroke="'+lip+'" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>',
    S('M44 '+(my+1.2)+'Q51 '+(my+3.4)+' 57.4 '+(my-1.2),avMix(lip,'#000000',.2),1.8),
    '<path d="M42 '+(my-1)+'Q50 '+(my+.4)+' 58 '+(my-1)+'Q56 '+(my+7)+' 50 '+(my+7)+'Q44 '+(my+7)+' 42 '+(my-1)+'Z" fill="#5b1f1f"/><path d="M45 '+(my+4.6)+'Q50 '+(my+2.4)+' 55 '+(my+4.6)+'Q54 '+(my+8)+' 50 '+(my+8)+'Q46 '+(my+8)+' 45 '+(my+4.6)+'Z" fill="#e46f78"/>',
    '<ellipse cx="50" cy="'+(my+2.6)+'" rx="3" ry="4" fill="#5b1f1f"/>',
    '<path d="M43 '+(my+.4)+'Q46.5 '+(my-1.8)+' 50 '+(my-.6)+'Q53.5 '+(my-1.8)+' 57 '+(my+.4)+'Q50 '+(my+6.4)+' 43 '+(my+.4)+'Z" fill="#c0393f"/>'][c.m];
  // barbe
  var bd='', bdc=H, bdd=avMix(H,'#000000',.2);
  var bclip=function(inner){ return '<g clip-path="url(#'+id+')">'+inner+'</g>'; };
  switch(c.bd){
    case 1: bd=bclip('<path d="M10 55Q50 58 90 55L90 90L10 90Z" fill="'+bdc+'" opacity=".26"/>'); break;
    case 2: bd='<path d="M40 58Q45 54.4 50 57Q55 54.4 60 58Q55 59.6 50 58.8Q45 59.6 40 58Z" fill="'+bdc+'"/>'; break;
    case 3: bd=bclip('<path d="M43 63Q50 60.4 57 63Q58 71 50 74Q42 71 43 63Z" fill="'+bdc+'"/>')+'<path d="M41 58Q45 54.4 50 57Q55 54.4 59 58Q55 59.6 50 58.8Q45 59.6 41 58Z" fill="'+bdc+'"/>'; break;
    case 4: bd=bclip('<path d="M26 48Q26 78 50 80Q74 78 74 48Q72 60 64 62Q50 58 36 62Q28 60 26 48Z" fill="'+bdc+'"/>')+'<path d="M40 58Q45 54.6 50 57Q55 54.6 60 58Q55 59.4 50 58.6Q45 59.4 40 58Z" fill="'+bdc+'"/>'; break;
    case 5: bd='<path d="M27 48Q24 80 50 90Q76 80 73 48Q72 60 64 62Q50 58 36 62Q28 60 27 48Z" fill="'+bdc+'"/><path d="M40 58Q45 54.6 50 57Q55 54.6 60 58Q55 59.4 50 58.6Q45 59.4 40 58Z" fill="'+bdc+'"/>'; break;
    case 6: bd='<path d="M'+(L+0.5)+' 40L'+(L+4.5)+' 40L'+(L+6)+' 58L'+(L+2)+' 56Z M'+(R-0.5)+' 40L'+(R-4.5)+' 40L'+(R-6)+' 58L'+(R-2)+' 56Z" fill="'+bdc+'"/>'; break;
  }
  // détails
  var ex=['','<g fill="#a5683c" opacity=".7"><circle cx="37" cy="53" r=".9"/><circle cx="41" cy="55" r=".9"/><circle cx="36" cy="56" r=".9"/><circle cx="44" cy="52" r=".8"/><circle cx="63" cy="53" r=".9"/><circle cx="59" cy="55" r=".9"/><circle cx="64" cy="56" r=".9"/><circle cx="56" cy="52" r=".8"/></g>','<circle cx="36" cy="55" r="5" fill="#ff6f8a" opacity=".32"/><circle cx="64" cy="55" r="5" fill="#ff6f8a" opacity=".32"/>','<circle cx="58" cy="57.6" r="1" fill="#3a2519"/>'][c.x];
  // lunettes
  var gl=['',
    '<g fill="none" stroke="'+ink+'" stroke-width="1.6"><circle cx="41" cy="46" r="7.4"/><circle cx="59" cy="46" r="7.4"/><path d="M48.4 45Q50 43.8 51.6 45M33.6 45L'+(L-.5)+' 46M66.4 45L'+(R+.5)+' 46"/></g>',
    '<g fill="#fff" fill-opacity=".12" stroke="'+ink+'" stroke-width="1.7"><rect x="33" y="41" width="16" height="11" rx="2.6"/><rect x="51" y="41" width="16" height="11" rx="2.6"/><path d="M49 44L51 44M33 43L'+(L-.5)+' 45M67 43L'+(R+.5)+' 45" fill="none"/></g>',
    '<g><rect x="32.5" y="40.5" width="17" height="11.5" rx="4.5" fill="#1d1d22"/><rect x="50.5" y="40.5" width="17" height="11.5" rx="4.5" fill="#1d1d22"/><path d="M49.5 44L50.5 44" stroke="#1d1d22" stroke-width="2"/><path d="M36 43.4L40 42.6M54 43.4L58 42.6" stroke="#fff" stroke-opacity=".5" stroke-width="1.4" stroke-linecap="round"/></g>',
    '<g stroke="#c9a227" stroke-width="1.3" fill="#2c2c2c" fill-opacity=".62"><path d="M33 41Q41 39.5 49 41Q49 51 42 52Q34 51 33 41Z"/><path d="M51 41Q59 39.5 67 41Q66 51 58 52Q51 51 51 41Z"/></g><path d="M49 42.4L51 42.4" stroke="#c9a227" stroke-width="1.3"/>',
    '<g fill="'+oc+'" fill-opacity=".1" stroke="'+oc+'" stroke-width="1.8"><path d="M32 42Q33 40 40 41Q48 41.6 49 46Q48 52 41 52Q34 51 32 42Z"/><path d="M68 42Q67 40 60 41Q52 41.6 51 46Q52 52 59 52Q66 51 68 42Z"/></g>'][c.g];
  // chapeaux
  var hat=['',
    '<path d="M27 40C27 20 38 13 50 13C62 13 73 20 73 40Q50 35 27 40Z" fill="'+oc+'"/><path d="M60 37Q82 33 88 40Q82 45 62 42Z" fill="'+avMix(oc,'#000000',.18)+'"/><circle cx="50" cy="13.4" r="2" fill="'+avMix(oc,'#000000',.2)+'"/><path d="M50 14L50 37" stroke="#000" stroke-opacity=".15"/>',
    '<path d="M26 38C24 8 76 8 74 38Z" fill="'+oc+'"/><path d="M25 38Q50 44 75 38L75 30Q50 36 25 30Z" fill="'+avMix(oc,'#ffffff',.22)+'"/><path d="M32 12L33 30M42 10L42 33M58 10L58 33M68 12L67 30" stroke="#000" stroke-opacity=".12" stroke-width="1.2"/>',
    '<path d="M26 38C24 8 76 8 74 38Z" fill="'+oc+'"/><path d="M25 38Q50 44 75 38L75 30Q50 36 25 30Z" fill="'+avMix(oc,'#ffffff',.22)+'"/><circle cx="50" cy="7" r="6.5" fill="#f4f4f6"/>',
    '<path d="M27 42C28 14 72 14 73 42" fill="none" stroke="'+oc+'" stroke-width="3.4" stroke-linecap="round"/>',
    '<g fill="'+oc+'"><path d="M68 25L56 18L56 32Z"/><path d="M68 25L80 18L80 32Z"/><circle cx="68" cy="25" r="3.8"/></g>',
    '<path d="M35 28L37 11L43 20L50 9L57 20L63 11L65 28Z" fill="#fbbf24" stroke="#d99a06" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="22" r="1.8" fill="#d6334a"/>',
    '<path d="M27 35Q50 29 73 35L73 41Q50 35 27 41Z" fill="'+oc+'"/>',
    '<ellipse cx="50" cy="29" rx="41" ry="9.5" fill="#e6c27a"/><path d="M31 28C31 8 69 8 69 28Z" fill="#edcf8e"/><path d="M31 27Q50 31 69 27L69 22Q50 26 31 22Z" fill="'+oc+'"/>'][c.ha];
  var jewel=['','<circle cx="'+(L-.2)+'" cy="55.4" r="2.2" fill="#fbbf24"/><circle cx="'+(R+.2)+'" cy="55.4" r="2.2" fill="#fbbf24"/>','<circle cx="'+(L-.2)+'" cy="59" r="3.6" fill="none" stroke="#fbbf24" stroke-width="1.5"/><circle cx="'+(R+.2)+'" cy="59" r="3.6" fill="none" stroke="#fbbf24" stroke-width="1.5"/>','','<path d="M26 46C24 12 76 12 74 46" fill="none" stroke="#2b2d33" stroke-width="3.2" stroke-linecap="round"/><rect x="'+(L-5)+'" y="42" width="7" height="14" rx="3.4" fill="'+oc+'"/><rect x="'+(R-2)+'" y="42" width="7" height="14" rx="3.4" fill="'+oc+'"/>',''][c.j];
  var neck3=c.j===3?'<path d="M39 75Q50 87 61 75" fill="none" stroke="#fbbf24" stroke-width="1.3"/><circle cx="50" cy="83.5" r="2.2" fill="#fbbf24"/>':'';
  var scarf=c.j===5?'<path d="M35 68Q50 84 65 68L68 80Q50 96 32 80Z" fill="'+oc+'"/><path d="M54 84L64 100L53 101L47 90Z" fill="'+avMix(oc,'#000000',.15)+'"/><path d="M38 74Q50 88 62 74" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="1.4"/>':'';
  var v=vb||'0 0 100 100';
  return '<svg viewBox="'+v+'" aria-hidden="true"><defs><clipPath id="'+id+'"><path d="'+head+'"/></clipPath></defs><rect x="-10" y="-10" width="120" height="120" fill="'+AV.bg[c.b]+'"/>'+hr[0]+
    '<rect x="43" y="60" width="14" height="18" fill="'+sk+'"/><ellipse cx="50" cy="68" rx="9.5" ry="4.2" fill="#000" opacity=".13"/>'+of.base+of.neck+neck3+of.top+scarf+
    '<ellipse cx="'+(L-.6)+'" cy="49.5" rx="3.6" ry="5.2" fill="'+sk+'"/><ellipse cx="'+(R+.6)+'" cy="49.5" rx="3.6" ry="5.2" fill="'+sk+'"/><ellipse cx="'+(L-.2)+'" cy="50" rx="1.6" ry="3" fill="'+skd+'" opacity=".5"/><ellipse cx="'+(R+.2)+'" cy="50" rx="1.6" ry="3" fill="'+skd+'" opacity=".5"/>'+
    '<path d="'+head+'" fill="'+sk+'"/><path d="'+head+'" fill="none" stroke="#000" stroke-opacity=".08" stroke-width="1"/>'+
    '<ellipse cx="45" cy="30" rx="9" ry="4.5" fill="#fff" opacity=".13"/><ellipse cx="50" cy="'+(cy-1)+'" rx="'+(cw+7)+'" ry="3.4" fill="'+skd+'" opacity=".16"/>'+
    '<circle cx="36" cy="55" r="4.4" fill="#ff8a8a" opacity=".12"/><circle cx="64" cy="55" r="4.4" fill="#ff8a8a" opacity=".12"/>'+
    ex+eyebrows+eye(41)+eye(59)+nz+bd+mouth+hr[1]+gl+jewel+hat+'</svg>';
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
  cal:svg('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
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
  var t=[['home','Accueil',ICON.home]], cal=['cal','Planning',ICON.cal];
  if(isAdult(m)){
    t.push(['approve','À valider',ICON.check],cal,['rank','Classement',ICON.trophy],['rewards','Récompenses',ICON.gift],['family','Famille',ICON.users]);
  } else {
    t.push(['rank','Classement',ICON.trophy],cal,['rewards','Récompenses',ICON.gift],['me','Moi',ICON.user]);
  }
  return t;
}
function tabbar(m){
  var pc=pendingCount();
  return '<nav class="tabbar" aria-label="Navigation"><div class="tabs n'+tabsFor(m).length+'">'+tabsFor(m).map(function(t){
    if(t[0]==='cal') return '<button class="tab cal" data-act="tab" data-tab="cal"'+(tab==='cal'?' aria-current="page"':'')+'><span class="calbtn">'+t[2]+'</span><span>'+t[1]+'</span></button>';
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
/* ---------- calendrier familial ---------- */
var calMonth=null, calDay=null, calFilter='all';
function dkey(d){ return d.getFullYear()+'-'+('0'+(d.getMonth()+1)).slice(-2)+'-'+('0'+d.getDate()).slice(-2); }
function parseDay(k){ var a=k.split('-'); return new Date(+a[0],+a[1]-1,+a[2]); }
function frDay(k){ var t=parseDay(k).toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}); return t.charAt(0).toUpperCase()+t.slice(1); }
function eventsOn(k,m){
  return S.events.filter(function(e){ return e.day===k&&(calFilter!=='me'||e.memberIds.indexOf(m.id)>=0); })
    .sort(function(a,b){ return (a.time||'')<(b.time||'')?-1:((a.time||'')>(b.time||'')?1:a.title.localeCompare(b.title,'fr')); });
}
function calView(m){
  var today=dkey(new Date());
  if(!calDay) calDay=today;
  if(!calMonth){ var c=parseDay(calDay); calMonth=new Date(c.getFullYear(),c.getMonth(),1); }
  var y=calMonth.getFullYear(), mo=calMonth.getMonth(), first=(new Date(y,mo,1).getDay()+6)%7, n=new Date(y,mo+1,0).getDate(), adult=isAdult(m);
  var title=calMonth.toLocaleDateString('fr-FR',{month:'long',year:'numeric'});
  var h='<section class="card cal"><div class="calhead"><button class="btn small" data-act="calPrev" aria-label="Mois précédent">‹</button><h3>'+esc(title.charAt(0).toUpperCase()+title.slice(1))+'</h3><button class="btn small" data-act="calNext" aria-label="Mois suivant">›</button></div>'+
    '<div class="calgrid">'+['L','M','M','J','V','S','D'].map(function(x){return '<span class="dow">'+x+'</span>';}).join('');
  for(var i=0;i<first;i++) h+='<span></span>';
  for(var d=1;d<=n;d++){
    var k=y+'-'+('0'+(mo+1)).slice(-2)+'-'+('0'+d).slice(-2), c2=eventsOn(k,m).length;
    h+='<button class="day'+(k===today?' today':'')+(k===calDay?' sel':'')+'" data-act="calDay" data-day="'+k+'" aria-label="'+esc(frDay(k))+'"><span>'+d+'</span><i class="dots">'+(c2?'<b></b>'+(c2>1?'<b></b>':'')+(c2>2?'<b></b>':''):'')+'</i></button>';
  }
  h+='</div><div class="calfoot"><div class="chips2"><button class="btn small'+(calFilter==='all'?' primary':'')+'" data-act="calFilter" data-f="all">Toute la famille</button><button class="btn small'+(calFilter==='me'?' primary':'')+'" data-act="calFilter" data-f="me">Moi</button></div><button class="link" data-act="calToday">Aujourd’hui</button></div></section>';
  var evs=eventsOn(calDay,m);
  h+='<section class="card"><div class="section-title"><h3>'+esc(frDay(calDay))+'</h3>'+(adult?'<button class="btn small primary" data-act="evNew">Ajouter</button>':'')+'</div>';
  if(!evs.length) h+='<p class="muted">'+(adult?'Rien de prévu ce jour-là. Appuie sur « Ajouter » pour planifier une tâche.':'Rien de prévu ce jour-là.')+'</p>';
  else h+='<ul class="list">'+evs.map(function(e){
    var who=e.memberIds.map(function(id){return mById(id);}).filter(Boolean), mine=e.memberIds.indexOf(m.id)>=0;
    var row='<span class="evtime">'+(e.time?esc(e.time):'Journée')+'</span><div class="mmain"><div class="hlabel">'+esc(e.title)+'</div>'+(e.note?'<div class="muted small">'+esc(e.note)+'</div>':'')+
      '<div class="evwho">'+who.map(function(x){return '<span class="evp">'+avatar(x,'sm')+esc(x.name)+'</span>';}).join('')+'</div></div>'+(mine?'<span class="evmine">Pour toi</span>':'');
    return '<li>'+(adult?'<button class="rrow ev'+(mine?' mine':'')+'" data-act="evEdit" data-id="'+esc(e.id)+'">'+row+'</button>':'<div class="rrow ev'+(mine?' mine':'')+'">'+row+'</div>')+'</li>';
  }).join('')+'</ul>';
  return h+'</section>';
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
  else if(tab==='cal') body=calView(m);
  if(tab==='home') body+=pushCard();
  $app.innerHTML=topbar(m)+'<main>'+banners()+body+'</main>'+tabbar(m);
  if(tab==='approve') loadPhotos();
  if(sheet&&(sheet.type==='member'||sheet.type==='pot')) renderSheet();
}
document.addEventListener('input',function(e){ var t=e.target; if(t&&t.id==='f-time'&&t.value){ var a=document.getElementById('f-allday'); if(a) a.checked=false; } });
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
  if(s.type==='ev'){
    var ev=s.id?S.events.find(function(x){return x.id===s.id;}):null; if(s.id&&!ev) return '';
    var tl2=S.tasks.slice().sort(function(a,b){return a.label.localeCompare(b.label,'fr');}), sel=ev?ev.memberIds:[], isTask=ev&&ev.taskId&&tl2.some(function(t){return t.id===ev.taskId;});
    var allday=!ev||!ev.time, ppl=S.members.slice().sort(function(a,b){return (a.ts||0)-(b.ts||0);});
    return '<h2>'+(ev?'Modifier au planning':'Planifier une tâche')+'</h2><form data-form="ev" data-id="'+(ev?esc(ev.id):'')+'">'+
      '<div class="field"><label for="f-task">Tâche</label><select id="f-task" name="task"><option value="">Autre tâche (à écrire)</option>'+tl2.map(function(t){return '<option value="'+esc(t.id)+'"'+(isTask&&ev.taskId===t.id?' selected':'')+'>'+esc(t.label)+'</option>';}).join('')+'</select></div>'+
      '<div class="field"><label for="f-title">Nom de la tâche (si « Autre »)</label><input id="f-title" name="title" type="text" maxlength="60" autocomplete="off" value="'+esc(ev&&!isTask?ev.title:'')+'" placeholder="Ex. : Sortir le chien"></div>'+
      '<div class="field"><span class="lbl">Qui ?</span><div class="tasklist">'+ppl.map(function(x){return '<label class="taskopt"><input type="checkbox" name="who" value="'+esc(x.id)+'"'+(sel.indexOf(x.id)>=0?' checked':'')+'><span class="tbody"><span class="evp">'+avatar(x,'sm')+esc(x.name)+'</span></span></label>';}).join('')+'</div></div>'+
      '<div class="field"><label for="f-day">Jour</label><input id="f-day" name="day" type="date" required value="'+esc(ev?ev.day:s.day)+'"></div>'+
      '<div class="field"><label class="taskopt"><input type="checkbox" id="f-allday" name="allday"'+(allday?' checked':'')+'><span class="tbody"><span>Toute la journée</span></span></label></div>'+
      '<div class="field"><label for="f-time">Heure</label><input id="f-time" name="time" type="time" value="'+esc(ev&&ev.time?ev.time:'')+'"></div>'+
      '<div class="field"><label for="f-note">Note (facultatif)</label><input id="f-note" name="note" type="text" maxlength="200" autocomplete="off" value="'+esc(ev?ev.note:'')+'"></div>'+
      '<p class="err" id="err" role="alert"></p><button class="btn primary block" type="submit">Enregistrer</button>'+
      (ev?'<button class="btn danger block" type="button" data-act="evDelete" data-id="'+esc(ev.id)+'" style="margin-top:8px">Supprimer</button>':'')+'</form>';
  }
  if(s.type==='avatar'){
    var am=mById(s.id); if(!am) return '';
    var cfg=s.cfg, prevM={name:am.name,hue:am.hue,avatar:s.photo||(cfg?JSON.stringify(cfg):null)};
    var AVTABS=[['face','Visage','<circle cx="12" cy="12" r="9"/><circle cx="9" cy="10.5" r="1" fill="currentColor"/><circle cx="15" cy="10.5" r="1" fill="currentColor"/><path d="M8.5 15Q12 18 15.5 15"/>'],
      ['hair','Cheveux','<path d="M5 20V12a7 7 0 0 1 14 0v8"/><path d="M5 12Q12 10 19 12M9 6Q8 10 8 13M15 6Q16 10 16 13"/>'],
      ['beard','Barbe','<path d="M5 8Q5 20 12 21Q19 20 19 8"/><path d="M9 13Q12 11 15 13M10 16Q12 17.4 14 16"/>'],
      ['outfit','Habits','<path d="M8 4L3 7L5.5 11L8 10V20H16V10L18.5 11L21 7L16 4Q12 8 8 4Z"/>'],
      ['acc','Accessoires','<circle cx="7" cy="14" r="3.5"/><circle cx="17" cy="14" r="3.5"/><path d="M10.5 14Q12 12.6 13.5 14M3.5 13L2 10M20.5 13L22 10"/>'],
      ['bg','Fond','<circle cx="12" cy="12" r="9"/><path d="M12 3V21M3 12H21" opacity=".4"/>']];
    var AVSEC={
      face:[['Peau','s','dot'],['Forme du visage','f'],['Yeux','e'],['Couleur des yeux','ec','dot'],['Sourcils','eb'],['Nez','n'],['Bouche','m'],['Détails','x']],
      hair:[['Coupe','h'],['Couleur des cheveux','hc','dot']],
      beard:[['Barbe et moustache (couleur = celle des cheveux)','bd']],
      outfit:[['Haut','o'],['Couleur','oc','dot']],
      acc:[['Lunettes','g'],['Chapeaux et coiffes','ha'],['Bijoux et autres','j']],
      bg:[['Couleur de fond','b','dot']]
    };
    var colorsOf={s:AV.skin,hc:AV.hairc,ec:AV.eyec,oc:AV.outc,b:AV.bg};
    var tab=s.tab||'face', vbOf={face:'12 6 76 72',hair:'4 2 92 90',beard:'12 6 76 78',outfit:'0 0 100 100',acc:'10 0 80 80',bg:'0 0 100 100'}[tab];
    var row=function(label,key,kind){
      var list=kind==='dot'?colorsOf[key]:AV[AVK[key]];
      return '<div class="field"><span class="lbl">'+label+'</span><div class="avrow">'+list.map(function(x,i){
        var on=cfg&&cfg[key]===i;
        if(kind==='dot') return '<button type="button" class="avdot'+(on?' on':'')+'" style="background:'+x+'" data-act="avOpt" data-k="'+key+'" data-i="'+i+'" aria-label="Couleur '+(i+1)+'"></button>';
        var t=avLimit(Object.assign({},cfg||AV_DEF)); t[key]=i;
        return '<button type="button" class="avopt'+(on?' on':'')+'" data-act="avOpt" data-k="'+key+'" data-i="'+i+'"><span class="avatar">'+avSvg(t,({e:'27 26 46 46',eb:'27 26 46 46',n:'30 32 40 40',m:'30 40 40 40',x:'22 30 56 56',g:'18 18 64 64',j:'8 8 84 84'})[key]||vbOf)+'</span><span>'+esc(x)+'</span></button>';
      }).join('')+'</div></div>';
    };
    var ctrl=cfg?('<div class="avtabs" role="tablist">'+AVTABS.map(function(t){
        return '<button type="button" class="avtab'+(t[0]===tab?' on':'')+'" role="tab" data-act="avTab" data-tab="'+t[0]+'"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+t[2]+'</svg><span>'+t[1]+'</span></button>';
      }).join('')+'</div>'+AVSEC[tab].map(function(r){return row(r[0],r[1],r[2]);}).join('')):
      '<p class="muted small">'+(s.photo?'Tu utilises une photo. Tu peux aussi créer un avatar.':'Ton profil affichera la première lettre du prénom. Tu peux créer un avatar ou ajouter une photo.')+'</p>';
    return '<h2>Avatar de '+esc(am.name)+'</h2><div class="avprev">'+avatar(prevM,'xl')+'</div>'+
      '<div class="avtop"><button type="button" class="btn small'+(cfg?' primary':'')+'" data-act="avMode" data-mode="avatar">Créer un avatar</button>'+
      '<label class="btn small'+(s.photo?' primary':'')+'" for="f-avphoto">Utiliser une photo</label><input id="f-avphoto" type="file" accept="image/*" hidden>'+
      '<button type="button" class="btn small" data-act="avMode" data-mode="letter">Juste la lettre</button>'+(cfg?'<button type="button" class="btn small" data-act="avRandom">Au hasard</button>':'')+'</div>'+ctrl+
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
    case 'calPrev': calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()-1,1); render(); break;
    case 'calNext': calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+1,1); render(); break;
    case 'calDay': calDay=ds.day; render(); break;
    case 'calFilter': calFilter=ds.f; render(); break;
    case 'calToday': calDay=dkey(new Date()); calMonth=null; render(); break;
    case 'evNew': openSheet({type:'ev',id:null,day:calDay||dkey(new Date())}); break;
    case 'evEdit': openSheet({type:'ev',id:ds.id}); break;
    case 'evDelete':
      if(await w(async function(){ dbErr(await sb.rpc('event_delete',{p_id:ds.id})); })){ closeSheet(); toast('Supprimé du planning.'); }
      break;
    case 'avTab': sheet.tab=ds.tab; avRender(); break;
    case 'avRandom': {
      var rc={}; Object.keys(AVK).forEach(function(k){ rc[k]=Math.floor(Math.random()*AV[AVK[k]].length); });
      rc.bd=Math.random()<.3?rc.bd:0; rc.g=Math.random()<.35?rc.g:0; rc.ha=Math.random()<.25?rc.ha:0; rc.j=Math.random()<.3?rc.j:0; rc.x=Math.random()<.3?rc.x:0;
      sheet.cfg=avLimit(rc); sheet.photo=null; avRender(); break; }
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
    else if(kind==='ev'){
      var evTask=g('task'), evTitle=g('title'), evWho=fd.getAll('who'), evDay=g('day'), evAll=!!fd.get('allday'), evTime=g('time');
      if(!evTask&&!evTitle){ err('Choisis une tâche ou écris-en une.'); return; }
      if(!evWho.length){ err('Choisis au moins une personne.'); return; }
      if(!evDay){ err('Choisis un jour.'); return; }
      if(!evAll&&!evTime){ err('Choisis une heure, ou coche « Toute la journée ».'); return; }
      var er=await sb.rpc('event_save',{p_id:form.dataset.id||null,p_title:evTask?'':evTitle,p_task:evTask||null,p_day:evDay,p_time:evAll?null:evTime,p_members:evWho,p_note:g('note')||null});
      if(er.error){ err(er.error.code==='P0001'?er.error.message:'Impossible pour le moment. Vérifie ta connexion.'); return; }
      calDay=evDay; calMonth=null; scheduleRefresh(); closeSheet(); toast('Ajouté au planning. Les personnes sont prévenues.');
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
  events:function(r){return {id:r.id,taskId:r.task_id||null,title:r.title,day:r.day,time:r.start_time?String(r.start_time).slice(0,5):null,memberIds:r.member_ids||[],note:r.note||'',createdBy:r.created_by,ts:Date.parse(r.created_at)};},
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
  ['members','entries','rewards','redemptions','tasks','pots','pot_members','pot_rewards','events'].forEach(function(t){
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
