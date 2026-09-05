<div align="center">
  <h1>Daily Dose of CID </h1>
  <a href="https://CodeMasterAbhishek.github.io/Daily-Dose-of-CID/" target="_blank" rel="noopener noreferrer">
    <img src="assets/CID-Banner.png" alt="Daily Dose of CID Banner" width="800" style="border-radius: 12px;" />
  </a>
  <!-- <h1>Daily Dose of CID </h1> -->
  <p>A fast, serverless web application that aggregates all episodes of Crime Information Department (CID), powered entirely by GitHub Pages and Actions.</p>

  <a href="https://github.com/CodeMasterAbhishek/Daily-Dose-of-CID/actions/workflows/daily_sync.yml" target="_blank" rel="noopener noreferrer">
    <img src="https://github.com/CodeMasterAbhishek/Daily-Dose-of-CID/actions/workflows/daily_sync.yml/badge.svg" alt="Daily Sync Status">
  </a>
  <a href="https://CodeMasterAbhishek.github.io/Daily-Dose-of-CID/" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/Platform-GitHub%20Pages-success.svg" alt="GitHub Pages">
  </a>
  <a href="https://opensource.org/licenses/MIT" target="_blank" rel="noopener noreferrer">
    <img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT">
  </a>

  <h3><a href="https://CodeMasterAbhishek.github.io/Daily-Dose-of-CID/" target="_blank" rel="noopener noreferrer">View Live Website</a></h3>
</div>

---

## What is this?

**Daily Dose of CID** is a serverless web application built to organize and stream all 1,651 episodes of India's longest-running crime detective series *CID*. 

With thousands of episodes spanning over two decades, official YouTube playlists often become fragmented, incomplete, or difficult to navigate for specific crime cases and arcs. Relying on traditional backend servers and databases to track this massive catalog would incur constant hosting costs. 

This project solves these issues by acting as a highly optimized, specialized streaming frontend. It utilizes a **100% free, serverless architecture** where GitHub serves as both the automation backend (via Actions) and the database/CDN (via Pages and static files). A custom Python scraper natively fetches new episodes daily, updates a flat-file database, and triggers live deployments instantly.

---

## Catalog Availability

- **Season 1 (1998 – 2018):** 1,524 / 1,547 Episodes Found on YouTube (98.5%)
- **Season 2 (2024 – 2025):** 102 / 104 Episodes Found on YouTube (98.1%)
- **Grand Total:** 1,626 / 1,651 Episodes Available for Instant Streaming

---

## Built With

*   **Frontend:**
    *   <a href="https://developer.mozilla.org/en-US/docs/Web/HTML" target="_blank" rel="noopener noreferrer">HTML5</a> for semantic structure.
    *   <a href="https://developer.mozilla.org/en-US/docs/Web/CSS" target="_blank" rel="noopener noreferrer">Vanilla CSS</a> for styling (sleek detective dark theme).
    *   <a href="https://developer.mozilla.org/en-US/docs/Web/JavaScript" target="_blank" rel="noopener noreferrer">Vanilla JavaScript</a> for DOM manipulation and logic.
    *   <a href="https://developers.google.com/youtube/iframe_api_reference" target="_blank" rel="noopener noreferrer">YouTube IFrame Player API</a> for building the custom video player interface.
*   **Backend & Automation:**
    *   <a href="https://www.python.org/doc/" target="_blank" rel="noopener noreferrer">Python</a> as the core scripting language.
    *   <a href="https://github.com/dermasmid/scrapetube" target="_blank" rel="noopener noreferrer">scrapetube</a> for scraping YouTube channel data natively (bypassing strict YouTube Data API quotas).
    *   <a href="https://requests.readthedocs.io/en/latest/" target="_blank" rel="noopener noreferrer">Requests</a> for handling automated HTTP calls.
*   **Infrastructure & APIs:**
    *   <a href="https://docs.github.com/en/actions" target="_blank" rel="noopener noreferrer">GitHub Actions</a> for the scheduled cron job orchestrator.
    *   <a href="https://pages.github.com/" target="_blank" rel="noopener noreferrer">GitHub Pages</a> for free, globally distributed static hosting.
    *   <a href="https://www.ipify.org/" target="_blank" rel="noopener noreferrer">ipify API</a> for geo-caching and network verification.

---

## Core Features

- **Custom Video Player:** Embedded YouTube player with autoplay, Next/Previous episode navigation, and watch history tracking.
- **Curated Case "Storylines":** Organized multi-episode arcs for iconic cases (*The Poison Case*, *Mouse Trap*, *Kaanch Ke Paar*, etc.).
- **CID Agent Dashboard & Leaderboard:** Track watched episodes, total investigation hours, and rank up from *Junior Investigator* to *ACP Pradyuman Rank*.
- **$0 Running Costs:** Hosted and automated 100% free on GitHub.

---

## Setup & Deployment

### 1. Clone the Repository
```bash
git clone https://github.com/CodeMasterAbhishek/Daily-Dose-of-CID.git
cd Daily-Dose-of-CID
```

### 2. Run Initial Scraper Locally
```bash
pip install -r requirements.txt
python scripts/scrape_initial_cid.py 1 500
```

### 3. Run Automated Sync
```bash
python scripts/update_website.py
```
