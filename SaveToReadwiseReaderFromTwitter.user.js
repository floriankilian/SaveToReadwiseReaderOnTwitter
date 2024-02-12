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
// @license      MIT
// ==/UserScript==

(() => {
    'use strict';

    // Constants
    const BASE_URL = 'https://twitter.com';
    const SVG_ICONS = {
        default: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard" viewBox="0 0 24 24" stroke-width="2" stroke="#71767C" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /></svg>',
        copied: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard-check" viewBox="0 0 24 24" stroke-width="2" stroke="#00abfb" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 14l2 2l4 -4" /></svg>',
        saved: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard-check" viewBox="0 0 24 24" stroke-width="2" stroke="#FDE704" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 14l2 2l4 -4" /></svg>',
        error: '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard" viewBox="0 0 24 24" stroke-width="2" stroke="#8B0000" fill="8B0000" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /></svg>',

    };

    // Check for API key or prompt for one
    let apiKey = null;
    // let apiKey = getApiKey();

    // Main function
    function main() {
        try {
            observeTweetList();
            injectIconsToExistingTweets();
        } catch (e) {
            console.error('Error in main function:', e);
        }
    }


    function getApiKey() {
        let storedApiKey = GM_getValue('apiKey');
        if (!storedApiKey) {
            storedApiKey = promptForApiKey();
        }
        return storedApiKey;
    }

    function promptForApiKey() {
        return window.prompt('Please enter your API key for Readwise:');
    }

    function createIcon(svg) {
        const icon = document.createElement('span');
        icon.classList.add('custom-copy-icon');
        icon.innerHTML = svg;
        return icon;
    }

    function attachCopyEvent(icon, tweet) {
        icon.addEventListener('click', event => {
            event.stopPropagation();
            handleClickEvent(tweet, icon);
        });
    }

    function handleClickEvent(tweet, icon) {
        const tweetUrl = extractTweetUrl(tweet);
        if (event.altKey) {
            apiKey = promptAndUpdateApiKey(apiKey);
        } else {
            copyLinkAndSave(tweetUrl, icon);
        }
    }

    function promptAndUpdateApiKey(currentApiKey) {
        const newApiKey = promptForApiKey();
        if (newApiKey && newApiKey !== currentApiKey) {
            GM_setValue('apiKey', newApiKey);
        }
        return newApiKey || currentApiKey;
    }

    async function copyLinkAndSave(tweetUrl, icon) {
        try {
            await navigator.clipboard.writeText(tweetUrl);
            console.log('Tweet link copied!');
            icon.innerHTML = SVG_ICONS.copied;
            saveTweetUrlToReadwise(tweetUrl, icon);
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

    function saveTweetUrlToReadwise(tweetUrl, icon) {
        // Exit early if API key is missing
        if (!apiKey) {
            console.error('API key for Readwise is not set.');
            icon.innerHTML = SVG_ICONS.error;
            displayErrorMessage('API key for Readwise is not set. Alt+Click on the save icon to set the API key.');
            return;
        }

        const readerApiUrl = 'https://readwise.io/api/v3/save/';
        const data = { url: tweetUrl, category: 'tweet' };

        GM_xmlhttpRequest({
            method: "POST",
            url: readerApiUrl,
            headers: { "Content-Type": "application/json", "Authorization": `Token ${apiKey}` },
            data: JSON.stringify(data),
            onload: function (response) {
                if ([200, 201].includes(response.status)) {
                    console.log('Tweet URL saved to Readwise:', tweetUrl);
                    icon.innerHTML = SVG_ICONS.saved;
                } else {
                    console.error('Failed to save tweet URL to Readwise:', response.statusText);
                    icon.innerHTML = SVG_ICONS.error;
                }
            },
            onerror: function (error) {
                console.error('Error during the API request:', error);
            }
        });
    }

    function responseHandler(response, icon, tweetUrl) {
        return () => {
            if ([200, 201].includes(response.status)) {
                console.log('Tweet URL saved to Readwise:', tweetUrl);
            } else {
                console.error('Failed to save tweet URL to Readwise:', response.statusText);
            }
        };
    }

    function errorHandler(error, icon) {
        return () => {
            console.error('Error during the API request:', error);
        };
    }

    function displayErrorMessage(message) {
        const errorContainer = document.body.appendChild(document.createElement('div'));
        errorContainer.className = 'custom-error-message';
        errorContainer.textContent = message;
        applyErrorStyles(errorContainer);

        setTimeout(() => errorContainer.remove(), 5000);
    }

    function applyErrorStyles(container) {
        Object.assign(container.style, {
            position: 'fixed',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: '#800000',
            color: 'white',
            padding: '10px',
            borderRadius: '5px',
            zIndex: 9999,
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.2)',
            fontFamily: 'Helvetica, sans-serif'
        });
    }

    function injectIcon(tweet) {
        const icon = createIcon(SVG_ICONS.default);
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
            cursor: 'pointer',
            padding: '2px 5px',
            margin: '2px',
            position: 'absolute',
            bottom: '9px'
        };
        Object.assign(icon.style, { ...defaults, ...styles });
    }

    function tweetHasViews(tweet) {
        return [...tweet.querySelectorAll('span')].some(span => span.textContent.includes("Views"));
    }

    function injectIconsToExistingTweets() {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]:not(.has-custom-icon)');
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
