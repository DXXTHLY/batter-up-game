# Batter Up! – It Takes Two Inspired Game

**Play Online:** [dxxthly.github.io/batter-up-game/](https://dxxthly.github.io/batter-up-game/)

## Overview
Batter Up! is a fast-paced, browser-based, two-player baseball-inspired game designed for both local and online multiplayer. Inspired by the minigames of It Takes Two, Batter Up! challenges your timing, reflexes, and coordination as you and a friend compete to rack up the highest score in a unique, circular batting arena.

## How to Play
### Objective:
Hit the moving ball with your bat when it enters the green "hit zone" to score points. The player with the most points when the timer runs out wins!

### Controls:
- **Red Player:** Hold and release `A` to swing
- **Blue Player:** Hold and release `L` to swing

### Zones:
- 🟢 **Green Zone:** Perfect timing – scores a point and increases ball speed
- 🟡 **Yellow Zone:** Miss – reduces ball speed
- 🔴 **Red Zone:** Too early – reverses ball direction and reduces speed

### Modes:
- **Local Multiplayer:** Both players play on the same keyboard
- **Online Multiplayer:** Host a private room and share the code, or join a friend's room for real-time online play

## Features
- **Peer-to-Peer Online Multiplayer:** No servers required! Connect directly with a friend for low-latency, real-time gameplay
- **Host-Controlled Game Settings:** The host can adjust:
  - Base Ball Speed
  - Speed Increment per Hit
  - Maximum Ball Speed
- **Visual Hit Zones:** Red, yellow, and green arcs show miss, too early, and perfect hit zones
- **Session Leaderboard:** Tracks the results of your last 10 games (scores, winners, and time played)
- **Responsive UI:** Works on desktop and most modern browsers
- **Background Customization:** Supports custom background images/GIFs
- **Audio Feedback:** Satisfying hit sounds for every successful swing
- **Debug Info (for devs):** Toggleable debug overlay shows ball angles, speed, and current hit zone

## Getting Started
### Play Online:
Visit [dxxthly.github.io/batter-up-game/](https://dxxthly.github.io/batter-up-game/)

### Local Multiplayer:
1. Click "Local Multiplayer"
2. Red uses `A`, Blue uses `L`

### Online Multiplayer:
1. Click "Online Multiplayer"
2. **Host:** Click "Create Private Room" and share the room code
3. **Friend:** Enter the code and click "Join Room"

### Host Settings:
1. Host can click the Host Settings button (bottom left)
2. Adjust speed settings and click "Apply to All Players" to sync instantly

## Technical Details
**Built with:**
- JavaScript (vanilla)
- Three.js for 3D graphics
- PeerJS for peer-to-peer networking

**Key Technical Features:**
- No server or backend required (all connections are direct P2P using WebRTC)
- Host-authoritative game state (host controls all ball physics and scoring)
- Client-side interpolation for smooth online play

## Screenshots
![image](https://github.com/user-attachments/assets/442a595c-3c31-4c14-8dd7-7f08295ac3db)


## Credits
- Inspired by It Takes Two minigames
- 3D graphics powered by [Three.js](https://threejs.org/)
- Networking powered by [PeerJS](https://peerjs.com/)
- Sound effects from [Mixkit](https://mixkit.co/)

## License
MIT License

---

Enjoy Batter Up! and challenge your friends for the best score!  
For questions or contributions, open an issue or PR on GitHub.
