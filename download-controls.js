/* Shared download links for public FSB audio and uploaded video files. */
(function () {
  const allowedExtensions = /\.(mp3|m4a|aac|wav|flac|ogg|opus|mp4|m4v|mov|webm)(?:$)/i;
  const supabaseStoragePath = /\/storage\/v1\/object\/(?:public|sign|authenticated)\//i;
  const styles = document.createElement("style");
  styles.textContent = ".fsb-download-link{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:9px 12px;border:1px solid #555;background:#101010;color:#fff;text-decoration:none;font:700 9px/1 Arial,Helvetica,sans-serif;letter-spacing:1px;white-space:nowrap;cursor:pointer}.fsb-download-link:hover{border-color:#fff;background:#fff;color:#000}.fsb-download-icon{width:30px;height:30px;padding:0;border-radius:50%;font-size:17px;letter-spacing:0}.fsb-download-row{display:inline-flex;align-items:center;gap:8px;margin-top:8px}";
  document.head.appendChild(styles);

  function safeBaseName(value) {
    return String(value || "fsb-download")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 72) || "fsb-download";
  }

  function buildDownloadInfo(rawUrl, title, mediaType) {
    if (!rawUrl) return null;
    let url;
    try { url = new URL(rawUrl, location.href); } catch (_) { return null; }
    if (!/^https?:$/.test(url.protocol)) return null;

    const storageFile = url.hostname.endsWith(".supabase.co") && supabaseStoragePath.test(url.pathname);
    const sameOriginFile = url.origin === location.origin && allowedExtensions.test(url.pathname);
    if (!storageFile && !sameOriginFile) return null;

    const extMatch = url.pathname.match(/\.[a-z0-9]{2,8}$/i);
    const fallbackExt = mediaType === "video" ? ".mp4" : ".mp3";
    const extension = extMatch ? extMatch[0].toLowerCase() : fallbackExt;
    const filename = safeBaseName(title) + extension;
    if (storageFile) url.searchParams.set("download", filename);
    return { href: url.href, filename };
  }

  function createDownloadLink(rawUrl, title, mediaType, compact) {
    const info = buildDownloadInfo(rawUrl, title, mediaType);
    if (!info) return null;
    const link = document.createElement("a");
    link.className = "fsb-download-link" + (compact ? " fsb-download-icon" : "");
    link.href = info.href;
    link.download = info.filename;
    link.setAttribute("aria-label", "Download " + (title || (mediaType === "video" ? "video" : "song")));
    link.title = "Download " + (title || (mediaType === "video" ? "video" : "song"));
    link.textContent = compact ? "↓" : "DOWNLOAD";
    link.addEventListener("click", (event) => event.stopPropagation());
    link.addEventListener("keydown", (event) => event.stopPropagation());
    return link;
  }

  window.fsbBuildDownloadInfo = buildDownloadInfo;
  window.fsbCreateDownloadLink = createDownloadLink;
})();