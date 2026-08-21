// OTC 订单聊天：消息流（我/对方左右分栏）+ 输入发送；新消息自动滚底。
// 对方回复由父级模拟（延迟罐头话术），本组件只负责展示与发送回调。
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChatMsg } from "../../store/otc-store";
import { fmtTime } from "../../lib/format";

interface Props {
  messages: ChatMsg[];
  peerName: string;
  onSend: (text: string) => void;
}

export function ChatDrawer({ messages, peerName, onSend }: Props) {
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
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl px-2.5 py-1.5 text-xs leading-relaxed ${
                m.from === "me" ? "rounded-br-sm bg-tag-bg text-foreground" : "rounded-bl-sm bg-panel-2 text-foreground"
              }`}
            >
              {m.text}
              <span className="ml-2 align-bottom text-[10px] text-muted">{fmtTime(m.ts)}</span>
            </div>
          </div>
        ))}
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
