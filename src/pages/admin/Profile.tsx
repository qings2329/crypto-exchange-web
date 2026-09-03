import { useState, type ReactNode } from "react";
import { adminApi } from "../../api/admin";
import { useAdminData } from "../../lib/useAdminData";
import { AdminHeader, LoadingState } from "../../components/admin/AdminUI";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Modal } from "../../components/Modal";
import { useConfirm } from "../../components/Confirm";

const statusMap: Record<string, string> = {
  active: "success",
  disabled: "danger",
};

export default function Profile() {
  const { data, loading, err, reload } = useAdminData(() => adminApi.me());
  const confirm = useConfirm();

  const [pw, setPw] = useState({ old_password: "", new_password: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const [prefs, setPrefs] = useState({ language: "", theme: "", timezone: "" });
  const [prefMsg, setPrefMsg] = useState("");
  const [prefSubmitting, setPrefSubmitting] = useState(false);

  const [secret, setSecret] = useState("");
  const [otpauth, setOtpauth] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaMsg, setMfaMsg] = useState("");
  const [mfaSubmitting, setMfaSubmitting] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState("");

  const loadPrefs = () => {
    return adminApi
      .preferences()
      .then((p) => {
        setPrefs({ language: p.language, theme: p.theme, timezone: p.timezone });
        return p;
      })
      .catch(() => null);
  };
  useAdminData(() => loadPrefs(), []);

  const inputCls =
    "h-9 rounded-lg border border-border bg-panel-2 px-3 text-sm text-foreground focus:border-accent focus:outline-none";

  const handleChangePw = async () => {
    setPwMsg("");
    if (!pw.old_password || !pw.new_password) {
      setPwMsg("请填写原密码和新密码");
      return;
    }
    if (pw.new_password.length < 6) {
      setPwMsg("新密码至少 6 位");
      return;
    }
    if (pw.new_password !== pw.confirm) {
      setPwMsg("两次输入的新密码不一致");
      return;
    }
    setPwdSubmitting(true);
    try {
      await adminApi.changePassword({
        old_password: pw.old_password,
        new_password: pw.new_password,
      });
      setPwMsg("密码修改成功");
      setPw({ old_password: "", new_password: "", confirm: "" });
    } catch (e) {
      setPwMsg((e as Error).message || "修改失败");
    } finally {
      setPwdSubmitting(false);
    }
  };

  const handleSavePrefs = async () => {
    setPrefMsg("");
    setPrefSubmitting(true);
    try {
      await adminApi.preferencesUpdate({
        language: prefs.language || undefined,
        theme: prefs.theme || undefined,
        timezone: prefs.timezone || undefined,
      });
      setPrefMsg("偏好已保存");
    } catch (e) {
      setPrefMsg((e as Error).message || "保存失败");
    } finally {
      setPrefSubmitting(false);
    }
  };

  const handleSetup = async () => {
    setMfaMsg("");
    try {
      const s = await adminApi.mfaSetup();
      setSecret(s.secret);
      setOtpauth(s.otpauth_uri);
    } catch (e) {
      setMfaMsg((e as Error).message || "获取二维码失败");
    }
  };

  const handleEnable = async () => {
    setMfaMsg("");
    if (!mfaCode) {
      setMfaMsg("请输入验证码");
      return;
    }
    setMfaSubmitting(true);
    try {
      await adminApi.mfaEnable(mfaCode);
      setMfaMsg("2FA 已启用");
      setMfaCode("");
      setSecret("");
      setOtpauth("");
      reload();
    } catch (e) {
      setMfaMsg((e as Error).message || "启用失败");
    } finally {
      setMfaSubmitting(false);
    }
  };

  const handleDisable = async () => {
    const ok = await confirm({
      title: "关闭两步验证",
      message: "确认关闭两步验证？关闭后将降低账户安全性。",
      danger: true,
      confirmText: "关闭",
    });
    if (!ok) return;
    setDisableCode("");
    setMfaMsg("");
    setShowDisable(true);
  };

  const handleConfirmDisable = async () => {
    setMfaMsg("");
    if (!disableCode) {
      setMfaMsg("请输入验证码");
      return;
    }
    setMfaSubmitting(true);
    try {
      await adminApi.mfaDisable(disableCode);
      setMfaMsg("2FA 已关闭");
      setShowDisable(false);
      setDisableCode("");
      reload();
    } catch (e) {
      setMfaMsg((e as Error).message || "关闭失败");
    } finally {
      setMfaSubmitting(false);
    }
  };

  return (
    <div>
      <AdminHeader
        title="个人设置"
        actions={
          <Button variant="outline" size="sm" onClick={reload}>
            刷新
          </Button>
        }
      />

      {err && (
        <div className="mb-4 rounded-lg border border-sell/30 bg-sell/5 px-3 py-2 text-xs text-sell">
          {err}
          <button className="ml-2 underline" onClick={reload}>
            重试
          </button>
        </div>
      )}

      {loading && !data && <LoadingState />}

      {data && (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">账户信息</div>
            <div className="space-y-3">
              <Row label="用户名" value={data.username} />
              <Row label="角色" value={data.role_name} bold />
              <Row
                label="状态"
                value={<Badge variant={statusMap[data.status] as any}>{data.status}</Badge>}
              />
              <Row label="客户端 IP" value={data.client_ip} mono />
              <Row
                label="两步验证"
                value={
                  data.totp_enabled ? (
                    <span className="text-xs text-buy">已启用</span>
                  ) : (
                    <span className="text-xs text-muted">未启用</span>
                  )
                }
              />
              <Row
                label="权限数"
                value={<span className="text-sm tabular-nums">{data.permissions.length}</span>}
              />
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">界面偏好</div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                语言
                <input
                  className={inputCls}
                  value={prefs.language}
                  onChange={(e) => setPrefs({ ...prefs, language: e.target.value })}
                  placeholder="zh-CN"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                主题
                <input
                  className={inputCls}
                  value={prefs.theme}
                  onChange={(e) => setPrefs({ ...prefs, theme: e.target.value })}
                  placeholder="dark"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                时区
                <input
                  className={inputCls}
                  value={prefs.timezone}
                  onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
                  placeholder="Asia/Shanghai"
                />
              </label>
              {prefMsg && <div className="text-xs text-muted">{prefMsg}</div>}
              <div>
                <Button size="sm" variant="outline" disabled={prefSubmitting} onClick={handleSavePrefs}>
                  {prefSubmitting ? "保存中…" : "保存偏好"}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">修改密码</div>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-xs text-muted">
                原密码
                <input
                  type="password"
                  className={inputCls}
                  value={pw.old_password}
                  onChange={(e) => setPw({ ...pw, old_password: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                新密码
                <input
                  type="password"
                  className={inputCls}
                  value={pw.new_password}
                  onChange={(e) => setPw({ ...pw, new_password: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted">
                确认新密码
                <input
                  type="password"
                  className={inputCls}
                  value={pw.confirm}
                  onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
                />
              </label>
              {pwMsg && <div className="text-xs text-muted">{pwMsg}</div>}
              <div>
                <Button size="sm" variant="outline" disabled={pwdSubmitting} onClick={handleChangePw}>
                  {pwdSubmitting ? "提交中…" : "修改密码"}
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="mb-3 text-sm font-semibold">设置 2FA（两步验证）</div>
            {mfaMsg && <div className="mb-2 text-xs text-muted">{mfaMsg}</div>}

            {data.totp_enabled ? (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-muted">当前账户已启用两步验证。</div>
                <div>
                  <Button size="sm" variant="sell" onClick={handleDisable}>
                    关闭 2FA
                  </Button>
                </div>
              </div>
            ) : !secret ? (
              <div className="flex flex-col gap-3">
                <div className="text-xs text-muted">
                  启用两步验证可显著提升账户安全性。启用后登录需要输入动态验证码。
                </div>
                <div>
                  <Button size="sm" variant="buy" onClick={handleSetup}>
                    开始设置
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="rounded-lg border border-border bg-panel-2 p-3">
                  <div className="mb-1 text-xs text-muted">密钥 Secret</div>
                  <div className="break-all font-mono text-sm text-foreground tabular-nums">
                    {secret}
                  </div>
                </div>
                <div className="rounded-lg border border-border bg-panel-2 p-3">
                  <div className="mb-1 text-xs text-muted">OTPAuth URI</div>
                  <div className="break-all font-mono text-xs text-muted">{otpauth}</div>
                </div>
                <label className="flex flex-col gap-1 text-xs text-muted">
                  验证码
                  <input
                    className={inputCls}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value)}
                    placeholder="6 位动态验证码"
                  />
                </label>
                <div className="flex gap-2">
                  <Button size="sm" disabled={mfaSubmitting} onClick={handleEnable}>
                    {mfaSubmitting ? "提交中…" : "启用"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSecret("");
                      setOtpauth("");
                      setMfaMsg("");
                    }}
                  >
                    取消
                  </Button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {showDisable && (
        <Modal
          title="关闭两步验证"
          onClose={() => setShowDisable(false)}
          footer={
            <>
              <Button variant="outline" size="sm" onClick={() => setShowDisable(false)}>
                取消
              </Button>
              <Button size="sm" variant="sell" disabled={mfaSubmitting} onClick={handleConfirmDisable}>
                {mfaSubmitting ? "提交中…" : "确认关闭"}
              </Button>
            </>
          }
        >
          <label className="flex flex-col gap-1 text-xs text-muted">
            验证码
            <input
              className={inputCls}
              value={disableCode}
              onChange={(e) => setDisableCode(e.target.value)}
              placeholder="6 位动态验证码"
            />
          </label>
        </Modal>
      )}
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: ReactNode; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-2.5 last:border-0 last:pb-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={mono ? "font-mono text-sm text-foreground tabular-nums" : bold ? "text-sm font-medium text-foreground" : "text-sm text-foreground"}>
        {value}
      </span>
    </div>
  );
}
