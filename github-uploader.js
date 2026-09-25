(function(){
  "use strict";

  function escHtml(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  var API = "https://api.github.com";
  var els = {};
  ["loadingScreen","connectScreen","tokenInput","showTokenBtn","connectBtn","connectStatus","mainApp",
   "userChip","repoSelect","branchSelect","disconnectBtn","topStatus",
   "breadcrumb","ghList","emptyGh","currentFolderZone",
   "addFilesBtn","fileInput","fileList","emptyFiles","ghostCard","toastHost",
   "commitsBtn","commitsDrawer","commitsList","commitsClose",
   "pendingBar","pendingLabel","clearPendingBtn","pushBtn","pendingDrawer","pendingHead","pendingList","pendingClose",
   "repoFilter","newBranchBtn","prBtn","ghFileFilter",
   "moreBtn","moreBackdrop","moreDrawer","moreClose","newRepoBtn",
   "visitPagesLink","visitVercelLink","publishPagesBtn","deployVercelBtn","publishStatus",
   "downloadZipBtn","inviteBtn","disconnectVercelBtn",
   "collabBtn","collabDrawer","collabHead","collabList","collabClose","unpublishPagesBtn",
   "diffDrawer","diffHead","diffTitle","diffBody","diffClose",
   "undoBtn","redoBtn"
  ].forEach(function(id){ els[id] = document.getElementById(id); });

  function showScreen(name){
    els.loadingScreen.style.display = name === "loading" ? "flex" : "none";
    els.connectScreen.style.display = name === "connect" ? "block" : "none";
    els.mainApp.style.display = name === "app" ? "flex" : "none";
  }
  function showToast(msg, kind){
    var t = document.createElement("div");
    t.className = "toast" + (kind ? " " + kind : "");
    t.textContent = msg;
    els.toastHost.appendChild(t);
    setTimeout(function(){ t.remove(); }, 3800);
  }

  var TOKEN_KEY = "ghUploader.token";
  var STATE_KEY = "ghUploader.state.v1";
  var SHARED_REPO_KEY = "modev.sharedRepo.v1";
  function saveSharedRepo(owner, repo, branch){
    if (!owner || !repo) return;
    try{ localStorage.setItem(SHARED_REPO_KEY, JSON.stringify({owner:owner, repo:repo, branch:branch||null})); }catch(e){}
  }
  function loadSharedRepo(){
    try{ return JSON.parse(localStorage.getItem(SHARED_REPO_KEY)) || null; }catch(e){ return null; }
  }

  var state = {
    token: null, username: null, avatar: null,
    owner: null, repo: null, branch: null,
    path: "", // current folder path within repo
    files: []  // { id, file, status: 'ready'|'uploading'|'done'|'error', msg }
  };
  var fileIdSeq = 1;

  function loadSaved(){ try{ return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }catch(e){ return {}; } }
  function saveState(){
    try{ localStorage.setItem(STATE_KEY, JSON.stringify({ owner:state.owner, repo:state.repo, branch:state.branch, path:state.path })); }catch(e){}
    saveSharedRepo(state.owner, state.repo, state.branch);
  }

  function setTopStatus(msg, kind){
    els.topStatus.textContent = msg || "";
    els.topStatus.className = kind || "";
  }
  function setConnectStatus(msg, kind){
    els.connectStatus.textContent = msg || "";
    els.connectStatus.className = kind || "";
  }

  function ghHeaders(){
    return { "Authorization": "token " + state.token, "Accept": "application/vnd.github+json" };
  }
  function encodeApiPath(path){
    return path.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  }

  // ------------------------------------------------------------------
  // Auth
  // ------------------------------------------------------------------
  els.showTokenBtn.addEventListener("click", function(){
    els.tokenInput.type = els.tokenInput.type === "password" ? "text" : "password";
  });

  function connectWithToken(token){
    setConnectStatus("Checking token…");
    return fetch(API + "/user", { headers: { "Authorization": "token " + token } })
      .then(function(res){
        if (!res.ok){
          if (res.status === 401) throw new Error("That token was rejected — check it was copied fully and has the 'repo' scope.");
          throw new Error("GitHub returned " + res.status + " — try again.");
        }
        return res.json();
      })
      .then(function(user){
        state.token = token; state.username = user.login; state.avatar = user.avatar_url;
        try{ localStorage.setItem(TOKEN_KEY, token); }catch(e){}
        setConnectStatus("Connected as " + user.login, "ok");
        showApp();
        loadRepos();
        return true;
      })
      .catch(function(err){
        setConnectStatus(err.message, "err");
        showScreen("connect");
        return false;
      });
  }

  els.connectBtn.addEventListener("click", function(){
    var t = els.tokenInput.value.trim();
    if (!t){ setConnectStatus("Paste a token first.", "err"); return; }
    connectWithToken(t);
  });
  els.tokenInput.addEventListener("keydown", function(e){ if (e.key === "Enter") els.connectBtn.click(); });

  els.disconnectBtn.addEventListener("click", function(){
    try{ localStorage.removeItem(TOKEN_KEY); }catch(e){}
    state.token = null;
    els.tokenInput.value = "";
    setConnectStatus("Disconnected.", "");
    showScreen("connect");
  });

  function renderUserChip(){
    els.userChip.innerHTML = "";
    if (state.avatar){
      var img = document.createElement("img");
      img.src = state.avatar;
      els.userChip.appendChild(img);
      els.userChip.appendChild(document.createTextNode(" " + state.username));
    } else {
      els.userChip.textContent = state.username;
    }
  }
  function showApp(){
    showScreen("app");
    renderUserChip();
  }

  // ------------------------------------------------------------------
  // Repos / branches / folder listing
  // ------------------------------------------------------------------
  var allRepos = [];
  function renderRepoOptions(repos, keepValue){
    els.repoSelect.innerHTML = '<option value="">Select repo…</option>';
    repos.forEach(function(r){
      var opt = document.createElement("option");
      opt.value = r.full_name;
      opt.textContent = r.full_name;
      opt._repo = r;
      els.repoSelect.appendChild(opt);
    });
    if (keepValue && repos.some(function(r){ return r.full_name === keepValue; })) els.repoSelect.value = keepValue;
  }
  els.repoFilter.addEventListener("input", function(){
    var q = els.repoFilter.value.trim().toLowerCase();
    var filtered = q ? allRepos.filter(function(r){ return r.full_name.toLowerCase().indexOf(q) !== -1; }) : allRepos;
    renderRepoOptions(filtered, state.owner && state.repo ? state.owner + "/" + state.repo : null);
  });

  function loadRepos(){
    setTopStatus("Loading repos…");
    return fetch(API + "/user/repos?per_page=100&sort=updated", { headers: ghHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(repos){
        allRepos = repos;
        renderRepoOptions(repos);
        setTopStatus(repos.length + " repos loaded", "ok");

        var saved = loadSaved();
        var shared = loadSharedRepo();
        var targetOwner, targetRepo, targetBranch, targetPath = "";
        if (shared && shared.owner && shared.repo){
          targetOwner = shared.owner; targetRepo = shared.repo; targetBranch = shared.branch;
          // Only reuse this tab's own remembered path if it was left in this SAME
          // repo — if the repo was switched elsewhere, start fresh at the repo root.
          if (saved.owner === shared.owner && saved.repo === shared.repo) targetPath = saved.path || "";
        } else if (saved.owner && saved.repo){
          targetOwner = saved.owner; targetRepo = saved.repo; targetBranch = saved.branch;
          targetPath = saved.path || "";
        }
        if (targetOwner && targetRepo){
          var fullName = targetOwner + "/" + targetRepo;
          if (repos.some(function(r){ return r.full_name === fullName; })){
            els.repoSelect.value = fullName;
            selectRepo(fullName, targetBranch, targetPath);
          }
        }
        return repos;
      })
      .catch(function(err){ setTopStatus("Couldn't load repos: " + err.message, "err"); return []; });
  }

  els.repoSelect.addEventListener("change", function(){
    if (els.repoSelect.value) selectRepo(els.repoSelect.value);
  });

  function selectRepo(fullName, preferBranch, preferPath){
    var parts = fullName.split("/");
    state.owner = parts[0]; state.repo = parts[1]; state.path = preferPath || "";
    setTopStatus("Loading branches…");
    fetch(API + "/repos/" + fullName + "/branches?per_page=100", { headers: ghHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(branches){
        els.branchSelect.innerHTML = "";
        branches.forEach(function(b){
          var opt = document.createElement("option");
          opt.value = b.name; opt.textContent = b.name;
          els.branchSelect.appendChild(opt);
        });
        var target = (preferBranch && branches.some(function(b){return b.name===preferBranch;})) ? preferBranch : (branches[0] && branches[0].name);
        if (target){ els.branchSelect.value = target; state.branch = target; }
        saveState();
        loadFolder(state.path);
        refreshPublishLinks();
      })
      .catch(function(err){ setTopStatus("Couldn't load branches: " + err.message, "err"); });
  }

  // ------------------------------------------------------------------
  // Publish — GitHub Pages (native GitHub feature) + Vercel (separate
  // service, same token-based pattern as GitHub: paste a Vercel Access
  // Token once, it's remembered like the GitHub token is).
  // ------------------------------------------------------------------
  var VERCEL_TOKEN_KEY = "vercelUploader.token";
  function repoKey(){ return state.owner + "/" + state.repo; }
  function getUrlMap(key){ try{ return JSON.parse(localStorage.getItem(key) || "{}"); }catch(e){ return {}; } }
  function setUrlFor(key, url){
    var map = getUrlMap(key); map[repoKey()] = url;
    try{ localStorage.setItem(key, JSON.stringify(map)); }catch(e){}
  }
  function setPagesButtonState(connected){
    els.publishPagesBtn.style.display = connected ? "none" : "";
    els.unpublishPagesBtn.style.display = connected ? "" : "none";
  }
  function refreshPublishLinks(){
    els.visitPagesLink.style.display = "none";
    els.visitVercelLink.style.display = "none";
    setPagesButtonState(false);
    var vercelMap = getUrlMap("ghUploader.vercelUrls");
    if (vercelMap[repoKey()]){ els.visitVercelLink.href = vercelMap[repoKey()]; els.visitVercelLink.style.display = "flex"; }
    // GitHub Pages: check live, since it can be enabled/disabled outside this tool too.
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/pages", { headers: ghHeaders() })
      .then(function(r){ return r.status === 200 ? r.json() : null; })
      .then(function(data){
        if (data && data.html_url){
          setUrlFor("ghUploader.pagesUrls", data.html_url);
          els.visitPagesLink.href = data.html_url;
          els.visitPagesLink.style.display = "flex";
          setPagesButtonState(true);
        } else {
          setPagesButtonState(false);
        }
      })
      .catch(function(){});
  }

  els.publishPagesBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo || !state.branch){ setTopStatus("Pick a repo and branch first.", "err"); return; }
    els.publishStatus.textContent = "Checking Pages status…";
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/pages", { headers: ghHeaders() })
      .then(function(r){
        if (r.status === 200) return r.json();
        if (r.status === 404){
          els.publishStatus.textContent = "Enabling Pages…";
          return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/pages", {
            method: "POST",
            headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
            body: JSON.stringify({ source: { branch: state.branch, path: "/" } })
          }).then(function(res){
            if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); });
            return res.json();
          });
        }
        throw new Error("GitHub error " + r.status);
      })
      .then(function(data){
        var url = data.html_url || ("https://" + state.owner + ".github.io/" + state.repo + "/");
        setUrlFor("ghUploader.pagesUrls", url);
        els.visitPagesLink.href = url; els.visitPagesLink.style.display = "flex";
        els.publishStatus.textContent = "Live at " + url;
        setPagesButtonState(true);
        showToast("Published to GitHub Pages", "ok");
      })
      .catch(function(err){
        els.publishStatus.textContent = "Publish failed: " + err.message;
        showToast("GitHub Pages publish failed", "err");
      });
  });

  els.deployVercelBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo || !state.branch){ setTopStatus("Pick a repo and branch first.", "err"); return; }
    var token = null;
    try{ token = localStorage.getItem(VERCEL_TOKEN_KEY); }catch(e){}
    if (!token){
      token = prompt("Paste a Vercel Access Token (vercel.com → Settings → Tokens):", "");
      if (!token) return;
      token = token.trim();
      try{ localStorage.setItem(VERCEL_TOKEN_KEY, token); }catch(e){}
    }
    els.publishStatus.textContent = "Reading repo files…";
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/git/trees/" + encodeURIComponent(state.branch) + "?recursive=1", { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("Couldn't read repo tree"); return r.json(); })
      .then(function(treeData){
        var blobs = (treeData.tree || []).filter(function(t){ return t.type === "blob" && t.size < 5000000; });
        if (!blobs.length) throw new Error("No files found to deploy");
        els.publishStatus.textContent = "Uploading " + blobs.length + " file(s) to Vercel…";
        return Promise.all(blobs.map(function(b){
          return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/git/blobs/" + b.sha, { headers: ghHeaders() })
            .then(function(r){ return r.json(); })
            .then(function(blobData){ return { file: b.path, data: (blobData.content || "").replace(/\n/g, ""), encoding: "base64" }; });
        }));
      })
      .then(function(files){
        var projectName = state.repo.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "") || "modev-site";
        return fetch("https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
          body: JSON.stringify({ name: projectName, files: files, target: "production", projectSettings: { framework: null } })
        });
      })
      .then(function(res){
        return res.json().then(function(d){
          if (!res.ok) throw new Error((d.error && d.error.message) || "Vercel deploy failed");
          return d;
        });
      })
      .then(function(deployment){
        var url = "https://" + deployment.url;
        setUrlFor("ghUploader.vercelUrls", url);
        els.visitVercelLink.href = url; els.visitVercelLink.style.display = "flex";
        els.publishStatus.textContent = "Deployed: " + url;
        showToast("Deployed to Vercel", "ok");
      })
      .catch(function(err){
        els.publishStatus.textContent = "Vercel deploy failed: " + err.message;
        showToast("Vercel deploy failed", "err");
      });
  });

  els.branchSelect.addEventListener("change", function(){
    state.branch = els.branchSelect.value; state.path = "";
    saveState(); loadFolder("");
  });

  els.newBranchBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo || !state.branch){ setTopStatus("Pick a repo first.", "err"); return; }
    var name = prompt("New branch name (branched from \"" + state.branch + "\"):", "");
    if (!name) return;
    name = name.trim().replace(/\s+/g, "-");
    setTopStatus("Creating branch…");
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/branches/" + encodeURIComponent(state.branch), { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("Couldn't read source branch"); return r.json(); })
      .then(function(branchData){
        return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/git/refs", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
          body: JSON.stringify({ ref: "refs/heads/" + name, sha: branchData.commit.sha })
        });
      })
      .then(function(res){ if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); }); return res.json(); })
      .then(function(){
        showToast("Branch \"" + name + "\" created", "ok");
        selectRepo(state.owner + "/" + state.repo, name, "");
      })
      .catch(function(err){ setTopStatus("Branch creation failed: " + err.message, "err"); showToast("Branch creation failed", "err"); });
  });

  els.prBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo || !state.branch){ setTopStatus("Pick a repo first.", "err"); return; }
    fetch(API + "/repos/" + state.owner + "/" + state.repo, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("Couldn't read repo details"); return r.json(); })
      .then(function(repoData){
        var base = repoData.default_branch;
        if (base === state.branch){ setTopStatus("Already on the default branch (" + base + ") — switch to a feature branch first.", "err"); return; }
        var title = prompt("Pull request title:", "Update from Modev Suite");
        if (!title) return;
        setTopStatus("Opening PR…");
        return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/pulls", {
          method: "POST",
          headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
          body: JSON.stringify({ title: title, head: state.branch, base: base })
        }).then(function(res){ if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); }); return res.json(); })
          .then(function(pr){
            showToast("PR #" + pr.number + " opened against " + base, "ok");
            setTopStatus("PR #" + pr.number + ": " + pr.html_url, "ok");
          });
      })
      .catch(function(err){ setTopStatus("PR failed: " + err.message, "err"); showToast("Pull request failed", "err"); });
  });

  function renderBreadcrumb(){
    var parts = state.path ? state.path.split("/") : [];
    var html = '<span data-path="">' + escHtml(state.repo || "repo") + "</span>";
    var acc = "";
    parts.forEach(function(p){
      acc = acc ? acc + "/" + p : p;
      html += " / <span data-path=\"" + escHtml(acc) + "\">" + escHtml(p) + "</span>";
    });
    els.breadcrumb.innerHTML = html;
    Array.prototype.slice.call(els.breadcrumb.querySelectorAll("span")).forEach(function(s){
      s.addEventListener("click", function(){ state.path = s.getAttribute("data-path"); saveState(); loadFolder(state.path); });
    });
  }

  var currentGhEntries = [];
  function renderGhList(entries){
    els.ghList.innerHTML = "";
    var q = els.ghFileFilter.value.trim().toLowerCase();
    var filtered = q ? entries.filter(function(e){ return e.name.toLowerCase().indexOf(q) !== -1; }) : entries;
    if (!filtered.length){
      els.emptyGh.style.display = "block";
      els.emptyGh.textContent = q ? "No matches." : "This folder is empty.";
    } else {
      els.emptyGh.style.display = "none";
    }
    filtered.forEach(function(entry){
      var row = document.createElement("div");
      row.className = "row-item" + (entry.type === "dir" ? " dir drop-zone" : "");
      if (entry.type === "dir") row.dataset.path = entry.path;
      row.innerHTML = '<span class="ic" data-icon="' + (entry.type === "dir" ? "folder" : "file") + '"></span><span class="nm">' + escHtml(entry.name) + "</span>";
      if (entry.type === "dir"){
        row.addEventListener("click", function(e){
          if (row.classList.contains("nav-blocked")) return;
          state.path = entry.path; saveState(); loadFolder(state.path);
        });
      } else {
        var alreadyPending = pending.find(function(p){ return p.type === "delete" && p.path === entry.path; });
        if (alreadyPending){
          row.classList.add("staged-delete");
          alreadyPending.rowRef = row; // old reference may be a detached node from a previous render — keep it current
        }
        var delBtn = document.createElement("button");
        delBtn.className = "del-file-btn small";
        delBtn.title = "Stage for deletion";
        delBtn.innerHTML = '<span data-icon="trash"></span>';
        delBtn.addEventListener("click", function(e){
          e.stopPropagation();
          if (row.classList.contains("staged-delete")) return;
          row.classList.add("staged-delete");
          stageChange({ type: "delete", path: entry.path, sha: entry.sha, name: entry.name, rowRef: row });
        });
        var dlBtn = document.createElement("button");
        dlBtn.className = "del-file-btn small";
        dlBtn.title = "Download this file";
        dlBtn.innerHTML = '<span data-icon="download"></span>';
        dlBtn.addEventListener("click", function(e){
          e.stopPropagation();
          downloadSingleFile(entry.path, entry.name);
        });
        row.appendChild(dlBtn);
        row.appendChild(delBtn);
      }
      els.ghList.appendChild(row);
    });
  }
  els.ghFileFilter.addEventListener("input", function(){ renderGhList(currentGhEntries); });

  function downloadSingleFile(path, name){
    setTopStatus("Downloading " + name + "…");
    var url = API + "/repos/" + state.owner + "/" + state.repo + "/contents/" + encodeApiPath(path) + "?ref=" + encodeURIComponent(state.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("GitHub error " + r.status); return r.json(); })
      .then(function(d){
        var binary = atob((d.content || "").replace(/\n/g, ""));
        var bytes = Uint8Array.from(binary, function(c){ return c.charCodeAt(0); });
        var blob = new Blob([bytes]);
        var blobUrl = URL.createObjectURL(blob);
        var a = document.createElement("a"); a.href = blobUrl; a.download = name; a.click();
        setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 4000);
        setTopStatus("Downloaded " + name, "ok");
      })
      .catch(function(err){ setTopStatus("Download failed: " + err.message, "err"); });
  }

  els.downloadZipBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo || !state.branch){ setTopStatus("Pick a repo and branch first.", "err"); return; }
    els.downloadZipBtn.disabled = true;
    setTopStatus("Reading repo files…");
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/git/trees/" + encodeURIComponent(state.branch) + "?recursive=1", { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("Couldn't read repo tree"); return r.json(); })
      .then(function(treeData){
        var blobs = (treeData.tree || []).filter(function(t){ return t.type === "blob" && t.size < 20000000; });
        if (!blobs.length) throw new Error("No files found");
        setTopStatus("Downloading " + blobs.length + " file(s)…");
        return Promise.all(blobs.map(function(b){
          return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/git/blobs/" + b.sha, { headers: ghHeaders() })
            .then(function(r){ return r.json(); })
            .then(function(blobData){
              var binary = atob((blobData.content || "").replace(/\n/g, ""));
              var bytes = Uint8Array.from(binary, function(c){ return c.charCodeAt(0); });
              return { path: b.path, bytes: bytes };
            });
        }));
      })
      .then(function(files){
        return import("https://esm.sh/fflate@0.8.2").then(function(fflate){
          var zipObj = {};
          files.forEach(function(f){ zipObj[f.path] = f.bytes; });
          var zipped = fflate.zipSync(zipObj, { level: 6 });
          var blob = new Blob([zipped], { type: "application/zip" });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a"); a.href = url; a.download = state.repo + "-" + state.branch + ".zip"; a.click();
          setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
          setTopStatus("Downloaded " + state.repo + ".zip", "ok");
        });
      })
      .catch(function(err){ setTopStatus("Zip download failed: " + err.message, "err"); showToast("Zip download failed", "err"); })
      .then(function(){ els.downloadZipBtn.disabled = false; });
  });

  function openCollabDrawer(){ els.collabDrawer.classList.add("open"); loadCollaborators(); }
  function closeCollabDrawer(){ els.collabDrawer.classList.remove("open"); }
  els.collabBtn.addEventListener("click", function(){ closeMore(); openCollabDrawer(); });
  els.collabClose.addEventListener("click", closeCollabDrawer);

  function loadCollaborators(){
    if (!state.owner || !state.repo){ els.collabList.innerHTML = '<div class="collab-row">Pick a repo first.</div>'; return; }
    els.collabList.innerHTML = '<div class="collab-row">Loading…</div>';
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/collaborators?per_page=100", { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("GitHub error " + r.status + (r.status === 403 ? " (needs admin access on this repo)" : "")); return r.json(); })
      .then(function(collabs){
        els.collabList.innerHTML = "";
        if (!collabs.length){ els.collabList.innerHTML = '<div class="collab-row">No collaborators yet.</div>'; return; }
        collabs.forEach(function(c){
          var role = c.role_name || (c.permissions && Object.keys(c.permissions).reverse().find(function(k){ return c.permissions[k]; })) || "?";
          var row = document.createElement("div");
          row.className = "collab-row";
          row.innerHTML =
            '<div class="who"><span class="login">' + escHtml(c.login) + '</span><span class="role">' + escHtml(role) + '</span></div>' +
            '<div class="actions"><button class="small" data-act="edit">Edit</button><button class="small" data-act="remove">Remove</button></div>';
          row.querySelector('[data-act="edit"]').addEventListener("click", function(){
            var newRole = prompt("New permission for " + c.login + " — pull, push, admin, maintain, or triage:", role);
            if (!newRole) return;
            fetch(API + "/repos/" + state.owner + "/" + state.repo + "/collaborators/" + encodeURIComponent(c.login), {
              method: "PUT",
              headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
              body: JSON.stringify({ permission: newRole.trim() })
            })
              .then(function(res){ if (!res.ok) throw new Error("GitHub error " + res.status); showToast("Updated " + c.login, "ok"); loadCollaborators(); })
              .catch(function(err){ showToast("Update failed: " + err.message, "err"); });
          });
          row.querySelector('[data-act="remove"]').addEventListener("click", function(){
            if (!confirm("Remove " + c.login + " from this repo?")) return;
            fetch(API + "/repos/" + state.owner + "/" + state.repo + "/collaborators/" + encodeURIComponent(c.login), { method: "DELETE", headers: ghHeaders() })
              .then(function(res){ if (!res.ok && res.status !== 204) throw new Error("GitHub error " + res.status); showToast("Removed " + c.login, "ok"); loadCollaborators(); })
              .catch(function(err){ showToast("Remove failed: " + err.message, "err"); });
          });
          els.collabList.appendChild(row);
        });
      })
      .catch(function(err){ els.collabList.innerHTML = '<div class="collab-row">' + escHtml(err.message) + '</div>'; });
  }

  els.inviteBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo){ setTopStatus("Pick a repo first.", "err"); return; }
    var username = prompt("GitHub username to invite as a collaborator:", "");
    if (!username) return;
    var permission = prompt("Permission level: pull, push, admin, maintain, or triage", "push");
    if (!permission) return;
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/collaborators/" + encodeURIComponent(username.trim()), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ permission: permission.trim() })
    })
      .then(function(res){ if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); }); return res.status === 204 ? null : res.json(); })
      .then(function(){
        showToast("Invitation sent to " + username, "ok");
        loadCollaborators();
      })
      .catch(function(err){ showToast("Invite failed: " + err.message, "err"); });
  });

  els.unpublishPagesBtn.addEventListener("click", function(){
    if (!state.owner || !state.repo){ setTopStatus("Pick a repo first.", "err"); return; }
    if (!confirm("Turn off GitHub Pages for this repo? The live site will stop being served.")) return;
    els.publishStatus.textContent = "Turning off Pages…";
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/pages", { method: "DELETE", headers: ghHeaders() })
      .then(function(res){ if (!res.ok && res.status !== 204) throw new Error("GitHub error " + res.status); })
      .then(function(){
        var map = getUrlMap("ghUploader.pagesUrls"); delete map[repoKey()];
        try{ localStorage.setItem("ghUploader.pagesUrls", JSON.stringify(map)); }catch(e){}
        els.visitPagesLink.style.display = "none";
        els.publishStatus.textContent = "GitHub Pages turned off.";
        setPagesButtonState(false);
        showToast("GitHub Pages turned off", "ok");
      })
      .catch(function(err){ els.publishStatus.textContent = "Failed: " + err.message; showToast("Turn off failed", "err"); });
  });

  els.disconnectVercelBtn.addEventListener("click", function(){
    if (!confirm("Disconnect Vercel? You'll need to paste a token again to deploy there.")) return;
    try{ localStorage.removeItem(VERCEL_TOKEN_KEY); }catch(e){}
    els.visitVercelLink.style.display = "none";
    els.publishStatus.textContent = "Vercel disconnected.";
    showToast("Vercel disconnected", "ok");
  });

  function loadFolder(path){
    if (!state.owner || !state.repo || !state.branch) return;
    state.path = path || "";
    renderBreadcrumb();
    els.currentFolderZone.textContent = "Drop files here → stages them for /" + (state.path || "(root)");
    els.currentFolderZone.dataset.path = state.path;
    els.ghFileFilter.value = "";
    els.ghList.innerHTML = "";
    els.emptyGh.style.display = "none";
    setTopStatus("Loading folder…");
    var url = API + "/repos/" + state.owner + "/" + state.repo + "/contents/" + encodeApiPath(state.path) + "?ref=" + encodeURIComponent(state.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error(r.status === 404 ? "Folder not found" : "GitHub error " + r.status); return r.json(); })
      .then(function(entries){
        if (!Array.isArray(entries)) entries = [];
        entries.sort(function(a,b){
          if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        currentGhEntries = entries;
        renderGhList(entries);
        setTopStatus("Ready", "ok");
      })
      .catch(function(err){ setTopStatus(err.message, "err"); });
  }

  function loadCommits(){
    if (!state.owner || !state.repo || !state.branch) return;
    els.commitsList.innerHTML = '<div class="commit-row">Loading…</div>';
    fetch(API + "/repos/" + state.owner + "/" + state.repo + "/commits?sha=" + encodeURIComponent(state.branch) + "&per_page=20", { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("GitHub error " + r.status); return r.json(); })
      .then(function(commits){
        els.commitsList.innerHTML = "";
        if (!commits.length){ els.commitsList.innerHTML = '<div class="commit-row">No commits yet.</div>'; return; }
        commits.forEach(function(c, i){
          var row = document.createElement("div");
          row.className = "commit-row";
          var when = new Date(c.commit.author.date).toLocaleString();
          var msg = (c.commit.message || "").split("\n")[0];
          row.innerHTML = '<div class="msg">' + escHtml(msg) + '</div>' +
            '<div class="meta"><span class="dot" data-sha="' + escHtml(c.sha) + '"></span>' + escHtml(c.commit.author.name||"") + " · " + escHtml(when) + "</div>";
          els.commitsList.appendChild(row);
          if (i === 0){
            fetch(API + "/repos/" + state.owner + "/" + state.repo + "/commits/" + c.sha + "/status", { headers: ghHeaders() })
              .then(function(r){ return r.ok ? r.json() : null; })
              .then(function(status){
                if (status && status.state){ row.querySelector(".dot").classList.add(status.state); }
              }).catch(function(){});
          }
        });
      })
      .catch(function(err){ els.commitsList.innerHTML = '<div class="commit-row">' + escHtml(err.message) + '</div>'; });
  }
  els.commitsBtn.addEventListener("click", function(){ els.commitsDrawer.classList.add("open"); loadCommits(); });
  els.commitsClose.addEventListener("click", function(){ els.commitsDrawer.classList.remove("open"); });

  function openMore(){ els.moreDrawer.classList.add("open"); els.moreBackdrop.classList.add("open"); }
  function closeMore(){ els.moreDrawer.classList.remove("open"); els.moreBackdrop.classList.remove("open"); }
  els.moreBtn.addEventListener("click", openMore);
  els.moreClose.addEventListener("click", closeMore);
  els.moreBackdrop.addEventListener("click", closeMore);

  els.newRepoBtn.addEventListener("click", function(){
    var name = prompt("New repo name:", "");
    if (!name) return;
    var isPrivate = confirm("Make it private? OK = private, Cancel = public");
    setTopStatus("Creating repo…");
    fetch(API + "/user/repos", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ name: name, private: isPrivate, auto_init: true })
    })
      .then(function(res){ if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); }); return res.json(); })
      .then(function(repo){
        showToast("Repo \"" + repo.name + "\" created", "ok");
        closeMore();
        return loadRepos().then(function(){ els.repoSelect.value = repo.full_name; selectRepo(repo.full_name); });
      })
      .catch(function(err){ setTopStatus("Repo creation failed: " + err.message, "err"); showToast("Repo creation failed", "err"); });
  });

  // ------------------------------------------------------------------
  // Local files (right panel)
  // ------------------------------------------------------------------
  // addFilesBtn is now a native <label for="fileInput">, so no click-forwarding JS is needed —
  // that's exactly the pattern that silently fails to open a picker on some Android browsers.
  els.fileInput.addEventListener("change", function(){
    Array.prototype.slice.call(els.fileInput.files || []).forEach(function(f){
      state.files.push({ id: fileIdSeq++, file: f, status: "ready", msg: "", extract: /\.zip$/i.test(f.name) });
    });
    els.fileInput.value = "";
    renderFileList();
  });

  function humanSize(bytes){
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024*1024) return Math.round(bytes/1024) + " KB";
    return (bytes/1024/1024).toFixed(1) + " MB";
  }

  function renderFileList(){
    els.fileList.innerHTML = "";
    els.emptyFiles.style.display = state.files.length ? "none" : "block";
    state.files.forEach(function(entry){
      var card = document.createElement("div");
      card.className = "file-card";
      card.dataset.id = entry.id;
      var stateHtml = "";
      if (entry.status === "uploading") stateHtml = '<span class="state">' + escHtml(entry.progress || "…") + '</span>';
      else if (entry.status === "done") stateHtml = '<span class="state ok"><span data-icon="check"></span> ' + escHtml(entry.msg||"") + '</span>';
      else if (entry.status === "error") stateHtml = '<span class="state err" title="' + escHtml(entry.msg||"") + '"><span data-icon="x"></span></span>';
      var isZip = /\.zip$/i.test(entry.file.name);
      card.innerHTML =
        '<span class="ic" data-icon="' + (isZip ? "archive" : "file") + '"></span>' +
        '<span class="nm">' + escHtml(entry.file.name) + '</span>' +
        '<span class="sz">' + humanSize(entry.file.size) + '</span>' +
        stateHtml +
        '<button class="rm small" title="Remove"><span data-icon="x"></span></button>';
      if (isZip){
        var extractRow = document.createElement("label");
        extractRow.style.cssText = "display:flex;align-items:center;gap:6px;font-size:11.5px;color:var(--muted);margin-top:-2px;margin-bottom:6px;padding-left:2px;";
        extractRow.innerHTML = '<input type="checkbox" style="width:auto;" ' + (entry.extract !== false ? "checked" : "") + '> Extract contents on upload (replaces matching files/folders)';
        extractRow.querySelector("input").addEventListener("change", function(e){ entry.extract = e.target.checked; });
        card.style.flexWrap = "wrap";
        card.appendChild(extractRow);
      }
      card.querySelector(".rm").addEventListener("click", function(){
        state.files = state.files.filter(function(f){ return f.id !== entry.id; });
        renderFileList();
      });
      wireDrag(card, entry);
      els.fileList.appendChild(card);
    });
  }

  // ------------------------------------------------------------------
  // Pointer-based drag & drop (works with touch and mouse alike)
  // ------------------------------------------------------------------
  var dragCtx = null;

  function findDropZone(x, y){
    var el = document.elementFromPoint(x, y);
    while (el && el !== document.body){
      if (el.classList && el.classList.contains("drop-zone")) return el;
      el = el.parentElement;
    }
    return null;
  }
  function clearDropHighlights(){
    Array.prototype.slice.call(document.querySelectorAll(".drop-zone.drag-over")).forEach(function(z){
      z.classList.remove("drag-over");
    });
  }

  function wireDrag(card, entry){
    card.addEventListener("pointerdown", function(e){
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault();
      card.setPointerCapture(e.pointerId);
      card.classList.add("dragging");
      dragCtx = { entry: entry, pointerId: e.pointerId };
      els.ghostCard.innerHTML = '<span data-icon="file"></span> ' + escHtml(entry.file.name);
      els.ghostCard.style.display = "block";
      positionGhost(e.clientX, e.clientY);
    });
    card.addEventListener("pointermove", function(e){
      if (!dragCtx || dragCtx.pointerId !== e.pointerId) return;
      positionGhost(e.clientX, e.clientY);
      clearDropHighlights();
      var zone = findDropZone(e.clientX, e.clientY);
      if (zone) zone.classList.add("drag-over");
    });
    function endDrag(e){
      if (!dragCtx || dragCtx.pointerId !== e.pointerId) return;
      card.classList.remove("dragging");
      els.ghostCard.style.display = "none";
      var zone = findDropZone(e.clientX, e.clientY);
      clearDropHighlights();
      var draggedEntry = dragCtx.entry;
      dragCtx = null;
      if (zone){
        var destPath = zone.dataset.path || "";
        var isZipExtract = /\.zip$/i.test(draggedEntry.file.name) && draggedEntry.extract !== false;
        stageChange({
          type: isZipExtract ? "upload-zip" : "upload",
          destFolder: destPath,
          file: draggedEntry.file,
          label: draggedEntry.file.name,
          entryRef: draggedEntry
        });
        entry_removeFromDeviceList(draggedEntry);
      }
    }
    card.addEventListener("pointerup", endDrag);
    card.addEventListener("pointercancel", endDrag);
  }
  function entry_removeFromDeviceList(entry){
    state.files = state.files.filter(function(f){ return f.id !== entry.id; });
    renderFileList();
  }
  function positionGhost(x, y){
    els.ghostCard.style.left = (x + 14) + "px";
    els.ghostCard.style.top = (y + 14) + "px";
  }

  // ------------------------------------------------------------------
  // Staged changes — nothing touches GitHub until pushChanges() runs.
  // Undo/redo here operate on the staging queue only, never on commits
  // already pushed to GitHub (that's what `git revert` is for).
  // ------------------------------------------------------------------
  var pending = [];       // [{id, type:'upload'|'upload-zip'|'delete', ...}]
  var stageHistory = [];       // [{op:'stage'|'unstage', item}]
  var historyIndex = -1;  // points just past the last applied entry
  var pendingIdSeq = 1;

  function stageChange(item){
    item.id = pendingIdSeq++;
    pending.push(item);
    pushHistory({ op: "stage", item: item });
    renderPending();
  }
  function unstageById(id, recordHistory){
    var idx = pending.findIndex(function(p){ return p.id === id; });
    if (idx === -1) return;
    var item = pending[idx];
    pending.splice(idx, 1);
    if (item.type === "delete" && item.rowRef) item.rowRef.classList.remove("staged-delete");
    if (recordHistory !== false) pushHistory({ op: "unstage", item: item });
    renderPending();
  }
  function pushHistory(entry){
    stageHistory = stageHistory.slice(0, historyIndex + 1);
    stageHistory.push(entry);
    historyIndex = stageHistory.length - 1;
    updateUndoRedoButtons();
  }
  function updateUndoRedoButtons(){
    els.undoBtn.disabled = historyIndex < 0;
    els.redoBtn.disabled = historyIndex >= stageHistory.length - 1;
  }
  els.undoBtn.addEventListener("click", function(){
    if (historyIndex < 0) return;
    var entry = stageHistory[historyIndex];
    if (entry.op === "stage") unstageById(entry.item.id, false);
    else { pending.push(entry.item); if (entry.item.type==="delete" && entry.item.rowRef) entry.item.rowRef.classList.add("staged-delete"); renderPending(); }
    historyIndex--;
    updateUndoRedoButtons();
  });
  els.redoBtn.addEventListener("click", function(){
    if (historyIndex >= stageHistory.length - 1) return;
    historyIndex++;
    var entry = stageHistory[historyIndex];
    if (entry.op === "stage") { pending.push(entry.item); if (entry.item.type==="delete" && entry.item.rowRef) entry.item.rowRef.classList.add("staged-delete"); renderPending(); }
    else unstageById(entry.item.id, false);
    updateUndoRedoButtons();
  });

  function renderPending(){
    els.pendingList.innerHTML = "";
    var n = pending.length;
    els.pendingLabel.textContent = n ? (n + " pending change" + (n===1?"":"s") + " — not on GitHub yet") : "No pending changes";
    els.pushBtn.disabled = n === 0;
    els.pushBtn.classList.toggle("pulse", n > 0);
    pending.forEach(function(item){
      var row = document.createElement("div");
      row.className = "pending-row " + (item.type === "delete" ? "delete" : "upload");
      var typeLabel = item.type === "delete" ? "Delete" : (item.type === "upload-zip" ? "Extract+Upload" : "Upload");
      var target = item.type === "delete" ? item.path : ((item.destFolder ? item.destFolder + "/" : "") + item.label);
      row.innerHTML = '<span class="type-tag">' + typeLabel + '</span><span class="nm">/' + escHtml(target) + '</span>';
      var pv = document.createElement("button");
      pv.className = "small"; pv.innerHTML = '<span data-icon="eye"></span>'; pv.title = "Preview this change";
      pv.addEventListener("click", function(){ previewChange(item); });
      row.appendChild(pv);
      var rm = document.createElement("button");
      rm.className = "small"; rm.innerHTML = '<span data-icon="x"></span>';
      rm.addEventListener("click", function(){ unstageById(item.id); });
      row.appendChild(rm);
      els.pendingList.appendChild(row);
    });
    updateUndoRedoButtons();
  }
  els.pendingBar.addEventListener("click", function(e){
    if (e.target === els.pendingBar || e.target.id === "pendingLabel") els.pendingDrawer.classList.add("open");
  });
  els.pendingLabel.addEventListener("click", function(){ els.pendingDrawer.classList.add("open"); });
  els.pendingClose.addEventListener("click", function(){ els.pendingDrawer.classList.remove("open"); });
  els.diffClose.addEventListener("click", function(){ els.diffDrawer.classList.remove("open"); });

  var BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|ttf|eot|mp3|mp4|mov|avi|exe|dll|so|bin)$/i;

  function renderDiffLines(diffParts){
    els.diffBody.innerHTML = "";
    diffParts.forEach(function(part){
      part.value.split("\n").forEach(function(line, i, arr){
        if (line === "" && i === arr.length - 1) return; // trailing split artifact
        var div = document.createElement("div");
        div.className = "diff-line " + (part.added ? "diff-add" : part.removed ? "diff-del" : "diff-ctx");
        div.textContent = (part.added ? "+ " : part.removed ? "- " : "  ") + line;
        els.diffBody.appendChild(div);
      });
    });
  }

  function fetchRemoteText(path){
    var url = API + "/repos/" + state.owner + "/" + state.repo + "/contents/" + encodeApiPath(path) + "?ref=" + encodeURIComponent(state.branch);
    return fetch(url, { headers: ghHeaders() }).then(function(r){
      if (r.status === 404) return null;
      if (!r.ok) throw new Error("GitHub error " + r.status);
      return r.json().then(function(d){
        var binary = atob((d.content || "").replace(/\n/g, ""));
        var bytes = Uint8Array.from(binary, function(c){ return c.charCodeAt(0); });
        return new TextDecoder("utf-8").decode(bytes);
      });
    });
  }

  function previewChange(item){
    els.diffDrawer.classList.add("open");
    els.diffBody.innerHTML = '<div class="diff-note">Loading preview…</div>';

    if (item.type === "delete"){
      els.diffTitle.textContent = "Delete /" + item.path;
      fetchRemoteText(item.path).then(function(text){
        if (text === null){ els.diffBody.innerHTML = '<div class="diff-note">File no longer exists on GitHub.</div>'; return; }
        if (BINARY_EXT.test(item.path)){ els.diffBody.innerHTML = '<div class="diff-note">Binary file — content preview not shown. This file will be removed.</div>'; return; }
        renderDiffLines([{ value: text, removed: true }]);
      }).catch(function(err){ els.diffBody.innerHTML = '<div class="diff-note">Couldn\'t load preview: ' + escHtml(err.message) + '</div>'; });
      return;
    }

    if (item.type === "upload-zip"){
      els.diffTitle.textContent = "Extract " + item.label + " → /" + (item.destFolder || "(root)");
      item.file.arrayBuffer()
        .then(function(buf){ return import("https://esm.sh/fflate@0.8.2").then(function(fflate){ return fflate.unzipSync(new Uint8Array(buf)); }); })
        .then(function(unzipped){
          var names = Object.keys(unzipped).filter(function(n){
            return !n.endsWith("/") && !/(^|\/)__MACOSX(\/|$)/.test(n) && !/(^|\/)\.DS_Store$/.test(n);
          }).sort();
          els.diffBody.innerHTML = "";
          var note = document.createElement("div");
          note.className = "diff-note";
          note.textContent = names.length + " file(s) will be written — existing files at matching paths are overwritten:";
          els.diffBody.appendChild(note);
          names.forEach(function(n){
            var div = document.createElement("div");
            div.className = "diff-line diff-ctx";
            div.textContent = "  /" + (item.destFolder ? item.destFolder + "/" : "") + n;
            els.diffBody.appendChild(div);
          });
        })
        .catch(function(err){ els.diffBody.innerHTML = '<div class="diff-note">Couldn\'t read zip: ' + escHtml(err.message) + '</div>'; });
      return;
    }

    // plain upload
    var destPath = (item.destFolder ? item.destFolder + "/" : "") + item.label;
    els.diffTitle.textContent = "Upload → /" + destPath;
    if (BINARY_EXT.test(item.label)){
      els.diffBody.innerHTML = '<div class="diff-note">Binary file — content preview not shown. It will be uploaded as-is.</div>';
      return;
    }
    Promise.all([
      item.file.text(),
      fetchRemoteText(destPath).catch(function(){ return null; }),
      import("https://esm.sh/diff@9.0.0")
    ]).then(function(res){
      var newText = res[0], oldText = res[1], Diff = res[2];
      if (oldText === null){ renderDiffLines([{ value: newText, added: true }]); return; }
      if (oldText === newText){ els.diffBody.innerHTML = '<div class="diff-note">No changes — identical to what\'s already on GitHub.</div>'; return; }
      renderDiffLines(Diff.diffLines(oldText, newText));
    }).catch(function(err){ els.diffBody.innerHTML = '<div class="diff-note">Couldn\'t build preview: ' + escHtml(err.message) + '</div>'; });
  }
  els.clearPendingBtn.addEventListener("click", function(){
    pending.slice().forEach(function(item){ unstageById(item.id); });
  });

  // ------------------------------------------------------------------
  // Push — the one moment anything actually reaches GitHub
  // ------------------------------------------------------------------
  function fileToBase64(file){
    return new Promise(function(resolve, reject){
      var reader = new FileReader();
      reader.onload = function(){ resolve(String(reader.result).split(",")[1] || ""); };
      reader.onerror = function(){ reject(new Error("Couldn't read file")); };
      reader.readAsDataURL(file);
    });
  }

  function getExistingSha(destPath){
    var url = API + "/repos/" + state.owner + "/" + state.repo + "/contents/" + encodeApiPath(destPath) + "?ref=" + encodeURIComponent(state.branch);
    return fetch(url, { headers: ghHeaders() }).then(function(r){
      if (r.status === 200) return r.json().then(function(d){ return d.sha; });
      return null;
    }).catch(function(){ return null; });
  }

  function putFileToRepo(destPath, base64Content, message){
    return getExistingSha(destPath).then(function(sha){
      var body = { message: message, content: base64Content, branch: state.branch };
      if (sha) body.sha = sha;
      return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/contents/" + encodeApiPath(destPath), {
        method: "PUT",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
        body: JSON.stringify(body)
      }).then(function(res){
        if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); });
        return res.json();
      });
    });
  }

  function deleteFileFromRepo(path, message){
    return getExistingSha(path).then(function(sha){
      if (!sha) throw new Error("File no longer exists on GitHub");
      return fetch(API + "/repos/" + state.owner + "/" + state.repo + "/contents/" + encodeApiPath(path), {
        method: "DELETE",
        headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
        body: JSON.stringify({ message: message, sha: sha, branch: state.branch })
      }).then(function(res){
        if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); });
        return res.json();
      });
    });
  }

  function bytesToBase64(bytes){
    var binary = "", chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk){
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  function runUpload(item){
    var destPath = (item.destFolder ? item.destFolder + "/" : "") + item.label;
    return fileToBase64(item.file).then(function(content){
      return putFileToRepo(destPath, content, "Add " + item.label + " via Modev Suite");
    });
  }

  function runZipUpload(item){
    return item.file.arrayBuffer()
      .then(function(buf){ return import("https://esm.sh/fflate@0.8.2").then(function(fflate){ return fflate.unzipSync(new Uint8Array(buf)); }); })
      .then(function(unzipped){
        var names = Object.keys(unzipped).filter(function(n){
          return !n.endsWith("/") && !/(^|\/)__MACOSX(\/|$)/.test(n) && !/(^|\/)\.DS_Store$/.test(n);
        });
        if (!names.length) throw new Error("Zip had no files to extract");
        var failed = [];
        function next(i){
          if (i >= names.length){
            if (failed.length) throw new Error(failed.length + "/" + names.length + " files in " + item.label + " failed");
            return Promise.resolve();
          }
          var name = names[i];
          var destPath = (item.destFolder ? item.destFolder + "/" : "") + name;
          setTopStatus("Pushing " + item.label + ": " + (i+1) + "/" + names.length + "…");
          return putFileToRepo(destPath, bytesToBase64(unzipped[name]), "Add " + name + " (extracted from " + item.label + ") via Modev Suite")
            .catch(function(err){ failed.push(name); console.error("Failed to upload " + name + " from " + item.label + ": " + err.message); })
            .then(function(){ return next(i+1); });
        }
        return next(0);
      });
  }

  function runDelete(item){
    return deleteFileFromRepo(item.path, "Delete " + item.name + " via Modev Suite");
  }

  els.pushBtn.addEventListener("click", function(){
    if (!pending.length) return;
    if (!state.owner || !state.repo || !state.branch){ setTopStatus("Pick a repo and branch first.", "err"); return; }
    var queue = pending.slice();
    els.pushBtn.disabled = true;
    var okCount = 0, failCount = 0;
    function next(i){
      if (i >= queue.length){
        els.pushBtn.disabled = pending.length === 0;
        showToast(failCount ? (okCount + " pushed, " + failCount + " failed") : ("Pushed " + okCount + " change" + (okCount===1?"":"s")), failCount ? "err" : "ok");
        loadFolder(state.path);
        loadCommits();
        return;
      }
      var item = queue[i];
      setTopStatus("Pushing " + (i+1) + "/" + queue.length + "…");
      var runner = item.type === "delete" ? runDelete(item) : (item.type === "upload-zip" ? runZipUpload(item) : runUpload(item));
      runner
        .then(function(){ okCount++; unstageById(item.id, false); next(i+1); })
        .catch(function(err){
          failCount++;
          console.error("Push failed for " + (item.label || item.path) + ": " + err.message);
          next(i+1);
        });
    }
    next(0);
  });

  // ------------------------------------------------------------------
  // Boot — optimistic: a cached token shows the app INSTANTLY (no spinner,
  // no connect-screen flash) since this reloads from scratch on every hub
  // tab switch by design (that's what keeps memory low). Verifying via a
  // network round-trip first would make every switch feel like reconnecting.
  // Identity/validity is confirmed quietly in the background instead; a
  // truly bad token surfaces naturally the first time an API call fails.
  // ------------------------------------------------------------------
  var savedToken = null;
  try{ savedToken = localStorage.getItem(TOKEN_KEY); }catch(e){}
  if (savedToken){
    state.token = savedToken;
    showScreen("app");
    loadRepos();
    fetch(API + "/user", { headers: { "Authorization": "token " + savedToken } })
      .then(function(res){ if (!res.ok) throw new Error("invalid"); return res.json(); })
      .then(function(user){
        state.username = user.login; state.avatar = user.avatar_url;
        renderUserChip();
      })
      .catch(function(){
        showScreen("connect");
        setConnectStatus("Your saved token seems to be invalid or expired — please reconnect.", "err");
      });
  } else {
    showScreen("connect");
  }
})();
