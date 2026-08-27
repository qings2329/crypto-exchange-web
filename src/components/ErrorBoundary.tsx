import { Component, type ErrorInfo, type ReactNode } from "react";
import i18next from "i18next";

interface Props {
  children: ReactNode;
  // 可选自定义兜底；不传则使用内置崩溃卡片（含重试）。
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface State {
  error: Error | null;
}

// 全局错误边界：捕获子树渲染期异常，避免整页白屏。
// 崩溃时上报监控（动态导入避免与 monitor 形成静态循环依赖），并展示可重试的兜底界面。
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    import("../lib/monitor")
      .then((m) =>
        m.report({
          type: "error",
          message: error.message,
          stack: error.stack,
          meta: { kind: "react-error-boundary", componentStack: info.componentStack ?? "" },
        })
      )
      .catch(() => {});
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="error-boundary">
          <div className="error-boundary-card">
            <h2>{i18next.t("error.boundary.title")}</h2>
            <p className="error-boundary-msg">{error.message}</p>
            <button className="btn primary" onClick={this.reset}>
              {i18next.t("error.boundary.retry")}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
