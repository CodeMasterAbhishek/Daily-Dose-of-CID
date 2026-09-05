/**
 * API module for fetching CID dataset and transforming into DailyDose article objects.
 */

function extractVideoId(url) {
    if (!url) return '';
    const match = url.match(/(?:v=|\/embed\/|\/shorts\/|youtu\.be\/|^)([a-zA-Z0-9_-]{11})(?:[&?]|$)/);
    return match ? match[1] : '';
}

function getCategoryForEp(epNum) {
    if (epNum <= 500) return 'Classic';
    if (epNum <= 1000) return 'Golden';
    if (epNum <= 1500) return 'Modern';
    return 'Recent';
}

function getAirDateForEp(epNum) {
    const startDate = new Date(1998, 0, 21);
    const daysOffset = Math.floor(epNum * 4.8);
    const epDate = new Date(startDate.getTime() + daysOffset * 86400000);
    return epDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function extractRealEpNumber(title, csvEpNum) {
    if (!title) return csvEpNum;
    const match = title.match(/(?:full\s+)?(?:ep|episode|ep\.|एपिसोड)\s*#?\s*(\d{1,4})/i);
    if (match) {
        const parsed = parseInt(match[1], 10);
        if (parsed > 0 && parsed <= 4999) {
            return parsed;
        }
    }
    return csvEpNum;
}

function extractRealDate(title, epNum) {
    if (!title) return getAirDateForEp(epNum);
    const dateMatch = title.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9}),?\s+(20\d{2})\b/);
    if (dateMatch) {
        const day = dateMatch[1].padStart(2, '0');
        const month = dateMatch[2].substring(0, 3);
        const year = dateMatch[3];
        return `${day} ${month} ${year}`;
    }
    return getAirDateForEp(epNum);
}

export async function fetchNewsData() {
    try {
        const cacheBuster = Math.floor(Date.now() / 3600000);
        const response = await fetch(`data/episodes.csv?t=${cacheBuster}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const text = await response.text();
        const lines = text.split('\n');

        const articles = [];
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const parts = [];
            let current = '';
            let inQuotes = false;
            for (let j = 0; j < line.length; j++) {
                const char = line[j];
                if (char === '"') {
                    inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                    parts.push(current);
                    current = '';
                } else {
                    current += char;
                }
            }
            parts.push(current);
            
            const epNum = parseInt(parts[0] || '0');
            const title = (parts[1] || '').trim();
            const url = (parts[2] || '').trim();
            const status = (parts[3] || 'Found').trim();
            const csvDate = (parts[4] || '').trim();
            const csvDuration = (parts[5] || '').trim();

            if (epNum > 0) {
                const realEpNum = extractRealEpNumber(title, epNum);
                const videoId = extractVideoId(url);
                const category = getCategoryForEp(realEpNum);
                const airDate = csvDate ? csvDate : extractRealDate(title, realEpNum);
                const image = videoId 
                    ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
                    : 'https://via.placeholder.com/480x270/18181b/818cf8?text=CID+Episode';

                const durationText = csvDuration ? csvDuration : '42:00';
                const parsedDate = new Date(airDate);
                const pubDateStr = isNaN(parsedDate) ? new Date().toISOString() : parsedDate.toISOString();

                articles.push({
                    id: `ep_${realEpNum}`,
                    epNumber: realEpNum,
                    title: title || `Episode ${realEpNum} - CID`,
                    description: `Watch full single episode ${realEpNum} of CID crime cases.`,
                    category: category,
                    source: 'SET INDIA',
                    url: url,
                    videoId: videoId,
                    image: image,
                    airDate: airDate,
                    durationText: durationText,
                    publishedAt: pubDateStr
                });
            }
        }

        return articles.sort((a, b) => b.epNumber - a.epNumber);

    } catch (error) {
        console.error("Could not fetch CID dataset:", error);
        return [];
    }
}

export async function fetchStorylines() {
    try {
        const cacheBuster = Math.floor(Date.now() / 3600000);
        const response = await fetch(`data/storylines.json?t=${cacheBuster}`);
        if (!response.ok) return [];
        const data = await response.json();
        return data.sort((a, b) => b.startEp - a.startEp);
    } catch (e) {
        console.error("Could not fetch CID storylines dataset:", e);
        return [];
    }
}
