"""
Update Website & Episodes DB for CID (Zero YouTube Data API Quota Consumed)
Detects new CID episode uploads using scrapetube and updates episodes.csv & state.json.
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

def is_single_episode(title: str, description: str, channel: str, ep_num: int) -> bool:
    channel_lower = channel.lower()
    if not any(vc in channel_lower for vc in VALID_CHANNELS):
        return False

    title_lower = title.lower()
    desc_lower = description.lower()
    combined_text = title_lower + " " + desc_lower

    if not any(k in combined_text for k in ['cid', 'c.i.d', 'सीआईडी', 'सी.आई.डी']):
        return False

    if is_promo(title):
        return False

    if any(k in combined_text for k in ['compilation', 'best of', 'full movie', 'mega episode']):
        return False

    ep_patterns = [
        rf'(?:full\s+)?(?:ep|episode|ep\.|episodes|ep\s*#|एपिसोड)\s*[-:]?\s*0*{ep_num}\b',
        rf'season\s*1\s*[-|–]?\s*episode\s*0*{ep_num}\b',
        rf'[-:]?\s*0*{ep_num}\s*[-|]\s*(?:cid|c\.i\.d|सीआईडी)\b',
    ]

    for pat in ep_patterns:
        if re.search(pat, combined_text):
            return True

    num_match = re.search(rf'\b0*{ep_num}\b', title_lower)
    if num_match and any(k in title_lower for k in ['cid', 'c.i.d', 'सीआईडी']):
        return True

    return False

def extract_description_text(vid_dict: dict) -> str:
    snippets = vid_dict.get('detailedMetadataSnippets', [])
    desc_text = ""
    for s in snippets:
        runs = s.get('snippetText', {}).get('runs', [])
        for r in runs:
            desc_text += " " + r.get('text', '')
    return desc_text.strip()

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

                if vid_id and is_single_episode(title, description, channel, ep_num):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                    date_str = parse_relative_date(time_text)
                    duration_str = vid.get('lengthText', {}).get('simpleText', '42:00')
                    mins = get_minutes(duration_str)

                    if 15 <= mins <= 65 and mins > best_duration:
                        best_duration = mins
                        best_match = (vid_id, title, url, date_str, duration_str)
        except Exception:
            continue

        if best_duration >= 20:
            break

    return best_match

def reverse_global_scan(rows):
    print("Running Reverse Global Scan for recent CID uploads...")
    upgraded_count = 0
    try:
        videos = scrapetube.get_search("CID Full Episode", sort_by="upload_date", limit=300)
        ep_map = {int(r[0]): (i, r) for i, r in enumerate(rows) if len(r) >= 6 and r[0].isdigit()}

        for vid in videos:
            channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '').lower()
            if not any(vc in channel for vc in VALID_CHANNELS):
                continue

            title_runs = vid.get('title', {}).get('runs', [])
            title = "".join([r.get('text', '') for r in title_runs]).strip()
            description = extract_description_text(vid)

            pattern = r"(?i)(?:ep|episode)\s*[-:]?\s*(\d+)"
            match = re.search(pattern, title)
            if not match:
                match = re.search(pattern, description)

            if match:
                ep_num = int(match.group(1))
                if ep_num in ep_map:
                    row_idx, row = ep_map[ep_num]
                    vid_id = vid.get('videoId', '')
                    if not vid_id:
                        continue

                    old_vid_id = row[2].split('v=')[-1]
                    if vid_id == old_vid_id:
                        continue

                    duration_str = vid.get('lengthText', {}).get('simpleText', '0:00')
                    new_mins = get_minutes(duration_str)

                    if new_mins < 10 or new_mins > 65:
                        continue

                    old_mins = get_minutes(row[5])
                    if new_mins > old_mins + 2:
                        url = f"https://www.youtube.com/watch?v={vid_id}"
                        time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                        date_str = parse_relative_date(time_text)

                        print(f"  [REVERSE UPGRADE] Ep {ep_num}: {title} ({duration_str})")
                        rows[row_idx] = [ep_num, title, url, "Found", date_str if date_str else row[4], duration_str]
                        upgraded_count += 1
                        ep_map[ep_num] = (row_idx, rows[row_idx])

    except Exception as e:
        print(f"Reverse global scan error: {e}")

    return upgraded_count

def main():
    print("=======================================================")
    print("   CID Website & DB Auto-Updater (Zero Quota Mode)     ")
    print("=======================================================")

    if not os.path.exists(STATE_FILE):
        print(f"Error: {STATE_FILE} not found!")
        sys.exit(1)

    with open(STATE_FILE, "r", encoding="utf-8") as f:
        state = json.load(f)

    last_ep = state.get("last_episode", 0)
    print(f"Checking for new CID episodes after Ep {last_ep}...")

    rows = []
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            rows = list(reader)

    upgraded_count = reverse_global_scan(rows)

    header = rows[0] if rows and rows[0][0] == "Episode" else ["Episode", "Title", "URL", "Status", "Date", "Duration"]
    ep_rows = [r for r in rows if r[0] != "Episode" and r[0].isdigit()]

    next_ep = last_ep + 1
    consecutive_failures = 0
    added_count = 0

    while consecutive_failures < 5:
        print(f"Searching for new CID Ep {next_ep}...")
        res = find_episode(next_ep)
        if res:
            vid_id, title, url, date_str, duration_str = res
            print(f"  [ADDED] Ep {next_ep}: {title} ({duration_str})")
            ep_rows.append([next_ep, title, url, "Found", date_str if date_str else "Official", duration_str])
            next_ep += 1
            consecutive_failures = 0
            added_count += 1
        else:
            print(f"  [NOT FOUND] Ep {next_ep}")
            consecutive_failures += 1
            next_ep += 1

    ep_rows.sort(key=lambda r: int(r[0]))
    all_rows = [header] + ep_rows

    with open(CSV_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(all_rows)

    highest_ep = int(ep_rows[-1][0]) if ep_rows else last_ep
    state["last_episode"] = highest_ep
    state["last_updated"] = datetime.datetime.now().strftime("%Y-%m-%d")
    state["total_found"] = len(ep_rows)

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print(f"Update complete! Added {added_count} new episodes, upgraded {upgraded_count} episodes.")

if __name__ == "__main__":
    main()
