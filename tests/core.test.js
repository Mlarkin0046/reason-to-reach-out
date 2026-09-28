import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSource, deriveRubricTotal, normalizePlan } from '../backend/core.js';
import { buildPrompt } from '../backend/hermes.js';

test('source sanitization is bounded and tag-safe', () => {
  assert.equal(sanitizeSource(' Spring Campaign / West! '), 'Spring Campaign West');
  assert.equal(sanitizeSource('<script>alert(1)</script>'), 'scriptalert1script');
  assert.equal(sanitizeSource(''), 'direct');
  assert.ok(sanitizeSource('x'.repeat(200)).length <= 60);
});

test('rubric total is derived and model total is ignored', () => {
  const rubric = { relevance:2, newness:1, value:2, decisionHelp:1, prospectBenefit:2, total:999 };
  assert.equal(deriveRubricTotal(rubric), 8);
  assert.deepEqual(Object.keys(deriveRubricTotal(rubric, true)), ['relevance','newness','value','decisionHelp','prospectBenefit','total']);
});

test('normalization requires four complete plays and signs every script with first name', () => {
  const rubric = { relevance:2, newness:1, value:2, decisionHelp:1, prospectBenefit:2, total:99 };
  const scripts = { email:'Hello', callOpener:'Hello', voicemail:'Hello', text:'Hello', linkedIn:'Hello', mailedCard:'Hello', giftLeaveBehind:'Hello' };
  const play = { title:'Decision guide', strategicAngle:'Clarify tradeoffs', whyNow:'Planning is active', valueToBring:'A guide', primaryChannel:'Email', sequence:['Send guide'], rationale:'Useful and specific', rubric, scripts };
  const result = normalizePlan({ diagnosis:'Useful', assumptions:[], plays:[play,play,play,play] }, 'Avery');
  assert.equal(result.plays[0].rubric.total, 8);
  assert.ok(Object.values(result.plays[0].scripts).every((text) => text.endsWith('Avery')));
  assert.throws(() => normalizePlan({ diagnosis:'x', plays:[play] }, 'Avery'), /four/i);
});

test('server prompt uses second person, requires rubric, and contains no fixed sender identity', () => {
  const prompt = buildPrompt({ firstName:'Avery', situation:'Verified facts' });
  assert.match(prompt, /Address the app user as "you"/);
  for (const key of ['relevance','newness','value','decisionHelp','prospectBenefit']) assert.match(prompt, new RegExp(key));
  assert.doesNotMatch(prompt, /Mike|Larkin/);
});
