const musicSupabase = window.supabase.createClient("https://ccvhvxugoebdqwxxankl.supabase.co", "sb_publishable_vXhQFYGVd6hOHsX4i-ePnw_y687N16Z");
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
  document.getElementById("nowTitle").textContent = selected.title || "Untitled";
  document.getElementById("nowArtist").textContent = selected.artist_name || "FLY SINCE BIRTH";
  audio.src = selected.audio_url;
  setPlayerStatus("Now playing from FSB Music.");
  audio.play().catch(() => setPlayerStatus("Press play to start listening."));
  document.getElementById("videoPlayerHost").innerHTML = '<p class="empty">Choose a video to play here.</p>';
}
document.getElementById("audioPlayer").addEventListener("ended", () => {
  if (playIndex >= 0 && playIndex + 1 < playQueue.length) startSong(playQueue[playIndex + 1], playQueue);
});

function playVideo(video) {
  const host = document.getElementById("videoPlayerHost");
  const raw = String(video?.link || "");
  let url;
  try { url = new URL(raw, location.href); } catch (_) { host.innerHTML = '<p class="empty">VIDEO LINK IS UNAVAILABLE.</p>'; return; }
  if (!/^https?:$/.test(url.protocol)) { host.innerHTML = '<p class="empty">VIDEO LINK IS UNAVAILABLE.</p>'; return; }
  document.getElementById("audioPlayer").pause();
  if (/\.(mp4|webm|ogg|mov)(\?|#|$)/i.test(url.href)) {
    host.innerHTML = "";
    const videoElement = document.createElement("video");
    videoElement.className = "video-player";
    videoElement.controls = true;
    videoElement.playsInline = true;
    videoElement.preload = "metadata";
    videoElement.src = url.href;
    videoElement.setAttribute("aria-label", video.title || "FSB video player");
    host.appendChild(videoElement);
  } else {
    const yt = url.href.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/i);
    const vm = url.href.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
    if (yt) url = new URL("https://www.youtube-nocookie.com/embed/" + yt[1]);
    else if (vm) url = new URL("https://player.vimeo.com/video/" + vm[1]);
    const frame = document.createElement("iframe");
    frame.className = "video-player";
    frame.src = url.href;
    frame.title = video.title || "FSB video player";
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.allowFullscreen = true;
    frame.referrerPolicy = "strict-origin-when-cross-origin";
    host.replaceChildren(frame);
  }
  document.getElementById("nowTitle").textContent = video.title || "FSB Video";
  document.getElementById("nowArtist").textContent = "FSB VIDEO PLAYER";
  setPlayerStatus("Video selected. Playback controls are on the video.");
}

function songCard(song) {
  const card = document.createElement("article");
  card.className = "hub-song";
  card.innerHTML = `<img src="${musicEsc(song.image_url || "fsblogo.PNG")}" alt=""><div class="hub-song-info"><strong>${musicEsc(song.title || "Untitled")}</strong><small>${musicEsc(song.artist_name || "FLY SINCE BIRTH")}</small></div><button class="hub-play" type="button" data-hub-play-song="${musicEsc(song.id)}">${song.audio_url ? "PLAY" : "UNAVAILABLE"}</button>`;
  if (window.decorateSongControls) window.decorateSongControls(card, song);
  return card;
}
function renderVideo(video, artistName) {
  const card = document.createElement("article");
  card.className = "hub-video";
  const image = document.createElement("img");
  image.src = video.image || "fsblogo.PNG";
  image.alt = (video.title || "FSB video") + " thumbnail";
  image.loading = "lazy";
  card.appendChild(image);
  const info = document.createElement("div");
  info.className = "hub-video-info";
  info.innerHTML = `<strong>${musicEsc(video.title || "Untitled video")}</strong><small>${musicEsc(artistName || "FLY SINCE BIRTH")}</small><button class="hub-video-play" type="button" data-hub-play-video="${musicEsc(video.id)}">WATCH HERE</button>`;
  card.appendChild(info);
  return card;
}

async function loadHubLibrary(user) {
  const favoritesNode = document.getElementById("hubFavorites");
  const playlistsNode = document.getElementById("hubPlaylists");
  if (!user) {
    document.getElementById("libraryLogin").hidden = false;
    favoritesNode.innerHTML = '<p class="empty">Sign in to load your favorites.</p>';
    playlistsNode.innerHTML = '<p class="empty">Sign in to load your playlists.</p>';
    return;
  }
  const [fav, lists] = await Promise.all([
    musicSupabase.from("customer_favorite_songs").select("song_id").eq("user_id", user.id),
    musicSupabase.from("customer_playlists").select("id,name").eq("user_id", user.id).order("created_at", { ascending: true })
  ]);
  if (fav.error) throw fav.error;
  if (lists.error) throw lists.error;
  const favoriteSongs = (fav.data || []).map((row) => musicById.get(String(row.song_id))).filter(Boolean);
  favoritesNode.innerHTML = "";
  if (!favoriteSongs.length) favoritesNode.innerHTML = '<p class="empty">Favorite songs from artist pages and they will show up here.</p>';
  favoriteSongs.forEach((song) => {
    const row = document.createElement("div");
    row.className = "hub-fav";
    row.appendChild(songCard(song));
    favoritesNode.appendChild(row);
  });
  const playlistIds = (lists.data || []).map((p) => p.id);
  playlistsNode.innerHTML = "";
  if (!playlistIds.length) playlistsNode.innerHTML = '<p class="empty">Create a playlist on your account page, then add songs from artist pages.</p>';
  let items = [];
  if (playlistIds.length) {
    const result = await musicSupabase.from("customer_playlist_songs").select("playlist_id,song_id").in("playlist_id", playlistIds);
    if (result.error) throw result.error;
    items = result.data || [];
  }
  for (const playlist of lists.data || []) {
    const tracks = items.filter((item) => item.playlist_id === playlist.id).map((item) => musicById.get(String(item.song_id))).filter(Boolean);
    const article = document.createElement("article");
    article.className = "hub-playlist";
    const head = document.createElement("div");
    head.className = "hub-playlist-head";
    const name = document.createElement("strong");
    name.textContent = playlist.name;
    head.appendChild(name);
    const play = document.createElement("button");
    play.className = "hub-playlist-play";
    play.type = "button";
    play.textContent = "PLAY ALL";
    play.disabled = !tracks.some((song) => song.audio_url);
    play.addEventListener("click", () => tracks.length && startSong(tracks.find((song) => song.audio_url), tracks));
    head.appendChild(play);
    article.appendChild(head);
    if (!tracks.length) article.insertAdjacentHTML("beforeend", '<p class="empty">No songs in this playlist yet.</p>');
    tracks.forEach((song) => {
      const row = document.createElement("div");
      row.className = "hub-playlist-song";
      const title = document.createElement("span");
      title.textContent = song.title || "Untitled";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hub-playlist-play";
      button.textContent = song.audio_url ? "PLAY" : "UNAVAILABLE";
      button.disabled = !song.audio_url;
      button.addEventListener("click", () => startSong(song, tracks));
      row.append(title, button);
      article.appendChild(row);
    });
    playlistsNode.appendChild(article);
  }
  const requestedPlaylist = musicParams.get("playlist");
  if (requestedPlaylist) {
    const playlist = (lists.data || []).find((p) => String(p.id) === requestedPlaylist);
    const tracks = items.filter((item) => item.playlist_id === requestedPlaylist).map((item) => musicById.get(String(item.song_id))).filter((song) => song?.audio_url);
    if (playlist && tracks.length) { setPlayerStatus(`Playlist “${playlist.name}” is ready. Press PLAY ALL to start.`); const buttons = [...playlistsNode.querySelectorAll(".hub-playlist")]; const index = (lists.data || []).indexOf(playlist); buttons[index]?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
}

async function loadMusicHub() {
  const [{ data: songs, error: songError }, { data: videos, error: videoError }, { data: sessionData }] = await Promise.all([
    musicSupabase.from("artist_songs").select("id,title,artist_id,audio_url,image_url,release_id,track_number").order("created_at", { ascending: false }),
    musicSupabase.from("videos").select("*").order("sort_order", { ascending: true }),
    musicSupabase.auth.getSession()
  ]);
  if (songError) throw songError;
  if (videoError) throw videoError;
  const artistIds = [...new Set((songs || []).map((song) => song.artist_id).filter(Boolean))];
  const names = new Map();
  if (artistIds.length) {
    const result = await musicSupabase.from("artists").select("id,name").in("id", artistIds);
    if (!result.error) (result.data || []).forEach((artist) => names.set(String(artist.id), artist.name || ""));
  }
  const catalog = (songs || []).map((song) => ({ ...song, artist_name: names.get(String(song.artist_id)) || "" }));
  catalog.forEach((song) => musicById.set(String(song.id), song));
  const catalogNode = document.getElementById("songCatalog");
  const renderCatalog = () => {
    const term = document.getElementById("songSearch").value.trim().toLowerCase();
    const matching = catalog.filter((song) => `${song.title || ""} ${song.artist_name}`.toLowerCase().includes(term));
    catalogNode.innerHTML = "";
    if (!matching.length) catalogNode.innerHTML = '<p class="empty">No matching songs found.</p>';
    matching.forEach((song) => catalogNode.appendChild(songCard(song)));
  };
  renderCatalog();
  document.getElementById("songSearch").addEventListener("input", renderCatalog);
  const videoNode = document.getElementById("videoCatalog");
  videoNode.innerHTML = "";
  if (!videos?.length) videoNode.innerHTML = '<p class="empty">No videos available yet.</p>';
  (videos || []).forEach((video) => videoNode.appendChild(renderVideo(video, names.get(String(video.artist_id)) || video.artist || "")));
  const byVideoId = new Map((videos || []).map((video) => [String(video.id), video]));
  videoNode.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hub-play-video]");
    if (button) playVideo(byVideoId.get(button.dataset.hubPlayVideo));
  });
  const bySongId = new Map(catalog.map((song) => [String(song.id), song]));
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-hub-play-song]");
    if (button) startSong(bySongId.get(button.dataset.hubPlaySong));
  });
  await loadHubLibrary(sessionData?.session?.user || null);
  const requestedSong = musicParams.get("song_id");
  if (requestedSong && bySongId.has(requestedSong)) { startSong(bySongId.get(requestedSong)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  const requestedVideo = musicParams.get("video_id");
  if (requestedVideo && byVideoId.has(requestedVideo)) { playVideo(byVideoId.get(requestedVideo)); document.getElementById("videoPlayerHost").scrollIntoView({ behavior: "smooth", block: "center" }); }
}
loadMusicHub().catch((error) => {
  console.error("Could not load FSB Music:", error);
  document.getElementById("songCatalog").innerHTML = '<p class="empty">Music could not be loaded. Please refresh and try again.</p>';
  document.getElementById("playerStatus").textContent = error.message || "Music could not be loaded.";
});

