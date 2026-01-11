#!/usr/bin/env python3
"""
Process a face card (J, Q, K): upload directly to Cloudflare, update JSON.
No cropping or background removal - these are custom-made cards.

Usage:
    python scripts/process-face-card.py <image_path> <word>

Example:
    python scripts/process-face-card.py uploads/queen-stella.png STELLA

Environment variables required:
    CLOUDFLARE_ACCOUNT_ID
    CLOUDFLARE_API_TOKEN
"""

import sys
import os
import json
import uuid
import requests
from pathlib import Path
from PIL import Image

# Constants
DATA_FILE = Path(__file__).parent.parent / "data" / "cards.json"


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


def upload_to_cloudflare(image_path, filename):
    """Upload image to Cloudflare Images."""
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN")

    if not account_id or not api_token:
        raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1"

    headers = {
        "Authorization": f"Bearer {api_token}"
    }

    with open(image_path, "rb") as f:
        files = {
            "file": (filename, f, "image/png")
        }

        print(f"Uploading to Cloudflare Images...")
        response = requests.post(url, headers=headers, files=files)

    if response.status_code != 200:
        raise Exception(f"Cloudflare upload failed: {response.text}")

    result = response.json()
    if not result.get("success"):
        raise Exception(f"Cloudflare upload failed: {result.get('errors')}")

    # Return the delivery URL
    image_id = result["result"]["id"]
    variants = result["result"]["variants"]

    # Use the public variant URL
    return variants[0] if variants else f"https://imagedelivery.net/{account_id}/{image_id}/public"


def generate_card_id(word):
    """Generate a unique card ID for face cards."""
    short_uuid = str(uuid.uuid4())[:8]
    return f"face-{word.lower()}-{short_uuid}"


def main():
    if len(sys.argv) < 3:
        print("Usage: python process-face-card.py <image_path> <word>")
        print("Example: python process-face-card.py uploads/queen-stella.png STELLA")
        sys.exit(1)

    image_path = sys.argv[1]
    word = sys.argv[2].upper()

    if not os.path.exists(image_path):
        print(f"Error: Image not found: {image_path}")
        sys.exit(1)

    print(f"Processing face card for word: {word}")

    # Show image info
    img = Image.open(image_path)
    print(f"Image size: {img.size[0]}x{img.size[1]}")

    # Ask for confirmation
    print("\n" + "="*50)
    print(f"Image: {image_path}")
    print(f"Word: {word}")
    print("This will upload the image AS-IS (no cropping or background removal)")
    confirm = input("Upload to Cloudflare and save? (yes/no): ").strip().lower()

    if confirm != "yes":
        print("Cancelled.")
        sys.exit(0)

    # Upload to Cloudflare
    print("\nUploading to Cloudflare...")
    card_id = generate_card_id(word)
    filename = f"{card_id}.png"
    image_url = upload_to_cloudflare(image_path, filename)
    print(f"Uploaded! URL: {image_url}")

    # Update JSON
    print("Updating cards.json...")
    cards_data = load_cards()

    new_card = {
        "id": card_id,
        "word": word,
        "imageUrl": image_url,
        "type": "face"
    }

    cards_data["cards"].append(new_card)
    save_cards(cards_data)

    print(f"\nSuccess! Face card '{word}' added with ID: {card_id}")
    print(f"Total cards: {len(cards_data['cards'])}")


if __name__ == "__main__":
    main()
