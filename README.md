# Onion Whisper

A small live chat room that runs as a Tor v3 onion service. The host runs one command, gets an onion address to share, and friends open it in Tor Browser, choose a name, and enter the same passphrase.

## Security model

- Tor keeps the host network location private from participants.
- Messages are encrypted locally with AES-256-GCM before being sent. The Node server is a blind, memory-only relay.
- Use a unique 12+ character passphrase and share it separately from the onion link.

This is a shared-secret group chat, not a substitute for a professionally audited messenger. Anyone with the passphrase can read the room.

## Host a room

Install Node.js 20+ and the official Tor Expert Bundle. Then run:

```sh
npm install
npm start
```

On Windows, point the app directly at `tor.exe` if needed:

```cmd
set "TOR_PATH=C:\path\to\tor.exe"
npm start
```

The app prints an `http://...onion` address. Keep the terminal open while chatting.

## Join

Open the onion link in Tor Browser, choose a display name, and enter the shared passphrase. Android users can use Tor Browser for Android; iOS users need a Tor-capable browser such as Onion Browser.

## Privacy

The `.onion-whisper/hidden-service/` folder contains the service identity and must remain private. It is excluded from Git. Messages are never saved; there are no accounts, telemetry, or analytics.
