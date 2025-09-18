// ==UserScript==
// @name         Einthusan Cineby Redirect Button
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Adds a Cineby button to Einthusan movie pages using TMDB scraping
// @author       You
// @match        https://einthusan.tv/movie/watch/*
// @grant        GM_xmlhttpRequest
// ==/UserScript==

function cinebyDebug(msg) {
  // Simple debug log
  console.log('[Cineby]', msg);
}

// Scrape movie name and year from Einthusan page
function getMovieInfo() {
  const block = document.querySelector('.block2');
  if (!block) return null;
  const title = block.querySelector('a.title h3')?.textContent?.trim();
  const yearText = block.querySelector('.info p')?.textContent?.trim();
  const yearMatch = yearText?.match(/\d{4}/);
  const year = yearMatch ? yearMatch[0] : '';
  return title && year ? { title, year } : null;
}

// Scrape TMDB search results page for movie ID
async function findTmdbId(title, year) {
  const query = encodeURIComponent(`${title} y:${year}`);
  const url = `https://r.jina.ai/https://www.themoviedb.org/search?query=${query}`;
  try {
    const res = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
    if (!res.ok) return null;
    const html = await res.text();
    cinebyDebug(html.slice(0, 1000)); // Log first 1000 chars for inspection

    // Try HTML regex first
    const re = /<a href="\/movie\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>[\s\S]{0,300}?<span[^>]*class="release_date"[^>]*>(\d{4})<\/span>/g;
    let match;
    let candidates = [];
    while ((match = re.exec(html))) {
      const [_, tmdbId, nameHtml, releaseYear] = match;
      const name = nameHtml.replace(/<[^>]+>/g, '').trim();
      candidates.push({ tmdbId, name, releaseYear });
      if (
        name.toLowerCase().replace(/\s+/g, '') === title.toLowerCase().replace(/\s+/g, '') &&
        releaseYear === year
      ) {
        cinebyDebug(`TMDB match: ${name} (${releaseYear}) → ${tmdbId}`);
        return tmdbId;
      }
    }
    cinebyDebug('TMDB candidates: ' + JSON.stringify(candidates));
    const fallback = candidates.find(c => c.releaseYear === year);
    if (fallback) {
      cinebyDebug(`TMDB fallback match: ${fallback.name} (${fallback.releaseYear}) → ${fallback.tmdbId}`);
      return fallback.tmdbId;
    }

    // If no HTML candidates, try Markdown block (first movie only)
    const mdMatches = [...html.matchAll(/\[!\[Image.*?\]\(.*?\)\]\(https:\/\/www\.themoviedb\.org\/movie\/(\d+)\)/g)];
    if (mdMatches.length > 0) {
      cinebyDebug(`TMDB Markdown match → ${mdMatches[0][1]}`);
      return mdMatches[0][1];
    }
  } catch (e) {
    cinebyDebug('TMDB search failed: ' + e.message);
  }
  return null;
}

// Insert Cineby button
function insertCinebyButton(cinebyUrl, movieTitle) {
  const tabTipsDiv = document.querySelector('.tabview .tips > div:first-child');
  if (!tabTipsDiv) return;
  if (document.getElementById('cineby-btn')) return;

  // Add animation style
  const style = document.createElement('style');
  style.textContent = `
    @keyframes cineby-flash {
      0%, 100% { background: #1f2937; }
      50% { background: #2563eb; }
    }
    #cineby-btn {
      animation: cineby-flash 1s infinite;
    }
    #cineby-btn img {
      margin-right: 16px;
    }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('a');
  btn.id = 'cineby-btn';
  btn.href = cinebyUrl;
  btn.target = '_blank';
  btn.style.cssText = `
    display:inline-flex;align-items:flex-end;gap:10px;margin:10px 0 0 0;padding:8px 20px;background:#1f2937;
    color:#fff;border-radius:5px;text-decoration:none;font-weight:bold;
    font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);transition:background 0.3s;
  `;

  // Add logo with more space, bottom aligned
  const logo = document.createElement('img');
  logo.src = 'https://raw.githubusercontent.com/atishramkhe/atishramkhe.github.io/main/assets/logo_noborder.png';
  logo.alt = 'Cineby';
  logo.style.cssText = 'height:28px;margin-right:24px;object-fit:contain;';

  btn.appendChild(logo);
  btn.appendChild(document.createTextNode(`Watch "${movieTitle}" in Better Quality Here`));

  tabTipsDiv.appendChild(btn);
}

// Update call to pass movie title
(async function () {
  const info = getMovieInfo();
  if (!info) return cinebyDebug('Movie info not found');
  cinebyDebug(`Found movie: ${info.title} (${info.year})`);
  const tmdbId = await findTmdbId(info.title, info.year);
  if (!tmdbId) return cinebyDebug('TMDB ID not found');
  const cinebyUrl = `https://www.cineby.app/movie/${tmdbId}`;
  insertCinebyButton(cinebyUrl, info.title);
})();