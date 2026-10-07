
(function(){
  window.closeHalloweenIntro=function(){
    const overlay=document.getElementById("halloweenOverlay");
    if(overlay){overlay.style.transition="opacity .35s ease";overlay.style.opacity="0";overlay.style.pointerEvents="none";setTimeout(()=>{overlay.style.display="none";},380);}
    try{
      let a=document.getElementById("spookyPlayer");
      if(!a){a=document.createElement("audio");a.id="spookyPlayer";a.src="halloween-ambient.wav";a.loop=true;a.preload="auto";a.volume=.18;a.setAttribute("playsinline","");a.style.cssText="position:fixed;width:1px;height:1px;left:-10px;bottom:-10px;opacity:0;pointer-events:none";document.body.appendChild(a);}
      a.play().catch(()=>{});
    }catch(e){}
  };
  window.addEventListener("DOMContentLoaded",function(){
    const b=document.getElementById("halloweenContinue");
    if(b) b.addEventListener("click",window.closeHalloweenIntro,{once:false});
  });
})();



/* ===== FYFL V3 — Supabase config =====
   Colle ici ton URL Supabase et ta clé PUBLISHABLE/anon.
   Ne mets JAMAIS la clé service_role/secret dans ce fichier. */
const FYFL_SUPABASE_URL="https://dxbaicqbpccruebmlorb.supabase.co";
const FYFL_DATA_RESET_AT='2026-10-05T15:40:00.000Z';
const FYFL_SUPABASE_KEY="sb_publishable_pglwhtDgDHi6DV931NsfTQ_tUGo4-Jk";
let fyflSupabase=null;
let fyflRealtimeChannel=null;
let fyflMatchMVPs={};
let fyflPresenceChannel=null;
let fyflRealtimeStatus='DISCONNECTED';
let fyflOnlineCount=0;
let fyflNotifications=[];
let fyflNotificationChannel=null;
let fyflSiteStatus={maintenance:false,message:'🔧 FYFL est actuellement en maintenance.\n\nLe site revient bientôt.'};
let fyflAdminLogs=[];
let fyflDatabaseStatus='CHECKING';
let fyflPresenceKey=(crypto?.randomUUID?.()||('fyfl-'+Math.random().toString(36).slice(2)+Date.now()));
let fyflRemoteReady=false;
let fyflInitPromise=null;

const groups={"A": ["ASTON VILLA", "OM", "BAYER LEVERKUSEN", "NEWCASTLE"], "B": ["BARCELONE", "BESIKTAS", "LIVERPOOL", "REAL MADRID"], "C": ["CRYSTAL PALACE", "PSG", "ATLETICO MADRID", "JUVENTUS"], "D": ["AS MONACO", "LAZIO FC", "D2T", "FIORENTINA"], "E": ["INTER MILAN", "RED STAR", "ARSENAL", "AC MILAN"], "F": ["RENNES", "CHELSEA", "MANCHESTER CITY", "BAYERN MUNICH"]};
const defaultResults=[];
let results=defaultResults.map(x=>({...x}));
let fyflSettings={breaking:'REJOIGNEZ LE DISCORD POUR TOUTE LES INFO !',player:'À déterminer',news:'Les matchs FYFL se joueront les mercredis et les week-ends !',standings:{}};
let fyflComments=[];
let fyflSettingsReady=false;
let fyflCommentsReady=false;
let fyflStats=[];
async function saveResults(){
  if(!fyflSupabase || !fyflRemoteReady || !isCurrentAccountAdminVerified()) return false;
  return await syncAllRemoteMatches();
}
async function saveSingleRemoteMatch(m){
  if(!fyflSupabase || !fyflRemoteReady || !isCurrentAccountAdminVerified()) return false;
  const day=Number(m.day||findMatchDay(m));
  const row=fyflToRow({...m,day});
  const {error}=await fyflSupabase.from('fyfl_matches').upsert(row,{onConflict:'match_key'});
  if(error){window.__fyflLastMatchSyncError=error.message||String(error);console.warn('FYFL Supabase match upsert:',error);return false;} window.__fyflLastMatchSyncError='';
  return true;
}

function fyflMatchKey(m){return `${m.group||''}|${m.day||''}|${m.home||''}|${m.away||''}`}
function fyflToRow(m){return {match_key:fyflMatchKey(m),group_name:m.group,day:Number(m.day||1),home:m.home,away:m.away,home_score:Number(m.hs||0),away_score:Number(m.as||0),status:m.status||'À venir',minute:Number(m.minute||0),goals:Array.isArray(m.goals)?m.goals:[],started_at:m.startedAt?new Date(m.startedAt).toISOString():null,updated_at:new Date().toISOString()}}
function fyflFromRow(r){return {group:r.group_name,day:Number(r.day),home:r.home,away:r.away,hs:Number(r.home_score??r.hs??0),as:Number(r.away_score??r.as??0),status:r.status||'À venir',minute:Number(r.minute||0),goals:Array.isArray(r.goals)?r.goals:[],...(r.started_at?{startedAt:new Date(r.started_at).getTime()}: {}),...(r.updated_at?{updatedAt:new Date(r.updated_at).getTime()}: {})}}
function isCurrentPlayedMatch(m){
  return (m.group==='F'&&m.home==='RENNES'&&m.away==='CHELSEA'&&Number(m.hs)===9&&Number(m.as)===2&&m.status==='Terminé')
      ||(m.group==='F'&&m.home==='MANCHESTER CITY'&&m.away==='BAYERN MUNICH'&&Number(m.hs)===7&&Number(m.as)===0&&m.status==='Terminé');
}
function normalizeSeasonResults(rows){
  // La base Supabase est la source de vérité : on conserve les matchs distants
  // (à venir, en direct ou terminés) et on complète uniquement les affiches manquantes.
  const remote=new Map();
  (Array.isArray(rows)?rows:[]).forEach(r=>{
    const m=fyflFromRow(r);
    const day=Number(m.day||findMatchDay(m));
    const key=fyflMatchKey({...m,day});
    remote.set(key,{...m,day});
  });
  const out=[];
  Object.entries(groups).forEach(([g,arr])=>{
    const pairs={1:[[arr[0],arr[1]],[arr[2],arr[3]]],2:[[arr[0],arr[2]],[arr[1],arr[3]]],3:[[arr[0],arr[3]],[arr[1],arr[2]]]};
    Object.entries(pairs).forEach(([day,ps])=>ps.forEach(([home,away])=>{
      const d=Number(day);
      const key=fyflMatchKey({group:g,day:d,home,away});
      const reverseKey=fyflMatchKey({group:g,day:d,home:away,away:home});
      const found=remote.get(key)||remote.get(reverseKey);
      out.push(found?{...found,group:g,day:d}:{group:g,day:d,home,away,hs:0,as:0,status:'À venir',minute:0,goals:[]});
    }));
  });
  return out;
}
function cleanStandingsOverrides(value){
  return (value && typeof value==='object') ? value : {};
}
function setRemoteResults(rows){
  results=normalizeSeasonResults(rows);
}
function mergeRemoteRows(rows){
  if(!Array.isArray(rows))return;
  rows.forEach(r=>{const incoming=fyflFromRow(r);const i=results.findIndex(m=>fyflMatchKey({...m,day:m.day||findMatchDay(m)})===r.match_key);if(i>=0)results[i]=incoming;else results.push(incoming);});
}
async function syncAllRemoteMatches(){
  if(!fyflSupabase||!fyflRemoteReady||!isCurrentAccountAdminVerified())return false;
  const rows=results.map(m=>{const day=m.day||findMatchDay(m);return fyflToRow({...m,day})});
  if(!rows.length)return true;
  const {error}=await fyflSupabase.from('fyfl_matches').upsert(rows,{onConflict:'match_key'});
  if(error){window.__fyflLastMatchSyncError=error.message||String(error);console.warn('FYFL Supabase upsert:',error);return false} window.__fyflLastMatchSyncError='';
  return true;
}
function findMatchDay(m){for(const [g,arr] of Object.entries(groups)){const pairs={1:[[arr[0],arr[1]],[arr[2],arr[3]]],2:[[arr[0],arr[2]],[arr[1],arr[3]]],3:[[arr[0],arr[3]],[arr[1],arr[2]]]};for(const [d,ps] of Object.entries(pairs))for(const [h,a] of ps)if((m.home===h&&m.away===a)||(m.home===a&&m.away===h))return Number(d)}return 1}
async function deleteRemoteMatch(m){if(!fyflSupabase||!fyflRemoteReady||!isCurrentAccountAdminVerified())return false;const {error}=await fyflSupabase.from('fyfl_matches').delete().eq('match_key',fyflMatchKey({...m,day:m.day||findMatchDay(m)}));if(error){console.warn('FYFL Supabase delete:',error.message);return false}return true}
function flashLive(){const el=document.getElementById('fyflLiveSync');if(!el)return;el.classList.add('show');clearTimeout(window.__fyflLiveFlash);window.__fyflLiveFlash=setTimeout(()=>el.classList.remove('show'),1200)}
async function loadOnlineSettings(){
  if(!fyflSupabase)return;
  const {data,error}=await fyflSupabase.from('fyfl_settings').select('*').eq('id','main').maybeSingle();
  if(!error&&data){
    let standings=cleanStandingsOverrides(data.standings);
    // Migration de sécurité : une ancienne version pouvait enregistrer un override
    // pour toutes les équipes (ex. 3 MJ / 3 nuls / 3 pts partout). Dans ce cas,
    // le classement calculé à partir des matchs ne doit plus être écrasé.
    const overrideKeys=Object.keys(standings).filter(k=>allTeams.includes(k));
    // Purge l’ancien classement manuel global qui pouvait afficher 3 MJ / 3 nuls / 3 pts partout.
    const blanketOverride=allTeams && overrideKeys.length>=Math.max(12,Math.ceil(allTeams.length*0.75));
    if(blanketOverride){
      standings={};
      if(isCurrentAccountAdminVerified()){
        const {error:clearError}=await fyflSupabase.from('fyfl_settings').update({standings:{},updated_at:new Date().toISOString()}).eq('id','main');
        if(clearError)console.warn('FYFL nettoyage classement:',clearError.message);
      }
    }
    fyflSettings={...fyflSettings,breaking:data.breaking||fyflSettings.breaking,player:data.player||fyflSettings.player,news:data.news||fyflSettings.news,standings};
    fyflSettingsReady=true;applyAdminPrefs();
  }
}
async function saveOnlineSettings(p){
  if(!fyflSupabase||!isCurrentAccountAdminVerified())return false;
  const row={id:'main',breaking:p.breaking||'',player:p.player||'',news:p.news||'',standings:p.standings||fyflSettings.standings||{},updated_at:new Date().toISOString()};
  const {error}=await fyflSupabase.from('fyfl_settings').upsert(row,{onConflict:'id'});
  if(error){console.warn('FYFL settings:',error.message);return false}
  fyflSettings={...fyflSettings,...p,standings:p.standings||fyflSettings.standings||{}};fyflSettingsReady=true;applyAdminPrefs();return true;
}
async function loadOnlineComments(){
  if(!fyflSupabase)return;
  const {data,error}=await fyflSupabase.from('fyfl_comments').select('*').order('created_at',{ascending:false});
  if(!error){fyflComments=data||[];fyflCommentsReady=true;}
}
async function loadOnlineStats(){
  if(!fyflSupabase)return;
  const {data,error}=await fyflSupabase.from('fyfl_stats').select('*').order('stat_count',{ascending:false}).order('updated_at',{ascending:false});
  if(!error)fyflStats=data||[];
}
function statsRows(category){return fyflStats.filter(x=>x.category===category).sort((a,b)=>Number(b.stat_count||0)-Number(a.stat_count||0)||String(a.player_name||'').localeCompare(String(b.player_name||''))).slice(0,15)}
function statsLogo(club){return crest(club,'stats-club-logo')}
function pageStats(){const pass=statsRows('passeur'),but=statsRows('buteur');const block=(title,category,rows,label)=>`<div class="card"><div class="section-head"><h2>${title}</h2><small>Top 15</small></div><div class="stats-list">${rows.length?rows.map((x,i)=>`<div class="stats-row"><b class="stats-rank">${i+1}</b>${statsLogo(x.club)}<div class="stats-player"><strong>${escapeHtml(x.player_name)}</strong><small>${escapeHtml(x.club||'Club non renseigné')}</small></div><b class="stats-count">${Number(x.stat_count)||0} ${label}</b></div>`).join(''):'<div class="live-empty">Aucune statistique enregistrée.</div>'}</div></div>`;return `<section class="section"><div class="section-head"><h2>STATS FYFL</h2><small>Synchronisé en direct avec Supabase</small></div><div class="stats-grid">${block('Meilleur passeur','passeur',pass,'passe'+(pass.length===1?'':'s'))}${block('Meilleur buteur','buteur',but,'but'+(but.length===1?'':'s'))}</div></section>`}
async function adminAddStat(){if(!fyflSupabase||!isCurrentAccountAdminVerified()){alert('Administration Supabase non connectée.');return}const category=document.getElementById('adminStatCategory')?.value;const player=(document.getElementById('adminStatPlayer')?.value||'').trim();const count=Math.max(0,Number(document.getElementById('adminStatCount')?.value||0));const club=(document.getElementById('adminStatClub')?.value||'').trim();if(!player||!club||!Number.isFinite(count)){alert('Remplis le joueur, le club et le nombre.');return}const {data:existing,error:findError}=await fyflSupabase.from('fyfl_stats').select('*').eq('category',category).ilike('player_name',player).ilike('club',club).maybeSingle();if(findError){alert('Impossible de vérifier la statistique : '+findError.message);return}let data,error;if(existing){({data,error}=await fyflSupabase.from('fyfl_stats').update({stat_count:count,updated_at:new Date().toISOString()}).eq('id',existing.id).select().single())}else{({data,error}=await fyflSupabase.from('fyfl_stats').insert({category,player_name:player,stat_count:count,club,updated_at:new Date().toISOString()}).select().single())}if(error){alert('Impossible d\'enregistrer la statistique : '+error.message);return}if(data){const i=fyflStats.findIndex(x=>x.id===data.id);if(i>=0)fyflStats[i]=data;else fyflStats.unshift(data);render('admin',false)}await writeAdminLog(existing?'Statistique modifiée':'Statistique ajoutée',`${category} · ${player} · ${count} · ${club}`);}
async function adminDeleteStat(id){if(!fyflSupabase||!isCurrentAccountAdminVerified())return;const {error}=await fyflSupabase.from('fyfl_stats').delete().eq('id',id);if(error){alert('Impossible de supprimer la statistique : '+error.message);return}await writeAdminLog('Statistique supprimée',String(id));}

function updateRealtimeIndicators(){
  const status=document.getElementById('adminRealtimeStatus');
  if(status){
    const online=fyflRealtimeStatus==='SUBSCRIBED';
    status.innerHTML=`<span class="status-dot ${online?'online':'offline'}"></span>${online?'Connecté':'Déconnecté'}`;
  }
  const status2=document.getElementById('adminRealtimeStatus2');
  if(status2){const online=fyflRealtimeStatus==='SUBSCRIBED';status2.innerHTML=`<span class="status-dot ${online?'online':'offline'}"></span>${online?'Connecté':'Déconnecté'}`;}
  const count=document.getElementById('adminOnlineCount');
  if(count) count.textContent=String(fyflOnlineCount);
}
function updateSiteStatusIndicators(){
  const db=document.getElementById('adminDatabaseStatus');
  if(db){const ok=fyflDatabaseStatus==='OK';db.innerHTML=`<span class="status-dot ${ok?'online':'offline'}"></span>${ok?'Opérationnelle':'Indisponible'}`;}
  const maint=document.getElementById('adminMaintenanceStatus');
  if(maint)maint.innerHTML=fyflSiteStatus.maintenance?'<span class="status-dot offline"></span>Maintenance active':'<span class="status-dot online"></span>Site opérationnel';
}
function applyMaintenanceUI(){
  const isAdmin=isCurrentAccountAdminVerified(); let el=document.getElementById('fyflMaintenanceOverlay');
  if(fyflSiteStatus.maintenance&&!isAdmin){
    if(!el){el=document.createElement('div');el.id='fyflMaintenanceOverlay';el.className='maintenance-overlay';document.body.appendChild(el);}
    el.innerHTML=`<div class="maintenance-card"><div style="font-size:52px">🔧</div><h1>FYFL est actuellement en maintenance.</h1><p>${escapeHtml(fyflSiteStatus.message||'Le site revient bientôt.')}</p><small style="color:#7d8796">Mise à jour en direct via Supabase</small></div>`;
  }else if(el)el.remove();
}
function formatAdminLogDate(v){try{return new Date(v).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'medium'})}catch(e){return v||''}}
function renderAdminLogs(){const toolbar=document.getElementById('adminLogFilters');if(toolbar&&!toolbar.innerHTML)toolbar.innerHTML=adminLogFilters();const el=document.getElementById('adminLogList');if(!el)return;const q=(document.getElementById('adminLogSearch')?.value||'').trim().toLowerCase();const type=(document.getElementById('adminLogType')?.value||'').trim();const rows=fyflAdminLogs.filter(x=>(!q||`${x.action||''} ${x.details||''} ${x.created_by||''}`.toLowerCase().includes(q))&&(!type||x.action===type));el.innerHTML=rows.length?rows.map(x=>`<div class="admin-log-item"><b>${escapeHtml(x.action||'Action administrateur')}</b><div>${escapeHtml(x.details||'')}</div><small>👤 ${escapeHtml(x.created_by||'Admin')} · 🕒 ${escapeHtml(formatAdminLogDate(x.created_at))}</small></div>`).join(''):'<div class="admin-log-empty">Aucune action ne correspond au filtre.</div>';}
function adminLogFilters(){const types=[...new Set(fyflAdminLogs.map(x=>x.action).filter(Boolean))];return `<div class="admin-log-toolbar"><input id="adminLogSearch" oninput="renderAdminLogs()" placeholder="🔎 Rechercher dans le journal..."><select id="adminLogType" onchange="renderAdminLogs()"><option value="">Toutes les actions</option>${types.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}</select></div>`;}
async function loadSiteStatus(){if(!fyflSupabase)return;const {data,error}=await fyflSupabase.from('fyfl_site_status').select('*').eq('id','main').maybeSingle();if(!error){fyflSiteStatus={...fyflSiteStatus,...(data||{})};fyflDatabaseStatus='OK'}else fyflDatabaseStatus='ERROR';updateSiteStatusIndicators();applyMaintenanceUI();}
async function loadAdminLogs(){if(!fyflSupabase)return;const {data,error}=await fyflSupabase.from('fyfl_admin_logs').select('*').order('created_at',{ascending:false}).limit(50);if(!error)fyflAdminLogs=data||[];renderAdminLogs();}
async function writeAdminLog(action,details=''){if(!fyflSupabase||!isCurrentAccountAdminVerified())return;const {data,error}=await fyflSupabase.from('fyfl_admin_logs').insert({action,details,created_by:supabaseAdminUser?.email||'admin'}).select().single();if(error)console.warn('FYFL admin log:',error.message);else if(data){fyflAdminLogs.unshift(data);renderAdminLogs();}}
async function setMaintenance(enabled){if(!fyflSupabase||!isCurrentAccountAdminVerified()){alert('Connecte-toi à l’administration Supabase.');return}const message=(document.getElementById('adminMaintenanceMessage')?.value||'🔧 FYFL est actuellement en maintenance.\\n\\nLe site revient bientôt.').trim();const row={id:'main',maintenance:!!enabled,message,updated_at:new Date().toISOString()};const {error}=await fyflSupabase.from('fyfl_site_status').upsert(row,{onConflict:'id'});if(error){alert('Impossible de modifier le mode maintenance : '+error.message);return}await writeAdminLog(enabled?'Mode maintenance activé':'Mode maintenance désactivé',message);fyflSiteStatus={...fyflSiteStatus,...row};applyMaintenanceUI();updateSiteStatusIndicators();render('admin',false);}
async function saveMaintenanceMessage(){if(!fyflSupabase||!isCurrentAccountAdminVerified())return;await setMaintenance(!!fyflSiteStatus.maintenance)}
function showGlobalNotification(n){
  window.__shownNotificationIds=window.__shownNotificationIds||new Set();if(n?.id&&window.__shownNotificationIds.has(n.id))return;if(n?.id)window.__shownNotificationIds.add(n.id);
  const old=document.querySelector('.global-notification'); if(old) old.remove();
  const el=document.createElement('div'); el.className='global-notification';
  el.innerHTML=`<div class="notif-title">${escapeHtml(n.title||'NOTIFICATION FYFL')}</div><div class="notif-message">${escapeHtml(n.message||'')}</div><div class="notif-time">Diffusé en direct · FYFL</div>`;
  document.body.appendChild(el); setTimeout(()=>el.remove(),7000);
}
async function loadOnlineNotifications(){
  if(!fyflSupabase)return;
  const {data,error}=await fyflSupabase.from('fyfl_notifications').select('*').order('created_at',{ascending:false}).limit(20);
  if(!error)fyflNotifications=data||[];
}
async function sendGlobalNotification(){
  if(!fyflSupabase||!isCurrentAccountAdminVerified()){alert('Connecte-toi à l’administration Supabase.');return;}
  const title=(document.getElementById('adminNotifTitle')?.value||'').trim()||'🔴 MATCH EN DIRECT';
  const message=(document.getElementById('adminNotifMessage')?.value||'').trim();
  if(!message){alert('Écris le message à envoyer.');return;}
  const {data,error}=await fyflSupabase.from('fyfl_notifications').insert({title,message,created_by:supabaseAdminUser?.email||null}).select().single();
  if(error){alert('Impossible d’envoyer la notification : '+error.message);return;}
  if(data)showGlobalNotification(data);
  await writeAdminLog('Notification globale envoyée',`${title} — ${message}`);
  document.getElementById('adminNotifMessage').value='';
}
async function syncAllRemoteData(show=true){
  if(!fyflSupabase){alert('Supabase n’est pas connecté.');return;}
  try{
    const [m,s,c,n,ss,l]=await Promise.all([
      fyflSupabase.from('fyfl_matches').select('*'),
      fyflSupabase.from('fyfl_settings').select('*').eq('id','main').maybeSingle(),
      fyflSupabase.from('fyfl_comments').select('*').order('created_at',{ascending:false}),
      fyflSupabase.from('fyfl_notifications').select('*').order('created_at',{ascending:false}).limit(20),
      fyflSupabase.from('fyfl_site_status').select('*').eq('id','main').maybeSingle(),
      fyflSupabase.from('fyfl_admin_logs').select('*').order('created_at',{ascending:false}).limit(50)
    ]);
    if(m.error)throw m.error;
    setRemoteResults(m.data||[]); fyflRemoteReady=true;
    if(!s.error&&s.data){fyflSettings={...fyflSettings,...s.data,standings:s.data.standings||{}};fyflSettingsReady=true;applyAdminPrefs();}
    if(!c.error){fyflComments=c.data||[];fyflCommentsReady=true;}
    if(!n.error)fyflNotifications=n.data||[];if(!ss.error&&ss.data){fyflSiteStatus={...fyflSiteStatus,...ss.data};fyflDatabaseStatus='OK';applyMaintenanceUI()}if(!l.error){fyflAdminLogs=l.data||[];renderAdminLogs();}
    const pg=getCurrentPage(); if(['home','matches','ranking','news','comments','admin'].includes(pg))render(pg,false);
    updateRealtimeIndicators();
    if(show)alert('Toutes les données ont été resynchronisées avec Supabase.');
  }catch(e){console.error(e);if(show)alert('Synchronisation impossible : '+(e.message||e));}
}
function initPresence(){
  if(!fyflSupabase)return;
  try{
    if(fyflPresenceChannel)fyflSupabase.removeChannel(fyflPresenceChannel);
    fyflPresenceChannel=fyflSupabase.channel('fyfl-online-users',{config:{presence:{key:fyflPresenceKey}}});
    const refresh=()=>{
      const state=fyflPresenceChannel.presenceState();
      fyflOnlineCount=Object.values(state||{}).reduce((sum,arr)=>sum+(Array.isArray(arr)?arr.length:0),0);
      updateRealtimeIndicators();
    };
    fyflPresenceChannel.on('presence',{event:'sync'},refresh).on('presence',{event:'join'},refresh).on('presence',{event:'leave'},refresh).subscribe(async status=>{
      if(status==='SUBSCRIBED'){
        fyflPresenceChannel.track({online_at:new Date().toISOString(),page:getCurrentPage()});
      }
    });
  }catch(e){console.warn('FYFL presence:',e)}
}
async function initFYFLSupabase(){
  if(fyflInitPromise)return fyflInitPromise;
  fyflInitPromise=(async()=>{
    if(!window.supabase||!FYFL_SUPABASE_URL||!FYFL_SUPABASE_KEY)return false;
    try{
      fyflSupabase=window.supabase.createClient(FYFL_SUPABASE_URL,FYFL_SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
      const {data,error}=await fyflSupabase.from('fyfl_matches').select('*');
      if(!error){
        setRemoteResults(data||[]);fyflRemoteReady=true;
        if(isCurrentAccountAdminVerified()){
          const existingKeys=new Set((data||[]).map(r=>r.match_key));
          const seed=[];
          const days=buildAllMatchDays();
          [1,2,3].forEach(day=>(days[day]||[]).forEach(m=>{const key=fyflMatchKey({...m,day});if(!existingKeys.has(key))seed.push(fyflToRow({...m,day}));}));
          if(seed.length){const {error:seedError}=await fyflSupabase.from('fyfl_matches').upsert(seed,{onConflict:'match_key'});if(seedError)console.warn('FYFL seed:',seedError.message);else {const {data:all}=await fyflSupabase.from('fyfl_matches').select('*');if(Array.isArray(all))setRemoteResults(all);}}
        }
      }else console.warn('FYFL Supabase lecture:',error.message);
      await loadOnlineSettings();
      await loadOnlineComments();
      await loadOnlineStats();
      await loadSiteStatus();
      await loadAdminLogs();
      const {data:mvps}=await fyflSupabase.from('fyfl_match_mvp').select('*');
      if(Array.isArray(mvps)){fyflMatchMVPs={};mvps.forEach(x=>{if(x.match_key)fyflMatchMVPs[x.match_key]=x;});}
      fyflRealtimeChannel=fyflSupabase.channel('fyfl-live-all')
        .on('postgres_changes',{event:'*',schema:'public',table:'fyfl_matches'},payload=>{
          if(payload.eventType==='DELETE'){const key=payload.old?.match_key;const i=results.findIndex(m=>fyflMatchKey({...m,day:m.day||findMatchDay(m)})===key);if(i>=0)results.splice(i,1);}
          else if(payload.new){const incoming=fyflFromRow(payload.new);const allowedIncoming=!!incoming;if(allowedIncoming){const i=results.findIndex(m=>fyflMatchKey({...m,day:m.day||findMatchDay(m)})===payload.new.match_key);if(i>=0)results[i]=incoming;else results.push(incoming);}}
          flashLive();
          const pg=getCurrentPage();if(document.getElementById('liveMatchModal')){refreshOpenLiveMatch(payload.eventType==='DELETE'?null:fyflFromRow(payload.new));} if(!document.getElementById('liveMatchModal')&&['home','matches','ranking','admin'].includes(pg))render(pg,false);
          if(payload.eventType==='INSERT'||payload.eventType==='UPDATE'){const newGoals=Array.isArray(payload.new?.goals)?payload.new.goals:[];const g=newGoals[newGoals.length-1];const sig=g?JSON.stringify(g):'';if(g&&sig!==window.__lastGoalSignature){window.__lastGoalSignature=sig;if(payload.new?.status==='En direct')showGoalAnimation(g.team,g.scorer,g.minute);}}
        })
        .on('postgres_changes',{event:'*',schema:'public',table:'fyfl_settings'},payload=>{
          if(payload.new){fyflSettings={...fyflSettings,breaking:payload.new.breaking||fyflSettings.breaking,player:payload.new.player||fyflSettings.player,news:payload.new.news||fyflSettings.news,standings:(payload.new.standings&&typeof payload.new.standings==='object')?payload.new.standings:(fyflSettings.standings||{})};fyflSettingsReady=true;applyAdminPrefs();flashLive();const pg=getCurrentPage();if(['home','news','ranking'].includes(pg))render(pg,false);}
        })
        .on('postgres_changes',{event:'*',schema:'public',table:'fyfl_comments'},payload=>{
          if(payload.eventType==='DELETE'){fyflComments=fyflComments.filter(c=>c.id!==payload.old?.id);}
          else if(payload.new){const i=fyflComments.findIndex(c=>c.id===payload.new.id);if(i>=0)fyflComments[i]=payload.new;else fyflComments.unshift(payload.new);}
          flashLive();if(getCurrentPage()==='comments')render('comments',false);
        })
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'fyfl_notifications'},payload=>{
          if(payload.new){fyflNotifications.unshift(payload.new);showGlobalNotification(payload.new);}
          flashLive();
        })
        .on('postgres_changes',{event:'*',schema:'public',table:'fyfl_site_status'},payload=>{if(payload.new){fyflSiteStatus={...fyflSiteStatus,...payload.new};fyflDatabaseStatus='OK';applyMaintenanceUI();updateSiteStatusIndicators();flashLive();}})
        .on('postgres_changes',{event:'INSERT',schema:'public',table:'fyfl_admin_logs'},payload=>{if(payload.new){fyflAdminLogs.unshift(payload.new);fyflAdminLogs=fyflAdminLogs.slice(0,50);renderAdminLogs();}flashLive();})
        .on('postgres_changes',{event:'*',schema:'public',table:'fyfl_stats'},payload=>{if(payload.eventType==='DELETE'){fyflStats=fyflStats.filter(x=>x.id!==payload.old?.id)}else if(payload.new){const i=fyflStats.findIndex(x=>x.id===payload.new.id);if(i>=0)fyflStats[i]=payload.new;else fyflStats.unshift(payload.new);}flashLive();const pg=getCurrentPage();if(pg==='stats'||pg==='admin')render(pg,false);})
        .on('postgres_changes',{event:'*',schema:'public',table:'fyfl_match_mvp'},payload=>{if(payload.eventType==='DELETE'){delete fyflMatchMVPs[payload.old?.match_key];}else if(payload.new?.match_key){fyflMatchMVPs[payload.new.match_key]=payload.new;}const modal=document.getElementById('liveMatchModalContent');const key=modal?.dataset.matchKey;const m=key?findMatchByKey(key):null;if(m)updateLiveMatchModal(m);if(['home','matches'].includes(getCurrentPage())&&!document.getElementById('liveMatchModal'))render(getCurrentPage(),false);flashLive();})
        .subscribe(status=>{fyflRealtimeStatus=status;updateRealtimeIndicators();if(status==='SUBSCRIBED')initPresence();});
      await loadOnlineNotifications();
      initPresence();
    }catch(e){console.warn('FYFL Supabase:',e);return false}
    return !!fyflSupabase;
  })();
  return fyflInitPromise;
}
const allTeams=Object.values(groups).flat();
const logoUrls={"ASTON VILLA":"https://assets.football-logos.cc/logos/england/1500x1500/aston-villa.5265a6b0.png","OM":"https://assets.football-logos.cc/logos/france/1500x1500/marseille.6f770410.png","BAYER LEVERKUSEN":"https://assets.football-logos.cc/logos/germany/1500x1500/bayer-leverkusen.ada32552.png","NEWCASTLE":"https://assets.football-logos.cc/logos/england/1500x1500/newcastle.c19d66db.png","BARCELONE":"https://assets.football-logos.cc/logos/spain/1500x1500/barcelona.8e8b43a3.png","BESIKTAS":"https://media.api-sports.io/football/teams/549.png","LIVERPOOL":"https://assets.football-logos.cc/logos/england/1500x1500/liverpool.d03fd250.png","REAL MADRID":"https://assets.football-logos.cc/logos/spain/1500x1500/real-madrid.e34f5ba5.png","CRYSTAL PALACE":"https://assets.football-logos.cc/logos/england/1500x1500/crystal-palace.e3552a3a.png","PSG":"https://assets.football-logos.cc/logos/france/1500x1500/paris-saint-germain.976d063a.png","ATLETICO MADRID":"https://assets.football-logos.cc/logos/spain/1500x1500/atletico-madrid.1acb70ea.png","JUVENTUS":"https://assets.football-logos.cc/logos/italy/1500x1500/juventus.309408e0.png","AS MONACO":"https://assets.football-logos.cc/logos/france/1500x1500/as-monaco.1d58091e.png","LAZIO FC":"lazio-fc.png","D2T":"d2t-logo.png","FIORENTINA":"https://assets.football-logos.cc/logos/italy/1500x1500/fiorentina.3a19a902.png","INTER MILAN":"https://assets.football-logos.cc/logos/italy/1500x1500/inter.d4ebfb95.png","RED STAR":"https://commons.wikimedia.org/wiki/Special:FilePath/Red_Star_Belgrade_crest.svg","ARSENAL":"https://assets.football-logos.cc/logos/england/1500x1500/arsenal.d4144b2a.png","AC MILAN":"https://assets.football-logos.cc/logos/italy/1500x1500/milan.6b4c62be.png","RENNES":"https://assets.football-logos.cc/logos/france/1500x1500/rennes.f07dde44.png","CHELSEA":"https://assets.football-logos.cc/logos/england/1500x1500/chelsea.450170ff.png","MANCHESTER CITY":"https://assets.football-logos.cc/logos/england/1500x1500/manchester-city.8d2b6688.png","BAYERN MUNICH":"https://assets.football-logos.cc/logos/germany/1500x1500/bayern-munchen.1eac18e8.png"};


function getRanking(){return allTeams.map(name=>{const r={name,p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};
 results.forEach(m=>{
  if(m.status!=="Terminé") return;
  if(m.home===name){r.p++;r.gf+=Number(m.hs)||0;r.ga+=Number(m.as)||0;if((Number(m.hs)||0)>(Number(m.as)||0)){r.w++;r.pts+=3}else if((Number(m.hs)||0)===(Number(m.as)||0)){r.d++;r.pts++}else r.l++}
  if(m.away===name){r.p++;r.gf+=Number(m.as)||0;r.ga+=Number(m.hs)||0;if((Number(m.as)||0)>(Number(m.hs)||0)){r.w++;r.pts+=3}else if((Number(m.as)||0)===(Number(m.hs)||0)){r.d++;r.pts++}else r.l++}
 });r.diff=r.gf-r.ga;
  const manual=fyflSettings?.standings?.[name];
  if(manual?.manual){['p','w','d','l','gf','ga','pts','diff'].forEach(k=>{if(Number.isFinite(Number(manual[k])))r[k]=Number(manual[k])});}
  return r;
});}

function initials(n){let a=n.split(" ");return (a.length>1?a[0][0]+a[1][0]:n.slice(0,3)).toUpperCase()}
function crest(n, cls="team-logo"){const u=logoUrls[n]; return u?`<img class="${cls}" src="${u}" alt="${n}" loading="lazy">`:""}
function sortedGroup(g){return getRanking().filter(t=>groups[g].includes(t.name)).sort((a,b)=>b.pts-a.pts||b.diff-a.diff||b.gf-a.gf)}
function table(data){return `<div class="card table-wrap"><table><thead><tr><th>#</th><th>Équipe</th><th>MJ</th><th>V</th><th>N</th><th>D</th><th>BP</th><th>BC</th><th>Diff</th><th>Pts</th></tr></thead><tbody>${data.map((t,i)=>`<tr><td class="pos">${i+1}</td><td class="team-cell">${crest(t.name,"table-logo")}${!logoUrls[t.name]?`<span class="mini-badge">${initials(t.name)}</span>`:""}${t.name}</td><td>${t.p}</td><td>${t.w}</td><td>${t.d}</td><td>${t.l}</td><td>${t.gf}</td><td>${t.ga}</td><td>${t.diff>0?"+":""}${t.diff}</td><td class="pts">${t.pts}</td></tr>`).join("")}</tbody></table></div>`}
function getMatchMinute(m){if(m.status!=="En direct")return Math.max(0,Number(m.minute)||0);if(m.startedAt){return Math.min(130,Math.max(0,Math.floor((Date.now()-m.startedAt)/60000)));}return Math.max(0,Number(m.minute)||0)}
function liveMatchKey(m){return fyflMatchKey({...m,day:m.day||findMatchDay(m)})}
function findMatchByKey(key){return results.find(m=>liveMatchKey(m)===key)||null}
function openLiveMatch(encodedKey){const key=decodeURIComponent(encodedKey);const m=findMatchByKey(key);if(!m||!['En direct','Terminé'].includes(m.status))return;let old=document.getElementById('liveMatchModal');if(old)old.remove();const el=document.createElement('div');el.id='liveMatchModal';el.className='live-match-modal';el.onclick=e=>{if(e.target===el)closeLiveMatch()};el.innerHTML=`<div class="live-match-panel"><div class="live-match-top"><h2>${m.status==='En direct'?'🔴 Match en direct':'✅ Match terminé'}</h2><button class="live-close" onclick="closeLiveMatch()">×</button></div><div id="liveMatchModalContent"></div></div>`;document.body.appendChild(el);updateLiveMatchModal(m)}
function closeLiveMatch(){document.getElementById('liveMatchModal')?.remove()}
function updateLiveMatchModal(m){const el=document.getElementById('liveMatchModalContent');if(!el||!m)return;const goals=(m.goals||[]).slice().sort((a,b)=>(Number(a.minute)||0)-(Number(b.minute)||0));const key=liveMatchKey(m);el.dataset.matchKey=key;const live=m.status==='En direct';const mvp=fyflMatchMVPs[key];const mvpHtml=!live&&mvp?`<div class="mvp-card"><div class="mvp-title">🏆 HOMME DU MATCH</div><div class="mvp-name">${escapeHtml(mvp.player_name)}</div><div class="mvp-stats">${Number(mvp.goals)||0} but${(Number(mvp.goals)||0)>1?'s':''}${Number(mvp.assists)||0?` · ${Number(mvp.assists)} passe${Number(mvp.assists)>1?'s':''}`:''} · ${Number(mvp.rating)||0} pts</div></div>`:'';el.innerHTML=`<div class="live-scoreboard"><div class="live-team">${crest(m.home,'team-logo')}<div>${escapeHtml(m.home)}</div></div><div><div class="live-score">${Number(m.hs)||0} — ${Number(m.as)||0}</div><span class="live-clock">${live?'🔴 '+getMatchMinute(m)+"'":'✅ Terminé'}</span></div><div class="live-team">${crest(m.away,'team-logo')}<div>${escapeHtml(m.away)}</div></div></div>${mvpHtml}<div class="live-events"><h3>⚽ Buteurs</h3>${goals.length?goals.map(g=>`<div class="live-goal"><span class="live-goal-minute">${escapeHtml(g.minute)}'</span><span class="live-goal-team">${escapeHtml(g.team)}</span><span class="live-goal-scorer">${escapeHtml(g.scorer||'Buteur')}</span></div>`).join(''):'<div class="live-empty">Aucun but enregistré.</div>'}</div>`}
function refreshOpenLiveMatch(m){const modal=document.getElementById('liveMatchModal');if(!modal)return;if(!m){closeLiveMatch();return}if(document.getElementById('liveMatchModalContent')?.dataset.matchKey===liveMatchKey(m))updateLiveMatchModal(m)}
function matchCard(m){const live=m.status==='En direct';const upcoming=m.status==='À venir';const finished=m.status==='Terminé';const statusHtml=live?`<span class="live-pill"><span class="live-dot"></span> En direct</span>`:(upcoming?`<span style="color:#ffb16f;font-weight:900">À venir</span>`:`<span style="color:#7ee787;font-weight:900">Terminé</span>`);const score=upcoming?'VS':`${m.hs} — ${m.as}`;const minute=live?`<span class="live-minute">🔴 ${getMatchMinute(m)}'</span>`:(finished?`<span style="opacity:.65">${m.minute||90}'</span>`:'');const clickable=live||finished;const key=encodeURIComponent(fyflMatchKey({...m,day:m.day||findMatchDay(m)}));return `<div class="card match-card ${live?'live-match':''} ${clickable?'clickable-match':''}" ${clickable?`onclick="openLiveMatch('${key}')"`:''}><div class="date">${statusHtml} · Journée ${m.day} · Poule ${m.group} ${minute}</div><div class="match"><div class="team">${crest(m.home,'team-logo')}<div>${m.home}</div></div><div class="score">${score}</div><div class="team">${crest(m.away,'team-logo')}<div>${m.away}</div></div></div>${live?`<div class="live-ticker">⏱️ MATCH EN DIRECT · ${getMatchMinute(m)} minutes</div><div class="live-click-hint">👆 Cliquer pour voir les buteurs et les minutes</div>`:finished?`<div class="live-click-hint">👆 Cliquer pour voir les buteurs et les minutes</div>`:''}</div>`}
function groupBlock(g){const arr=groups[g];const pairs=[[[arr[0],arr[1]],1],[[arr[2],arr[3]],1],[[arr[0],arr[2]],2],[[arr[1],arr[3]],2],[[arr[0],arr[3]],3],[[arr[1],arr[2]],3]];const upcoming=pairs.filter(([[h,a]])=>!results.some(x=>x.status==="Terminé"&&((x.home===h&&x.away===a)||(x.home===a&&x.away===h))));return `<div class="group-title"><span>POULE ${g}</span><span class="group-count">4 équipes</span></div>${table(sortedGroup(g))}<div class="group-fixtures-title">⚽ Matchs à venir · Poule ${g}</div><div class="fixtures">${upcoming.length?upcoming.map(([[h,a],day])=>`<div class="fixture"><span><small style="opacity:.65">J${day}</small> ${crest(h,"mini-logo")}${h}</span><b>VS</b><span>${crest(a,"mini-logo")}${a}</span><em>À venir</em></div>`).join(""):`<div class="fixture"><span>Tous les matchs de la poule sont joués</span></div>`}</div>`}
function getSession(){return localStorage.getItem("fyfl_session")||""}
function setSession(name){if(name)localStorage.setItem("fyfl_session",name);else localStorage.removeItem("fyfl_session");updateAuthUI()}
function updateAuthUI(){const el=document.getElementById("authActions");if(!el)return;const user=getSession();const admin=isCurrentAccountAdminVerified();el.innerHTML=user?`<span class="auth-user">${escapeHtml(user)}</span><button class="admin-btn" type="button" onclick="openAdmin()">Admin${admin?" ✓":""}</button><button type="button" onclick="logout()">Déconnexion</button>`:`<button class="admin-btn" type="button" onclick="openAdmin()">Admin${admin?" ✓":""}</button><button type="button" onclick="openAuth('login')">Se connecter</button><button class="primary" type="button" onclick="openAuth('register')">S'inscrire</button>`}
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[c]))}
function openAuth(mode="login"){const register=mode==="register";const wrap=document.createElement("div");wrap.className="modal-backdrop";wrap.id="authModal";wrap.innerHTML=`<div class="modal"><h2>${register?"Créer un compte":"Se connecter"}</h2><p>${register?"Choisis un pseudo unique et un mot de passe.":"Entre les identifiants de ton compte FYFL."}</p><input id="authPseudo" maxlength="20" placeholder="Pseudo" autocomplete="username"><input id="authPassword" type="password" maxlength="60" placeholder="Mot de passe" autocomplete="${register?"new-password":"current-password"}"><div class="auth-error" id="authError"></div><div class="modal-actions"><button onclick="closeAuth()">Annuler</button><button class="primary" onclick="submitAuth('${register?"register":"login"}')">${register?"S'inscrire":"Se connecter"}</button></div></div>`;document.body.appendChild(wrap);wrap.addEventListener("click",e=>{if(e.target===wrap)closeAuth()});setTimeout(()=>document.getElementById("authPseudo")?.focus(),50)}
function closeAuth(){document.getElementById("authModal")?.remove()}
async function submitAuth(mode){const pseudo=(document.getElementById("authPseudo")?.value||"").trim();const password=document.getElementById("authPassword")?.value||"";const err=document.getElementById("authError");if(!/^[A-Za-z0-9_À-ÿ -]{3,20}$/.test(pseudo)){err.textContent="Pseudo : 3 à 20 caractères.";return}if(password.length<4){err.textContent="Mot de passe : 4 caractères minimum.";return}if(!fyflSupabase){err.textContent="Connexion au serveur impossible. Réessaie dans quelques secondes.";return}err.textContent="Connexion...";try{const fn=mode==="register"?'fyfl_register_account':'fyfl_login_account';const {data,error}=await fyflSupabase.rpc(fn,{p_pseudo:pseudo,p_password:password});if(error)throw error;const row=Array.isArray(data)?data[0]:data;if(!row?.pseudo)throw new Error(mode==="register"?"Impossible de créer le compte.":"Pseudo ou mot de passe incorrect.");setSession(row.pseudo);closeAuth();render(getCurrentPage());if(mode==="register")alert("Compte créé ! Tu es maintenant connecté.")}catch(e){console.error('FYFL account:',e);err.textContent=String(e.message||'Erreur de connexion').replace(/^.*?\:\s*/,'')||'Impossible de se connecter.'}}
async function logout(){setSession("");render(getCurrentPage())}
function getCurrentPage(){const active=document.querySelector("nav button.active");return active?.dataset.page||"home"}
function getComments(){return Array.isArray(fyflComments)?fyflComments:[]}
async function publishComment(){const user=getSession();if(!user){openAuth("login");return}const box=document.getElementById("commentText");const text=(box?.value||"").trim();if(!text){alert("Écris un commentaire avant de publier.");return}if(!fyflSupabase){alert("Le service en ligne n'est pas disponible.");return}const {data,error}=await fyflSupabase.from('fyfl_comments').insert({pseudo:user,text}).select().single();if(error){alert('Impossible de publier le commentaire : '+error.message);return}fyflComments=[data,...fyflComments.filter(c=>c.id!==data.id)];render("comments",false)}
function pageComments(){const user=getSession(),comments=getComments();return `<section class="section"><div class="section-head"><h2>💬 Commentaires</h2><small>${comments.length} commentaire${comments.length>1?"s":""} · EN DIRECT</small></div><div class="comments-wrap">${user?`<div class="comment-box"><h3 style="margin-top:0">Publier un commentaire</h3><textarea id="commentText" rows="4" maxlength="500" placeholder="Écris ton commentaire..."></textarea><div class="logged-note">Connecté en tant que <strong>${escapeHtml(user)}</strong></div><button class="results-head-actions" style="margin-top:10px;background:#ff8a22;color:#111;border:0;border-radius:10px;padding:11px 15px;font-weight:900;cursor:pointer" onclick="publishComment()">Publier en direct</button></div>`:`<div class="comment-box"><h3 style="margin-top:0">Connecte-toi pour commenter</h3><p>Tu dois avoir un compte FYFL connecté pour publier un commentaire.</p><button style="background:#ff8a22;color:#111;border:0;border-radius:10px;padding:11px 15px;font-weight:900;cursor:pointer" onclick="openAuth('login')">Se connecter</button><button style="margin-left:8px;background:#1a212d;color:#fff;border:1px solid #303846;border-radius:10px;padding:11px 15px;font-weight:900;cursor:pointer" onclick="openAuth('register')">S'inscrire</button></div>`}${comments.length?comments.map(c=>`<article class="comment-item fyfl-animate-item"><div class="comment-meta"><span class="comment-author">👤 ${escapeHtml(c.pseudo)}</span><span class="comment-date">${escapeHtml(new Date(c.created_at||Date.now()).toLocaleString('fr-FR'))}</span></div><div class="comment-text">${escapeHtml(c.text)}</div></article>`).join(""):`<div class="comment-empty">Aucun commentaire pour le moment. Sois le premier !</div>`}</div></section>`}

const ADMIN_EMAIL="enzoadressepro888@gmail.com";
let adminUnlocked=false;
let supabaseAdminUser=null;
async function refreshAdminSession(){
  try{
    if(!fyflSupabase) await initFYFLSupabase();
    if(!fyflSupabase)return false;
    const {data,error}=await fyflSupabase.auth.getSession();
    if(error)throw error;
    const user=data?.session?.user||null;
    supabaseAdminUser=user;
    adminUnlocked=!!user && String(user.email||'').toLowerCase()===ADMIN_EMAIL.toLowerCase();
    return adminUnlocked;
  }catch(e){
    console.warn('FYFL admin session:',e);
    supabaseAdminUser=null;
    adminUnlocked=false;
    return false;
  }
}
function isCurrentAccountAdminVerified(){return !!adminUnlocked && !!supabaseAdminUser && String(supabaseAdminUser.email||'').toLowerCase()===ADMIN_EMAIL.toLowerCase()}
async function openAdmin(){
  try{
    await initFYFLSupabase();
    if(await refreshAdminSession()){
      render('admin');
      return;
    }
    await openAdminLogin();
  }catch(e){
    console.error('FYFL admin:',e);
    alert('Impossible d’ouvrir l’administration. Recharge la page avec Ctrl+F5 puis réessaie.');
  }
}
async function openAdminLogin(){
  await initFYFLSupabase();
  if(await refreshAdminSession()){render('admin');return}
  if(!fyflSupabase){alert('Supabase n’est pas configuré.');return}
  const wrap=document.createElement('div');wrap.className='modal-backdrop';wrap.id='adminLoginModal';
  wrap.innerHTML=`<div class="modal"><h2>🔐 Administration FYFL</h2><p>Connecte-toi avec le compte administrateur <strong>${ADMIN_EMAIL}</strong>.</p><input id="adminEmail" type="email" value="${ADMIN_EMAIL}" autocomplete="username"><input id="adminPassword" type="password" placeholder="Mot de passe Supabase" autocomplete="current-password"><div class="auth-error" id="adminError"></div><div class="modal-actions"><button onclick="document.getElementById('adminLoginModal')?.remove()">Annuler</button><button class="primary" onclick="checkSupabaseAdmin()">Accéder</button></div><p class="admin-help">🔒 Une fois connecté, Supabase conserve ta session. Tu n’auras normalement plus besoin de remettre le mot de passe sur ce navigateur.</p></div>`;
  document.body.appendChild(wrap);setTimeout(()=>document.getElementById('adminPassword')?.focus(),50);
}
async function ensureRemoteFixtureSeed(){
  if(!fyflSupabase||!fyflRemoteReady||!isCurrentAccountAdminVerified())return false;
  const {data,error}=await fyflSupabase.from('fyfl_matches').select('*');
  if(error){console.warn('FYFL seed read:',error.message);return false;}
  const existingKeys=new Set((data||[]).map(r=>r.match_key));
  const seed=[];
  const days=buildAllMatchDays();
  [1,2,3].forEach(day=>(days[day]||[]).forEach(m=>{
    const row=fyflToRow({...m,day});
    if(!existingKeys.has(row.match_key))seed.push(row);
  }));
  if(seed.length){
    const {error:upError}=await fyflSupabase.from('fyfl_matches').upsert(seed,{onConflict:'match_key'});
    if(upError){window.__fyflLastMatchSyncError=upError.message||String(upError);console.warn('FYFL seed upsert:',upError.message);return false;}
  }
  const {data:all}=await fyflSupabase.from('fyfl_matches').select('*');
  if(Array.isArray(all))setRemoteResults(all);
  return true;
}
async function checkSupabaseAdmin(){
  const email=(document.getElementById('adminEmail')?.value||'').trim().toLowerCase();
  const password=document.getElementById('adminPassword')?.value||'';
  const err=document.getElementById('adminError');
  if(email!==ADMIN_EMAIL.toLowerCase()){err.textContent='Ce compte n’est pas autorisé à accéder à l’administration.';return}
  if(!password){err.textContent='Mot de passe requis.';return}
  const {data,error}=await fyflSupabase.auth.signInWithPassword({email,password});
  if(error){err.textContent=error.message;return}
  if(String(data?.user?.email||'').toLowerCase()!==ADMIN_EMAIL.toLowerCase()){
    await fyflSupabase.auth.signOut();err.textContent='Compte non autorisé.';return;
  }
  supabaseAdminUser=data.user;adminUnlocked=true;document.getElementById('adminLoginModal')?.remove();await ensureRemoteFixtureSeed();render('admin');
}
function getAdminPrefs(){return {...fyflSettings}}
function saveAdminPrefs(p){fyflSettings={...fyflSettings,...p};applyAdminPrefs()}
function applyAdminPrefs(){const b=document.getElementById('breakingNewsText');if(b)b.textContent=fyflSettings.breaking||'REJOIGNEZ LE DISCORD POUR TOUTE LES INFO !'}
function allMatchesFlat(){const days=buildAllMatchDays();return [1,2,3].flatMap(day=>days[day]||[])}
function adminMatchOptions(){return allMatchesFlat().map((m,i)=>`<option value="${i}">J${m.day} · Poule ${m.group} · ${m.home} — ${m.away}</option>`).join('')}
function selectedAdminMatch(){const i=Number(document.getElementById('adminMatchSelect')?.value||0);return allMatchesFlat()[i]}
function adminLoadMatch(){const m=selectedAdminMatch();if(!m)return;document.getElementById('adminHomeScore').value=m.hs??0;document.getElementById('adminAwayScore').value=m.as??0;document.getElementById('adminMinute').value=m.minute??0;document.getElementById('adminScorer').value='';document.getElementById('adminGoalMinute').value=m.minute??0;document.getElementById('adminGoalTeam').value=m.home;const feed=document.getElementById('adminGoals');feed.innerHTML=(m.goals||[]).length?(m.goals||[]).map((g,i)=>`<div class="goal-line">⚽ ${escapeHtml(g.team)} · ${escapeHtml(g.scorer)} · ${escapeHtml(g.minute)}' <button onclick="adminDeleteGoal(${i})">×</button></div>`).join(''):'Aucun but enregistré.'}
async function persistMatchFromAdmin(status){
  const m=selectedAdminMatch();
  if(!m)return;
  if(!fyflSupabase || !fyflRemoteReady || !isCurrentAccountAdminVerified()){alert('Administration Supabase non connectée. Recharge la page puis reconnecte-toi.');return;}
  let existing=results.find(r=>fyflMatchKey({...r,day:r.day||findMatchDay(r)})===fyflMatchKey({...m,day:m.day||findMatchDay(m)}));
  if(!existing){existing={group:m.group,day:m.day,home:m.home,away:m.away,hs:0,as:0,status:'À venir',minute:0,goals:[]};results.push(existing);}
  existing.group=m.group; existing.day=Number(m.day||findMatchDay(m));
  existing.hs=Number(document.getElementById('adminHomeScore').value||0);
  existing.as=Number(document.getElementById('adminAwayScore').value||0);
  existing.minute=Math.max(0,Number(document.getElementById('adminMinute').value||0));
  existing.status=status; existing.goals=Array.isArray(existing.goals)?existing.goals:[];
  if(status==='En direct') existing.startedAt=Date.now()-existing.minute*60000;
  else if(status==='Terminé'){existing.minute=90;delete existing.startedAt;}
  const ok=await saveSingleRemoteMatch(existing);
  if(!ok){alert('Impossible de synchroniser ce match avec Supabase : '+(window.__fyflLastMatchSyncError||'erreur inconnue')+'\n\nVérifie les règles UPDATE/INSERT de fyfl_matches.');return;}
  flashLive(); render('admin'); await writeAdminLog(status==='En direct'?'Match mis en direct':'Match terminé',`${existing.home} ${existing.hs} — ${existing.as} ${existing.away}`); if(status==='En direct')startLiveTicker();
}
async function adminSetStatus(status){await persistMatchFromAdmin(status)}
async function adminAddGoal(){
  const m=selectedAdminMatch(); if(!m)return;
  if(!fyflSupabase || !fyflRemoteReady || !isCurrentAccountAdminVerified()){alert('Administration Supabase non connectée.');return;}
  let existing=results.find(r=>fyflMatchKey({...r,day:r.day||findMatchDay(r)})===fyflMatchKey({...m,day:m.day||findMatchDay(m)}));
  if(!existing){existing={group:m.group,day:m.day,home:m.home,away:m.away,hs:0,as:0,status:'En direct',minute:0,goals:[]};results.push(existing);}
  existing.goals=Array.isArray(existing.goals)?existing.goals:[];
  const team=document.getElementById('adminGoalTeam').value;
  const scorer=(document.getElementById('adminScorer').value||'').trim()||'Buteur';
  const minute=Math.max(0,Number(document.getElementById('adminGoalMinute').value||existing.minute||0));
  existing.goals.push({team,scorer,minute});
  if(team===existing.home)existing.hs=(Number(existing.hs)||0)+1;else existing.as=(Number(existing.as)||0)+1;
  if(existing.status!=='Terminé'){ existing.status='En direct'; existing.minute=Math.max(Number(existing.minute)||0,minute); existing.startedAt=Date.now()-existing.minute*60000; } else { existing.status='Terminé'; existing.minute=Math.max(90,Number(existing.minute)||0); delete existing.startedAt; }
  const ok=await saveSingleRemoteMatch(existing);
  if(!ok){existing.goals.pop();if(team===existing.home)existing.hs=Math.max(0,(Number(existing.hs)||0)-1);else existing.as=Math.max(0,(Number(existing.as)||0)-1);alert("Le but n'a pas pu être synchronisé avec Supabase : "+(window.__fyflLastMatchSyncError||'erreur inconnue')+"\n\nVérifie les règles UPDATE de fyfl_matches.");return;}
  render('admin');await writeAdminLog('But ajouté',`${team} · ${scorer} · ${minute}'`);showGoalAnimation(team,scorer,minute);flashLive();
}
async function adminDeleteGoal(i){
  const m=selectedAdminMatch();if(!m)return;
  const existing=results.find(r=>fyflMatchKey({...r,day:r.day||findMatchDay(r)})===fyflMatchKey({...m,day:m.day||findMatchDay(m)}));
  if(!existing||!existing.goals)return;
  const g=existing.goals[i];if(!g)return;
  const oldGoals=[...existing.goals]; const oldHs=existing.hs, oldAs=existing.as;
  if(g.team===existing.home)existing.hs=Math.max(0,(Number(existing.hs)||0)-1);else existing.as=Math.max(0,(Number(existing.as)||0)-1);
  existing.goals.splice(i,1);
  const ok=await saveSingleRemoteMatch(existing);
  if(!ok){existing.goals=oldGoals;existing.hs=oldHs;existing.as=oldAs;alert('Impossible de synchroniser la suppression du but.');return;}
  await writeAdminLog('But supprimé',`${g.team} · ${g.scorer||'Buteur'} · ${g.minute}'`);render('admin');flashLive();
}
async function adminFinish(){await persistMatchFromAdmin('Terminé')}
async function adminResetMatch(){const m=selectedAdminMatch();if(!m)return;const target={...m,day:m.day||findMatchDay(m)};if(!fyflSupabase||!fyflRemoteReady||!isCurrentAccountAdminVerified()){alert('Admin Supabase non connecté.');return}const deleted=await deleteRemoteMatch(target);if(!deleted){alert('Supabase a refusé la suppression. Vérifie la règle DELETE de fyfl_matches.');return}const i=results.findIndex(r=>fyflMatchKey({...r,day:r.day||findMatchDay(r)})===fyflMatchKey(target));if(i>=0)results.splice(i,1);await writeAdminLog('Match supprimé / remis à zéro',`${target.home} — ${target.away}`);flashLive();render('admin');broadcastLive()}
function adminStandingTeamOptions(group){const arr=groups[group]||[];return arr.map(t=>`<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
function adminLoadStanding(){const group=document.getElementById('adminStandingGroup')?.value||Object.keys(groups)[0];const teamSel=document.getElementById('adminStandingTeam');if(!teamSel)return;const current=teamSel.value;teamSel.innerHTML=adminStandingTeamOptions(group);if((groups[group]||[]).includes(current))teamSel.value=current;adminLoadStandingFields();}
function adminLoadStandingFields(){const team=document.getElementById('adminStandingTeam')?.value;if(!team)return;const r=getRanking().find(x=>x.name===team)||{p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0,diff:0};['p','w','d','l','gf','ga','pts','diff'].forEach(k=>{const el=document.getElementById('adminStand_'+k);if(el)el.value=r[k]??0;});}
async function adminSaveStanding(){if(!fyflSupabase||!fyflRemoteReady||!isCurrentAccountAdminVerified()){alert('Administration Supabase non connectée.');return}const team=document.getElementById('adminStandingTeam')?.value;if(!team)return;const standings={...(fyflSettings.standings||{})};const row={manual:true};['p','w','d','l','gf','ga','pts','diff'].forEach(k=>{const v=Number(document.getElementById('adminStand_'+k)?.value||0);row[k]=Number.isFinite(v)?Math.max(0,v):0;});standings[team]=row;const ok=await saveOnlineSettings({...fyflSettings,standings});if(!ok){alert('Impossible de synchroniser le classement avec Supabase.');return}render('admin',false);await writeAdminLog('Classement modifié',`${team} · Poule ${document.getElementById('adminStandingGroup')?.value||''}`);flashLive();alert('Classement de la poule modifié et synchronisé en direct pour tout le monde !');}
async function adminResetStanding(){if(!fyflSupabase||!isCurrentAccountAdminVerified()){alert('Administration Supabase non connectée.');return}const team=document.getElementById('adminStandingTeam')?.value;if(!team)return;const standings={...(fyflSettings.standings||{})};delete standings[team];const ok=await saveOnlineSettings({...fyflSettings,standings});if(!ok){alert('Impossible de réinitialiser le classement.');return}render('admin',false);await writeAdminLog('Classement remis au calcul automatique',team);flashLive();alert('Classement de cette équipe remis au calcul automatique des matchs.');}
async function adminSaveText(){const p=getAdminPrefs();p.breaking=(document.getElementById('adminBreaking').value||'').trim()||'REJOIGNEZ LE DISCORD POUR TOUTE LES INFO !';p.player=(document.getElementById('adminPlayer').value||'').trim()||'À déterminer';p.news=(document.getElementById('adminNews').value||'').trim()||'Les matchs FYFL se joueront les mercredis et les week-ends !';const ok=await saveOnlineSettings(p);if(!ok){alert('Impossible de synchroniser les modifications avec Supabase.');return}await writeAdminLog('Paramètres du site modifiés','Breaking News / joueur du mois / message FYFL');alert('Modifications enregistrées et visibles en direct pour tout le monde !')}
function pageAdmin(){if(!isCurrentAccountAdminVerified())return `<section class="section"><div class="card"><h2>🔐 Accès administrateur</h2><p>Connecte-toi avec ton compte administrateur Supabase.</p><button class="admin-btn" onclick="openAdminLogin()">Ouvrir l’administration</button></div></section>`;const p=getAdminPrefs();return `<section class="section admin-panel"><div class="section-head"><h2>⚙️ Panneau administrateur FYFL</h2><small>Contrôle en direct</small></div><div class="admin-box"><h3>🛠️ Outils administrateur</h3><div class="admin-tools-grid"><div class="admin-tool-card"><b>🔄 Synchroniser toutes les données</b><button onclick="syncAllRemoteData(true)">Synchroniser maintenant</button></div><div class="admin-tool-card"><b>🟢 Supabase Realtime</b><div id="adminRealtimeStatus"><span class="status-dot offline"></span>Vérification...</div></div><div class="admin-tool-card"><b>👥 Personnes connectées</b><div><strong id="adminOnlineCount">${fyflOnlineCount}</strong> personne(s) en ligne</div></div></div><div class="site-status-grid"><div class="site-status-card"><b>🌐 Site</b><div class="site-ok">🟢 Site opérationnel</div></div><div class="site-status-card"><b>🗄️ Base de données</b><div id="adminDatabaseStatus"><span class="status-dot offline"></span>Vérification...</div></div><div class="site-status-card"><b>⚡ Realtime</b><div id="adminRealtimeStatus2"><span class="status-dot offline"></span>Vérification...</div></div><div class="site-status-card"><b>🔧 Maintenance</b><div id="adminMaintenanceStatus">${fyflSiteStatus.maintenance?'🔴 Maintenance active':'🟢 Site opérationnel'}</div></div></div><p class="admin-help">Tous les indicateurs et le nombre de connexions sont synchronisés avec Supabase en temps réel.</p></div><div class="admin-box"><h3>🔧 Mode maintenance</h3><div class="maintenance-toggle"><div><b>État actuel</b><div>${fyflSiteStatus.maintenance?'🔴 Maintenance active':'🟢 Site opérationnel'}</div></div><button class="${fyflSiteStatus.maintenance?'reset':'live'}" onclick="setMaintenance(${!fyflSiteStatus.maintenance})">${fyflSiteStatus.maintenance?'🟢 Désactiver la maintenance':'🔴 Activer la maintenance'}</button></div><label>Message affiché aux visiteurs</label><textarea id="adminMaintenanceMessage" rows="3">${escapeHtml(fyflSiteStatus.message||'🔧 FYFL est actuellement en maintenance.\n\nLe site revient bientôt.')}</textarea><button onclick="saveMaintenanceMessage()">💾 Enregistrer le message</button><p class="admin-help">Le changement est immédiat pour tous les visiteurs connectés, sans actualisation.</p></div><div class="admin-box"><h3>📜 Journal administrateur</h3><div id="adminLogFilters"></div><div id="adminLogList" class="admin-log-list">Chargement...</div><p class="admin-help">Les actions des administrateurs sont enregistrées dans Supabase et apparaissent en direct.</p></div><div class="admin-box"><h3>🔔 Notifications globales</h3><label>Titre</label><input id="adminNotifTitle" value="🔴 MATCH EN DIRECT" maxlength="80"><label>Message</label><textarea id="adminNotifMessage" rows="3" maxlength="500" placeholder="PSG 2 — 1 Rennes"></textarea><div class="admin-actions"><button class="live" onclick="sendGlobalNotification()">📡 Envoyer à tout le monde en direct</button></div><p class="admin-help">Tous les visiteurs connectés reçoivent la notification instantanément, sans actualiser la page.</p></div><div class="admin-box"><h3>📊 STATS</h3><p class="admin-help">Ajoute un joueur au classement des buteurs ou passeurs. La modification est enregistrée dans Supabase et diffusée en direct.</p><select id="adminStatCategory"><option value="buteur">Buteur</option><option value="passeur">Passeur</option></select><input id="adminStatPlayer" maxlength=60 placeholder="Nom du joueur"><input id="adminStatCount" type="number" min="0" placeholder="Nombre de buts / passes"><input id="adminStatClub" maxlength="60" placeholder="Club"><button onclick="adminAddStat()">Ajouter à STATS</button><div class="stats-list admin-stats-list">${fyflStats.map(x=>`<div class="stats-row"><b class="stats-rank">${x.category==='buteur'?'⚽':'🎯'}</b>${statsLogo(x.club)}<div class="stats-player"><strong>${escapeHtml(x.player_name)}</strong><small>${escapeHtml(x.club)} · ${x.category}</small></div><b class="stats-count">${Number(x.stat_count)||0}</b><button onclick="adminDeleteStat('${x.id}')">×</button></div>`).join('')||'<div class="live-empty">Aucune statistique.</div>'}</div></div><div class="admin-grid"><div class="admin-box"><h3>⚽ Match en direct</h3><select id="adminMatchSelect" onchange="adminLoadMatch()">${adminMatchOptions()}</select><div class="admin-stat"><span>Score</span><input id="adminHomeScore" type="number" min="0" style="width:80px"><b>—</b><input id="adminAwayScore" type="number" min="0" style="width:80px"></div><label>Minute du match</label><input id="adminMinute" type="number" min="0" max="130" placeholder="0"><div class="admin-actions"><button class="live" onclick="adminSetStatus('En direct')">🔴 Lancer / mettre à jour en direct</button><button class="done" onclick="adminFinish()">✅ Terminer le match</button><button class="reset" onclick="adminResetMatch()">🧹 Match jamais commencé</button></div><h4>⚽ Ajouter un but</h4><select id="adminGoalTeam"><option></option></select><input id="adminScorer" maxlength="40" placeholder="Nom du buteur"><input id="adminGoalMinute" type="number" min="0" max="130" placeholder="Minute du but"><button onclick="adminAddGoal()">⚽ Ajouter le but + animation</button><div id="adminGoals"></div><p class="admin-help">Les scores, minutes et buteurs sont sauvegardés dans Supabase et diffusés en direct à tous les visiteurs.</p></div><div class="admin-box"><h3>📢 Site & annonces</h3><label>Breaking News</label><input id="adminBreaking" value="${escapeHtml(p.breaking||'REJOIGNEZ LE DISCORD POUR TOUTE LES INFO !')}"><label>Joueur du mois</label><input id="adminPlayer" value="${escapeHtml(p.player||'À déterminer')}"><label>Message FYFL</label><textarea id="adminNews" rows="5">${escapeHtml(p.news||'Les matchs FYFL se joueront les mercredis et les week-ends !')}</textarea><button onclick="adminSaveText()">💾 Enregistrer les modifications</button><p class="admin-help">Les changements sont sauvegardés dans Supabase et envoyés en direct.</p></div><div class="admin-box"><h3>🏆 Modifier le classement des poules</h3><label>Poule</label><select id="adminStandingGroup" onchange="adminLoadStanding()">${Object.keys(groups).map(g=>`<option value="${g}">Poule ${g}</option>`).join('')}</select><label>Équipe</label><select id="adminStandingTeam" onchange="adminLoadStandingFields()"></select><div class="admin-grid" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:8px"><label>MJ<input id="adminStand_p" type="number" min="0"></label><label>V<input id="adminStand_w" type="number" min="0"></label><label>N<input id="adminStand_d" type="number" min="0"></label><label>D<input id="adminStand_l" type="number" min="0"></label><label>BP<input id="adminStand_gf" type="number" min="0"></label><label>BC<input id="adminStand_ga" type="number" min="0"></label><label>Diff<input id="adminStand_diff" type="number"></label><label>Pts<input id="adminStand_pts" type="number" min="0"></label></div><div class="admin-actions"><button class="live" onclick="adminSaveStanding()">💾 Enregistrer le classement</button><button class="reset" onclick="adminResetStanding()">↩️ Revenir au calcul automatique</button></div></div></div></section>`}
function syncAdminGoalTeam(){const m=selectedAdminMatch();const sel=document.getElementById('adminGoalTeam');if(!m||!sel)return;sel.innerHTML=`<option>${escapeHtml(m.home)}</option><option>${escapeHtml(m.away)}</option>`;adminLoadMatch()}
function showGoalAnimation(team,scorer,minute){const pop=document.createElement('div');pop.className='goal-pop';pop.innerHTML=`<div class="goal-box"><div class="big">⚽</div><h2>BUUUUUT !</h2><p>${escapeHtml(team)} · ${escapeHtml(scorer)} · ${minute}'</p></div>`;document.body.appendChild(pop);for(let i=0;i<45;i++){const c=document.createElement('i');c.className='confetti';c.style.left=Math.random()*100+'vw';c.style.animationDelay=Math.random()*.25+'s';c.style.transform=`rotate(${Math.random()*360}deg)`;document.body.appendChild(c);setTimeout(()=>c.remove(),1800)}setTimeout(()=>pop.remove(),950)}
function broadcastLive(){flashLive()}
function startLiveTicker(){/* Désactivé : aucune actualisation automatique de l'interface admin. */ return;}
function pageHome(){return `<section class="hero"><div><div class="eyebrow">SAISON 1 · COMPÉTITION OFFICIELLE</div><h1>FRENCH YOUTH<br><span>FUT LEAGUE</span></h1><p>Bienvenue sur la plateforme officielle de la <b>FYFL</b>. Suivez les poules et tous les résultats.</p><div class="hero-actions"><button class="secondary" onclick="render('matches')">Voir les résultats</button><button class="secondary" onclick="render('ranking')">Voir le classement</button></div></div><img class="hero-logo" src="fyfl-logo.png"></section>
<section class="section"><div class="section-head"><h2>⚡ Infos rapides</h2><small>FYFL Saison 1</small></div><div class="feature-grid">
<div class="feature-card fyfl-credit-card"><h3>Website Created By Tutzou</h3><p style="margin:6px 0 0">Tutzou is the FYFL owner with Bs Pomier</p></div>
<div class="feature-card"><div class="mini-label">🏅 JOUEUR DU MOIS</div><div class="player-month"><div class="player-avatar">🏆</div><div><h3 style="margin:8px 0 0">${escapeHtml(getAdminPrefs().player||"À déterminer")}</h3><p style="margin:6px 0 0">Le joueur du mois sera defini en fonction des performmence en match</p></div></div></div>
<div class="feature-card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px"><div class="mini-label">⚽ STATUT DES MATCHS</div><button class="results-head-actions" style="font-size:11px;padding:7px 9px;background:#151b25;color:#fff;border:1px solid #303846;border-radius:9px;font-weight:800;cursor:pointer" onclick="render('matches')">Voir tous les matchs →</button></div><div style="margin-top:12px;max-height:320px;overflow:auto;padding-right:4px">${getUpcomingMatches().map(x=>`<div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:7px;padding:9px 5px;border-bottom:1px solid #202834"><div style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:800">${crest(x.h,"mini-logo")}${x.h}</div><div style="text-align:center;font-size:11px;font-weight:900;color:#ff8a22">VS<br><small style="color:#7e8a9d">J${x.day} · P. ${x.g}</small></div><div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;font-size:11px;font-weight:800">${x.a}${crest(x.a,"mini-logo")}</div></div>`).join("")}</div><p style="margin:10px 0 0;text-align:center">${getUpcomingMatches().length} matchs à venir · Toutes les poules</p></div>
</div></section>
<section class="section"><div class="section-head"><h2>Derniers résultats</h2><div class="results-head-actions"><small>${results.filter(m=>m.status==='Terminé').length} match${results.filter(m=>m.status==='Terminé').length>1?'s':''} terminé${results.filter(m=>m.status==='Terminé').length>1?'s':''}</small><button onclick="render('matches')">Voir tous les résultats →</button></div></div><div class="grid">${results.filter(m=>m.status==='Terminé').sort((a,b)=>(Number(b.updatedAt||0)-Number(a.updatedAt||0))).map(matchCard).join("")||'<div class="card"><p>Aucun match terminé pour le moment.</p></div>'}</div></section>`}
function pageRanking(){return `<section class="section"><div class="section-head"><h2>Classement FYFL</h2><small>Victoire = 3 pts · Nul = 1 pt</small></div><div class="tabs" id="tabs">${Object.keys(groups).map((g,i)=>`<button class="${i===0?"active":""}" onclick="showGroup('${g}')">Poule ${g}</button>`).join("")}</div><div id="group-content">${groupBlock("A")}</div></section>`}
function showGroup(g){document.querySelectorAll("#tabs button").forEach(b=>b.classList.toggle("active",b.textContent==="Poule "+g));document.getElementById("group-content").innerHTML=groupBlock(g)}
function getUpcomingMatches(){
  const upcoming=[];
  const days=buildAllMatchDays();
  [1,2,3].forEach(day=>(days[day]||[]).forEach(m=>{if(m.status==='À venir')upcoming.push({g:m.group,h:m.home,a:m.away,day})}));
  return upcoming;
} 
function buildAllMatchDays(){const days={1:[],2:[],3:[]};Object.entries(groups).forEach(([g,arr])=>{const pairs={1:[[arr[0],arr[1]],[arr[2],arr[3]]],2:[[arr[0],arr[2]],[arr[1],arr[3]]],3:[[arr[0],arr[3]],[arr[1],arr[2]]]};Object.entries(pairs).forEach(([day,ps])=>ps.forEach(([home,away])=>{const found=results.find(r=>(r.home===home&&r.away===away)||(r.home===away&&r.away===home));days[day].push(found?{...found,group:g,day:Number(day)}:{group:g,day:Number(day),home,away,hs:null,as:null,status:"À venir"});}));});return days}
function pageMatches(){const days=buildAllMatchDays();const card=m=>matchCard(m);return `<section class="section"><div class="section-head"><h2>Matchs / Résultats</h2><small>3 journées · 6 poules</small></div><div class="tabs" id="matchTabs"><button class="active" onclick="showMatchDay('day1')">Journée 1</button><button onclick="showMatchDay('day2')">Journée 2</button><button onclick="showMatchDay('day3')">Journée 3</button><button onclick="showMatchDay('allDays')">Toutes les journées</button></div><div id="match-content"><h3 class="subheading">Journée 1 · Tous les matchs</h3><div class="grid">${days[1].map(card).join("")}</div></div></section>`}
function showMatchDay(mode){const modes=['day1','day2','day3','allDays'];document.querySelectorAll("#matchTabs button").forEach((b,i)=>b.classList.toggle("active",modes[i]===mode));const days=buildAllMatchDays();const el=document.getElementById("match-content");if(!el)return;if(mode==='allDays'){el.innerHTML=[1,2,3].map(day=>`<h3 class="subheading">Journée ${day} · Tous les matchs</h3><div class="grid">${days[day].map(matchCard).join("")}</div>`).join("");return}const day=Number(mode.replace('day',''));el.innerHTML=`<h3 class="subheading">Journée ${day} · Tous les matchs</h3><div class="grid">${days[day].map(matchCard).join("")}</div>`}
function pageTeams(){return `<section class="section"><div class="section-head"><h2>Les équipes</h2><small>24 équipes réparties en 6 poules</small></div><div class="teams">${Object.entries(groups).flatMap(([g,arr])=>arr.map(t=>`<div class="card team-card">${crest(t,"team-logo large")}<h3>${t}</h3><p>Poule ${g}</p></div>`)).join("")}</div></section>`}
function pageCompetitions(){return `<section class="section"><div class="section-head"><h2>🏆 Compétitions</h2><small>Toutes les compétitions de la FYFL</small></div><div class="fyfl-comp-grid"><div class="fyfl-comp-card"><div><div class="comp-name">🏆 FYFL — Saison 1</div><p>Compétition officielle avec les 24 équipes réparties en 6 poules.</p></div><span class="coming">En cours</span></div><div class="fyfl-comp-card"><div><div class="comp-name">⚽ Matchs</div><p>Résultats et prochaines rencontres de la compétition.</p></div><button onclick="render('matches')">Voir les matchs</button></div><div class="fyfl-comp-card"><div><div class="comp-name">🏆 Ligue des Champions</div><p>La compétition européenne de la FYFL.</p></div><span class="coming">À venir</span></div><div class="fyfl-comp-card"><div><div class="comp-name">🌟 Europa League</div><p>La deuxième compétition européenne.</p></div><span class="coming">À venir</span></div><div class="fyfl-comp-card"><div><div class="comp-name">🥉 Conference League</div><p>La troisième compétition européenne.</p></div><span class="coming">À venir</span></div></div></section>`}
function pageNews(){const p=getAdminPrefs();return `<section class="section"><div class="section-head"><h2>📰 FYFL - NEWS</h2><small>Actualités officielles</small></div><div class="card news-card"><div style="display:inline-block;background:#e21d48;color:#fff;font-weight:800;padding:6px 10px;border-radius:8px;font-size:12px">FYFL - NEWS</div><h2 style="margin:14px 0 8px">FYFL NEW !</h2><p style="line-height:1.7;color:var(--muted)">${escapeHtml(p.news||'Les matchs FYFL se joueront les mercredis et les week-ends !')}</p><p style="font-weight:800">Message de Tutzou</p></div></section>`}
function render(page="home",scroll=true){const app=document.getElementById("app");app.innerHTML=page==="home"?pageHome():page==="ranking"?pageRanking():page==="stats"?pageStats():page==="matches"?pageMatches():page==="teams"?pageTeams():page==="competitions"?pageCompetitions():page==="comments"?pageComments():page==="admin"?pageAdmin():pageNews();app.classList.remove("fyfl-render-tick");void app.offsetWidth;app.classList.add("fyfl-render-tick");app.querySelectorAll(".card,.feature-card,.fyfl-comp-card,.team-card,.fixture,.comment-item,.section-head,.tabs,.group-links").forEach((el,i)=>{el.classList.add("fyfl-animate-item");el.style.animationDelay=Math.min(i*35,420)+"ms"});document.querySelectorAll("nav button").forEach(b=>b.classList.toggle("active",b.dataset.page===page));updateAuthUI();applyMaintenanceUI();if(page==="admin"){setTimeout(()=>{syncAdminGoalTeam();adminLoadStanding()},0)}if(scroll)window.scrollTo({top:0,behavior:"smooth"})}
document.querySelectorAll("nav button").forEach(b=>b.addEventListener("click",()=>{render(b.dataset.page);try{if(fyflPresenceChannel)fyflPresenceChannel.track({online_at:new Date().toISOString(),page:b.dataset.page})}catch(e){}}));
render();applyAdminPrefs();
(async()=>{await initFYFLSupabase();await refreshAdminSession();await ensureRemoteFixtureSeed();updateAuthUI();applyAdminPrefs();if(getCurrentPage()==="comments")render("comments",false);})();
function detectDevice(){const mobile=/Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent)||window.innerWidth<=700;document.body.classList.toggle("device-mobile",mobile);document.body.classList.toggle("device-desktop",!mobile);document.body.dataset.device=mobile?"mobile":"desktop"}
window.addEventListener("resize",detectDevice);detectDevice();
setTimeout(()=>{if(fyflSupabase)fyflSupabase.auth.onAuthStateChange((_event,session)=>{supabaseAdminUser=session?.user||null;adminUnlocked=!!supabaseAdminUser&&String(supabaseAdminUser.email||"").toLowerCase()===ADMIN_EMAIL.toLowerCase();updateAuthUI();applyMaintenanceUI();/* Ne jamais rerendre le panneau admin automatiquement. */});},0);
// Extras Halloween, alerte et compte à rebours.
function toggleHalloween(){document.body.classList.toggle('halloween-theme');const b=document.getElementById('halloweenToggle');const on=document.body.classList.contains('halloween-theme');b.textContent=on?'🎃 Halloween ON':'🌙 Halloween OFF';b.classList.toggle('off',!on);if(!on){document.querySelectorAll('.halloween-fall').forEach(e=>e.remove())}}
function spawnPumpkin(){const p=document.createElement('div');p.className='halloween-fall';p.textContent=['🎃','🦇','🍬','🕸️'][Math.floor(Math.random()*4)];p.style.left=(Math.random()*96)+'vw';p.style.fontSize=(18+Math.random()*18)+'px';p.style.animationDuration=(5+Math.random()*6)+'s';document.body.appendChild(p);setTimeout(()=>p.remove(),12000)}
setInterval(()=>{if(document.body.classList.contains('halloween-theme'))spawnPumpkin()},1800);setTimeout(()=>{if(document.body.classList.contains('halloween-theme'))spawnPumpkin()},200);
function nextWednesday(){const d=new Date();const day=d.getDay();let add=(3-day+7)%7;if(add===0 && d.getHours()>=18)add=7;const n=new Date(d);n.setDate(d.getDate()+add);n.setHours(18,0,0,0);return n}
function updateCountdown(){}
setInterval(updateCountdown,1000);updateCountdown();
window.openAdmin=openAdmin;window.openAdminLogin=openAdminLogin;window.toggleSpookySound=toggleSpookySound;

// Halloween intro + musique Spooky Scary Skeletons.
const halloweenOverlay = document.getElementById("halloweenOverlay");
const halloweenContinue = document.getElementById("halloweenContinue");

let spookyAudio = document.getElementById("spookyPlayer");
if(!spookyAudio){
  spookyAudio = document.createElement("audio");
  spookyAudio.id = "spookyPlayer";
  spookyAudio.src = "halloween-ambient.wav";
  spookyAudio.preload = "auto";
  spookyAudio.loop = true;
  spookyAudio.volume = 0.18;
  spookyAudio.setAttribute("playsinline", "");
  spookyAudio.style.cssText = "position:fixed;width:1px;height:1px;left:-10px;bottom:-10px;opacity:0;pointer-events:none";
  document.body.appendChild(spookyAudio);
}else{
  spookyAudio.src = "halloween-ambient.wav";
  spookyAudio.loop = true;
  spookyAudio.volume = 0.18;
}

// Tentative de lecture immédiate à l'ouverture.
spookyAudio.play().catch(() => {
  // Les navigateurs peuvent bloquer l'autoplay avec du son avant une interaction.
});

function updateSpookyToggle(){const b=document.getElementById("spookyToggle");if(!b)return;const paused=spookyAudio.paused;b.textContent=paused?"🔇":"🔊";b.classList.toggle("muted",paused);b.title=paused?"Activer Spooky Scary Skeletons":"Arrêter Spooky Scary Skeletons";b.setAttribute("aria-label",paused?"Activer le son Spooky Scary Skeletons":"Arrêter le son Spooky Scary Skeletons")}
function toggleSpookySound(){if(spookyAudio.paused){spookyAudio.play().catch(()=>{})}else{spookyAudio.pause()}updateSpookyToggle()}
spookyAudio.addEventListener("volumechange",updateSpookyToggle);
spookyAudio.addEventListener("play",updateSpookyToggle);
spookyAudio.addEventListener("pause",updateSpookyToggle);
updateSpookyToggle();

halloweenContinue.addEventListener("click", () => {
  spookyAudio.volume = 0.18;
  spookyAudio.currentTime = 0;
  spookyAudio.play().catch(() => {});
  document.body.classList.add("halloween-theme");
  if(window.closeHalloweenIntro) window.closeHalloweenIntro();
});


window.addEventListener("error",function(e){
  const overlay=document.getElementById("halloweenOverlay");
  if(overlay){overlay.style.display="none";overlay.style.pointerEvents="none";}
});
window.addEventListener("unhandledrejection",function(){
  const overlay=document.getElementById("halloweenOverlay");
  if(overlay){overlay.style.display="none";overlay.style.pointerEvents="none";}
});
