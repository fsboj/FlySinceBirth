(function () {
  const labels = {
    topnav_home: "topnavHome",
    topnav_music: "topnavMusic",
    topnav_artist: "topnavArtist",
    topnav_shop: "topnavShop",
    topnav_videos: "topnavVideos",
    topnav_events: "topnavEvents",
    topnav_account: "topnavAccount"
  };

  const musicLink = document.getElementById("topnavMusic");
  if (musicLink) musicLink.textContent = "My FSB";

  function markCurrentPage() {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const aliases = { "artist.html": "artists.html", "epalbum.html": "music.html", "video.html": "videos.html" };
    const current = aliases[file] || file;
    document.querySelectorAll("#topnavHome, #topnavMusic, #topnavArtist, #topnavShop, #topnavVideos, #topnavEvents, #topnavAccount").forEach(function (link) {
      const target = (link.getAttribute("href") || "").split("#")[0].toLowerCase();
      if (target === current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function addSupportLink() {
    document.querySelectorAll("footer").forEach(function (footer) {
      if (footer.querySelector("[data-fsb-support-link]")) return;
      const link = document.createElement("a");
      link.href = "account.html#supportForm";
      link.textContent = "CONTACT FSB SUPPORT";
      link.setAttribute("data-fsb-support-link", "true");
      link.style.color = "inherit";
      link.style.textDecoration = "underline";
      link.style.textUnderlineOffset = "3px";
      footer.appendChild(link);
    });
  }

  async function loadNavigationLabels() {
    const client = typeof supabaseClient !== "undefined" ? supabaseClient :
      (typeof musicSupabase !== "undefined" ? musicSupabase : null);
    if (!client) return;
    try {
      const { data, error } = await client
        .from("site_content")
        .select("key,value")
        .in("key", Object.keys(labels));
      if (error) throw error;
      (data || []).forEach(function (item) {
        const link = document.getElementById(labels[item.key]);
        const value = typeof item.value === "string" ? item.value.trim() : "";
        if (link && value) link.textContent = value;
      });
    } catch (error) {
      console.warn("Could not load shared navigation labels:", error);
    }
  }

  markCurrentPage();
  addSupportLink();
  loadNavigationLabels();
})();

