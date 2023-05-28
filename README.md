<!-- trunk-ignore(markdownlint/MD041) -->
<div align="center">

# 📊 Bevy Diagnostics Explorer – plugin and VSCode extension for visualizing diagnostics

[![Build status](https://github.com/zaycev/bevy-magic-light-2d/workflows/PR/badge.svg?branch=main)](https://github.com/zaycev/bevy-magic-light-2d/actions)
[![dependency status](https://deps.rs/repo/github/zaycev/bevy-diagnostics-explorer/status.svg)](https://deps.rs/repo/github/zaycev/bevy-diagnostics-explorer)

</div>

<div alight="center">

[![Discord](https://assets-global.website-files.com/6257adef93867e50d84d30e2/636e0b5061df29d55a92d945_full_logo_blurple_RGB.svg)](https://discord.gg/J4vdsnadnh) (ping me if it expires)

</div>


### How to use

1. Add dependency to Cargo.toml (TODO: publish to crates.io)
```toml
[dependencies]
bevy_diagnostics_explorer = { git = "...", branch = "main" }
```

2. Add plugin to your app
```rust
use bevy_diagnostics_explorer::DiagnosticExplorerAgentPlugin;
...
    .add_plugin(DiagnosticExplorerAgentPlugin)
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

5. Run VSCode with [Bevy Diagnostics Explorer](https://marketplace.visualstudio.com/items?itemName=xyzw-io.bevy-diagnostic-explorer) extension installed