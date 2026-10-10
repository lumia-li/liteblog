// 本文件由 tools/gen_config.py 自动生成，请勿手改
window.VTS = {
 "modelName": "c_0120",
 "modelUrl": "model/c_0120.web.model3.json",
 "icon": "model/icon.png",
 "motions": [
  {
   "name": "挤番茄酱动画",
   "file": "motions/番茄酱.motion3.json",
   "fadeIn": 0.05,
   "fadeOut": 0.05,
   "holdLast": false,
   "autoStop": 0.0,
   "duration": 5
  },
  {
   "name": "自拍手机",
   "file": "motions/开盖.motion3.json",
   "fadeIn": 0.05,
   "fadeOut": 0.05,
   "holdLast": true,
   "autoStop": 0.0,
   "duration": 1,
   "endPose": {
    "pointZ2": 1.0,
    "phone": 1.0,
    "phone4": 0.0,
    "phone6": 0.0,
    "phone2": 0.0
   }
  },
  {
   "name": "快速自拍",
   "file": "motions/自拍.motion3.json",
   "fadeIn": 0.05,
   "fadeOut": 0.05,
   "holdLast": true,
   "autoStop": 0.0,
   "duration": 3.3,
   "endPose": {
    "ParamAngleX": 0.0,
    "ParamAngleY": 0.0,
    "ParamAngleZ": 0.0,
    "ParamBodyAngleX": 0.0,
    "ParamBodyAngleY": 0.0,
    "ParamBodyAngleZ": 0.0,
    "ParamEyeLOpen": 1.0,
    "ParamEyeROpen": 1.0,
    "ParamEyeBallX": 0.0,
    "ParamEyeBallY": 0.0,
    "ParamBrowLX": 0.0,
    "ParamBrowLY": 0.0,
    "ParamBrowLAngle": 0.0,
    "ParamBrowLForm": 0.0,
    "ParamBrowRX": 0.0,
    "ParamBrowRY": 0.0,
    "ParamBrowRAngle": 0.0,
    "ParamBrowRForm": 0.0,
    "ParamMouthForm": 1.0,
    "ParamMouthOpenY": 0.0,
    "phone": 1.0,
    "phone4": 0.0,
    "phone6": 0.0,
    "phone3": 0.0,
    "phone5": 0.0
   }
  },
  {
   "name": "自拍动画",
   "file": "motions/自拍简单.motion3.json",
   "fadeIn": 0.10000000149011612,
   "fadeOut": 0.10000000149011612,
   "holdLast": true,
   "autoStop": 10.0,
   "duration": 1.267,
   "endPose": {
    "phone": 1.0,
    "phone3": 0.0
   }
  },
  {
   "name": "重锤出击",
   "file": "aidale.motion3.json",
   "fadeIn": 0.5,
   "fadeOut": 0.5,
   "holdLast": false,
   "autoStop": 0.0,
   "duration": 4.767
  },
  {
   "name": "泡泡糖",
   "file": "motions/chuipaopao.motion3.json",
   "fadeIn": 0.05,
   "fadeOut": 0.05,
   "holdLast": false,
   "autoStop": 0.0,
   "duration": 5
  },
  {
   "name": "鲸鱼喷水",
   "file": "motions/喷水.motion3.json",
   "fadeIn": 0.05,
   "fadeOut": 0.05,
   "holdLast": false,
   "autoStop": 0.0,
   "duration": 0.467
  }
 ],
 "params": [
  {
   "name": "Face Left/Right Rotation",
   "input": "MousePositionX",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -30.0,
   "outHi": 15.0,
   "id": "ParamAngleX",
   "smoothing": 31,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Face Up/Down Rotation",
   "input": "MousePositionY",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -25.0,
   "outHi": 30.0,
   "id": "ParamAngleY",
   "smoothing": 32,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Face Lean Rotation",
   "input": "MousePositionX",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -20.0,
   "outHi": 20.0,
   "id": "ParamAngleZ",
   "smoothing": 85,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Body Rotation X",
   "input": "FaceAngleX",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": -10.0,
   "outHi": 10.0,
   "id": "ParamBodyAngleX",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Body Rotation Y",
   "input": "FaceAngleY",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": -10.0,
   "outHi": 10.0,
   "id": "ParamBodyAngleY",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Body Rotation Z",
   "input": "FaceAngleZ",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": -10.0,
   "outHi": 10.0,
   "id": "ParamBodyAngleZ",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Eye Open Left",
   "input": "",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": 0.0,
   "outHi": 1.899999976158142,
   "id": "ParamEyeLOpen",
   "smoothing": 10,
   "blink": true,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Eye Open Right",
   "input": "",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": 0.0,
   "outHi": 1.899999976158142,
   "id": "ParamEyeROpen",
   "smoothing": 10,
   "blink": true,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Eye X",
   "input": "MousePositionX",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamEyeBallX",
   "smoothing": 0,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Eye Y",
   "input": "MousePositionY",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -0.30000001192092896,
   "outHi": 0.5,
   "id": "ParamEyeBallY",
   "smoothing": 0,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Brow Height Left",
   "input": "Brows",
   "inLo": 0.0,
   "inHi": 1.0,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamBrowLY",
   "smoothing": 10,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Brow Form Left",
   "input": "",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamBrowLForm",
   "smoothing": 15,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Brow Height Right",
   "input": "",
   "inLo": -30.0,
   "inHi": 30.0,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamBrowRY",
   "smoothing": 10,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Brow Form Right",
   "input": "Brows",
   "inLo": 0.0,
   "inHi": 1.0,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamBrowRForm",
   "smoothing": 15,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Mouth Smile",
   "input": "MouthSmile",
   "inLo": 0.0,
   "inHi": 1.0,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamMouthForm",
   "smoothing": 0,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Mouth Open",
   "input": "VoiceVolume",
   "inLo": 0.0,
   "inHi": 1.0,
   "outLo": 0.0,
   "outHi": 2.0999999046325684,
   "id": "ParamMouthOpenY",
   "smoothing": 0,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "Auto Breath",
   "input": "",
   "inLo": 0.0,
   "inHi": 1.0,
   "outLo": 0.0,
   "outHi": 1.0,
   "id": "ParamBreath",
   "smoothing": 0,
   "blink": false,
   "breath": true,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "",
   "input": "MousePositionX",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -30.0,
   "outHi": 30.0,
   "id": "pointX",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "",
   "input": "MousePositionY",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -30.0,
   "outHi": 30.0,
   "id": "pointY",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "",
   "input": "MousePositionX",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -10.0,
   "outHi": 10.0,
   "id": "danbaoX",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "",
   "input": "MousePositionY",
   "inLo": -1.0,
   "inHi": 1.0,
   "outLo": -10.0,
   "outHi": 10.0,
   "id": "danbaoY",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "",
   "input": "TongueOut",
   "inLo": 0.0,
   "inHi": 1.0,
   "outLo": 0.0,
   "outHi": 1.0,
   "id": "ParamCheek79",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  },
  {
   "name": "",
   "input": "MouthX",
   "inLo": -0.20000000298023224,
   "inHi": 0.20000000298023224,
   "outLo": -1.0,
   "outHi": 1.0,
   "id": "ParamBrowRForm2",
   "smoothing": 20,
   "blink": false,
   "breath": false,
   "clampIn": false,
   "clampOut": false
  }
 ],
 "hotkeys": [
  {
   "name": "点菜按下",
   "action": "ToggleExpression",
   "file": "点菜按下.exp3.json",
   "triggers": [
    "LeftMouseButton",
    "",
    ""
   ],
   "holdOnKey": true,
   "autoStop": 0.0,
   "fade": 0.15000000596046448
  },
  {
   "name": "撤回",
   "action": "ToggleExpression",
   "file": "撤回.exp3.json",
   "triggers": [
    "LeftControl",
    "Z",
    ""
   ],
   "holdOnKey": true,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "橡皮",
   "action": "ToggleExpression",
   "file": "橡皮.exp3.json",
   "triggers": [
    "",
    "E",
    ""
   ],
   "holdOnKey": true,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "画笔",
   "action": "ToggleExpression",
   "file": "画笔.exp3.json",
   "triggers": [
    "",
    "LeftMouseButton",
    ""
   ],
   "holdOnKey": true,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "蛋包饭",
   "action": "ToggleExpression",
   "file": "蛋包饭.exp3.json",
   "triggers": [
    "Decimal",
    "Numpad2",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "MoeMoeQ~",
   "action": "ToggleExpression",
   "file": "挤.exp3.json",
   "triggers": [
    "LeftMouseButton",
    "",
    ""
   ],
   "holdOnKey": true,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "挤番茄酱动画",
   "action": "TriggerAnimation",
   "file": "番茄酱.motion3.json",
   "triggers": [
    "Decimal",
    "Numpad3",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582,
   "motionIndex": 0
  },
  {
   "name": "自拍手机",
   "action": "TriggerAnimation",
   "file": "开盖.motion3.json",
   "triggers": [
    "Decimal",
    "Numpad4",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582,
   "motionIndex": 1
  },
  {
   "name": "快速自拍",
   "action": "TriggerAnimation",
   "file": "自拍.motion3.json",
   "triggers": [
    "Decimal",
    "Numpad5",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582,
   "motionIndex": 2
  },
  {
   "name": "自拍动画",
   "action": "TriggerAnimation",
   "file": "自拍简单.motion3.json",
   "triggers": [
    "Decimal",
    "Numpad6",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 10.0,
   "fade": 0.10000000149011612,
   "motionIndex": 3
  },
  {
   "name": "冒爱心动画",
   "action": "ToggleExpression",
   "file": "love.exp3.json",
   "triggers": [
    "Decimal",
    "Numpad8",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "喵喵手~喵~动画",
   "action": "ToggleExpression",
   "file": "喵喵手~喵~动画.exp3.json",
   "triggers": [
    "Decimal",
    "Numpad7",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "双手比耶",
   "action": "ToggleExpression",
   "file": "双手比耶.exp3.json",
   "triggers": [
    "Decimal",
    "Numpad9",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "兔兔贴纸",
   "action": "ToggleExpression",
   "file": "兔兔贴纸.exp3.json",
   "triggers": [
    "Alt",
    "B",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "吐魂",
   "action": "ToggleExpression",
   "file": "吐魂.exp3.json",
   "triggers": [
    "Alt",
    "M",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.30000001192092896
  },
  {
   "name": "呆呆眼",
   "action": "ToggleExpression",
   "file": "呆呆眼.exp3.json",
   "triggers": [
    "Alt",
    "R",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "哭",
   "action": "ToggleExpression",
   "file": "哭.exp3.json",
   "triggers": [
    "Alt",
    "Y",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "圆眼镜",
   "action": "ToggleExpression",
   "file": "圆眼镜.exp3.json",
   "triggers": [
    "Alt",
    "J",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "墨镜",
   "action": "ToggleExpression",
   "file": "墨镜.exp3.json",
   "triggers": [
    "Alt",
    "Z",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "开心兴奋",
   "action": "ToggleExpression",
   "file": "开心兴奋.exp3.json",
   "triggers": [
    "Alt",
    "U",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "心跳",
   "action": "ToggleExpression",
   "file": "心跳.exp3.json",
   "triggers": [
    "Alt",
    "C",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "悲伤",
   "action": "ToggleExpression",
   "file": "悲伤.exp3.json",
   "triggers": [
    "Alt",
    "Q",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "情绪花花",
   "action": "ToggleExpression",
   "file": "情绪花花.exp3.json",
   "triggers": [
    "Alt",
    "X",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "感叹号",
   "action": "ToggleExpression",
   "file": "感叹号.exp3.json",
   "triggers": [
    "Alt",
    "H",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "方眼镜",
   "action": "ToggleExpression",
   "file": "方眼镜.exp3.json",
   "triggers": [
    "Alt",
    "K",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "星星眼",
   "action": "ToggleExpression",
   "file": "星星眼.exp3.json",
   "triggers": [
    "Alt",
    "W",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "晕晕",
   "action": "ToggleExpression",
   "file": "晕晕.exp3.json",
   "triggers": [
    "Alt",
    "I",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "椭圆眼镜",
   "action": "ToggleExpression",
   "file": "椭圆眼镜.exp3.json",
   "triggers": [
    "Alt",
    "L",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "流汗",
   "action": "ToggleExpression",
   "file": "流汗.exp3.json",
   "triggers": [
    "Alt",
    "G",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "爱心眼",
   "action": "ToggleExpression",
   "file": "爱心眼.exp3.json",
   "triggers": [
    "Alt",
    "E",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "猫猫贴纸",
   "action": "ToggleExpression",
   "file": "猫猫贴纸.exp3.json",
   "triggers": [
    "Alt",
    "V",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "生气",
   "action": "ToggleExpression",
   "file": "生气.exp3.json",
   "triggers": [
    "Alt",
    "O",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "脸红",
   "action": "ToggleExpression",
   "file": "脸红.exp3.json",
   "triggers": [
    "Alt",
    "D",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "蝴蝶结贴纸",
   "action": "ToggleExpression",
   "file": "蝴蝶结贴纸.exp3.json",
   "triggers": [
    "Alt",
    "N",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "调皮",
   "action": "ToggleExpression",
   "file": "调皮.exp3.json",
   "triggers": [
    "Alt",
    "P",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "闭眼口水",
   "action": "ToggleExpression",
   "file": "闭眼口水.exp3.json",
   "triggers": [
    "Alt",
    "T",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "问号",
   "action": "ToggleExpression",
   "file": "问号.exp3.json",
   "triggers": [
    "Alt",
    "F",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "阴暗",
   "action": "ToggleExpression",
   "file": "阴暗.exp3.json",
   "triggers": [
    "Alt",
    "S",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.30000001192092896
  },
  {
   "name": "按键归位",
   "action": "RemoveAllExpressions",
   "file": "",
   "triggers": [
    "PageDown",
    "PageUp",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "使巴菲消失",
   "action": "ToggleExpression",
   "file": "巴菲.exp3.json",
   "triggers": [
    "Multiply",
    "Numpad3",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "魔爪",
   "action": "ToggleExpression",
   "file": "魔爪.exp3.json",
   "triggers": [
    "Multiply",
    "Numpad4",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "魔爪换色",
   "action": "ToggleExpression",
   "file": "魔爪换色.exp3.json",
   "triggers": [
    "Multiply",
    "Numpad5",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5
  },
  {
   "name": "头箍",
   "action": "ToggleExpression",
   "file": "头箍.exp3.json",
   "triggers": [
    "Alt",
    "N3",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "吐舌",
   "action": "ToggleExpression",
   "file": "吐舌.exp3.json",
   "triggers": [
    "RightControl",
    "M",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "重锤出击",
   "action": "TriggerAnimation",
   "file": "aidale.motion3.json",
   "triggers": [
    "RightControl",
    "Delete",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.5,
   "motionIndex": 4
  },
  {
   "name": "泡泡糖",
   "action": "TriggerAnimation",
   "file": "chuipaopao.motion3.json",
   "triggers": [
    "RightControl",
    "PageUp",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582,
   "motionIndex": 5
  },
  {
   "name": "手机换色",
   "action": "ToggleExpression",
   "file": "手机换色.exp3.json",
   "triggers": [
    "Numpad0",
    "Numpad2",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "深色桌布",
   "action": "ToggleExpression",
   "file": "深色桌布.exp3.json",
   "triggers": [
    "Alt",
    "N4",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582
  },
  {
   "name": "鲸鱼",
   "action": "ToggleExpression",
   "file": "鲸鱼.exp3.json",
   "triggers": [
    "Alt",
    "N1",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "鲸鱼喷水",
   "action": "TriggerAnimation",
   "file": "喷水.motion3.json",
   "triggers": [
    "LeftMouseButton",
    "",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.009999999776482582,
   "motionIndex": 6
  },
  {
   "name": "单边马尾",
   "action": "ToggleExpression",
   "file": "单边马尾.exp3.json",
   "triggers": [
    "Alt",
    "N2",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  },
  {
   "name": "鲸鱼放桌上",
   "action": "ToggleExpression",
   "file": "鲸鱼放桌上.exp3.json",
   "triggers": [
    "Decimal",
    "Numpad1",
    ""
   ],
   "holdOnKey": false,
   "autoStop": 0.0,
   "fade": 0.10000000149011612
  }
 ],
 "physics": {
  "fps": 3,
  "strength": 60
 }
};
