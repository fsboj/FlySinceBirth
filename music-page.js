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
  document.getElementById("miniPlayer").hidden = false;
  document.body.classList.add("mini-player-open");
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
document.getElementById("closeMiniPlayer").addEventListener("click", () => {
  const audio = document.getElementById("audioPlayer");
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
  document.getElementById("miniPlayer").hidden = true;
  document.body.classList.remove("mini-player-open");
});

function playVideo(video) {
  const host = document.getElementById("videoPlayerHost");
  const raw = String(video?.link || "");
  let url;
  try { url = new URL(raw, location.href); } catch (_) { host.innerHTML = '<p class="empty">VIDEO LINK IS UNAVAILABLE.</p>'; return; }
  if (!/^https?:$/.test(url.protocol)) { host.innerHTML = '<p class="empty">VIDEO LINK IS UNAVAILABLE.</p>'; return; }
  document.getElementById("audioPlayer").pause();
  document.getElementById("miniPlayer").hidden = true;
  document.body.classList.remove("mini-player-open");
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


const merchViewedKey = "fsbRecentlyViewedProducts";
function readMerchViews() {
  try {
    const value = JSON.parse(localStorage.getItem(merchViewedKey) || "[]");
    return Array.isArray(value) ? value.map(String).slice(0, 20) : [];
  } catch (_) { return []; }
}
function recommendationTerms(value) {
  return new Set(String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []);
}
function merchImage(product) {
  return (product.images || []).find(Boolean) || "flysincebirthchrome.PNG";
}
async function loadMerchRecommendations(user) {
  const host = document.getElementById("merchRecommendations");
  if (!host) return;
  try {
    const result = await musicSupabase.from("merch_products")
      .select("id,name,category,description,price,images,sizes,colors,featured,sort_order")
      .eq("active", true)
      .order("featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(40);
    if (result.error) throw result.error;
    const products = result.data || [];
    if (!products.length) {
      host.innerHTML = '<p class="empty">No clothing is available right now. New FSB pieces will appear here.</p>';
      return;
    }

    const views = readMerchViews();
    let orderItems = [];
    if (user) {
      try {
        const orders = await musicSupabase.from("fsb_store_orders")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(30);
        if (orders.error) throw orders.error;
        const orderIds = (orders.data || []).map((order) => order.id);
        if (orderIds.length) {
          const items = await musicSupabase.from("fsb_store_order_items")
            .select("product_id,product_name,variant_size,variant_color,unit_price")
            .in("order_id", orderIds);
          if (items.error) throw items.error;
          orderItems = items.data || [];
        }
      } catch (error) {
        console.warn("Could not load this customer's order history for recommendations:", error);
      }
    }

    const signals = [];
    views.forEach((id, index) => {
      const product = products.find((item) => String(item.id) === id);
      if (product) signals.push({ product, weight: Math.max(2, 7 - index * 0.2) });
    });
    orderItems.forEach((item, index) => {
      const product = products.find((candidate) => String(candidate.id) === String(item.product_id));
      signals.push({
        product: product || null,
        name: item.product_name || product?.name || "",
        color: item.variant_color || "",
        size: item.variant_size || "",
        price: Number(item.unit_price) || 0,
        weight: Math.max(5, 10 - index * 0.15)
      });
    });

    const viewedIds = new Set(views);
    const boughtIds = new Set(orderItems.map((item) => String(item.product_id)).filter(Boolean));
    const pool = products.filter((product) => !viewedIds.has(String(product.id)) && !boughtIds.has(String(product.id)));
    const candidates = pool.length ? pool : products.filter((product) => !boughtIds.has(String(product.id)));
    const ranked = candidates.map((product) => {
      const terms = recommendationTerms([product.name, product.category, product.description, ...(product.colors || [])].join(" "));
      const sizes = new Set((product.sizes || []).map((size) => String(size).toLowerCase()));
      const colors = new Set((product.colors || []).map((color) => String(color).toLowerCase()));
      let score = product.featured ? 1.5 : 0;
      for (const signal of signals) {
        const source = signal.product;
        const sourceText = source
          ? [source.name, source.category, source.description, ...(source.colors || [])].join(" ")
          : [signal.name, signal.color].join(" ");
        const sourceTerms = recommendationTerms(sourceText);
        let overlap = 0;
        for (const term of sourceTerms) if (term.length > 2 && terms.has(term)) overlap += 1;
        score += Math.min(overlap, 5) * signal.weight * 0.35;
        if (source?.category && product.category && source.category.toLowerCase() === product.category.toLowerCase()) score += signal.weight * 0.8;
        const sourceColors = source?.colors || (signal.color ? [signal.color] : []);
        if (sourceColors.some((color) => colors.has(String(color).toLowerCase()))) score += signal.weight * 0.18;
        const sourceSizes = source?.sizes || (signal.size ? [signal.size] : []);
        if (sourceSizes.some((size) => sizes.has(String(size).toLowerCase()))) score += signal.weight * 0.12;
        const sourcePrice = source?.price || signal.price;
        if (sourcePrice && product.price) {
          const distance = Math.abs(Number(sourcePrice) - Number(product.price)) / Math.max(Number(sourcePrice), Number(product.price), 1);
          score += Math.max(0, 1 - distance) * signal.weight * 0.12;
        }
      }
      return { product, score };
    }).sort((a, b) => b.score - a.score || Number(b.product.featured) - Number(a.product.featured) || Number(a.product.sort_order || 0) - Number(b.product.sort_order || 0)).slice(0, 2);

    host.innerHTML = "";
    const note = document.createElement("p");
    note.className = "merch-rec-note";
    note.textContent = signals.length
      ? "Matched to clothing you have viewed or ordered."
      : "Featured FSB clothing picks. Browse items to tailor future picks.";
    host.appendChild(note);
    ranked.forEach(({ product }) => {
      const link = document.createElement("a");
      link.className = "merch-pick";
      link.href = "merch.html?product=" + encodeURIComponent(product.id);
      link.setAttribute("aria-label", "View " + (product.name || "FSB clothing"));
      const image = document.createElement("img");
      image.src = merchEsc(merchImage(product));
      image.alt = "";
      image.loading = "lazy";
      const info = document.createElement("div");
      info.className = "merch-pick-info";
      info.innerHTML = "<small>" + merchEsc(product.category || "FSB clothing") + "</small><strong>" + merchEsc(product.name || "FSB apparel") + "</strong><span>$" + (Number(product.price) || 0).toFixed(2) + "</span>";
      link.append(image, info);
      host.appendChild(link);
    });
  } catch (error) {
    console.error("Could not load clothing recommendations:", error);
    host.innerHTML = '<p class="empty">FSB clothing picks could not be loaded right now.</p>';
  }
}
const merchEsc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function artistCreditLinks(primaryId, primaryName, featuredIds, artistNames) {
  const ids = [...new Set([primaryId, ...(featuredIds || [])].filter(Boolean).map(String))];
  return ids.map((id, index) => {
    const name = artistNames.get(id) || (id === String(primaryId) ? primaryName : "");
    if (!name) return "";
    const link = '<a href="artist.html?id=' + encodeURIComponent(id) + '" style="color:inherit;text-decoration:underline;text-underline-offset:3px">' + musicEsc(name) + '</a>';
    return (index === 0 ? "" : (index === 1 ? " feat. " : ", ")) + link;
  }).join("");
}
function songCard(song) {
  const card = document.createElement("article");
  card.className = "hub-song";
  const credits = artistCreditLinks(song.artist_id, song.artist_name || "FLY SINCE BIRTH", song.feature_artist_ids, song.artistNames || new Map());
  card.innerHTML = `<img src="${musicEsc(song.image_url || "fsblogo.PNG")}" alt=""><div class="hub-song-info"><strong>${musicEsc(song.title || "Untitled")}</strong><small>${credits || "FLY SINCE BIRTH"}</small></div><button class="hub-play" type="button" data-hub-play-song="${musicEsc(song.id)}">${song.audio_url ? "PLAY" : "UNAVAILABLE"}</button>`;
  if (window.decorateSongControls) window.decorateSongControls(card, song);
  return card;
}
function renderVideo(video, artistName, featuredIds, artistNames) {
  const card = document.createElement("article");
  card.className = "hub-video";
  const image = document.createElement("img");
  image.src = video.image || "fsblogo.PNG";
  image.alt = (video.title || "FSB video") + " thumbnail";
  image.loading = "lazy";
  card.appendChild(image);
  const info = document.createElement("div");
  info.className = "hub-video-info";
  const credits = artistCreditLinks(video.artist_id, artistName || "FLY SINCE BIRTH", featuredIds, artistNames || new Map());
  info.innerHTML = `<strong>${musicEsc(video.title || "Untitled video")}</strong><small>${credits || "FLY SINCE BIRTH"}</small><button class="hub-video-play" type="button" data-hub-play-video="${musicEsc(video.id)}">WATCH HERE</button>`;
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
    return { songIds: new Set(), artistIds: new Set() };
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
  const tasteSongIds = new Set([...(fav.data || []).map(row => String(row.song_id)), ...items.map(item => String(item.song_id))]);
  const tasteArtistIds = new Set();
  tasteSongIds.forEach(id => {
    const song = musicById.get(id);
    if (song) [song.artist_id, ...(song.feature_artist_ids || [])].filter(Boolean).forEach(artistId => tasteArtistIds.add(String(artistId)));
  });
  const requestedPlaylist = musicParams.get("playlist");
  if (requestedPlaylist) {
    const playlist = (lists.data || []).find((p) => String(p.id) === requestedPlaylist);
    const tracks = items.filter((item) => item.playlist_id === requestedPlaylist).map((item) => musicById.get(String(item.song_id))).filter((song) => song?.audio_url);
    if (playlist && tracks.length) { setPlayerStatus(`Playlist “${playlist.name}” is ready. Press PLAY ALL to start.`); const buttons = [...playlistsNode.querySelectorAll(".hub-playlist")]; const index = (lists.data || []).indexOf(playlist); buttons[index]?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }
  return { songIds: tasteSongIds, artistIds: tasteArtistIds };
}

async function loadMusicHub() {
  const [{ data: songs, error: songError }, { data: videos, error: videoError }, { data: sessionData }] = await Promise.all([
    musicSupabase.from("artist_songs").select("id,title,artist_id,audio_url,image_url,release_id,track_number").order("created_at", { ascending: false }),
    musicSupabase.from("videos").select("*").order("sort_order", { ascending: true }),
    musicSupabase.auth.getSession()
  ]);
  if (songError) throw songError;
  if (videoError) throw videoError;
  const [songFeatureResult, videoFeatureResult] = await Promise.all([
    (songs || []).length ? musicSupabase.from("artist_song_features").select("song_id,artist_id,sort_order").in("song_id", songs.map(song => song.id)).order("sort_order") : Promise.resolve({data:[],error:null}),
    (videos || []).length ? musicSupabase.from("video_artist_features").select("video_id,artist_id,sort_order").in("video_id", videos.map(video => video.id)).order("sort_order") : Promise.resolve({data:[],error:null})
  ]);
  if (songFeatureResult.error) console.warn("Featured song credits could not be loaded:", songFeatureResult.error);
  if (videoFeatureResult.error) console.warn("Featured video credits could not be loaded:", videoFeatureResult.error);
  const featureArtistsBySong = new Map();
  (songFeatureResult.data || []).forEach(row => {
    const key = String(row.song_id);
    if (!featureArtistsBySong.has(key)) featureArtistsBySong.set(key, []);
    featureArtistsBySong.get(key).push(String(row.artist_id));
  });
  const featureArtistsByVideo = new Map();
  (videoFeatureResult.data || []).forEach(row => {
    const key = String(row.video_id);
    if (!featureArtistsByVideo.has(key)) featureArtistsByVideo.set(key, []);
    featureArtistsByVideo.get(key).push(String(row.artist_id));
  });
  const allArtistIds = [...new Set([
    ...(songs || []).map(song => song.artist_id),
    ...(videos || []).map(video => video.artist_id),
    ...(songFeatureResult.data || []).map(row => row.artist_id),
    ...(videoFeatureResult.data || []).map(row => row.artist_id)
  ].filter(Boolean).map(String))];
  const names = new Map();
  if (allArtistIds.length) {
    const result = await musicSupabase.from("artists").select("id,name").in("id", allArtistIds);
    if (result.error) console.warn("Artist names could not be loaded:", result.error);
    (result.data || []).forEach(artist => names.set(String(artist.id), artist.name || ""));
  }
  const catalog = (songs || []).map(song => ({
    ...song,
    artist_name: names.get(String(song.artist_id)) || "",
    feature_artist_ids: featureArtistsBySong.get(String(song.id)) || [],
    artistNames: names
  }));
  catalog.forEach(song => musicById.set(String(song.id), song));
  const catalogNode = document.getElementById("songCatalog");
  const videoNode = document.getElementById("videoCatalog");
  const byVideoId = new Map((videos || []).map(video => [String(video.id), video]));
  const bySongId = new Map(catalog.map(song => [String(song.id), song]));
  const user = sessionData?.session?.user || null;
  const taste = await loadHubLibrary(user);
  const shuffle = items => {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };
  const tasteArtists = new Set(taste?.artistIds || []);
  const librarySongIds = taste?.songIds || new Set();
  const artistNetwork = song => [song.artist_id, ...(song.feature_artist_ids || [])].filter(Boolean).map(String);
  const initialTasteArtists = new Set(tasteArtists);
  catalog.forEach(song => {
    const credits = artistNetwork(song);
    if (credits.some(id => initialTasteArtists.has(id))) credits.forEach(id => tasteArtists.add(id));
  });
  const matching = [], other = [];
  catalog.forEach(song => {
    const overlapsTaste = artistNetwork(song).some(id => tasteArtists.has(id));
    if (tasteArtists.size && overlapsTaste && !librarySongIds.has(String(song.id))) matching.push(song);
    else if (!librarySongIds.has(String(song.id))) other.push(song);
  });
  const recommendedOrder = [...shuffle(matching), ...shuffle(other)];
  if (!recommendedOrder.length && catalog.length) recommendedOrder.push(...shuffle(catalog));
  const renderCatalog = () => {
    const term = document.getElementById("songSearch").value.trim().toLowerCase();
    const filtered = recommendedOrder.filter(song => {
      const credits = [song.artist_name, ...(song.feature_artist_ids || []).map(id => names.get(id) || "")].join(" ");
      return `${song.title || ""} ${credits}`.toLowerCase().includes(term);
    });
    catalogNode.innerHTML = "";
    if (!filtered.length) catalogNode.innerHTML = '<p class="empty">No recommended songs match your search yet.</p>';
    filtered.forEach(song => catalogNode.appendChild(songCard(song)));
  };
  renderCatalog();
  document.getElementById("songSearch").addEventListener("input", renderCatalog);
  videoNode.innerHTML = "";
  if (!videos?.length) videoNode.innerHTML = '<p class="empty">No videos available yet.</p>';
  (videos || []).forEach(video => videoNode.appendChild(renderVideo(video, names.get(String(video.artist_id)) || video.artist || "", featureArtistsByVideo.get(String(video.id)) || [], names)));
  videoNode.addEventListener("click", event => {
    const button = event.target.closest("[data-hub-play-video]");
    if (button) playVideo(byVideoId.get(button.dataset.hubPlayVideo));
  });
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-hub-play-song]");
    if (button) startSong(bySongId.get(button.dataset.hubPlaySong));
  });
  await loadMerchRecommendations(user);
  const requestedSong = musicParams.get("song_id");
  if (requestedSong && bySongId.has(requestedSong)) { startSong(bySongId.get(requestedSong)); window.scrollTo({ top: 0, behavior: "smooth" }); }
  const requestedVideo = musicParams.get("video_id");
  if (requestedVideo && byVideoId.has(requestedVideo)) {
    window.location.replace("video.html?video_id=" + encodeURIComponent(requestedVideo));
    return;
  }
}
loadMusicHub().catch((error) => {
  console.error("Could not load FSB Music:", error);
  document.getElementById("songCatalog").innerHTML = '<p class="empty">Music could not be loaded. Please refresh and try again.</p>';
  document.getElementById("playerStatus").textContent = error.message || "Music could not be loaded.";
});

