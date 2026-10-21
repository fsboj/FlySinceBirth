/* Customer-only video favorites and personalized video picks. */
(() => {
  const client = typeof supabaseClient !== "undefined" ? supabaseClient : window.supabaseClient;
  if (!client) return;
  const style = document.createElement("style");
  style.textContent = ".fsb-video-favorite{display:inline-grid;place-items:center;width:34px;height:34px;border:1px solid #555;border-radius:50%;background:#111;color:#fff;font-size:18px;line-height:1;cursor:pointer}.fsb-video-favorite[aria-pressed=true]{color:#ff6b86;border-color:#a84b5e}.fsb-video-favorite:hover{border-color:#fff}.fsb-video-favorite[hidden]{display:none!important}";
  document.head.appendChild(style);
  let currentUser = null;
  let authReady = false;
  let favorites = new Set();
  let knownVideos = new Map();
  const keyOf = (type, id) => `${type}:${id}`;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const randomize = rows => {
    const copy = [...rows];
    for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; }
    return copy;
  };

  function updateButtons() {
    document.querySelectorAll("[data-video-favorite-action], [data-fsb-video-favorite]").forEach(button => {
      const key = button.dataset.videoFavoriteAction || button.dataset.fsbVideoFavorite;
      const active = favorites.has(key);
      button.hidden = !currentUser;
      button.disabled = !currentUser;
      button.setAttribute("aria-pressed", String(active));
      button.textContent = active ? "♥" : "♡";
      button.title = active ? "Remove video from favorites" : "Add video to favorites";
    });
  }

  function makeButton(type, id, title) {
    if (!id) return null;
    if (typeof window.fsbCreateVideoFavoriteButton === "function") return window.fsbCreateVideoFavoriteButton(type, id, title);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "fsb-video-favorite";
    button.dataset.videoFavoriteAction = keyOf(type, id);
    button.setAttribute("aria-label", `Favorite video ${title || "Untitled"}`);
    button.textContent = "♡";
    button.hidden = !currentUser;
    button.disabled = !currentUser;
    return button;
  }

  function addFavoriteToCard(card, type, id, title) {
    if (!card || !id || card.querySelector("[data-video-favorite-action], [data-fsb-video-favorite]")) return;
    const button = makeButton(type, id, title);
    if (!button) return;
    button.addEventListener("click", event => event.stopPropagation());
    let actions = card.querySelector(".hub-video-actions, .video-actions");
    if (!actions) { actions = document.createElement("div"); actions.className = "video-actions"; card.appendChild(actions); }
    actions.appendChild(button);
  }

  function attachControls() {
    document.querySelectorAll(".video-card[data-fsb-video-favorite-type], .video-card[data-video-type], .hub-video").forEach(card => {
      const play = card.querySelector("[data-hub-play-video]");
      const type = card.dataset.fsbVideoFavoriteType || card.dataset.videoType || "video";
      const id = card.dataset.fsbVideoFavoriteId || card.dataset.videoId || play?.dataset.hubPlayVideo;
      const title = card.querySelector(".video-title, .hub-video-info strong")?.textContent || "Video";
      addFavoriteToCard(card, type, id, title);
    });
  }

  function filterVisionCatalog() {
    const host = document.getElementById("videoCatalog");
    if (!host) return;
    host.hidden = !authReady;
    if (!authReady) return;
    host.querySelectorAll(".hub-video, .video-card").forEach(card => {
      const play = card.querySelector("[data-hub-play-video]");
      const id = card.dataset.fsbVideoFavoriteId || card.dataset.videoId || play?.dataset.hubPlayVideo;
      if (!currentUser || !favorites.has(keyOf("video", id))) card.remove();
    });
    if (!host.querySelector(".hub-video, .video-card") && !host.querySelector(".empty")) {
      const empty = document.createElement("p"); empty.className = "empty";
      empty.textContent = currentUser ? "Like a video to add it to Your Vision." : "Sign in to see the videos you have liked.";
      host.appendChild(empty);
    }
  }

  async function loadFavorites() {
    if (!currentUser) { favorites.clear(); updateButtons(); renderFavoriteList([]); return; }
    const { data, error } = await client.from("customer_favorite_videos").select("content_type,content_id").eq("user_id", currentUser.id);
    if (error) throw error;
    favorites = new Set((data || []).map(row => keyOf(row.content_type, row.content_id)));
    updateButtons();
    filterVisionCatalog();
    await renderFavoriteList(data || []);
  }

  async function rowsForFavorites(rows) {
    const videoIds = rows.filter(row => row.content_type === "video").map(row => row.content_id);
    const songIds = rows.filter(row => row.content_type === "song").map(row => row.content_id);
    const [videos, songs] = await Promise.all([
      videoIds.length ? client.from("videos").select("id,title,artist").in("id", videoIds) : Promise.resolve({ data: [], error: null }),
      songIds.length ? client.from("artist_songs").select("id,title,artist_id,video_url").in("id", songIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (videos.error) throw videos.error;
    if (songs.error) throw songs.error;
    return [
      ...(videos.data || []).map(video => ({ video, type: "video" })),
      ...(songs.data || []).filter(song => song.video_url).map(song => ({ video: { ...song, link: song.video_url }, type: "song" }))
    ];
  }

  async function renderFavoriteList(rows) {
    if (typeof window.fsbCreateVideoFavoriteButton === "function") return;
    const host = document.getElementById("hubFavoriteVideos") || document.getElementById("favoriteVideos");
    if (!host) return;
    try {
      const entries = await rowsForFavorites(rows);
      host.replaceChildren();
      if (!entries.length) { host.innerHTML = '<p class="empty">Favorite a video and it will show up here.</p>'; return; }
      entries.forEach(({ video, type }) => {
        const row = document.createElement("div"); row.className = "hub-fav hub-fav-row music-library-song";
        const link = document.createElement("a"); link.href = `video.html?${type === "song" ? "song_id" : "video_id"}=${encodeURIComponent(video.id)}`; link.textContent = video.title || "Untitled video";
        const remove = document.createElement("button"); remove.className = "secondary music-library-remove"; remove.type = "button"; remove.dataset.videoFavoriteAction = `${type}:${video.id}`; remove.textContent = "♥"; remove.title = "Remove video from favorites"; remove.setAttribute("aria-label", `Remove ${video.title || "video"} from favorites`); remove.setAttribute("aria-pressed", "true");
        row.append(link, remove); host.appendChild(row);
      });
    } catch (error) { host.innerHTML = '<p class="empty">Favorite videos could not be loaded.</p>'; console.error("Video favorites could not be displayed:", error); }
  }

  async function toggleFavorite(key) {
    if (!currentUser) { location.assign("account.html?return=" + encodeURIComponent(location.pathname + location.search + location.hash)); return; }
    const [type, ...idParts] = key.split(":");
    const id = idParts.join(":");
    if (favorites.has(key)) {
      const { error } = await client.from("customer_favorite_videos").delete().eq("user_id", currentUser.id).eq("content_type", type).eq("content_id", id);
      if (error) throw error;
      favorites.delete(key);
    } else {
      const { error } = await client.from("customer_favorite_videos").insert({ user_id: currentUser.id, content_type: type, content_id: id });
      if (error) throw error;
      favorites.add(key);
    }
    updateButtons();
    await loadFavorites();
  }

  async function loadRecommendations() {
    const host = document.getElementById("videosForYou");
    if (!host || host.querySelector(".hub-video")) return;
    const { data: videos, error } = await client.from("videos").select("*").order("sort_order", { ascending: true });
    if (error) { host.innerHTML = '<p class="empty">Videos could not be loaded.</p>'; return; }
    knownVideos = new Map((videos || []).map(video => [String(video.id), video]));
    if (!videos?.length) { host.innerHTML = '<p class="empty">No videos available yet.</p>'; return; }
    let artistIds = new Set();
    if (currentUser) {
      const [fav, lists] = await Promise.all([
        client.from("customer_favorite_songs").select("song_id").eq("user_id", currentUser.id),
        client.from("customer_playlists").select("id").eq("user_id", currentUser.id)
      ]);
      const playlistIds = (lists.data || []).map(row => row.id);
      const playlistSongs = playlistIds.length ? await client.from("customer_playlist_songs").select("song_id").in("playlist_id", playlistIds) : { data: [], error: null };
      const songIds = [...new Set([...(fav.data || []).map(row => row.song_id), ...(playlistSongs.data || []).map(row => row.song_id)])];
      if (songIds.length) {
        const songs = await client.from("artist_songs").select("id,artist_id").in("id", songIds);
        (songs.data || []).forEach(song => { if (song.artist_id) artistIds.add(String(song.artist_id)); });
      }
      const favoriteVideoRows = await client.from("customer_favorite_videos").select("content_id").eq("user_id", currentUser.id).eq("content_type", "video");
      const favoriteVideoIds = (favoriteVideoRows.data || []).map(row => row.content_id);
      (videos || []).filter(video => favoriteVideoIds.includes(String(video.id)) && video.artist_id).forEach(video => artistIds.add(String(video.artist_id)));
    }
    const featured = videos.length ? await client.from("video_artist_features").select("video_id,artist_id").in("video_id", videos.map(video => video.id)) : { data: [], error: null };
    const creators = new Map();
    (featured.data || []).forEach(row => { const id = String(row.video_id); if (!creators.has(id)) creators.set(id, []); creators.get(id).push(String(row.artist_id)); });
    const matching = [], other = [];
    videos.forEach(video => {
      const artists = [video.artist_id, ...(creators.get(String(video.id)) || [])].filter(Boolean).map(String);
      (artists.some(id => artistIds.has(id)) ? matching : other).push(video);
    });
    const picks = [...randomize(matching), ...randomize(other)].slice(0, 6);
    host.replaceChildren();
    picks.forEach(video => {
      const card = document.createElement("article"); card.className = "hub-video";
      const image = document.createElement("img"); image.src = video.image || "fsblogo.PNG"; image.alt = (video.title || "Video") + " thumbnail"; image.loading = "lazy";
      const info = document.createElement("div"); info.className = "hub-video-info";
      const title = document.createElement("strong"); title.textContent = video.title || "Untitled video";
      const button = document.createElement("a"); button.className = "hub-video-play"; button.href = `video.html?video_id=${encodeURIComponent(video.id)}`; button.textContent = "WATCH VIDEO";
      const actions = document.createElement("div"); actions.className = "hub-video-actions"; actions.appendChild(button);
      const favorite = makeButton("video", video.id, video.title); if (favorite) actions.appendChild(favorite);
      info.append(title, actions); card.append(image, info); host.appendChild(card);
    });
    attachControls(); updateButtons();
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest("[data-video-favorite-action]");
    if (!button) return;
    event.preventDefault(); event.stopPropagation(); button.disabled = true;
    try { await toggleFavorite(button.dataset.videoFavoriteAction); }
    catch (error) { console.error("Could not update video favorites:", error); button.title = error.message || "Could not update favorites"; }
    finally { button.disabled = !currentUser; }
  }, true);

  const observer = new MutationObserver(() => attachControls());
  const catalogObserver = new MutationObserver(() => { attachControls(); filterVisionCatalog(); });
  observer.observe(document.body, { childList: true, subtree: true });
  const visionCatalog = document.getElementById("videoCatalog");
  if (visionCatalog) catalogObserver.observe(visionCatalog, { childList: true, subtree: true });
  const params = new URLSearchParams(location.search);
  const videoType = params.has("song_id") ? "song" : "video";
  const videoId = params.get(videoType === "song" ? "song_id" : "video_id");
  if (videoId) {
    const host = document.getElementById("videoFavoriteHost");
    if (host && !host.querySelector("button")) { const button = makeButton(videoType, videoId, document.getElementById("videoTitle")?.textContent || "Video"); if (button) host.appendChild(button); }
  }
  document.querySelectorAll(".video-card[data-fsb-video-favorite-type]").forEach(card => addFavoriteToCard(card, card.dataset.fsbVideoFavoriteType, card.dataset.fsbVideoFavoriteId, card.querySelector(".video-title")?.textContent));
  client.auth.getSession().then(({ data }) => {
    currentUser = data?.session?.user || null;
    authReady = true;
    updateButtons();
    return Promise.all([loadFavorites(), loadRecommendations()]).then(filterVisionCatalog);
  }).catch(error => console.error("Video favorites are unavailable:", error));
  client.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user || null;
    authReady = true;
    updateButtons();
    loadFavorites().then(loadRecommendations).then(filterVisionCatalog).catch(error => console.error("Video favorites are unavailable:", error));
  });
  window.addEventListener("fsb:favorites-changed", event => {
    if (Array.isArray(event.detail?.videoIds)) favorites = new Set(event.detail.videoIds);
    filterVisionCatalog();
  });
})();

