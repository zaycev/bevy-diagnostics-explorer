<!-- trunk-ignore(markdownlint/MD041) -->
<div align="center">

# 📊 Bevy Diagnostics Explorer – plugin and VSCode extension for visualizing diagnostics

[![Build status](https://github.com/zaycev/bevy-magic-light-2d/workflows/PR/badge.svg?branch=main)](https://github.com/zaycev/bevy-magic-light-2d/actions)
[![dependency status](https://deps.rs/repo/github/zaycev/bevy-diagnostics-explorer/status.svg)](https://deps.rs/repo/github/zaycev/bevy-diagnostics-explorer)

</div>

<div alight="center">

[![Discord](https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0b5061df29d55a92d945_full_logo_blurple_RGB.svg)](https://discord.gg/J4vdsnadnh) (ping me if it expires)

</div>


## How to use

[![Watch the video](https://img.youtube.com/vi/Set37p2VSG0/hqdefault.jpg)](https://youtu.be/Set37p2VSG0)

1. Add dependency to Cargo.toml:
```toml
[dependencies]
bevy_diagnostics_explorer = "0.1.0"
```

2. Add plugin to your app:
```rust
use bevy_diagnostics_explorer::DiagnosticsExplorerPlugin;
...
    .add_plugin(DiagnosticsExplorerPlugin)
```

3. Disable default logging system
```rust
use bevy::log::LogPlugin;

...
    .disable::<LogPlugin>()

```

4. Enable `trace` feature for Bevy in Cargo.toml:
```toml
[dependencies]
bevy = { version = "...", features = ["trace"] }
```

5. Run VSCode with [Bevy Diagnostics Explorer](https://marketplace.visualstudio.com/items?itemName=xyzw-io.bevy-diagnostic-explorer);

## How it works?

Based on [Tracing](https://github.com/tokio-rs/tracing), [Actix](https://actix.rs/), and [VSCode](https://code.visualstudio.com/api/extension-guides/tree-view).

- The plugin initiates a global tracing subscriber, named AgentTracingLayer. Its function is to gather diagnostic spans from the application, which are then stored in a temporary buffer. This storage process utilizes the cross-beam channel.
- Next, the plugin creates a background thread. This thread includes an HTTP server, provided by Actix, that serves the collected spans.
- The v1 encoding for spans and name registries is done in a simple and compact manner. In essence, it is a set of base64 buffers.
- Lastly, the VScode extension performs a consolidation of all spans. It uses the scope/name key for this purpose, and it displays average durations calculated over an entire observed time period.