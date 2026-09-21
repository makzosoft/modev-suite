// Every CM6 sub-package below is pinned to versions verified against the npm registry,
  // with ?deps= forcing them all onto the SAME @codemirror/state + @codemirror/view instance.
  // (Mismatched versions of those two is the classic cause of "editor renders but typing does nothing".)
  import { EditorView, basicSetup } from "https://esm.sh/codemirror@6.0.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { EditorState, Compartment } from "https://esm.sh/@codemirror/state@6.7.4";
  import { html } from "https://esm.sh/@codemirror/lang-html@6.4.12?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { css } from "https://esm.sh/@codemirror/lang-css@6.3.1?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { javascript } from "https://esm.sh/@codemirror/lang-javascript@6.2.5?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { json } from "https://esm.sh/@codemirror/lang-json@6.0.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { markdown } from "https://esm.sh/@codemirror/lang-markdown@6.5.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark@6.1.3?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { indentUnit } from "https://esm.sh/@codemirror/language@6.12.4?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { undo, redo } from "https://esm.sh/@codemirror/commands@6.11.0?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { openSearchPanel } from "https://esm.sh/@codemirror/search@6.7.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { autocompletion } from "https://esm.sh/@codemirror/autocomplete@6.20.3?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import expandEmmet from "https://esm.sh/emmet@2.4.11";

  import * as prettier from "https://unpkg.com/prettier@3.9.6/standalone.mjs";
  import prettierBabel from "https://unpkg.com/prettier@3.9.6/plugins/babel.mjs";
  import prettierEstree from "https://unpkg.com/prettier@3.9.6/plugins/estree.mjs";
  import prettierHtml from "https://unpkg.com/prettier@3.9.6/plugins/html.mjs";
  import prettierPostcss from "https://unpkg.com/prettier@3.9.6/plugins/postcss.mjs";
  import prettierMarkdown from "https://unpkg.com/prettier@3.9.6/plugins/markdown.mjs";

  "use strict";

  function escHtml(s){ return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

  var API = "https://api.github.com";
  var els = {};
  ["tokenInput","showTokenBtn","connectBtn","connectStatus","app",
   "drawerToggle","repoSelect","branchSelect","fileLabel","fontDown","fontUp","findBtn","formatBtn","saveBtn","topStatus",
   "tabsBar","fileDrawerBackdrop","fileDrawer","breadcrumb","fileActions","newFileBtn","newFolderBtn","fileFilter","fileTree",
   "sourceTabGh","sourceTabLocal","ghSourcePane","localSourcePane",
   "ghNotConnected","ghConnectedArea",
   "localConnectLabel","localFilesFallbackLabel","localFilesFallbackInput","localFileActions","newLocalFileBtn",
   "localConnectBtn","localFolderInput","localBreadcrumb","localFileFilter","localFileTree","localStatus",
   "editorHost","emptyEditor","quickbar","emmetBtn","undoBtn","redoBtn",
   "moreBtn","moreBackdrop","moreDrawer","moreClose","newRepoBtn",
   "previewBtn","previewPane","previewTitle","previewDeviceSelect","previewRefresh","previewCloseBtn",
   "previewStage","previewFrameHolder","previewFrame","previewImg","previewVideo",
   "consoleToggle","consoleBadge","consoleHideBtn",
   "consoleWrap","consoleLog","consoleClearBtn","replInput","replRun"
  ].forEach(function(id){ els[id] = document.getElementById(id); });

  function showScreen(name){
    // app is never gated behind a loading/connect screen — it's always shown immediately
    els.app.classList.add("show");
    if (name === "ghConnected"){ els.ghNotConnected.style.display = "none"; els.ghConnectedArea.style.display = "flex"; }
    else if (name === "ghDisconnected"){ els.ghNotConnected.style.display = "block"; els.ghConnectedArea.style.display = "none"; }
  }

  var TOKEN_KEY = "ghUploader.token"; // shared name with the GitHub tab, reused if the browser shares storage
  var STATE_KEY = "codeEditor.state.v1";
  var FONT_KEY = "codeEditor.fontSize";

  var gh = { token:null, owner:null, repo:null, branch:null, path:"", filePath:null };
  var buffers = [];       // { id, path, ext, sha, isNew, dirty, state, draftTimer }
  var activeId = null;
  var bufIdSeq = 1;
  var view = null;
  var currentEntries = []; // last folder listing, for client-side filtering
  var fontSize = parseInt(localStorage.getItem(FONT_KEY) || "14", 10);
  document.documentElement.style.setProperty("--editor-fs", fontSize + "px");

  function ghHeaders(){ return { "Authorization": "token " + gh.token, "Accept": "application/vnd.github+json" }; }
  function encodeApiPath(p){ return p.split("/").filter(Boolean).map(encodeURIComponent).join("/"); }
  function setStatus(msg, kind){ els.topStatus.textContent = msg||""; els.topStatus.className = kind||""; }
  function setConnectStatus(msg, kind){ els.connectStatus.textContent = msg||""; els.connectStatus.className = kind||""; }
  function saveEditorState(){ try{ localStorage.setItem(STATE_KEY, JSON.stringify({owner:gh.owner, repo:gh.repo, branch:gh.branch, path:gh.path, filePath:gh.filePath||null})); }catch(e){} }
  function loadEditorState(){ try{ return JSON.parse(localStorage.getItem(STATE_KEY)) || {}; }catch(e){ return {}; } }
  function draftKey(buf){
    if (typeof buf === "string") buf = { path: buf, source: "github" }; // legacy call sites passing a bare path = GitHub
    if (buf.source === "local-fsa" || buf.source === "local-webkit") return "codeEditor.draft::local/" + (localRootName || "folder") + "/" + buf.path;
    return "codeEditor.draft::" + gh.owner + "/" + gh.repo + "/" + gh.branch + "/" + buf.path;
  }
  var pendingFile = null;

  function activeBuffer(){ return buffers.find(function(b){ return b.id === activeId; }); }

  // ---------------- Auth ----------------
  els.showTokenBtn.addEventListener("click", function(){ els.tokenInput.type = els.tokenInput.type === "password" ? "text" : "password"; });
  function connectWithToken(token){
    setConnectStatus("Checking token…");
    return fetch(API + "/user", { headers: { Authorization: "token " + token } })
      .then(function(r){ if (!r.ok) throw new Error(r.status === 401 ? "Token rejected — check it's correct and has repo access." : "GitHub error " + r.status); return r.json(); })
      .then(function(user){
        gh.token = token;
        try{ localStorage.setItem(TOKEN_KEY, token); }catch(e){}
        setConnectStatus("Connected as " + user.login, "ok");
        showScreen("ghConnected");
        loadRepos();
      })
      .catch(function(err){
        setConnectStatus(err.message, "err");
        showScreen("ghDisconnected");
      });
  }
  els.connectBtn.addEventListener("click", function(){
    var t = els.tokenInput.value.trim();
    if (!t){ setConnectStatus("Paste a token first.", "err"); return; }
    connectWithToken(t);
  });
  els.tokenInput.addEventListener("keydown", function(e){ if (e.key === "Enter") els.connectBtn.click(); });

  // ---------------- Repo / branch / tree ----------------
  var allRepos = [];
  function loadRepos(){
    setStatus("Loading repos…");
    return fetch(API + "/user/repos?per_page=100&sort=updated", { headers: ghHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(repos){
        allRepos = repos;
        renderRepoOptions(repos);
        setStatus(repos.length + " repos", "ok");
        var saved = loadEditorState();
        if (saved.owner && saved.repo){
          var full = saved.owner + "/" + saved.repo;
          if (repos.some(function(r){return r.full_name===full;})){
            els.repoSelect.value = full;
            pendingFile = saved.filePath || null;
            selectRepo(full, saved.branch, saved.path || "");
          }
        }
        return repos;
      })
      .catch(function(err){ setStatus("Repo load failed", "err"); return []; });
  }
  function renderRepoOptions(repos){
    els.repoSelect.innerHTML = '<option value="">Repo…</option>';
    repos.forEach(function(r){
      var opt = document.createElement("option"); opt.value = r.full_name; opt.textContent = r.full_name;
      els.repoSelect.appendChild(opt);
    });
  }
  els.repoSelect.addEventListener("change", function(){ if (els.repoSelect.value) selectRepo(els.repoSelect.value); });

  function selectRepo(fullName, preferBranch, preferPath){
    var parts = fullName.split("/");
    gh.owner = parts[0]; gh.repo = parts[1]; gh.path = preferPath || "";
    setStatus("Loading branches…");
    fetch(API + "/repos/" + fullName + "/branches?per_page=100", { headers: ghHeaders() })
      .then(function(r){ return r.json(); })
      .then(function(branches){
        els.branchSelect.innerHTML = "";
        branches.forEach(function(b){ var o=document.createElement("option"); o.value=b.name; o.textContent=b.name; els.branchSelect.appendChild(o); });
        var target = (preferBranch && branches.some(function(b){return b.name===preferBranch;})) ? preferBranch : (branches[0] && branches[0].name);
        if (target){ els.branchSelect.value = target; gh.branch = target; }
        saveEditorState();
        loadFolder(gh.path);
      })
      .catch(function(){ setStatus("Branch load failed", "err"); });
  }
  els.branchSelect.addEventListener("change", function(){ gh.branch = els.branchSelect.value; gh.path=""; saveEditorState(); loadFolder(""); });

  function renderBreadcrumb(){
    var parts = gh.path ? gh.path.split("/") : [];
    var html2 = '<span data-path="">' + escHtml(gh.repo||"repo") + "</span>";
    var acc = "";
    parts.forEach(function(p){ acc = acc ? acc+"/"+p : p; html2 += " / <span data-path=\""+escHtml(acc)+"\">"+escHtml(p)+"</span>"; });
    els.breadcrumb.innerHTML = html2;
    Array.prototype.slice.call(els.breadcrumb.querySelectorAll("span")).forEach(function(s){
      s.addEventListener("click", function(){ gh.path = s.getAttribute("data-path"); saveEditorState(); loadFolder(gh.path); });
    });
  }

  function renderFileTree(entries){
    els.fileTree.innerHTML = "";
    var filterText = els.fileFilter.value.trim().toLowerCase();
    var filtered = filterText ? entries.filter(function(e){ return e.name.toLowerCase().indexOf(filterText) !== -1; }) : entries;
    if (!filtered.length){
      var empty = document.createElement("div");
      empty.style.cssText = "color:var(--muted);font-size:12px;padding:10px;";
      empty.textContent = filterText ? "No matches." : "This folder is empty.";
      els.fileTree.appendChild(empty);
      return;
    }
    filtered.forEach(function(entry){
      var row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = '<span data-icon="' + (entry.type==="dir"?"folder":"file") + '"></span><span class="nm">' + escHtml(entry.name) + "</span>";
      row.addEventListener("click", function(){
        if (entry.type === "dir"){ gh.path = entry.path; saveEditorState(); loadFolder(gh.path); }
        else openFileInEditor(entry.path, entry.sha);
      });
      if (entry.type !== "dir"){
        var renBtn = document.createElement("button");
        renBtn.className = "icon small"; renBtn.title = "Rename or move"; renBtn.innerHTML = '<span data-icon="edit"></span>';
        renBtn.addEventListener("click", function(e){ e.stopPropagation(); renameFile(entry.path, entry.sha); });
        row.appendChild(renBtn);

        var delBtn = document.createElement("button");
        delBtn.className = "icon small"; delBtn.title = "Delete this file from GitHub"; delBtn.innerHTML = '<span data-icon="trash"></span>';
        delBtn.addEventListener("click", function(e){
          e.stopPropagation();
          if (!confirm("Delete " + entry.path + " from GitHub? This can't be undone from here — click OK only if you're sure.")) return;
          setStatus("Deleting…");
          deleteFileFromRepo(entry.path, entry.sha, "Delete " + entry.name + " via Modev Suite")
            .then(function(){
              setStatus("Deleted " + entry.name, "ok");
              var buf = buffers.find(function(b){ return b.path === entry.path; });
              if (buf) closeTab(buf.id, true);
              loadFolder(gh.path);
            })
            .catch(function(err){ setStatus("Delete failed: " + err.message, "err"); });
        });
        row.appendChild(delBtn);
      }
      els.fileTree.appendChild(row);
    });
  }
  els.fileFilter.addEventListener("input", function(){ renderFileTree(currentEntries); });

  function loadFolder(path){
    if (!gh.owner || !gh.repo || !gh.branch) return;
    gh.path = path || "";
    renderBreadcrumb();
    els.fileFilter.value = "";
    els.fileTree.innerHTML = "";
    setStatus("Loading…");
    var url = API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(gh.path) + "?ref=" + encodeURIComponent(gh.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("GitHub error " + r.status); return r.json(); })
      .then(function(entries){
        if (!Array.isArray(entries)) entries = [];
        entries.sort(function(a,b){ if (a.type!==b.type) return a.type==="dir"?-1:1; return a.name.localeCompare(b.name); });
        currentEntries = entries;
        renderFileTree(entries);
        setStatus("Ready", "ok");
        closeDrawer();
        if (pendingFile){ var pf = pendingFile; pendingFile = null; openFileInEditor(pf); }
      })
      .catch(function(err){ setStatus(err.message, "err"); });
  }

  // ---------------- Base64 / GitHub write helpers ----------------
  function b64Decode(b64){
    var binary = atob(b64.replace(/\n/g, ""));
    var bytes = Uint8Array.from(binary, function(c){ return c.charCodeAt(0); });
    return new TextDecoder("utf-8").decode(bytes);
  }
  function b64Encode(str){
    var bytes = new TextEncoder().encode(str);
    var binary = "";
    bytes.forEach(function(b){ binary += String.fromCharCode(b); });
    return btoa(binary);
  }
  function putRaw(path, base64Content, message, sha){
    var body = { message: message, content: base64Content, branch: gh.branch };
    if (sha) body.sha = sha;
    return fetch(API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(path), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify(body)
    }).then(function(res){
      if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); });
      return res.json();
    });
  }
  function deleteFileFromRepo(path, sha, message){
    return fetch(API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(path), {
      method: "DELETE",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ message: message, sha: sha, branch: gh.branch })
    }).then(function(res){
      if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); });
      return res.json();
    });
  }

  function renameFile(oldPath, oldSha){
    var newPath = prompt("Rename/move to:", oldPath);
    if (!newPath || newPath === oldPath) return;
    newPath = newPath.replace(/^\/+/, "");
    setStatus("Renaming…");
    var url = API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(oldPath) + "?ref=" + encodeURIComponent(gh.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("Couldn't read the original file"); return r.json(); })
      .then(function(data){
        return putRaw(newPath, data.content.replace(/\n/g,""), "Rename " + oldPath + " to " + newPath + " via Modev Suite")
          .then(function(){ return deleteFileFromRepo(oldPath, oldSha, "Remove old path " + oldPath + " (renamed) via Modev Suite"); });
      })
      .then(function(){
        setStatus("Renamed to " + newPath, "ok");
        var buf = buffers.find(function(b){ return b.path === oldPath; });
        if (buf){ buf.path = newPath; buf.ext = extOf(newPath); if (buf.id === activeId){ els.fileLabel.textContent = newPath; } renderTabs(); }
        loadFolder(gh.path);
      })
      .catch(function(err){ setStatus("Rename failed: " + err.message, "err"); });
  }

  // ---------------- Language detection ----------------
  function extOf(path){ var m = /\.([a-z0-9]+)$/i.exec(path); return m ? m[1].toLowerCase() : ""; }
  function langExtensionFor(ext){
    if (ext === "html" || ext === "htm") return html();
    if (ext === "css") return css();
    if (ext === "js" || ext === "mjs" || ext === "jsx") return javascript({ jsx: ext === "jsx" });
    if (ext === "ts" || ext === "tsx") return javascript({ jsx: ext === "tsx", typescript: true });
    if (ext === "json") return json();
    if (ext === "md" || ext === "markdown") return markdown();
    return null;
  }
  function prettierConfigFor(ext){
    if (ext === "html" || ext === "htm") return { parser: "html", plugins: [prettierHtml, prettierPostcss, prettierBabel, prettierEstree] };
    if (ext === "css" || ext === "scss" || ext === "less") return { parser: "css", plugins: [prettierPostcss] };
    if (ext === "js" || ext === "mjs" || ext === "jsx" || ext === "ts" || ext === "tsx") return { parser: "babel", plugins: [prettierBabel, prettierEstree] };
    if (ext === "json") return { parser: "json", plugins: [prettierBabel, prettierEstree] };
    if (ext === "md" || ext === "markdown") return { parser: "markdown", plugins: [prettierMarkdown] };
    return null;
  }

  // ---------------- Tabs / buffers ----------------
  function extensionsFor(buf){
    var exts = [basicSetup, oneDark, indentUnit.of("  "), EditorView.lineWrapping,
      autocompletion({ tooltipClass: function(){ return "cm-suggest-top"; }, activateOnTyping: true }),
      EditorView.updateListener.of(function(u){
        if (!u.docChanged) return;
        buf.dirty = true;
        els.fileLabel.classList.toggle("dirty", buf.id === activeId);
        renderTabs();
        if (buf.id === activeId) schedulePreviewRefresh();
        clearTimeout(buf.draftTimer);
        buf.draftTimer = setTimeout(function(){
          try{ localStorage.setItem(draftKey(buf), u.state.doc.toString()); }catch(e){}
        }, 600);
      })];
    var lang = langExtensionFor(buf.ext);
    if (lang) exts.push(lang);
    return exts;
  }

  function renderTabs(){
    els.tabsBar.innerHTML = "";
    buffers.forEach(function(buf){
      var chip = document.createElement("div");
      chip.className = "tab-chip" + (buf.id === activeId ? " active" : "");
      var name = buf.path.split("/").pop();
      var srcIcon = (buf.source === "local-fsa" || buf.source === "local-webkit") ? '<span data-icon="folder"></span> ' : "";
      chip.innerHTML = (buf.dirty ? '<span class="dot"></span>' : '') + '<span>' + srcIcon + escHtml(name) + (buf.isNew ? " (new)" : "") + '</span>';
      var x = document.createElement("span");
      x.className = "x"; x.innerHTML = '<span data-icon="x"></span>';
      x.addEventListener("click", function(e){ e.stopPropagation(); closeTab(buf.id); });
      chip.appendChild(x);
      chip.addEventListener("click", function(){ if (buf.id !== activeId) switchToBuffer(buf.id); });
      els.tabsBar.appendChild(chip);
    });
  }

  function switchToBuffer(id){
    var buf = buffers.find(function(b){ return b.id === id; });
    if (!buf) return;
    if (activeId != null && view){
      var prev = buffers.find(function(b){ return b.id === activeId; });
      if (prev) prev.state = view.state;
    }
    activeId = id;
    if (!view){
      els.editorHost.innerHTML = "";
      view = new EditorView({ state: buf.state, parent: els.editorHost });
    } else {
      view.setState(buf.state);
    }
    var srcTag = buf.source === "local-fsa" ? " (local)" : buf.source === "local-webkit" ? " (local, read-only save)" : (buf.isNew ? " (not on GitHub yet)" : "");
    els.fileLabel.textContent = buf.path + srcTag;
    els.fileLabel.classList.toggle("dirty", !!buf.dirty);
    gh.filePath = buf.path;
    saveEditorState();
    renderTabs();
    if (previewOpen) refreshPreview();
  }

  function closeTab(id, skipConfirm){
    var buf = buffers.find(function(b){ return b.id === id; });
    if (!buf) return;
    if (id === activeId && view) buf.state = view.state;
    if (buf.dirty && !skipConfirm && !confirm("Close " + buf.path + "? Your draft stays saved locally and will be offered again next time you open it.")) return;
    buffers = buffers.filter(function(b){ return b.id !== id; });
    if (activeId === id){
      activeId = null;
      if (buffers.length){
        switchToBuffer(buffers[buffers.length - 1].id);
      } else {
        if (view){ view.destroy(); view = null; }
        els.editorHost.innerHTML = "";
        els.editorHost.appendChild(els.emptyEditor);
        els.fileLabel.textContent = "No file open";
        els.fileLabel.classList.remove("dirty");
        gh.filePath = null;
        saveEditorState();
      }
    }
    renderTabs();
  }

  function openFileInEditor(path){
    var existing = buffers.find(function(b){ return b.path === path; });
    if (existing){ switchToBuffer(existing.id); closeDrawer(); return; }
    setStatus("Opening " + path + "…");
    var url = API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(path) + "?ref=" + encodeURIComponent(gh.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ if (!r.ok) throw new Error("Couldn't load file (" + r.status + ")"); return r.json(); })
      .then(function(data){
        var remoteContent = data.encoding === "base64" ? b64Decode(data.content) : data.content;
        var ext = extOf(path);
        var draft = null;
        try{ draft = localStorage.getItem(draftKey(path)); }catch(e){}
        var hasDraft = draft !== null && draft !== remoteContent;
        var buf = { id: bufIdSeq++, path: path, ext: ext, sha: data.sha, isNew: false, dirty: hasDraft, draftTimer: null, source: "github" };
        buf.state = EditorState.create({ doc: hasDraft ? draft : remoteContent, extensions: extensionsFor(buf) });
        buffers.push(buf);
        switchToBuffer(buf.id);
        setStatus(hasDraft ? "Restored an unsaved draft — tap Save to commit it" : "Loaded", "ok");
        closeDrawer();
      })
      .catch(function(err){ setStatus(err.message, "err"); });
  }

  // ------------------------------------------------------------------
  // Local folder source — same dual-method connection Device Lab uses
  // (File System Access API on desktop, <input webkitdirectory> on
  // Android). File System Access handles support real write-back via
  // createWritable(), so Save can genuinely save in place on desktop.
  // webkitdirectory is read-only by platform design — Android exposes
  // no write API for files picked that way — so Save there downloads
  // the edited file instead, clearly labeled so it's never mistaken
  // for an in-place save.
  // ------------------------------------------------------------------
  var localDirHandle = null;
  var localFileMap = null;
  var localRootName = null;
  var localCurrentPath = "";
  var EDITABLE_EXT = /\.(html?|css|scss|less|js|mjs|jsx|ts|tsx|json|md|markdown|txt|xml|svg|yml|yaml|py|rb|go|rs|java|c|cpp|h|sh|env|gitignore)$/i;

  els.sourceTabGh.addEventListener("click", function(){
    els.sourceTabGh.classList.add("active"); els.sourceTabLocal.classList.remove("active");
    els.ghSourcePane.style.display = "flex"; els.localSourcePane.style.display = "none";
  });
  els.sourceTabLocal.addEventListener("click", function(){
    els.sourceTabLocal.classList.add("active"); els.sourceTabGh.classList.remove("active");
    els.localSourcePane.style.display = "flex"; els.ghSourcePane.style.display = "none";
  });

  function resolveLocalHandleByPath(dirHandle, path, create){
    var parts = path.split("/").filter(Boolean);
    var p = Promise.resolve(dirHandle);
    parts.forEach(function(part, i){
      p = p.then(function(handle){
        return (i === parts.length - 1) ? handle.getFileHandle(part, create ? {create:true} : undefined) : handle.getDirectoryHandle(part, create ? {create:true} : undefined);
      });
    });
    return p;
  }
  function getLocalBlob(path){
    if (localFileMap && localFileMap[path]) return Promise.resolve(localFileMap[path]);
    if (localDirHandle) return resolveLocalHandleByPath(localDirHandle, path).then(function(fh){ return fh.getFile(); });
    return Promise.reject(new Error("File not available"));
  }

  var supportsFSAccessLocal = typeof window.showDirectoryPicker === "function";
  if (supportsFSAccessLocal){ els.localConnectBtn.style.display = ""; }
  else { els.localConnectLabel.style.display = ""; }
  els.localConnectBtn.addEventListener("click", function(){
    window.showDirectoryPicker().then(function(handle){
      localDirHandle = handle; localFileMap = null; localRootName = handle.name;
      els.localStatus.textContent = "Scanning…";
      var results = [];
      walkLocalDirHandle(handle, "", 0, results).then(function(){
        finishLocalConnect(results, handle.name);
      });
    }).catch(function(){});
  });
  function walkLocalDirHandle(dirHandle, relPath, depth, results){
    if (depth > 8) return Promise.resolve();
    return (async function(){
      var entries = [];
      for await (var entry of dirHandle.values()) entries.push(entry);
      return entries;
    })().then(function(entries){
      return Promise.all(entries.map(function(handle){
        var name = handle.name;
        if (/^(node_modules|\.git|\.vscode|dist|build|\.next|\.cache)$/i.test(name)) return Promise.resolve();
        if (handle.kind === "directory") return walkLocalDirHandle(handle, relPath ? relPath+"/"+name : name, depth+1, results);
        if (handle.kind === "file" && EDITABLE_EXT.test(name)) results.push(relPath ? relPath+"/"+name : name);
        return Promise.resolve();
      }));
    });
  }
  els.localFolderInput.addEventListener("change", function(){
    var files = Array.prototype.slice.call(els.localFolderInput.files || []);
    if (!files.length) return;
    localDirHandle = null; localFileMap = {};
    var rootName = (files[0].webkitRelativePath || "").split("/")[0] || "folder";
    localRootName = rootName;
    files.forEach(function(f){
      var rel = (f.webkitRelativePath || f.name).split("/").slice(1).join("/") || f.name;
      localFileMap[rel] = f;
    });
    var editablePaths = Object.keys(localFileMap).filter(function(p){ return EDITABLE_EXT.test(p); });
    finishLocalConnect(editablePaths, rootName);
  });
  // Plain multi-file picker fallback — some Android browsers don't reliably support the
  // webkitdirectory attribute at all; this is the most universally-supported file input there is.
  els.localFilesFallbackInput.addEventListener("change", function(){
    var files = Array.prototype.slice.call(els.localFilesFallbackInput.files || []);
    if (!files.length) return;
    localDirHandle = null; localFileMap = localFileMap || {};
    files.forEach(function(f){ localFileMap[f.name] = f; });
    var editablePaths = Object.keys(localFileMap).filter(function(p){ return EDITABLE_EXT.test(p); });
    finishLocalConnect(editablePaths, "selected files");
  });
  var localAllFiles = [];
  function finishLocalConnect(paths, rootName){
    localAllFiles = paths.sort();
    var label = '<span data-icon="folder"></span> ' + escHtml(rootName);
    els.localConnectBtn.innerHTML = label;
    els.localConnectLabel.innerHTML = label;
    els.localBreadcrumb.style.display = "block";
    els.localFileActions.style.display = "block";
    els.localFileFilter.style.display = "block";
    renderLocalBreadcrumb();
    renderLocalFileTree();
    els.localStatus.textContent = paths.length + " editable file(s) found" + (supportsFSAccessLocal ? "" : " — Save will download edited files (Android can't write back in place)");
  }
  function renderLocalBreadcrumb(){
    var parts = localCurrentPath ? localCurrentPath.split("/") : [];
    var html2 = '<span data-path="">' + escHtml(localRootName || "folder") + "</span>";
    var acc = "";
    parts.forEach(function(p){ acc = acc ? acc+"/"+p : p; html2 += " / <span data-path=\""+escHtml(acc)+"\">"+escHtml(p)+"</span>"; });
    els.localBreadcrumb.innerHTML = html2;
    Array.prototype.slice.call(els.localBreadcrumb.querySelectorAll("span")).forEach(function(s){
      s.addEventListener("click", function(){ localCurrentPath = s.getAttribute("data-path"); renderLocalBreadcrumb(); renderLocalFileTree(); });
    });
  }
  function renderLocalFileTree(){
    els.localFileTree.innerHTML = "";
    var q = els.localFileFilter.value.trim().toLowerCase();
    var prefix = localCurrentPath ? localCurrentPath + "/" : "";
    var seenDirs = {};
    var rows = [];
    localAllFiles.forEach(function(p){
      if (prefix && p.indexOf(prefix) !== 0) return;
      var rest = p.slice(prefix.length);
      var slash = rest.indexOf("/");
      if (slash === -1){
        if (!q || rest.toLowerCase().indexOf(q) !== -1) rows.push({ type:"file", name: rest, path: p });
      } else {
        var dirName = rest.slice(0, slash);
        if (!seenDirs[dirName] && (!q || dirName.toLowerCase().indexOf(q) !== -1)){
          seenDirs[dirName] = true;
          rows.push({ type:"dir", name: dirName, path: prefix + dirName });
        }
      }
    });
    rows.sort(function(a,b){ if (a.type!==b.type) return a.type==="dir"?-1:1; return a.name.localeCompare(b.name); });
    rows.forEach(function(r){
      var row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = '<span data-icon="' + (r.type==="dir"?"folder":"file") + '"></span><span class="nm">' + escHtml(r.name) + "</span>";
      row.addEventListener("click", function(){
        if (r.type === "dir"){ localCurrentPath = r.path; renderLocalBreadcrumb(); renderLocalFileTree(); }
        else openLocalFileInEditor(r.path);
      });
      els.localFileTree.appendChild(row);
    });
  }
  els.localFileFilter.addEventListener("input", renderLocalFileTree);

  function openLocalFileInEditor(path){
    var existing = buffers.find(function(b){ return b.path === path && b.source !== "github"; });
    if (existing){ switchToBuffer(existing.id); closeDrawer(); return; }
    setStatus("Opening " + path + "…");
    getLocalBlob(path).then(function(blob){ return blob.text(); }).then(function(content){
      var ext = extOf(path);
      var source = localDirHandle ? "local-fsa" : "local-webkit";
      var bufShell = { path: path, source: source };
      var draft = null;
      try{ draft = localStorage.getItem(draftKey(bufShell)); }catch(e){}
      var hasDraft = draft !== null && draft !== content;
      var buf = { id: bufIdSeq++, path: path, ext: ext, isNew: false, dirty: hasDraft, draftTimer: null, source: source };
      buf.state = EditorState.create({ doc: hasDraft ? draft : content, extensions: extensionsFor(buf) });
      buffers.push(buf);
      switchToBuffer(buf.id);
      setStatus(hasDraft ? "Restored an unsaved draft — tap Save" : "Loaded", "ok");
      closeDrawer();
    }).catch(function(err){ setStatus("Couldn't open: " + err.message, "err"); });
  }

  function saveLocalFsa(buf, content){
    return resolveLocalHandleByPath(localDirHandle, buf.path, buf.isNew)
      .then(function(fh){ return fh.createWritable(); })
      .then(function(writable){ return writable.write(content).then(function(){ return writable.close(); }); })
      .then(function(){
        buf.dirty = false;
        if (buf.isNew && localAllFiles.indexOf(buf.path) === -1) localAllFiles.push(buf.path);
        buf.isNew = false;
        try{ localStorage.removeItem(draftKey(buf)); }catch(e){}
        els.fileLabel.classList.remove("dirty");
        renderTabs();
        setStatus("Saved to disk ✓", "ok");
        renderLocalFileTree();
      });
  }
  function saveLocalWebkitDownload(buf, content){
    var blob = new Blob([content], { type: "text/plain" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = buf.path.split("/").pop();
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    buf.dirty = false;
    try{ localStorage.removeItem(draftKey(buf)); }catch(e){}
    els.fileLabel.classList.remove("dirty");
    renderTabs();
    setStatus("Downloaded — replace the file manually (Android can't write back in place)", "ok");
  }

  els.newFileBtn.addEventListener("click", function(){
    var name = prompt("New file path, relative to /" + (gh.path || "") + ":", "");
    if (!name) return;
    var fullPath = (gh.path ? gh.path + "/" : "") + name.replace(/^\/+/, "");
    var existing = buffers.find(function(b){ return b.path === fullPath; });
    if (existing){ switchToBuffer(existing.id); closeDrawer(); return; }
    var buf = { id: bufIdSeq++, path: fullPath, ext: extOf(fullPath), sha: null, isNew: true, dirty: true, draftTimer: null, source: "github" };
    buf.state = EditorState.create({ doc: "", extensions: extensionsFor(buf) });
    buffers.push(buf);
    switchToBuffer(buf.id);
    setStatus("New file — tap Save to create it on GitHub", "ok");
    closeDrawer();
  });

  els.newLocalFileBtn.addEventListener("click", function(){
    var name = prompt("New file path, relative to /" + (localCurrentPath || "") + ":", "");
    if (!name) return;
    var fullPath = (localCurrentPath ? localCurrentPath + "/" : "") + name.replace(/^\/+/, "");
    var existing = buffers.find(function(b){ return b.path === fullPath && b.source !== "github"; });
    if (existing){ switchToBuffer(existing.id); closeDrawer(); return; }
    var source = localDirHandle ? "local-fsa" : "local-webkit";
    var buf = { id: bufIdSeq++, path: fullPath, ext: extOf(fullPath), isNew: true, dirty: true, draftTimer: null, source: source };
    buf.state = EditorState.create({ doc: "", extensions: extensionsFor(buf) });
    buffers.push(buf);
    switchToBuffer(buf.id);
    setStatus(source === "local-fsa" ? "New file — tap Save to create it" : "New file — tap Save to download it, then add it to your folder manually", "ok");
    closeDrawer();
  });

  els.newFolderBtn.addEventListener("click", function(){
    var name = prompt("New folder name, inside /" + (gh.path || "") + ":", "");
    if (!name) return;
    var folder = (gh.path ? gh.path + "/" : "") + name.replace(/^\/+|\/+$/g, "");
    var fullPath = folder + "/.gitkeep";
    var existing = buffers.find(function(b){ return b.path === fullPath; });
    if (existing){ switchToBuffer(existing.id); closeDrawer(); return; }
    var buf = { id: bufIdSeq++, path: fullPath, ext: "", sha: null, isNew: true, dirty: true, draftTimer: null, source: "github" };
    buf.state = EditorState.create({ doc: "", extensions: extensionsFor(buf) });
    buffers.push(buf);
    switchToBuffer(buf.id);
    setStatus("New folder staged as " + fullPath + " — tap Save to create it", "ok");
    closeDrawer();
  });

  // ---------------- Save (with conflict check) ----------------
  els.saveBtn.addEventListener("click", function(){
    var buf = activeBuffer();
    if (!buf || !view){ setStatus("No file open", "err"); return; }
    buf.state = view.state;
    var content = buf.state.doc.toString();

    if (buf.source === "local-fsa"){
      setStatus("Saving to disk…");
      saveLocalFsa(buf, content).catch(function(err){ setStatus("Save failed: " + err.message, "err"); });
      return;
    }
    if (buf.source === "local-webkit"){
      saveLocalWebkitDownload(buf, content);
      return;
    }

    setStatus("Saving…");
    function finishSave(sha){
      return putRaw(buf.path, b64Encode(content), (buf.isNew ? "Add " : "Edit ") + buf.path + " via Modev Suite", sha)
        .then(function(data){
          buf.sha = data.content.sha; buf.isNew = false; buf.dirty = false;
          try{ localStorage.removeItem(draftKey(buf)); }catch(e){}
          els.fileLabel.classList.remove("dirty");
          els.fileLabel.textContent = buf.path;
          renderTabs();
          setStatus("Saved ✓", "ok");
        });
    }

    if (buf.isNew){
      finishSave(null).catch(function(err){ setStatus("Save failed: " + err.message, "err"); });
      return;
    }
    var url = API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(buf.path) + "?ref=" + encodeURIComponent(gh.branch);
    fetch(url, { headers: ghHeaders() })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(remote){
        if (remote && remote.sha !== buf.sha){
          if (!confirm("This file changed on GitHub since you opened it. Overwrite the remote version with yours anyway?")){
            setStatus("Save cancelled", "");
            return;
          }
          return finishSave(remote.sha);
        }
        return finishSave(buf.sha);
      })
      .catch(function(err){ setStatus("Save failed: " + err.message, "err"); });
  });

  els.formatBtn.addEventListener("click", function(){
    var buf = activeBuffer();
    if (!buf || !view) return;
    var cfg = prettierConfigFor(buf.ext);
    if (!cfg){ setStatus("No formatter for ." + buf.ext, "err"); return; }
    setStatus("Formatting…");
    prettier.format(view.state.doc.toString(), cfg)
      .then(function(out){
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: out } });
        setStatus("Formatted ✓", "ok");
      })
      .catch(function(err){ console.error("Prettier failed: " + err.message); setStatus("Format error: " + err.message.split("\n")[0], "err"); });
  });

  els.findBtn.addEventListener("click", function(){ if (view) openSearchPanel(view); });

  els.emmetBtn.addEventListener("click", function(){
    if (!view) return;
    var buf = activeBuffer();
    var pos = view.state.selection.main.head;
    var line = view.state.doc.lineAt(pos);
    var textBefore = line.text.slice(0, pos - line.from);
    var m = /([a-zA-Z0-9.#>*+^$@\[\]()="':_-]+)$/.exec(textBefore);
    if (!m){ setStatus("Cursor isn't after an abbreviation", "err"); return; }
    var abbr = m[1];
    var syntax = (buf && buf.ext === "css") ? "css" : "html";
    try{
      var expanded = expandEmmet(abbr, { syntax: syntax });
      var from = pos - abbr.length;
      view.dispatch({ changes: { from: from, to: pos, insert: expanded }, selection: { anchor: from + expanded.length } });
      view.focus();
    }catch(err){ setStatus("Emmet couldn't expand that", "err"); }
  });

  els.undoBtn.addEventListener("click", function(){ if (view) undo(view); });
  els.redoBtn.addEventListener("click", function(){ if (view) redo(view); });

  Array.prototype.slice.call(els.quickbar.querySelectorAll("button[data-ins]")).forEach(function(btn){
    btn.addEventListener("click", function(){
      if (!view) return;
      var ch = btn.getAttribute("data-ins");
      var pos = view.state.selection.main.head;
      view.dispatch({ changes: { from: pos, insert: ch }, selection: { anchor: pos + ch.length } });
      view.focus();
    });
  });

  els.fontUp.addEventListener("click", function(){ fontSize = Math.min(24, fontSize+1); applyFont(); });
  els.fontDown.addEventListener("click", function(){ fontSize = Math.max(10, fontSize-1); applyFont(); });
  function applyFont(){ document.documentElement.style.setProperty("--editor-fs", fontSize+"px"); try{ localStorage.setItem(FONT_KEY, String(fontSize)); }catch(e){} }

  function openDrawer(){ els.fileDrawer.classList.add("open"); els.fileDrawerBackdrop.classList.add("open"); }
  function closeDrawer(){ if (window.innerWidth <= 760){ els.fileDrawer.classList.remove("open"); els.fileDrawerBackdrop.classList.remove("open"); } }
  els.drawerToggle.addEventListener("click", function(){
    els.fileDrawer.classList.contains("open") ? closeDrawer() : openDrawer();
  });
  els.fileDrawerBackdrop.addEventListener("click", closeDrawer);

  // ---------------- More drawer ----------------
  function openMore(){ els.moreDrawer.classList.add("open"); els.moreBackdrop.classList.add("open"); }
  function closeMore(){ els.moreDrawer.classList.remove("open"); els.moreBackdrop.classList.remove("open"); }
  els.moreBtn.addEventListener("click", openMore);
  els.moreClose.addEventListener("click", closeMore);
  els.moreBackdrop.addEventListener("click", closeMore);

  els.newRepoBtn.addEventListener("click", function(){
    var name = prompt("New repo name:", "");
    if (!name) return;
    var isPrivate = confirm("Make it private? OK = private, Cancel = public");
    setStatus("Creating repo…");
    fetch(API + "/user/repos", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, ghHeaders()),
      body: JSON.stringify({ name: name, private: isPrivate, auto_init: true })
    })
      .then(function(res){ if (!res.ok) return res.json().then(function(d){ throw new Error(d.message || ("GitHub error " + res.status)); }); return res.json(); })
      .then(function(repo){
        setStatus("Repo \"" + repo.name + "\" created", "ok");
        closeMore();
        return loadRepos().then(function(){ els.repoSelect.value = repo.full_name; selectRepo(repo.full_name); });
      })
      .catch(function(err){ setStatus("Repo creation failed: " + err.message, "err"); });
  });

  // ------------------------------------------------------------------
  // Live preview + attached console — NOT a system terminal. It's a
  // sandboxed iframe rendering the file you're editing (HTML with its
  // linked <link>/<script> files inlined from the same repo folder, or
  // Markdown/images/video/PDF rendered directly), framed at a chosen
  // device size so you can check responsiveness — using the same size
  // presets as the Device Lab tab. Below it: a console showing that
  // preview's logs/errors, plus a small JS REPL. No shell, no
  // filesystem, no npm — that needs a real backend, which a local file
  // can't provide.
  // ------------------------------------------------------------------
  var PREVIEW_DEVICES = [
    { name: "Fit panel", w: 0, h: 0 },
    { name: "iPhone SE", w: 375, h: 667 },
    { name: "iPhone 14", w: 390, h: 844 },
    { name: "iPhone 14 Pro Max", w: 430, h: 932 },
    { name: "iPhone 17", w: 402, h: 874 },
    { name: "Pixel 7", w: 412, h: 915 },
    { name: "iPad Mini", w: 768, h: 1024 },
    { name: "iPad Pro 11\"", w: 834, h: 1194 },
    { name: "Laptop", w: 1366, h: 768 },
    { name: "Desktop 1080p", w: 1920, h: 1080 }
  ];
  PREVIEW_DEVICES.forEach(function(d, i){
    var opt = document.createElement("option");
    opt.value = i; opt.textContent = d.name + (d.w ? " (" + d.w + "×" + d.h + ")" : "");
    els.previewDeviceSelect.appendChild(opt);
  });
  var PREVIEW_DEVICE_KEY = "codeEditor.previewDevice";
  els.previewDeviceSelect.value = localStorage.getItem(PREVIEW_DEVICE_KEY) || 0;

  var IMAGE_EXT = /^(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
  var VIDEO_EXT = /^(mp4|webm|mov|ogg)$/i;
  var MIME_BY_EXT = { png:"image/png", jpg:"image/jpeg", jpeg:"image/jpeg", gif:"image/gif", webp:"image/webp",
    svg:"image/svg+xml", ico:"image/x-icon", bmp:"image/bmp", mp4:"video/mp4", webm:"video/webm", mov:"video/quicktime",
    pdf:"application/pdf" };

  var previewOpen = false;
  var previewDebounce = null;
  var consoleOpen = false;
  var unseenConsole = 0;

  function applyPreviewFrameSize(){
    var idx = parseInt(els.previewDeviceSelect.value, 10) || 0;
    var d = PREVIEW_DEVICES[idx];
    localStorage.setItem(PREVIEW_DEVICE_KEY, String(idx));
    if (!d.w){
      els.previewFrameHolder.classList.add("full");
      els.previewFrame.style.width = "100%"; els.previewFrame.style.height = "100%"; els.previewFrame.style.transform = "";
      els.previewImg.style.transform = ""; els.previewVideo.style.transform = "";
      return;
    }
    els.previewFrameHolder.classList.remove("full");
    var availW = els.previewStage.clientWidth - 32, availH = els.previewStage.clientHeight - 32;
    var scale = Math.min(1, availW / d.w, availH / d.h);
    els.previewFrame.style.width = d.w + "px"; els.previewFrame.style.height = d.h + "px";
    els.previewFrame.style.transform = "scale(" + scale + ")"; els.previewFrame.style.transformOrigin = "top left";
    els.previewFrameHolder.style.width = (d.w * scale) + "px"; els.previewFrameHolder.style.height = (d.h * scale) + "px";
  }
  els.previewDeviceSelect.addEventListener("change", applyPreviewFrameSize);
  window.addEventListener("resize", function(){ if (previewOpen) applyPreviewFrameSize(); });

  function resolveRelative(basePath, rel){
    if (/^https?:\/\//i.test(rel) || rel.indexOf("//") === 0) return null; // leave external URLs alone
    if (rel.charAt(0) === "/") return rel.slice(1).split("/").filter(Boolean).join("/"); // repo-root-relative
    var baseDir = basePath.split("/").slice(0, -1);
    rel.split("/").forEach(function(seg){
      if (seg === "." || seg === "") return;
      if (seg === "..") baseDir.pop(); else baseDir.push(seg);
    });
    return baseDir.join("/");
  }

  function fetchTextForPreview(path, source){
    // Prefer an already-open, possibly-unsaved buffer over the committed copy.
    var buf = buffers.find(function(b){ return b.path === path; });
    if (buf) return Promise.resolve(buf.id === activeId && view ? view.state.doc.toString() : buf.state.doc.toString());
    if (source === "local-fsa" || source === "local-webkit"){
      return getLocalBlob(path).then(function(blob){ return blob.text(); });
    }
    var url = API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(path) + "?ref=" + encodeURIComponent(gh.branch);
    return fetch(url, { headers: ghHeaders() }).then(function(r){ if (!r.ok) throw new Error("404"); return r.json(); })
      .then(function(d){ return b64Decode(d.content); });
  }
  function fetchRawBase64(path, source){
    if (source === "local-fsa" || source === "local-webkit"){
      return getLocalBlob(path).then(function(blob){
        return new Promise(function(resolve, reject){
          var r = new FileReader();
          r.onload = function(){ resolve(String(r.result).split(",")[1] || ""); };
          r.onerror = reject;
          r.readAsDataURL(blob);
        });
      });
    }
    var url = API + "/repos/" + gh.owner + "/" + gh.repo + "/contents/" + encodeApiPath(path) + "?ref=" + encodeURIComponent(gh.branch);
    return fetch(url, { headers: ghHeaders() }).then(function(r){ if (!r.ok) throw new Error("Couldn't load file (" + r.status + ")"); return r.json(); })
      .then(function(d){ return d.content.replace(/\n/g, ""); });
  }

  var CONSOLE_BRIDGE = '<script>(function(){' +
    'function post(level,args){try{parent.postMessage({__preview:true,level:level,text:Array.prototype.map.call(args,function(a){try{return typeof a==="string"?a:JSON.stringify(a);}catch(e){return String(a);}}).join(" ")},"*");}catch(e){}}' +
    '["log","warn","error","info"].forEach(function(l){var o=console[l]?console[l].bind(console):function(){};console[l]=function(){post(l,arguments);o.apply(console,arguments);};});' +
    'window.addEventListener("error",function(e){post("error",[e.message+" ("+e.lineno+":"+e.colno+")"]);});' +
    'window.addEventListener("unhandledrejection",function(e){post("error",["Unhandled rejection: "+(e.reason&&e.reason.message||e.reason)]);});' +
    '})();<' + '/script>';

  function buildPreviewHtml(buf){
    var html2 = buf.state.doc.toString();
    var fetches = [];
    html2 = html2.replace(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi, function(m, href){
      var resolved = resolveRelative(buf.path, href);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(fetchTextForPreview(resolved, buf.source).then(function(css){ return "<style>" + css + "</style>"; }).catch(function(){ return "<!-- couldn't load " + href + " -->"; }));
      return "@@INLINE" + idx + "@@";
    });
    html2 = html2.replace(/<script[^>]+src=["']([^"']+)["'][^>]*><\/script>/gi, function(m, src){
      var resolved = resolveRelative(buf.path, src);
      if (!resolved) return m;
      var idx = fetches.length;
      fetches.push(fetchTextForPreview(resolved, buf.source).then(function(js){ return "<script>" + js + "<" + "/script>"; }).catch(function(){ return "<!-- couldn't load " + src + " -->"; }));
      return "@@INLINE" + idx + "@@";
    });
    return Promise.all(fetches).then(function(parts){
      parts.forEach(function(part, i){ html2 = html2.replace("@@INLINE" + i + "@@", part); });
      if (/<head[^>]*>/i.test(html2)) html2 = html2.replace(/<head([^>]*)>/i, "<head$1>" + CONSOLE_BRIDGE);
      else html2 = CONSOLE_BRIDGE + html2;
      return html2;
    });
  }

  function buildMarkdownHtml(text){
    return import("https://esm.sh/marked@18.0.13").then(function(mod){
      var body = mod.marked.parse(text);
      return "<!DOCTYPE html><html><head><meta charset='utf-8'>" + CONSOLE_BRIDGE +
        "<style>body{font-family:-apple-system,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;line-height:1.6;color:#222;}" +
        "pre{background:#f4f4f4;padding:10px;border-radius:6px;overflow:auto;} code{background:#f4f4f4;padding:1px 4px;border-radius:3px;}" +
        "img{max-width:100%;} blockquote{border-left:3px solid #ccc;margin:0;padding-left:12px;color:#666;}</style></head>" +
        "<body>" + body + "</body></html>";
    });
  }

  function showFrame(which){
    els.previewFrame.style.display = which === "frame" ? "block" : "none";
    els.previewImg.style.display = which === "img" ? "block" : "none";
    els.previewVideo.style.display = which === "video" ? "block" : "none";
    if (which !== "video"){ els.previewVideo.pause && els.previewVideo.pause(); els.previewVideo.removeAttribute("src"); }
  }

  function refreshPreview(){
    var buf = activeBuffer();
    if (!buf) return;
    if (buf.id === activeId && view) buf.state = view.state;
    els.previewTitle.textContent = "Preview — " + buf.path;
    var ext = (buf.ext || "").toLowerCase();

    if (ext === "html" || ext === "htm"){
      showFrame("frame");
      buildPreviewHtml(buf).then(function(html2){ els.previewFrame.srcdoc = html2; applyPreviewFrameSize(); });
      return;
    }
    if (ext === "md" || ext === "markdown"){
      showFrame("frame");
      buildMarkdownHtml(buf.state.doc.toString()).then(function(html2){ els.previewFrame.srcdoc = html2; applyPreviewFrameSize(); });
      return;
    }
    if (IMAGE_EXT.test(ext)){
      showFrame("img");
      var mime = MIME_BY_EXT[ext] || "image/*";
      fetchRawBase64(buf.path, buf.source).then(function(b64){ els.previewImg.src = "data:" + mime + ";base64," + b64; els.previewFrameHolder.classList.add("full"); })
        .catch(function(err){ setStatus("Preview failed: " + err.message, "err"); });
      return;
    }
    if (VIDEO_EXT.test(ext)){
      showFrame("video");
      var vmime = MIME_BY_EXT[ext] || "video/mp4";
      fetchRawBase64(buf.path, buf.source).then(function(b64){ els.previewVideo.src = "data:" + vmime + ";base64," + b64; els.previewFrameHolder.classList.add("full"); })
        .catch(function(err){ setStatus("Preview failed: " + err.message, "err"); });
      return;
    }
    if (ext === "pdf"){
      showFrame("frame");
      fetchRawBase64(buf.path, buf.source).then(function(b64){
        els.previewFrame.removeAttribute("srcdoc");
        els.previewFrame.src = "data:application/pdf;base64," + b64;
        els.previewFrameHolder.classList.add("full");
      }).catch(function(err){ setStatus("Preview failed: " + err.message, "err"); });
      return;
    }
    showFrame("frame");
    els.previewFrame.srcdoc = "<body style='font-family:sans-serif;color:#888;padding:20px;'>No live preview for ." + (ext || "this file type") + " yet — HTML, Markdown, images, video, and PDF are supported.</body>";
    els.previewFrameHolder.classList.add("full");
  }

  function openPreview(){
    previewOpen = true;
    els.previewPane.classList.add("open");
    refreshPreview();
  }
  function closePreview(){ previewOpen = false; els.previewPane.classList.remove("open"); }
  els.previewBtn.addEventListener("click", function(){ previewOpen ? closePreview() : openPreview(); });
  els.previewCloseBtn.addEventListener("click", closePreview);
  els.previewRefresh.addEventListener("click", refreshPreview);

  function schedulePreviewRefresh(){
    if (!previewOpen) return;
    clearTimeout(previewDebounce);
    previewDebounce = setTimeout(refreshPreview, 700);
  }

  // ---------------- Collapsible console (hidden behind the floating ⌘ button) ----------------
  function openConsole(){ consoleOpen = true; els.consoleWrap.classList.add("open"); unseenConsole = 0; els.consoleBadge.classList.remove("show"); }
  function closeConsole(){ consoleOpen = false; els.consoleWrap.classList.remove("open"); }
  els.consoleToggle.addEventListener("click", function(){ consoleOpen ? closeConsole() : openConsole(); });
  els.consoleHideBtn.addEventListener("click", closeConsole);

  function logToConsole(level, text){
    var log = els.consoleLog;
    var line = document.createElement("div");
    line.className = "plog " + (level || "");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
    if (!consoleOpen){
      unseenConsole++;
      els.consoleBadge.textContent = unseenConsole > 9 ? "9+" : String(unseenConsole);
      els.consoleBadge.classList.add("show");
    }
  }
  window.addEventListener("message", function(e){
    if (e.data && e.data.__preview) logToConsole(e.data.level, e.data.text);
  });
  els.consoleClearBtn.addEventListener("click", function(){ els.consoleLog.innerHTML = ""; });
  els.replRun.addEventListener("click", runRepl);
  els.replInput.addEventListener("keydown", function(e){ if (e.key === "Enter") runRepl(); });
  function runRepl(){
    var code = els.replInput.value.trim();
    if (!code) return;
    logToConsole("", "> " + code);
    try{
      var win = els.previewFrame.contentWindow;
      var result = win.eval(code);
      logToConsole("result", typeof result === "undefined" ? "undefined" : (function(){ try{ return JSON.stringify(result); }catch(e){ return String(result); } })());
    }catch(err){
      logToConsole("error", err.message);
    }
    els.replInput.value = "";
  }

  window.addEventListener("beforeunload", function(e){
    if (buffers.some(function(b){ return b.dirty; })){ e.preventDefault(); e.returnValue = ""; }
  });

  // ---------------- Boot ----------------
  // The app itself is never gated — local folder editing needs no GitHub
  // connection at all. If a GitHub token is cached, that pane connects
  // instantly and quietly in the background; otherwise the GitHub pane
  // just shows its own inline "not connected" prompt, and Local folder
  // (the default tab) is immediately usable either way.
  var savedToken = null;
  try{ savedToken = localStorage.getItem(TOKEN_KEY); }catch(e){}
  if (savedToken){
    gh.token = savedToken;
    showScreen("ghConnected");
    loadRepos();
    var savedGhState = loadEditorState();
    if (savedGhState.owner && savedGhState.repo) els.sourceTabGh.click();
    fetch(API + "/user", { headers: { Authorization: "token " + savedToken } })
      .then(function(r){ if (!r.ok) throw new Error("invalid"); return r.json(); })
      .catch(function(){
        showScreen("ghDisconnected");
        setConnectStatus("Your saved token seems to be invalid or expired — please reconnect.", "err");
      });
  } else {
    showScreen("ghDisconnected");
  }
