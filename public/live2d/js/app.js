/* ==========================================================================
 * app.js —— 浏览器版入口
 *  pixi.js + pixi-live2d-display(Cubism4) 渲染 Live2D 模型，
 *  并把 VTube Studio 的那套“鼠标 / 面捕 + 表情热键 + 动作热键”行为搬过来。
 *
 *  面板：横向标签（表情 / 装饰 / 道具 / 动作 / 设置）+ 药丸按钮 + 状态条
 *  跟踪方式：鼠标 / 面捕（摄像头）/ 关闭，可随时切换
 * ========================================================================== */
(function () {
  'use strict';

  /* 挂件模式：宿主（博客）设置 window.L2D_EMBED = { mode: 'widget' } 时启用
   *   - 模型固定在右下角小舞台里，舞台不吃鼠标（页面照常滚动/右键）
   *   - 面板默认收起成一条小标题栏，贴在模型上方
   *   - 不拦截右键菜单、不响应 H/F 键，避免和博客本身冲突 */
  const EMBED = (window.L2D_EMBED && window.L2D_EMBED.mode === 'widget') ? window.L2D_EMBED : null;
  const isEmbed = !!EMBED;

  // 挂件模式下所有资源用绝对路径（/live2d/…），否则会按博客页面 URL 解析而 404
  const BASE = (EMBED && EMBED.base) || '';

  const CFG = window.VTS;
  const E = window.L2DEngine;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  /* ================= 分类表（纯界面分组，改这里就能重新分类） =================
   * 表情写文件名（省略 .exp3.json）；没写进任何一组的会落到「其它」。 */
  const CHIP_GROUPS = {
    expr: [
      { name: '情绪表情', files: ['开心兴奋', '悲伤', '生气', '哭', '脸红', '流汗', '调皮', '阴暗', '晕晕', '吐魂', '闭眼口水', '吐舌'] },
      { name: '眼睛特效', files: ['爱心眼', '星星眼', '呆呆眼'] },
      { name: '小特效', files: ['心跳', '情绪花花', 'love'] },
    ],
    deco: [
      { name: '眼镜配饰', files: ['圆眼镜', '方眼镜', '墨镜', '椭圆眼镜', '头箍', '蝴蝶结贴纸', '单边马尾'] },
      { name: '贴纸符号', files: ['猫猫贴纸', '兔兔贴纸', '感叹号', '问号'] },
    ],
    prop: [
      { name: '道具摆件', files: ['巴菲', '蛋包饭', '鲸鱼', '鲸鱼放桌上', '魔爪', '魔爪换色', '手机换色', '深色桌布'] },
    ],
    motion: [
      { name: '手势互动', files: ['喵喵手~喵~动画', '双手比耶', '挤', '点菜按下'] },
      { name: '小工具', files: ['画笔', '橡皮', '撤回'] },
    ],
  };

  const TAB_OF_FILE = {};       // 表情文件 → 属于哪个标签页
  for (const tab in CHIP_GROUPS) {
    for (const g of CHIP_GROUPS[tab]) {
      for (const base of g.files) TAB_OF_FILE[base + '.exp3.json'] = tab;
    }
  }
  const TAB_FILES = (tab) => (CHIP_GROUPS[tab] || []).reduce((acc, g) => acc.concat(g.files.map(b => b + '.exp3.json')), []);
  const TAB_OF_EXPR = TAB_OF_FILE;

  /* 点这些动作时，先把配套道具拿出来，否则根本看不见效果 */
  const MOTION_NEEDS = {
    '喷水.motion3.json': ['鲸鱼.exp3.json'],
  };

  /* ================= 面捕参数映射（取自 VTS“面捕版”配置） ================= */
  const FACE_PARAMS = [
    { name: 'Face Left/Right Rotation', input: 'FaceAngleX', inLo: -30, inHi: 30, outLo: -30, outHi: 30, id: 'ParamAngleX', smoothing: 15, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Face Up/Down Rotation', input: 'FaceAngleY', inLo: -20, inHi: 20, outLo: -30, outHi: 30, id: 'ParamAngleY', smoothing: 15, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Face Lean Rotation', input: 'FaceAngleZ', inLo: -30, inHi: 30, outLo: -30, outHi: 30, id: 'ParamAngleZ', smoothing: 30, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Body Rotation X', input: 'FaceAngleX', inLo: -30, inHi: 30, outLo: -10, outHi: 10, id: 'ParamBodyAngleX', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Body Rotation Y', input: 'FaceAngleY', inLo: -30, inHi: 30, outLo: -10, outHi: 10, id: 'ParamBodyAngleY', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Body Rotation Z', input: 'FaceAngleZ', inLo: -30, inHi: 30, outLo: -10, outHi: 10, id: 'ParamBodyAngleZ', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Eye Open Left', input: 'EyeOpenLeft', inLo: 0, inHi: 1, outLo: 0, outHi: 1.9, id: 'ParamEyeLOpen', smoothing: 10, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Eye Open Right', input: 'EyeOpenRight', inLo: 0, inHi: 1, outLo: 0, outHi: 1.9, id: 'ParamEyeROpen', smoothing: 10, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Eye X', input: 'EyeRightX', inLo: -1, inHi: 1, outLo: 1, outHi: -1, id: 'ParamEyeBallX', smoothing: 8, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Eye Y', input: 'EyeRightY', inLo: -1, inHi: 1, outLo: -1, outHi: 1, id: 'ParamEyeBallY', smoothing: 8, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Brow Height Left', input: 'Brows', inLo: 0, inHi: 1, outLo: -1, outHi: 1, id: 'ParamBrowLY', smoothing: 10, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Brow Form Left', input: 'Brows', inLo: 0, inHi: 1, outLo: -1, outHi: 1, id: 'ParamBrowLForm', smoothing: 15, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Brow Height Right', input: 'Brows', inLo: 0, inHi: 1, outLo: -1, outHi: 1, id: 'ParamBrowRY', smoothing: 10, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Brow Form Right', input: 'Brows', inLo: 0, inHi: 1, outLo: -1, outHi: 1, id: 'ParamBrowRForm', smoothing: 15, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Mouth Smile', input: 'MouthSmile', inLo: 0, inHi: 1, outLo: -1, outHi: 1, id: 'ParamMouthForm', smoothing: 0, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Mouth Open', input: 'MouthOpen', inLo: 0.05, inHi: 1, outLo: 0, outHi: 2.1, id: 'ParamMouthOpenY', smoothing: 0, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: 'Auto Breath', input: '', inLo: 0, inHi: 1, outLo: 0, outHi: 1, id: 'ParamBreath', smoothing: 0, blink: false, breath: true, clampIn: false, clampOut: false },
    { name: '', input: 'MousePositionX', inLo: -1, inHi: 1, outLo: -30, outHi: 30, id: 'pointX', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: '', input: 'MousePositionY', inLo: -1, inHi: 1, outLo: -30, outHi: 30, id: 'pointY', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: '', input: 'MousePositionX', inLo: -1, inHi: 1, outLo: -10, outHi: 10, id: 'danbaoX', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: '', input: 'MousePositionY', inLo: -1, inHi: 1, outLo: -10, outHi: 10, id: 'danbaoY', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: '', input: 'TongueOut', inLo: 0, inHi: 1, outLo: 0, outHi: 1, id: 'ParamCheek79', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
    { name: '', input: 'MouthX', inLo: -0.2, inHi: 0.2, outLo: -1, outHi: 1, id: 'ParamBrowRForm2', smoothing: 20, blink: false, breath: false, clampIn: false, clampOut: false },
  ];

  /* ================= 全局状态 ================= */
  const state = {
    source: 'mouse',        // mouse / face / off
    mouseFollow: true,
    bodyFollow: true,
    blink: true,
    breath: true,
    range: 1,
    zoom: 1,
    bg: 'dark',
    offset: { x: 0, y: 0 },
    activeAnim: -1,
    motionStartT: 0,        // 当前动作开始的时间戳（手势重复触发时用来判断“还在敲”）
    animGen: 0,
    heldParams: [],
    defaults: {},
    inputs: { MousePositionX: 0, MousePositionY: 0 },
    manual: {},             // 输入源级手动值（Brows / MouthSmile ...）
    manualDirect: {},       // 直接写参数的手动值（ParamAngleX ...）
    errors: [],
    timers: [],
    // 面捕
    faceOn: false,
    showPreview: true,
    faceBlink: true,
    faceHeadGain: 1,
    faceSmooth: 55,
    faceMouthGain: 1.2,
    camId: '',
    // 手势
    gestureOn: false,
    gestureMap: {},         // 手势名 -> "expr:文件名" / "motion:索引"
    // 其它
    remember: true,
    tab: 'expr',
    panelW: 0,              // 拖出来的面板宽度（0 = 用 CSS 默认）
    panelH: 0,              // 拖出来的面板高度（0 = 由内容决定）
    drawer: null,           // 参数抽屉的位置尺寸 { l, t, w, h }
  };

  const timers = state.timers;
  const clearTimers = () => { while (timers.length) clearTimeout(timers.pop()); };

  function logErr(e) {
    const msg = (e && e.stack) || String(e);
    state.errors.push(msg);
    const st = $('#status');
    st.textContent = '出错：' + String((e && e.message) || e);
    st.classList.add('err');
    console.error(e);
  }

  /* ================= 偏好持久化（可用「记住设置」关掉） ================= */
  const PREF_KEY = 'ds-prefs-v1';
  const REMEMBER_KEY = 'ds-remember';

  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  const prefs = loadPrefs();
  try {
    const r = localStorage.getItem(REMEMBER_KEY);
    if (r === '0') state.remember = false;
  } catch (e) { /* 忽略 */ }

  function savePrefs() {
    if (!state.remember) return;
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify({
        tab: state.tab,
        source: state.source,
        mouseFollow: state.mouseFollow,
        bodyFollow: state.bodyFollow,
        blink: state.blink,
        breath: state.breath,
        range: state.range,
        zoom: state.zoom,
        bg: state.bg,
        micGain: parseFloat($('#opt-micgain').value),
        face: {
          camId: state.camId, blink: state.faceBlink, headGain: state.faceHeadGain,
          smooth: state.faceSmooth, mouthGain: state.faceMouthGain, showPreview: state.showPreview,
        },
        gesture: { on: state.gestureOn, map: state.gestureMap },
        manual: state.manual,
        manualDirect: state.manualDirect,
        panelW: state.panelW || 0,
        panelH: state.panelH || 0,
        stagePos: isEmbed && stagePos ? { x: Math.round(stagePos.x), y: Math.round(stagePos.y) } : null,
        stageVer: 2,          // 旧版存的是另一套坐标语义，恢复时会忽略
        drawer: state.drawer ? {
          v: 2,                 // 坐标版本：v2 起抽屉默认贴左（旧版是贴右，恢复时会被忽略）
          l: Math.round(state.drawer.l),
          t: Math.round(state.drawer.t),
          w: Math.round(state.drawer.w),
          h: Math.round(state.drawer.h),
        } : null,
        expressions: exprStack.activeNames().slice(),
      }));
    } catch (e) { /* 隐私模式忽略 */ }
  }

  /* ================= 引擎实例 ================= */
  const mapperMouse = new E.ParamMapper(CFG.params);
  const mapperFace = new E.ParamMapper(FACE_PARAMS);
  const blinker = new E.Blinker();
  const breather = new E.Breather(3.6);
  const exprStack = new E.ExpressionStack();
  const matcher = new E.HotkeyMatcher(CFG.hotkeys);
  const face = new window.L2DFace.Engine();

  const exprFiles = Array.from(new Set(
    CFG.hotkeys.filter(h => h.action === 'ToggleExpression' && h.file).map(h => h.file)
  ));
  const hotkeyNameByFile = {};
  const fadeByFile = {};
  const autoStopByFile = {};
  CFG.hotkeys.forEach(h => {
    if (!h.file) return;
    if (!hotkeyNameByFile[h.file]) hotkeyNameByFile[h.file] = h.name;
    if (h.action === 'ToggleExpression') {
      if (fadeByFile[h.file] === undefined) fadeByFile[h.file] = h.fade;
      if (h.autoStop > 0) autoStopByFile[h.file] = h.autoStop;
    }
  });
  const labelOfFile = (f) => hotkeyNameByFile[f] || f.replace(/\.exp3\.json$/, '');
  const fadeOfFile = (f) => (fadeByFile[f] === undefined ? 0.15 : fadeByFile[f]);

  /* ================= PIXI ================= */
  const app = new PIXI.Application(Object.assign({
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    powerPreference: 'high-performance',
  }, isEmbed ? { width: 260, height: 330 } : { resizeTo: window }));
  const stageEl = $('#stage');
  stageEl.appendChild(app.view);

  if (isEmbed) {
    // 舞台尺寸随 CSS 变量（--l2d-w/--l2d-h）变化，跟着同步渲染器
    const sync = () => {
      if (!app.renderer) return;
      const w = Math.max(80, Math.round(stageEl.clientWidth || 0));
      const h = Math.max(80, Math.round(stageEl.clientHeight || 0));
      if (app.screen.width !== w || app.screen.height !== h) app.renderer.resize(w, h);
      layout();
    };
    if (window.ResizeObserver) new ResizeObserver(sync).observe(stageEl);
    window.addEventListener('resize', sync);
    setTimeout(sync, 0);
  }

  let model = null, im = null, core = null;

  /* ================= 加载模型 ================= */
  async function load() {
    if (!window.PIXI || !PIXI.live2d) throw new Error('pixi-live2d-display 未加载');
    if (!window.Live2DCubismCore) throw new Error('Live2D Cubism Core 未加载');

    model = await PIXI.live2d.Live2DModel.from(BASE + CFG.modelUrl, {
      autoInteract: false,
      autoUpdate: true,
      motionPreload: (PIXI.live2d.MotionPreloadStrategy && PIXI.live2d.MotionPreloadStrategy.ALL) || 'ALL',
    });
    im = model.internalModel;
    core = im.coreModel;

    model.anchor.set(0.5, 0.5);
    layout();
    app.stage.addChild(model);
    if (isEmbed) applyStage();      // 模型就位后按人物包围盒再夹一次位置

    im.eyeBlink = undefined;        // 用 VTS 那套 UseBlinking，自己算眨眼

    const jobs = [(async () => {
      try {
        const cdi = await (await fetch(BASE + 'model/' + CFG.modelName + '.cdi3.json')).json();
        for (const p of cdi.Parameters || []) {
          const v = core.getParameterValueById(p.Id);
          if (typeof v === 'number') state.defaults[p.Id] = v;
        }
        probe.reset(Object.keys(state.defaults));
        buildManualParams(cdi);        // 手动参数全集
      } catch (e) { /* 没有 cdi3 也能跑 */ }
    })()];

    for (const f of exprFiles) {
      jobs.push((async () => {
        try {
          const res = await fetch(BASE + 'model/exp3/' + encodeURIComponent(f));
          if (!res.ok) throw new Error('HTTP ' + res.status);
          exprStack.add(f, await res.json());
        } catch (e) { state.errors.push('表情加载失败：' + f); }
      })());
    }
    await Promise.all(jobs);

    let lastT = performance.now();
    im.on('beforeModelUpdate', () => {
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;
      updateParameters(dt);
    });
    im.on('beforeModelUpdate', () => probe.tick());

    layout();
    model.motion('Idle', 0, 3);

    $('#status').textContent =
      `就绪 · 参数 ${core.getParameterCount()} · 表情 ${exprStack.defs.size} · 动作 ${CFG.motions.length}`;

    restorePrefs();     // 模型就绪后再恢复上次的设置/表情
    refreshAll();
  }

  /* ================= 帧内参数采样（自检用） ================= */
  const probe = {
    ids: [],
    stats: {},
    fp: 0,
    reset(ids) {
      this.ids = ids.slice();
      this.stats = {};
      for (const id of this.ids) this.stats[id] = { min: Infinity, max: -Infinity, last: 0 };
    },
    tick() {
      if (!core) return;
      let s = 0;
      for (let i = 0; i < this.ids.length; i++) {
        const id = this.ids[i];
        const v = core.getParameterValueById(id) || 0;
        const st = this.stats[id];
        if (v < st.min) st.min = v;
        if (v > st.max) st.max = v;
        st.last = v;
        s += Math.abs(v);
      }
      this.fp = s;
    },
  };
  probe.reset(Object.keys(state.defaults));

  /* ================= 每帧参数计算 ================= */
  function updateParameters(dt) {
    const faceDriven = state.source === 'face' && state.faceOn;

    state.inputs.VoiceVolume = micLevel();

    if (faceDriven) {
      // 面捕：头姿/眼/嘴/眉 都来自摄像头
      const o = face.out;
      if (o.FaceAngleX !== undefined) {
        for (const k in o) state.inputs[k] = o[k];
      }
      if (!state.faceBlink) {
        // 不用人脸眨眼时，退回自己的自动眨眼
        if (state.blink) {
          const v = blinker.update(dt);
          state.inputs.EyeOpenLeft = v;
          state.inputs.EyeOpenRight = v;
        }
      }
    } else {
      delete state.inputs.FaceAngleX;
      delete state.inputs.FaceAngleY;
      delete state.inputs.FaceAngleZ;
      if (state.source === 'mouse' && state.bodyFollow) {
        state.inputs.FaceAngleX = (state.inputs.MousePositionX || 0) * 30;
        state.inputs.FaceAngleY = (state.inputs.MousePositionY || 0) * 30;
        state.inputs.FaceAngleZ = 0;
      }
      if (state.blink) {
        const v = blinker.update(dt);
        state.inputs.__blink = v;
      }
    }

    for (const k in state.manual) state.inputs[k] = state.manual[k];

    const mapper = faceDriven ? mapperFace : mapperMouse;
    mapper.update(core, dt, state.inputs);

    // 自动眨眼（鼠标模式 / 面捕用了自动眨眼时）
    if (!faceDriven && state.blink) {
      const v = state.inputs.__blink;
      if (v !== undefined) {
        core.setParameterValueById('ParamEyeLOpen', v);
        core.setParameterValueById('ParamEyeROpen', v);
      }
      delete state.inputs.__blink;
    }
    if (state.breath) core.setParameterValueById('ParamBreath', breather.update(dt));

    // 手动拖过的参数：直接盖上去（表情仍可再叠加）
    for (const id in state.manualDirect) core.setParameterValueById(id, state.manualDirect[id]);

    // 表情叠加（最后写，优先级最高）
    exprStack.update(core, dt);
  }

  /* ================= 布局 / 拖拽 / 缩放 ================= */
  function layout() {
    if (!model) return;
    const w = app.screen.width || window.innerWidth || 800;
    const h = app.screen.height || window.innerHeight || 600;
    const ow = im.originalWidth || model.width || 1;
    const oh = im.originalHeight || model.height || 1;
    // 挂件：以“1 倍尺寸”为基准算模型大小（画布留了放大余量，放到上限也不会裁）
    const baseW = (isEmbed && stageBase) ? stageBase.w : w;
    const baseH = (isEmbed && stageBase) ? stageBase.h : h;
    const fit = Math.min(baseW / ow, baseH / oh) * (isEmbed ? 0.98 : 0.92);
    const maxX = Math.max(0, w / 2 - 30);
    const maxY = Math.max(0, h / 2 - 30);
    state.offset.x = E.clamp(state.offset.x, -maxX, maxX);
    state.offset.y = E.clamp(state.offset.y, -maxY, maxY);
    model.scale.set(fit * state.zoom);
    model.position.set(w / 2 + state.offset.x, h / 2 + state.offset.y);
  }

  /* ---------- 挂件模式：固定大画布，人物在画布中心（缩放只改模型，不动画布 → 不会闪黑） ---------- */
  const STAGE_PAD = 3;            // 画布 = 1 倍尺寸 × 3（= 缩放上限），放到最大也不会裁掉人物
  let stagePos = null;            // 画布左上角（用户位置，唯一真相）
  let stageBase = null;           // 1 倍时人物在页面上的视觉尺寸

  const stageRect = () => stageEl.getBoundingClientRect();
  const petBounds = () => (model ? model.getBounds() : { x: 0, y: 0, width: 0, height: 0 });

  /** 幂等渲染：把“人物”完整夹进视口（移动的是画布），绝不写回 stagePos */
  function applyStage() {
    if (!isEmbed || !stagePos) return;
    const b = petBounds();
    const loX = 8 - b.x, hiX = window.innerWidth - 8 - b.x - b.width;
    const loY = 8 - b.y, hiY = window.innerHeight - 8 - b.y - b.height;
    const x = E.clamp(stagePos.x, Math.min(loX, hiX), Math.max(loX, hiX));
    const y = E.clamp(stagePos.y, Math.min(loY, hiY), Math.max(loY, hiY));
    stageEl.style.left = Math.round(x) + 'px';
    stageEl.style.top = Math.round(y) + 'px';
    stageEl.style.right = 'auto';
    stageEl.style.bottom = 'auto';
  }

  // 人物默认站右下角；stagePos 是画布左上角，所以要减掉半个画布
  function stageHome() {
    if (!isEmbed || !stageBase) return;
    const cw = stageBase.w * STAGE_PAD, ch = stageBase.h * STAGE_PAD;
    const cx = Math.max(stageBase.w / 2 + 8, window.innerWidth - stageBase.w / 2 - 8);
    const cy = Math.max(stageBase.h / 2 + 8, window.innerHeight - stageBase.h / 2 - 8);
    stagePos = { x: cx - cw / 2, y: cy - ch / 2 };
    applyStage();
  }

  // 一次性初始化：记住 1 倍尺寸、把画布放大到上限、（没有用户位置时）站到右下角
  function initStageCanvas() {
    if (!isEmbed || stageBase) return;
    const r0 = stageRect();
    stageBase = { w: r0.width || 260, h: r0.height || 330 };
    stageEl.style.width = Math.round(stageBase.w * STAGE_PAD) + 'px';
    stageEl.style.height = Math.round(stageBase.h * STAGE_PAD) + 'px';
    if (!stagePos) stageHome();
  }

  // 刷新舞台（模型大小 + 位置），滚轮 / 恢复设置都走这里；画布尺寸不动
  function applyStageScale() {
    if (!isEmbed) return;
    initStageCanvas();
    layout();
    applyStage();
  }

  // 统一缩放入口：滚轮 / 滑块 / 复位都走这里（画布尺寸不动，所以不会闪）
  function setZoom(v, save) {
    state.zoom = E.clamp(v, 0.3, 3);
    const z = $('#opt-zoom'); if (z) z.value = state.zoom;
    const zt = $('#v-zoom'); if (zt) zt.textContent = state.zoom.toFixed(2);
    layout();          // 只改模型缩放
    applyStage();      // 人物变大后可能要被收回一点
    updateCardSums();
    if (save !== false) savePrefs();
  }

  let dragging = false, dragFrom = null, posFrom = null;

  app.view.addEventListener('pointerdown', (e) => {
    const over = hitModel(e);
    pressed.add('LeftMouseButton');
    fireAll(matcher.keyDown('LeftMouseButton'));
    if (!over) return;
    dragging = true;
    dragFrom = { x: e.clientX, y: e.clientY };
    posFrom = { x: state.offset.x, y: state.offset.y };
    app.view.setPointerCapture(e.pointerId);
  });

  app.view.addEventListener('pointermove', (e) => {
    updateMouseInput(e);
    if (!dragging) return;
    state.offset.x = posFrom.x + (e.clientX - dragFrom.x);
    state.offset.y = posFrom.y + (e.clientY - dragFrom.y);
    layout();
  });

  const endDrag = (e) => {
    dragging = false;
    pressed.delete('LeftMouseButton');
    releaseHolds('LeftMouseButton');
    if (e && e.pointerId !== undefined && app.view.hasPointerCapture && app.view.hasPointerCapture(e.pointerId)) {
      app.view.releasePointerCapture(e.pointerId);
    }
  };
  app.view.addEventListener('pointerup', endDrag);
  app.view.addEventListener('pointercancel', endDrag);

  app.view.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(state.zoom * (e.deltaY > 0 ? 0.94 : 1.06));
  }, { passive: false });

  app.view.addEventListener('dblclick', resetView);

  /* ---------- 挂件模式：画布鼠标穿透，拖动 / 滚轮改在 document 上「命中人物才接管」 ---------- */
  if (isEmbed) {
    // 只在“拖动手势另有用途”的地方让步：面板/抽屉标题栏、调大小把手、输入控件。
    // 按钮、药丸、文字这些都算可拖动区 —— 按下后原地抬起仍是正常点击（click 照常触发），
    // 拖起来才是拖人物，所以人物被拖到面板上照样能拖走。
    const UI_SEL = '#panel > header, #param-modal .pm-box > header, #dock, #face-preview-wrap, #selftest, ' +
      'input, select, textarea, .rz';
    const SLOP = 4;                 // 位移超过这个数才算“拖动”，轻点不拦截
    let pendingDrag = false, pendingFrom = null, dragFromStage = null, swallowClick = false;

    const inUI = (el) => !!(el && el.closest && el.closest(UI_SEL));
    const hitPet = (cx, cy) => {
      if (!model) return false;
      const r = app.view.getBoundingClientRect();
      const b = model.getBounds();  // 舞台坐标下的包围盒（画布在页面右下角，要减掉偏移）
      const x = cx - r.left, y = cy - r.top;
      const padX = b.width * 0.12, padY = b.height * 0.12;   // 留点余量，按在人物边上也算
      return x >= b.x - padX && x <= b.x + b.width + padX && y >= b.y - padY && y <= b.y + b.height + padY;
    };

    // 触摸设备：手指落在人物上时，必须在 touchstart 阶段就阻止页面滚动 ——
    // 触摸滚动是浏览器在手指落下的瞬间就决定的，pointermove 里再 preventDefault 已经晚了
    document.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;                // 多指（捏合页面）不拦
      const t = e.touches[0];
      if (inUI(e.target) || !hitPet(t.clientX, t.clientY)) return;
      e.preventDefault();
    }, { passive: false, capture: true });

    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || inUI(e.target) || !hitPet(e.clientX, e.clientY)) return;
      const r = stageRect();
      pendingDrag = true;
      pendingFrom = { x: e.clientX, y: e.clientY };
      dragFromStage = { x: r.left, y: r.top };   // 以“看到的画布位置”为基准
    }, true);

    document.addEventListener('pointermove', (e) => {
      if (pendingDrag && !dragging) {
        const slop = e.pointerType === 'touch' ? 8 : SLOP;   // 手指抖动大，阈值放宽一点
        if (Math.abs(e.clientX - pendingFrom.x) + Math.abs(e.clientY - pendingFrom.y) < slop) return;
        pendingDrag = false;
        dragging = true;
        swallowClick = true;        // 拖动后的那次 click 别误触页面元素
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
      }
      if (!dragging || !pendingFrom) return;
      e.preventDefault();
      stagePos = {
        x: dragFromStage.x + (e.clientX - pendingFrom.x),
        y: dragFromStage.y + (e.clientY - pendingFrom.y),
      };
      applyStage();
    }, true);

    const endPetDrag = () => {
      if (dragging) {
        dragging = false;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        savePrefs();
      }
      pendingDrag = false;
      pendingFrom = null;
      if (swallowClick) setTimeout(() => { swallowClick = false; }, 0);   // click 紧随 pointerup，随后自废
    };
    document.addEventListener('pointerup', endPetDrag, true);
    document.addEventListener('pointercancel', endPetDrag, true);

    document.addEventListener('click', (e) => {
      if (!swallowClick) return;    // 刚拖动过：吞掉这一次点击
      e.preventDefault();
      e.stopPropagation();
    }, true);

    // 滚轮：指针在人物身上 = 缩放角色；在别处 = 正常滚动博客
    document.addEventListener('wheel', (e) => {
      if (inUI(e.target) || !hitPet(e.clientX, e.clientY)) return;
      e.preventDefault();
      setZoom(state.zoom * (e.deltaY > 0 ? 0.94 : 1.06));
    }, { passive: false, capture: true });

    // 双击人物 = 复位位置与大小
    document.addEventListener('dblclick', (e) => {
      if (inUI(e.target) || !hitPet(e.clientX, e.clientY)) return;
      resetView();
    }, true);
  }

  if (app.renderer.on) app.renderer.on('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(() => layout()).observe($('#stage'));
  window.addEventListener('resize', () => {
    layout();
    applyStage();                   // 窗口变了：被拖过的舞台重新贴回可视区
    requestAnimationFrame(layout);
  });

  function resetView() {
    state.offset.x = 0;
    state.offset.y = 0;
    if (isEmbed) {
      stagePos = null;
      stageHome();          // 人物回到右下角（画布尺寸不变 → 不闪）
    }
    setZoom(1);
  }

  function hitModel(e) {
    if (!model) return false;
    const b = model.getBounds();
    return e.clientX >= b.x && e.clientX <= b.x + b.width && e.clientY >= b.y && e.clientY <= b.y + b.height;
  }

  /* ================= 鼠标输入 ================= */
  function updateMouseInput(e) {
    if (state.source === 'off' || !state.mouseFollow) {
      state.inputs.MousePositionX = 0;
      state.inputs.MousePositionY = 0;
      return;
    }
    const r = app.view.getBoundingClientRect();
    let nx, ny;
    if (isEmbed) {
      // 挂件：画布比人物大得多，按“人物”的范围归一化，鼠标跟随才不会变迟钝
      const b = petBounds();
      const halfW = (b.width / 2) || 1;
      const halfH = (b.height / 2) || 1;
      nx = (e.clientX - r.left - (b.x + halfW)) / halfW;
      ny = -((e.clientY - r.top) - (b.y + halfH)) / halfH;
    } else {
      nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      ny = 1 - ((e.clientY - r.top) / r.height) * 2;
    }
    state.inputs.MousePositionX = E.clamp(nx * state.range, -1, 1);
    state.inputs.MousePositionY = E.clamp(ny * state.range, -1, 1);
  }
  window.addEventListener('pointermove', (e) => { if (e.target !== app.view) updateMouseInput(e); });

  /* ================= 麦克风 ================= */
  let mic = null;

  async function setMic(on) {
    if (!on) {
      if (mic) { mic.stream.getTracks().forEach(t => t.stop()); try { mic.ctx.close(); } catch (e) {} mic = null; }
      $('#mic-meter').style.width = '0%';
      return;
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) {} }
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.2;
    src.connect(analyser);
    mic = { stream, ctx, analyser, buf: new Uint8Array(analyser.fftSize), level: 0 };
  }

  function micLevel() {
    if (!mic) return undefined;
    mic.analyser.getByteTimeDomainData(mic.buf);
    let sum = 0;
    for (let i = 0; i < mic.buf.length; i++) { const v = (mic.buf[i] - 128) / 128; sum += v * v; }
    const rms = Math.sqrt(sum / mic.buf.length);
    const gain = parseFloat($('#opt-micgain').value);
    const target = Math.min(1, rms * gain * 2.2);
    mic.level += (target - mic.level) * (target > mic.level ? 0.6 : 0.12);
    $('#mic-meter').style.width = (mic.level * 100).toFixed(0) + '%';
    return mic.level;
  }

  /* ================= 热键 ================= */
  const pressed = new Set();
  const heldHotkeys = new Map();

  function fireAll(list) { for (const hk of list) fire(hk); }

  function fire(hk) {
    if (hk.holdOnKey) heldHotkeys.set(hk.name, hk);

    if (hk.action === 'RemoveAllExpressions') {
      exprStack.clear();
      clearHeldPose();
      refreshAll();
      return;
    }
    if (hk.action === 'ToggleExpression') {
      if (hk.holdOnKey) exprStack.set(hk.file, hk.file, true, hk.fade);
      else toggleExpression(hk.file, hk.fade);
      refreshAll();
      return;
    }
    if (hk.action === 'TriggerAnimation') {
      playMotion(hk.motionIndex);
      return;
    }
  }

  function releaseHolds(key) {
    for (const [name, hk] of Array.from(heldHotkeys)) {
      const keys = (hk.triggers || []).filter(Boolean);
      if (keys.indexOf(key) < 0) continue;
      heldHotkeys.delete(name);
      if (hk.action === 'ToggleExpression') exprStack.set(hk.file, hk.file, false, hk.fade);
      if (hk.action === 'TriggerAnimation') { /* 动画不做松开停止，和 VTS 一致 */ }
    }
    refreshAll();
  }

  window.addEventListener('keydown', (e) => {
    if (isEmbed) return;          // 挂件模式不接管键盘：免得 Alt+B / Ctrl+Z / Delete 这些和博客打架
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.repeat) return;

    const key = E.codeToKey(e.code);
    let fired = matcher.keyDown(key);
    if (!fired.length) fired = matcher.keyDownLoose(key);
    if (fired.length) { e.preventDefault(); fireAll(fired); return; }

    if (key === 'Escape' && paramModalOpen()) { openParamModal(false); e.preventDefault(); return; }

    // 挂件模式下不接管 H / F（免得把面板藏起来找不回、或把整站搞成全屏）
    if (!isEmbed && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (key === 'H') { togglePanel(); e.preventDefault(); }
      else if (key === 'F') { toggleFullscreen(); e.preventDefault(); }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (isEmbed) return;
    const key = E.codeToKey(e.code);
    matcher.keyUp(key);
    releaseHolds(key);
  });
  window.addEventListener('blur', () => { matcher.releaseAll(); heldHotkeys.clear(); });

  /* 鼠标右键 / 中键也能触发热键（VTS 里可以配）
   * 挂件模式下整段跳过：博客里右键菜单要正常用，不能被我们拦掉 */
  if (!isEmbed) {
    window.addEventListener('mousedown', (e) => {
      if (e.target && e.target.closest && e.target.closest('#panel')) return;
      if (e.button === 2 || e.button === 1) {
        const key = e.button === 2 ? 'RightMouseButton' : 'MiddleMouseButton';
        pressed.add(key);
        fireAll(matcher.keyDown(key));
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 2 || e.button === 1) {
        const key = e.button === 2 ? 'RightMouseButton' : 'MiddleMouseButton';
        pressed.delete(key);
        releaseHolds(key);
      }
    });
    window.addEventListener('contextmenu', (e) => {
      if (e.target && e.target.closest && e.target.closest('#panel')) return;
      e.preventDefault();      // 舞台上的右键留给热键用
    });
  }

  /* ================= 表情 / 动作 ================= */
  function toggleExpression(file, fade) {
    const on = exprStack.toggle(file, file, fade === undefined ? fadeOfFile(file) : fade);
    const auto = autoStopByFile[file];
    if (on && auto > 0) {
      timers.push(setTimeout(() => { exprStack.set(file, file, false, 0.3); refreshAll(); }, auto * 1000));
    }
    refreshAll();
    return on;
  }

  /**
   * 播放动作。
   * @param {number} index 动作序号
   * @param {boolean} [restart] true = 不管当前在播什么，都从头重播一遍
   *        （手势触发用：✊ 每握一次拳就重新敲一锤；面板按钮不传 = 再点一次停止）
   */
  function playMotion(index, restart) {
    const m = CFG.motions[index];
    if (!m) return;
    if (!restart && state.activeAnim === index) { stopMotion(); return; }

    stopMotion(true);
    state.activeAnim = index;
    state.motionStartT = performance.now();
    const gen = ++state.animGen;
    clearTimers();
    clearHeldPose();

    // 需要道具的动作：道具没拿出来就先拿出来，不然点了一点动静都看不到
    for (const need of needsOfMotion(m)) {
      if (!exprStack.isActive(need)) exprStack.set(need, need, true, 0.2);
    }

    model.motion('Tap', index, 3);

    if (m.holdLast) {
      timers.push(setTimeout(() => {
        if (gen !== state.animGen) return;
        state.heldParams = Object.keys(m.endPose || {});
        model.motion('Idle', 0, 3);
        state.activeAnim = -1;                  // 播完了，把高亮收掉
        refreshAll();
      }, (m.duration + 0.2) * 1000));
    } else {
      // 普通动作播完（含淡出）后回到待机并收掉高亮：
      // 这里主动切回 Idle 是兜底 —— 万一某个动作文件的 Loop 没关掉，也不会一直播下去
      timers.push(setTimeout(() => {
        if (gen !== state.animGen) return;
        state.activeAnim = -1;
        model.motion('Idle', 0, 3);
        refreshAll();
      }, (m.duration + (m.fadeOut || 0.3) + 0.15) * 1000));
    }
    if (m.autoStop > 0) {
      timers.push(setTimeout(() => { if (gen === state.animGen) stopMotion(); }, m.autoStop * 1000));
    }
    refreshAll();
  }

  const needsOfMotion = (m) => {
    for (const key in MOTION_NEEDS) if (String(m.file).indexOf(key) >= 0) return MOTION_NEEDS[key];
    return [];
  };

  function stopMotion(silent) {
    if (state.activeAnim < 0) return;
    state.activeAnim = -1;
    state.animGen++;
    clearTimers();
    if (!silent) clearHeldPose();
    model.motion('Idle', 0, 3);
    refreshAll();
  }

  function clearHeldPose() {
    for (const id of state.heldParams) {
      if (state.defaults[id] !== undefined) core.setParameterValueById(id, state.defaults[id]);
    }
    state.heldParams = [];
  }

  /* ================= 面板拖动 / 折叠 / 位置记忆 ================= */
  const PANEL_POS_KEY = 'ds-panel-pos';
  const PANEL_GAP = 8;
  const PANEL_DEF = { x: 56, y: 12 };
  let panelPos = { x: PANEL_DEF.x, y: PANEL_DEF.y };

  function panelHeight(panel) { return panel.getBoundingClientRect().height; }

  /** 面板可用高度：挂件模式下最多半屏，展开后正好停在模型上方，不会糊住整页 */
  function panelMaxH(y) {
    const room = Math.max(200, window.innerHeight - y - PANEL_GAP);
    return isEmbed ? Math.min(room, Math.round(window.innerHeight * 0.5)) : room;
  }

  function applyPanelPos() {
    const panel = $('#panel');
    const collapsed = panel.dataset.collapsed === 'true';

    // 用户拖过尺寸就用它（折叠时高度交回内容，只留标题栏）
    panel.style.width = state.panelW ? state.panelW + 'px' : '';
    panel.style.height = (!collapsed && state.panelH) ? state.panelH + 'px' : '';

    const w = panel.offsetWidth || 520;
    const x = E.clamp(panelPos.x, 4, Math.max(4, window.innerWidth - w - 4));
    let y = E.clamp(panelPos.y, 4, Math.max(4, window.innerHeight - 52));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';

    if (state.panelH && !collapsed) {
      // 高度是用户定的，只做一下视口兜底，不再自动“朝上展开”
      panel.style.maxHeight = panelMaxH(y) + 'px';
      return;
    }
    panel.style.maxHeight = panelMaxH(y) + 'px';

    if (panel.dataset.collapsed !== 'true') {
      const h = panelHeight(panel);
      const overflow = y + h - (window.innerHeight - PANEL_GAP);
      if (overflow > 0) {
        y = Math.max(4, y - overflow);
        panel.style.top = y + 'px';
        panel.style.maxHeight = panelMaxH(y) + 'px';
      }
    }
  }

  function savePanelPos() {
    try { localStorage.setItem(PANEL_POS_KEY, JSON.stringify({ x: panelPos.x, y: panelPos.y })); } catch (e) { /* 忽略 */ }
  }

  function setCollapsed(collapsed) {
    const panel = $('#panel');
    panel.dataset.collapsed = collapsed ? 'true' : 'false';
    const btn = $('#collapse');
    if (btn) {
      btn.textContent = collapsed ? '＋' : '−';
      btn.title = collapsed ? '展开面板' : '折叠面板';
    }

    // 展开时下方空间不够的话，applyPanelPos 会在“渲染层”朝上展开；
    // 这里不改 panelPos —— 窗口变大后它还能回到你摆的地方
    if (!collapsed && !state.panelH) panel.style.maxHeight = 'none';
    applyPanelPos();
    savePanelPos();
  }

  function initPanelDrag() {
    const panel = $('#panel');
    const head = $('#panel-head');

    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || 'null');
      if (saved && isFinite(saved.x) && isFinite(saved.y)) panelPos = { x: saved.x, y: saved.y };
    } catch (e) { /* 忽略 */ }
    applyPanelPos();

    let dragging = false, from = null, origin = null;

    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      const r = panel.getBoundingClientRect();
      dragging = true;
      from = { x: e.clientX, y: e.clientY };
      origin = { x: r.left, y: r.top };
      head.classList.add('dragging');
      try { head.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      e.preventDefault();
      e.stopPropagation();
    });

    head.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      panelPos = { x: origin.x + e.clientX - from.x, y: origin.y + e.clientY - from.y };
      applyPanelPos();
    });

    const end = (e) => {
      if (!dragging) return;
      dragging = false;
      head.classList.remove('dragging');
      panelPos = {
        x: parseFloat(panel.style.left) || PANEL_DEF.x,
        y: parseFloat(panel.style.top) || PANEL_DEF.y,
      };
      applyPanelPos();
      savePanelPos();
      if (e && e.pointerId !== undefined && head.hasPointerCapture && head.hasPointerCapture(e.pointerId)) {
        try { head.releasePointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);

    head.addEventListener('dblclick', (e) => {
      if (e.target.closest('button')) return;
      panelPos = { x: PANEL_DEF.x, y: PANEL_DEF.y };
      applyPanelPos();
      savePanelPos();
    });

    window.addEventListener('resize', applyPanelPos);
  }

  /* ================= 界面：标签页 ================= */
  function setTab(tab) {
    state.tab = tab;
    $$('#tabs .tab').forEach(b => { b.dataset.on = b.dataset.tab === tab ? 'true' : 'false'; });
    $$('#panel .page').forEach(p => { p.dataset.on = p.dataset.page === tab ? 'true' : 'false'; });
    const panel = $('#panel');
    if (panel.dataset.collapsed !== 'true') applyPanelPos();
    savePrefs();
  }

  /* ================= 界面：药丸按钮 ================= */
  function makeChip(label, hint, kind, data) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.dataset.kind = kind;
    if (kind === 'expr') b.dataset.file = data;
    if (kind === 'motion') b.dataset.index = data;
    if (kind === 'clear') b.dataset.clear = data;
    const nm = document.createElement('span');
    nm.textContent = label;
    b.appendChild(nm);
    if (hint) {
      const k = document.createElement('kbd');
      k.textContent = hint;
      b.appendChild(k);
    }
    b.title = label + (hint ? '（' + hint + '）' : '');
    return b;
  }

  /* 键名缩略，免得药丸里塞不下（LeftControl+Numpad8 -> LCtrl+Num8） */
  const SHORT_KEY = {
    LeftMouseButton: '左键', RightMouseButton: '右键', MiddleMouseButton: '中键',
    LeftControl: 'LCtrl', RightControl: 'RCtrl', LeftShift: 'LShift', RightShift: 'RShift',
    Decimal: '点', Multiply: '乘', Divide: '除', Subtract: '减', Add: '加',
    PageUp: 'PgUp', PageDown: 'PgDn',
  };
  const shortKey = (k) => SHORT_KEY[k] || (k.indexOf('Numpad') === 0 ? 'Num' + k.slice(6) : k);
  const shortKeys = (list) => (list || []).filter(Boolean).map(shortKey).join('+');

  function keyHintOf(file) {
    const hk = CFG.hotkeys.find(h => h.file === file && h.action === 'ToggleExpression');
    return hk ? shortKeys(hk.triggers) : '';
  }
  function keyHintOfMotion(i) {
    const hk = CFG.hotkeys.find(h => h.action === 'TriggerAnimation' && h.motionIndex === i);
    return hk ? shortKeys(hk.triggers) : '';
  }

  function buildChips() {
    // 表情
    const ex = $('#chips-expr');
    ex.innerHTML = '';
    ex.appendChild(makeChip('平常', '', 'clear', 'expr'));
    for (const tab of ['expr']) {
      for (const f of TAB_FILES(tab)) {
        if (exprFiles.indexOf(f) < 0) continue;
        ex.appendChild(makeChip(labelOfFile(f), keyHintOf(f), 'expr', f));
      }
    }

    // 装饰
    const de = $('#chips-deco');
    de.innerHTML = '';
    de.appendChild(makeChip('全部取下', '', 'clear', 'deco'));
    for (const f of TAB_FILES('deco')) {
      if (exprFiles.indexOf(f) < 0) continue;
      de.appendChild(makeChip(labelOfFile(f), keyHintOf(f), 'expr', f));
    }

    // 道具
    const pr = $('#chips-prop');
    pr.innerHTML = '';
    pr.appendChild(makeChip('全部收回', '', 'clear', 'prop'));
    for (const f of TAB_FILES('prop')) {
      if (exprFiles.indexOf(f) < 0) continue;
      pr.appendChild(makeChip(labelOfFile(f), keyHintOf(f), 'expr', f));
    }

    // 动作 + 手势互动/小工具
    const mo = $('#chips-motion');
    mo.innerHTML = '';
    CFG.motions.forEach((m, i) => {
      mo.appendChild(makeChip(m.name, keyHintOfMotion(i), 'motion', i));
    });
    for (const f of TAB_FILES('motion')) {
      if (exprFiles.indexOf(f) < 0) continue;
      mo.appendChild(makeChip(labelOfFile(f), keyHintOf(f), 'expr', f));
    }

    // 点击委托
    $('#panel .body').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const kind = chip.dataset.kind;
      if (kind === 'expr') { toggleExpression(chip.dataset.file); return; }
      if (kind === 'motion') { playMotion(Number(chip.dataset.index)); return; }
      if (kind === 'clear') {
        const tab = chip.dataset.clear;
        if (tab === 'expr') exprStack.clear();
        else for (const f of TAB_FILES(tab)) exprStack.set(f, f, false, 0.15);
        clearHeldPose();
        refreshAll();
      }
    });
  }

  /* ================= 界面：状态条 ================= */
  function activeIn(tab) {
    return TAB_FILES(tab).filter(f => exprStack.isActive(f)).map(labelOfFile);
  }

  function updateStateBars() {
    const mode = state.source === 'face' ? '面捕' : (state.source === 'mouse' ? '鼠标' : '关闭');

    const e1 = activeIn('expr');
    $('#state-expr').innerHTML = '模式：<b>' + mode + '</b> · 现在：<b>' +
      (e1.length ? e1.join(' + ') : '平常脸') + '</b>';

    const d = activeIn('deco');
    $('#state-deco').innerHTML = d.length ? '已戴：<b>' + d.join(' + ') + '</b>' : '还没戴任何东西';

    const p = activeIn('prop');
    $('#state-prop').innerHTML = p.length ? '已拿出：<b>' + p.join(' + ') + '</b>' : '桌上空空的';

    const m = state.activeAnim >= 0 ? CFG.motions[state.activeAnim] : null;
    $('#state-motion').innerHTML = m ? '正在播放：<b>' + m.name + '</b>' : '待机';
  }

  function refreshChipStates() {
    $$('#panel .chip[data-kind="expr"]').forEach((b) => {
      b.classList.toggle('on', exprStack.isActive(b.dataset.file));
    });
    $$('#panel .chip[data-kind="motion"]').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.index) === state.activeAnim);
    });
    $$('#panel .chip[data-kind="clear"]').forEach((b) => {
      const tab = b.dataset.clear;
      b.classList.toggle('on', activeIn(tab).length === 0);
    });
  }

  function refreshAll() {
    refreshChipStates();
    updateStateBars();
    savePrefs();
  }

  /* ================= 界面：手动参数全集（cdi3 分组） ================= */
  let manualBuilt = false;

  /* 模型里有些参数名字是代号（mm_wing_l1 / hair_f_mA …），按含义翻成人话。
   * 这些命名本身是英文缩写：wing=翅膀 hair=头发 bowknot=蝴蝶结 ear=耳 tail=尾。 */
  const PARAM_ALIAS = {
    mm_wing_l1: '翅膀·左片1',
    mm_wing_l2: '翅膀·左片2',
    mm_wing_r1: '翅膀·右片1',
    mm_wing_r2: '翅膀·右片2',
    hair_f_mA: '前发·中 A',
    hair_f_mB: '前发·中 B',
    hair_f_mB2: '前发·中 B2',
    hair_f_lr1A: '前发·左右1 A',
    hair_f_lr1B: '前发·左右1 B',
    hair_f_lr1A2: '前发·左右1 A2',
    hair_f_lr1B2: '前发·左右1 B2',
    hair_dA: '前发·下垂 A',
    hair_dB: '前发·下垂 B',
    hair_dB2: '前发·下垂 B2',
    mm_bowknot_1: '蝴蝶结 1',
    mm_bowknot_2: '蝴蝶结 2',
    mm_bowknot_3: '蝴蝶结 3',
    mm_bowknot_4: '蝴蝶结 4',
    mm_bowknot_5: '蝴蝶结 5',
    ear_lA: '猫耳·左A',
    ear_lB: '猫耳·左B',
    ear_rA: '猫耳·右A',
    ear_rB: '猫耳·右B',
    B_ear_lA: '猫耳(B款)·左A',
    B_ear_lB: '猫耳(B款)·左B',
    B_ear_rA: '猫耳(B款)·右A',
    B_ear_rB: '猫耳(B款)·右B',
    tail_2: '尾巴 2',

    // 下面这些参数名是 "[0]B_tail" / "[3]xk" 这种，按参数 Id 匹配更准
    Param32: '翅膀·左片2-1',
    Param_Angle_Rotation_1_B_tail3: 'B款尾巴·旋转1',
    Param_Angle_Rotation_2_B_tail3: 'B款尾巴·旋转2',
    Param_Angle_Rotation_3_B_tail3: 'B款尾巴·旋转3',
    Param_Angle_Rotation_4_B_tail3: 'B款尾巴·旋转4',
    Param_Angle_Rotation_5_B_tail3: 'B款尾巴·旋转5',
    Param_Angle_Rotation_1_xk4: '尾巴旋转1',
    Param_Angle_Rotation_2_xk4: '尾巴旋转2',
    Param_Angle_Rotation_3_xk4: '尾巴旋转3',
    Param_Angle_Rotation_4_xk4: '尾巴旋转4',
    Param_Angle_Rotation_5_xk4: '尾巴旋转5',
    Param_Angle_Rotation_6_xk4: '尾巴旋转6',
    Param_Angle_Rotation_7_xk4: '尾巴旋转7',
  };

  /* 需要前置条件 / 含义不直观的参数的额外说明（显示在鼠标悬停提示里） */
  const PARAM_NOTE = {
    jingyu: '0 = 收起鲸鱼，1 = 拿出来',
    pengshui: '鲸鱼喷水：要先把鲸鱼拿出来才看得见',
    fangzhuoshang: '1 = 把鲸鱼放到桌上',
    mozhua: '0 = 收起魔爪，1 = 拿出来',
    mozhua2: '魔爪换色：要先显示魔爪才看得见',
    shouji: '手机换色：要先显示手机',
    cc2: '桌布深浅：0 = 浅，1 = 深',
    baleite: '把巴菲（甜点）拿出来',
    danbaofan: '把蛋包饭拿出来',
    love: '爱心动画',
  };

  /* 分组名里的代号 */
  const GROUP_ALIAS = {
    mm_wing: '翅膀部件',
    xk: '尾巴旋转（xk）',
  };

  function buildManualParams(cdi) {
    if (manualBuilt) return;
    const box = $('#manual-params');       // 不清理，保留前面已经建好的「常用」组

    const groupName = {};
    for (const g of cdi.ParameterGroups || []) groupName[g.Id] = g.Name || g.Id;

    const buckets = new Map();
    for (const p of cdi.Parameters || []) {
      const id = p.Id;
      if (state.defaults[id] === undefined) continue;
      // 注意：Cubism 的 getParameterMinimum/MaximumValue 收的是「索引」不是 Id，
      // 传 Id 会得到 undefined（之前滑块范围全被兜底成 0~1 就是这个原因）
      let min = 0, max = 1;
      try {
        const idx = core.getParameterIndex(id);
        if (idx >= 0) {
          min = core.getParameterMinimumValue(idx);
          max = core.getParameterMaximumValue(idx);
        }
      } catch (e) { /* 用默认 0~1 */ }
      if (!isFinite(min) || !isFinite(max) || max - min < 1e-6) { min = 0; max = 1; }
      const rawGroup = groupName[p.GroupId] || '其它';
      const gname = GROUP_ALIAS[rawGroup] || rawGroup;
      if (!buckets.has(gname)) buckets.set(gname, []);
      const raw = p.Name || id;
      buckets.get(gname).push({
        id,
        name: PARAM_ALIAS[id] || PARAM_ALIAS[raw] || raw,   // 代号翻成人话（先按 Id 再按名字匹配）
        raw,
        note: PARAM_NOTE[id] || '',
        min, max, def: state.defaults[id],
      });
    }

    for (const [gname, list] of buckets) {
      const g = document.createElement('div');
      g.className = 'pgroup';
      g.dataset.open = 'false';           // 默认收起，点开哪组看哪组

      const head = document.createElement('button');
      head.type = 'button';
      head.className = 'phead';
      head.innerHTML = '<span class="chev">▾</span><span></span><span class="pcount"></span>';
      head.children[1].textContent = gname;
      head.children[2].textContent = String(list.length);

      const body = document.createElement('div');
      body.className = 'pbody';

      for (const d of list) {
        const row = document.createElement('label');
        row.className = 'row';
        row.innerHTML = '<span></span><input type="range"><b></b>';
        row.children[0].textContent = d.name;
        row.dataset.id = d.id;                 // 复位/恢复设置都按这个找
        row.title = d.id
          + (d.raw && d.raw !== d.name ? '（' + d.raw + '）' : '')
          + (d.note ? '　· ' + d.note : '');
        const input = row.children[1];
        const out = row.children[2];
        input.min = d.min;
        input.max = d.max;
        input.step = (d.max - d.min) / 200;
        input.value = d.def;
        out.textContent = Number(d.def).toFixed(2);

        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          out.textContent = v.toFixed(2);
          state.manualDirect[d.id] = v;
          savePrefs();
        });
        // 双击行 = 回到默认
        row.addEventListener('dblclick', (e) => {
          e.preventDefault();
          delete state.manualDirect[d.id];
          core.setParameterValueById(d.id, d.def);
          input.value = d.def;
          out.textContent = Number(d.def).toFixed(2);
          savePrefs();
        });
        body.appendChild(row);
      }

      head.addEventListener('click', () => {
        g.dataset.open = g.dataset.open === 'true' ? 'false' : 'true';
      });

      g.appendChild(head);
      g.appendChild(body);
      box.appendChild(g);
    }
    manualBuilt = true;
  }

  /* ================= 界面：手势映射 ================= */
  const GESTURE_MAP_DEFAULT = {
    Victory: 'expr:双手比耶.exp3.json',      // ✌ 双手比耶
    ILoveYou: 'expr:爱心眼.exp3.json',       // 🤟 爱心眼
    Thumb_Up: 'expr:开心兴奋.exp3.json',     // 👍 开心兴奋
    Open_Palm: 'expr:平常',                  // ✋ 收回所有表情
    Closed_Fist: 'motion:4',                 // ✊ 重锤出击
    Pointing_Up: 'expr:点菜按下.exp3.json',  // ☝ 举手点菜
    Thumb_Down: 'expr:悲伤.exp3.json',       // 👎 悲伤
  };

  function buildGestureMap() {
    const box = $('#gesture-map');
    box.innerHTML = '';
    const G = window.L2DFace.GESTURE_LABEL;
    for (const name of window.L2DFace.GESTURES) {
      if (name === 'None') continue;
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      // 「握拳 ✊」-> 文字 + 放大的 emoji
      const full = G[name] || name;
      const sp = full.lastIndexOf(' ');
      const emoji = sp > 0 ? full.slice(sp + 1) : '';
      label.textContent = emoji ? full.slice(0, sp) : full;
      if (emoji) {
        const em = document.createElement('i');
        em.className = 'hand';
        em.textContent = emoji;
        label.appendChild(em);
      }
      const sel = document.createElement('select');
      sel.dataset.gesture = name;

      const none = document.createElement('option');
      none.value = '';
      none.textContent = '无';
      sel.appendChild(none);

      const g1 = document.createElement('optgroup');
      g1.label = '表情 / 装扮 / 道具';
      const o0 = document.createElement('option');       // ✋ 用它收回所有表情
      o0.value = 'expr:平常';
      o0.textContent = '平常（收回所有表情）';
      g1.appendChild(o0);
      for (const tab of ['expr', 'deco', 'prop', 'motion']) {
        for (const f of TAB_FILES(tab)) {
          if (exprFiles.indexOf(f) < 0) continue;
          const o = document.createElement('option');
          o.value = 'expr:' + f;
          o.textContent = labelOfFile(f);
          g1.appendChild(o);
        }
      }
      sel.appendChild(g1);

      const g2 = document.createElement('optgroup');
      g2.label = '动作';
      CFG.motions.forEach((m, i) => {
        const o = document.createElement('option');
        o.value = 'motion:' + i;
        o.textContent = m.name;
        g2.appendChild(o);
      });
      sel.appendChild(g2);

      const cur = state.gestureMap[name] !== undefined ? state.gestureMap[name] : (GESTURE_MAP_DEFAULT[name] || '');
      sel.value = cur;
      if (sel.value !== cur) sel.value = '';
      sel.addEventListener('change', () => {
        state.gestureMap[name] = sel.value;
        savePrefs();
      });

      row.appendChild(label);
      row.appendChild(sel);
      box.appendChild(row);
    }
  }

  function onGesture(name) {
    const target = state.gestureMap[name] !== undefined ? state.gestureMap[name] : (GESTURE_MAP_DEFAULT[name] || '');
    if (!target) return;
    const label = window.L2DFace.GESTURE_LABEL[name] || name;
    const say = (what) => {                     // 触发反馈写在面板顶栏
      const st = $('#status');
      st.classList.remove('err');
      st.textContent = '手势 ' + label + ' → ' + what;
    };

    if (target === 'expr:平常') { exprStack.clear(); clearHeldPose(); refreshAll(); say('收回所有表情'); return; }
    if (target.indexOf('expr:') === 0) {
      const f = target.slice(5);
      if (exprStack.has(f) || exprFiles.indexOf(f) >= 0) { toggleExpression(f); say(labelOfFile(f)); }
      return;
    }
    if (target.indexOf('motion:') === 0) {
      const i = Number(target.slice(7));
      const m = CFG.motions[i];
      // 这一锤还在敲的过程中就别打断：否则手一直握着（识别会抖成 握拳/没握拳）
      // 会不停重播开头，看着就像“一直在抬手，却不敲下去”
      if (m && state.activeAnim === i && performance.now() - state.motionStartT < m.duration * 1000 * 0.9) {
        say((m.name || '动作') + ' 正在敲…');
        return;
      }
      playMotion(i, true);          // 播完了再握一次 = 再敲一锤
      say(m ? m.name : '动作');
    }
  }

  /* ================= 界面：跟踪方式 / 面捕 ================= */
  async function applySource(src) {
    state.source = src;
    $$('#opt-source button').forEach(b => { b.dataset.on = b.dataset.value === src ? 'true' : 'false'; });
    $('#face-box').hidden = src !== 'face';

    const needFace = src === 'face';
    const needGesture = state.gestureOn;
    const tip = $('#face-tip');
    const camRow = $('#cam-row');
    if (camRow) camRow.hidden = !(needFace || needGesture);

    if (needFace || needGesture) {
      try {
        await face.start(state.camId, needFace, needGesture);
        state.faceOn = needFace;
        updatePreviewVisible(true);
        refreshCamList();                 // 授权之后设备名才有内容
        $('#face-state').textContent = needFace ? '正在校准，请正对摄像头…' : '手势已开启（未开面捕）';
        tip.classList.remove('warn');
        tip.textContent = '画面只在本地处理，不会上传；双击预览可重新校准（会同时记录中性嘴型）。'
          + '「嘴部灵敏度」同时放大张嘴和笑，觉得笑得不明显就往右拖。';
      } catch (err) {
        state.faceOn = false;
        face.stop();
        updatePreviewVisible(false);
        if (needFace) {
          state.source = 'mouse';
          $$('#opt-source button').forEach(b => { b.dataset.on = b.dataset.value === 'mouse' ? 'true' : 'false'; });
          $('#face-box').hidden = true;
          if (camRow) camRow.hidden = !state.gestureOn;
          $('#face-state').textContent = '打不开摄像头';
          tip.textContent = String((err && err.message) || err);
          tip.classList.add('warn');
          const st = $('#status');          // 面板顶栏也提示一下，不然用户不知道为什么没反应
          st.textContent = '面捕不可用：' + String((err && err.message) || err);
          st.classList.add('err');
        } else {
          state.gestureOn = false;
          $('#opt-gesture').checked = false;
          $('#gesture-box').hidden = true;
          logErr(err);
        }
      }
    } else {
      face.stop();
      state.faceOn = false;
      updatePreviewVisible(false);
      $('#face-state').textContent = '未开启';
    }
    refreshAll();
  }

  /** 预览小窗只在「摄像头开着 + 用户没手动关掉」时出现 */
  function updatePreviewVisible(on) {
    const wrap = $('#face-preview-wrap');
    if (wrap) wrap.hidden = !(on && state.showPreview);
  }

  /* ---------------- 摄像头列表 / 切换 ---------------- */
  async function refreshCamList() {
    const cams = await face.listCams();
    const sel = $('#opt-cam');
    if (!sel) return cams;
    sel.innerHTML = '';
    if (!cams.length) {
      const o = document.createElement('option');
      o.value = '';
      o.textContent = '（没找到摄像头）';
      sel.appendChild(o);
      return cams;
    }
    for (const c of cams) {
      const o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.label;
      sel.appendChild(o);
    }
    if (state.camId && cams.some(c => c.id === state.camId)) sel.value = state.camId;
    else { state.camId = cams[0].id; sel.value = state.camId; }
    return cams;
  }

  /** 切换摄像头：正在用时立刻重开，换完重新校准 */
  async function switchCamera(deviceId) {
    if (!deviceId || deviceId === state.camId) return;
    state.camId = deviceId;
    const sel = $('#opt-cam');
    if (sel && sel.value !== deviceId) sel.value = deviceId;
    savePrefs();

    if (!(state.source === 'face' || state.gestureOn)) return;   // 没在用摄像头，先记下来就行

    face.stop();
    try {
      await face.start(state.camId, state.source === 'face', state.gestureOn);
      state.faceOn = state.source === 'face';
      updatePreviewVisible(true);
      if (state.faceOn) face.recalibrate();                      // 换了镜头，重新采集中性姿势
      await refreshCamList();
      const st = $('#status');
      st.classList.remove('err');
      st.textContent = '已切换摄像头' + (state.faceOn ? '（重新校准中，请正对摄像头）' : '');
    } catch (err) {
      updatePreviewVisible(false);
      const st = $('#status');
      st.textContent = '切换摄像头失败：' + String((err && err.message) || err);
      st.classList.add('err');
    }
  }

  /** 预览窗上的 ⟳：在多个摄像头之间轮着切 */
  async function cycleCamera() {
    const cams = await refreshCamList();
    const st = $('#status');
    if (!cams.length) { st.textContent = '没找到摄像头'; st.classList.add('err'); return; }
    if (cams.length < 2) { st.textContent = '只有一个摄像头，不用切'; return; }
    const idx = cams.findIndex(c => c.id === state.camId);
    await switchCamera(cams[(idx + 1) % cams.length].id);
  }

  async function applyGesture(on) {
    state.gestureOn = !!on;
    $('#gesture-box').hidden = !on;
    await applySource(state.source);       // 统一按「是否需要摄像头」启停
    savePrefs();
  }

  function startFaceStatusLoop() {
    setInterval(() => {
      updateCardSums();
      const el = $('#face-state');
      if (!el) return;
      if (state.faceOn) {
        if (!face.detected) {
          el.textContent = '未检测到人脸';
        } else {
          const m = face.mouth || { smile: 0.5, open: 0 };
          el.textContent = '运行中 · 笑 ' + Math.round(m.smile * 100) + '% · 张嘴 ' + Math.round(m.open * 100) + '%';
        }
      } else if (state.gestureOn) {
        const g = face.gesture && face.gesture !== 'None'
          ? ' · 当前：' + (window.L2DFace.GESTURE_LABEL[face.gesture] || face.gesture) : '';
        el.textContent = '手势已开启（未开面捕）' + g;
      } else {
        el.textContent = '未开启';
      }
    }, 400);
  }

  /* ================= 界面：设置页卡片折叠 ================= */
  function initCards() {
    $$('#panel .card').forEach((card) => {
      const key = 'ds-card-' + card.dataset.key;
      try {
        const saved = localStorage.getItem(key);
        if (saved !== null) card.dataset.open = saved;      // 记住每张卡片的开合
      } catch (e) { /* 忽略 */ }
      card.querySelector('.card-head').addEventListener('click', () => {
        const open = card.dataset.open !== 'true';
        card.dataset.open = open ? 'true' : 'false';
        try { localStorage.setItem(key, card.dataset.open); } catch (e) { /* 忽略 */ }
        applyPanelPos();                                   // 高度变了，重新贴一下视口
      });
    });
  }

  /* 收起状态也能一眼看到设置：卡片右上角的状态摘要 */
  const BG_LABEL = { transparent: '透明', dark: '深色', green: '绿幕', white: '纯白' };
  function updateCardSums() {
    const mode = state.source === 'face' ? '面捕' : (state.source === 'mouse' ? '鼠标' : '关闭');
    const el = (id) => document.getElementById(id);
    const t = el('sum-track');
    if (t) t.textContent = mode + (state.source === 'off' ? '' : (state.mouseFollow ? ' · 跟随' : ''));
    const g = el('sum-gesture');
    if (g) g.textContent = state.gestureOn ? ('已开启 · ' + Object.keys(state.gestureMap).length + ' 个') : '关闭';
    const a = el('sum-audio');
    if (a) a.textContent = $('#opt-mic').checked ? ('灵敏度 ' + $('#opt-micgain').value) : '关闭';
    const v = el('sum-view');
    if (v) v.textContent = (BG_LABEL[state.bg] || state.bg) + ' · 缩放 ' + state.zoom.toFixed(2);
    const p = el('sum-params');
    if (p) {
      const n = Object.keys(state.manualDirect).length + Object.keys(state.manual).length;
      p.textContent = n ? ('已改 ' + n + ' 项') : '未改动';
    }
    const m = el('sum-misc');
    if (m) m.textContent = '记住设置：' + (state.remember ? '开' : '关');
  }

  /* ================= 界面：手动参数浮层 ================= */
  function openParamModal(on) {
    const modal = $('#param-modal');
    if (!modal) return;
    modal.hidden = !on;
    const btn = $('#btn-open-params');
    if (btn) btn.textContent = on ? '关闭参数面板' : '打开参数面板';
    if (on) {
      fitDrawer();                    // 兜底：不管位置从哪来，打开时都保证整块看得见
      const s = $('#param-search');
      setTimeout(() => { try { s.focus(); } catch (e) { /* 忽略 */ } }, 30);
    }
  }

  /** 幂等渲染参数抽屉：把“用户位置”夹进视口后落样式，不改 state.drawer */
  function applyDrawer() {
    const box = document.querySelector('.pm-box');
    const d = state.drawer;
    if (!box || !d) return;
    const w = Math.min(d.w > 0 ? d.w : 372, window.innerWidth - 16);
    const h = d.h > 0 ? Math.min(d.h, window.innerHeight - 16) : 0;   // 0 = 高度交给 CSS（上下贴边）
    const l = E.clamp(d.l, 8, Math.max(8, window.innerWidth - w - 8));
    const t = E.clamp(d.t, 8, Math.max(8, window.innerHeight - (h || 160) - 8));
    box.style.left = Math.round(l) + 'px';
    box.style.top = Math.round(t) + 'px';
    box.style.width = Math.round(w) + 'px';
    if (h > 0) box.style.height = Math.round(h) + 'px';
    else box.style.removeProperty('height');
    box.style.right = 'auto';
    box.style.bottom = 'auto';
  }

  // 打开抽屉时的兜底：不管位置从哪来，都保证整块看得见（合法时什么都不做）
  function fitDrawer() {
    const box = document.querySelector('.pm-box');
    if (!box) return;
    if (state.drawer) { applyDrawer(); return; }   // 有用户摆过的坐标：按它渲染（自动夹进视口）
    const w0 = box.offsetWidth, h0 = box.offsetHeight;
    if (!w0 || !h0) return;
    const w = Math.min(w0, window.innerWidth - 16);
    const h = Math.min(h0, window.innerHeight - 16);
    const l = E.clamp(box.offsetLeft, 8, Math.max(8, window.innerWidth - w - 8));
    const t = E.clamp(box.offsetTop, 8, Math.max(8, window.innerHeight - h - 8));
    if (l === box.offsetLeft && t === box.offsetTop && w === w0 && h === h0) return;   // 没拖过又合法：保持 CSS 默认（贴左）
    state.drawer = { v: 2, l, t, w, h };
    applyDrawer();
    savePrefs();
  }
  const paramModalOpen = () => !$('#param-modal').hidden;

  /* ================= 界面：八向拖拽改大小 =================
   * 上下左右四条边 + 四个角都能拖；拖动时按“对边不动”重算位置和尺寸。
   * 双击任意把手恢复默认大小。 */
  const RESIZE_DIRS = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];

  function buildResizeHandles(box) {
    for (const d of RESIZE_DIRS) {
      const h = document.createElement('div');
      h.className = 'rz rz-' + d;
      h.dataset.dir = d;
      h.title = '拖动调整大小（双击恢复默认）';
      box.appendChild(h);
    }
  }

  /**
   * @param {HTMLElement} box   被调整的元素（需 position: fixed/absolute）
   * @param {object} opts
   *   min: {w, h}          最小尺寸
   *   apply(rect)          实时应用 {l, t, w, h}
   *   reset()              双击恢复默认
   *   after()              松手后（保存）
   */
  function initResize8(box, opts) {
    if (!box) return;
    buildResizeHandles(box);
    let st = null;

    const onDown = (e) => {
      const handle = e.currentTarget;
      const dir = handle.dataset.dir;
      const r = box.getBoundingClientRect();
      st = { dir, sx: e.clientX, sy: e.clientY, l: r.left, t: r.top, w: r.width, h: r.height };
      handle.classList.add('active');
      box.style.transition = 'none';
      try { handle.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      e.preventDefault();
      e.stopPropagation();

      const move = (ev) => {
        if (!st) return;
        const dx = ev.clientX - st.sx;
        const dy = ev.clientY - st.sy;
        const maxW = window.innerWidth - 8;
        const maxH = window.innerHeight - 8;
        let l = st.l, t = st.t, w = st.w, h = st.h;

        if (st.dir.indexOf('e') >= 0) w = st.w + dx;
        if (st.dir.indexOf('s') >= 0) h = st.h + dy;
        if (st.dir.indexOf('w') >= 0) { w = st.w - dx; l = st.l + dx; }
        if (st.dir.indexOf('n') >= 0) { h = st.h - dy; t = st.t + dy; }

        // 限制尺寸；被卡住时把对应边“钉”回原位，保证对边不动
        const nw = E.clamp(w, opts.min.w, maxW);
        const nh = E.clamp(h, opts.min.h, maxH);
        if (nw !== w) { if (st.dir.indexOf('w') >= 0) l = st.l + st.w - nw; w = nw; } else { w = nw; }
        if (nh !== h) { if (st.dir.indexOf('n') >= 0) t = st.t + st.h - nh; h = nh; } else { h = nh; }

        // 别跑出屏幕
        l = E.clamp(l, 0, Math.max(0, window.innerWidth - w));
        t = E.clamp(t, 0, Math.max(0, window.innerHeight - h));

        opts.apply({ l: Math.round(l), t: Math.round(t), w: Math.round(w), h: Math.round(h) });
      };

      const up = (ev) => {
        if (!st) return;
        st = null;
        box.style.transition = '';
        document.querySelectorAll('.rz.active').forEach(x => x.classList.remove('active'));
        if (opts.after) opts.after();
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (ev && ev.pointerId !== undefined && handle.hasPointerCapture &&
          handle.hasPointerCapture(ev.pointerId)) {
          try { handle.releasePointerCapture(ev.pointerId); } catch (err) { /* 忽略 */ }
        }
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    };

    box.querySelectorAll('.rz').forEach((h) => {
      h.addEventListener('pointerdown', onDown);
      h.addEventListener('dblclick', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (opts.reset) opts.reset();
        if (opts.after) opts.after();
      });
    });
  }

  function initResizes() {
    // 控制面板
    initResize8($('#panel'), {
      min: { w: 320, h: 220 },
      apply: (r) => {
        state.panelW = r.w;
        state.panelH = r.h;
        panelPos.x = r.l;
        panelPos.y = r.t;
        const panel = $('#panel');
        panel.style.width = r.w + 'px';
        panel.style.height = r.h + 'px';
        panel.style.left = r.l + 'px';
        panel.style.top = r.t + 'px';
        panel.style.maxHeight = 'none';
      },
      reset: () => {
        state.panelW = 0;
        state.panelH = 0;
        const panel = $('#panel');
        panel.style.width = '';
        panel.style.height = '';
        panelPos = { x: PANEL_DEF.x, y: PANEL_DEF.y };
        applyPanelPos();
      },
      after: savePrefs,
    });

    // 参数抽屉（打开时才布局，这里只接管把手）
    const drawer = document.querySelector('.pm-box');
    initResize8(drawer, {
      min: { w: 300, h: 240 },
      apply: (r) => {
        state.drawer = { v: 2, l: r.l, t: r.t, w: r.w, h: r.h };   // 用户拖出来的位置尺寸即“真相”
        applyDrawer();
      },
      reset: () => {
        for (const k of ['left', 'top', 'right', 'bottom', 'width', 'height']) drawer.style.removeProperty(k);
        state.drawer = null;
      },
      after: savePrefs,
    });

    // 窗口变化：只把抽屉挤回可见区，绝不改写用户坐标（窗口还原就回原位）
    window.addEventListener('resize', applyDrawer);
  }

  /* ================= 界面：控件绑定 ================= */
  function bindControls() {
    initPanelDrag();
    initResizes();                                 // 拖边缘改大小
    face.attach($('#face-preview'));
    $('#face-preview-hide').addEventListener('click', () => {
      state.showPreview = false;
      $('#opt-showpreview').checked = false;
      updatePreviewVisible(false);
      savePrefs();
    });
    $('#opt-showpreview').addEventListener('change', (e) => {
      state.showPreview = e.target.checked;
      updatePreviewVisible(state.faceOn || state.gestureOn);
      savePrefs();
    });

    $('#dock').addEventListener('click', togglePanel);
    $('#collapse').addEventListener('click', () => setCollapsed($('#panel').dataset.collapsed !== 'true'));
    $('#btn-fold').addEventListener('click', () => setCollapsed(true));

    $$('#tabs .tab').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));

    initCards();                                   // 设置页的折叠卡片

    // 手动参数抽屉（右侧滑出，不挡人物）
    $('#btn-open-params').addEventListener('click', () => openParamModal(!paramModalOpen()));
    $('#param-close').addEventListener('click', () => openParamModal(false));

    // 跟踪方式
    $$('#opt-source button').forEach(b => b.addEventListener('click', () => applySource(b.dataset.value)));

    // 面捕设置
    $('#opt-facegain').addEventListener('input', (e) => {
      state.faceHeadGain = parseFloat(e.target.value);
      face.opts.headGain = state.faceHeadGain;
      $('#v-facegain').textContent = state.faceHeadGain.toFixed(2);
      savePrefs();
    });
    $('#opt-facesmooth').addEventListener('input', (e) => {
      state.faceSmooth = parseFloat(e.target.value);
      face.opts.smooth = state.faceSmooth;
      $('#v-facesmooth').textContent = String(state.faceSmooth);
      savePrefs();
    });
    $('#opt-mouthgain').addEventListener('input', (e) => {
      state.faceMouthGain = parseFloat(e.target.value);
      face.opts.mouthGain = state.faceMouthGain;
      $('#v-mouthgain').textContent = state.faceMouthGain.toFixed(2);
      savePrefs();
    });
    $('#opt-faceblink').addEventListener('change', (e) => { state.faceBlink = e.target.checked; savePrefs(); });
    $('#opt-cam').addEventListener('change', (e) => switchCamera(e.target.value));
    $('#btn-cam-refresh').addEventListener('click', async (e) => {
      e.preventDefault();
      const cams = await refreshCamList();
      const st = $('#status');
      st.classList.remove('err');
      st.textContent = cams.length ? ('找到 ' + cams.length + ' 个摄像头') : '没找到摄像头';
    });
    $('#face-preview-switch').addEventListener('click', (e) => { e.preventDefault(); cycleCamera(); });
    $('#face-preview').addEventListener('dblclick', () => face.recalibrate());

    // 手势
    $('#opt-gesture').addEventListener('change', (e) => applyGesture(e.target.checked));
    face.onGesture = onGesture;
    face.onState = (s) => {
      const el = $('#face-state');
      if (el) el.textContent = s + (face.detected ? '' : (s === '运行中' ? '（未检测到人脸）' : ''));
    };

    // 鼠标跟随
    $('#opt-mouse').addEventListener('change', (e) => { state.mouseFollow = e.target.checked; savePrefs(); });
    $('#opt-range').addEventListener('input', (e) => {
      state.range = parseFloat(e.target.value);
      $('#v-range').textContent = state.range.toFixed(2);
      savePrefs();
    });
    $('#opt-body').addEventListener('change', (e) => { state.bodyFollow = e.target.checked; savePrefs(); });
    $('#opt-blink').addEventListener('change', (e) => { state.blink = e.target.checked; blinker.enabled = e.target.checked; savePrefs(); });
    $('#opt-breath').addEventListener('change', (e) => { state.breath = e.target.checked; savePrefs(); });

    // 麦克风
    $('#opt-micgain').addEventListener('input', (e) => { $('#v-micgain').textContent = e.target.value; savePrefs(); });
    $('#opt-mic').addEventListener('change', async (e) => {
      try { await setMic(e.target.checked); }
      catch (err) { e.target.checked = false; logErr(err); }
    });

    // 手动参数（输入源级）
    const manualDefs = [
      { key: 'Brows', label: '眉毛高度', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'MouthSmile', label: '微笑', min: 0, max: 1, step: 0.01, def: 0.5 },
      { key: 'TongueOut', label: '吐舌', min: 0, max: 1, step: 0.01, def: 0 },
      { key: 'MouthX', label: '嘴横向', min: -0.2, max: 0.2, step: 0.005, def: 0 },
    ];
    const mp = $('#manual-params');
    // 先把这 4 个常用项放在最前面（一个「常用」分组），后面的全集在 buildManualParams 里补
    const quick = document.createElement('div');
    quick.className = 'pgroup';
    quick.dataset.open = 'true';
    quick.dataset.quick = '1';
    const qh = document.createElement('button');
    qh.type = 'button';
    qh.className = 'phead';
    qh.innerHTML = '<span class="chev">▾</span><span>常用</span><span class="pcount">4</span>';
    const qb = document.createElement('div');
    qb.className = 'pbody';
    for (const d of manualDefs) {
      const row = document.createElement('label');
      row.className = 'row';
      row.innerHTML = `<span>${d.label}</span><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${d.def}"><b>${d.def}</b>`;
      const input = row.querySelector('input');
      const out = row.querySelector('b');
      input.dataset.manualKey = d.key;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        out.textContent = v.toFixed(2);
        state.manual[d.key] = v;
        savePrefs();
      });
      qb.appendChild(row);
    }
    qh.addEventListener('click', () => { quick.dataset.open = quick.dataset.open === 'true' ? 'false' : 'true'; });
    quick.appendChild(qh);
    quick.appendChild(qb);
    mp.appendChild(quick);

    // 搜索参数：按名字或 ParamId 过滤，命中的组自动展开
    $('#param-search').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('#manual-params .pgroup').forEach((g) => {
        let shown = 0;
        g.querySelectorAll('.row').forEach((row) => {
          const hit = !q
            || row.textContent.toLowerCase().indexOf(q) >= 0
            || (row.title || '').toLowerCase().indexOf(q) >= 0;
          row.style.display = hit ? '' : 'none';
          if (hit) shown++;
        });
        if (q) {
          g.style.display = shown ? '' : 'none';
          g.dataset.open = shown ? 'true' : 'false';
        } else {
          g.style.display = '';
          g.dataset.open = g.dataset.quick ? 'true' : 'false';
        }
      });
    });

    $('#manual-reset').addEventListener('click', () => {
      state.manual = {};
      state.manualDirect = {};
      $$('#manual-params input[type="range"]').forEach((inp) => {
        if (inp.dataset.manualKey) {
          inp.value = inp.defaultValue;
          inp.nextElementSibling.textContent = parseFloat(inp.defaultValue).toFixed(2);
        } else {
          const id = inp.parentElement.dataset.id;
          const def = state.defaults[id];
          inp.value = def !== undefined ? def : inp.defaultValue;
          inp.nextElementSibling.textContent = parseFloat(inp.value).toFixed(2);
        }
      });
      savePrefs();
    });

    // 视图
    $('#opt-zoom').addEventListener('input', (e) => {
      setZoom(parseFloat(e.target.value));
    });
    $('#btn-reset-view').addEventListener('click', resetView);
    $('#opt-bg').addEventListener('change', (e) => {
      state.bg = e.target.value;
      document.body.dataset.bg = state.bg;
      savePrefs();
    });

    // 其它
    $('#opt-remember').addEventListener('change', (e) => {
      state.remember = e.target.checked;
      try { localStorage.setItem(REMEMBER_KEY, state.remember ? '1' : '0'); } catch (err) { /* 忽略 */ }
      if (state.remember) savePrefs();
      $('#tip-remember').textContent = state.remember
        ? '已打开：跟踪方式 / 开关 / 滑块 / 当前表情会记在本机，刷新后照旧。'
        : '已关闭：这次改动只在当前窗口生效，刷新后回到默认。';
    });

    $('#btn-selftest').addEventListener('click', () => selfTest());
    startFaceStatusLoop();
  }

  /* ================= 快捷键说明 ================= */
  function buildHotkeyHelp() {
    const help = $('#hotkey-help');
    if (!help) return;             // 挂件模式没有这块（键盘热键本来也不接管）
    help.innerHTML = '';
    for (const hk of CFG.hotkeys) {
      const keys = (hk.triggers || []).filter(Boolean).join(' + ') || '—';
      const d = document.createElement('div');
      d.innerHTML = `<span>${hk.name}</span><span>${keys}</span>`;
      help.appendChild(d);
    }
  }

  /* ================= 恢复上次的设置 ================= */
  async function restorePrefs() {
    // 记住设置开关
    $('#opt-remember').checked = state.remember;
    if (!state.remember) $('#tip-remember').textContent = '已关闭：这次改动只在当前窗口生效，刷新后回到默认。';

    const set = (sel, v) => { const el = $(sel); if (el && v !== undefined && v !== null) el.checked = !!v; };
    const setVal = (sel, v) => { const el = $(sel); if (el && v !== undefined && v !== null) el.value = v; };

    if (prefs.mouseFollow !== undefined) set('#opt-mouse', prefs.mouseFollow);
    if (prefs.bodyFollow !== undefined) set('#opt-body', prefs.bodyFollow);
    if (prefs.blink !== undefined) set('#opt-blink', prefs.blink);
    if (prefs.breath !== undefined) set('#opt-breath', prefs.breath);
    if (prefs.range !== undefined) setVal('#opt-range', prefs.range);
    if (prefs.zoom !== undefined) setVal('#opt-zoom', prefs.zoom);
    if (prefs.micGain !== undefined) setVal('#opt-micgain', prefs.micGain);

    state.mouseFollow = $('#opt-mouse').checked;
    state.bodyFollow = $('#opt-body').checked;
    state.blink = $('#opt-blink').checked;
    state.breath = $('#opt-breath').checked;
    state.range = parseFloat($('#opt-range').value);
    state.zoom = parseFloat($('#opt-zoom').value);
    blinker.enabled = state.blink;

    $('#v-range').textContent = state.range.toFixed(2);
    $('#v-zoom').textContent = state.zoom.toFixed(2);
    $('#v-micgain').textContent = $('#opt-micgain').value;

    if (prefs.bg) {
      state.bg = prefs.bg;
      setVal('#opt-bg', prefs.bg);
      document.body.dataset.bg = state.bg;
    } else {
      document.body.dataset.bg = $('#opt-bg').value;
    }
    layout();

    // 挂件：恢复人物位置（旧语义坐标直接丢弃 → 回到右下角）
    if (isEmbed) {
      initStageCanvas();
      if (prefs.stageVer === 2 && prefs.stagePos && isFinite(prefs.stagePos.x) && isFinite(prefs.stagePos.y)) {
        stagePos = { x: prefs.stagePos.x, y: prefs.stagePos.y };
      }
      layout();
      applyStage();
    }

    // 面捕相关
    const f = prefs.face || {};
    if (f.headGain !== undefined) state.faceHeadGain = f.headGain;
    if (f.smooth !== undefined) state.faceSmooth = f.smooth;
    if (f.mouthGain !== undefined) state.faceMouthGain = f.mouthGain;
    if (f.blink !== undefined) state.faceBlink = f.blink;
    if (f.showPreview !== undefined) state.showPreview = f.showPreview;
    if (f.camId) state.camId = f.camId;
    $('#opt-showpreview').checked = state.showPreview;
    face.opts.headGain = state.faceHeadGain;
    face.opts.smooth = state.faceSmooth;
    face.opts.mouthGain = state.faceMouthGain;
    setVal('#opt-facegain', state.faceHeadGain);
    setVal('#opt-facesmooth', state.faceSmooth);
    setVal('#opt-mouthgain', state.faceMouthGain);
    set('#opt-faceblink', state.faceBlink);
    $('#v-facegain').textContent = state.faceHeadGain.toFixed(2);
    $('#v-facesmooth').textContent = String(state.faceSmooth);
    $('#v-mouthgain').textContent = state.faceMouthGain.toFixed(2);

    // 摄像头下拉
    await refreshCamList();
    $('#cam-row').hidden = !(state.source === 'face' || state.gestureOn);

    // 手势
    const gs = prefs.gesture || {};
    if (gs.map) state.gestureMap = gs.map;
    buildGestureMap();

    // 手动参数
    if (prefs.manual) {
      state.manual = prefs.manual;
      for (const k in state.manual) {
        const inp = document.querySelector('#manual-params input[data-manual-key="' + k + '"]');
        if (inp) { inp.value = state.manual[k]; inp.nextElementSibling.textContent = Number(state.manual[k]).toFixed(2); }
      }
    }
    if (prefs.manualDirect) {
      state.manualDirect = prefs.manualDirect;
      for (const id in state.manualDirect) {
        const row = document.querySelector('#manual-params .row[data-id="' + id + '"]');
        if (row) {
          const inp = row.querySelector('input');
          const out = row.querySelector('b');
          inp.value = state.manualDirect[id];
          out.textContent = Number(state.manualDirect[id]).toFixed(2);
        }
      }
    }

    // 上次开着的表情
    if (prefs.expressions && prefs.expressions.length) {
      for (const f2 of prefs.expressions) {
        if (exprFiles.indexOf(f2) >= 0) exprStack.set(f2, f2, true, 0.01);
      }
    }

    // 面板 / 抽屉尺寸（上次拖过的）
    if (prefs.panelW) state.panelW = prefs.panelW;
    if (prefs.panelH) state.panelH = prefs.panelH;
    if (state.panelW || state.panelH) applyPanelPos();
    // 参数抽屉的位置（v2 起才记；旧版记的是“贴右”时代的坐标，直接丢弃改用新默认：贴左）
    if (prefs.drawer && prefs.drawer.v === 2) {
      state.drawer = {
        v: 2,
        l: prefs.drawer.l || 8,
        t: prefs.drawer.t || 8,
        w: prefs.drawer.w > 0 ? prefs.drawer.w : 372,
        h: prefs.drawer.h > 0 ? prefs.drawer.h : 0,   // 0 = 高度交给 CSS（上下贴边）
      };
      applyDrawer();
    }

    // 标签页 / 跟踪方式
    setTab(prefs.tab && $('#tabs .tab[data-tab="' + prefs.tab + '"]') ? prefs.tab : 'expr');
    const src = prefs.source || 'mouse';
    if (src === 'face') {
      await applySource('face');           // 会请求摄像头权限
    } else {
      await applySource(src === 'off' ? 'off' : 'mouse');
    }

    if (gs.on) {
      $('#opt-gesture').checked = true;
      await applyGesture(true);
    }
    refreshAll();
  }

  /* ================= 自检 ================= */
  async function selfTest(quick) {
    const box = $('#selftest');
    box.hidden = false;
    const out = [];
    const ok = (cond, msg) => { out.push((cond ? '[OK] ' : '[FAIL] ') + msg); return cond; };
    const push = () => { box.textContent = out.join('\n'); box.scrollTop = box.scrollHeight; };
    const allIds = Object.keys(state.defaults);

    const t0 = performance.now();
    ok(!!model, '模型已加载');
    ok(core.getParameterCount() > 100, '参数数量 = ' + core.getParameterCount());
    ok(exprStack.defs.size === exprFiles.length, `表情加载 ${exprStack.defs.size}/${exprFiles.length}`);
    ok(!!im.physics, '物理演算已启用');
    ok(CFG.motions.length > 0, '动作数量 = ' + CFG.motions.length);
    push();

    const keep = { x: state.inputs.MousePositionX, y: state.inputs.MousePositionY };
    const keepSource = state.source;
    state.source = 'mouse';
    probe.reset(['ParamAngleX', 'ParamAngleY', 'ParamEyeBallX', 'ParamEyeBallY', 'ParamBodyAngleX']);
    state.inputs.MousePositionX = 0.95; state.inputs.MousePositionY = 0.85;
    await wait(1000);
    const s1 = probe.stats;
    ok(s1.ParamAngleX.max > 3, `鼠标右移 → ParamAngleX 峰值 ${s1.ParamAngleX.max.toFixed(2)}`);
    ok(s1.ParamEyeBallX.max > 0.5, `鼠标右移 → ParamEyeBallX 峰值 ${s1.ParamEyeBallX.max.toFixed(2)}`);
    probe.reset(['ParamAngleX', 'ParamAngleY', 'ParamEyeBallX', 'ParamEyeBallY', 'ParamBodyAngleX']);
    state.inputs.MousePositionX = -0.95; state.inputs.MousePositionY = -0.85;
    await wait(1000);
    const s2 = probe.stats;
    ok(s2.ParamAngleX.min < -3, `鼠标左移 → ParamAngleX 谷值 ${s2.ParamAngleX.min.toFixed(2)}`);
    ok(s2.ParamEyeBallY.min < -0.1, `鼠标下移 → ParamEyeBallY 谷值 ${s2.ParamEyeBallY.min.toFixed(2)}`);
    state.inputs.MousePositionX = keep.x; state.inputs.MousePositionY = keep.y;
    state.source = keepSource;
    await wait(400);
    push();

    probe.reset(['ParamEyeLOpen', 'ParamEyeROpen']);
    await wait(6000);
    ok(probe.stats.ParamEyeLOpen.min < 0.35,
      `自动眨眼：6 秒内最小眼开合 ${probe.stats.ParamEyeLOpen.min.toFixed(2)}`);
    push();

    const list = quick ? exprFiles.slice(0, 8) : exprFiles;
    let exprOk = 0;
    exprStack.clear();
    await wait(400);
    for (const f of list) {
      const def = exprStack.defs.get(f);
      const ids = ((def && def.Parameters) || []).map(p => p.Id).filter(id => state.defaults[id] !== undefined);
      if (!ids.length) { out.push('    (跳过，无参数) ' + f); continue; }
      probe.reset(ids);
      await wait(120);
      const before = {}; ids.forEach(id => before[id] = probe.stats[id].last);
      exprStack.set(f, f, true, 0.05);
      await wait(300);
      const moved = ids.some(id => Math.abs(probe.stats[id].last - before[id]) > 0.01);
      if (moved) exprOk++; else out.push('    没变化：' + f);
      exprStack.set(f, f, false, 0.05);
      await wait(150);
    }
    ok(exprOk === list.length, `表情生效 ${exprOk}/${list.length}`);
    exprStack.clear();
    await wait(300);
    push();

    let moOk = 0;
    for (let i = 0; i < CFG.motions.length; i++) {
      probe.reset(allIds);
      model.motion('Idle', 0, 3);
      await wait(400);
      const base = probe.fp;
      state.activeAnim = -1;
      model.motion('Tap', i, 3);
      await wait(600);
      const d = Math.abs(probe.fp - base);
      if (d > 0.05) moOk++; else out.push(`    动作无变化：${CFG.motions[i].name} (Δ=${d.toFixed(3)})`);
      model.motion('Idle', 0, 3);
      await wait(200);
    }
    ok(moOk === CFG.motions.length, `动作播放 ${moOk}/${CFG.motions.length}`);
    push();

    const testHk = CFG.hotkeys.find(h => h.action === 'ToggleExpression' && !h.holdOnKey);
    if (testHk) {
      const keys = (testHk.triggers || []).filter(Boolean);
      let fired = [];
      for (const k of keys) fired = fired.concat(matcher.keyDown(k));
      ok(fired.length > 0, `热键匹配：${testHk.name}（${keys.join(' + ')}）`);
      keys.forEach(k => matcher.keyUp(k));
    }

    out.push(`用时 ${((performance.now() - t0) / 1000).toFixed(1)}s，错误 ${state.errors.length} 条`);
    if (state.errors.length) out.push(state.errors.join('\n'));
    push();
    console.log(out.join('\n'));
    return out.join('\n');
  }

  /* ================= 面板 / 全屏 ================= */
  function togglePanel() {
    const p = $('#panel');
    p.dataset.open = p.dataset.open === 'false' ? 'true' : 'false';
  }
  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }

  /* ================= 启动 ================= */
  function boot() {
    bindControls();
    buildChips();
    buildHotkeyHelp();

    if (isEmbed) {
      // 挂件默认状态：面板收起成一条小标题栏，贴在模型上方右侧
      const panel = $('#panel');
      panel.dataset.collapsed = 'true';
      panel.dataset.open = 'true';
      const btn = $('#collapse');
      if (btn) { btn.textContent = '＋'; btn.title = '展开面板'; }

      let savedPos = null;
      try { savedPos = JSON.parse(localStorage.getItem(PANEL_POS_KEY) || 'null'); } catch (e) { /* 忽略 */ }
      if (!savedPos) {                      // 首次打开才用默认位置，之后尊重用户拖的位置
        const pw = panel.offsetWidth || 372;
        panelPos = {
          x: Math.max(8, window.innerWidth - pw - 8),
          y: 72,                            // 贴右侧、让开博客顶栏；展开后最多半屏，正好停在模型上方
        };
      }
      applyPanelPos();

      // 人物：启动时按当前位置（默认右下角）定位一次 —— 之后窗口怎么变都不再漂
      applyStageScale();
    }

    setTab('expr');
    load()
    .then(async () => {
      const q = new URLSearchParams(location.search);
      if (q.has('selftest')) await selfTest(q.get('selftest') === 'fast');
      if (q.has('expr')) {
        for (const n of q.get('expr').split(',')) {
          const f = exprFiles.find(x => x.indexOf(n) === 0);
          if (f) exprStack.set(f, f, true, 0.01);
        }
        refreshAll();
      }
      if (q.has('mouse')) {
        const [x, y] = q.get('mouse').split(',').map(Number);
        state.inputs.MousePositionX = x; state.inputs.MousePositionY = y;
      }
      window.__ready = true;
    })
    .catch(logErr);
  }

  if (isEmbed) {
    // 挂件：等页面空闲再加载模型，别跟博客首屏抢带宽
    if ('requestIdleCallback' in window) requestIdleCallback(boot, { timeout: 2500 });
    else setTimeout(boot, 900);
  } else {
    boot();
  }

  window.__debug = {
    state, CFG, probe, face, prefs,
    get model() { return model; },
    get app() { return app; },
    get core() { return core; },
    exprStack, mapperMouse, mapperFace, matcher, selfTest,
    toggleExpression, playMotion, applySource, savePrefs,
  };
})();
