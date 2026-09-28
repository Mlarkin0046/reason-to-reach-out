import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, createHermesGenerator } from '../backend/hermes.js';

const input = {
  firstName: 'Avery',
  company: 'Prairie Air Systems',
  situation: 'The proposal is paused while the team compares installation disruption.'
};

function executorReturning(stdout, calls = []) {
  return (command, args, options, callback) => {
    calls.push({ command, args, options });
    callback(null, stdout);
  };
}

test('invokes the low-latency Hermes model with safe, non-reasoning oneshot arguments', async () => {
  const calls = [];
  const generate = createHermesGenerator({ exec: executorReturning('{"diagnosis":"ok","assumptions":[],"plays":[]}', calls) });
  await generate(input);

  assert.equal(calls[0].command, 'hermes');
  assert.deepEqual(calls[0].args.slice(0, 7), [
    '--provider', 'openrouter', '--model', 'openai/gpt-4.1-mini',
    '--reasoning', 'none', '--safe-mode'
  ]);
  assert.equal(calls[0].args[7], '--oneshot');
  assert.equal(calls[0].args[8], buildPrompt(input));
});

test('honors command, provider, and model overrides', async () => {
  const calls = [];
  const generate = createHermesGenerator({
    command: '/opt/hermes-custom', provider: 'custom-provider', model: 'custom/model',
    exec: executorReturning('{"diagnosis":"ok","assumptions":[],"plays":[]}', calls)
  });
  await generate(input);
  assert.equal(calls[0].command, '/opt/hermes-custom');
  assert.deepEqual(calls[0].args.slice(0, 4), ['--provider', 'custom-provider', '--model', 'custom/model']);
});

test('reads command, provider, and model overrides from the environment', async () => {
  const previous = {
    command: process.env.HERMES_CLI,
    provider: process.env.RTRO_HERMES_PROVIDER,
    model: process.env.RTRO_HERMES_MODEL
  };
  Object.assign(process.env, {
    HERMES_CLI: '/env/hermes',
    RTRO_HERMES_PROVIDER: 'env-provider',
    RTRO_HERMES_MODEL: 'env/model'
  });
  try {
    const calls = [];
    await createHermesGenerator({ exec: executorReturning('{"diagnosis":"ok"}', calls) })(input);
    assert.equal(calls[0].command, '/env/hermes');
    assert.deepEqual(calls[0].args.slice(0, 4), ['--provider', 'env-provider', '--model', 'env/model']);
  } finally {
    for (const [key, value] of Object.entries({
      HERMES_CLI: previous.command,
      RTRO_HERMES_PROVIDER: previous.provider,
      RTRO_HERMES_MODEL: previous.model
    })) value === undefined ? delete process.env[key] : process.env[key] = value;
  }
});

test('prompt retains safeguards and adds compact, grounded output constraints', () => {
  const prompt = buildPrompt(input);
  for (const required of [
    'Create exactly four distinct, ranked, prospect-centered plays',
    'never invent facts, proof, urgency, news, metrics, or existing assets',
    'diagnosis must be exactly 2 sentences',
    'title must be under 7 words',
    'strategicAngle, whyNow, valueToBring, and rationale must each be one sentence under 28 words',
    'exactly 2 short steps',
    'email under 90 words', 'call opener under 55 words', 'voicemail under 50 words',
    'text under 35 words', 'LinkedIn under 65 words',
    'mailed card and gift note each under 70 words',
    'If an assumption is unknown, leave assumptions empty',
    'Never invent location, market, budget, authority, or technical feasibility'
  ]) assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
});

test('parses exact, fenced, and briefly wrapped first complete JSON objects', async () => {
  const expected = { diagnosis: 'A {brace} in a string.', assumptions: [], plays: [] };
  for (const stdout of [
    JSON.stringify(expected),
    `\n\`\`\`json\n${JSON.stringify(expected, null, 2)}\n\`\`\`\n`,
    `Here is the {brief} result:\n${JSON.stringify(expected)}\nDone.`
  ]) {
    const actual = await createHermesGenerator({ exec: executorReturning(stdout) })(input);
    assert.deepEqual(actual, expected);
  }
});

test('parses JSON returned in a Hermes response envelope', async () => {
  const expected = { diagnosis: 'ok', assumptions: [], plays: [] };
  const stdout = JSON.stringify({ response: `Result:\n${JSON.stringify(expected)}` });
  assert.deepEqual(await createHermesGenerator({ exec: executorReturning(stdout) })(input), expected);
});

test('rejects output with missing or unparseable JSON', async () => {
  for (const stdout of ['', 'No structured result', 'prefix {"broken": true']) {
    const generate = createHermesGenerator({ exec: executorReturning(stdout) });
    await assert.rejects(generate(input), /Hermes returned invalid JSON/);
  }
});
