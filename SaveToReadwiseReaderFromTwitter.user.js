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

(function () {
    'use strict';

    // Define constants for base URL and SVG images for icons
    const baseUrl = 'https://twitter.com';
    const defaultSVG = '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard" viewBox="0 0 24 24" stroke-width="2" stroke="#71767C" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /></svg>';
    const copiedSVG = '<svg xmlns="http://www.w3.org/2000/svg" class="icon icon-tabler icon-tabler-clipboard-check" viewBox="0 0 24 24" stroke-width="2" stroke="#00abfb" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M9 5h-2a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-12a2 2 0 0 0 -2 -2h-2" /><path d="M9 3m0 2a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v0a2 2 0 0 1 -2 2h-2a2 2 0 0 1 -2 -2z" /><path d="M9 14l2 2l4 -4" /></svg>';

    // Initialize apiKey variable without assigning a value
    let apiKey = GM_getValue("apiKey", null); // Retrieves the API key from storage or null if not set

    // Function that checks for an API key in the storage, or prompts the user if it doesn't exist
    function promptForApiKey() {
        let apiKey = GM_getValue("apiKey");
        // Check if an API key is already stored
        if (apiKey) {
            // Inform the user that an API key is already set and ask if they want to update it
            let newApiKey = window.prompt("An API key for Readwise is already set. Enter a new API key to update it, or press OK to keep the current one.", apiKey);
            // If the user enters a new API key, update it; otherwise, keep the existing one
            if (newApiKey && newApiKey !== apiKey) {
                GM_setValue("apiKey", newApiKey);
                apiKey = newApiKey;
            }
        } else {
            // If no API key is set, prompt the user to enter it
            apiKey = window.prompt("Please enter your API key for Readwise:");
            GM_setValue("apiKey", apiKey);
        }
        return apiKey;
    }
    
    // Add copy button to tweets
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
                    // Check if the Alt key was pressed during the click
                    if (event.altKey) {
                        // Prompt for the API key if Alt key is pressed
                        apiKey = promptForApiKey();
                    } else {
                        // Copy the tweet URL to clipboard
                        navigator.clipboard.writeText(tweetUrl)
                        .then(() => {
                            console.log('Tweet link copied!');
                            // Initially indicate the link is copied
                            copyIcon.innerHTML = copiedSVG;
                            // Attempt to save the URL to Readwise and change the icon on success
                            saveTweetUrlToReadwise(tweet, tweetUrl, copyIcon);
                        })
                        .catch(err => console.error('Error copying link: ', err));
                    }
                });
                tweet.appendChild(copyIcon);
            }
        });
    }

    // Extract tweet URL from tweet element
    function extractTweetUrl(tweetElement) {
        console.log(tweetElement);
        const linkElement = tweetElement.querySelector('a[href*="/status/"]');
        if (!linkElement) {
            return;
        }
        let url = linkElement.getAttribute('href').split('?')[0]; // Remove any query parameters
        if (url.includes('/photo/')) {
            url = url.split('/photo/')[0];
        }
        console.log('extractTweetUrl!', url);
        return `${baseUrl}${url}`;
    }

    function extractAuthorName(tweetElement) {
        // Convert the tweet element to an HTML string
        const tweetHtml = tweetElement.outerHTML;
        
        // The end marker that is 100% after the author's name
        const endMarker = '</span></span></div><div dir="ltr"';
        // Find the position of the end marker in the HTML string
        const endMarkerIndex = tweetHtml.indexOf(endMarker);
        if (endMarkerIndex === -1) {
            console.log("Couldn't find the end marker.");
            return;
        }
        
        // The unique pattern that precedes the author's name but appears multiple times
        const startMarker = 'style="text-overflow: unset;">';
        // Find all occurrences of the start marker up to the end marker
        let lastStartMarkerIndex = -1;
        let tempIndex = tweetHtml.indexOf(startMarker, lastStartMarkerIndex + 1);
        while (tempIndex !== -1 && tempIndex < endMarkerIndex) {
            lastStartMarkerIndex = tempIndex;
            tempIndex = tweetHtml.indexOf(startMarker, lastStartMarkerIndex + 1);
        }
    
        if (lastStartMarkerIndex === -1) {
            console.log("Couldn't find the start marker before the end marker.");
            return;
        }
        
        // Calculate the starting point of the author's name
        const nameStart = lastStartMarkerIndex + startMarker.length;
        
        // The author's name is assumed to end where the HTML tag starts before the end marker
        const nameEnd = tweetHtml.indexOf('<', nameStart);
        if (nameEnd === -1 || nameEnd > endMarkerIndex) {
            console.log("Couldn't properly extract the author's name.");
            return;
        }
        
        // Extract the author's name based on the calculated indices
        const authorName = tweetHtml.substring(nameStart, nameEnd).trim();
        
        console.log('the author name is:', authorName);
        return authorName;
    }
    

    // Save tweet URL to Readwise
    function saveTweetUrlToReadwise(tweet, tweetUrl,copyIcon) {
        const apiToken = apiKey;
        if (!apiKey) {
            // Display an error message to the user
            displayErrorMessage("API key for Readwise is not set. Alt+Left click on the save icon to set the API key.");
            // Indicate missing API key by changing the icon color to red
            copyIcon.querySelector('svg').setAttribute('stroke', 'red');
            copyIcon.querySelector('svg').setAttribute('fill', 'red');
            console.error('API key for Readwise is not set.');
        } else 
        {
            const tweetAuthor = extractAuthorName(tweet)
            const readerApiUrl = 'https://readwise.io/api/v3/save/';
            const data = {
                url: tweetUrl,
                category: 'tweet'
            }
            if (tweetAuthor) {
                data.author = tweetAuthor;
            }
            ;
            GM_xmlhttpRequest({
                method: "POST",
                url: readerApiUrl,
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Token " + apiToken
                },
                data: JSON.stringify(data),
                onload: function (response) {
                    if (response.status === 200 || response.status === 201) {
                        console.log('Tweet URL saved to Readwise:', tweetUrl);
                        // Replace the icon color with yellow from ReadwiseReader to indicate success
                        copyIcon.querySelector('svg').setAttribute('stroke', '#FDE704');
                    } else {
                        // Handle non-successful responses by changing the icon color to red
                        copyIcon.querySelector('svg').setAttribute('stroke', 'red');
                        console.error('Failed to save tweet URL to Readwise:', response.statusText);
                    }
                },
                onerror: function (error) {
                    // Handle request errors by changing the icon color to red
                    copyIcon.querySelector('svg').setAttribute('stroke', 'red');
                    console.error('Error during the API request:', error);
                }
            });
        }
    }

    // Adjust icon style based on tweet type
    function adjustIconStyle(tweet, copyIcon) {
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

    function displayErrorMessage(message) {
        // Check if an error message container already exists
        let errorContainer = document.querySelector('.custom-error-message');
        
        // If it doesn't exist, create one and append it to the body
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'custom-error-message';
            document.body.appendChild(errorContainer);
        }
        
        // Set the error message text
        errorContainer.textContent = message;
        
        // Apply styles to make it visible and properly formatted
        errorContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background-color: #800000;
            color: white;
            padding: 10px;
            border-radius: 5px;
            z-index: 9999;
            box-shadow: 0px 4px 6px rgba(0, 0, 0, 0.2);
            font-family: Helvetica, sans-serif;
        `;
        
        // Automatically hide the error after a delay
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    }

    // Observe mutations and add copy button to new tweets
    const observer = new MutationObserver(addCopyButtonToTweets);
    observer.observe(document.body, { childList: true, subtree: true });

    // Add copy button to existing tweets
    addCopyButtonToTweets();
})();