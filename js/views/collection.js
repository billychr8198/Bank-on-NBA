/* COLLECTION — the 30 franchises, then the 55 legends, Tier 5 up to Tier 1. */
(function () {
  "use strict";
  const el = U.el;
  let tab = "teams";
  let tierFilter = "all";

  function teamTile(s) {
    const t = s.item;
    return el("button", {
      class: "tile" + (s.unlocked ? " tile--zoomable" : " tile--locked"),
      onclick: s.unlocked ? () => UI.showTeam(t, true) : null,
      title: s.unlocked ? t.name : "Locked — " + s.daysAway + " more logged days"
    }, [
      el("div", { class: "tile__art" }, [el("img", { src: t.logo, alt: t.name, loading: "lazy" })]),
      !s.unlocked ? el("div", { class: "tile__lock", text: "🔒" }) : null,
      el("div", { class: "tile__name", text: s.unlocked ? t.name : "Franchise " + (s.index + 1) }),
      el("div", { class: "tile__sub", text: s.unlocked
        ? t.titles + (t.titles === 1 ? " title" : " titles")
        : s.daysAway + "d away" }),
      s.unlocked ? el("div", { class: "tile__strip", style: "background:linear-gradient(90deg," + t.primary + "," + t.secondary + ")" }) : null
    ]);
  }

  function legendTile(s) {
    const l = s.item;
    return el("button", {
      class: "tile tile--legend" + (s.unlocked ? " tile--zoomable" : " tile--locked"),
      onclick: s.unlocked ? () => UI.showLegend(l) : null,
      title: s.unlocked ? l.name : "Locked — " + s.daysAway + " more logged days"
    }, [
      el("div", { class: "tile__rank", text: "#" + l.rank }),
      el("div", { class: "tile__tier tier-" + l.tier, text: "T" + l.tier }),
      el("div", { class: "tile__art" }, [el("img", { src: l.portrait, alt: l.name, loading: "lazy" })]),
      !s.unlocked ? el("div", { class: "tile__lock", text: "🔒" }) : null,
      el("div", { class: "tile__name", text: s.unlocked ? l.name : "Locked" }),
      el("div", { class: "tile__sub", text: s.unlocked ? l.overall + " OVR · " + l.tierName : s.daysAway + "d away" })
    ]);
  }


  /* Opens every unlocked piece of art in one swipeable gallery. */
  function galleryButton(kind, prog) {
    const items = kind === "team"
      ? window.NBA_TEAMS.slice(0, prog.teams).map((t) => ({
          src: t.logo, title: t.name,
          sub: t.conference + "ern · " + t.division,
          meta: t.titles + (t.titles === 1 ? " title" : " titles")
        }))
      : window.NBA_LEGENDS.slice(0, prog.legends).map((l) => ({
          src: l.portrait, title: l.name,
          sub: "Tier " + l.tier + " · " + l.tierName + " · #" + l.rank + " all-time",
          meta: l.overall + " OVR"
        }));
    if (!items.length) return null;
    return el("button", {
      class: "btn btn--ghost btn--sm",
      text: "View all " + items.length + " full size",
      onclick: function () { window.Lightbox.open(items, 0); }
    });
  }

  function teamsPanel(prog) {
    const states = window.Game.teamState(prog);
    const byDiv = {};
    states.forEach(function (s) {
      const k = s.item.conference + " · " + s.item.division;
      (byDiv[k] = byDiv[k] || []).push(s);
    });

    return el("div", { class: "stack" }, [
      UI.card("Franchise Era", "Every 3 consecutive logged days frees one franchise · " +
        prog.teams + " of 30 unlocked",
        el("div", {}, [
          UI.bar(prog.teams / 30 * 100, "gold", true),
          el("div", { class: "row", style: "justify-content:space-between;margin-top:8px" }, [
            el("span", { class: "tiny muted", text: prog.teams + " / 30 franchises" }),
            el("span", { class: "tiny muted", text: prog.teams >= 30 ? "Phase complete" : (30 - prog.teams) * 3 - prog.towardNext + " logged days to finish the set" })
          ]),
          el("div", { style: "margin-top:10px" }, galleryButton("team", prog))
        ])),
      ...Object.keys(byDiv).map(function (k) {
        return UI.card(k, null, el("div", { class: "coll-grid" }, byDiv[k].map(teamTile)));
      })
    ]);
  }

  function legendsPanel(prog) {
    const states = window.Game.legendState(prog);
    const shown = tierFilter === "all" ? states : states.filter((s) => String(s.item.tier) === tierFilter);

    const tierCounts = {};
    states.forEach(function (s) {
      const t = s.item.tier;
      tierCounts[t] = tierCounts[t] || { total: 0, got: 0 };
      tierCounts[t].total++;
      if (s.unlocked) tierCounts[t].got++;
    });

    const filters = el("div", { class: "seg" }, [
      el("button", { class: tierFilter === "all" ? "is-on" : "", text: "All 55", onclick: () => { tierFilter = "all"; window.App.render(); } }),
      ...[5, 4, 3, 2, 1].map((t) => el("button", {
        class: tierFilter === String(t) ? "is-on" : "",
        text: "T" + t + " (" + tierCounts[t].got + "/" + tierCounts[t].total + ")",
        onclick: () => { tierFilter = String(t); window.App.render(); }
      }))
    ]);

    const gated = prog.teams < 30;

    return el("div", { class: "stack" }, [
      UI.card("Hall of Fame Era", gated
        ? "Locked until all 30 franchises are unlocked"
        : "Every 5 consecutive logged days inducts one legend, Tier 5 up to Tier 1 · " + prog.legends + " of 55",
        el("div", {}, [
          UI.bar(prog.legends / 55 * 100, "gold", true),
          el("div", { class: "row", style: "justify-content:space-between;margin-top:8px" }, [
            el("span", { class: "tiny muted", text: prog.legends + " / 55 inducted" }),
            el("span", { class: "tiny muted", text: gated
              ? (30 - prog.teams) * 3 - prog.towardNext + " logged days until this phase opens"
              : prog.legends >= 55 ? "Complete" : (55 - prog.legends) * 5 - prog.towardNext + " logged days to complete the hall" })
          ]),
          el("div", { class: "row", style: "margin-top:13px;justify-content:space-between;flex-wrap:wrap;gap:8px" }, [
            filters,
            el("span", { class: "tiny muted", text: "Order runs Tier 5 → Tier 1. Michael Jordan lands on day 365." })
          ]),
          el("div", { style: "margin-top:10px" }, galleryButton("legend", prog))
        ])),
      UI.card(tierFilter === "all" ? "All legends" : "Tier " + tierFilter + " · " + shown[0].item.tierLabel,
        null, el("div", { class: "coll-grid" }, shown.map(legendTile)))
    ]);
  }

  window.Views = window.Views || {};
  window.Views.collection = function () {
    const prog = window.Game.progress();
    return el("div", { class: "stack" }, [
      el("div", { class: "seg" }, [
        el("button", { class: tab === "teams" ? "is-on" : "", text: "Franchises " + prog.teams + "/30", onclick: () => { tab = "teams"; window.App.render(); } }),
        el("button", { class: tab === "legends" ? "is-on" : "", text: "Legends " + prog.legends + "/55", onclick: () => { tab = "legends"; window.App.render(); } })
      ]),
      tab === "teams" ? teamsPanel(prog) : legendsPanel(prog)
    ]);
  };
})();
