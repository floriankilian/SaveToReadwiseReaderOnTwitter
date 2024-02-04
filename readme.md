# Save Tweets to Readwise Reader with Tampermonkey
The "Save Tweets to Readwise" UserScript adds a convenient button to copy the URL tweet on Twitter without having to click through any dropdowns. Additionally provides the functionality to save to ReadwiseReader, a platform for organizing and remembering your highlights

## How to Install.
### Setup of Tampermonkey and the Userscript
1. Install [Tampermonkey](https://tampermonkey.net/).
2. Access the Script in [Raw View](https://github.com/floriankilian/SaveToReadwiseReaderOnTwitter/raw/main/SaveToReadwiseReaderFromTwitter.user.js).
3. Tampermonkey will prompt you to install the Userscript, click Install.

![Install Userscript on Tampermonkey](readme/tampermonkey-install-userscript.png)

### Get a Readwise API key
1. Get your Readwise [API key](https://readwise.io/access_token), and copy it to your clipboard. 

### Configuration
1. Access any Twitter URL (x/twitter)
2. On first visit of Twitter, you'll be prompted to provide your Readwise API key.
![API key request](readme/APIKey-Request.png)
3. Paste the API key from your clipboard.
4. Voila! You now have a small clipboard icon next to the bookmark icon.
![How it will be displayed](readme/tweet.png)
5. ON the first usage you will be requested to allow the domain. Click always allow domain.
![Allow domain](readme/tweet-fristtime.png)


## How to use
1. Click on the clipboard. It will change to blue if it is copied to clipboard and change to a yellow icon once it was send and saved sucessfully at Readwise Reader.
![Saved tweet](readme/tweet-saved.png){width=20%}


By following these simple installation steps, you can enhance your Twitter browsing experience by easily saving and sending tweets to Readwise.