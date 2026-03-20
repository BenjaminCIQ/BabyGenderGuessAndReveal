function csvEscape(s) {
  const t = String(s ?? '');
  if (/[",\n]/.test(t)) {
    return `"${t.replace(/"/g, '""')}"`;
  }
  return t;
}

export function buildResultsJson(config, results) {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      eventTitle: config?.title || 'Baby Gender Vote',
      subtitle: config?.subtitle || '',
      revealed: results.revealed,
      actualGender: results.actual_gender,
      totalVotes: results.total_votes,
      boyVotes: results.boy,
      girlVotes: results.girl,
      correctGuesses: results.correct_guesses,
      incorrectGuesses: results.incorrect_guesses,
    },
    null,
    2,
  );
}

/** One row per guest name with whether they guessed correctly (after reveal). */
export function buildResultsCsv(results) {
  const lines = ['Name,Outcome'];
  for (const name of results.correct_guesses || []) {
    lines.push(`${csvEscape(name)},Correct`);
  }
  for (const name of results.incorrect_guesses || []) {
    lines.push(`${csvEscape(name)},Incorrect`);
  }
  return lines.join('\r\n');
}

export function downloadBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
