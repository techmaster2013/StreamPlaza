const STORAGE_KEY = "streamplaza-library-v1";

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

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown size";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function getId(file) {
  return [file.name, file.size, file.lastModified].join(":");
}

function render() {
  const query = searchInput.value.trim().toLowerCase();
  const filtered = library.filter(item => item.name.toLowerCase().includes(query));

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
      <div class="thumbnail">▶</div>
      <div class="card-info">
        <p class="card-title" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</p>
        <p class="card-meta">${formatBytes(item.size)} · MP4</p>
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
  const item = library.find(entry => entry.id === id);
  if (!item) return;

  activeVideo = item;

  if (!objectUrls.has(id)) {
    // The browser cannot recreate a File object after a reload.
    // Ask the user to add the file again for this session.
    alert("This video needs to be added again after a page reload. Persistent file storage is coming next.");
    return;
  }

  playerTitle.textContent = item.name;
  video.src = objectUrls.get(id);
  video.currentTime = item.position || 0;

  player.classList.remove("hidden");
  player.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";

  video.play().catch(() => {});
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
  saveLibrary();
});

video.addEventListener("ended", () => {
  if (!activeVideo) return;
  activeVideo.position = 0;
  saveLibrary();
  render();
});

closePlayer.addEventListener("click", closeVideo);
player.querySelector(".player-backdrop").addEventListener("click", closeVideo);

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && !player.classList.contains("hidden")) closeVideo();
});

searchInput.addEventListener("input", render);

clearBtn.addEventListener("click", () => {
  if (!library.length) return;
  if (!confirm("Clear your StreamPlaza library?")) return;

  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
  library = [];
  saveLibrary();
  render();
});

render();
