const STORAGE_KEY = "streamplaza-library-v1";
const PRELOADED_PREFIX = "preloaded:";

const videoInput = document.querySelector("#videoInput");
const libraryEl = document.querySelector("#library");
const emptyState = document.querySelector("#emptyState");
const searchInput = document.querySelector("#searchInput");
const clearBtn = document.querySelector("#clearBtn");
const player = document.querySelector("#player");
const video = document.querySelector("#video");
const playerTitle = document.querySelector("#playerTitle");
const closePlayer = document.querySelector("#closePlayer");

let library = loadLibrary();
let activeVideo = null;
let objectUrls = new Map();
let preloadedVideos = [];

function loadLibrary() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLibrary() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
}

async function loadPreloadedVideos() {
  try {
    const response = await fetch("videos/manifest.json", { cache: "no-store" });
    if (!response.ok) throw new Error("manifest not found");

    const manifest = await response.json();

    preloadedVideos = Array.isArray(manifest)
      ? manifest
          .filter(item => item && typeof item.name === "string" && typeof item.src === "string")
          .map(item => ({
            id: PRELOADED_PREFIX + item.src,
            name: item.name,
            size: Number(item.size) || 0,
            position: 0,
            duration: 0,
            src: item.src,
            preloaded: true
          }))
      : [];

    for (const item of preloadedVideos) {
      const saved = library.find(entry => entry.id === item.id);
      if (saved) {
        item.position = saved.position || 0;
        item.duration = saved.duration || 0;
      }
    }

    render();
  } catch {
    preloadedVideos = [];
  }
}

function getAllVideos() {
  const localVideos = library.filter(item => !item.preloaded);
  return [...preloadedVideos, ...localVideos];
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function getId(file) {
  return [file.name, file.size, file.lastModified].join(":");
}

function getVideoSource(item) {
  if (item.preloaded) return item.src;
  return objectUrls.get(item.id) || null;
}

function makeThumbnail(item, thumbnailEl) {
  const src = getVideoSource(item);
  if (!src) return;

  const thumbVideo = document.createElement("video");
  thumbVideo.muted = true;
  thumbVideo.preload = "metadata";
  thumbVideo.playsInline = true;
  thumbVideo.src = src;

  const cleanup = () => {
    thumbVideo.pause();
    thumbVideo.removeAttribute("src");
    thumbVideo.load();
  };

  thumbVideo.addEventListener("loadedmetadata", () => {
    const seekTime = Number.isFinite(thumbVideo.duration)
      ? Math.min(2, Math.max(0, thumbVideo.duration / 3))
      : 0;

    if (seekTime === 0) {
      capture();
    } else {
      thumbVideo.currentTime = seekTime;
    }
  }, { once: true });

  thumbVideo.addEventListener("seeked", capture, { once: true });
  thumbVideo.addEventListener("error", cleanup, { once: true });

  function capture() {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;

      const context = canvas.getContext("2d");
      context.drawImage(thumbVideo, 0, 0, canvas.width, canvas.height);

      thumbnailEl.innerHTML = "";
      const image = document.createElement("img");
      image.src = canvas.toDataURL("image/jpeg", 0.78);
      image.alt = `Thumbnail for ${item.name}`;
      thumbnailEl.appendChild(image);
    } catch {
      // Keep the gradient fallback if thumbnail generation fails.
    } finally {
      cleanup();
    }
  }
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const allVideos = getAllVideos();
  const filtered = allVideos.filter(item => item.name.toLowerCase().includes(query));

  libraryEl.innerHTML = "";
  emptyState.style.display = filtered.length ? "none" : "block";

  for (const item of filtered) {
    const card = document.createElement("article");
    card.className = "video-card";
    card.tabIndex = 0;

    const progress = item.duration > 0
      ? Math.min(100, (item.position / item.duration) * 100)
      : 0;

    card.innerHTML = `
      <div class="thumbnail"><span>▶</span></div>
      <div class="card-info">
        <p class="card-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
        <p class="card-meta">${formatBytes(item.size)} · ${item.preloaded ? "Built-in" : "Local"}</p>
        <div class="progress"><div style="width:${progress}%"></div></div>
      </div>
    `;

    card.addEventListener("click", () => playItem(item.id));
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        playItem(item.id);
      }
    });

    libraryEl.appendChild(card);
    makeThumbnail(item, card.querySelector(".thumbnail"));
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[char]);
}

videoInput.addEventListener("change", event => {
  const files = [...event.target.files];

  for (const file of files) {
    if (!file.type.startsWith("video/")) continue;

    const id = getId(file);
    if (library.some(item => item.id === id)) continue;

    library.push({
      id,
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
      position: 0,
      duration: 0
    });

    objectUrls.set(id, URL.createObjectURL(file));
  }

  saveLibrary();
  render();
  videoInput.value = "";
});

function playItem(id) {
  const item = getAllVideos().find(entry => entry.id === id);
  if (!item) return;

  activeVideo = item;

  if (item.preloaded) {
    playerTitle.textContent = item.name;
    video.src = item.src;
  } else {
    if (!objectUrls.has(id)) {
      alert("This video needs to be added again after a page reload. Persistent file storage is coming next.");
      return;
    }

    playerTitle.textContent = item.name;
    video.src = objectUrls.get(id);
  }

  player.classList.remove("hidden");
  player.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  video.play().catch(() => {});
}

function saveProgress(item) {
  if (!item) return;

  if (item.preloaded) {
    const saved = library.find(entry => entry.id === item.id);
    if (saved) {
      saved.position = item.position;
      saved.duration = item.duration;
    } else {
      library.push({
        id: item.id,
        name: item.name,
        position: item.position,
        duration: item.duration,
        preloaded: true
      });
    }
  }

  saveLibrary();
}

function closeVideo() {
  video.pause();
  video.removeAttribute("src");
  video.load();
  player.classList.add("hidden");
  player.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
  activeVideo = null;
}

video.addEventListener("loadedmetadata", () => {
  if (!activeVideo) return;
  activeVideo.duration = Number.isFinite(video.duration) ? video.duration : 0;
  video.currentTime = Math.min(activeVideo.position || 0, Math.max(0, video.duration - 0.25));
});

video.addEventListener("timeupdate", () => {
  if (!activeVideo) return;
  activeVideo.position = video.currentTime;
  saveProgress(activeVideo);
});

video.addEventListener("ended", () => {
  if (!activeVideo) return;
  activeVideo.position = 0;
  saveProgress(activeVideo);
  render();
});

closePlayer.addEventListener("click", closeVideo);
player.querySelector(".player-backdrop").addEventListener("click", closeVideo);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !player.classList.contains("hidden")) closeVideo();
});

searchInput.addEventListener("input", render);

clearBtn.addEventListener("click", () => {
  const localVideos = library.filter(item => !item.preloaded);
  if (!localVideos.length) return;
  if (!confirm("Clear your locally added StreamPlaza videos?")) return;

  for (const url of objectUrls.values()) {
    URL.revokeObjectURL(url);
  }

  objectUrls.clear();
  library = library.filter(item => item.preloaded);
  saveLibrary();
  render();
});

render();
loadPreloadedVideos();
