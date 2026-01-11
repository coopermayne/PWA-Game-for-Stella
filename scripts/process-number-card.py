#!/usr/bin/env python3
"""
Process a number card (A-10): crop, remove background, upload to Cloudflare, update JSON.

Usage:
    python scripts/process-number-card.py <image_path> <word> <crop_x> <crop_y> <crop_width> <crop_height>

Example:
    python scripts/process-number-card.py uploads/dog.jpg DOG 100 50 250 350

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
from rembg import remove

# Constants
CARD_ASPECT_RATIO = 2.5 / 3.5  # width / height
DATA_FILE = Path(__file__).parent.parent / "data" / "cards.json"
PROCESSED_DIR = Path(__file__).parent.parent / "processed"


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


def crop_image(image_path, x, y, width, height):
    """Crop image to specified region."""
    img = Image.open(image_path)

    # Ensure we're working with RGB or RGBA
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGBA')

    # Crop to specified region
    cropped = img.crop((x, y, x + width, y + height))

    return cropped


def remove_background(image):
    """Remove background from PIL Image."""
    print("Removing background...")
    output = remove(image)
    return output


def upload_to_cloudflare(image, filename):
    """Upload image to Cloudflare Images."""
    account_id = os.environ.get("CLOUDFLARE_ACCOUNT_ID")
    api_token = os.environ.get("CLOUDFLARE_API_TOKEN")

    if not account_id or not api_token:
        raise ValueError("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set")

    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/images/v1"

    headers = {
        "Authorization": f"Bearer {api_token}"
    }

    # Save image to bytes
    import io
    img_bytes = io.BytesIO()
    image.save(img_bytes, format='PNG')
    img_bytes.seek(0)

    files = {
        "file": (filename, img_bytes, "image/png")
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
    """Generate a unique card ID."""
    short_uuid = str(uuid.uuid4())[:8]
    return f"{word.lower()}-{short_uuid}"


def main():
    if len(sys.argv) < 7:
        print("Usage: python process-number-card.py <image_path> <word> <crop_x> <crop_y> <crop_width> <crop_height>")
        print("Example: python process-number-card.py uploads/dog.jpg DOG 100 50 250 350")
        sys.exit(1)

    image_path = sys.argv[1]
    word = sys.argv[2].upper()
    crop_x = int(sys.argv[3])
    crop_y = int(sys.argv[4])
    crop_width = int(sys.argv[5])
    crop_height = int(sys.argv[6])

    if not os.path.exists(image_path):
        print(f"Error: Image not found: {image_path}")
        sys.exit(1)

    print(f"Processing number card for word: {word}")
    print(f"Crop region: x={crop_x}, y={crop_y}, w={crop_width}, h={crop_height}")

    # Step 1: Crop
    print("Step 1: Cropping image...")
    cropped = crop_image(image_path, crop_x, crop_y, crop_width, crop_height)

    # Step 2: Remove background
    print("Step 2: Removing background...")
    processed = remove_background(cropped)

    # Save processed image locally for preview
    PROCESSED_DIR.mkdir(exist_ok=True)
    preview_path = PROCESSED_DIR / f"{word.lower()}_preview.png"
    processed.save(preview_path)
    print(f"Preview saved to: {preview_path}")

    # Step 3: Ask for confirmation
    print("\n" + "="*50)
    print(f"Preview saved to: {preview_path}")
    print("Please check the preview image.")
    confirm = input("Upload to Cloudflare and save? (yes/no): ").strip().lower()

    if confirm != "yes":
        print("Cancelled.")
        sys.exit(0)

    # Step 4: Upload to Cloudflare
    print("\nStep 3: Uploading to Cloudflare...")
    card_id = generate_card_id(word)
    filename = f"{card_id}.png"
    image_url = upload_to_cloudflare(processed, filename)
    print(f"Uploaded! URL: {image_url}")

    # Step 5: Update JSON
    print("Step 4: Updating cards.json...")
    cards_data = load_cards()

    new_card = {
        "id": card_id,
        "word": word,
        "imageUrl": image_url,
        "type": "number"
    }

    cards_data["cards"].append(new_card)
    save_cards(cards_data)

    print(f"\nSuccess! Card '{word}' added with ID: {card_id}")
    print(f"Total cards: {len(cards_data['cards'])}")


if __name__ == "__main__":
    main()
