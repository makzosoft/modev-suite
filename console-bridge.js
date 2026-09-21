/* Modev Suite — shared console/error bridge.
   Forwards this tool's console.log/warn/error/info and any uncaught
   errors/rejections up to the hub's aggregated debug console (the hub
   listens for these via postMessage). Auto-detects which tool it's
   running in from the current file name, so it's the same file for
   every tool with nothing to configure per file. */
(function(){
  "use strict";
  var TOOL_NAME = (location.pathname.split("/").pop() || "tool").replace(/\.html?$/i, "");

  function callerLocation(){
    try{
      var lines = (new Error()).stack.split("\n").slice(3);
      var line = lines.find(function(l){ return l && l.indexOf("callerLocation") === -1; }) || lines[0] || "";
      var m = /((?:https?:\/\/|file:\/\/)[^\s)]+?):(\d+):(\d+)/.exec(line);
      if (!m) return "";
      var file = m[1].split("/").pop();
      return " \u2014 " + file + ":" + m[2];
    }catch(e){ return ""; }
  }
  function send(level, args){
    if (window.parent === window) return;
    try{
      var text = Array.prototype.map.call(args, function(a){
        if (typeof a === "string") return a;
        try{ return JSON.stringify(a); }catch(e){ return String(a); }
      }).join(" ");
      parent.postMessage({__devConsole:true, tool:TOOL_NAME, level:level, time:Date.now(), text:text}, window.location.origin);
    }catch(e){}
  }
  ["log","warn","error","info","debug"].forEach(function(level){
    var orig = console[level] ? console[level].bind(console) : function(){};
    console[level] = function(){
      var loc = (level === "error" || level === "warn") ? callerLocation() : "";
      var args = Array.prototype.slice.call(arguments);
      if (loc) args.push(loc);
      send(level, args);
      orig.apply(console, arguments);
    };
  });
  window.addEventListener("error", function(e){
    var file = (e.filename||"").split("/").pop();
    send("error", [e.message + " \u2014 " + file + ":" + e.lineno + ":" + e.colno]);
  });
  window.addEventListener("unhandledrejection", function(e){
    var reason = e.reason && e.reason.message ? e.reason.message : e.reason;
    var stackLine = "";
    try{
      var m = /((?:https?:\/\/|file:\/\/)[^\s)]+?):(\d+):(\d+)/.exec((e.reason && e.reason.stack) || "");
      if (m) stackLine = " \u2014 " + m[1].split("/").pop() + ":" + m[2];
    }catch(err){}
    send("error", ["Unhandled rejection: " + reason + stackLine]);
  });
})();
