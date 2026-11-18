'use strict';
(() => {
const $=id=>document.getElementById(id);
// One card is "1 card", not "1 cards". The manager counts things out loud
// in a dozen places and every one of them read like a machine.
const count=(n,one,many)=>n+' '+(n===1?one:(many||one+'s'));
let listingOffers=[],listingOffersLoaded=false,claimDeliveries=[],saleRunning=false,claimOffers=[],claimResult=null, claimTestRoutes=[], limitedSeller=false, token='', tab='drafts', drafts=[], stock=[], claims=[], claimRoute=null, claimsLoaded=false, claimPicked=new Set(), claimOrders=[], claimCheckout=null, selected=new Set(), dirty=new Set(), busy=false, bot='';
let inboxUnread=0,holdWaiting=0;
let batches=[],collections=[],template={},templateDirty=false,entryRate=0,expenses=[],trades=[];
// The combined inventory is held apart from `stock` on purpose. `stock` is
// this account's own and every edit path writes to it; these rows belong to
// other sellers and are only ever read, so mixing them would put another
// seller's card one careless click from an edit this view cannot make.
let centralRows=[],centralSellers=[],centralTotals=null,centralOwner='all',centralLoaded=false;
// Keep editing and image decoding bounded as the pending list grows. Selection lives in the model, not the current page.
let inventoryPage=0;const inventoryPageSize=20;
let lotEntries=[],lotSearchTimer,lotSearchAbort,lotSearchSeq=0;
const batchFor=r=>batches.find(b=>b.items.some(i=>i.stockId===r.stockId));
const photos=new Map(),photoLoads=new Map(),photoSizes=new Map();
let photoBytes=0,activePhotos=0;const photoWaiters=[];
function cachePhoto(id,blob){
 if(photos.has(id)){URL.revokeObjectURL(photos.get(id));photoBytes-=photoSizes.get(id)||0;photos.delete(id);}
 photos.set(id,URL.createObjectURL(blob));photoSizes.set(id,blob.size);photoBytes+=blob.size;
 while(photos.size>80||photoBytes>32*1024*1024){const oldest=photos.keys().next().value;URL.revokeObjectURL(photos.get(oldest));photoBytes-=photoSizes.get(oldest)||0;photos.delete(oldest);photoSizes.delete(oldest);}
}
async function photoSlot(fn){
 if(activePhotos>=3)await new Promise(resolve=>photoWaiters.push(resolve));else activePhotos++;
 try{return await fn();}finally{const next=photoWaiters.shift();if(next)next();else activePhotos--;}
}
const photoObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){photoObserver.unobserve(entry.target);thumb(entry.target.dataset.photo,entry.target);}}, {rootMargin:'250px'});
const photoLabel=i=>i===0?'Front':i===1?'Back':i<6?'Front corner '+(i-1):'Back corner '+(i-5);
const key=r=>r.stockId?'stock:'+r.stockId:r.id;
// The filter box is a search, not one long substring. Typing "shiny 6" used to
// find nothing at all, because no card is named with "shiny 6" in it: the words
// are separated by the rest of the set name. Each word now stands on its own,
// and a number matches the number printed on the card however either one is
// padded, so 6 finds 06. A number still falls back to a substring, so half a
// number typed on the way to the whole one keeps narrowing the list.
const unpad=s=>s.replace(/^0+(?=[0-9])/,'');
const filterMatch=(haystack,query)=>{
 const terms=query.toLowerCase().split(/\s+/).filter(Boolean);
 if(!terms.length)return true;
 const text=haystack.toLowerCase();
 const numbers=new Set((text.match(/[0-9]+/g)||[]).map(unpad));
 return terms.every(term=>/^[0-9]+$/.test(term)?(numbers.has(unpad(term))||text.includes(term)):text.includes(term));
};
const rowText=r=>r.name+' '+(r.costBatchLabel||'')+' '+(r.included||'')+' '+(r.notes||'')+(r.reservedName||'')+' '+r.cardId+' '+(r.stockId||'');
let buybackSelection=0;
const shown=()=> (tab==='giveaway'||tab==='carousell'||tab==='central'||tab==='claims'||tab==='queue'||tab==='buybacks'||tab==='inbox'||tab==='cardshow')?[]:(tab==='drafts'?drafts:stock.filter(r=>tab==='sold'?r.sold:!r.sold)).filter(r=>!buybackSelection||r.costBatchId===buybackSelection).filter(r=>filterMatch(rowText(r),$('filter').value)).filter(r=>tab!=='stock'||!$('unassigned').checked||!batchFor(r));
const money=c=>(Number(c||0)/100).toFixed(2);
const newID=()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join('');
function status(text,error=false){$('status').textContent=text;$('status').style.background=error?'#8b3535':'#253d2c';}
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function lock(value){busy=value;document.querySelectorAll('#workspace button,#workspace input,#workspace select,#workspace textarea').forEach(n=>n.disabled=value||n.dataset.fixed==='true');}
async function api(path,body={},blob=false,signal){
 const multipart=body instanceof FormData,requestToken=token,timeout=AbortSignal.timeout(multipart?45000:30000),combined=signal?AbortSignal.any([signal,timeout]):timeout;
 try{
 const response=await fetch(window.CARD_API_BASE+path,{method:'POST',headers:{...(multipart?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},body:multipart?body:JSON.stringify(body),cache:'no-store',signal:combined});
 if(path!=='login'&&path!=='manager-login'&&requestToken!==token)throw Error('Session changed. Please sign in again.');
 if(!response.ok){const result=await response.json().catch(()=>({error:'Request failed ('+response.status+')'}));if(response.status===401&&path!=='login'&&path!=='manager-login')signOut(false);throw Error(result.error);}
 const result=await (blob?response.blob():response.json());
 if(path!=='login'&&path!=='manager-login'&&requestToken!==token)throw Error('Session changed. Please sign in again.');
 return result;
 }catch(e){if(timeout.aborted)throw Error('Request timed out. Reload inventory before retrying changes.');throw e;}
}

function signOut(clear=true){clearPosterImage();$('claimPosterDialog').close();posterRows=[];queuePicked.clear();keepSession(null);$('moveBuybackDialog').close();$('moveBuybackCount').textContent='';$('moveBuybackName').value='';$('moveBuybackTarget').replaceChildren();moveBuybackRows=[];moveBuybackPreview=null;$('moveBuybackPreview').replaceChildren();$('moveBuybackError').textContent='';buybackSelection=0;buybackLots=[];$('buybackReports').replaceChildren();$('buybackFilter').value='';clearLedger();clearGiveaway();token='';inventoryPage=0;const md=document.getElementById('marketplaceDialog');if(md){md.close();md.replaceChildren();}$('quickEntry').close();clearQuickPhotos();entryRate=0;quickCard=null;expenses=[];trades=[];$('expenses').replaceChildren();$('trades').replaceChildren();['tradeDialog','expenseDialog','saleEntry'].forEach(id=>$(id).close());template={};templateDirty=false;batches=[];collections=[];claims=[];claimRoute=null;claimTestRoutes=[];claimsLoaded=false;claimPicked.clear();claimOrders=[];claimOffers=[];listingOffers=[];listingOffersLoaded=false;$('listingOffers').replaceChildren();claimDeliveries=[];claimResult=null;$('claimResult').hidden=true;$('claimResult').replaceChildren();saleRunning=false;claimCheckout=null;for(const u of proofURLs.values())URL.revokeObjectURL(u);proofURLs.clear();checkoutQr='';showCheckoutQr(null);$('claimReady').replaceChildren();$('claimOrders').replaceChildren();['checkoutMailFee','checkoutPayNow','checkoutPickup','checkoutPickupArea','checkoutPayMinutes','checkoutPushBatch','checkoutPushSeconds','checkoutFreeMailFrom'].forEach(id=>$(id).value='');$('claimFilter').value='all';claimTab='cards';$('claimBulkBar').hidden=true;$('claimSales').replaceChildren();lotEntries=[];$('lotEntries').replaceChildren();$('lotSearch').value='';$('lotResults').replaceChildren();++lotSearchSeq;clearTimeout(lotSearchTimer);lotSearchAbort?.abort();$('lotTotal').value='';$('lotLabel').value='';$('lots').replaceChildren();$('lotSummary').textContent='';$('lotPanel').open=false;$('batches').replaceChildren();$('collections').replaceChildren();['templateIntro','templateItem','templateOutro'].forEach(id=>$(id).value='');clearNormalResults();searchCache.clear();photoLoads.clear();drafts=[];stock=[];selected.clear();dirty.clear();centralRows=[];centralSellers=[];centralTotals=null;centralLoaded=false;centralOwner='all';$('centralRows').replaceChildren();$('centralSeller').replaceChildren();delete $('centralSeller').dataset.owners;$('centralFilter').value='';for(const url of photos.values())URL.revokeObjectURL(url);photos.clear();photoSizes.clear();photoBytes=0;photoObserver.disconnect();referenceLoads.clear();$('rows').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;$('password').value='';if(clear)status('Signed out.');}
async function task(fn){if(busy)return;lock(true);try{clearTimeout(saveTimer);await saveFlight.catch(()=>{});await fn();}catch(e){status(e.message,true);}finally{lock(false);scheduleSave();if(!$('workspace').hidden)render();}}
async function load(preserve=false,initialData){
 const pending=preserve?[...drafts,...stock].filter(r=>dirty.has(key(r))):[];
 const data=initialData||await api('data');limitedSeller=!!data.limitedSeller;$('automationSettings').hidden=false;document.querySelector('[data-tab=expenses]').hidden=limitedSeller;document.querySelector('[data-tab=ledger]').hidden=limitedSeller;document.querySelector('[data-tab=giveaway]').hidden=limitedSeller;document.querySelector('[data-tab=carousell]').hidden=limitedSeller;document.querySelector('[data-tab=central]').hidden=limitedSeller;document.querySelector('[data-tab=claims]').hidden=false;$('claimRouteSettings').hidden=false;$('saveEntryRate').hidden=limitedSeller;$('entryRate').readOnly=limitedSeller;if(limitedSeller&&['carousell','central','claims','expenses','ledger','giveaway'].includes(tab))tab='drafts';
 // A seller must not keep another seller's rows in memory across a sign-out
 // and a sign-in as someone else in the same browser tab.
 if(limitedSeller){clearLedger();clearGiveaway();centralRows=[];centralSellers=[];centralTotals=null;centralLoaded=false;centralOwner='all';}drafts=data.drafts||[];stock=(data.stock||[]).map(r=>({...r,sale:r.sold?r.sale:r.price}));bot=data.bot||bot;inboxUnread=data.inboxUnread||0;holdWaiting=data.cardshowWaiting||0;entryRate=data.jpyPerSgd||0;$('entryRate').value=entryRate||'';batches=data.carousell?.batches||[];collections=data.carousell?.collections||[];if(!templateDirty){template=data.carousell?.template||{};$('templateIntro').value=template.intro||'';$('templateItem').value=template.item||'';$('templateOutro').value=template.outro||'';}selected.clear();dirty.clear();
 expenses=data.expenses||[];trades=data.trades||[];renderAccounting();
 const t=data.totals,house=t.House||{},shared=t.Shared||{};$('totals').replaceChildren();
 // The stock figures span every seller. Expenses are the house ledger and
 // have no owner column, so the house is the only basis a net profit can
 // honestly be struck on: charging them against a margin that includes
 // other sellers' sales would overstate what it costs them to trade here.
 for(const [label,value] of [['Inventory cost',t.InventoryCost],['Sales',t.Revenue],['Gross margin',t.Revenue-t.SoldCost-(t.ConsignmentPayout||0)],['Stock cost basis',t.Spent],['House net profit',(house.Revenue||0)-(house.SoldCost||0)-(house.ConsignmentPayout||0)-(t.Expenses||0)],['Expenses (house)',t.Expenses||0],...(shared.Units?[['Shared stock cost',shared.InventoryCost||0],['Shared gross margin',(shared.Revenue||0)-(shared.SoldCost||0)-(shared.ConsignmentPayout||0)]]:[])]){
  const card=el('div',undefined,'stat');card.append(el('span',label),el('strong','$'+money(value)));$('totals').append(card);
 }
 // The tabs under these figures are not the same shop. Another seller's
 // stock and a claim sale's cards are counted here and listed nowhere
 // below; a rehearsal is listed below and counted in neither. Saying so
 // is what lets a walk be checked against every total being back where
 // it started -- without it, an afternoon goes into a 7.19 nobody moved.
 const listed=stock.filter(r=>!r.test).length,rehearsals=stock.length-listed,elsewhere=Math.max(0,(t.Units||0)-listed);
 $('totalsScope').textContent=[limitedSeller?'These figures are your own stock, rehearsals left out.'
  :'These figures are the whole shop: '+count(t.Units||0,'card')+' across every seller and sale mode, rehearsals left out.',
  limitedSeller||!elsewhere?'':elsewhere+' of them '+(elsewhere===1?'is':'are')+' not in the tabs below.',
  rehearsals?count(rehearsals,'rehearsal')+' listed below '+(rehearsals===1?'is':'are')+' in neither.':''].filter(Boolean).join(' ');
 pending.forEach(r=>{const target=r.stockId?stock:drafts;const index=target.findIndex(x=>key(x)===key(r));if(index<0)target.push(r);else target[index]=r;dirty.add(key(r));});
 render();
}
let ledgerData=null,ledgerLimit=30,ledgerRetry=null,ledgerAsked=false;
function clearLedger(){ledgerData=null;ledgerRetry=null;ledgerAsked=false;ledgerLimit=30;$('ledgerBalances').replaceChildren();$('ledgerHistory').replaceChildren();$('ledgerSettlement').replaceChildren();$('ledgerForm').reset();$('ledgerFilter').value='';$('ledgerMore').hidden=true;}
function renderLedger(){
 if(!ledgerData)return;
 const {members,balances,entries}=ledgerData;$('ledgerBalances').replaceChildren();
 balances.forEach((b,i)=>{const card=el('div',undefined,'stat');card.append(el('strong',members[i]),el('p','Paid for shop: SGD '+money(b.paid)),el('p','One-third share: SGD '+money(b.share)),el('p','Repaid: SGD '+money(b.sent)+' · Received: SGD '+money(b.received)),el('strong','Net contributed: SGD '+money(b.net)),el('p',b.balance>0?'Owed back: SGD '+money(b.balance):b.balance<0?'Still owes: SGD '+money(-b.balance):'Settled'));$('ledgerBalances').append(card);});
 $('ledgerSettlement').replaceChildren(el('h3','To settle current balances'));
 const owing=balances.map(b=>Math.max(0,-b.balance)),owed=balances.map(b=>Math.max(0,b.balance));let transfers=0;
 for(let from=0;from<3;from++)for(let to=0;to<3;to++){const amount=Math.min(owing[from],owed[to]);if(amount){$('ledgerSettlement').append(el('p',members[from]+' → '+members[to]+': SGD '+money(amount)));owing[from]-=amount;owed[to]-=amount;transfers++;}}
 if(!transfers)$('ledgerSettlement').append(el('p','Everyone is settled.'));
 const query=$('ledgerFilter').value.toLowerCase(),matching=entries.filter(e=>(e.description+' '+e.date+' '+members[e.payer]+' '+(e.kind==='repayment'?members[e.recipient]:'')).toLowerCase().includes(query));
 $('ledgerHistory').replaceChildren();
 for(const e of matching.slice(0,ledgerLimit)){
  const row=el('div',undefined,'ledgerEntry');row.append(el('strong','#'+e.id+' · '+e.date+' · '+members[e.payer]+(e.kind==='repayment'?' → '+members[e.recipient]:' paid for shop')+' · SGD '+money(e.amount)),el('p',e.description));
  if(e.kind==='payment'&&e.splitMask&&e.splitMask!==7)row.append(el('small','Split with '+members.filter((_,i)=>e.splitMask&(1<<i)).join(', ')));
  if(e.voided)row.append(el('span','Voided — excluded from balances'));else {const button=el('button','Void entry');button.type='button';button.onclick=()=>task(async()=>{if(!await confirmAction('Void ledger entry?','This removes SGD '+money(e.amount)+' from the balances and keeps the original in history.',[]))return;ledgerData=await api('ledger',{action:'void',id:e.id});renderLedger();});row.append(button);}
  $('ledgerHistory').append(row);
 }
 if(!matching.length)$('ledgerHistory').append(el('p','No ledger entries yet.'));
 $('ledgerMore').hidden=matching.length<=ledgerLimit;
}
async function loadLedger(){ledgerData=await api('ledger',{action:'list'});renderLedger();if(!$('ledgerDate').value)$('ledgerDate').value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
$('ledgerRefresh').onclick=()=>task(loadLedger);
// render runs on every keystroke, so the flag -- not the absence of data --
// is what stops a slow first load being asked for again and again.
// Giveaway tab: the owner and staff run the giveaway here instead of through
// the bot's /giveaway commands. Customers still enter by opening the shop.
let giveawayData=null,giveawayAsked=false,giveawayPoll=0;
const sgtDate=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));
function giveawayWhen(iso){return new Intl.DateTimeFormat('en-SG',{timeZone:'Asia/Singapore',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'}).format(new Date(iso));}
function giveawayLeft(iso){const ms=new Date(iso)-Date.now();if(ms<=0)return '';const m=Math.ceil(ms/60000),d=Math.floor(m/1440),h=Math.floor(m%1440/60);return d?d+'d '+h+'h':h?h+'h '+m%60+'m':m+'m';}
function clearGiveaway(){giveawayData=null;giveawayAsked=false;clearTimeout(giveawayPoll);$('giveawayEntries').replaceChildren();$('giveawayCounts').replaceChildren();$('giveawayForm').reset();$('giveawayRefs').value='';$('giveawayTabState').hidden=true;}
async function loadGiveaway(body={action:'status'}){giveawayData=await api('giveaway',body);renderGiveaway();if(giveawayData.message)status(giveawayData.message);watchGiveaway();}
// While invitations go out, keep the counts moving without locking the page.
function watchGiveaway(){clearTimeout(giveawayPoll);if(!giveawayData?.notifying||!token)return;giveawayPoll=setTimeout(async()=>{if(tab!=='giveaway'||busy){watchGiveaway();return;}try{giveawayData=await api('giveaway',{action:'status'});renderGiveaway();}catch(e){}watchGiveaway();},5000);}
function openGiveawayTab(){if(giveawayData||giveawayAsked||busy||limitedSeller)return;giveawayAsked=true;task(()=>loadGiveaway());}
function giveawayStat(label,value,sub){const card=el('div',undefined,'stat');card.append(el('span',label),el('strong',String(value)));if(sub)card.append(el('p',sub,'hint'));return card;}
function renderGiveaway(){
 const d=giveawayData;if(!d)return;const g=d.giveaway,live=!!g&&(g.status==='open'||g.status==='ended');
 $('giveawayNone').hidden=!!g;$('giveawayCard').hidden=!g;$('giveawayForm').hidden=live;
 if(!$('giveawayNewEnds').value)$('giveawayNewEnds').value=sgtDate(Date.now()+7*864e5)+'T21:00';
 $('giveawayTabState').hidden=!g||g.status==='drawn';$('giveawayTabState').textContent=g?.status==='open'?'open':'to draw';
 if(!g){$('giveawayEntries').replaceChildren();$('giveawayEntryCount').textContent='';return;}
 $('giveawayTitle').textContent=(g.test?'[test] ':'')+g.title;
 $('giveawayStatus').textContent={open:'Taking entries',ended:'Deadline passed',closed:'Closed · ready to draw',drawn:'Winners drawn'}[g.status]||g.status;
 $('giveawayStatus').className='claimStatus'+(g.status==='open'?' open':'')+(g.test?' test':'');
 const left=giveawayLeft(g.endsAt);
 $('giveawayMeta').textContent=(g.status==='open'?'Entries close '+giveawayWhen(g.endsAt)+' · '+left+' left':'Entry deadline '+giveawayWhen(g.endsAt))+' · '+(g.everyone?'Open to everyone who opens the shop':'Past customers only')+(g.noDm?' · No DMs to customers':'')+(g.test?' · Test: only staff see it':'');
 $('giveawayDetails').textContent=g.details||'';$('giveawayDetails').hidden=!g.details;
 const c=d.counts||{};
 $('giveawayCounts').replaceChildren(giveawayStat('Customers',c.Customers??0,'bought from the shop'),giveawayStat('Messaged',c.Invited??0,(c.InviteFailed?c.InviteFailed+' could not be reached':'delivered')),giveawayStat('Opened the shop',c.Opened??0,(c.CustomersOpened??0)+' customers · '+(c.InvitedOpened??0)+' after a message'),giveawayStat('Entered',c.Entries??0,(c.NonCustomerViews?c.NonCustomerViews+' looked but are not customers':'')));
 $('giveawayNotify').hidden=g.status!=='open'||!!g.noDm;$('giveawayNotifyHint').hidden=g.status!=='open'||!!g.noDm;$('giveawayNoDmHint').hidden=g.status!=='open'||!g.noDm;$('giveawayNotify').disabled=!!d.notifying;$('giveawayNotify').textContent=d.notifying?'Sending messages…':'Message customers';
 $('giveawayClose').hidden=!live;$('giveawayDraw').hidden=g.status==='drawn';$('giveawayWinners').parentElement.hidden=g.status==='drawn';
 $('giveawayLink').href=d.link;$('giveawayLink').textContent=d.link;
 const entries=d.entryList||[];$('giveawayEntryCount').textContent=g.entries+(entries.length<g.entries?' · newest '+entries.length+' shown':'');
 $('giveawayEntries').replaceChildren(...(entries.length?entries.map(e=>{const row=el('div',undefined,'giveawayEntry'+(e.won?' won':''));const who=el('span');const name=(e.won?'🏆 ':'')+(e.name||'Telegram user');if(e.username){const a=el('a',name+' (@'+e.username+')');a.href='https://t.me/'+e.username;a.target='_blank';a.rel='noopener';who.append(a);}else who.append(el('span',name+' (ID '+e.user+')'));row.append(who,el('span',(e.customer?'Customer':'Not a customer')+' · '+giveawayWhen(e.at),'hint'));return row;}):[el('p','Nobody has entered yet. Customers are entered when they open the shop.','hint')]));
}
$('giveawayRefresh').onclick=()=>task(()=>loadGiveaway());
$('giveawayForm').onsubmit=e=>{e.preventDefault();task(async()=>{const title=$('giveawayNewTitle').value.trim(),ends=$('giveawayNewEnds').value;if(!title||!ends)throw Error('Enter the prize and the entry deadline.');const test=$('giveawayNewTest').checked,noDm=$('giveawayNewNoDm').checked;if(!await confirmAction('Start '+(test?'a test ':'')+'giveaway?',title+'\nEntries close '+giveawayWhen(ends+':00+08:00')+' (Singapore time).\n'+($('giveawayNewEveryone').checked?'Anyone who opens the shop is entered.':'Past customers are entered when they open the shop.')+(noDm?'\nNo Telegram messages go out to customers.':'')+(test?'\nOnly staff will see it.':''),[]))return;await loadGiveaway({action:'start',title,details:$('giveawayNewDetails').value.trim(),ends,everyone:$('giveawayNewEveryone').checked,test,noDm});$('giveawayForm').reset();});};
$('giveawayNotify').onclick=()=>task(async()=>{const g=giveawayData?.giveaway;if(!g)return;if(!await confirmAction('Message customers?',g.test?'Test giveaway: only staff counted as customers are messaged. Count yourself under "Count someone who bought outside the bot" first.':'Every past customer who has not entered or been messaged yet gets a Telegram message with a button into the shop. Each customer is messaged once per giveaway.',[]))return;await loadGiveaway({action:'notify'});});
$('giveawayClose').onclick=()=>task(async()=>{const g=giveawayData?.giveaway;if(!g)return;if(!await confirmAction('Close entries now?','Nobody else can enter '+g.title+'. It has '+g.entries+' entries. This cannot be reopened.',[]))return;await loadGiveaway({action:'close'});});
$('giveawayDraw').onclick=()=>task(async()=>{const g=giveawayData?.giveaway;if(!g)return;const winners=Number($('giveawayWinners').value);if(!Number.isInteger(winners)||winners<1||winners>20)throw Error('Draw between 1 and 20 winners.');if(!await confirmAction('Draw '+winners+' '+(winners===1?'winner':'winners')+'?',(g.status==='open'||g.status==='ended'?'This closes entries first. ':'')+'Winners are picked at random from '+g.entries+' entries and see it in the shop. This cannot be undone.',[]))return;await loadGiveaway({action:'draw',winners});});
$('giveawayAdd').onclick=()=>task(async()=>{const refs=$('giveawayRefs').value.trim();if(!refs)throw Error('Enter an @handle or Telegram ID.');await loadGiveaway({action:'add',refs});$('giveawayRefs').value='';});
function openLedgerTab(){if(ledgerData||ledgerAsked||busy||limitedSeller)return;ledgerAsked=true;task(loadLedger);}
$('ledgerKind').onchange=()=>{$('ledgerRecipientLabel').hidden=$('ledgerKind').value!=='repayment';};
$('ledgerFilter').oninput=()=>{ledgerLimit=30;renderLedger();};
$('ledgerMore').onclick=()=>{ledgerLimit+=30;renderLedger();};
$('ledgerForm').onsubmit=e=>{e.preventDefault();task(async()=>{
 const value=$('ledgerAmount').value.trim();if(!/^\d+(\.\d{1,2})?$/.test(value))throw Error('Enter a positive SGD amount with at most two decimal places.');
 const amount=Math.round(Number(value)*100);if(!Number.isSafeInteger(amount)||amount<=0||amount>1000000000)throw Error('Amount must be between SGD 0.01 and 10,000,000.00.');
 const entry={kind:$('ledgerKind').value,payer:Number($('ledgerPayer').value),recipient:$('ledgerKind').value==='repayment'?Number($('ledgerRecipient').value):0,amount,date:$('ledgerDate').value,description:$('ledgerDescription').value.trim()};
 if(!entry.description||!entry.date)throw Error('Enter a date and description.');if(entry.kind==='repayment'&&entry.payer===entry.recipient)throw Error('Choose two different partners for a repayment.');
 const payload=JSON.stringify(entry);if(!ledgerRetry||ledgerRetry.payload!==payload)ledgerRetry={payload,key:crypto.randomUUID()};
 ledgerData=await api('ledger',{action:'add',entry:{...entry,key:ledgerRetry.key}});ledgerRetry=null;$('ledgerAmount').value='';$('ledgerDescription').value='';renderLedger();status('Ledger entry recorded.');
 });};
// The session lives in this browser's localStorage until the server's 3-day
// limit, so a reload or a new tab keeps you signed in. Sign out (or any 401)
// clears it. A session an older page kept in sessionStorage is picked up once.
const sessionKey='cardManagerSession';
function keepSession(value){try{sessionStorage.removeItem(sessionKey);if(value)localStorage.setItem(sessionKey,JSON.stringify({token:value,until:Date.now()+72*3600e3}));else localStorage.removeItem(sessionKey);}catch{}}
function storedSession(){try{const s=JSON.parse(localStorage.getItem(sessionKey)||sessionStorage.getItem(sessionKey)||'null');return s&&s.token&&s.until>Date.now()?s.token:'';}catch{return '';}}
async function resumeSession(){const saved=storedSession();if(!saved)return;token=saved;status('Loading inventory…');try{await load(false);}catch(e){token='';keepSession(null);status('Please sign in again.');return;}if(token!==saved)return;$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;status('Ready.');}
// Hands the password to the browser's password manager so it offers to save
// it and fills it in next time.
function rememberPassword(password){try{if(window.PasswordCredential&&navigator.credentials)navigator.credentials.store(new PasswordCredential({id:$('loginUser').value,password,name:'Card inventory'})).catch(()=>{});}catch{}}
$('loginForm').onsubmit=e=>{e.preventDefault();task(async()=>{status('Signing in…');const password=$('password').value;const result=await api('login',{password,bootstrap:true});token=result.token;keepSession(token);rememberPassword(password);$('password').value='';status('Loading inventory…');await load(false,result.inventory);$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;status('Ready.');});};
$('logout').onclick=()=>task(async()=>{try{await api('logout');}finally{signOut();}});
$('refresh').onclick=()=>task(async()=>{if(dirty.size&&!await confirmAction('Reload inventory?','Unsaved changes will be discarded.',[]))return;await load();if(tab==='stock')await loadListingOffers();status('Updated.');});
$('releaseListings').onclick=()=>task(async()=>{
 const {items}=await api('release',{action:'list'});
 const dialog=el('dialog'),title=el('h2','Release listings to Telegram'),hint=el('p','Choose saved listings to queue for Telegram topics, marketplaces and digests. Posting remains paced. Asking prices will not change.');
 const allLabel=el('label',' Select all pending'),all=el('input');all.type='checkbox';allLabel.prepend(all);
 // A rehearsal. The cards are posted for real, with real buttons, in the
 // test group -- the only way to know the flow works is to walk it. They
 // stay out of the shop, the digests and the books, because the prices on
 // them were made up for the test.
 const testLabel=el('label',' Release as a test','testRelease'),test=el('input');test.type='checkbox';testLabel.prepend(test);
 testLabel.append(el('small','Posts to the test group instead. Buyers never see these, and their cost and asking price stay out of your totals.'));
 const list=el('div'),chosen=new Set(),checks=[];
 const send=el('button','Release selected (0)','primary'),cancel=el('button','Cancel');send.disabled=true;
 const update=()=>{send.textContent='Release selected ('+chosen.size+')';send.disabled=!chosen.size;all.checked=items.length>0&&chosen.size===items.length;all.indeterminate=chosen.size>0&&chosen.size<items.length;};
 for(const item of items){
  const row=el('label',` #${item.id} ${item.name} · ${item.condition} ${item.slab||''} · SGD ${money(item.price)}`),check=el('input');check.type='checkbox';
  row.style.display='block';check.setAttribute('aria-label','Release '+item.name);check.onchange=()=>{check.checked?chosen.add(item.id):chosen.delete(item.id);update();};checks.push([check,item.id]);row.prepend(check);list.append(row);
 }
 all.onchange=()=>{for(const [check,id] of checks){check.checked=all.checked;all.checked?chosen.add(id):chosen.delete(id);}update();};
 if(!items.length)list.append(el('p','No listings awaiting release.'));
 const cleanup=()=>{dialog.close();dialog.remove();};cancel.onclick=cleanup;dialog.oncancel=e=>{e.preventDefault();cleanup();};
 send.onclick=()=>task(async()=>{
  const ids=[...chosen];send.disabled=true;
  try {const result=await api('release',{action:'release',ids,test:test.checked});cleanup();status(count(result.released,'listing')+' queued for '+(test.checked?'the test group.':'Telegram.'));}
  finally {if(dialog.isConnected)update();}
 });
 dialog.append(title,hint,testLabel,allLabel,list,cancel,send);document.body.append(dialog);dialog.showModal();
});
function change(r,field,value){
 r[field]=value;r.error='';
 if(r.stockId){if(field==='sale')r.saleDirty=true;else r.stockDirty=true;if(field==='price'&&!r.saleDirty)r.sale=value;}
 dirty.add(key(r));counts();scheduleSave();
}
function cents(input){if(!/^\d+(\.\d{0,2})?$/.test(input))return null;const n=Math.round(Number(input)*100);return Number.isSafeInteger(n)&&n<=9999999999?n:null;}
// A sold card's cost stays editable: a lot's total often arrives after some of
// its cards have sold. It saves on its own, outside the unsold-row autosave.
function soldCostInput(r,input){
 input.disabled=false;input.title='Cost can be corrected after the sale';
 input.oninput=()=>input.setCustomValidity(cents(input.value)===null?'Use an SGD amount with up to 2 decimals':'');
 input.onchange=()=>{const n=cents(input.value);if(n===null||n===r.cost)return;task(async()=>{const [out]=await api('stock',{rows:[{...payload(r),cost:n}],action:'cost'});if(out?.error)throw Error(out.error);await load(true);status('Cost updated.');});};
}
function moneyInput(r,field){
 const input=el('input');input.type='text';input.inputMode='decimal';input.value=r.invalidPrices?.[field]??money(r[field]);input.className='money';input.setAttribute('aria-label',field+' for '+r.name);
 if(r.invalidPrices?.[field]!==undefined)input.setCustomValidity('Use an SGD amount with up to 2 decimals');
 input.oninput=()=>{const n=cents(input.value);r.invalidPrices??={};
  if(n===null){r.invalidPrices[field]=input.value;input.setCustomValidity('Use an SGD amount with up to 2 decimals');dirty.add(key(r));counts();scheduleSave();return;}
  delete r.invalidPrices[field];input.setCustomValidity('');change(r,field,n);
 };return input;
}
function validateRows(rows){
 const invalid=rows.filter(r=>Object.keys(r.invalidPrices||{}).length);
 if(invalid.length){invalid.forEach(r=>r.error='Fix the invalid SGD amount.');throw Error('Fix the invalid price in the selected rows first.');}
}
function counts(){
 $('selected').textContent=selected.size+' selected';
 const chosen=stock.filter(r=>selected.has(key(r)));
 $('share').textContent=chosen.length&&chosen.every(r=>r.shared)?'Take out of shared':'Make shared';
 document.querySelectorAll('#rows tr').forEach(tr=>{tr.querySelector('input[type=checkbox]').checked=selected.has(tr.dataset.key);tr.classList.toggle('dirty',dirty.has(tr.dataset.key));});
 const visible=shown(),count=visible.filter(r=>selected.has(key(r))).length;$('all').checked=visible.length>0&&count===visible.length;$('all').indeterminate=count>0&&count<visible.length;
}
async function thumb(id,img){
 if(!id)return;
 try{
  if(!photos.has(id)){
   let job=photoLoads.get(id);
   if(!job){const session=token;job=photoSlot(async()=>{if(session!==token)throw Error('Session changed');if(!img.isConnected&&!document.querySelector('[data-photo="'+CSS.escape(id)+'"]'))return;const blob=await api('photo',{photo:id,thumbnail:true},true);if(session!==token)throw Error('Session changed');if(!photos.has(id))cachePhoto(id,blob);});photoLoads.set(id,job);
    const clear=()=>{if(photoLoads.get(id)===job)photoLoads.delete(id);};job.then(clear,clear);
   }await job;
  }
  if(photos.has(id)){const url=photos.get(id);photos.delete(id);photos.set(id,url);img.src=url;}
 }catch{img.alt='Photo unavailable';}
}
function photoCell(r,i,load=true){
 const td=el('td'),label=el('label',undefined,'photobox'),img=el('img',undefined,'photo');img.alt=photoLabel(i);img.src='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
 const id=(r.photos||[])[i];img.decoding='async';img.loading='lazy';if(id&&load){img.dataset.photo=id;if(photos.has(id))img.src=photos.get(id);else photoObserver.observe(img);}
 label.append(img,el('span',photoLabel(i)+' · '+(id?'Change':'Upload')));
 if(!r.sold&&!r.consignment){const file=el('input');file.type='file';file.accept='image/jpeg,image/png';file.onchange=()=>{if(file.files[0])task(async()=>{await upload(r,i,file.files[0]);render();status('Photo ready. Save the row to keep it.');});};label.append(file);}
 td.className=i===0?'frontPhoto':i===1?'backPhoto':'cornerPhoto';td.append(label);if(id&&!r.sold&&!r.consignment){const rotate=el('button','Rotate ↻','rotatePhoto');rotate.type='button';rotate.setAttribute('aria-label','Rotate '+photoLabel(i)+' 90 degrees');rotate.onclick=()=>task(async()=>{const result=await api('rotate',{photo:id,degrees:90});const updated=[...(r.photos||[])];updated[i]=result.photo;change(r,'photos',updated);render();status('Photo rotated. Save the row to keep it.');});td.append(rotate);}return td;
}
function inventoryGroupKey(r){return [r.cardId===0?'custom:'+r.name.trim().toLowerCase():r.cardId,r.condition,r.condition==='Slab'?(r.slab||'').trim().toUpperCase():''].join('|');}
function inventoryAverages(){const groups=new Map();for(const r of [...stock,...drafts].filter(r=>!r.test)){const k=inventoryGroupKey(r),g=groups.get(k)||{count:0,cost:0,price:0,sold:0,sales:0};if(r.sold){g.sold++;g.sales+=r.sale||0;}else{g.count++;g.cost+=r.cost;g.price+=r.price;}groups.set(k,g);}return groups;}
const claimStatusLabel=value=>({open:'Open',pending_approval:'Pending approval',awaiting_payment:'Awaiting PayNow',paid:'Paid',shipped:'Shipped',converted:'Converted'})[value]||value;
const claimPublicationLabel=value=>({queued:'Queued for Telegram',sending:'Sending to Telegram',published:'Live in Telegram',uncertain:'Needs publication review',retired:'Publication closed'})[value]||value;
async function loadClaims(){
 const data=await api('claims',{action:'list'});claims=data.sales||[];claimRoute=data.route||null;claimTestRoutes=data.testRoutes||[];claimOrders=data.orders||[];claimCheckout=data.checkout||null;claimOffers=data.offers||[];claimDeliveries=data.deliveries||[];claimResult=data.result||null;saleRunning=!!data.saleRunning;claimsLoaded=true;fillCheckout();renderClaims();if(tab==='queue')renderQueue();
}
// Buyers act in Telegram while the manager is open, so a claim or order can
// change under you. A stale action refreshes the list and says so instead of
// asking you to reload the page (which would sign you out).
async function claimWrite(body){
 try{return await api('claims',body);}
 catch(e){if(!/changed; (reload|refresh)/.test(e.message))throw e;await loadClaims();throw Error('This changed while you were looking (someone acted in Telegram or the manager). The list is refreshed: check it and try again.');}
}
const claimBuyer=(name,id)=>name||'buyer '+id;
// Claim queue: staged claim sales waiting for the next claim sale.
const queuePicked=new Set();
const posterLimit=20;
let posterRows=[],posterURL='',posterFile=null,posterRequest;
function clearPosterImage(){
 posterRequest?.abort();posterRequest=null;
 if(posterURL)URL.revokeObjectURL(posterURL);
 posterURL='';posterFile=null;
 const image=$('claimPosterImage'),download=$('claimPosterDownload');
 image.hidden=true;image.removeAttribute('src');download.hidden=true;download.removeAttribute('href');
 $('claimPosterShare').hidden=true;
}
async function showClaimPoster(){
 clearPosterImage();
 const index=Number($('claimPosterView').value),ids=index<0?posterRows.map(row=>row.id):[posterRows[index].id];
 const request=new AbortController();posterRequest=request;
 $('claimPosterStatus').textContent='Rendering teaser…';
 try{
  const blob=await api('claims',{action:'poster',saleIds:ids},true,request.signal);
  if(posterRequest!==request)return;
  const filename=index<0?'claim-sale.jpg':'claim-sale-'+ids[0]+'.jpg';
  posterFile=new File([blob],filename,{type:'image/jpeg'});posterURL=URL.createObjectURL(blob);
  const image=$('claimPosterImage'),download=$('claimPosterDownload');
  image.src=posterURL;image.hidden=false;download.href=posterURL;download.download=filename;download.hidden=false;
  $('claimPosterShare').hidden=!navigator.canShare?.({files:[posterFile]});
  $('claimPosterStatus').textContent='';
 }catch(e){if(posterRequest===request)$('claimPosterStatus').textContent=e.message;}
}
$('openTeaserQueue').onclick=()=>{
 document.querySelector('[data-tab=queue]').click();
 $('queuePanel').scrollIntoView({block:'start'});
};
$('queuePoster').onclick=()=>{
 posterRows=claims.filter(s=>claimQueued(s)&&queuePicked.has(s.id)).sort((a,b)=>a.price-b.price);
 if(!posterRows.length||posterRows.length>posterLimit)return;
 $('claimPosterOrder').open=false;
 $('claimPosterOrder').hidden=posterRows.length<2;
 renderPosterOrder();
 $('claimPosterDialog').showModal();showClaimPoster();
};
function renderPosterOrder(){
 const view=$('claimPosterView'),list=$('claimPosterCards');
 view.replaceChildren(new Option('All selected cards','-1'));
 list.replaceChildren();
 $('claimPosterViewLabel').hidden=posterRows.length<2;
 posterRows.forEach((card,i)=>{
  if(posterRows.length>1)view.add(new Option(card.name,String(i)));
  const row=el('li'),name=el('span',card.name+' · SGD '+money(card.price));
  row.append(name);
  for(const [step,label] of [[-1,'Move up'],[1,'Move down']]){
   const button=el('button',label);
   button.type='button';
   button.setAttribute('aria-label',label+' '+card.name);
   button.disabled=i+step<0||i+step>=posterRows.length;
   button.onclick=()=>{
    posterRows.splice(i+step,0,posterRows.splice(i,1)[0]);
    clearPosterImage();
    $('claimPosterStatus').textContent='Order changed. Generate the lineup to see the new image.';
    renderPosterOrder();
    const moved=list.children[i+step].querySelectorAll('button');
    const sameDirection=moved[step<0?0:1];
    (sameDirection.disabled?list.children[i+step].querySelector('button:enabled'):sameDirection).focus();
   };
   row.append(button);
  }
  list.append(row);
 });
}
$('claimPosterView').onchange=showClaimPoster;
$('claimPosterGenerate').onclick=()=>{
 $('claimPosterView').value='-1';
 $('claimPosterOrder').open=false;
 showClaimPoster();
};
$('claimPosterClose').onclick=()=>$('claimPosterDialog').close();
$('claimPosterDialog').addEventListener('close',()=>{clearPosterImage();posterRows=[];});
$('claimPosterShare').onclick=async()=>{
 if(!posterFile)return;
 try{await navigator.share({files:[posterFile]});}
 catch(e){if(e.name!=='AbortError')$('claimPosterStatus').textContent='Sharing failed. You can download the image.';}
};
function renderQueue(){
 const rows=claims.filter(claimQueued),list=$('queueRows');list.replaceChildren();
 for(const id of [...queuePicked])if(!rows.some(s=>s.id===id))queuePicked.delete(id);
 $('queueCount').textContent=rows.length;
 const total=rows.reduce((t,s)=>t+s.price,0);
 $('queueSummary').textContent=rows.length?rows.length+(rows.length===1?' card':' cards')+' · SGD '+money(total)+(queuePicked.size?' · '+queuePicked.size+' selected':''):'';
 $('queueAll').checked=rows.length>0&&queuePicked.size===rows.length;$('queueAll').disabled=!rows.length;
 $('queueReleaseAll').textContent='Release all ('+rows.length+')';$('queueReleaseAll').disabled=busy||!rows.length;
 $('queueRelease').textContent='Release selected ('+queuePicked.size+')';$('queueRelease').disabled=busy||!queuePicked.size;
 $('queuePoster').disabled=busy||!queuePicked.size||queuePicked.size>posterLimit;
 $('queuePoster').textContent=queuePicked.size>posterLimit?'Select up to 20 for a teaser':'Generate teaser poster';
 $('queueBack').textContent='Back to listings ('+queuePicked.size+')';$('queueBack').disabled=busy||!queuePicked.size;
 if(!rows.length){list.append(el('p','The queue is empty. Move cards here with Move to claims on Drafts or Available.','empty'));return;}
 for(const s of rows){
  const row=el('div',undefined,'queueRow'),pick=document.createElement('input');pick.type='checkbox';pick.checked=queuePicked.has(s.id);pick.setAttribute('aria-label','Select '+s.name);
  pick.onchange=()=>{if(pick.checked)queuePicked.add(s.id);else queuePicked.delete(s.id);renderQueue();};
  const cond=s.condition==='Slab'?'Slab · '+s.slab:s.condition;
  const info=el('div',undefined,'queueInfo');info.append(el('strong',(s.test?'[test] ':'')+s.name),el('span',cond+(s.costHidden?'':' · cost SGD '+money(s.cost)),'hint'));
  // The claim price is the one thing here still worth changing, so it is a
  // field rather than a line of text. Nothing is posted yet, so nobody is
  // reading the old number.
  const field=el('label',undefined,'queuePriceField'),price=document.createElement('input');
  price.inputMode='decimal';price.value=money(s.price);price.setAttribute('aria-label','Claim price for '+s.name);
  price.onchange=()=>{
   const amount=cents(price.value.trim());
   if(amount===null||amount<=0){price.value=money(s.price);status('Enter a claim price like 25 or 25.50.',true);return;}
   if(amount===s.price){price.value=money(s.price);return;}
   task(()=>repriceQueued(s,amount));
  };
  field.append(el('span','Claim price SGD','hint'),price);
  const drop=el('button','Remove','queueDrop');drop.type='button';drop.onclick=()=>task(()=>queueRemove(s));
  row.append(pick,info,field,drop);list.append(row);
 }
}
async function releaseQueue(all){
 const rows=claims.filter(claimQueued).filter(s=>all||queuePicked.has(s.id));if(!rows.length)return;
 if(!await confirmAction('Release '+rows.length+(rows.length===1?' card':' cards')+' to the claim sale?','Each card is posted to the Claims topic with Claim and Offer buttons, one after another. Buyers can claim as soon as a post is up.',rows.map(s=>({name:(s.test?'[test] ':'')+s.name,price:s.price,sale:s.price}))))return;
 const r=await claimWrite({action:'release',all,saleIds:all?[]:rows.map(s=>s.id),commandKey:newID()});
 queuePicked.clear();await loadClaims();status(r.released+(r.released===1?' card':' cards')+' released. Posting to the Claims topic now.');
}
async function repriceQueued(s,price){
 await claimWrite({action:'reprice',saleId:s.id,revision:s.revision,commandKey:newID(),price});
 await loadClaims();
 status(s.name+' is now SGD '+money(price)+'.');
}
async function queueRemove(s){
 if(!await confirmAction('Take this card out of the claim queue?','It leaves the queue and comes back as a normal listing under Available. Nothing was posted for it.',[{name:s.name,price:s.price,sale:s.price}]))return;
 await claimWrite({action:'change',saleId:s.id,revision:s.revision,commandKey:newID(),claimAction:'convert'});
 queuePicked.delete(s.id);
 await loadClaims();await load(true);
 status(s.name+' moved back to Available.');
}
async function queueBack(){
 const rows=claims.filter(claimQueued).filter(s=>queuePicked.has(s.id));if(!rows.length)return;
 if(!await confirmAction('Move '+rows.length+(rows.length===1?' card':' cards')+' back to listings?','They leave the Claim queue and appear in Available as normal listings. Nothing was posted for them.',rows.map(s=>({name:s.name,price:s.price,sale:s.price}))))return;
 const failed=[];for(const s of rows){try{await claimWrite({action:'change',saleId:s.id,revision:s.revision,commandKey:newID(),claimAction:'convert'});}catch(e){failed.push(s.name+': '+e.message);}}
 queuePicked.clear();await loadClaims();await load(true);status(failed.length?failed.length+' could not move: '+failed.join('; '):'Moved back to Available.',failed.length>0);
}
$('queueAll').onchange=()=>{const rows=claims.filter(claimQueued);if($('queueAll').checked)rows.forEach(s=>queuePicked.add(s.id));else queuePicked.clear();renderQueue();};
$('queueReleaseAll').onclick=()=>task(()=>releaseQueue(true));
$('queueRelease').onclick=()=>task(()=>releaseQueue(false));
$('queueBack').onclick=()=>task(queueBack);
$('refreshQueue').onclick=()=>task(async()=>{await loadClaims();status('Claim queue updated.');});
// Keep the Claims tab current while it is open, but never while you are
// typing or a dialog is up, so nothing you entered is lost.
setInterval(()=>{
 if(tab!=='claims'||!token||!claimsLoaded||busy||document.hidden||document.querySelector('dialog[open]'))return;
 const panel=$('claimSales').closest('section')||document.body,active=document.activeElement;
 if(active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
 if([...panel.querySelectorAll('.claimOffer input')].some(i=>i.value.trim()))return;
 loadClaims().catch(()=>{});
},20000);
function claimActionButton(sale,label,action){
 const button=el('button',label);button.type='button';if(action==='reject'||action==='cancel')button.className='danger';
 button.onclick=()=>task(async()=>{if(!await confirmAction(label+'?','This changes only the claim sale status. Payment and mailing remain manual.',[]))return;const changed=await claimWrite({action:'change',saleId:sale.id,revision:sale.revision,commandKey:newID(),claimAction:action});const index=claims.findIndex(row=>row.id===sale.id);if(index>=0)claims[index]=changed;renderClaims();status(label+' completed.');});
 return button;
}
// Whether buyers may haggle on this card, or only take it at its claim
// price. It is allowed while the card is open, posted or still queued,
// because it only takes the Offer button off the post or puts it back.
function claimOffersButton(sale){
 const off=sale.noOffers===true,label=off?'Allow offers':'Claim price only';
 const button=el('button',label);button.type='button';
 button.onclick=()=>task(async()=>{
  const detail=off?'Buyers get the Offer button back on this card.':'The post loses its Offer button and any offer waiting on it is closed. Buyers can only take it at the claim price.';
  if(!await confirmAction(label+'?',detail,[]))return;
  const changed=await claimWrite({action:'offers',saleId:sale.id,revision:sale.revision,commandKey:newID(),noOffers:!off});
  const index=claims.findIndex(row=>row.id===sale.id);if(index>=0)claims[index]=changed;renderClaims();status(off?'Offers allowed again.':'Claim price only.');
 });
 return button;
}
function claimPublicationButton(sale,label,action){
 const button=el('button',label);button.type='button';
 button.onclick=()=>task(async()=>{
  const body={action,saleId:sale.id,revision:sale.revision,commandKey:newID()};
  if(action==='adopt-publication'){
   const raw=window.prompt('Existing Claims-topic message ID');if(raw===null)return;
   const messageId=Number(raw);if(!Number.isSafeInteger(messageId)||messageId<=0)throw Error('Enter a positive Telegram message ID.');body.channelMessageId=messageId;
  }else if(!await confirmAction('Retry claim post?','Check the Claims topic first. Retrying can create a duplicate if the original post is already live.',[]))return;
  const changed=await api('claims',body),index=claims.findIndex(row=>row.id===sale.id);if(index>=0)claims[index]=changed;renderClaims();status(label+' completed.');
 });
 return button;
}
const claimBulkActions=[{id:'claimBulkApprove',action:'approve',label:'Approve',from:'pending_approval'},{id:'claimBulkPaid',action:'paid',label:'Confirm PayNow',from:'awaiting_payment'},{id:'claimBulkShipped',action:'shipped',label:'Mark shipped',from:'paid'}];
const claimBulkRows=b=>claims.filter(s=>claimPicked.has(s.id)&&s.status===b.from&&!(s.orderId&&b.action!=='approve'));
const claimPlural=n=>n+' '+(n===1?'claim':'claims');
const claimQueued=s=>s.publicationStatus==='staged'&&s.status==='open';
// Which part of the claim sale the panel is showing. 'cards' is every
// claim with its own filter, 'offers' the ones waiting on our counter,
// and the other two the order and the delivery that follow.
let claimTab='cards';
const claimTabSales=s=>claimOffers.some(o=>o.saleId===s.id&&claimOfferLive(o));
function claimShown(){
 const live=claims.filter(s=>!claimQueued(s));
 if(claimTab==='offers')return live.filter(claimTabSales);
 const f=$('claimFilter').value;return live.filter(s=>f==='all'||(f==='done'?['shipped','converted'].includes(s.status):s.status===f));
}
function showClaimTab(next){
 claimTab=next;
 // A selection made under one tab must not be acted on from another,
 // where the rows it refers to are not on screen.
 claimPicked.clear();
 renderClaims();
}
function updateClaimBulk(){
 $('claimBulkBar').hidden=!claimPicked.size;$('claimBulkCount').textContent=claimPicked.size+' selected';
 for(const b of claimBulkActions){const n=claimBulkRows(b).length,button=$(b.id);button.textContent=b.label+' ('+n+')';button.disabled=busy||!n;}
}
async function runClaimBulk(b){
 const rows=claimBulkRows(b);if(!rows.length)return;
 if(!await confirmAction(b.label+' '+claimPlural(rows.length)+'?','Applies to each selected claim one at a time. Selected claims in other statuses are skipped. Payment and mailing remain manual.',rows.map(s=>({name:'Claim #'+s.id+' '+s.name,price:s.price,sale:s.price}))))return;
 let ok=0;const failed=[];
 for(const sale of rows){
  if(!token)break;
  try{const changed=await claimWrite({action:'change',saleId:sale.id,revision:sale.revision,commandKey:newID(),claimAction:b.action});const index=claims.findIndex(row=>row.id===sale.id);if(index>=0)claims[index]=changed;claimPicked.delete(sale.id);ok++;}
  catch(e){failed.push('#'+sale.id+': '+e.message);}
 }
 if(!token)return;
 renderClaims();
 if(failed.length)status(claimPlural(ok)+' updated · '+failed.length+' failed — '+failed.join('; ')+' Refresh claims, then retry the selection.',true);else status(claimPlural(ok)+' updated.');
}
function renderClaims(){
 const open=claims.filter(s=>!claimQueued(s)&&!['shipped','converted'].includes(s.status));
 $('claimCount').textContent=open.length;$('queueCount').textContent=claims.filter(claimQueued).length;
 $('claimCardsCount').textContent=open.length;
 $('claimOffersCount').textContent=claims.filter(s=>!claimQueued(s)&&claimTabSales(s)).length;
 $('claimOrderCount').textContent=claimOrders.filter(o=>claimOrderOpen(o)||o.status==='paid').length;
 $('claimShippingCount').textContent=claimDeliveries.filter(d=>deliveryOpen(d)||d.status==='paid').length;
 for(const b of document.querySelectorAll('[data-claimtab]'))b.classList.toggle('active',b.dataset.claimtab===claimTab);
 $('claimCardsSection').hidden=claimTab!=='cards'&&claimTab!=='offers';
 $('claimToolbar').hidden=claimTab!=='cards';
 $('claimOrdersSection').hidden=claimTab!=='orders';
 $('claimShippingSection').hidden=claimTab!=='shipping';
 $('claimRouteSettings').hidden=false;
 if(claimRoute?.topicId){const chat=String(claimRoute.channelId);$('claimTopicLink').value=chat.startsWith('-100')?'https://t.me/c/'+chat.slice(4)+'/'+claimRoute.topicId:'';}
 $('claimRouteNow').textContent=!claimRoute?'Not set up yet.':claimRoute.topicId?'Now posting to a topic, one shared thread.':'Now posting to channel '+claimRoute.channelId+' · comments in group '+claimRoute.discussionId+'.';
 renderTestRoutes();
 const list=$('claimSales');list.replaceChildren();
 const ids=new Set(claims.map(s=>s.id));for(const id of claimPicked)if(!ids.has(id))claimPicked.delete(id);
 const shownClaims=claimShown();
 for(const sale of shownClaims){
  const card=el('article',undefined,'claimCard'),heading=el('div',undefined,'claimCardHeading'),pick=document.createElement('input');pick.type='checkbox';pick.className='claimPick';pick.checked=claimPicked.has(sale.id);pick.setAttribute('aria-label','Select claim #'+sale.id);pick.onchange=()=>{if(pick.checked)claimPicked.add(sale.id);else claimPicked.delete(sale.id);updateClaimBulk();};
  const title=el('div',undefined,'claimTitle');title.append(pick,el('h3',(sale.test?'[test] ':'')+sale.name));heading.append(title,el('span',claimStatusLabel(sale.status),'claimStatus'));
  const condition=sale.condition==='Slab'?'Slab · '+sale.slab:sale.condition;
  card.append(heading,el('p',condition+' · Fixed price SGD '+money(sale.price)+(sale.listPrice&&sale.listPrice!==sale.price?' (offer · listed SGD '+money(sale.listPrice)+')':'')),el('p',(sale.costHidden?'Another seller\'s card':'Cost SGD '+money(sale.cost)+(sale.inventoryOwner&&!limitedSeller?' · Seller '+sale.inventoryOwner+'\'s card':''))+' · Claim #'+sale.id,'hint'));
  if(sale.noOffers===true)card.append(el('p','Claim price only · no offers','claimPriceOnly'));
  if(sale.included)card.append(el('p','Includes: '+sale.included,'hint'));
  if(sale.notes)card.append(el('p','⚠️ '+sale.notes,'hint'));
  if(sale.claimantId)card.append(el('p','Reserved by '+(sale.claimantName?sale.claimantName+' · ':'')+'Telegram ID '+sale.claimantId));
  card.append(el('p',claimPublicationLabel(sale.publicationStatus),sale.publicationStatus==='uncertain'?'rowerror':'hint'));
  if(sale.publicationError)card.append(el('p',sale.publicationError,'rowerror'));
  if(sale.orderId)card.append(el('p','In order #'+sale.orderId+' · update it under Orders','hint'));
  const actions=el('div',undefined,'claimActions');
  if(sale.status==='open')actions.append(claimActionButton(sale,'Move to normal listings','convert'),claimOffersButton(sale));
  if(sale.status==='pending_approval')actions.append(claimActionButton(sale,'Approve claim','approve'),claimActionButton(sale,'Reject & reopen','reject'),claimActionButton(sale,'Cancel & reopen','cancel'),claimActionButton(sale,'Move to normal listings','convert'));
  if(sale.status==='awaiting_payment')actions.append(claimActionButton(sale,'Confirm PayNow','paid'),claimActionButton(sale,'Cancel & reopen','cancel'),claimActionButton(sale,'Move to normal listings','convert'));
  if(sale.status==='paid')actions.append(claimActionButton(sale,'Mark shipped','shipped'));
  if(sale.publicationStatus==='uncertain'&&sale.status==='open')actions.append(claimPublicationButton(sale,'Adopt existing post','adopt-publication'),claimPublicationButton(sale,'Retry after checking channel','retry-publication'));
  if(sale.orderId)actions.replaceChildren();
  if(actions.childElementCount)card.append(actions);card.append(...claimOfferRows(sale));list.append(card);
 }
 if(!claims.length)list.append(el('p','No claim sales yet. Move cards here from Available or Drafts.','empty'));
 else if(!shownClaims.length)list.append(el('p',claimTab==='offers'?'No offers waiting on you.':'No claims in this view.','empty'));
 $('claimSelectAll').disabled=busy||!shownClaims.length;updateClaimBulk();renderClaimOrders();
}
// What the claim sale has come to: what the cards sold for, what they cost
// us, and the difference. Mailing is not in it -- it is collected for the
// post office and passed on, so counting it would flatter both sides.
function renderResult(){
 const box=$('claimResult');if(!box)return;
 const r=claimResult;box.replaceChildren();
 if(!r||!r.startedAt){box.hidden=true;return;}
 box.hidden=false;
 const when=new Date(r.startedAt).toLocaleString('en-SG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
 box.append(el('h3',(r.running?'This claim sale':'Last claim sale')+' \u00b7 from '+when));
 const profit=(r.sales||0)-(r.cost||0);
 const figure=(label,value,extra)=>{const cell=el('div',undefined,'claimFigure');cell.append(el('strong',value),el('small',label));if(extra)cell.append(el('small',extra,'hint'));return cell;};
 const grid=el('div',undefined,'claimFigures');
 grid.append(
  figure('Cards claimed',String(r.claimed||0),(r.unsold||0)+' still open'),
  figure('Sales','S$'+money(r.sales||0),'S$'+money(r.paid||0)+' paid so far'),
  figure('Cost','S$'+money(r.cost||0)),
  figure(profit<0?'Loss':'Profit','S$'+money(Math.abs(profit)),(r.sales?Math.round(profit/r.sales*100)+'% of sales':'')));
 box.append(grid);
 box.append(el('p','Test cards are left out. Mailing is not counted either way.','hint'));
}
const claimOfferLive=o=>o.status==='pending'||o.status==='countered';
const claimOfferStatusLabel=o=>({pending:'Waiting for you',countered:'Countered SGD '+money(o.counter)+(o.counterNote?' (“'+o.counterNote+'”)':'')+' · waiting for buyer',accepted:'Accepted',rejected:'Declined',withdrawn:'Replaced by a newer offer',closed:'Closed'})[o.status]||o.status;
function claimOfferRows(sale){
 const offers=claimOffers.filter(o=>o.saleId===sale.id);if(!offers.length)return[];
 const box=el('div',undefined,'claimOffers');box.append(el('h4','Offers'));
 for(const o of offers){
  const row=el('div',undefined,'claimOffer');row.append(el('p',(o.buyerName||'Buyer '+o.buyerId)+' offered SGD '+money(o.amount)+' · '+claimOfferStatusLabel(o)));
  if(claimOfferLive(o)&&sale.status==='open'){
   const actions=el('div',undefined,'claimActions'),input=el('input');input.inputMode='decimal';input.placeholder='Counter SGD';input.setAttribute('aria-label','Counter offer for '+(o.buyerName||'buyer')+' in SGD');
   // The buyer is told why, in our words, with the price. Without it a
   // counter reads as haggling and they ask anyway.
   const why=el('input');why.maxLength=300;why.placeholder='Why (optional)';why.setAttribute('aria-label','Reason for countering '+(o.buyerName||'the buyer'));
   const button=(label,act,danger)=>{const b=el('button',label);b.type='button';if(danger)b.className='danger';b.onclick=()=>task(()=>changeClaimOffer(o,act,input,why));return b;};
   actions.append(button('Accept SGD '+money(o.amount),'accept'),input,why,button('Counter','counter'),button('Decline','reject',true));row.append(actions);
  }
  box.append(row);
 }
 return[box];
}
async function changeClaimOffer(o,act,input,why){
 let counter=0,counterNote='';
 if(act==='counter'){counter=cents(input.value.trim());if(!counter)throw Error('Enter a counter price in SGD, e.g. 278.00');counterNote=(why?.value||'').trim();}
 const who=o.buyerName||'the buyer';
 const title=act==='accept'?'Accept '+who+"'s offer of SGD "+money(o.amount)+'?':act==='counter'?'Counter '+who+' at SGD '+money(counter)+'?':'Decline '+who+"'s offer?";
 const text=act==='accept'?'The card is reserved for them at this price, already approved. The bot tells them and updates the post.':act==='counter'?('The bot sends the counter to the buyer with Accept and Decline buttons.'+(counterNote?' They are told why: “'+counterNote+'”':' No reason is given.')):'The bot tells them. The card stays open.';
 if(!await confirmAction(title,text,[]))return;
 await claimWrite({action:'offer-change',offerId:o.id,revision:o.revision,commandKey:newID(),offerAction:act,counter,counterNote});await loadClaims();
 status(act==='accept'?'Offer accepted.':act==='counter'?'Counter sent.':'Offer declined.');
}
// Offers on normal listings. They are answered exactly as from the notice in
// Telegram, and the bot tells the buyer the same way.
const listingOfferOpen=o=>['received','reviewing','countered'].includes(o.status);
const listingOfferStatusLabel=o=>({received:'Waiting for you',reviewing:'Waiting for you',countered:'Countered SGD '+money(o.counter)+(o.counterNote?' (“'+o.counterNote+'”)':'')+' · waiting for buyer',accepted:'Accepted · held at SGD '+money(o.agreed)+(o.decidedBy?' · by '+o.decidedBy:''),declined:'Declined'+(o.decidedBy?' by '+o.decidedBy:''),withdrawn:'Withdrawn by the buyer'})[o.status]||o.status;
// Loaded beside the inventory rather than through task(): it only fills its
// own panel, so it must not lock the page or redraw the rows being edited.
async function loadListingOffers(){const data=await api('listing-offers',{action:'list'});listingOffers=data.offers||[];listingOffersLoaded=true;renderListingOffers();}
function renderListingOffers(){
 const box=$('listingOffers');box.replaceChildren();
 $('listingOffersCount').textContent=listingOffers.filter(listingOfferOpen).length;
 if(!listingOffers.length){box.append(el('p','No offers in the last 30 days.','empty'));return;}
 for(const o of listingOffers){
  const row=el('div',undefined,'claimOffer');
  const cards=o.items.map(i=>(o.test?'[test] ':'')+'#'+i.stockId+' '+i.name+' · asking SGD '+money(i.asking)).join(', ');
  row.append(el('p',(o.buyerName||'Buyer '+o.buyerId)+' offered SGD '+money(o.offer)+' for '+cards+' · '+listingOfferStatusLabel(o)));
  if(listingOfferOpen(o)){
   const input=el('input');input.inputMode='decimal';input.placeholder='Counter SGD';input.setAttribute('aria-label','Counter price for offer #'+o.id);
   const why=el('input');why.maxLength=200;why.placeholder='Note for the buyer (optional)';why.setAttribute('aria-label','Counter note for offer #'+o.id);
   const button=(label,act,danger)=>{const b=el('button',label);b.type='button';if(danger)b.className='danger';b.onclick=()=>task(()=>changeListingOffer(o,act,input,why));return b;};
   const actions=el('div',undefined,'claimOfferActions');actions.append(button('Accept SGD '+money(o.offer),'accept'),input,why,button('Counter','counter'),button('Decline','decline',true));row.append(actions);
  }
  box.append(row);
 }
}
async function changeListingOffer(o,act,input,why){
 let counter=0,note='';
 if(act==='counter'){counter=cents(input.value.trim());if(!counter)throw Error('Enter a counter price in SGD, e.g. 18.00');if(counter<=o.offer||counter>=o.asking)throw Error('A counter must be above SGD '+money(o.offer)+' and below SGD '+money(o.asking)+'.');note=(why.value||'').trim();}
 const who=o.buyerName||'the buyer';
 const title=act==='accept'?'Accept '+who+"'s offer of SGD "+money(o.offer)+'?':act==='counter'?'Counter '+who+' at SGD '+money(counter)+'?':'Decline '+who+"'s offer?";
 const text=act==='accept'?'The card is held for them at this price, as if they had tapped Buy. The bot tells them.':act==='counter'?('The bot sends them your price with Accept and Decline buttons. Accepting holds the card for them.'+(note?' They see your note: “'+note+'”':'')):'The bot tells them. The card stays listed.';
 if(!await confirmAction(title,text,[]))return;
 await api('listing-offers',{action:act,offerId:o.id,counter,note});
 await loadListingOffers();if(act==='accept')await load(true);
 status(act==='accept'?'Offer accepted. The card is held for the buyer.':act==='counter'?'Counter sent.':'Offer declined.');
}
$('reloadListingOffers').onclick=()=>task(loadListingOffers);
const claimOrderStatusLabel=o=>({choosing:'Waiting for buyer to pick mail or pickup',address:'Waiting for buyer\'s address',awaiting_payment:o.paymentProof?'Screenshot received · check and confirm':'Awaiting PayNow',paid:o.fulfilment==='mail'?'Paid · to mail':'Paid · to collect',shipped:o.fulfilment==='mail'?'Mailed':'Collected',cancelled:'Cancelled'})[o.status]||o.status;
const claimOrderOpen=o=>['choosing','address','awaiting_payment'].includes(o.status);
let checkoutQr='',checkoutQrPreviewURL='';
function showCheckoutQr(previewBlob){if(checkoutQrPreviewURL){URL.revokeObjectURL(checkoutQrPreviewURL);checkoutQrPreviewURL='';}const img=$('checkoutQrPreview');if(previewBlob){checkoutQrPreviewURL=URL.createObjectURL(previewBlob);img.src=checkoutQrPreviewURL;}img.hidden=!previewBlob;$('checkoutQrRemove').hidden=!checkoutQr;$('checkoutQrStatus').textContent=!checkoutQr?'No QR yet. Upload the PayNow QR from your bank app; buyers get it with their total.':previewBlob?'New QR ready. Save checkout settings to use it.':'PayNow QR saved. Buyers get it with their total.';}
function fillCheckout(){if(!claimCheckout)return;$('checkoutMailFee').value=money(claimCheckout.mailFee);$('checkoutPayNow').value=claimCheckout.paynow||'';$('checkoutPickup').value=claimCheckout.pickup||'';$('checkoutPickupArea').value=claimCheckout.pickupArea||'';$('checkoutPayMinutes').value=String(claimCheckout.payMinutes||15);$('checkoutPushBatch').value=String(claimCheckout.pushBatch||1);$('checkoutPushSeconds').value=String(claimCheckout.pushSeconds||4);$('checkoutFreeMailFrom').value=claimCheckout.freeMailFrom?money(claimCheckout.freeMailFrom):'';checkoutQr=claimCheckout.paynowQr||'';showCheckoutQr(null);}
function claimOrderButton(order,label,run,danger){const button=el('button',label);button.type='button';if(danger)button.className='danger';button.onclick=()=>task(run);return button;}
async function changeClaimOrder(order,action,label){
 if(!await confirmAction(label+'?',action==='paid'?'Marks every card in this order paid and records each sale once. The buyer gets a DM.':action==='cancel'?'The claims stay approved and can be sent again in a new order. The buyer gets a DM.':'The buyer gets a DM.',order.lines.map(l=>({name:'Claim #'+l.saleId+' '+l.name,price:l.price,sale:l.price}))))return;
 await claimWrite({action:'order-change',orderId:order.id,revision:order.revision,commandKey:newID(),orderAction:action});await loadClaims();status(label+' completed.');
}
// The buyer's payment screenshot: a thumbnail you can open full size, so you
// can check the amount and reference before confirming PayNow.
const proofURLs=new Map();
function claimProofView(o){
 const box=el('div',undefined,'claimProof'),when=o.paymentProofAt?new Date(o.paymentProofAt).toLocaleString():'';
 box.append(el('p','📸 Payment screenshot from the buyer'+(when?' · '+when:'')+'. Check the amount and reference '+(o.ref||'CLAIM'+o.id)+', then confirm.'));
 const link=el('a',undefined,'claimProofLink'),img=el('img',undefined,'claimProofImg');img.alt='Payment screenshot for order #'+o.id;link.target='_blank';link.rel='noopener';link.append(img);box.append(link);
 const show=url=>{img.src=url;link.href=url;};
 if(proofURLs.has(o.paymentProof))show(proofURLs.get(o.paymentProof));
 else{const session=token;api('photo',{photo:o.paymentProof},true).then(blob=>{if(session!==token)return;const url=URL.createObjectURL(blob);proofURLs.set(o.paymentProof,url);show(url);}).catch(()=>box.append(el('p','Could not load the screenshot.','rowerror')));}
 return box;
}
const deliveryStatusLabel=d=>({choosing:'Waiting for a delivery choice',address:'Waiting for address',awaiting_payment:d.paymentProof?'Shipping screenshot · check and confirm':'Waiting for shipping payment',meetup:'Meetup · arrange a time',paid:d.freeMail&&!d.paymentProof?'Free mailing · to mail':'Shipping paid · to mail',shipped:'Mailed',collected:'Collected',cancelled:'Cancelled'})[d.status]||d.status;
const deliveryOpen=d=>['choosing','address','awaiting_payment','meetup'].includes(d.status);
// Mark mailed takes the tracking number, which is required, and a photo of
// the parcel or the post office receipt, which is optional. Both go to the
// buyer in Telegram. What was typed or picked is kept per delivery, because
// the list is redrawn after every action.
const mailedDrafts=new Map();
function mailedForm(d){
 const draft=mailedDrafts.get(d.id)||{tracking:'',photo:null};mailedDrafts.set(d.id,draft);
 const form=el('div',undefined,'claimActions mailedForm'),number=document.createElement('input'),photo=document.createElement('input');
 number.type='text';number.placeholder='Tracking number (required)';number.maxLength=80;number.autocomplete='off';number.value=draft.tracking;number.setAttribute('aria-label','Tracking number for delivery #'+d.id);number.oninput=()=>{draft.tracking=number.value;};
 photo.type='file';photo.accept='image/*';photo.setAttribute('aria-label','Parcel or receipt photo for delivery #'+d.id);
 const hint=el('span',draft.photo?'Photo: '+draft.photo.name:'Photo (optional)','hint');photo.onchange=()=>{draft.photo=photo.files[0]||null;hint.textContent=draft.photo?'Photo: '+draft.photo.name:'Photo (optional)';};
 const button=claimOrderButton(null,'Mark mailed',async()=>{
  const tracking=draft.tracking.trim();
  if(!tracking)throw new Error('Add the tracking number before marking it mailed.');
  if(!await confirmAction('Mark mailed · delivery #'+d.id+'?','The buyer gets a message with tracking number '+tracking+(draft.photo?' and the photo.':'.'),[]))return;
  let trackingPhoto='';
  if(draft.photo){const body=new FormData();body.append('photo',draft.photo,'parcel.jpg');trackingPhoto=(await api('upload',body)).photo;}
  await claimWrite({action:'delivery-change',deliveryId:d.id,revision:d.revision,deliveryAction:'mailed',tracking,trackingPhoto});mailedDrafts.delete(d.id);await loadClaims();status('Marked mailed. The buyer has the tracking number.');
 });
 form.append(number,hint,photo,button);return form;
}
function renderDeliveries(){
 const list=$('claimDeliveries');if(!list)return;list.replaceChildren();
 const shown=claimDeliveries.filter(d=>deliveryOpen(d)||d.status==='paid'||Date.now()-Date.parse(d.updatedAt)<7*864e5);
 if(!shown.length){list.append(el('p','No deliveries yet. They appear when you end a claim sale.','empty'));return;}
 for(const d of shown){
  const card=el('article',undefined,'claimCard claimOrderCard'),heading=el('div',undefined,'claimCardHeading');
  heading.append(el('h3',(d.test?'[test] ':'')+'Delivery #'+d.id+' · '+claimBuyer(d.buyerName,d.buyerId)),el('span',deliveryStatusLabel(d),'claimStatus'));card.append(heading);
  for(const l of d.lines)card.append(el('p',l.name+' · '+(l.slab?'Slab · '+l.slab:l.condition)+' · SGD '+money(l.price)));
  card.append(el('p','Cards paid SGD '+money(d.cardsTotal)+' · '+(d.method==='mail'?(d.freeMail?'Mail · free mailing':'Mail · shipping SGD '+money(d.mailFee)+' · Ref SHIP'+d.id):d.method==='meetup'?'Meetup':'Not chosen yet'),'claimOrderTotal'));
  if(d.address)card.append(el('p','Mail to: '+d.address,'claimAddress'));
  if(d.tracking)card.append(el('p','Tracking: '+d.tracking+(d.trackingPhoto?' · photo sent':''),'claimAddress'));
  if(d.paymentProof)card.append(claimProofView({...d,ref:'SHIP'+d.id}));
  if(d.remindedAt&&deliveryOpen(d)&&d.status!=='meetup')card.append(el('p','No answer for 24 hours: reminded once. Please follow up with the buyer.','rowerror'));
  const act=(label,action,danger)=>claimOrderButton(null,label,async()=>{if(!await confirmAction(label+' · delivery #'+d.id+'?','The buyer gets a message.',[]))return;await claimWrite({action:'delivery-change',deliveryId:d.id,revision:d.revision,deliveryAction:action});await loadClaims();status(label+' done.');},danger);
  const actions=el('div',undefined,'claimActions');
  if(d.status==='awaiting_payment')actions.append(act('Confirm shipping paid','shipping-paid'));
  if(d.status==='paid')card.append(mailedForm(d));
  if(d.status==='meetup'||d.status==='choosing')actions.append(act('Mark collected','collected'));
  if(deliveryOpen(d))actions.append(act('Cancel delivery','cancel',true));
  if(actions.childElementCount)card.append(actions);list.append(card);
 }
}
// Where rehearsals go, on screen beside where the real cards go. A route
// nobody can see is a route nobody checks, and the topic a missing one
// used to fall back to was the customers' own.
const testRouteLink=r=>{if(!r)return '';const chat=String(r.chatId);return chat.startsWith('-100')?'https://t.me/c/'+chat.slice(4)+'/'+r.topic:'';};
function renderTestRoutes(){
 const find=kind=>claimTestRoutes.find(r=>r.kind===kind);
 const claim=find('claim'),listing=find('listing');
 $('claimTestTopicLink').value=testRouteLink(claim);
 $('listingTestTopicLink').value=testRouteLink(listing);
 $('claimTestRouteNow').textContent=claim?'Test claims post to '+(testRouteLink(claim)||('chat '+claim.chatId+' · topic '+claim.topic))+'.':'Not set up. Releasing a test claim is refused until it is, so a rehearsal can never land in the Claims topic buyers read.';
 $('listingTestRouteNow').textContent=listing?'Test listings post to '+(testRouteLink(listing)||('chat '+listing.chatId+' · topic '+listing.topic))+'.':'Not set up yet.';
}
function renderClaimOrders(){
 $('claimCheckoutSettings').hidden=false;renderResult();renderDeliveries();$('saleState').textContent=saleRunning?'● Claim sale running':'No claim sale running';$('saleState').classList.toggle('on',saleRunning);$('endSale').disabled=!saleRunning;
 const ready=$('claimReady'),list=$('claimOrders');ready.replaceChildren();list.replaceChildren();
 const groups=new Map();for(const s of claims)if(s.status==='awaiting_payment'&&!s.orderId&&s.claimantId){const g=groups.get(s.claimantId)||[];g.push(s);groups.set(s.claimantId,g);}
 for(const [buyer,rows] of groups){
  const card=el('article',undefined,'claimCard claimReadyCard'),total=rows.reduce((t,s)=>t+s.price,0),open=claimOrders.find(o=>o.buyerId===buyer&&claimOrderOpen(o));
  const who=claimBuyer(rows.find(s=>s.claimantName)?.claimantName,buyer);card.append(el('h3','Ready to send · '+who),el('p',rows.length+' approved '+(rows.length===1?'claim':'claims')+' · cards SGD '+money(total)),el('p',rows.map(s=>'#'+s.id+' '+s.name).join(' · '),'hint'));
  if(open)card.append(el('p','Buyer already has open order #'+open.id+'. Cancel it to send one combined order with these cards.','hint'));
  const actions=el('div',undefined,'claimActions');actions.append(claimOrderButton(null,'Send order to buyer',async()=>{
   if(!await confirmAction('Send order to '+who+'?','The bot DMs one combined total for these cards and asks mail or pickup.',rows.map(s=>({name:'Claim #'+s.id+' '+s.name,price:s.price,sale:s.price}))))return;
   const order=await api('claims',{action:'order-send',buyerId:buyer,commandKey:newID()});await loadClaims();status(order.dmStatus==='sent'?'Order #'+order.id+' sent to the buyer.':'Order #'+order.id+' created, but the DM failed: '+order.dmError,order.dmStatus!=='sent');
  }));card.append(actions);ready.append(card);
 }
 const visible=claimOrders.filter(o=>claimOrderOpen(o)||o.status==='paid'||Date.now()-Date.parse(o.updatedAt)<7*864e5);
 for(const o of visible){
  const card=el('article',undefined,'claimCard claimOrderCard'),heading=el('div',undefined,'claimCardHeading');
  const batch=o.fulfilment==='later';heading.append(el('h3',((o.lines||[]).some(l=>l.test)?'[test] ':'')+(batch?'Claim bill #':'Order #')+o.id+' · '+claimBuyer(o.buyerName,o.buyerId)),el('span',claimOrderStatusLabel(o),'claimStatus'));card.append(heading);
  for(const l of o.lines)card.append(el('p','#'+l.saleId+' '+l.name+' · '+(l.slab?'Slab · '+l.slab:l.condition)+' · SGD '+money(l.price)));
  const delivery=o.fulfilment==='later'?(o.deliveryId?'Delivery #'+o.deliveryId:'Cards only · how they get them is chosen when the sale ends'):o.fulfilment==='mail'?'Mailing SGD '+money(o.shipping):o.fulfilment==='pickup'?(claimCheckout?.pickupArea?'Self pickup at '+claimCheckout.pickupArea:'Self pickup')+' · free':'Delivery not chosen yet';
  card.append(el('p','Cards SGD '+money(o.items)+' · '+delivery+' · Total SGD '+money(o.total)+' · Ref CLAIM'+o.id,'claimOrderTotal'));
  if(o.address){const a=el('p','Mail to: '+o.address,'claimAddress');card.append(a);}
  if(claimOrderOpen(o)&&o.payBy&&!o.paymentProof){const by=new Date(o.payBy),late=by<=Date.now();card.append(el('p',(late?'⏳ Time is up; releasing the cards now':'⏳ Pay by '+by.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})+' or the cards go back on sale'),late?'rowerror':'hint'));}
  if(o.paymentProof)card.append(claimProofView(o));
  if(o.dmStatus==='failed')card.append(el('p','DM not delivered: '+(o.dmError||'unknown'),'rowerror'));
  const actions=el('div',undefined,'claimActions');
  if(o.status==='awaiting_payment')actions.append(claimOrderButton(o,'Confirm PayNow SGD '+money(o.total),()=>changeClaimOrder(o,'paid','Confirm PayNow for order #'+o.id)));
  if(o.status==='paid'&&o.fulfilment!=='later')actions.append(claimOrderButton(o,o.fulfilment==='mail'?'Mark mailed':'Mark collected',()=>changeClaimOrder(o,'shipped',(o.fulfilment==='mail'?'Mark mailed':'Mark collected')+' order #'+o.id)));
  if(claimOrderOpen(o))actions.append(claimOrderButton(o,'Resend to buyer',async()=>{const r=await api('claims',{action:'order-resend',orderId:o.id});await loadClaims();status(r.dmStatus==='sent'?'Order #'+o.id+' resent.':'DM failed: '+r.dmError,r.dmStatus!=='sent');}),claimOrderButton(o,'Cancel order',()=>changeClaimOrder(o,'cancel','Cancel order #'+o.id),true));
  if(actions.childElementCount)card.append(actions);list.append(card);
 }
 if(!groups.size&&!visible.length)list.append(el('p','No orders yet. Approved claims appear here, grouped by buyer.','empty'));
}
// The QR is uploaded as-is (prepared) so the server never crops it to a card shape.
$('checkoutQrFile').onchange=e=>task(async()=>{const file=e.target.files[0];e.target.value='';if(!file)return;const body=new FormData();body.append('photo',file,'paynow.jpg');body.append('prepared','true');const result=await api('upload',body);checkoutQr=result.photo;showCheckoutQr(file);status('QR uploaded. Save checkout settings to use it.');});
$('checkoutQrRemove').onclick=()=>{checkoutQr='';showCheckoutQr(null);status('QR removed. Save checkout settings to apply.');};
$('saveCheckout').onclick=()=>task(async()=>{const fee=cents($('checkoutMailFee').value.trim()||'0');if(fee===null)throw Error('Enter the mailing fee in SGD, for example 3.00.');const freeMailFrom=cents($('checkoutFreeMailFrom').value.trim()||'0');if(freeMailFrom===null)throw Error('Enter free mailing from in SGD, for example 100.00, or leave it empty.');const payMinutes=Number($('checkoutPayMinutes').value.trim()||'15');if(!Number.isInteger(payMinutes)||payMinutes<1||payMinutes>240)throw Error('Pay within must be 1 to 240 minutes.');const pushBatch=Number($('checkoutPushBatch').value.trim()||'1');if(!Number.isInteger(pushBatch)||pushBatch<1||pushBatch>20)throw Error('Post this many cards a round must be 1 to 20.');const pushSeconds=Number($('checkoutPushSeconds').value.trim()||'4');if(!Number.isInteger(pushSeconds)||pushSeconds<1||pushSeconds>600)throw Error('Wait between rounds must be 1 to 600 seconds.');claimCheckout=await api('claims',{action:'checkout',checkout:{mailFee:fee,paynow:$('checkoutPayNow').value.trim(),pickup:$('checkoutPickup').value.trim(),pickupArea:$('checkoutPickupArea').value.trim(),payMinutes,freeMailFrom,pushBatch,pushSeconds,paynowQr:checkoutQr}});fillCheckout();status('Checkout settings saved.');});
$('claimFilter').onchange=()=>renderClaims();
for(const b of document.querySelectorAll('[data-claimtab]'))b.onclick=()=>showClaimTab(b.dataset.claimtab);
$('claimSelectAll').onclick=()=>{for(const s of claimShown())claimPicked.add(s.id);renderClaims();};
$('claimBulkClear').onclick=()=>{claimPicked.clear();renderClaims();};
for(const b of claimBulkActions)$(b.id).onclick=()=>task(()=>runClaimBulk(b));
$('endSale').onclick=()=>task(async()=>{
 const live=claims.filter(s=>s.status==='open'&&['published','queued'].includes(s.publicationStatus)).length;
 if(!await confirmAction('End the claim sale?','Unsold cards ('+live+') stop taking claims and go back to the Claim queue for the next sale. Buyers with paid cards are asked once how to get them: the next card show, mail (+shipping), a meetup, or we keep them. Unpaid claims keep their 10-minute timer.',[]))return;
 const r=await claimWrite({action:'end-sale'});await loadClaims();status('Claim sale ended · '+r.unlisted+' unsold back to the queue · '+(r.deliveries||[]).length+' buyer(s) asked how to get their cards.');
});
$('refreshClaims').onclick=()=>task(async()=>{await loadClaims();status('Claims updated.');});
const saveTestRoute=(kind,field,what)=>task(async()=>{
 const topicLink=$(field).value.trim();
 if(!/^https:\/\/t\.me\/(?:c\/\d+|[A-Za-z0-9_]{5,32})\/\d+$/.test(topicLink))throw Error('Paste a topic link (t.me/c/…/…). A rehearsal needs a topic of its own, not a channel.');
 await api('claims',{action:'test-route',kind,topicLink});await loadClaims();status('Saved where test '+what+' post.');
});
$('saveClaimTestRoute').onclick=()=>saveTestRoute('claim','claimTestTopicLink','claims');
$('saveListingTestRoute').onclick=()=>saveTestRoute('listing','listingTestTopicLink','listings');
$('saveClaimRoute').onclick=()=>task(async()=>{
 const topicLink=$('claimTopicLink').value.trim();
 if(!/^https:\/\/t\.me\/(?:c\/\d+|[A-Za-z0-9_]{5,32})\/\d+$/.test(topicLink)&&!/^(?:@|(?:https:\/\/)?t\.me\/)[A-Za-z0-9_]{5,32}\/?$/.test(topicLink)&&!/^-100\d+$/.test(topicLink))throw Error('Paste a channel (@name or t.me/name) or a topic link.');
 await api('claims',{action:'route',topicLink});await loadClaims();status('Saved where claims post.');
});
function render(){
 // A rehearsal is listed in these tabs so somebody can clean it up, and
 // left out of their counts so it cannot nudge Available the way it did
 // on 17 Nov. The figures above it have never counted one.
 const averages=inventoryAverages();
 $('inboxCount').textContent=inboxUnread;$('cardshowCount').textContent=holdWaiting;$('draftCount').textContent=drafts.length;$('stockCount').textContent=stock.filter(r=>!r.sold&&!r.test).length;$('soldCount').textContent=stock.filter(r=>r.sold&&!r.test).length;
 document.querySelectorAll('[data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));
 $('batchCount').textContent=batches.length;const isBatch=tab==='carousell',isCentral=tab==='central',isClaim=tab==='claims',isQueue=tab==='queue',isBuyback=tab==='buybacks',isExpenses=tab==='expenses',isLedger=tab==='ledger',isGiveaway=tab==='giveaway',isInbox=tab==='inbox',isShow=tab==='cardshow',isPanel=isGiveaway||isBatch||isCentral||isClaim||isQueue||isBuyback||isExpenses||isLedger||isInbox||isShow;$('accountingPanel').hidden=!isExpenses;$('ledgerPanel').hidden=!isLedger;if(isLedger)openLedgerTab();$('giveawayPanel').hidden=!isGiveaway;if(isGiveaway){openGiveawayTab();renderGiveaway();}$('inboxPanel').hidden=!isInbox;if(isInbox)renderInbox();$('cardshowPanel').hidden=!isShow;if(isShow)renderCardshow();$('queuePanel').hidden=!isQueue;if(isQueue)renderQueue();$('buybackPanel').hidden=!isBuyback;['inventoryToolbar','inventoryTable'].forEach(id=>$(id).hidden=isPanel);$('carousellPanel').hidden=!isBatch;$('centralPanel').hidden=!isCentral;$('claimPanel').hidden=!isClaim;if(isClaim)renderClaims();if(isCentral)renderCentral();$('moveBuyback').hidden=tab!=='stock'&&tab!=='sold';$('makeBatch').hidden=limitedSeller||tab!=='stock';$('unassignedLabel').hidden=limitedSeller||tab!=='stock';if(isBatch){renderCollections();renderBatches();}
 $('listingOffersPanel').hidden=tab!=='stock';$('saveState').hidden=tab!=='drafts'&&tab!=='stock';$('addPanel').hidden=tab!=='drafts';$('publish').hidden=tab!=='drafts';$('moveToClaims').hidden=tab!=='drafts'&&tab!=='stock';$('sell').hidden=tab==='drafts';$('sell').textContent=tab==='sold'?'Edit sold price':'Mark sold';$('share').hidden=tab!=='stock';$('sellTogether').hidden=tab!=='stock';$('trade').hidden=limitedSeller||tab!=='stock';
 const rows=shown();inventoryPage=Math.min(inventoryPage,Math.max(0,Math.ceil(rows.length/inventoryPageSize)-1));
 $('inventoryPages').hidden=rows.length<=inventoryPageSize;
 $('pageSummary').textContent='Page '+(inventoryPage+1)+' of '+Math.max(1,Math.ceil(rows.length/inventoryPageSize))+' · '+rows.length+' entries';
 for(const [id,disabled] of [['previousPage',inventoryPage===0],['nextPage',(inventoryPage+1)*inventoryPageSize>=rows.length]]){$(id).disabled=disabled;$(id).dataset.fixed=String(disabled);}
 photoObserver.disconnect();$('rows').replaceChildren();$('empty').hidden=rows.length>0;
 rows.slice(inventoryPage*inventoryPageSize,(inventoryPage+1)*inventoryPageSize).forEach((r,index)=>{
  const tr=el('tr');tr.dataset.key=key(r);if(dirty.has(key(r)))tr.classList.add('dirty');
  const td=el('td',undefined,'rowSelect'),check=el('input');check.type='checkbox';check.checked=selected.has(key(r));check.setAttribute('aria-label','Select '+r.name);check.onchange=()=>{if(check.checked)selected.add(key(r));else selected.delete(key(r));counts();};td.append(check);tr.append(td);
  const card=el('td',undefined,'card');card.append(el('strong',(r.test?'[test] ':'')+(r.name||'Unnamed card')),el('small',(r.stockId?'Listing #'+r.stockId:'Row '+(drafts.indexOf(r)+1))+(r.cardId?' · SNKR '+r.cardId:' · Custom listing')+(r.test?' · test only, not for sale and not in your totals':'')));
  if(r.cardId){const isRift=r.cardId>=2000000000;const source=el('a',isRift?'Bilgewater ↗':'SNKRDUNK ↗');source.href=isRift?(r.websiteUrl||'https://bilgewatermarket.com/cards'):('https://snkrdunk.com/apparels/'+r.cardId);source.target='_blank';source.rel='noopener noreferrer';card.append(source);}else{const title=el('input');title.value=r.name;title.maxLength=180;title.setAttribute('aria-label','Custom listing name');title.disabled=r.sold;title.onchange=()=>{r.name=title.value.trim();dirty.add(key(r));render();};card.append(title);card.append(gameSelect(r));}
  // A note travels with the card to every listing it appears on, so it is
  // edited here next to the card rather than per place it is shown.
  {const details=el('details'),summary=el('summary','Note'+(r.notes?' · '+r.notes.slice(0,40):''));details.append(summary);const input=el('textarea');input.value=r.notes||'';input.maxLength=300;input.rows=2;input.placeholder='Back has light edge whitening';input.setAttribute('aria-label','Note on '+(r.name||'this card'));input.disabled=r.sold;input.oninput=()=>change(r,'notes',input.value);details.append(input,el('small','Optional, and buyers see it. For what the photos do not show — edge wear, a print line, a crease.'));card.append(details);}
  if(r.stockId&&!r.consignment){const details=el('details'),summary=el('summary','Included cards'+(r.included?' · Added':''));details.append(summary);const input=el('textarea');input.value=r.included||'';input.maxLength=1000;input.rows=3;input.placeholder='Charmander, Charmeleon, Charizard';input.setAttribute('aria-label','Included cards');input.disabled=r.sold;input.oninput=()=>change(r,'included',input.value);details.append(input,el('small','Optional. Card names or numbers, separated by commas. Buyers can search these.'));card.append(details);}
  const batch=batchFor(r);if(batch){const badge=el('button','Carousell · '+batch.name+' · '+batch.status,'batchBadge');badge.onclick=()=>{tab='carousell';selected.clear();render();document.getElementById('batch-'+batch.id)?.scrollIntoView({block:'start'});};card.append(badge);}
  const group=averages.get(inventoryGroupKey(r));if(group&&group.count+group.sold>1){const parts=[];if(group.count)parts.push(group.count+' copies · avg cost $'+money(Math.round(group.cost/group.count))+' · avg asking $'+money(Math.round(group.price/group.count)));if(group.sold)parts.push(group.sold+' sold · avg sale $'+money(Math.round(group.sales/group.sold)));card.append(el('small',parts.join(' / '),'groupAverages'));}
  // Somebody tapped Buy on this card's group post, so it is off the market
  // until it is paid for or let go. The release is here because the tap was
  // on a public post and nothing on that post can undo it.
  if(r.reserved&&!r.sold){const held=el('div',undefined,'heldRow');held.append(el('strong','🔒 Being bought by '+(r.reservedName||'a buyer')),el('small','Send them the bill in Telegram. Release it if they go quiet, and the post offers it again.'));const free=el('button','Release it','releaseHold');free.type='button';free.setAttribute('aria-label','Release '+(r.name||'this card')+' back onto the market');free.onclick=()=>task(()=>releaseHold(r));held.append(free);card.append(held);}
  if(r.sold){const edit=el('button','Sold for S$'+money(r.sale)+' · Edit','editSoldPrice');edit.type='button';edit.setAttribute('aria-label','Edit sold price for '+r.name);edit.onclick=()=>task(()=>editSales([r]));card.append(edit);}
  if(r.costBatchId)card.append(el('small','Buyback · '+r.costBatchLabel+' · batch #'+r.costBatchId));
  if(r.tradeIn)card.append(el('small','Trade received · cost carried forward'));
  // Shared stock is any seller's to work on, so a row has to say whose books
  // it belongs to before someone reprices what is not theirs alone.
  if(r.shared)card.append(el('small','Shared · the shop’s, not one seller’s'));
  if(r.consignment)card.append(el('small','Consignment · edit details in Telegram'));
  if(r.error)card.append(el('div',r.error,'rowerror'));tr.append(card);
  const cond=el('td',undefined,'conditionCell'),sel=el('select');cond.dataset.label='Condition / grade';sel.setAttribute('aria-label','Condition');
  ['M','NM','LP','MP','HP','Damaged','Slab'].forEach(v=>{const o=el('option',v);o.value=v;sel.append(o);});sel.value=r.condition;sel.disabled=r.sold||r.consignment;if(sel.disabled)sel.dataset.fixed='true';
  sel.onchange=()=>{change(r,'condition',sel.value);render();};cond.append(sel);
  if(r.condition==='Slab'){const grade=el('input');grade.className='grade';grade.placeholder='PSA 10';grade.value=r.slab||'';grade.disabled=r.sold||r.consignment;if(grade.disabled)grade.dataset.fixed='true';grade.onchange=()=>change(r,'slab',grade.value);cond.append(grade);}tr.append(cond);
  ['cost','price'].forEach(field=>{const cell=el('td',undefined,field+'Cell'),input=moneyInput(r,field);cell.dataset.label=field==='cost'?'Cost SGD · private':'Asking SGD';input.disabled=r.sold||r.consignment||(field==='cost'&&!!r.tradeIn);if(field==='cost'&&r.sold&&r.stockId&&!r.consignment&&!r.tradeIn)soldCostInput(r,input);if(input.disabled)input.dataset.fixed='true';cell.append(input);tr.append(cell);});
  tr.append(photoCell(r,0),photoCell(r,1));
  const actions=el('td');
  if(r.stockId){const link=el('a','Listing ↗');link.href='https://t.me/'+bot+'?start=listing_'+r.stockId;link.target='_blank';link.rel='noopener noreferrer';actions.append(link);const market=el('button','Marketplaces','marketplaceDetails');market.type='button';market.setAttribute('aria-label','Marketplaces for '+r.name);market.onclick=()=>task(()=>openMarketplaceListing(r));actions.append(market);}
  else{const dup=el('button','Duplicate','mini');dup.onclick=()=>{drafts.push({...r,id:newID(),revision:0,photos:[],error:''});dirty.add(key(drafts.at(-1)));selected.add(key(drafts.at(-1)));inventoryPage=Math.floor((drafts.length-1)/inventoryPageSize);render();};actions.append(dup);}
  actions.className='rowActions';tr.append(actions);$('rows').append(tr);
 });
 counts();if(busy)lock(true);
}
document.querySelectorAll('[data-tab]').forEach(n=>n.onclick=()=>{if(limitedSeller&&n.dataset.tab==='central')return;if(saveTimer)autosave(tab);buybackSelection=0;tab=n.dataset.tab;inventoryPage=0;selected.clear();$('filter').value='';$('all').checked=false;
 // Fetched when the tab is first opened rather than at sign-in: it reads every
 // seller's stock, and most visits here never ask for it.
 if(tab==='buybacks')task(loadLots);else if(tab==='inbox'&&!inboxLoaded)task(loadInbox);else if(tab==='cardshow'&&!holdLoaded)task(loadCardshow);else if(tab==='central'&&!centralLoaded)task(loadCentral);else if((tab==='claims'||tab==='queue')&&!claimsLoaded)task(loadClaims);else{render();if(tab==='stock'&&!listingOffersLoaded)loadListingOffers().catch(e=>status(e.message,true));}});
$('centralSeller').onchange=()=>{centralOwner=$('centralSeller').value;render();};
$('centralFilter').oninput=()=>renderCentral();
$('centralRefresh').onclick=()=>task(async()=>{await loadCentral();status('Combined inventory updated.');});
$('previousPage').onclick=()=>{if(busy||inventoryPage===0)return;inventoryPage--;render();};
$('nextPage').onclick=()=>{if(busy)return;inventoryPage++;render();};
$('filter').oninput=()=>{inventoryPage=0;render();};
$('unassigned').onchange=()=>{selected.clear();render();};
$('all').onchange=()=>{shown().forEach(r=>{$('all').checked?selected.add(key(r)):selected.delete(key(r));});render();};
function addCard(card,paint=true){const row={id:newID(),revision:0,cardId:card.id,name:card.name,condition:'NM',slab:'',cost:0,price:0,photos:[]};drafts.push(row);dirty.add(key(row));selected.add(key(row));if(paint){inventoryPage=Math.floor((drafts.length-1)/inventoryPageSize);render();}}
const searchCache=new Map(),referenceLoads=new Map();
async function referenceURL(card){
 if(card.thumbnailUrl)return card.thumbnailUrl;
 if(!referenceLoads.has(card.id)){
  const session=token;
  const promise=photoSlot(async()=>{if(session!==token)return '';const result=await api('reference',{cardId:card.id});if(session!==token)return '';const url=new URL(result.imageURL);if(url.protocol!=='https:'||url.hostname!=='bilgewatermarket.com'||!url.pathname.startsWith('/assets/'))return '';card.thumbnailUrl=url.href;return url.href;}).catch(()=>{referenceLoads.delete(card.id);return '';});
  referenceLoads.set(card.id,promise);
  if(referenceLoads.size>300)referenceLoads.delete(referenceLoads.keys().next().value);
 }
 return referenceLoads.get(card.id);
}
async function loadReference(card,target){
 const url=await referenceURL(card);if(!url||!target.isConnected)return;
 const img=el('img');img.alt=card.name+' · reference image';img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.onerror=()=>target.replaceChildren(el('span','No image'));img.src=url;target.replaceChildren(img);
}

function bindCatalogueSearch(input,results,selectCard,actionLabel){
 let timer,abort,sequence=0;
 const referenceTargets=new WeakMap();
 const referenceObserver=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){referenceObserver.unobserve(e.target);const card=referenceTargets.get(e.target);if(card)loadReference(card,e.target);}}, {rootMargin:'100px'});
 function clearResults(){
  ++sequence;clearTimeout(timer);abort?.abort();referenceObserver.disconnect();results.replaceChildren();
 }
 const message=text=>results.replaceChildren(el('p',text,'search-hint'));
 function appendSearchCards(cards){
  for(const c of cards){
   const n=el('button');n.type='button';n.className='card-result';n.disabled=busy;
   const visual=el('span','No image');visual.className='card-result-image';if(c.brandId==='riftbound'&&!c.thumbnailUrl){referenceTargets.set(visual,c);referenceObserver.observe(visual);}
   try{const url=new URL(c.thumbnailUrl);if(url.protocol==='https:'&&(url.hostname==='cdn.snkrdunk.com'||(url.hostname==='bilgewatermarket.com'&&url.pathname.startsWith('/assets/')))){
    const img=el('img');img.alt=c.name;img.loading='lazy';img.decoding='async';img.referrerPolicy='no-referrer';img.src=url.href;
    img.onerror=()=>visual.replaceChildren(document.createTextNode('No image'));
    visual.replaceChildren(img);
   }}catch{}
   const label=el('span');label.className='card-result-label';label.append(el('strong',c.name),el('small',[c.productNumber,'#'+c.id].filter(Boolean).join(' · ')),el('span',actionLabel));
   if(c.brandId==='riftbound'){const price=c.referencePrice==null?'Unavailable':c.referenceCurrency+' '+Number(c.referencePrice).toFixed(2);label.append(el('small','Bilgewater reference: '+price+(c.referenceSGD==null?'':' ≈ S$'+Number(c.referenceSGD).toFixed(2)+' (FX '+c.referenceFXDate+', Frankfurter)')+(c.referenceObserved?' · '+new Date(c.referenceObserved).toLocaleDateString():'')));}
   n.append(visual,label);n.onclick=()=>{if(busy)return;selectCard(c);};results.append(n);
  }
 }
 function addSearchMore(query,seq,offset){
  const more=el('button','Show more matches','searchMore');more.type='button';results.append(more);
  more.onclick=async()=>{if(busy||seq!==sequence)return;more.disabled=true;more.textContent='Loading…';
   try{abort=new AbortController();const cards=await api('search',{query,offset},false,abort.signal);if(seq!==sequence)return;more.remove();appendSearchCards(cards);if(cards.length===40)addSearchMore(query,seq,offset+40);}
   catch(e){if(seq===sequence&&e.name!=='AbortError'){more.textContent='Retry more matches';status(e.message,true);}}
   finally{more.disabled=false;}
  };
 }
 function cachedSearch(query){
  const entry=searchCache.get(query.toLowerCase());return entry&&Date.now()-entry.time<300000?entry:null;
 }
 input.oninput=()=>{
  clearResults();const seq=sequence,query=input.value.trim(),cacheKey=query.toLowerCase();
  results.hidden=false;
  if(query.length<2)return;
  message('Searching…');
  const run=async()=>{
   try{
    const cached=cachedSearch(query);
    abort=new AbortController();
    const cards=cached?cached.cards:await api('search',{query},false,abort.signal);if(seq!==sequence)return;
    searchCache.delete(cacheKey);searchCache.set(cacheKey,{cards,time:cached?cached.time:Date.now()});
    while(searchCache.size>50)searchCache.delete(searchCache.keys().next().value);
    results.replaceChildren();if(!cards.length){message('No cards found. Try a name or card number.');return;}
    appendSearchCards(cards);if(cards.length===40)addSearchMore(query,seq,40);
   }catch(e){if(seq===sequence&&e.name!=='AbortError')message(e.message+' — type again to retry.');}
  };
  if(cachedSearch(query))run();else timer=setTimeout(run,150);
 };
 input.onkeydown=e=>{if(e.key==='ArrowDown'){const first=results.querySelector('button:not(:disabled)');if(first){e.preventDefault();first.focus();}}if(e.key==='Escape')results.hidden=true;};
 input.onfocus=()=>{results.hidden=false;};
 results.onkeydown=e=>{
  const buttons=[...results.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
  if(e.key==='Escape'){e.preventDefault();input.focus();results.hidden=true;}
  if(i>=0&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();const next=i+(e.key==='ArrowDown'?1:-1);if(next<0)input.focus();else buttons[Math.min(next,buttons.length-1)].focus();}
 };
 return clearResults;
}
const clearNormalResults=bindCatalogueSearch($('search'),$('results'),openQuickEntry,'+ Add card');
$('addLinks').onclick=()=>task(async()=>{
 const lines=$('links').value.split(/[\n,]+/).map(s=>s.trim()).filter(Boolean);
 if(lines.length>100)throw Error('Add up to 100 links at once.');
 let added=0;const failures=[],matched=new Map();
 for(const line of lines){status('Matching '+(added+failures.length+1)+' / '+lines.length+'…');try{
  const match=line.match(/^(?:https:\/\/snkrdunk\.com\/apparels\/)?(\d+)\/?(?:\?.*)?$/);
  if(!match)throw Error('Use a product ID or SNKRDUNK card link');
  let card=matched.get(match[1]);if(!card){const cards=await api('search',{query:match[1]});card=cards.find(c=>String(c.id)===match[1]);if(card)matched.set(match[1],card);}
  if(!card)throw Error('Card not in the catalogue');addCard(card,false);added++;
 }catch(e){failures.push(line+': '+e.message);}}
 $('links').value=failures.map(s=>s.split(': ')[0]).join('\n');
 status(added+' rows added.'+(failures.length?' '+failures.length+' unmatched links left to review.':''),failures.length>0);
});
async function upload(row,index,file){
 const photo=await entryPhoto(file);const result={photo};
 const copy=[...(row.photos||[])];copy[index]=result.photo;
 // A back photo can be chosen before the front; keep the empty front slot visible.
 for(let i=0;i<copy.length;i++)if(!copy[i])copy[i]='';
 change(row,'photos',copy);
}
// A lot is one purchase: one price, many cards, and each card's cost is that
// price divided by the count. The preview does the division while they type,
// so the per-card figure is never a surprise after the lot is in.
function renderLotEntries(){
 const fragment=document.createDocumentFragment();
 lotEntries.forEach((entry,index)=>{
  const row=el('div',undefined,'lotEntry');row.append(el('strong',(index+1)+'. '+entry.name),el('small','Catalogue #'+entry.cardId));
  const condition=el('select');condition.setAttribute('aria-label','Condition for buyback entry '+(index+1));
  ['M','NM','LP','MP','HP','Damaged','Slab'].forEach(c=>condition.append(el('option',c)));condition.value=entry.condition;
  condition.onchange=()=>{entry.condition=condition.value;if(entry.condition!=='Slab')entry.slab='';renderLotEntries();};row.append(condition);
  if(entry.condition==='Slab'){const grade=el('input');grade.placeholder='PSA 10';grade.maxLength=80;grade.setAttribute('aria-label','Grade for buyback entry '+(index+1));grade.value=entry.slab;grade.oninput=()=>entry.slab=grade.value;row.append(grade);}
  const remove=el('button','Remove entry '+(index+1));remove.type='button';remove.onclick=()=>{if(busy)return;lotEntries.splice(index,1);renderLotEntries();};row.append(remove);fragment.append(row);
 });$('lotEntries').replaceChildren(fragment);lotPreview();
}
async function lotSearchPage(query,seq,offset=0){
 try{
  lotSearchAbort=new AbortController();const cards=await api('search',{query,offset},false,lotSearchAbort.signal);if(seq!==lotSearchSeq)return;
  $('lotResults').querySelector('.searchMore')?.remove();
  if(!cards.length&&!offset)$('lotResults').append(el('p','No matching cards. Try the card number.'));
  for(const card of cards){const button=el('button',card.name+' · #'+card.id);button.type='button';button.disabled=busy;button.onclick=()=>{if(busy)return;if(lotEntries.length>=2000){status('A buyback holds up to 2000 entries.',true);return;}lotEntries.push({cardId:card.id,name:card.name,condition:'NM',slab:''});renderLotEntries();};$('lotResults').append(button);}
  if(cards.length===40){const more=el('button','Show more matches','searchMore');more.type='button';more.disabled=busy;more.onclick=()=>{if(busy)return;more.disabled=true;lotSearchPage(query,seq,offset+40).finally(()=>more.disabled=false);};$('lotResults').append(more);}
 }catch(e){if(seq===lotSearchSeq&&e.name!=='AbortError')status(e.message,true);}
}
$('lotSearch').oninput=()=>{
 clearTimeout(lotSearchTimer);lotSearchAbort?.abort();const seq=++lotSearchSeq,query=$('lotSearch').value.trim();$('lotResults').replaceChildren();if(query.length<2)return;
 lotSearchTimer=setTimeout(()=>lotSearchPage(query,seq),150);
};
function lotCents(){const v=$('lotTotal').value.trim();if(!/^\d+(\.\d{1,2})?$/.test(v))return -1;const c=Math.round(Number(v)*100);return Number.isSafeInteger(c)?c:-1;}
function lotPreview(){
 const n=lotEntries.length,total=lotCents();
 if(!n){$('lotSummary').textContent='Add catalogue entries to the buyback.';return;}
 if(total<0){$('lotSummary').textContent=n+' card'+(n===1?'':'s')+' \u00b7 enter the total paid.';return;}
 // The remainder is spread a cent at a time over the cards at the front, which
 // is what the host does, so the parts add back up to what was paid.
 const base=Math.floor(total/n),extra=total%n;
 $('lotSummary').textContent=n+' card'+(n===1?'':'s')+' at $'+money(base)+' each'+(extra?', $'+money(base+1)+' for the first '+extra:'')+' \u00b7 $'+money(total)+' total';
}
$('lotTotal').oninput=lotPreview;
$('lotPanel').ontoggle=()=>{if($('lotPanel').open&&token)task(loadLots);};
let moveBuybackRows=[],moveBuybackPreview=null,moveBuybackBusy=false;
function resetMovePreview(){moveBuybackPreview=null;$('moveBuybackPreview').replaceChildren();$('moveBuybackConfirm').hidden=true;$('moveBuybackReview').hidden=false;$('moveBuybackError').textContent='';$('moveBuybackNameLabel').hidden=$('moveBuybackTarget').value!=='0';}
function moveInput(){return {rows:moveBuybackRows.map(r=>({id:r.stockId,revision:r.revision})),target:Number($('moveBuybackTarget').value),label:$('moveBuybackName').value.trim()};}
$('moveBuyback').onclick=()=>task(async()=>{
 const rows=picked();
 if(rows.some(r=>dirty.has(key(r))))throw Error('Save your selected listings before moving them.');
 if(rows.some(r=>r.tradeIn||r.consignment))throw Error('Trade-linked and consignment listings cannot be moved into buyback batches.');
 const d=await api('lot',{action:'settings'});moveBuybackRows=rows;
 const select=$('moveBuybackTarget');select.replaceChildren();const fresh=el('option','Create a new batch');fresh.value='0';select.append(fresh);
 for(const l of d.lots||[]){if(!!l.shared!==!!rows[0].shared)continue;const o=el('option',l.label+' · #'+l.id+' · '+l.units+' cards');o.value=l.id;select.append(o);}
 $('moveBuybackName').value=d.nextLabel||'';$('moveBuybackCount').textContent=rows.length+' selected listing'+(rows.length===1?'':'s')+' · includes '+rows.filter(r=>r.sold).length+' sold. '+rows.slice(0,5).map(r=>r.name+' (#'+r.stockId+')').join(', ')+(rows.length>5?' …':'');resetMovePreview();$('moveBuybackDialog').showModal();
});
$('moveBuybackTarget').onchange=resetMovePreview;$('moveBuybackName').oninput=resetMovePreview;
$('moveBuybackCancel').onclick=()=>{if(!moveBuybackBusy)$('moveBuybackDialog').close();};
$('moveBuybackDialog').addEventListener('cancel',e=>{if(moveBuybackBusy)e.preventDefault();});
async function moveBuybackAction(commit){
 if(moveBuybackBusy||busy)return;moveBuybackBusy=true;lock(true);
 const controls=[...$('moveBuybackDialog').querySelectorAll('button,input,select')];controls.forEach(n=>n.disabled=true);
 try{
 const input=moveInput();if(commit){if(!moveBuybackPreview)throw Error('Review the move first.');input.previewKey=moveBuybackPreview.key;}
 const result=await api('lot',{action:'move',move:input});
 if(commit){$('moveBuybackDialog').close();selected.clear();await load(true);await loadLots();status('Moved '+result.count+' listings. Open Buyback batches to see the updated totals.');}
 else{
 moveBuybackPreview=result;const root=$('moveBuybackPreview');root.replaceChildren(el('p',result.count+' listings will move · recorded cost SGD '+money(result.cost)+' · recorded sales SGD '+money(result.sales)));
 for(const c of result.changes)root.append(el('p',c.label+': '+c.beforeUnits+' → '+c.afterUnits+' cards · batch cost SGD '+money(c.beforeCost)+' → '+money(c.afterCost)));
 root.append(el('p','This groups existing inventory only. It does not create listings or post to Telegram.','hint'));$('moveBuybackConfirm').hidden=false;$('moveBuybackReview').hidden=true;
 }
 }catch(e){resetMovePreview();$('moveBuybackError').textContent=e.message;}
 finally{moveBuybackBusy=false;lock(false);controls.forEach(n=>n.disabled=false);if(!$('workspace').hidden)render();}
}
$('moveBuybackReview').onclick=()=>moveBuybackAction(false);$('moveBuybackConfirm').onclick=()=>moveBuybackAction(true);
let buybackLots=[];
$('buybackFilter').oninput=renderBuybacks;
$('refreshBuybacks').onclick=()=>task(loadLots);
$('newBuyback').onclick=()=>{buybackSelection=0;tab='drafts';render();$('lotPanel').open=true;$('lotSearch').focus();};
function renderBuybacks(){
 const root=$('buybackReports');root.replaceChildren();
 const query=$('buybackFilter').value.trim().toLowerCase();
 const matches=buybackLots.filter(l=>(l.label+' '+l.id).toLowerCase().includes(query));
 if(!matches.length){root.append(el('p','No matching buyback batches.'));return;}
 for(const l of matches){
 const section=el('details',undefined,'buybackReport');
 section.append(el('summary',l.label+' · '+l.sold+'/'+l.units+' sold · '+l.held+' remaining'));
 const stats=el('div',undefined,'totals');
 for(const [label,value] of [['Batch cost',l.total],['Sales recorded',l.revenue],['Sales less entire batch cost',l.revenue-l.total],['Gross profit on sold cards',l.revenue-l.soldCost],['Remaining asking total',l.remainingAsk]]){const card=el('div',undefined,'stat');card.append(el('span',label),el('strong','SGD '+money(value)));stats.append(card);}
 section.append(stats,el('p',l.revenue>=l.total?'Purchase cost recovered from recorded sales.':'SGD '+money(l.total-l.revenue)+' of purchase cost still to recover.'));
 section.append(el('p',l.unpriced+' remaining cards have no asking price. '+l.removed+' removed; '+l.traded+' traded out. Trades are not cash sales.','hint'));
 section.append(el('p','Sold-card profit uses the allocated card costs. The whole-batch result deducts the current batch cost once, including removed or traded cards. Moving listings between batches carries their recorded cost between the batch totals.','hint'));
 for(const [label,destination] of [['View remaining cards','stock'],['View sold cards','sold']]){const button=el('button',label);button.onclick=()=>{tab=destination;inventoryPage=0;selected.clear();buybackSelection=l.id;$('filter').value='';$('unassigned').checked=false;$('all').checked=false;render();status('Showing '+l.label+'. Select the Available or Sold tab to show all batches.');};section.append(button);}
 root.append(section);
 }
}
async function loadLots(){
 const d=await api('lot',{action:'settings'});
 buybackLots=d.lots||[];renderBuybacks();if(!$('lotLabel').value)$('lotLabel').value=d.nextLabel||'';
 $('lots').replaceChildren();
 for(const l of (d.lots||[]).slice(0,8))$('lots').append(el('p',l.label+' \u00b7 '+l.units+' card'+(l.units===1?'':'s')+' for $'+money(l.total)+' \u00b7 '+l.held+' still held'+(l.shared?' \u00b7 shared':''),'hint'));
}
$('createLot').onclick=()=>task(async()=>{
 const n=lotEntries.length,total=lotCents(),shared=$('lotShared').checked;
 if(!n)throw Error('Add catalogue entries to the buyback.');
 if(lotEntries.some(e=>e.condition==='Slab'&&!e.slab.trim()))throw Error('Enter the grade for every slab.');
 if(total<0)throw Error('Enter the total paid, in dollars and cents.');
 if(!$('lotLabel').value.trim())throw Error('Name the lot, so you can find it later.');
 if(!await confirmAction('Take in '+n+' card'+(n===1?'':'s')+'?',$('lotSummary').textContent+'\n\n'+(shared?'Shared: the cost and the takings sit in the shop\u2019s own column, and all three of you can list and sell from it.':'Yours: the cost and the takings sit in your own column.')+'\nThe cards arrive with no asking price, so nothing is posted until you price them.',[]))return;
 const r=await api('lot',{action:'create',label:$('lotLabel').value,total,entries:lotEntries,shared});
 lotEntries=[];$('lotEntries').replaceChildren();$('lotSearch').value='';$('lotResults').replaceChildren();++lotSearchSeq;clearTimeout(lotSearchTimer);lotSearchAbort?.abort();$('lotTotal').value='';$('lotLabel').value='';lotPreview();
 status('Took in '+r.lot.units+' card'+(r.lot.units===1?'':'s')+' as '+r.lot.label+'.');
 await loadLots();await load(true);
});
$('bulkPhotos').onchange=()=>task(async()=>{
 let count=0;const files=[...$('bulkPhotos').files],failed=Array(files.length).fill(false),seen=new Set(),jobs=[];
 for(const [index,file] of files.entries()){const m=file.name.match(/^(\d+)-(front|back|0?[12])\.(jpe?g|png)$/i);
  if(!m||!drafts[Number(m[1])-1]){failed[index]=true;continue;}
  const slot=m[2].toLowerCase()==='front'?0:m[2].toLowerCase()==='back'?1:Number(m[2])-1;
  const k=Number(m[1])+'-'+slot;if(seen.has(k)){failed[index]=true;continue;}seen.add(k);
  jobs.push({index,file,row:drafts[Number(m[1])-1],slot});
 }
 let next=0;
 await Promise.all(Array.from({length:Math.min(2,jobs.length)},async()=>{
  while(next<jobs.length){const {index,file,row,slot}=jobs[next++];
   try{await upload(row,slot,file);count++;status('Uploaded '+count+' photos…');}catch{failed[index]=true;}
  }
 }));
 const errors=files.filter((_,index)=>failed[index]).map(file=>file.name);
 render();$('bulkPhotos').value='';status(count+' photos matched.'+(errors.length?' Could not match: '+errors.join(', '):''),errors.length>0);
});
function picked(){const rows=(tab==='drafts'?drafts:stock).filter(r=>selected.has(key(r)));if(!rows.length)throw Error('Select at least one row.');if(rows.length>100)throw Error('Select up to 100 rows.');return rows;}
// A custom listing has no catalogue card to name its game, so the shop filter
// and the Telegram topic it posts to follow this choice. An unset one is
// treated as Pokémon, as before.
function gameSelect(r){const sel=el('select');sel.setAttribute('aria-label','Game for '+r.name);for(const [v,t] of [['pokemon','Pokémon'],['riftbound','Riftbound']]){const o=el('option',t);o.value=v;sel.append(o);}sel.value=r.game||'pokemon';sel.disabled=!!r.sold||!!r.consignment;if(sel.disabled)sel.dataset.fixed='true';sel.onchange=()=>change(r,'game',sel.value);return sel;}
function payload(r){const out={id:r.id||'',revision:r.revision,cardId:r.cardId,name:r.name,condition:r.condition,slab:r.slab||'',cost:r.cost,price:r.price,photos:r.photos||[],notes:r.notes||'',game:r.cardId?'':(r.game||'')};if(r.stockId){out.included=r.included||'';out.stockId=r.stockId;out.sold=r.sold;out.sale=r.sale||0;out.consignment=r.consignment;}return out;}
async function saveRows(rows,which=tab,redraw=true){
 validateRows(rows);
 const sent=structuredClone(rows.map(payload));
 const result=await api(which==='drafts'?'drafts':'stock',{rows:sent,action:'save'});
 result.forEach((out,i)=>{const row=rows[i];row.error=out.error||'';if(!out.error){const unchanged=JSON.stringify(payload(row))===JSON.stringify(sent[i]);if(which==='drafts')row.revision=out.revision;else row.revision++;if(unchanged){row.stockDirty=false;if(!row.saleDirty)dirty.delete(key(row));}}});
 if(redraw)render();
 return result.every(r=>!r.error);
}
// Autosave. There is no Save button any more: an edit schedules a write and a
// second of quiet sends it.
//
// It deliberately does not go through task(). task() disables every field in
// the workspace, which is right for a button you pressed and unusable while
// you are still typing in one of them. For the same reason a finished save
// does not redraw the table: it updates the dirty marks and the row messages
// in place, so the cursor stays where you left it.
let saveTimer=null,saving=false,saveAgain=false,saveFlight=Promise.resolve();
const savableRows=which=>(which==='drafts'?drafts:stock).filter(r=>dirty.has(key(r))&&!r.sold);
const priceBroken=r=>Object.keys(r.invalidPrices||{}).length>0;
function showSaveState(text,bad=false){const n=$('saveState');if(!n)return;n.textContent=text;n.classList.toggle('saveFailed',bad);}
// counts() already keeps the checkboxes and the dirty highlight current, so
// the row's own message is the only other thing a save changes.
function refreshRowState(){
 counts();
 const list=tab==='drafts'?drafts:stock;
 document.querySelectorAll('#rows tr').forEach(tr=>{
  const r=list.find(x=>key(x)===tr.dataset.key),card=tr.querySelector('td.card');
  if(!r||!card)return;
  const line=[...card.children].find(n=>n.classList.contains('rowerror'));
  if(r.error&&line)line.textContent=r.error;
  else if(r.error)card.append(el('div',r.error,'rowerror'));
  else if(line)line.remove();
 });
}
function scheduleSave(which=tab){
 if(which!=='drafts'&&which!=='stock')return;
 clearTimeout(saveTimer);
 const waiting=savableRows(which).length;
 if(waiting&&which===tab)showSaveState(waiting===1?'1 edit not saved':waiting+' edits not saved');
 saveTimer=setTimeout(()=>autosave(which),900);
}
async function autosave(which){
 clearTimeout(saveTimer);
 // A task has the workspace locked. The rows are still dirty and this is
 // the only timer they have, so it has to be re-armed rather than
 // dropped: dropping it lost the edit until something else saved.
 if(busy){scheduleSave(which);return;}
 if(saving){saveAgain=true;return;}
 const rows=savableRows(which);
 if(!rows.length){showSaveState('');return;}
 const broken=rows.filter(priceBroken);
 broken.forEach(r=>r.error='Fix the invalid SGD amount.');
 // A hundred is what one request carries; anything over that comes back round.
 const ready=rows.filter(r=>!priceBroken(r)).slice(0,100);
 if(!ready.length){showSaveState('Fix the invalid amount to save',true);refreshRowState();return;}
 saving=true;showSaveState('Saving…');
 let ok=false,failure='';
 try{saveFlight=saveRows(ready,which,false);ok=await saveFlight;}
 catch(e){failure=e.message;}
 saving=false;saveAgain=false;
 if(failure)showSaveState(failure,true);
 else if(broken.length)showSaveState('Fix the invalid amount to save',true);
 else showSaveState(ok?'All changes saved':'Some rows need attention',!ok);
 refreshRowState();
 if(!failure&&ok&&savableRows(which).some(r=>!priceBroken(r)))scheduleSave(which);
}
function confirmAction(title,text,rows){return new Promise(resolve=>{
 $('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirmCards').replaceChildren();
 rows.forEach(r=>$('confirmCards').append(el('div',(r.stockId?'#'+r.stockId+' ':'')+r.name+' · '+(title.startsWith('Mark')?'sold $'+money(r.sale):'$'+money(r.price)))));
 $('confirm').showModal();
 const finish=value=>{$('confirm').close();resolve(value);};
 $('confirmNo').onclick=()=>finish(false);$('confirmYes').onclick=()=>finish(true);$('confirm').oncancel=e=>{e.preventDefault();finish(false);};
});}
// Batch move drafts into claim sales. The claim price defaults to a % of each
// card's cost (rounded to whole dollars if ticked); any card's
// price can be overridden and the % then leaves it alone.
function claimMovePrice(price,pct,round){const raw=Math.round(price*pct/100);return round?Math.max(100,Math.round(raw/100)*100):Math.max(1,raw);}
function openClaimMove(rows,fromStock=false){
 const key=newID(),touched=new Set(),list=$('claimMoveRows');list.replaceChildren();$('claimMoveError').textContent='';$('claimMoveTest').checked=fromStock&&rows.length>0&&rows.every(r=>r.test);$('claimMovePct').value='100';$('claimMoveRound').checked=false;
 const one=rows.length===1;$('claimMoveCount').textContent=fromStock?rows.length+(one?' listing leaves Available and waits':' listings leave Available and wait')+' in the Claim queue. Any shop-topic post comes down; nothing is posted until you release the claim sale.':rows.length+(one?' draft leaves Drafts and waits':' drafts leave Drafts and wait')+' in the Claim queue. Nothing is posted until you release the claim sale.';
 const inputs=rows.map(r=>{const row=el('div',undefined,'claimMoveRow'),input=el('input');input.inputMode='decimal';input.setAttribute('aria-label','Claim price for '+r.name+' in SGD');input.oninput=()=>touched.add(input);row.append(el('span',r.name,'claimMoveName'),el('span',r.costHidden||r.cost==null?'Cost unavailable':'Cost SGD '+money(r.cost),'hint'),input);list.append(row);return input;});
 const fill=()=>{const pct=Number($('claimMovePct').value);rows.forEach((r,i)=>{if(!touched.has(inputs[i]))inputs[i].value=pct>0&&!r.costHidden&&r.cost>0?money(claimMovePrice(r.cost,pct,$('claimMoveRound').checked)):'';});};
 $('claimMovePct').oninput=fill;$('claimMoveRound').onchange=fill;fill();
 $('claimMoveCancel').onclick=()=>$('claimMove').close();
 $('claimMoveGo').onclick=()=>task(async()=>{
  const moves=[];for(const [i,r] of rows.entries()){const price=cents(inputs[i].value.trim());if(!price){$('claimMoveError').textContent='Enter a claim price for '+r.name+'.';inputs[i].focus();return;}moves.push({id:fromStock?r.stockId:r.id,revision:r.revision,price});}
  const result=await api('claims',fromStock?{action:'from-stock',commandKey:key,test:$('claimMoveTest').checked,stockMoves:moves}:{action:'from-drafts',commandKey:key,test:$('claimMoveTest').checked,moves});
  const failed=result.filter(x=>x.error);$('claimMove').close();claimsLoaded=false;selected.clear();await load(true);
  status((result.length-failed.length)+' moved to the Claim queue. Release them from the Claim queue tab when the claim sale starts.'+(failed.length?' '+failed.length+' failed: '+failed.map(f=>f.error).join('; '):''),failed.length>0);
 });
 $('claimMove').showModal();
}
$('moveToClaims').onclick=()=>task(async()=>{const rows=picked();if(!rows.length)throw Error('Select the cards to move first.');if(tab==='stock'){if(dirty.size&&rows.some(r=>dirty.has(key(r))))throw Error('Save your changes to these listings first.');openClaimMove(rows,true);return;}if(!await saveRows(rows)){status('Fix the highlighted rows first.',true);return;}openClaimMove(rows.map(r=>drafts.find(d=>d.id===r.id)||r));});
$('publish').onclick=()=>task(async()=>{
 const rows=picked();if(!await saveRows(rows)){status('Fix the highlighted rows first.',true);return;}
 const invalid=rows.filter(r=>r.price<=0||![0,1,2,10].includes(r.photos.length)||(r.photos.length!==2&&r.photos.some(p=>!p)));if(invalid.length)throw Error('Each card needs an asking price. Photos are optional.');
 if(!await confirmAction('Publish '+count(rows.length,'listing')+'?','These will appear in the shop. Telegram posts wait until you release them. Costs stay private.',rows))return;
 const result=await api('publish',{rows:rows.map(payload)});const failures=new Set(result.filter(r=>r.error).map(r=>r.id));
 result.forEach((r,i)=>{if(r.error)rows[i].error=r.error;});
 const failed=rows.filter(r=>failures.has(r.id));
 await load(true);
 failed.forEach(r=>{const d=drafts.find(d=>d.id===r.id);if(d)d.error=r.error;});render();
 status(count(rows.length-failures.size,'listing')+' added to the shop; awaiting Telegram release.'+(failures.size?' Some rows failed; check messages.':''),failures.size>0);
});

async function loadCentral(){
 // The server is the real gate and answers a seller with 403; this is here so
 // a hidden tab is not the only thing standing in the way on the client, and
 // so clicking one by hand asks nothing of the server at all.
 if(limitedSeller)throw Error('The combined inventory is owner-only.');
 const data=await api('central');
 centralRows=data.stock||[];centralSellers=data.sellers||[];centralTotals=data.totals||null;centralLoaded=true;
 if(centralOwner!=='all'&&!centralSellers.some(s=>String(s.owner)===centralOwner))centralOwner='all';
}
function centralShown(){
 const needle=$('centralFilter').value.trim().toLowerCase();
 return centralRows.filter(r=>centralOwner==='all'||String(r.owner)===centralOwner)
  .filter(r=>!needle||(r.name+' '+(r.costBatchLabel||'')+' '+(r.included||'')+' '+r.cardId+' '+(r.stockId||'')).toLowerCase().includes(needle));
}
function renderCentral(){
 $('centralCount').textContent=centralRows.length;
 const chosen=centralSellers.find(s=>String(s.owner)===centralOwner);
 // The headline follows the filter: a figure for the whole shop sitting above
 // one seller's rows is the kind of number somebody quotes by mistake.
 const t=chosen||centralTotals;
 // A seller row is marshalled with lower-case keys and ShopTotals with its Go
 // field names, so each figure is read under both spellings.
 $('centralTotals').replaceChildren();
 if(t)for(const [label,value] of [['On the shelf',t.inventoryCost??t.InventoryCost],['Sales',t.revenue??t.Revenue],['Spent',t.spent??t.Spent]]){
  const box=el('div',undefined,'stat');box.append(el('span',label),el('strong','$'+money(value)));$('centralTotals').append(box);
 }
 if(t){const box=el('div',undefined,'stat');box.append(el('span','Cards'),el('strong',String((t.units??t.Units)??0)));$('centralTotals').append(box);}
 const picker=$('centralSeller');
 if(picker.options.length!==centralSellers.length+1||picker.dataset.owners!==centralSellers.map(s=>s.owner).join(',')){
  picker.replaceChildren();
  const all=el('option','Everyone');all.value='all';picker.append(all);
  for(const s of centralSellers){const o=el('option',s.seller+' · '+s.units+(s.units===1?' card':' cards'));o.value=String(s.owner);picker.append(o);}
  picker.dataset.owners=centralSellers.map(s=>s.owner).join(',');
 }
 picker.value=centralOwner;
 const rows=centralShown();
 $('centralRows').replaceChildren();$('centralEmpty').hidden=rows.length>0;
 $('centralEmpty').textContent=centralLoaded?'No cards match this filter.':'Loading the combined inventory…';
 for(const r of rows){
  const tr=el('tr');
  tr.append(el('td',r.seller,'centralSeller'));
  const card=el('td',undefined,'card');card.append(el('strong',r.name||'Unnamed card'),el('small','Listing #'+r.stockId+(r.cardId?' · SNKR '+r.cardId:' · Custom listing')+(r.included?' · includes '+r.included:'')));
  tr.append(card);
  tr.append(el('td',[r.condition,r.slab].filter(Boolean).join(' · ')));
  tr.append(el('td','S$'+money(r.cost)));
  tr.append(el('td','S$'+money(r.sold?r.sale:r.price)));
  tr.append(el('td',r.sold?'Sold':r.consignment?'Consignment':'Available'));
  $('centralRows').append(tr);
 }
}
function renderAccounting(){
 $('expenses').replaceChildren();$('trades').replaceChildren();
 for(const e of expenses){const row=el('p');row.append(el('span',e.date+' · '+e.description+' · S$'+money(e.amount)+' '));const edit=el('button','Edit'),remove=el('button','Delete');edit.onclick=()=>editExpense(e);remove.onclick=()=>task(async()=>{if(!await confirmAction('Delete expense?',e.description+' · S$'+money(e.amount),[]))return;await api('expense',{expense:e,remove:true});await load(true);status('Expense removed.');});row.append(edit,remove);$('expenses').append(row);}
 for(const t of trades){const d=el('details');d.append(el('summary',t.date.slice(0,10)+' · Trade · cost S$'+money(t.basis)));d.append(el('p','Cash '+(t.cash<0?'received':'paid')+': S$'+money(Math.abs(t.cash))+(t.details.note?' · '+t.details.note:'')));for(const r of t.details.out)d.append(el('p','Gave: '+r.name+' · cost S$'+money(r.cost)));for(const r of t.details.in)d.append(el('p','Received: '+r.name+' · carried cost S$'+money(r.cost)));$('trades').append(d);}
}
function editExpense(existing){task(async()=>{
 const expense=await new Promise(resolve=>{
  $('expenseDate').value=existing?.date||new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Singapore',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());$('expenseDescription').value=existing?.description||'';$('expenseAmount').value=existing?money(existing.amount):'';$('expenseError').textContent='';$('expenseDialog').showModal();
  const done=v=>{$('expenseDialog').close();resolve(v);};$('expenseCancel').onclick=()=>done(null);$('expenseDialog').oncancel=e=>{e.preventDefault();done(null);};
  $('expenseSave').onclick=()=>{const amount=cents($('expenseAmount').value),description=$('expenseDescription').value.trim(),date=$('expenseDate').value;if(amount===null||amount<=0||!description||!date){$('expenseError').textContent='Enter date, description and a positive amount.';return;}done({id:existing?.id||newID(),date,description,amount});};
 });
 if(!expense)return;await api('expense',{expense});await load(true);status('Expense saved.');
});}
$('addExpense').onclick=()=>editExpense();
$('trade').onclick=()=>task(async()=>{
 const outgoing=picked();if(outgoing.some(r=>r.sold||r.consignment))throw Error('Select available cards you own.');
 if(outgoing.some(r=>dirty.has(key(r))))throw Error('Save outgoing card edits first.');
 if(!drafts.length)throw Error('Add the cards you will receive in Drafts first, then return here.');
 if(drafts.some(r=>dirty.has(key(r))))throw Error('Save your incoming drafts first, then return here.');
 const basis=outgoing.reduce((n,r)=>n+r.cost,0),chosen=new Set();
 const result=await new Promise(resolve=>{
  $('tradeSummary').textContent='Giving '+outgoing.length+' cards · original cost S$'+money(basis);$('tradeDrafts').replaceChildren();$('tradeCash').value='0';$('tradeNote').value='';$('tradeError').textContent='';
  for(const d of drafts){const label=el('label',undefined,'check'),check=el('input');check.type='checkbox';check.onchange=()=>check.checked?chosen.add(d.id):chosen.delete(d.id);label.append(check,el('span',d.name+' · split value S$'+money(d.cost)));$('tradeDrafts').append(label);}
  const done=v=>{$('tradeDialog').close();resolve(v);};$('tradeCancel').onclick=()=>done(null);$('tradeDialog').oncancel=e=>{e.preventDefault();done(null);};
  $('tradeReview').onclick=()=>{const value=cents($('tradeCash').value),cash=$('tradeCashMode').value==='received'?-value:value;const incoming=drafts.filter(d=>chosen.has(d.id)).sort((a,b)=>a.id.localeCompare(b.id));if(value===null||!incoming.length||incoming.length>100||basis+cash<0||basis+cash>9999999999){$('tradeError').textContent='Choose 1–100 incoming cards and a valid cash amount. Cash received cannot exceed original cost.';return;}if(incoming.some(d=>d.price<=0)){$('tradeError').textContent='Each incoming draft needs an asking price.';return;}done({incoming,cash,note:$('tradeNote').value.trim()});};
  $('tradeDialog').showModal();
 });
 if(!result)return;
 const {incoming,cash,note}=result,total=basis+cash,weight=incoming.reduce((n,r)=>n+BigInt(r.cost),0n);
 const amounts=incoming.map(r=>Number(weight?BigInt(total)*BigInt(r.cost)/weight:BigInt(total)/BigInt(incoming.length)));for(let i=0,left=total-amounts.reduce((a,b)=>a+b,0);i<left;i++)amounts[i%amounts.length]++;
 const summary='Original cost S$'+money(basis)+' '+(cash<0?'− cash received ':'+ cash paid ')+'S$'+money(Math.abs(cash))+' = S$'+money(total)+' carried forward.\n\n'+incoming.map((r,i)=>r.name+' → cost S$'+money(amounts[i])).join('\n')+'\n\nOutgoing listings will close; incoming listings will be published. No sale is recorded.';
 if(!await confirmAction('Confirm trade?',summary,[]))return;
 await api('trade',{id:newID(),out:outgoing.map(r=>({stockId:r.stockId,revision:r.revision})),in:incoming.map(r=>({id:r.id,revision:r.revision})),cash,note});await load();status('Trade recorded. Costs carried into received cards.');
});

$('sellTogether').onclick=()=>task(async()=>{
 const rows=picked().sort((a,b)=>a.stockId-b.stockId);
 if(rows.length<2||rows.length>100)throw Error('Select 2–100 available cards.');
 if(rows.some(r=>r.sold||r.consignment))throw Error('Select available, non-consigned cards.');
 if(rows.some(r=>r.stockDirty))throw Error('Save your listing edits first.');
 const total=await new Promise(resolve=>{
  $('bundleCount').textContent=rows.length+' cards';$('bundleTotal').value='';$('bundleError').textContent='';$('bundleSale').showModal();$('bundleTotal').focus();
  const finish=v=>{$('bundleSale').close();resolve(v);};
  $('bundleCancel').onclick=()=>finish(null);$('bundleSale').oncancel=e=>{e.preventDefault();finish(null);};
  $('bundleReview').onclick=()=>{const v=cents($('bundleTotal').value);if(v===null||v<=0){$('bundleError').textContent='Enter a positive SGD total.';return;}finish(v);};
 });
 if(total===null)return;
 const sum=rows.reduce((s,r)=>s+BigInt(r.price),0n),amount=BigInt(total);
 const sales=rows.map(r=>Number(sum?amount*BigInt(r.price)/sum:amount/BigInt(rows.length)));
 const remainder=total-sales.reduce((a,b)=>a+b,0);for(let i=0;i<remainder;i++)sales[i%rows.length]++;
 const preview=rows.map((r,i)=>({...r,sale:sales[i]}));
 if(!await confirmAction('Mark '+rows.length+' cards sold together?','Total SGD '+money(total)+'. Allocated amounts below add up exactly. All cards will be recorded together.',preview))return;
 await api('bundle-sale',{rows:rows.map(r=>({stockId:r.stockId,revision:r.revision})),total});
 rows.forEach(r=>dirty.delete(key(r)));await load(true);status(rows.length+' cards sold for SGD '+money(total)+'.');
});
// Letting a held card go. One card, one tap, and it asks first: the buyer
// holding it has been told it is theirs, and they are told again when it is
// taken back.
async function releaseHold(row){
 if(!await confirmAction('Release '+(row.name||'this card')+'?','It goes back on sale, the group post offers it again, and we tell '+(row.reservedName||'the buyer')+' we have let it go.',[row]))return;
 const out=await api('stock',{action:'unreserve',rows:[payload(row)]});
 const failed=out.filter(r=>r.error);
 failed.forEach(f=>{const found=stock.find(x=>x.stockId===f.stockId);if(found)found.error=f.error;});
 await load(true);render();
 status(failed.length?failed[0].error:'Released. The post is offering it again.',failed.length>0);
}
// Sharing moves a card's cost and takings between columns in the books, so it
// asks first and says which way the money goes.
$('share').onclick=()=>task(async()=>{
 const rows=picked(),into=!rows.every(r=>r.shared);
 if(rows.some(r=>r.consignment))throw Error('A consignment belongs to the person who left it.');
 if(!await confirmAction(into?'Share '+rows.length+' card'+(rows.length===1?'':'s')+'?':'Take '+rows.length+' card'+(rows.length===1?'':'s')+' out of shared?',into?'Their cost and whatever they sell for move into the shared column, and all three of you can list and sell them.':'They go back to whoever they came from, and their cost and takings leave the shared column.',rows))return;
 const out=await api('stock',{action:'share',rows:rows.map(r=>({...payload(r),shared:into}))});
 const failed=out.filter(r=>r.error);
 failed.forEach(f=>{const row=rows.find(x=>x.stockId===f.stockId);if(row){row.error=f.error;dirty.add(key(row));}});
 await load(true);render();
 status(failed.length?failed.length+' could not be changed. See the row messages.':(into?'Shared.':'Taken out of shared.'),failed.length>0);
});
$('sell').onclick=()=>task(()=>editSales(picked()));
async function editSales(rows){
 validateRows(rows);const correcting=rows.every(r=>r.sold);
 $('saleEntry').querySelector('h2').textContent=correcting?'Edit sold price':'Actual sale price';$('saleReview').textContent=correcting?'Review changes':'Review sale';
 const prices=await new Promise(resolve=>{
  $('saleInputs').replaceChildren();$('saleError').textContent='';const inputs=[];
  for(const r of rows){const label=el('label',r.name+' · asking S$'+money(r.price)),input=el('input');input.inputMode='decimal';input.placeholder='Actual sold price';input.setAttribute('aria-label','Sale price for '+r.name);input.value=r.saleDirty||r.sold?money(r.sale):'';label.append(input);$('saleInputs').append(label);inputs.push(input);}
  const done=v=>{$('saleEntry').close();resolve(v);};$('saleCancel').onclick=()=>done(null);$('saleEntry').oncancel=e=>{e.preventDefault();done(null);};
  $('saleReview').onclick=()=>{const values=inputs.map(input=>input.value.trim()===''?null:cents(input.value));if(values.some(v=>v===null)){$('saleError').textContent='Enter a valid SGD price for every card. Use 0 only for a write-off.';return;}done(values);};
  $('saleEntry').showModal();inputs[0]?.focus();
 });
 if(!prices)return;
 const preview=rows.map((r,i)=>({...r,sale:prices[i]}));
 if(!await confirmAction(correcting?'Update sold prices?':'Mark '+count(rows.length,'card')+' sold?',correcting?'Updates sales totals and profit. Cards stay sold.':'Check your actual sale prices below. Topic posts will be retired.',preview))return;
 rows.forEach((r,i)=>{r.sale=prices[i];r.saleDirty=true;dirty.add(key(r));});
 const edits=rows.filter(r=>r.stockDirty&&!r.sold&&!r.consignment);
 if(edits.length&&!await saveRows(edits)){status('Fix the row errors before recording sales.',true);return;}
 const result=await api('stock',{rows:rows.map(payload),action:'sold'});const failed=[];
 result.forEach((out,i)=>{const row=rows[i];if(out.error){row.error=out.error;dirty.add(key(row));failed.push(key(row));}else{row.saleDirty=false;row.stockDirty=false;dirty.delete(key(row));}});
 await load(true);failed.forEach(k=>selected.add(k));render();
 status(failed.length?(rows.length-failed.length)+(correcting?' updated; ':' sold; ')+failed.length+' need attention. Refresh and review the failed rows.':correcting?'Sold prices updated.':'Sales recorded.',failed.length>0);
}
$('remove').onclick=()=>task(async()=>{
 const rows=picked();if(rows.some(r=>r.tradeIn))throw Error('Trade-linked cards keep their cost history. Record a zero-value sale for a write-off.');if(!await confirmAction('Delete '+rows.length+(rows.length===1?' row?':' rows?'),tab==='drafts'?'Drafts will be discarded.':'This removes selected listings and their amounts from your accounting totals. This cannot be undone here.',rows))return;
 const saved=rows.filter(r=>tab!=='drafts'||r.revision>0);
 const result=saved.length?await api(tab==='drafts'?'discard':'stock',{rows:saved.map(payload),action:'delete'}):[];
 const failures=new Set(result.filter(r=>r.error).map(r=>r.id||'stock:'+r.stockId));
 rows.forEach(r=>{if(!failures.has(key(r))){if(tab==='drafts')drafts=drafts.filter(d=>d!==r);else stock=stock.filter(d=>d!==r);selected.delete(key(r));dirty.delete(key(r));}});
 result.forEach(r=>{if(r.error){const row=rows.find(x=>key(x)===(r.stockId?'stock:'+r.stockId:r.id));if(row){row.error=r.error;dirty.add(key(row));}}});
 await load(true);failures.forEach(k=>selected.add(k));render();status(failures.size?'Some rows could not be deleted. Refresh and review.':count(rows.length-failures.size,'row')+' deleted.',failures.size>0);
});

function renderCollections(){
 $('collections').textContent='';
 if(!collections.length){$('collections').append(el('p','No collections yet. One search per line, and the post keeps itself current.','hint'));return;}
 for(const c of collections){
  const box=el('article',undefined,'collectionCard');box.id='collection-'+c.id;
  const head=el('div',undefined,'batchHeading');head.append(el('h2',c.name),el('span',c.status,'batchStatus '+(c.status==='Needs update'?'needsUpdate':'')));box.append(head);
  box.append(el('p',c.items.length+' available '+(c.items.length===1?'card':'cards')+' · '+c.description.length+' characters','hint'));
  if(c.truncated)box.append(el('p','This rule matches more cards than one post can carry. The list stops at '+c.items.length+'; narrow the rule to choose which.','rowerror'));
  if(c.status==='Needs update')box.append(el('p','Stock behind this rule changed. Copy the latest description and update your Carousell listing.','rowerror'));
  const text=el('textarea');text.readOnly=true;text.rows=9;text.value=c.description;text.setAttribute('aria-label','Description for '+c.name);box.append(text);
  const actions=el('div',undefined,'batchActions'),copy=el('button','Copy description','primary');copy.dataset.action='copy';copy.disabled=!c.items.length;if(!c.items.length)copy.dataset.fixed='true';copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(text.value);status('Description copied.');}catch{text.focus();text.select();status('Select and copy the description above.');}
  };actions.append(copy);
  const posted=el('button',c.status==='Prepared'?'Mark posted':'Mark updated');posted.dataset.action='posted';posted.onclick=()=>task(async()=>{
   if(!await confirmAction(c.status==='Prepared'?'Already posted on Carousell?':'Updated your Carousell listing?','This records that the current description is on Carousell.',[]))return;
   await api('carousell',{action:'collection-posted',id:c.id,revision:c.revision,name:c.name,rules:c.rules,url:c.url});await load(true);status('Carousell status saved.');
  });actions.append(posted);box.append(actions);
  const items=el('details');items.append(el('summary','Cards in this collection'));
  c.items.forEach(i=>items.append(el('p',i.name+' · S$'+money(i.price)+' · '+i.condition,'hint')));box.append(items);
  const details=el('details');details.append(el('summary','Collection details'));
  const name=el('input');name.value=c.name;name.maxLength=150;name.setAttribute('aria-label','Collection name');
  const rules=el('textarea');rules.value=c.rules;rules.rows=3;rules.setAttribute('aria-label','Collection rules, one search per line');
  const url=el('input');url.value=c.url;url.type='url';url.placeholder='Carousell listing URL (optional)';url.setAttribute('aria-label','Carousell listing URL');
  const save=el('button','Save details');save.dataset.action='details';save.onclick=()=>task(async()=>{await api('carousell',{action:'collection-save',id:c.id,revision:c.revision,name:name.value,rules:rules.value,url:url.value});await load(true);status('Collection saved.');});
  const remove=el('button','Delete collection','danger');remove.dataset.action='deleteCollection';remove.onclick=()=>task(async()=>{if(!await confirmAction('Delete '+c.name+'?','Removes this collection. Your inventory and Telegram listings are kept, and no card is changed. Remove or update the Carousell post yourself.',[]))return;await api('carousell',{action:'collection-remove',id:c.id,revision:c.revision,name:c.name,rules:c.rules,url:c.url});await load(true);status('Collection deleted.');});
  details.append(name,rules,url,save,remove);box.append(details);
  if(c.url){const link=el('a','Open Carousell listing \u2197');link.href=c.url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);}
  $('collections').append(box);
 }
}
function renderBatches(){
 $('batches').replaceChildren();
 if(!batches.length){$('batches').append(el('p','No batches yet. Select cards in Available to create one.'));return;}
 for(const batch of batches){
  const box=el('article',undefined,'batchCard');box.id='batch-'+batch.id;
  const head=el('div',undefined,'batchHeading');head.append(el('h2',batch.name),el('span',batch.status,'batchStatus '+(batch.status==='Needs update'?'needsUpdate':'')));box.append(head);
  const available=batch.items.filter(i=>!i.sold&&!i.deleted).length;
  box.append(el('p',available+' available · '+batch.items.filter(i=>i.sold&&!i.deleted).length+' sold · '+batch.items.filter(i=>i.deleted).length+' deleted','hint'));
  if(batch.status==='Needs update')box.append(el('p','Copy the latest description and update your Carousell listing.','rowerror'));
  const text=el('textarea');text.readOnly=true;text.rows=9;text.value=batch.description;text.setAttribute('aria-label','Description for '+batch.name);box.append(text);
  const actions=el('div',undefined,'batchActions'),copy=el('button','Copy description','primary');copy.dataset.action='copy';copy.disabled=!available;if(!available)copy.dataset.fixed='true';copy.onclick=async()=>{
   try{await navigator.clipboard.writeText(text.value);status('Description copied.');}catch{text.focus();text.select();status('Select and copy the description above.');}
  };actions.append(copy);
  const posted=el('button',batch.status==='Prepared'?'Mark posted':'Mark updated');posted.dataset.action='posted';posted.onclick=()=>task(async()=>{
   if(!await confirmAction(batch.status==='Prepared'?'Already posted on Carousell?':'Updated your Carousell listing?','This records that the current description is on Carousell.',[]))return;
   await api('carousell',{action:'posted',id:batch.id,revision:batch.revision,name:batch.name,url:batch.url});await load(true);status('Carousell status saved.');
  });actions.append(posted);box.append(actions);
  const items=el('details');items.append(el('summary','Cards in this batch'));
  batch.items.forEach(i=>items.append(el('p',i.name+' · S$'+money(i.price)+' · '+(i.deleted?'Deleted':i.sold?'Sold':'Available'),'hint')));box.append(items);
  const details=el('details');details.append(el('summary','Batch details'));
  const name=el('input');name.value=batch.name;name.maxLength=150;name.setAttribute('aria-label','Batch name');const url=el('input');url.value=batch.url;url.type='url';url.placeholder='Carousell listing URL (optional)';url.setAttribute('aria-label','Carousell listing URL');
  const save=el('button','Save details');save.dataset.action='details';save.onclick=()=>task(async()=>{await api('carousell',{action:'save',id:batch.id,revision:batch.revision,name:name.value,url:url.value});await load(true);status('Batch details saved.');});
  const remove=el('button','Ungroup cards','danger');remove.dataset.action='ungroup';remove.onclick=()=>task(async()=>{if(!await confirmAction('Ungroup '+batch.name+'?','Removes this batch. Your inventory and Telegram listings are kept. Remove or update the Carousell post yourself before reusing these cards.',[]))return;await api('carousell',{action:'remove',id:batch.id,revision:batch.revision,name:batch.name,url:batch.url});await load(true);status('Cards ungrouped.');});
  details.append(name,url,save,remove);box.append(details);
  if(batch.url){const link=el('a','Open Carousell listing ↗');link.href=batch.url;link.target='_blank';link.rel='noopener noreferrer';box.append(link);}
  $('batches').append(box);
 }
}
['templateIntro','templateItem','templateOutro'].forEach(id=>$(id).oninput=()=>templateDirty=true);
$('createCollection').onclick=()=>task(async()=>{
 await api('carousell',{action:'collection-create',name:$('collectionName').value,rules:$('collectionRules').value});
 $('collectionName').value='';$('collectionRules').value='';$('newCollection').open=false;
 await load(true);status('Collection created. Copy the description to get started.');
});
$('saveTemplate').onclick=()=>task(async()=>{
 await api('carousell',{action:'template',template:{intro:$('templateIntro').value,item:$('templateItem').value,outro:$('templateOutro').value,revision:template.revision||0}});
 templateDirty=false;await load(true);status('Template saved.');
});
$('makeBatch').onclick=()=>task(async()=>{
 const rows=picked();if(rows.some(r=>!r.stockId||r.sold))throw Error('Select available listings.');
 if(rows.some(r=>batchFor(r)))throw Error('Some cards already have a Carousell batch. Use Ungrouped only.');
 const edits=rows.filter(r=>dirty.has(key(r)));if(edits.length&&!await saveRows(edits))throw Error('Fix the selected card edits first.');
 $('batchSummary').textContent=rows.length+' selected cards. Each copy can belong to one batch.';$('batchName').value='';$('batchDialog').showModal();
 const confirmed=await new Promise(resolve=>{const finish=v=>{$('batchDialog').close();resolve(v);};$('batchCancel').onclick=()=>finish(false);$('batchCreate').onclick=()=>finish(true);$('batchDialog').oncancel=e=>{e.preventDefault();finish(false);};});
 if(!confirmed)return;
 await api('carousell',{action:'create',ids:rows.map(r=>r.stockId),size:Number($('batchSize').value),name:$('batchName').value});
 tab='carousell';await load(true);status('Batches created. Copy a description to get started.');
});

let quickPhotosState={},quickCard=null,quickURLs=[],quickPriceManual=false,quickType="";
function quickCondition(){return quickType==='slab'?'Slab':$('quickCondition').value;}
function sameCard(r,c,condition,slab){return r.cardId===c.id&&(c.id!==0||r.name.trim().toLowerCase()===c.name.trim().toLowerCase())&&r.condition===condition&&(condition!=='Slab'||(r.slab||'').trim().toUpperCase()===slab.trim().toUpperCase());}
function quickMatches(){return [...stock.filter(r=>!r.sold),...drafts].filter(r=>sameCard(r,quickCard,quickCondition(),$('quickSlab').value));}
function updateQuick(){
 $('quickSlabLabel').hidden=quickType!=='slab';$('quickConditionLabel').hidden=quickType!=='raw';
 const value=cents($('quickCost').value),jpy=$('quickCurrency').value==='JPY';
 $('quickConverted').textContent=jpy?(entryRate>0?(value===null?'':'Stored cost: S$'+money(Math.round(value/entryRate)))+' · 1 SGD = '+entryRate+' JPY':'Set the JPY conversion rate before adding this card.'):'Cost stays in SGD.';
 const matches=quickMatches();if(!quickPriceManual)$('quickPrice').value=matches.length?money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';$('quickAverage').textContent=matches.length?matches.length+' matching copies · average cost S$'+money(Math.round(matches.reduce((n,r)=>n+r.cost,0)/matches.length))+' · average asking S$'+money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';
}
function clearQuickPhotos(){quickPhotosState={};for(const side of ['Front','Back'])$('quick'+side+'Rotate').hidden=true;quickURLs.forEach(URL.revokeObjectURL);quickURLs=[];for(const side of ['Front','Back']){$('quick'+side).value='';$('quick'+side+'Preview').hidden=true;$('quick'+side+'Preview').removeAttribute('src');}}
function openQuickEntry(card){
 quickCard=card;$('quickCustomLabel').hidden=card.id!==0;$('quickGameLabel').hidden=card.id!==0;$('quickGame').value='pokemon';$('quickCustomName').value=card.id===0?card.name:'';quickPriceManual=false;clearQuickPhotos();$('quickName').textContent=card.name||'Custom listing / set';$('quickCost').value='';$('quickError').textContent='';
 const matches=quickMatches();$('quickPrice').value=matches.length?money(Math.round(matches.reduce((n,r)=>n+r.price,0)/matches.length)):'';
 quickType='';$('quickTypeStep').hidden=false;$('quickDetails').hidden=true;$('quickAdd').hidden=true;
 const img=$('quickReference');img.hidden=true;img.removeAttribute('src');img.onerror=()=>{img.hidden=true;};if(card.brandId==='riftbound'&&!card.thumbnailUrl){referenceURL(card).then(url=>{if(url&&quickCard===card&&$('quickEntry').open){img.src=url;img.hidden=false;}});}
 try{const url=new URL(card.thumbnailUrl);if(url.protocol==='https:'&&(url.hostname==='cdn.snkrdunk.com'||(url.hostname==='bilgewatermarket.com'&&url.pathname.startsWith('/assets/')))){img.src=url.href;img.hidden=false;}}catch{}
 updateQuick();$('quickEntry').showModal();$('quickRaw').focus();
}
function chooseQuickType(type){quickType=type;$('quickTypeStep').hidden=true;$('quickDetails').hidden=false;$('quickAdd').hidden=false;updateQuick();$(type==='raw'?'quickCondition':'quickSlab').focus();}
$('quickRaw').onclick=()=>chooseQuickType('raw');$('quickSlabType').onclick=()=>chooseQuickType('slab');
$('quickChangeType').onclick=()=>{if(busy)return;quickType='';$('quickTypeStep').hidden=false;$('quickDetails').hidden=true;$('quickAdd').hidden=true;};
$('addCustom').onclick=()=>{if(!busy)openQuickEntry({id:0,name:''});};
$('quickCustomName').oninput=()=>{if(quickCard?.id===0){quickCard.name=$('quickCustomName').value.trim();updateQuick();}};
$('quickPrice').oninput=()=>{quickPriceManual=true;};
for(const id of ['quickCost','quickCurrency','quickCondition','quickSlab'])$(id).oninput=updateQuick;
function showQuickPhoto(side,record){
 if(quickPhotosState[side]!==record||!$('quickEntry').open)return;
 if(record.url){URL.revokeObjectURL(record.url);quickURLs=quickURLs.filter(u=>u!==record.url);}
 record.url=URL.createObjectURL(record.blob);quickURLs.push(record.url);
 const img=$('quick'+side+'Preview');img.src=record.url;img.hidden=false;
 $('quick'+side+'Rotate').hidden=false;$('quick'+side+'Rotate').disabled=false;
}
for(const side of ['Front','Back']){
 $('quick'+side).onchange=()=>{
  const file=$('quick'+side).files[0],record={file};quickPhotosState[side]=record;
  $('quick'+side+'Preview').hidden=true;$('quick'+side+'Rotate').hidden=true;$('quickError').textContent='';
  if(!file)return;
  record.job=portraitBlob(file).then(blob=>{record.blob=blob;record.error=null;showQuickPhoto(side,record);}).catch(e=>{record.error=e.message;if(quickPhotosState[side]===record)$('quickError').textContent=e.message;});
 };
 $('quick'+side+'Rotate').onclick=()=>{
  const record=quickPhotosState[side];if(busy||!record?.blob)return;
  $('quick'+side+'Rotate').disabled=true;
  record.job=turnPhoto(record.blob).then(blob=>{record.blob=blob;record.error=null;showQuickPhoto(side,record);}).catch(e=>{record.error=e.message;if(quickPhotosState[side]===record){$('quickError').textContent=e.message;$('quick'+side+'Rotate').disabled=false;}});
 };
}
// The upload endpoint takes 5 MB, so the encode steps down until it fits
// rather than letting a sharper setting fail the upload outright. The first
// quality is the one that is wanted; the rest are there so there is always an
// answer.
const PHOTO_LIMIT=5*1024*1024-64*1024;
async function encodeFitting(canvas,qualities,failure){
 let last=null;
 for(const quality of qualities){
  last=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
  if(!last)throw Error(failure);
  if(last.size<=PHOTO_LIMIT)return last;
 }
 throw Error('That photo is too detailed to upload. Crop it or take a closer shot.');
}
async function turnPhoto(blob){
 const image=await createImageBitmap(blob);
 // A turn is a third lossy pass on a photo already encoded twice, so it is
 // encoded close to the quality the server stores at rather than below it.
 try{const canvas=document.createElement('canvas');canvas.width=image.height;canvas.height=image.width;const ctx=canvas.getContext('2d');ctx.translate(canvas.width,0);ctx.rotate(Math.PI/2);ctx.drawImage(image,0,0);return await encodeFitting(canvas,[0.92,0.86,0.8],'Could not rotate photo.');}finally{image.close();}
}
$('quickCancel').onclick=()=>{if(busy)return;clearQuickPhotos();$('quickEntry').close();};
$('quickEntry').oncancel=e=>{if(busy)e.preventDefault();else clearQuickPhotos();};
$('saveEntryRate').onclick=()=>task(async()=>{const rate=Number($('entryRate').value);if(!Number.isFinite(rate)||rate<=0||rate>10000)throw Error('Enter JPY per SGD, e.g. 115.');await api('settings',{jpyPerSgd:rate});entryRate=Math.round(rate*10000)/10000;status('Conversion saved. Existing costs unchanged.');});
async function portraitBlob(file){
 if(!['image/jpeg','image/png'].includes(file.type)||file.size>25*1024*1024)throw Error('Use a JPG/PNG photo up to 25 MB.');
 const image=await createImageBitmap(file);
 try{const scale=Math.min(1,2400/Math.max(image.width,image.height)),canvas=document.createElement('canvas'),rotate=image.width>image.height,w=Math.max(1,Math.round(image.width*scale)),h=Math.max(1,Math.round(image.height*scale));canvas.width=rotate?h:w;canvas.height=rotate?w:h;const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
 // A canvas defaults to imageSmoothingQuality 'low', which samples a few
 // source pixels per destination pixel. Reducing a 12-megapixel phone photo
 // that way aliases the result: speckled foil, broken small text, noisy
 // edges. That is the grain, and it happens here, before the server ever
 // sees the photo.
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 if(rotate){ctx.translate(h,0);ctx.rotate(Math.PI/2);}ctx.drawImage(image,0,0,w,h);
 return await encodeFitting(canvas,[0.9,0.84,0.78],'Could not prepare photo.');
 }finally{image.close();}
}
// The uploaded file stays full size; only its table preview is reduced.
async function previewBlob(blob){
 const image=await createImageBitmap(blob);
 try{const scale=Math.min(1,320/Math.max(image.width,image.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');ctx.imageSmoothingQuality='high';ctx.drawImage(image,0,0,canvas.width,canvas.height);const preview=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.8));if(!preview)throw Error('Preview unavailable');return preview;}finally{image.close();}
}
async function entryPhoto(file,prepared=false){
 const blob=prepared?file:await portraitBlob(file),body=new FormData();body.append('photo',blob,'card.jpg');body.append('prepared','true');const result=await api('upload',body),session=token;
 void previewBlob(blob).then(preview=>{if(token===session&&!photos.has(result.photo))cachePhoto(result.photo,preview);}).catch(()=>{/* The server thumbnail is a safe fallback. */});
 return result.photo;
}
$('quickAdd').onclick=async()=>{
 if(busy||!quickType)return;$('quickError').textContent='';
 if(quickCard.id===0&&(!quickCard.name.trim()||[...quickCard.name].length>180)){$('quickError').textContent='Enter a listing name (up to 180 characters).';$('quickCustomName').focus();return;}
 const cost=cents($('quickCost').value),asking=$('quickPrice').value.trim()===''?0:cents($('quickPrice').value),jpy=$('quickCurrency').value==='JPY';
 if(cost===null||asking===null){$('quickError').textContent='Enter valid prices.';return;}
 if(jpy&&entryRate<=0){$('quickError').textContent='Save a JPY conversion rate first.';return;}
 const records=['Front','Back'].map(side=>quickPhotosState[side]);
 if(quickCondition()==='Slab'&&!$('quickSlab').value.trim()){$('quickError').textContent='Enter the slab grade.';return;}
 lock(true);$('quickAdd').disabled=true;$('quickCancel').disabled=true;
 try{
  $('quickError').textContent='Preparing photos…';
  const prepared=await Promise.allSettled(records.map(async record=>{
   if(!record?.file)return null;
   await record.job;if(record.error)throw Error(record.error);if(!record.blob)throw Error('Choose the photo again.');
   return record.blob;
  }));
  const preparationError=prepared.find(result=>result.status==='rejected');if(preparationError)throw preparationError.reason;
  $('quickError').textContent='Uploading photos…';
  const uploads=await Promise.allSettled(prepared.map(result=>result.value?entryPhoto(result.value,true):''));
  const failure=uploads.find(result=>result.status==='rejected');if(failure)throw failure.reason;
  const photoIDs=uploads.map(result=>result.value);
  while(photoIDs.length&&!photoIDs.at(-1))photoIDs.pop();
  const row={id:newID(),revision:0,cardId:quickCard.id,game:quickCard.id===0?$('quickGame').value:'',name:quickCard.name,condition:quickCondition(),slab:quickType==='slab'?$('quickSlab').value.trim():'',cost:jpy?Math.round(cost/entryRate):cost,price:asking,photos:photoIDs};
  drafts.push(row);dirty.add(key(row));selected.add(key(row));scheduleSave('drafts');clearQuickPhotos();$('quickEntry').close();$('filter').value='';inventoryPage=Math.floor((drafts.length-1)/inventoryPageSize);render();$('search').value='';$('results').replaceChildren();$('search').focus();status('Added. Choose the next card, or Submit selected.');
 }catch(e){$('quickError').textContent=e.message;}finally{lock(false);$('quickAdd').disabled=false;$('quickCancel').disabled=false;}
};
const marketDialog=el('dialog');marketDialog.id='marketplaceDialog';document.body.append(marketDialog);
function marketShell(title){marketDialog.replaceChildren();const h=el('h2',title),close=el('button','Close');close.type='button';close.onclick=()=>marketDialog.close();marketDialog.append(h,close);if(!marketDialog.open)marketDialog.showModal();}
function marketField(parent,label,value='',multiline=false){const wrap=el('label',label),input=el(multiline?'textarea':'input');input.value=value;input.setAttribute('aria-label',label);if(multiline)input.rows=5;wrap.append(input);parent.append(wrap);return input;}
function marketAction(parent,label,fn){const button=el('button',label);button.type='button';button.onclick=()=>task(async()=>{button.disabled=true;try{await fn();}catch(e){const error=el('p',e.message,'rowerror');error.setAttribute('role','alert');parent.append(error);throw e;}finally{button.disabled=false;}});parent.append(button);return button;}
function safeMarketLink(parent,url,label){try{const u=new URL(url);if(u.protocol!=='https:')return;const a=el('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);}catch{}}
function accountSteps(parent){
 const steps=el('ol',undefined,'hint');
 for(const step of ['Open my.telegram.org/apps and sign in with the phone number you want listings to come from.','Create an application — any title and short name will do — then copy its App api_id and App api_hash.','Paste both here with that phone number. Telegram then sends a login code to your Telegram app, never to a group.'])steps.append(el('li',step));
 parent.append(steps);safeMarketLink(parent,'https://my.telegram.org/apps','Open my.telegram.org/apps ↗');
}
function accountForm(parent,title){
 const form=el('div',undefined,'marketDestination');form.append(el('h4',title));
 const id=marketField(form,'App api_id'),hash=marketField(form,'App api_hash'),phone=marketField(form,'Phone number, with country code');
 id.inputMode='numeric';hash.autocomplete='off';hash.spellcheck=false;phone.placeholder='+6591234567';
 form.append(el('p','Kept on the shop server and encrypted there. The app hash and the login session are never sent back to this page.','hint'));
 marketAction(form,'Save details',async()=>{
  if(!/^\d{1,9}$/.test(id.value.trim()))throw Error('The api_id is the number shown on my.telegram.org.');
  if(!/^[0-9a-fA-F]{32}$/.test(hash.value.trim()))throw Error('The api_hash is 32 hexadecimal characters.');
  if(!/^\+?\d{7,18}$/.test(phone.value.replace(/\s/g,'')))throw Error('Enter the phone number with its country code.');
  await api('account',{action:'credentials',apiId:Number(id.value.trim()),apiHash:hash.value.trim().toLowerCase(),phone:phone.value.replace(/\s/g,'')});
  hash.value='';status('Telegram app details saved.');await openMarketplaceSettings();});
 parent.append(form);
}
function accountSection(data){
 const a=data.account||{},state=a.state||'unconfigured',s=el('section',undefined,'marketSection');
 s.append(el('h3','Post listings as your own Telegram account'));
 s.append(el('p','The bot is the author of every marketplace post until you connect your own account here. The connection is used for one thing: publishing a listing. There is no test message, nothing else is ever sent to your groups, and your conversations are never read.','hint'));
 if(a.detail)s.append(el('p',a.detail,'hint'));
 if(state==='connected'){
  s.append(el('p','Connected'+(a.username?' as @'+a.username:'')+(a.name?' · '+a.name:'')+(a.phone?' · '+a.phone:''),'marketConnected'));
  if(a.since)s.append(el('p','Signed in '+new Date(a.since).toLocaleString()+'. Telegram lists it under Settings → Devices as “Card shop manager”, where you can end it at any time.','hint'));
  const choice=el('div',undefined,'marketDestination');choice.append(el('h4','Who signs new listings'));
  choice.append(el('p','Now: '+(data.sender==='account'?'your own account':'the bot')+'. Listings already posted keep whoever sent them, because Telegram lets only the author edit a message.','hint'));
  marketAction(choice,data.sender==='account'?'Go back to posting as the bot':'Post new listings as me',async()=>{await api('account',{action:'sender',sender:data.sender==='account'?'bot':'account'});status('Saved.');await openMarketplaceSettings();});
  s.append(choice);
  const end=el('div',undefined,'marketDestination');end.append(el('h4','End the connection'));
  end.append(el('p','Disconnect signs this session out of Telegram and keeps your app details. Remove everything deletes them too.','hint'));
  marketAction(end,'Disconnect',async()=>{await api('account',{action:'disconnect'});status('Telegram account disconnected.');await openMarketplaceSettings();});
  marketAction(end,'Remove everything',async()=>{await api('account',{action:'forget'});status('Saved Telegram details removed.');await openMarketplaceSettings();});
  s.append(end);return s;
 }
 if(state==='unconfigured'){accountSteps(s);accountForm(s,'Step 3 · Your Telegram app details');return s;}
 const sign=el('div',undefined,'marketDestination');sign.append(el('h4','Sign in'+(a.phone?' · '+a.phone:'')));
 if(state==='password_needed'){
  const pw=marketField(sign,'Two-step verification password');pw.type='password';pw.autocomplete='off';
  sign.append(el('p','Used once to finish this login and never stored.','hint'));
  marketAction(sign,'Unlock',async()=>{if(!pw.value)throw Error('Enter your two-step verification password.');await api('account',{action:'password',password:pw.value});pw.value='';await openMarketplaceSettings();});
 }else if(state==='code_sent'){
  const code=marketField(sign,'Login code from your Telegram app');code.inputMode='numeric';code.autocomplete='one-time-code';
  marketAction(sign,'Sign in',async()=>{if(!/^\d{4,8}$/.test(code.value.trim()))throw Error('Enter the digits Telegram sent you.');await api('account',{action:'signin',code:code.value.trim()});code.value='';await openMarketplaceSettings();});
  marketAction(sign,'Send a new code',async()=>{await api('account',{action:'code'});await openMarketplaceSettings();});
 }else{
  sign.append(el('p','Telegram sends the code to the Telegram app on that number. No group is contacted.','hint'));
  marketAction(sign,'Send me a login code',async()=>{await api('account',{action:'code'});await openMarketplaceSettings();});
 }
 s.append(sign);accountForm(s,'Use a different Telegram app or number');return s;
}
function announceGameLabel(game){return game==='pokemon'?'Pokemon listings':game==='riftbound'?'Riftbound listings':game+' listings';}
function announceSection(d){
 const a=d.announcement||{},route=a.route||{},units=a.units||0,t=a.template||{},s=el('section',undefined,'marketSection');
 s.append(el('h3','Group announcements'));
 s.append(el('p','One post for a whole intake instead of one post per card. Mute a game and its listings stop going into the group; the announcement is then how the group hears about new stock. Nothing already posted is touched.','hint'));
 for(const g of d.games||[]){const row=el('div',undefined,'marketDestination');
  row.append(el('strong',announceGameLabel(g.game)),el('p',(g.enabled?'Posting to the group':'Muted')+' · '+g.chatId+' · topic '+g.topicId,'hint'));
  marketAction(row,g.enabled?'Mute in the group':'Post to the group again',async()=>{await api('announce',{action:'game',game:g.game,enabled:!g.enabled});status(g.enabled?'Muted. New listings no longer post to that topic.':'Listings post to that topic again.');await openMarketplaceSettings();});
  s.append(row);}
 if(!(d.games||[]).length)s.append(el('p','No game topics are configured, so listings go to the default topic and there is nothing to mute here.','hint'));
 const post=el('div',undefined,'marketDestination');post.append(el('h4','Announce new stock'));
 // A card counts once it has an asking price, so a lot taken in whole is
 // announced as it gets priced rather than on the day it arrived.
 if(!route.chatId)post.append(el('p','Set the announcement topic below before the first announcement.','hint'));
 else post.append(el('p',units+' priced card'+(units===1?'':'s')+' waiting to be announced'+(route.postedAt?' · last announced '+new Date(route.postedAt).toLocaleString():'')+'.','hint'));
 if(d.preview)post.append(el('pre',d.preview,'marketPreview'));
 if(route.chatId&&units>0)marketAction(post,'Announce '+units+' card'+(units===1?'':'s'),async()=>{const r=await api('announce',{action:'post'});status('Announced '+r.announced+' card'+(r.announced===1?'':'s')+' in the group.');await openMarketplaceSettings();});
 s.append(post);
 // The preview above is rendered by the host from this wording, so saving and
 // reloading the panel is what shows the result -- there is no second copy of
 // the renderer here to disagree with it.
 const wording=el('div',undefined,'marketDestination');wording.append(el('h4','Wording'));
 wording.append(el('p','{count} and {cards} in the opening and the closing. {card}, {price} and {link} on the card line. {bot_link} anywhere.','hint'));
 const intro=marketField(wording,'Opening',t.intro||'',true),item=marketField(wording,'Card line',t.item||'',true),outro=marketField(wording,'Closing',t.outro||'',true);
 item.rows=3;outro.rows=2;
 marketAction(wording,'Save wording',async()=>{await api('announce',{action:'template',template:{intro:intro.value,item:item.value,outro:outro.value,revision:t.revision||0}});status('Announcement wording saved.');await openMarketplaceSettings();});
 s.append(wording);
 const form=el('div',undefined,'marketDestination');form.append(el('h4','Where announcements go'));
 const chat=marketField(form,'Chat ID',route.chatId?String(route.chatId):''),topic=marketField(form,'Announcement topic ID (0 for no topic)',String(route.topicId||0));
 chat.placeholder='-100…';topic.inputMode='numeric';
 const first=(d.games||[])[0];
 if(first)form.append(el('p','Your listing topics sit in '+first.chatId+'. Use that same chat ID with the announcement topic’s own ID.','hint'));
 marketAction(form,'Save announcement topic',async()=>{
  if(!/^-\d+$/.test(chat.value.trim())||!Number.isSafeInteger(Number(chat.value.trim())))throw Error('Enter the group chat ID, which starts with a minus.');
  if(!/^\d+$/.test(topic.value.trim())||!Number.isSafeInteger(Number(topic.value.trim())))throw Error('Enter a whole-number topic ID, or 0 for a group without topics.');
  await api('announce',{action:'route',chatId:Number(chat.value.trim()),topicId:Number(topic.value.trim())});status('Announcement topic saved.');await openMarketplaceSettings();});
 s.append(form);return s;
}
function digestGameLabel(game){return game==='pokemon'?'Pokémon':game==='riftbound'?'Riftbound':game==='onepiece'?'One Piece':'All games';}
// A scheduled digest is one message listing every available card of a game,
// posted on a cron schedule. Preview asks the host to render it, so what is
// shown here is exactly what would be posted.
function digestSection(data,account){
 const s=el('section',undefined,'marketSection');
 s.append(el('h3','Scheduled digests'),el('p','One message listing every available card of a game, with your price and, for Riftbound, the Bilgewater price in SGD, then your posting template. Posted on a schedule in Singapore time, at most once an hour, by '+(account&&account.sender==='account'?'your own account':'the bot')+'.','hint'));
 for(const d of data.digests||[]){
  const row=el('div',undefined,'marketDestination');
  row.append(el('strong',d.name),el('p',(d.enabled?'Enabled':'Disabled')+' · '+digestGameLabel(d.game)+' · '+d.chatId+(d.topicId?' · topic '+d.topicId:'')+' · '+d.schedule,'hint'));
  if(d.lastRun||d.lastStatus)row.append(el('p','Last: '+(d.lastStatus||'running')+(d.lastRun?' · '+new Date(d.lastRun).toLocaleString():'')+(d.lastError?' · '+d.lastError:''),d.lastStatus==='failed'?'rowerror':'hint'));
  const preview=el('pre',undefined,'marketPreview');preview.hidden=true;
  marketAction(row,'Preview',async()=>{const r=await api('marketplace',{action:'digest-preview',digestId:d.id});preview.textContent=(r.messages||[]).length?r.messages.join('\n\n— next message —\n\n'):'Nothing to list right now, so nothing would be posted.';preview.hidden=false;});
  // Two taps, not a browser confirm(): this posts to a group straight away.
  let armed=false;const send=marketAction(row,'Send now',async()=>{if(!armed){armed=true;send.textContent='Tap again to post now';setTimeout(()=>{armed=false;send.textContent='Send now';},5000);return;}armed=false;await api('marketplace',{action:'digest-send',digestId:d.id});status('Digest posted.');await openMarketplaceSettings();});
  marketAction(row,d.enabled?'Disable':'Enable',async()=>{await api('marketplace',{action:'digest',digest:{...d,enabled:!d.enabled}});status(d.enabled?'Digest disabled.':'Digest enabled.');await openMarketplaceSettings();});
  marketAction(row,'Delete',async()=>{await api('marketplace',{action:'digest-delete',digestId:d.id});status('Digest deleted.');await openMarketplaceSettings();});
  row.append(preview);s.append(row);
 }
 const form=el('div',undefined,'marketDestination');form.append(el('h4','Add a scheduled digest'));
 // Labels distinct from the destination form's, which shares this dialog.
 const name=marketField(form,'Digest name'),chat=marketField(form,'Digest group link or chat ID'),topic=marketField(form,'Digest topic ID (0 for no topic)','0');
 const gameWrap=el('label','Cards to list'),game=el('select');for(const g of ['riftbound','pokemon','onepiece','']){const o=el('option',digestGameLabel(g));o.value=g;game.append(o);}gameWrap.append(game);form.append(gameWrap);
 const schedule=marketField(form,'Schedule (cron, Singapore time)','0 20 * * *'),heading=marketField(form,'Heading (optional)');
 chat.placeholder='https://t.me/groupname or -100…';topic.inputMode='numeric';heading.placeholder='e.g. Riftbound singles in stock';
 form.append(el('p','Minute, hour, day, month, weekday. 0 20 * * * is 8pm daily; 0 12 * * 1,4 is noon on Mondays and Thursdays; 0 9,21 * * * is 9am and 9pm.','hint'));
 marketAction(form,'Save & enable',async()=>{
  if(!name.value.trim()||!chat.value.trim())throw Error('Enter a name and a group.');
  if(!/^\d+$/.test(topic.value.trim())||!Number.isSafeInteger(Number(topic.value)))throw Error('Enter a whole-number topic ID, or 0.');
  const r=await api('marketplace',{action:'digest',chatRef:chat.value.trim(),digest:{id:0,name:name.value.trim(),chatId:/^-\d+$/.test(chat.value.trim())?Number(chat.value):0,topicId:Number(topic.value),game:game.value,schedule:schedule.value,heading:heading.value,enabled:true,revision:0}});
  status('Digest saved. Use Preview to check it before the first run.');await openMarketplaceSettings();});
 s.append(form);return s;
}
$('automationSettings').onclick=()=>task(openMarketplaceSettings);
async function openMarketplaceSettings(){
 const session=token;const data=await api('marketplace',{action:'settings'});
 // The owner and every active seller each connect their own account, so a
 // panel is the normal case. A refusal means this login may not post as
 // itself -- a revoked seller, say -- and is shown rather than swallowed,
 // because a manager that looks like it never had the setting is the one
 // failure here nobody can see from the page.
 let account=null,accountRefusal='';
 try{account=await api('account',{action:'status'});}catch(e){accountRefusal=/owner-only/i.test(e.message||'')?'':(e.message||'Could not load the Telegram account settings.');}
 let announce=null,announceRefusal='';
 try{announce=await api('announce',{action:'settings'});}catch(e){announceRefusal=/owner-only/i.test(e.message||'')?'':(e.message||'Could not load the announcement settings.');}
 if(!token||token!==session)return;marketShell('Automation & marketplaces');
 marketDialog.append(el('p','Telegram: automatic on publication. Carousell: manually linked and tracked. TCGplayer: not connected.','hint'));
 if(account)marketDialog.append(accountSection(account));
 else if(accountRefusal){const refused=el('section',undefined,'marketSection');refused.append(el('h3','Post listings as your own Telegram account'),el('p',accountRefusal,'rowerror'));marketDialog.append(refused);}
 if(announce)marketDialog.append(announceSection(announce));
 else if(announceRefusal){const refused=el('section',undefined,'marketSection');refused.append(el('h3','Group announcements'),el('p',announceRefusal,'rowerror'));marketDialog.append(refused);}
 const section=el('section',undefined,'marketSection');section.append(el('h3','Your posting template'));
 section.append(el('p','Appended below the card name, grade, asking price and private-offer link. Applies to future posts and later listing updates.','hint'));
 const templateInput=marketField(section,'Posting template',data.template,true);templateInput.maxLength=1800;
 const preview=el('pre',undefined,'marketPreview');const updatePreview=()=>preview.textContent='Example card · PSA 10 · SGD 100.00\nPhotos / private offer: https://t.me/'+bot+'?start=listing_123\n\n'+templateInput.value;templateInput.oninput=updatePreview;updatePreview();section.append(preview);
 marketAction(section,'Save posting template',async()=>{await api('marketplace',{action:'template',template:templateInput.value,revision:data.revision});status('Posting template saved.');await openMarketplaceSettings();});marketDialog.append(section);
 const destinations=el('section',undefined,'marketSection');destinations.append(el('h3','Telegram marketplaces'),el('p',(account&&account.sender==='account'?'You must be a member of each marketplace; the bot does not have to be. ':'Add the bot to each marketplace and check its posting rules. ')+'Only newly published listings are queued. Disabling a destination stops new posts; existing posts still receive sold updates.','hint'));
 for(const d of data.destinations||[]){const row=el('div',undefined,'marketDestination');row.append(el('strong',d.name),el('p',(d.enabled?'Enabled':'Disabled')+' · '+d.chatId+(d.topicId?' · topic '+d.topicId:'')));
 marketAction(row,d.enabled?'Disable':'Enable',async()=>{await api('marketplace',{action:'destination',destination:{...d,enabled:!d.enabled}});await openMarketplaceSettings();});destinations.append(row);}
 const form=el('div',undefined,'marketDestination');form.append(el('h4','Add destination'));
 const name=marketField(form,'Group name'),chat=marketField(form,'Group link or chat ID'),topic=marketField(form,'Topic ID (0 for no topic)','0');chat.placeholder='https://t.me/groupname or -100…';topic.inputMode='numeric';
 form.append(el('p','For t.me/c/1234567890/9: chat ID is -1001234567890 and topic ID is 9. Use the topic link, not an individual listing-message link.','hint'));
 marketAction(form,'Add & enable',async()=>{if(!chat.value.trim()||!/^\d+$/.test(topic.value.trim())||!Number.isSafeInteger(Number(topic.value)))throw Error('Enter a group link and a whole-number topic ID.');await api('marketplace',{action:'destination',chatRef:chat.value.trim(),destination:{id:0,name:name.value.trim(),chatId:/^-\d+$/.test(chat.value.trim())?Number(chat.value):0,topicId:Number(topic.value),enabled:true,revision:0}});status('Destination enabled for future publications.');await openMarketplaceSettings();});destinations.append(form);marketDialog.append(destinations);
 marketDialog.append(digestSection(data,account));
 const tcg=el('section',undefined,'marketSection');tcg.append(el('h3','TCGplayer · Not connected'),el('p','Automatic listing and inventory sync require approved TCGplayer API access and store authorization. No listings are sent to TCGplayer.'));safeMarketLink(tcg,'https://docs.tcgplayer.com/docs/getting-started','TCGplayer API access requirements ↗');marketDialog.append(tcg);
}
async function openMarketplaceListing(r){
 const session=token;const data=await api('marketplace',{action:'listing',stockId:r.stockId});if(!token||token!==session)return;marketShell('Marketplaces · #'+r.stockId);
 marketDialog.append(el('h3',r.name),el('p',(r.slab||r.condition)+' · S$'+money(r.price)+' · '+(r.sold?'Sold':'Available')));
 const batch=batchFor(r);if(batch){const panel=el('section',undefined,'marketSection');panel.append(el('h3','Carousell batch · '+batch.name),el('p',batch.status),el('pre',batch.description,'marketPreview'));if(batch.url)safeMarketLink(panel,batch.url,'Open batch listing ↗');marketDialog.append(panel);}
 const form=el('section',undefined,'marketSection');form.append(el('h3','Carousell listing'),el('p','Record the public listing and your notes here. Saving tracks it; it does not post to or edit Carousell.','hint'));
 const l=data.carousell;const label=el('label','Carousell status'),state=el('select');state.setAttribute('aria-label','Carousell status');for(const [value,text] of [['not_listed','Not listed'],['draft','Draft'],['listed','Listed'],['sold','Marked sold on Carousell']]){const o=el('option',text);o.value=value;state.append(o);}state.value=l.status;label.append(state);form.append(label);
 const url=marketField(form,'Carousell listing URL',l.url),title=marketField(form,'Carousell listing title',l.title),notes=marketField(form,'Listing details / notes',l.notes,true);title.maxLength=180;notes.maxLength=1500;url.placeholder='https://www.carousell.sg/p/…';
 if(l.url)safeMarketLink(form,l.url,'Open Carousell listing ↗');if(r.sold&&l.status==='listed')form.append(el('p','Action needed: this card is sold in your inventory. Mark its Carousell listing sold, then update the status here.','rowerror'));
 marketAction(form,'Save Carousell details',async()=>{await api('marketplace',{action:'link',link:{...l,url:url.value.trim(),title:title.value.trim(),notes:notes.value.trim(),status:state.value}});status('Carousell details saved.');await openMarketplaceListing(r);});
 const description=r.name+'\n'+(r.slab||r.condition)+' · S$'+money(r.price)+'\n\nPhotos / private offer: https://t.me/'+bot+'?start=listing_'+r.stockId+'\n\n'+(data.template||'');
 const prepared=el('details');prepared.append(el('summary','Prepared listing description'),el('pre',description,'marketPreview'));marketAction(prepared,'Copy listing description',async()=>{await navigator.clipboard.writeText(description);status('Listing description copied.');});form.append(prepared);marketDialog.append(form);
 const telegram=el('section',undefined,'marketSection');telegram.append(el('h3','Telegram delivery'));
 if(!data.telegram?.length)telegram.append(el('p','No external marketplace posts tracked for this listing. Enable destinations before publishing new listings.'));
 for(const p of data.telegram||[]){const row=el('div',undefined,'marketDestination');row.append(el('strong',p.name),el('p',p.status.replaceAll('_',' ')));if(p.error)row.append(el('p',p.error,'rowerror'));if(p.messageId&&String(p.chatId).startsWith('-100'))safeMarketLink(row,'https://t.me/c/'+String(p.chatId).slice(4)+'/'+(p.topicId?p.topicId+'/':'')+p.messageId,'Open Telegram post ↗');
 if(p.status==='needs_review'){const message=marketField(row,'Existing message ID ('+p.name+')',p.messageId?String(p.messageId):'0');row.append(el('p','Check the group first. Enter the existing post’s message ID to adopt it, or 0 only if no post was sent.','hint'));marketAction(row,'Confirm checked & retry',async()=>{if(!/^\d+$/.test(message.value)||!Number.isSafeInteger(Number(message.value)))throw Error('Enter a valid message ID.');await api('marketplace',{action:'resolve',stockId:r.stockId,destinationId:p.destinationId,messageId:Number(message.value)});await openMarketplaceListing(r);});}telegram.append(row);}
 marketAction(telegram,'Refresh delivery status',()=>openMarketplaceListing(r));marketDialog.append(telegram);
}
const telegram=window.Telegram?.WebApp;
async function telegramSignIn(){
 if(!telegram?.initData)return;
 $('telegramLoginStatus').textContent='Verifying your Telegram account…';
 try{const result=await api('manager-login',{initData:telegram.initData});token=result.token;await load(false,result.inventory);$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;$('telegramLoginStatus').textContent='';status('Inventory ready.');}
 catch(e){token='';$('telegramLoginStatus').textContent=e.message;throw e;}
}
$('telegramLogin').onclick=()=>task(telegramSignIn);
if(telegram?.initData){telegram.ready();telegram.expand();$('telegramLogin').hidden=false;$('loginForm').hidden=true;task(telegramSignIn);}
else task(resumeSession);
document.addEventListener('visibilitychange',()=>{if(document.hidden&&saveTimer)autosave(tab);});
window.addEventListener('beforeunload',e=>{if(dirty.size||templateDirty){e.preventDefault();e.returnValue='';}});
// The inbox. Buyers talk to the bot all day; most of it the bot answers
// itself, and what it could not answer used to sit in a DM nobody on this
// side could read back. A reply here goes out as the bot, in the
// conversation they already have open, so they never meet a second voice.
let inboxThreads=[],inboxMessages=[],inboxWho=0,inboxLoaded=false;
async function loadInbox(){
 const {threads}=await api('inbox',{action:'list'});
 inboxThreads=threads||[];inboxLoaded=true;
 // The badge counts people, not messages, and now it counts them from the
 // list in hand rather than the number sign-in happened to send.
 inboxUnread=inboxThreads.filter(t=>t.unread).length;
 if(inboxWho&&!inboxThreads.some(t=>t.userId===inboxWho)){inboxWho=0;inboxMessages=[];}
 renderInbox();
}
async function openInboxThread(userId){
 const out=await api('inbox',{action:'open',userId});
 inboxWho=userId;inboxMessages=out.messages||[];
 if(typeof out.unread==='number')inboxUnread=out.unread;
 const thread=inboxThreads.find(t=>t.userId===userId);if(thread)thread.unread=0;
 renderInbox();
}
// Nobody reads a timestamp to the second in a chat: today is a time of day,
// anything older is the day it happened.
const inboxWhen=value=>{
 const at=new Date(value),now=new Date();
 return at.toDateString()===now.toDateString()
  ?at.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})
  :at.toLocaleDateString([],{day:'numeric',month:'short'});
};
const inboxName=t=>t.name||('Telegram user '+t.userId);
function renderInbox(){
 // The badge is drawn here too: render() owns it, and the inbox changes it
 // without going back through a full redraw of the listing table.
 $('inboxCount').textContent=inboxUnread;
 const list=$('inboxThreads');list.replaceChildren();
 if(!inboxThreads.length)list.append(el('p','Nobody has written to the bot yet.','inboxEmpty'));
 for(const thread of inboxThreads){
  const row=el('button',undefined,'inboxThread'+(thread.userId===inboxWho?' active':''));row.type='button';
  const head=el('strong',inboxName(thread));
  if(thread.unread)head.append(' ',el('span',String(thread.unread),'unread'));
  const preview=thread.lastFile?'Sent a photo or file':(thread.last||'');
  row.append(head,el('small',(thread.incoming?'':'You: ')+preview),el('small',inboxWhen(thread.at)));
  row.setAttribute('aria-label','Open the conversation with '+inboxName(thread)+(thread.unread?', '+thread.unread+' unread':''));
  row.onclick=()=>task(()=>openInboxThread(thread.userId));
  list.append(row);
 }
 const who=$('inboxWho'),body=$('inboxMessages');who.replaceChildren();body.replaceChildren();
 if(!inboxWho){
  $('inboxReplyForm').hidden=true;
  body.append(el('p','Pick somebody on the left to read what they said.','inboxEmpty'));
  return;
 }
 const current=inboxThreads.find(t=>t.userId===inboxWho);
 who.textContent=current?inboxName(current):('Telegram user '+inboxWho);
 $('inboxReplyForm').hidden=false;
 if(!inboxMessages.length)body.append(el('p','Nothing in this conversation yet.','inboxEmpty'));
 for(const m of inboxMessages){
  const bubble=el('div',undefined,'inboxMessage'+(m.incoming?'':' out'));
  bubble.append(el('span',m.file?('Sent a photo or file'+(m.body?' · '+m.body:'')):m.body));
  bubble.append(el('small',(m.incoming?'':'Sent as the bot · ')+inboxWhen(m.at)));
  body.append(bubble);
 }
 body.scrollTop=body.scrollHeight;
}
$('refreshInbox').onclick=()=>task(async()=>{inboxLoaded=false;await loadInbox();if(inboxWho)await openInboxThread(inboxWho);status('Inbox refreshed.');});
$('inboxReplyForm').onsubmit=e=>{e.preventDefault();task(async()=>{
 const box=$('inboxReply'),text=box.value.trim();
 if(!text||!inboxWho)return;
 const out=await api('inbox',{action:'reply',userId:inboxWho,text});
 // Cleared only once Telegram has taken it: until then this box holds the
 // only copy of what was written.
 box.value='';
 if(out.messages)inboxMessages=out.messages;
 if(typeof out.unread==='number')inboxUnread=out.unread;
 await loadInbox();renderInbox();
 status(out.unrecorded?'Sent, but it could not be saved to the conversation.':'Sent.',!!out.unrecorded);
});};

// The card show list. Cards that are paid for and still here: what we are
// bringing to the show, what is waiting to be posted, who wants a meetup,
// and what somebody has simply left with us.
//
// One list, read four ways. Every card carries the choice its owner made,
// so moving a card between the four is a change to the card, not a move
// between lists.
let holdPeople=[],holdCounts={},holdChoice='cardshow',holdLoaded=false;
const holdNames={cardshow:'Collecting at the show',ship:'To post',meetup:'Meetups',hold:'Held'};
// The pile names read as headings, not as the end of a sentence:
// "Move to "+"To post" is how a button came to say "Move to to post".
const holdMoveNames={cardshow:'the card show pile',ship:'the post pile',meetup:'the meetup list',hold:'the held box'};
async function loadCardshow(){
 const out=await api('cardshow',{action:'list'});
 holdPeople=out.held||[];holdCounts=out.counts||{};holdLoaded=true;
 renderCardshow();
}
// Whoever has waited longest is already first from the server, and that
// order is kept: it is the order anyone packing a box works in.
const holdShown=()=>holdPeople
  .map(p=>({...p,cards:(p.cards||[]).filter(c=>c.choice===holdChoice)}))
  .filter(p=>p.cards.length);
const holdSince=value=>{
 const days=Math.floor((Date.now()-new Date(value).getTime())/86400000);
 if(days<1)return 'since today';
 if(days===1)return 'since yesterday';
 if(days<31)return 'waiting '+days+' days';
 return 'waiting '+Math.floor(days/30)+' month'+(days<60?'':'s');
};
const holdWho=p=>p.buyerName||('Telegram user '+p.buyerId);
function renderCardshow(){
 for(const choice of ['cardshow','ship','meetup','hold']){
  const badge=$('holdCount'+choice[0].toUpperCase()+choice.slice(1));
  if(badge)badge.textContent=holdCounts[choice]||0;
  const pick=$('holdPick'+choice[0].toUpperCase()+choice.slice(1));
  if(pick)pick.classList.toggle('active',choice===holdChoice);
 }
 holdWaiting=holdCounts.cardshow||0;$('cardshowCount').textContent=holdWaiting;
 const list=$('cardshowPeople');list.replaceChildren();
 const people=holdShown();
 if(!people.length){list.append(el('p','Nothing waiting under '+holdNames[holdChoice].toLowerCase()+'.','holdEmpty'));return;}
 for(const person of people){
  const box=el('div',undefined,'holdPerson'),head=el('header');
  const total=person.cards.reduce((n,c)=>n+(c.price||0),0);
  head.append(el('h3',holdWho(person)),el('span',person.cards.length+' card'+(person.cards.length===1?'':'s')+' · '+money(total)+' · '+holdSince(person.since),'holdSince'));
  const cards=el('ul',undefined,'holdCards');
  for(const card of person.cards){
   const row=el('li');
   row.append(el('span',(card.test?'[test] ':'')+card.name+(card.slab?' · '+card.slab:'')+(card.condition?' · '+card.condition:'')));
   row.append(el('span',(card.source==='claim'?'claim sale':'shop'),'holdWhere'));
   cards.append(row);
  }
  const actions=el('div',undefined,'holdActions');
  // Handing them over is the common one, so it leads and the rest are
  // the places a card can be moved to instead.
  const done=el('button','Handed over');done.type='button';done.className='primary';
  done.onclick=()=>task(async()=>{
   const out=await api('cardshow',{action:'collected',buyerId:person.buyerId,how:holdChoice,cards:person.cards.map(c=>c.stockId)});
   holdPeople=out.held||[];holdCounts=out.counts||{};renderCardshow();
   status(count(person.cards.length,'card')+' out of the box for '+holdWho(person)+'.');
  });
  actions.append(done);
  for(const choice of ['cardshow','ship','meetup','hold']){
   if(choice===holdChoice)continue;
   const move=el('button','Move to '+holdMoveNames[choice]);move.type='button';
   move.onclick=()=>task(async()=>{
    const out=await api('cardshow',{action:'choice',buyerId:person.buyerId,choice,cards:person.cards.map(c=>c.stockId)});
    holdPeople=out.held||[];holdCounts=out.counts||{};renderCardshow();
    status('Moved to '+holdMoveNames[choice]+'.');
   });
   actions.append(move);
  }
  box.append(head,cards,actions);
  list.append(box);
 }
}
for(const choice of ['cardshow','ship','meetup','hold']){
 const pick=$('holdPick'+choice[0].toUpperCase()+choice.slice(1));
 if(pick)pick.onclick=()=>{holdChoice=choice;renderCardshow();};
}
$('refreshCardshow').onclick=()=>task(async()=>{holdLoaded=false;await loadCardshow();status('Card show list refreshed.');});

})();
