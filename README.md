# plug-and-play

A minimalist, plug-and-play web application that streams music directly from a Rekordbox-formatted DJ USB drive on macOS.

## Features
- **Zero Configuration**: Automatically detects your Rekordbox USB (`export.pdb`) when launched.
- **Minimalist UI**: High contrast, monospaced typography with no visual clutter.
- **Playback Modes**: Sort by Recently Added or Shuffle tracks.
- **Instant Search**: Filter your entire library by track title or artist on the fly.
- **System Media Keys**: Supports native macOS media keys (⏮, ⏯, ⏭) via the Media Session API.

## Installation

You can run this project locally for development, or build it for production use.

### Prerequisites
- Node.js
- macOS (Requires terminal permission for "Removable Volumes")

### Setup
Clone the repository and install dependencies for both the backend and frontend:

```bash
git clone <your-repo-url>
cd plug-and-play

# Install backend dependencies
npm install

# Install frontend dependencies
cd ui && npm install && cd ..
```

### Running in Production
To build the UI and launch the standalone app (this serves the built app and auto-opens your browser):

```bash
npm run ui:build
npm start
```

### Global CLI Installation (Optional)
To install the package globally so you can launch it from anywhere simply by typing `plug-and-play` in your terminal:

```bash
npm run ui:build
npm install -g .
```

### Running in Development
To run both the Vite UI server and the Node backend with hot-reloading:

```bash
npm run dev
```
Open `http://localhost:5173` in your browser.

## macOS Permissions
The very first time you run the app, macOS will prompt you to grant your terminal access to **Removable Volumes**. You must accept this prompt so the app can read the USB stick. 

If you accidentally deny it, you can reset the prompt by running `tccutil reset SystemPolicyRemovableVolumes com.apple.Terminal` (replace with your terminal identifier, e.g., `com.microsoft.VSCode`).
