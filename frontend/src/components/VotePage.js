import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { usePublicConfig } from '../context/PublicConfigContext';

const API_BASE = process.env.REACT_APP_API_BASE || '/api';

function VotePage() {
  const { config } = usePublicConfig();
  const [name, setName] = useState('');
  const [vote, setVote] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const c = config || {};

  useEffect(() => {
    const hasVoted = localStorage.getItem('gender_reveal_voted');
    if (hasVoted) {
      navigate('/results');
      return;
    }

    const checkVotingStatus = async () => {
      try {
        const response = await axios.get(`${API_BASE}/results`);
        if (response.data.revealed) {
          navigate('/results');
        }
      } catch (err) {
        console.error('Failed to check voting status:', err);
      }
    };

    checkVotingStatus();
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!vote) {
      setError('Please select your prediction');
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${API_BASE}/vote`, {
        name: name || 'Anonymous',
        vote,
      });

      navigate('/results');
    } catch (err) {
      if (err.response && err.response.status === 403) {
        setError('Voting has closed as gender has been revealed');
        setTimeout(() => navigate('/results'), 2000);
      } else if (err.response && err.response.status === 409) {
        setError('You have already voted');
        setTimeout(() => navigate('/results'), 2000);
      } else {
        setError('Failed to submit your vote. Please try again.');
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vote-container">
      {c.hero_image_url ? (
        <div className="vote-hero">
          <img src={c.hero_image_url} alt="" />
        </div>
      ) : null}
      <h2>{c.vote_heading || "What's your guess?"}</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="name">{c.name_label || 'Your Name (optional):'}</label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={c.name_placeholder || 'Enter your name'}
          />
        </div>

        <div className="form-group">
          <h3>Boy or girl?</h3>
          <div className="vote-options">
            <button
              type="button"
              className={`vote-btn vote-btn-girl ${vote === 'girl' ? 'selected' : ''}`}
              onClick={() => setVote('girl')}
            >
              {c.girl_button_text || "It's a GIRL! 💖"}
            </button>
            <button
              type="button"
              className={`vote-btn vote-btn-boy ${vote === 'boy' ? 'selected' : ''}`}
              onClick={() => setVote('boy')}
            >
              {c.boy_button_text || "It's a BOY! 💙"}
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="submit-btn" disabled={loading}>
          {loading ? 'Submitting...' : c.submit_button_text || 'Submit My Prediction'}
        </button>
      </form>
    </div>
  );
}

export default VotePage;
