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


  function addBackButton() {
    const logo = document.querySelector(".public-nav .nav-logo");
    if (!logo || !logo.parentElement || document.getElementById("fsbBackButton")) return;
    const button = document.createElement("button");
    button.id = "fsbBackButton";
    button.type = "button";
    button.className = "fsb-back-button";
    button.setAttribute("aria-label", "Go back to the previous page");
    button.title = "Go back";
    button.textContent = "←";
    button.addEventListener("click", function () {
      if (window.history.length > 1) window.history.back();
      else window.location.assign("index.html");
    });
    const style = document.createElement("style");
    style.textContent = ".fsb-nav-brand{display:flex;align-items:center;gap:10px;flex:0 0 auto}.fsb-back-button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:36px;height:36px;padding:0;border:1px solid #555;border-radius:50%;background:transparent;color:inherit;font:24px/1 Arial,sans-serif;cursor:pointer;vertical-align:middle}.fsb-back-button:hover{border-color:currentColor;background:#ffffff12}.fsb-back-button:focus-visible{outline:2px solid currentColor;outline-offset:3px}";
    document.head.appendChild(style);
    const brand = document.createElement("div");
    brand.className = "fsb-nav-brand";
    logo.parentElement.insertBefore(brand, logo);
    brand.append(button, logo);
  }

  addBackButton();
  markCurrentPage();
  addSupportLink();
  loadNavigationLabels();
})();

