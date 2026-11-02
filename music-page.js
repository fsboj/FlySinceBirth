const musicSupabase = window.supabaseClient || window.supabase.createClient("https://ccvhvxugoebdqwxxankl.supabase.co", "sb_publishable_vXhQFYGVd6hOHsX4i-ePnw_y687N16Z");
const musicById = new Map();
let playQueue = [];
let playIndex = -1;
const musicParams = new URLSearchParams(location.search);
const musicEsc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function setPlayerStatus(text) { document.getElementById("playerStatus").textContent = text; }
function startSong(song, queue = [song]) {
  if (!song?.audio_url) { setPlayerStatus("This song does not have a playable audio file yet."); return; }
  playQueue = queue.filter((item) => item?.audio_url);
  playIndex = Math.max(0, playQueue.findIndex((item) => String(item.id) === String(song.id)));
  const selected = playQueue[playIndex] || song;
  const audio = document.getElementById("audioPlayer");
  document.getElementById("miniPlayer").hidden = false;
  document.body.classList.add("mini-player-open");
  document.getElementById("nowTitle").textContent = selected.title || "Untitled";
  document.getElementById("nowArtist").textContent = selected.artist_name || "FLY SINCE BIRTH";
  audio.src = selected.audio_url;
  setPlayerStatus("Now playing from FSB Music.");
  audio.play().catch(() => setPlayerStatus("Press play to start listening."));
}
document.getElementById("audioPlayer").addEventListener("ended", () => {
  if (playIndex >= 0 && playIndex + 1 < playQueue.length) startSong(playQueue[playIndex + 1], playQueue);
});
document.getElementById("closeMiniPlayer").addEventListener("click", () => {
  const audio = document.getElementById("audioPlayer");
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  document.getElementById("miniPlayer").hidden = true;
  document.body.classList.remove("mini-player-open");
});

function artistCreditLinks(primaryId, primaryName, featuredIds, artistNames, externalCredits) {
  const ids = [...new Set([primaryId, ...(featuredIds || [])].filter(Boolean).map(String))];
  const links = ids.map(id => {
    const name = artistNames.get(id) || (id === String(primaryId) ? primaryName : "");
    if (!name) return "";
    return '<a href="artist.html?id=' + encodeURIComponent(id) + '" style="color:inherit;text-decoration:underline;text-underline-offset:3px">' + musicEsc(name) + '</a>';
  }).filter(Boolean);
  (externalCredits || []).forEach(credit => {
    if (!credit || !credit.name || !credit.url) return;
    try {
      const url = new URL(credit.url);
      if (!["http:", "https:"].includes(url.protocol)) return;
      links.push('<a href="' + musicEsc(url.href) + '" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:underline;text-underline-offset:3px">' + musicEsc(credit.name) + '</a>');
    } catch (_) {}
  });
  return links.map((link,index)=> (index===0 ? "" : (index===1 ? " feat. " : ", ")) + link).join("");
}
function songCard(song) {
  const card = document.createElement("article");
  card.className = "hub-song";
  const credits = artistCreditLinks(song.artist_id, song.artist_name || "FLY SINCE BIRTH", song.feature_artist_ids, song.artistNames || new Map(), song.external_features);
  card.innerHTML = `<img src="${musicEsc(song.image_url || "fsblogo.PNG")}" alt=""><div class="hub-song-info"><strong>${musicEsc(song.title || "Untitled")}</strong><small>${credits || "FLY SINCE BIRTH"}</small></div><button class="hub-play" type="button" data-hub-play-song="${musicEsc(song.id)}">${song.audio_url ? "PLAY" : "UNAVAILABLE"}</button>`;
  const releaseLabel = document.createElement("small");
  releaseLabel.className = "hub-song-release";
  releaseLabel.textContent = song.release_title ? (song.release_type === "ep" ? "EP" : "ALBUM") + " · " + song.release_title : "SINGLE";
  card.querySelector(".hub-song-info").appendChild(releaseLabel);
  const artwork = card.querySelector("img");
  artwork.onerror = () => { artwork.onerror = null; artwork.src = "fsblogo.PNG"; };
  if (window.decorateSongControls) window.decorateSongControls(card, song);
  return card;
}
async function loadAllMusicRows(table, columns, orderColumn = "id") {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const result = await musicSupabase.from(table).select(columns).order(orderColumn, { ascending: true }).range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data || []));
    if ((result.data || []).length < pageSize) return rows;
  }
}
function filterMusicCatalog(catalog, { term = "", artistId = "", type = "", sort = "newest" } = {}) {
  const query = term.trim().toLocaleLowerCase();
  return catalog.filter(song => {
    const credits = [song.artist_name, ...(song.feature_artist_ids || []).map(id => song.artistNames?.get(String(id)) || ""), ...(song.external_features || []).map(credit => credit.name || "")].join(" ");
    return (!artistId || String(song.artist_id) === artistId || (song.feature_artist_ids || []).map(String).includes(artistId)) &&
      (!type || song.release_type === type) &&
      `${song.title || ""} ${credits} ${song.release_title || ""}`.toLocaleLowerCase().includes(query);
  }).sort((a, b) => {
    if (sort === "title") return (a.title || "").localeCompare(b.title || "") || String(a.id).localeCompare(String(b.id));
    if (sort === "artist") return (a.artist_name || "").localeCompare(b.artist_name || "") || (a.title || "").localeCompare(b.title || "");
    return String(b.release_date || b.created_at || "").localeCompare(String(a.release_date || a.created_at || "")) || (a.title || "").localeCompare(b.title || "");
  });
}

async function loadMusicHub() {
  const [allSongs, releases] = await Promise.all([
    loadAllMusicRows("artist_songs", "id,title,artist_id,audio_url,image_url,release_id,track_number,external_features,created_at,release_date,lyrics"),
    loadAllMusicRows("artist_releases", "id,title,type,artwork_url,release_date")
  ]);
  const releaseById = new Map(releases.map(release => [String(release.id), release]));
  const today = new Date().toLocaleDateString("en-CA");
  const songs = allSongs.filter(song => {
    const release = releaseById.get(String(song.release_id));
    return (!song.release_date || song.release_date <= today) && (!release?.release_date || release.release_date <= today);
  });
  const songFeatureResult = { data: (await loadAllMusicRows("artist_song_features", "song_id,artist_id,sort_order", "song_id")).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), error: null };
  if (songFeatureResult.error) console.warn("Featured song credits could not be loaded:", songFeatureResult.error);
  const featureArtistsBySong = new Map();
  (songFeatureResult.data || []).forEach(row => {
    const key = String(row.song_id);
    if (!featureArtistsBySong.has(key)) featureArtistsBySong.set(key, []);
    featureArtistsBySong.get(key).push(String(row.artist_id));
  });
  const allArtistIds = [...new Set([
    ...(songs || []).map(song => song.artist_id),
    ...(songFeatureResult.data || []).map(row => row.artist_id)
  ].filter(Boolean).map(String))];
  const names = new Map();
  if (allArtistIds.length) {
    const result = { data: await loadAllMusicRows("artists", "id,name"), error: null };
    if (result.error) console.warn("Artist names could not be loaded:", result.error);
    (result.data || []).forEach(artist => names.set(String(artist.id), artist.name || ""));
  }
  const allCatalog = (songs || []).map(song => ({
    ...song,
    image_url: song.image_url || releaseById.get(String(song.release_id))?.artwork_url,
    release_title: releaseById.get(String(song.release_id))?.title || "",
    release_type: releaseById.get(String(song.release_id))?.type || "single",
    release_date: releaseById.get(String(song.release_id))?.release_date || song.release_date,
    artist_name: names.get(String(song.artist_id)) || "",
    feature_artist_ids: featureArtistsBySong.get(String(song.id)) || [],
    artistNames: names
  }));
  musicById.clear();
  allCatalog.forEach(song => musicById.set(String(song.id), song));
  const catalog = allCatalog;
  const catalogNode = document.getElementById("songCatalog");
  const bySongId = new Map(catalog.map(song => [String(song.id), song]));

  let selectedArtistId = "";
  const artistSearch = document.getElementById("artistSearch");
  const artistList = document.getElementById("artistIndex");
  const artistEntries = [...names.entries()].map(([id, name]) => ({
    id, name: name || "FSB artist",
    count: catalog.filter(song => String(song.artist_id) === id || (song.feature_artist_ids || []).map(String).includes(id)).length
  })).sort((a, b) => a.name.localeCompare(b.name));
  const renderArtists = () => {
    const query = artistSearch.value.trim().toLocaleLowerCase();
    const entries = artistEntries.filter(artist => artist.name.toLocaleLowerCase().includes(query));
    artistList.replaceChildren();
    const addArtistButton = (id, name, count) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "artist-index-button";
      button.dataset.artistId = id;
      button.setAttribute("aria-pressed", String(selectedArtistId === id));
      const label = document.createElement("span"); label.textContent = name;
      button.appendChild(label);
      button.addEventListener("click", () => {
        selectedArtistId = id;
        renderArtists();
        renderCatalog();
      });
      artistList.appendChild(button);
    };
    addArtistButton("", "All artists", catalog.length);
    entries.forEach(artist => addArtistButton(artist.id, artist.name, artist.count));
    if (!entries.length) {
      const empty = document.createElement("p"); empty.className = "empty";
      empty.textContent = "No artists match your search."; artistList.appendChild(empty);
    }
  };
  let visibleSongs = catalog;
  const renderCatalog = () => {
    const term = document.getElementById("songSearch").value.trim().toLowerCase();
    const artistId = selectedArtistId;
    const type = document.getElementById("songTypeFilter").value;
    const sort = document.getElementById("songSort").value;
    visibleSongs = filterMusicCatalog(catalog, { term, artistId, type, sort });
    document.getElementById("catalogTitle").textContent = selectedArtistId ? (names.get(selectedArtistId) || "Artist") + " — Songs" : "All Songs";
    catalogNode.replaceChildren();
    document.getElementById("songCount").textContent = `${visibleSongs.length} of ${catalog.length} songs`;
    if (!visibleSongs.length) catalogNode.innerHTML = '<p class="empty">' + (catalog.length ? 'No songs match these filters.' : 'No music has been released yet.') + '</p>';
    visibleSongs.forEach(song => catalogNode.appendChild(songCard(song)));
    document.getElementById("playAllSongs").disabled = !visibleSongs.some(song => song.audio_url);
  };
  renderArtists();
  renderCatalog();
  artistSearch.addEventListener("input", renderArtists);
  document.getElementById("songSearch").addEventListener("input", renderCatalog);
  [document.getElementById("songTypeFilter"), document.getElementById("songSort")].forEach(control => control.addEventListener("change", renderCatalog));
  document.getElementById("playAllSongs").addEventListener("click", () => {
    const playable = visibleSongs.filter(song => song.audio_url);
    if (playable.length) startSong(playable[0], playable);
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-hub-play-song]");
    if (button) startSong(bySongId.get(button.dataset.hubPlaySong), visibleSongs);
  });
  const requestedSong = musicParams.get("song_id");
  if (requestedSong && bySongId.has(requestedSong)) { startSong(bySongId.get(requestedSong)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  const requestedVideo = musicParams.get("video_id");
  if (requestedVideo) {
    window.location.replace("video.html?video_id=" + encodeURIComponent(requestedVideo));
    return;
  }
}
loadMusicHub().catch((error) => {
  console.error("Could not load FSB Music:", error);
  document.getElementById("songCatalog").innerHTML = '<p class="empty">Music could not be loaded. Please refresh and try again.</p>';
  document.getElementById("playerStatus").textContent = error.message || "Music could not be loaded.";
});



