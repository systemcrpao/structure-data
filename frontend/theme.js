/**
 * theme.js — ระบบสลับโหมดมืด / สว่าง
 * โหลดใน <head> ก่อน body เพื่อป้องกัน FOUC (Flash of Unstyled Content)
 * ใช้ร่วมกับ theme.css
 */
(function () {
  'use strict';

  var THEME_KEY = 'crpao_theme';

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  }

  // Apply immediately (synchronous, before first paint) — prevents FOUC
  var saved = localStorage.getItem(THEME_KEY) || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  window.CRTheme = {
    toggle: toggleTheme,
    apply:  applyTheme,
    get:    function () { return document.documentElement.getAttribute('data-theme') || 'dark'; }
  };
})();
