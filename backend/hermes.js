import { execFile } from 'node:child_process';

export function buildPrompt(input) {
  return `You are a seasoned B2B sales strategist. Address the app user as "you" in reasoning. Write every prospect-facing script from the app user, signed ${input.firstName}. Never introduce a sender name or person that was not supplied in the verified input. Use only verified input; never invent facts, proof, urgency, news, metrics, or existing assets. Create exactly four distinct, ranked, prospect-centered plays. Each play must include title, strategicAngle, whyNow, valueToBring, primaryChannel, a 2-3 step sequence, rationale, scripts for email, callOpener, voicemail, text, linkedIn, mailedCard, and giftLeaveBehind, and rubric with relevance, newness, value, decisionHelp, prospectBenefit each as integers 0..2. Do not provide rubric total. Return strict JSON only with diagnosis, assumptions, and plays.

Keep the response compact without reducing strategic quality: diagnosis must be exactly 2 sentences; each title must be under 7 words; strategicAngle, whyNow, valueToBring, and rationale must each be one sentence under 28 words; replace the earlier sequence range with exactly 2 short steps; email under 90 words; call opener under 55 words; voicemail under 50 words; text under 35 words; LinkedIn under 65 words; mailed card and gift note each under 70 words (use giftLeaveBehind for the gift note).

Every assumption must be grounded in the supplied verified input. If an assumption is unknown, leave assumptions empty. Never invent location, market, budget, authority, or technical feasibility.

VERIFIED INPUT:
${JSON.stringify(input, null, 2)}`;
}

function firstJsonObject(text) {
  for (let start = 0; start < text.length; start += 1) {
    if (text[start] !== '{') continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (inString) {
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === '"') inString = false;
      } else if (character === '"') inString = true;
      else if (character === '{') depth += 1;
      else if (character === '}' && --depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, index + 1));
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
        } catch {}
        break;
      }
    }
  }
  return null;
}

function parseJsonObject(text) {
  if (typeof text !== 'string' || !text.trim()) throw new SyntaxError('no JSON object found');
  try {
    const exact = JSON.parse(text);
    if (exact && typeof exact === 'object' && !Array.isArray(exact)) return exact;
  } catch {}
  const parsed = firstJsonObject(text);
  if (!parsed) throw new SyntaxError('no complete JSON object found');
  return parsed;
}

export function createHermesGenerator({
  command = process.env.HERMES_CLI || 'hermes',
  provider = process.env.RTRO_HERMES_PROVIDER || 'openrouter',
  model = process.env.RTRO_HERMES_MODEL || 'openai/gpt-4.1-mini',
  exec = execFile
} = {}) {
  return (input, { timeoutMs = 30_000 } = {}) => new Promise((resolve, reject) => {
    const args = ['--provider', provider, '--model', model, '--reasoning', 'none', '--safe-mode', '--oneshot', buildPrompt(input)];
    exec(command, args, { timeout: timeoutMs, maxBuffer: 2_000_000, env: process.env }, (error, stdout) => {
      if (error) return reject(error);
      try {
        const raw = parseJsonObject(stdout);
        const value = raw.response ?? raw.output ?? raw.content ?? raw;
        resolve(typeof value === 'string' ? parseJsonObject(value) : value);
      } catch (parseError) { reject(new Error(`Hermes returned invalid JSON: ${parseError.message}`)); }
    });
  });
}
