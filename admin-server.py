#!/usr/bin/env python3
"""
Admin server for card management.
Handles image uploads, cropping, background removal, and Cloudflare uploads.

Usage:
    python admin-server.py

Then open http://localhost:5000/admin
"""

import os
import json
import uuid
import io
import base64
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory
from flask_cors import CORS
from PIL import Image
from rembg import remove
import requests

app = Flask(__name__, static_folder='.', template_folder='.')
CORS(app)

# Constants
DATA_FILE = Path(__file__).parent / "data" / "cards.json"
UPLOADS_DIR = Path(__file__).parent / "uploads"
PROCESSED_DIR = Path(__file__).parent / "processed"

# Ensure directories exist
UPLOADS_DIR.mkdir(exist_ok=True)
PROCESSED_DIR.mkdir(exist_ok=True)


def load_cards():
    """Load existing cards from JSON."""
    if DATA_FILE.exists():
        with open(DATA_FILE, "r") as f:
            return json.load(f)
    return {"cards": []}


def save_cards(data):
    """Save cards to JSON."""
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, indent=2)


def upload_to_cloudflare(image_bytes, filename):
    """Upload image to Cloudflare Images."""
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN")

    if not account_id or not api_token:
        raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1"

    headers = {
        "Authorization": f"Bearer {api_token}"
    }

    files = {
        "file": (filename, image_bytes, "image/png")
    }

    response = requests.post(url, headers=headers, files=files)

    if response.status_code != 200:
        raise Exception(f"Cloudflare upload failed: {response.text}")

    result = response.json()
    if not result.get("success"):
        raise Exception(f"Cloudflare upload failed: {result.get('errors')}")

    # Return the delivery URL with medium variant (good for cards - ~500px)
    image_id = result["result"]["id"]
    delivery_hash = os.environ.get("CLOUDFLARE_DELIVERY_HASH", "3oZsG34qPq3SIXQhl47vqA")

    # Use 'medium' variant for optimal card size (retina-friendly but not excessive)
    return f"https://imagedelivery.net/{delivery_hash}/{image_id}/medium"


def generate_card_id(word, card_type):
    """Generate a unique card ID."""
    short_uuid = str(uuid.uuid4())[:8]
    prefix = "face-" if card_type == "face" else ""
    return f"{prefix}{word.lower()}-{short_uuid}"


# Routes
@app.route('/')
def index():
    return send_from_directory('.', 'admin.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


@app.route('/api/cards', methods=['GET'])
def get_cards():
    """Get all cards."""
    return jsonify(load_cards())


@app.route('/api/upload-temp', methods=['POST'])
def upload_temp():
    """Upload image temporarily for preview/cropping."""
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    # Generate temp filename
    ext = Path(file.filename).suffix or '.png'
    temp_filename = f"temp_{uuid.uuid4().hex[:8]}{ext}"
    temp_path = UPLOADS_DIR / temp_filename

    file.save(temp_path)

    # Get image dimensions
    img = Image.open(temp_path)
    width, height = img.size

    return jsonify({
        "filename": temp_filename,
        "path": f"uploads/{temp_filename}",
        "width": width,
        "height": height
    })


@app.route('/api/process-number-card', methods=['POST'])
def process_number_card():
    """Process a number card: crop, remove background, upload to Cloudflare."""
    data = request.json

    required = ['filename', 'word', 'cropX', 'cropY', 'cropWidth', 'cropHeight']
    for field in required:
        if field not in data:
            return jsonify({"error": f"Missing field: {field}"}), 400

    temp_path = UPLOADS_DIR / data['filename']
    if not temp_path.exists():
        return jsonify({"error": "Image not found"}), 404

    word = data['word'].upper()
    crop_x = int(data['cropX'])
    crop_y = int(data['cropY'])
    crop_width = int(data['cropWidth'])
    crop_height = int(data['cropHeight'])

    try:
        # Step 1: Open and crop
        img = Image.open(temp_path)
        if img.mode not in ('RGB', 'RGBA'):
            img = img.convert('RGBA')

        cropped = img.crop((crop_x, crop_y, crop_x + crop_width, crop_y + crop_height))

        # Step 2: Remove background
        processed = remove(cropped)

        # Save preview
        preview_filename = f"{word.lower()}_preview.png"
        preview_path = PROCESSED_DIR / preview_filename
        processed.save(preview_path)

        # Convert to base64 for preview
        img_bytes = io.BytesIO()
        processed.save(img_bytes, format='PNG')
        img_bytes.seek(0)
        preview_base64 = base64.b64encode(img_bytes.getvalue()).decode('utf-8')

        return jsonify({
            "success": True,
            "preview": f"data:image/png;base64,{preview_base64}",
            "previewPath": f"processed/{preview_filename}",
            "word": word
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/confirm-number-card', methods=['POST'])
def confirm_number_card():
    """Confirm and upload number card to Cloudflare."""
    data = request.json

    if 'word' not in data:
        return jsonify({"error": "Missing word"}), 400

    word = data['word'].upper()
    preview_path = PROCESSED_DIR / f"{word.lower()}_preview.png"

    if not preview_path.exists():
        return jsonify({"error": "Preview not found. Process the card first."}), 404

    try:
        # Read the processed image
        with open(preview_path, 'rb') as f:
            img_bytes = f.read()

        # Upload to Cloudflare
        card_id = generate_card_id(word, "number")
        filename = f"{card_id}.png"
        image_url = upload_to_cloudflare(img_bytes, filename)

        # Update JSON
        cards_data = load_cards()
        new_card = {
            "id": card_id,
            "word": word,
            "imageUrl": image_url,
            "type": "number"
        }
        cards_data["cards"].append(new_card)
        save_cards(cards_data)

        # Clean up temp files
        preview_path.unlink(missing_ok=True)

        return jsonify({
            "success": True,
            "card": new_card,
            "totalCards": len(cards_data["cards"])
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/process-face-card', methods=['POST'])
def process_face_card():
    """Process a face card: upload directly to Cloudflare (no cropping/bg removal)."""
    if 'image' not in request.files:
        return jsonify({"error": "No image provided"}), 400

    if 'word' not in request.form:
        return jsonify({"error": "No word provided"}), 400

    file = request.files['image']
    word = request.form['word'].upper()

    if file.filename == '':
        return jsonify({"error": "No file selected"}), 400

    try:
        # Read image bytes
        img_bytes = file.read()

        # Upload to Cloudflare
        card_id = generate_card_id(word, "face")
        filename = f"{card_id}.png"
        image_url = upload_to_cloudflare(img_bytes, filename)

        # Update JSON
        cards_data = load_cards()
        new_card = {
            "id": card_id,
            "word": word,
            "imageUrl": image_url,
            "type": "face"
        }
        cards_data["cards"].append(new_card)
        save_cards(cards_data)

        return jsonify({
            "success": True,
            "card": new_card,
            "totalCards": len(cards_data["cards"])
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/delete-card/<card_id>', methods=['DELETE'])
def delete_card(card_id):
    """Delete a card from the JSON (doesn't delete from Cloudflare)."""
    cards_data = load_cards()

    original_count = len(cards_data["cards"])
    cards_data["cards"] = [c for c in cards_data["cards"] if c["id"] != card_id]

    if len(cards_data["cards"]) == original_count:
        return jsonify({"error": "Card not found"}), 404

    save_cards(cards_data)

    return jsonify({
        "success": True,
        "totalCards": len(cards_data["cards"])
    })


if __name__ == '__main__':
    print("Starting admin server...")
    print("Open http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
