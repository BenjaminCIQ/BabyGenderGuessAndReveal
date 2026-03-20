/**
 * Mirrors backend DEFAULT_CONFIG — used for placeholders, hints, and preview fallbacks.
 */
export const SETUP_DEFAULTS = {
  title: 'Baby Gender Vote',
  subtitle: '',
  vote_heading: "What's your guess?",
  name_label: 'Your Name (optional):',
  name_placeholder: 'Enter your name',
  boy_button_text: "It's a BOY! 💙",
  girl_button_text: "It's a GIRL! 💖",
  submit_button_text: 'Submit My Prediction',
  live_results_heading: 'Live Voting Results',
  guessing_results_heading: 'Guessing Results',
  correct_guesses_label: 'Correct Guesses',
  incorrect_guesses_label: 'Incorrect Guesses',
  refresh_note: 'This page refreshes automatically',
  primary_color: '#89CFF0',
  secondary_color: '#FFB6C1',
  header_start: '#89CFF0',
  header_end: '#FFB6C1',
  hero_image_url: '',
};

/** Resolved value for preview (draft wins when non-empty string). */
export function setupValue(draft, key) {
  const v = draft?.[key];
  if (v !== undefined && v !== null && String(v).trim() !== '') {
    return v;
  }
  return SETUP_DEFAULTS[key];
}
