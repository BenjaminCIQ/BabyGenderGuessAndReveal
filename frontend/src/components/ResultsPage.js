import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import { PieChart, Pie } from 'recharts';
import { toPng } from 'html-to-image';
import { usePublicConfig } from '../context/PublicConfigContext';
import {
  buildResultsCsv,
  buildResultsJson,
  downloadBlob,
} from '../utils/resultsExport';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

function ResultsPage() {
  const { config } = usePublicConfig();
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confetti, setConfetti] = useState([]);
  const [exporting, setExporting] = useState(false);
  const revealExportRef = useRef(null);

  const c = useMemo(() => config || {}, [config]);
  const primary = c.primary_color || '#89CFF0';
  const secondary = c.secondary_color || '#FFB6C1';

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await axios.get(`${API_BASE}/results`);
        setResults(response.data);

        if (response.data && response.data.revealed && confetti.length === 0) {
          const colors =
            response.data.actual_gender === 'boy'
              ? ['#89CFF0', '#0078D7', '#42A5F5', '#1E88E5', '#FFFFFF']
              : ['#FFB6C1', '#FF69B4', '#E83E8C', '#FF1493', '#FFFFFF'];

          const newConfetti = [];
          for (let i = 0; i < 100; i++) {
            newConfetti.push({
              id: i,
              x: Math.random() * window.innerWidth,
              y: -Math.random() * 500,
              size: Math.random() * 10 + 5,
              color: colors[Math.floor(Math.random() * colors.length)],
              speed: Math.random() * 3 + 2,
              angle: Math.random() * 360,
            });
          }
          setConfetti(newConfetti);
        }
      } catch (err) {
        setError('Failed to load results');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
    const interval = setInterval(fetchResults, 1000);
    return () => clearInterval(interval);
  }, [confetti.length]);

  useEffect(() => {
    if (confetti.length === 0) return;

    const interval = setInterval(() => {
      setConfetti((prev) =>
        prev
          .map((x) => ({
            ...x,
            y: x.y + x.speed,
            x: x.x + Math.sin(x.angle) * 2,
          }))
          .filter((x) => x.y < window.innerHeight),
      );
    }, 50);

    return () => clearInterval(interval);
  }, [confetti]);

  const saveRevealImage = useCallback(async () => {
    const node = revealExportRef.current;
    if (!node) return;
    setExporting(true);
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2.5,
        cacheBust: true,
        backgroundColor: '#ffffff',
      });
      const a = document.createElement('a');
      const slug = results?.actual_gender || 'reveal';
      a.download = `gender-reveal-${slug}-${Date.now()}.png`;
      a.href = dataUrl;
      a.click();
    } catch (e) {
      console.error(e);
      alert('Could not create the image. Try a different browser or disable extensions.');
    } finally {
      setExporting(false);
    }
  }, [results?.actual_gender]);

  const saveJson = useCallback(() => {
    const json = buildResultsJson(c, results);
    downloadBlob(
      `gender-reveal-results-${Date.now()}.json`,
      new Blob([json], { type: 'application/json' }),
    );
  }, [c, results]);

  const saveCsv = useCallback(() => {
    const csv = buildResultsCsv(results);
    downloadBlob(
      `gender-reveal-guests-${Date.now()}.csv`,
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    );
  }, [results]);

  if (loading) return <div className="loading">Loading results...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!results) return <div className="error">No results available</div>;

  const chartData = [
    { name: 'Boy', value: results.boy, fill: primary },
    { name: 'Girl', value: results.girl, fill: secondary },
  ];

  const correctN = results.correct_guesses?.length ?? 0;
  const wrongN = results.incorrect_guesses?.length ?? 0;
  const longDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="results-container">
      {results.revealed ? (
        <div className="reveal-results">
          <div ref={revealExportRef} className="reveal-export-snapshot">
            {c.title ? <p className="memory-event-title">{c.title}</p> : null}
            {c.subtitle ? <p className="memory-event-subtitle">{c.subtitle}</p> : null}
            <div className={`big-reveal ${results.actual_gender}`}>
              <h2>
                It&apos;s a {results.actual_gender.toUpperCase()}!
              </h2>
              <span className="reveal-emoji-line" aria-hidden>
                {results.actual_gender === 'boy' ? '💙👶' : '💖👶'}
              </span>
            </div>
            <p className="memory-footer-stats">
              {correctN} correct guess{correctN === 1 ? '' : 'es'} · {wrongN} other guess
              {wrongN === 1 ? '' : 'es'} · {results.total_votes} vote
              {results.total_votes === 1 ? '' : 's'} total
            </p>
            <p className="memory-footer-date">{longDate}</p>

            <div className="guesses-summary reveal-export-guesslists">
              <h3>{c.guessing_results_heading || 'Guessing Results'}</h3>
              <div className="guesses-container">
                <div className="correct-guesses">
                  <h4>{c.correct_guesses_label || 'Correct Guesses'}</h4>
                  <ul>
                    {results.correct_guesses.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </div>
                <div className="incorrect-guesses">
                  <h4>{c.incorrect_guesses_label || 'Incorrect Guesses'}</h4>
                  <ul>
                    {results.incorrect_guesses.map((name, index) => (
                      <li key={index}>{name}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="reveal-export-actions">
            <button
              type="button"
              className="export-btn export-btn-primary"
              onClick={saveRevealImage}
              disabled={exporting}
            >
              {exporting ? 'Creating image…' : 'Save reveal image'}
            </button>
            <button type="button" className="export-btn" onClick={saveJson} disabled={exporting}>
              Download JSON summary
            </button>
            <button type="button" className="export-btn" onClick={saveCsv} disabled={exporting}>
              Download guest list (CSV)
            </button>
            <p className="export-hint">
              Save a high-resolution PNG of the memory card and guest lists, or download data for your records.
            </p>
          </div>
        </div>
      ) : (
        <div className="live-results">
          <h2>{c.live_results_heading || 'Live Voting Results'}</h2>

          <div className="chart-container">
            <PieChart width={400} height={400}>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={100}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
              />
            </PieChart>
          </div>

          <div className="vote-counts">
            <div className="boy-votes">
              <span className="vote-label">Boy:</span> {results.boy} votes
            </div>
            <div className="girl-votes">
              <span className="vote-label">Girl:</span> {results.girl} votes
            </div>
          </div>

          <p className="refresh-note">{c.refresh_note || 'This page refreshes automatically'}</p>
        </div>
      )}

      {confetti.length > 0 && (
        <div className="confetti-container">
          {confetti.map((x) => (
            <div
              key={x.id}
              className="confetti"
              style={{
                left: `${x.x}px`,
                top: `${x.y}px`,
                width: `${x.size}px`,
                height: `${x.size}px`,
                backgroundColor: x.color,
                transform: `rotate(${x.angle}deg)`,
                animation: `confetti ${3 + Math.random() * 2}s linear`,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ResultsPage;
