(() => {
  'use strict';
  const API_BASE = "https://api.reasontoreachout.com";
  const CONTACT_NAME = 'Mike Larkin';
  const CONTACT_COMPANY = 'Airstrike Marketing';
  const CONTACT_EMAIL = 'mlarkin@airstrikemarketing.us';
  const PHONE_DISPLAY = '515-577-3750', PHONE_LINK = 'tel:+15155773750';
  const BOOKING_URL = 'https://book.airstrikemarketing.us/widget/bookings/30-mincalendar';
  const PDF_LOGO_PATH = 'Airstrike_Marketing_logo_design_300_DPI.png';
  const VIDEO_URL = 'https://player.vimeo.com/video/921187412#t=356s';
  const MAILBOX_URL = 'https://www.mailboxpower.com/platform/platform-demo?invite=loyaltyeffect';
  const MAILING_HEADING = 'Mailing can help this follow-up stand out.';
  const MAILING_BODY = 'A timely card or small gift gives your reason to reach out a physical presence, especially when another email is easy to miss.';
  const MAILING_NOTE = 'Sending cards and gifts requires a Mailbox Power account.';
  const CHANNELS = ['Email','Call opener','Voicemail','Text','LinkedIn','Mailed card','Gift/leave-behind'];
  const RUBRIC = [['relevance','Relevance'],['newness','Newness'],['value','Value'],['decisionHelp','Decision help'],['prospectBenefit','Prospect benefit']];
  const $ = (s) => document.querySelector(s);
  const apiBase = () => typeof window.__RTRO_API_BASE === 'string' ? window.__RTRO_API_BASE.replace(/\/$/,'') : API_BASE;
  const cleanSource = (v) => String(v || '').normalize('NFKC').replace(/[^a-zA-Z0-9 _.-]/g,'').replace(/\s+/g,' ').trim().slice(0,60) || 'direct';
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const makeId = () => typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `rtro-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storage = { get:(key)=>{try{return typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(key) : null;}catch{return null;}}, set:(key,value)=>{try{if(typeof sessionStorage !== 'undefined')sessionStorage.setItem(key,value);}catch{}} };
  const source = (() => { const fromUrl = new URLSearchParams(location.search).get('src'); if (fromUrl) storage.set('rtro_source',cleanSource(fromUrl)); return cleanSource(storage.get('rtro_source')); })();
  const state = { data:null, input:{}, selected:0, channel:'Email', sessionId:storage.get('rtro_session') || makeId(), email:'', verificationToken:'', feedback:'' };
  storage.set('rtro_session',state.sessionId);

  function collect() { return { firstName:$('#firstName').value.trim(), relationship:$('#relationship').value, stage:$('#stage').value, company:$('#company').value.trim(), prospectName:$('#prospectName').value.trim(), prospectRole:$('#prospectRole').value.trim(), situation:$('#situation').value.trim(), priority:$('#priority').value.trim(), lastContact:$('#lastContact').value.trim(), trigger:$('#trigger').value.trim(), desiredNextStep:$('#nextStep').value.trim() }; }
  function eventPayload(type, extra={}) { const play=state.data?.plays?.[state.selected]; return { type, sessionId:state.sessionId, timestamp:new Date().toISOString(), source, ...(state.email && state.verificationToken ? {email:state.email,verificationToken:state.verificationToken}:{}), ...(play ? {selectedPlay:play.title,channel:state.channel}:{}), ...extra }; }
  async function track(type, extra={}) { try { const response=await fetch(`${apiBase()}/api/rtro/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(eventPayload(type,extra))}); if(!response.ok) throw new Error(`event ${response.status}`); } catch(error) { console.warn('RTRO event relay unavailable:',error); } }
  const rubricHtml = (r) => `<div class="rubric">${RUBRIC.map(([k,label])=>`<span>${label}<br><b>${r[k]}/2</b></span>`).join('')}</div>`;
  function render() {
    const play=state.data.plays[state.selected]; state.channel=CHANNELS.includes(state.channel)?state.channel:play.primaryChannel;
    $('#emptyState').style.display='none'; $('#results').classList.add('show'); $('#diagnosisCopy').textContent=state.data.diagnosis;
    $('#reasonList').innerHTML=state.data.plays.map((p,i)=>`<button type="button" class="reason-card ${i===state.selected?'active':''}" data-play="${i}"><span class="score">${p.rubric.total}/10</span><span><b>${p.rank}. ${escapeHtml(p.title)}</b><small>${escapeHtml(p.strategicAngle)} · ${escapeHtml(p.primaryChannel)}</small>${rubricHtml(p.rubric)}</span></button>`).join('');
    document.querySelectorAll('[data-play]').forEach((b)=>b.onclick=()=>{state.selected=Number(b.dataset.play);state.channel=state.data.plays[state.selected].primaryChannel;render();track('play_selected',{rank:state.selected+1,score:state.data.plays[state.selected].rubric.total});});
    $('#scorecard').innerHTML=`<b>Why this scores ${play.rubric.total}/10</b>${rubricHtml(play.rubric)}<p>${escapeHtml(play.rationale)}</p>`;
    $('#playPlan').innerHTML=`<div class="plan-card"><b>Why they may care now</b><p>${escapeHtml(play.whyNow)}</p></div><div class="plan-card"><b>Value to bring</b><p>${escapeHtml(play.valueToBring)}</p></div><div class="plan-card"><b>Primary channel</b><p>${escapeHtml(play.primaryChannel)}</p></div><div class="plan-card"><b>Sequence</b><ol>${play.sequence.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol></div>`;
    $('#channels').innerHTML=CHANNELS.map((c)=>`<button type="button" class="channel ${c===state.channel?'active':''}" data-channel="${c}" role="tab" aria-selected="${c===state.channel}">${c}</button>`).join('');
    document.querySelectorAll('[data-channel]').forEach((b)=>b.onclick=()=>{state.channel=b.dataset.channel;render();track('channel_viewed');});
    $('#messageText').textContent=play.scripts[state.channel]; renderContact(play);
  }
  function link(label,href,target) { const external=href.startsWith('http'); return `<a href="${href}" data-contact="${target}"${external?' target="_blank" rel="noopener"':''}>${label}</a>`; }
  function contactContent(play) {
    const physical=['Mailed card','Gift/leave-behind'].includes(play.primaryChannel);
    return physical ? {
      physical, heading:'Want this on their desk this week?',
      body:"Physical follow-up gets opened when email doesn't. I can help you set it up, or you can see how it works on your own."
    } : { physical, heading:'Questions about this play?', body:'Happy to talk it through.' };
  }
  function renderContact(play) {
    const content=contactContent(play);
    const primary=`<p><strong>Talk to Mike</strong></p><div class="contact-links">${link(PHONE_DISPLAY,PHONE_LINK,'phone')}${link(CONTACT_EMAIL,`mailto:${CONTACT_EMAIL}`,'email')}${link('Book 15 minutes',BOOKING_URL,'booking')}</div>`;
    const mailing=`<aside class="mailing-callout" aria-labelledby="mailingCalloutHeading"><h4 id="mailingCalloutHeading">${MAILING_HEADING}</h4><p>${MAILING_BODY}</p><div class="contact-links">${link('See how sending works (2 min)',VIDEO_URL,'video')}${link('Go to Mailbox Power',MAILBOX_URL,'mailbox_power')}</div><p class="muted">${MAILING_NOTE}</p></aside>`;
    $('#contactBlock').innerHTML=`<h3>${content.heading}</h3><p>${content.body}</p>${primary}${mailing}`;
    document.querySelectorAll('[data-contact]').forEach((a)=>a.onclick=()=>track('contact_click',{target:a.dataset.contact}));
  }
  function showPlan(data,input,sample=false) { state.data=data;state.input=input;state.selected=0;state.channel=data.plays[0].primaryChannel;$('#diagnosisTitle').textContent=sample?'Fictional sample: Prairie Air Systems':'Relevance before repetition.';$('#status').className='status';render();if(!sample)track('plan_generated',{relationship:input.relationship,stage:input.stage}); }

  $('#reasonForm').addEventListener('submit',async(e)=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;const button=$('#submitButton');const controller=typeof AbortController !== 'undefined' ? new AbortController() : null;const timeout=setTimeout(()=>controller?.abort(),30_000);state.input=collect();button.disabled=true;$('#status').className='status loading show';$('#status').textContent='Building four prospect-centered plays…';try{const response=await fetch(`${apiBase()}/api/rtro/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.input),...(controller?{signal:controller.signal}:{})});if(!response.ok)throw new Error(`generate ${response.status}`);showPlan(await response.json(),state.input);if(typeof window.ASOS_COMPLETE==='function')window.ASOS_COMPLETE({input:state.input,...state.data},'json');}catch(error){console.warn('RTRO generation unavailable:',error);$('#status').className='status error show';$('#status').textContent="We're getting a lot of requests right now. Try again in a minute, or view the example below.";$('#exampleButton').focus();if(window.ASOS_RUN&&typeof window.ASOS_FAIL==='function')window.ASOS_FAIL(String(error.message||error));}finally{clearTimeout(timeout);button.disabled=false;}});
  $('#exampleButton').onclick=async()=>{const input={firstName:'Avery',relationship:'Stalled deal',stage:'Proposal or quote',company:'Prairie Air Systems',prospectName:'Jordan',prospectRole:'Operations Director',situation:'A regional HVAC contractor is comparing proposals while planning phased rooftop-unit replacements across six locations. The team liked the approach but is concerned about disruption during peak cooling season.',priority:'Maintaining uptime and coordinating six sites',lastContact:'3 weeks',trigger:'The customer shared its summer maintenance window dates.',desiredNextStep:'A 15-minute sequencing review'};Object.entries({firstName:'firstName',relationship:'relationship',stage:'stage',company:'company',prospectName:'prospectName',prospectRole:'prospectRole',situation:'situation',priority:'priority',lastContact:'lastContact',trigger:'trigger',desiredNextStep:'nextStep'}).forEach(([k,id])=>{$(`#${id}`).value=input[k]});const response=await fetch('example.json',{cache:'no-store'});showPlan(await response.json(),input,true);$('#results').scrollIntoView({behavior:'smooth'});};
  $('#copyButton').onclick=async()=>{try{if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');await navigator.clipboard.writeText($('#messageText').textContent);$('#copyButton').textContent='Copied';track('wording_copied');setTimeout(()=>$('#copyButton').textContent='Copy wording',1200);}catch{const selection=window.getSelection?.();const range=document.createRange?.();if(selection&&range){range.selectNodeContents($('#messageText'));selection.removeAllRanges();selection.addRange(range);}$('#copyButton').textContent='Select and copy';}};
  $('#downloadPdf').onclick=()=>{$('#ownerFirstName').value=state.input.firstName||'';$('#verificationStep').hidden=true;$('#verificationCode').value='';$('#verificationCode').required=false;$('#captureSubmit').textContent='Send verification code';$('#captureStatus').className='status';$('#captureOverlay').classList.add('show');}; $('#closeModal').onclick=()=>$('#captureOverlay').classList.remove('show');
  async function loadPdfLogo() {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch(PDF_LOGO_PATH, { cache:'no-store', signal:controller.signal });
      if (!response.ok) throw new Error(`Logo load failed: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }

  async function createPdf() {
    if (!window.PDFLib) throw new Error('PDF support is unavailable.');
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const logoBytes = await loadPdfLogo();
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const logo = await doc.embedPng(logoBytes);
    const navy = rgb(.08,.16,.28), gold = rgb(.78,.61,.35), muted = rgb(.34,.4,.49), pale = rgb(.97,.95,.91);
    const margin = 44, bodySize = 9, contentWidth = 612 - (margin * 2);

    const safeText = (value) => String(value ?? '').normalize('NFKC')
      .replace(/\s+/g,' ')
      .replace(/[\u2018\u2019]/g,"'").replace(/[\u201c\u201d]/g,'"')
      .replace(/[\u2013\u2014]/g,'-').replace(/[^\x20-\x7E\xA0-\xFF]/g,'?');
    const wrapText = (value, selectedFont=font, size=bodySize, width=contentWidth) => {
      const words = safeText(value).split(/\s+/).filter(Boolean), lines = [];
      let line = '';
      for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (selectedFont.widthOfTextAtSize(candidate,size) <= width) { line = candidate; continue; }
        if (line) lines.push(line);
        if (selectedFont.widthOfTextAtSize(word,size) <= width) { line = word; continue; }
        let piece = '';
        for (const character of word) {
          if (selectedFont.widthOfTextAtSize(piece + character,size) > width) { lines.push(piece); piece = character; }
          else piece += character;
        }
        line = piece;
      }
      if (line || !lines.length) lines.push(line);
      return lines;
    };
    const clippedLines = (value, selectedFont, size, width, limit) => {
      const lines = wrapText(value,selectedFont,size,width);
      if (lines.length <= limit) return lines;
      const clipped = lines.slice(0,limit);
      let last = clipped[limit-1];
      while (last && selectedFont.widthOfTextAtSize(`${last}...`,size) > width) last = last.slice(0,-1);
      clipped[limit-1] = `${last}...`;
      return clipped;
    };
    function drawContactFooter(page) {
      page.drawLine({start:{x:margin,y:35},end:{x:612-margin,y:35},thickness:.6,color:gold});
      page.drawText(`${CONTACT_NAME} | ${CONTACT_COMPANY} | ${PHONE_DISPLAY} | ${CONTACT_EMAIL}`,{x:margin,y:22,size:9,font,color:muted});
    }
    function newDetailPage(title) {
      const page = doc.addPage([612,792]);
      drawContactFooter(page);
      const titleLines = wrapText(title,bold,18,contentWidth);
      let y = 746;
      for (const line of titleLines) { page.drawText(line,{x:margin,y,size:18,font:bold,color:navy}); y -= 22; }
      return { page, y:y-10, title };
    }
    function drawDetailSection(title, lines) {
      let cursor = newDetailPage(title);
      for (const value of lines) {
        for (const line of wrapText(value)) {
          if (cursor.y < 54) cursor = newDetailPage(title);
          cursor.page.drawText(line,{x:margin,y:cursor.y,size:bodySize,font,color:navy});
          cursor.y -= 13;
        }
        cursor.y -= 6;
      }
    }
    function drawFirstPage() {
      const page = doc.addPage([612,792]);
      page.drawRectangle({x:0,y:666,width:612,height:126,color:pale});
      const scaledLogo = logo.scale(135 / logo.width);
      page.drawImage(logo,{x:margin,y:686,width:scaledLogo.width,height:scaledLogo.height});
      const contactX = 356;
      page.drawText(CONTACT_NAME,{x:contactX,y:752,size:11,font:bold,color:navy});
      page.drawText(CONTACT_COMPANY,{x:contactX,y:737,size:9,font,color:navy});
      page.drawText(PHONE_DISPLAY,{x:contactX,y:722,size:9,font,color:navy});
      page.drawText(CONTACT_EMAIL,{x:contactX,y:707,size:9,font,color:navy});
      for (const [index,line] of wrapText(BOOKING_URL,font,9,212).entries())
        page.drawText(line,{x:contactX,y:692-(index*10),size:9,font,color:navy});

      let y = 640;
      page.drawText('REASON TO REACH OUT',{x:margin,y,size:9,font:bold,color:gold});
      y -= 28;
      for (const line of clippedLines(`${state.input.company} - Outreach Plan`,bold,22,contentWidth,2)) {
        page.drawText(line,{x:margin,y,size:22,font:bold,color:navy}); y -= 26;
      }
      page.drawText('Situation diagnosis',{x:margin,y,size:10,font:bold,color:navy}); y -= 16;
      for (const line of clippedLines(state.data.diagnosis,font,9.5,contentWidth,5)) {
        page.drawText(line,{x:margin,y,size:9.5,font,color:navy}); y -= 13;
      }
      y -= 8;
      page.drawText('Plan context',{x:margin,y,size:10,font:bold,color:navy}); y -= 16;
      const context = `Sender: ${state.input.firstName || '-'}   |   Prospect company: ${state.input.company || '-'}   |   Relationship: ${state.input.relationship || '-'}   |   Stage: ${state.input.stage || '-'}`;
      for (const line of clippedLines(context,font,9,contentWidth,3)) { page.drawText(line,{x:margin,y,size:9,font,color:navy}); y -= 13; }
      y -= 10;
      page.drawRectangle({x:margin-8,y:y-4,width:contentWidth+16,height:22,color:navy});
      page.drawText(safeText('Ranked overview — all four plays'),{x:margin,y:y+2,size:11,font:bold,color:rgb(1,1,1)});
      y -= 25;
      state.data.plays.forEach((play) => {
        const heading = `${play.rank}. ${play.title}`;
        const meta = `Score: ${play.rubric.total}/10   |   Channel: ${play.primaryChannel}`;
        for (const line of clippedLines(heading,bold,10,contentWidth-12,2)) { page.drawText(line,{x:margin+6,y,size:10,font:bold,color:navy}); y -= 13; }
        page.drawText(safeText(meta),{x:margin+6,y,size:9,font,color:muted}); y -= 13;
        for (const line of wrapText(play.strategicAngle,font,9,contentWidth-12).slice(0,2)) { page.drawText(line,{x:margin+6,y,size:9,font,color:navy}); y -= 12; }
        y -= 7;
      });

      const recommended = state.data.plays[0];
      const printSafeBottom = 54;
      if (recommended && y - printSafeBottom >= 58) {
        y -= 3;
        const sectionTop = y + 5;
        page.drawRectangle({x:margin-8,y:printSafeBottom,width:contentWidth+16,height:sectionTop-printSafeBottom,color:pale});
        page.drawRectangle({x:margin-8,y:printSafeBottom,width:4,height:sectionTop-printSafeBottom,color:gold});
        const drawBoundedLine = (line, options={}) => {
          if (y < printSafeBottom) return false;
          page.drawText(safeText(line),{x:options.x || margin+6,y,size:options.size || 9,font:options.font || font,color:options.color || navy});
          y -= options.leading || 12;
          return true;
        };
        drawBoundedLine('Recommended first play',{size:10,font:bold,color:gold,leading:20});
        for (const line of clippedLines(recommended.title,bold,11,contentWidth-20,2)) {
          if (!drawBoundedLine(line,{size:11,font:bold,leading:13})) break;
        }
        if (y - 3 >= printSafeBottom) y -= 3;
        const recommendedLeading = 11;
        const drawRecommendedField = (label, value, limit) => {
          if (!value) return false;
          const availableLines = Math.floor((y - printSafeBottom) / recommendedLeading);
          if (availableLines < 2) return false;
          const lines = clippedLines(value,font,9,contentWidth-20,Math.min(limit,availableLines-1));
          if (!drawBoundedLine(label,{size:9,font:bold,color:gold,leading:recommendedLeading})) return false;
          for (const line of lines) {
            if (!drawBoundedLine(line,{leading:recommendedLeading})) return false;
          }
          if (y - 3 >= printSafeBottom) y -= 3;
          return true;
        };
        drawRecommendedField('Why now',recommended.whyNow,2);
        drawRecommendedField('Value to bring',recommended.valueToBring,2);
        drawRecommendedField('First step',recommended.sequence?.[0] || '',2);
        if (recommended.sequence?.[1]) drawRecommendedField('Second step',recommended.sequence[1],2);
        drawRecommendedField('Why this play',recommended.rationale,2);
        drawRecommendedField('Suggested wording',recommended.scripts?.[recommended.primaryChannel] || '',3);
      }
    }

    drawFirstPage();
    if ((state.data.assumptions || []).length) drawDetailSection('Diagnosis and assumptions',[
      state.data.diagnosis,
      ...state.data.assumptions.map(assumption => `Assumption: ${assumption}`)
    ]);
    state.data.plays.forEach((play) => drawDetailSection(
      `${play.rank}. ${play.title} - ${play.rubric.total}/10`,
      [`Relevance ${play.rubric.relevance}/2 | Newness ${play.rubric.newness}/2 | Value ${play.rubric.value}/2 | Decision help ${play.rubric.decisionHelp}/2 | Prospect benefit ${play.rubric.prospectBenefit}/2`,play.strategicAngle,play.whyNow,play.valueToBring,`Primary channel: ${play.primaryChannel}`,...play.sequence.map((item,index)=>`${index+1}. ${item}`),play.rationale,...CHANNELS.map(channel=>`${channel}: ${play.scripts[channel]}`)]
    ));
    const content = contactContent(state.data.plays[state.selected]);
    drawDetailSection(`Talk to ${CONTACT_NAME} - ${CONTACT_COMPANY}`,[content.heading,content.body,CONTACT_NAME,`Phone: ${PHONE_DISPLAY}`,`Email: ${CONTACT_EMAIL}`,`Book 15 minutes: ${BOOKING_URL}`,MAILING_HEADING,MAILING_BODY,`See how sending works (2 min): ${VIDEO_URL}`,`Go to Mailbox Power: ${MAILBOX_URL}`,MAILING_NOTE]);
    const bytes = await doc.save();
    if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') throw new Error('PDF download is unavailable.');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
    anchor.download = 'reason-to-reach-out.pdf';
    anchor.click();
    if (typeof URL.revokeObjectURL === 'function') setTimeout(() => URL.revokeObjectURL(anchor.href),1000);
  }
  $('#contactForm').onsubmit=async(e)=>{e.preventDefault();if(!e.currentTarget.reportValidity())return;const button=$('#captureSubmit');const status=$('#captureStatus');const email=$('#ownerEmail').value.trim().toLowerCase();button.disabled=true;status.className='status loading show';try{if($('#verificationStep').hidden){const response=await fetch(`${apiBase()}/api/rtro/verify/request`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||'Could not send the verification code.');$('#verificationStep').hidden=false;$('#verificationCode').required=true;button.textContent='Verify and download PDF';status.textContent='Code sent. Paste the secure code from your email.';$('#verificationCode').focus();return;}const confirmResponse=await fetch(`${apiBase()}/api/rtro/verify/confirm`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,code:$('#verificationCode').value.trim()})});const confirmation=await confirmResponse.json().catch(()=>({}));if(!confirmResponse.ok||!confirmation.verificationToken)throw new Error(confirmation.error||'The verification code was not accepted.');const verificationToken=confirmation.verificationToken;const captureResponse=await fetch(`${apiBase()}/api/rtro/event`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(eventPayload('lead_capture',{firstName:$('#ownerFirstName').value.trim(),email,company:$('#ownerCompany').value.trim(),consent:$('#nurtureConsent').checked,verificationToken}))});const captureBody=await captureResponse.json().catch(()=>({}));if(captureResponse.status===401){state.email='';state.verificationToken='';$('#verificationStep').hidden=true;$('#verificationCode').value='';$('#verificationCode').required=false;button.textContent='Send verification code';throw new Error('Your verification expired. Please verify again.');}if(!captureResponse.ok)throw new Error(captureBody.error||'Your contact information could not be accepted.');state.email=email;state.verificationToken=verificationToken;await createPdf();track('pdf_downloaded',{score:state.data.plays[state.selected].rubric.total});$('#captureOverlay').classList.remove('show');}catch(error){console.warn('RTRO verified PDF capture unavailable:',error);status.className='status error show';status.textContent=error.message||'Unable to verify and download. Please try again.';}finally{button.disabled=false;}};
  function finishFeedback(){ $('#feedbackPrompt').style.display='none'; $('#feedbackThanks').textContent='Thanks — this helps.'; }
  document.querySelectorAll('[data-feedback]').forEach(b=>b.onclick=()=>{state.feedback=b.dataset.feedback;if(state.feedback==='Yes'){track('feedback',{answer:'Yes',score:state.data.plays[state.selected].rubric.total});finishFeedback();return;}$('#feedbackDetail').classList.add('show');$('#feedbackMissing').focus();});$('#feedbackSubmit').onclick=()=>{track('feedback',{answer:state.feedback,missing:$('#feedbackMissing').value.trim(),score:state.data.plays[state.selected].rubric.total});finishFeedback();};
  function applyRun(run){try{const data=typeof run==='string'?JSON.parse(run):run;if(!data)return;const map={firstName:'firstName',relationship:'relationship',stage:'stage',company:'company',prospectName:'prospectName',prospectRole:'prospectRole',situation:'situation',priority:'priority',lastContact:'lastContact',trigger:'trigger',desiredNextStep:'nextStep',nextStep:'nextStep'};Object.entries(map).forEach(([k,id])=>{if(data[k]!=null)$(`#${id}`).value=data[k]});if($('#firstName').value&&$('#company').value&&$('#situation').value)$('#reasonForm').requestSubmit();}catch(error){if(typeof window.ASOS_FAIL==='function')window.ASOS_FAIL(String(error.message||error));}}
  if(window.ASOS_RUN)applyRun(window.ASOS_RUN);
})();
