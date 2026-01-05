# AI Rewriter Chrome Extension

![AI Rewriter Demo](demo.gif)

A powerful Chrome extension that leverages advanced AI models to rewrite and refine text directly within your browser. It integrates seamlessly into your workflow via the context menu, offering real-time streaming responses and support for multiple AI providers.

## Table of Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation & Setup](#installation--setup)
- [Configuration](#configuration)
- [Development](#development)
- [Planning & Roadmap](#planning--roadmap)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Context Menu Integration**: Simply highlight text on any webpage, right-click, and select "AI Rewriter | Rewrite it".
- **Multi-Provider Support**:
  - **OpenRouter**: Access a wide range of models (GPT-4, Claude, etc.) via OpenRouter.
  - **OpenAI**: Connect directly to OpenAI's API.
  - **Google Gemini**: Use Google's generative AI models via the `@google/generative-ai` SDK.
- **Real-Time Streaming**: Watch the rewritten text appear in real-time as it's generated, providing immediate feedback.
- **Modern UI**:
  - **Overlay Modal**: A clean, dark-mode modal displays the rewritten text over the webpage.
  - **Copy to Clipboard**: One-click button to copy the refined text.
  - **Typing Effect**: Visual cues (blinking cursor) during streaming.
- **Dynamic Model Fetching**: Automatically fetches and lists available models based on your API key and provider.
- **Secure Settings**: API keys and preferences are stored securely using `chrome.storage.sync`.

## How It Works

1. **Selection**: The user selects text on a webpage.
2. **Context Menu**: The user right-clicks and triggers the extension.
3. **Background Processing**: The background service worker receives the event and initiates an API request to the configured AI provider.
4. **Streaming**: The AI response is streamed back chunk-by-chunk to the content script.
5. **Display**: The content script displays a modal overlay on the page, updating in real-time as tokens arrive.

## Tech Stack

- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict typing for robustness)
- **Build Tool**: [Webpack 5](https://webpack.js.org/) (Bundling and asset management)
- **Platform**: Chrome Extension Manifest V3
- **AI Integration**:
  - `openai` (for OpenRouter/OpenAI compatibility)
  - `@google/generative-ai` (for Gemini)
- **Styling**: CSS (loaded via `style-loader` and `mini-css-extract-plugin`)

## Project Structure

```
ai-rewriter/
├── src/
│   ├── background/
│   │   └── background.ts       # Service worker: handles context menu & API coordination
│   ├── content/
│   │   └── content.ts          # Content script: handles UI overlay & streaming display
│   ├── popup/
│   │   ├── popup.html          # Extension settings UI structure
│   │   ├── popup.css           # Extension settings UI styling
│   │   └── popup.ts            # Extension settings logic (save keys, fetch models)
│   ├── services/
│   │   ├── ai.service.ts       # Core logic for API calls (OpenAI/Gemini) & streaming
│   │   └── storage.service.ts  # Wrapper for chrome.storage.sync
│   └── types/
│       └── index.ts            # Shared TypeScript interfaces (Settings, Messages, etc.)
├── public/                     # Static assets (icons, manifest.json)
├── webpack.config.js           # Webpack build configuration
├── tsconfig.json               # TypeScript configuration
├── package.json                # Dependencies and scripts
└── README.md                   # Project documentation
```

## Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/)

### Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ai-rewriter
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Build the extension**
   ```bash
   npm run build
   ```
   This creates a `dist` directory with the compiled extension.

4. **Load into Chrome**
   - Open Chrome and navigate to `chrome://extensions/`.
   - Enable **Developer mode** (toggle in the top right).
   - Click **Load unpacked**.
   - Select the `dist` folder generated in step 3.

## Configuration

Once installed, click the extension icon in the Chrome toolbar to open the settings popup.

1. **Select Provider**: Choose between `OpenRouter`, `OpenAI`, or `Gemini`.
2. **Enter API Key**:
   - **OpenRouter**: Get a key from [openrouter.ai](https://openrouter.ai/).
   - **OpenAI**: Get a key from [platform.openai.com](https://platform.openai.com/).
   - **Gemini**: Get a key from [makersuite.google.com](https://makersuite.google.com/).
3. **Select Model**:
   - The extension will try to auto-fetch available models.
   - You can also manually type a model name (e.g., `gpt-4o`, `gemini-1.5-flash`).
4. **Save**: Click "Save Settings".

## Development

- **Watch Mode**: Automatically rebuilds on file changes.
  ```bash
  npm run watch
  ```
- **Development Build**:
  ```bash
  npm run dev
  ```
- **Production Build**: Minifies code for release.
  ```bash
  npm run build
  ```

## Planning & Roadmap

### Future Improvements
- **Custom Prompts**: Allow users to define their own rewriting instructions (e.g., "Make it professional", "Make it funny") instead of the hardcoded "refine it in basic english".
- **History**: Keep a local history of rewritten texts.
- **Direct Replacement**: Add an option to directly replace the selected text in editable fields (inputs, textareas) instead of showing a modal.
- **More Providers**: Add support for Anthropic (Claude) direct integration or local LLMs (Ollama).
- **UI Enhancements**:
  - Draggable modal.
  - Dark/Light mode toggle for the popup.
  - Markdown rendering in the output.

## Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
