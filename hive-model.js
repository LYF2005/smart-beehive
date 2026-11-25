/* ============================================================================
 * hive-model.js —— 蜂箱建模模块（经典脚本版 / classic script）
 * ----------------------------------------------------------------------------
 * 来源：队长提供的 虚拟蜂场/virtual-beehive/model/
 *   · hive-model.js            (819 行，可读源码，Gratheon robotic-beehive)
 *   · vendor/observer-model.js (963 行，Entrance Observer 子装配)
 *
 * 为什么不是直接 <script type="module"> 引原文件？
 *   原文件是 ES Module（import 'three' + 相对路径 import './vendor/...'），
 *   而 file:// 双击打开时浏览器会拦截本地 module / fetch。为了保留
 *   「双击即可离线运行」的课堂部署方式，这里把两份源码打包成经典脚本：
 *     - 只删掉 import / export 关键字（并注入外部 THREE），建模逻辑零改动；
 *     - 两个模块各自包在独立 IIFE 里，避免 derive / DEFAULTS / PARTS 等同名冲突；
 *     - 暴露 window.LabHive.createFactory(THREE) → { Qu, Ju, Vc, kc, MM, ... }。
 *   index.html 通过 importmap 拿到 CDN 的 THREE 后注入即可，无需 npm。
 *
 * 主要 API：
 *   Qu(options)  = buildHiveTower(options) → { root, nodes, params, derived,
 *                   timeline, applyState, animated, MM }
 *   nodes.cladding     外柜挂板（剖视时设为半透明或隐藏）
 *   nodes.boxMaterials 箱体木壁材质（X-ray 时改透明）
 *   nodes.frames       被检查箱体里的 10 个巢框 Group（内部蜂就挂在上面）
 *   nodes.bees         模型自带的装饰小蜂（本场景隐藏）
 *   Vc = DEFAULTS      蜂箱尺寸参数表（mm），改这里可调箱体 / 巢框 / 堆叠
 *
 * 尺寸：源码内一切长度是 mm，乘 MM=0.001 换成米；入口朝 +Z。
 * ============================================================================ */
;(function (global) {
  "use strict";

  function createFactory(THREE) {
    // ----  Entrance Observer 子装配（原 vendor/observer-model.js） ----
    const OBS = (function () {
// Gratheon Entrance Observer — parametric model of the Phase 3 production kit.
// Single source of truth for the browser viewer (index.html) and the GLB
// exporter (export-glb.mjs). All dimensions are in millimetres; the scene is
// built in metres (glTF convention).
//
// Axes match robotic-beehive/model/hive-model.js and
// beehive-sensors/model/scale-model.js:
//   X = left/right, Y = up, Z = front(+)/back(-), entrance at +Z.
//
// The Observer is built in its own frame and then placed on a hive, on the
// beehive scale or on the Robotic Beehive. Its origin is the middle of the
// entrance floor on the front face of the hive; +Z points away from the hive.
//
// Layout rules:
// - A flat wall frame shaped like a house gable (entrance plate, two slim
//   uprights, two rafters) stays on the hive. It carries the porch with the
//   automatic gate and the landing board.
// - The head hangs on the apex of the frame: a ridge beam, a steep gable roof
//   running from the hive wall forward, and one small metal pod under the
//   ridge with the camera and the computer. Nothing but the pod is machined.
// - The ridge runs front to back, so rain and snow slide off the sides and
//   drip beside the landing board, never onto it.
// - A short porch moves the doorway onto the board, so every bee in or out
//   crosses the porch mouth in view, even if it landed on the hive wall. The
//   mouth is the counting line and holds the gate.
// - The camera looks down at the board, tilted toward the hive to also see the
//   porch and the bottom of the wall. Frame, roof and cables are outside the view.
// - Every cable enters from below, under the right upright, and runs inside it.


const MM = 0.001;

// Personal hive colours. Bees see blue, yellow and white (and UV) well; red looks
// black to them, so it is not offered. Each colour has a contrasting ink for the pattern.
const THEMES = {
  blue: { base: 0x2d6cb0, ink: 0xf1f0ea },
  yellow: { base: 0xe6bd2b, ink: 0x2b2f33 },
  white: { base: 0xefeee7, ink: 0x2d6cb0 },
  graphite: { base: 0x34383c, ink: 0xe6bd2b },
};
const PATTERNS = ['plain', 'dots', 'stripes', 'chevrons'];

const DEFAULTS = {
  context: 'hive', // 'hive' = on a hive stand, 'scale' = on the beehive scale, 'robot' = on the Robotic Beehive
  power: 'poe', // 'poe' = opal roof, PoE+ powered; 'solar' = solar roof + battery cassette
  gate: 'open', // entrance gate: 'open', 'reduced', 'guard' (hornet guard) or 'closed'
  colour: 'blue', // personal hive colour (THEMES)
  pattern: 'dots', // pattern on the gable and covers (PATTERNS)
  boxes: 2, // hive bodies
  hive: { w: 506, d: 450, h: 285, lid: 80, bottomBoard: 60, entrance: 300, slot: 15 }, // Estonian hive (outer)
  stand: 200, // wooden hive stand height
  frame: { w: 456, post: 22, depth: 15 }, // wall frame: width, upright / rafter width, depth of the box sections
  roof: { ridge: 318, z0: 2, len: 212, halfW: 238, t: 3, slope: 30 }, // ridge underside height, start z, length, horizontal half-width, sheet, degrees
  beam: { w: 30, h: 36, len: 186 }, // ends behind the front gable // ridge beam under the roof
  head: { y: 205, z: 135, w: 170, h: 57, d: 140 }, // camera + compute pod: underside height, centre z, size
  camera: { eye: 186, hfov: 90, aspect: 16 / 9, px: 3840, tilt: 16 }, // lens height above the entrance floor, degrees, sensor width px, degrees toward the hive
  porch: { depth: 46, w: 312, wall: 4, roof: 4, gateZ: 40, notch: 70, floorEnd: 48 }, // mouth distance from the hive face, inner width, wall/roof, gate plane, centre opening, porch floor end
  board: { w: 448, d: 150 }, // landing board, hinged at the porch floor
  boardSlope: 6, // degrees
  scale: { feet: 25, height: 112, deck: { w: 560, d: 510 }, base: { w: 504, d: 454, h: 60 } }, // from beehive-sensors DEFAULTS
  robot: { plinth: 200, bottomBoard: 150, post: { x: 372, z: 302 }, e: 22, clad: 18 }, // from robotic-beehive DEFAULTS
};

// Gate top edge height above the porch floor for each position. The gate rises
// out of a slit in the porch floor; its centre has a notch as deep as the porch
// is high, so one travel gives four openings.
const GATE = {
  open: 0, // flush with the floor: the whole 312 × 17 mm mouth is open
  reduced: 17, // flat part meets the porch roof: only the 70 × 17 mm centre notch is open
  guard: 28.5, // notch top at 11.5 mm: a 70 × 5.5 mm slot, bees pass, hornets and wasps do not
  closed: 34, // notch top meets the porch roof
};

// Installation, in order. Each step lists the parts it adds; the viewer plays
// them back and the exploded view uses the same order.
const INSTALL = [
  { title: 'Screw the wall frame to the bottom board', parts: ['frame', 'plate', 'screws', 'clips', 'seal'], text: 'Hold the frame against the hive so its entrance window lines up with the entrance (the paper template in the box marks the four holes). Drive four 4.5 × 40 mm A2 stainless countersunk wood screws through the slots into the bottom board, two each side of the entrance; the slots allow ±3 mm to level it. At the top, screw the two wall clips to the first hive body (2 × 4 × 25 mm each) so they hold the outer edges of the uprights; the EPDM strip behind the frame seals against the wall. The frame itself is never screwed to the body. On the beehive scale the frame bolts to two risers on the scale rail instead (2 × M5 each), 2 mm clear of the hive.' },
  { title: 'Fit the porch with the gate', parts: ['porch', 'porchScrews', 'gate', 'gateDrive', 'lintel'], text: 'Slide the porch over the entrance so its tabs lie on the plate, and fix it with four M4 × 10 A2 button screws into the rivet nuts (Torx T20). The gate and its drive come fitted to the porch. Plug the gate lead into the socket at the foot of the right upright.' },
  { title: 'Hang the landing board, clip on the covers', parts: ['board', 'insert', 'hinge', 'border', 'studs', 'covers'], text: 'Drop the two hinge knuckles of the landing board onto the stainless pins at the front of the porch floor; it rests at 6° on its stop. The board comes painted in the hive colour chosen at order. Clip the two aluminium covers into the upright channels, over the cable in the right one.' },
  { title: 'Hang the head', parts: ['beam', 'thumb', 'canopy', 'solarCanopy', 'flashing', 'gable', 'antenna', 'pod'], text: 'Lower the head so the hook at the back of the ridge beam drops into the pocket at the apex of the frame, and turn the yellow thumbscrew; the EPDM flashing on the back edge of the roof presses against the hive wall. Roof, pod and camera come pre-assembled and aimed at the factory, so the view is the same on every hive. The head lifts off the same way for winter.' },
  { title: 'Connect the cable', parts: ['gland', 'm12', 'cable'], text: 'Push the PoE cable up through the gland under the foot of the right upright and tighten the gland nut; leave a drip loop below it. With the beehive scale, plug the short M12 lead from the accessory socket into the scale connector.' },
  { title: 'Pair and watch', parts: ['display', 'face'], text: 'Hold the setup button for 5 s and pair the Observer with the hive in the web app over Bluetooth. The display shows today’s bees in and out within a minute of the first flight.' },
];

// ---------------------------------------------------------------------------
// Part descriptions (shown on hover in the viewer, exported as glTF extras)
// ---------------------------------------------------------------------------
const PARTS = {
  frame: ['Wall frame', 'One laser-cut sheet of 2 mm 5052 marine-grade aluminium, folded on a press brake and powder-coated graphite: aluminium does not rust, and all fasteners are A2 stainless. The face lies against the hive; folded 15 mm returns along its outer edge and around the big window turn the uprights into U-channels (open to the front, closed by the aluminium covers) and stiffen the gable. Cut-outs: the big window over the hive front, the entrance window, and four vertical slots for the wood screws. It stays on the hive and carries the porch and the landing board; the head hangs on the pocket at its apex. No welds, no joints.'],
  plate: ['Entrance plate', 'The bottom of the wall frame, with a window matching the 300 × 15 mm entrance and four vertical slots (5 × 11 mm) beside it for the wood screws. Matt graphite powder coat, like the rest of the frame: no glare in the camera view.'],
  riser: ['Scale risers', 'On the beehive scale the wall frame stands on two printed ASA risers hooked onto the scale front rail, 2 mm clear of the hive. Frame, roof, snow and bees on the board are then carried by the scale base and never weighed.'],
  robotFront: ['Robot entrance frame', 'On the Robotic Beehive the wall frame is bolted to the cabinet front, where the entrance tunnel ends. Power and data come from the robot PoE switch inside a corner post.'],
  screws: ['Wood screws', 'Four 4.5 × 40 mm A2 stainless countersunk wood screws (Torx T20), two each side of the entrance, through the slots in the entrance plate into the front of the bottom board. The slots allow ±3 mm to level the frame. Nothing is screwed into the hive bodies, so they still lift off; the top of the frame only leans on them through two rubber pads.'],
  porchScrews: ['Porch screws', 'Four M4 × 10 A2 stainless button screws through the tabs on the porch sides into rivet nuts pressed into the entrance plate. Undo them to take the porch and gate off for cleaning at the end of the season.'],
  studs: ['Brick decks', 'Two small decks on the front corners of the landing board with a 4 × 4 grid of 8 mm studs, compatible with common toy construction bricks, in the hive colour. Owners can add their own figures and decorations. They are outside the camera view and to the side of the flight path.'],
  covers: ['Upright covers', 'Folded aluminium covers in the same graphite powder coat as the frame. They close the upright channels; the right one hides the cables. They clip in without screws.'],
  clips: ['Wall clips (top fixing)', 'Two small folded aluminium clips, each screwed to the first hive body with two 4 × 25 mm A2 stainless screws, hold the outer edges of the uprights against the wall at the top. The frame itself is never screwed to the body: to lift the first body, lift off the head, and the clips slide up off the uprights with the body.'],
  seal: ['Wall seal', 'EPDM foam strip behind the top edges of the frame, pressed against the hive wall, so rain running down the wall cannot get behind the frame.'],
  flashing: ['Roof flashing', 'The back edge of the roof is turned up 16 mm with an EPDM strip pressed against the hive wall, like the flashing where a porch roof meets a house. Rain running down the wall lands on the roof and runs off at the eaves, never behind the roof or onto the pod.'],
  border: ['Hive colour border', 'The wooden landing board is painted in the hive colour around the grey insert (sides and front) and on its front lip, with dots, stripes or chevrons in a contrasting colour. Bee-safe water-based paint. Beekeepers already paint hive fronts in different colours so bees find their own hive and drift less between hives. Bees see blue, yellow and white well and red as black, so the colours are blue, yellow, white and graphite. It is outside the camera view.'],
  antenna: ['Wi-Fi antennas', 'Two flat dual-band (2.4 / 5 GHz) antennas on the back of the wooden front gable, either side of the pod and tilted apart for polarisation diversity, on short U.FL cables into the pod. Wood and polycarbonate let radio through; the metal pod and the aluminium solar roof would not.'],
  channel: ['Cable upright', 'The right upright is a closed box section. The PoE cable and the gate cable run up inside it to the apex and along the ridge beam to the pod: no cable is in the sun, in the rain or in front of the lens.'],
  gland: ['Cable entries', 'Under the foot of the right upright, facing the ground: the PoE cable gland and the accessory socket. Water runs off them, not into them, and the cable leaves with a drip loop.'],
  m12: ['Accessory port', 'M12 8-pin socket with the pinout of the beehive scale front connector: 5 V out, ground, 1-Wire, UART, wake and shield. One short lead to the scale powers the scale pod from the Observer and shares time and readings, so the scale needs no solar board and both upload through one link.'],
  thumb: ['Apex hook', 'The ridge beam ends in a hook that drops into a pocket at the apex of the wall frame, locked by one captive honey-yellow thumbscrew. The head lifts off in seconds and always lands in the same place, with the camera aimed the same way.'],
  beam: ['Ridge beam', 'Standard 30 × 36 mm aluminium extrusion from the apex forward, under the ridge. It carries the roof, the front rafters and the pod, and the cables run inside it.'],
  rafter: ['Front rafters', 'Two slim folded strips under the front edge of the roof, from the end of the ridge beam to the eaves. They carry snow on the front corners. They sit above the lens, outside the view.'],
  pod: ['Camera + compute pod', 'The only machined metal part: a 170 × 140 mm piece of finned aluminium extrusion, IP65, with printed end caps. It holds the camera, the compute sled and the supervisor, and it is the heatsink: the fins sit in the ventilated space under the roof. No fan to clog with dust or propolis.'],
  camera: ['Camera module', '8 MP (3840 × 2160) Sony STARVIS 2 sensor on its own MIPI CSI board with a locked-focus, low-distortion M12 lens, 90° wide. It sits 186 mm above the board, 135 mm out from the hive, tilted 16° back toward the hive: it sees nearly the whole board, the porch with the gate and the bottom of the hive wall, so bees that land on the wall are tracked from the moment they land. The camera and the board are both fixed to the wall frame, so the view is calibrated once at the factory with a printed target; in use, the software checks the straight edges of the porch lintel and board against that reference and raises an alert if the head was knocked. On the board that gives about 9.5 px per mm: a bee is about 125 px long and a varroa mite about 14 px. A global-shutter module can replace it without changing the pod.'],
  hood: ['Lens hood + window', 'Matt black cone with a flat AR-coated glass window at its tip, facing the ground. Rain cannot reach it, the sky never reflects in it and the roof keeps direct sun off it. A 0.3 W heater film clears dew on cold mornings.'],
  led: ['Light bars', 'Two short diffused LED bars beside the lens, with crossed polarisers on the LEDs and the lens to remove glints from shiny bees and wet pollen. They only flash in sync with the exposure at dusk or in deep shade, so they add less than 0.3 W on average.'],
  mic: ['Microphone', 'MEMS microphone behind a mesh under the pod. Entrance audio (drone flight, piping, hornets, fanning) is stored with the counts for audio + video models, and a hornet buzz is a second trigger for the gate.'],
  sensor: ['Light + climate sensor', 'Ambient light, temperature and humidity. The supervisor uses them to decide when bees can fly, which is when the computer has to run, and to narrow the gate on cold nights.'],
  supervisor: ['Supervisor board', 'Always-on ESP32-S3 board, the same carrier design as the beehive scale: PoE+ input, 12–24 V DC input, solar charger, fuel gauge, the gate motor driver and a load switch for the compute sled. It idles at about 0.1 W, only powers the computer when bees can fly, and moves the gate on its own when needed (cold night, lost power, expired hornet guard).'],
  compute: ['Compute cassette', 'Raspberry Pi 5 (8 GB), Hailo-8 26 TOPS accelerator and 256 GB NVMe on one sled. It slides out of the front of the pod after a quarter-turn. The sled is the upgrade path: pod, camera, power and connectors stay the same, and a Jetson Orin NX or the next accelerator slides into the same bay when pose models need more compute.'],
  face: ['Service face', 'Honey-yellow front of the compute cassette, set into the front gable: activity display, status ring, setup button and a USB-C port under a flap for copying full-resolution research clips on site.'],
  display: ['Activity display', 'Cheap reflective 2-row segment LCD (about €3), readable in direct sun and needing no backlight: today’s bees in (↓) and out (↑), with bars for the gate position. The always-on supervisor drives it through an HT1621 chip at about 50 µA, updates it every minute and keeps the last numbers while the computer sleeps. The button pages through yesterday, net flow and alerts.'],
  gable: ['Gables', 'The roof is closed at both ends. At the back the wall frame sheet fills the triangle between the rafters. At the front a panel of oiled thermo-treated pine closes the roof above the pod: the pod face sits in it, vent slots under the ridge let warm air out, and the Wi-Fi antennas sit behind it, where wood lets the signal through.'],
  battery: ['Battery cassette', 'Solar version: four LiFePO4 32700 cells (12.8 V, 77 Wh) on a sled that slides out of the left side of the pod, charged from the roof panels. LiFePO4 tolerates summer heat better than Li-ion. In the PoE version this bay is empty or holds an LTE modem.'],
  blank: ['Side bay cover', 'Cover of the pod side bay. Behind it goes the battery cassette (solar version) or an LTE modem for apiaries without Wi-Fi or Ethernet.'],
  canopy: ['Roof', 'A 3 mm opal (light-diffusing), UV-stabilised polycarbonate sheet bent once along the ridge into a 30° gable, 448 × 212 mm, from the hive wall forward. At 30° rain and snow slide off, to the sides: the eaves overhang the landing board edges, so drips fall beside the board, outside the view. Opal keeps its shadow on the board soft. It rests on the rafters of the wall frame at the back, the ridge beam and the front rafters.'],
  solarCanopy: ['Solar roof', 'The same gable in white powder-coated aluminium sheet (recyclable, unlike composite panel) with a 7 W ETFE panel laminated on each slope (14 W). Whichever way the hive faces, one slope gets the morning or afternoon sun. Bees fly when the sun shines, so the panels produce the most when the Observer has the most to do.'],
  porch: ['Entrance porch', 'A 46 mm deep, 17 mm high tunnel across the full entrance, in the same matt grey as the board. It moves the doorway forward onto the landing board: a bee that lands on the hive wall has to walk down onto the porch roof and step off in front of the mouth, so every bee in or out crosses the porch mouth in view. The mouth is the counting line. Open to the air, with no glass to clean or fog up.'],
  gate: ['Automatic entrance gate', 'A 2 mm plate that rises out of a slit in the porch floor at the mouth, with a 70 mm notch in its centre. One travel gives four positions: open (flush with the floor), reduced (only the 70 × 17 mm centre open, against wind, cold and robbing), hornet guard (a 70 × 5.5 mm slot: bees pass, hornets and wasps cannot) and closed (moving the hive, spraying nearby). It rises slowly with a soft silicone edge and a current limit, and only when the camera sees no bee in the mouth, so it cannot crush bees. Hidden under the floor when open.'],
  gateDrive: ['Gate drive housing', 'Sealed box of folded aluminium sheet with a gasketed lid, under the porch floor, outside the camera view, 336 × 18 mm with a gearbox bulge in the middle. Drain holes in the bottom let water and debris that fall through the slit out. Its lead plugs into the foot of the right upright. Tick “See inside the gate” to look through it.'],
  gateMotor: ['Motor + worm', 'N20-size micro stepper with a brass worm on its shaft, meshing with the worm wheel at the foot of the lead screw. A worm drive is self-locking: the gate holds any position without power, and bees or hornets cannot push it. About 1 W for 5 s per move.'],
  gateScrew: ['Lead screw + nut', 'Vertical 2 mm-lead screw turned by the worm wheel; a brass nut on the gate turns its rotation into 34 mm of travel, about 7 mm/s. The camera and a motor current limit stop it if a bee is in the way.'],
  gateGuide: ['Guide rods', 'Two stainless rods at the ends of the housing, with bronze bushings on the gate, so the 312 mm plate rises level and does not jam in the slit.'],
  gateSensor: ['Home sensor', 'Hall sensor on the housing floor and a magnet on the gate: the drive finds the open position after every power-up and counts steps from there.'],
  gateSupercap: ['Fail-open supercapacitor', 'Driver board with a supercapacitor that stays charged. If power is lost, it has enough energy to drive the gate back to open: the gate fails open, never closed.'],
  lintel: ['Gate lintel', 'The raised front edge of the porch roof. The gate slides up into it, and it marks the counting line from above.'],
  board: ['Landing board', '15 mm thermo-treated pine (no chemicals, stable outdoors), hinged to the front of the porch floor at a 6° slope so rain drains off, with an aluminium stiffener underneath. A flush grey HDPE insert covers only the area the camera sees; the rest of the wood is painted in the hive colour.'],
  insert: ['Board insert', 'Flush 3 mm matt grey HDPE plate: the background of every frame. Neutral light grey, because white would overexpose in the sun and hide pale pollen loads. It slides out forward for washing off droppings, dead bees and propolis, and is the only plastic the camera sees.'],
  hinge: ['Board hinge', 'Stainless pins at the front of the porch floor. The board folds up flat for shipping and swings down if something hits it.'],
  harness: ['Internal harness', 'PoE, accessory and gate lines from the foot of the right upright, up inside it, over the rafter and along the ridge beam to the supervisor board in the pod.'],
  cable: ['Cables', 'One PoE cable (power and data, up to 100 m) from under the right upright, run along the ground. With the scale, one short M12 lead joins the Observer and the scale.'],
  fov: ['Camera field of view', 'What the camera sees: the bottom of the hive wall, the porch with the gate and the landing board, about 400 mm across. The frame, roof, pod and cables are all outside it.'],
  bee: ['Bees', 'Honey bees on the landing board, on the porch roof and on the hive wall. At 4K each worker is about 125 px long, big enough for pose keypoints, pollen loads and mites.'],
  hive: ['Hive', 'A standard hive: bottom board, bodies and lid. The only change is the wall frame screwed to the bottom board.'],
  stand: ['Hive stand', 'Any stand works: the Observer hangs on the hive entrance and does not touch the stand.'],
  scale: ['Beehive scale', 'Gratheon beehive scale, simplified. The Observer stands on its front rail with two risers, and one M12 lead powers the scale pod and carries its readings.'],
  scaleLink: ['Scale connector', 'M12 socket under the front rail of the beehive scale. The Observer lead plugs in here in place of the solar landing board.'],
  robot: ['Robotic Beehive', 'Ghost of the Robotic Beehive cabinet. Its entrance tunnel ends in the Observer porch, and the cable runs inside the cabinet to the robot PoE switch.'],
};

// ---------------------------------------------------------------------------
// Derived geometry and figures
// ---------------------------------------------------------------------------
const rad = (deg) => (deg * Math.PI) / 180;

function derive(p) {
  const H = p.hive, R = p.robot, S = p.scale;
  let origin, hiveBase, bottomBoard, entranceY;
  if (p.context === 'scale') {
    const deckTop = S.feet + S.height;
    hiveBase = deckTop;
    bottomBoard = H.bottomBoard;
    entranceY = hiveBase + 12;
    // In front of the deck (railZ + 6), at entrance level: nothing touches the weighed hive.
    origin = [0, entranceY, S.deck.d / 2 + 14];
  } else if (p.context === 'robot') {
    hiveBase = R.plinth + R.bottomBoard;
    bottomBoard = R.bottomBoard;
    entranceY = hiveBase - H.slot; // the slot is at the top of the tall varroa bottom board
    origin = [0, entranceY, R.post.z + R.e / 2 + R.clad];
  } else {
    hiveBase = p.stand;
    bottomBoard = H.bottomBoard;
    entranceY = hiveBase + 12;
    origin = [0, entranceY, H.d / 2];
  }
  const cam = p.camera, P = p.porch;
  const tanB = Math.tan(rad(p.boardSlope));
  const boardY = (z) => -2 - (z - P.floorEnd) * tanB; // board surface height at local z
  const vfov = 2 * Math.atan(Math.tan(rad(cam.hfov / 2)) / cam.aspect);
  const wallZ = H.d / 2 - origin[2]; // hive front face in the observer frame (≤ 0)
  const pTop = H.slot + 2; // porch roof underside
  const porchTop = pTop + P.roof; // top of the porch roof
  const lintelTop = pTop + 21; // top of the gate lintel at the mouth
  // The lens hangs 19 mm under the pod floor and swings with the camera tilt.
  const tilt = rad(cam.tilt), drop = p.head.y - cam.eye;
  const eye = new THREE.Vector3(0, p.head.y - drop * Math.cos(tilt), p.head.z - drop * Math.sin(tilt));
  // A camera ray (a across, b along the image height) tilted toward the hive.
  const ray = (a, b) => new THREE.Vector3(a, -1, b).applyAxisAngle(new THREE.Vector3(1, 0, 0), tilt);
  // First surface a ray meets: gate lintel, porch roof, hive wall or landing board.
  const hit = (dir) => {
    let best = (eye.y + 2 - P.floorEnd * tanB + eye.z * tanB) / (-dir.y - dir.z * tanB); // board plane
    const flat = (y, z0, z1, halfX) => {
      const t = (eye.y - y) / -dir.y;
      const q = eye.clone().addScaledVector(dir, t);
      if (t > 0 && t < best && q.z >= z0 && q.z <= z1 && Math.abs(q.x) <= halfX) best = t;
    };
    flat(lintelTop, P.gateZ - 6, P.depth, P.w / 2 + P.wall);
    flat(porchTop, wallZ, P.gateZ - 6, P.w / 2 + P.wall);
    if (dir.z < 0) {
      const tw = (wallZ - eye.z) / dir.z;
      if (tw > 0 && tw < best && eye.y + dir.y * tw > porchTop) best = tw;
    }
    return eye.clone().addScaledVector(dir, best);
  };
  const ta = Math.tan(rad(cam.hfov / 2)), tb = Math.tan(vfov / 2);
  // Outline of the view, sampled along the frame edges so it bends over the wall, porch and board.
  const outline = [];
  const edge = (a0, b0, a1, b1) => { for (let i = 0; i < 24; i++) { const u = i / 24; outline.push(hit(ray(a0 + (a1 - a0) * u, b0 + (b1 - b0) * u))); } };
  edge(-ta, -tb, ta, -tb); edge(ta, -tb, ta, tb); edge(ta, tb, -ta, tb); edge(-ta, tb, -ta, -tb);
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => hit(ray(sx * ta, sz * tb)));
  const centre = hit(ray(0, 0));
  const fovW = 2 * ta * centre.distanceTo(eye); // across the image, at the optical axis
  const fovD = corners[2].z - wallZ; // from the hive face to the front of the view
  const wallSeen = Math.max(0, corners[0].y - porchTop); // hive wall visible above the porch
  return {
    origin, hiveBase, bottomBoard, entranceY, boardY, tanB, eye, corners, outline, vfov, wallZ, porchTop,
    fovW, fovD, wallSeen, pxPerMm: cam.px / fovW, boardFront: P.floorEnd + p.board.d * Math.cos(rad(p.boardSlope)),
    lidTop: hiveBase + bottomBoard + p.boxes * H.h + H.lid,
  };
}

// Energy budget. Estimates to be replaced by measurements of the Phase 2 units
// (docs/DESIGN.md explains every figure).
const ENERGY = {
  supervisorW: 0.12, // ESP32-S3 supervisor, regulators, sensors, idle PoE/charger
  activeW: 9, // Pi 5 + Hailo-8 + 4K camera + Ethernet while observing
  bootJ: 125, // ≈25 s boot at 5 W before the first frame
  flightHours: 12, // summer day with flight weather
  sample: { on: 120, period: 600 }, // sampled mode: record 2 min every 10 min
  batteryWh: 77, depth: 0.9,
  panelW: 14, sunHours: 4.5, systemEff: 0.7, // May–August average for Estonia, near-horizontal panel
};
function energy(e = ENERGY) {
  const base = e.supervisorW * 24;
  const continuous = base + e.activeW * e.flightHours;
  const cycles = (e.flightHours * 3600) / e.sample.period;
  const sampled = base + (cycles * (e.activeW * e.sample.on + e.bootJ)) / 3600;
  const harvest = e.panelW * e.sunHours * e.systemEff;
  const usable = e.batteryWh * e.depth;
  return {
    continuous, sampled, standby: base, harvest,
    standbyDays: usable / base, // rain / cold: the computer stays off
    sampledDays: usable / sampled, // flight weather without sun
  };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function makeMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });
  return {
    alu: std(0xc9ced3, { metalness: 0.7, roughness: 0.38 }),
    anod: std(0xa9afb4, { metalness: 0.65, roughness: 0.42 }), // anodised extrusion
    graphite: std(0x34383c, { roughness: 0.55 }), // powder coat
    asa: std(0x2d3033, { roughness: 0.6 }),
    steel: std(0x9aa1a8, { metalness: 0.85, roughness: 0.3 }),
    black: std(0x141516, { roughness: 0.6 }),
    matt: std(0x0b0b0c, { roughness: 0.95 }),
    rubber: std(0x151515, { roughness: 0.95 }),
    pod: std(0xf2b705, { roughness: 0.5 }), // Gratheon honey yellow ASA
    podDark: std(0xc98f00, { roughness: 0.5 }),
    status: std(0xffc21a, { roughness: 0.3, emissive: 0xffb000, emissiveIntensity: 0.9 }),
    pcb: std(0x16301f, { roughness: 0.6 }),
    can: std(0xbfc5ca, { metalness: 0.8, roughness: 0.3 }),
    chip: std(0x121212, { roughness: 0.5 }),
    gasket: std(0x4a4f52, { roughness: 0.9 }),
    white: std(0xf1f0ea, { roughness: 0.8 }),
    led: std(0xfbfaf4, { roughness: 0.4, emissive: 0xfff6dc, emissiveIntensity: 0.25 }),
    board: std(0x9fa39f, { roughness: 0.95 }), // HDPE base
    insert: std(0xb9bcb7, { roughness: 0.97 }), // neutral light grey (≈ N7), matt
    markBlack: std(0x101010, { roughness: 0.9 }),
    markWhite: std(0xf4f4f0, { roughness: 0.9 }),
    markGrey: std(0x6f736f, { roughness: 0.9 }),
    porch: std(0xaeb1ac, { roughness: 0.95 }), // same matt grey family as the board
    gate: std(0x8e928d, { roughness: 0.9 }),
    housing: new THREE.MeshStandardMaterial({ color: 0x34383c, roughness: 0.6, transparent: true, opacity: 1 }),
    brass: std(0xc9a14a, { metalness: 0.7, roughness: 0.35 }),
    cap: std(0x2a5fb0, { roughness: 0.4 }),
    lcd: std(0xb4bea6, { roughness: 0.3 }), // reflective LCD glass
    gableWood: std(0xa9794c, { roughness: 0.8 }), // oiled thermo-pine
    boardWood: std(0x9b6f47, { roughness: 0.85 }), // thermo-pine
    pcbBlack: std(0x1a1c1e, { roughness: 0.5 }),
    lcdOff: std(0xa9b39b, { roughness: 0.3 }),
    seg: std(0x1d231d, { roughness: 0.5 }),
    plate: std(0x9ea29d, { roughness: 0.9 }), // matt powder coat: the plate is in the camera view
    opal: new THREE.MeshStandardMaterial({ color: 0xf6f5f0, roughness: 0.35, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
    opalEdge: std(0xe9e7e0, { roughness: 0.4 }),
    acm: std(0xeeeeea, { roughness: 0.5 }), // aluminium sheet, white powder coat (solar roof)
    solar: std(0x162a52, { metalness: 0.35, roughness: 0.3 }),
    solarGrid: std(0x8fa3c2, { metalness: 0.6, roughness: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fb8c4, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.6 }),
    cellWrap: std(0x2f8f5b, { roughness: 0.45 }),
    cable: std(0x202326, { roughness: 0.7 }),
    wood: [std(0xd7b07a, { roughness: 0.85 }), std(0xcfa46b, { roughness: 0.85 }), std(0xdcba88, { roughness: 0.85 })],
    lid: std(0xb98d5a, { roughness: 0.85 }),
    timber: std(0x7c5536, { roughness: 0.8 }),
    timberDark: std(0x6a462c, { roughness: 0.82 }),
    film: std(0x4a3325, { roughness: 0.8 }),
    beeBody: std(0x5a3a12, { roughness: 0.6 }),
    beeStripe: std(0xd49a1c, { roughness: 0.6 }),
    beeWing: new THREE.MeshStandardMaterial({ color: 0xe8f0f4, roughness: 0.2, transparent: true, opacity: 0.45 }),
    pollen: std(0xf0a020, { roughness: 0.8 }),
    fov: new THREE.MeshBasicMaterial({ color: 0xf2b705, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }),
    fovLine: new THREE.LineBasicMaterial({ color: 0xe0a800 }),
    robot: std(0x9aa1a8, { metalness: 0.6, roughness: 0.4, transparent: true, opacity: 0.55, depthWrite: false }),
    robotClad: std(0x8a6a48, { roughness: 0.8, transparent: true, opacity: 0.4, depthWrite: false }),
  };
}

// ---------------------------------------------------------------------------
// Builder helpers (geometry cache keeps the GLB small)
// ---------------------------------------------------------------------------
function helpers() {
  const geoCache = new Map();
  const cached = (key, make) => {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  };
  const place = (parent, geo, mat, x, y, z, part) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * MM, y * MM, z * MM);
    m.castShadow = true;
    m.receiveShadow = true;
    if (part) m.userData.part = part;
    parent.add(m);
    return m;
  };
  const box = (parent, sx, sy, sz, mat, x = 0, y = 0, z = 0, part) =>
    place(parent, cached(`b${sx}|${sy}|${sz}`, () => new THREE.BoxGeometry(sx * MM, sy * MM, sz * MM)), mat, x, y, z, part);
  // Box given by its min corner and size.
  const slab = (parent, x0, y0, z0, sx, sy, sz, mat, part) => box(parent, sx, sy, sz, mat, x0 + sx / 2, y0 + sy / 2, z0 + sz / 2, part);
  // Cylinder along an axis ('x' | 'y' | 'z'); r2 makes a cone (r at +axis end, r2 at -axis end)
  const cyl = (parent, r, len, mat, x = 0, y = 0, z = 0, axis = 'y', part, seg = 20, r2 = r) => {
    const m = place(parent, cached(`c${r}|${r2}|${len}|${seg}`, () => new THREE.CylinderGeometry(r * MM, r2 * MM, len * MM, seg)), mat, x, y, z, part);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return m;
  };
  const group = (parent, name, x = 0, y = 0, z = 0, part) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x * MM, y * MM, z * MM);
    if (part) g.userData.part = part;
    parent.add(g);
    return g;
  };
  // Flexible cable through points given in mm.
  const cable = (parent, pts, r, mat, part = 'cable') => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x * MM, y * MM, z * MM)), false, 'centripetal');
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(24, pts.length * 12), r * MM, 8, false), mat);
    m.castShadow = true;
    m.userData.part = part;
    parent.add(m);
    return m;
  };
  return { box, slab, cyl, group, place, cached, cable };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
function buildObserver(options = {}) {
  const p = { ...DEFAULTS, ...options };
  if (!['hive', 'scale', 'robot'].includes(p.context)) p.context = 'hive';
  if (!['poe', 'solar'].includes(p.power)) p.power = 'poe';
  if (!(p.gate in GATE)) p.gate = 'open';
  if (!(p.colour in THEMES)) p.colour = 'blue';
  if (!PATTERNS.includes(p.pattern)) p.pattern = 'plain';
  const d = derive(p);
  const M = makeMaterials();
  const { box, slab, cyl, group, place, cached, cable } = helpers();
  const solar = p.power === 'solar';

  const root = new THREE.Group();
  root.name = 'EntranceObserver';
  const nodes = { root, explode: [] };
  // Every movable assembly registers how far it travels in the exploded view,
  // its install step, and where it waits before that step (default: same offset).
  const explodable = (g, dx, dy, dz, step = 0, away = null) => {
    g.userData.home = g.position.clone();
    g.userData.explode = new THREE.Vector3(dx * MM, dy * MM, dz * MM);
    g.userData.step = step;
    g.userData.away = away ? new THREE.Vector3(away[0] * MM, away[1] * MM, away[2] * MM) : g.userData.explode.clone();
    nodes.explode.push(g);
    return g;
  };
  // Personal hive colour and pattern: gable, upright covers, board lip, brick decks.
  const TH = THEMES[p.colour] || THEMES.blue;
  M.theme = new THREE.MeshStandardMaterial({ color: TH.base, roughness: 0.55 });
  M.themeInk = new THREE.MeshStandardMaterial({ color: TH.ink, roughness: 0.55 });

  // Cables and bees are hidden in the exploded view (they would float).
  const fieldCables = group(root, 'fieldCables');
  nodes.fieldCables = fieldCables;

  const F = p.frame, RF = p.roof, BM = p.beam, HD = p.head, H = p.hive, PO = p.porch;
  const FW = F.w / 2; // frame half-width
  const [ox, oy, oz] = d.origin;
  // Observer frame → world (the Observer is never rotated, only moved).
  const W = (x, y, z) => [ox + x, oy + y, oz + z];
  const tanR = Math.tan(rad(RF.slope));
  const roofUnder = (x) => RF.ridge - Math.abs(x) * tanR; // roof underside height at x

  const obs = group(root, 'observer', ox, oy, oz);
  nodes.observer = obs;

  // ----- wall frame: one laser-cut, folded aluminium sheet ---------------------
  // Face sheet against the hive with folded returns along the outer edge and
  // around the big window, so the uprights are U-channels open to the front;
  // snap-on colour covers close them. Cut-outs: the big window over the hive
  // front, the entrance window, and four vertical slots for the wood screws.
  const framePart = { hive: 'frame', scale: 'frame', robot: 'robotFront' }[p.context];
  const WIN = H.entrance / 2 + 4, S = H.slot + 2; // entrance window half-width and height
  const plateZ = p.context === 'robot' ? -2 : 0;
  const railTop = p.scale.feet + 50 - oy; // scale rail top, observer frame
  const postBottom = p.context === 'scale' ? railTop - 34 : -12;
  const edgeY = (x) => roofUnder(x) - 3; // outer edge of the sheet, just under the roof
  const IX = FW - F.post; // inner edge of the uprights
  const winTop = edgeY(IX) - F.post; // top of the big window
  const postTop = winTop; // compatibility: where the upright channels end
  const apexY = edgeY(0) - 6;
  const frame = explodable(group(obs, 'wallFrame', 0, 0, 0, framePart), 0, 0, 0, 1, [0, 0, 160]);
  const shapeOf = (pts, holes = []) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0] * MM, pts[0][1] * MM);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x * MM, y * MM);
    sh.closePath();
    for (const h of holes) {
      const path = new THREE.Path();
      path.moveTo(h[0][0] * MM, h[0][1] * MM);
      for (const [x, y] of h.slice(1)) path.lineTo(x * MM, y * MM);
      path.closePath();
      sh.holes.push(path);
    }
    return sh;
  };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const outer = [[-FW, postBottom], [FW, postBottom], [FW, edgeY(FW)], [0, edgeY(0)], [-FW, edgeY(FW)]];
  const inset = (k) => [[-FW + k, postBottom + k], [FW - k, postBottom + k], [FW - k, edgeY(FW) - k], [0, edgeY(0) - k * 1.15], [-FW + k, edgeY(FW) - k]];
  const screwXY = [];
  if (p.context === 'hive') for (const sx of [-1, 1]) for (const y of [8, 34]) screwXY.push([sx * 192, y]);
  const holes = [rect(-IX, 44, IX, winTop), rect(-WIN, 0, WIN, S)];
  if (p.context === 'scale') holes.push(rect(-IX, postBottom + F.post, IX, -12)); // open between the legs
  for (const [x, y] of screwXY) holes.push(rect(x - 2.5, y - 5.5, x + 2.5, y + 5.5)); // slots: ±3 mm to level the frame
  const ext = (key, sh, depth) => cached(key, () => new THREE.ExtrudeGeometry(sh, { depth: depth * MM, bevelEnabled: false }));
  place(frame, ext(`frameFace${p.context}`, shapeOf(outer, holes), 2), M.graphite, 0, 0, plateZ, framePart);
  place(frame, ext(`frameRim${p.context}`, shapeOf(outer, [inset(2)]), F.depth), M.graphite, 0, 0, plateZ, framePart); // outer return
  place(frame, ext(`frameWin${p.context}`, shapeOf(rect(-IX - 2, 42, IX + 2, winTop + 2), [rect(-IX, 44, IX, winTop)]), F.depth), M.graphite, 0, 0, plateZ, framePart); // window return
  // the right channel is the cable duct
  slab(frame, IX + 2, 44, plateZ + 2, F.post - 4, 1, 1, M.graphite, 'channel');
  for (const s of [-1, 1]) cyl(frame, 7, 4, M.rubber, s * (FW - F.post / 2), winTop - 30, plateZ - 2, 'z', framePart, 16); // pads against the hive body
  box(frame, 40, 22, F.depth + 6, M.graphite, 0, apexY - 12, plateZ + (F.depth + 6) / 2, framePart); // apex pocket for the head hook
  // rivet nuts for the porch screws
  for (const sx of [-1, 1]) for (const y of [4, 13]) cyl(frame, 3.2, 2, M.steel, sx * 172, y, plateZ + 2.5, 'z', 'porchScrews', 12);
  // foot of the right upright: cable entries facing down
  const footX = FW - F.post / 2;
  slab(frame, FW - F.post - 2, -40, plateZ, F.post + 2, 30, 36, M.graphite, 'channel');
  cyl(frame, 7, 10, M.black, footX, -45, plateZ + 10, 'y', 'gland', 6);
  cyl(frame, 4, 4, M.rubber, footX, -51, plateZ + 10, 'y', 'gland', 16);
  cyl(frame, 8, 12, M.steel, footX, -46, plateZ + 27, 'y', 'm12', 20);
  cyl(frame, 9.5, 3, M.black, footX, -41.5, plateZ + 27, 'y', 'm12', 20);
  if (p.context === 'scale') {
    // printed risers: hooks over the scale front rail at the bottom of the legs, 2 × M5 each
    for (const s of [-1, 1]) {
      slab(frame, s > 0 ? IX : -FW, railTop - 4, -18, F.post, 10, 18, M.asa, 'riser');
      cyl(frame, 4.5, 3, M.steel, s * (FW - F.post / 2), postBottom + 12, plateZ + F.depth + 1, 'z', 'riser', 6);
    }
  }
  // wood screws: 4 × 4.5 × 40 mm A2 stainless countersunk, through the slots into the bottom board
  if (screwXY.length) {
    const screws = explodable(group(obs, 'woodScrews', 0, 0, 0, 'screws'), 0, 0, 60, 1, [0, 0, 220]);
    for (const [x, y] of screwXY) {
      cyl(screws, 4.5, 2, M.steel, x, y, plateZ + 3, 'z', 'screws', 16, 2.4); // countersunk head
      box(screws, 4.4, 0.8, 0.4, M.black, x, y, plateZ + 4.1, 'screws'); // drive recess
      cyl(screws, 2.2, 40, M.steel, x, y, plateZ - 18, 'z', 'screws', 10); // shank into the wood
    }
  }

  // covers on the upright channels: folded aluminium, same powder coat as the frame (the right one hides the cables)
  const covers = explodable(group(obs, 'uprightCovers', 0, 0, 0, 'covers'), 0, 0, 40, 3, [0, 0, 120]);
  for (const s of [-1, 1]) slab(covers, s > 0 ? IX + 1 : -FW + 1, 46, plateZ + F.depth, F.post - 2, winTop - 48, 1.5, M.graphite, 'covers');
  // top fixing: two folded aluminium wall clips screwed to the first hive body hold the outer
  // edges of the uprights. The frame is never screwed to the body: with the head lifted off,
  // the body lifts straight up and the clips slide off the uprights with it.
  if (p.context === 'hive') {
    const clips = explodable(group(obs, 'wallClips', 0, 0, 0, 'clips'), 0, 0, 0, 1, [0, 0, 200]);
    for (const s of [-1, 1]) {
      const xo = s * (FW + 11); // clip centre, beside the frame
      box(clips, 18, 34, 2, M.alu, xo, 132, 1, 'clips'); // back plate on the hive body
      box(clips, 2, 34, F.depth + 3, M.alu, s * (FW + 3), 132, (F.depth + 3) / 2, 'clips'); // web along the upright
      box(clips, 10, 34, 2, M.alu, s * (FW - 2), 132, F.depth + 2, 'clips'); // lip over the upright edge
      for (const y of [122, 142]) cyl(clips, 3.5, 1.5, M.steel, xo + s * 3, y, 2.6, 'z', 'clips', 12);
    }
  }
  // water: EPDM strip behind the top edges of the frame, pressed against the hive wall
  {
    const seal = group(frame, 'wallSeal', 0, 0, 0, 'seal');
    for (const s of [-1, 1]) {
      const x0 = s * FW, x1 = 0, y0 = edgeY(FW) - 5, y1 = edgeY(0) - 6;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const m = box(seal, len, 8, 3, M.rubber, (x0 + x1) / 2, (y0 + y1) / 2, plateZ - 1.5, 'seal');
      m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      box(seal, 8, edgeY(FW) - 60, 3, M.rubber, s * (FW - 4), (edgeY(FW) + 50) / 2, plateZ - 1.5, 'seal'); // down the outer edge
    }
  }

  // ----- entrance porch + automatic gate --------------------------------------
  const PW2 = PO.w / 2, pTop = H.slot + 2;
  const porch = explodable(group(obs, 'porch', 0, 0, 0, 'porch'), 0, 0, 0, 2, [0, 0, 170]);
  // fixing tabs on the porch sides: 4 × M4 × 10 A2 button screws into rivet nuts in the plate
  for (const s of [-1, 1]) {
    slab(porch, s > 0 ? PO.w / 2 + PO.wall : -184, 0, 3, 184 - PO.w / 2 - PO.wall, H.slot + 2, 3, M.porch, 'porch');
    for (const y of [4, 13]) cyl(porch, 3.6, 2, M.steel, s * 172, y, 7, 'z', 'porchScrews', 16);
  }
  const pz0 = Math.min(d.wallZ, 0) + (p.context === 'scale' ? 2 : 3);
  const lz0 = PO.gateZ - 6; // lintel starts here
  slab(porch, -PW2 - PO.wall, pTop, pz0, PO.w + 2 * PO.wall, PO.roof, lz0 - pz0, M.porch, 'porch');
  nodes.gateCover = [];
  nodes.gateCover.push(slab(porch, -PW2 - PO.wall, pTop, lz0, PO.w + 2 * PO.wall, 21, PO.depth - lz0, M.porch, 'lintel'));
  for (const s of [-1, 1]) slab(porch, s > 0 ? PW2 : -PW2 - PO.wall, 0, pz0, PO.wall, pTop, PO.depth - pz0, M.porch, 'porch');
  // floor with the gate slit, widened into an apron up to the uprights so the camera never sees the ground
  slab(porch, -(FW - F.post), -3, pz0, 2 * (FW - F.post), 3, PO.floorEnd - pz0, M.porch, 'porch');
  // gate drive under the floor (not in view). The housing is see-through in the
  // viewer's x-ray mode: motor + worm, worm wheel on a vertical lead screw, a
  // brass nut on the gate, two guide rods, home sensor, fail-open supercap.
  const GZ = PO.gateZ, SZ = GZ - 5; // gate plane; screw and guide rods sit 5 mm behind it
  const hx0 = -PW2 - 12, hx1 = PW2 + 12, hy0 = -66, hy1 = -3;
  const cover = (m) => { nodes.gateCover.push(m); return m; };
  cover(slab(porch, hx0, hy0, GZ + 7, hx1 - hx0, hy1 - hy0, 2, M.housing, 'gateDrive')); // front wall
  cover(slab(porch, hx0, hy0, GZ - 11, hx1 - hx0, hy1 - hy0, 2, M.housing, 'gateDrive')); // back wall
  for (const x of [hx0, hx1 - 2]) cover(slab(porch, x, hy0, GZ - 11, 2, hy1 - hy0, 20, M.housing, 'gateDrive')); // ends
  cover(slab(porch, hx0, hy0, GZ - 11, hx1 - hx0, 2, 20, M.housing, 'gateDrive')); // bottom, with drain holes
  for (let x = -120; x <= 120; x += 40) cyl(porch, 2.5, 2.2, M.black, x, hy0 + 1, GZ - 1, 'y', 'gateDrive', 10);
  // gearbox bulge at the bottom centre, around the worm and wheel
  const gb = [-24, 78, hy0 - 4, 26, GZ - 24, 40]; // x0, width, y0, height, z0, depth: covers wheel, worm and motor
  cover(slab(porch, gb[0], gb[2], gb[4], gb[1], gb[3], 2, M.housing, 'gateDrive'));
  cover(slab(porch, gb[0], gb[2], gb[4] + gb[5] - 2, gb[1], gb[3], 2, M.housing, 'gateDrive'));
  cover(slab(porch, gb[0], gb[2], gb[4], gb[1], 2, gb[5], M.housing, 'gateDrive'));
  for (const x of [gb[0], gb[0] + gb[1] - 2]) cover(slab(porch, x, gb[2], gb[4], 2, gb[3], gb[5], M.housing, 'gateDrive'));
  // guide rods at both ends
  for (const s of [-1, 1]) cyl(porch, 2.5, hy1 - hy0 - 4, M.steel, s * (PW2 - 6), (hy0 + hy1) / 2, SZ, 'y', 'gateGuide', 12);
  // lead screw with the worm wheel at its foot (spins as the gate moves)
  const screw = group(porch, 'gateScrew', 0, 0, SZ, 'gateScrew');
  cyl(screw, 3, 54, M.steel, 0, -34, 0, 'y', 'gateScrew', 12);
  for (let i = 0; i < 12; i++) { // thread flights, so the spin shows
    const t = box(screw, 1.4, 1.2, 7.2, M.steel, 0, -58 + i * 4.3, 0, 'gateScrew');
    t.rotation.y = i * 0.9;
    t.position.x = Math.cos(i * 0.9) * 0.001; t.position.z = -Math.sin(i * 0.9) * 0.001;
  }
  cyl(screw, 11, 5, M.brass, 0, -60, 0, 'y', 'gateScrew', 28);
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; box(screw, 2, 5.2, 2, M.brass, Math.cos(a) * 11.2, -60, Math.sin(a) * 11.2, 'gateScrew'); }
  // motor with the worm on its shaft (self-locking: the gate holds without power)
  const worm = group(porch, 'gateWorm', 0, -60, SZ + 14.5, 'gateMotor');
  cyl(worm, 3.5, 14, M.brass, 0, 0, 0, 'x', 'gateMotor', 12);
  for (let i = 0; i < 5; i++) { const r = box(worm, 1.4, 8.2, 1.4, M.brass, -5.6 + i * 2.8, 0, 0, 'gateMotor'); r.rotation.x = i * 1.2; }
  cyl(porch, 1.2, 16, M.steel, 13, -60, SZ + 14.5, 'x', 'gateMotor', 8); // shaft
  cyl(porch, 6, 22, M.can, 32, -60, SZ + 14.5, 'x', 'gateMotor', 20); // N20-size stepper
  box(porch, 5, 12, 12, M.black, 45, -60, SZ + 14.5, 'gateMotor'); // gearhead end cap
  nodes.gateSpin = [
    { obj: screw, axis: 'y', perMm: Math.PI }, // 2 mm lead: half a turn per mm
    { obj: worm, axis: 'x', perMm: Math.PI * 6 }, // worm turns faster (shown slowed down)
  ];
  // home sensor (hall) and the driver board with the fail-open supercapacitor
  box(porch, 18, 1.6, 12, M.pcb, -40, hy0 + 4, SZ, 'gateSensor');
  box(porch, 5, 2, 4, M.chip, -40, hy0 + 5.5, SZ, 'gateSensor');
  box(porch, 44, 22, 1.6, M.pcb, -104, -44, GZ - 8, 'gateSupercap');
  cyl(porch, 5, 16, M.cap, -104, -40, GZ - 3, 'x', 'gateSupercap', 16);
  box(porch, 8, 5, 4, M.chip, -118, -52, GZ - 6.5, 'gateSupercap');
  cable(porch, [[-82, -44, GZ - 6], [-20, -30, GZ - 6], [60, -30, GZ - 6], [PW2 + 8, -30, GZ - 4], [FW - F.post / 2 - 4, -30, 12]], 1.2, M.cable, 'harness');

  // the gate: a plate with a centre notch, rising out of the floor slit
  const gate = group(porch, 'gate', 0, GATE[p.gate] ?? 0, GZ, 'gate');
  nodes.gate = gate;
  const N2 = PO.notch / 2, GH = 52;
  for (const s of [-1, 1]) {
    slab(gate, s > 0 ? N2 : -PW2, -GH, -1, PW2 - N2, GH, 2, M.gate, 'gate');
    slab(gate, s > 0 ? N2 : -PW2, -1.5, -1.3, PW2 - N2, 1.5, 2.6, M.gasket, 'gate'); // soft silicone edge
    box(gate, 10, 14, 9, M.brass, s * (PW2 - 6), -GH + 9, -5, 'gateGuide'); // bushing on the guide rod
  }
  slab(gate, -N2, -GH, -1, 2 * N2, GH - pTop, 2, M.gate, 'gate');
  slab(gate, -N2, -pTop - 1.5, -1.3, 2 * N2, 1.5, 2.6, M.gasket, 'gate');
  box(gate, 14, 12, 10, M.brass, 0, -GH + 8, -5, 'gateScrew'); // nut on the lead screw
  cyl(gate, 3, 1.5, M.steel, -40, -GH + 3, -2, 'z', 'gateSensor', 12); // magnet for the home sensor
  const g0 = GATE[p.gate] ?? 0;
  for (const sp of nodes.gateSpin) sp.obj.rotation[sp.axis] = g0 * sp.perMm;

  // ----- head: ridge beam, roof, front rafters, pod ---------------------------
  const headAsm = explodable(group(obs, 'head', 0, 0, 0, 'beam'), 0, 330, 0, 4, [0, 230, 0]);
  nodes.head = headAsm;
  const beamTop = roofUnder(BM.w / 2) - 1;
  slab(headAsm, -BM.w / 2, beamTop - BM.h, plateZ + F.depth, BM.w, BM.h, BM.len, M.anod, 'beam');
  box(headAsm, 20, 14, 8, M.anod, 0, apexY - 6, plateZ + F.depth - 4, 'thumb'); // hook into the apex pocket
  cyl(headAsm, 7, 8, M.pod, 0, apexY - 4, plateZ + F.depth + 8, 'z', 'thumb', 20);
  // front rafters under the front edge of the roof
  const frontZ = RF.z0 + RF.len - 8;
  for (const s of [-1, 1]) {
    const len = RF.halfW / Math.cos(rad(RF.slope)) - 16;
    const r = box(headAsm, len, 10, 8, M.graphite, s * (len / 2) * Math.cos(rad(RF.slope)), RF.ridge - 7 - (len / 2) * Math.sin(rad(RF.slope)), frontZ, 'rafter');
    r.rotation.z = -s * rad(RF.slope);
  }
  // the roof: one sheet bent along the ridge
  const cPart = solar ? 'solarCanopy' : 'canopy';
  const roof = group(headAsm, 'roof', 0, RF.ridge, RF.z0, cPart);
  nodes.canopy = roof;
  const sheet = solar ? M.acm : M.opal;
  const slant = RF.halfW / Math.cos(rad(RF.slope));
  for (const s of [-1, 1]) {
    const half = group(roof, s > 0 ? 'roofRight' : 'roofLeft', 0, 0, 0, cPart);
    half.rotation.z = -s * rad(RF.slope);
    box(half, slant, RF.t, RF.len, sheet, (s * slant) / 2, RF.t / 2, RF.len / 2, cPart);
    box(half, 3, 10, RF.len, solar ? M.acm : M.opalEdge, s * (slant - 1.5), RF.t - 5, RF.len / 2, cPart); // drip edge at the eave
    box(half, slant - 4, 16, 2, solar ? M.acm : M.opalEdge, (s * slant) / 2, RF.t + 8, 1, 'flashing'); // upturned back edge against the wall
    box(half, slant - 4, 10, 4, M.rubber, (s * slant) / 2, RF.t + 9, -2, 'flashing'); // EPDM strip pressed on the wall
    if (solar) {
      box(half, slant - 24, 1.2, RF.len - 20, M.solar, s * (slant / 2 + 4), RF.t + 0.6, RF.len / 2, 'solarCanopy');
      for (let i = 1; i < 4; i++) box(half, 0.8, 1.5, RF.len - 20, M.solarGrid, s * (16 + (i * (slant - 24)) / 4), RF.t + 0.7, RF.len / 2, 'solarCanopy');
      box(half, slant - 24, 1.5, 0.8, M.solarGrid, s * (slant / 2 + 4), RF.t + 0.7, RF.len / 2, 'solarCanopy');
    }
  }
  box(roof, 12, 4, RF.len + 2, M.pod, 0, RF.t + 1, RF.len / 2, cPart); // honey-yellow ridge cap

  // pod: the only machined metal, hangs under the ridge beam
  const pod = explodable(group(headAsm, 'pod', 0, HD.y, HD.z, 'pod'), 0, -150, 0, 4, [0, 0, 0]);
  nodes.pod = pod;
  const pw = HD.w, ph = HD.h, pd = HD.d;
  slab(pod, -pw / 2, 0, -pd / 2, pw, 4, pd, M.anod, 'pod');
  slab(pod, -pw / 2, ph - 5, -pd / 2, pw, 5, pd, M.anod, 'pod');
  for (const s of [-1, 1]) slab(pod, s > 0 ? pw / 2 - 4 : -pw / 2, 0, -pd / 2, 4, ph, pd, M.anod, 'pod');
  for (const s of [-1, 1]) cyl(pod, 4, pd, M.anod, s * (pw / 2 - 3), ph - 4, 0, 'z', 'pod', 12);
  slab(pod, -pw / 2 + 2, 0, -pd / 2, pw - 4, ph, 4, M.asa, 'pod'); // printed back cap
  for (let x = -70; x <= 70; x += 14) box(pod, 2.5, 5, pd - 10, M.anod, x, ph + 2.5, 0, 'pod'); // fins
  for (const s of [-1, 1]) box(pod, 16, BM.h, 20, M.anod, 0, ph + 4, s * 40, 'beam'); // hangers to the beam
  // underside: light bars, microphone, light/climate sensor
  for (const s of [-1, 1]) {
    box(pod, 120, 4, 10, M.white, 0, -2, s * 50, 'led');
    box(pod, 116, 1, 7, M.led, 0, -4.2, s * 50, 'led');
  }
  cyl(pod, 4, 1.5, M.matt, 60, -0.8, 12, 'y', 'mic', 20);
  cyl(pod, 6, 5, M.white, -60, -2.5, 12, 'y', 'sensor', 20);
  for (let i = 0; i < 3; i++) cyl(pod, 7 - i, 1, M.white, -60, -5.5 - i * 1.4, 12, 'y', 'sensor', 20);
  const sup = group(pod, 'supervisor', -20, ph - 11, -34, 'supervisor');
  box(sup, 80, 1.6, 50, M.pcb, 0, 0, 0, 'supervisor');
  box(sup, 15.4, 2.4, 20.5, M.can, -22, 2, 8, 'supervisor'); // ESP32-S3 module
  box(sup, 22, 5, 16, M.chip, 18, 3.3, -10, 'supervisor'); // PoE PD transformer

  // camera module + hood, tilted back toward the hive
  const camG = explodable(group(pod, 'cameraModule', 0, 0, 0, 'camera'), 0, -95, 0, 4, [0, 0, 0]);
  camG.rotation.x = rad(p.camera.tilt);
  box(camG, 38, 1.6, 38, M.pcb, 0, 10, 0, 'camera');
  box(camG, 14, 3, 14, M.chip, 0, 8, 0, 'camera');
  cyl(camG, 8, 12, M.black, 0, 2, 0, 'y', 'camera', 24); // M12 lens barrel
  cyl(camG, 20, 16, M.matt, 0, -8, 0, 'y', 'hood', 32, 14); // hood cone, wide at the pod
  cyl(camG, 13, 1, M.glass, 0, -16.3, 0, 'y', 'hood', 32);
  cyl(camG, 15, 2, M.black, 0, -15.5, 0, 'y', 'hood', 32); // window bezel ring
  const eye = new THREE.Object3D();
  eye.name = 'cameraEye';
  eye.position.set(0, (p.camera.eye - HD.y) * MM, 0);
  camG.add(eye);
  nodes.eye = eye;
  const aim = new THREE.Object3D(); // a point on the optical axis, for the inset camera
  aim.name = 'cameraAim';
  aim.position.set(0, (p.camera.eye - HD.y - 100) * MM, 0);
  camG.add(aim);
  nodes.aim = aim;

  // compute cassette: slides out of the front of the pod
  const comp = explodable(group(pod, 'computeCassette', 0, 0, 0, 'compute'), 0, 0, 170, 4, [0, 0, 0]);
  nodes.compute = comp;
  slab(comp, -48, 6, 0, 96, 3, pd / 2 - 2, M.asa, 'compute');
  const pi = group(comp, 'pi', 0, 14, pd / 4, 'compute');
  box(pi, 85, 1.6, 56, M.pcb, 0, 0, 0, 'compute');
  box(pi, 15, 1.4, 15, M.can, -8, 1.5, 0, 'compute');
  box(pi, 85, 1.6, 56, M.pcb, 0, 14, 0, 'compute'); // Hailo HAT
  box(pi, 14, 1.2, 14, M.chip, 4, 15.4, 4, 'compute');
  box(pi, 42, 1, 22, M.chip, 0, -2.5, 0, 'compute'); // NVMe underneath
  box(pi, 50, 4, 40, M.gasket, 0, 18, 0, 'compute'); // thermal pad to the pod roof
  const face = group(comp, 'serviceFace', 0, ph / 2, pd / 2 + 1.5, 'face');
  box(face, pw - 10, ph - 6, 3, M.pod, 0, 0, 0, 'face');
  place(face, cached('ring', () => new THREE.TorusGeometry(7 * MM, 1.6 * MM, 10, 28)), M.status, 58, 8, 1.8, 'face');
  cyl(face, 5, 3, M.podDark, 58, 8, 2, 'z', 'face', 24); // button inside the ring
  box(face, 14, 7, 2, M.rubber, 58, -13, 2, 'face'); // USB-C flap
  cyl(face, 6, 3, M.steel, -68, 0, 2, 'z', 'face', 20); // quarter-turn latch
  box(face, 9, 2, 1.5, M.black, -68, 0, 3.6, 'face');
  // activity display: reflective 2-row segment LCD, today's bees in / out
  const lcd = group(face, 'display', -12, 0, 1.5, 'display');
  box(lcd, 86, 38, 1.5, M.black, 0, 0, 0.75, 'display'); // bezel
  box(lcd, 80, 32, 0.6, M.lcd, 0, 0, 1.8, 'display'); // glass
  const seg = (x, y, w, h) => box(lcd, w, h, 0.3, M.seg, x, y, 2.25, 'display');
  const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
  const digit = (ch, x, y) => { // 6 × 11 mm seven-segment digit centred at (x, y)
    const w = 6, h = 11, t = 1.1;
    const on = SEGS[ch] || '';
    if (on.includes('a')) seg(x, y + h / 2, w - t, t);
    if (on.includes('g')) seg(x, y, w - t, t);
    if (on.includes('d')) seg(x, y - h / 2, w - t, t);
    if (on.includes('f')) seg(x - w / 2, y + h / 4, t, h / 2 - t);
    if (on.includes('b')) seg(x + w / 2, y + h / 4, t, h / 2 - t);
    if (on.includes('e')) seg(x - w / 2, y - h / 4, t, h / 2 - t);
    if (on.includes('c')) seg(x + w / 2, y - h / 4, t, h / 2 - t);
  };
  const arrow = (x, y, up) => { // ↓ bees in, ↑ bees out
    seg(x, y, 1.2, 8);
    for (const s of [-1, 1]) { const m = seg(x + s * 1.6, y + (up ? 2.4 : -2.4), 1.1, 4.4); m.rotation.z = (up ? s : -s) * 0.75; }
  };
  const rows = [['18342', 7.5, false], ['18291', -7.5, true]]; // a busy summer day
  for (const [num, y, up] of rows) {
    arrow(-32, y, up);
    [...num].forEach((ch, i) => digit(ch, -20 + i * 9, y));
  }
  for (let i = 0; i < 4; i++) box(lcd, 3, 2 + i * 1.6, 0.3, i < 1 ? M.seg : M.lcdOff, 29 + i * 3.6, -12 + i * 0.8, 2.25, 'display'); // gate position bars
  box(lcd, 12, 1, 0.3, M.seg, 32, 12, 2.25, 'display'); // "today" tick

  // side bay: battery cassette (solar) or a cover
  if (solar) {
    const bat = explodable(group(pod, 'batteryCassette', 0, 0, 0, 'battery'), -170, 0, 0, 4, [0, 0, 0]);
    nodes.battery = bat;
    for (let i = 0; i < 4; i++) cyl(bat, 16, 70, M.cellWrap, i % 2 ? 36 : -36, 24, i < 2 ? -52 : -20, 'x', 'battery', 24); // 4 × 32700 in the rear half
    slab(bat, -pw / 2 - 1.5, 3, -pd / 2 + 4, 3, ph - 6, pd - 8, M.podDark, 'battery');
  } else {
    slab(pod, -pw / 2 - 1.5, 3, -pd / 2 + 4, 3, ph - 6, pd - 8, M.graphite, 'blank');
  }
  { // front gable: closes the roof front above the pod, the pod face sits in it
    const gy0 = HD.y, gx = (RF.ridge - gy0) / tanR - 4, top = RF.ridge - 3;
    const px = pw / 2 + 1, py = HD.y + ph + 1;
    const sh = new THREE.Shape();
    const pts = [[-gx, gy0], [-px, gy0], [-px, py], [px, py], [px, gy0], [gx, gy0], [0, top]];
    sh.moveTo(pts[0][0] * MM, pts[0][1] * MM);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x * MM, y * MM);
    sh.closePath();
    const gz = HD.z + pd / 2 - 1;
    place(headAsm, cached('frontGable', () => new THREE.ExtrudeGeometry(sh, { depth: 3 * MM, bevelEnabled: false })), M.gableWood, 0, 0, gz, 'gable');
    // Wi-Fi: two flat dual-band antennas on the back of the wooden gable, left and right of the pod,
    // tilted apart for polarisation diversity. Wood and polycarbonate pass RF; the metal pod would not.
    for (const s of [-1, 1]) {
      const ax = s * (px + 34), ay = gy0 + 12;
      const ant = box(headAsm, 44, 11, 1.2, M.pcbBlack, ax, ay, gz - 0.7, 'antenna');
      ant.rotation.z = s * 0.35;
      cable(headAsm, [[ax - s * 20, ay - 4, gz - 1.5], [s * (px + 8), ay - 14, gz - 6], [s * (px - 2), HD.y + 30, gz - 10]], 0.9, M.cable, 'antenna');
    }
    for (let i = 0; i < 3; i++) box(headAsm, 34 - i * 10, 2.5, 1, M.black, 0, top - 18 - i * 6, gz + 3.4, 'gable'); // vent slots
    const hx = place(headAsm, cached('gableHex', () => new THREE.CylinderGeometry(9 * MM, 9 * MM, 1.5 * MM, 6)), M.pod, 0, py + 14, gz + 3.5, 'gable');
    hx.rotation.x = Math.PI / 2;
  }
  if (!solar) {
    // Opal diffuses the sun: the roof and the pod under it cast no hard shadow on the board.
    roof.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    pod.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  }

  // ----- internal harness (inside the right upright; seen in the exploded view)
  cable(frame, [[footX, -38, plateZ + 10], [footX, 60, plateZ + 8], [footX, postTop - 20, plateZ + 8], [60, apexY - 40, plateZ + 8], [8, beamTop - 20, plateZ + 20], [8, beamTop - 20, HD.z - 40], [8, HD.y + HD.h, HD.z - 30]], 2.4, M.cable, 'harness');
  cable(obs, [[PW2 + 28, -30, PO.gateZ], [footX - 4, -30, PO.gateZ - 10], [footX, -30, plateZ + 20]], 1.6, M.cable, 'harness'); // gate drive lead

  // ----- landing board ------------------------------------------------------------
  const boardHinge = group(obs, 'landingBoard', 0, -2, PO.floorEnd, 'board');
  boardHinge.rotation.x = rad(p.boardSlope);
  explodable(boardHinge, 0, -20, 170, 3, [0, -20, 260]);
  nodes.board = boardHinge;
  const BW = p.board.w, BD = p.board.d;
  const IW = 210, ID = 130; // HDPE insert: half-width and depth of the area the camera sees
  slab(boardHinge, -BW / 2, -15, 0, BW, 15, BD, M.boardWood, 'board'); // 15 mm thermo-pine, pocketed for the insert
  slab(boardHinge, -IW, -3, 0.5, 2 * IW, 3.05, ID, M.insert, 'insert'); // flush 3 mm HDPE insert
  box(boardHinge, BW - 40, 5, 20, M.alu, 0, -17.5, BD / 2, 'board'); // aluminium stiffener underneath
  for (const sx of [-1, 1]) cyl(boardHinge, 4, 14, M.steel, sx * (PW2 - 4), -6, 0, 'x', 'hinge', 12);
  // hive colour: painted border round the insert (sides and front) and the front lip, all outside the view
  const paint = (x0, z0, x1, z1) => slab(boardHinge, x0, -0.4, z0, x1 - x0, 0.45, z1 - z0, M.theme, 'border');
  paint(-BW / 2, 0, -IW, BD); paint(IW, 0, BW / 2, BD); paint(-IW, ID + 0.5, IW, BD);
  slab(boardHinge, -BW / 2, -15, BD, BW, 15, 0.8, M.theme, 'border'); // front lip
  const ink = 0.25;
  const motif = (x, z, along) => { // one pattern motif centred at (x, z)
    if (p.pattern === 'dots') cyl(boardHinge, 3.2, 0.5, M.themeInk, x, ink, z, 'y', 'border', 16);
    if (p.pattern === 'stripes') box(boardHinge, along ? 4 : 10, 0.5, along ? 12 : 4, M.themeInk, x, ink, z, 'border');
    if (p.pattern === 'chevrons') for (const s of [-1, 1]) {
      const m = box(boardHinge, 6, 0.5, 2.4, M.themeInk, x + s * 2.4, ink, z + 1.6, 'border');
      m.rotation.y = s * 0.6;
    }
  };
  for (let x = -IW + 30; x <= IW - 30; x += 16) motif(x, ID + 10, true); // along the front border, between the decks
  for (const sx of [-1, 1]) for (let z = 12; z < BD - 40; z += 16) motif(sx * (IW + 7), z, false); // down the side borders
  // brick decks on the front corners, outside the view: 4 × 4 studs on an 8 mm grid
  for (const sx of [-1, 1]) {
    const cx = sx * (BW / 2 - 18), cz = BD - 18;
    box(boardHinge, 32, 3, 32, M.theme, cx, 1.5, cz, 'studs');
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) cyl(boardHinge, 2.4, 1.7, M.theme, cx - 12 + i * 8, 3.85, cz - 12 + j * 8, 'y', 'studs', 14);
  }
  // a couple of user bricks on the left deck
  const brick = (x, y, z, w, dd, h, mat) => {
    box(boardHinge, w * 8 - 0.2, h, dd * 8 - 0.2, mat, x, y + h / 2, z, 'studs');
    for (let i = 0; i < w; i++) for (let j = 0; j < dd; j++) cyl(boardHinge, 2.4, 1.7, mat, x - (w - 1) * 4 + i * 8, y + h + 0.85, z - (dd - 1) * 4 + j * 8, 'y', 'studs', 14);
  };
  brick(-(BW / 2 - 18) - 4, 3, BD - 18, 2, 2, 9.6, M.pod);
  brick(-(BW / 2 - 18) - 4, 12.6, BD - 18 - 4, 2, 1, 9.6, M.white);

  // ----- bees -----------------------------------------------------------------------
  const bees = group(boardHinge, 'bees');
  const beesAir = group(obs, 'beesAir');
  nodes.bees = [bees, beesAir];
  const beeGeo = cached('bee', () => new THREE.SphereGeometry(1, 12, 8));
  const addBee = (parent, x, y, z, rotY, pollen = false) => {
    const b = group(parent, `bee_${parent.children.length}`, x, y, z, 'bee');
    b.rotation.y = rotY;
    const body = place(b, beeGeo, M.beeBody, 0, 0, 0, 'bee'); body.scale.set(2.2 * MM, 2 * MM, 6.5 * MM);
    const stripe = place(b, beeGeo, M.beeStripe, 0, 0.2, -2.5, 'bee'); stripe.scale.set(2.3 * MM, 2.05 * MM, 2.6 * MM);
    place(b, beeGeo, M.beeBody, 0, 0, 5.8, 'bee').scale.set(1.6 * MM, 1.5 * MM, 1.6 * MM); // head
    for (const s of [-1, 1]) {
      const wing = place(b, beeGeo, M.beeWing, s * 2.6, 2, -0.5, 'bee');
      wing.scale.set(2.2 * MM, 0.3 * MM, 5 * MM);
      wing.rotation.y = s * 0.35;
      if (pollen) place(b, beeGeo, M.pollen, s * 2.4, -0.6, -1, 'bee').scale.set(1.2 * MM, 1.2 * MM, 1.5 * MM);
    }
    return b;
  };
  const walkers = [
    [-120, 8, 0.3], [-60, 12, 2.9, true], [10, 30, -0.4], [55, 6, 3.3], [95, 70, 2.2, true], [-150, 95, 1.1],
    [140, 24, -2.6], [-30, 60, 0.9], [150, 110, -0.8], [-95, 48, 3.0, true], [30, 95, 2.6], [-10, 118, 3.1],
  ];
  for (const [x, z, r, pl] of walkers) addBee(bees, x, 2.2, z, r, pl);
  // wall landers: on the hive wall above the porch, then walking over the porch roof
  const beesWall = group(obs, 'beesWall');
  nodes.bees.push(beesWall);
  for (const [x, y] of [[-70, 40], [45, 52], [120, 34]]) {
    const b = addBee(beesWall, x, y, d.wallZ + 3, 0);
    b.rotation.x = Math.PI / 2; // head down, on the vertical wall
  }
  for (const [x, z, r] of [[-40, PO.gateZ - 20, 0.2], [80, PO.gateZ - 30, -0.3]]) addBee(beesWall, x, pTop + PO.roof + 2, z, r);
  for (const [x, y, z, r] of [[-60, 120, 330, 2.9], [110, 200, 420, -2.6], [-170, 70, 280, 0.6], [30, 260, 520, 3.4]]) {
    const b = addBee(beesAir, x, y, z, r);
    b.rotation.x = -0.25;
  }

  // ----- field of view (toggled in the viewer) ------------------------------------
  const fov = group(obs, 'fieldOfView', 0, 0, 0, 'fov');
  nodes.fov = fov;
  {
    const e = d.eye, cs = d.corners, ol = d.outline;
    const pts = [];
    for (const c of cs) pts.push(e.x, e.y, e.z, c.x, c.y, c.z);
    for (let i = 0; i < ol.length; i++) { const a = ol[i], b = ol[(i + 1) % ol.length]; pts.push(a.x, a.y + 0.5, a.z, b.x, b.y + 0.5, b.z); }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pts.map((v) => v * MM), 3));
    const lines = new THREE.LineSegments(lg, M.fovLine);
    lines.userData.part = 'fov';
    fov.add(lines);
    const tri = [];
    for (let i = 0; i < ol.length; i++) { const a = ol[i], b = ol[(i + 1) % ol.length]; tri.push(e.x, e.y, e.z, a.x, a.y, a.z, b.x, b.y, b.z); }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(tri.map((v) => v * MM), 3));
    tg.computeVertexNormals();
    const mesh = new THREE.Mesh(tg, M.fov);
    mesh.userData.part = 'fov';
    fov.add(mesh);
  }
  fov.visible = false;

  // ----- context: hive, stand, scale, robot -------------------------------------------
  const hive = group(root, 'hive', 0, d.hiveBase, 0, 'hive');
  nodes.hive = hive;
  const hiveMats = [];
  const woodMat = (i) => { const m = M.wood[i % M.wood.length].clone(); hiveMats.push(m); return m; };
  const T = 25, E2 = H.entrance / 2, bb = d.bottomBoard;
  const slotY = d.entranceY - d.hiveBase; // slot floor, relative to the hive base
  const walls = (g, y0, h, mat) => {
    box(g, H.w, h, T, mat, 0, y0 + h / 2, H.d / 2 - T / 2, 'hive');
    box(g, H.w, h, T, mat, 0, y0 + h / 2, -H.d / 2 + T / 2, 'hive');
    for (const s of [-1, 1]) box(g, T, h, H.d - 2 * T, mat, s * (H.w / 2 - T / 2), y0 + h / 2, 0, 'hive');
  };
  if (p.context === 'robot') {
    // the robot bottom board sits on the plinth: the slot is at its top
    const bbMat = woodMat(2);
    box(hive, H.w, 12, H.d, bbMat, 0, -bb + 6, 0, 'hive');
    box(hive, H.w, bb, T, bbMat, 0, -bb / 2, -H.d / 2 + T / 2, 'hive');
    for (const s of [-1, 1]) {
      box(hive, T, bb, H.d - 2 * T, bbMat, s * (H.w / 2 - T / 2), -bb / 2, 0, 'hive');
      box(hive, H.w / 2 - E2, bb, T, bbMat, s * (H.w / 2 + E2) / 2, -bb / 2, H.d / 2 - T / 2, 'hive');
    }
    box(hive, H.entrance, bb - H.slot, T, bbMat, 0, -bb + (bb - H.slot) / 2, H.d / 2 - T / 2, 'hive');
    for (let i = 0; i < p.boxes; i++) walls(hive, i * H.h, H.h, woodMat(i));
  } else {
    const bbMat = woodMat(2), floor = 12;
    box(hive, H.w, floor, H.d, bbMat, 0, floor / 2, 0, 'hive');
    box(hive, H.w, bb, T, bbMat, 0, bb / 2, -H.d / 2 + T / 2, 'hive');
    for (const s of [-1, 1]) {
      box(hive, T, bb, H.d - 2 * T, bbMat, s * (H.w / 2 - T / 2), bb / 2, 0, 'hive');
      box(hive, H.w / 2 - E2, bb, T, bbMat, s * (H.w / 2 + E2) / 2, bb / 2, H.d / 2 - T / 2, 'hive');
    }
    box(hive, H.entrance, bb - slotY - H.slot, T, bbMat, 0, slotY + H.slot + (bb - slotY - H.slot) / 2, H.d / 2 - T / 2, 'hive');
    for (let i = 0; i < p.boxes; i++) walls(hive, bb + i * H.h, H.h, woodMat(i));
  }
  const lidY = (p.context === 'robot' ? 0 : bb) + p.boxes * H.h;
  const lidMat = M.lid.clone();
  hiveMats.push(lidMat);
  box(hive, H.w + 20, H.lid, H.d + 20, lidMat, 0, lidY + H.lid / 2, 0, 'hive');
  nodes.hiveMaterials = hiveMats;

  if (p.context === 'hive') {
    const st = group(root, 'stand', 0, 0, 0, 'stand');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(st, 45, p.stand - 45, 45, M.timberDark, sx * 210, (p.stand - 45) / 2, sz * 170, 'stand');
    for (const sz of [-1, 1]) box(st, 520, 45, 45, M.timber, 0, p.stand - 22.5, sz * 170, 'stand');
    for (const sx of [-1, 1]) box(st, 45, 45, 300, M.timber, sx * 210, p.stand - 22.5, 0, 'stand');
    // PoE cable: drip loop under the right upright, down the stand, away along the ground
    const g = W(footX, -51, plateZ + 10);
    cable(fieldCables, [g, [g[0], g[1] - 30, g[2] + 6], [g[0] + 4, g[1] - 60, g[2] - 6], [g[0] + 6, 120, g[2] - 4], [g[0] + 10, 8, g[2] - 10], [g[0] + 120, 3, 200], [900, 3, 60]], 2.8, M.cable);
  } else if (p.context === 'scale') {
    const S = p.scale, sc = group(root, 'scale', 0, 0, 0, 'scale');
    const bY = S.feet, bw = S.base.w, bd = S.base.d, deckY = S.feet + S.height - 18;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      cyl(sc, 5, S.feet, M.steel, sx * 200, S.feet / 2 + 4, sz * 150, 'y', 'scale', 12);
      cyl(sc, 20, 8, M.rubber, sx * 200, 4, sz * 150, 'y', 'scale', 28);
    }
    box(sc, bw, S.base.h, bd, M.timber, 0, bY + S.base.h / 2, 0, 'scale');
    box(sc, S.deck.w, 17, S.deck.d, M.timber, 0, deckY + 8.5, 0, 'scale');
    box(sc, S.deck.w, 1, S.deck.d, M.film, 0, deckY + 17.5, 0, 'scale');
    for (const s of [-1, 1]) {
      box(sc, S.deck.w, 40, 20, M.timber, 0, deckY - 20, s * (S.deck.d / 2 - 10), 'scale');
      box(sc, 20, 40, S.deck.d - 40, M.timber, s * (S.deck.w / 2 - 10), deckY - 20, 0, 'scale');
    }
    box(sc, 3, 38, 150, M.pod, bw / 2 + 1.5, bY + 20, 0, 'scale'); // pod face
    // front rail (the Observer risers hook on it) and the M12 connector under it
    const railZ = S.deck.d / 2 + 8;
    slab(sc, -220, bY + 16, bd / 2, 440, 4, railZ - bd / 2, M.alu, 'scale');
    slab(sc, -220, bY + 16, railZ - 4, 440, 30, 4, M.alu, 'scale');
    cyl(sc, 8, 14, M.steel, 60, bY + 9, bd / 2 + 18, 'y', 'scaleLink', 20);
    cyl(sc, 9, 12, M.black, 60, bY - 1, bd / 2 + 18, 'y', 'scaleLink', 20);
    const acc = W(footX, -48, plateZ + 27);
    cable(fieldCables, [acc, [acc[0], acc[1] - 20, acc[2] - 2], [acc[0] - 20, bY - 10, acc[2] - 30], [120, bY - 16, bd / 2 + 30], [60, bY - 12, bd / 2 + 18], [60, bY - 6, bd / 2 + 18]], 2.3, M.cable);
    const g = W(footX, -51, plateZ + 10);
    cable(fieldCables, [g, [g[0] + 4, g[1] - 30, g[2] + 4], [g[0] + 30, 30, g[2] + 10], [g[0] + 90, 3, g[2]], [700, 3, 150], [1100, 3, 60]], 2.8, M.cable);
  } else {
    // Robotic Beehive (ghost): posts, plinth, front cladding with the entrance frame
    const R = p.robot, E = R.e, PX = R.post.x, PZ = R.post.z;
    const rb = group(root, 'robotCabinet', 0, 0, 0, 'robot');
    nodes.robot = rb;
    const postH = d.lidTop + 520;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      box(rb, E, postH - 40, E, M.robot, sx * PX, 40 + (postH - 40) / 2, sz * PZ, 'robot');
      cyl(rb, 22, 10, M.robot, sx * PX, 5, sz * PZ, 'y', 'robot', 24);
    }
    for (const y of [51, R.plinth - 11, postH]) {
      box(rb, 2 * PX + E, E, E, M.robot, 0, y, PZ, 'robot');
      box(rb, 2 * PX + E, E, E, M.robot, 0, y, -PZ, 'robot');
      for (const s of [-1, 1]) box(rb, E, E, 2 * PZ - E, M.robot, s * PX, y, 0, 'robot');
    }
    // front cladding with an opening for the entrance tunnel mouth
    const fz = PZ + E / 2 + R.clad / 2, cw = 2 * PX + E, top = postH;
    const holeY0 = d.entranceY - 16, holeY1 = d.entranceY + H.slot + 40;
    box(rb, cw, holeY0 - 40, R.clad, M.robotClad, 0, 40 + (holeY0 - 40) / 2, fz, 'robot');
    box(rb, cw, top - holeY1, R.clad, M.robotClad, 0, holeY1 + (top - holeY1) / 2, fz, 'robot');
    for (const s of [-1, 1]) box(rb, cw / 2 - FW - 6, holeY1 - holeY0, R.clad, M.robotClad, s * (cw / 2 + FW + 6) / 2, (holeY0 + holeY1) / 2, fz, 'robot');
    // entrance tunnel from the bottom board to the cabinet front
    box(rb, cw + 120, 20, 2 * PZ + 180, M.robot, 0, postH + 30, 0, 'robot'); // roof
    const g = W(footX, -51, plateZ + 10);
    cable(fieldCables, [g, [g[0], g[1] - 20, g[2] - 2], [g[0] + 30, g[1] - 36, fz + 6], [PX - 30, g[1] - 30, fz - 20], [PX - 10, g[1] - 60, PZ - 20]], 2.8, M.cable);
  }

  const applyExplode = (u) => {
    const e = u * u * (3 - 2 * u);
    for (const g of nodes.explode) g.position.copy(g.userData.home).addScaledVector(g.userData.explode, e);
    const quiet = u < 0.02;
    fieldCables.visible = quiet;
    for (const b of nodes.bees) b.visible = quiet;
  };
  applyExplode(0);

  return { root, nodes, params: p, derived: d, applyExplode, MM, GATE };
}

      return { buildObserver, DEFAULTS, PARTS, THEMES, PATTERNS, GATE, INSTALL, ENERGY, energy, derive };
    })();
    const { buildObserver, DEFAULTS: OBSERVER_DEFAULTS, PARTS: OBSERVER_PARTS } = OBS;

    // ----  HiveTower 主体（原 hive-model.js） ----
    const HIVE = (function () {
// Gratheon Robotic Beehive — parametric model of a static robotic beehive.
// Single source of truth for both the browser viewer (index.html) and the
// GLB exporter (export-glb.mjs). All dimensions are in millimetres; the scene
// is built in metres (glTF convention).
//
// Axes: X = left/right (frame length, frame ears sit on the left/right walls)
//       Y = up
//       Z = front(+)/back(-) (frames are stacked along Z, entrance faces +Z)


const MM = 0.001;
// Frame cameras (see lift beams): one per face, CAM_Z in front of and behind
// the photo spot.
const CAM_Z = 265;
// One 300 × 15 mm entrance at the top of the bottom board, as the Entrance
// Observer porch expects. Front cladding: 8 mm backer + 18 mm slats.
const ENTRANCE = 300, CLAD = 26;

const DEFAULTS = {
  // Hive bodies from the bottom up. Deep boxes hold the brood nest; shallow
  // supers ("magazines") hold honey. Any mix works: every box has the same
  // cleats and pins, and the robot looks up each box's height here.
  stack: ['deep', 'deep', 'super'],
  boxTypes: {
    deep: { h: 285, frame: 279 },
    super: { h: 170, frame: 164 },
  },
  inspectBox: 1, // 0 = bottom box
  box: { w: 506, d: 450, wall: 25 }, // Estonian hive body (outer)
  frame: { topBar: 448, width: 410, count: 10, pitch: 37.5, pinX: 200 },
  plinth: 200, // cabinet base, holds PSU / battery / PoE supply
  bottomBoard: 150, // screened floor + varroa sump camera
  lid: 80, // insulated inner cover
  cleatUnderside: 25, // cleat lifting face, measured from box bottom
  gap: 400, // how far the upper stack is raised to open a box
  // The frame cameras hang from the lift beams, so during scanning they sit a
  // fixed height above the open box's rim whatever the box. Each frame is lifted
  // until its centre is level with them. 150–165 mm works for deep frames: the
  // frame must clear the rim and the scan beam must stay 119 mm under the lift beam.
  camRim: 160,
  post: { x: 372, z: 302 }, // 22 mm extrusion corner posts (centre)
  // The hive sits 45 mm toward the front of the cabinet, so the bees' tunnel
  // through the front wall is short; the front camera still clears it by 10 mm.
  hiveZ: 45,
  photoZ: 29, // frames are photographed here, centred between the cameras
  crown: 180, // electronics + motor bay on top
};

// ---------------------------------------------------------------------------
// Part descriptions (shown on hover in the viewer, exported as glTF extras)
// ---------------------------------------------------------------------------
const PARTS = {
  post: ['Corner post', '22 mm aluminium extrusion, 4 corners. Each post carries a linear rail on its inner face for the lift beam and scan beam carriages.'],
  plinth: ['Plinth', 'Base of the cabinet, about 200 mm high. Holds the 24 V PSU, the optional LiFePO4 battery, the MPPT charger and the PoE+ supply for the Entrance Observer. Stands on levelling feet over a gravel pad.'],
  feet: ['Levelling feet', 'M12 stainless feet with rubber pads. They decouple the cabinet from the ground and let you level the stack so frames hang plumb.'],
  crown: ['Crown bay', 'Dry service bay on top of the cabinet. Lift motors hang the lead screws from here, so the screws work in tension and cannot buckle. All electronics sit here too, with short antenna runs.'],
  liftBeam: ['Lift beam (×2)', 'Left and right beams on independent NEMA23 + TR16×4 lead screws. The screws are self-locking, so a power loss never drops the stack. Running the two sides at different heights lets the robot peel a propolis-glued box apart one edge at a time.'],
  fork: ['Fork fingers', 'A servo turns a steel shaft 90° to swing two fingers under the box cleats. They stay folded down whenever they are not lifting. Painted yellow as a pinch-hazard colour.'],
  loadcell: ['Load cell', 'A bar load cell in each fork bearing block. It weighs the lifted part of the stack (per-box honey weight for free) and detects collisions: if the load drops before the expected landing height, the robot stops.'],
  cleat: ['Lift cleat', 'Stainless 30×30 angle screwed to both sides of every box and the lid. The forks lift on it. It also works as a hand grip for manual beekeeping.'],
  scanBeam: ['Scan beam (×2)', 'Second pair of beams, also NEMA23 + TR16×4 lead screws (self-locking, so a frame never drops). They raise the selected frame straight up out of its box, so bees that drop off fall back into their own box.'],
  shuttle: ['Frame shuttle', 'Runs front/back along the scan beam on a GT2 belt. It carries the hook and an inductive sensor that finds the steel frame pins.'],
  belt: ['Shuttle drive', 'NEMA17 + GT2 belt, TMC2209 in StealthChop mode, so it is nearly silent. Bees feel substrate vibration strongly.'],
  hook: ['Frame hook', 'A servo swings an L-shaped hook over the box wall. The slotted tip slides sideways under the frame pin, so it never presses down onto bees. Once the frame hangs, the pin head drops into a 1.5 mm pocket, so the frame can be carried in either direction.'],
  camera: ['Frame camera (×2)', 'One 12 MP camera per face (IMX477 class, 3.6 mm low-distortion M12 lens, about 83° × 67°), 240 mm from the comb and looking straight at it, plugged straight into the Orin Nano’s two CSI ports. They hang from the lift beams, not from the frame carrier: while a box is open the lift beams stand still 425 mm above its rim, whatever the box, so the cameras are always 160 mm above the rim and the scan beam lifts each frame until its comb centre is level with them. Deep brood frames and shallow super frames are both centred. Every frame is photographed at the same photo spot, so focus and mm per pixel never change (about 9.5 px/mm: a cell is ~50 px, an egg ~14 px). The middle of the comb is seen almost straight down the cells; the corners at up to ~46°, which shows larvae and capping but not eggs at the very bottom of a cell.'],
  rimCam: ['Rim camera (×2)', 'Small camera under each lift beam, looking down at the box rim. Before closing, it counts bees on the contact edges and looks for burr comb across the seam.'],
  strobe: ['Ring strobe', 'White LED ring around each lens, flashed only during the exposure. A polariser on the ring and a crossed one on the lens remove glare from wet nectar and capped honey, so the camera sees into the cells.'],
  redLight: ['Red work light', 'Bees barely see light above ~620 nm, so the cabinet interior is lit deep red during the whole inspection.'],
  leadScrew: ['Lead screw', 'TR16×4 trapezoidal lead screw, self-locking (lead angle ≈4.5°). It is hung from a thrust bearing in the crown. Dry PTFE lubrication, no grease to trap debris or bees.'],
  nema23: ['NEMA23 lift motor', 'Driven by a DM542 driver. Four of them: two lift beams and two scan beams. Lifting 80 kg of upper boxes needs ≈0.8 N·m per side with TR16×4.'],
  nema17: ['NEMA17 motor', 'Drives a shuttle belt. TMC2209 driver on the motion board. StallGuard detects jams.'],
  box: ['Hive body', 'A standard wooden hive body: deep boxes (285 mm) for the brood nest, shallow supers (170 mm) for honey, in any order. Only change needed: two cleats and steel frame pins. The robot knows each box’s height from the stack settings. Nothing robotic lives inside the bee space.'],
  lid: ['Insulated inner cover', 'Wood-fibre insulated lid with cleats. The cabinet roof handles rain, so the hive lid stays light.'],
  frame: ['Frame', 'Estonian frame, 448 mm top bar: 279 mm deep in brood boxes, 164 mm in supers. Frames are kept vertical at all times: warm, heavy comb breaks if it is tilted.'],
  comb: ['Comb', 'Brood frames: capped brood in the centre, honey arc on top. Super frames: capped honey. This is what the cameras capture on every inspection.'],
  pin: ['Robot frame pin', 'A stainless M5 shoulder screw on each ear of the top bar (≈0.20 € per frame). The hook grips it. The inductive sensor locates each frame to ±0.5 mm.'],
  tag: ['Frame ID tag', 'ArUco marker on the end bar. The frame keeps its identity when it moves between boxes, so the web app can track each frame side over time.'],
  bottomBoard: ['Varroa sump', 'Tall screened bottom board. Mites fall through the mesh onto a white tray. A corner camera counts them every day. No moving parts.'],
  varroaCam: ['Varroa camera', 'Wide-angle camera with a ring light inside the sump, looking across the white tray.'],
  cladding: ['Cladding', 'Vertical thermo-treated pine boards. They are weatherproof without chemical preservatives, which can harm bees. Backed by wood-fibre insulation.'],
  plinthClad: ['Charred-wood skirt', 'Yakisugi (charred) boards resist rot and splashing at ground level without any chemicals.'],
  door: ['Service door', 'Full-height door at the back, away from the entrance, so opening it never puts the beekeeper in the bees’ flight path. It swings out on three hinges (tick “Open service door” to see it). Opening it cuts motor power (interlock), and the forks can then be folded away so the hive can be worked by hand.'],
  window: ['Viewing window', '600 × 380 mm polycarbonate window in the service door at the height where frames are photographed, so visitors can watch an inspection. A wooden shutter keeps the cabinet dark between inspections.'],
  roof: ['Roof', 'Ventilated double roof with 60 mm overhang and drip edges. The air gap keeps summer heat off the hive.'],
  solar: ['Solar panel', 'About 100 W, south-facing. With the always-on ESP32 at ~0.2 W and the Jetson woken only for inspections, the tower runs off-grid most of the year.'],
  antenna: ['Antenna fin', 'RF-transparent ASA fin on the roof ridge with the LTE, LoRa 868 MHz, Wi-Fi and GNSS antennas. Surge arrestors sit where the cables enter the crown.'],
  vent: ['Hex vent band', 'Hexagon ventilation slots in bronze-anodised aluminium, backed by insect mesh. Crown heat leaves here and does not heat the hive.'],
  estop: ['Emergency stop', 'Latching mushroom switch on the fixed stile at the back, right next to the door handle, so it can be hit without opening anything. Opening the door already stops the motors (interlock), so the stop button is for when something goes wrong with the door closed. It cuts 24 V motor power only; the computers keep running and log the event.'],
  status: ['Status display', 'E-paper panel on the service door (black, white and red), readable in full sun and powered only when it changes. It shows what the last inspection found: queen seen, frames with eggs and brood, varroa level and trend, honey flow and weight, inside climate, and the next planned visit. Red marks what needs attention. The light bar under it is the robot state: slow yellow pulse = idle, solid yellow = inspecting (do not open the door), red = needs attention.'],
  jetson: ['Jetson Orin Nano', 'Runs inspections, cameras and detection models (bees, queen, varroa, brood). It sends sequences to Klipper over the Moonraker API.'],
  mcu: ['Motion board', 'BTT Octopus-class board running Klipper firmware. It generates step pulses in real time (not Python on the GPIO), handles endstops, servos, fans and the heater.'],
  dm542: ['DM542 drivers', 'External drivers for the four NEMA23 motors. Step/dir signals come from the motion board.'],
  dcdc: ['DC-DC converters', 'Converts 24 V to 19 V for the Orin Nano and 24 V to 5 V for the servos and LEDs. Each output is fused.'],
  modem: ['LTE modem', 'USB LTE modem for sites without Wi-Fi.'],
  lora: ['ESP32 + LoRa', 'Always-on supervisor, about 0.2 W. It reads temperature, humidity and weight, sends LoRa telemetry, wakes the Jetson via a relay and runs the watchdog.'],
  psu: ['24 V PSU', 'Mean Well 24 V ~ 350 W in a sealed box. The motor rail goes through the E-stop and the door interlock.'],
  battery: ['LiFePO4 battery', 'Optional 24 V / 20 Ah pack for solar or off-grid use. Sits low for stability.'],
  poe: ['PoE+ supply', '24 V to 48 V PoE+ injector (30 W) for the Entrance Observer. One cable carries power and data through the front corner post to the Observer; its own Raspberry Pi 5 + Hailo pod does the bee counting.'],
  heater: ['Cabinet heater', '24 V PTC fan heater. It pre-warms the cabinet air to about 25 °C before a cold-day inspection, so open brood does not chill.'],
  bee: ['Honey bee', 'The client.'],
};

// ---------------------------------------------------------------------------
// Derived geometry
// ---------------------------------------------------------------------------
// Entrance Observer parts, namespaced so they do not clash with ours.
for (const [k, v] of Object.entries(OBSERVER_PARTS)) PARTS[`eo:${k}`] = [`Entrance Observer · ${v[0]}`, v[1]];

function derive(p) {
  const types = p.stack.map((t) => p.boxTypes[t] || p.boxTypes.deep);
  const n = types.length;
  const k = Math.min(p.inspectBox, n - 1);
  const boxH = (i) => types[i].h;
  const frameH = (i) => types[i].frame;
  const base = p.plinth + p.bottomBoard;
  const boxBottom = (i) => base + types.slice(0, i).reduce((a, t) => a + t.h, 0); // i === n → lid
  const cleatY = (i) => boxBottom(i) + p.cleatUnderside;
  const rim = boxBottom(k) + boxH(k);
  // Lift that puts the comb centre (half a frame under the top bar) level with the cameras.
  const frameLiftOf = (i) => p.camRim + 2 + frameH(i) / 2;
  const frameTop = (rimY) => rimY - 2; // top bar sits 2 mm below the rim
  const engage = frameTop(rim) + 1.25; // hook plate sits on the pin neck
  const liftMax = cleatY(n) + p.gap; // worst case: lifting only the lid
  const postTop = liftMax + 70;
  const inner = p.box.d - 2 * p.box.wall;
  const f = p.frame;
  // Working gap of 25 mm starts at the back wall; frames fill the rest.
  const frameZ = [];
  for (let i = 0; i < f.count; i++) frameZ.push(-inner / 2 + 25 + f.pitch / 2 + i * f.pitch);
  const gapWidth = inner - f.count * f.pitch;
  return {
    n, k, types, boxH, frameH, frameLiftOf, frameLift: frameLiftOf(k), base, boxBottom, hiveZ: p.hiveZ, photoZ: p.photoZ, cleatY, rim, engage, liftMax, postTop, frameZ, gapWidth,
    frameTop: frameTop(rim),
    camY: rim + p.camRim, // camera axis while scanning
    camDrop: p.cleatUnderside + p.gap - p.camRim, // camera axis below the lift beam's fork line
    crownTop: postTop + p.crown,
    stackTop: boxBottom(n) + p.lid,
    // Lift beams never go below base + 304 (scan park + 119 mm): the frame
    // cameras hanging 265 mm under them then clear the Entrance Observer porch.
    liftPark: base + 350,
    scanPark: base + 185,
  };
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
function makeMaterials() {
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0, ...o });
  return {
    alu: std(0xc4c9ce, { metalness: 0.75, roughness: 0.35 }),
    bronze: std(0x7a6247, { metalness: 0.7, roughness: 0.4 }),
    steel: std(0x9aa1a8, { metalness: 0.85, roughness: 0.3 }),
    black: std(0x1f2122, { roughness: 0.55 }),
    rubber: std(0x151515, { roughness: 0.95 }),
    pcbGreen: std(0x1d4d33, { roughness: 0.6 }),
    pcbBlue: std(0x1f3552, { roughness: 0.6 }),
    yellow: std(0xf2b705, { roughness: 0.45 }),
    red: std(0xc8261d, { roughness: 0.4 }),
    white: std(0xf1f0ea, { roughness: 0.8 }),
    woodBox: [std(0xd7b07a, { roughness: 0.85 }), std(0xcfa46b, { roughness: 0.85 }), std(0xdcba88, { roughness: 0.85 }), std(0xc99b61, { roughness: 0.85 })],
    lid: std(0xb98d5a, { roughness: 0.85 }),
    slat: std(0x8b5a3c, { roughness: 0.8 }),
    slatAlt: std(0x7f5236, { roughness: 0.8 }),
    backer: std(0x2c2420, { roughness: 0.9 }),
    charred: std(0x262220, { roughness: 0.95 }),
    topBar: std(0xe0c28f, { roughness: 0.8 }),
    comb: std(0xe2b24a, { roughness: 0.6 }),
    honey: std(0xf3c647, { roughness: 0.35, emissive: 0x3a2800, emissiveIntensity: 0.3 }),
    brood: std(0xa8743c, { roughness: 0.75 }),
    mesh: std(0x6f7478, { metalness: 0.6, roughness: 0.5, transparent: true, opacity: 0.55 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0xcfe6ee, roughness: 0.05, metalness: 0, transmission: 0.85, transparent: true, opacity: 0.35, thickness: 4 }),
    solar: std(0x14213d, { metalness: 0.4, roughness: 0.25 }),
    fin: std(0xd8d6cf, { roughness: 0.5 }),
    ledWhite: std(0xffffff, { emissive: 0xffffff, emissiveIntensity: 2.5 }),
    ledRed: std(0x550000, { emissive: 0xff1a0a, emissiveIntensity: 2.0 }),
    epaper: std(0xdcded6, { roughness: 0.9 }),
    epaperInk: std(0x2b2f2c, { roughness: 0.9 }),
    ledYellow: std(0x6a4a00, { emissive: 0xffc21a, emissiveIntensity: 1.6 }),
    beam: new THREE.MeshBasicMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.12, depthWrite: false }),
    beeBody: std(0x2a1d0e, { roughness: 0.6 }),
    beeStripe: std(0xe3a824, { roughness: 0.6 }),
    beeWing: std(0xe8f2f7, { roughness: 0.2, transparent: true, opacity: 0.45 }),
  };
}

// ---------------------------------------------------------------------------
// Status display: what the last inspection found, drawn like a 3-colour
// (black / white / red) e-paper panel. Needs a DOM canvas, so it only exists in
// the browser viewer; the GLB export falls back to plain text bars.
// ---------------------------------------------------------------------------
function statusTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 560;
  const g = c.getContext('2d');
  const ink = '#1f2224', red = '#b3261e', font = (w, px) => `${w} ${px}px "IBM Plex Sans", "Segoe UI", system-ui, sans-serif`;
  g.fillStyle = '#dcded6';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = ink;
  g.font = font(700, 46);
  g.fillText('Box 2 inspected · 10 frames', 36, 66);
  g.font = font(400, 30);
  g.fillText('today 11:40 · next visit Tue 11:00', 36, 110);
  g.fillRect(36, 134, 888, 3);
  const rows = [
    ['Queen', 'seen on frame 5', true],
    ['Eggs', 'on 4 frames', true],
    ['Brood', '6 frames · 72 % capped', true],
    ['Varroa', '1.2 % · up 0.4 in a week', false],
    ['Honey', '+1.8 kg / day · 38.4 kg', true],
    ['Inside', '34.6 °C · 62 % humidity', true],
  ];
  rows.forEach(([label, value, ok], i) => {
    const y = 196 + i * 62;
    g.fillStyle = ok ? ink : red;
    g.font = font(700, 36);
    g.fillText(label, 36, y);
    g.font = font(400, 36);
    g.fillText(value, 230, y);
    g.font = font(700, 36);
    g.fillText(ok ? '✓' : '!', 890, y);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------------------
// Builder helpers (geometry cache keeps the GLB small)
// ---------------------------------------------------------------------------
function helpers() {
  const geoCache = new Map();
  const cached = (key, make) => {
    if (!geoCache.has(key)) geoCache.set(key, make());
    return geoCache.get(key);
  };
  const place = (parent, geo, mat, x, y, z, part) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x * MM, y * MM, z * MM);
    m.castShadow = true;
    m.receiveShadow = true;
    if (part) m.userData.part = part;
    parent.add(m);
    return m;
  };
  const box = (parent, sx, sy, sz, mat, x = 0, y = 0, z = 0, part) =>
    place(parent, cached(`b${sx}|${sy}|${sz}`, () => new THREE.BoxGeometry(sx * MM, sy * MM, sz * MM)), mat, x, y, z, part);
  // Cylinder along an axis ('x' | 'y' | 'z')
  const cyl = (parent, r, len, mat, x = 0, y = 0, z = 0, axis = 'y', part, seg = 20) => {
    const m = place(parent, cached(`c${r}|${len}|${seg}`, () => new THREE.CylinderGeometry(r * MM, r * MM, len * MM, seg)), mat, x, y, z, part);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    if (axis === 'z') m.rotation.x = Math.PI / 2;
    return m;
  };
  const group = (parent, name, x = 0, y = 0, z = 0, part) => {
    const g = new THREE.Group();
    g.name = name;
    g.position.set(x * MM, y * MM, z * MM);
    if (part) g.userData.part = part;
    parent.add(g);
    return g;
  };
  return { box, cyl, group, place, cached };
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------
function buildHiveTower(options = {}) {
  const p = { ...DEFAULTS, ...options, box: { ...DEFAULTS.box, ...(options.box || {}) }, frame: { ...DEFAULTS.frame, ...(options.frame || {}) } };
  if (!options.stack && options.boxes) p.stack = Array.from({ length: options.boxes }, () => 'deep');
  const d = derive(p);
  const M = makeMaterials();
  const { box, cyl, group, place, cached } = helpers();
  const W = p.box.w, D = p.box.d, T = p.box.wall;
  const PX = p.post.x, PZ = p.post.z;
  const E = 22; // extrusion size

  const root = new THREE.Group();
  root.name = 'HiveTower';
  const nodes = { root };

  // ----- structure: plinth frame, posts, crown frame ------------------------
  const structure = group(root, 'structure');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    box(structure, E, d.crownTop - 40, E, M.alu, sx * PX, 40 + (d.crownTop - 40) / 2, sz * PZ, 'post');
  }
  const ring = (y, part) => {
    box(structure, 2 * PX + E, E, E, M.alu, 0, y, PZ, part);
    box(structure, 2 * PX + E, E, E, M.alu, 0, y, -PZ, part);
    box(structure, E, E, 2 * PZ - E, M.alu, PX, y, 0, part);
    box(structure, E, E, 2 * PZ - E, M.alu, -PX, y, 0, part);
  };
  ring(51, 'plinth');
  ring(p.plinth - 11, 'plinth');
  ring(d.postTop - 11, 'crown');
  ring(d.crownTop - 11, 'crown');
  // hive deck cross members + rubber pads
  for (const z of [-150, 150]) box(structure, 2 * PX, E, E, M.alu, 0, p.plinth - 11, z, 'plinth');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(structure, 40, 6, 40, M.rubber, sx * 200, p.plinth + 3, p.hiveZ + sz * 150, 'feet');
  // motor plate in the crown
  box(structure, 2 * PX + E, 6, 2 * PZ + E, M.alu, 0, d.postTop + 3, 0, 'crown');
  // levelling feet
  const feet = group(structure, 'feet');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    cyl(feet, 6, 30, M.steel, sx * PX, 25, sz * PZ, 'y', 'feet');
    cyl(feet, 22, 10, M.rubber, sx * PX, 5, sz * PZ, 'y', 'feet', 24);
  }

  // ----- hive stack --------------------------------------------------------
  const hive = group(root, 'hive', 0, 0, p.hiveZ);
  nodes.hive = hive;
  const boxMaterials = [];

  // bottom board / varroa sump
  const bb = group(hive, 'bottomBoard', 0, p.plinth, 0);
  const bbH = p.bottomBoard;
  const bbMat = M.woodBox[3].clone();
  boxMaterials.push(bbMat);
  box(bb, W, bbH, T, bbMat, 0, bbH / 2, -D / 2 + T / 2, 'bottomBoard');
  box(bb, T, bbH, D - 2 * T, bbMat, W / 2 - T / 2, bbH / 2, 0, 'bottomBoard');
  box(bb, T, bbH, D - 2 * T, bbMat, -W / 2 + T / 2, bbH / 2, 0, 'bottomBoard');
  box(bb, W, 12, D, bbMat, 0, 6, 0, 'bottomBoard');
  // front wall with a 300 × 15 entrance slot at the top
  box(bb, W, bbH - 15, T, bbMat, 0, (bbH - 15) / 2, D / 2 - T / 2, 'bottomBoard');
  for (const sx of [-1, 1]) box(bb, (W - ENTRANCE) / 2, 15, T, bbMat, sx * (W + ENTRANCE) / 4, bbH - 7.5, D / 2 - T / 2, 'bottomBoard');
  box(bb, W - 2 * T, 2, D - 2 * T, M.mesh, 0, bbH - 18, 0, 'bottomBoard');
  box(bb, W - 2 * T - 10, 3, D - 2 * T - 10, M.white, 0, 16, 0, 'bottomBoard');
  const vcam = group(bb, 'varroaCam', -W / 2 + T + 25, 60, -D / 2 + T + 25, 'varroaCam');
  box(vcam, 30, 30, 30, M.black, 0, 0, 0, 'varroaCam');
  cyl(vcam, 8, 6, M.ledWhite, 12, -6, 12, 'y', 'varroaCam');

  // Entrance Observer (vendored from entrance-observer/3d-model). In its
  // 'robot' context its porch is the entrance tunnel through the cabinet front,
  // its wall frame bolts to the cladding and its cable runs to a corner post.
  // Only the Observer itself is taken; it also builds its own ghost hive and cabinet.
  // It finds the hive front from the hive depth, so a deeper hive = our hive
  // shifted forward by hiveZ. Its frame sits 2 mm proud of the slats.
  const eo = buildObserver({
    context: 'robot', boxes: d.n,
    hive: { ...OBSERVER_DEFAULTS.hive, d: D + 2 * p.hiveZ },
    robot: { plinth: p.plinth, bottomBoard: p.bottomBoard, post: p.post, e: E, clad: CLAD + 2 },
  });
  const observer = group(root, 'entranceObserver');
  for (const g of [eo.nodes.observer, eo.nodes.fieldCables]) observer.add(g);
  // Its bees on the hive wall would sit inside our cabinet: keep only those outside.
  for (const b of eo.nodes.bees || []) {
    const wp = new THREE.Vector3();
    b.getWorldPosition(wp);
    if (wp.z * 1000 < PZ + 11 + CLAD) b.visible = false;
  }
  // Observer part names overlap ours (camera, frame, board…): namespace them.
  observer.traverse((o) => { if (o.userData.part && !o.userData.part.startsWith('eo:')) o.userData.part = `eo:${o.userData.part}`; });
  nodes.observer = observer;

  // bees on the landing board
  const bees = group(root, 'bees');
  const beeGeo = cached('bee', () => new THREE.SphereGeometry(1, 12, 8));
  const addBee = (x, y, z, rotY, flying = false) => {
    const b = group(bees, `bee_${bees.children.length}`, x, y, z, 'bee');
    b.rotation.y = rotY;
    const body = place(b, beeGeo, M.beeBody, 0, 0, 0, 'bee'); body.scale.set(4 * MM, 3.5 * MM, 7 * MM);
    const stripe = place(b, beeGeo, M.beeStripe, 0, 0.3, -2, 'bee'); stripe.scale.set(4.1 * MM, 3.6 * MM, 3 * MM);
    for (const s of [-1, 1]) {
      const wing = place(b, beeGeo, M.beeWing, s * 4, 3, 1, 'bee');
      wing.scale.set(4 * MM, 0.4 * MM, 6 * MM);
      wing.rotation.y = s * 0.4;
    }
    b.userData.flying = flying;
    return b;
  };
  const landingY = p.plinth + bbH - 15 - 4 + 4;
  addBee(-120, landingY + 140, PZ + 260, 2.8, true);
  addBee(90, landingY + 220, PZ + 420, -0.6, true);
  addBee(-10, landingY + 90, PZ + 180, 3.1, true);

  // one hive body (hollow walls + cleats + frames)
  const frameParts = (parent, name, fh, kind) => {
    const f = p.frame;
    const g = group(parent, name, 0, 0, 0, 'frame');
    box(g, f.topBar, 20, 25, M.topBar, 0, -10, 0, 'frame');
    for (const s of [-1, 1]) box(g, 10, fh - 30, 30, M.topBar, s * (f.width / 2 - 5), -20 - (fh - 30) / 2, 0, 'frame');
    box(g, f.width, 10, 20, M.topBar, 0, -fh + 5, 0, 'frame');
    box(g, f.width - 20, fh - 40, 22, M.comb, 0, -20 - (fh - 40) / 2, 0, 'comb');
    if (kind === 'super') {
      box(g, f.width - 24, fh - 48, 23, M.honey, 0, -20 - (fh - 40) / 2, 0, 'comb'); // capped honey
    } else {
      box(g, f.width - 24, 50, 23, M.honey, 0, -50, 0, 'comb');
      const brood = place(g, cached('brood', () => new THREE.CylinderGeometry(1, 1, 24 * MM, 32)), M.brood, 0, -fh / 2 - 20, 0, 'comb');
      brood.rotation.x = Math.PI / 2;
      brood.scale.set(135 * MM, 1, 85 * MM);
    }
    for (const s of [-1, 1]) {
      cyl(g, 2.5, 2.5, M.steel, s * f.pinX, 1.25, 0, 'y', 'pin', 12);
      cyl(g, 4.5, 2.5, M.steel, s * f.pinX, 3.75, 0, 'y', 'pin', 16);
    }
    box(g, 2, 18, 18, M.white, f.width / 2 + 1, -40, 0, 'tag');
    box(g, 2.2, 10, 10, M.black, f.width / 2 + 1, -40, 0, 'tag');
    return g;
  };

  const hiveBody = (parent, name, i, x, y, z) => {
    const H = d.boxH(i), kind = p.stack[i];
    const g = group(parent, name, x, y, z, 'box');
    const mat = M.woodBox[i % M.woodBox.length].clone();
    boxMaterials.push(mat);
    box(g, W, H, T, mat, 0, H / 2, D / 2 - T / 2, 'box');
    box(g, W, H, T, mat, 0, H / 2, -D / 2 + T / 2, 'box');
    box(g, T, H, D - 2 * T, mat, W / 2 - T / 2, H / 2, 0, 'box');
    box(g, T, H, D - 2 * T, mat, -W / 2 + T / 2, H / 2, 0, 'box');
    addCleats(g, p.cleatUnderside);
    const frames = [];
    d.frameZ.forEach((fz, fi) => {
      const fg = frameParts(g, `${name}_frame${fi}`, d.frameH(i), kind);
      fg.position.set(0, (H - 2) * MM, fz * MM);
      frames.push(fg);
    });
    return { g, frames };
  };
  const addCleats = (g, underside) => {
    for (const s of [-1, 1]) {
      box(g, 3, 30, 320, M.steel, s * (W / 2 + 1.5), underside + 15, 0, 'cleat');
      box(g, 30, 3, 320, M.steel, s * (W / 2 + 15), underside + 1.5, 0, 'cleat');
    }
  };

  // Boxes above the inspected box ride in the lifted group, pivoting at the
  // centre of the fork contact line so left/right peel shows up as a tilt.
  const pivotY = d.cleatY(d.k + 1);
  const lifted = group(hive, 'liftedStack', 0, pivotY, 0);
  nodes.lifted = lifted;
  const bodies = [];
  for (let i = 0; i < d.n; i++) {
    const y = d.boxBottom(i);
    const parent = i > d.k ? lifted : hive;
    const b = hiveBody(parent, `box${i}`, i, 0, i > d.k ? y - pivotY : y, 0);
    bodies.push(b);
  }
  const lidG = group(lifted, 'lid', 0, d.boxBottom(d.n) - pivotY, 0, 'lid');
  box(lidG, W, p.lid, D, M.lid, 0, p.lid / 2, 0, 'lid');
  addCleats(lidG, p.cleatUnderside);
  nodes.frames = bodies[d.k].frames;
  nodes.boxMaterials = boxMaterials;

  // ----- lead screws & motors (hang from the crown) -------------------------
  const drive = group(root, 'drives');
  const screwBottom = p.plinth + 20;
  const screwLen = d.postTop - screwBottom;
  for (const s of [-1, 1]) {
    // lift: TR12, z = -60 ; scan: TR10, z = +60
    for (const z of [-60, 60]) { // lift screw at -60, scan screw at +60, both TR16×4
      cyl(drive, 8, screwLen, M.steel, s * PX, screwBottom + screwLen / 2, z, 'y', 'leadScrew', 12);
      box(drive, 57, 76, 57, M.black, s * PX, d.postTop + 6 + 38, z, 'nema23');
      box(drive, 58, 10, 58, M.alu, s * PX, d.postTop + 6 + 76, z, 'nema23');
    }
  }

  // ----- lift beams --------------------------------------------------------
  const beamLen = 2 * PZ - E;
  const makeBeamBase = (g, s, yOff, part, screwZ) => {
    box(g, E, 44, beamLen, M.alu, s * 340, yOff, 0, part);
    for (const sz of [-1, 1]) box(g, 14, 50, 30, M.steel, s * 355, yOff, sz * PZ, part);
    box(g, 44, 30, 30, M.bronze, s * (PX - 1), yOff, screwZ, part);
  };
  nodes.liftBeams = {};
  nodes.forks = {};
  nodes.strobes = [];
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const g = group(root, `liftBeam${side}`, 0, d.liftPark, 0, 'liftBeam');
    makeBeamBase(g, s, -30, 'liftBeam', -60);
    const hz = p.hiveZ;
    cyl(g, 6, 380, M.steel, s * 305, -5, hz, 'z', 'fork');
    for (const z of [hz - 150, hz + 150]) {
      box(g, 26, 22, 22, M.alu, s * 318, -12, z, 'fork');
      box(g, 8, 8, 40, M.steel, s * 318, -26, z, 'loadcell');
    }
    box(g, 40, 22, 40, M.black, s * 318, -10, hz + 205, 'fork');
    const rc = group(g, `rimCam${side}`, s * 318, -30, hz - 205, 'rimCam');
    rc.rotation.z = s * 0.6;
    box(rc, 26, 20, 26, M.black, 0, 0, 0, 'rimCam');
    cyl(rc, 6, 4, M.glass, -s * 10, -8, 0, 'y', 'rimCam');
    // Frame camera: one per face, centred, looking straight at the comb at the
    // photo spot. The left beam carries the front camera, the right beam the
    // back one. While a box is open the lift beams stand still at rim + 425 mm
    // for any box, so the camera is always camRim above the open rim and the
    // scan beam can centre each frame on it, deep or shallow. The cameras hang
    // between box and cladding, so they never pass over the hive.
    {
      const cz = s < 0 ? p.photoZ + CAM_Z : p.photoZ - CAM_Z;
      box(g, 329, 12, 12, M.alu, s * 329 / 2, -30, cz, 'camera'); // arm from the beam
      cyl(g, 5, d.camDrop - 30, M.alu, 0, -(30 + d.camDrop) / 2, cz, 'y', 'camera', 12);
      const cam = group(g, `camera${cz > 0 ? 'Front' : 'Back'}`, 0, -d.camDrop, cz, 'camera');
      cam.rotation.y = cz > 0 ? Math.PI : 0; // lens faces the photo spot
      box(cam, 44, 34, 28, M.black, 0, 0, 0, 'camera');
      cyl(cam, 9, 8, M.glass, 0, 0, 18, 'z', 'camera');
      const ring = place(cam, cached('ledRing', () => new THREE.TorusGeometry(15 * MM, 2.5 * MM, 8, 24)), M.ledWhite, 0, 0, 19, 'strobe');
      // light frustum: square pyramid from the lens to the whole comb face
      const reach = CAM_Z - 18 - 11;
      const beamG = group(cam, `${cam.name}_light`, 0, 0, 18, 'strobe');
      const pyr = place(beamG, cached('pyr', () => {
        const c = new THREE.ConeGeometry(1, 1, 4, 1, true);
        c.rotateY(Math.PI / 4);
        c.rotateX(-Math.PI / 2);
        c.translate(0, 0, 0.5);
        return c;
      }), M.beam, 0, 0, 0, 'strobe');
      pyr.scale.set((215 / 0.7071) * MM, (150 / 0.7071) * MM, reach * MM);
      pyr.castShadow = false;
      pyr.receiveShadow = false;
      ring.name = `${cam.name}_strobe`;
      nodes.strobes.push(ring, beamG);
    }
    const forks = [];
    for (const z of [hz - 120, hz + 120]) {
      const pivot = group(g, `fork${side}_${z > hz ? 'F' : 'B'}`, s * 305, -5, z, 'fork');
      box(pivot, 10, 45, 20, M.yellow, 0, -22.5, 0, 'fork');
      forks.push(pivot);
    }
    nodes.liftBeams[side] = g;
    nodes.forks[side] = forks;
  }

  // ----- scan beams + shuttles --------------------------------------------
  nodes.scanBeams = {};
  nodes.shuttles = {};
  nodes.hooks = {};
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'L' : 'R';
    const g = group(root, `scanBeam${side}`, 0, d.scanPark, 0, 'scanBeam');
    makeBeamBase(g, s, 40, 'scanBeam', 60);
    box(g, 42, 42, 40, M.black, s * 340, 40 + 22 + 21, 250, 'belt');
    box(g, 3, 6, beamLen - 60, M.black, s * 328, 55, 0, 'belt');
    box(g, 4, 6, beamLen - 40, M.ledRed, s * 328, 22, 0, 'redLight');

    const sh = group(g, `shuttle${side}`, 0, 0, 0, 'shuttle');
    box(sh, 22, 60, 56, M.bronze, s * 318, 34, 0, 'shuttle');
    box(sh, 14, 14, 14, M.black, s * 312, 2, 22, 'shuttle'); // inductive sensor, in front of the hook
    // hook: pivot 18 mm above the plate, arm → leg → slotted plate
    const hk = group(sh, `hook${side}`, s * 300, 18, 0, 'hook');
    box(hk, 88, 4, 16, M.yellow, -s * 44, 0, 0, 'hook');
    box(hk, 4, 18, 16, M.yellow, -s * 88, -9, 0, 'hook');
    // H-plate: two back-to-back slots so it can push a frame either way
    box(hk, 22, 2.5, 4, M.yellow, -s * 99, -18, 0, 'hook');
    for (const px of [94.5, 105.5]) box(hk, 5, 2.5, 36, M.yellow, -s * px, -18, 0, 'hook');
    nodes.scanBeams[side] = g;
    nodes.shuttles[side] = sh;
    nodes.hooks[side] = hk;
  }

  // ----- crown electronics ---------------------------------------------------
  const elec = group(root, 'electronics', 0, d.postTop + 6, 0);
  box(elec, 100, 30, 79, M.pcbGreen, -180, 15, 180, 'jetson');
  box(elec, 60, 28, 60, M.black, -180, 44, 180, 'jetson');
  box(elec, 160, 20, 100, M.pcbBlue, -20, 10, 200, 'mcu');
  for (const x of [110, 150, 190, 230]) box(elec, 34, 75, 118, M.black, x, 37.5, 190, 'dm542');
  box(elec, 60, 30, 40, M.alu, -40, 15, -200, 'dcdc');
  box(elec, 60, 30, 40, M.alu, 40, 15, -200, 'dcdc');
  box(elec, 90, 18, 55, M.black, -170, 9, -200, 'modem');
  box(elec, 50, 12, 28, M.pcbGreen, 170, 6, -200, 'lora');
  box(elec, 70, 60, 70, M.black, 250, 30, -170, 'heater');
  nodes.electronics = elec;
  const base = group(root, 'plinthGear', 0, 60, 0);
  box(base, 215, 50, 115, M.alu, -150, 25, -100, 'psu');
  box(base, 260, 120, 170, M.pcbBlue, 150, 60, 50, 'battery');
  box(base, 100, 30, 80, M.pcbGreen, -180, 15, 150, 'poe');

  // ----- cladding, crown shell, roof --------------------------------------
  const clad = group(root, 'cladding');
  nodes.cladding = clad;
  const OX = PX + 11, OZ = PZ + 11; // outer skeleton faces
  const top = d.postTop;
  const bodyH = top - p.plinth;
  const cy = p.plinth + bodyH / 2;
  const slatW = 68, slatGap = 6;
  // side & back walls: backer + vertical slats
  const slatRun = (width, fn) => {
    const count = Math.floor((width + slatGap) / (slatW + slatGap));
    const used = count * slatW + (count - 1) * slatGap;
    for (let i = 0; i < count; i++) fn(-used / 2 + slatW / 2 + i * (slatW + slatGap), i);
  };
  for (const s of [-1, 1]) {
    box(clad, 8, bodyH, 2 * OZ, M.backer, s * (OX + 4), cy, 0, 'cladding');
    slatRun(2 * OZ + 30, (z, i) => box(clad, 18, bodyH, slatW, i % 2 ? M.slatAlt : M.slat, s * (OX + 17), cy, z, 'cladding'));
  }
  // Front: plain wall. The Entrance Observer porch passes through an opening
  // above the plinth, and its wall frame is bolted over the slats.
  const porchHalf = 166, porchBot = p.plinth + bbH - 22, porchTop = p.plinth + bbH + 10;
  box(clad, 2 * OX + 16, top - porchTop, 8, M.backer, 0, (top + porchTop) / 2, OZ + 4, 'cladding');
  box(clad, 2 * OX + 16, porchBot - p.plinth, 8, M.backer, 0, (porchBot + p.plinth) / 2, OZ + 4, 'cladding');
  for (const sx of [-1, 1]) box(clad, OX + 8 - porchHalf, porchTop - porchBot, 8, M.backer, sx * (OX + 8 + porchHalf) / 2, (porchTop + porchBot) / 2, OZ + 4, 'cladding');
  slatRun(2 * OX + 52, (x, i) => {
    const mat = i % 2 ? M.slatAlt : M.slat;
    const cut = Math.abs(x) - slatW / 2 < porchHalf;
    for (const [a, b] of cut ? [[p.plinth, porchBot], [porchTop, top]] : [[p.plinth, top]]) box(clad, slatW, b - a, 18, mat, x, (a + b) / 2, OZ + 17, 'cladding');
  });
  // Back: a fixed stile with the emergency stop, and a full-height service door
  // hinged on the far edge, away from the bees' flight path. The door carries a
  // wide viewing window at the height where frames are photographed and a
  // status display. nodes.door swings open about its hinge (viewer toggle).
  const HX = OX + 8, BZ = OZ + 26, STILE = -333; // hinge x, back face, stile edge
  box(clad, STILE + HX, bodyH, 8, M.backer, (STILE - HX) / 2, cy, -(OZ + 4), 'cladding');
  const door = group(clad, 'serviceDoor', HX, 0, -BZ, 'door');
  nodes.door = door;
  const dbox = (sx, sy, sz, mat, x, y, z, part) => box(door, sx, sy, sz, mat, x - HX, y, z + BZ, part);
  dbox(HX - STILE, bodyH, 8, M.backer, (HX + STILE) / 2, cy, -(OZ + 4), 'door');
  const win = { x0: -271, x1: 329, y0: 880, y1: 1260 }; // 600 × 380 mm
  slatRun(2 * OX + 52, (x, i) => {
    const mat = i % 2 ? M.slatAlt : M.slat;
    if (x < STILE) { box(clad, slatW, bodyH, 18, mat, x, cy, -(OZ + 17), 'cladding'); return; }
    const crossesWin = x + slatW / 2 > win.x0 && x - slatW / 2 < win.x1;
    const segs = crossesWin ? [[p.plinth, win.y0], [win.y1, top]] : [[p.plinth, top]];
    for (const [a, b] of segs) dbox(slatW, b - a, 18, mat, x, (a + b) / 2, -(OZ + 17), 'door');
  });
  const winW = win.x1 - win.x0, winH = win.y1 - win.y0, winX = (win.x0 + win.x1) / 2;
  dbox(winW + 20, winH + 20, 6, M.glass, winX, (win.y0 + win.y1) / 2, -(OZ + 22), 'window');
  for (const y of [win.y0 - 6, win.y1 + 6]) dbox(winW + 24, 12, 26, M.bronze, winX, y, -(OZ + 17), 'window');
  for (const x of [win.x0 - 6, win.x1 + 6]) dbox(12, winH + 24, 26, M.bronze, x, (win.y0 + win.y1) / 2, -(OZ + 17), 'window');
  dbox(16, 220, 22, M.bronze, STILE + 40, 1150, -(OZ + 34), 'door'); // handle
  for (const y of [420, 1050, 1640]) cyl(door, 7, 90, M.steel, 0, y, 0, 'y', 'door', 12); // hinges
  // status display: e-paper screen in a graphite bezel, light bar under it
  const dispY = 1420;
  dbox(270, 176, 10, M.black, winX, dispY, -(OZ + 31), 'status');
  const tex = statusTexture();
  if (tex) {
    const screen = dbox(240, 140, 2, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), winX, dispY + 8, -(OZ + 37), 'status');
    screen.rotation.y = Math.PI; // faces out of the back
  } else {
    dbox(240, 140, 2, M.epaper, winX, dispY + 8, -(OZ + 37), 'status');
    for (const [w, y] of [[140, 52], [200, 30], [170, 12], [110, -6], [180, -24], [130, -42]]) dbox(w, 7, 1, M.epaperInk, winX + 110 - w / 2 - 10, dispY + y, -(OZ + 38.5), 'status');
  }
  nodes.status = dbox(220, 6, 3, M.ledYellow, winX, dispY - 76, -(OZ + 37), 'status');
  // emergency stop on the fixed stile, next to the handle: reachable without
  // opening anything (opening the door already stops the motors)
  box(clad, 58, 90, 16, M.yellow, (STILE - HX) / 2, 1260, -(BZ + 8), 'estop');
  cyl(clad, 21, 22, M.red, (STILE - HX) / 2, 1260, -(BZ + 26), 'z', 'estop', 24);
  // plinth skirt (charred wood)
  for (const s of [-1, 1]) {
    box(clad, 20, p.plinth - 30, 2 * OZ + 40, M.charred, s * (OX + 17), 30 + (p.plinth - 30) / 2, 0, 'plinthClad');
    box(clad, 2 * OX + 54, p.plinth - 30, 20, M.charred, 0, 30 + (p.plinth - 30) / 2, s * (OZ + 17), 'plinthClad');
  }
  // crown shell with hex vent band
  const crownH = p.crown;
  const ccy = top + crownH / 2;
  for (const s of [-1, 1]) {
    box(clad, 20, crownH, 2 * OZ + 40, M.bronze, s * (OX + 17), ccy, 0, 'crown');
    box(clad, 2 * OX + 54, crownH, 20, M.bronze, 0, ccy, s * (OZ + 17), 'crown');
  }
  const hexGeo = cached('hex', () => new THREE.CylinderGeometry(14 * MM, 14 * MM, 4 * MM, 6));
  for (let i = -9; i <= 9; i++) for (let r = 0; r < 2; r++) {
    const x = i * 38 + (r ? 19 : 0);
    if (Math.abs(x) > OX - 10) continue;
    const hx = place(clad, hexGeo, M.backer, x, ccy + (r ? -16 : 16), OZ + 27.5, 'vent');
    hx.rotation.x = Math.PI / 2;
    hx.rotation.y = Math.PI / 6;
  }
  // mono-pitch roof sloping down to the front (south)
  const roof = group(clad, 'roof', 0, d.crownTop + 20, 0, 'roof');
  roof.rotation.x = 0.1;
  box(roof, 2 * OX + 120, 30, 2 * OZ + 150, M.charred, 0, 0, 0, 'roof');
  box(roof, 2 * OX + 40, 36, 2 * OZ + 60, M.alu, 0, 30, 0, 'solar');
  box(roof, 2 * OX + 24, 38, 2 * OZ + 44, M.solar, 0, 31, 0, 'solar');
  for (let i = 1; i < 6; i++) box(roof, 2, 39, 2 * OZ + 44, M.alu, -OX - 12 + (i * (2 * OX + 24)) / 6, 31, 0, 'solar');
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(220, 0);
  finShape.quadraticCurveTo(60, 20, 0, 120);
  finShape.lineTo(0, 0);
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 26, bevelEnabled: true, bevelSize: 4, bevelThickness: 4, bevelSegments: 2 });
  finGeo.scale(MM, MM, MM);
  finGeo.translate(0, 0, -13 * MM);
  const fin = place(roof, finGeo, M.fin, 0, 48, -OZ - 40, 'antenna');
  fin.rotation.y = -Math.PI / 2;

  nodes.bees = bees;

  // ----- animation --------------------------------------------------------
  const timeline = buildTimeline(p, d);
  const applyState = (st) => {
    for (const s of [-1, 1]) {
      const side = s < 0 ? 'L' : 'R';
      nodes.liftBeams[side].position.y = st[`lift${side}`] * MM;
      for (const f of nodes.forks[side]) f.rotation.z = -s * (Math.PI / 2) * st[`fork${side}`];
      nodes.scanBeams[side].position.y = st.scan * MM;
      nodes.shuttles[side].position.z = st.shuttle * MM;
      nodes.hooks[side].rotation.z = -s * (Math.PI / 2) * (1 - st.hook);
    }
    const cleat = d.cleatY(d.k + 1);
    const dL = st.forkL > 0.98 ? Math.max(0, st.liftL - cleat) : 0;
    const dR = st.forkR > 0.98 ? Math.max(0, st.liftR - cleat) : 0;
    lifted.position.y = (cleat + (dL + dR) / 2) * MM;
    lifted.rotation.z = Math.atan2(dR - dL, 2 * (W / 2 + 15));
    nodes.frames.forEach((fg, i) => {
      fg.position.z = st[`f${i}z`] * MM;
      fg.position.y = (d.boxH(d.k) - 2 + st[`f${i}y`]) * MM;
    });
    const on = st.strobe > 0.5 ? 1 : 1e-4;
    for (const m of nodes.strobes) m.scale.setScalar(on);
    return st;
  };
  const animated = [
    ...Object.values(nodes.liftBeams), ...Object.values(nodes.forks).flat(),
    ...Object.values(nodes.scanBeams), ...Object.values(nodes.shuttles), ...Object.values(nodes.hooks),
    lifted, ...nodes.frames, ...nodes.strobes,
  ];
  applyState(timeline.stateAt(0));

  return { root, nodes, params: p, derived: d, timeline, applyState, animated, MM };
}

// ---------------------------------------------------------------------------
// Inspection sequence as a timeline of tweens.
// Durations are compressed for the preview; `real` is the estimated
// real-world time at the planned speeds.
// ---------------------------------------------------------------------------
function buildTimeline(p, d) {
  const INSTANT = new Set(['strobe']);
  const state = {
    liftL: d.liftPark, liftR: d.liftPark, forkL: 0, forkR: 0,
    scan: d.scanPark, shuttle: 0, hook: 0, strobe: 0,
  };
  d.frameZ.forEach((z, i) => { state[`f${i}z`] = z; state[`f${i}y`] = 0; });
  const initial = { ...state };
  const segments = [];
  const steps = [];
  let t = 0;
  let current = null; // index of the frame on the hook
  const SLOT_APPROACH = 26, SLOT_ENGAGED = 8; // gap is at -Z, so push toward -Z

  const tween = (dur, to) => {
    if (current !== null) {
      if ('shuttle' in to) to[`f${current}z`] = to.shuttle - SLOT_ENGAGED - d.hiveZ;
      if ('scan' in to) to[`f${current}y`] = to.scan - d.engage;
    }
    const from = { ...state };
    Object.assign(state, to);
    segments.push({ t0: t, t1: t + dur, from, to: { ...state } });
    t += dur;
  };
  const step = (label, real, detail, fn) => {
    const start = t;
    fn();
    steps.push({ label, real, detail, t0: start, t1: t });
  };
  const hold = (dur) => tween(dur, {});

  const cleat = d.cleatY(d.k + 1);
  const box = d.k + 1;
  const up = cleat + p.gap;
  const approach = d.engage + 25;

  step('Idle', 'most of the week', 'Supervisor MCU logs temperature, humidity and weight. The Jetson is powered off.', () => hold(1.2));
  step('Pre-flight check', '~1 min', 'Outside ≥ 15 °C, no rain, wind < 8 m/s, 10:00–16:00, last visit > 7 days ago. On a cool day the cabinet is pre-warmed to 25 °C first. Red work light on.', () => hold(1.2));
  step(`Forks to seam above box ${box}`, '~40 s', 'Both lift beams climb to 5 mm below the cleats of the box above the target box.', () => tween(2.2, { liftL: cleat - 5, liftR: cleat - 5 }));
  step('Forks swing in', '2 s', 'Servos turn the fork shafts 90° under the cleats.', () => tween(0.9, { forkL: 1, forkR: 1 }));
  step('Peel: left edge first', '~5 s', 'The left side rises 6 mm while the right side acts as a hinge. Propolis cracks along one edge at a fraction of the force.', () => tween(1.3, { liftL: cleat + 6 }));
  step('Peel: right edge', '~5 s', 'The right side follows. The load cells confirm the stack has come free before the full lift.', () => tween(1.3, { liftR: cleat + 6 }));
  step(`Lift upper stack ${p.gap} mm`, '~30 s', 'Lifts at 15 mm/s, starting slowly. Bees that fall drop straight back into the open box below.', () => tween(2.6, { liftL: up, liftR: up }));
  step('Scan beams to the rim', '~20 s', 'The shuttles pass over the top bars. Inductive sensors find the steel pins and the working gap.', () => tween(2.0, { scan: approach, shuttle: state.f0z + d.hiveZ + SLOT_APPROACH }));

  const pickFrame = (i, fast) => {
    const s = fast ? 0.55 : 1;
    const z0 = state[`f${i}z`];
    const target = z0 - d.gapWidth;
    tween(0.7 * s, { hook: 1 });
    tween(0.7 * s, { scan: d.engage });
    const hz = d.hiveZ;
    tween(0.5 * s, { shuttle: z0 + hz + SLOT_ENGAGED });
    current = i;
    tween(0.7 * s, { shuttle: z0 + hz + SLOT_ENGAGED - 10 });
    tween(0.3 * s, { scan: d.engage + 3 });
    tween(2.4 * s, { scan: d.engage + d.frameLift }); // comb centre level with the cameras
    tween(0.9 * s, { shuttle: d.photoZ + SLOT_ENGAGED }); // photo spot: frame centred between the cameras
    for (let k = 0; k < 3; k++) { tween(0.12, { strobe: 1 }); tween(0.25, { strobe: 0 }); }
    tween(0.9 * s, { shuttle: target + hz + SLOT_ENGAGED });
    tween(2.2 * s, { scan: d.engage + 30 });
    tween(0.9 * s, { scan: d.engage });
    current = null;
    tween(0.5 * s, { shuttle: target + hz + SLOT_APPROACH });
    tween(0.6 * s, { scan: approach });
    tween(0.5 * s, { hook: 0 });
  };
  step('Frame 1: hook, nudge, lift', '~45 s', 'The hook swings in, its H-shaped plate slides around the pin neck and nudges the frame 10 mm into the gap to break burr comb. A 2 mm peel breaks the ear propolis, then the frame rises until its comb centre is level with the cameras (about 300 mm for a deep frame, 245 mm for a super), always vertical, and moves to the photo spot. The two cameras shoot both faces straight on.', () => pickFrame(0, false));
  steps[steps.length - 1].captureNote = true;
  step('Frames 2–3', '~45 s each', 'Each frame is lowered into the gap left by the previous one, like a beekeeper working through a box. The last 20 mm go down at 3 mm/s.', () => { tween(0.8, { shuttle: state.f1z + d.hiveZ + SLOT_APPROACH }); pickFrame(1, true); tween(0.8, { shuttle: state.f2z + d.hiveZ + SLOT_APPROACH }); pickFrame(2, true); });
  step('…remaining frames', '≈10 min / box', 'The preview skips frames 4–10. In simulation the box stays open about 10 minutes; the rest of the stack stays closed.', () => hold(1.0));
  step('Scan beams park', '~20 s', 'Hooks fold up and the shuttles go back to the middle.', () => tween(1.8, { hook: 0, scan: d.scanPark, shuttle: 0 }));
  step('Rim check', '~10 s', 'The stack stops 30 mm above the box. A camera checks the contact edges for bees; if any are found, the robot waits and retries.', () => tween(2.2, { liftL: cleat + 30, liftR: cleat + 30 }));
  step('Rolling close', '~20 s', 'The left edge lands first at 2 mm/s, then the right. Contact moves across the rim so bees are pushed aside, not crushed.', () => { tween(1.4, { liftL: cleat - 5 }); tween(1.4, { liftR: cleat - 5 }); });
  step('Park & upload', '~1 min', 'Forks fold, beams park, red light off. Photos go to the Gratheon web app over Wi-Fi or LTE, and are stored locally too.', () => { tween(0.8, { forkL: 0, forkR: 0 }); tween(2.0, { liftL: d.liftPark, liftR: d.liftPark }); });
  // hidden reset so the loop is seamless (frames are inside the closed box)
  const reset = {};
  d.frameZ.forEach((z, i) => { reset[`f${i}z`] = z; reset[`f${i}y`] = 0; });
  tween(0.3, reset);

  const duration = t;
  const ease = (x) => x * x * (3 - 2 * x);
  const stateAt = (time) => {
    const tt = Math.max(0, Math.min(duration, time));
    let seg = segments[segments.length - 1];
    for (const s of segments) if (tt <= s.t1) { seg = s; break; }
    const span = seg.t1 - seg.t0;
    const u = span > 0 ? (tt - seg.t0) / span : 1;
    const e = ease(u);
    const out = {};
    for (const key of Object.keys(seg.to)) {
      const a = seg.from[key] ?? initial[key];
      const b = seg.to[key];
      out[key] = INSTANT.has(key) ? (u > 0 ? b : a) : a + (b - a) * e;
    }
    return out;
  };
  return { steps, duration, stateAt, initial };
}

      return { DEFAULTS, PARTS, derive, buildHiveTower, buildTimeline, MM };
    })();

    return {
      Qu: HIVE.buildHiveTower,   // 教学页实际用的蜂箱装配
      Ju: buildObserver,        // Entrance Observer 子装配（Qu 内部调用）
      Vc: HIVE.DEFAULTS,        // HiveTower 默认参数（mm）
      kc: OBSERVER_DEFAULTS,    // Observer 默认参数（mm）
      MM: HIVE.MM,              // mm → m，0.001
      derived: HIVE.derive,     // 由参数推导尺寸
      buildTimeline: HIVE.buildTimeline,
      PARTS: HIVE.PARTS,
      observerParts: OBS.PARTS,
    };
  }

  global.LabHive = Object.freeze({ createFactory });
})(window);
