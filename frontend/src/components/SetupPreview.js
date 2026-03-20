import React from 'react';
import { setupValue } from '../setupDefaults';

/**
 * Compact mock of the guest vote page — updates as hosts edit fields.
 */
export default function SetupPreview({ draft }) {
  const title = setupValue(draft, 'title');
  const subtitle = setupValue(draft, 'subtitle');
  const voteHeading = setupValue(draft, 'vote_heading');
  const nameLabel = setupValue(draft, 'name_label');
  const namePh = setupValue(draft, 'name_placeholder');
  const girlText = setupValue(draft, 'girl_button_text');
  const boyText = setupValue(draft, 'boy_button_text');
  const submitText = setupValue(draft, 'submit_button_text');
  const hs = setupValue(draft, 'header_start');
  const he = setupValue(draft, 'header_end');
  const primary = setupValue(draft, 'primary_color');
  const secondary = setupValue(draft, 'secondary_color');
  const hero = draft?.hero_image_url;

  return (
    <div className="setup-preview">
      <p className="setup-preview-label">Preview — guests see something like this</p>
      <div className="setup-preview-inner">
        <div
          className="setup-preview-header"
          style={{ background: `linear-gradient(to right, ${hs}, ${he})` }}
        >
          <h3 className="setup-preview-title">{title}</h3>
          {subtitle ? <p className="setup-preview-sub">{subtitle}</p> : null}
        </div>
        {hero ? (
          <div className="setup-preview-hero">
            <img src={hero} alt="" />
          </div>
        ) : null}
        <div className="setup-preview-body">
          <h4 className="setup-preview-h4">{voteHeading}</h4>
          <div className="setup-preview-name">
            <span className="setup-preview-name-lbl">{nameLabel}</span>
            <span className="setup-preview-name-ph">{namePh}</span>
          </div>
          <div className="setup-preview-btns">
            <span
              className="setup-preview-chip"
              style={{ background: secondary, color: '#fff' }}
            >
              {girlText}
            </span>
            <span
              className="setup-preview-chip"
              style={{ background: primary, color: '#fff' }}
            >
              {boyText}
            </span>
          </div>
          <div className="setup-preview-submit">{submitText}</div>
        </div>
      </div>
    </div>
  );
}
