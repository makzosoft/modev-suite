(function(){
  "use strict";
  var tabs = Array.prototype.slice.call(document.querySelectorAll(".tab[data-src]"));
  var frame = document.getElementById("toolFrame");
  var loading = document.getElementById("loading");
  var KEY = "hub.state.v1";

  function activate(src){
    tabs.forEach(function(t){ t.classList.toggle("active", t.getAttribute("data-src") === src); });
    loading.classList.add("show");
    frame.classList.remove("loaded");
    // Clearing src first fully unloads the previous tool's memory before loading the next one.
    frame.src = "about:blank";
    setTimeout(function(){ frame.src = src; }, 30);
    try{ localStorage.setItem(KEY, src); }catch(e){}
  }
  frame.addEventListener("load", function(){
    if (frame.src.indexOf("about:blank") === -1){
      loading.classList.remove("show");
      frame.classList.add("loaded");
      firstLoadDone = true;
      maybeDismissSplash();
    }
  });

  var splash = document.getElementById("splash");
  var firstLoadDone = false;
  var minTimeDone = false;
  function maybeDismissSplash(){
    if (!splash || !firstLoadDone || !minTimeDone) return;
    splash.classList.add("exit");
    setTimeout(function(){ splash.remove(); }, 450);
  }
  setTimeout(function(){ minTimeDone = true; maybeDismissSplash(); }, 1350);
  // Safety net: never block the app for more than 3s even on a slow connection.
  setTimeout(function(){ firstLoadDone = true; minTimeDone = true; maybeDismissSplash(); }, 3000);

  tabs.forEach(function(t){
    t.addEventListener("click", function(){ activate(t.getAttribute("data-src")); });
  });

  var last = null;
  try{ last = localStorage.getItem(KEY); }catch(e){}
  activate(last && tabs.some(function(t){return t.getAttribute("data-src")===last;}) ? last : tabs[0].getAttribute("data-src"));

  // ---------------- Debug console (receives postMessage from every tool iframe) ----------------
  var consoleBtn = document.getElementById("consoleBtn");
  var consoleBadge = document.getElementById("consoleBadge");
  var consoleDrawer = document.getElementById("consoleDrawer");
  var consoleLogEl = document.getElementById("consoleLog");
  var consoleClose = document.getElementById("consoleClose");
  var consoleClear = document.getElementById("consoleClear");
  var unseenCount = 0;
  var MAX_LINES = 400;

  var HINTS = [
    [/failed to fetch|networkerror|load failed/i, "Check your internet connection — this tool needs one to load its libraries and talk to GitHub."],
    [/401|bad credentials|token.*(rejected|invalid)/i, "Your GitHub token looks invalid or expired — disconnect and reconnect with a fresh one."],
    [/403|rate limit/i, "GitHub API rate limit or missing token permission — wait a bit, or check the token's scope."],
    [/404/i, "Not found — double check the repo, branch, or file path."],
    [/422/i, "GitHub rejected the request content — often means the file already changed remotely; reload and retry."],
    [/\b400\b/i, "The request was malformed — often a stray character or invalid value in what was sent."],
    [/\b(500|502|503|504)\b/i, "The server had a problem on its own end — wait a moment and try again; if it keeps happening, the service may be down."],
    [/importing binding name|failed to resolve module|dynamically imported module/i, "A library failed to load from its CDN — check your connection and reload this tool."],
    [/is not defined|cannot read propert(y|ies) of (undefined|null)/i, "Something loaded out of order — reloading this tool usually clears it."],
    [/quota|exceeded the quota/i, "Local storage is full — clear old drafts or unused data."],
    [/origin_mismatch|redirect_uri_mismatch/i, "This page's origin isn't in the OAuth Client ID's Authorized JavaScript origins — add it in Google Cloud Console."],
    [/popup_closed|popup_blocked/i, "The Google sign-in popup was blocked or closed — allow popups for this site and try again."],
    [/permission_denied|insufficient.*scope/i, "Missing permission — the signed-in account may not have access, or the token is missing a scope this action needs."],
    [/unexpected token.*json|json\.parse|not valid json/i, "The response wasn't valid JSON — usually means the server sent back an error page instead of real data."],
    [/cors|cross-origin request blocked/i, "Blocked by CORS — the server this request went to doesn't allow requests from this page directly."],
    [/mixed content|insecure content/i, "An HTTPS page tried to load something over plain HTTP — browsers block this silently."],
    [/syntaxerror|unexpected token/i, "There's a syntax error in the code — check the line mentioned above for a missing bracket, quote, or comma."],
    [/vercel/i, "A Vercel request or deployment had a problem — open the deployment link for the full build log; a missing dependency or bad build script is the most common cause."],
    [/invalid hook call/i, "React hooks were called outside a component, or two copies of React are loaded — check for duplicate React versions."],
    [/objects are not valid as a react child/i, "Something is trying to render a raw object/array directly — wrap it in a string, or pull out the specific field to display."],
    [/maximum update depth exceeded/i, "A React component is stuck re-rendering itself — usually a setState call with no condition guarding it inside an effect or render."],
    [/minified react error/i, "This is a production React error code — check the number against React's error decoder, or reproduce it in a dev build to see the full message."],
    [/unique .*key.* prop/i, "A list of React elements is missing a stable key prop — this is a warning, not a crash, but can cause odd re-render behavior."]
  ];
  var GENERIC_HINT = "No specific tip for this one — the exact wording above is the best clue; searching it together with the tool name usually surfaces the cause fastest.";
  function hintFor(text){
    for (var i=0;i<HINTS.length;i++){ if (HINTS[i][0].test(text)) return HINTS[i][1]; }
    return GENERIC_HINT;
  }
  function addConsoleLine(entry){
    var line = document.createElement("div");
    line.className = "cline " + (entry.level || "log");
    var t = new Date(entry.time || Date.now());
    var hh = String(t.getHours()).padStart(2,"0"), mm = String(t.getMinutes()).padStart(2,"0"), ss = String(t.getSeconds()).padStart(2,"0");
    var tagSpan = document.createElement("span");
    tagSpan.className = "tag";
    tagSpan.textContent = hh + ":" + mm + ":" + ss + " · " + (entry.tool || "?");
    line.appendChild(tagSpan);
    var msgSpan = document.createElement("span");
    msgSpan.textContent = entry.text || "";
    line.appendChild(msgSpan);
    consoleLogEl.appendChild(line);
    if (entry.level === "error" || entry.level === "warn"){
      var hint = hintFor(entry.text || "");
      if (hint){
        var hintLine = document.createElement("div");
        hintLine.className = "cline hint";
        var hintIcon = document.createElement("span");
        hintIcon.setAttribute("data-icon", "bulb");
        hintLine.appendChild(hintIcon);
        hintLine.appendChild(document.createTextNode(" " + hint));
        consoleLogEl.appendChild(hintLine);
      }
    }
    while (consoleLogEl.children.length > MAX_LINES) consoleLogEl.removeChild(consoleLogEl.firstChild);
    consoleLogEl.scrollTop = consoleLogEl.scrollHeight;
    if (!consoleDrawer.classList.contains("open")){
      unseenCount++;
      consoleBadge.textContent = unseenCount > 99 ? "99+" : String(unseenCount);
      consoleBadge.classList.add("show");
    }
  }
  window.addEventListener("message", function(e){
    if (e.origin !== window.location.origin) return; // only trust our own same-origin tool iframes
    if (e.data && e.data.__devConsole) addConsoleLine(e.data);
  });
  consoleBtn.addEventListener("click", function(){
    consoleDrawer.classList.toggle("open");
    if (consoleDrawer.classList.contains("open")){ unseenCount = 0; consoleBadge.classList.remove("show"); }
  });
  consoleClose.addEventListener("click", function(){ consoleDrawer.classList.remove("open"); });
  consoleClear.addEventListener("click", function(){ consoleLogEl.innerHTML = ""; });
})();
