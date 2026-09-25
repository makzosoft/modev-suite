(function(){
  "use strict";

  function escHtml(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  var DEVICES = [
    { group:"Phones", name:"iPhone SE",              w:375,  h:667,  dpr:2 },
    { group:"Phones", name:"iPhone 12/13 mini",       w:375,  h:812,  dpr:3 },
    { group:"Phones", name:"iPhone 12/13/14",         w:390,  h:844,  dpr:3 },
    { group:"Phones", name:"iPhone 14 Pro",           w:393,  h:852,  dpr:3 },
    { group:"Phones", name:"iPhone 14/15 Pro Max",    w:430,  h:932,  dpr:3 },
    { group:"Phones", name:"iPhone 17",               w:402,  h:874,  dpr:3 },
    { group:"Phones", name:"iPhone 17 Pro Max",       w:440,  h:956,  dpr:3 },
    { group:"Phones", name:"iPhone Air",              w:420,  h:912,  dpr:3 },
    { group:"Phones", name:"Pixel 5",                 w:393,  h:851,  dpr:2.75 },
    { group:"Phones", name:"Pixel 7",                 w:412,  h:915,  dpr:2.6 },
    { group:"Phones", name:"Pixel 8 Pro",             w:412,  h:892,  dpr:2.6 },
    { group:"Phones", name:"Galaxy S8+",              w:360,  h:740,  dpr:4 },
    { group:"Phones", name:"Galaxy S20 Ultra",        w:412,  h:915,  dpr:3.5 },
    { group:"Tablets", name:"iPad Mini",              w:768,  h:1024, dpr:2 },
    { group:"Tablets", name:"iPad Air",               w:820,  h:1180, dpr:2 },
    { group:"Tablets", name:"iPad Pro 11\"",          w:834,  h:1194, dpr:2 },
    { group:"Tablets", name:"iPad Pro 12.9\"",        w:1024, h:1366, dpr:2 },
    { group:"Tablets", name:"Surface Pro 7",          w:912,  h:1368, dpr:2 },
    { group:"Laptops", name:"MacBook Air 13\"",       w:1280, h:800,  dpr:2, desktop:true },
    { group:"Laptops", name:"MacBook Pro 14\"",       w:1512, h:982,  dpr:2, desktop:true },
    { group:"Laptops", name:"MacBook Pro 16\"",       w:1728, h:1117, dpr:2, desktop:true },
    { group:"Laptops", name:"Laptop (1366×768)",      w:1366, h:768,  dpr:1, desktop:true },
    { group:"Desktops", name:"Desktop 1440×900",      w:1440, h:900,  dpr:1, desktop:true },
    { group:"Desktops", name:"Desktop 1920×1080",     w:1920, h:1080, dpr:1, desktop:true },
    { group:"Desktops", name:"Desktop 2560×1440",     w:2560, h:1440, dpr:1, desktop:true }
  ];

  var els = {};
  ["folderBtn","folderBtnLabel","filesFallbackLabel","filesFallbackInput","folderInput","dropHint","pageSelect","pathInput","knownPaths","loadBtn","reloadBtn","reloadBtnMobile",
   "deviceSelect","widthInput","heightInput","rotateBtn","zoomOut","zoomIn","zoomLabel","autoFit","addToGrid",
   "stage","frameWrap","frameLabel","device","previewFrame","empty","status",
   "controlsPanel","drawerBackdrop","menuBtn","closeDrawerBtn","topbarTitle","topbarPage","topbarDims",
   "dropOverlay","gridToggleBtn","screenshotBtn","recordBtn","gridStage","gridEmpty","gridRow",
   "ghConnectRow","ghConnectBtn","ghBrowseRow","ghRepoSelect","ghBranchSelect","ghBreadcrumb","ghFileList","ghStatus"
  ].forEach(function(id){ els[id] = document.getElementById(id); });
  els.iframe = els.previewFrame;
  var STORAGE_KEY = "deviceLab.state.v1";
  var zoom = 1;
  var discoveredFiles = [];
  var localDirHandle = null;  // FileSystemDirectoryHandle, when connected via the desktop folder picker
  var localFileMap = null;    // { relativePath: File }, when connected via <input webkitdirectory> (Android)
  var SKIP_DIRS = /^(node_modules|\.git|\.vscode|\.idea|dist|build|\.next|\.cache|coverage)$/i;
  // Not HTML-only: any of these can be opened and shown something meaningful for.
  var PREVIEWABLE_EXT = /\.(html?|css|js|mjs|json|md|markdown|txt|svg|png|jpe?g|gif|webp|ico|bmp|mp4|webm|mov|pdf)$/i;

  // ---------------- persistence helpers ----------------
  function idbOpen(){
    return new Promise(function(resolve, reject){
      var req = indexedDB.open("deviceLabDB", 1);
      req.onupgradeneeded = function(){ req.result.createObjectStore("handles"); };
      req.onsuccess = function(){ resolve(req.result); };
      req.onerror = function(){ reject(req.error); };
    });
  }
  function idbSet(key, value){
    return idbOpen().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction("handles", "readwrite");
        tx.objectStore("handles").put(value, key);
        tx.oncomplete = resolve; tx.onerror = function(){ reject(tx.error); };
      });
    });
  }
  function idbGet(key){
    return idbOpen().then(function(db){
      return new Promise(function(resolve, reject){
        var tx = db.transaction("handles", "readonly");
        var req = tx.objectStore("handles").get(key);
        req.onsuccess = function(){ resolve(req.result); };
        req.onerror = function(){ reject(req.error); };
      });
    });
  }
  function loadState(){ try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch(e){ return {}; } }
  function saveState(patch){ var s = loadState(); Object.assign(s, patch); try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch(e){} }
  function rememberKnownPath(path){
    var s = loadState(); var list = s.knownPaths || [];
    if (list.indexOf(path) === -1){ list.unshift(path); list = list.slice(0,25); saveState({knownPaths:list}); renderKnownPaths(list); }
  }
  function renderKnownPaths(list){
    els.knownPaths.innerHTML = "";
    (list||[]).forEach(function(p){ var o=document.createElement("option"); o.value=p; els.knownPaths.appendChild(o); });
  }

  // ---------------- discovery: shared finalize step ----------------
  function sortFiles(list){
    return list.slice().sort(function(a,b){
      var aRoot = a.indexOf("/")===-1, bRoot = b.indexOf("/")===-1;
      if (aRoot!==bRoot) return aRoot?-1:1;
      var aIdx=/^index\.html?$/i.test(a), bIdx=/^index\.html?$/i.test(b);
      if (aIdx!==bIdx) return aIdx?-1:1;
      return a.localeCompare(b);
    });
  }
  function stripCommonRoot(paths){
    if (!paths.length) return paths;
    var firstSeg = paths[0].split("/")[0];
    var allShare = paths.every(function(p){ return p.split("/")[0]===firstSeg; });
    if (!allShare) return paths;
    return paths.map(function(p){ var i=p.indexOf("/"); return i===-1?p:p.slice(i+1); }).filter(Boolean);
  }
  function decideDefaultPath(files, savedPath){
    if (savedPath && files.indexOf(savedPath)!==-1) return savedPath;
    var idx = files.filter(function(f){ return /^index\.html?$/i.test(f); });
    if (idx.length) return idx[0];
    return files.length ? files[0] : null;
  }
  function populatePageSelect(files, selectedPath){
    els.pageSelect.innerHTML = "";
    if (!files.length){
      var o=document.createElement("option"); o.value=""; o.textContent="— no HTML files found —";
      els.pageSelect.appendChild(o); return;
    }
    files.forEach(function(f){ var opt=document.createElement("option"); opt.value=f; opt.textContent=f; els.pageSelect.appendChild(opt); });
    if (selectedPath && files.indexOf(selectedPath)!==-1) els.pageSelect.value = selectedPath;
  }
  function finalizeDiscoveredFiles(files, folderLabel, opts){
    opts = opts || {};
    discoveredFiles = sortFiles(files);
    if (folderLabel){
      els.folderBtn.innerHTML = "";
      var fIcon = document.createElement("span"); fIcon.setAttribute("data-icon","folder");
      els.folderBtn.appendChild(fIcon);
      els.folderBtn.appendChild(document.createTextNode(" " + folderLabel));
      els.folderBtn.classList.add("connected");
    }

    var ownName = decodeURIComponent(location.pathname.split("/").pop() || "");
    var looksRight = !ownName || discoveredFiles.some(function(f){ return f.toLowerCase()===ownName.toLowerCase(); });

    var saved = loadState();
    var target = opts.forcePath || decideDefaultPath(discoveredFiles, saved.path);
    populatePageSelect(discoveredFiles, target);

    if (!discoveredFiles.length){
      setStatus("No HTML files found in that selection.", true);
    } else if (!looksRight){
      setStatus(discoveredFiles.length + " HTML file(s) found — but this doesn't look like the folder Device Lab is in. Paths may not resolve.", true);
    } else {
      setStatus(discoveredFiles.length + " HTML page(s) found" + (folderLabel ? " in \u201c"+folderLabel+"\u201d" : ""), false);
      els.status.classList.add("ok");
    }
    if (target){ els.pathInput.value = target; loadPath(target); }
  }

  // ---------------- discovery method 1: File System Access API (desktop Chrome/Edge) ----------------
  var supportsFSAccess = typeof window.showDirectoryPicker === "function";
  // Use a real <button> that calls showDirectoryPicker() where supported; everywhere else, use a
  // native <label for="folderInput"> instead of a JS-triggered .click() on a hidden file input —
  // some Android browsers don't reliably support triggering a file picker via synthetic .click(),
  // but a label's native browser-guaranteed behavior always works.
  if (supportsFSAccess){ els.folderBtn.style.display = ""; }
  else { els.folderBtnLabel.style.display = ""; }

  function walkDirHandle(dirHandle, relPath, depth, results){
    if (depth > 6) return Promise.resolve();
    return (async function(){
      var entries = [];
      for await (var entry of dirHandle.values()) entries.push(entry);
      return entries;
    })().then(function(entries){
      return Promise.all(entries.map(function(handle){
        var name = handle.name;
        if (handle.kind === "directory"){
          if (SKIP_DIRS.test(name)) return Promise.resolve();
          return walkDirHandle(handle, relPath ? relPath+"/"+name : name, depth+1, results);
        }
        if (handle.kind === "file" && PREVIEWABLE_EXT.test(name)){
          results.push(relPath ? relPath+"/"+name : name);
        }
        return Promise.resolve();
      }));
    });
  }
  function connectHandle(dirHandle){
    setStatus("Scanning folder…");
    localDirHandle = dirHandle;
    localFileMap = null;
    var results = [];
    return walkDirHandle(dirHandle, "", 0, results).then(function(){
      finalizeDiscoveredFiles(results, dirHandle.name);
    });
  }

  // ---------------- discovery method 2: <input webkitdirectory> (Android Chrome + others) ----------------
  els.folderInput.addEventListener("change", function(){
    var files = Array.prototype.slice.call(els.folderInput.files || []);
    if (!files.length) return;
    localDirHandle = null;
    localFileMap = {};
    var rootName = (files[0].webkitRelativePath || "").split("/")[0] || "folder";
    files.forEach(function(f){
      var rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
      localFileMap[rel] = f;
    });
    var htmlPaths = Object.keys(localFileMap).filter(function(p){ return PREVIEWABLE_EXT.test(p); });
    finalizeDiscoveredFiles(htmlPaths, rootName);
  });

  // Plain multi-file picker — the most universally-supported file input there is, for
  // browsers where the folder-picker attribute silently doesn't work (this varies across
  // Android OEM browsers and in-app WebViews in ways we can't reliably detect in advance).
  // No folder structure is preserved, but it at least gets something previewable when the
  // other two methods produce nothing.
  els.filesFallbackInput.addEventListener("change", function(){
    var files = Array.prototype.slice.call(els.filesFallbackInput.files || []);
    if (!files.length) return;
    localDirHandle = null;
    localFileMap = localFileMap || {};
    files.forEach(function(f){ localFileMap[f.name] = f; });
    var previewable = Object.keys(localFileMap).filter(function(p){ return PREVIEWABLE_EXT.test(p); });
    finalizeDiscoveredFiles(previewable, "selected files");
  });

  // ---------------- discovery method 3: drag & drop (desktop) ----------------
  function walkEntry(entry, relPath, results){
    return new Promise(function(resolve){
      if (entry.isFile){
        var fullPath = relPath ? relPath+"/"+entry.name : entry.name;
        entry.file(function(file){
          if (PREVIEWABLE_EXT.test(entry.name)){
            results.push(fullPath);
            localFileMap = localFileMap || {};
            localFileMap[fullPath] = file;
          }
          resolve();
        }, function(){ resolve(); });
      } else if (entry.isDirectory){
        if (SKIP_DIRS.test(entry.name)){ resolve(); return; }
        var reader = entry.createReader();
        var all = [];
        (function readBatch(){
          reader.readEntries(function(batch){
            if (!batch.length){
              Promise.all(all.map(function(e){
                return walkEntry(e, relPath ? relPath+"/"+entry.name : entry.name, results);
              })).then(resolve);
              return;
            }
            all = all.concat(batch);
            readBatch();
          }, function(){ resolve(); });
        })();
      } else resolve();
    });
  }
  function handleDrop(e){
    e.preventDefault();
    els.dropOverlay.classList.remove("show");
    var items = e.dataTransfer && e.dataTransfer.items;
    if (!items || !items.length) return;
    var entries = [];
    for (var i=0;i<items.length;i++){
      var entry = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
    if (!entries.length) return;
    var results = [];
    localDirHandle = null;
    localFileMap = {};
    var rootName = entries.length === 1 ? entries[0].name : "dropped files";
    Promise.all(entries.map(function(entry){ return walkEntry(entry, "", results); }))
      .then(function(){
        var stripped = stripCommonRoot(results);
        // localFileMap was built with full (unstripped) paths as keys; re-key it to match
        // the stripped paths so getLocalBlob(path) can actually find the content later.
        if (stripped.length === results.length){
          var firstFullSeg = results.length ? results[0].split("/")[0] : null;
          var allShareRoot = firstFullSeg && results.every(function(p){ return p.split("/")[0] === firstFullSeg; });
          if (allShareRoot){
            var reKeyed = {};
            Object.keys(localFileMap).forEach(function(fullPath){
              var idx = fullPath.indexOf("/");
              var strippedKey = idx === -1 ? fullPath : fullPath.slice(idx + 1);
              reKeyed[strippedKey] = localFileMap[fullPath];
            });
            localFileMap = reKeyed;
          }
        }
        finalizeDiscoveredFiles(stripped, rootName);
      });
  }
  ["dragenter","dragover"].forEach(function(evt){
    window.addEventListener(evt, function(e){
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types||[], "Files") !== -1){
        e.preventDefault();
        els.dropOverlay.classList.add("show");
      }
    });
  });
  ["dragleave","drop"].forEach(function(evt){
    window.addEventListener(evt, function(e){
      if (evt === "drop") handleDrop(e);
      else if (e.target === document.documentElement || e.relatedTarget === null) els.dropOverlay.classList.remove("show");
    });
  });

  function connectFolder(){
    window.showDirectoryPicker().then(function(handle){
      idbSet("projectDir", handle);
      return connectHandle(handle);
    }).catch(function(err){
      if (err && err.name !== "AbortError") setStatus("Couldn't read that folder: " + err.message, true);
    });
  }
  function tryReconnectSilently(){
    if (!supportsFSAccess) return;
    idbGet("projectDir").then(function(handle){
      if (!handle) return;
      return handle.queryPermission({mode:"read"}).then(function(perm){
        if (perm === "granted") return connectHandle(handle);
        els.folderBtn.innerHTML = "";
        var rIcon = document.createElement("span"); rIcon.setAttribute("data-icon","folder");
        els.folderBtn.appendChild(rIcon);
        els.folderBtn.appendChild(document.createTextNode(" Reconnect folder"));
        els.folderBtn.onclick = function(){
          handle.requestPermission({mode:"read"}).then(function(p){
            if (p === "granted"){ els.folderBtn.onclick = connectFolder; connectHandle(handle); }
          });
        };
      });
    }).catch(function(){});
  }

  // ---------------- device select / sizing ----------------
  function populateDeviceSelect(){
    var groups = {};
    DEVICES.forEach(function(d){ groups[d.group]=groups[d.group]||[]; groups[d.group].push(d); });
    Object.keys(groups).forEach(function(g){
      var og = document.createElement("optgroup"); og.label = g;
      groups[g].forEach(function(d,i){
        var opt=document.createElement("option");
        opt.value=g+"|"+i; opt.textContent=d.name+"  ("+d.w+"×"+d.h+")"; opt._device=d;
        og.appendChild(opt);
      });
      els.deviceSelect.appendChild(og);
    });
    var customOpt=document.createElement("option"); customOpt.value="custom"; customOpt.textContent="Custom size";
    els.deviceSelect.insertBefore(customOpt, els.deviceSelect.firstChild);
  }
  function setStatus(msg, isErr){
    els.status.textContent = msg||""; els.status.className = isErr?"err":"";
    els.topbarDims.textContent = msg ? (" · " + msg) : "";
    els.topbarDims.style.color = isErr ? "#ff8080" : "";
  }
  function applyDeviceChrome(device){
    if (device && device.desktop) els.device.classList.add("desktop-mode");
    else els.device.classList.remove("desktop-mode");
  }
  function updateLabel(){
    var w=els.widthInput.value, h=els.heightInput.value;
    var opt=els.deviceSelect.options[els.deviceSelect.selectedIndex];
    var name=(opt&&opt._device)?opt._device.name:"Custom";
    els.frameLabel.innerHTML = "<b>"+escHtml(name)+"</b> &nbsp;·&nbsp; "+escHtml(w)+" × "+escHtml(h)+" px";
    els.topbarPage.textContent = (els.pathInput.value || "No page loaded");
  }
  function applySize(){
    var w=parseInt(els.widthInput.value,10)||375, h=parseInt(els.heightInput.value,10)||667;
    els.iframe.style.width=w+"px"; els.iframe.style.height=h+"px";
    updateLabel();
    if (els.autoFit.checked) autoFitZoom(w,h); else applyZoom();
    saveState({w:w,h:h});
  }
  function applyZoom(){
    els.frameWrap.style.transform="scale("+zoom+")";
    els.zoomLabel.textContent=Math.round(zoom*100)+"%";
    saveState({zoom:zoom});
  }
  function autoFitZoom(w,h){
    var padding=60;
    var availW=els.stage.clientWidth-padding, availH=els.stage.clientHeight-padding;
    var scale=Math.min(1, availW/w, availH/(h+30));
    zoom=Math.max(0.12, scale);
    applyZoom();
  }
  function currentSize(){ return { w:parseInt(els.widthInput.value,10)||375, h:parseInt(els.heightInput.value,10)||667 }; }

  // ---------------- Preview from GitHub (shared token, srcdoc + inlined assets) ----------------
  var GH_TOKEN_KEY = "ghUploader.token";
  var SHARED_REPO_KEY = "modev.sharedRepo.v1";
  function saveSharedRepo(owner, repo, branch){
    if (!owner || !repo) return;
    try{ localStorage.setItem(SHARED_REPO_KEY, JSON.stringify({owner:owner, repo:repo, branch:branch||null})); }catch(e){}
  }
  function loadSharedRepo(){
    try{ return JSON.parse(localStorage.getItem(SHARED_REPO_KEY)) || null; }catch(e){ return null; }
  }
  var gh = { token:null, owner:null, repo:null, branch:null, path:"" };

  function ghHeaders(){ return { "Authorization": "token " + gh.token, "Accept": "application/vnd.github+json" }; }
  function ghEncodePath(p){ return p.split("/").filter(Boolean).map(encodeURIComponent).join("/"); }
  function ghResolveRelative(basePath, rel){
    if (/^https?:\/\//i.test(rel) || rel.indexOf("//") === 0) return null;
    if (rel.charAt(0) === "/") return rel.slice(1).split("/").filter(Boolean).join("/");
    var baseDir = basePath.split("/").slice(0, -1);
    rel.split("/").forEach(function(seg){
      if (seg === "." || seg === "") return;
      if (seg === "..") baseDir.pop(); else baseDir.push(seg);
    });
    return baseDir.join("/");
  }
  function ghFetchText(path){
    var url = "https://api.github.com/repos/" + gh.owner + "/" + gh.repo + "/contents/" + ghEncodePath(path) + "?ref=" + encodeURIComponent(gh.branch);
    return fetch(url, { headers: ghHeaders() }).then(function(r){ if (!r.ok) throw new Error("404"); return r.json(); })
      .then(function(d){
        var binary = atob((d.content || "").replace(/\n/g, ""));
        var bytes = Uint8Array.from(binary, function(c){ return c.charCodeAt(0); });
        return new TextDecoder("utf-8").decode(bytes);
      });
  }
  var GH_MIME_BY_EXT = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml", ico:"image/x-icon", bmp:"image/bmp", pdf:"application/pdf" };
  function ghFetchDataUrl(path){
    var url = "https://api.github.com/repos/" + gh.owner + "/" + gh.repo + "/contents/" + ghEncodePath(path) + "?ref=" + encodeURIComponent(gh.branch);
    return fetch(url, { headers: ghHeaders() }).then(function(r){ if (!r.ok) throw new Error("404"); return r.json(); })
      .then(function(d){
        var ext = (/\.([a-z0-9]+)$/i.exec(path) || ["",""])[1].toLowerCase();
        var mime = GH_MIME_BY_EXT[ext] || "application/octet-stream";
        return "data:" + mime + ";base64," + (d.content || "").replace(/\n/g, "");
      });
  }
  function ghInlineCssUrls(cssText, basePath){
    var fetches = [];
    var out = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function(m, q, url){
      if (/^(data:|https?:)/i.test(url)) return m;
      var resolved = ghResolveRelative(basePath, url);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(ghFetchDataUrl(resolved).then(function(durl){ return "url(" + durl + ")"; }).catch(function(){ return m; }));
      return "@@GHCSSURL" + idx + "@@";
    });
    return Promise.all(fetches).then(function(parts){
      parts.forEach(function(p, i){ out = out.replace("@@GHCSSURL" + i + "@@", p); });
      return out;
    });
  }
  function ghBuildInlinedHtml(rawHtml, filePath){
    var html2 = rawHtml;
    var fetches = [];
    html2 = html2.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, function(m, href){
      var resolved = ghResolveRelative(filePath, href);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(
        ghFetchText(resolved)
          .then(function(css){ return ghInlineCssUrls(css, resolved); })
          .then(function(css){ return "<style>" + css + "</style>"; })
          .catch(function(){ return "<!-- couldn't load " + href + " -->"; })
      );
      return "@@GHINLINE" + idx + "@@";
    });
    html2 = html2.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, function(m, src){
      var resolved = ghResolveRelative(filePath, src);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(ghFetchText(resolved).then(function(js){ return "<script>" + js + "<" + "/script>"; }).catch(function(){ return "<!-- couldn't load " + src + " -->"; }));
      return "@@GHINLINE" + idx + "@@";
    });
    html2 = html2.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, function(m, pre, src, post){
      var resolved = ghResolveRelative(filePath, src);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(ghFetchDataUrl(resolved).then(function(durl){ return "<img" + pre + ' src="' + durl + '"' + post + ">"; }).catch(function(){ return m; }));
      return "@@GHINLINE" + idx + "@@";
    });
    return Promise.all(fetches).then(function(parts){
      parts.forEach(function(part, i){ html2 = html2.replace("@@GHINLINE" + i + "@@", part); });
      return html2;
    });
  }

  function ghConnect(token){
    els.ghStatus.textContent = "Checking token…";
    return fetch("https://api.github.com/user", { headers: { Authorization: "token " + token } })
      .then(function(r){ if (!r.ok) throw new Error("Token rejected"); return r.json(); })
      .then(function(user){
        gh.token = token;
        try{ localStorage.setItem(GH_TOKEN_KEY, token); }catch(e){}
        els.ghConnectRow.style.display = "none";
        els.ghBrowseRow.style.display = "block";
        els.ghStatus.textContent = "Connected as " + user.login;
        ghLoadRepos();
      })
      .catch(function(err){ els.ghStatus.textContent = err.message; });
  }
  els.ghConnectBtn.addEventListener("click", function(){
    var t = prompt("Paste a GitHub Personal Access Token (same one used in the GitHub/Code tabs):", "");
    if (t) ghConnect(t.trim());
  });

  function ghLoadRepos(){
    els.ghStatus.textContent = "Loading repos…";
    fetch("https://api.github.com/user/repos?per_page=100&sort=updated", { headers: ghHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(repos){
        els.ghRepoSelect.innerHTML = '<option value="">Repo…</option>';
        repos.forEach(function(r){ var o = document.createElement("option"); o.value = r.full_name; o.textContent = r.full_name; els.ghRepoSelect.appendChild(o); });
        els.ghStatus.textContent = repos.length + " repos";

        var saved = loadState();
        var shared = loadSharedRepo();
        var targetOwner, targetRepo, targetBranch, targetPath = "";
        if (shared && shared.owner && shared.repo){
          targetOwner = shared.owner; targetRepo = shared.repo; targetBranch = shared.branch;
          // Only reuse this tab's own remembered path if it was left in this SAME
          // repo — if the repo was switched elsewhere, start fresh at the repo root.
          if (saved.ghOwner === shared.owner && saved.ghRepo === shared.repo) targetPath = saved.ghPath || "";
        } else if (saved.ghOwner && saved.ghRepo){
          targetOwner = saved.ghOwner; targetRepo = saved.ghRepo; targetBranch = saved.ghBranch;
          targetPath = saved.ghPath || "";
        }
        if (targetOwner && targetRepo){
          var fullName = targetOwner + "/" + targetRepo;
          if (repos.some(function(r){ return r.full_name === fullName; })) ghSelectRepo(fullName, targetBranch, targetPath);
        }
      })
      .catch(function(){ els.ghStatus.textContent = "Couldn't load repos"; });
  }
  els.ghRepoSelect.addEventListener("change", function(){
    if (!els.ghRepoSelect.value) return;
    ghSelectRepo(els.ghRepoSelect.value);
  });
  function ghSelectRepo(fullName, preferBranch, preferPath){
    var parts = fullName.split("/");
    gh.owner = parts[0]; gh.repo = parts[1]; gh.path = preferPath || "";
    els.ghRepoSelect.value = fullName;
    els.ghStatus.textContent = "Loading branches…";
    fetch("https://api.github.com/repos/" + fullName + "/branches?per_page=100", { headers: ghHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(branches){
        els.ghBranchSelect.innerHTML = "";
        branches.forEach(function(b){ var o = document.createElement("option"); o.value = b.name; o.textContent = b.name; els.ghBranchSelect.appendChild(o); });
        var target = (preferBranch && branches.some(function(b){ return b.name === preferBranch; })) ? preferBranch : (branches[0] && branches[0].name);
        if (target){ els.ghBranchSelect.value = target; gh.branch = target; }
        saveState({ ghOwner: gh.owner, ghRepo: gh.repo, ghBranch: gh.branch });
        saveSharedRepo(gh.owner, gh.repo, gh.branch);
        ghLoadFolder(gh.path);
      })
      .catch(function(){ els.ghStatus.textContent = "Couldn't load branches"; });
  }
  els.ghBranchSelect.addEventListener("change", function(){
    gh.branch = els.ghBranchSelect.value;
    saveState({ ghOwner: gh.owner, ghRepo: gh.repo, ghBranch: gh.branch });
    saveSharedRepo(gh.owner, gh.repo, gh.branch);
    ghLoadFolder("");
  });

  function ghRenderBreadcrumb(){
    var parts = gh.path ? gh.path.split("/") : [];
    var html2 = '<span data-path="">' + escHtml(gh.repo) + "</span>";
    var acc = "";
    parts.forEach(function(p){ acc = acc ? acc + "/" + p : p; html2 += " / <span data-path=\"" + escHtml(acc) + "\">" + escHtml(p) + "</span>"; });
    els.ghBreadcrumb.innerHTML = html2;
    Array.prototype.slice.call(els.ghBreadcrumb.querySelectorAll("span")).forEach(function(s){
      s.addEventListener("click", function(){ ghLoadFolder(s.getAttribute("data-path")); });
    });
  }
  function ghLoadFolder(path){
    gh.path = path || "";
    ghRenderBreadcrumb();
    els.ghFileList.innerHTML = "";
    els.ghStatus.textContent = "Loading…";
    var url = "https://api.github.com/repos/" + gh.owner + "/" + gh.repo + "/contents/" + ghEncodePath(gh.path) + "?ref=" + encodeURIComponent(gh.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("GitHub error " + r.status); return r.json(); })
      .then(function(entries){
        if (!Array.isArray(entries)) entries = [];
        entries.sort(function(a, b){ if (a.type !== b.type) return a.type === "dir" ? -1 : 1; return a.name.localeCompare(b.name); });
        entries.forEach(function(entry){
          var row = document.createElement("div");
          row.className = "gh-row";
          row.innerHTML = '<span data-icon="' + (entry.type === "dir" ? "folder" : "file") + '"></span><span class="nm">' + escHtml(entry.name) + "</span>";
          row.addEventListener("click", function(){
            if (entry.type === "dir") ghLoadFolder(entry.path);
            else ghLoadFile(entry.path);
          });
          els.ghFileList.appendChild(row);
        });
        els.ghStatus.textContent = entries.length + " item(s)";
      })
      .catch(function(err){ els.ghStatus.textContent = err.message; });
  }
  function ghRenderContent(path){
    var ext = (/\.([a-z0-9]+)$/i.exec(path) || ["", ""])[1].toLowerCase();
    if (ext === "html" || ext === "htm") return ghFetchText(path).then(function(raw){ return ghBuildInlinedHtml(raw, path); });
    if (ext === "md" || ext === "markdown"){
      return ghFetchText(path).then(function(text){
        return import("https://esm.sh/marked@18.0.13").then(function(mod){
          var body = mod.marked.parse(text);
          return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{font-family:-apple-system,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.6;color:#222;}pre{background:#f4f4f4;padding:10px;border-radius:6px;overflow:auto;}code{background:#f4f4f4;padding:1px 4px;border-radius:3px;}img{max-width:100%;}</style></head><body>" + body + "</body></html>";
        });
      });
    }
    if (/^(png|jpe?g|gif|webp|svg|ico|bmp)$/.test(ext)){
      return ghFetchDataUrl(path).then(function(durl){
        return "<!DOCTYPE html><html><body style='margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;'><img src='" + durl + "' style='max-width:100%;max-height:100vh;'></body></html>";
      });
    }
    if (/^(mp4|webm|mov)$/.test(ext)){
      return ghFetchDataUrl(path).then(function(durl){
        return "<!DOCTYPE html><html><body style='margin:0;background:#000;'><video src='" + durl + "' controls autoplay style='width:100%;height:100vh;'></video></body></html>";
      });
    }
    return ghFetchText(path).then(function(text){
      var esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;");
      return "<!DOCTYPE html><html><body style='margin:0;background:#1e1e1e;color:#ddd;font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:16px;white-space:pre-wrap;word-break:break-word;'>" + esc + "</body></html>";
    });
  }
  function ghLoadFile(path){
    els.ghStatus.textContent = "Loading " + path + "…";
    var ext = (/\.([a-z0-9]+)$/i.exec(path) || ["", ""])[1].toLowerCase();
    if (ext === "pdf"){
      ghFetchDataUrl(path).then(function(durl){
        els.empty.style.display = "none"; els.device.style.display = ""; els.frameLabel.style.display = "";
        els.iframe.removeAttribute("srcdoc");
        els.iframe.src = durl;
        var label = "GitHub: " + gh.repo + "/" + path;
        els.pathInput.value = label; els.topbarPage.textContent = label;
        els.ghStatus.textContent = "Loaded " + path;
        updateLabel();
      }).catch(function(err){ els.ghStatus.textContent = "Failed: " + err.message; });
      return;
    }
    ghRenderContent(path)
      .then(function(html2){
        els.empty.style.display = "none"; els.device.style.display = ""; els.frameLabel.style.display = "";
        els.iframe.removeAttribute("src");
        els.iframe.srcdoc = html2;
        var label = "GitHub: " + gh.repo + "/" + path;
        els.pathInput.value = label;
        els.topbarPage.textContent = label;
        els.ghStatus.textContent = "Loaded " + path;
        updateLabel();
      })
      .catch(function(err){ els.ghStatus.textContent = "Failed: " + err.message; });
  }
  var savedGhToken = null;
  try{ savedGhToken = localStorage.getItem(GH_TOKEN_KEY); }catch(e){}
  if (savedGhToken){ els.ghStatus.textContent = "Reconnecting…"; ghConnect(savedGhToken); }

  function loadPath(path){
    if (!path) return;
    if (isLocalPath(path)){
      // A connected local source (File System Access or the folder/file picker) — read the
      // actual file content and render it, rather than relying on the browser resolving a
      // relative file:// URL. That relative-path approach only ever worked when the picked
      // project folder happened to be the exact same folder this tool sits in on disk; picking
      // any other folder silently produced a blank frame. Reading content directly works no
      // matter where the folder is.
      loadLocalContent(path);
      if (discoveredFiles.indexOf(path) !== -1) els.pageSelect.value = path;
      els.pathInput.value = path;
      els.topbarPage.textContent = path;
      saveState({path:path});
      rememberKnownPath(path);
      if (gridActive) renderGrid();
      return;
    }
    els.empty.style.display="none"; els.device.style.display=""; els.frameLabel.style.display="";
    setStatus("Loading "+path+" …");
    els.iframe.onload=function(){ setStatus("Loaded "+path); els.status.classList.add("ok"); };
    els.iframe.onerror=function(){ setStatus("Could not load "+path+". Check the path is correct.", true); };
    els.iframe.removeAttribute("srcdoc");
    els.iframe.src=path;
    if (discoveredFiles.indexOf(path)!==-1) els.pageSelect.value=path;
    els.topbarPage.textContent = path;
    saveState({path:path});
    rememberKnownPath(path);
    if (gridActive) renderGrid();
  }

  // ---------------- Grid compare (2-4 sizes side by side) ----------------
  var gridDevices = (loadState().gridDevices || []).slice(0, 4);
  var gridActive = false;

  function currentDeviceLabel(){
    var opt = els.deviceSelect.options[els.deviceSelect.selectedIndex];
    return (opt && opt._device) ? opt._device.name : "Custom";
  }
  function inGrid(w, h){ return gridDevices.some(function(d){ return d.w === w && d.h === h; }); }

  els.addToGrid.addEventListener("change", function(){
    var s = currentSize();
    if (els.addToGrid.checked){
      if (inGrid(s.w, s.h)) return;
      if (gridDevices.length >= 4){ setStatus("Grid already has 4 sizes — remove one first.", true); els.addToGrid.checked = false; return; }
      gridDevices.push({ w: s.w, h: s.h, name: currentDeviceLabel() });
    } else {
      gridDevices = gridDevices.filter(function(d){ return !(d.w === s.w && d.h === s.h); });
    }
    saveState({ gridDevices: gridDevices });
    if (gridActive) renderGrid();
  });

  function syncAddToGridCheckbox(){
    var s = currentSize();
    els.addToGrid.checked = inGrid(s.w, s.h);
  }

  function renderGrid(){
    els.gridRow.innerHTML = "";
    if (!gridDevices.length){
      els.gridEmpty.style.display = "block";
      return;
    }
    els.gridEmpty.style.display = "none";
    var path = els.pathInput.value.trim();
    gridDevices.forEach(function(d, i){
      var item = document.createElement("div");
      item.className = "grid-item";
      var label = document.createElement("div");
      label.className = "grid-item-label";
      label.textContent = d.name + " · " + d.w + "×" + d.h;
      var box = document.createElement("div");
      box.className = "frame-box";
      var frame = document.createElement("iframe");
      var scale = Math.min(1, 340 / d.w);
      frame.style.width = d.w + "px";
      frame.style.height = d.h + "px";
      frame.style.transform = "scale(" + scale + ")";
      frame.style.transformOrigin = "top left";
      box.style.width = (d.w * scale) + "px";
      box.style.height = (d.h * scale) + "px";
      box.style.overflow = "hidden";
      if (path) frame.src = path;
      var rm = document.createElement("button");
      rm.className = "small"; rm.textContent = "Remove"; rm.style.marginTop = "8px";
      rm.addEventListener("click", function(){
        gridDevices.splice(i, 1);
        saveState({ gridDevices: gridDevices });
        renderGrid();
        syncAddToGridCheckbox();
      });
      box.appendChild(frame);
      item.appendChild(label);
      item.appendChild(box);
      item.appendChild(rm);
      els.gridRow.appendChild(item);
    });
  }

  els.gridToggleBtn.addEventListener("click", function(){
    gridActive = !gridActive;
    els.stage.style.display = gridActive ? "none" : "flex";
    els.gridStage.style.display = gridActive ? "block" : "none";
    els.gridToggleBtn.style.borderColor = gridActive ? "var(--accent)" : "";
    if (gridActive) renderGrid();
    closeDrawer();
  });

  // ---------------- Reliable capture pipeline ----------------
  // The visible preview iframe is often cross-origin from this page's point of
  // view (a file:// sibling document, or occasionally tainted by external
  // assets), which is why html2canvas silently failed before. The fix: build
  // a same-origin copy of the exact same page in a hidden iframe via srcdoc
  // (guaranteed same-origin per spec) and capture THAT instead.
  function blobToDataURL(blob){
    return new Promise(function(resolve, reject){
      var r = new FileReader();
      r.onload = function(){ resolve(r.result); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function resolveHandleByPath(dirHandle, path){
    var parts = path.split("/").filter(Boolean);
    var p = Promise.resolve(dirHandle);
    parts.forEach(function(part, i){
      p = p.then(function(handle){
        return (i === parts.length - 1) ? handle.getFileHandle(part) : handle.getDirectoryHandle(part);
      });
    });
    return p;
  }
  function getLocalBlob(path){
    if (localFileMap && localFileMap[path]) return Promise.resolve(localFileMap[path]);
    if (localDirHandle) return resolveHandleByPath(localDirHandle, path).then(function(fh){ return fh.getFile(); });
    return Promise.reject(new Error("Local file not available: " + path));
  }
  function resolveRelativeLocal(basePath, rel){
    if (/^https?:\/\//i.test(rel) || rel.indexOf("//") === 0 || rel.indexOf("data:") === 0) return null;
    if (rel.charAt(0) === "/") return rel.slice(1);
    var baseDir = basePath.split("/").slice(0, -1);
    rel.split("/").forEach(function(seg){
      if (seg === "." || seg === "") return;
      if (seg === "..") baseDir.pop(); else baseDir.push(seg);
    });
    return baseDir.join("/");
  }
  function inlineCssUrls(cssText, basePath){
    var fetches = [];
    var out = cssText.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, function(m, q, url){
      if (/^(data:|https?:)/i.test(url)) return m;
      var resolved = resolveRelativeLocal(basePath, url);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(getLocalBlob(resolved).then(blobToDataURL).then(function(durl){ return "url(" + durl + ")"; }).catch(function(){ return m; }));
      return "@@CSSURL" + idx + "@@";
    });
    return Promise.all(fetches).then(function(parts){
      parts.forEach(function(p, i){ out = out.replace("@@CSSURL" + i + "@@", p); });
      return out;
    });
  }
  function buildLocalInlinedHtml(path){
    return getLocalBlob(path).then(function(blob){ return blob.text(); }).then(function(rawHtml){
      var html2 = rawHtml;
      var fetches = [];
      html2 = html2.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, function(m, href){
        var resolved = resolveRelativeLocal(path, href);
        if (!resolved) return m;
        var idx = fetches.length;
        fetches.push(
          getLocalBlob(resolved).then(function(b){ return b.text(); })
            .then(function(css){ return inlineCssUrls(css, resolved); })
            .then(function(css){ return "<style>" + css + "</style>"; })
            .catch(function(){ return ""; })
        );
        return "@@LOCALINLINE" + idx + "@@";
      });
      html2 = html2.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, function(m, src){
        var resolved = resolveRelativeLocal(path, src);
        if (!resolved) return m;
        var idx = fetches.length;
        fetches.push(getLocalBlob(resolved).then(function(b){ return b.text(); }).then(function(js){ return "<script>" + js + "<" + "/script>"; }).catch(function(){ return ""; }));
        return "@@LOCALINLINE" + idx + "@@";
      });
      html2 = html2.replace(/<img([^>]*)\ssrc=["']([^"']+)["']([^>]*)>/gi, function(m, pre, src, post){
        var resolved = resolveRelativeLocal(path, src);
        if (!resolved) return m;
        var idx = fetches.length;
        fetches.push(getLocalBlob(resolved).then(blobToDataURL).then(function(durl){ return "<img" + pre + ' src="' + durl + '"' + post + ">"; }).catch(function(){ return m; }));
        return "@@LOCALINLINE" + idx + "@@";
      });
      return Promise.all(fetches).then(function(parts){
        parts.forEach(function(part, i){ html2 = html2.replace("@@LOCALINLINE" + i + "@@", part); });
        return html2;
      });
    });
  }

  // ---------------- Non-HTML preview types, and the local-source dispatcher ----------------
  var IMAGE_EXT_DL = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
  var VIDEO_EXT_DL = /\.(mp4|webm|mov)$/i;
  var MIME_BY_EXT_DL = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp", svg:"image/svg+xml", ico:"image/x-icon", bmp:"image/bmp", mp4:"video/mp4", webm:"video/webm", mov:"video/quicktime" };

  function renderLocalContent(path){
    var ext = (/\.([a-z0-9]+)$/i.exec(path) || ["", ""])[1].toLowerCase();
    if (ext === "html" || ext === "htm") return buildLocalInlinedHtml(path);
    if (ext === "md" || ext === "markdown"){
      return getLocalBlob(path).then(function(b){ return b.text(); }).then(function(text){
        return import("https://esm.sh/marked@18.0.13").then(function(mod){
          var body = mod.marked.parse(text);
          return "<!DOCTYPE html><html><head><meta charset='utf-8'><style>body{font-family:-apple-system,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.6;color:#222;}pre{background:#f4f4f4;padding:10px;border-radius:6px;overflow:auto;}code{background:#f4f4f4;padding:1px 4px;border-radius:3px;}img{max-width:100%;}</style></head><body>" + body + "</body></html>";
        });
      });
    }
    if (IMAGE_EXT_DL.test(path)){
      var mime = MIME_BY_EXT_DL[ext] || "image/*";
      return getLocalBlob(path).then(blobToDataURL).then(function(durl){
        return "<!DOCTYPE html><html><body style='margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff;'><img src='" + durl + "' style='max-width:100%;max-height:100vh;'></body></html>";
      });
    }
    if (VIDEO_EXT_DL.test(path)){
      return getLocalBlob(path).then(blobToDataURL).then(function(durl){
        return "<!DOCTYPE html><html><body style='margin:0;background:#000;'><video src='" + durl + "' controls autoplay style='width:100%;height:100vh;'></video></body></html>";
      });
    }
    // Plain-text fallback for css/js/json/txt/etc — shows the raw content rather than nothing.
    return getLocalBlob(path).then(function(b){ return b.text(); }).then(function(text){
      var esc = text.replace(/&/g,"&amp;").replace(/</g,"&lt;");
      return "<!DOCTYPE html><html><body style='margin:0;background:#1e1e1e;color:#ddd;font-family:ui-monospace,Menlo,monospace;font-size:13px;padding:16px;white-space:pre-wrap;word-break:break-word;'>" + esc + "</body></html>";
    });
  }

  function isLocalPath(path){
    return !!((localDirHandle || localFileMap) && discoveredFiles.indexOf(path) !== -1);
  }
  function loadLocalContent(path){
    els.empty.style.display = "none"; els.device.style.display = ""; els.frameLabel.style.display = "";
    setStatus("Loading " + path + " …");
    var ext = (/\.([a-z0-9]+)$/i.exec(path) || ["", ""])[1].toLowerCase();
    if (ext === "pdf"){
      getLocalBlob(path).then(function(blob){
        var url = URL.createObjectURL(blob);
        els.iframe.removeAttribute("srcdoc");
        els.iframe.src = url;
        setStatus("Loaded " + path, "ok");
      }).catch(function(err){ setStatus("Couldn't load: " + err.message, true); });
      return;
    }
    renderLocalContent(path).then(function(html2){
      els.iframe.removeAttribute("src");
      els.iframe.srcdoc = html2;
      setStatus("Loaded " + path, "ok");
    }).catch(function(err){ setStatus("Couldn't load: " + err.message, true); });
  }
  function getInlinedHtmlForCapture(){
    if (els.iframe.srcdoc) return Promise.resolve(els.iframe.srcdoc);
    var currentPath = els.pathInput.value.trim();
    if (!currentPath) return Promise.reject(new Error("Load a page first"));
    return buildLocalInlinedHtml(currentPath);
  }
  function withCaptureFrame(w, h){
    return getInlinedHtmlForCapture().then(function(html2){
      return new Promise(function(resolve, reject){
        var temp = document.createElement("iframe");
        temp.setAttribute("sandbox", "allow-scripts allow-same-origin");
        temp.style.cssText = "position:fixed; left:-9999px; top:0; width:" + w + "px; height:" + h + "px; border:none; background:#fff;";
        temp.onload = function(){ resolve(temp); };
        temp.onerror = function(){ reject(new Error("Couldn't render the page for capture")); };
        document.body.appendChild(temp);
        temp.srcdoc = html2;
      });
    });
  }

  els.screenshotBtn.addEventListener("click", function(){
    setStatus("Capturing…");
    var w = parseInt(els.widthInput.value, 10) || 375, h = parseInt(els.heightInput.value, 10) || 667;
    withCaptureFrame(w, h).then(function(temp){
      return import("https://esm.sh/html2canvas@1.4.1").then(function(mod){
        return mod.default(temp.contentDocument.body, { backgroundColor: "#fff", windowWidth: w, windowHeight: h });
      }).then(function(canvas){
        document.body.removeChild(temp);
        var link = document.createElement("a");
        link.download = "device-lab-screenshot.png";
        link.href = canvas.toDataURL("image/png");
        link.click();
        setStatus("Screenshot downloaded", "ok");
      }).catch(function(err){ document.body.removeChild(temp); throw err; });
    }).catch(function(err){
      console.error("Screenshot failed: " + err.message);
      setStatus("Couldn't capture automatically — try your phone's own screenshot instead.", true);
    });
  });

  // ---------------- Video recording (auto-scroll capture, exported as .webm) ----------------
  var recording = false;
  els.recordBtn.addEventListener("click", function(){
    if (recording) return;
    if (!window.MediaRecorder){ setStatus("Video recording isn't supported in this browser.", true); return; }
    recording = true;
    els.recordBtn.disabled = true;
    setStatus("Recording…");
    var w = parseInt(els.widthInput.value, 10) || 375, h = parseInt(els.heightInput.value, 10) || 667;
    var recCanvas = document.createElement("canvas");
    recCanvas.width = w; recCanvas.height = h;
    var ctx = recCanvas.getContext("2d");
    var stream = recCanvas.captureStream(6);
    var mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
    var recorder = new MediaRecorder(stream, { mimeType: mimeType });
    var chunks = [];
    recorder.ondataavailable = function(e){ if (e.data.size) chunks.push(e.data); };
    recorder.onstop = function(){
      recording = false; els.recordBtn.disabled = false;
      var blob = new Blob(chunks, { type: "video/webm" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a"); a.href = url; a.download = "device-lab-recording.webm"; a.click();
      setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
      setStatus("Video downloaded", "ok");
    };

    import("https://esm.sh/html2canvas@1.4.1").then(function(mod){ return mod.default; }).then(function(html2canvas){
      return withCaptureFrame(w, h).then(function(temp){
        recorder.start();
        var doc = temp.contentDocument;
        var scrollMax = Math.max(0, doc.body.scrollHeight - h);
        var durationMs = 4000, startTime = Date.now();
        function tick(){
          var elapsed = Date.now() - startTime;
          var t = Math.min(1, elapsed / durationMs);
          var scrollY = Math.round(scrollMax * t); // smooth top-to-bottom pan so the clip shows real content, not a frozen frame
          doc.defaultView.scrollTo(0, scrollY);
          html2canvas(doc.body, { backgroundColor: "#fff", windowWidth: w, windowHeight: h })
            .then(function(canvas){
              ctx.clearRect(0, 0, w, h);
              ctx.drawImage(canvas, 0, 0, w, h);
              if (t >= 1){ document.body.removeChild(temp); recorder.stop(); }
              else setTimeout(tick, 160);
            })
            .catch(function(){ if (t >= 1){ document.body.removeChild(temp); recorder.stop(); } else setTimeout(tick, 160); });
        }
        tick();
      });
    }).catch(function(err){
      recording = false; els.recordBtn.disabled = false;
      console.error("Recording failed: " + err.message);
      setStatus("Couldn't record — try your phone's own screen recorder instead.", true);
    });
  });

  // ---------------- drawer open/close (mobile) ----------------
  function openDrawer(){ els.controlsPanel.classList.add("open"); els.drawerBackdrop.classList.add("open"); }

  // Accordion: tapping a section header toggles it; only one open at a time
  // keeps the mobile drawer from turning into one long scattered scroll.
  var accSections = Array.prototype.slice.call(document.querySelectorAll("[data-accordion]"));
  accSections.forEach(function(sec, i){
    var head = sec.querySelector(".acc-head");
    head.addEventListener("click", function(){
      var wasOpen = sec.classList.contains("open");
      accSections.forEach(function(s){ s.classList.remove("open"); });
      if (!wasOpen) sec.classList.add("open");
    });
    if (i === 0) sec.classList.add("open"); // Source open by default
  });
  function closeDrawer(){ els.controlsPanel.classList.remove("open"); els.drawerBackdrop.classList.remove("open"); }
  els.menuBtn.addEventListener("click", openDrawer);
  els.closeDrawerBtn.addEventListener("click", closeDrawer);
  els.drawerBackdrop.addEventListener("click", closeDrawer);

  // ---------------- layout toggle (force desktop vs. responsive) ----------------
  // ---------------- wire remaining events ----------------
  els.folderBtn.addEventListener("click", connectFolder);
  els.pageSelect.addEventListener("change", function(){
    if (els.pageSelect.value){ els.pathInput.value=els.pageSelect.value; loadPath(els.pageSelect.value); closeDrawer(); }
  });
  els.loadBtn.addEventListener("click", function(){ loadPath(els.pathInput.value.trim()); closeDrawer(); });
  els.pathInput.addEventListener("keydown", function(e){ if (e.key==="Enter"){ loadPath(els.pathInput.value.trim()); closeDrawer(); } });
  function doReload(){
    if (els.iframe.srcdoc){ var html2 = els.iframe.srcdoc; els.iframe.srcdoc = ""; els.iframe.srcdoc = html2; }
    else if (els.iframe.src) els.iframe.src = els.iframe.src;
  }
  els.reloadBtn.addEventListener("click", doReload);
  els.reloadBtnMobile.addEventListener("click", doReload);
  // Many sites measure window width once at load (hero sections, carousels) and
  // never re-measure on resize — so just resizing the iframe box leaves stale
  // values from whatever size loaded first. A real reload re-runs that JS at
  // the correct final size. Only do this on deliberate size CHANGES (preset
  // pick, rotate), not on every keystroke while typing a custom width.
  function reloadIfLoaded(){ if (els.iframe.src || els.iframe.srcdoc) doReload(); }

  els.deviceSelect.addEventListener("change", function(){
    var opt = els.deviceSelect.options[els.deviceSelect.selectedIndex];
    if (opt.value === "custom"){ applyDeviceChrome(null); applySize(); saveState({deviceValue:"custom"}); syncAddToGridCheckbox(); reloadIfLoaded(); return; }
    var d = opt._device;
    els.widthInput.value=d.w; els.heightInput.value=d.h;
    applyDeviceChrome(d); applySize(); saveState({deviceValue:opt.value}); syncAddToGridCheckbox(); reloadIfLoaded();
  });
  [els.widthInput, els.heightInput].forEach(function(input){
    input.addEventListener("input", function(){
      els.deviceSelect.value="custom"; applyDeviceChrome(null); applySize(); saveState({deviceValue:"custom"}); syncAddToGridCheckbox();
    });
    input.addEventListener("change", reloadIfLoaded); // fires once when the user finishes editing (blur/enter), not per keystroke
  });
  els.rotateBtn.addEventListener("click", function(){
    var w=els.widthInput.value; els.widthInput.value=els.heightInput.value; els.heightInput.value=w; applySize(); syncAddToGridCheckbox(); reloadIfLoaded();
  });
  els.zoomIn.addEventListener("click", function(){ els.autoFit.checked=false; zoom=Math.min(2,zoom+0.1); applyZoom(); });
  els.zoomOut.addEventListener("click", function(){ els.autoFit.checked=false; zoom=Math.max(0.1,zoom-0.1); applyZoom(); });
  els.autoFit.addEventListener("change", function(){
    saveState({autoFit:els.autoFit.checked});
    if (els.autoFit.checked){ var s=currentSize(); autoFitZoom(s.w,s.h); }
  });
  window.addEventListener("resize", function(){
    if (els.autoFit.checked){ var s=currentSize(); autoFitZoom(s.w,s.h); }
  });

  if (!supportsFSAccess){
    els.folderBtn.title = "Opens your device's folder picker";
  }

  // ---------------- restore session ----------------
  populateDeviceSelect();
  var saved = loadState();
  renderKnownPaths(saved.knownPaths);

  var restoredDevice=false;
  if (saved.deviceValue && saved.deviceValue!=="custom"){
    var opt=null;
    for (var i=0;i<els.deviceSelect.options.length;i++){ if (els.deviceSelect.options[i].value===saved.deviceValue){ opt=els.deviceSelect.options[i]; break; } }
    if (opt){
      els.deviceSelect.value=opt.value; var d=opt._device;
      els.widthInput.value=saved.w||d.w; els.heightInput.value=saved.h||d.h;
      applyDeviceChrome(d); restoredDevice=true;
    }
  }
  if (!restoredDevice){
    els.deviceSelect.value="custom";
    els.widthInput.value=saved.w||390; els.heightInput.value=saved.h||844;
    applyDeviceChrome(null);
  }
  els.autoFit.checked = saved.autoFit!==undefined ? saved.autoFit : true;
  zoom = saved.zoom || 1;

  tryReconnectSilently();

  if (saved.path){
    els.pathInput.value = saved.path;
    loadPath(saved.path);
  } else {
    els.device.style.display="none"; els.frameLabel.style.display="none"; els.empty.style.display="block";
  }
  applySize();
  syncAddToGridCheckbox();
})();
