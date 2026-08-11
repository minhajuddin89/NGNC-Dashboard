# Real-Time Ping & Network Monitor

A premium, high-performance, real-time network monitoring application built with **Node.js (Express & Socket.IO)** and **Vanilla HTML/CSS/JS**. It supports multiple pinging modes (ICMP, TCP, UDP), source IP binding, traceroutes, My Traceroute (MTR), BGP routing path visualization, and Globalping integration.

---

## 🚀 Quick Start

### Prerequisites
- **Node.js**: v18+ recommended.
- **OS**: Windows (optimized for Windows command utilities).

### Installation
Install the project dependencies:
```powershell
npm install
```

### Running the Application
To run the server in development mode:
```powershell
npm run dev
```
The application will start on [http://localhost:3000](http://localhost:3000).

### Packaging the Application
To compile the application into a standalone Windows executable (`ping-monitor.exe`):
```powershell
npm run package
```

---

## 🛠 Architecture & Tech Stack

### Backend (`server.js`)
- **Express**: Serves the static assets and handles REST API endpoints (like BGP looking glass data and public IP detection).
- **Socket.IO**: Drives the real-time, low-latency communication between the client and the server.
- **Native Spawning**:
  - Uses Windows native `ping` for ICMP pinging.
  - Uses Windows native `tracert` for traceroute path discovery.
  - Support for `tracetcp` (requires installation) for TCP-based traceroutes.
- **Native Sockets**:
  - Uses Node's `net.Socket` for TCP-based pinging.
  - Uses Node's `dgram` for UDP-based pinging.
- **External APIs**:
  - **RIPEstat Looking Glass API**: Fetches BGP routing paths.
  - **IP-API**: Fetches ISP, Autonomous System (AS), and organization details.
  - **Globalping API**: Triggered for distributed global network checks.

### Frontend (`public/`)
- **Core**: Vanilla HTML5, CSS3, and JavaScript (ES6+).
- **Socket.IO Client**: Establishes full-duplex connection to receive stream updates.
- **Modern UI**: Designed with clean, dark-mode aesthetics, responsive layouts, and status indicator animations.

---

## 📋 AI Execution Ledger

This section tracks all tasks performed on this codebase. Other AI agents should read this ledger to understand what has been done, the rationale behind changes, and how to execute similar tasks in the future.

### Completed Tasks

#### 🔹 TASK-001: Project Initialization & Core Ping Engine
*   **Description**: Set up the project foundation, including Express/Socket.IO server, and implemented the core pinging algorithms (ICMP, TCP, UDP).
*   **Status**: `Completed`
*   **Files Modified**:
    *   [package.json](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/package.json)
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   *ICMP*: Spawned Windows `ping` command (`ping -n 1 -w 500 -S <sourceIP> <target>`). Added a 2-second safety timeout to kill hung processes.
    *   *TCP*: Built a socket connection using Node's `net` module. Handled `ECONNREFUSED` as a sign the host is online (but the port is closed).
    *   *UDP*: Sent a 1-byte UDP datagram using Node's `dgram` module. Handled `ECONNRESET`/`ENETRESET` (Windows ICMP Port Unreachable response) as an online signal.
*   **Verification**: Run the test script `node test_30.js` to ensure the server starts and successfully pings 30 targets.

#### 🔹 TASK-002: Advanced Network Diagnostics (Traceroute, MTR, BGP, Globalping)
*   **Description**: Integrated traceroute, My Traceroute (MTR) with subscription mechanics, BGP looking glass queries, and Globalping APIs.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   *Traceroute*: Spawns `tracert -d <target>` and streams output line-by-line via Socket.IO.
    *   *MTR*: Initiates a route discovery using `tracert` or `tracetcp`, maps the hops, and then runs a continuous ping loop (every 2 seconds) on all discovered hop IPs. Clients subscribe/unsubscribe dynamically to avoid running unnecessary background MTRs.
    *   *BGP Routing*: Fetches looking-glass data from RIPEstat and sorts paths to prioritize Hurricane Electric (AS6939) and shortest AS paths.
    *   *Globalping*: Integrated staggered API requests to run distributed pings.
*   **Verification**: Use the frontend interfaces [mtr.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/mtr.html), [trace.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/trace.html), and [bgp.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/bgp.html) to run interactive tests.

#### 🔹 TASK-003: AI Execution Protocol & Documentation
*   **Description**: Create the `README.md` file containing the project documentation and the AI Execution Ledger.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [README.md](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/README.md)
*   **Implementation Strategy**: Documented setup instructions, architecture, task history, and guidelines for future AI systems to maintain project consistency.
*   **Verification**: Visual inspection of this markdown file.

#### 🔹 TASK-005: Continuous Pinging Without Early Termination
*   **Description**: Prevent the ping monitor from stopping when a target suffers packet loss or goes offline.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   Removed `activeTargets.delete(host)` in the continuous monitoring loop when `err` or `result.status === 'offline'` occurs.
    *   Removed the `isOffline` check and subsequent `break` in the `check-once` loop.
*   **Verification**: Run the test suite and verify that targets continue to be pinged even when they return `offline` or `Host not found`.

#### 🔹 TASK-006: Redundant "Lost" Column Removal
*   **Description**: Remove the redundant "Lost" statistics column from the UI cards to declutter the layout.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
*   **Implementation Strategy**:
    *   Removed the "Lost" stat-item from `createTargetCard` HTML template.
    *   Removed the `lostEl` and `lossWrapper` DOM queries and updates from `updateCardUI`.
    *   Maintained the "Recv/Sent" and "Succ / Fail" metrics which implicitly show packet loss.
*   **Verification**: Visually inspect the ping cards to ensure the "Lost" column is gone and the remaining items span the card width correctly.

#### 🔹 TASK-007: Fallback to Nearby Pingable IP (Dedicated Row)
*   **Description**: Find and ping a nearby active IP address if the target IP is offline, displaying it as a nested card directly below.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
*   **Implementation Strategy**:
    *   *Backend*: Added a parallel neighbor scanner (+/- 10 IPs). When a target fails, it starts a fallback IP and adds it to `activeTargets` dynamically, mapping it to the parent. Removes it if the parent recovers.
    *   *Frontend*: Dynamically instantiates the fallback IP card, indents it, and inserts it directly after the parent. Implemented a smooth fade-out removal.
*   **Verification**: Add an offline IP. Verify a nested card is created underneath.

#### 🔹 TASK-008: Skyblue Theme & Nested Child Layout for Fallbacks
*   **Description**: Style and scale down the fallback IP card to clearly present it as a child row of the parent target.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [public/style.css](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/style.css)
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
*   **Implementation Strategy**:
    *   *CSS*: Styled fallback cards using a light skyblue theme (`#38bdf8`). Scaled down the entire card (`transform: scale(0.96)`), added a dashed border, reduced padding, and increased the indentation (`margin-left: 24px`).
    *   *Typography & Elements*: Reduced the font sizes of headings, status/ISP texts, sparkline charts, and buttons inside fallback cards to establish a clear visual hierarchy.
*   **Verification**: Visually inspect the fallback card to verify it is smaller, indented, and matches the skyblue theme.

#### 🔹 TASK-009: Statistics Reset Button Per Target Row
*   **Description**: Add a small reset button next to each target card to clear its metrics, chart history, and logs.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
*   **Implementation Strategy**:
    *   *HTML*: Added a `.btn-reset` button next to the MTR button inside `.card-info` using a flex container.
    *   *JS*: Implemented `resetTargetStats(target)` which clears the target's stats, empties chart datasets, and updates the DOM elements.
*   **Verification**: Click the reset icon on any card; verify its Sent/Recv counts go back to 0, latency history is cleared, and the chart resets.

#### 🔹 TASK-010: Dynamic Target Addition During Active Session
*   **Description**: Allow users to add one or multiple new targets to the active monitoring session without stopping it.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
    *   [public/index.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/index.html)
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
*   **Implementation Strategy**:
    *   *HTML*: Added a hidden `addActiveTargetGroup` input group at the bottom of the configuration panel.
    *   *Frontend*: Displays the input group when monitoring starts. When "Add" is clicked, it parses new targets, initializes their states, creates cards, and emits `add-targets` to the server.
    *   *Backend*: Registers a session-scoped `add-targets` listener. When received, it adds the new targets to `activeTargets` and triggers staggered DNS/Globalping queries.
*   **Verification**: Start a session. Type a new IP in the "Add Target(s) to Session" input and click Add. Verify that a new card is added and immediately starts pinging.

#### 🔹 TASK-011: Timeout Optimization to Prevent False Packet Loss
*   **Description**: Increase ICMP, TCP, and UDP ping timeout parameters to 1500ms to eliminate false packet loss due to network jitter and process spawning overhead.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   *Backend*: Changed the `-w` flag in Windows `ping` from `500` to `1500` (1.5 seconds) in `pingHost`. Increased TCP and UDP connection timeouts in `pingHostTcp` and `pingHostUdp` from `1000` to `1500`.
*   **Verification**: Run a ping test; verify that packet loss statistics match the native Windows CMD ping command.

#### 🔹 TASK-012: Hybrid Subnet Neighbor Scanner
*   **Description**: Implement a two-phase hybrid scanner (fast parallel + slow serial) that searches for a nearby active IP in the `/24` subnet when a target goes offline.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   *Phase 1 (Parallel)*: Immediately scans the closest `+/- 20` IPs in parallel.
    *   *Phase 2 (Serial)*: If Phase 1 fails, sequentially sweeps the rest of the `/24` subnet one IP at a time, with an 80ms delay between pings to avoid triggering IDS/firewall blocks.
    *   *Early Exit*: Stops scanning immediately when any active IP is found.
*   **Verification**: Verify that fallback IPs are found quickly for offline hosts, without triggering rate limiting or network blockages.

#### 🔹 TASK-013: Subnet Search Warning Notice on UI
*   **Description**: Display a warning notice on the card if the hybrid scanner sweeps the entire `/24` subnet and finds no active IP.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
*   **Implementation Strategy**:
    *   *Backend*: Emits a `fallback-ip-not-found` event to the client if the subnet sweep finishes without finding any active host.
    *   *Frontend*: Renders a hidden `<span class="card-notice-text">` under the card title. Displays "⚠ No pingable IP at this subnet" in red when the event is received. Clears and hides the notice when the target recovers or is reset.
*   **Verification**: Add an offline Cloudflare IP (e.g., `104.30.150.249`). Wait for 10 consecutive losses. Let the sweep finish. Verify that the red warning notice appears below the card title.

#### 🔹 TASK-014: TCP Traceroute and tracetcp Support
*   **Description**: Enable TCP Traceroute (`tracetcp`) support in both standard Traceroute and My Traceroute (MTR) modes.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
    *   [public/trace.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/trace.html)
*   **Implementation Strategy**:
    *   *Bundled Binary*: Downloaded and placed the pre-compiled `tracetcp.exe` (v1.0.3) in the project root.
    *   *Backend*: Updated `start-traceroute` and `startBackgroundMtr` in `server.js` to detect and spawn the local `tracetcp.exe` using its absolute path if the TCP mode is selected. It accepts target, mode, and port arguments.
    *   *Frontend*: Updated `public/trace.html` to parse `mode` and `port` from the URL parameters and emit them to the server.
*   **Verification**: Open `trace.html?target=1.1.1.1&mode=tcp&port=80`. Verify that a TCP traceroute is successfully executed using `tracetcp.exe`.

#### 🔹 TASK-015: Integrated Port Scanner
*   **Description**: Implement an integrated Port Scanner that allows scanning common ports or a custom port range for any target.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
    *   [public/ports.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/ports.html)
*   **Implementation Strategy**:
    *   *HTML/CSS*: Created `ports.html` with a premium dark glassmorphism layout, progress bar, presets (Common, Web, DB, Custom), and a toggle to show/hide closed ports.
    *   *Backend*: Implemented a non-blocking TCP port scanner using Node's `net.Socket`. Checks ports in parallel (concurrency limit of 30) and resolves service names (e.g., SSH, HTTPS, Redis, MySQL).
    *   *Frontend*: Added a "Port Scanner" button (radar icon) next to the MTR button on each card, which opens the port scanner window for that specific target.
*   **Verification**: Click the Port Scanner button on any card. Select a preset and click "Start Scan". Verify that open ports are discovered in real-time with their service names and response times.

#### 🔹 TASK-016: Strict Router Connection Enforcement & Syntax Hotfix
*   **Description**: Prevent unauthorized plink spawns when the router is not explicitly logged in to block unsolicited Duo pushes, and resolve startup syntax errors/leftover code.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   *Backend*: Modified `pingHostRemotePlink`, `start-traceroute`, and `startBackgroundMtr` to reject command execution and return connection errors if the persistent interactive plink shell is not active.
    *   *Syntax Clean up*: Removed leftover blocks of code and correctly closed nested conditional blocks inside `startBackgroundMtr` to resolve the `SyntaxError: Unexpected token ')'` at startup.
*   **Verification**: Run `node server.js` to ensure the server starts successfully on port 3000 without syntax errors.

#### 🔹 TASK-004: UI Refinement and Micro-Animations
*   **Description**: Improve the styling and responsive layout of the dashboard pages to align with premium design aesthetics.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [public/style.css](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/style.css)
    *   [public/bgp.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/bgp.html)
*   **Implementation Strategy**:
    *   *Dashboard UI*: Enhanced background with deep ambient glowing spots, modernized input focus states, refined button styles with smooth gradient animations/scaling active states, and styled developer-themed console output.
    *   *Badges & Indicators*: Replaced static status labels with dynamic pulsing dot indicators (glowing green/red) that visually signal online/offline transitions.
    *   *BGP Looking Glass*: Updated the BGP details window to a modern glassmorphic theme matching the core application layout.
*   **Verification**: Run the server and test visual updates across the dashboard and route detail pages.

#### 🔹 TASK-018: Resolved Client UI Freeze, Window Target Exceptions, & Plink Timeout drop issues
*   **Description**: Resolved UI crashes on stop-monitoring actions, resolved `window.open` target exceptions in modern browsers, added connection status indicators, and fixed tight ping timeouts on Huawei PE checks.
*   **Status**: `Completed`
*   **Files Modified**:
    *   [public/app.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/app.js)
    *   [public/index.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/index.html)
    *   [public/router.html](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/public/router.html)
    *   [server.js](file:///C:/Users/minhaj.uddin/.gemini/antigravity/scratch/ping-monitor/server.js)
*   **Implementation Strategy**:
    *   *Client UI Crash Fix*: Resolved `ReferenceError: interfaceSelect is not defined` crash in `handleStoppedState` by safely checking element existence before updating properties.
    *   *Connection Indicator*: Added `connect` and `disconnect` socket listeners in `app.js` and a status indicator light in `index.html` to show active connection status and cleanly stop/pause the UI if disconnections happen.
    *   *Window Target Exception Fix*: Replaced invalid/unsupported window name parameters (containing spaces/dashes/dots) inside `window.open` calls across `app.js` and `router.html` with clean alphanumeric equivalents to prevent browser pop-up blockages.
    *   *Huawei Timeout Fix*: Increased Huawei PE router ping timeout parameters in `pingHostRemotePlink` from `-t 300` (300ms) to `-t 1500` (1500ms) to prevent false packet loss and command timeouts over high-latency paths.
*   **Verification**: Rebuild binary using `npm run package` and test tool popups (MTR, Trace, Ports) and router checks.

### In Progress / Planned Tasks

None. All currently planned items are completed.

---

## 🤖 Guidelines for Collaborating AIs

When modifying this project, please adhere to the following rules:

1.  **Maintain Documentation Integrity**:
    *   Do not remove or alter existing code comments or JSDoc strings unless they are outdated or incorrect.
    *   After completing a task, **always update the AI Execution Ledger** in this `README.md` file. Add a new entry under "Completed Tasks" with the task ID, description, modified files, implementation strategy, and verification steps.
2.  **Robust Error Handling & Safety**:
    *   Always wrap spawned processes in safety timeouts. If a command like `ping` or `tracert` hangs, it must be force-killed after a reasonable duration to prevent process leaks.
    *   Handle OS-specific command differences (e.g., Windows uses `tracert` and `-S` for source IP, while Linux uses `traceroute` and `-I`).
3.  **Performance & Concurrency**:
    *   Ensure heavy operations (such as multi-target pinging) are concurrency-limited to avoid high CPU spikes or thread pool exhaustion.
    *   Stagger external API queries (like IP-API or Globalping) to avoid hitting rate limits.
4.  **Aesthetics**:
    *   Keep the UI modern, using dark-mode aesthetics, clean gradients, custom typography, and smooth transitions. Avoid default browser elements.
