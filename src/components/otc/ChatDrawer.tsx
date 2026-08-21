// OTC 订单聊天：消息流（我/对方左右分栏）+ 输入发送；新消息自动滚底。
// 消息由父级轮询 /otc/orders/{id}/messages 获取，本组件只负责展示与发送回调。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OtcMessage } from "../../api/client";
import { fmtTime } from "../../lib/format";

interface Props {
  messages: OtcMessage[];
  peerName: string;
  /** 当前登录用户 id；null 表示未登录（不会出现，订单视图需登录） */
  myUid: number | null;
  onSend: (text: string) => void;
}

export function ChatDrawer({ messages, peerName, myUid, onSend }: Props) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = () => {
    const v = text.trim();
    if (!v) return;
    onSend(v);
    setText("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col border-border max-lg:border-t lg:border-l" data-testid="otc-chat">
      <p className="border-b border-border px-3 py-2 text-xs font-semibold text-muted">
        {t("otc.chatTitle")} · {peerName}
      </p>
      <div ref={listRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3" data-testid="chat-messages">
        {messages.length === 0 && (
          <p className="py-6 text-center text-xs text-muted">—</p>
        )}
        {messages.map((m) => {
          const mine = myUid != null && m.sender_id === myUid;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed ${
                  mine ? "rounded-br-sm bg-tag-bg text-foreground" : "rounded-bl-sm bg-panel-2 text-foreground"
                }`}
              >
                {m.content}
                <span className="ml-2 align-bottom text-[10px] text-muted">{fmtTime(Date.parse(m.created_at ?? ""))}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 border-t border-border p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={t("otc.chatPlaceholder")}
          data-testid="chat-input"
          className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 text-xs text-foreground outline-none transition-colors focus:border-accent"
        />
        <button
          onClick={send}
          data-testid="chat-send"
          className="h-8 shrink-0 cursor-pointer rounded-lg bg-accent px-3 text-xs font-semibold text-black transition-colors hover:bg-accent-hover"
        >
          {t("otc.send")}
        </button>
      </div>
    </div>
  );
}
