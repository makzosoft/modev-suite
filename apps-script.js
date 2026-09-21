// All CodeMirror packages pinned to the SAME @codemirror/state + @codemirror/view
  // instance via ?deps= — mismatched versions of those two is the classic cause of
  // "editor renders but typing does nothing".
  import { EditorView, basicSetup } from "https://esm.sh/codemirror@6.0.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { EditorState, Compartment } from "https://esm.sh/@codemirror/state@6.7.4";
  import { html } from "https://esm.sh/@codemirror/lang-html@6.4.12?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { javascript } from "https://esm.sh/@codemirror/lang-javascript@6.2.5?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { json } from "https://esm.sh/@codemirror/lang-json@6.0.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark@6.1.3?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { indentUnit } from "https://esm.sh/@codemirror/language@6.12.4?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { undo, redo } from "https://esm.sh/@codemirror/commands@6.11.0?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { openSearchPanel } from "https://esm.sh/@codemirror/search@6.7.2?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";
  import { autocompletion } from "https://esm.sh/@codemirror/autocomplete@6.20.3?deps=@codemirror/state@6.7.4,@codemirror/view@6.43.11";

  "use strict";

  var DRIVE_API = "https://www.googleapis.com/drive/v3";
  var SCRIPT_API = "https://script.googleapis.com/v1";
  var SCOPES = "https://www.googleapis.com/auth/script.projects https://www.googleapis.com/auth/drive.metadata.readonly";
  var CLIENT_KEY = "appsScript.clientId";
  var TOKEN_KEY = "appsScript.accessToken";
  var TOKEN_EXP_KEY = "appsScript.tokenExpiresAt";
  var PROJECT_KEY = "appsScript.lastProject";
  var DRAFT_PREFIX = "appsScript.draft::";
  var FONT_KEY = "appsScript.fontSize";

  var els = {};
  ["connectScreen","clientIdInput","connectBtn","connectStatus","app",
   "drawerToggle","undoBtn","redoBtn","findTopBtn","projectSelect","fileLabel","saveBtn","topStatus",
   "moreBtn","moreBackdrop","moreDrawer","moreClose",
   "refreshProjectsBtn","newProjectBtn","openInEditorLink","scriptIdRow","scriptIdText","copyScriptIdBtn",
   "newFileBtn","renameFileBtn","deleteFileBtn","fontDown","fontUp","findBtn","disconnectBtn",
   "tabsBar","fileDrawerBackdrop","fileDrawer","fileFilter","fileTree",
   "editorHost","emptyEditor",
   "newFileBackdrop","newFileSheet","newFileCancel","newFileNameInput","tplGrid","newFileCreate",
   "diffBackdrop","diffSheet","diffClose","diffBody","diffOverwriteBtn","toast"
  ].forEach(function(id){ els[id] = document.getElementById(id); });

  // ---------------- Micro-interactions: ripple + toast ----------------
  document.addEventListener("pointerdown", function(e){
    var btn = e.target.closest && e.target.closest("button");
    if (!btn) return;
    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var span = document.createElement("span");
    span.className = "ripple";
    span.style.width = span.style.height = size + "px";
    span.style.left = (e.clientX - rect.left - size/2) + "px";
    span.style.top = (e.clientY - rect.top - size/2) + "px";
    btn.appendChild(span);
    setTimeout(function(){ span.remove(); }, 500);
  });

  var toastTimer = null;
  function showToast(msg, opts){
    opts = opts || {};
    clearTimeout(toastTimer);
    els.toast.innerHTML = "";
    var m = document.createElement("span"); m.className = "toast-msg"; m.textContent = msg;
    els.toast.appendChild(m);
    if (opts.actionLabel){
      var b = document.createElement("button");
      b.textContent = opts.actionLabel;
      b.addEventListener("click", function(){ hideToast(); if (opts.onAction) opts.onAction(); });
      els.toast.appendChild(b);
    }
    els.toast.classList.add("show");
    toastTimer = setTimeout(hideToast, opts.duration || 4000);
  }
  function hideToast(){ els.toast.classList.remove("show"); clearTimeout(toastTimer); }

  // ---------------- Auth state ----------------
  var tokenClient = null;
  var tokenClientId = null;
  var accessToken = null;
  var tokenExpiresAt = 0;
  var pendingResolve = null, pendingReject = null, pendingTokenPromise = null;

  function setConnectStatus(msg, kind){ els.connectStatus.textContent = msg||""; els.connectStatus.className = kind||""; }
  function setStatus(msg, kind){ els.topStatus.textContent = msg||""; els.topStatus.className = kind||""; }

  function showApp(){
    els.connectScreen.style.display = "none";
    els.app.classList.add("show");
  }
  function showConnect(msg, kind){
    els.app.classList.remove("show");
    els.connectScreen.style.display = "block";
    if (msg) setConnectStatus(msg, kind);
  }

  function persistToken(){
    try{
      localStorage.setItem(TOKEN_KEY, accessToken);
      localStorage.setItem(TOKEN_EXP_KEY, String(tokenExpiresAt));
    }catch(e){}
  }
  function clearPersistedToken(){
    try{ localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(TOKEN_EXP_KEY); }catch(e){}
  }

  // Waits (polling) for the Google Identity Services script to finish loading,
  // since it's tagged async/defer and may not be ready the instant our module runs.
  function whenGoogleReady(timeoutMs){
    return new Promise(function(resolve, reject){
      var waited = 0, step = 100;
      (function poll(){
        if (window.google && google.accounts && google.accounts.oauth2){ resolve(); return; }
        waited += step;
        if (waited >= timeoutMs){ reject(new Error("Google's sign-in library didn't load in time.")); return; }
        setTimeout(poll, step);
      })();
    });
  }

  function initTokenClient(clientId){
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: function(resp){
        if (resp.error){
          if (pendingReject){ pendingReject(new Error(resp.error)); pendingResolve = pendingReject = null; }
          setConnectStatus("Sign-in failed: " + resp.error, "err");
          return;
        }
        accessToken = resp.access_token;
        tokenExpiresAt = Date.now() + (parseInt(resp.expires_in, 10) || 3600) * 1000 - 60000;
        persistToken();
        if (pendingResolve){ pendingResolve(accessToken); pendingResolve = pendingReject = null; }
        setConnectStatus("Signed in.", "ok");
        showApp();
      }
    });
    tokenClientId = clientId;
  }

  // Requests (or silently renews) a token through the shared tokenClient, as a promise.
  // promptMode "" asks Google to skip the account picker/consent screen when it can
  // (works when the browser still has an active Google session that already granted
  // these scopes); omit it entirely for an explicit, user-clicked sign-in.
  function requestToken(promptMode){
    if (pendingTokenPromise) return pendingTokenPromise;
    pendingTokenPromise = new Promise(function(resolve, reject){
      pendingResolve = resolve; pendingReject = reject;
      try{
        tokenClient.requestAccessToken(promptMode === undefined ? {} : { prompt: promptMode });
      }catch(e){ pendingResolve = pendingReject = null; reject(e); return; }
      setTimeout(function(){
        if (pendingReject){ pendingReject(new Error("Sign-in timed out.")); pendingResolve = pendingReject = null; }
      }, 12000);
    }).finally(function(){ pendingTokenPromise = null; });
    return pendingTokenPromise;
  }

  function ensureFreshToken(){
    if (accessToken && Date.now() < tokenExpiresAt) return Promise.resolve(accessToken);
    if (!tokenClient) return Promise.reject(new Error("Not signed in."));
    return requestToken("");
  }

  els.connectBtn.addEventListener("click", function(){
    var clientId = els.clientIdInput.value.trim();
    if (!clientId){ setConnectStatus("Paste your OAuth Client ID first.", "err"); return; }
    try{ localStorage.setItem(CLIENT_KEY, clientId); }catch(e){}
    setConnectStatus("Loading Google's sign-in library…");
    whenGoogleReady(6000).then(function(){
      setConnectStatus("Opening Google sign-in…");
      if (!tokenClient || tokenClientId !== clientId) initTokenClient(clientId);
      requestToken().then(function(){ listProjects(); }).catch(function(err){
        setConnectStatus(err.message, "err");
      });
    }).catch(function(err){
      setConnectStatus(err.message + " Try again in a moment.", "err");
    });
  });
  els.clientIdInput.addEventListener("keydown", function(e){ if (e.key === "Enter") els.connectBtn.click(); });

  els.disconnectBtn.addEventListener("click", function(){
    if (!confirm("Disconnect from Google? You'll stay signed out until you sign in again — here or in Settings.")) return;
    if (accessToken){
      fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(accessToken), {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }).catch(function(){});
    }
    accessToken = null; tokenExpiresAt = 0;
    clearPersistedToken();
    projects = []; currentProjectId = null; files = []; openOrder = [];
    els.projectSelect.innerHTML = '<option value="">Project…</option>';
    els.scriptIdRow.style.display = "none";
    els.openInEditorLink.style.display = "none";
    resetEditorEmpty();
    closeMore();
    showConnect("Disconnected.", "ok");
  });

  // ---------------- API helper ----------------
  function apiFetch(url, opts){
    opts = opts || {};
    return ensureFreshToken().then(function(token){
      opts.headers = Object.assign({ Authorization: "Bearer " + token }, opts.headers || {});
      return fetch(url, opts);
    }, function(err){
      showConnect(err.message === "Not signed in." ? undefined : "Your session expired — sign in again.", "err");
      throw err;
    }).then(function(res){
      if (res.status === 401){
        // Token looked fresh by our clock but Google rejected it anyway (revoked
        // elsewhere, clock skew, etc.) — try one silent renewal, then give up.
        accessToken = null; tokenExpiresAt = 0;
        return requestToken("").then(function(freshToken){
          opts.headers.Authorization = "Bearer " + freshToken;
          return fetch(url, opts);
        }).catch(function(){
          clearPersistedToken();
          showConnect("Your session expired — sign in again.", "err");
          throw new Error("401: session expired");
        });
      }
      if (!res.ok){
        return res.json().catch(function(){ return {}; }).then(function(d){
          throw new Error((d.error && d.error.message) || ("Google API error " + res.status));
        });
      }
      return res.status === 204 ? null : res.json();
    });
  }

  // ---------------- File type <-> extension ----------------
  function extForType(type){
    if (type === "HTML") return "html";
    if (type === "JSON") return "json";
    return "gs";
  }
  function typeForExt(ext){
    ext = (ext||"").toLowerCase();
    if (ext === "html" || ext === "htm") return "HTML";
    if (ext === "json") return "JSON";
    return "SERVER_JS";
  }
  function displayName(f){ return f.name + "." + extForType(f.type); }
  function defaultSourceFor(type){
    if (type === "HTML") return "<!DOCTYPE html>\n<html>\n  <head>\n    <base target=\"_top\">\n  </head>\n  <body>\n    \n  </body>\n</html>\n";
    if (type === "JSON") return "{\n  \n}\n";
    return "function myFunction() {\n  \n}\n";
  }
  function langExtensionFor(type){
    if (type === "HTML") return html();
    if (type === "JSON") return json();
    return javascript();
  }

  // ---------------- Local drafts (unsaved-edit safety net) ----------------
  function draftKey(projectId, name, type){ return DRAFT_PREFIX + projectId + "::" + name + "." + extForType(type); }
  function saveDraft(f){
    if (!currentProjectId || !f.state) return;
    try{ localStorage.setItem(draftKey(currentProjectId, f.name, f.type), f.state.doc.toString()); }catch(e){}
  }
  function clearDraft(name, type){
    if (!currentProjectId) return;
    try{ localStorage.removeItem(draftKey(currentProjectId, name, type)); }catch(e){}
  }
  function readDraft(name, type){
    if (!currentProjectId) return null;
    try{ return localStorage.getItem(draftKey(currentProjectId, name, type)); }catch(e){ return null; }
  }

  // ---------------- Project + file state ----------------
  var projects = [];
  var currentProjectId = null;
  var currentProjectName = "";
  var files = [];       // { localId, name, type, source, updateTime, state, open, dirty, isNew, draftTimer }
  var fileIdSeq = 1;
  var openOrder = [];   // localIds of open tabs, in order
  var activeLocalId = null;
  var view = null;
  var fontSize = parseInt(localStorage.getItem(FONT_KEY) || "14", 10);
  document.documentElement.style.setProperty("--editor-fs", fontSize + "px");

  function fileById(id){ return files.find(function(f){ return f.localId === id; }); }
  function activeFile(){ return activeLocalId != null ? fileById(activeLocalId) : null; }

  // ---------------- Projects ----------------
  function listProjects(){
    setStatus("Loading projects…");
    return apiFetch(DRIVE_API + "/files?q=" + encodeURIComponent("mimeType='application/vnd.google-apps.script' and trashed=false") + "&pageSize=200&fields=" + encodeURIComponent("files(id,name)") + "&orderBy=name")
      .then(function(data){
        projects = (data && data.files) || [];
        renderProjectOptions();
        setStatus(projects.length + " project" + (projects.length===1?"":"s"), "ok");
        var saved = null;
        try{ saved = localStorage.getItem(PROJECT_KEY); }catch(e){}
        var target = (saved && projects.some(function(p){ return p.id === saved; })) ? saved : (projects[0] && projects[0].id);
        if (target){ els.projectSelect.value = target; loadProject(target); }
        return projects;
      })
      .catch(function(err){ if (!/401/.test(err.message)) setStatus(err.message, "err"); });
  }
  function renderProjectOptions(){
    els.projectSelect.innerHTML = '<option value="">Project…</option>';
    projects.forEach(function(p){
      var opt = document.createElement("option"); opt.value = p.id; opt.textContent = p.name;
      els.projectSelect.appendChild(opt);
    });
  }
  els.projectSelect.addEventListener("change", function(){
    if (!els.projectSelect.value) return;
    if (hasUnsavedChanges() && !confirm("Switch projects? Unsaved changes in the current project will be lost.")) {
      els.projectSelect.value = currentProjectId || "";
      return;
    }
    loadProject(els.projectSelect.value);
  });
  els.refreshProjectsBtn.addEventListener("click", function(){ closeMore(); listProjects(); });

  function hasUnsavedChanges(){ return files.some(function(f){ return f.dirty; }); }

  function loadProject(id){
    setStatus("Loading project…");
    apiFetch(SCRIPT_API + "/projects/" + id + "/content").then(function(data){
      currentProjectId = id;
      var proj = projects.find(function(p){ return p.id === id; });
      currentProjectName = proj ? proj.name : id;
      try{ localStorage.setItem(PROJECT_KEY, id); }catch(e){}
      els.openInEditorLink.href = "https://script.google.com/d/" + id + "/edit";
      els.openInEditorLink.style.display = "flex";
      els.scriptIdText.textContent = "ID: " + id;
      els.scriptIdRow.style.display = "flex";

      if (view){ view.destroy(); view = null; }
      files = []; openOrder = []; activeLocalId = null; deletedBackup = null;
      (data.files || []).forEach(function(f){
        files.push({ localId: fileIdSeq++, name: f.name, type: f.type, source: f.source || "", updateTime: f.updateTime || null, state: null, open: false, dirty: false, isNew: false, draftTimer: null });
      });
      renderFileTree();
      resetEditorEmpty();
      setStatus("Loaded " + currentProjectName, "ok");
      closeDrawer();

      var codeFile = files.find(function(f){ return f.type === "SERVER_JS"; }) || files[0];
      if (codeFile) openFile(codeFile.localId);
    }).catch(function(err){ if (!/401/.test(err.message)) setStatus(err.message, "err"); });
  }

  els.newProjectBtn.addEventListener("click", function(){
    closeMore();
    var title = prompt("New Apps Script project name:", "");
    if (!title) return;
    setStatus("Creating project…");
    apiFetch(SCRIPT_API + "/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: title })
    }).then(function(proj){
      var manifest = { timeZone: "Etc/UTC", dependencies: {}, exceptionLogging: "STACKDRIVER", runtimeVersion: "V8" };
      return apiFetch(SCRIPT_API + "/projects/" + proj.scriptId + "/content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: [
          { name: "appsscript", type: "JSON", source: JSON.stringify(manifest, null, 2) },
          { name: "Code", type: "SERVER_JS", source: defaultSourceFor("SERVER_JS") }
        ] })
      }).then(function(){ return proj.scriptId; });
    }).then(function(scriptId){
      setStatus("Project created", "ok");
      return listProjects().then(function(){
        els.projectSelect.value = scriptId;
        loadProject(scriptId);
      });
    }).catch(function(err){ if (!/401/.test(err.message)) setStatus(err.message, "err"); });
  });

  // ---------------- File tree ----------------
  function fileText(f){ return f.state ? f.state.doc.toString() : f.source; }
  function renderFileTree(){
    els.fileTree.innerHTML = "";
    var filterText = els.fileFilter.value.trim().toLowerCase();
    var filtered;
    if (!filterText){
      filtered = files.slice().sort(function(a,b){ return displayName(a).localeCompare(displayName(b)); });
    } else {
      filtered = files.map(function(f){
        var nameHit = displayName(f).toLowerCase().indexOf(filterText) !== -1;
        var contentHit = !nameHit && fileText(f).toLowerCase().indexOf(filterText) !== -1;
        return { f: f, nameHit: nameHit, contentHit: contentHit };
      }).filter(function(x){ return x.nameHit || x.contentHit; })
        .sort(function(a,b){
          if (a.nameHit !== b.nameHit) return a.nameHit ? -1 : 1; // file-name matches surface first
          return displayName(a.f).localeCompare(displayName(b.f));
        })
        .map(function(x){ x.f.__contentMatch = x.contentHit; return x.f; });
    }
    if (!filtered.length){
      var empty = document.createElement("div");
      empty.style.cssText = "color:var(--muted);font-size:12px;padding:10px;";
      empty.textContent = filterText ? "No matches." : (currentProjectId ? "No files yet — create one." : "Pick a project first.");
      els.fileTree.appendChild(empty);
      return;
    }
    filtered.forEach(function(f){
      var row = document.createElement("div");
      row.className = "row-item";
      var badge = f.__contentMatch ? '<span class="match-badge">in file</span>' : '<span class="type-badge">' + extForType(f.type) + '</span>';
      row.innerHTML = '<span data-icon="file"></span><span class="nm">' + escHtml(displayName(f)) + (f.dirty ? " •" : "") + '</span>' + badge;
      row.addEventListener("click", function(){ openFile(f.localId); });
      var renBtn = document.createElement("button");
      renBtn.className = "row-btn"; renBtn.title = "Rename this file";
      renBtn.innerHTML = '<span data-icon="edit"></span>';
      renBtn.addEventListener("click", function(e){ e.stopPropagation(); renameFile(f.localId); });
      row.appendChild(renBtn);
      var delBtn = document.createElement("button");
      delBtn.className = "del-file-btn"; delBtn.title = "Delete this file";
      delBtn.innerHTML = '<span data-icon="trash"></span>';
      delBtn.addEventListener("click", function(e){ e.stopPropagation(); deleteFile(f.localId); });
      row.appendChild(delBtn);
      els.fileTree.appendChild(row);
    });
  }
  els.fileFilter.addEventListener("input", renderFileTree);

  var FILE_TEMPLATES = {
    "blank-gs": { type: "SERVER_JS", defaultName: "Code", source: function(){ return defaultSourceFor("SERVER_JS"); } },
    "onOpen": { type: "SERVER_JS", defaultName: "Triggers", source: function(){
      return "function onOpen() {\n  // Runs automatically when the bound spreadsheet/doc/form opens.\n  // e.g. SpreadsheetApp.getUi().createMenu('My Menu').addItem('Run', 'myFunction').addToUi();\n}\n";
    }},
    "doGet": { type: "SERVER_JS", defaultName: "WebApp", source: function(){
      return "function doGet(e) {\n  return HtmlService.createHtmlOutput('<h1>Hello!</h1>');\n}\n";
    }},
    "blank-html": { type: "HTML", defaultName: "Page", source: function(){ return defaultSourceFor("HTML"); } },
    "blank-json": { type: "JSON", defaultName: "Config", source: function(){ return defaultSourceFor("JSON"); } }
  };
  var selectedTpl = "blank-gs";

  function openNewFileSheet(){
    selectedTpl = "blank-gs";
    Array.prototype.forEach.call(els.tplGrid.children, function(b){ b.classList.toggle("active", b.getAttribute("data-tpl") === selectedTpl); });
    els.newFileNameInput.value = suggestName(FILE_TEMPLATES[selectedTpl]);
    els.newFileBackdrop.classList.add("open");
    els.newFileSheet.classList.add("open");
    setTimeout(function(){ els.newFileNameInput.focus(); els.newFileNameInput.select(); }, 150);
  }
  function closeNewFileSheet(){
    els.newFileBackdrop.classList.remove("open");
    els.newFileSheet.classList.remove("open");
  }
  function suggestName(tpl){
    var n = tpl.defaultName, i = 1;
    while (files.some(function(f){ return f.name === n && f.type === tpl.type; })){ n = tpl.defaultName + i; i++; }
    return n;
  }
  Array.prototype.forEach.call(els.tplGrid.children, function(b){
    b.addEventListener("click", function(){
      selectedTpl = b.getAttribute("data-tpl");
      Array.prototype.forEach.call(els.tplGrid.children, function(x){ x.classList.toggle("active", x === b); });
      els.newFileNameInput.value = suggestName(FILE_TEMPLATES[selectedTpl]);
      els.newFileNameInput.select();
    });
  });
  els.newFileBtn.addEventListener("click", function(){
    closeMore();
    if (!currentProjectId){ setStatus("Pick a project first.", "err"); return; }
    openNewFileSheet();
  });
  els.newFileCancel.addEventListener("click", closeNewFileSheet);
  els.newFileBackdrop.addEventListener("click", closeNewFileSheet);
  els.newFileNameInput.addEventListener("keydown", function(e){ if (e.key === "Enter") els.newFileCreate.click(); });
  els.newFileCreate.addEventListener("click", function(){
    var tpl = FILE_TEMPLATES[selectedTpl];
    var input = els.newFileNameInput.value.trim();
    if (!input){ els.newFileNameInput.focus(); return; }
    var dot = input.lastIndexOf(".");
    var base = dot === -1 ? input : input.slice(0, dot);
    var type = dot === -1 ? tpl.type : typeForExt(input.slice(dot + 1));
    if (type === "JSON" && base.toLowerCase() === "appsscript" && files.some(function(f){ return f.type==="JSON" && f.name.toLowerCase()==="appsscript"; })){
      alert("This project already has a manifest (appsscript.json).");
      return;
    }
    if (files.some(function(f){ return f.name === base && f.type === type; })){
      alert("A file with that name already exists.");
      return;
    }
    var f = { localId: fileIdSeq++, name: base, type: type, source: tpl.source(), updateTime: null, state: null, open: false, dirty: true, isNew: true, draftTimer: null };
    files.push(f);
    renderFileTree();
    closeNewFileSheet();
    openFile(f.localId);
  });

  var deletedBackup = null; // { file, filesIndex, openOrderIndex, wasActive } — single-slot undo
  function deleteFile(localId){
    var idx = files.findIndex(function(x){ return x.localId === localId; });
    if (idx === -1) return;
    var f = files[idx];
    if (f.type === "JSON" && f.name.toLowerCase() === "appsscript"){
      alert("The manifest (appsscript.json) can't be deleted.");
      return;
    }
    clearDraft(f.name, f.type);
    var openIdx = openOrder.indexOf(localId);
    var wasActive = activeLocalId === localId;
    files.splice(idx, 1);
    if (openIdx !== -1) openOrder.splice(openIdx, 1);
    if (wasActive){
      activeLocalId = null;
      if (openOrder.length) switchToBuffer(openOrder[openOrder.length - 1]);
      else resetEditorEmpty();
    }
    renderFileTree();
    renderTabs();
    deletedBackup = { file: f, filesIndex: idx, openOrderIndex: openIdx, wasActive: wasActive };
    showToast("Deleted " + displayName(f), { actionLabel: "Undo", duration: 6000, onAction: undoDelete });
    setStatus("Deleted — click Save to apply", "ok");
  }
  function undoDelete(){
    if (!deletedBackup) return;
    var b = deletedBackup; deletedBackup = null;
    files.splice(Math.min(b.filesIndex, files.length), 0, b.file);
    if (b.openOrderIndex !== -1) openOrder.splice(Math.min(b.openOrderIndex, openOrder.length), 0, b.file.localId);
    renderFileTree();
    if (b.wasActive) switchToBuffer(b.file.localId); else renderTabs();
    setStatus("Restored " + displayName(b.file), "ok");
  }
  els.deleteFileBtn.addEventListener("click", function(){ closeMore(); if (activeLocalId != null) deleteFile(activeLocalId); else setStatus("No file open.", "err"); });

  function renameFile(localId){
    var f = fileById(localId);
    if (!f) return;
    var wasManifest = f.type === "JSON" && f.name.toLowerCase() === "appsscript";
    var input = prompt("Rename to:", displayName(f));
    if (!input || input === displayName(f)) return;
    var dot = input.lastIndexOf(".");
    var base = dot === -1 ? input : input.slice(0, dot);
    var ext = dot === -1 ? extForType(f.type) : input.slice(dot + 1);
    var type = typeForExt(ext);
    if (files.some(function(x){ return x.localId !== localId && x.name === base && x.type === type; })){
      alert("A file with that name already exists.");
      return;
    }
    if (wasManifest && !(type === "JSON" && base.toLowerCase() === "appsscript")){
      if (!confirm("This is the project's manifest — renaming it away from appsscript.json will leave the project without one. Continue?")) return;
    }
    var oldName = f.name, oldType = f.type;
    var typeChanged = type !== f.type;
    f.name = base; f.type = type; f.dirty = true;
    clearDraft(oldName, oldType);
    clearTimeout(f.draftTimer);
    if (typeChanged && f.state){
      // Language mode is baked into the extensions at buffer-creation time, so a type
      // change needs a fresh EditorState — same text, new syntax highlighting/lang support.
      var doc = f.state.doc.toString();
      f.state = EditorState.create({ doc: doc, extensions: extensionsFor(f) });
      if (f.localId === activeLocalId && view) view.setState(f.state);
    }
    renderFileTree();
    renderTabs();
    if (f.localId === activeLocalId){
      els.fileLabel.textContent = displayName(f) + (f.isNew ? " (not saved yet)" : "");
      els.fileLabel.classList.add("dirty");
    }
    setStatus("Renamed — click Save to apply", "ok");
  }
  els.renameFileBtn.addEventListener("click", function(){ closeMore(); if (activeLocalId != null) renameFile(activeLocalId); else setStatus("No file open.", "err"); });

  // ---------------- Editor / tabs ----------------
  function extensionsFor(f){
    var exts = [basicSetup, oneDark, indentUnit.of("  "), EditorView.lineWrapping,
      autocompletion({ tooltipClass: function(){ return "cm-suggest-top"; }, activateOnTyping: true }),
      EditorView.updateListener.of(function(u){
        if (!u.docChanged) return;
        f.dirty = true;
        els.fileLabel.classList.toggle("dirty", f.localId === activeLocalId);
        renderTabs();
        renderFileTree();
        f.state = u.state; // keep in sync so a debounced draft save always has the latest text
        clearTimeout(f.draftTimer);
        f.draftTimer = setTimeout(function(){ saveDraft(f); }, 600);
      })];
    exts.push(langExtensionFor(f.type));
    return exts;
  }

  function renderTabs(){
    els.tabsBar.innerHTML = "";
    openOrder.forEach(function(id){
      var f = fileById(id);
      if (!f) return;
      var chip = document.createElement("div");
      chip.className = "tab-chip" + (f.localId === activeLocalId ? " active" : "");
      chip.innerHTML = (f.dirty ? '<span class="dot"></span>' : '') + '<span>' + escHtml(displayName(f)) + (f.isNew ? " (new)" : "") + '</span>';
      var x = document.createElement("span");
      x.className = "x"; x.innerHTML = '<span data-icon="x"></span>';
      x.addEventListener("click", function(e){ e.stopPropagation(); closeTab(f.localId); });
      chip.appendChild(x);
      chip.addEventListener("click", function(){ if (f.localId !== activeLocalId) switchToBuffer(f.localId); });
      els.tabsBar.appendChild(chip);
    });
    refreshSaveIndicator();
  }
  function refreshSaveIndicator(){
    els.saveBtn.classList.toggle("pending", hasUnsavedChanges());
  }

  function switchToBuffer(localId){
    var f = fileById(localId);
    if (!f) return;
    if (activeLocalId != null && view){
      var prev = fileById(activeLocalId);
      if (prev) prev.state = view.state;
    }
    activeLocalId = localId;
    if (!view){
      els.editorHost.innerHTML = "";
      view = new EditorView({ state: f.state, parent: els.editorHost });
    } else {
      view.setState(f.state);
    }
    els.fileLabel.textContent = displayName(f) + (f.isNew ? " (not saved yet)" : "");
    els.fileLabel.classList.toggle("dirty", !!f.dirty);
    renderTabs();
  }

  function closeTab(localId){
    openOrder = openOrder.filter(function(id){ return id !== localId; });
    var f = fileById(localId);
    if (f) f.open = false;
    if (activeLocalId === localId){
      activeLocalId = null;
      if (openOrder.length) switchToBuffer(openOrder[openOrder.length - 1]);
      else resetEditorEmpty();
    }
    renderTabs();
  }

  function resetEditorEmpty(){
    if (view){ view.destroy(); view = null; }
    els.editorHost.innerHTML = "";
    els.editorHost.appendChild(els.emptyEditor);
    els.fileLabel.textContent = "No file open";
    els.fileLabel.classList.remove("dirty");
  }

  function openFile(localId){
    var f = fileById(localId);
    if (!f) return;
    if (!f.open){
      if (!f.state){
        var initialDoc = f.source;
        if (!f.isNew){
          var draft = readDraft(f.name, f.type);
          if (draft != null && draft !== f.source){
            if (confirm("Found an unsaved local draft for " + displayName(f) + " from a previous session. Restore it instead of the version loaded from Google?")){
              initialDoc = draft;
            } else {
              clearDraft(f.name, f.type);
            }
          }
        }
        f.state = EditorState.create({ doc: initialDoc, extensions: extensionsFor(f) });
        if (initialDoc !== f.source){ f.dirty = true; renderFileTree(); }
      }
      f.open = true;
      openOrder.push(localId);
    }
    switchToBuffer(localId);
    closeDrawer();
  }

  // ---------------- Save ----------------
  // ---------------- Diff (simple LCS line-diff for the conflict sheet) ----------------
  function escHtml(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function diffLines(oldText, newText){
    var a = oldText.split("\n"), b = newText.split("\n");
    if (a.length > 1500 || b.length > 1500) return null; // too large — caller shows a fallback message
    var n = a.length, m = b.length;
    var dp = new Array(n + 1);
    for (var i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
    for (i = n - 1; i >= 0; i--){
      for (var j = m - 1; j >= 0; j--){
        dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    var ops = []; i = 0; j = 0;
    while (i < n && j < m){
      if (a[i] === b[j]){ ops.push({ type: "eq", line: a[i] }); i++; j++; }
      else if (dp[i+1][j] >= dp[i][j+1]){ ops.push({ type: "del", line: a[i] }); i++; }
      else { ops.push({ type: "add", line: b[j] }); j++; }
    }
    while (i < n){ ops.push({ type: "del", line: a[i] }); i++; }
    while (j < m){ ops.push({ type: "add", line: b[j] }); j++; }
    return ops;
  }
  function renderDiffHtml(ops){
    if (ops === null) return '<div class="diff-line skip">File is too large to preview a diff for — the content differs.</div>';
    var CTX = 2, html = "", i = 0;
    while (i < ops.length){
      if (ops[i].type === "eq"){
        var j = i;
        while (j < ops.length && ops[j].type === "eq") j++;
        var runLen = j - i, k;
        if (runLen > CTX * 2 + 1){
          for (k = 0; k < CTX; k++) html += '<div class="diff-line ctx">  ' + escHtml(ops[i+k].line) + "</div>";
          html += '<div class="diff-line skip">\u2026 ' + (runLen - CTX*2) + " unchanged lines \u2026</div>";
          for (k = runLen - CTX; k < runLen; k++) html += '<div class="diff-line ctx">  ' + escHtml(ops[i+k].line) + "</div>";
        } else {
          for (k = 0; k < runLen; k++) html += '<div class="diff-line ctx">  ' + escHtml(ops[i+k].line) + "</div>";
        }
        i = j;
      } else {
        html += '<div class="diff-line ' + (ops[i].type === "add" ? "add" : "del") + '">' + (ops[i].type === "add" ? "+ " : "- ") + escHtml(ops[i].line) + "</div>";
        i++;
      }
    }
    return html || '<div class="diff-line skip">No visible line changes.</div>';
  }
  function openDiffSheet(changedPairs, onProceed){
    els.diffBody.innerHTML = "";
    changedPairs.forEach(function(pair){
      var box = document.createElement("div");
      box.className = "diff-file";
      var head = document.createElement("div");
      head.className = "diff-file-head";
      head.textContent = displayName(pair.local) + " — left: current Google version, right: your version";
      box.appendChild(head);
      var lines = document.createElement("div");
      lines.className = "diff-lines";
      lines.innerHTML = renderDiffHtml(diffLines(pair.remoteSource, pair.localSource));
      box.appendChild(lines);
      els.diffBody.appendChild(box);
    });
    els.diffBackdrop.classList.add("open");
    els.diffSheet.classList.add("open");
    function close(){ els.diffBackdrop.classList.remove("open"); els.diffSheet.classList.remove("open"); }
    els.diffOverwriteBtn.onclick = function(){ close(); onProceed(); };
    els.diffClose.onclick = function(){ close(); setStatus("Save cancelled — reload the project to see the latest version.", "err"); };
    els.diffBackdrop.onclick = els.diffClose.onclick;
  }

  function performSave(){
    setStatus("Saving…");
    var payload = { files: files.map(function(x){
      var source = x.state ? x.state.doc.toString() : x.source;
      return { name: x.name, type: x.type, source: source };
    }) };
    apiFetch(SCRIPT_API + "/projects/" + currentProjectId + "/content", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function(saved){
      var savedFiles = (saved && saved.files) || [];
      files.forEach(function(x){
        clearDraft(x.name, x.type);
        x.dirty = false; x.isNew = false;
        if (x.state) x.source = x.state.doc.toString();
        var match = savedFiles.find(function(r){ return r.name === x.name && r.type === x.type; });
        if (match && match.updateTime) x.updateTime = match.updateTime;
      });
      renderTabs();
      renderFileTree();
      var af = activeFile();
      if (af) els.fileLabel.classList.remove("dirty");
      setStatus("Saved", "ok");
      showToast("Saved " + files.length + " file" + (files.length===1?"":"s"), { duration: 2200 });
      els.saveBtn.classList.remove("flash-ok"); void els.saveBtn.offsetWidth; els.saveBtn.classList.add("flash-ok");
    }).catch(function(err){ if (!/401/.test(err.message||"")) setStatus(err.message, "err"); });
  }

  els.saveBtn.addEventListener("click", function(){
    if (!currentProjectId){ setStatus("Pick a project first.", "err"); return; }
    if (activeLocalId != null && view){
      var f = fileById(activeLocalId);
      if (f) f.state = view.state;
    }
    if (!files.length){ setStatus("Nothing to save.", "err"); return; }
    var manifestPresent = files.some(function(x){ return x.type === "JSON" && x.name.toLowerCase() === "appsscript"; });
    if (!manifestPresent && !confirm("This project has no appsscript.json manifest — Apps Script requires one. Save anyway?")) return;

    setStatus("Checking for remote changes…");
    apiFetch(SCRIPT_API + "/projects/" + currentProjectId + "/content").then(function(remote){
      var remoteFiles = (remote && remote.files) || [];
      var changedPairs = [];
      files.forEach(function(x){
        if (x.isNew || !x.updateTime) return;
        var match = remoteFiles.find(function(r){ return r.name === x.name && r.type === x.type; });
        if (match && match.updateTime && match.updateTime !== x.updateTime){
          changedPairs.push({ local: x, localSource: x.state ? x.state.doc.toString() : x.source, remoteSource: match.source || "" });
        }
      });
      if (changedPairs.length) openDiffSheet(changedPairs, performSave);
      else performSave();
    }).catch(function(err){ if (!/401/.test(err.message||"")) setStatus(err.message, "err"); });
  });

  // ---------------- Font size / search / undo-redo ----------------
  els.fontUp.addEventListener("click", function(){ fontSize = Math.min(24, fontSize+1); applyFont(); });
  els.fontDown.addEventListener("click", function(){ fontSize = Math.max(10, fontSize-1); applyFont(); });
  function applyFont(){ document.documentElement.style.setProperty("--editor-fs", fontSize+"px"); try{ localStorage.setItem(FONT_KEY, String(fontSize)); }catch(e){} }
  els.findBtn.addEventListener("click", function(){ closeMore(); if (view) openSearchPanel(view); });
  els.findTopBtn.addEventListener("click", function(){ if (view) openSearchPanel(view); else setStatus("Open a file first.", "err"); });
  els.copyScriptIdBtn.addEventListener("click", function(){
    if (!currentProjectId) return;
    var done = function(){ els.copyScriptIdBtn.textContent = "Copied!"; setTimeout(function(){ els.copyScriptIdBtn.textContent = "Copy ID"; }, 1200); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(currentProjectId).then(done, done);
    else done();
  });
  els.undoBtn.addEventListener("click", function(){ if (view) undo(view); });
  els.redoBtn.addEventListener("click", function(){ if (view) redo(view); });

  // ---------------- Drawers ----------------
  function openDrawer(){ els.fileDrawer.classList.add("open"); els.fileDrawerBackdrop.classList.add("open"); }
  function closeDrawer(){ if (window.innerWidth <= 760){ els.fileDrawer.classList.remove("open"); els.fileDrawerBackdrop.classList.remove("open"); } }
  els.drawerToggle.addEventListener("click", function(){
    els.fileDrawer.classList.contains("open") ? closeDrawer() : openDrawer();
  });
  els.fileDrawerBackdrop.addEventListener("click", closeDrawer);

  function openMore(){ els.moreDrawer.classList.add("open"); els.moreBackdrop.classList.add("open"); }
  function closeMore(){ els.moreDrawer.classList.remove("open"); els.moreBackdrop.classList.remove("open"); }
  els.moreBtn.addEventListener("click", openMore);
  els.moreClose.addEventListener("click", closeMore);
  els.moreBackdrop.addEventListener("click", closeMore);

  window.addEventListener("beforeunload", function(e){
    if (hasUnsavedChanges()){ e.preventDefault(); e.returnValue = ""; }
  });

  document.addEventListener("keydown", function(e){
    var isSaveCombo = (e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S");
    if (isSaveCombo && els.app.classList.contains("show")){
      e.preventDefault();
      els.saveBtn.click();
    }
  });

  // ---------------- Boot ----------------
  var savedClientId = null, savedToken = null, savedExp = 0;
  try{
    savedClientId = localStorage.getItem(CLIENT_KEY);
    savedToken = localStorage.getItem(TOKEN_KEY);
    savedExp = parseInt(localStorage.getItem(TOKEN_EXP_KEY) || "0", 10);
  }catch(e){}
  if (savedClientId) els.clientIdInput.value = savedClientId;

  if (savedClientId && savedToken && Date.now() < savedExp){
    // Still-valid token from a previous visit — go straight in, no re-auth needed.
    accessToken = savedToken; tokenExpiresAt = savedExp;
    whenGoogleReady(6000).then(function(){ initTokenClient(savedClientId); }).catch(function(){});
    showApp();
    listProjects();
  } else if (savedClientId){
    // Token expired (or this is a fresh reload) but we've connected before —
    // try a silent renewal before asking the person to click anything.
    showConnect("Reconnecting…");
    whenGoogleReady(6000).then(function(){
      initTokenClient(savedClientId);
      return requestToken("");
    }).then(function(){
      listProjects();
    }).catch(function(){
      showConnect("Sign in again to continue.", "");
    });
  } else {
    showConnect();
  }
