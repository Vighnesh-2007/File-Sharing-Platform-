(() => {
"use strict";

const SESSION_KEY = "fvCurrentUser";

let session;

try {
    session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
} catch {
    session = null;
}

// PROTECT DASHBOARD
if (!session || !session.email) {
    window.location.replace("./login.html");
    return;
}

const $ = id => document.getElementById(id);

const DB_NAME = "FileVaultProDB";
const MAX_STORAGE = 100 * 1024 * 1024;

let db;
let files = [];
let folders = [];
let activeView = "dashboard";
let activeFolder = null;
let selectedShareId = null;

let notifications = JSON.parse(
    localStorage.getItem("fvNotifications_" + session.email) || "[]"
);

// DATABASE
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onupgradeneeded = () => {
            if (!request.result.objectStoreNames.contains("files")) {
                request.result.createObjectStore("files", {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function getAll() {
    return new Promise((resolve, reject) => {
        const request = db.transaction("files").objectStore("files").getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function putFile(file) {
    return new Promise((resolve, reject) => {
        const request = db.transaction("files", "readwrite")
            .objectStore("files").put(file);

        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}

function deleteFile(id) {
    return new Promise((resolve, reject) => {
        const request = db.transaction("files", "readwrite")
            .objectStore("files").delete(id);

        request.onsuccess = resolve;
        request.onerror = () => reject(request.error);
    });
}

// LOAD USER FILES
async function refresh() {
    const all = await getAll();

    files = all.filter(file => file.owner === session.email);

    renderAll();
}

// FOLDERS
function loadFolders() {
    folders = JSON.parse(
        localStorage.getItem("fvFolders_" + session.email) || "[]"
    );
}

function saveFolders() {
    localStorage.setItem(
        "fvFolders_" + session.email,
        JSON.stringify(folders)
    );
}

// HELPERS
function toast(message) {
    const element = $("toast");

    element.textContent = message;
    element.classList.add("show");

    setTimeout(() => element.classList.remove("show"), 2500);
}

function formatBytes(bytes) {
    if (!bytes) return "0 B";

    const units = ["B", "KB", "MB", "GB"];
    const i = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        3
    );

    return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)
        + " " + units[i];
}

function category(file) {
    if (file.type?.startsWith("image/")) return "image";

    if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    ) return "pdf";

    if (
        /word|document|text|sheet|presentation/.test(file.type) ||
        /\.(docx?|txt|xlsx?|pptx?)$/i.test(file.name)
    ) return "document";

    return "other";
}

function activeFiles() {
    return files.filter(file => !file.trashed);
}

function addNotification(message) {
    notifications.unshift({
        text: message,
        time: new Date().toLocaleString()
    });

    notifications = notifications.slice(0, 30);

    localStorage.setItem(
        "fvNotifications_" + session.email,
        JSON.stringify(notifications)
    );
}

// UPLOAD
async function uploadFiles(fileList) {
    const incoming = Array.from(fileList || []);

    if (!incoming.length) return;

    const used = activeFiles().reduce(
        (sum, file) => sum + file.size,
        0
    );

    let remaining = MAX_STORAGE - used;
    let count = 0;

    for (const file of incoming) {
        if (file.size > remaining) {
            toast("100 MB storage limit reached.");
            continue;
        }

        const item = {
            id: crypto.randomUUID
                ? crypto.randomUUID()
                : String(Date.now() + Math.random()),

            owner: session.email,
            name: file.name,
            type: file.type,
            size: file.size,
            blob: file,
            createdAt: Date.now(),
            folderId: activeFolder,
            starred: false,
            trashed: false,
            shared: false
        };

        await putFile(item);

        remaining -= file.size;
        count++;
    }

    if (count) {
        addNotification(count + " file(s) uploaded");
        await refresh();
        toast(count + " file(s) uploaded");
    }
}

// STATISTICS
function renderStats() {
    const active = activeFiles();

    const used = active.reduce(
        (sum, file) => sum + file.size,
        0
    );

    $("totalFiles").textContent = active.length;
    $("totalFolders").textContent = folders.length;

    $("sharedFiles").textContent =
        active.filter(file => file.shared).length;

    $("storageUsed").textContent = formatBytes(used);

    $("storageText").textContent =
        formatBytes(used) + " of 100 MB used";

    $("storageBar").style.width =
        Math.min(100, used / MAX_STORAGE * 100) + "%";
}

// FOLDERS DISPLAY
function renderFolders() {
    const list = $("folderList");
    list.innerHTML = "";

    if (!folders.length) {
        list.innerHTML =
            '<p class="empty-state">No folders yet. Create your first folder.</p>';
        return;
    }

    folders.forEach(folder => {
        const count = activeFiles().filter(
            file => file.folderId === folder.id
        ).length;

        const button = document.createElement("button");
        button.className = "folder-card";

        button.innerHTML = `
            <span class="folder-emoji">📁</span>
            <span class="folder-info">
                <b></b>
                <small>${count} files</small>
            </span>
            <span class="folder-more">›</span>
        `;

        button.querySelector("b").textContent = folder.name;

        button.addEventListener("click", () => {
            activeView = "folder";
            activeFolder = folder.id;

            $("pageTitle").textContent = folder.name;
            $("dashboardHero").style.display = "none";

            renderFiles();
        });

        list.appendChild(button);
    });
}

// PAGE TITLE
function viewTitle() {
    const titles = {
        dashboard: "Dashboard",
        all: "My Files",
        shared: "Shared Files",
        recent: "Recent Files",
        starred: "Starred",
        trash: "Trash",
        settings: "Settings"
    };

    if (activeView === "folder") {
        return folders.find(f => f.id === activeFolder)?.name || "Folder";
    }

    return titles[activeView] || "My Files";
}

// FILE DISPLAY
function renderFiles() {
    const list = $("fileList");
    list.innerHTML = "";

    let shown = files.filter(file => {
        if (activeView === "trash") return file.trashed;

        if (file.trashed) return false;

        if (activeView === "shared") return file.shared;
        if (activeView === "starred") return file.starred;

        if (activeView === "folder") {
            return file.folderId === activeFolder;
        }

        return true;
    });

    if (activeView === "recent" || activeView === "dashboard") {
        shown.sort((a, b) => b.createdAt - a.createdAt);
    }

    const query = $("searchInput").value.trim().toLowerCase();

    if (query) {
        shown = shown.filter(file =>
            file.name.toLowerCase().includes(query)
        );
    }

    const type = $("typeFilter").value;

    if (type !== "all") {
        shown = shown.filter(file => category(file) === type);
    }

    const sort = $("sortSelect").value;

    if (sort === "newest") shown.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === "oldest") shown.sort((a, b) => a.createdAt - b.createdAt);
    if (sort === "name") shown.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "size") shown.sort((a, b) => b.size - a.size);

    $("fileHeading").textContent =
        activeView === "dashboard" ? "Recent Files" : viewTitle();

    $("fileSubheading").textContent = shown.length + " file(s)";

    if (!shown.length) {
        list.innerHTML =
            '<div class="empty-state">No files found in this section.</div>';
        return;
    }

    shown.forEach(file => {
        const card = document.createElement("article");
        card.className = "file-card";

        let symbol = "📦";

        if (category(file) === "image") symbol = "🖼️";
        if (category(file) === "pdf") symbol = "📕";
        if (category(file) === "document") symbol = "📄";

        card.innerHTML = `
            <div class="file-top">
                <span class="file-symbol">${symbol}</span>
                <button class="more-btn">•••</button>
            </div>
            <b class="file-name"></b>
            <small>${formatBytes(file.size)} ·
                ${new Date(file.createdAt).toLocaleDateString()}
            </small>
            <div class="file-actions"></div>
        `;

        card.querySelector(".file-name").textContent = file.name;

        const actions = card.querySelector(".file-actions");

        function addAction(name, callback) {
            const button = document.createElement("button");
            button.textContent = name;
            button.addEventListener("click", callback);
            actions.appendChild(button);
        }

        if (file.trashed) {
            addAction("Restore", async () => {
                file.trashed = false;
                await putFile(file);
                addNotification(file.name + " restored");
                await refresh();
            });

            addAction("Delete Forever", async () => {
                if (confirm("Permanently delete this file?")) {
                    await deleteFile(file.id);
                    await refresh();
                    toast("File permanently deleted");
                }
            });
        } else {
            addAction("Preview", () => preview(file));
            addAction("Download", () => download(file));

            addAction(file.starred ? "Unstar" : "Star", async () => {
                file.starred = !file.starred;
                await putFile(file);
                await refresh();
            });

            addAction("Share", () => openShare(file));

            addAction("Trash", async () => {
                file.trashed = true;
                await putFile(file);
                addNotification(file.name + " moved to Trash");
                await refresh();
            });
        }

        card.querySelector(".more-btn").addEventListener("click", () => {
            card.classList.toggle("expanded");
        });

        list.appendChild(card);
    });
}

function renderAll() {
    renderStats();
    renderFolders();
    renderFiles();
}

// PREVIEW
function preview(file) {
    $("previewTitle").textContent = file.name;

    const area = $("previewContent");
    area.innerHTML = "";

    if (file.type.startsWith("image/")) {
        const img = document.createElement("img");
        img.src = URL.createObjectURL(file.blob);
        area.appendChild(img);
    } else if (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
    ) {
        const frame = document.createElement("iframe");
        frame.src = URL.createObjectURL(file.blob);
        area.appendChild(frame);
    } else if (
        file.type.startsWith("text/") ||
        /\.(txt|csv|json|md)$/i.test(file.name)
    ) {
        const pre = document.createElement("pre");

        file.blob.text().then(text => {
            pre.textContent = text;
        });

        area.appendChild(pre);
    } else {
        area.textContent =
            "Preview is unavailable for this file type. Please download it.";
    }

    showModal("previewModal");
}

// DOWNLOAD
function download(file) {
    const url = URL.createObjectURL(file.blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = file.name;
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// MODALS
function showModal(id) {
    $(id).classList.add("open");
}

function hideModal(modal) {
    modal.classList.remove("open");
}

// SHARE
function openShare(file) {
    selectedShareId = file.id;
    $("shareLink").value = "";
    $("sharePermission").value = file.permission || "viewer";

    showModal("shareModal");
}

$("generateLinkBtn").addEventListener("click", async () => {
    const file = files.find(f => f.id === selectedShareId);

    if (!file) return;

    file.shared = true;
    file.permission = $("sharePermission").value;

    file.shareExpires =
        Date.now() + Number($("shareExpiry").value) * 86400000;

    await putFile(file);

    $("shareLink").value =
        location.href.split("?")[0] +
        "?demo-share=" + encodeURIComponent(file.id);

    addNotification("Sharing enabled for " + file.name);

    await refresh();

    toast("Demo sharing link generated");
});

$("copyLinkBtn").addEventListener("click", async () => {
    if (!$("shareLink").value) {
        toast("Generate a link first");
        return;
    }

    try {
        await navigator.clipboard.writeText($("shareLink").value);
        toast("Link copied");
    } catch {
        $("shareLink").select();
        document.execCommand("copy");
        toast("Link copied");
    }
});

// SIDEBAR NAVIGATION
document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach(item => {
            item.classList.remove("active");
        });

        button.classList.add("active");

        activeView = button.dataset.view;
        activeFolder = null;

        $("pageTitle").textContent = viewTitle();

        $("dashboardHero").style.display =
            activeView === "dashboard" ? "flex" : "none";

        $("sidebar").classList.remove("show");

        if (activeView === "settings") {
            $("profileName").value = session.name || "";
            $("accountEmail").textContent = session.email;
            showModal("settingsModal");
        }

        renderFiles();
    });
});

// UPLOAD BUTTONS
$("browseBtn").addEventListener("click", () => $("fileInput").click());

$("heroUpload").addEventListener("click", () => $("fileInput").click());

$("fileInput").addEventListener("change", event => {
    uploadFiles(event.target.files);
    event.target.value = "";
});

// DRAG AND DROP
const dropZone = $("dropZone");

["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.add("dragover");
    });
});

["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, event => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
    });
});

dropZone.addEventListener("drop", event => {
    uploadFiles(event.dataTransfer.files);
});

// CREATE FOLDER
$("newFolderBtn").addEventListener("click", () => {
    const name = prompt("Enter folder name:");

    if (!name || !name.trim()) return;

    if (folders.some(f => f.name.toLowerCase() === name.trim().toLowerCase())) {
        toast("Folder already exists");
        return;
    }

    folders.push({
        id: crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        name: name.trim()
    });

    saveFolders();
    renderAll();

    addNotification("Folder created: " + name.trim());
});

// SEARCH AND FILTER
$("searchInput").addEventListener("input", renderFiles);
$("typeFilter").addEventListener("change", renderFiles);
$("sortSelect").addEventListener("change", renderFiles);

// DARK MODE
$("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");

    localStorage.setItem(
        "fvTheme_" + session.email,
        document.body.classList.contains("dark") ? "dark" : "light"
    );
});

if (localStorage.getItem("fvTheme_" + session.email) === "dark") {
    document.body.classList.add("dark");
}

// NOTIFICATIONS
$("notificationBtn").addEventListener("click", () => {
    const box = $("notificationList");
    box.innerHTML = "";

    if (!notifications.length) {
        box.textContent = "No notifications yet.";
    } else {
        notifications.forEach(item => {
            const p = document.createElement("p");
            p.textContent = item.text + " — " + item.time;
            box.appendChild(p);
        });
    }

    showModal("notificationModal");
});

// SETTINGS
$("saveSettingsBtn").addEventListener("click", () => {
    const name = $("profileName").value.trim();

    if (!name) {
        toast("Enter your name");
        return;
    }

    session.name = name;

    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    $("avatar").textContent = name.charAt(0).toUpperCase();

    toast("Settings saved");

    hideModal($("settingsModal"));
});

// LOGOUT
$("logoutBtn").addEventListener("click", () => {
    if (confirm("Are you sure you want to logout?")) {
        localStorage.removeItem(SESSION_KEY);
        window.location.href = "./login.html";
    }
});

// MOBILE MENU
$("mobileMenu").addEventListener("click", () => {
    $("sidebar").classList.toggle("show");
});

// CLOSE MODALS
document.querySelectorAll(".close-modal").forEach(button => {
    button.addEventListener("click", () => {
        hideModal(button.closest(".modal"));
    });
});

document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
        if (event.target === modal) {
            hideModal(modal);
        }
    });
});

// USER DETAILS
$("avatar").textContent = (session.name || "U").charAt(0).toUpperCase();

// START APPLICATION
(async () => {
    try {
        db = await openDB();

        loadFolders();

        await refresh();

    } catch (error) {
        console.error(error);
        toast("Unable to open file storage. Try Chrome with Live Server.");
    }
})();

})();