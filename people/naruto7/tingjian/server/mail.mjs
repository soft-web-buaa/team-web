// 寄验证码：SMTP（组里一个邮箱的授权码，环境变量里配），本机开发没配时打印到终端。
//   KS_SMTP_HOST  KS_SMTP_PORT（默认 465）  KS_SMTP_USER  KS_SMTP_PASS（授权码，不是登录密码）  KS_MAIL_FROM（可省，默认同 USER）
export async function smtpMailer(env = process.env) {
  if (!env.KS_SMTP_HOST || !env.KS_SMTP_USER || !env.KS_SMTP_PASS) return null;
  const { default: nodemailer } = await import('nodemailer');
  const port = Number(env.KS_SMTP_PORT || 465);
  const tx = nodemailer.createTransport({ host: env.KS_SMTP_HOST, port, secure: port === 465, auth: { user: env.KS_SMTP_USER, pass: env.KS_SMTP_PASS } });
  const from = `听见校园 <${env.KS_MAIL_FROM || env.KS_SMTP_USER}>`;
  return { kind: 'smtp', send: ({ to, subject, text, html }) => tx.sendMail({ from, to, subject, text, html }) };
}

/** 本机开发：不寄信，把验证码打在终端里（接口也会把它带回去，见 createApi 的 devCodes）。 */
export const consoleMailer = { kind: 'console', send: async ({ to, subject }) => { console.log(`[验证码] ${to}：${subject}`); } };

/** 本机（vite 开发、serve.mjs）用的登记配置：配了 KS_SMTP_* 就真寄，没配就打在终端、接口把码带回去好让页面自己填。
 *  HMAC 密钥：KS_AUTH_SECRET，没有就在数据目录里生成一份（只给本机数据用）。 */
export async function localLogin(dataDir, env = process.env) {
  const fs = await import('node:fs'), path = await import('node:path'), crypto = await import('node:crypto');
  let secret = env.KS_AUTH_SECRET;
  if (!secret) {
    const f = path.join(dataDir, 'auth-secret');
    try { secret = fs.readFileSync(f, 'utf8').trim(); } catch { secret = crypto.randomBytes(32).toString('hex'); fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(f, secret); }
  }
  const smtp = await smtpMailer(env);
  return smtp ? { secret, mailer: smtp } : { secret, mailer: consoleMailer, devCodes: true };
}
