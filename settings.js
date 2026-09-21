(function(){
  "use strict";
  var TOKEN_KEY = "ghUploader.token";
  var VERCEL_TOKEN_KEY = "vercelUploader.token";
  var els = {};
  ["tokenInput","showToken","saveToken","clearToken","tokenStatus",
   "appsScriptStatus","appsScriptClientIdInput","saveAppsScriptClientId","disconnectAppsScript",
   "vercelTokenInput","showVercelToken","saveVercelToken","clearVercelToken","vercelStatus",
   "storageStats","clearDrafts","clearHistory","saveMsg"]
    .forEach(function(id){ els[id] = document.getElementById(id); });

  function refreshTokenStatus(){
    var t = null;
    try{ t = localStorage.getItem(TOKEN_KEY); }catch(e){}
    if (!t){ els.tokenStatus.textContent = "Not connected."; els.tokenStatus.className = ""; return; }
    els.tokenStatus.textContent = "Checking saved token…";
    fetch("https://api.github.com/user", { headers: { Authorization: "token " + t } })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("Token rejected")); })
      .then(function(user){ els.tokenStatus.textContent = "Connected as " + user.login; els.tokenStatus.className = "ok"; })
      .catch(function(){ els.tokenStatus.textContent = "Saved token is invalid or expired."; els.tokenStatus.className = "err"; });
  }
  els.showToken.addEventListener("click", function(){ els.tokenInput.type = els.tokenInput.type === "password" ? "text" : "password"; });
  els.saveToken.addEventListener("click", function(){
    var t = els.tokenInput.value.trim();
    if (!t) return;
    try{ localStorage.setItem(TOKEN_KEY, t); }catch(e){}
    els.tokenInput.value = "";
    refreshTokenStatus();
  });
  els.clearToken.addEventListener("click", function(){
    if (!confirm("Disconnect GitHub? You'll need to paste a token again in the GitHub or Code tab.")) return;
    try{ localStorage.removeItem(TOKEN_KEY); }catch(e){}
    refreshTokenStatus();
  });

  var APPS_SCRIPT_CLIENT_KEY = "appsScript.clientId";
  var APPS_SCRIPT_TOKEN_KEY = "appsScript.accessToken";
  var APPS_SCRIPT_TOKEN_EXP_KEY = "appsScript.tokenExpiresAt";
  function refreshAppsScriptStatus(){
    var clientId = null, token = null, exp = 0;
    try{
      clientId = localStorage.getItem(APPS_SCRIPT_CLIENT_KEY);
      token = localStorage.getItem(APPS_SCRIPT_TOKEN_KEY);
      exp = parseInt(localStorage.getItem(APPS_SCRIPT_TOKEN_EXP_KEY) || "0", 10);
    }catch(e){}
    if (clientId) els.appsScriptClientIdInput.value = clientId;
    if (!clientId){ els.appsScriptStatus.textContent = "Not set up yet — add a Client ID below."; els.appsScriptStatus.className = ""; return; }
    if (!token || Date.now() >= exp){ els.appsScriptStatus.textContent = "Client ID saved, but not currently signed in."; els.appsScriptStatus.className = ""; return; }
    els.appsScriptStatus.textContent = "Checking saved session…";
    fetch("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + encodeURIComponent(token))
      .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("Session invalid")); })
      .then(function(){ els.appsScriptStatus.textContent = "Signed in."; els.appsScriptStatus.className = "ok"; })
      .catch(function(){ els.appsScriptStatus.textContent = "Saved session is invalid or expired — it'll silently refresh next time you open the Apps Script tab."; els.appsScriptStatus.className = "err"; });
  }
  els.saveAppsScriptClientId.addEventListener("click", function(){
    var c = els.appsScriptClientIdInput.value.trim();
    if (!c) return;
    try{ localStorage.setItem(APPS_SCRIPT_CLIENT_KEY, c); }catch(e){}
    refreshAppsScriptStatus();
  });
  els.disconnectAppsScript.addEventListener("click", function(){
    if (!confirm("Disconnect Google Apps Script? You'll need to sign in again in the Apps Script tab.")) return;
    var token = null;
    try{ token = localStorage.getItem(APPS_SCRIPT_TOKEN_KEY); }catch(e){}
    if (token){
      fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(token), {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }
      }).catch(function(){});
    }
    try{ localStorage.removeItem(APPS_SCRIPT_TOKEN_KEY); localStorage.removeItem(APPS_SCRIPT_TOKEN_EXP_KEY); }catch(e){}
    refreshAppsScriptStatus();
  });

  function refreshVercelStatus(){
    var t = null;
    try{ t = localStorage.getItem(VERCEL_TOKEN_KEY); }catch(e){}
    if (!t){ els.vercelStatus.textContent = "Not connected."; els.vercelStatus.className = ""; return; }
    els.vercelStatus.textContent = "Checking saved token…";
    fetch("https://api.vercel.com/v2/user", { headers: { Authorization: "Bearer " + t } })
      .then(function(r){ return r.ok ? r.json() : Promise.reject(new Error("Token rejected")); })
      .then(function(d){
        var name = (d.user && (d.user.username || d.user.name || d.user.email)) || "your account";
        els.vercelStatus.textContent = "Connected as " + name; els.vercelStatus.className = "ok";
      })
      .catch(function(){ els.vercelStatus.textContent = "Saved token is invalid or expired."; els.vercelStatus.className = "err"; });
  }
  els.showVercelToken.addEventListener("click", function(){ els.vercelTokenInput.type = els.vercelTokenInput.type === "password" ? "text" : "password"; });
  els.saveVercelToken.addEventListener("click", function(){
    var t = els.vercelTokenInput.value.trim();
    if (!t) return;
    try{ localStorage.setItem(VERCEL_TOKEN_KEY, t); }catch(e){}
    els.vercelTokenInput.value = "";
    refreshVercelStatus();
  });
  els.clearVercelToken.addEventListener("click", function(){
    if (!confirm("Disconnect Vercel? You'll need to paste a token again to deploy from the GitHub tab.")) return;
    try{ localStorage.removeItem(VERCEL_TOKEN_KEY); }catch(e){}
    refreshVercelStatus();
  });

  function humanBytes(n){ return n < 1024 ? n + " B" : (n/1024).toFixed(1) + " KB"; }
  function refreshStorage(){
    var groups = { "Device Lab": 0, "GitHub tool": 0, "Apps Script": 0, "Vercel": 0, "Code Editor drafts": 0, "Code Editor state": 0, "Other": 0 };
    var total = 0;
    try{
      for (var i = 0; i < localStorage.length; i++){
        var key = localStorage.key(i);
        var size = (key.length + (localStorage.getItem(key)||"").length) * 2;
        total += size;
        if (key.indexOf("deviceLab.") === 0) groups["Device Lab"] += size;
        else if (key.indexOf("ghUploader.") === 0) groups["GitHub tool"] += size;
        else if (key.indexOf("appsScript.") === 0) groups["Apps Script"] += size;
        else if (key.indexOf("vercelUploader.") === 0) groups["Vercel"] += size;
        else if (key.indexOf("codeEditor.draft::") === 0) groups["Code Editor drafts"] += size;
        else if (key.indexOf("codeEditor.") === 0) groups["Code Editor state"] += size;
        else groups["Other"] += size;
      }
    }catch(e){}
    els.storageStats.innerHTML = "";
    Object.keys(groups).forEach(function(g){
      var row = document.createElement("div");
      row.className = "stat-row";
      row.innerHTML = "<span>" + g + "</span><span>" + humanBytes(groups[g]) + "</span>";
      els.storageStats.appendChild(row);
    });
    var totalRow = document.createElement("div");
    totalRow.className = "stat-row";
    totalRow.innerHTML = "<span><b>Total</b></span><span><b>" + humanBytes(total) + "</b></span>";
    els.storageStats.appendChild(totalRow);
  }

  els.clearDrafts.addEventListener("click", function(){
    if (!confirm("Clear all unsaved drafts (Code Editor + Apps Script)? Anything not pushed/saved yet will be lost.")) return;
    try{
      Object.keys(localStorage).filter(function(k){ return k.indexOf("codeEditor.draft::") === 0 || k.indexOf("appsScript.draft::") === 0; })
        .forEach(function(k){ localStorage.removeItem(k); });
    }catch(e){}
    els.saveMsg.textContent = "Drafts cleared."; els.saveMsg.className = "ok";
    refreshStorage();
  });
  els.clearHistory.addEventListener("click", function(){
    try{
      var s = JSON.parse(localStorage.getItem("deviceLab.state.v1") || "{}");
      delete s.knownPaths;
      localStorage.setItem("deviceLab.state.v1", JSON.stringify(s));
    }catch(e){}
    els.saveMsg.textContent = "Remembered paths cleared."; els.saveMsg.className = "ok";
    refreshStorage();
  });

  refreshTokenStatus();
  refreshAppsScriptStatus();
  refreshVercelStatus();
  refreshStorage();
})();
