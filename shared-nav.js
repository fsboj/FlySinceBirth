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
  if (musicLink) { musicLink.textContent = "FSB"; musicLink.href = "my-fsb.html"; }
  const artistLink = document.getElementById("topnavArtist");
  if (artistLink) artistLink.textContent = "Artists";
  if (artistLink && !document.getElementById("topnavLibrary")) {
    const libraryLink = document.createElement("a");
    libraryLink.id = "topnavLibrary";
    libraryLink.href = "music.html";
    libraryLink.textContent = "Music";
    artistLink.insertAdjacentElement("afterend", libraryLink);
  }

  const accountLink = document.getElementById("topnavAccount");
  if (accountLink && !document.getElementById("topnavContact")) {
    const contactLink = document.createElement("a");
    contactLink.id = "topnavContact";
    contactLink.href = "account.html#supportForm";
    contactLink.textContent = "Contact FSB";
    accountLink.insertAdjacentElement("beforebegin", contactLink);
  }

  function markCurrentPage() {
    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const aliases = { "artist.html": "artists.html", "epalbum.html": "music.html", "video.html": "videos.html" };
    const current = aliases[file] || file;
    const isContact = file === "account.html" && location.hash === "#supportForm";
    document.querySelectorAll("#topnavHome, #topnavMusic, #topnavArtist, #topnavLibrary, #topnavShop, #topnavVideos, #topnavEvents, #topnavContact, #topnavAccount").forEach(function (link) {
      const target = (link.getAttribute("href") || "").split("#")[0].toLowerCase();
      if (target === current && (link.id === "topnavContact" ? isContact : link.id === "topnavAccount" ? !isContact : true)) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  function addSupportLink() {
    document.querySelectorAll("footer").forEach(function (footer) {
      if (footer.querySelector("[data-fsb-support-link]")) return;
      const link = document.createElement("a");
      link.href = "account.html#supportForm";
      link.textContent = "CONTACT FSB";
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
        if (link && value) link.textContent = item.key === "topnav_music" ? "FSB" : value;
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
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("width", "20");
    icon.setAttribute("height", "20");
    icon.setAttribute("aria-hidden", "true");
    icon.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M19 12H5m7-7-7 7 7 7");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute("stroke-width", "1.7");
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    icon.appendChild(path);
    button.appendChild(icon);
    button.addEventListener("click", function () {
      if (window.history.length > 1) window.history.back();
      else window.location.assign("index.html");
    });
    const style = document.createElement("style");
    style.textContent = ".fsb-nav-brand{display:flex;align-items:center;gap:12px;flex:0 0 auto}.fsb-back-button{appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;width:40px;height:40px;padding:0;border:1px solid rgba(255,255,255,.22);border-radius:50%;background:linear-gradient(145deg,rgba(255,255,255,.09),rgba(255,255,255,.025));color:#dedee2;box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 3px 10px rgba(0,0,0,.2);cursor:pointer;vertical-align:middle;touch-action:manipulation;transition:background .18s ease,border-color .18s ease,color .18s ease,box-shadow .18s ease,transform .18s ease}.fsb-back-button svg{display:block;pointer-events:none;transition:transform .18s ease}.fsb-back-button:focus-visible{outline:2px solid #fff;outline-offset:4px}.fsb-back-button:active{transform:scale(.94);box-shadow:inset 0 1px 4px rgba(0,0,0,.3)}@media(hover:hover){.fsb-back-button:hover{border-color:rgba(255,255,255,.5);background:linear-gradient(145deg,rgba(255,255,255,.16),rgba(255,255,255,.055));color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.12),0 4px 16px rgba(0,0,0,.28)}.fsb-back-button:hover svg{transform:translateX(-2px)}}@media(max-width:600px){.fsb-nav-brand{gap:9px}.fsb-back-button{width:36px;height:36px}.fsb-back-button svg{width:18px;height:18px}}@media(prefers-reduced-motion:reduce){.fsb-back-button,.fsb-back-button svg{transition:none}.fsb-back-button:hover svg,.fsb-back-button:active{transform:none}}";
    document.head.appendChild(style);
    const brand = document.createElement("div");
    brand.className = "fsb-nav-brand";
    logo.parentElement.insertBefore(brand, logo);
    brand.append(button, logo);
  }

  addBackButton();
  markCurrentPage();
  window.addEventListener("hashchange", markCurrentPage);
  addSupportLink();
  loadNavigationLabels();
})();



/* Readable, finger-sized navigation links on narrow screens. */
(()=>{const style=document.createElement('style');style.textContent='@media(max-width:760px){.public-nav-links{min-width:0;overflow-x:auto;overscroll-behavior-x:contain}.public-nav-links a{font-size:11px!important;min-height:44px;display:inline-flex;align-items:center;letter-spacing:1px}.public-nav .fsb-nav-brand{gap:8px}}';document.head.append(style);})();
