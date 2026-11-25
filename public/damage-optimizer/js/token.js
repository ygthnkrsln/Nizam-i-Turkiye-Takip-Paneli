// Optional visitor API token storage for the reference tool. It stays in this browser and, when supplied, is
// forwarded through the same-origin application proxy. The app's server-side token pool works without it.
"use strict";

const TOKEN_KEY = "warera_api_token";

// localStorage / sessionStorage can be missing or throw (private windows, blocked site data).
function store(kind) {
  try {
    const s = window[kind];
    s.getItem(TOKEN_KEY);
    return s;
  } catch {
    return null;
  }
}
const remembered = store("localStorage");
const thisTab = store("sessionStorage");

function readToken() {
  try {
    return (
      (remembered && remembered.getItem(TOKEN_KEY)) ||
      (thisTab && thisTab.getItem(TOKEN_KEY)) ||
      ""
    );
  } catch {
    return "";
  }
}

function writeToken(token, remember) {
  try {
    if (thisTab)
      token ? thisTab.setItem(TOKEN_KEY, token) : thisTab.removeItem(TOKEN_KEY);
    if (remembered)
      remember && token
        ? remembered.setItem(TOKEN_KEY, token)
        : remembered.removeItem(TOKEN_KEY);
  } catch {
    // storage refused: the token still works on this page until it's closed
  }
}

function tokenBox() {
  const input = document.getElementById("token");
  const remember = document.getElementById("remember");
  const status = document.getElementById("token-status");
  input.value = readToken();
  try {
    remember.checked = Boolean(remembered && remembered.getItem(TOKEN_KEY));
  } catch {
    remember.checked = false;
  }
  remember.disabled = !remembered;

  function show() {
    // the page's own text without a token (its data-i18n key), else what's kept where (i18n.js)
    if (!input.value) status.textContent = I18N.t(status.dataset.i18n);
    else
      status.textContent = I18N.t(
        remember.checked ? "token.remembered" : "token.thisTab",
      );
  }
  function save() {
    input.value = input.value.trim();
    writeToken(input.value, remember.checked);
    show();
  }
  input.addEventListener("change", save);
  remember.addEventListener("change", save);
  document.getElementById("forget").addEventListener("click", () => {
    input.value = "";
    remember.checked = false;
    save();
  });
  document.getElementById("token-form").addEventListener("submit", (event) => {
    event.preventDefault();
    save();
  });
  show();
  I18N.onChange(show);
}
