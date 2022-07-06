
## The Myriac IDE

This repository hosts the source code for the Myriac IDE, a fork of [Visual Studio Code](https://github.com/microsoft/vscode) that provides a batteries-included, opinionated environment for data science and scientific authoring.

### Development

The easiest way to do development right now is in a [Development Container](https://code.visualstudio.com/docs/remote/containers).

#### Prequisites

Install the following on your system:

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) or compatible container runner
2. A recent version of Visual Studio Code
3. The **Remote - Containers** Visual Studio Code extension
4. A local clone of this repository

Optionally, from the repository root, establish an upstream remote to VS Code:

#### Setup

Open the repository in Visual Studio Code. You'll be prompted to "Reopen in Container"; do so. The Terminal panel will show you the container build progress; expect it to take quite some time (10-15 minutes even on good hardware).

Once this is done, VS Code will switch context to the container. You'll see `Dev Container: Myriac` in the status bar. Your repository will be mounted in `/workspaces/myriac` inside the container.

Perform a one-time initial build of Myriac by opening a Terminal and running, from `/workspaces/myriac`:

```bash
$ yarn
```

#### Iterating and Running

Open a new Terminal and run the following commands. The `nvm use 16` is sometimes necessary since Code currently requires a Node 16 dev environment (latest is 18 but container has 14).

```bash
$ nvm use 16
$ yarn watch
```

You'll know it's ready when you see `Finished compilation` in the terminal; the `yarn watch` command does not exit because it's watching for changes to build.

When `yarn watch` has indicated it's ready, open a second Terminal and run:

```bash
$ ./scripts/code-server.sh
```

This will give you a URL that looks like http://localhost:9888/?tkn=14202de2-c716-437f-8c67-1c5166443e5a.

Click the `Ports` tab and add port `9888` to the list, then open your browser and navigate to the URL. Myriac should then load in your browser; most changes you make in VS Code will be reflected after being picked up by the `yarn watch` window.

### Fork Management

To merge changes from the [upstream Code - OSS repository](https://github.com/microsoft/vscode), pull from the upstream remote using this script:

```bash
$ ./scripts/pull-upstream.sh
```

Currently we merge frequently and stay right on the tip of the main branch, though this strategy may change when stabilization becomes a concern down the road.

### Logging

The Myriac overlays emit logs via VS Code's log service. When doing development work or reproducing bugs, it's useful to change the log level to `TRACE`.

Use the *Developer: Set Log Level* command in the Command Palette to change the log level to `DEBUG` or `TRACE` as desired. The logs will appear in the **Console** tab of the Developer Tools in the browser.

When writing code, avoid using `console.log` directly; instead, get an `ILogService` instance and use the symmetric methods (`logService.debug`, `logService.trace`, `logService.info`, etc.) This will allow the aforementioned configuration tools to control the logging of your feature.

### Related Repositories

- [Amalthea](https://github.com/rstudio/amalthea), a Jupyter kernel framework written in Rust
- [Myriac Console](https://github.com/rstudio/myriac-console), a prototype for a Jupyter-powered interactive console
- [Code - OSS](https://github.com/microsoft/vscode), the upstream VS Code OSS repository
- [OpenVSCode Server](https://github.com/gitpod-io/openvscode-server), another fork of VS Code focused on running in the browser

