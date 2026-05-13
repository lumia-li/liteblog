---
title: "Twikoo 部署 Cloudflare 免费R2图床"
published: 2026-05-10
description: ""
image: ""
tags:
  - ""
category: ""
draft: false
---

## 1. 开通 Cloudflare R2

R2 首次开通通常需要绑定支付方式。进入 Cloudflare 控制台后，打开 `R2 对象存储`，按引导完成开通。

![开通R2 ](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/1-1778440125030-50zzmo6x.png)
![R2 免费额度说明](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/2-1778440144627-1keg6scj.png)![](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/2-1778440147703-urxwarf1.png)

## 2\. 创建存储桶并绑定自定义域

在 R2 中创建一个存储桶（Bucket）：

* 存储桶名称：例如 `twikoo-image`
* 位置：自动或选择亚太地区
* 默认存储类：请选择 \`**标准**
    ![](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/bucket-1778440256863-ky5h0p38.png)

> 10GB 免费存储额度对应的是 Standard 存储类，建议不要选“不频繁访问”类型。

接着到存储桶设置里添加自定义域名，绑定你在 Cloudflare 托管的子域名。

![打开自定义域](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/3-1778440406307-augwumnh.png)

![添加自定义域入口](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/4-1778440304312-o19ek047.png)

## 3\. 创建 API Token

进入 `Account Details -> API Tokens -> Manage`，创建用于图床访问的账户 API Token。

![API Token 入口](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/5-1778440543316-lel8i28w.png)

建议的令牌配置：

* 名称：例如 `Twikoo-Image-Token`
* 权限：对象读写（Read/Write）
* 范围：限定为你刚创建的存储桶

创建完成后，保存好访问密钥信息。

![Token 权限](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/7-1778440651766-lzii56xi.png)

## 4\. 在 Twikoo 后台填写图床参数

在 Twikoo 管理后台按下表配置：

| Twikoo 设置项 | 填写内容 |
| ---------- | ---- |
| `IMAGE_CDN` | 选择 `S3 / R2 / MinIO` |
| `S3_REGION` | 可留空 |
| `S3_BUCKET` | R2 存储桶名称（如 `twikoo-image`） |
| `S3_ACCESS_KEY_ID` | Access Key ID |
| `S3_SECRET_ACCESS_KEY` | Secret Access Key |
| `S3_ENDPOINT` | R2 Endpoint |
| `S3_CDN_URL` | 自定义域名（如 `https://img.example.com`） |

保存后即可使用。

## 5\. 上传测试

上传一张评论图片，能正常展示就说明配置成功。

![上传测试](https://raw.githubusercontent.com/wangchen-2023/liyueblog/main/public/uploads/editor/2026/05/10/8-1778440677548-95w79q9q.png)

## 安全与费用建议

### 存储控制

* R2 免费存储为 `10GB`，日常评论图通常够用。
* 可以定期清理历史图片，避免长期堆积。
* 建议在服务端限制上传大小（例如 2MB/5MB）。

### A 类操作（写入）

* 免费额度：每月 `100 万次`
* 建议开启 Cloudflare `Rate Limiting`，限制异常高频上传请求。

### B 类操作（读取）

* 免费额度：每月 `1000 万次`
* 建议设置缓存规则为 `Ignore Query String`，减少通过随机参数绕缓存造成的额外回源。

### 账单预警

建议在 Cloudflare 账单里配置可计费用量告警，提早发现异常：

| 产品 | 免费额度（每月） | 建议预警阈值 |
| --- | -------- | ------ |
| R2 Storage | 10 GB | 5 GB |
| R2 Storage Class A | 100 万次 | 50 万次 |
| R2 Storage Class B | 1000 万次 | 500 万次 |

这样基本就能稳定、低成本地使用 Twikoo 图床。
