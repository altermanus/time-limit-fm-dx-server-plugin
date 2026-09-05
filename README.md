# Time Limit Plugin for FM-DX Webserver
 
A server-side session management plugin for [FM-DX Webserver](https://github.com/NoobishSVK/fm-dx-webserver) that limits how long guest users can access the server. When the session expires, the user is disconnected and blocked from reconnecting for a configurable period.
 
## Features
 
- **Countdown widget** — displays the remaining session time in the top-right corner of the interface
- **Visual warnings** — the widget turns orange in the last 60 seconds, and red with a pulsing effect in the last 10 seconds
- **Full disconnection on expiry** — stops the audio stream, closes the WebSocket connection, and displays a "Session Expired" overlay
- **Reconnect countdown** — shows the user exactly when they can come back
- **IP-based blocking** — the block is enforced server-side, so simply refreshing the page does not bypass it
- **Admin exemption** — logged-in administrators are fully exempt; the widget does not appear for them
## Screenshot
 
<img width="1886" height="892" alt="image" src="https://github.com/user-attachments/assets/d6f6f83b-d0a7-4f1c-a3dc-1b5bee5cbe58" />
 
## Requirements
 
- FM-DX Webserver **v1.2.0 or newer**
## Installation
 
1. Download the ZIP file from this repository and extract it.
2. Copy the `TimeLimit-Plugin.js` file and the `TimeLimit/` folder into the `plugins/` directory of your FM-DX Webserver installation.
3. Restart FM-DX Webserver.
4. Log in to the **Administrator Panel**, go to **Plugins**, and enable **TimeLimit**.
5. Restart FM-DX Webserver again.
You should see the following line in the server console confirming the plugin loaded successfully:
 
```
[TimeLimit] Server plugin loaded. Limit: X min, Block: X min.
```
 
## Configuration
 
Open `TimeLimit/TimeLimit_server.js` and edit the two constants at the top of the file:
 
```javascript
const LIMIT_MINUTES = 10;   // How long a guest session lasts
const BLOCK_MINUTES = 30;   // How long the user is blocked after expiry
```
 
Restart the server after making changes.
 
## How it works
 
- When a guest connects, the server records their IP address and the connection timestamp.
- Every 30 seconds, the client checks in with the server to synchronize the remaining time.
- A local countdown runs between check-ins so the display stays smooth.
- When the session expires, the server sends a kick signal. The client stops the audio stream, closes all WebSocket connections, and shows the "Session Expired" overlay with a reconnect countdown.
- The block is tracked server-side by IP address. Refreshing the page will not reset the timer or bypass the block.
## File structure
 
```
plugins/
  TimeLimit-Plugin.js        ← main plugin entry point
  TimeLimit/
    TimeLimit.js             ← frontend (countdown widget, kick overlay)
    TimeLimit_server.js      ← server-side (session tracking, IP blocking)
```
 
## License
 
MIT License — free to use, modify and share.
 
## Author
 
Created by altermanus, with assistance from Claude (Anthropic).
