/* ==========================================================================
   Nexus — site behaviour + Klar visual-CMS client.
   Loaded as a module (so it can import the Klar SDK). It creates the global
   window.klarSdk used by the per-page render/facet scripts, then wires up
   theme, mobile menu, filters, article TOC and back-to-top.
   ========================================================================== */
// import { createKlarClient } from "https://editor.klar.website/sdk/content-static.js";
import { createKlarClient } from "http://localhost:5173/sdk/content-static.js";

/* ---- Klar client ----------------------------------------------------- */
let projectId = 456;
function getProjectId() {
  const data = localStorage.getItem("klar")
    ? JSON.parse(localStorage.getItem("klar"))
    : {};
  return data.activeProjectId || projectId;
}
window.projectId = getProjectId();
window.klarSdk = createKlarClient({
  source: `http://localhost:5173/db/${window.projectId}.json`,
});

/* ---- setPosts: re-list + re-render the post grid through the SDK ------ */
// Used by the grid pages (posts/technology/business/podcast). Honors a
// category locked on the #all-posts container (data-category) for the
// category landing pages.
window.setPosts = function setPosts(category, tag, topic, onError) {
  const grid = document.getElementById("all-posts");
  const tplEl = document.getElementById("all-posts-tpl");
  if (!grid || !tplEl || !window.klarSdk) {
    if (onError) onError();
    return;
  }

  const fixed = grid.dataset.category || null;
  const where = {};
  const cat = fixed || category;
  if (cat && cat !== "all") where.categories = cat;
  if (topic && topic !== "all") where.topics = { has: topic };
  if (tag && tag !== "all") where.tags = { has: tag };

  const tpl = tplEl.innerHTML;
  klarSdk
    .list(grid.dataset.pageType || "blog-post", {
      where,
      order: "updated_at:desc",
      limit: 10,
    })
    .then((items) => {
      // console.log('Items', items);
      const info = document.getElementById("filter-info");
      // const total = JSON.parse(localStorage.getItem("all-posts") || "[]").length || (items ? items.length : 0);
      // console.log(window.posts);
      const total = window.posts.length || (items ? items.length : 0);
      // console.log('window.posts', window.posts);
      if (items && items.length) {
        klarSdk.insert("#all-posts", "replace", klarSdk.render(items, tpl));
      } else {
        klarSdk.insert(
          "#all-posts",
          "replace",
          klarSdk.render(window.posts, tpl),
        );
      }
      // Update only the COUNT TEXT here. Visibility of the info line and the
      // Clear Filters button is owned by the synchronous filter logic in
      // setupFilters() — which knows about a page's locked category — so a
      // locked category (e.g. Technology) never re-shows the Clear button.
      if (info) {
        info.textContent =
          "Showing " + (items ? items.length : 0) + " of " + total + " posts";
        if (topic && topic !== "all") info.textContent += " • " + topic;
        if (tag && tag !== "all") info.textContent += " • Tagged: " + tag;
      }
    })
    .catch(() => {
      if (onError) onError();
    });
};

(function () {
  "use strict";

  /* ---- Theme toggle -------------------------------------------------- */
  function applyTheme(theme) {
    const root = document.documentElement;
    const dark = theme === "dark";
    root.classList.toggle("dark", dark);
    root.classList.toggle("light", !dark);
    root.style.colorScheme = dark ? "dark" : "light";
  }
  document.querySelectorAll('[aria-label="Toggle theme"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      const next = localStorage.getItem("theme") === "dark" ? "light" : "dark";
      localStorage.setItem("theme", next);
      applyTheme(next);
    });
  });

  /* ---- Mobile menu --------------------------------------------------- */
  const menuToggle = document.getElementById("mobile-menu-toggle");
  const mobileMenu = document.getElementById("mobile-menu");
  const ICON_MENU =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg>';
  const ICON_X =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg>';
  if (menuToggle && mobileMenu) {
    menuToggle.addEventListener("click", () => {
      const open = mobileMenu.classList.toggle("hidden") === false;
      menuToggle.innerHTML = open ? ICON_X : ICON_MENU;
    });
  }

  /* ---- Filters ------------------------------------------------------- */
  // Drives the .filter dropdowns. When the Klar SDK + #all-posts-tpl are
  // present it filters server-side via setPosts; otherwise it falls back to
  // client-side filtering of the static cards by their data-* attributes so
  // the page still works standalone.
  function setupFilters() {
    const bar = document.querySelector("[data-filters]");
    if (!bar) return;

    const grid = document.getElementById("all-posts");
    const klarMode = !!(
      window.klarSdk && document.getElementById("all-posts-tpl")
    );
    const cards = () =>
      Array.prototype.slice.call(
        document.querySelectorAll("#all-posts > [data-category]"),
      );
    const totalEl = document.getElementById("filter-info");
    const clearBtn = document.getElementById("clear-filters");
    const fixed = grid ? grid.dataset.category || null : null;
    const state = { category: fixed || "all", topic: "all", tag: "all" };

    function closeAll() {
      bar
        .querySelectorAll("[data-filter-menu]")
        .forEach((m) => m.classList.add("hidden"));
      bar
        .querySelectorAll("[data-filter-toggle]")
        .forEach((b) => b.setAttribute("aria-expanded", "false"));
    }

    // A filter is "active" when any control differs from its default (the
    // category default is the page's locked category, if any).
    function isActive() {
      return (
        state.category !== (fixed || "all") ||
        state.topic !== "all" ||
        state.tag !== "all"
      );
    }

    // Client-side filtering of the static cards (used standalone and as the
    // offline fallback when the Klar SDK can't reach the dev server).
    function applyClient() {
      const list = cards();
      let shown = 0;
      list.forEach((card) => {
        const ok =
          (state.category === "all" ||
            card.dataset.category === state.category) &&
          (state.topic === "all" ||
            (card.dataset.topic || "").split(",").indexOf(state.topic) > -1) &&
          (state.tag === "all" ||
            (card.dataset.tag || "").split(",").indexOf(state.tag) > -1);
        card.style.display = ok ? "" : "none";
        if (ok) shown++;
      });
      if (totalEl)
        totalEl.textContent =
          "Showing " + shown + " of " + list.length + " posts";
    }

    function apply() {
      // Network-independent UI state FIRST, so Clear always hides the button
      // even if the SDK call later fails or hangs.
      const active = isActive();
      if (clearBtn) clearBtn.classList.toggle("hidden", !active);
      if (totalEl) totalEl.classList.toggle("hidden", !active);

      if (klarMode)
        window.setPosts(state.category, state.tag, state.topic, applyClient);
      else applyClient();
    }

    // Toggle open/close
    bar.querySelectorAll(".filter").forEach((filter) => {
      const toggle = filter.querySelector("[data-filter-toggle]");
      const menu = filter.querySelector("[data-filter-menu]");
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = !menu.classList.contains("hidden");
        closeAll();
        if (!isOpen) {
          menu.classList.remove("hidden");
          toggle.setAttribute("aria-expanded", "true");
        }
      });
    });

    // Option selection (event-delegated so SDK-rendered options work too)
    bar.addEventListener("click", (e) => {
      const opt = e.target.closest("[data-value]");
      if (!opt || !bar.contains(opt)) return;
      const filter = opt.closest(".filter");
      const toggle = filter.querySelector("[data-filter-toggle]");
      const key = toggle.dataset.filterToggle; // category | topic | tag
      const label = toggle.querySelector("span");
      state[key] = opt.dataset.value;
      label.textContent =
        opt.dataset.value === "all"
          ? toggle.dataset.defaultLabel
          : opt.dataset.value;
      filter
        .querySelectorAll("[data-value]")
        .forEach((o) => o.classList.remove("is-selected"));
      opt.classList.add("is-selected");
      closeAll();
      apply();
    });

    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        state.category = fixed || "all";
        state.topic = "all";
        state.tag = "all";
        bar.querySelectorAll("[data-filter-toggle]").forEach((t) => {
          t.querySelector("span").textContent = t.dataset.defaultLabel;
        });
        bar
          .querySelectorAll("[data-value]")
          .forEach((o) =>
            o.classList.toggle("is-selected", o.dataset.value === "all"),
          );
        apply();
      });
    }

    document.addEventListener("click", closeAll);
  }
  setupFilters();

  /* ---- Article table of contents + scroll spy ------------------------ */
  function setupToc() {
    const article = document.querySelector('[data-article-content="true"]');
    const tocNav = document.getElementById("toc-nav");
    if (!article || !tocNav) return;

    const headings = Array.prototype.slice.call(article.querySelectorAll("h2"));
    tocNav.innerHTML = "";
    const buttons = [];
    headings.forEach((heading, i) => {
      if (!heading.id) heading.id = "heading-" + i;
      const btn = document.createElement("button");
      btn.className = "toc-link";
      btn.textContent = heading.textContent;
      btn.addEventListener("click", () => {
        const top =
          heading.getBoundingClientRect().top + window.pageYOffset - 100;
        window.scrollTo({ top, behavior: "smooth" });
      });
      tocNav.appendChild(btn);
      buttons.push(btn);
    });

    if ("IntersectionObserver" in window && headings.length) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const idx = headings.indexOf(entry.target);
              buttons.forEach((b) => b.classList.remove("is-active"));
              if (buttons[idx]) buttons[idx].classList.add("is-active");
            }
          });
        },
        { rootMargin: "-100px 0px -85% 0px", threshold: 0 },
      );
      headings.forEach((h) => observer.observe(h));
    }
  }
  // TOC runs after the SDK may have replaced the article body
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", () =>
      setTimeout(setupToc, 0),
    );
  else setTimeout(setupToc, 0);

  /* ---- Back to top --------------------------------------------------- */
  const backToTop = document.getElementById("back-to-top");
  if (backToTop) {
    window.addEventListener("scroll", () =>
      backToTop.classList.toggle("hidden", window.pageYOffset < 400),
    );
    backToTop.addEventListener("click", () =>
      window.scrollTo({ top: 0, behavior: "smooth" }),
    );
  }

  /* ---- Search page: hide the browse prompt once typing --------------- */
  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      const prompt = document.getElementById("search-prompt");
      if (prompt)
        prompt.classList.toggle("hidden", this.value.trim().length > 0);
    });
  }
})();
