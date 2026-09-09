-- 认证服务数据库结构
-- 使用：mysql -u auth -p auth < sql/schema.sql
CREATE DATABASE IF NOT EXISTS auth
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE auth;

-- 用户表：邮箱注册用户（OAuth 用户数据仍在各自 Provider，不经此表）
CREATE TABLE IF NOT EXISTS users (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email        VARCHAR(255)    NOT NULL,
  username     VARCHAR(64)     NOT NULL,
  display_name VARCHAR(64)     NOT NULL DEFAULT '',
  avatar_url   VARCHAR(512)    NOT NULL DEFAULT '',
  password_hash VARCHAR(255)   NOT NULL,
  role         VARCHAR(16)     NOT NULL DEFAULT 'user',
  status       VARCHAR(16)     NOT NULL DEFAULT 'active',
  created_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_email (email),
  UNIQUE KEY uk_username (username)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 邮箱验证记录：注册发码 / 换绑邮箱发码共用
-- code  为 6 位数字验证码（存 sha256 哈希），弹窗内提交
-- token 为一次性设密码令牌（存 sha256 哈希），邮件链接携带，两条路径殊途同归
CREATE TABLE IF NOT EXISTS email_verifications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email      VARCHAR(255)    NOT NULL,
  purpose    VARCHAR(32)     NOT NULL, -- register | change-email
  code_hash  CHAR(64)        NOT NULL,
  token_hash CHAR(64)        NOT NULL,
  user_id    BIGINT UNSIGNED NULL,    -- purpose=change-email 时的目标用户
  verified   TINYINT(1)      NOT NULL DEFAULT 0, -- 验证码已校验通过
  consumed   TINYINT(1)      NOT NULL DEFAULT 0, -- 已被用于建号/改邮箱，不可复用
  ip         VARCHAR(64)     NOT NULL DEFAULT '',
  expires_at TIMESTAMP       NOT NULL,
  created_at TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_email_purpose (email, purpose),
  KEY idx_token (token_hash),
  KEY idx_expires (expires_at)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;

-- 登录失败锁定（邮箱密码连续错 5 次锁 15 分钟）
CREATE TABLE IF NOT EXISTS login_attempts (
  email       VARCHAR(255) NOT NULL,
  fail_count  INT UNSIGNED NOT NULL DEFAULT 0,
  locked_until TIMESTAMP NULL DEFAULT NULL,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (email)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci;
