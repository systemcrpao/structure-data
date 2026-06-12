/**
 * auth.js — CR-Vision Shared Authentication Module
 * โหลดไฟล์นี้ใน <head> ของทุกหน้าที่ต้องการ auth
 * ต้องโหลดหลัง gas-config.js
 */
(function () {
  'use strict';

  var SESSION_KEY   = 'crpao_v2_sess';
  var SESSION_HOURS = 8;

  // ─────────────────────────────────────────
  // SESSION MANAGEMENT (sessionStorage only)
  // ─────────────────────────────────────────
  function getSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      if (!d || !d.token || !d.role || !d.expires) return null;
      if (Date.now() > d.expires) {
        sessionStorage.removeItem(SESSION_KEY);
        return null;
      }
      return d;
    } catch (e) {
      return null;
    }
  }

  function setSession(user, role, token, displayRole) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      user:        user,
      role:        role,
      token:       token,
      displayRole: displayRole || role,
      expires:     Date.now() + SESSION_HOURS * 3600 * 1000
    }));
  }

  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
  }

  // ─────────────────────────────────────────
  // ROLE-BASED ACCESS CONTROL
  // admin ผ่านทุก role check เสมอ
  // ─────────────────────────────────────────
  function requireRole(allowedRoles) {
    var s = getSession();
    if (!s) {
      window.location.replace('login.html');
      return null;
    }
    if (s.role === 'admin') return s;
    if (!allowedRoles.includes(s.role)) {
      window.location.replace('login.html?err=forbidden');
      return null;
    }
    return s;
  }

  function getRoleHome(role) {
    switch (role) {
      case 'admin':    return 'admin.html';
      case 'director': return 'dashboard.html';
      case 'user':     return 'technician.html';
      case 'approve':  return 'treasury.html';
      default:         return 'login.html';
    }
  }

  function getRoleLabel(role) {
    var map = {
      'admin':    'ผู้ดูแลระบบ',
      'director': 'ผู้บริหาร',
      'user':     'ผู้บันทึกข้อมูล',
      'approve':  'ผู้บันทึกสถานะ'
    };
    return map[role] || role;
  }

  // ─────────────────────────────────────────
  // SHA-256 (ใช้ Web Crypto API — HTTPS only)
  // ─────────────────────────────────────────
  async function sha256(str) {
    var buf = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(str)
    );
    return Array.from(new Uint8Array(buf))
      .map(function (b) { return b.toString(16).padStart(2, '0'); })
      .join('');
  }

  // ─────────────────────────────────────────
  // GAS API CALL
  // ใช้ Content-Type: text/plain เพื่อหลีกเลี่ยง CORS preflight
  // ─────────────────────────────────────────
  async function callGAS(params) {
    var url = window.GAS_WEBAPP_URL;
    if (!url || url.indexOf('REPLACE_WITH') !== -1) {
      throw new Error('GAS_WEBAPP_URL ยังไม่ได้ตั้งค่าใน gas-config.js');
    }
    var res = await fetch(url, {
      method:   'POST',
      redirect: 'follow',
      headers:  { 'Content-Type': 'text/plain;charset=UTF-8' },
      body:     JSON.stringify(params)
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  // ─────────────────────────────────────────
  // LOGIN — hash password client-side before sending
  // ─────────────────────────────────────────
  async function login(username, password) {
    var passHash = await sha256(password);
    return callGAS({
      action:   'login',
      username: username.trim().toLowerCase(),
      passHash: passHash
    });
  }

  // ─────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────
  function logout() {
    clearSession();
    window.location.replace('login.html?msg=logout');
  }

  // ─────────────────────────────────────────
  // EXPORT
  // ─────────────────────────────────────────
  window.CRAuth = {
    getSession:   getSession,
    setSession:   setSession,
    clearSession: clearSession,
    requireRole:  requireRole,
    getRoleHome:  getRoleHome,
    getRoleLabel: getRoleLabel,
    login:        login,
    logout:       logout,
    callGAS:      callGAS
  };
})();
