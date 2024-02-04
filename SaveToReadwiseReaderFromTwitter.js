// ==UserScript==
// @name         One Click Copy Link Button for Twitter(X)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add a button to copy the URL of a tweet on Twitter without clicking dropdown. Default to vxtwitter but customizable.
// @author       Dinomcworld
// @match        https://twitter.com/*
// @match        https://mobile.twitter.com/*
// @match        https://tweetdeck.twitter.com/*
// @match        https://x.com/*
// @icon         https://www.google.com/s2/favicons?domain=twitter.com
// @grant        none
// @license      MIT

// ==/UserScript==

(function () {
    'use strict';

    const baseUrl = 'https://vxtwitter.com';

    const defaultSVG = '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard" viewBox="0 0 24 24" stroke-width="2" stroke="#71767C" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /></svg>';
    const copiedSVG = '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard-check" viewBox="0 0 24 24" stroke-width="2" stroke="#00abfb" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 14l2 2l4 -4" /></svg>';

    function addCopyButtonToTweets() {
        const tweets = document.querySelectorAll('article[data-testid="tweet"]');

        tweets.forEach(tweet => {
            if (!tweet.querySelector('.custom-copy-icon')) {
                const copyIcon = document.createElement('span');
                copyIcon.classList.add('custom-copy-icon');
                copyIcon.innerHTML = defaultSVG;
                adjustIconStyle(tweet, copyIcon);
                copyIcon.addEventListener('click', (event) => {
                    event.stopPropagation();
                    const tweetUrl = extractTweetUrl(tweet);
                    if (tweetUrl) {
                        navigator.clipboard.writeText(tweetUrl)
                            .then(() => {
                                console.log('Tweet link copied!');
                                copyIcon.innerHTML = copiedSVG;
                            })
                            .catch(err => console.error('Error copying link: ', err));
                    }
                });

                tweet.appendChild(copyIcon);
            }
        });
    }

    function extractTweetUrl(tweetElement) {
        const linkElement = tweetElement.querySelector('a[href*="/status/"]');

        if (!linkElement) {
            return;
        }

        let url = linkElement.getAttribute('href').split('?')[0]; // Remove any query parameters

        if (url.includes('/photo/')) {
            url = url.split('/photo/')[0];
        }
        return `${baseUrl}${url}`;
    }

    function adjustIconStyle(tweet, copyIcon) {
        // Find all spans within the tweet
        const spans = tweet.querySelectorAll('span');
        let isIndividualTweet = false;

        spans.forEach(span => {
            if (span.textContent.includes("Views")) {
                isIndividualTweet = true;
            }
        });

        if (isIndividualTweet) {
            copyIcon.style.cssText = 'width: 22px; height: 22px; cursor: pointer; padding: 2px 5px; margin: 2px; position: absolute; bottom: 9px; right: 64px';
        } else {
            copyIcon.style.cssText = 'width: 19px; height: 19px; cursor: pointer; padding: 2px 5px; margin: 2px; position: absolute; bottom: 9px; right: 72px';
        }
    }


    const observer = new MutationObserver(addCopyButtonToTweets);
    observer.observe(document.body, { childList: true, subtree: true });

    addCopyButtonToTweets();
})();