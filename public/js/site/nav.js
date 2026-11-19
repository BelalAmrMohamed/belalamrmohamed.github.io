// "Work" dropdown behaviour for the site header (desktop hover/click panel,
// mobile accordion). Event delegation, so it works whether the header is
// static (index.html) or rendered later by shell.js.
(function () {
  var CLOSE_DELAY = 140;
  var timer = null;
  var canHover = window.matchMedia('(min-width: 801px) and (hover: hover)');

  function items() { return document.querySelectorAll('.main-nav .has-menu'); }
  function setOpen(item, open) {
    var trigger = item.querySelector('.nav-trigger');
    item.classList.toggle('is-open', open);
    if (trigger) trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeAll(except) {
    items().forEach(function (item) { if (item !== except) setOpen(item, false); });
  }

  function setMobileMenu(open) {
    var toggle = document.querySelector('.mobile-menu-toggle');
    document.body.classList.toggle('menu-is-open', open);
    if (toggle) toggle.classList.toggle('is-clicked', open);
  }

  document.addEventListener('click', function (e) {
    if (document.body.dataset.shellNav) {
      if (e.target.closest && e.target.closest('.mobile-menu-toggle')) {
        e.preventDefault();
        setMobileMenu(!document.body.classList.contains('menu-is-open'));
        return;
      }
      if (e.target.closest && e.target.closest('.main-nav a') && window.matchMedia('(max-width: 800px)').matches) setMobileMenu(false);
    }
    var trigger = e.target.closest && e.target.closest('.nav-trigger');
    if (trigger) {
      var item = trigger.closest('.has-menu');
      var open = !item.classList.contains('is-open');
      closeAll(item);
      setOpen(item, open);
      return;
    }
    if (!(e.target.closest && e.target.closest('.has-menu'))) closeAll();
    else if (e.target.closest('.nav-panel a')) closeAll();
  });

  document.addEventListener('mouseover', function (e) {
    if (!canHover.matches) return;
    var item = e.target.closest && e.target.closest('.main-nav .has-menu');
    if (!item) return;
    clearTimeout(timer);
    closeAll(item);
    setOpen(item, true);
  });
  document.addEventListener('mouseout', function (e) {
    if (!canHover.matches) return;
    var item = e.target.closest && e.target.closest('.main-nav .has-menu');
    if (!item || item.contains(e.relatedTarget)) return;
    timer = setTimeout(function () { setOpen(item, false); }, CLOSE_DELAY);
  });

  window.addEventListener('resize', function () {
    if (window.matchMedia('(min-width: 801px)').matches) document.body.classList.remove('menu-is-open');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.main-nav .has-menu.is-open');
    if (!open) return;
    setOpen(open, false);
    var trigger = open.querySelector('.nav-trigger');
    if (trigger) trigger.focus();
  });

  document.addEventListener('focusin', function (e) {
    if (!(e.target.closest && e.target.closest('.main-nav .has-menu'))) closeAll();
  });
})();
