/* ==========================================================================
 * face.js —— 面捕 + 手势（MediaPipe Tasks Vision，全部走本地 lib/mediapipe）
 * 对外只暴露 window.L2DFace.Engine：
 *   摄像头 → 人脸关键点/表情系数 → 换算成 VTS 风格的输入值（FaceAngleX/Y/Z、
 *   EyeOpenLeft/Right、EyeRightX/Y、MouthOpen、MouthSmile、Brows），
 *   交给 app.js 里那套参数映射表用（等价于 VTS 的面捕版配置）。
 * ========================================================================== */
(function () {
  'use strict';

  const BASE = (window.L2D_EMBED && window.L2D_EMBED.base) || '';
  const WASM_DIR = BASE + 'lib/mediapipe/wasm';
  const FACE_MODEL = BASE + 'lib/mediapipe/models/face_landmarker.task';
  const GESTURE_MODEL = BASE + 'lib/mediapipe/models/gesture_recognizer.task';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  /**
   * 加载 MediaPipe。
   * 注意：不用 import(ESM)，改成注入普通 <script>：
   *   1) .mjs 在部分静态服务器（python http.server 等）会返回 application/octet-stream，
   *      浏览器会直接拒绝加载模块，报 “Failed to fetch dynamically imported module”；
   *   2) 普通脚本没有这个问题，file:// 打开时也能加载。
   */
  let visionPromise = null;
  function loadVision() {
    if (window.MediaPipeVision) return Promise.resolve(window.MediaPipeVision);
    if (!visionPromise) {
      visionPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = BASE + 'lib/mediapipe/vision_bundle.js';
        s.async = true;
        s.onload = () => {
          if (window.MediaPipeVision) resolve(window.MediaPipeVision);
          else reject(new Error('vision_bundle.js 已加载但没挂上 window.MediaPipeVision'));
        };
        s.onerror = () => reject(new Error('拿不到 lib/mediapipe/vision_bundle.js'));
        document.head.appendChild(s);
      }).catch(err => {
        visionPromise = null;      // 允许重试
        throw err;
      });
    }
    return visionPromise;
  }

  /** 模型创建：优先 GPU，失败自动退回 CPU（老显卡 / 无 WebGL2 时也能跑） */
  async function createWithFallback(TaskClass, fileset, options) {
    try {
      return await TaskClass.createFromOptions(fileset, options);
    } catch (e) {
      const fallback = JSON.parse(JSON.stringify(options));
      fallback.baseOptions.delegate = 'CPU';
      return await TaskClass.createFromOptions(fileset, fallback);
    }
  }

  /* ---- 人脸关键点索引（MediaPipe FaceMesh 478 点约定） ---- */
  const P = {
    nose: 1, chin: 152,
    lOut: 33, lIn: 133, lTop: 159, lBot: 145, irisL: 468,
    rOut: 263, rIn: 362, rTop: 386, rBot: 374, irisR: 473,
  };

  const median = (list) => {
    if (!list.length) return 0;
    const a = list.slice().sort((x, y) => x - y);
    return a[Math.floor(a.length / 2)];
  };

  class Engine {
    constructor() {
      this.video = null;
      this.stream = null;
      this.faceLm = null;
      this.gestureLm = null;
      this.running = false;
      this.faceOn = false;
      this.gestureOn = false;

      this.out = {};            // VTS 风格输入（面捕）
      this.detected = false;    // 是否检测到人脸
      this.gesture = '';        // 当前手势名（None / Victory / ...）
      this.onGesture = null;    // 手势回调 (name) => void
      this.onState = null;      // 状态变化回调 (state) => void

      this.opts = { headGain: 1, mouthGain: 1.2, smooth: 55 };

      this._calib = null;       // 中性基线（自动采样）
      this._samples = [];
      this.gestureGap = 400;    // 同一手势的最小触发间隔（防抖）
      this.gestureScore = 0.55; // 识别置信度低于它的不认（避免手一晃就被当成手势）
      this._lastGestureFire = 0;
      this._raf = 0;
      this._lastFace = 0;
      this._lastGesture = 0;
      this._lastGestureName = '';
    }

    attach(videoEl) { this.video = videoEl; }

    /** 摄像头列表（用于下拉选择） */
    async listCams() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
      const list = await navigator.mediaDevices.enumerateDevices();
      return list.filter(d => d.kind === 'videoinput').map((d, i) => ({
        id: d.deviceId, label: d.label || ('摄像头 ' + (i + 1)),
      }));
    }

    /** 重新采样中性姿势（正对摄像头 1 秒） */
    recalibrate() {
      this._calib = null;
      this._samples = [];
      this._state('正在校准，请正对摄像头…');
    }

    _state(msg) {
      if (msg === this._lastMsg) return;      // 别每帧都刷 UI
      this._lastMsg = msg;
      if (this.onState) this.onState(msg);
    }

    /** 开启摄像头；face / gesture 各自独立开关 */
    async start(deviceId, wantFace, wantGesture) {
      if (location.protocol === 'file:') {
        throw new Error('必须用 http:// 打开：请运行 start.bat（或 node server.js），不要双击 index.html');
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('这个浏览器不支持摄像头（需要 https 或 localhost）');
      }
      this.faceOn = !!wantFace;
      this.gestureOn = !!wantGesture;

      const video = {
        width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 },
      };
      if (deviceId) video.deviceId = { exact: deviceId };

      if (!this.stream) {
        this._state('正在请求摄像头权限…');
        this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        this.video.srcObject = this.stream;
        this.video.muted = true;
        await this.video.play().catch(() => {});
      }

      const vision = await loadVision();
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_DIR);

      if (this.faceOn && !this.faceLm) {
        this._state('正在加载人脸模型…');
        this.faceLm = await createWithFallback(vision.FaceLandmarker, fileset, {
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          baseOptions: { modelAssetPath: FACE_MODEL, delegate: 'GPU' },
        });
        this._calib = null;
        this._samples = [];
      }
      if (this.gestureOn && !this.gestureLm) {
        this._state('正在加载手势模型…');
        this.gestureLm = await createWithFallback(vision.GestureRecognizer, fileset, {
          runningMode: 'VIDEO',
          numHands: 1,
          baseOptions: { modelAssetPath: GESTURE_MODEL, delegate: 'GPU' },
        });
      }

      if (!this.running) {
        this.running = true;
        this._loop();
      }
      this._state(this.faceOn ? '运行中' : '手势已开启');
    }

    stop() {
      this.running = false;
      this.faceOn = false;
      this.gestureOn = false;
      if (this._raf) cancelAnimationFrame(this._raf);
      this._raf = 0;
      if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
      }
      if (this.video) this.video.srcObject = null;
      this.detected = false;
      this.gesture = '';
      this.out = {};
      this._state('未开启');
    }

    /* ---------------- 主循环：人脸 ~30fps，手势 ~6fps ---------------- */
    _loop() {
      if (!this.running) return;
      this._raf = requestAnimationFrame(() => this._loop());

      const v = this.video;
      if (!v || v.readyState < 2 || !v.videoWidth) return;
      const now = performance.now();

      if (this.faceOn && this.faceLm && now - this._lastFace > 33) {
        this._lastFace = now;
        try { this._stepFace(this.faceLm.detectForVideo(v, now)); }
        catch (e) { /* 单帧失败忽略 */ }
      }
      if (this.gestureOn && this.gestureLm && now - this._lastGesture > 160) {
        this._lastGesture = now;
        try { this._stepGesture(this.gestureLm.recognizeForVideo(v, now)); }
        catch (e) { /* 忽略 */ }
      }
    }

    /* ---------------- 人脸 → 输入值 ---------------- */
    _stepFace(res) {
      const lm = (res.faceLandmarks && res.faceLandmarks[0]) || null;
      const cat = (res.faceBlendshapes && res.faceBlendshapes[0] &&
        res.faceBlendshapes[0].categories) || null;
      if (!lm || !cat) {
        this.detected = false;
        this._state('未检测到人脸');
        return;
      }
      this.detected = true;

      const W = this.video.videoWidth, H = this.video.videoHeight;
      const px = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
      const shape = {};
      for (const c of cat) shape[c.categoryName] = c.score;
      const bl = (n) => shape[n] || 0;

      /* ---- 头姿：用关键点几何算，避免不同库的矩阵约定差异 ---- */
      const lOut = px(P.lOut), rOut = px(P.rOut), nose = px(P.nose), chin = px(P.chin);
      const eyeMidY = (lOut.y + rOut.y) / 2;
      const eyeDx = (rOut.x - lOut.x) || 1;
      const roll = Math.atan2(rOut.y - lOut.y, eyeDx) * 180 / Math.PI;   // 向右歪为正
      const dL = nose.x - lOut.x, dR = rOut.x - nose.x;
      const yaw = ((dL - dR) / ((dL + dR) || 1)) * 55;                  // 脸朝图像右侧为正
      const faceLen = Math.max(1, chin.y - eyeMidY);
      const noseRel = (nose.y - eyeMidY) / faceLen;                     // 越大越低头

      /* ---- 嘴型系数：笑 = 嘴角上扬 + 酒窝，撇嘴 = 嘴角下垂 ----
       * MediaPipe 给的单值偏小（一般 0.1~0.5），所以后面要减基线再放大。 */
      const smileRaw = (bl('mouthSmileLeft') + bl('mouthSmileRight')) / 2
        + (bl('mouthDimpleLeft') + bl('mouthDimpleRight')) / 4
        - (bl('mouthFrownLeft') + bl('mouthFrownRight')) / 2;

      /* ---- 自动校准：开头约 20 帧当作“正对镜头”的中性姿势（含中性嘴型） ---- */
      if (!this._calib) {
        this._samples.push({ yaw, roll, noseRel, smile: smileRaw });
        if (this._samples.length >= 20) {
          this._calib = {
            yaw: median(this._samples.map(s => s.yaw)),
            roll: median(this._samples.map(s => s.roll)),
            noseRel: median(this._samples.map(s => s.noseRel)),
            smile: median(this._samples.map(s => s.smile)),
          };
          this._state('运行中');
        } else {
          this._state('正在校准，请正对摄像头…');
          return;                                   // 校准期间先不动
        }
      }
      const c = this._calib;
      const g = this.opts.headGain;
      // 镜像体验：图像里脸朝右 = 你朝左转头
      const faceX = -(yaw - c.yaw) * g;
      const faceY = -(noseRel - c.noseRel) * 150 * g;      // 抬头为正
      const faceZ = -(roll - c.roll) * g;

      /* ---- 眼睛 / 嘴 / 眉 ---- */
      const eyeL = 1 - clamp(bl('eyeBlinkLeft'), 0, 1);
      const eyeR = 1 - clamp(bl('eyeBlinkRight'), 0, 1);

      const mouthGain = this.opts.mouthGain;
      const mouthOpen = clamp(bl('jawOpen') * mouthGain, 0, 1);

      /* 减去中性基线后放大（0.5 = 不笑不哭，映射表里对应 ParamMouthForm = 0） */
      const mouthSmile = clamp(0.5 + (smileRaw - c.smile) * 1.8 * mouthGain, 0, 1);

      const browUp = (bl('browInnerUp') + bl('browOuterUpLeft') + bl('browOuterUpRight')) / 3;
      const browDown = (bl('browDownLeft') + bl('browDownRight')) / 2;
      const brow = clamp(0.5 + (browUp - browDown) * 0.7, 0, 1);

      this.mouth = { smile: mouthSmile, open: mouthOpen };   // 给界面显示用

      /* ---- 眼球（右眼虹膜相对眼眶中心） ---- */
      const rIn = px(P.rIn), rTop = px(P.rTop), rBot = px(P.rBot), iris = px(P.irisR);
      const cx = (rIn.x + rOut.x) / 2, cy = (rTop.y + rBot.y) / 2;
      const hw = Math.max(1, Math.abs(rOut.x - rIn.x) / 2);
      const hh = Math.max(1, Math.abs(rBot.y - rTop.y) / 2);
      const ebX = clamp((iris.x - cx) / hw, -1, 1);
      const ebY = clamp(-(iris.y - cy) / hh, -1, 1);

      const target = {
        FaceAngleX: faceX,
        FaceAngleY: faceY,
        FaceAngleZ: faceZ,
        EyeOpenLeft: eyeL,
        EyeOpenRight: eyeR,
        EyeRightX: -ebX,                 // 镜像
        EyeRightY: ebY,                  // 向上为正
        MouthOpen: mouthOpen,
        MouthSmile: mouthSmile,          // 0.5 = 不笑不哭
        Brows: brow,
      };

      const a = clamp(1 - this.opts.smooth / 100, 0.05, 1);
      for (const k in target) {
        const cur = this.out[k];
        this.out[k] = (cur === undefined) ? target[k] : cur + (target[k] - cur) * a;
      }
    }

    /* ---------------- 手势 ---------------- */
    _stepGesture(res) {
      const g = (res.gestures && res.gestures[0] && res.gestures[0][0]) || null;
      const name = (g && g.categoryName) || 'None';
      this.gesture = name;
      if (name === 'None') { this._lastGestureName = ''; return; }
      if (name === this._lastGestureName) return;         // 一直保持着这个手势 -> 只算一次
      if ((g.score || 0) < this.gestureScore) return;     // 没看清（识别在抖）-> 先不算，等看清了再触发
      this._lastGestureName = name;

      // 防抖：识别偶尔会在「握拳 / 没握拳」之间跳一下，
      // 间隔太短就忽略这次，免得手抖着连敲十几下（默认 400ms，手放下再比不受影响）
      const now = performance.now();
      if (now - this._lastGestureFire < this.gestureGap) return;
      this._lastGestureFire = now;
      if (this.onGesture) this.onGesture(name);
    }
  }

  /* 手势中文名
   * 注意：☝(U+261D) 和 ✌(U+270C) 的默认展示是「文字符号」，会被渲染成单色，
   * 后面要跟一个变体选择符 U+FE0F 才会走彩色 emoji 字体。 */
  const GESTURE_LABEL = {
    None: '无',
    Closed_Fist: '握拳 ✊',
    Open_Palm: '张开手掌 ✋',
    Pointing_Up: '食指向上 ☝️',
    Thumb_Down: '拇指向下 👎',
    Thumb_Up: '拇指向上 👍',
    Victory: '剪刀手 ✌️',
    ILoveYou: '爱你 🤟',
  };

  window.L2DFace = { Engine, GESTURE_LABEL, GESTURES: Object.keys(GESTURE_LABEL) };
})();
