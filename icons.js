/* Modev Suite — shared inline-SVG icon set.
   Any element with data-icon="name" gets that icon's SVG inserted as its
   first child. A MutationObserver keeps watching after the initial pass,
   so icons render correctly even in content tools build dynamically
   (file lists, tabs, commit rows, etc.) without needing to call anything
   manually after inserting new data-icon elements. */
(function(){
  "use strict";
  var S = 'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    folder:   '<svg '+S+'><path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6z"/></svg>',
    file:     '<svg '+S+'><path d="M6 3h9l5 5v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/></svg>',
    eye:      '<svg '+S+'><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>',
    x:        '<svg '+S+'><path d="M6 6l12 12M18 6L6 18"/></svg>',
    plus:     '<svg '+S+'><path d="M12 5v14M5 12h14"/></svg>',
    check:    '<svg '+S+'><path d="M5 13l4 4 10-10"/></svg>',
    menu:     '<svg '+S+'><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
    refresh:  '<svg '+S+'><path d="M4 12a8 8 0 0 1 14-5.3L21 9"/><path d="M21 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L3 15"/><path d="M3 20v-5h5"/></svg>',
    undo:     '<svg '+S+'><path d="M9 7 4 12l5 5"/><path d="M4 12h11a5 5 0 0 1 0 10h-1"/></svg>',
    redo:     '<svg '+S+'><path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 0 0 0 10h1"/></svg>',
    "arrow-right": '<svg '+S+'><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    smartphone: '<svg '+S+'><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>',
    save:     '<svg '+S+'><path d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M8 4v5h7V4"/><path d="M8 14h8v6H8z"/></svg>',
    globe:    '<svg '+S+'><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18z"/></svg>',
    download: '<svg '+S+'><path d="M12 3v13"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/></svg>',
    upload:   '<svg '+S+'><path d="M12 20V7"/><path d="M7 12l5-5 5 5"/><path d="M4 20h16"/></svg>',
    trash:    '<svg '+S+'><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/><path d="M10 11v6M14 11v6"/></svg>',
    code:     '<svg '+S+'><path d="M9 8l-5 4 5 4"/><path d="M15 8l5 4-5 4"/></svg>',
    bug:      '<svg '+S+'><rect x="8" y="8" width="8" height="10" rx="4"/><path d="M12 8V5M9 5h6M4 12h4M16 12h4M5 18l3-2M19 18l-3-2M5 8l3 2M19 8l-3 2"/></svg>',
    settings: '<svg '+S+'><path d="M4 7h10M18 7h2M4 12h2M10 12h10M4 17h14M22 17h0"/><circle cx="17" cy="7" r="2"/><circle cx="7" cy="12" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
    bulb:     '<svg '+S+'><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.6.5 1 1.3 1 2.5h6c0-1.2.4-2 1-2.5A6 6 0 0 0 12 2z"/></svg>',
    link:     '<svg '+S+'><path d="M9 15l6-6"/><path d="M10 6l1-1a4 4 0 0 1 6 6l-1 1"/><path d="M14 18l-1 1a4 4 0 0 1-6-6l1-1"/></svg>',
    camera:   '<svg '+S+'><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/></svg>',
    video:    '<svg '+S+'><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg>',
    clock:    '<svg '+S+'><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></svg>',
    "git-branch": '<svg '+S+'><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10"/><path d="M6 12a6 6 0 0 0 6-6"/><path d="M18 10v0"/></svg>',
    "git-pr": '<svg '+S+'><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 8v8"/><path d="M18 8v3a3 3 0 0 1-3 3h-1"/><path d="M12 12l2 2 2-2"/></svg>',
    users:    '<svg '+S+'><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.5"/><path d="M15.5 14a5 5 0 0 1 4.5 6"/></svg>',
    ban:      '<svg '+S+'><circle cx="12" cy="12" r="9"/><path d="M6 6l12 12"/></svg>',
    send:     '<svg '+S+'><path d="M3 12l18-8-8 18-2-8-8-2z"/></svg>',
    archive:  '<svg '+S+'><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/></svg>',
    search:   '<svg '+S+'><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>',
    sparkle:  '<svg '+S+'><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/></svg>',
    zap:      '<svg '+S+'><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/></svg>',
    edit:     '<svg '+S+'><path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M14 6l3 3"/></svg>',
    key:      '<svg '+S+'><circle cx="8" cy="15" r="4"/><path d="M11 12l9-9"/><path d="M16 7l3 3"/><path d="M13 10l3 3"/></svg>',
    octopus:  '<svg '+S+' fill="currentColor" stroke="none"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" transform="scale(1.5) translate(-2,-2)"/></svg>',
    triangle: '<svg '+S+' fill="currentColor" stroke="none"><path d="M12 3l10 18H2z"/></svg>'
  };

  function renderIn(root){
    if (!root || !root.querySelectorAll) return;
    var nodes = root.matches && root.matches("[data-icon]") ? [root] : [];
    if (root.querySelectorAll) nodes = nodes.concat(Array.prototype.slice.call(root.querySelectorAll("[data-icon]")));
    nodes.forEach(function(el){
      if (el.getAttribute("data-icon-done")) return;
      var name = el.getAttribute("data-icon");
      if (ICONS[name]){
        el.innerHTML = ICONS[name] + el.innerHTML;
        el.setAttribute("data-icon-done", "1");
      }
    });
  }

  function boot(){
    renderIn(document.body);
    var mo = new MutationObserver(function(mutations){
      mutations.forEach(function(m){
        m.addedNodes && m.addedNodes.forEach(function(n){
          if (n.nodeType === 1) renderIn(n);
        });
      });
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.MODEV_ICONS = ICONS; // exposed in case a tool wants to build data-icon markup dynamically
})();
