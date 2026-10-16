/* Customer-owned FSB playlists and favorites. Requires the page's Supabase client. */
(() => {
  const styles = document.createElement("style");
  styles.textContent = `.fsb-song-actions{display:inline-flex;align-items:center;gap:5px;margin-left:10px}.fsb-song-action{width:30px;height:30px;border:1px solid #555;background:#111;color:#fff;border-radius:50%;font-size:18px;line-height:1;cursor:pointer}.fsb-song-action[aria-pressed="true"]{color:#ff6b86;border-color:#a84b5e}.fsb-song-action:hover{border-color:#fff}.music-library-song{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-top:1px solid #333;font-size:13px}.music-library-song a{min-width:0;overflow-wrap:anywhere}.music-library-playlist{padding:18px 0;border-top:1px solid #333}.music-library-playlist-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.music-library-playlist h3{font-size:15px;margin:0}.music-library-remove{padding:9px 11px!important;font-size:9px!important;white-space:nowrap}.music-library-create,.music-library-add{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.music-library-create input,.music-library-add select{min-width:180px;max-width:100%;padding:12px;background:#090909;border:1px solid #444;color:#fff}.music-library-add select{flex:1}.music-library-section{margin-top:20px;padding-top:18px;border-top:1px solid #333}.music-library-section h3{margin:0 0 8px;font-size:14px}.music-library-status{min-height:20px}`;
  document.head.appendChild(styles);
  styles.textContent += `
    .fsb-playlist-overlay{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.78);backdrop-filter:blur(9px);-webkit-backdrop-filter:blur(9px)}
    .fsb-playlist-dialog{width:min(100%,480px);max-height:min(86vh,680px);overflow:auto;padding:30px;background:radial-gradient(ellipse at 100% 0%,rgba(255,255,255,.07),transparent 48%),#0c0c0c;border:1px solid #383838;box-shadow:0 24px 90px rgba(0,0,0,.65);color:#f5f5f5}
    .fsb-playlist-dialog-head{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
    .fsb-playlist-kicker{margin:0 0 9px;color:#aaa;font-size:9px;font-weight:700;letter-spacing:3px}
    .fsb-playlist-dialog h2{margin:0;font-size:clamp(27px,6vw,38px);line-height:1;letter-spacing:-1px}
    .fsb-playlist-close{width:38px;height:38px;border:1px solid #444;background:#111;color:#fff;font-size:25px;line-height:1;cursor:pointer}
    .fsb-playlist-close:hover,.fsb-playlist-choice:hover,.fsb-playlist-create-toggle:hover{border-color:#ddd;background:#171717}
    .fsb-playlist-song{margin:18px 0 12px;color:#bbb;font-size:13px}
    .fsb-playlist-status{min-height:20px;margin:0 0 12px;color:#ddd;font-size:12px}
    .fsb-playlist-status.is-error{color:#ff9eaa}
    .fsb-playlist-options{display:grid;gap:8px;max-height:38vh;overflow:auto}
    .fsb-playlist-options[hidden],.fsb-playlist-create-toggle[hidden],.fsb-playlist-create-form[hidden],.fsb-playlist-success[hidden]{display:none!important}
    .fsb-playlist-choice{width:100%;padding:14px 15px;text-align:left;border:1px solid #333;background:#111;color:#fff;font-size:13px;cursor:pointer}
    .fsb-playlist-create-toggle{width:100%;margin-top:10px;padding:14px 15px;text-align:left;border:1px dashed #555;background:transparent;color:#f5f5f5;font-size:12px;cursor:pointer}
    .fsb-playlist-create-form{margin-top:12px}
    .fsb-playlist-create-form label{display:block;margin:0 0 8px;color:#bbb;font-size:11px;letter-spacing:.5px}
    .fsb-playlist-create-form input{width:100%;min-height:46px;padding:12px;border:1px solid #444;background:#080808;color:#fff;font:inherit}
    .fsb-playlist-form-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:12px}
    .fsb-playlist-form-actions button,.fsb-playlist-done{min-height:40px;padding:0 15px;border:1px solid #555;background:#111;color:#fff;font-size:10px;font-weight:700;letter-spacing:1px;cursor:pointer}
    .fsb-playlist-submit,.fsb-playlist-done{background:#f2f2f2!important;color:#090909!important;border-color:#f2f2f2!important}
    .fsb-playlist-success{display:flex;align-items:center;gap:12px;padding-top:6px;color:#e7e7e7;font-size:13px}
    .fsb-playlist-success>span:first-child{font-size:24px;color:#fff}
    .fsb-playlist-done{margin-left:auto}
    .fsb-library-toast{position:fixed;right:22px;bottom:22px;z-index:10001;max-width:min(420px,calc(100vw - 44px));padding:13px 16px;background:#111;border:1px solid #4a4a4a;color:#fff;box-shadow:0 12px 35px rgba(0,0,0,.5);font-size:13px;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s}
    .fsb-library-toast.is-visible{opacity:1;transform:translateY(0)}
    @media(max-width:520px){.fsb-playlist-dialog{padding:23px 19px}.fsb-playlist-form-actions button{padding:0 11px}}
  `;
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let currentUser = null;
  let playlistCache = [];
  let favoriteIds = new Set();
  let allSongs = [];

  async function signedInUser() {
    const { data, error } = await supabaseClient.auth.getUser();
    if (error) throw error;
    if (!data.user) throw new Error("Sign in to your FSB account to use favorites and playlists.");
    return data.user;
  }

  function updateFavoriteButtons(songId) {
    document.querySelectorAll(`[data-fsb-favorite="${CSS.escape(String(songId))}"]`).forEach((button) => {
      const active = favoriteIds.has(String(songId));
      button.setAttribute("aria-pressed", String(active));
      button.textContent = active ? "♥" : "♡";
      button.title = active ? "Remove from favorites" : "Add to favorites";
    });
  }

  window.decorateSongControls = function (element, song) {
    if (!element || !song?.id || element.querySelector(".fsb-song-actions")) return element;
    const actions = document.createElement("span");
    actions.className = "fsb-song-actions";
    const favorite = document.createElement("button");
    favorite.type = "button";
    favorite.className = "fsb-song-action fsb-song-favorite";
    favorite.dataset.fsbFavorite = String(song.id);
    favorite.setAttribute("aria-label", `Favorite ${song.title || "song"}`);
    favorite.setAttribute("aria-pressed", String(favoriteIds.has(String(song.id))));
    favorite.textContent = favoriteIds.has(String(song.id)) ? "♥" : "♡";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "fsb-song-action fsb-song-add";
    add.dataset.fsbAddSong = String(song.id);
    add.setAttribute("aria-label", `Add ${song.title || "song"} to a playlist`);
    add.title = "Add to a playlist";
    add.textContent = "+";
    actions.append(favorite, add);
    element.appendChild(actions);
    return element;
  };

  async function toggleFavorite(songId, button) {
    const user = currentUser || await signedInUser();
    currentUser = user;
    const id = String(songId);
    if (favoriteIds.has(id)) {
      const { error } = await supabaseClient.from("customer_favorite_songs").delete().eq("user_id", user.id).eq("song_id", songId);
      if (error) throw error;
      favoriteIds.delete(id);
    } else {
      const { error } = await supabaseClient.from("customer_favorite_songs").insert({ user_id: user.id, song_id: songId });
      if (error) throw error;
      favoriteIds.add(id);
    }
    updateFavoriteButtons(songId);
    if ($("favoriteSongs")) await renderLibrary();
  }

  function showLibraryNotice(message) {
    let notice = document.querySelector(".fsb-library-toast");
    if (!notice) {
      notice = document.createElement("div");
      notice.className = "fsb-library-toast";
      notice.setAttribute("role", "status");
      notice.setAttribute("aria-live", "polite");
      document.body.appendChild(notice);
    }
    notice.textContent = message;
    notice.classList.add("is-visible");
    clearTimeout(notice.hideTimer);
    notice.hideTimer = setTimeout(() => notice.classList.remove("is-visible"), 4200);
  }

  function openPlaylistDialog(songId, playlists, user, trigger) {
    const song = allSongs.find((item) => String(item.id) === String(songId));
    const overlay = document.createElement("div");
    overlay.className = "fsb-playlist-overlay";
    overlay.innerHTML = `
      <section class="fsb-playlist-dialog" role="dialog" aria-modal="true" aria-labelledby="fsbPlaylistTitle">
        <div class="fsb-playlist-dialog-head">
          <div><p class="fsb-playlist-kicker">YOUR MUSIC</p><h2 id="fsbPlaylistTitle">Add to playlist</h2></div>
          <button class="fsb-playlist-close" type="button" aria-label="Close">×</button>
        </div>
        <p class="fsb-playlist-song"></p>
        <p class="fsb-playlist-status" role="status" aria-live="polite"></p>
        <div class="fsb-playlist-options"></div>
        <button class="fsb-playlist-create-toggle" type="button">＋ Create a new playlist</button>
        <form class="fsb-playlist-create-form" hidden>
          <label for="fsbNewPlaylistName">Playlist name</label>
          <input id="fsbNewPlaylistName" name="name" maxlength="60" autocomplete="off" required placeholder="Name your playlist">
          <div class="fsb-playlist-form-actions">
            <button class="fsb-playlist-cancel-create" type="button">CANCEL</button>
            <button class="fsb-playlist-submit" type="submit">CREATE & ADD SONG</button>
          </div>
        </form>
        <div class="fsb-playlist-success" hidden>
          <span aria-hidden="true">✓</span><span class="fsb-playlist-success-text"></span>
          <button class="fsb-playlist-done" type="button">DONE</button>
        </div>
      </section>`;
    document.body.appendChild(overlay);

    const dialog = overlay.querySelector(".fsb-playlist-dialog");
    const list = overlay.querySelector(".fsb-playlist-options");
    const status = overlay.querySelector(".fsb-playlist-status");
    const createToggle = overlay.querySelector(".fsb-playlist-create-toggle");
    const createForm = overlay.querySelector(".fsb-playlist-create-form");
    const nameInput = overlay.querySelector("#fsbNewPlaylistName");
    const successPanel = overlay.querySelector(".fsb-playlist-success");
    let busy = false;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener("keydown", onKeydown);
      overlay.remove();
      trigger?.focus();
    }

    function onKeydown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...dialog.querySelectorAll("button:not([disabled]):not([hidden]), input:not([disabled]):not([hidden])")];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    function setBusy(value) {
      busy = value;
      dialog.querySelectorAll("button, input").forEach((control) => { control.disabled = value; });
    }

    async function saveSongToPlaylist(playlist) {
      if (busy || !playlist) return;
      setBusy(true);
      status.textContent = "Adding song…";
      status.classList.remove("is-error");
      try {
        const { error } = await supabaseClient.from("customer_playlist_songs").insert({ playlist_id: playlist.id, song_id: songId });
        if (error?.code === "23505") throw new Error("That song is already in this playlist.");
        if (error) throw error;
        if ($("favoriteSongs")) await renderLibrary();
        list.hidden = true;
        createToggle.hidden = true;
        createForm.hidden = true;
        status.textContent = "";
        successPanel.hidden = false;
        overlay.querySelector(".fsb-playlist-success-text").textContent = "Added to “" + playlist.name + "”.";
        overlay.querySelector(".fsb-playlist-done").focus();
      } catch (error) {
        status.textContent = error.message || "Could not add this song to the playlist.";
        status.classList.add("is-error");
      } finally {
        setBusy(false);
        if (!closed && !successPanel.hidden) overlay.querySelector(".fsb-playlist-done").disabled = false;
      }
    }

    overlay.querySelector(".fsb-playlist-close").addEventListener("click", close);
    overlay.querySelector(".fsb-playlist-done").addEventListener("click", close);
    overlay.querySelector(".fsb-playlist-cancel-create").addEventListener("click", () => {
      createForm.hidden = true;
      createToggle.hidden = false;
      if (playlists.length) list.hidden = false;
      createToggle.focus();
    });
    overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
    createToggle.addEventListener("click", () => {
      list.hidden = true;
      createToggle.hidden = true;
      createForm.hidden = false;
      status.textContent = "";
      nameInput.focus();
    });
    createForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const name = nameInput.value.trim();
      if (!name) {
        status.textContent = "Enter a playlist name.";
        status.classList.add("is-error");
        nameInput.focus();
        return;
      }
      setBusy(true);
      status.textContent = "Creating playlist…";
      status.classList.remove("is-error");
      try {
        const { data: playlist, error } = await supabaseClient
          .from("customer_playlists")
          .insert({ user_id: user.id, name })
          .select("id,name")
          .single();
        if (error) throw error;
        playlistCache = [...playlists, playlist];
        await saveSongToPlaylist(playlist);
      } catch (error) {
        status.textContent = error.message || "Could not create this playlist.";
        status.classList.add("is-error");
        setBusy(false);
      }
    });

    overlay.querySelector(".fsb-playlist-song").textContent = song?.title ? "“" + song.title + "”" : "Choose where to save this song.";
    if (playlists.length) {
      playlists.forEach((playlist) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "fsb-playlist-choice";
        button.textContent = playlist.name;
        button.addEventListener("click", () => saveSongToPlaylist(playlist));
        list.appendChild(button);
      });
    } else {
      list.hidden = true;
      createToggle.hidden = true;
      createForm.hidden = false;
    }

    document.addEventListener("keydown", onKeydown);
    (playlists.length ? list.querySelector("button") : nameInput).focus();
  }

  async function addToPlaylist(songId, trigger) {
    const user = currentUser || await signedInUser();
    currentUser = user;
    const { data: playlists, error } = await supabaseClient.from("customer_playlists").select("id,name").eq("user_id", user.id).order("created_at", { ascending: true });
    if (error) throw error;
    openPlaylistDialog(songId, playlists || [], user, trigger);
  }

  document.addEventListener("click", async (event) => {
    const favorite = event.target.closest("[data-fsb-favorite]");
    const add = event.target.closest("[data-fsb-add-song]");
    if (!favorite && !add) return;
    event.preventDefault();
    event.stopPropagation();
    const button = favorite || add;
    button.disabled = true;
    try {
      if (favorite) await toggleFavorite(favorite.dataset.fsbFavorite, favorite);
      else await addToPlaylist(add.dataset.fsbAddSong);
    } catch (error) {
      showLibraryNotice(error.message || "Could not update your music library.");
    } finally { button.disabled = false; }
  }, true);

  async function loadCatalog() {
    const { data, error } = await supabaseClient.from("artist_songs").select("id,title,artist_id,image_url,audio_url").order("title", { ascending: true });
    if (error) throw error;
    allSongs = data || [];
    const ids = [...new Set(allSongs.map((song) => song.artist_id).filter(Boolean))];
    if (ids.length) {
      const { data: artists, error: artistError } = await supabaseClient.from("artists").select("id,name").in("id", ids);
      if (!artistError) {
        const names = new Map((artists || []).map((artist) => [String(artist.id), artist.name]));
        allSongs.forEach((song) => song.artist_name = names.get(String(song.artist_id)) || "");
      }
    }
  }

  function songTitle(song) { return `${song.title || "Untitled"}${song.artist_name ? ` — ${song.artist_name}` : ""}`; }

  async function renderLibrary() {
    if (!currentUser || !$("favoriteSongs")) return;
    const [favoritesResult, playlistsResult] = await Promise.all([
      supabaseClient.from("customer_favorite_songs").select("song_id").eq("user_id", currentUser.id),
      supabaseClient.from("customer_playlists").select("id,name,created_at").eq("user_id", currentUser.id).order("created_at", { ascending: true })
    ]);
    if (favoritesResult.error) throw favoritesResult.error;
    if (playlistsResult.error) throw playlistsResult.error;
    favoriteIds = new Set((favoritesResult.data || []).map((row) => String(row.song_id)));
    playlistCache = playlistsResult.data || [];
    const songMap = new Map(allSongs.map((song) => [String(song.id), song]));
    const favoriteSongs = [...favoriteIds].map((id) => songMap.get(id)).filter(Boolean);
    $("favoriteSongs").innerHTML = favoriteSongs.length ? favoriteSongs.map((song) => `<div class="music-library-song"><a href="music.html?song_id=${encodeURIComponent(song.id)}">${esc(songTitle(song))}</a><button class="secondary music-library-remove" type="button" data-remove-favorite="${esc(song.id)}">REMOVE</button></div>`).join("") : '<p class="empty">Favorite a song on an artist page and it will show up here.</p>';
    if (!playlistCache.length) $("playlistCards").innerHTML = '<p class="empty">Create your first playlist above.</p>';
    else {
      const { data: items, error } = await supabaseClient.from("customer_playlist_songs").select("playlist_id,song_id").in("playlist_id", playlistCache.map((p) => p.id));
      if (error) throw error;
      const byPlaylist = new Map(playlistCache.map((p) => [p.id, []]));
      (items || []).forEach((item) => { const song = songMap.get(String(item.song_id)); if (song) byPlaylist.get(item.playlist_id)?.push(song); });
      $("playlistCards").innerHTML = playlistCache.map((p) => `<article class="music-library-playlist"><div class="music-library-playlist-head"><h3>${esc(p.name)}</h3><a class="secondary music-library-remove" href="music.html?playlist=${encodeURIComponent(p.id)}">PLAY</a><button class="secondary music-library-remove" type="button" data-delete-playlist="${esc(p.id)}">DELETE</button></div>${byPlaylist.get(p.id).length ? byPlaylist.get(p.id).map((song) => `<div class="music-library-song"><a href="music.html?song_id=${encodeURIComponent(song.id)}">${esc(songTitle(song))}</a><button class="secondary music-library-remove" type="button" data-remove-song="${esc(p.id)}:${esc(song.id)}">REMOVE</button></div>`).join("") : '<p class="empty">No songs in this playlist yet.</p>'}</article>`).join("");
    }
    document.querySelectorAll("[data-fsb-favorite]").forEach((button) => updateFavoriteButtons(button.dataset.fsbFavorite));
  }

  const library = $("favoriteSongs");
  if (library) {
    const status = $("musicLibraryStatus");
    Promise.all([signedInUser(), loadCatalog()]).then(([user]) => { currentUser = user; return renderLibrary(); }).catch((error) => {
      status.textContent = error.message || "Could not load your music library.";
      if (/sign in/i.test(status.textContent)) { $("musicLibraryContent").hidden = true; $("musicLibrarySignIn").hidden = false; }
    });
    $("createPlaylistForm").addEventListener("submit", async (event) => {
      event.preventDefault(); const input = $("newPlaylistName"), button = event.currentTarget.querySelector("button[type=submit]"); button.disabled = true; status.textContent = "Creating playlist…";
      try { const user = currentUser || await signedInUser(); const { error } = await supabaseClient.from("customer_playlists").insert({ user_id: user.id, name: input.value.trim() }); if (error) throw error; input.value = ""; status.textContent = "Playlist created."; await renderLibrary(); }
      catch (error) { status.textContent = error.message || "Could not create playlist."; } finally { button.disabled = false; }
    });
    document.addEventListener("click", async (event) => {
      const removeFavorite = event.target.closest("[data-remove-favorite]"), removeSong = event.target.closest("[data-remove-song]"), deletePlaylist = event.target.closest("[data-delete-playlist]");
      if (!removeFavorite && !removeSong && !deletePlaylist) return;
      event.preventDefault(); const button = event.target.closest("button"); button.disabled = true;
      try {
        let result;
        if (removeFavorite) result = await supabaseClient.from("customer_favorite_songs").delete().eq("user_id", currentUser.id).eq("song_id", removeFavorite.dataset.removeFavorite);
        else if (removeSong) { const [playlistId, songId] = removeSong.dataset.removeSong.split(":"); result = await supabaseClient.from("customer_playlist_songs").delete().eq("playlist_id", playlistId).eq("song_id", songId); }
        else result = await supabaseClient.from("customer_playlists").delete().eq("id", deletePlaylist.dataset.deletePlaylist).eq("user_id", currentUser.id);
        if (result.error) throw result.error; await renderLibrary();
      } catch (error) { status.textContent = error.message || "Could not update your music library."; } finally { button.disabled = false; }
    });
  }

  window.fsbMusicLibraryReady = supabaseClient.auth.getSession().then(async ({ data }) => {
    currentUser = data?.session?.user || null;
    if (currentUser) {
      const { data: rows, error } = await supabaseClient.from("customer_favorite_songs").select("song_id").eq("user_id", currentUser.id);
      if (!error) {
        favoriteIds = new Set((rows || []).map((row) => String(row.song_id)));
        document.querySelectorAll("[data-fsb-favorite]").forEach((button) => updateFavoriteButtons(button.dataset.fsbFavorite));
      }
    }
  });
})();

