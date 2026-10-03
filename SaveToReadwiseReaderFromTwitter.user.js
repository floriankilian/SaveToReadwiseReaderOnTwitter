// ==UserScript==
// @name         Save Tweets to ReaderwiseReader within a tweet on Twitter/X
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Add a button to copy the URL of a tweet on Twitter without clicking dropdown, and also save it to ReaderwiseReader
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
// ==/UserScript==

(() => {
    'use strict';

    // Constants
    const BASE_URL = 'https://twitter.com';
    const API_KEY_URL = 'https://readwise.io/access_token';
    const SAVE_API_URL = 'https://readwise.io/api/v3/save/';
    const AUTH_API_URL = 'https://readwise.io/api/v2/auth/';
    const REQUEST_TIMEOUT = 15000;

    const CLIPBOARD_PATHS = '<path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" />';
    const svgIcon = extraPaths => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CLIPBOARD_PATHS}${extraPaths}</svg>`;
    const SVG_ICONS = {
        default: svgIcon(''),
        check: svgIcon('<path d="M9 14l2 2l4 -4" />'),
        error: svgIcon('<path d="M12 11v3" /><path d="M12 17h.01" />')
    };

    // Icon per button state; colors live in the stylesheet
    const ICON_STATES = {
        idle: { svg: SVG_ICONS.default, title: 'Save to Readwise Reader (Alt+Click: API key)' },
        saving: { svg: SVG_ICONS.check, title: 'Saving to Readwise Reader…' },
        saved: { svg: SVG_ICONS.check, title: 'Saved to Readwise Reader' },
        error: { svg: SVG_ICONS.error, title: 'Could not save. Click to try again' }
    };

    const STYLES = `
        :root { --rw-blue: rgb(29, 155, 240); --rw-red: rgb(244, 33, 46); --rw-saved: #FDE704;
            --rw-font: TwitterChirp, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        :root[data-rw-theme="light"] { --rw-saved: #B39700; }

        .custom-copy-icon {
            display: inline-flex; align-items: center; justify-content: center;
            border: 0; border-radius: 9999px; background: transparent;
            color: rgb(113, 118, 123); cursor: pointer;
            transition: color .15s, background-color .15s;
        }
        .custom-copy-icon svg { display: block; width: 100%; height: 100%; }
        .custom-copy-icon:hover, .custom-copy-icon:focus-visible { color: var(--rw-blue); background-color: rgba(29, 155, 240, .1); outline: none; }
        .custom-copy-icon[data-state="saving"] { color: var(--rw-blue); }
        .custom-copy-icon[data-state="saving"] svg { animation: rw-pulse 1s ease-in-out infinite; }
        .custom-copy-icon[data-state="saved"] { color: var(--rw-saved); }
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
            width: min(440px, 100%); box-sizing: border-box;
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
    `;

    // Stored API key, or null until the user sets one
    let apiKey = GM_getValue('apiKey', null) || null;

    // Main function
    function main() {
        try {
            injectStyles();
            registerMenuCommands();
            observeTweetList();
            injectIconsToExistingTweets();
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

    function handleClickEvent(event, tweet, icon) {
        if (event.altKey) {
            openApiKeyDialog();
            return;
        }

        const tweetUrl = extractTweetUrl(tweet);
        if (!tweetUrl) {
            showToast('Could not find the link of this tweet.', { type: 'error' });
            return;
        }

        copyToClipboard(tweetUrl);
        if (!apiKey) {
            openApiKeyDialog({ onSaved: () => saveTweetUrlToReadwise(tweetUrl, icon) });
            return;
        }
        saveTweetUrlToReadwise(tweetUrl, icon);
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            console.log('Tweet link copied!');
        } catch (err) {
            console.error('Error copying link:', err);
        }
    }

    function extractTweetUrl(tweet) {
        const statusLink = tweet.querySelector('a[href*="/status/"]');
        if (!statusLink) return null;

        const relativeLink = statusLink.getAttribute('href').split('?')[0].split('/photo/')[0];
        return `${BASE_URL}${relativeLink}`;
    }

    // --- Readwise API ---

    function saveTweetUrlToReadwise(tweetUrl, icon) {
        const retry = () => saveTweetUrlToReadwise(tweetUrl, icon);
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
            data: JSON.stringify({ url: tweetUrl, category: 'tweet' }),
            timeout: REQUEST_TIMEOUT,
            onload: response => {
                if ([200, 201].includes(response.status)) {
                    console.log('Tweet URL saved to Readwise:', tweetUrl);
                    setIconState(icon, 'saved');
                    const readerUrl = parseJson(response.responseText)?.url;
                    showToast(response.status === 200 ? 'Already in your Reader library' : 'Saved to Reader', {
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

    // --- API key dialog ---

    function openApiKeyDialog({ reason = '', onSaved = null } = {}) {
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

        const title = createElement('h2', '', 'Connect Readwise Reader');
        title.id = 'rw-dialog-title';
        dialog.appendChild(title);
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

        function close() {
            overlay.remove();
            if (previousFocus && previousFocus.isConnected) previousFocus.focus();
        }

        input.addEventListener('input', () => {
            setStatus('');
            updateSaveButton();
        });
        // Keep X's keyboard shortcuts from reacting while the dialog is open
        overlay.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape') close();
            if (event.key === 'Enter' && event.target === input) submit();
        });
        overlay.addEventListener('mousedown', event => {
            if (event.target === overlay) close();
        });

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
        updateSaveButton();
        input.focus();
        input.select();
    }

    function createElement(tag, className = '', text = '') {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    // --- Injection ---

    function injectIcon(tweet) {
        const icon = createIcon();
        adjustIconStyle(tweet, icon);
        attachCopyEvent(icon, tweet);
        tweet.appendChild(icon);
    }

    function adjustIconStyle(tweet, icon) {
        const style = tweetHasViews(tweet) ? {
            width: '22px',
            height: '22px',
            right: '64px'
        } : {
            width: '19px',
            height: '19px',
            right: '72px'
        };
        applyIconStyles(icon, style);
    }

    function applyIconStyles(icon, styles) {
        const defaults = {
            padding: '2px 5px',
            margin: '2px',
            position: 'absolute',
            bottom: '9px',
            boxSizing: 'content-box'
        };
        Object.assign(icon.style, { ...defaults, ...styles });
    }

    function tweetHasViews(tweet) {
        return [...tweet.querySelectorAll('span')].some(span => span.textContent.includes("Views"));
    }

    function injectIconsToExistingTweets() {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]:not(.has-custom-icon)');
        if (tweets.length) updateTheme();
        tweets.forEach(tweet => {
            tweet.classList.add('has-custom-icon');
            injectIcon(tweet);
        });
    }


    function observeTweetList() {
        new MutationObserver(injectIconsToExistingTweets)
            .observe(document.body, { childList: true, subtree: true });
    }

    // Initialize script
    main();
})();
