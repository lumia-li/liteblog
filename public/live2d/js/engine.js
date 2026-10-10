/* ==========================================================================
 * engine.js —— 与 DOM 无关的核心逻辑层
 * 复刻 VTube Studio 的行为：参数映射 / 多表情叠加 / 眨眼 / 呼吸 / 热键匹配
 * 浏览器里挂到 window.L2DEngine，Node 里可直接 require 做单元测试
 * ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.L2DEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- 小工具 ---------------- */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /** 把 v 从 [inLo,inHi] 线性映射到 [outLo,outHi]（VTS 的 Input/Output Range） */
  function mapRange(v, inLo, inHi, outLo, outHi, clampIn, clampOut) {
    if (clampIn) v = clamp(v, Math.min(inLo, inHi), Math.max(inLo, inHi));
    const span = inHi - inLo;
    const t = span === 0 ? 0 : (v - inLo) / span;
    let out = outLo + (outHi - outLo) * t;
    if (clampOut) out = clamp(out, Math.min(outLo, outHi), Math.max(outLo, outHi));
    return out;
  }

  /** 帧率无关的指数平滑：smoothing 0=立刻跟随，100=几乎不动 */
  function smoothingAlpha(smoothing, dt) {
    const rate = clamp(1 - smoothing / 100, 0.02, 1); // 每帧(60fps)的收敛比例
    return 1 - Math.pow(1 - rate, dt * 60);
  }

  /* 保持"停在最后一帧"姿势时，这些参数必须让位给鼠标跟踪，否则头会僵住 */
  const TRACKED_PARAM_RE = /^(ParamAngle[XYZ]$|ParamBodyAngle[XYZ]$|ParamEyeBall[XY]$|ParamEye[LR]Open$|ParamBreath$|ParamMouthOpenY$)/;

  /* ---------------- 参数映射（VTS ParameterSettings） ---------------- */
  class ParamMapper {
    /**
     * @param {Array} settings config.js 里的 params（来自 vtube.json）
     */
    constructor(settings) {
      this.rows = settings.filter(r => r.id && r.input);
      this._state = new Map();
    }

    /**
     * @param {object} coreModel pixi-live2d-display 的 coreModel
     * @param {number} dt 秒
     * @param {object} inputs 例如 { MousePositionX:0.3, MousePositionY:-0.2, VoiceVolume:0.4 }
     */
    update(coreModel, dt, inputs) {
      for (const r of this.rows) {
        const raw = inputs[r.input];
        if (raw === undefined || raw === null || Number.isNaN(raw)) continue; // 该输入源不可用 -> 不动这个参数
        const target = mapRange(raw, r.inLo, r.inHi, r.outLo, r.outHi, r.clampIn, r.clampOut);
        const prev = this._state.has(r.id) ? this._state.get(r.id) : target;
        const v = prev + (target - prev) * smoothingAlpha(r.smoothing, dt);
        this._state.set(r.id, v);
        coreModel.setParameterValueById(r.id, v);
      }
    }

    /** 参数被外部（表情/动作）改过之后，重置平滑历史，避免弹回 */
    reset(id) { this._state.delete(id); }
  }

  /* ---------------- 自动眨眼 ---------------- */
  class Blinker {
    constructor() {
      this.enabled = true;
      this._open = 1;
      this._t = 0;
      this._next = 1 + Math.random() * 3;
      this._phase = -1;
      this._dur = 0.13;
      this._double = false;
    }
    update(dt) {
      if (!this.enabled) return 1;
      this._t += dt;
      if (this._phase < 0) {
        if (this._t >= this._next) {
          this._phase = 0; this._t = 0; this._dur = 0.11 + Math.random() * 0.05;
          this._next = 1.8 + Math.random() * 3.5;
          this._double = Math.random() < 0.18;
        }
        return 1;
      }
      const p = this._t / this._dur;
      if (p >= 1) {
        this._phase = -1; this._t = 0;
        if (this._double) { this._double = false; this._next = 0.13; } // 连眨第二下
        return 1;
      }
      // 前 45% 闭合，后 55% 睁开
      return p < 0.45 ? 1 - p / 0.45 : (p - 0.45) / 0.55;
    }
  }

  /* ---------------- 自动呼吸 ---------------- */
  class Breather {
    constructor(period) { this.period = period || 3.6; this.t = 0; this.enabled = true; }
    update(dt) {
      this.t = (this.t + dt) % this.period;
      return 0.5 - 0.5 * Math.cos((2 * Math.PI * this.t) / this.period); // 0..1
    }
  }

  /* ---------------- 表情叠加（支持多个表情同时生效） ---------------- */
  class ExpressionStack {
    constructor() {
      this.defs = new Map();   // file -> exp3 json
      this.active = [];        // {file, name, w, target, fade}
    }
    add(file, json) { this.defs.set(file, json); }
    has(file) { return this.defs.has(file); }
    isActive(name) { return this.active.some(a => a.name === name); }
    activeNames() { return this.active.filter(a => a.target > 0).map(a => a.name); }

    /** 打开/关闭表情；fade 为淡入淡出秒数 */
    toggle(name, file, fade) {
      const found = this.active.find(a => a.name === name);
      if (found && found.target > 0) { found.target = 0; return false; }
      if (found) { found.target = 1; return true; }
      this.active.push({ name, file, w: 0, target: 1, fade: Math.max(fade || 0.15, 0.01) });
      return true;
    }
    set(name, file, on, fade) {
      const found = this.active.find(a => a.name === name);
      if (on) {
        if (found) { found.target = 1; return true; }
        this.active.push({ name, file, w: 0, target: 1, fade: Math.max(fade || 0.15, 0.01) });
        return true;
      }
      if (found) found.target = 0;
      return false;
    }
    clear() { for (const a of this.active) a.target = 0; }

    /** 每帧应用，weight 用淡入淡出控制 */
    update(coreModel, dt) {
      for (let i = this.active.length - 1; i >= 0; i--) {
        const a = this.active[i];
        const step = dt / a.fade;
        a.w += clamp(a.target - a.w, -step, step);
        if (a.target === 0 && a.w <= 0) { this.active.splice(i, 1); continue; }
        if (a.w <= 0) continue;
        const json = this.defs.get(a.file);
        if (json) applyExpression(coreModel, json, a.w);
      }
    }
  }

  /** 按 exp3 的 Blend 模式把表情写进参数（等价于 Cubism 官方实现） */
  function applyExpression(coreModel, json, weight) {
    const list = json.Parameters || [];
    for (const p of list) {
      const cur = coreModel.getParameterValueById(p.Id);
      if (cur === undefined || cur === null) continue;
      switch (p.Blend) {
        case 'Multiply':
          coreModel.setParameterValueById(p.Id, cur * (1 + (p.Value - 1) * weight));
          break;
        case 'Overwrite':
          coreModel.setParameterValueById(p.Id, cur + (p.Value - cur) * weight);
          break;
        default: // Add
          coreModel.setParameterValueById(p.Id, cur + p.Value * weight);
      }
    }
  }

  /* ---------------- “停在最后一帧”的姿势保持 ---------------- */
  class PoseHolder {
    constructor() { this.pose = null; }
    set(pose) {
      if (!pose) { this.pose = null; return; }
      const filtered = {};
      for (const k in pose) if (!TRACKED_PARAM_RE.test(k)) filtered[k] = pose[k];
      this.pose = filtered;
    }
    clear() { this.pose = null; }
    apply(coreModel) {
      if (!this.pose) return;
      for (const k in this.pose) coreModel.setParameterValueById(k, this.pose[k]);
    }
  }

  /* ---------------- 热键匹配 ---------------- */
  // KeyboardEvent.code -> VTS 内部按键名
  const KEY_ALIASES = {
    AltLeft: 'Alt', AltRight: 'Alt',
    ControlLeft: 'LeftControl', ControlRight: 'RightControl',
    ShiftLeft: 'LeftShift', ShiftRight: 'RightShift',
    MetaLeft: 'Meta', MetaRight: 'Meta',
    NumpadDecimal: 'Decimal', NumpadMultiply: 'Multiply',
    NumpadDivide: 'Divide', NumpadSubtract: 'Subtract', NumpadAdd: 'Add',
    NumpadEnter: 'Enter', Space: 'Space',
    Escape: 'Escape', Backspace: 'Backspace', Enter: 'Enter', Tab: 'Tab',
    ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight',
    Home: 'Home', End: 'End', Insert: 'Insert', Delete: 'Delete',
    PageUp: 'PageUp', PageDown: 'PageDown',
    // VTS 把主键盘数字记作 N1..N9，小键盘记作 NumpadN
    Digit1: 'N1', Digit2: 'N2', Digit3: 'N3', Digit4: 'N4', Digit5: 'N5',
    Digit6: 'N6', Digit7: 'N7', Digit8: 'N8', Digit9: 'N9', Digit0: 'N0',
  };
  for (let i = 0; i <= 9; i++) KEY_ALIASES['Numpad' + i] = 'Numpad' + i;
  for (let c = 65; c <= 90; c++) KEY_ALIASES['Key' + String.fromCharCode(c)] = String.fromCharCode(c);

  function codeToKey(code) {
    if (KEY_ALIASES[code]) return KEY_ALIASES[code];
    if (/^F\d+$/.test(code)) return code;
    if (code.indexOf('Numpad') === 0) return code.slice(6);
    if (code.indexOf('Digit') === 0) return code.slice(5);
    if (code.indexOf('Key') === 0) return code.slice(3);
    return code;
  }

  /**
   * 同时支持两种按法（VTS 的配置里两种都有）：
   *   1) 组合键：配置里所有键一起按住          例如 Alt + B
   *   2) 连按：  依次按（800ms 内）             例如 Decimal → Numpad2
   */
  class HotkeyMatcher {
    constructor(hotkeys, opts) {
      this.hotkeys = hotkeys;
      this.pressed = new Set();
      this.recent = [];                       // 最近按下并松开的键 [{key, t}]
      this.seqWindow = (opts && opts.seqWindow) || 900;
      this._last = { name: null, t: 0 };
      this._now = () => (opts && opts.now) || Date.now();
    }

    /** @returns {Array} 本次触发的热键 */
    keyDown(key) {
      const now = this._now();
      if (!this.pressed.has(key)) this.pressed.add(key);
      this.recent.push({ key, t: now });
      this.recent = this.recent.filter(r => now - r.t < this.seqWindow);
      const out = [];
      for (const hk of this.hotkeys) {
        const keys = (hk.triggers || []).filter(Boolean);
        if (!keys.length) continue;
        if (keys.indexOf(key) < 0) continue;                       // 本次按的键必须属于该热键
        if (!keys.every(k => this.pressed.has(k))) continue;       // 必须全部按住
        if (this._last.name === hk.name && now - this._last.t < 250) continue; // 去抖
        this._last = { name: hk.name, t: now };
        out.push(hk);
      }
      return out;
    }

    /** 连按模式：先按的键已经松开了，也算命中 */
    keyDownLoose(key) {
      const now = this._now();
      const out = [];
      for (const hk of this.hotkeys) {
        const keys = (hk.triggers || []).filter(Boolean);
        if (keys.length < 2) continue;
        if (keys[keys.length - 1] !== key) continue;               // 最后一下必须是刚按的
        const head = keys.slice(0, -1);
        const ok = head.every(k => this.recent.some(r => r.key === k) || this.pressed.has(k));
        if (!ok) continue;
        if (this._last.name === hk.name && now - this._last.t < 250) continue;
        this._last = { name: hk.name, t: now };
        out.push(hk);
      }
      return out;
    }

    keyUp(key) {
      this.pressed.delete(key);
      return this.hotkeys.filter(hk =>
        hk.holdOnKey && (hk.triggers || []).indexOf(key) >= 0);
    }
    releaseAll() { this.pressed.clear(); }
  }

  return {
    clamp, mapRange, smoothingAlpha, applyExpression,
    TRACKED_PARAM_RE, KEY_ALIASES, codeToKey,
    ParamMapper, Blinker, Breather, ExpressionStack, PoseHolder, HotkeyMatcher,
  };
});
