from flask import Flask, request, jsonify, g, send_from_directory, make_response
from flask_cors import CORS
from dotenv import load_dotenv
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash
from werkzeug.utils import secure_filename
import sqlite3
import json
import os
import uuid
from datetime import datetime, timezone

load_dotenv()

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.normpath(os.path.join(BACKEND_DIR, '..'))
REACT_BUILD = os.path.join(REPO_ROOT, 'frontend', 'build')
UPLOAD_FOLDER = os.path.join(BACKEND_DIR, 'uploads')
ALLOWED_UPLOAD_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
SITE_GATE_COOKIE = 'site_gate'
SITE_GATE_MAX_AGE = 60 * 60 * 24 * 30

app = Flask(__name__, static_folder=REACT_BUILD, static_url_path='/')
app.config['MAX_CONTENT_LENGTH'] = 5 * 1024 * 1024
app.secret_key = os.environ.get('SECRET_KEY', 'dev-only-set-SECRET_KEY-in-production')
CORS(app, allow_headers=['Content-Type', 'X-Admin-Key'])

DATABASE = os.path.join(BACKEND_DIR, 'gender_reveal.db')
ADMIN_KEY = os.environ.get('ADMIN_KEY', '').strip()


def _site_gate_serializer():
    return URLSafeTimedSerializer(app.secret_key, salt='site-gate-v1')

DEFAULT_CONFIG = {
    'title': 'Baby Gender Vote',
    'subtitle': '',
    'vote_heading': "What's your guess?",
    'name_label': 'Your Name (optional):',
    'name_placeholder': 'Enter your name',
    'boy_button_text': "It's a BOY! 💙",
    'girl_button_text': "It's a GIRL! 💖",
    'submit_button_text': 'Submit My Prediction',
    'live_results_heading': 'Live Voting Results',
    'guessing_results_heading': 'Guessing Results',
    'correct_guesses_label': 'Correct Guesses',
    'incorrect_guesses_label': 'Incorrect Guesses',
    'refresh_note': 'This page refreshes automatically',
    'primary_color': '#89CFF0',
    'secondary_color': '#FFB6C1',
    'header_start': '#89CFF0',
    'header_end': '#FFB6C1',
    'hero_image_url': '',
    'scheduled_reveal_at': '',
    'scheduled_reveal_heading': 'Reveal countdown',
    'scheduled_reveal_auto': False,
    'scheduled_reveal_gender': '',
}

# Never expose the scheduled gender via public /api/config (would leak the answer).
PUBLIC_CONFIG_STRIP_KEYS = frozenset({'scheduled_reveal_gender'})


def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()


def ensure_votes_voter_id_column():
    """Migrate older DBs created before voter_id existed (init_db only runs on first create)."""
    if not os.path.exists(DATABASE):
        return
    conn = sqlite3.connect(DATABASE)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='votes'",
        )
        if cur.fetchone() is None:
            return
        cur.execute('PRAGMA table_info(votes)')
        columns = {row[1] for row in cur.fetchall()}
        if 'voter_id' not in columns:
            cur.execute('ALTER TABLE votes ADD COLUMN voter_id TEXT')
            conn.commit()
    finally:
        conn.close()


def ensure_app_config_table():
    if not os.path.exists(DATABASE):
        return
    conn = sqlite3.connect(DATABASE)
    try:
        cur = conn.cursor()
        cur.execute(
            """CREATE TABLE IF NOT EXISTS app_config (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                config_json TEXT NOT NULL DEFAULT '{}'
            )""",
        )
        cur.execute('SELECT id FROM app_config WHERE id = 1')
        if cur.fetchone() is None:
            cur.execute(
                'INSERT INTO app_config (id, config_json) VALUES (1, ?)',
                (json.dumps({}),),
            )
            conn.commit()
    finally:
        conn.close()


def load_merged_config():
    merged = DEFAULT_CONFIG.copy()
    try:
        db = get_db()
        row = db.execute('SELECT config_json FROM app_config WHERE id = 1').fetchone()
    except sqlite3.OperationalError:
        return merged
    if row and row['config_json']:
        try:
            stored = json.loads(row['config_json'])
            if isinstance(stored, dict):
                merged.update(stored)
        except json.JSONDecodeError:
            pass
    return merged


def _site_password_hash():
    return (load_merged_config().get('site_password_hash') or '').strip()


def site_cookie_unlocked():
    h = _site_password_hash()
    if not h:
        return True
    token = request.cookies.get(SITE_GATE_COOKIE)
    if not token:
        return False
    try:
        data = _site_gate_serializer().loads(token, max_age=SITE_GATE_MAX_AGE)
        return isinstance(data, dict) and data.get('ok') is True
    except (BadSignature, SignatureExpired, TypeError):
        return False


def require_site_unlock():
    if not _site_password_hash():
        return None
    if site_cookie_unlocked():
        return None
    return jsonify({'error': 'site_locked', 'site_locked': True}), 403


def public_config_dict():
    merged = load_merged_config()
    out = {k: merged.get(k, v) for k, v in DEFAULT_CONFIG.items()}
    for k in PUBLIC_CONFIG_STRIP_KEYS:
        out.pop(k, None)
    gated = bool(_site_password_hash())
    out['site_gated'] = gated
    out['site_unlocked'] = site_cookie_unlocked() if gated else True
    return out


def admin_config_response(merged):
    """JSON for admin PUT response — never expose password hash."""
    out = {k: merged.get(k, v) for k, v in DEFAULT_CONFIG.items()}
    out['site_password_set'] = bool(merged.get('site_password_hash'))
    return out


def _parse_iso_utc(s):
    s = (s or '').strip()
    if not s:
        return None
    try:
        if s.endswith('Z'):
            s = s[:-1] + '+00:00'
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def maybe_auto_reveal(db):
    """If auto-reveal is enabled and scheduled time has passed, reveal and persist."""
    merged = load_merged_config()
    if not merged.get('scheduled_reveal_auto'):
        return
    gender = (merged.get('scheduled_reveal_gender') or '').strip().lower()
    if gender not in ('boy', 'girl'):
        return
    at = _parse_iso_utc(merged.get('scheduled_reveal_at') or '')
    if not at:
        return
    now = datetime.now(timezone.utc)
    if now < at:
        return
    cursor = db.cursor()
    cursor.execute('SELECT revealed FROM reveal WHERE id = 1')
    row = cursor.fetchone()
    if row and row['revealed']:
        return
    cursor.execute('SELECT * FROM reveal WHERE id = 1')
    if cursor.fetchone():
        cursor.execute('UPDATE reveal SET revealed = 1, actual_gender = ? WHERE id = 1', (gender,))
    else:
        cursor.execute('INSERT INTO reveal (id, revealed, actual_gender) VALUES (1, 1, ?)', (gender,))
    db.commit()


def get_provided_admin_key():
    """Accept admin key via X-Admin-Key, JSON body, or form (uploads)."""
    key = (request.headers.get('X-Admin-Key') or '').strip()
    if key:
        return key
    if request.is_json:
        data = request.get_json(silent=True) or {}
        return (data.get('admin_key') or '').strip()
    if request.form:
        return (request.form.get('admin_key') or '').strip()
    return ''


def require_admin_key(provided):
    if not ADMIN_KEY:
        return jsonify({'error': 'Server misconfigured: set ADMIN_KEY in backend/.env'}), 503
    if not provided or provided != ADMIN_KEY:
        return jsonify({'error': 'Unauthorized'}), 401
    return None


@app.route('/api/config', methods=['GET'])
def public_config():
    return jsonify(public_config_dict())


@app.route('/api/site-unlock', methods=['POST'])
def site_unlock():
    h = _site_password_hash()
    if not h:
        return jsonify({'error': 'Guest password is not enabled'}), 400
    data = request.get_json(silent=True) or {}
    pw = (data.get('password') or '').strip()
    if not pw or not check_password_hash(h, pw):
        return jsonify({'error': 'Invalid password'}), 401
    resp = make_response(jsonify({'success': True}))
    token = _site_gate_serializer().dumps({'ok': True})
    resp.set_cookie(
        SITE_GATE_COOKIE,
        token,
        max_age=SITE_GATE_MAX_AGE,
        httponly=True,
        samesite='Lax',
        path='/',
    )
    return resp


@app.route('/api/admin/config', methods=['GET'])
def admin_get_config():
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err
    merged = load_merged_config()
    return jsonify(admin_config_response(merged))


@app.route('/api/admin/config', methods=['PUT'])
def admin_put_config():
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err
    body = request.get_json(silent=True) or {}
    merged = load_merged_config()

    if body.get('clear_site_password'):
        merged.pop('site_password_hash', None)

    pw = body.get('site_password')
    if isinstance(pw, str) and pw.strip():
        merged['site_password_hash'] = generate_password_hash(pw.strip())

    incoming = {k: v for k, v in body.items() if k in DEFAULT_CONFIG}
    merged.update(incoming)

    blob = json.dumps(merged)
    db = get_db()
    if db.execute('SELECT id FROM app_config WHERE id = 1').fetchone():
        db.execute('UPDATE app_config SET config_json = ? WHERE id = 1', (blob,))
    else:
        db.execute('INSERT INTO app_config (id, config_json) VALUES (1, ?)', (blob,))
    db.commit()
    return jsonify(admin_config_response(merged))


def _allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_UPLOAD_EXTENSIONS


@app.route('/api/admin/upload', methods=['POST'])
def admin_upload():
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    if not f or not f.filename:
        return jsonify({'error': 'No file'}), 400
    if not _allowed_file(f.filename):
        return jsonify({'error': 'Allowed: png, jpg, jpeg, gif, webp'}), 400
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)
    ext = f.filename.rsplit('.', 1)[1].lower()
    name = f'{uuid.uuid4().hex}.{ext}'
    safe = secure_filename(name)
    path = os.path.join(UPLOAD_FOLDER, safe)
    f.save(path)
    url = f'/uploads/{safe}'
    return jsonify({'url': url})


@app.route('/uploads/<path:filename>')
def serve_upload(filename):
    if not os.path.isdir(UPLOAD_FOLDER):
        return jsonify({'error': 'Not found'}), 404
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/vote', methods=['POST'])
def submit_vote():
    gate = require_site_unlock()
    if gate:
        return gate
    data = request.get_json()
    name = data.get('name', 'Anonymous')
    vote = data.get('vote')

    if request.headers.get('X-Forwarded-For'):
        ip_address = request.headers.get('X-Forwarded-For').split(',')[0].strip()
    elif request.headers.get('X-Real-IP'):
        ip_address = request.headers.get('X-Real-IP')
    else:
        ip_address = request.remote_addr

    voter_id = request.cookies.get('voter_id')

    existing_vote = False

    db = get_db()
    maybe_auto_reveal(db)

    if not voter_id:
        voter_id = str(uuid.uuid4())
    else:
        cursor1 = db.cursor()
        cursor1.execute('SELECT id FROM votes WHERE voter_id = ?', (voter_id,))
        existing_vote = cursor1.fetchone()

    if not vote or vote not in ['boy', 'girl']:
        return jsonify({'error': 'Invalid vote'}), 400

    cursor = db.cursor()
    cursor.execute('SELECT revealed FROM reveal WHERE id = 1')
    reveal_info = cursor.fetchone()

    if reveal_info and reveal_info['revealed']:
        return jsonify({'error': 'Voting has closed as gender has been revealed'}), 403

    if existing_vote:
        return jsonify({'error': 'You have already voted from this device/location'}), 409

    cursor.execute(
        'INSERT INTO votes (name, vote, ip_address, voter_id) VALUES (?, ?, ?, ?)',
        (name, vote, ip_address, voter_id),
    )
    db.commit()

    response = make_response(jsonify({"status": "success"}))
    response.set_cookie('voter_id', voter_id, max_age=60 * 60 * 24)
    return response


def _party_status_from_db(db):
    cursor = db.cursor()

    cursor.execute('SELECT revealed, actual_gender FROM reveal WHERE id = 1')
    reveal_info = cursor.fetchone()
    revealed = reveal_info['revealed'] if reveal_info else False
    actual_gender = reveal_info['actual_gender'] if reveal_info else None

    cursor.execute('SELECT vote, COUNT(*) as count FROM votes GROUP BY vote')
    votes = cursor.fetchall()

    results = {
        'boy': 0,
        'girl': 0,
        'revealed': revealed,
        'actual_gender': actual_gender if revealed else None,
        'total_votes': 0,
    }

    for row in votes:
        results[row['vote']] = row['count']
        results['total_votes'] += row['count']

    if revealed and actual_gender:
        cursor.execute('SELECT name, vote FROM votes')
        all_votes = cursor.fetchall()

        correct_guesses = []
        incorrect_guesses = []

        for vote in all_votes:
            if vote['vote'] == actual_gender:
                correct_guesses.append(vote['name'])
            else:
                incorrect_guesses.append(vote['name'])

        results['correct_guesses'] = correct_guesses
        results['incorrect_guesses'] = incorrect_guesses

    return results


@app.route('/api/results', methods=['GET'])
def get_results():
    gate = require_site_unlock()
    if gate:
        return gate
    db = get_db()
    maybe_auto_reveal(db)
    results = _party_status_from_db(db)
    merged = load_merged_config()
    results['scheduled_reveal_at'] = (merged.get('scheduled_reveal_at') or '').strip()
    results['scheduled_reveal_heading'] = merged.get('scheduled_reveal_heading') or DEFAULT_CONFIG[
        'scheduled_reveal_heading'
    ]
    results['scheduled_reveal_auto'] = bool(merged.get('scheduled_reveal_auto'))
    return jsonify(results)


@app.route('/api/admin/party-status', methods=['GET'])
def admin_party_status():
    """Vote/reveal counts without site-password gate — for setup UI."""
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err
    db = get_db()
    full = _party_status_from_db(db)
    return jsonify(
        {
            'revealed': full['revealed'],
            'actual_gender': full.get('actual_gender'),
            'boy': full['boy'],
            'girl': full['girl'],
            'total_votes': full['total_votes'],
        }
    )


@app.route('/api/admin/reveal', methods=['POST'])
def reveal():
    data = request.get_json(silent=True) or {}
    gender = data.get('gender')

    err = require_admin_key(get_provided_admin_key())
    if err:
        return err

    if gender not in ['boy', 'girl']:
        return jsonify({'error': 'Invalid gender'}), 400

    db = get_db()
    cursor = db.cursor()

    cursor.execute('SELECT * FROM reveal WHERE id = 1')
    if cursor.fetchone():
        cursor.execute('UPDATE reveal SET revealed = 1, actual_gender = ? WHERE id = 1', (gender,))
    else:
        cursor.execute('INSERT INTO reveal (id, revealed, actual_gender) VALUES (1, 1, ?)', (gender,))

    db.commit()

    return jsonify({'success': True})


@app.route('/api/admin/reset', methods=['POST'])
def reset_results():
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err

    db = get_db()
    cursor = db.cursor()

    cursor.execute('DELETE FROM votes')

    cursor.execute('UPDATE reveal SET revealed = 0, actual_gender = NULL WHERE id = 1')
    if cursor.rowcount == 0:
        cursor.execute('INSERT INTO reveal (id, revealed, actual_gender) VALUES (1, 0, NULL)')

    db.commit()

    return jsonify({'success': True, 'message': 'All data has been reset'})


@app.route('/api/admin/votes', methods=['GET'])
def admin_list_votes():
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err
    conn = get_db()
    votes = conn.execute('SELECT * FROM votes ORDER BY timestamp DESC').fetchall()
    return jsonify([dict(row) for row in votes])


@app.route('/api/admin/votes/<int:vote_id>', methods=['DELETE'])
def admin_delete_vote(vote_id):
    err = require_admin_key(get_provided_admin_key())
    if err:
        return err
    conn = get_db()
    cur = conn.execute('DELETE FROM votes WHERE id = ?', (vote_id,))
    conn.commit()
    if cur.rowcount == 0:
        return jsonify({'error': 'Vote not found'}), 404
    return jsonify({'success': True})


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    if not os.path.isdir(REACT_BUILD):
        return (
            'React build not found. From frontend run: npm install && npm run build',
            503,
            {'Content-Type': 'text/plain'},
        )
    file_path = os.path.join(app.static_folder, path)
    if path and os.path.exists(file_path) and os.path.isfile(file_path):
        return send_from_directory(app.static_folder, path)
    return send_from_directory(app.static_folder, 'index.html')


ensure_votes_voter_id_column()
ensure_app_config_table()

os.makedirs(UPLOAD_FOLDER, exist_ok=True)


if __name__ == '__main__':
    if not os.path.exists(DATABASE):
        init_db()
        ensure_app_config_table()
    app.run(host='0.0.0.0', port=5000, debug=True)
