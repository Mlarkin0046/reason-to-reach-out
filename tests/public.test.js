import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../public/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
const js = await readFile(new URL('app.js', root), 'utf8');
const example = JSON.parse(await readFile(new URL('example.json', root), 'utf8'));

test('public contains exactly one production API address and supports explicit override', () => {
  const combined = `${html}\n${js}`;
  assert.equal((combined.match(/https:\/\/api\.reasontoreachout\.com/g) || []).length, 1);
  assert.match(js, /const API_BASE = "https:\/\/api\.reasontoreachout\.com"/);
  assert.match(js, /window\.__RTRO_API_BASE/);
  assert.doesNotMatch(combined, /sslip\.io|\/api\/micro-ai|GHL_API_KEY|GHL_LOCATION_ID|Bearer\s+[A-Za-z0-9]/i);
});

test('public has no real-client data or internal owner controls', () => {
  const combined = `${html}\n${js}\n${JSON.stringify(example)}`;
  assert.doesNotMatch(combined, /Bethany Life|LifeChoices|Kenzie King|65% gap/i);
  assert.doesNotMatch(combined, /Email this plan|setup required|Owner tools|Export GHL|CSV/i);
});

test('required public content and privacy language are present', () => {
  assert.match(html, /Your first name/);
  assert.match(html, /See an example first/);
  assert.match(html, /situation text is sent to an AI service for generation/i);
  assert.match(html, /prospect details are never sent to GHL/i);
  assert.match(html, /© Airstrike Marketing/);
  assert.match(html, /Reason to Reach Out demo/);
  assert.match(html, /property="og:url" content="https:\/\/reasontoreachout\.com"/);
  assert.equal((html.match(/recommendations only[^<]*nothing[^<]*(?:sent|ordered|mailed)/gi) || []).length, 1);
});

test('contact constants, error copy, tracking, example and mobile rules exist', () => {
  assert.match(js, /const CONTACT_EMAIL = 'mlarkin@airstrikemarketing\.us';/);
  assert.match(js, /515-577-3750/); assert.match(js, /tel:\+15155773750/);
  assert.match(js, /const BOOKING_URL = 'https:\/\/book\.airstrikemarketing\.us\/widget\/bookings\/30-mincalendar';/);
  assert.match(js, /player\.vimeo\.com\/video\/921187412#t=356s/);
  assert.match(js, /mailboxpower\.com\/platform\/platform-demo\?invite=loyaltyeffect/);
  assert.match(js, /We're getting a lot of requests right now\. Try again in a minute, or view the example below\./);
  for (const type of ['lead_capture','feedback','plan_generated','play_selected','channel_viewed','wording_copied','pdf_downloaded','contact_click']) assert.match(js, new RegExp(type));
  assert.equal(example.sample, true);
  assert.equal(example.plays.length, 4);
  assert.match(html, /@media\s*\(max-width:\s*480px\)/);
});

test('hero uses the approved combined message', () => {
  assert.match(html, /<h1>Give them a reason to care\.<\/h1>/);
  assert.match(html, /<p>Earn the next conversation\.[^<]*turns a real situation into four useful reasons a prospect may want to hear from you[^<]*without manufactured urgency\.<\/p>/i);
});

test('example CTA has a prominent accessible treatment and supporting cue', () => {
  assert.match(html, /<p class="example-cue">Not sure what to enter\? Start here\.<\/p>/);
  assert.match(html, /\.example\{[^}]*background:var\(--gold\)[^}]*color:#10213c[^}]*border:/);
  assert.match(html, /\.example:hover\{/);
  assert.match(html, /\.example:focus-visible\{/);
  assert.match(html, /<button id="exampleButton" class="example" type="button">See an example first<\/button>/);
});

test('physical and standard contact copy exactly match the specification', () => {
  for (const text of [
    'Want this on their desk this week?',
    "Physical follow-up gets opened when email doesn't. I can help you set it up, or you can see how it works on your own.",
    'Talk to Mike', 'Book 15 minutes',
    'Questions about this play?', 'Happy to talk it through.'
  ]) assert.match(js, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(js, /includes\(play\.primaryChannel\)/);
  assert.doesNotMatch(js, /Want help making|Want another set of eyes|Book 30 minutes|Watch the demo|Explore Mailbox Power|Explore the platform/);
});

test('every plan gets one distinct accessible Mailbox Power callout after Talk to Mike', () => {
  for (const text of [
    'Mailing can help this follow-up stand out.',
    'A timely card or small gift gives your reason to reach out a physical presence, especially when another email is easy to miss.',
    'Sending cards and gifts requires a Mailbox Power account.'
  ]) assert.equal((js.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1, `expected one shared instance of: ${text}`);
  assert.match(js, /const mailing=`<aside class="mailing-callout" aria-labelledby="mailingCalloutHeading">/);
  assert.match(js, /\$\{primary\}\$\{mailing\}/);
  assert.equal((js.match(/link\('See how sending works \(2 min\)'/g) || []).length, 1);
  assert.equal((js.match(/link\('Go to Mailbox Power'/g) || []).length, 1);
  assert.match(html, /\.mailing-callout\{[^}]*border-left:[^}]*var\(--gold\)[^}]*padding:/);
  assert.match(html, /\.mailing-callout \.contact-links a:focus-visible\{[^}]*outline:[^}]*outline-offset:/);
  assert.match(html, /@media\s*\(max-width:\s*480px\)[^{]*\{[^}]*\.mailing-callout \.contact-links a\{[^}]*flex:/s);
});

test('feedback UX uses exact labels, immediate Yes, and exact thanks copy', () => {
  assert.match(html, /<h3 class="feedback-callout" aria-label="We’d love your feedback\. Would you actually send this\?">\s*<span[^>]*>We’d love your feedback\.<\/span>\s*<span[^>]*>Would you actually send this\?<\/span>\s*<\/h3>/);
  assert.match(html, /\.feedback-callout\{[^}]*background:var\(--gold\)[^}]*color:#10213c[^}]*border-radius:[^}]*padding:[^}]*flex-wrap:wrap/);
  assert.match(html, /\.feedback-callout \.feedback-invite\{[^}]*font-weight:/);
  assert.match(html, /\.feedback-callout \.feedback-question\{/);
  assert.match(html, /data-feedback="Yes">Yes, as-is</);
  assert.match(html, /data-feedback="With Edits">With edits</);
  assert.match(html, /data-feedback="No">No</);
  assert.match(html, /What's missing\?/);
  assert.match(js, /state\.feedback==='Yes'/);
  assert.match(js, /Thanks — this helps\./);
});

test('PDF requires and embeds the bundled Airstrike logo', () => {
  assert.match(js, /const PDF_LOGO_PATH = 'Airstrike_Marketing_logo_design_300_DPI\.png';/);
  assert.match(js, /fetch\(PDF_LOGO_PATH,[^;]*signal:controller\.signal/);
  assert.match(js, /if \(!response\.ok\) throw new Error\(`Logo load failed: \$\{response\.status\}`\)/);
  assert.match(js, /await doc\.embedPng\(logoBytes\)/);
  assert.match(js, /logo\.scale\(/);
  assert.match(js, /clearTimeout\(timeout\)/);
});

test('PDF includes exact Airstrike contact details and a compact four-play overview', () => {
  for (const text of [
    "const CONTACT_NAME = 'Mike Larkin';",
    "const CONTACT_COMPANY = 'Airstrike Marketing';",
    "const PHONE_DISPLAY = '515-577-3750'",
    "const CONTACT_EMAIL = 'mlarkin@airstrikemarketing.us';",
    "const BOOKING_URL = 'https://book.airstrikemarketing.us/widget/bookings/30-mincalendar';"
  ]) assert.ok(js.includes(text), `missing PDF contact detail: ${text}`);
  assert.match(js, /function drawFirstPage\(/);
  assert.match(js, /Plan context/);
  assert.match(js, /Sender:/);
  assert.match(js, /Prospect company:/);
  assert.match(js, /Relationship:/);
  assert.match(js, /Stage:/);
  assert.match(js, /Ranked overview — all four plays/);
  assert.match(js, /state\.data\.plays\.forEach/);
  assert.match(js, /Score:.*\/10.*Channel:/);
  assert.match(js, /function drawContactFooter\(/);
});

test('PDF page one uses remaining space for a bounded recommended first play', () => {
  assert.match(js, /Recommended first play/);
  assert.match(js, /const recommended = state\.data\.plays\[0\]/);
  assert.match(js, /recommended\.title/);
  assert.match(js, /recommended\.whyNow/);
  assert.match(js, /recommended\.valueToBring/);
  assert.match(js, /recommended\.sequence\?\.\[0\]/);
  for (const label of ['Why now', 'Value to bring', 'First step']) assert.ok(js.includes(label));
  assert.match(js, /clippedLines\(.*recommended\.title[^\n]*\)/);
  assert.match(js, /const printSafeBottom = 54/);
  assert.match(js, /if \(y < printSafeBottom\) return false/);
});

test('PDF recommended panel includes the second sequence step when present', () => {
  assert.match(js, /recommended\.sequence\?\.\[1\]/);
  assert.ok(js.includes('Second step'));
});

test('PDF recommended panel includes clipped rationale and primary-channel wording', () => {
  assert.match(js, /drawRecommendedField\('Why this play',recommended\.rationale,/);
  assert.match(js, /recommended\.scripts\?\.\[recommended\.primaryChannel\]/);
  assert.ok(js.includes('Suggested wording'));
});

test('PDF normalizes whitespace before replacing punctuation and unsupported characters', () => {
  const expression = js.match(/const safeText = \(value\) => ([\s\S]*?);/)?.[1];
  assert.ok(expression, 'safeText expression not found');
  const safeText = new Function('value', `return ${expression}`);
  assert.equal(safeText('Line one\n\tLine two\u0007'), 'Line one Line two?');
  assert.equal(safeText('\u2018Smart\u2019 \u201cquotes\u201d \u2014 dash'), `'Smart' "quotes" - dash`);
});

test('PDF recommended panel bounds every field and keeps text print-safe', () => {
  assert.match(js, /const availableLines = Math\.floor\(\(y - printSafeBottom\) \/ recommendedLeading\)/);
  assert.match(js, /if \(availableLines < 2\) return false/);
  assert.match(js, /clippedLines\(value,font,9,contentWidth-20,Math\.min\(limit,availableLines-1\)\)/);
  assert.match(js, /if \(!drawBoundedLine\(label,/);
});

test('generation has a thirty-second abort and browser APIs are guarded', () => {
  assert.match(js, /new AbortController\(\)/);
  assert.match(js, /30_000/);
  assert.match(js, /signal:controller\.signal/);
  assert.match(js, /typeof crypto/);
  assert.match(js, /typeof sessionStorage/);
  assert.match(js, /navigator\.clipboard\?\./);
  assert.match(js, /URL\.createObjectURL/);
  assert.match(js, /window\.PDFLib/);
});

test('public directory has no extension artifacts or test logs', async () => {
  const files = await readdir(root);
  assert.equal(files.some((name) => /extension|manifest\.json|tdd|\.log$/i.test(name)), false);
});
