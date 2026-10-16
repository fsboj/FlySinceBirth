/* Customer-owned FSB playlists and favorites. Requires the page's Supabase client. */
(() => {
  const styles = document.createElement("style");
  styles.textContent = `.fsb-song-actions{display:inline-flex;align-items:center;gap:5px;margin-left:10px}.fsb-song-action{width:30px;height:30px;border:1px solid #555;background:#111;color:#fff;border-radius:50%;font-size:18px;line-height:1;cursor:pointer}.fsb-song-action[aria-pressed="true"]{color:#ff6b86;border-color:#a84b5e}.fsb-song-action:hover{border-color:#fff}.music-library-song{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-top:1px solid #333;font-size:13px}.music-library-song a{min-width:0;overflow-wrap:anywhere}.music-library-playlist{padding:18px 0;border-top:1px solid #333}.music-library-playlist-head{display:flex;align-items:center;justify-content:space-between;gap:10px}.music-library-playlist h3{font-size:15px;margin:0}.music-library-remove{padding:9px 11px!important;font-size:9px!important;white-space:nowrap}.music-library-create,.music-library-add{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.music-library-create input,.music-library-add select{min-width:180px;max-width:100%;padding:12px;background:#090909;border:1px solid #444;color:#fff}.music-library-add select{flex:1}.music-library-section{margin-top:20px;padding-top:18px;border-top:1px solid #333}.music-library-section h3{margin:0 0 8px;font-size:14px}.music-library-status{min-height:20px}`;
  document.head.appendChild(styles);
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

  async function createPlaylistFromSong(user) {
    const name = window.prompt("Name your new playlist:");
    if (name === null) return null;
    const trimmedName = name.trim();
    if (!trimmedName) throw new Error("Enter a playlist name.");
    const { data: playlist, error } = await supabaseClient
      .from("customer_playlists")
      .insert({ user_id: user.id, name: trimmedName })
      .select("id,name")
      .single();
    if (error) throw error;
    return playlist;
  }

  async function addToPlaylist(songId) {
    const user = currentUser || await signedInUser();
    currentUser = user;
    const { data: playlists, error } = await supabaseClient.from("customer_playlists").select("id,name").eq("user_id", user.id).order("created_at", { ascending: true });
    if (error) throw error;

    let playlist;
    if (!playlists?.length) {
      playlist = await createPlaylistFromSong(user);
      if (!playlist) return;
    } else {
      const createChoice = playlists.length + 1;
      const options = playlists
        .map((p, i) => (i + 1) + ". " + p.name)
        .concat(createChoice + ". Create a new playlist")
        .join(String.fromCharCode(10));
      const chosen = window.prompt(
        ["Add to which playlist?", options, "", "Enter a number:"].join(String.fromCharCode(10))
      );
      if (chosen === null) return;
      const choice = Number(chosen);
      if (choice === createChoice) {
        playlist = await createPlaylistFromSong(user);
        if (!playlist) return;
      } else {
        playlist = playlists[choice - 1];
        if (!playlist) throw new Error("Enter a playlist number from the list.");
      }
    }

    const { error: insertError } = await supabaseClient.from("customer_playlist_songs").insert({ playlist_id: playlist.id, song_id: songId });
    if (insertError?.code === "23505") throw new Error("That song is already in this playlist.");
    if (insertError) throw insertError;
    if ($("favoriteSongs")) await renderLibrary();
    window.alert(`Added to “${playlist.name}”.`);
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
      window.alert(error.message || "Could not update your music library.");
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

