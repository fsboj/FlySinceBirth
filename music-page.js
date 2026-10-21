const musicSupabase = window.supabaseClient || window.supabase.createClient("https://ccvhvxugoebdqwxxankl.supabase.co", "sb_publishable_vXhQFYGVd6hOHsX4i-ePnw_y687N16Z");
const musicById = new Map();
let hubUser = null;
let savedProductIds = new Set();
let activeMerchProducts = [];
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
    videoElement.controlsList = "nodownload";
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
  const savedHost = document.getElementById("hubBuyLater");
  try {
    const result = await musicSupabase.from("merch_products")
      .select("id,name,category,description,price,images,sizes,colors,featured,sort_order")
      .eq("active", true)
      .order("featured", { ascending: false })
      .order("sort_order", { ascending: true })
      .limit(40);
    if (result.error) throw result.error;
    const products = result.data || [];
    activeMerchProducts = products;
    savedProductIds = new Set();
    if (user) {
      const saved = await musicSupabase.from("customer_saved_products").select("product_id").eq("user_id", user.id);
      if (saved.error) throw saved.error;
      savedProductIds = new Set((saved.data || []).map(row => String(row.product_id)));
    }
    renderBuyLater(user);
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
      const card = document.createElement("article");
      card.className = "merch-pick";
      const link = document.createElement("a");
      link.className = "merch-pick-link";
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
      const save = document.createElement("button");
      save.type = "button";
      save.className = "merch-save-button";
      save.dataset.saveProduct = String(product.id);
      save.textContent = user ? (savedProductIds.has(String(product.id)) ? "SAVED FOR LATER · REMOVE" : "SAVE FOR LATER") : "SIGN IN TO SAVE FOR LATER";
      save.setAttribute("aria-pressed", String(savedProductIds.has(String(product.id))));
      save.addEventListener("click", () => toggleSavedProduct(product, user));
      card.append(link, save);
      host.appendChild(card);
    });
    if (savedHost && !user) savedHost.innerHTML = '<p class="empty">Buy Later is saved to your account. <a href="account.html?return=music.html">Sign in or create an account</a> to use it.</p>';
  } catch (error) {
    console.error("Could not load clothing recommendations:", error);
    host.innerHTML = '<p class="empty">FSB clothing picks could not be loaded right now.</p>';
  }
}
const merchEsc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderBuyLater(user = hubUser) {
  const host = document.getElementById("hubBuyLater");
  if (!host) return;
  if (!user) {
    host.innerHTML = '<p class="empty">Buy Later is saved to your account. <a href="account.html?return=music.html">Sign in or create an account</a> to use it.</p>';
    return;
  }
  const products = [...savedProductIds].map(id => activeMerchProducts.find(product => String(product.id) === id)).filter(Boolean);
  host.replaceChildren();
  if (!products.length) {
    host.innerHTML = '<p class="empty">Products you save from the Shop will appear here.</p>';
    return;
  }
  products.forEach(product => {
    const row = document.createElement("div");
    row.className = "buy-later-row";
    const image = document.createElement("img");
    image.src = merchEsc(merchImage(product));
    image.alt = "";
    const info = document.createElement("div");
    info.className = "buy-later-info";
    const link = document.createElement("a");
    link.href = "merch.html?product=" + encodeURIComponent(product.id);
    link.textContent = product.name || "FSB clothing";
    const price = document.createElement("small");
    price.textContent = "$" + (Number(product.price) || 0).toFixed(2);
    info.append(link, price);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "buy-later-remove";
    remove.textContent = "REMOVE";
    remove.addEventListener("click", () => toggleSavedProduct(product, user, remove));
    row.append(image, info, remove);
    host.appendChild(row);
  });
}

async function toggleSavedProduct(product, user = hubUser, trigger = null) {
  const id = String(product.id);
  if (!user) {
    location.assign("account.html?return=" + encodeURIComponent("music.html"));
    return;
  }
  const buttons = [...document.querySelectorAll("[data-save-product]")].filter(button => button.dataset.saveProduct === id);
  if (trigger) buttons.push(trigger);
  buttons.forEach(button => { button.disabled = true; });
  try {
    const existing = savedProductIds.has(id);
    const result = existing
      ? await musicSupabase.from("customer_saved_products").delete().eq("user_id", user.id).eq("product_id", product.id)
      : await musicSupabase.from("customer_saved_products").insert({ user_id: user.id, product_id: product.id });
    if (result.error) throw result.error;
    if (existing) savedProductIds.delete(id); else savedProductIds.add(id);
    renderBuyLater(user);
    document.querySelectorAll("[data-save-product]").forEach(button => {
      const saved = savedProductIds.has(button.dataset.saveProduct);
      button.textContent = saved ? "SAVED FOR LATER · REMOVE" : "SAVE FOR LATER";
      button.setAttribute("aria-pressed", String(saved));
    });
  } catch (error) {
    console.error("Could not update Buy Later:", error);
    window.alert(error.message || "Could not update Buy Later. Please try again.");
  } finally {
    buttons.forEach(button => { button.disabled = false; });
  }
}

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
  const credits = artistCreditLinks(video.artist_id, artistName || "FLY SINCE BIRTH", featuredIds, artistNames || new Map(), video.external_features);
  info.innerHTML = `<strong>${musicEsc(video.title || "Untitled video")}</strong><small>${credits || "FLY SINCE BIRTH"}</small><button class="hub-video-play" type="button" data-hub-play-video="${musicEsc(video.id)}">WATCH HERE</button>`;
  card.appendChild(info);
  return card;
}

function renderHubFavoriteSongs(favoriteSongs) {
  const favoritesNode = document.getElementById("hubFavorites");
  favoritesNode.replaceChildren();
  if (!favoriteSongs.length) favoritesNode.innerHTML = '<p class="empty">Sign in and favorite songs to see them here.</p>';
  favoriteSongs.forEach(song => {
    const row = document.createElement("div");
    row.className = "hub-fav hub-fav-row";
    const info = document.createElement("div");
    info.className = "hub-fav-info";
    const link = document.createElement("a");
    link.href = "artist.html?id=" + encodeURIComponent(song.artist_id);
    link.textContent = song.title || "Untitled";
    const artist = document.createElement("small");
    artist.textContent = song.artist_name || "FLY SINCE BIRTH";
    info.append(link, artist);
    const play = document.createElement("button");
    play.type = "button";
    play.className = "hub-play hub-fav-play";
    play.textContent = song.audio_url ? "PLAY" : "UNAVAILABLE";
    play.disabled = !song.audio_url;
    play.addEventListener("click", () => startSong(song));
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "fsb-song-action fsb-song-favorite";
    favorite.dataset.fsbFavorite = String(song.id);
    favorite.setAttribute("aria-label", `Remove ${song.title || "song"} from favorites`);
    favorite.setAttribute("aria-pressed", "true");
    favorite.textContent = "♥";
    favorite.title = "Remove from favorites";
    row.append(info, play, favorite);
    favoritesNode.appendChild(row);
  });
}
window.addEventListener("fsb:favorites-changed", event => {
  const ids = event.detail?.ids || [];
  renderHubFavoriteSongs(ids.map(id => musicById.get(String(id))).filter(Boolean));
});

async function loadHubTickets(user) {
  const host = document.getElementById("hubTickets");
  if (!host) return;
  if (!user) {
    host.innerHTML = '<p class="empty"><a style="color:#fff;text-decoration:underline" href="account.html?return=music.html">Sign in</a> with the account that purchased tickets to view them here.</p>';
    return;
  }
  host.innerHTML = '<p class="empty">Loading your tickets…</p>';
  try {
    const result = await musicSupabase.from("event_ticket_orders")
      .select("id,event_id,quantity,unit_price,status,ticket_code,created_at")
      .eq("user_id", user.id)
      .eq("status", "paid")
      .order("created_at", { ascending: false });
    if (result.error) throw result.error;
    const tickets = result.data || [];
    if (!tickets.length) {
      host.innerHTML = '<p class="empty">No purchased tickets yet. Tickets will appear here after payment is confirmed.</p>';
      return;
    }
    const eventIds = [...new Set(tickets.map(ticket => ticket.event_id).filter(Boolean))];
    const eventResult = eventIds.length
      ? await musicSupabase.from("events").select("id,title,date,location").in("id", eventIds)
      : { data: [], error: null };
    if (eventResult.error) throw eventResult.error;
    const events = new Map((eventResult.data || []).map(event => [String(event.id), event]));
    host.replaceChildren();
    tickets.forEach(ticket => {
      const event = events.get(String(ticket.event_id)) || {};
      const article = document.createElement("article");
      article.className = "hub-ticket";
      const details = document.createElement("div");
      details.className = "hub-ticket-details";
      const title = document.createElement("strong");
      title.textContent = event.title || "FSB Event";
      const meta = document.createElement("span");
      meta.textContent = [event.date, ticket.quantity + (Number(ticket.quantity) === 1 ? " ticket" : " tickets"), new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(ticket.quantity) * Number(ticket.unit_price))].filter(Boolean).join(" · ");
      details.append(title, meta);
      if (event.location) {
        const location = document.createElement("small");
        location.textContent = event.location;
        details.appendChild(location);
      }
      const code = document.createElement("code");
      code.className = "hub-ticket-code";
      code.textContent = "Ticket code · " + String(ticket.ticket_code || "");
      article.append(details, code);
      host.appendChild(article);
    });
  } catch (error) {
    console.error("Could not load purchased tickets:", error);
    host.innerHTML = '<p class="empty">Your tickets could not be loaded right now. Please refresh and try again.</p>';
  }
}

async function loadHubLibrary(user) {
  loadHubTickets(user);
  const favoritesNode = document.getElementById("hubFavorites");
  const playlistsNode = document.getElementById("hubPlaylists");
  if (!user) {
    hubUser = null;
    const login = document.getElementById("libraryLogin");
    login.hidden = false;
    login.innerHTML = '<a href="account.html?return=' + encodeURIComponent(location.pathname + location.search + location.hash) + '">Sign in or create an account</a> to make and manage playlists.';
    renderHubFavoriteSongs([]);
    playlistsNode.innerHTML = '<p class="empty">Sign in or create an account to make playlists.</p>';
    return { songIds: new Set(), artistIds: new Set() };
  }
  hubUser = user;
  const [fav, lists] = await Promise.all([
    musicSupabase.from("customer_favorite_songs").select("song_id").eq("user_id", user.id),
    musicSupabase.from("customer_playlists").select("id,name").eq("user_id", user.id).order("created_at", { ascending: true })
  ]);
  if (fav.error) throw fav.error;
  if (lists.error) throw lists.error;
  const favoriteIds = [...new Set((fav.data || []).map((row) => String(row.song_id)))];
  const favoriteSongs = favoriteIds.map(id => musicById.get(id)).filter(Boolean);
  renderHubFavoriteSongs(favoriteSongs);
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
    article.dataset.playlistId = String(playlist.id);

    const head = document.createElement("div");
    head.className = "hub-playlist-head";
    const toggle = document.createElement("button");
    toggle.className = "hub-playlist-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open playlist " + playlist.name);
    const name = document.createElement("strong");
    name.textContent = playlist.name;
    const chevron = document.createElement("span");
    chevron.className = "hub-playlist-chevron";
    chevron.setAttribute("aria-hidden", "true");
    chevron.textContent = "⌄";
    toggle.append(name, chevron);
    head.appendChild(toggle);

    const body = document.createElement("div");
    body.className = "hub-playlist-body";
    body.hidden = true;
    const actions = document.createElement("div");
    actions.className = "hub-playlist-actions";

    const play = document.createElement("button");
    play.className = "hub-playlist-play";
    play.type = "button";
    play.textContent = "PLAY ALL";
    play.disabled = !tracks.some((song) => song.audio_url);
    play.addEventListener("click", () => {
      const playable = tracks.filter((song) => song.audio_url);
      if (playable.length) startSong(playable[0], playable);
    });

    const shuffle = document.createElement("button");
    shuffle.className = "hub-playlist-play";
    shuffle.type = "button";
    shuffle.textContent = "SHUFFLE";
    shuffle.disabled = !tracks.some((song) => song.audio_url);
    shuffle.addEventListener("click", () => {
      const playable = tracks.filter((song) => song.audio_url);
      for (let i = playable.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [playable[i], playable[j]] = [playable[j], playable[i]];
      }
      if (playable.length) startSong(playable[0], playable);
    });

    const close = document.createElement("button");
    close.className = "hub-playlist-close";
    close.type = "button";
    close.textContent = "CLOSE";
    close.addEventListener("click", () => {
      body.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      toggle.focus();
    });
    actions.append(play, shuffle, close);
    body.appendChild(actions);

    if (!tracks.length) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No songs in this playlist yet.";
      body.appendChild(empty);
    }
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
      body.appendChild(row);
    });

    toggle.addEventListener("click", () => {
      const opening = body.hidden;
      if (opening) {
        playlistsNode.querySelectorAll(".hub-playlist-body").forEach((other) => { other.hidden = true; });
        playlistsNode.querySelectorAll(".hub-playlist-toggle").forEach((other) => other.setAttribute("aria-expanded", "false"));
      }
      body.hidden = !opening;
      toggle.setAttribute("aria-expanded", String(opening));
    });

    article.append(head, body);
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
    if (playlist) { const card = [...playlistsNode.querySelectorAll(".hub-playlist")].find((item) => item.dataset.playlistId === requestedPlaylist); const toggle = card?.querySelector(".hub-playlist-toggle"); if (toggle && card.querySelector(".hub-playlist-body")?.hidden) toggle.click(); card?.scrollIntoView({ behavior: "smooth", block: "center" }); if (tracks.length) setPlayerStatus(`Playlist “${playlist.name}” is ready. Press PLAY ALL or SHUFFLE to start.`); }
  }
  return { songIds: tasteSongIds, artistIds: tasteArtistIds };
}

async function loadMusicHub() {
  const [{ data: songs, error: songError }, { data: sessionData }] = await Promise.all([
    musicSupabase.from("artist_songs").select("id,title,artist_id,audio_url,image_url,release_id,track_number,external_features").order("created_at", { ascending: false }),
    musicSupabase.auth.getSession()
  ]);
  if (songError) throw songError;
  const songFeatureResult = (songs || []).length
    ? await musicSupabase.from("artist_song_features").select("song_id,artist_id,sort_order").in("song_id", songs.map(song => song.id)).order("sort_order")
    : { data: [], error: null };
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
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-hub-play-song]");
    if (button) startSong(bySongId.get(button.dataset.hubPlaySong));
  });
  await loadMerchRecommendations(user);
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

