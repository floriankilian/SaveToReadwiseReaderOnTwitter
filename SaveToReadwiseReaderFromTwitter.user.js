// ==UserScript==
// @name         Save Tweets to Readwise Reader
// @namespace    https://github.com/floriankilian/SaveToReadwiseReaderOnTwitter
// @version      1.2.1
// @description  Adds a one-click button to every tweet on Twitter/X that copies the tweet link and saves the tweet to Readwise Reader.
// @author       sirfloriank
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://tweetdeck.twitter.com/*
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?domain=twitter.com
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      readwise.io
// @license      MIT
// @supportURL   https://github.com/floriankilian/SaveToReadwiseReaderOnTwitter/issues
// @homepageURL  https://github.com/floriankilian/SaveToReadwiseReaderOnTwitter
// @updateURL    https://raw.githubusercontent.com/floriankilian/SaveToReadwiseReaderOnTwitter/main/SaveToReadwiseReaderFromTwitter.user.js
// @downloadURL  https://raw.githubusercontent.com/floriankilian/SaveToReadwiseReaderOnTwitter/main/SaveToReadwiseReaderFromTwitter.user.js
// ==/UserScript==

(() => {
    'use strict';

    // Constants
    const BASE_URL = 'https://twitter.com';
    const API_KEY_URL = 'https://readwise.io/access_token';
    const SAVE_API_URL = 'https://readwise.io/api/v3/save/';
    const AUTH_API_URL = 'https://readwise.io/api/v2/auth/';
    const REQUEST_TIMEOUT = 15000;
    const SAVED_TWEETS_KEY = 'savedTweets';
    const MAX_REMEMBERED_TWEETS = 5000;
    const SHORTCUTS_HINT = 'Click: save · Shift+Click: save with a note · Alt+Click: settings';

    // Options are opt-in: by default a click only saves the tweet
    const DEFAULT_SETTINGS = {
        copyLink: false,
        location: 'new',
        tags: '',
        rememberSaved: false
    };
    const LOCATIONS = [
        { value: 'new', label: 'Inbox' },
        { value: 'later', label: 'Later' },
        { value: 'archive', label: 'Archive' }
    ];

    const CLIPBOARD_PATHS = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />';
    const svgIcon = extraPaths => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CLIPBOARD_PATHS}${extraPaths}</svg>`;
    const SVG_ICONS = {
        default: svgIcon(''),
        check: svgIcon('<path d="M9 14l2 2l4 -4" />'),
        error: svgIcon('<path d="M12 11v3" /><path d="M12 17h.01" />')
    };

    // Icon per button state; colors live in the stylesheet
    const ICON_STATES = {
        idle: { svg: SVG_ICONS.default, title: `Save to Readwise Reader (${SHORTCUTS_HINT})` },
        saving: { svg: SVG_ICONS.check, title: 'Saving to Readwise Reader…' },
        saved: { svg: SVG_ICONS.check, title: 'Saved to Readwise Reader' },
        remembered: { svg: SVG_ICONS.check, title: `Saved before with this browser (${SHORTCUTS_HINT})` },
        error: { svg: SVG_ICONS.error, title: 'Could not save. Click to try again' }
    };

    const STYLES = `
        :root { --rw-blue: rgb(29, 155, 240); --rw-red: rgb(244, 33, 46); --rw-saved: #FDE704;
            --rw-font: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        :root[data-rw-theme="light"] { --rw-saved: #B39700; }

        .rw-cell { display: flex; align-items: center; }
        .custom-copy-icon {
            display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;
            width: calc(var(--rw-icon-size, 18px) + 16px); height: calc(var(--rw-icon-size, 18px) + 16px);
            margin: 0; padding: 8px; box-sizing: border-box;
            border: 0; border-radius: 9999px; background: transparent;
            color: var(--rw-icon-color, rgb(113, 118, 123)); cursor: pointer;
            transition: color .15s, background-color .15s;
        }
        .custom-copy-icon svg { display: block; width: 100%; height: 100%; }
        .custom-copy-icon:hover, .custom-copy-icon:focus-visible { color: var(--rw-blue); background-color: rgba(29, 155, 240, .1); outline: none; }
        .custom-copy-icon[data-state="saving"] { color: var(--rw-blue); }
        .custom-copy-icon[data-state="saving"] svg { animation: rw-pulse 1s ease-in-out infinite; }
        .custom-copy-icon[data-state="saved"], .custom-copy-icon[data-state="remembered"] { color: var(--rw-saved); }
        .custom-copy-icon[data-state="error"] { color: var(--rw-red); }
        @keyframes rw-pulse { 50% { opacity: .3; } }

        .rw-toast {
            position: fixed; left: 50%; bottom: 24px; z-index: 2147483647;
            transform: translateX(-50%);
            display: flex; align-items: center; gap: 16px;
            width: max-content; max-width: calc(100vw - 32px); box-sizing: border-box;
            padding: 12px 16px; border-radius: 6px;
            background: var(--rw-blue); color: #fff;
            font-family: var(--rw-font); font-size: 15px; line-height: 20px;
            box-shadow: rgba(101, 119, 134, .2) 0 0 15px, rgba(101, 119, 134, .15) 0 0 3px 1px;
            animation: rw-toast-in .2s ease-out;
        }
        .rw-toast[data-type="error"] { background: var(--rw-red); }
        .rw-toast-action {
            padding: 0; border: 0; background: none; color: #fff;
            font: inherit; font-weight: 700; white-space: nowrap; text-decoration: none; cursor: pointer;
        }
        .rw-toast-action:hover { text-decoration: underline; }
        @keyframes rw-toast-in { from { opacity: 0; transform: translate(-50%, 8px); } }

        .rw-overlay {
            position: fixed; inset: 0; z-index: 2147483646;
            display: flex; align-items: center; justify-content: center;
            padding: 16px; box-sizing: border-box;
            background: rgba(91, 112, 131, .4);
            font-family: var(--rw-font);
            animation: rw-fade-in .15s ease-out;
        }
        @keyframes rw-fade-in { from { opacity: 0; } }
        .rw-dialog {
            --rw-fg: #0f1419; --rw-muted: #536471; --rw-border: #cfd9de; --rw-surface: #fff;
            width: min(440px, 100%); max-height: 100%; overflow-y: auto; box-sizing: border-box;
            padding: 28px 32px 24px; border-radius: 16px;
            background: var(--rw-surface); color: var(--rw-fg);
            font-size: 15px; line-height: 20px;
            box-shadow: rgba(101, 119, 134, .2) 0 0 15px, rgba(101, 119, 134, .15) 0 0 3px 1px;
        }
        .rw-dialog[data-rw-theme="dark"] { --rw-fg: #e7e9ea; --rw-muted: #71767b; --rw-border: #333639; }
        .rw-dialog h2 { margin: 0 0 8px; font-size: 23px; line-height: 28px; font-weight: 800; }
        .rw-dialog p { margin: 0; }
        .rw-text { color: var(--rw-muted); }
        .rw-reason { margin-bottom: 8px !important; color: var(--rw-red); font-weight: 700; }
        .rw-link { display: inline-block; margin-top: 12px; color: var(--rw-blue); font-weight: 700; text-decoration: none; }
        .rw-link:hover { text-decoration: underline; }
        .rw-field {
            display: flex; align-items: center; margin-top: 20px;
            border: 1px solid var(--rw-border); border-radius: 4px;
            transition: border-color .15s, box-shadow .15s;
        }
        .rw-field:focus-within { border-color: var(--rw-blue); box-shadow: 0 0 0 1px var(--rw-blue); }
        .rw-input {
            flex: 1; min-width: 0; padding: 14px 12px;
            border: 0; outline: 0; background: transparent; color: var(--rw-fg);
            font: 15px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        .rw-input::placeholder { color: var(--rw-muted); font-family: var(--rw-font); }
        .rw-reveal { padding: 0 12px; border: 0; background: none; color: var(--rw-blue); font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
        .rw-status { min-height: 20px; margin-top: 8px !important; color: var(--rw-muted); font-size: 13px; }
        .rw-status[data-type="error"] { color: var(--rw-red); }
        .rw-actions { display: flex; align-items: center; gap: 12px; margin-top: 12px; }
        .rw-spacer { flex: 1; }
        .rw-button {
            min-height: 36px; padding: 0 18px; border: 1px solid transparent; border-radius: 9999px;
            font: inherit; font-weight: 700; cursor: pointer; transition: opacity .15s, background-color .15s;
        }
        .rw-button-primary { background: var(--rw-fg); color: var(--rw-surface); }
        .rw-button-primary:hover:not(:disabled) { opacity: .85; }
        .rw-button-primary:disabled { opacity: .5; cursor: default; }
        .rw-button-secondary { background: transparent; color: var(--rw-fg); border-color: var(--rw-border); }
        .rw-button-secondary:hover { background: rgba(127, 127, 127, .1); }
        .rw-button-remove { padding: 0; border: 0; background: none; color: var(--rw-red); font: inherit; font-size: 13px; cursor: pointer; }
        .rw-button-remove:hover { text-decoration: underline; }

        .rw-section { margin-top: 24px; }
        .rw-section h3 { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-size: 17px; line-height: 24px; font-weight: 700; }
        .rw-badge { padding: 1px 6px; border-radius: 4px; background: var(--rw-blue); color: #fff; font-size: 11px; line-height: 16px; font-weight: 700; letter-spacing: .04em; }
        .rw-row { display: flex; align-items: center; gap: 12px; margin-top: 8px; }
        .rw-row .rw-text { flex: 1; }
        .rw-check { display: flex; align-items: flex-start; gap: 10px; margin-top: 12px; cursor: pointer; }
        .rw-check input { flex-shrink: 0; width: 18px; height: 18px; margin: 1px 0 0; accent-color: var(--rw-blue); cursor: pointer; }
        .rw-label { display: block; margin-top: 16px; font-weight: 700; }
        .rw-label + .rw-field { margin-top: 6px; }
        .rw-hint { margin-top: 6px !important; color: var(--rw-muted); font-size: 13px; line-height: 18px; }
        .rw-input-text { font-family: var(--rw-font); }
        .rw-select option { background: var(--rw-surface); color: var(--rw-fg); }
        .rw-textarea { min-height: 96px; resize: vertical; font-family: var(--rw-font); }
        .rw-shortcuts { margin-top: 20px !important; color: var(--rw-muted); font-size: 13px; }
    `;

    // Stored API key, or null until the user sets one
    let apiKey = GM_getValue('apiKey', null) || null;
    let settings = { ...DEFAULT_SETTINGS, ...(GM_getValue('settings', null) || {}) };

    function saveSettings(newSettings) {
        settings = { ...DEFAULT_SETTINGS, ...newSettings };
        GM_setValue('settings', settings);
    }

    function parseTags(text) {
        return [...new Set(text.split(',').map(tag => tag.trim()).filter(Boolean))];
    }

    // Main function
    function main() {
        try {
            injectStyles();
            registerMenuCommands();
            observeTweetList();
            injectIconsToExistingTweets();
            setTimeout(warnIfButtonsMissing, MISSING_BUTTONS_CHECK_DELAY);
        } catch (e) {
            console.error('Error in main function:', e);
        }
    }

    function injectStyles() {
        const style = document.createElement('style');
        style.textContent = STYLES;
        document.head.appendChild(style);
    }

    function registerMenuCommands() {
        if (typeof GM_registerMenuCommand === 'function') {
            GM_registerMenuCommand('Settings…', () => openSettingsDialog());
            GM_registerMenuCommand('Set Readwise API key…', () => openApiKeyDialog());
        }
    }

    function isDarkTheme() {
        const [r, g, b, a = 1] = (getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || []).map(Number);
        if (r === undefined || a === 0) return window.matchMedia('(prefers-color-scheme: dark)').matches;
        return (r * 299 + g * 587 + b * 114) / 1000 < 128;
    }

    function updateTheme() {
        document.documentElement.dataset.rwTheme = isDarkTheme() ? 'dark' : 'light';
    }

    // --- Tweet button ---

    function createIcon() {
        const icon = document.createElement('button');
        icon.type = 'button';
        icon.classList.add('custom-copy-icon');
        setIconState(icon, 'idle');
        return icon;
    }

    function setIconState(icon, state) {
        const { svg, title } = ICON_STATES[state];
        icon.dataset.state = state;
        icon.innerHTML = svg;
        icon.title = title;
        icon.setAttribute('aria-label', title);
    }

    function attachCopyEvent(icon, tweet) {
        icon.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            handleClickEvent(event, tweet, icon);
        });
    }

    // Click: save. Shift+Click: save with a note. Alt+Click: settings
    function handleClickEvent(event, tweet, icon) {
        if (event.altKey) {
            openSettingsDialog();
            return;
        }

        const tweetUrl = extractTweetUrl(tweet);
        if (!tweetUrl) {
            showToast('Could not find the link of this tweet.', { type: 'error' });
            return;
        }

        if (settings.copyLink) copyToClipboard(tweetUrl);
        const save = event.shiftKey
            ? () => openNoteDialog(extras => saveTweetUrlToReadwise(tweetUrl, icon, extras))
            : () => saveTweetUrlToReadwise(tweetUrl, icon);
        if (!apiKey) {
            openApiKeyDialog({ onSaved: save });
            return;
        }
        save();
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            console.log('Tweet link copied!');
        } catch (err) {
            console.error('Error copying link:', err);
        }
    }

    // New layout: the timeline entry wrapper carries the tweet path in data-href.
    // Old layout and the main tweet on a status page: the timestamp link, else the first status link.
    function extractTweetUrl(tweet) {
        const href = tweet.closest('[data-timeline-entry][data-href]')?.dataset.href
            || tweet.querySelector('a[href*="/status/"]:has(> time)')?.getAttribute('href')
            || tweet.querySelector('a[href*="/status/"]')?.getAttribute('href');
        if (!href) return null;

        // Keep only /user/status/123, dropping /photo/1, /analytics, query strings etc.
        const path = new URL(href, location.origin).pathname.match(/^\/[^/]+\/status\/\d+/)?.[0];
        return path ? `${BASE_URL}${path}` : null;
    }

    // --- Readwise API ---

    // extras: { notes, tags } from the note dialog; tags fall back to the default tags from the settings
    function saveTweetUrlToReadwise(tweetUrl, icon, extras = {}) {
        const retry = () => saveTweetUrlToReadwise(tweetUrl, icon, extras);
        const fail = (message, logDetails) => {
            console.error('Failed to save tweet URL to Readwise:', logDetails);
            setIconState(icon, 'error');
            showToast(message, { type: 'error', actions: [{ label: 'Retry', onClick: retry }] });
        };

        setIconState(icon, 'saving');
        GM_xmlhttpRequest({
            method: 'POST',
            url: SAVE_API_URL,
            headers: { 'Content-Type': 'application/json', 'Authorization': `Token ${apiKey}` },
            data: JSON.stringify(buildSavePayload(tweetUrl, extras)),
            timeout: REQUEST_TIMEOUT,
            onload: response => {
                if ([200, 201].includes(response.status)) {
                    console.log('Tweet URL saved to Readwise:', tweetUrl);
                    setIconState(icon, 'saved');
                    if (settings.rememberSaved) rememberTweet(tweetUrl);
                    const readerUrl = parseJson(response.responseText)?.url;
                    // An existing document keeps its own note and tags, so say so instead of pretending they were added
                    const alreadySaved = extras.notes?.trim()
                        ? 'Already in your Reader library. Open it there to add your note'
                        : 'Already in your Reader library';
                    showToast(response.status === 200 ? alreadySaved : 'Saved to Reader', {
                        actions: readerUrl ? [{ label: 'Open', href: readerUrl }] : []
                    });
                } else if ([401, 403].includes(response.status)) {
                    console.error('Readwise rejected the API key:', response.status);
                    setIconState(icon, 'error');
                    openApiKeyDialog({ reason: 'Readwise rejected your saved API key.', onSaved: retry });
                } else if (response.status === 429) {
                    fail('Readwise is rate limiting saves. Try again in a minute.', response.status);
                } else {
                    fail(`Could not save to Readwise (HTTP ${response.status}).`, `${response.status} ${response.statusText}`);
                }
            },
            onerror: error => fail('Could not reach Readwise. Check your connection.', error),
            ontimeout: () => fail('Readwise took too long to respond.', 'timeout')
        });
    }

    function buildSavePayload(tweetUrl, { notes = '', tags = settings.tags } = {}) {
        const payload = { url: tweetUrl, category: 'tweet' };
        if (settings.location !== DEFAULT_SETTINGS.location) payload.location = settings.location;
        const tagList = parseTags(tags);
        if (tagList.length) payload.tags = tagList;
        if (notes.trim()) payload.notes = notes.trim();
        return payload;
    }

    // Resolves to 'valid', 'invalid' or 'unreachable'
    function validateApiKey(key) {
        return new Promise(resolve => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: AUTH_API_URL,
                headers: { 'Authorization': `Token ${key}` },
                timeout: REQUEST_TIMEOUT,
                onload: response => {
                    if (response.status === 204) resolve('valid');
                    else if ([401, 403].includes(response.status)) resolve('invalid');
                    else resolve('unreachable');
                },
                onerror: () => resolve('unreachable'),
                ontimeout: () => resolve('unreachable')
            });
        });
    }

    function parseJson(text) {
        try {
            return JSON.parse(text);
        } catch {
            return null;
        }
    }

    // --- Remembered saves (beta) ---
    // Only tweets saved with this script in this browser; nothing is synced with Readwise or other devices.
    // Stored as { statusId: savedAt } in Tampermonkey's storage.

    let rememberedTweets = null;

    function getRememberedTweets() {
        if (!rememberedTweets) rememberedTweets = GM_getValue(SAVED_TWEETS_KEY, null) || {};
        return rememberedTweets;
    }

    function tweetIdFromUrl(tweetUrl) {
        return tweetUrl?.match(/\/status\/(\d+)/)?.[1] || null;
    }

    function isRemembered(tweetUrl) {
        const id = tweetIdFromUrl(tweetUrl);
        return Boolean(id && getRememberedTweets()[id]);
    }

    function rememberTweet(tweetUrl) {
        const id = tweetIdFromUrl(tweetUrl);
        if (!id) return;
        // Re-read first so saves made in other tabs aren't overwritten
        rememberedTweets = null;
        let entries = Object.entries({ ...getRememberedTweets(), [id]: Date.now() });
        if (entries.length > MAX_REMEMBERED_TWEETS) {
            entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_REMEMBERED_TWEETS);
        }
        rememberedTweets = Object.fromEntries(entries);
        GM_setValue(SAVED_TWEETS_KEY, rememberedTweets);
    }

    function forgetRememberedTweets() {
        rememberedTweets = {};
        GM_setValue(SAVED_TWEETS_KEY, {});
    }

    // Marks buttons on screen after the setting or the stored list changed
    function refreshRememberedIcons() {
        document.querySelectorAll('.custom-copy-icon').forEach(icon => {
            if (!['idle', 'remembered'].includes(icon.dataset.state)) return;
            const tweet = icon.closest('article');
            const remembered = settings.rememberSaved && tweet && isRemembered(extractTweetUrl(tweet));
            setIconState(icon, remembered ? 'remembered' : 'idle');
        });
    }

    // --- Toasts ---

    // actions: [{ label, href }] opens a link, [{ label, onClick }] runs a callback
    function showToast(message, { type = 'info', actions = [], duration = 5000 } = {}) {
        document.querySelector('.rw-toast')?.remove();

        const toast = createElement('div', 'rw-toast');
        toast.dataset.type = type;
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
        toast.appendChild(createElement('span', '', message));

        actions.forEach(action => {
            let element;
            if (action.href) {
                element = createElement('a', 'rw-toast-action', action.label);
                element.href = action.href;
                element.target = '_blank';
                element.rel = 'noopener noreferrer';
            } else {
                element = createElement('button', 'rw-toast-action', action.label);
                element.type = 'button';
                element.addEventListener('click', () => {
                    toast.remove();
                    action.onClick();
                });
            }
            toast.appendChild(element);
        });

        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    // --- Dialogs ---

    // Opens an empty dialog with a title; the caller fills it and gets close() back
    function openDialog(titleText) {
        document.querySelector('.rw-overlay')?.remove();
        updateTheme();
        const previousFocus = document.activeElement;

        const overlay = createElement('div', 'rw-overlay');
        const dialog = createElement('div', 'rw-dialog');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'rw-dialog-title');
        dialog.dataset.rwTheme = document.documentElement.dataset.rwTheme;
        dialog.style.setProperty('--rw-surface', isDarkTheme() ? getComputedStyle(document.body).backgroundColor : '#fff');

        const title = createElement('h2', '', titleText);
        title.id = 'rw-dialog-title';
        dialog.appendChild(title);

        function close() {
            overlay.remove();
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
        }

        // Keep X's keyboard shortcuts from reacting while the dialog is open
        overlay.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') close();
        });
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) close();
        });

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        return { dialog, close };
    }

    function createButton(label, className, onClick) {
        const button = createElement('button', className, label);
        button.type = 'button';
        button.addEventListener('click', onClick);
        return button;
    }

    // Cancel and a primary button, pushed to the right
    function createDialogActions(primaryLabel, onPrimary, onCancel) {
        const actions = createElement('div', 'rw-actions');
        const primary = createButton(primaryLabel, 'rw-button rw-button-primary', onPrimary);
        actions.append(
            createElement('div', 'rw-spacer'),
            createButton('Cancel', 'rw-button rw-button-secondary', onCancel),
            primary
        );
        return { actions, primary };
    }

    // A labelled text input, select or textarea inside the bordered field style
    function createLabelledField(labelText, control) {
        const id = `rw-field-${Math.random().toString(36).slice(2)}`;
        control.id = id;
        const label = createElement('label', 'rw-label', labelText);
        label.htmlFor = id;
        const field = createElement('div', 'rw-field');
        field.appendChild(control);
        return [label, field];
    }

    function createCheckbox(labelText, checked) {
        const label = createElement('label', 'rw-check');
        const input = createElement('input');
        input.type = 'checkbox';
        input.checked = checked;
        label.append(input, createElement('span', '', labelText));
        return { label, input };
    }

    // --- API key dialog ---

    function openApiKeyDialog({ reason = '', onSaved = null } = {}) {
        const { dialog, close } = openDialog('Connect Readwise Reader');
        if (reason) dialog.appendChild(createElement('p', 'rw-reason', reason));
        dialog.appendChild(createElement('p', 'rw-text', 'Paste your Readwise access token to save tweets with one click. You only need to do this once.'));

        const link = createElement('a', 'rw-link', 'Get your access token ↗');
        link.href = API_KEY_URL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        dialog.appendChild(link);

        const field = createElement('div', 'rw-field');
        const input = createElement('input', 'rw-input');
        Object.assign(input, { type: 'password', value: apiKey || '', placeholder: 'Access token', autocomplete: 'off', spellcheck: false });
        input.setAttribute('aria-label', 'Readwise access token');
        const reveal = createElement('button', 'rw-reveal', 'Show');
        reveal.type = 'button';
        reveal.addEventListener('click', () => {
            const hidden = input.type === 'password';
            input.type = hidden ? 'text' : 'password';
            reveal.textContent = hidden ? 'Hide' : 'Show';
            input.focus();
        });
        field.append(input, reveal);
        dialog.appendChild(field);

        const status = createElement('p', 'rw-status');
        status.setAttribute('aria-live', 'polite');
        dialog.appendChild(status);

        const actions = createElement('div', 'rw-actions');
        if (apiKey) {
            const remove = createElement('button', 'rw-button-remove', 'Remove saved key');
            remove.type = 'button';
            remove.addEventListener('click', () => {
                apiKey = null;
                GM_setValue('apiKey', '');
                close();
                showToast('Readwise API key removed');
            });
            actions.appendChild(remove);
        }
        actions.appendChild(createElement('div', 'rw-spacer'));
        const cancel = createElement('button', 'rw-button rw-button-secondary', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', () => close());
        const save = createElement('button', 'rw-button rw-button-primary', 'Save');
        save.type = 'button';
        save.addEventListener('click', () => submit());
        actions.append(cancel, save);
        dialog.appendChild(actions);

        const setStatus = (message, type = 'info') => {
            status.textContent = message;
            status.dataset.type = type;
        };
        const updateSaveButton = () => {
            save.disabled = !input.value.trim();
        };

        async function submit() {
            const key = input.value.trim();
            if (!key || save.disabled) return;

            save.disabled = true;
            setStatus('Checking your token with Readwise…');
            const result = await validateApiKey(key);
            if (result === 'invalid') {
                setStatus('Readwise does not recognize this token. Copy it again from the link above.', 'error');
                updateSaveButton();
                input.focus();
                return;
            }
            if (result === 'unreachable') {
                setStatus('Could not reach Readwise to check the token. Try again.', 'error');
                updateSaveButton();
                return;
            }

            apiKey = key;
            GM_setValue('apiKey', key);
            close();
            if (onSaved) onSaved();
            else showToast('Readwise is connected');
        }

        input.addEventListener('input', () => {
            setStatus('');
            updateSaveButton();
        });
        input.addEventListener('keydown', event => {
            if (event.key === 'Enter') submit();
        });

        updateSaveButton();
        input.focus();
        input.select();
    }

    // --- Settings dialog ---

    function openSettingsDialog() {
        const { dialog, close } = openDialog('Settings');

        // Readwise connection
        const connection = createElement('section', 'rw-section');
        connection.appendChild(createElement('h3', '', 'Readwise'));
        const connectionRow = createElement('div', 'rw-row');
        connectionRow.append(
            createElement('p', 'rw-text', apiKey ? 'Connected with your access token.' : 'Not connected yet.'),
            createButton(apiKey ? 'Change token' : 'Connect', 'rw-button rw-button-secondary', () => {
                openApiKeyDialog({ onSaved: () => openSettingsDialog() });
            })
        );
        connection.appendChild(connectionRow);

        // What a click does
        const saving = createElement('section', 'rw-section');
        saving.appendChild(createElement('h3', '', 'When you click save'));
        const copyLink = createCheckbox('Also copy the tweet link to the clipboard', settings.copyLink);
        saving.appendChild(copyLink.label);

        const location = createElement('select', 'rw-input rw-input-text rw-select');
        LOCATIONS.forEach(({ value, label }) => {
            const option = createElement('option', '', label);
            option.value = value;
            option.selected = value === settings.location;
            location.appendChild(option);
        });
        saving.append(...createLabelledField('Save to', location));

        const tags = createElement('input', 'rw-input rw-input-text');
        Object.assign(tags, { type: 'text', value: settings.tags, placeholder: 'e.g. twitter, to-read', autocomplete: 'off' });
        saving.append(...createLabelledField('Tags', tags));
        saving.appendChild(createElement('p', 'rw-hint', 'Optional. Separate tags with commas. They are added to every tweet you save.'));

        // Beta: remembered saves
        const beta = createElement('section', 'rw-section');
        const betaTitle = createElement('h3', '', 'Show tweets you saved before');
        betaTitle.appendChild(createElement('span', 'rw-badge', 'BETA'));
        beta.appendChild(betaTitle);
        const rememberSaved = createCheckbox('Mark tweets I already saved in yellow', settings.rememberSaved);
        beta.appendChild(rememberSaved.label);
        beta.appendChild(createElement('p', 'rw-hint',
            'This only knows about tweets you saved with this script, in this browser, on this computer. '
            + 'Nothing is synced with Readwise or your other devices, so tweets saved anywhere else are not marked. '
            + 'The list stays in Tampermonkey\'s storage in this browser.'));

        const rememberedCount = Object.keys(getRememberedTweets()).length;
        if (rememberedCount) {
            const forget = createButton(`Forget ${rememberedCount} remembered ${rememberedCount === 1 ? 'tweet' : 'tweets'}`, 'rw-button-remove', () => {
                forgetRememberedTweets();
                refreshRememberedIcons();
                forget.remove();
                showToast('Forgot the tweets saved with this browser');
            });
            const forgetRow = createElement('div', 'rw-row');
            forgetRow.appendChild(forget);
            beta.appendChild(forgetRow);
        }

        dialog.append(connection, saving, beta, createElement('p', 'rw-shortcuts', SHORTCUTS_HINT));

        const { actions } = createDialogActions('Save', () => {
            saveSettings({
                copyLink: copyLink.input.checked,
                location: location.value,
                tags: parseTags(tags.value).join(', '),
                rememberSaved: rememberSaved.input.checked
            });
            refreshRememberedIcons();
            close();
            showToast('Settings saved');
        }, () => close());
        dialog.appendChild(actions);
        location.focus();
    }

    // --- Note dialog (Shift+Click) ---

    // Asks for a note and tags for one tweet, then calls onSubmit({ notes, tags })
    function openNoteDialog(onSubmit) {
        const { dialog, close } = openDialog('Save with a note');
        dialog.appendChild(createElement('p', 'rw-text', 'The note is saved with the tweet in Reader.'));

        const notes = createElement('textarea', 'rw-input rw-textarea');
        notes.placeholder = 'Why are you saving this?';
        dialog.append(...createLabelledField('Note', notes));

        const tags = createElement('input', 'rw-input rw-input-text');
        Object.assign(tags, { type: 'text', value: settings.tags, placeholder: 'e.g. twitter, to-read', autocomplete: 'off' });
        dialog.append(...createLabelledField('Tags', tags));
        dialog.appendChild(createElement('p', 'rw-hint', 'Separate tags with commas. Ctrl+Enter (⌘+Enter on Mac) saves.'));

        const submit = () => {
            close();
            onSubmit({ notes: notes.value, tags: tags.value });
        };
        const { actions } = createDialogActions('Save to Reader', submit, () => close());
        dialog.appendChild(actions);

        dialog.addEventListener('keydown', event => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit();
        });
        notes.focus();
    }

    function createElement(tag, className = '', text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    // --- Injection ---

    // Bookmark button per X layout: new (2026) layout first, then the old one
    const BOOKMARK_SELECTORS = ['[data-engagement-action="bookmark"]', '[data-testid="bookmark"]'];
    const SHARE_SELECTORS = ['[data-engagement-action="share"]'];
    // Reply never changes color (unlike like, repost or bookmark when active), so it's the reference for size and color
    const REPLY_SELECTORS = ['[data-engagement-action="reply"]', '[data-testid="reply"]'];
    const MISSING_BUTTONS_CHECK_DELAY = 5000;

    // First element matching one of the selectors that belongs to this tweet and not to a nested one
    function findOwnElement(tweet, selectors) {
        for (const selector of selectors) {
            const element = [...tweet.querySelectorAll(selector)].find(el => el.closest('article') === tweet);
            if (element) return element;
        }
        return null;
    }

    // Where the button goes in the tweet's action bar: right before bookmark, else before share
    function findButtonSlot(tweet) {
        const bookmark = findOwnElement(tweet, BOOKMARK_SELECTORS);
        if (bookmark) return { parent: bookmark.parentElement.parentElement, before: bookmark.parentElement };

        const share = findOwnElement(tweet, SHARE_SELECTORS);
        if (share) return { parent: share.parentElement, before: share };

        return null;
    }

    // X uses bigger icons for the main tweet on its own page, and a different gray per theme
    function matchXIconStyle(tweet, icon) {
        const replyIcon = findOwnElement(tweet, REPLY_SELECTORS)?.querySelector('svg');
        const size = replyIcon?.getBoundingClientRect().width;
        if (!size) return;
        icon.style.setProperty('--rw-icon-size', `${size}px`);
        icon.style.setProperty('--rw-icon-color', getComputedStyle(replyIcon).color);
    }

    function injectIcon(tweet, slot) {
        const icon = createIcon();
        if (settings.rememberSaved && isRemembered(extractTweetUrl(tweet))) setIconState(icon, 'remembered');
        matchXIconStyle(tweet, icon);
        attachCopyEvent(icon, tweet);
        const cell = createElement('div', 'rw-cell');
        cell.appendChild(icon);
        slot.parent.insertBefore(cell, slot.before);
    }

    function injectIconsToExistingTweets() {
        let themeUpdated = false;
        document.querySelectorAll('article').forEach(tweet => {
            const slot = findButtonSlot(tweet);
            if (!slot || slot.parent.querySelector(':scope > .rw-cell')) return;

            if (!themeUpdated) {
                updateTheme();
                themeUpdated = true;
            }
            injectIcon(tweet, slot);
        });
    }

    // Batch the many mutations X makes while scrolling into one pass per frame
    let injectionScheduled = false;
    function scheduleInjection() {
        if (injectionScheduled) return;
        injectionScheduled = true;
        requestAnimationFrame(() => {
            injectionScheduled = false;
            injectIconsToExistingTweets();
        });
    }

    function observeTweetList() {
        new MutationObserver(scheduleInjection)
            .observe(document.body, { childList: true, subtree: true });
        // Pick up tweets saved in other tabs when coming back to this one
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            settings = { ...DEFAULT_SETTINGS, ...(GM_getValue('settings', null) || {}) };
            rememberedTweets = null;
            refreshRememberedIcons();
        });
    }

    // Tweets on screen but no buttons usually means X changed its markup again
    function warnIfButtonsMissing() {
        if (document.querySelector('article') && !document.querySelector('.custom-copy-icon')) {
            console.warn('[Save to Readwise Reader] Tweets found, but no action bar matched. X may have changed its layout; please report this at https://github.com/floriankilian/SaveToReadwiseReaderOnTwitter/issues');
        }
    }

    // Initialize script
    main();
})();
