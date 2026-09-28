const channels = ['Email', 'Call opener', 'Voicemail', 'Text', 'LinkedIn', 'Mailed card', 'Gift/leave-behind'];
const rubricKeys = ['relevance', 'newness', 'value', 'decisionHelp', 'prospectBenefit'];
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;

export function sanitizeSource(value) {
  return text(value).normalize('NFKC').replace(/[^a-zA-Z0-9 _.-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'direct';
}

export function deriveRubricTotal(input = {}, returnObject = false) {
  const clean = Object.fromEntries(rubricKeys.map((key) => [key, Math.max(0, Math.min(2, Math.round(Number(input[key]) || 0)))]));
  const total = rubricKeys.reduce((sum, key) => sum + clean[key], 0);
  return returnObject ? { ...clean, total } : total;
}

export function normalizePlan(payload, firstName) {
  if (!payload || !Array.isArray(payload.plays) || payload.plays.length !== 4) throw new Error('The strategist must return exactly four complete plays.');
  const signer = text(firstName);
  const plays = payload.plays.map((play, index) => {
    const rawScripts = play?.scripts || {};
    const scripts = {
      Email: rawScripts.email ?? rawScripts.Email,
      'Call opener': rawScripts.callOpener ?? rawScripts['Call opener'],
      Voicemail: rawScripts.voicemail ?? rawScripts.Voicemail,
      Text: rawScripts.text ?? rawScripts.Text,
      LinkedIn: rawScripts.linkedIn ?? rawScripts.linkedin ?? rawScripts.LinkedIn,
      'Mailed card': rawScripts.mailedCard ?? rawScripts['Mailed card'],
      'Gift/leave-behind': rawScripts.giftLeaveBehind ?? rawScripts['Gift/leave-behind']
    };
    for (const key of channels) {
      scripts[key] = text(scripts[key]);
      if (!scripts[key]) throw new Error(`Play ${index + 1} is missing ${key}.`);
      if (signer && !scripts[key].trimEnd().endsWith(signer)) scripts[key] = `${scripts[key].trimEnd()}\n\n${signer}`;
    }
    return {
      rank: index + 1, title: text(play.title, `Play ${index + 1}`), strategicAngle: text(play.strategicAngle),
      whyNow: text(play.whyNow), valueToBring: text(play.valueToBring),
      primaryChannel: channels.includes(play.primaryChannel) ? play.primaryChannel : 'Email',
      sequence: Array.isArray(play.sequence) ? play.sequence.slice(0, 3).map((v) => text(v)).filter(Boolean) : [],
      rationale: text(play.rationale), rubric: deriveRubricTotal(play.rubric, true), scripts
    };
  });
  return { diagnosis: text(payload.diagnosis), assumptions: Array.isArray(payload.assumptions) ? payload.assumptions.map((v) => text(v)).filter(Boolean) : [], plays };
}

export { channels, rubricKeys };
