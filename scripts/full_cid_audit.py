"""
Full CID Catalog Audit & Scraper
Scans all 1,547 Season 1 episodes and 104 Season 2 episodes (1,651 Total)
using multi-threaded scrapetube queries to determine exact availability on YouTube.
"""

import csv
import json
import os
import re
import sys
import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

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

def matches_cid_episode(title: str, description: str, channel: str, ep_num: int, season: int = 1) -> bool:
    channel_lower = channel.lower()
    if not any(vc in channel_lower for vc in VALID_CHANNELS):
        return False

    combined = (title + " " + description).lower()
    if not any(k in combined for k in ['cid', 'c.i.d', 'सीआईडी', 'सी.आई.डी']):
        return False

    if is_promo(title):
        return False

    if season == 2:
        if 'season 2' not in combined and 's2' not in combined:
            return False

    ep_patterns = [
        rf'(?:full\s+)?(?:ep|episode|ep\.|episodes|ep\s*#|एपिसोड)\s*[-:]?\s*0*{ep_num}\b',
        rf'season\s*{season}\s*[-|–]?\s*episode\s*0*{ep_num}\b',
        rf'\b0*{ep_num}\s*[-|–]\s*(?:full\s+episode|cid|c\.i\.d|सीआईडी)\b',
    ]

    for pat in ep_patterns:
        if re.search(pat, combined):
            return True

    match = re.search(rf'\b0*{ep_num}\b', title.lower())
    if match and any(k in title.lower() for k in ['cid', 'c.i.d', 'सीआईडी']):
        return True

    return False

def find_single_episode(ep_num: int, season: int = 1):
    if season == 2:
        queries = [
            f"CID Season 2 Episode {ep_num} Full Episode",
            f"CID Season 2 Ep {ep_num} SET India",
        ]
    else:
        queries = [
            f"CID Episode {ep_num} Full Episode",
            f"CID Ep {ep_num} SET India",
            f"CID Season 1 Episode {ep_num}",
        ]

    best_match = None
    best_duration = -1

    for query in queries:
        try:
            videos = scrapetube.get_search(query, limit=5)
            for vid in videos:
                title_runs = vid.get('title', {}).get('runs', [])
                title = "".join([r.get('text', '') for r in title_runs]).strip()
                vid_id = vid.get('videoId', '')
                channel = vid.get('ownerText', {}).get('runs', [{}])[0].get('text', '')
                description = extract_description_text(vid)

                if vid_id and matches_cid_episode(title, description, channel, ep_num, season):
                    url = f"https://www.youtube.com/watch?v={vid_id}"
                    time_text = vid.get('publishedTimeText', {}).get('simpleText', '')
                    date_str = parse_relative_date(time_text)
                    duration_str = vid.get('lengthText', {}).get('simpleText', '42:00')
                    mins = get_minutes(duration_str)

                    # Store episode entry (for Season 2, offset key or track separately)
                    ep_key = ep_num if season == 1 else 2000 + ep_num

                    if 15 <= mins <= 65 and mins > best_duration:
                        best_duration = mins
                        best_match = [ep_key, title, url, "Found", date_str if date_str else "Official", duration_str]
        except Exception:
            continue

        if best_duration >= 20:
            break

    return (ep_num, season, best_match)

def run_audit(max_s1=1547, max_s2=104, num_threads=12):
    print("=======================================================")
    print(f"   FULL CID EPISODE CATALOG AUDIT (S1: {max_s1} | S2: {max_s2})")
    print("=======================================================")

    tasks = []
    # Season 1 tasks
    for ep in range(1, max_s1 + 1):
        tasks.append((ep, 1))

    # Season 2 tasks
    for ep in range(1, max_s2 + 1):
        tasks.append((ep, 2))

    total_tasks = len(tasks)
    print(f"Total episodes to audit across Season 1 and Season 2: {total_tasks}")

    results_s1 = {}
    results_s2 = {}

    completed_count = 0

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        future_map = {executor.submit(find_single_episode, ep_num, season): (ep_num, season) for ep_num, season in tasks}
        
        for future in as_completed(future_map):
            ep_num, season = future_map[future]
            completed_count += 1
            try:
                ep_val, s_val, res = future.result()
                if res:
                    if s_val == 1:
                        results_s1[ep_val] = res
                    else:
                        results_s2[ep_val] = res
            except Exception as e:
                pass

            if completed_count % 50 == 0 or completed_count == total_tasks:
                pct = (completed_count / total_tasks) * 100
                print(f"Progress: {completed_count}/{total_tasks} ({pct:.1f}%) | S1 Found: {len(results_s1)}/{max_s1} | S2 Found: {len(results_s2)}/{max_s2}")

    print("\n================ FINAL AUDIT RESULTS ================")
    print(f"Season 1 Total Produced: {max_s1} episodes | Found on YouTube: {len(results_s1)} ({len(results_s1)/max_s1*100:.1f}%)")
    print(f"Season 2 Total Produced: {max_s2} episodes | Found on YouTube: {len(results_s2)} ({len(results_s2)/max_s2*100:.1f}%)")
    print(f"GRAND TOTAL PRODUCED   : {max_s1 + max_s2} episodes | GRAND TOTAL FOUND : {len(results_s1) + len(results_s2)} ({(len(results_s1) + len(results_s2))/(max_s1 + max_s2)*100:.1f}%)")
    print("=====================================================\n")

    # Save findings into episodes.csv & state.json
    all_found = list(results_s1.values()) + list(results_s2.values())
    all_found.sort(key=lambda r: int(r[0]))

    rows = [["Episode", "Title", "URL", "Status", "Date", "Duration"]] + all_found

    with open(CSV_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerows(rows)

    state = {
        "season_1_total": max_s1,
        "season_1_found": len(results_s1),
        "season_2_total": max_s2,
        "season_2_found": len(results_s2),
        "grand_total_produced": max_s1 + max_s2,
        "grand_total_found": len(results_s1) + len(results_s2),
        "last_updated": datetime.datetime.now().strftime("%Y-%m-%d")
    }

    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)

    print("Successfully updated data/episodes.csv and data/state.json with full audit results!")

if __name__ == "__main__":
    max_s1 = 1547
    max_s2 = 104
    if len(sys.argv) > 1:
        max_s1 = int(sys.argv[1])
    if len(sys.argv) > 2:
        max_s2 = int(sys.argv[2])
    run_audit(max_s1=max_s1, max_s2=max_s2, num_threads=12)
