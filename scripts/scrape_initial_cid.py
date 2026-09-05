"""
Initial Scraper for CID Episodes (Zero YouTube Data API Quota Consumed)
Scrapes official CID full episodes using scrapetube and populates data/episodes.csv & data/state.json.
"""

import csv
import json
import os
import re
import sys
import datetime

try:
    import scrapetube
except ImportError:
    print("Error: 'scrapetube' module is required. Install it using: pip install -r requirements.txt")
    sys.exit(1)

if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

STATE_FILE = "data/state.json"
CSV_FILE = "data/episodes.csv"

VALID_CHANNELS = [
    'set india',
    'sony pal',
    'sony liv',
    'liv crime',
    'sony wah',
    'sony entertainment television',
    'c.i.d.',
    'cid'
]

def get_minutes(duration_str: str) -> int:
    if not duration_str:
        return 0
    parts = duration_str.split(':')
    if len(parts) == 3:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 2:
        return int(parts[0])
    return 0

def is_promo(title: str) -> bool:
    title_lower = title.lower()
    return any(k in title_lower for k in ['teaser', 'promo', 'precap', 'coming up next', 'behind the scene', 'bts', 'short'])

def parse_relative_date(time_text: str) -> str:
    if not time_text:
        return ""
    text = time_text.lower()
    now = datetime.datetime.now()
    match = re.search(r'(\d+)\s+(minute|hour|day|week|month|year)s?\s+ago', text)
    if not match:
        return ""
    val = int(match.group(1))
    unit = match.group(2)
    if unit == 'minute':
        delta = datetime.timedelta(minutes=val)
    elif unit == 'hour':
        delta = datetime.timedelta(hours=val)
    elif unit == 'day':
        delta = datetime.timedelta(days=val)
    elif unit == 'week':
        delta = datetime.timedelta(weeks=val)
    elif unit == 'month':
        delta = datetime.timedelta(days=val * 30)
    elif unit == 'year':
        delta = datetime.timedelta(days=val * 365)
    else:
        delta = datetime.timedelta(0)
    return (now - delta).strftime("%d %b %Y")

def extract_description_text(vid_dict: dict) -> str:
    snippets = vid_dict.get('detailedMetadataSnippets', [])
    desc_text = ""
    for s in snippets:
        runs = s.get('snippetText', {}).get('runs', [])
        for r in runs:
            desc_text += " " + r.get('text', '')
    return desc_text.strip()

def matches_cid_episode(title: str, description: str, channel: str, ep_num: int) -> bool:
    channel_lower = channel.lower()
    if not any(vc in channel_lower for vc in VALID_CHANNELS):
        return False

    combined = (title + " " + description).lower()
    
    if not any(k in combined for k in ['cid', 'c.i.d', 'सीआईडी', 'सी.आई.डी']):
        return False

    if is_promo(title):
        return False

    ep_patterns = [
        rf'(?:full\s+)?(?:ep|episode|ep\.|episodes|ep\s*#|एपिसोड)\s*[-:]?\s*0*{ep_num}\b',
        rf'season\s*1\s*[-|–]?\s*episode\s*0*{ep_num}\b',
        rf'\b0*{ep_num}\s*[-|–]\s*(?:full\s+episode|cid|c\.i\.d|सीआईडी)\b',
    ]

    for pat in ep_patterns:
        if re.search(pat, combined):
            return True

    match = re.search(rf'\b0*{ep_num}\b', title.lower())
    if match and any(k in title.lower() for k in ['cid', 'c.i.d', 'सीआईडी']):
        return True

    return False

def find_episode(ep_num: int):
    search_queries = [
        f"CID Episode {ep_num} Full Episode",
        f"CID Ep {ep_num} SET India",
        f"CID Season 1 Episode {ep_num}",
    ]

    best_match = None
    best_duration = -1

    for query in search_queries:
        try:
            videos = scrapetube.get_search(query, limit=6)
            for vid in videos:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and matches_cid_episode(title, description, channel, ep_num):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                    date_str = parse_relative_date(time_text)
                    duration_str = vid.get('lengthText', {}).get('simpleText', '42:00')
                    mins = get_minutes(duration_str)

                    if 15 <= mins <= 65 and mins > best_duration:
                        best_duration = mins
                        best_match = [ep_num, title, url, "Found", date_str if date_str else "Official", duration_str]
        except Exception as e:
            continue

        if best_duration >= 20:
            break

    return best_match

def main(max_episodes=1500, start_ep=1):
    print("=======================================================")
    print("      CID Initial Episode Scraper (Zero Quota)         ")
    print("=======================================================")

    os.makedirs("data", exist_ok=True)
    existing_eps = {}

    if os.path.exists(CSV_FILE):
        with open(CSV_FILE, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader, None)
            for r in reader:
                if len(r) >= 4 and r[0].isdigit():
                    try:
                        ep = int(r[0])
                        existing_eps[ep] = r
                    except ValueError:
                        pass

    print(f"Already have {len(existing_eps)} episodes recorded.")
    scraped_count = 0

    for ep_num in range(start_ep, max_episodes + 1):
        if ep_num in existing_eps:
            continue

        print(f"Scraping Episode {ep_num}...", end="", flush=True)
        res = find_episode(ep_num)
        if res:
            existing_eps[ep_num] = res
            scraped_count += 1
            print(f" [FOUND] {res[1][:40]}... ({res[5]})")
        else:
            print(" [NOT FOUND]")

        if scraped_count % 10 == 0 and scraped_count > 0:
            save_data(existing_eps)

    save_data(existing_eps)
    print("Scraping completed!")

def save_data(ep_dict):
    sorted_eps = sorted(ep_dict.keys())
    rows = [["Episode", "Title", "URL", "Status", "Date", "Duration"]]
    for ep in sorted_eps:
        rows.append(ep_dict[ep])

    with open(CSV_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    state = {
        "last_episode": sorted_eps[-1] if sorted_eps else 0,
        "last_updated": datetime.datetime.now().strftime("%Y-%m-%d"),
        "total_found": len(sorted_eps)
    }

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

if __name__ == "__main__":
    start = 1
    max_ep = 500
    if len(sys.argv) > 1:
        start = int(sys.argv[1])
    if len(sys.argv) > 2:
        max_ep = int(sys.argv[2])
    main(max_episodes=max_ep, start_ep=start)
