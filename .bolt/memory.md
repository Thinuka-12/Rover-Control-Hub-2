# Project memory

## Product intent & audience

- Rover mission-control application: real-time control and monitoring of a rover (likely ESP32-based hardware).
- Frontend: React + TypeScript + Vite. Backend: Node + Express + WebSocket.

## Brand personality & voice

- Technical, direct, mission-oriented communication.

## Visual design & UX direction

- Mission-control UI patterns expected: real-time telemetry, status indicators, control panels.
- WebSocket-driven live updates; low-latency interaction model.

## Decisions, constraints & rationale

- Monorepo-style split: React/TS/Vite frontend + Node/Express/WS backend.
- An upgrade roadmap exists covering: hardware abstraction, role enforcement, ESP32 protocol, and additional phases.
- User confirmed roadmap/attached assets are reviewed ("ok done"), but has not yet selected a specific task to implement.

## Open questions & assumptions

- Specific roadmap phases and their priorities not yet captured in detail.
- Hardware specifics (ESP32 variant, sensors, actuators) unknown.
- No `.bolt/prompt` instructions provided; all current context inferred from this turn.
- User's next intended action is unspecified.